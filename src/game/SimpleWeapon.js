import * as THREE from 'three';

export class SimpleWeapon {
    constructor(camera, scene) {
        this.camera = camera;
        this.scene = scene;
        this.weaponGroup = new THREE.Group();
        
        this.initialPositionOffset = new THREE.Vector3(0.25, -0.2, -0.4);
        this.initialRotationOffset = new THREE.Euler(-0.1, -0.3, 0.05);

        this.createSimplePistol();
    }

    createSimplePistol() {
        this.weaponGroup = new THREE.Group();

        
        const orangeMaterial = new THREE.MeshBasicMaterial({
            color: 0xff6600,
            fog: false
        });

        
        const darkMaterial = new THREE.MeshBasicMaterial({
            color: 0x333333,
            fog: false
        });

        
        
        const slideGeometry = new THREE.BoxGeometry(0.04, 0.08, 0.25);
        const slide = new THREE.Mesh(slideGeometry, orangeMaterial);
        slide.position.set(0, 0, 0);

        
        const gripGeometry = new THREE.BoxGeometry(0.03, 0.12, 0.08);
        const grip = new THREE.Mesh(gripGeometry, darkMaterial);
        grip.position.set(0, -0.05, 0.06);
        grip.rotation.z = -0.2;

        
        const barrelGeometry = new THREE.CylinderGeometry(0.015, 0.015, 0.12, 6);
        const barrel = new THREE.Mesh(barrelGeometry, darkMaterial);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, -0.01, -0.16);

        
        const guardGeometry = new THREE.TorusGeometry(0.025, 0.005, 3, 6, Math.PI);
        const triggerGuard = new THREE.Mesh(guardGeometry, orangeMaterial);
        triggerGuard.position.set(0, -0.03, 0.03);
        triggerGuard.rotation.z = Math.PI / 2;

        
        const sightGeometry = new THREE.BoxGeometry(0.01, 0.02, 0.01);
        const sight = new THREE.Mesh(sightGeometry, darkMaterial);
        sight.position.set(0, 0.045, -0.1);

        
        this.weaponGroup.add(slide);
        this.weaponGroup.add(grip);
        this.weaponGroup.add(barrel);
        this.weaponGroup.add(triggerGuard);
        this.weaponGroup.add(sight);

        
        this.weaponGroup.scale.set(2, 2, 2);

        
        this.scene.add(this.weaponGroup);

        
        this.weaponGroup.traverse((child) => {
            if (child.isMesh) {
                child.renderOrder = 999;
                child.material.depthTest = true;
                child.frustumCulled = false;
            }
        });

        this.updateWeaponPosition();
        console.log('Simple weapon created');
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
