import * as THREE from 'three';

export class WeaponSystem {
    constructor(camera, scene) {
        this.camera = camera;
        this.scene = scene;
        this.weapon = null;
        this.weaponGroup = new THREE.Group();
        this.initialPositionOffset = new THREE.Vector3(0.4, -0.35, -0.6);
        this.initialRotationOffset = new THREE.Euler(0, -0.4, 0.1);

        this.createWeapon();
    }

    createWeapon() {
        // Create weapon group that will be attached to camera
        this.weaponGroup = new THREE.Group();

        // Main weapon material with gradient effect
        const weaponMaterial = new THREE.MeshBasicMaterial({
            color: 0xff6600,  // Orange/rust color for RSGO theme
            fog: false
        });

        // Darker material for details
        const darkMaterial = new THREE.MeshBasicMaterial({
            color: 0xcc4400,  // Darker orange
            fog: false
        });

        // Black material for grip and details
        const blackMaterial = new THREE.MeshBasicMaterial({
            color: 0x222222,
            fog: false
        });

        // Metallic material for barrel
        const metalMaterial = new THREE.MeshBasicMaterial({
            color: 0x888888,
            fog: false
        });

        // BARREL with muzzle detail
        const barrelGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8);
        const barrel = new THREE.Mesh(barrelGeometry, metalMaterial);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0, -0.2);

        // Muzzle (barrel opening)
        const muzzleGeometry = new THREE.CylinderGeometry(0.045, 0.04, 0.02, 8);
        const muzzle = new THREE.Mesh(muzzleGeometry, blackMaterial);
        muzzle.rotation.x = Math.PI / 2;
        muzzle.position.set(0, 0, -0.39);

        // GRIP with texture lines
        const gripGeometry = new THREE.BoxGeometry(0.07, 0.22, 0.15);
        const grip = new THREE.Mesh(gripGeometry, blackMaterial);
        grip.position.set(0, -0.09, 0);
        grip.rotation.z = -0.15;

        // Grip texture lines
        for(let i = 0; i < 3; i++) {
            const lineGeometry = new THREE.BoxGeometry(0.071, 0.005, 0.12);
            const line = new THREE.Mesh(lineGeometry, darkMaterial);
            line.position.set(0, -0.06 - (i * 0.03), 0);
            line.rotation.z = -0.15;
            this.weaponGroup.add(line);
        }

        // SLIDE with serrations
        const slideGeometry = new THREE.BoxGeometry(0.11, 0.13, 0.38);
        const slide = new THREE.Mesh(slideGeometry, weaponMaterial);
        slide.position.set(0, 0.04, -0.175);

        // Slide serrations (grip lines on back)
        for(let i = 0; i < 4; i++) {
            const serrationGeometry = new THREE.BoxGeometry(0.112, 0.01, 0.003);
            const serration = new THREE.Mesh(serrationGeometry, darkMaterial);
            serration.position.set(0, 0.06 - (i * 0.015), -0.01 - (i * 0.01));
            this.weaponGroup.add(serration);
        }

        // Ejection port (detail on slide)
        const portGeometry = new THREE.BoxGeometry(0.05, 0.08, 0.08);
        const port = new THREE.Mesh(portGeometry, blackMaterial);
        port.position.set(0.04, 0.06, -0.1);

        // TRIGGER ASSEMBLY
        const guardGeometry = new THREE.TorusGeometry(0.045, 0.012, 4, 8, Math.PI);
        const triggerGuard = new THREE.Mesh(guardGeometry, weaponMaterial);
        triggerGuard.position.set(0, -0.025, 0.05);
        triggerGuard.rotation.z = Math.PI / 2;

        const triggerGeometry = new THREE.BoxGeometry(0.02, 0.045, 0.025);
        const trigger = new THREE.Mesh(triggerGeometry, blackMaterial);
        trigger.position.set(0, -0.01, 0.05);
        trigger.rotation.z = 0.1;

        // SIGHTS
        // Front sight with dot
        const frontSightGeometry = new THREE.BoxGeometry(0.025, 0.04, 0.015);
        const frontSight = new THREE.Mesh(frontSightGeometry, blackMaterial);
        frontSight.position.set(0, 0.09, -0.36);

        // Front sight dot (glowing)
        const dotMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,  // Green glow
            fog: false
        });
        const dotGeometry = new THREE.SphereGeometry(0.008, 4, 4);
        const sightDot = new THREE.Mesh(dotGeometry, dotMaterial);
        sightDot.position.set(0, 0.095, -0.36);

        // Rear sight with notch
        const rearSightGeometry = new THREE.BoxGeometry(0.07, 0.035, 0.015);
        const rearSight = new THREE.Mesh(rearSightGeometry, blackMaterial);
        rearSight.position.set(0, 0.09, -0.02);

        // Rear sight notch
        const notchGeometry = new THREE.BoxGeometry(0.03, 0.02, 0.02);
        const notch = new THREE.Mesh(notchGeometry, weaponMaterial);
        notch.position.set(0, 0.09, -0.02);

        // DETAILS
        // Magazine base
        const magBaseGeometry = new THREE.BoxGeometry(0.065, 0.02, 0.14);
        const magBase = new THREE.Mesh(magBaseGeometry, blackMaterial);
        magBase.position.set(0, -0.19, 0);
        magBase.rotation.z = -0.15;

        // Safety switch
        const safetyGeometry = new THREE.CylinderGeometry(0.01, 0.01, 0.02, 6);
        const safety = new THREE.Mesh(safetyGeometry, darkMaterial);
        safety.rotation.z = Math.PI / 2;
        safety.position.set(0.055, 0.02, 0.05);

        // Hammer
        const hammerGeometry = new THREE.BoxGeometry(0.03, 0.04, 0.02);
        const hammer = new THREE.Mesh(hammerGeometry, metalMaterial);
        hammer.position.set(0, 0.06, 0.08);
        hammer.rotation.x = -0.3;

        // Add all parts to weapon group
        this.weaponGroup.add(barrel);
        this.weaponGroup.add(muzzle);
        this.weaponGroup.add(grip);
        this.weaponGroup.add(slide);
        this.weaponGroup.add(port);
        this.weaponGroup.add(triggerGuard);
        this.weaponGroup.add(trigger);
        this.weaponGroup.add(frontSight);
        this.weaponGroup.add(sightDot);
        this.weaponGroup.add(rearSight);
        this.weaponGroup.add(notch);
        this.weaponGroup.add(magBase);
        this.weaponGroup.add(safety);
        this.weaponGroup.add(hammer);

        // Add weapon group to the scene instead of camera
        this.scene.add(this.weaponGroup);

        // Set initial position
        this.updateWeaponPosition();

        // Make sure weapon renders on top of other objects
        this.weaponGroup.traverse((child) => {
            if (child.isMesh) {
                // Don't use separate layer - keep on default layer 0
                child.renderOrder = 999;
                child.material.depthTest = true;  // Use normal depth testing
                child.frustumCulled = false;  // Always render even if "out of view"
            }
        });

        console.log('Weapon created and added to scene');
    }

    // Add shooting animation
    animateShoot() {
        if (!this.weaponGroup) return;

        // Simple recoil animation
        const originalZ = this.weaponGroup.position.z;
        const originalRotX = this.weaponGroup.rotation.x;

        // Recoil back
        this.weaponGroup.position.z = originalZ + 0.05;
        this.weaponGroup.rotation.x = originalRotX - 0.15;

        // Return to original position
        setTimeout(() => {
            this.weaponGroup.position.z = originalZ;
            this.weaponGroup.rotation.x = originalRotX;
        }, 100);
    }

    update(deltaTime) {
        // Update weapon position to follow camera
        this.updateWeaponPosition();

        // Add idle weapon sway
        if (this.weaponGroup) {
            const time = Date.now() * 0.001;
            const swayX = Math.sin(time * 1.5) * 0.005;
            const swayY = Math.sin(time * 2) * 0.003;

            // Apply sway on top of the base position
            const offset = this.initialPositionOffset.clone();
            offset.x += swayX;
            offset.y += swayY;

            // Update position relative to camera
            const weaponPos = new THREE.Vector3();
            weaponPos.copy(this.camera.position);
            weaponPos.add(offset.applyQuaternion(this.camera.quaternion));
            this.weaponGroup.position.copy(weaponPos);
        }
    }

    updateWeaponPosition() {
        if (!this.weaponGroup) return;

        // Position weapon relative to camera
        const weaponPos = new THREE.Vector3();
        weaponPos.copy(this.camera.position);

        // Apply offset in camera's local space
        const offset = this.initialPositionOffset.clone();
        offset.applyQuaternion(this.camera.quaternion);
        weaponPos.add(offset);

        this.weaponGroup.position.copy(weaponPos);

        // Match camera rotation with slight offset
        this.weaponGroup.quaternion.copy(this.camera.quaternion);
        this.weaponGroup.rotateY(this.initialRotationOffset.y);
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
