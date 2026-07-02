import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const CLIP_IDLE = 'Akito Rig|Idle';
const CLIP_SHOOT = 'Akito Rig|Shoot';
const CLIP_RELOAD = 'Akito Rig|Reload';

const ORANGE = 0xef4e23;
const NAVY = 0x1a2447;

function materialColorsForTeam(team) {
    const navyTeam = team === 'red';
    const body = navyTeam ? NAVY : ORANGE;
    const accent = navyTeam ? ORANGE : NAVY;
    return {
        finish: body, finish_dark: body, polymer: body, polymer_rough: body, finish_alu: body,
        finish_secondary: accent, finish_bright: accent, chromed: accent, bolt: accent, material: accent,
        MI_tp5003_jacket: NAVY,
    };
}

export class RifleWeapon {
    constructor(camera, scene, team = 'orange') {
        this.camera = camera;
        this.scene = scene;
        this.materialColors = materialColorsForTeam(team);
        this.weapon = null;
        this.weaponGroup = new THREE.Group();
        this.muzzleOffset = new THREE.Vector3(0, 0, -0.6);

        this.maxAmmo = 30;
        this.currentAmmo = 30;
        this.isReloading = false;
        this.reloadTime = 3960;
        this.reloadStartTime = 0;
        this.autoReloadEnabled = true;

        this.reloadStartAmmo = 0;

        this.recoilAmount = 0;
        this.recoilRecovery = 0.1;
        this.maxRecoil = 0.05;

        this.initialPositionOffset = new THREE.Vector3(-0.040, -0.225, -0.040);

        this.modelRotation = new THREE.Euler(0.090, 3.150, 0.250);
        this.modelScale = 0.280;

        this.mixer = null;
        this.actions = {};
        this.clock = 0;

        this.loadRifle();
    }

    setTeam(team) {
        this.materialColors = materialColorsForTeam(team);
        if (!this.weapon) return;
        this.weapon.traverse((child) => {
            if ((child.isMesh || child.isSkinnedMesh) && child.material) {
                this.recolorMaterial(child.material);
            }
        });
    }

    recolorMaterial(material) {
        const name = material.name || '';
        const color = this.materialColors[name];
        if (color === undefined) return;
        material.color = new THREE.Color(color);

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
                        child.renderOrder = 999;
                    }
                });

                this.mixer = new THREE.AnimationMixer(this.weapon);
                const clips = gltf.animations;
                const find = (name) => THREE.AnimationClip.findByName(clips, name);
                const idle = find(CLIP_IDLE), shoot = find(CLIP_SHOOT), reload = find(CLIP_RELOAD);

                if (idle) { this.mixer.clipAction(idle).play(); this.mixer.update(0.3); }
                this.weapon.updateMatrixWorld(true);
                const box = new THREE.Box3().setFromObject(this.weapon);
                const center = box.getCenter(new THREE.Vector3());

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

        if (this.isReloading) {
            const elapsed = Date.now() - this.reloadStartTime;
            const progress = Math.min(1, elapsed / this.reloadTime);
            const loaded = Math.floor((this.maxAmmo - this.reloadStartAmmo) * progress);
            this.currentAmmo = Math.min(this.maxAmmo, this.reloadStartAmmo + loaded);
            if (elapsed >= this.reloadTime) this.finishReload();
        }

        if (this.weaponGroup && this.weapon) {
            const time = Date.now() * 0.001;
            const sway = Math.sin(time * 2) * 0.001;
            this.updateWeaponPosition(sway);
        }
    }

    canShoot() {

        return this.currentAmmo > 0;
    }

    shoot() {
        if (!this.canShoot()) return false;

        if (this.isReloading) this.cancelReload();
        this.currentAmmo--;
        this.animateShoot();
        if (this.currentAmmo === 0 && this.autoReloadEnabled) {
            setTimeout(() => {
                if (this.currentAmmo === 0 && !this.isReloading) this.startReload();
            }, 300);
        }
        return true;
    }

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
        this.reloadStartAmmo = this.currentAmmo;

        if (this.actions.reload) {
            this.actions.reload.reset();
            this.actions.reload.play();
        }
        return true;
    }

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
