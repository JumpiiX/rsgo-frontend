import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class BombSystem {
    constructor(camera, scene) {
        this.camera = camera;
        this.scene = scene;
        this.bombModel = null;
        this.bombGroup = new THREE.Group(); // Group to hold the bomb
        this.isEquipped = false;
        this.hasBomb = false;
        this.isPlanting = false;
        this.plantProgress = 0;
        this.plantDuration = 3000; // 3 seconds to plant
        this.bombPlanted = false;
        
        // Dropped bomb tracking
        this.droppedBomb = null;
        this.droppedBombPosition = null;
        this.canPickupBomb = false;
        
        this.loader = new GLTFLoader();
        this.loadBombModel();
    }
    
    loadBombModel() {
        this.loader.load('/models/Bomb 3D Model.glb', (gltf) => {
            console.log('GLTF loaded, contents:', {
                scene: gltf.scene,
                animations: gltf.animations.length,
                cameras: gltf.cameras.length,
                asset: gltf.asset
            });
            
            this.bombModel = gltf.scene;
            
            // Check what's in the scene and fix materials
            let meshCount = 0;
            this.bombModel.traverse((child) => {
                if (child.isMesh) {
                    meshCount++;
                    console.log('Found mesh:', child.name, 'Geometry:', child.geometry, 'Material:', child.material);
                    
                    // Force material to be visible
                    if (child.material) {
                        child.material.transparent = false;
                        child.material.opacity = 1;
                        child.material.visible = true;
                        // Add emissive to make it glow slightly so we can see it
                        child.material.emissive = new THREE.Color(0x111111);
                        child.material.needsUpdate = true;
                    }
                    child.frustumCulled = false; // Disable frustum culling
                }
            });
            console.log('Total meshes found:', meshCount);
            
            // Scale and position the bomb for hand holding
            this.bombModel.scale.set(0.8, 0.8, 0.8); // Good size for hand
            this.bombModel.position.set(0, 0, 0); // Position will be set relative to camera
            this.bombModel.rotation.set(0, 0, 0);
            
            // Add bomb model to the group
            this.bombGroup.add(this.bombModel);
            
            // Add group to scene, not camera
            this.scene.add(this.bombGroup);
            
            // Make it invisible initially
            this.bombGroup.visible = false;
            
            console.log('Bomb model loaded and added to scene');
            console.log('BombGroup children:', this.bombGroup.children);
        }, 
        (progress) => {
            console.log('Loading bomb model:', (progress.loaded / progress.total * 100) + '%');
        },
        (error) => {
            console.error('Error loading bomb model:', error);
        });
    }
    
    giveBomb() {
        this.hasBomb = true;
        this.updateBombUI();
    }
    
    equipBomb() {
        if (!this.hasBomb) {
            console.log('Cannot equip - no bomb in inventory');
            return false;
        }
        
        if (!this.bombModel) {
            console.log('Cannot equip - bomb model not loaded yet');
            return false;
        }
        
        this.isEquipped = true;
        this.bombGroup.visible = true;
        
        // Update position to be in front of camera
        this.updateBombPosition();
        
        // Hide weapon if it exists
        if (window.gameInstance && window.gameInstance.weaponSystem) {
            window.gameInstance.weaponSystem.hide();
        }
        
        console.log('Bomb equipped successfully');
        return true;
    }
    
    unequipBomb() {
        if (!this.bombModel) return;
        
        this.isEquipped = false;
        this.bombGroup.visible = false;
        
        // Show weapon again
        if (window.gameInstance && window.gameInstance.weaponSystem) {
            window.gameInstance.weaponSystem.show();
        }
        
        console.log('Bomb unequipped');
    }
    
    toggleBomb() {
        if (!this.hasBomb) return false;
        
        if (this.isEquipped) {
            this.unequipBomb();
        } else {
            this.equipBomb();
        }
        
        return this.isEquipped;
    }
    
    startPlanting() {
        if (!this.hasBomb || !this.isEquipped || this.isPlanting || this.bombPlanted) return false;
        
        // Check if player is at bomb site
        const playerPos = this.camera.position;
        const distanceFromCenter = Math.sqrt(playerPos.x * playerPos.x + playerPos.z * playerPos.z);
        
        if (distanceFromCenter > 60) { // Bomb site radius is 60
            console.log('Not at bomb site!');
            this.showMessage('Move to bomb site to plant!');
            return false;
        }
        
        this.isPlanting = true;
        this.plantProgress = 0;
        this.plantDuration = 5000; // 5 seconds to plant
        this.showPlantingBar();
        
        console.log('Started planting bomb');
        return true;
    }
    
    updatePlanting(deltaTime) {
        if (!this.isPlanting) return;
        
        this.plantProgress += deltaTime * 1000; // Convert to milliseconds
        
        const progress = Math.min(this.plantProgress / this.plantDuration, 1);
        this.updatePlantingBar(progress);
        
        if (this.plantProgress >= this.plantDuration) {
            this.completePlanting();
        }
    }
    
    cancelPlanting() {
        if (!this.isPlanting) return;
        
        this.isPlanting = false;
        this.plantProgress = 0;
        this.hidePlantingBar();
        
        console.log('Planting cancelled');
    }
    
    completePlanting() {
        this.isPlanting = false;
        this.bombPlanted = true;
        this.hasBomb = false;
        this.unequipBomb();
        this.hidePlantingBar();
        
        // Notify server about bomb plant
        if (window.gameInstance && window.gameInstance.network) {
            window.gameInstance.network.sendPlantBomb();
        }
        
        // Place bomb model on ground
        this.placeBombOnGround();
        
        // Start bomb timer
        this.startBombTimer();
        
        // Update UI
        this.updateBombUI();
        
        // Notify server if multiplayer (commented out for now - not implemented)
        // if (window.gameInstance && window.gameInstance.network) {
        //     window.gameInstance.network.sendBombPlanted();
        // }
        
        console.log('Bomb planted!');
        this.showMessage('Bomb has been planted!');
    }
    
    placeBombOnGround() {
        if (!this.bombModel) return;
        
        // Get player's current position
        const playerPos = this.camera.position.clone();
        
        // Create a new group for the planted bomb
        this.plantedBombGroup = new THREE.Group();
        
        // Clone the bomb model for ground placement
        const plantedBomb = this.bombModel.clone();
        
        // Make sure all meshes in the clone are visible
        plantedBomb.traverse((child) => {
            if (child.isMesh) {
                child.visible = true;
                // Make it slightly emissive so it's visible
                if (child.material) {
                    child.material = child.material.clone();
                    child.material.emissive = new THREE.Color(0x220000);
                    child.material.emissiveIntensity = 0.2;
                }
            }
        });
        
        plantedBomb.scale.set(5.0, 5.0, 5.0); // Even bigger on ground
        plantedBomb.position.set(0, 0, 0); // Local position in group
        plantedBomb.rotation.set(0, Math.random() * Math.PI * 2, 0); // Random rotation
        
        this.plantedBombGroup.add(plantedBomb);
        // Place at player's X and Z position, but on the ground
        this.plantedBombGroup.position.set(playerPos.x, 1, playerPos.z);
        this.plantedBombGroup.visible = true;
        
        // Add to scene
        this.scene.add(this.plantedBombGroup);
        this.plantedBombModel = this.plantedBombGroup;
        
        console.log('Planted bomb at player position:', this.plantedBombGroup.position);
        
        // Add blinking red light effect at bomb position
        this.addBombLight(playerPos.x, playerPos.z);
    }
    
    addBombLight(x, z) {
        // Add red point light at bomb position
        const light = new THREE.PointLight(0xff0000, 3, 20);
        light.position.set(x, 3, z);
        this.scene.add(light);
        this.bombLight = light;
        
        // Add a glowing sphere as visual indicator above the bomb
        const sphereGeometry = new THREE.SphereGeometry(0.3, 8, 8);
        const sphereMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 1
        });
        this.blinkSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        this.blinkSphere.position.set(x, 4, z);
        this.scene.add(this.blinkSphere);
        
        // Blinking effect
        this.blinkInterval = setInterval(() => {
            this.bombLight.visible = !this.bombLight.visible;
            this.blinkSphere.visible = !this.blinkSphere.visible;
        }, 500);
    }
    
    startBombTimer() {
        this.bombTimer = 5; // 5 seconds for testing
        this.updateTimerDisplay();
        
        this.timerInterval = setInterval(() => {
            this.bombTimer--;
            this.updateTimerDisplay();
            
            if (this.bombTimer <= 0) {
                this.explodeBomb();
            }
            
            // Faster blinking as time runs out
            if (this.bombTimer <= 10 && this.blinkInterval) {
                clearInterval(this.blinkInterval);
                this.blinkInterval = setInterval(() => {
                    this.bombLight.visible = !this.bombLight.visible;
                }, 200);
            }
        }, 1000);
    }
    
    explodeBomb() {
        console.log('BOMB EXPLODED!');
        
        // Create implosion effect first
        this.createImplosionEffect();
        
        // After implosion animation, clean up and end round
        setTimeout(() => {
            this.showMessage('BOMB EXPLODED! Terrorists Win!');
            
            // Clean up
            this.cleanup();
            
            // Notify game of round end
            if (window.gameInstance) {
                window.gameInstance.endRound('terrorists');
            }
        }, 3000); // Wait for implosion to complete
    }
    
    createImplosionEffect() {
        if (!this.plantedBombModel) return;
        
        const bombPos = this.plantedBombModel.position.clone();
        
        // Create simple black explosion sphere - FULLY BLACK
        const explosionGeometry = new THREE.SphereGeometry(1, 8, 6); // Start small
        const explosionMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x000000,
            transparent: false,  // NOT transparent - fully solid black
            side: THREE.DoubleSide
        });
        const blackExplosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
        blackExplosion.position.copy(bombPos);
        blackExplosion.position.y = 1; // Start at ground level
        this.scene.add(blackExplosion);
        
        console.log('Black explosion created at:', bombPos);
        
        // Growing animation - map is 1000x600, so 80% would be around 400 radius
        let frame = 0;
        let currentRadius = 1;
        
        // Store interval ID for cleanup
        this.explosionInterval = setInterval(() => {
            frame++;
            
            // Continuously grow bigger to cover 80% of map
            currentRadius = Math.min(400, frame * 10); // Grow by 10 units per frame, max 400
            blackExplosion.scale.set(currentRadius, currentRadius, currentRadius);
            
            // Check if player is inside the explosion radius and kill them
            if (window.gameInstance && window.gameInstance.camera && window.gameInstance.isAlive) {
                const playerPos = window.gameInstance.camera.getPosition();
                const distance = Math.sqrt(
                    Math.pow(playerPos.x - bombPos.x, 2) + 
                    Math.pow(playerPos.z - bombPos.z, 2)
                );
                
                // If player is inside the explosion, kill them
                if (distance < currentRadius) {
                    window.gameInstance.killPlayer('Consumed by explosion');
                }
            }
            
            // Check all other players if multiplayer (commented out - not implemented yet)
            // if (window.gameInstance && window.gameInstance.playerManager) {
            //     window.gameInstance.playerManager.checkPlayersInExplosion(bombPos, currentRadius);
            // }
            
            // After reaching max size, hold for a moment then remove
            if (frame >= 50) { // 2.5 seconds total
                clearInterval(this.explosionInterval);
                
                // Final flash
                const flash = new THREE.PointLight(0xffffff, 1000, 2000);
                flash.position.copy(bombPos);
                this.scene.add(flash);
                
                // Remove explosion after a moment
                setTimeout(() => {
                    this.scene.remove(blackExplosion);
                    this.scene.remove(flash);
                }, 500);
            }
        }, 50); // 20 FPS for smooth growth
    }
    
    cleanup() {
        if (this.plantedBombModel) {
            this.scene.remove(this.plantedBombModel);
            this.plantedBombModel = null;
        }
        
        if (this.bombLight) {
            this.scene.remove(this.bombLight);
            this.bombLight = null;
        }
        
        if (this.blinkSphere) {
            this.scene.remove(this.blinkSphere);
            this.blinkSphere = null;
        }
        
        if (this.blinkInterval) {
            clearInterval(this.blinkInterval);
            this.blinkInterval = null;
        }
        
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // Clear explosion interval if it exists
        if (this.explosionInterval) {
            clearInterval(this.explosionInterval);
            this.explosionInterval = null;
        }
        
        this.bombPlanted = false;
        this.isPlanting = false;
        this.plantProgress = 0;
    }
    
    // UI Methods
    updateBombUI() {
        let bombIndicator = document.getElementById('bombIndicator');
        
        if (!bombIndicator) {
            // Create bomb indicator UI
            bombIndicator = document.createElement('div');
            bombIndicator.id = 'bombIndicator';
            bombIndicator.style.cssText = `
                position: fixed;
                bottom: 160px;
                right: 20px;
                width: 80px;
                height: 100px;
                background: rgba(0, 0, 0, 0.85);
                border: 1px solid rgba(255, 102, 0, 0.3);
                border-radius: 12px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                color: white;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                backdrop-filter: blur(10px);
                z-index: 100;
                transition: all 0.3s ease;
            `;
            document.body.appendChild(bombIndicator);
        }
        
        if (this.hasBomb) {
            bombIndicator.style.display = 'flex';
            
            // Modern bomb icon using SVG instead of emoji
            const isActive = this.isEquipped;
            const color = isActive ? '#4CAF50' : '#ff6600';
            const glowColor = isActive ? 'rgba(76, 175, 80, 0.4)' : 'rgba(255, 102, 0, 0.2)';
            
            bombIndicator.innerHTML = `
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style="margin-bottom: 4px;">
                    <!-- Bomb body -->
                    <circle cx="12" cy="14" r="7" fill="${color}" opacity="0.9"/>
                    <circle cx="12" cy="14" r="7" stroke="${color}" stroke-width="1.5" fill="none"/>
                    
                    <!-- Fuse -->
                    <rect x="11" y="5" width="2" height="4" fill="${color}"/>
                    
                    <!-- Spark -->
                    <g style="${isActive ? 'animation: pulse 1s infinite;' : ''}">
                        <circle cx="12" cy="4" r="2" fill="${isActive ? '#ffeb3b' : '#ff6600'}" opacity="${isActive ? '1' : '0.6'}"/>
                        <circle cx="12" cy="4" r="3" fill="${isActive ? '#ffeb3b' : '#ff6600'}" opacity="${isActive ? '0.4' : '0'}"/>
                    </g>
                    
                    <!-- Highlight on bomb -->
                    <ellipse cx="10" cy="12" rx="2" ry="3" fill="white" opacity="0.2"/>
                </svg>
                <div style="text-transform: uppercase; letter-spacing: 1px; opacity: 0.8; font-weight: 500; font-size: 11px; margin-bottom: 4px;">
                    ${isActive ? 'ARMED' : 'BOMB'}
                </div>
                <div style="
                    display: inline-block;
                    padding: 2px 6px;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 4px;
                    font-size: 10px;
                    font-weight: 600;
                    color: rgba(255, 255, 255, 0.8);
                    letter-spacing: 1px;
                ">T</div>
            `;
            
            if (this.isEquipped) {
                bombIndicator.style.borderColor = 'rgba(76, 175, 80, 0.5)';
                bombIndicator.style.boxShadow = `0 0 20px ${glowColor}`;
                bombIndicator.style.background = 'rgba(76, 175, 80, 0.1)';
            } else {
                bombIndicator.style.borderColor = 'rgba(255, 102, 0, 0.3)';
                bombIndicator.style.boxShadow = `0 0 10px ${glowColor}`;
                bombIndicator.style.background = 'rgba(0, 0, 0, 0.85)';
            }
        } else {
            bombIndicator.style.display = 'none';
        }
        
        // Add pulse animation if not already present
        if (!document.getElementById('bombPulseStyles')) {
            const style = document.createElement('style');
            style.id = 'bombPulseStyles';
            style.textContent = `
                @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.2); }
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    showPlantingBar() {
        let plantingBar = document.getElementById('plantingBar');
        
        if (!plantingBar) {
            plantingBar = document.createElement('div');
            plantingBar.id = 'plantingBar';
            plantingBar.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 280px;
                background: rgba(0, 0, 0, 0.85);
                border-radius: 12px;
                z-index: 200;
                padding: 20px;
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.1);
            `;
            plantingBar.innerHTML = `
                <div style="color: rgba(255, 255, 255, 0.8); text-align: center; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">Planting Bomb</div>
                <div style="width: 100%; height: 4px; background: rgba(255, 255, 255, 0.1); border-radius: 2px; overflow: hidden;">
                    <div id="plantingProgress" style="
                        width: 0%;
                        height: 100%;
                        background: #ff6600;
                        transition: width 0.1s;
                    "></div>
                </div>
            `;
            document.body.appendChild(plantingBar);
        }
        
        plantingBar.style.display = 'block';
    }
    
    updatePlantingBar(progress) {
        const progressBar = document.getElementById('plantingProgress');
        if (progressBar) {
            progressBar.style.width = `${progress * 100}%`;
        }
    }
    
    hidePlantingBar() {
        const plantingBar = document.getElementById('plantingBar');
        if (plantingBar) {
            plantingBar.style.display = 'none';
        }
    }
    
    updateTimerDisplay() {
        let timerDisplay = document.getElementById('bombTimer');
        
        if (!timerDisplay) {
            timerDisplay = document.createElement('div');
            timerDisplay.id = 'bombTimer';
            timerDisplay.style.cssText = `
                position: fixed;
                top: 120px;
                left: 20px;
                background: rgba(0, 0, 0, 0.85);
                padding: 16px 20px;
                border-radius: 12px;
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 0, 0, 0.3);
                z-index: 100;
            `;
            document.body.appendChild(timerDisplay);
        }
        
        if (this.bombPlanted) {
            timerDisplay.style.display = 'block';
            timerDisplay.innerHTML = `
                <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.6; margin-bottom: 4px; color: white;">Bomb Timer</div>
                <div style="font-size: 32px; font-weight: 300; color: ${this.bombTimer <= 10 ? '#ff4444' : '#ff6600'};">
                    0:${this.bombTimer.toString().padStart(2, '0')}
                </div>
            `;
        } else {
            timerDisplay.style.display = 'none';
        }
    }
    
    showMessage(text) {
        let message = document.getElementById('bombMessage');
        
        if (!message) {
            message = document.createElement('div');
            message.id = 'bombMessage';
            message.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                padding: 20px 30px;
                background: rgba(0, 0, 0, 0.85);
                border-radius: 12px;
                color: white;
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                font-size: 24px;
                font-weight: bold;
                z-index: 300;
                text-align: center;
            `;
            document.body.appendChild(message);
        }
        
        message.textContent = text;
        message.style.display = 'block';
        
        setTimeout(() => {
            message.style.display = 'none';
        }, 3000);
    }
    
    update(deltaTime) {
        if (this.isPlanting) {
            this.updatePlanting(deltaTime);
        }
        
        // Update bomb position to follow camera when equipped
        if (this.isEquipped && this.bombGroup) {
            this.updateBombPosition();
        }
        
        // Check if we should show planting instructions
        if (this.isEquipped && !this.bombPlanted) {
            const playerPos = this.camera.position;
            const distanceFromCenter = Math.sqrt(playerPos.x * playerPos.x + playerPos.z * playerPos.z);
            
            if (distanceFromCenter <= 60) {
                this.showPlantInstructions();
            } else {
                this.hidePlantInstructions();
            }
        } else {
            this.hidePlantInstructions();
        }
        
        // Check if we can pickup dropped bomb (throttled to avoid spam)
        if (this.droppedBomb && !this.hasBomb) {
            if (!this.lastPickupCheck || Date.now() - this.lastPickupCheck > 100) {
                this.checkCanPickup();
                this.lastPickupCheck = Date.now();
            }
        }
    }
    
    updateBombPosition() {
        if (!this.bombGroup || !this.camera) return;
        
        // Calculate position offset from camera
        const offset = new THREE.Vector3(0.3, -0.3, -0.5); // Right, down, forward
        
        // Apply camera rotation to offset
        offset.applyQuaternion(this.camera.quaternion);
        
        // Set bomb position
        const bombPos = new THREE.Vector3();
        bombPos.copy(this.camera.position);
        bombPos.add(offset);
        
        this.bombGroup.position.copy(bombPos);
        
        // Copy camera rotation for the bomb
        this.bombGroup.quaternion.copy(this.camera.quaternion);
        // Add some rotation to make bomb look better
        this.bombGroup.rotateY(Math.PI / 6); // Slight Y rotation
        this.bombGroup.rotateX(-Math.PI / 8); // Slight X rotation
    }
    
    showPlantInstructions() {
        let instructions = document.getElementById('bombPlantInstructions');
        
        if (!instructions) {
            instructions = document.createElement('div');
            instructions.id = 'bombPlantInstructions';
            instructions.style.cssText = `
                position: fixed;
                bottom: 50%;
                left: 50%;
                transform: translate(-50%, 0);
                padding: 15px 30px;
                background: rgba(0, 0, 0, 0.8);
                border: 2px solid #00ff00;
                border-radius: 8px;
                color: #00ff00;
                font-size: 18px;
                font-weight: bold;
                z-index: 100;
                text-align: center;
            `;
            instructions.innerHTML = 'Hold LEFT CLICK to plant the bomb';
            document.body.appendChild(instructions);
        }
        
        instructions.style.display = 'block';
    }
    
    hidePlantInstructions() {
        const instructions = document.getElementById('bombPlantInstructions');
        if (instructions) {
            instructions.style.display = 'none';
        }
    }
    
    // Called when bomb is dropped by any player
    onBombDropped(x, y, z, thrownX, thrownZ) {
        this.hasBomb = false;
        this.isEquipped = false;
        this.bombGroup.visible = false;
        this.updateBombUI();
        
        // Create dropped bomb model with throw animation
        if (thrownX !== undefined && thrownZ !== undefined) {
            this.showDroppedBomb(x, y, z, thrownX, thrownZ);
        } else {
            this.showDroppedBomb(x, y, z);
        }
        
        // Check if we can pick it up
        this.checkCanPickup();
    }
    
    // Show bomb on ground with throwing animation
    showDroppedBomb(x, y, z, thrownX, thrownZ) {
        if (this.droppedBomb) {
            this.scene.remove(this.droppedBomb);
        }
        
        this.droppedBomb = new THREE.Group();
        
        // Clone bomb model for ground
        if (this.bombModel) {
            const groundBomb = this.bombModel.clone();
            // Make it much bigger when dropped
            groundBomb.scale.set(4.0, 4.0, 4.0);
            groundBomb.position.set(0, 0, 0);
            
            // Make it visible
            groundBomb.traverse((child) => {
                if (child.isMesh) {
                    child.visible = true;
                    if (child.material) {
                        child.material = child.material.clone();
                        child.material.emissive = new THREE.Color(0x330000);
                        child.material.emissiveIntensity = 0.3;
                    }
                }
            });
            
            this.droppedBomb.add(groundBomb);
        }
        
        // Add glowing effect
        const light = new THREE.PointLight(0xff6600, 2, 15);
        light.position.set(0, 1, 0);
        this.droppedBomb.add(light);
        
        // Add a pulsing sphere for visibility
        const sphereGeometry = new THREE.SphereGeometry(0.5, 8, 8);
        const sphereMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff6600,
            transparent: true,
            opacity: 0.6
        });
        const glowSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        glowSphere.position.set(0, 2, 0);
        this.droppedBomb.add(glowSphere);
        
        // Start position (where player is)
        const startPos = new THREE.Vector3(x, y + 1, z);
        
        // End position - use thrown coordinates if provided, otherwise drop in place
        if (thrownX !== undefined && thrownZ !== undefined) {
            this.droppedBombPosition = new THREE.Vector3(thrownX, 1, thrownZ);
        } else {
            this.droppedBombPosition = new THREE.Vector3(x, 1, z);
        }
        
        this.scene.add(this.droppedBomb);
        
        // Animate throw or place immediately
        if (thrownX !== undefined && thrownZ !== undefined) {
            // Start at player position and animate to thrown position
            this.droppedBomb.position.copy(startPos);
            this.animateBombThrow(startPos, this.droppedBombPosition);
        } else {
            // No throw animation, just place at final position
            this.droppedBomb.position.copy(this.droppedBombPosition);
        }
        
        // Add pickup prompt if close
        this.createPickupPrompt();
    }
    
    // Animate bomb being thrown with arc motion
    animateBombThrow(startPos, endPos) {
        const duration = 600; // Animation duration in ms
        const startTime = Date.now();
        const maxHeight = Math.max(startPos.y, endPos.y) + 2; // Arc peak
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            if (progress < 1) {
                // Calculate arc position
                const x = startPos.x + (endPos.x - startPos.x) * progress;
                const z = startPos.z + (endPos.z - startPos.z) * progress;
                
                // Parabolic arc for Y position
                const arcProgress = 4 * progress * (1 - progress); // Parabola: peaks at 0.5
                const y = startPos.y + (maxHeight - startPos.y) * arcProgress + (endPos.y - startPos.y) * progress;
                
                this.droppedBomb.position.set(x, y, z);
                
                // Add rotation for realism
                this.droppedBomb.rotation.x = progress * Math.PI * 3;
                this.droppedBomb.rotation.z = progress * Math.PI * 2;
                
                requestAnimationFrame(animate);
            } else {
                // Animation complete - bomb lands
                this.droppedBomb.position.copy(endPos);
                this.droppedBomb.rotation.set(0, 0, 0); // Reset rotation
                console.log(`Bomb landed at: ${endPos.x.toFixed(1)}, ${endPos.y}, ${endPos.z.toFixed(1)}`);
            }
        };
        
        animate();
    }
    
    // Clear dropped bomb (called at round start)
    clearDroppedBomb() {
        if (this.droppedBomb) {
            this.scene.remove(this.droppedBomb);
            this.droppedBomb = null;
            this.droppedBombPosition = null;
            this.canPickupBomb = false;
            this.hidePickupPrompt();
            console.log('Dropped bomb cleared for new round');
        }
    }

    // Called when someone picks up the bomb
    onBombPickedUp(playerId, isMe) {
        // Remove dropped bomb from scene
        if (this.droppedBomb) {
            this.scene.remove(this.droppedBomb);
            this.droppedBomb = null;
            this.droppedBombPosition = null;
        }
        
        // Hide pickup prompt
        this.hidePickupPrompt();
        this.canPickupBomb = false;
        
        // If we picked it up, give us the bomb
        if (isMe) {
            this.giveBomb();
        }
    }
    
    // Check if player is near dropped bomb
    checkCanPickup() {
        if (!this.droppedBombPosition || !this.camera) return false;
        
        // Check if player is on attacking team
        const gameInstance = window.gameInstance || window.game;
        if (gameInstance && gameInstance.attackingTeam && gameInstance.playerTeam) {
            if (gameInstance.playerTeam !== gameInstance.attackingTeam) {
                this.hidePickupPrompt();
                this.canPickupBomb = false;
                return false;
            }
        }
        
        const distance = this.camera.position.distanceTo(this.droppedBombPosition);
        // Use horizontal distance only since bomb is at ground level but player is higher up
        const horizontalDistance = new THREE.Vector2(
            this.camera.position.x - this.droppedBombPosition.x,
            this.camera.position.z - this.droppedBombPosition.z
        ).length();
        this.canPickupBomb = horizontalDistance < 5.0; // Use horizontal distance for pickup
        
        // Debug logging (only when distance changes significantly)
        if (!this.lastLoggedDistance || Math.abs(horizontalDistance - this.lastLoggedDistance) > 1) {
            console.log(`Bomb 3D distance: ${distance.toFixed(2)}, horizontal: ${horizontalDistance.toFixed(2)}, Can pickup: ${this.canPickupBomb}`);
            this.lastLoggedDistance = horizontalDistance;
        }
        
        if (this.canPickupBomb) {
            this.showPickupPrompt();
        } else {
            this.hidePickupPrompt();
        }
        
        return this.canPickupBomb;
    }
    
    createPickupPrompt() {
        let prompt = document.getElementById('bombPickupPrompt');
        if (!prompt) {
            prompt = document.createElement('div');
            prompt.id = 'bombPickupPrompt';
            prompt.style.cssText = `
                position: fixed;
                bottom: 200px;
                left: 50%;
                transform: translateX(-50%);
                padding: 15px 30px;
                background: rgba(0, 0, 0, 0.85);
                border: 1px solid rgba(255, 102, 0, 0.5);
                border-radius: 8px;
                color: #ff6600;
                font-size: 16px;
                font-weight: 500;
                z-index: 100;
                text-align: center;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                backdrop-filter: blur(10px);
                display: none;
            `;
            document.body.appendChild(prompt);
        }
        return prompt;
    }
    
    showPickupPrompt() {
        const prompt = this.createPickupPrompt();
        prompt.innerHTML = 'Press [E] to pick up bomb';
        prompt.style.display = 'block';
    }
    
    hidePickupPrompt() {
        const prompt = document.getElementById('bombPickupPrompt');
        if (prompt) {
            prompt.style.display = 'none';
        }
    }
}