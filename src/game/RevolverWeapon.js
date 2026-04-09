import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

export class RevolverWeapon {
    constructor(camera, scene) {
        this.camera = camera;
        this.scene = scene;
        this.weapon = null;
        this.weaponGroup = new THREE.Group();
        this.muzzleOffset = new THREE.Vector3(0, 0, -0.15);
        
        // Ammo system
        this.maxAmmo = 10;
        this.currentAmmo = 10;
        this.isReloading = false;
        this.reloadTime = 3000; // 3 seconds
        this.reloadStartTime = 0;
        this.autoReloadEnabled = true;
        
        // Recoil system
        this.recoilAmount = 0;
        this.recoilRecovery = 0.1;
        this.maxRecoil = 0.05; 

        
        const aspect = window.innerWidth / window.innerHeight;
        let xOffset = 0.15;
        let yOffset = -0.1;
        let zOffset = -0.25;
        
        if (aspect < 1.0) {
            xOffset = 0.1;
            yOffset = -0.15;
            zOffset = -0.3;
        }
        
        this.initialPositionOffset = new THREE.Vector3(xOffset, yOffset, zOffset);
        
        this.initialRotationOffset = new THREE.Euler(0, Math.PI, 0.1); 
        

        this.loadRevolver();
    }

    loadRevolver() {
        const mtlLoader = new MTLLoader();
        const objLoader = new OBJLoader();

        
        mtlLoader.load(
            '/models/Revolver_02.mtl',
            (materials) => {
                materials.preload();
                objLoader.setMaterials(materials);

                
                objLoader.load(
                    '/models/Revolver_02.obj',
                    (obj) => {
                        this.weapon = obj;

                        
                        const box = new THREE.Box3().setFromObject(this.weapon);
                        const size = box.getSize(new THREE.Vector3());
                        
                        const maxDim = Math.max(size.x, size.y, size.z);
                        const targetSize = 0.3;
                        const scale = targetSize / maxDim;

                        this.weapon.scale.set(scale, scale, scale);

                        
                        let meshCount = 0;
                        this.weapon.traverse((child) => {
                            if (child.isMesh) {
                                meshCount++;
                                
                                if (child.material) {
                                    child.material.fog = false;
                                    child.material.side = THREE.DoubleSide;
                                }
                                child.frustumCulled = false;
                                child.renderOrder = 999;

                                
                            }
                        });
                        this.weaponGroup.add(this.weapon);
                        this.scene.add(this.weaponGroup);

                        this.updateWeaponPosition();
                        
                    },
                    (progress) => {
                        
                    },
                    (error) => {
                        console.error('Error loading revolver OBJ:', error);
                    }
                );
            },
            (progress) => {
                
            },
            (error) => {
                console.error('Error loading MTL:', error);
                
                this.loadWithoutMaterials();
            }
        );
    }

    loadWithoutMaterials() {
        const objLoader = new OBJLoader();

        objLoader.load(
            '/models/Revolver_02.obj',
            (obj) => {
                this.weapon = obj;

                
                this.weapon.scale.set(0.001, 0.001, 0.001);

                
                this.weapon.traverse((child) => {
                    if (child.isMesh) {
                        
                        child.material = new THREE.MeshBasicMaterial({
                            color: 0x444444,  
                            fog: false
                        });
                        child.frustumCulled = false;
                        child.renderOrder = 999;
                    }
                });

                this.weaponGroup.add(this.weapon);
                this.scene.add(this.weaponGroup);

                this.updateWeaponPosition();
                console.log('Revolver loaded without materials');
            },
            (progress) => {
                console.log('Loading revolver: ' + (progress.loaded / progress.total * 100) + '%');
            },
            (error) => {
                console.error('Error loading revolver:', error);
            }
        );
    }

    updateWeaponPosition() {
        if (!this.weaponGroup) return;

        const weaponPos = new THREE.Vector3();
        weaponPos.copy(this.camera.position);

        const offset = this.initialPositionOffset.clone();
        offset.applyQuaternion(this.camera.quaternion);
        weaponPos.add(offset);

        this.weaponGroup.position.copy(weaponPos);

        
        this.weaponGroup.quaternion.copy(this.camera.quaternion);
        this.weaponGroup.rotateY(this.initialRotationOffset.y);
        this.weaponGroup.rotateX(this.initialRotationOffset.x);
        this.weaponGroup.rotateZ(this.initialRotationOffset.z);
    }

    update(deltaTime) {
        // Update reload status
        if (this.isReloading) {
            const elapsed = Date.now() - this.reloadStartTime;
            if (elapsed >= this.reloadTime) {
                this.finishReload();
            }
        }
        
        // Update recoil recovery
        if (this.recoilAmount > 0) {
            this.recoilAmount = Math.max(0, this.recoilAmount - this.recoilRecovery * deltaTime);
        }
        
        this.updateWeaponPosition();

        
        if (this.weaponGroup && this.weapon) {
            const time = Date.now() * 0.001;
            const swayX = Math.sin(time * 1.5) * 0.002;
            const swayY = Math.sin(time * 2) * 0.001;

            const offset = this.initialPositionOffset.clone();
            offset.x += swayX;
            offset.y += swayY + this.recoilAmount; // Add recoil offset

            const weaponPos = new THREE.Vector3();
            weaponPos.copy(this.camera.position);
            weaponPos.add(offset.applyQuaternion(this.camera.quaternion));
            this.weaponGroup.position.copy(weaponPos);
            
            // Apply weapon rotation properly
            this.weaponGroup.quaternion.copy(this.camera.quaternion);
            
            // Apply initial rotation offsets
            const rotationY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.initialRotationOffset.y);
            const rotationX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.initialRotationOffset.x - this.recoilAmount * 0.5);
            const rotationZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.initialRotationOffset.z);
            
            this.weaponGroup.quaternion.multiply(rotationY);
            this.weaponGroup.quaternion.multiply(rotationX);
            this.weaponGroup.quaternion.multiply(rotationZ);
        }
    }

    canShoot() {
        return this.currentAmmo > 0 && !this.isReloading;
    }
    
    shoot() {
        if (!this.canShoot()) return false;
        
        this.currentAmmo--;
        this.addRecoil();
        this.animateShoot();
        
        // Auto reload when empty
        if (this.currentAmmo === 0 && this.autoReloadEnabled) {
            setTimeout(() => {
                if (this.currentAmmo === 0 && !this.isReloading) {
                    this.startReload();
                }
            }, 500); // Small delay before auto reload
        }
        
        return true;
    }
    
    addRecoil() {
        this.recoilAmount = Math.min(this.maxRecoil, this.recoilAmount + 0.02);
    }

    animateShoot() {
        if (!this.weaponGroup) return;

        
        const originalZ = this.weaponGroup.position.z;
        const originalRotX = this.weaponGroup.rotation.x;

        this.weaponGroup.position.z = originalZ + 0.05;
        this.weaponGroup.rotation.x = originalRotX - 0.2;

        setTimeout(() => {
            this.weaponGroup.position.z = originalZ;
            this.weaponGroup.rotation.x = originalRotX;
        }, 100);
    }
    
    startReload() {
        if (this.isReloading || this.currentAmmo === this.maxAmmo) return false;
        
        this.isReloading = true;
        this.reloadStartTime = Date.now();
        return true;
    }
    
    finishReload() {
        this.currentAmmo = this.maxAmmo;
        this.isReloading = false;
        this.reloadStartTime = 0;
    }
    
    getAmmoStatus() {
        return {
            current: this.currentAmmo,
            max: this.maxAmmo,
            isReloading: this.isReloading,
            reloadProgress: this.isReloading ? 
                Math.min(1, (Date.now() - this.reloadStartTime) / this.reloadTime) : 0
        };
    }
    
    resetWeapon() {
        // Reset weapon to full ammo and stop any reload
        this.currentAmmo = this.maxAmmo;
        this.isReloading = false;
        this.reloadStartTime = 0;
        this.recoilAmount = 0;
    }

    show() {
        if (this.weaponGroup) {
            this.weaponGroup.visible = true;
        }
    }

    hide() {
        if (this.weaponGroup) {
            this.weaponGroup.visible = false;
        }
    }

    getMuzzlePosition() {
        
        const muzzlePos = this.weaponGroup.position.clone();

        
        const offset = this.muzzleOffset.clone();
        offset.applyQuaternion(this.weaponGroup.quaternion);
        muzzlePos.add(offset);

        return muzzlePos;
    }

    dispose() {
        if (this.weaponGroup) {
            this.scene.remove(this.weaponGroup);
            this.weaponGroup.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    if (child.material) {
                        child.material.dispose();
                    }
                }
            });
        }
    }
}
