export class InputManager {
    constructor() {
        this.controls = {
            forward: false,
            backward: false,
            left: false,
            right: false
        };
        this.moveSpeed = 30;
        this.lookSpeed = 0.002;
        this.isPointerLocked = false;
        this.camera = null;
        this.collisionSystem = null;
        
        // FPS camera rotation values
        this.yaw = 0; // left/right rotation
        this.pitch = 0; // up/down rotation
        
        this.onShootCallback = null;
        this.onMoveCallback = null;
    }
    
    setCollisionSystem(collisionSystem) {
        this.collisionSystem = collisionSystem;
    }

    setupControls(camera) {
        this.camera = camera;
        this.setupKeyboard();
        this.setupMouse();
        this.setupPointerLock();
    }

    setupKeyboard() {
        document.addEventListener('keydown', (event) => {
            switch(event.code) {
                case 'KeyW':
                    this.controls.forward = true;
                    break;
                case 'KeyS':
                    this.controls.backward = true;
                    break;
                case 'KeyA':
                    this.controls.left = true;
                    break;
                case 'KeyD':
                    this.controls.right = true;
                    break;
                case 'Escape':
                    document.exitPointerLock();
                    break;
            }
        });

        document.addEventListener('keyup', (event) => {
            switch(event.code) {
                case 'KeyW':
                    this.controls.forward = false;
                    break;
                case 'KeyS':
                    this.controls.backward = false;
                    break;
                case 'KeyA':
                    this.controls.left = false;
                    break;
                case 'KeyD':
                    this.controls.right = false;
                    break;
            }
        });
    }

    setupMouse() {
        document.addEventListener('mousemove', (event) => {
            if (this.isPointerLocked && this.camera) {
                const movementX = event.movementX || 0;
                const movementY = event.movementY || 0;

                // Update yaw (left/right) and pitch (up/down)
                this.yaw -= movementX * this.lookSpeed;
                this.pitch -= movementY * this.lookSpeed;
                
                // Clamp pitch to prevent flipping
                this.pitch = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, this.pitch));
                
                // Apply rotation using quaternions to prevent gimbal lock
                const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
                const pitchQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch);
                
                // Combine rotations: yaw first, then pitch
                this.camera.quaternion.copy(yawQuaternion).multiply(pitchQuaternion);
            }
        });

        document.addEventListener('click', () => {
            if (this.isPointerLocked) {
                if (this.onShootCallback) {
                    this.onShootCallback();
                }
            } else {
                const canvas = document.querySelector('#gameContainer canvas');
                if (canvas) {
                    canvas.requestPointerLock();
                }
            }
        });

        window.addEventListener('resize', () => {
            if (this.camera) {
                this.camera.aspect = window.innerWidth / window.innerHeight;
                this.camera.updateProjectionMatrix();
            }
        });
    }

    setupPointerLock() {
        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = document.pointerLockElement !== null;
        });
    }

    updateMovement(deltaTime, camera) {
        if (!camera || !this.isPointerLocked) return;
        
        // Simplified movement - direct control
        const moveVector = new THREE.Vector3();
        
        // Get camera direction vectors
        const forward = new THREE.Vector3();
        camera.getCamera().getWorldDirection(forward);
        forward.y = 0; // Keep movement on ground plane
        forward.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
        right.normalize();

        // Apply WASD movement
        if (this.controls.forward) {
            moveVector.addScaledVector(forward, this.moveSpeed * deltaTime);
        }
        if (this.controls.backward) {
            moveVector.addScaledVector(forward, -this.moveSpeed * deltaTime);
        }
        if (this.controls.right) {
            moveVector.addScaledVector(right, this.moveSpeed * deltaTime);
        }
        if (this.controls.left) {
            moveVector.addScaledVector(right, -this.moveSpeed * deltaTime);
        }

        // Check collision and get valid position
        const currentPos = camera.getPosition();
        const desiredPos = currentPos.clone().add(moveVector);
        
        let finalPos;
        if (this.collisionSystem) {
            finalPos = this.collisionSystem.getValidPosition(currentPos, desiredPos);
        } else {
            // Boundary check (keep player inside the bigger arena)
            if (Math.abs(desiredPos.x) < 195 && Math.abs(desiredPos.z) < 195) {
                finalPos = desiredPos;
            } else {
                finalPos = currentPos;
            }
        }
        
        // Apply the movement
        camera.getCamera().position.copy(finalPos);
        
        // Only send position update if we actually moved
        const actualMovement = finalPos.clone().sub(currentPos);
        if (actualMovement.length() > 0.01 && this.onMoveCallback) {
            this.onMoveCallback(
                camera.getPosition(),
                camera.getRotation()
            );
        }
    }

    onShoot(callback) {
        this.onShootCallback = callback;
    }

    onMove(callback) {
        this.onMoveCallback = callback;
    }
}