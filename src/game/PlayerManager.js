import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

// A custom death animation (Mixamo FBX) that overrides the GLB's baked 'Death'
// clip. Because it's the same Mixamo skeleton as the characters, its bone tracks
// play directly on them — no retargeting needed. Loaded once, async.
const DEATH_FBX = '/models/rifle-death.fbx';

// Set true to log animation-state transitions + death lifecycle to the console
// (for diagnosing stutter / death issues). Off for normal play.
const ANIM_DEBUG = false;

// Clip names baked into /models/player.glb (see models/mixamo merge step).
// If you re-export with different names, update these and nothing else.
const CLIP = {
    idle: 'Idle',
    run: 'Run',                 // forward
    runBackward: 'RunBackward',
    strafeLeft: 'StrafeLeft',
    strafeRight: 'StrafeRight',
    jump: 'Jump',                 // jumping while moving forward
    jumpBackward: 'JumpBackward', // jumping while moving backward
    jumpStand: 'JumpStand',       // jumping in place (standing still)
    shoot: 'Shoot',
    death: 'Death',
};

// Upward jump detection: a positive Y delta (units between network updates)
// above this triggers the jump animation. Lowered so the rise registers even
// when the jump is reported in smaller per-message increments.
const JUMP_Y_THRESHOLD = 0.2;

// How strongly lateral movement must dominate forward/back before switching to
// a strafe clip. Higher = stronger forward/back bias (tapping W stays "run").
const STRAFE_DOMINANCE = 2.2;

// Smoothing factor (0..1) for the running direction average. Lower = smoother /
// more stable direction (taps don't flip clips), higher = more responsive.
const DIR_SMOOTH = 0.35;

// Smoothed-direction magnitude below which the player counts as standing (idle).
// The smoothed dir is ~0.4 while moving and decays toward 0 when stopped.
const DIR_MOVE_MIN = 0.08;

// Minimum seconds a directional locomotion clip must play before it can switch
// to another directional clip. Prevents run<->strafe<->back flip-flopping that
// reads as the animation "resetting"/stuttering. Switches to/from idle bypass
// this so stopping and starting stay instant.
const STATE_MIN_HOLD = 0.35;

// Per-frame (at 60fps) fraction the mesh moves toward its latest network target.
// Updates arrive ~60Hz (already smooth per the network logs), so keep this high
// to track the real position almost exactly — a low value leaves the body
// trailing, then "catching up" when you stop, which read as the W-tap snap/lag.
// Lower = smoother but laggier; higher = snappier but closer to teleporting.
const POSITION_LERP = 0.85;

// Mixamo characters face +Z; the game applies rotation_y as the player's yaw.
// If players appear to face away from where they're moving/aiming, flip this
// (0 ↔ Math.PI). Default π is the usual Mixamo→game correction.
const MODEL_FACING_OFFSET = Math.PI;

// Horizontal distance moved BETWEEN network updates above which a player is
// considered "running" (drives the run vs idle clip). Kept low so that even
// straight-line forward movement (smaller per-tick deltas than diagonal)
// reliably triggers the run animation. Tune up only if a standing player
// flickers into run.
const RUN_SPEED_THRESHOLD = 0.05;

// Real player speed (world units/sec) at which the run clip plays at its natural
// rate (timeScale 1.0). Slower movement slows the leg cycle, faster speeds it up
// so strides match actual travel. Estimated from observed ~27 units/sec at full
// run; tune if feet appear to slide.
const RUN_REFERENCE_SPEED = 27;

// The five interchangeable character models. Each has the same 10 clips. Bump
// MODEL_VERSION to cache-bust all of them after a re-export.
const MODEL_VERSION = 15;
const CHARACTER_FILES = [
    '/models/player1.glb', // Ortiz
    '/models/player2.glb',
    '/models/player3.glb',
    '/models/player4.glb',
    '/models/player5.glb',
];
// Target standing height (world units) every character is normalized to, so the
// tiny "kid" model and the tall ones all end up the same in-game size. The old
// capsule was ~9 units; keep parity.
const TARGET_HEIGHT = 16.5;

// Fixed distance (world units) the feet sit below the group origin. The network
// y is the player's camera/eye height, a fixed ~9-10 units above the floor
// regardless of model scale. Increase if characters float; decrease if they sink.
const FEET_BELOW_ORIGIN = 10;

// On death we strip the death clip's hip translation (it flings the body at our
// large character scale), which leaves the collapsed corpse hovering ~1m above
// the floor. Drop the whole mesh by this much when death starts so it lies flat.
// Tune if the body ends slightly above (raise) or sunk into (lower) the ground.
const DEATH_GROUND_DROP = 6;

export class PlayerManager {
    constructor(scene) {
        this.scene = scene;
        this.otherPlayers = new Map();
        this.playerHealth = new Map();
        this.respawning = new Map();
        this.gameMode = null;
        this.localTeam = null; // the local player's team; used to hide enemy name tags

        // One template per character; each holds {scene, clips, scale, yOffset}.
        this.templates = [];
        this.loaded = false;
        this.loadFailed = false;
        this.assignment = new Map(); // playerId -> character index (stable per player)
        this.pendingPlayers = [];
        this.deathClipOverride = null; // set when the custom death FBX finishes loading
        this.loadModels();
        this.loadDeathAnimation();
    }

    // Make the death clip's track names match the characters' actual bone names.
    // FBX tracks look like "mixamorig:Hips.quaternion"; if the characters' bones
    // have the "mixamorig:" prefix stripped (common after a Blender export), strip
    // it from the clip too (and vice-versa). Compares against a loaded template; if
    // no template is loaded yet, defers via a flag and tries again at build time.
    _normalizeDeathClipBones(clip) {
        const template = this.templates.find(Boolean);
        if (!template || !template.scene) return; // can't compare yet; leave as-is

        // Collect the character's bone names.
        const boneNames = new Set();
        template.scene.traverse((o) => { if (o.isBone || o.type === 'Bone') boneNames.add(o.name); });
        if (boneNames.size === 0) return;

        // The track name is "<bone>.<property>". Extract the bone part of a track.
        const trackBone = (name) => name.replace(/\.[^.]+$/, '');

        // How many of the clip's track-bones already match a real character bone?
        const matchCount = clip.tracks.filter((t) => boneNames.has(trackBone(t.name))).length;
        if (matchCount > 0) return; // already aligned (the common case) — stay quiet

        // No matches: try stripping a "mixamorig:" prefix, then (if still none)
        // adding it, and keep whichever yields matches.
        const tryRename = (fn) => {
            let hits = 0;
            const mapped = clip.tracks.map((t) => {
                const newName = fn(t.name);
                if (boneNames.has(trackBone(newName))) hits++;
                return newName;
            });
            return { hits, mapped };
        };

        const strip = tryRename((n) => n.replace(/mixamorig[0-9]*:/i, ''));
        const add = tryRename((n) => 'mixamorig:' + n);
        const best = strip.hits >= add.hits ? strip : add;

        if (best.hits > 0) {
            clip.tracks.forEach((t, i) => { t.name = best.mapped[i]; });
            console.log(`[death] renamed tracks → ${best.hits}/${clip.tracks.length} now match.`);
        } else {
            console.warn('[death] FBX bone names do NOT match the characters — animation will not play. ' +
                'The death FBX must be exported from the SAME rig as the character GLBs.');
        }
    }

    // Load the custom Mixamo death FBX and keep just its animation clip. Players
    // built before it loads use the GLB's 'Death' clip; once it's ready, newly
    // built players use this. (Same skeleton → no retargeting.)
    loadDeathAnimation() {
        try {
            const loader = new FBXLoader();
            loader.load(
                DEATH_FBX,
                (fbx) => {
                    const clip = fbx.animations && fbx.animations[0];
                    if (clip) {
                        clip.name = 'Death';
                        // Remove the Hips.position (root-motion) track entirely. At our
                        // ~8-10× character scale its baked translation is huge and
                        // launches the body ("flies"). We instead drop the whole body
                        // to the ground in code during the death (see killPlayer's
                        // DEATH_GROUND_DROP), which is scale-independent and reliable.
                        clip.tracks = clip.tracks.filter(
                            (t) => !(/hips/i.test(t.name) && /\.position$/i.test(t.name))
                        );
                        // Bone-name compatibility: align FBX track names to the
                        // characters' actual bone names (mixamorig prefix handling).
                        this._normalizeDeathClipBones(clip);
                        this.deathClipOverride = clip;
                        console.log('Custom death animation loaded (FBX). tracks:', clip.tracks.length, '(hip-position removed)');
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
                    // IMPORTANT: a freshly-loaded SkinnedMesh has an unreliable
                    // bounding box until the skeleton is actually posed. Pose it
                    // into the Idle clip and flush world matrices BEFORE measuring,
                    // otherwise different characters report wildly different heights
                    // and end up at very different in-game sizes.
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
                    // Plant the feet a FIXED distance below the group origin (the
                    // network y is ~eye height, a fixed real-world distance above
                    // the floor — independent of how big we scale the model). Using
                    // TARGET_HEIGHT here was the bug: making models bigger pushed
                    // their feet through the floor.
                    const yOffset = -(box.min.y * scale) - FEET_BELOW_ORIGIN;
                    // Scaled dimensions, for a per-character hitbox sized to the
                    // actual model (radius from width/depth, height from box).
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
            // If the death FBX loaded BEFORE the characters, align its bone names now
            // that we have a template to compare against.
            if (this.deathClipOverride) this._normalizeDeathClipBones(this.deathClipOverride);
        }
        const pending = this.pendingPlayers;
        this.pendingPlayers = [];
        pending.forEach((p) => this.addPlayer(p));
    }

    // Build any players queued while adds were deferred (see addPlayer/deferAdds).
    // Called by Game when the spawn intro cinematic ends.
    flushDeferredPlayers() {
        this.deferAdds = false;
        const pending = this.pendingPlayers;
        this.pendingPlayers = [];
        pending.forEach((p) => this.addPlayer(p));
    }

    // Pick which character a given player uses — DETERMINISTICALLY from their id
    // (hash), so EVERY client picks the same character for the same player. This
    // is what makes the kill cam (and all clients) show a player's correct,
    // consistent skin instead of a different one per client.
    characterFor(playerId) {
        if (this.assignment.has(playerId)) return this.assignment.get(playerId);
        const n = this.templates.length || 1;
        let h = 0;
        for (let i = 0; i < playerId.length; i++) h = (h * 31 + playerId.charCodeAt(i)) >>> 0;
        let idx = h % n;
        // Skip any character that failed to load.
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

        // Models still loading: queue and bail; onAllLoaded() replays the queue.
        if (!this.loaded && !this.loadFailed) {
            this.pendingPlayers.push(player);
            return;
        }

        // Deferred (e.g. during the spawn intro cinematic): building a skinned
        // character is a ~250ms synchronous hitch (geometry upload + shader compile),
        // which would stutter the fly-through. Queue it; flushDeferredPlayers()
        // builds them once the cinematic ends. They aren't visible during the intro.
        if (this.deferAdds) {
            this.pendingPlayers.push(player);
            return;
        }

        console.log('Adding new player:', player.id, player.name, 'at position', player.x, player.y, player.z);

        const entry = this.loadFailed
            ? this.buildCapsule(player)
            : this.buildModel(player);

        entry.mesh.position.set(player.x, player.y, player.z);

        // Name tags only for TEAMMATES. Enemies show no tag (you shouldn't see
        // enemy names floating over them). In non-team modes, show all names.
        const isTeammate = this.gameMode !== 'team'
            || (this.localTeam && player.team && player.team === this.localTeam);
        if (isTeammate) {
            const nameSprite = this.createNameSprite(player.name);
            // Sit clearly ABOVE the head (model is ~16.5 tall; head ≈ +7 from the
            // group origin), not inside it.
            nameSprite.position.set(0, 10, 0);
            nameSprite.raycast = () => {}; // label only — must not block shooting raycasts
            entry.mesh.add(nameSprite);
            entry.nameSprite = nameSprite;
        }

        this.scene.add(entry.mesh);
        this.otherPlayers.set(player.id, entry);
        this.playerHealth.set(player.id, 5);
        this.updatePlayerCount();
    }

    // Animated GLB instance with its own skeleton + mixer.
    buildModel(player) {
        const charIdx = this.characterFor(player.id);
        const template = this.templates[charIdx];

        const root = new THREE.Group(); // wrapper so we can rotate the model independently of offsets
        const model = cloneSkeleton(template.scene);
        // Per-character scale/offset so every model is normalized to one height.
        model.scale.setScalar(template.scale);
        model.position.y = template.yOffset;
        model.rotation.y = MODEL_FACING_OFFSET; // orient to face the game's forward

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                // Keep the model's own (textured) Mixamo material — no team-color
                // override, so the character shows its natural skin.
                child.frustumCulled = false;
                // Don't raycast against the animated skinned mesh (expensive and
                // pose-dependent); hit detection uses the capsule hitbox below.
                child.raycast = () => {};
            }
        });
        root.add(model);

        // Invisible capsule hitbox sized to THIS character's actual model bounds,
        // as a direct child of the wrapper. Shooting raycasts (recursive) hit this
        // — stable regardless of animation pose, and matched to each character's
        // real silhouette so big and small characters hit accordingly.
        const dims = template.dims || { height: 11, radius: 2 };
        const radius = Math.max(1, dims.radius);
        const cylLen = Math.max(0.1, dims.height - radius * 2); // total ≈ height
        const hitbox = new THREE.Mesh(
            new THREE.CapsuleGeometry(radius, cylLen, 4, 8),
            new THREE.MeshBasicMaterial({ visible: false })
        );
        // Center the capsule on the body: feet at -FEET_BELOW_ORIGIN, so center
        // is half the height above the feet.
        hitbox.position.y = -FEET_BELOW_ORIGIN + dims.height / 2;
        hitbox.userData.isHitbox = true;
        root.add(hitbox);

        const mixer = new THREE.AnimationMixer(model);
        const actions = {};
        for (const [key, name] of Object.entries(CLIP)) {
            // Use the custom FBX death clip when available; else the GLB's own clip.
            const clip = (key === 'death' && this.deathClipOverride)
                ? this.deathClipOverride
                : THREE.AnimationClip.findByName(template.clips, name);
            if (clip) {
                actions[key] = mixer.clipAction(clip);
            }
        }
        // One-shots (play once, hold last frame): shoot, jumps, death.
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
            dirX: 0, dirZ: 0, // smoothed local-frame movement direction
            speed: 0,         // smoothed horizontal speed (units/sec) for anim timing
            lastMoveAt: 0,
            stateChangedAt: 0,
            isModel: true,
        };
    }

    // The character body dimensions assigned to a player (scaled height/radius),
    // used for kill-cam hit detection so it matches each character's real body.
    getPlayerDims(playerId) {
        if (!this.loaded) return null;
        const template = this.templates[this.characterFor(playerId)];
        return template ? template.dims : null;
    }

    // Build a standalone animated character mesh for a given player id, NOT
    // tracked in otherPlayers. Used by the replay/kill-cam to show the local
    // player's own body (which is otherwise first-person only) as their real
    // character instead of a red capsule. Returns {mesh, mixer, actions} or null.
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
                ? this.deathClipOverride
                : THREE.AnimationClip.findByName(template.clips, name);
            if (clip) actions[key] = mixer.clipAction(clip);
        }
        ['shoot', 'jump', 'jumpBackward', 'jumpStand', 'death'].forEach((k) => {
            if (actions[k]) { actions[k].setLoop(THREE.LoopOnce); actions[k].clampWhenFinished = true; }
        });
        if (actions.idle) actions.idle.play();
        return { mesh: root, mixer, actions };
    }

    // Fallback capsule (original behaviour) if the GLB can't load.
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

    // The local player's team — controls which name tags are shown (teammates
    // only). Call whenever the local team becomes known/changes.
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
        // Ignore movement updates for a dead player — the death animation owns the
        // body; stale in-flight messages must not drag it or re-orient it.
        if (player.dead) return;

        const newX = message.x, newY = message.y, newZ = message.z;
        const yaw = message.rotation_y;

        if (player.isModel) {
            const dx = newX - player.lastPos.x;
            const dy = newY - player.lastPos.y;
            const dz = newZ - player.lastPos.z;
            player.lastPos.set(newX, newY, newZ);

            // Accumulate forward/right movement into smoothed direction values.
            // Decisions about which clip to play are made in update() per-frame
            // (with real time + cooldown), NOT here per-message — deciding on
            // every noisy message is what caused the constant clip flipping.
            const fX = -Math.sin(yaw), fZ = -Math.cos(yaw);
            const rX = Math.cos(yaw), rZ = -Math.sin(yaw);
            player.dirZ = player.dirZ * (1 - DIR_SMOOTH) + (dx * fX + dz * fZ) * DIR_SMOOTH;
            player.dirX = player.dirX * (1 - DIR_SMOOTH) + (dx * rX + dz * rZ) * DIR_SMOOTH;

            const horizDist = Math.sqrt(dx * dx + dz * dz);
            if (horizDist > RUN_SPEED_THRESHOLD) player.lastMoveAt = this.clock || 0;

            // Estimate real speed (units/sec) from the message gap, so the run
            // animation can be sped up/slowed to match how far the player is
            // actually travelling — this kills the "played a full stride but only
            // moved an inch" mismatch that made short taps feel laggy.
            const now = this.clock || 0;
            const gap = Math.max(0.001, now - (player._lastMsgAt || now));
            player._lastMsgAt = now;
            const instSpeed = horizDist / gap;
            player.speed = player.speed * 0.7 + instSpeed * 0.3;

            // Jump is event-like, so trigger it here on the rising edge.
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

    // Pick a locomotion clip from the player's SMOOTHED direction. Classifies
    // from the NORMALIZED direction (angle), so the per-message step size doesn't
    // matter. Strong forward bias + hysteresis so a clip, once chosen, sticks.
    directionState(player) {
        const lx = player.dirX, lz = player.dirZ;
        const speed = Math.sqrt(lx * lx + lz * lz);
        if (speed < DIR_MOVE_MIN) return 'idle';

        const ax = Math.abs(lx), az = Math.abs(lz);
        const inStrafe = player.current === 'strafeLeft' || player.current === 'strafeRight';
        // Enter a strafe only when lateral strongly dominates; stay in it under a
        // weaker test (hysteresis) so it doesn't snap back to run on noise.
        const lateral = inStrafe ? (ax > az * 0.9) : (ax > az * STRAFE_DOMINANCE);
        if (!lateral) return lz >= 0 ? 'run' : 'runBackward';
        return lx >= 0 ? 'strafeRight' : 'strafeLeft';
    }

    // Cross-fade to a looping locomotion state (idle/run). Returns true if it
    // actually changed state, false if it was a no-op.
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

    // Play a one-shot clip (shoot/dance), then return to locomotion.
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
            // Fall back to idle; updatePlayer will switch to run if they're moving.
            player.current = null; // force setState to re-fade
            this.setState(player, 'idle');
        };
        mixer.addEventListener('finished', onFinished);
    }

    // One-shot jump that blocks locomotion until it finishes, then returns to idle.
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
            player.current = null; // force re-fade
            this.setState(player, 'idle');
        };
        const onFinished = (e) => { if (e.action === action) clear(); };
        mixer.addEventListener('finished', onFinished);
        // Safety: never let the jumping flag get stuck if 'finished' is missed
        // (e.g. the action is interrupted), which would freeze locomotion.
        player._jumpTimer = setTimeout(clear, (action.getClip().duration + 0.3) * 1000);
    }

    // Called from Game when a remote player fires.
    playerShoot(playerId) {
        const player = this.otherPlayers.get(playerId);
        if (player && player.isModel && !player.dead && !player.dancing) {
            this.playOnce(player, 'shoot');
        }
    }

    // Called from Game to toggle the emote (e.g. press O).
    playerDance(playerId) {
        const player = this.otherPlayers.get(playerId);
        if (player && player.isModel && !player.dead) {
            player.dancing = true;
            this.playOnce(player, 'dance');
        }
    }

    // Advance every player's animation mixer. Call once per frame from the game loop.
    update(deltaTime) {
        this.clock = (this.clock || 0) + deltaTime;
        this.otherPlayers.forEach((player) => {
            if (player.mixer) player.mixer.update(deltaTime);

            if (!player.isModel) return;

            // DEAD: the death animation owns the body. Don't lerp position or smooth
            // the yaw — that fought the fall. The mixer keeps running (above) so the
            // death pose plays. Ramp the ground-drop from 0 (standing → feet on floor)
            // to full DEATH_GROUND_DROP (lying flat) so the body settles cleanly.
            if (player.dead) {
                if (typeof player._deathBaseY === 'number' && player._deathDuration > 0) {
                    const tDeath = Math.min(1, Math.max(0, (this.clock - player._deathStartClock) / player._deathDuration));
                    player.mesh.position.y = player._deathBaseY - DEATH_GROUND_DROP * tDeath;
                }
                return;
            }

            // Smoothly glide the mesh toward the latest network target each frame.
            // Frame-rate independent so it stays smooth at any refresh rate.
            const t = 1 - Math.pow(1 - POSITION_LERP, deltaTime * 60);
            player.mesh.position.lerp(player.targetPos, t);
            let d = player.targetYaw - player.mesh.rotation.y;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            player.mesh.rotation.y += d * t;

            // Decay the smoothed direction toward zero when no fresh movement is
            // arriving, so a stopped player (who sends no messages) settles to
            // idle instead of being stuck in a locomotion clip.
            if (this.clock - (player.lastMoveAt || 0) > 0.08) {
                const decay = Math.pow(0.001, deltaTime); // ~fast settle
                player.dirZ *= decay;
                player.dirX *= decay;
            }

            // Decide the locomotion clip ONCE per frame (not per network message).
            // A cooldown limits how often DIRECTIONAL clips may change, which is
            // what stops the run<->strafe<->back flip-flopping that read as
            // stutter. Going to idle (stopping) is always allowed immediately.
            if (player.dead || player.dancing || player.jumping || player.current === 'shoot') return;
            const want = this.directionState(player);

            // Match leg cycle speed to real travel speed for locomotion clips, so
            // the feet don't "over-stride" relative to actual movement.
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
            // Play the death animation, then remove the mesh. Falls back to
            // instant removal if there's no model/death clip.
            if (player.isModel && player.actions.death) {
                player.dead = true;
                const death = player.actions.death;
                // Ground-settle: the body collapses from STANDING (start, feet on the
                // floor) to LYING FLAT (end). Because we stripped the hip translation,
                // the flat body would float ~1m, but an instant drop sinks the feet at
                // the start. So ramp the drop in over the clip (see update()).
                player._deathBaseY = player.mesh.position.y;
                player._deathStartClock = this.clock || 0;
                player._deathDuration = (death.getClip().duration || 1);
                // Stop ALL other actions hard so nothing blends into the death pose
                // (a crossfade from run/shoot could fight the fall and look like a
                // "flip"). The death clip alone drives the skeleton.
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
                    // If a respawn arrived while the death was playing (1v1 where
                    // the next round starts immediately), apply it now that the
                    // death animation has finished.
                    if (player.pendingRespawn) {
                        this.respawnPlayer(player.pendingRespawn);
                    }
                };
                const onFinished = (e) => { if (e.action === death) finalize(); };
                player.mixer.addEventListener('finished', onFinished);
                // Safety: force-finish if the clip's 'finished' event is missed,
                // so a dying player can never get stuck forever.
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
        // Remove every remote player mesh from the scene. Used at round end so
        // no model lingers at its last-known (kill-spot) position during the
        // next build phase. Players are re-created from the round's
        // player_respawned messages at their fresh spawn positions.
        // EXCEPTION: a player still playing their death animation is spared, so
        // the death plays out fully even when the round ends immediately (1v1).
        // Their own death onFinished removes them ~3s later.
        if (ANIM_DEBUG) console.log(`[death] clearAllPlayers (${this.otherPlayers.size} players) at clock=${(this.clock||0).toFixed(2)}`);
        this.otherPlayers.forEach((player, id) => {
            if (player.dead) {
                if (ANIM_DEBUG) console.log(`[death] clearAllPlayers sparing dying ${id}`);
                return; // let the death animation finish
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

        // If they're still playing their death animation, DON'T yank the body to
        // re-add a fresh idle one — that cut the death short in 1v1s where the
        // next round starts almost immediately. Remember the respawn and apply it
        // once the death finishes (killPlayer's onFinished calls applyRespawn).
        if (existing && existing.dead) {
            if (ANIM_DEBUG) console.log(`[death] respawn deferred for dying ${player.id} at clock=${(this.clock||0).toFixed(2)}`);
            existing.pendingRespawn = player;
            return;
        }

        if (existing) {
            // Alive: server sent a new spawn position at round start. Snap there.
            existing.mesh.position.set(player.x, player.y, player.z);
            existing.data = player;
            if (existing.lastPos) existing.lastPos.set(player.x, player.y, player.z);
            if (existing.targetPos) existing.targetPos.set(player.x, player.y, player.z);
            this.playerHealth.set(player.id, 5);
            this.respawning.delete(player.id);
        } else {
            // Fully removed already: re-add fresh at the spawn position.
            this.respawning.delete(player.id);
            this.addPlayer(player);
        }
    }
}
