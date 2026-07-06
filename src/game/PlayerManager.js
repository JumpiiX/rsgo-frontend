import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

const DEATH_FBX = '/models/rifle-death.fbx';

const ANIM_DEBUG = false;

const CLIP = {
    idle: 'Idle',
    run: 'Run',
    runBackward: 'RunBackward',
    strafeLeft: 'StrafeLeft',
    strafeRight: 'StrafeRight',
    jump: 'Jump',
    jumpBackward: 'JumpBackward',
    jumpStand: 'JumpStand',
    shoot: 'Shoot',
    death: 'Death',
};

const JUMP_Y_THRESHOLD = 0.2;

const STRAFE_DOMINANCE = 2.2;

const DIR_SMOOTH = 0.35;

const DIR_MOVE_MIN = 0.08;

const STATE_MIN_HOLD = 0.35;

const POSITION_LERP = 0.85;

const MODEL_FACING_OFFSET = Math.PI;

const RUN_SPEED_THRESHOLD = 0.05;

const RUN_REFERENCE_SPEED = 27;

const MODEL_VERSION = 15;
const CHARACTER_FILES = [
    '/models/player1.glb',
    '/models/player2.glb',
    '/models/player3.glb',
    '/models/player4.glb',
    '/models/player5.glb',
];

const TARGET_HEIGHT = 16.5;

const FEET_BELOW_ORIGIN = 10;

const DEATH_GROUND_DROP = 6;

export class PlayerManager {
    constructor(scene, renderer = null, camera = null) {
        this.scene = scene;

        this.renderer = renderer;
        this.camera = camera;
        this.otherPlayers = new Map();
        this.playerHealth = new Map();
        this.respawning = new Map();
        this.gameMode = null;
        this.localTeam = null;

        this.templates = [];
        this.loaded = false;
        this.loadFailed = false;
        this.assignment = new Map();
        this.pendingPlayers = [];
        this.deathClipOverride = null;
        this.loadModels();
        this.loadDeathAnimation();
    }

    _deathClipForTemplate(template, charIdx) {
        if (!this._deathClipCache) this._deathClipCache = {};
        if (this._deathClipCache[charIdx]) return this._deathClipCache[charIdx];

        const src = this.deathClipOverride;

        const stripPrefix = (n) => n.replace(/mixamorig[0-9]*:?/i, '');
        const bySuffix = new Map();
        template.scene.traverse((o) => {
            if (o.isBone || o.type === 'Bone') bySuffix.set(stripPrefix(o.name), o.name);
        });

        const clip = src.clone();
        let bound = 0;
        clip.tracks.forEach((t) => {
            const dot = t.name.lastIndexOf('.');
            const boneRaw = dot >= 0 ? t.name.slice(0, dot) : t.name;
            const prop = dot >= 0 ? t.name.slice(dot) : '';
            const realBone = bySuffix.get(stripPrefix(boneRaw));
            if (realBone) { t.name = realBone + prop; bound++; }
        });

        const file = CHARACTER_FILES[charIdx] || `#${charIdx}`;
        console.log(`[death] retargeted clip for ${file}: ${bound}/${clip.tracks.length} tracks bound`);
        this._deathClipCache[charIdx] = clip;
        return clip;
    }

    _prewarmDeathClips() {
        if (!this.deathClipOverride || !this.templates) return;
        this.templates.forEach((template, idx) => {
            if (template) this._deathClipForTemplate(template, idx);
        });
    }

    _prewarmGPU() {
        if (this._gpuPrewarmed || !this.renderer || !this.camera || !this.templates) return;
        try {
            this.templates.forEach((template) => {
                if (!template) return;
                this.scene.add(template.scene);
                this.renderer.compile(this.scene, this.camera);
                this.scene.remove(template.scene);
            });
            this._gpuPrewarmed = true;
        } catch (e) {
            console.warn('GPU prewarm skipped:', e);
        }
    }

    loadDeathAnimation() {
        try {
            const loader = new FBXLoader();
            loader.load(
                DEATH_FBX,
                (fbx) => {
                    const clip = fbx.animations && fbx.animations[0];
                    if (clip) {
                        clip.name = 'Death';

                        clip.tracks = clip.tracks.filter(
                            (t) => !(/hips/i.test(t.name) && /\.position$/i.test(t.name))
                        );

                        this.deathClipOverride = clip;
                        console.log('Custom death animation loaded (FBX). tracks:', clip.tracks.length, '(hip-position removed)');
                        this._prewarmDeathClips();
                    } else {
                        console.warn('Death FBX had no animation clip; keeping GLB death.');
                    }
                },
                undefined,
                (err) => console.warn('Failed to load death FBX, keeping GLB death:', err)
            );
        } catch (e) {
            console.warn('Death FBX load error, keeping GLB death:', e);
        }
    }

    loadModels() {
        const loader = new GLTFLoader();
        let remaining = CHARACTER_FILES.length;
        CHARACTER_FILES.forEach((file, idx) => {
            loader.load(
                `${file}?v=${MODEL_VERSION}`,
                (gltf) => {
                    const scene = gltf.scene;

                    const idleClip = THREE.AnimationClip.findByName(gltf.animations, CLIP.idle);
                    if (idleClip) {
                        const tmpMixer = new THREE.AnimationMixer(scene);
                        tmpMixer.clipAction(idleClip).play();
                        tmpMixer.update(0.5);
                    }
                    scene.updateMatrixWorld(true);

                    const box = new THREE.Box3().setFromObject(scene);
                    const size = new THREE.Vector3(); box.getSize(size);
                    const rawHeight = size.y || 1;
                    const scale = TARGET_HEIGHT / rawHeight;

                    const yOffset = -(box.min.y * scale) - FEET_BELOW_ORIGIN;

                    const dims = {
                        height: size.y * scale,
                        radius: Math.max(size.x, size.z) * scale * 0.5,
                    };
                    console.log(`[char] ${file}: rawHeight=${rawHeight.toFixed(2)} scale=${scale.toFixed(2)}`);
                    this.templates[idx] = { scene, clips: gltf.animations, scale, yOffset, dims };
                    if (--remaining === 0) this.onAllLoaded();
                },
                undefined,
                (error) => {
                    console.error(`Failed to load ${file}:`, error);
                    if (--remaining === 0) this.onAllLoaded();
                }
            );
        });
    }

    onAllLoaded() {
        const ok = this.templates.filter(Boolean);
        if (ok.length === 0) {
            console.error('No character models loaded; using capsule fallback.');
            this.loadFailed = true;
        } else {
            this.loaded = true;
            console.log(`Loaded ${ok.length}/${CHARACTER_FILES.length} characters, clips:`,
                ok[0].clips.map((c) => c.name).join(', '));
            this._prewarmDeathClips();
            this._prewarmGPU();

        }
        const pending = this.pendingPlayers;
        this.pendingPlayers = [];
        pending.forEach((p) => this.addPlayer(p));
    }

    flushDeferredPlayers() {
        this.deferAdds = false;
        const pending = this.pendingPlayers;
        this.pendingPlayers = [];
        pending.forEach((p) => this.addPlayer(p));
    }

    characterFor(playerId) {
        if (this.assignment.has(playerId)) return this.assignment.get(playerId);
        const n = this.templates.length || 1;
        let h = 0;
        for (let i = 0; i < playerId.length; i++) h = (h * 31 + playerId.charCodeAt(i)) >>> 0;
        let idx = h % n;

        if (!this.templates[idx]) idx = this.templates.findIndex(Boolean);
        this.assignment.set(playerId, idx);
        return idx;
    }

    teamColor(player) {
        let color = 0xff4444;
        let emissive = 0x880000;
        if (this.gameMode === 'team' && player.team) {
            if (player.team === 'orange') { color = 0xff6b35; emissive = 0x994020; }
            else if (player.team === 'red') { color = 0xdc3545; emissive = 0x8b2030; }
        }
        return { color, emissive };
    }

    addPlayer(player) {
        if (this.otherPlayers.has(player.id)) {
            return;
        }

        if (!this.loaded && !this.loadFailed) {
            this.pendingPlayers.push(player);
            return;
        }

        if (this.deferAdds) {
            this.pendingPlayers.push(player);
            return;
        }

        console.log('Adding new player:', player.id, player.name, 'at position', player.x, player.y, player.z);

        const entry = this.loadFailed
            ? this.buildCapsule(player)
            : this.buildModel(player);

        entry.mesh.position.set(player.x, player.y, player.z);

        const isTeammate = this.gameMode !== 'team'
            || (this.localTeam && player.team && player.team === this.localTeam);
        if (isTeammate) {
            const nameSprite = this.createNameSprite(player.name);

            nameSprite.position.set(0, 10, 0);
            nameSprite.raycast = () => {};
            entry.mesh.add(nameSprite);
            entry.nameSprite = nameSprite;
        }

        this.scene.add(entry.mesh);
        this.otherPlayers.set(player.id, entry);
        this.playerHealth.set(player.id, 5);
        this.updatePlayerCount();
    }

    buildModel(player) {
        const charIdx = this.characterFor(player.id);
        const template = this.templates[charIdx];

        const root = new THREE.Group();
        const model = cloneSkeleton(template.scene);

        model.scale.setScalar(template.scale);
        model.position.y = template.yOffset;
        model.rotation.y = MODEL_FACING_OFFSET;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;

                child.frustumCulled = false;

                child.raycast = () => {};
            }
        });
        root.add(model);

        const dims = template.dims || { height: 11, radius: 2 };
        const radius = Math.max(1, dims.radius);
        const cylLen = Math.max(0.1, dims.height - radius * 2);
        const hitbox = new THREE.Mesh(
            new THREE.CapsuleGeometry(radius, cylLen, 4, 8),
            new THREE.MeshBasicMaterial({ visible: false })
        );

        hitbox.position.y = -FEET_BELOW_ORIGIN + dims.height / 2;
        hitbox.userData.isHitbox = true;
        root.add(hitbox);

        const mixer = new THREE.AnimationMixer(model);
        const actions = {};
        for (const [key, name] of Object.entries(CLIP)) {

            const clip = (key === 'death' && this.deathClipOverride)
                ? this._deathClipForTemplate(template, charIdx)
                : THREE.AnimationClip.findByName(template.clips, name);
            if (clip) {
                actions[key] = mixer.clipAction(clip);
            }
        }

        ['shoot', 'jump', 'jumpBackward', 'jumpStand', 'death'].forEach((k) => {
            if (actions[k]) { actions[k].setLoop(THREE.LoopOnce); actions[k].clampWhenFinished = true; }
        });

        if (actions.idle) actions.idle.play();

        return {
            mesh: root,
            model,
            data: player,
            mixer,
            actions,
            current: 'idle',
            dancing: false,
            jumping: false,
            dead: false,
            lastPos: new THREE.Vector3(player.x, player.y, player.z),
            targetPos: new THREE.Vector3(player.x, player.y, player.z),
            targetYaw: 0,
            dirX: 0, dirZ: 0,
            speed: 0,
            lastMoveAt: 0,
            stateChangedAt: 0,
            isModel: true,
        };
    }

    getPlayerDims(playerId) {
        if (!this.loaded) return null;
        const template = this.templates[this.characterFor(playerId)];
        return template ? template.dims : null;
    }

    createStandaloneModel(playerId) {
        if (!this.loaded || !this.templates.filter(Boolean).length) return null;
        const charIdx = this.characterFor(playerId);
        const template = this.templates[charIdx];
        if (!template) return null;

        const root = new THREE.Group();
        const model = cloneSkeleton(template.scene);
        model.scale.setScalar(template.scale);
        model.position.y = template.yOffset;
        model.rotation.y = MODEL_FACING_OFFSET;
        model.traverse((c) => { if (c.isMesh) { c.frustumCulled = false; c.raycast = () => {}; } });
        root.add(model);

        const mixer = new THREE.AnimationMixer(model);
        const actions = {};
        for (const [key, name] of Object.entries(CLIP)) {
            const clip = (key === 'death' && this.deathClipOverride)
                ? this._deathClipForTemplate(template, charIdx)
                : THREE.AnimationClip.findByName(template.clips, name);
            if (clip) actions[key] = mixer.clipAction(clip);
        }
        ['shoot', 'jump', 'jumpBackward', 'jumpStand', 'death'].forEach((k) => {
            if (actions[k]) { actions[k].setLoop(THREE.LoopOnce); actions[k].clampWhenFinished = true; }
        });
        if (actions.idle) actions.idle.play();
        return { mesh: root, mixer, actions };
    }

    buildCapsule(player) {
        const geometry = new THREE.CapsuleGeometry(2, 5, 4, 8);
        const { color, emissive } = this.teamColor(player);
        const material = new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: 0.3 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        return { mesh, data: player, isModel: false };
    }

    setGameMode(gameMode) {
        this.gameMode = gameMode;
    }

    setLocalTeam(team) {
        this.localTeam = team;
    }

    removePlayer(playerId) {
        const player = this.otherPlayers.get(playerId);
        if (player) {
            this.scene.remove(player.mesh);
            this.otherPlayers.delete(playerId);
        }
        this.playerHealth.delete(playerId);
        this.respawning.delete(playerId);
        this.updatePlayerCount();
    }

    updatePlayer(message) {
        const player = this.otherPlayers.get(message.player_id);
        if (!player) return;

        if (player.dead) return;

        const newX = message.x, newY = message.y, newZ = message.z;
        const yaw = message.rotation_y;

        if (player.isModel) {
            const dx = newX - player.lastPos.x;
            const dy = newY - player.lastPos.y;
            const dz = newZ - player.lastPos.z;
            player.lastPos.set(newX, newY, newZ);

            const fX = -Math.sin(yaw), fZ = -Math.cos(yaw);
            const rX = Math.cos(yaw), rZ = -Math.sin(yaw);
            player.dirZ = player.dirZ * (1 - DIR_SMOOTH) + (dx * fX + dz * fZ) * DIR_SMOOTH;
            player.dirX = player.dirX * (1 - DIR_SMOOTH) + (dx * rX + dz * rZ) * DIR_SMOOTH;

            const horizDist = Math.sqrt(dx * dx + dz * dz);
            if (horizDist > RUN_SPEED_THRESHOLD) player.lastMoveAt = this.clock || 0;

            const now = this.clock || 0;
            const gap = Math.max(0.001, now - (player._lastMsgAt || now));
            player._lastMsgAt = now;
            const instSpeed = horizDist / gap;
            player.speed = player.speed * 0.7 + instSpeed * 0.3;

            if (dy > JUMP_Y_THRESHOLD && !player.dead && !player.jumping && player.current !== 'shoot') {
                const moving = horizDist > RUN_SPEED_THRESHOLD;
                let jumpClip = 'jumpStand';
                if (moving) jumpClip = player.dirZ < 0 && player.actions.jumpBackward ? 'jumpBackward' : 'jump';
                if (!player.actions[jumpClip]) jumpClip = player.actions.jumpStand ? 'jumpStand' : 'jump';
                this.playJump(player, jumpClip);
            }

            player.targetPos.set(newX, newY, newZ);
            player.targetYaw = yaw;
        } else {
            player.mesh.position.set(newX, newY, newZ);
            player.mesh.rotation.y = yaw;
        }

        player.pitch = message.rotation_x || 0;
    }

    directionState(player) {
        const lx = player.dirX, lz = player.dirZ;
        const speed = Math.sqrt(lx * lx + lz * lz);
        if (speed < DIR_MOVE_MIN) return 'idle';

        const ax = Math.abs(lx), az = Math.abs(lz);
        const inStrafe = player.current === 'strafeLeft' || player.current === 'strafeRight';

        const lateral = inStrafe ? (ax > az * 0.9) : (ax > az * STRAFE_DOMINANCE);
        if (!lateral) return lz >= 0 ? 'run' : 'runBackward';
        return lx >= 0 ? 'strafeRight' : 'strafeLeft';
    }

    setState(player, state) {
        if (!player.isModel || player.current === state) return false;
        const next = player.actions[state];
        if (!next) return false;
        if (ANIM_DEBUG) {
            console.log(`[anim] ${player.data?.name || player.data?.id}: ${player.current} -> ${state}`
                + ` (dirZ=${player.dirZ.toFixed(2)} dirX=${player.dirX.toFixed(2)})`);
        }
        const prev = player.actions[player.current];
        next.reset();
        next.setLoop(THREE.LoopRepeat);
        next.enabled = true;
        next.setEffectiveWeight(1);
        next.play();
        if (prev && prev !== next) next.crossFadeFrom(prev, 0.2, false);
        player.current = state;
        return true;
    }

    playOnce(player, state, fadeBack = 0.2) {
        if (!player.isModel || player.dead) return;
        const action = player.actions[state];
        if (!action) return;
        const prev = player.actions[player.current];
        action.reset();
        action.setLoop(THREE.LoopOnce);
        action.clampWhenFinished = true;
        action.enabled = true;
        action.setEffectiveWeight(1);
        action.play();
        if (prev && prev !== action) action.crossFadeFrom(prev, 0.1, false);
        player.current = state;

        const mixer = player.mixer;
        const onFinished = (e) => {
            if (e.action !== action) return;
            mixer.removeEventListener('finished', onFinished);
            if (player.dead) return;
            if (state === 'dance') player.dancing = false;

            player.current = null;
            this.setState(player, 'idle');
        };
        mixer.addEventListener('finished', onFinished);
    }

    playJump(player, state) {
        if (!player.isModel || player.dead || player.jumping) return;
        const action = player.actions[state];
        if (!action) return;
        player.jumping = true;
        const prev = player.actions[player.current];
        action.reset();
        action.setLoop(THREE.LoopOnce);
        action.clampWhenFinished = true;
        action.enabled = true;
        action.setEffectiveWeight(1);
        action.play();
        if (prev && prev !== action) action.crossFadeFrom(prev, 0.1, false);
        player.current = state;

        const mixer = player.mixer;
        const clear = () => {
            mixer.removeEventListener('finished', onFinished);
            if (player._jumpTimer) { clearTimeout(player._jumpTimer); player._jumpTimer = null; }
            player.jumping = false;
            if (player.dead) return;
            player.current = null;
            this.setState(player, 'idle');
        };
        const onFinished = (e) => { if (e.action === action) clear(); };
        mixer.addEventListener('finished', onFinished);

        player._jumpTimer = setTimeout(clear, (action.getClip().duration + 0.3) * 1000);
    }

    playerShoot(playerId) {
        const player = this.otherPlayers.get(playerId);
        if (player && player.isModel && !player.dead && !player.dancing) {
            this.playOnce(player, 'shoot');
        }
    }

    playerDance(playerId) {
        const player = this.otherPlayers.get(playerId);
        if (player && player.isModel && !player.dead) {
            player.dancing = true;
            this.playOnce(player, 'dance');
        }
    }

    update(deltaTime) {
        this.clock = (this.clock || 0) + deltaTime;
        this.otherPlayers.forEach((player) => {
            if (player.mixer) player.mixer.update(deltaTime);

            if (!player.isModel) return;

            if (player.dead) {
                if (typeof player._deathBaseY === 'number' && player._deathDuration > 0) {
                    const tDeath = Math.min(1, Math.max(0, (this.clock - player._deathStartClock) / player._deathDuration));
                    player.mesh.position.y = player._deathBaseY - DEATH_GROUND_DROP * tDeath;
                }
                return;
            }

            const t = 1 - Math.pow(1 - POSITION_LERP, deltaTime * 60);
            player.mesh.position.lerp(player.targetPos, t);
            let d = player.targetYaw - player.mesh.rotation.y;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            player.mesh.rotation.y += d * t;

            if (this.clock - (player.lastMoveAt || 0) > 0.08) {
                const decay = Math.pow(0.001, deltaTime);
                player.dirZ *= decay;
                player.dirX *= decay;
            }

            if (player.dead || player.dancing || player.jumping || player.current === 'shoot') return;
            const want = this.directionState(player);

            const locoAction = player.actions[player.current];
            if (locoAction && player.current !== 'idle') {
                const ts = THREE.MathUtils.clamp(player.speed / RUN_REFERENCE_SPEED, 0.5, 1.8);
                locoAction.timeScale = ts;
            }

            if (want === player.current) return;
            const goingIdle = want === 'idle';
            if (goingIdle || this.clock - (player.stateChangedAt || 0) >= STATE_MIN_HOLD) {
                if (this.setState(player, want)) player.stateChangedAt = this.clock;
            }
        });
    }

    createNameSprite(name) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;

        context.fillStyle = 'rgba(0, 0, 0, 0.6)';
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.fillStyle = 'white';
        context.font = 'bold 36px Arial';
        context.textAlign = 'center';
        context.strokeStyle = 'black';
        context.lineWidth = 6;
        context.strokeText(name, canvas.width / 2, canvas.height / 2 + 12);
        context.fillText(name, canvas.width / 2, canvas.height / 2 + 12);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(6, 1.5, 1);

        return sprite;
    }

    updatePlayerCount() {
        const playerCountElement = document.getElementById('playerCount');
        if (playerCountElement) {
            playerCountElement.textContent = this.otherPlayers.size + 1;
        }
    }

    getPlayerCount() {
        return this.otherPlayers.size + 1;
    }

    hitPlayer(playerId) {
        if (this.playerHealth.has(playerId)) {
            const currentHealth = this.playerHealth.get(playerId);
            const newHealth = currentHealth - 1;
            this.playerHealth.set(playerId, newHealth);

            if (newHealth <= 0) {
                this.killPlayer(playerId);
                return true;
            }
        }
        return false;
    }

    killPlayer(playerId) {
        const player = this.otherPlayers.get(playerId);
        if (player && !this.respawning.has(playerId)) {
            const impactsToRemove = [];
            player.mesh.traverse((child) => {
                if (child.userData && child.userData.isPlayerImpact) {
                    impactsToRemove.push(child);
                }
            });
            impactsToRemove.forEach((impact) => player.mesh.remove(impact));

            this.respawning.set(playerId, true);
            this.playerHealth.delete(playerId);

            if (ANIM_DEBUG) console.log(`[anim] killPlayer ${playerId}: hasDeathClip=${!!(player.isModel && player.actions.death)}`);

            if (player.isModel && player.actions.death) {
                player.dead = true;
                const death = player.actions.death;

                player._deathBaseY = player.mesh.position.y;
                player._deathStartClock = this.clock || 0;
                player._deathDuration = (death.getClip().duration || 1);

                Object.values(player.actions).forEach((a) => {
                    if (a && a !== death) { a.stop(); a.setEffectiveWeight(0); a.enabled = false; }
                });
                death.reset();
                death.setLoop(THREE.LoopOnce);
                death.clampWhenFinished = true;
                death.enabled = true;
                death.setEffectiveWeight(1);
                death.play();
                player.current = 'death';

                if (ANIM_DEBUG) console.log(`[death] start ${playerId} dur=${death.getClip().duration.toFixed(2)}s prev=${player.current}`);
                let finalized = false;
                const finalize = () => {
                    if (finalized) return;
                    finalized = true;
                    if (ANIM_DEBUG) console.log(`[death] finalize ${playerId} at clock=${(this.clock||0).toFixed(2)}`);
                    player.mixer.removeEventListener('finished', onFinished);
                    if (player._deathTimer) { clearTimeout(player._deathTimer); player._deathTimer = null; }
                    this.scene.remove(player.mesh);
                    this.otherPlayers.delete(playerId);
                    this.updatePlayerCount();

                    if (player.pendingRespawn) {
                        this.respawnPlayer(player.pendingRespawn);
                    }
                };
                const onFinished = (e) => { if (e.action === death) finalize(); };
                player.mixer.addEventListener('finished', onFinished);

                player._deathTimer = setTimeout(finalize, (death.getClip().duration + 0.5) * 1000);
                this.updatePlayerCount();
            } else {
                this.scene.remove(player.mesh);
                this.otherPlayers.delete(playerId);
                this.updatePlayerCount();
            }
        }
    }

    clearAllPlayers() {

        if (ANIM_DEBUG) console.log(`[death] clearAllPlayers (${this.otherPlayers.size} players) at clock=${(this.clock||0).toFixed(2)}`);
        this.otherPlayers.forEach((player, id) => {
            if (player.dead) {
                if (ANIM_DEBUG) console.log(`[death] clearAllPlayers sparing dying ${id}`);
                return;
            }
            this.scene.remove(player.mesh);
            this.otherPlayers.delete(id);
            this.playerHealth.delete(id);
            this.respawning.delete(id);
        });
        this.updatePlayerCount();
    }

    respawnPlayer(player) {
        const existing = this.otherPlayers.get(player.id);

        if (existing && existing.dead) {
            if (ANIM_DEBUG) console.log(`[death] respawn deferred for dying ${player.id} at clock=${(this.clock||0).toFixed(2)}`);
            existing.pendingRespawn = player;
            return;
        }

        if (existing) {

            existing.mesh.position.set(player.x, player.y, player.z);
            existing.data = player;
            if (existing.lastPos) existing.lastPos.set(player.x, player.y, player.z);
            if (existing.targetPos) existing.targetPos.set(player.x, player.y, player.z);
            this.playerHealth.set(player.id, 5);
            this.respawning.delete(player.id);
        } else {

            this.respawning.delete(player.id);
            this.addPlayer(player);
        }
    }
}
