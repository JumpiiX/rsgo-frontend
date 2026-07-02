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

                if (!this._eKeyDown) {
                    this._eKeyDown = true;
                    if (this.onBombPickupCallback) {
                        this.onBombPickupCallback();
                    }
                    if (this.onDefuseStartCallback) {
                        this.onDefuseStartCallback();
                    }
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
            case 'KeyE':
                this._eKeyDown = false;
                if (this.onDefuseStopCallback) {
                    this.onDefuseStopCallback();
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

        document.addEventListener('mousedown', (event) => {
            if (event.button !== 0) return;

            if (window.game && window.game.isBuildMode) {
                return;
            }

            if (this.isPointerLocked) {

                if (window.game && window.game.bombSystem && window.game.bombSystem.isEquipped) {
                    if (this.onBombPlantStartCallback) {
                        this.onBombPlantStartCallback();
                    }
                } else {

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

        document.addEventListener('mouseup', (event) => {
            if (event.button !== 0) return;

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

        if (window.game && window.game.gameMode === 'team' && window.game.isInBuildPhase) {
            return;
        }

        const currentPos = camera.getPosition().clone();

        const moveVector = new THREE.Vector3();

        const forward = new THREE.Vector3();
        camera.getCamera().getWorldDirection(forward);
        forward.y = 0;
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

        if (this.controls.jump && this.onGround) {
            this.velocity.y = this.jumpSpeed;
            this.onGround = false;
        }

        this.velocity.y += this.gravity * deltaTime;

        const desiredPos = currentPos.clone().add(moveVector);
        desiredPos.y += this.velocity.y * deltaTime;

        const groundLevel = 10;
        if (desiredPos.y <= groundLevel) {
            desiredPos.y = groundLevel;
            this.velocity.y = 0;
            this.onGround = true;
        }

        const validPos = this.findValidPosition(currentPos, desiredPos);

        camera.getCamera().position.copy(validPos);

        const actualMovement = desiredPos.clone().sub(currentPos);
        const lastYaw = this._lastSentYaw || 0;
        const lastPitch = this._lastSentPitch || 0;
        const rotationDelta = Math.abs(this.yaw - lastYaw) + Math.abs(this.pitch - lastPitch);
        const positionChanged = actualMovement.length() > 0.01;
        const rotationChanged = rotationDelta > 0.01;
        const now = performance.now();
        const lastSent = this._lastSendTime || 0;
        const rotationTimeOK = now - lastSent > 50;

        if (positionChanged || (rotationChanged && rotationTimeOK)) {
            if (this.onMoveCallback) {
                this.onMoveCallback(
                    camera.getPosition(),
                    camera.getRotation()
                );
                this._lastSentYaw = this.yaw;
                this._lastSentPitch = this.pitch;
                this._lastSendTime = now;
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

    onDefuseStart(callback) {
        this.onDefuseStartCallback = callback;
    }

    onDefuseStop(callback) {
        this.onDefuseStopCallback = callback;
    }

    findValidPosition(currentPos, desiredPos) {
        if (!this.collisionSystem) {
            return desiredPos;
        }

        if (!this.collisionSystem.checkCollision(desiredPos, 1.5)) {
            return desiredPos;
        }

        const horizontalOnly = currentPos.clone();
        horizontalOnly.x = desiredPos.x;
        horizontalOnly.z = desiredPos.z;

        if (!this.collisionSystem.checkCollision(horizontalOnly, 1.5)) {

            const finalPos = horizontalOnly.clone();
            finalPos.y = this.findValidYPosition(horizontalOnly, desiredPos.y);
            return finalPos;
        }

        const xOnly = currentPos.clone();
        xOnly.x = desiredPos.x;
        if (!this.collisionSystem.checkCollision(xOnly, 1.5)) {
            const finalPos = xOnly.clone();
            finalPos.y = this.findValidYPosition(xOnly, desiredPos.y);
            return finalPos;
        }

        const zOnly = currentPos.clone();
        zOnly.z = desiredPos.z;
        if (!this.collisionSystem.checkCollision(zOnly, 1.5)) {
            const finalPos = zOnly.clone();
            finalPos.y = this.findValidYPosition(zOnly, desiredPos.y);
            return finalPos;
        }

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

        if (!this.collisionSystem.checkCollision(testPos, 1.5)) {
            return desiredY;
        }

        const groundY = this.findGroundLevel(basePos);

        if (desiredY <= groundY && this.velocity.y < 0) {
            this.velocity.y = 0;
            this.onGround = true;
        }

        return Math.max(groundY, basePos.y);
    }

    findGroundLevel(position) {
        if (!this.collisionSystem) {
            return 10;
        }

        let highestGround = -50;

        for (const bounds of this.collisionSystem.boxColliders) {
            if (position.x >= bounds.minX && position.x <= bounds.maxX &&
                position.z >= bounds.minZ && position.z <= bounds.maxZ) {

                const surfaceY = bounds.maxY + 1;
                if (surfaceY > highestGround) {
                    highestGround = surfaceY;
                }
            }
        }

        return highestGround > -50 ? highestGround : 10;
    }

    checkGroundCollision(position) {
        const groundLevel = this.findGroundLevel(position);
        const tolerance = 1;

        if (Math.abs(position.y - groundLevel) <= tolerance && this.velocity.y <= 0) {
            this.onGround = true;
            this.velocity.y = 0;
        } else {
            this.onGround = false;
        }
    }
}
