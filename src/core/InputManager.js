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
            console.log('Pointer lock changed:', this.isPointerLocked ? 'LOCKED' : 'UNLOCKED');
            if (this.isPointerLocked) {
                console.log('You can now move with WASD!');
            } else {
                console.log('Click on game to enable movement');
            }
        });
    }

    updateMovement(deltaTime, camera) {
        if (!camera) {
            return;
        }
        if (!this.isPointerLocked) {
            return;
        }

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
        let isMoving = false;
        if (this.controls.forward) {
            moveVector.addScaledVector(forward, this.moveSpeed * deltaTime);
            isMoving = true;
        }
        if (this.controls.backward) {
            moveVector.addScaledVector(forward, -this.moveSpeed * deltaTime);
            isMoving = true;
        }
        if (this.controls.right) {
            moveVector.addScaledVector(right, this.moveSpeed * deltaTime);
            isMoving = true;
        }
        if (this.controls.left) {
            moveVector.addScaledVector(right, -this.moveSpeed * deltaTime);
            isMoving = true;
        }

        // Check collision and get valid position
        const currentPos = camera.getPosition().clone(); // CLONE the current position!
        const desiredPos = currentPos.clone().add(moveVector);

        // Apply collision detection if system is available
        const finalPos = this.collisionSystem ?
            this.collisionSystem.getValidPosition(currentPos, desiredPos, 1.5) :
            desiredPos;

        // Calculate movement BEFORE updating camera
        const actualMovement = finalPos.clone().sub(currentPos);

        // Apply the movement
        camera.getCamera().position.copy(finalPos);

        // Only send position update if we actually moved
        if (actualMovement.length() > 0.01) {
            if (this.onMoveCallback) {
                this.onMoveCallback(
                    camera.getPosition(),
                    camera.getRotation()
                );
            }
        }
    }

    onShoot(callback) {
        this.onShootCallback = callback;
    }

    onMove(callback) {
        this.onMoveCallback = callback;
    }
}
