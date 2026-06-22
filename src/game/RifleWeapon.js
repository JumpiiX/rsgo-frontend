import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// First-person animated rifle viewmodel. Drop-in replacement for RevolverWeapon
// — same public interface (shoot/startReload/getAmmoStatus/resetWeapon/show/
// hide/update/getMuzzle*). The model (rifle.glb) ships its own Idle/Shoot/Reload
// animation clips; we play them and keep the HUD reload timed to the clip.

// Clip names inside rifle.glb (prefixed with the rig name on export).
const CLIP_IDLE = 'Akito Rig|Idle';
const CLIP_SHOOT = 'Akito Rig|Shoot';
const CLIP_RELOAD = 'Akito Rig|Reload';

// Brand recolor of the viewmodel. Map the model's material NAMES to palette
// colors: black gun body -> orange, metal/bolt/chrome accents -> navy, the
// sleeves/jacket -> navy. Hands keep their natural skin (not listed).
const ORANGE = 0xef4e23;
const NAVY = 0x1a2447;

// Build the material->color map for a team. Orange team: body ORANGE, accents
// NAVY. Navy team ('red'): FLIPPED — body NAVY, accents ORANGE. The pullover
// sleeves stay NAVY for both (cleaner). Hands are left as natural skin.
function materialColorsForTeam(team) {
    const navyTeam = team === 'red';
    const body = navyTeam ? NAVY : ORANGE;
    const accent = navyTeam ? ORANGE : NAVY;
    return {
        finish: body, finish_dark: body, polymer: body, polymer_rough: body, finish_alu: body,
        finish_secondary: accent, finish_bright: accent, chromed: accent, bolt: accent, material: accent,
        MI_tp5003_jacket: NAVY, // sleeves always navy
    };
}

export class RifleWeapon {
    constructor(camera, scene, team = 'orange') {
        this.camera = camera;
        this.scene = scene;
        this.materialColors = materialColorsForTeam(team);
        this.weapon = null;
        this.weaponGroup = new THREE.Group();
        this.muzzleOffset = new THREE.Vector3(0, 0, -0.6); // tip of the barrel (tuned later)

        // Ammo system — 30-round magazine.
        this.maxAmmo = 30;
        this.currentAmmo = 30;
        this.isReloading = false;
        this.reloadTime = 3960; // ms — overwritten with the exact Reload clip length on load
        this.reloadStartTime = 0;
        this.autoReloadEnabled = true;
        // Ammo count the reload started from. Reloading is INCREMENTAL: the
        // magazine refills proportionally over the clip, so the player can cancel
        // (by shooting) and keep whatever rounds were already loaded.
        this.reloadStartAmmo = 0;

        // Recoil (kept for the HUD/feel; the Shoot clip does the visual kick).
        this.recoilAmount = 0;
        this.recoilRecovery = 0.1;
        this.maxRecoil = 0.05;

        // === VIEWMODEL PLACEMENT (tuned live in-game) ===
        // Where the gun sits relative to the camera: +x right, +y up, -z forward.
        this.initialPositionOffset = new THREE.Vector3(0.02, -0.22, -0.04);
        // Orientation of the (recentered) model.
        this.modelRotation = new THREE.Euler(0.12, 3.35, 0.20);
        this.modelScale = 0.28;

        // Animation
        this.mixer = null;
        this.actions = {};
        this.clock = 0;

        this.loadRifle();
    }

    // Recolor a material to the brand palette by its name (gun body -> orange,
    // accents + sleeves -> navy). Hands are left untouched.
    recolorMaterial(material) {
        const name = material.name || '';
        const color = this.materialColors[name];
        if (color === undefined) return; // e.g. hands — keep as-is
        material.color = new THREE.Color(color);
        // For the textured sleeve, drop the camo map so it reads as flat navy.
        if (name === 'MI_tp5003_jacket') {
            material.map = null;
        }
        material.needsUpdate = true;
    }

    loadRifle() {
        const loader = new GLTFLoader();
        loader.load(
            '/models/rifle.glb',
            (gltf) => {
                this.weapon = gltf.scene;
                this.weapon.traverse((child) => {
                    if (child.isMesh) {
                        if (child.material) {
                            child.material.fog = false;
                            this.recolorMaterial(child.material);
                        }
                        child.frustumCulled = false;
                        child.renderOrder = 999; // draw on top, like a viewmodel
                    }
                });

                // Animations.
                this.mixer = new THREE.AnimationMixer(this.weapon);
                const clips = gltf.animations;
                const find = (name) => THREE.AnimationClip.findByName(clips, name);
                const idle = find(CLIP_IDLE), shoot = find(CLIP_SHOOT), reload = find(CLIP_RELOAD);

                // Pose into Idle and recenter, so the model's built-in pivot (the
                // arms+gun rig sits offset/upright by default) doesn't matter — the
                // viewmodel then sits predictably in front of the camera.
                if (idle) { this.mixer.clipAction(idle).play(); this.mixer.update(0.3); }
                this.weapon.updateMatrixWorld(true);
                const box = new THREE.Box3().setFromObject(this.weapon);
                const center = box.getCenter(new THREE.Vector3());
                // Inner pivot recenters the model to its own origin.
                this.pivot = new THREE.Group();
                this.weapon.position.sub(center);
                this.pivot.add(this.weapon);
                this.pivot.scale.setScalar(this.modelScale);
                this.pivot.rotation.copy(this.modelRotation);
                this.weaponGroup.add(this.pivot);
                this.scene.add(this.weaponGroup);

                if (idle) this.actions.idle = this.mixer.clipAction(idle);
                if (shoot) {
                    this.actions.shoot = this.mixer.clipAction(shoot);
                    this.actions.shoot.setLoop(THREE.LoopOnce);
                    this.actions.shoot.clampWhenFinished = false;
                }
                if (reload) {
                    this.actions.reload = this.mixer.clipAction(reload);
                    this.actions.reload.setLoop(THREE.LoopOnce);
                    this.actions.reload.clampWhenFinished = true;
                    // Make the HUD reload last EXACTLY as long as the clip.
                    this.reloadTime = reload.duration * 1000;
                }
                if (this.actions.idle) this.actions.idle.play();

                this.updateWeaponPosition();
                console.log('Rifle loaded. clips:', clips.map((c) => c.name).join(', '),
                    '| reloadTime(ms):', Math.round(this.reloadTime));
            },
            undefined,
            (error) => console.error('Error loading rifle.glb:', error)
        );
    }

    // Place the weaponGroup in front of the camera, matching its orientation.
    // The inner pivot already holds the model's scale + lay-down rotation.
    updateWeaponPosition(extraY = 0) {
        if (!this.weaponGroup) return;
        const offset = this.initialPositionOffset.clone();
        offset.y += extraY;
        offset.applyQuaternion(this.camera.quaternion);
        this.weaponGroup.position.copy(this.camera.position).add(offset);
        this.weaponGroup.quaternion.copy(this.camera.quaternion);
    }

    update(deltaTime) {
        this.clock += deltaTime;
        if (this.mixer) this.mixer.update(deltaTime);

        // Incremental reload: refill the magazine proportionally to how much of
        // the clip has played, so a cancel (shooting) keeps the rounds loaded so
        // far. currentAmmo climbs from reloadStartAmmo toward maxAmmo over the clip.
        if (this.isReloading) {
            const elapsed = Date.now() - this.reloadStartTime;
            const progress = Math.min(1, elapsed / this.reloadTime);
            const loaded = Math.floor((this.maxAmmo - this.reloadStartAmmo) * progress);
            this.currentAmmo = Math.min(this.maxAmmo, this.reloadStartAmmo + loaded);
            if (elapsed >= this.reloadTime) this.finishReload();
        }

        // Follow the camera with a subtle idle sway. NO positional recoil — the
        // rifle's own Shoot animation handles the kick, so the old revolver-style
        // recoil offset would double it up.
        if (this.weaponGroup && this.weapon) {
            const time = Date.now() * 0.001;
            const sway = Math.sin(time * 2) * 0.001;
            this.updateWeaponPosition(sway);
        }
    }

    canShoot() {
        // Mid-reload is fine to shoot — it cancels the reload (see shoot()) as
        // long as at least one round is already chambered.
        return this.currentAmmo > 0;
    }

    shoot() {
        if (!this.canShoot()) return false;
        // Shooting cancels an in-progress reload, keeping the rounds loaded so far.
        if (this.isReloading) this.cancelReload();
        this.currentAmmo--;
        this.animateShoot(); // the rifle's Shoot clip provides the visual recoil
        if (this.currentAmmo === 0 && this.autoReloadEnabled) {
            setTimeout(() => {
                if (this.currentAmmo === 0 && !this.isReloading) this.startReload();
            }, 300);
        }
        return true;
    }

    // Play the rifle's own Shoot clip from the start (rapid-fire safe).
    animateShoot() {
        const a = this.actions.shoot;
        if (!a) return;
        a.reset();
        a.play();
    }

    startReload() {
        if (this.isReloading || this.currentAmmo === this.maxAmmo) return false;
        this.isReloading = true;
        this.reloadStartTime = Date.now();
        this.reloadStartAmmo = this.currentAmmo; // refill grows from here
        // Play the Reload clip; its duration === this.reloadTime so they finish together.
        if (this.actions.reload) {
            this.actions.reload.reset();
            this.actions.reload.play();
        }
        return true;
    }

    // Stop the reload WITHOUT topping off — currentAmmo keeps whatever was loaded
    // incrementally so far. Used when the player shoots mid-reload.
    cancelReload() {
        if (!this.isReloading) return;
        this.isReloading = false;
        this.reloadStartTime = 0;
        if (this.actions.reload) this.actions.reload.stop();
        if (this.actions.idle) { this.actions.idle.reset(); this.actions.idle.play(); }
    }

    finishReload() {
        this.currentAmmo = this.maxAmmo;
        this.isReloading = false;
        this.reloadStartTime = 0;
        // Return to idle after the reload clip.
        if (this.actions.idle) {
            this.actions.idle.reset();
            this.actions.idle.play();
        }
    }

    getAmmoStatus() {
        return {
            current: this.currentAmmo,
            max: this.maxAmmo,
            isReloading: this.isReloading,
            reloadProgress: this.isReloading
                ? Math.min(1, (Date.now() - this.reloadStartTime) / this.reloadTime) : 0,
        };
    }

    resetWeapon() {
        this.currentAmmo = this.maxAmmo;
        this.isReloading = false;
        this.reloadStartTime = 0;
        this.recoilAmount = 0;
        if (this.actions.reload) this.actions.reload.stop();
        if (this.actions.idle) { this.actions.idle.reset(); this.actions.idle.play(); }
    }

    show() { if (this.weaponGroup) this.weaponGroup.visible = true; }
    hide() { if (this.weaponGroup) this.weaponGroup.visible = false; }

    getMuzzleWorldPosition() {
        if (!this.weaponGroup) return null;
        return this.muzzleOffset.clone().applyMatrix4(this.weaponGroup.matrixWorld);
    }

    getMuzzlePosition() {
        const muzzlePos = this.weaponGroup.position.clone();
        const offset = this.muzzleOffset.clone().applyQuaternion(this.weaponGroup.quaternion);
        muzzlePos.add(offset);
        return muzzlePos;
    }

    dispose() {
        if (this.weaponGroup) {
            this.scene.remove(this.weaponGroup);
            this.weaponGroup.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    if (child.material) child.material.dispose();
                }
            });
        }
    }
}
