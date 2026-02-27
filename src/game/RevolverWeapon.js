import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

export class RevolverWeapon {
    constructor(camera, scene) {
        this.camera = camera;
        this.scene = scene;
        this.weapon = null;
        this.weaponGroup = new THREE.Group();
        this.muzzleOffset = new THREE.Vector3(0, 0, -0.15); // Offset to barrel tip
        
        // FPS viewmodel position - more visible position
        this.initialPositionOffset = new THREE.Vector3(0.15, -0.1, -0.25);
        // Rotate 180 degrees to point forward
        this.initialRotationOffset = new THREE.Euler(0, Math.PI, 0.1); // 180 degrees Y rotation + slight Z tilt
        
        this.loadRevolver();
    }
    
    loadRevolver() {
        const mtlLoader = new MTLLoader();
        const objLoader = new OBJLoader();
        
        // First load materials
        mtlLoader.load(
            '/models/Revolver_02.mtl',
            (materials) => {
                materials.preload();
                objLoader.setMaterials(materials);
                
                // Then load the OBJ with materials
                objLoader.load(
                    '/models/Revolver_02.obj',
                    (obj) => {
                        this.weapon = obj;
                        
                        // Try auto-scaling based on model size
                        const box = new THREE.Box3().setFromObject(this.weapon);
                        const size = box.getSize(new THREE.Vector3());
                        console.log('Original model size:', size);
                        
                        // Scale to fit (target size ~0.3 units)
                        const maxDim = Math.max(size.x, size.y, size.z);
                        const targetSize = 0.3;
                        const scale = targetSize / maxDim;
                        
                        this.weapon.scale.set(scale, scale, scale);
                        console.log('Applied scale:', scale);
                        
                        // Keep original materials, just adjust properties
                        let meshCount = 0;
                        this.weapon.traverse((child) => {
                            if (child.isMesh) {
                                meshCount++;
                                // Keep existing material but ensure it's visible
                                if (child.material) {
                                    child.material.fog = false;
                                    child.material.side = THREE.DoubleSide;
                                }
                                child.frustumCulled = false;
                                child.renderOrder = 999;
                                
                                // Log mesh info
                                const box = new THREE.Box3().setFromObject(child);
                                const size = box.getSize(new THREE.Vector3());
                                console.log(`Mesh ${meshCount} size:`, size);
                            }
                        });
                        console.log(`Total meshes found: ${meshCount}`);
                        
                        this.weaponGroup.add(this.weapon);
                        this.scene.add(this.weaponGroup);
                        
                        this.updateWeaponPosition();
                        console.log('Revolver loaded successfully');
                    },
                    (progress) => {
                        console.log('Loading revolver: ' + (progress.loaded / progress.total * 100) + '%');
                    },
                    (error) => {
                        console.error('Error loading revolver OBJ:', error);
                    }
                );
            },
            (progress) => {
                console.log('Loading materials...');
            },
            (error) => {
                console.error('Error loading MTL:', error);
                // Try loading OBJ without materials
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
                
                // Scale down the model
                this.weapon.scale.set(0.001, 0.001, 0.001);
                
                // Create default material if no materials loaded
                this.weapon.traverse((child) => {
                    if (child.isMesh) {
                        // Use a metallic gray for revolver if no materials
                        child.material = new THREE.MeshBasicMaterial({
                            color: 0x444444,  // Dark gray metal
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
        
        // Apply rotations
        this.weaponGroup.quaternion.copy(this.camera.quaternion);
        this.weaponGroup.rotateY(this.initialRotationOffset.y);
        this.weaponGroup.rotateX(this.initialRotationOffset.x);
        this.weaponGroup.rotateZ(this.initialRotationOffset.z);
    }
    
    update(deltaTime) {
        this.updateWeaponPosition();
        
        // Add idle sway
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
        
        // Recoil animation
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
        // Get the world position of the revolver's barrel tip
        const muzzlePos = this.weaponGroup.position.clone();
        
        // Apply the muzzle offset in the weapon's local space
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