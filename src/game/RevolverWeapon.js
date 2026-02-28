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

        
        this.initialPositionOffset = new THREE.Vector3(0.15, -0.1, -0.25);
        
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
        this.updateWeaponPosition();

        
        if (this.weaponGroup && this.weapon) {
            const time = Date.now() * 0.001;
            const swayX = Math.sin(time * 1.5) * 0.002;
            const swayY = Math.sin(time * 2) * 0.001;

            const offset = this.initialPositionOffset.clone();
            offset.x += swayX;
            offset.y += swayY;

            const weaponPos = new THREE.Vector3();
            weaponPos.copy(this.camera.position);
            weaponPos.add(offset.applyQuaternion(this.camera.quaternion));
            this.weaponGroup.position.copy(weaponPos);
        }
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
