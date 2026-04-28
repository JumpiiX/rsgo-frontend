export class InputManager {
    constructor() {
        this.controls = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false
        };
        this.moveSpeed = 30;
        this.lookSpeed = 0.002;
        this.isPointerLocked = false;
        this.camera = null;
        this.collisionSystem = null;

        
        this.yaw = 0; 
        this.pitch = 0; 

        this.onShootCallback = null;
        this.onMoveCallback = null;
        this.onScoreboardCallback = null;
        this.onReloadCallback = null;
        this.onBuildModeCallback = null;
        this.onBombToggleCallback = null;
        this.onBombPlantStartCallback = null;
        this.onBombPlantStopCallback = null;
        
        // Physics state for Y movement and jumping
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.onGround = false;
        this.gravity = -50;
        this.jumpSpeed = 20;
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
            case 'Tab':
                event.preventDefault();
                if (this.onScoreboardCallback) {
                    this.onScoreboardCallback(true);
                }
                break;
            case 'KeyR':
                if (this.onReloadCallback) {
                    this.onReloadCallback();
                }
                break;
            case 'KeyB':
                if (this.onBuildModeCallback) {
                    this.onBuildModeCallback();
                }
                break;
            case 'KeyT':
                if (this.onBombToggleCallback) {
                    this.onBombToggleCallback();
                }
                break;
            case 'KeyG':
                if (this.onBombDropCallback) {
                    this.onBombDropCallback();
                }
                break;
            case 'KeyE':
                if (this.onBombPickupCallback) {
                    this.onBombPickupCallback();
                }
                break;
            case 'Space':
                event.preventDefault();
                this.controls.jump = true;
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
            case 'Tab':
                event.preventDefault();
                if (this.onScoreboardCallback) {
                    this.onScoreboardCallback(false);
                }
                break;
            case 'Space':
                event.preventDefault();
                this.controls.jump = false;
                break;
            }
        });
    }

    setupMouse() {
        document.addEventListener('mousemove', (event) => {
            if (this.isPointerLocked && this.camera) {
                const movementX = event.movementX || 0;
                const movementY = event.movementY || 0;

                
                this.yaw -= movementX * this.lookSpeed;
                this.pitch -= movementY * this.lookSpeed;

                
                this.pitch = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, this.pitch));

                
                const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
                const pitchQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch);

                
                this.camera.quaternion.copy(yawQuaternion).multiply(pitchQuaternion);
            }
        });

        // Handle mousedown for shooting or bomb planting
        document.addEventListener('mousedown', (event) => {
            if (event.button !== 0) return; // Only left click
            
            // DON'T do anything if we're in build mode
            if (window.game && window.game.isBuildMode) {
                return;
            }
            
            if (this.isPointerLocked) {
                // Check if bomb is equipped for planting
                if (window.game && window.game.bombSystem && window.game.bombSystem.isEquipped) {
                    if (this.onBombPlantStartCallback) {
                        this.onBombPlantStartCallback();
                    }
                } else {
                    // Normal shooting
                    if (this.onShootCallback) {
                        this.onShootCallback();
                    }
                }
            } else {
                const canvas = document.querySelector('#gameContainer canvas');
                if (canvas) {
                    canvas.requestPointerLock();
                }
            }
        });
        
        // Handle mouseup to stop bomb planting
        document.addEventListener('mouseup', (event) => {
            if (event.button !== 0) return; // Only left click
            
            if (this.isPointerLocked && this.onBombPlantStopCallback) {
                this.onBombPlantStopCallback();
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
        
        // Block movement during build phase in team mode
        if (window.game && window.game.gameMode === 'team' && window.game.isInBuildPhase) {
            return; // No movement during build phase
        }

        const currentPos = camera.getPosition().clone();
        
        // Handle horizontal movement (WASD) - keep it simple for now
        const moveVector = new THREE.Vector3();
        
        const forward = new THREE.Vector3();
        camera.getCamera().getWorldDirection(forward);
        forward.y = 0; // Keep horizontal movement flat
        forward.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
        right.normalize();

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

        // Handle jumping
        if (this.controls.jump && this.onGround) {
            this.velocity.y = this.jumpSpeed;
            this.onGround = false;
        }
        
        // Apply gravity
        this.velocity.y += this.gravity * deltaTime;
        
        // Calculate new position with jumping/gravity
        const desiredPos = currentPos.clone().add(moveVector);
        desiredPos.y += this.velocity.y * deltaTime;
        
        // Simple ground collision (keep above ground level)
        const groundLevel = 10;
        if (desiredPos.y <= groundLevel) {
            desiredPos.y = groundLevel;
            this.velocity.y = 0;
            this.onGround = true;
        }
        
        // CHECK COLLISION before updating position!
        const validPos = this.findValidPosition(currentPos, desiredPos);
        
        // Update position to the valid (collision-checked) position
        camera.getCamera().position.copy(validPos);

        // Send movement update if position changed
        const actualMovement = desiredPos.clone().sub(currentPos);
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

    onScoreboard(callback) {
        this.onScoreboardCallback = callback;
    }

    onReload(callback) {
        this.onReloadCallback = callback;
    }

    onBuildMode(callback) {
        this.onBuildModeCallback = callback;
    }
    
    onBombToggle(callback) {
        this.onBombToggleCallback = callback;
    }
    
    onBombDrop(callback) {
        this.onBombDropCallback = callback;
    }
    
    onBombPickup(callback) {
        this.onBombPickupCallback = callback;
    }
    
    onBombPlantStart(callback) {
        this.onBombPlantStartCallback = callback;
    }
    
    onBombPlantStop(callback) {
        this.onBombPlantStopCallback = callback;
    }
    
    findValidPosition(currentPos, desiredPos) {
        if (!this.collisionSystem) {
            return desiredPos;
        }
        
        // Check if the desired position has any collisions
        if (!this.collisionSystem.checkCollision(desiredPos, 1.5)) {
            return desiredPos;
        }
        
        // Try horizontal movement only (sliding along walls)
        const horizontalOnly = currentPos.clone();
        horizontalOnly.x = desiredPos.x;
        horizontalOnly.z = desiredPos.z;
        
        if (!this.collisionSystem.checkCollision(horizontalOnly, 1.5)) {
            // We can move horizontally, but check Y separately
            const finalPos = horizontalOnly.clone();
            finalPos.y = this.findValidYPosition(horizontalOnly, desiredPos.y);
            return finalPos;
        }
        
        // Try X movement only
        const xOnly = currentPos.clone();
        xOnly.x = desiredPos.x;
        if (!this.collisionSystem.checkCollision(xOnly, 1.5)) {
            const finalPos = xOnly.clone();
            finalPos.y = this.findValidYPosition(xOnly, desiredPos.y);
            return finalPos;
        }
        
        // Try Z movement only
        const zOnly = currentPos.clone();
        zOnly.z = desiredPos.z;
        if (!this.collisionSystem.checkCollision(zOnly, 1.5)) {
            const finalPos = zOnly.clone();
            finalPos.y = this.findValidYPosition(zOnly, desiredPos.y);
            return finalPos;
        }
        
        // Can't move horizontally, just try Y movement
        const finalPos = currentPos.clone();
        finalPos.y = this.findValidYPosition(currentPos, desiredPos.y);
        return finalPos;
    }
    
    findValidYPosition(basePos, desiredY) {
        if (!this.collisionSystem) {
            return desiredY;
        }
        
        const testPos = basePos.clone();
        testPos.y = desiredY;
        
        // Check if we can move to the desired Y position
        if (!this.collisionSystem.checkCollision(testPos, 1.5)) {
            return desiredY;
        }
        
        // We hit something - find the highest valid Y position
        const groundY = this.findGroundLevel(basePos);
        
        // Stop downward velocity if we hit ground
        if (desiredY <= groundY && this.velocity.y < 0) {
            this.velocity.y = 0;
            this.onGround = true;
        }
        
        return Math.max(groundY, basePos.y);
    }
    
    findGroundLevel(position) {
        if (!this.collisionSystem) {
            return 10; // Default ground level - same as spawn points
        }
        
        let highestGround = -50; // Start very low
        
        // Check for ground colliders at this X,Z position
        for (const bounds of this.collisionSystem.boxColliders) {
            if (position.x >= bounds.minX && position.x <= bounds.maxX &&
                position.z >= bounds.minZ && position.z <= bounds.maxZ) {
                // Find the highest surface we can stand on
                const surfaceY = bounds.maxY + 1; // Player height above surface
                if (surfaceY > highestGround) {
                    highestGround = surfaceY;
                }
            }
        }
        
        // If no ground found, use default spawn height
        return highestGround > -50 ? highestGround : 10;
    }
    
    checkGroundCollision(position) {
        const groundLevel = this.findGroundLevel(position);
        const tolerance = 1; // Small tolerance for ground detection
        
        if (Math.abs(position.y - groundLevel) <= tolerance && this.velocity.y <= 0) {
            this.onGround = true;
            this.velocity.y = 0;
        } else {
            this.onGround = false;
        }
    }
}
