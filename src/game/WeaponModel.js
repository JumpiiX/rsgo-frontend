import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class WeaponModel {
    constructor(camera, scene) {
        this.camera = camera;
        this.scene = scene;
        this.weapon = null;
        this.weaponGroup = new THREE.Group();

        
        this.initialPositionOffset = new THREE.Vector3(0.2, -0.15, -0.3);
        this.initialRotationOffset = new THREE.Euler(0, -0.3, 0);

        this.loadWeapon();
    }

    loadWeapon() {
        const loader = new GLTFLoader();

        
        loader.load(
            '/models/revolver.glb',  
            (gltf) => {
                this.weapon = gltf.scene;

                
                this.weapon.scale.set(0.1, 0.1, 0.1);  

                
                this.weapon.traverse((child) => {
                    if (child.isMesh) {
                        
                        child.material = new THREE.MeshBasicMaterial({
                            color: 0xff6600,  
                            fog: false
                        });
                        child.frustumCulled = false;
                        child.renderOrder = 999;
                    }
                });

                this.weaponGroup.add(this.weapon);
                this.scene.add(this.weaponGroup);

                this.updateWeaponPosition();
                console.log('Weapon model loaded successfully');
            },
            (progress) => {
                console.log('Loading weapon:', (progress.loaded / progress.total * 100) + '%');
            },
            (error) => {
                console.error('Error loading weapon model:', error);
                console.log('Make sure revolver.glb is in /models/ folder');
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
    }

    update(deltaTime) {
        this.updateWeaponPosition();

        if (this.weaponGroup) {
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

        this.weaponGroup.position.z = originalZ + 0.03;
        this.weaponGroup.rotation.x = originalRotX - 0.1;

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

    dispose() {
        if (this.weaponGroup) {
            this.scene.remove(this.weaponGroup);
            this.weaponGroup.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    child.material.dispose();
                }
            });
        }
    }
}
