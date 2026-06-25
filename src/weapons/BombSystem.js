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
        this.isDefusing = false;
        this.defuseProgress = 0;
        this.defuseDuration = 5000; // 5 seconds to defuse
        this.bombPlanted = false;
        this.plantedBombPosition = null; // Store bomb position for explosion
        
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

    // Clear the bomb from this client's local player. Called at round start so a
    // previous round's carrier doesn't keep the bomb — the server then re-grants
    // it to exactly one (random) attacker via the give_bomb message.
    removeBomb() {
        this.hasBomb = false;
        this.isEquipped = false;
        if (this.bombGroup) {
            this.bombGroup.visible = false;
        }
        // Show the weapon again in case the bomb was equipped in hand.
        if (window.gameInstance && window.gameInstance.weaponSystem) {
            window.gameInstance.weaponSystem.show();
        }
        this.updateBombUI();
        this.hideBombUI();
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

        // Refresh the HUD so the indicator + the bottom-center "G drop" prompt show.
        this.updateBombUI();

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

        // Refresh the HUD so the bottom-center "G drop" prompt hides again.
        this.updateBombUI();

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
    
    startPlanting(onProgressCallback) {
        if (!this.hasBomb || !this.isEquipped || this.isPlanting || this.bombPlanted) return false;
        
        const playerPos = this.camera.position;
        const sites = [
            { x: -250, z: 0 },
            { x: 250, z: 0 },
        ];
        const plantRadius = 55;
        const atSite = sites.some(s => Math.hypot(playerPos.x - s.x, playerPos.z - s.z) <= plantRadius);
        if (!atSite) {
            console.log('Not at bomb site!');
            this.showMessage('Move to bomb site to plant!');
            return false;
        }
        
        this.isPlanting = true;
        this.plantProgress = 0;
        this.plantDuration = 3000; // 3 seconds to plant
        this.onProgressCallback = onProgressCallback;
        this.showPlantingBar();
        
        // Start planting timer
        this.plantingInterval = setInterval(() => {
            this.plantProgress += 100; // Update every 100ms
            const progress = Math.min(this.plantProgress / this.plantDuration, 1);
            this.updatePlantingBar(progress);
            
            if (this.onProgressCallback) {
                this.onProgressCallback(progress);
            }
            
            if (progress >= 1.0) {
                clearInterval(this.plantingInterval);
                this.completePlanting();
            }
        }, 100);
        
        console.log('Started planting bomb - hold for 3 seconds');
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
        
        if (this.plantingInterval) {
            clearInterval(this.plantingInterval);
            this.plantingInterval = null;
        }
        
        console.log('Planting cancelled');
    }
    
    completePlanting() {
        this.isPlanting = false;
        this.hidePlantingBar();
        
        // Get player's current position for bomb placement
        const playerPos = this.camera.position.clone();
        console.log(`Sending plant bomb request at position: ${playerPos.x}, ${playerPos.z}`);
        
        // Notify server about bomb plant with position
        if (window.gameInstance && window.gameInstance.network) {
            window.gameInstance.network.sendPlantBombWithPosition(playerPos.x, playerPos.z);
        }
        
        console.log('Plant bomb request sent to server - waiting for confirmation');
    }

    // ---- Defuse (defenders) ----
    // Returns true if a 5-second defuse hold was started. Requires the bomb to
    // be planted and the player to be near it. Team check is done by the caller.
    startDefusing() {
        if (!this.bombPlanted || this.isDefusing || this.hasExploded) return false;
        if (!this.plantedBombPosition) return false;

        const playerPos = this.camera.position;
        const dist = Math.hypot(
            playerPos.x - this.plantedBombPosition.x,
            playerPos.z - this.plantedBombPosition.z,
        );
        if (dist > 8.0) {
            this.showMessage('Move closer to the bomb to defuse!');
            return false;
        }

        this.isDefusing = true;
        this.defuseProgress = 0;
        this.defuseDuration = 5000; // 5 seconds to defuse
        this.showDefusingBar();

        this.defusingInterval = setInterval(() => {
            // Stop if the bomb is gone (exploded/defused by server).
            if (!this.bombPlanted) {
                this.cancelDefusing();
                return;
            }
            this.defuseProgress += 100;
            const progress = Math.min(this.defuseProgress / this.defuseDuration, 1);
            this.updateDefusingBar(progress);

            if (progress >= 1.0) {
                clearInterval(this.defusingInterval);
                this.defusingInterval = null;
                this.completeDefusing();
            }
        }, 100);

        console.log('Started defusing bomb - hold E for 5 seconds');
        return true;
    }

    cancelDefusing() {
        if (!this.isDefusing) return;
        this.isDefusing = false;
        this.defuseProgress = 0;
        this.hideDefusingBar();
        if (this.defusingInterval) {
            clearInterval(this.defusingInterval);
            this.defusingInterval = null;
        }
        console.log('Defusing cancelled');
    }

    completeDefusing() {
        this.isDefusing = false;
        this.hideDefusingBar();
        // Tell the server; it validates and broadcasts bomb_defused + round end.
        if (window.gameInstance && window.gameInstance.network) {
            window.gameInstance.network.sendDefuseBomb();
        }
        console.log('Defuse complete - sent to server');
    }

    showDefusingBar() {
        let bar = document.getElementById('defusingBar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'defusingBar';
            bar.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 280px;
                background: rgba(26, 36, 71, 0.88);
                border-radius: 12px;
                z-index: 200;
                padding: 20px;
                backdrop-filter: blur(10px);
                border: 1px solid rgba(239, 78, 35, 0.15);
            `;
            bar.innerHTML = `
                <div style="color: rgba(239, 78, 35, 0.8); text-align: center; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">Defusing Bomb</div>
                <div style="width: 100%; height: 4px; background: rgba(239, 78, 35, 0.15); border-radius: 2px; overflow: hidden;">
                    <div id="defusingProgress" style="width: 0%; height: 100%; background: #ef4e23; transition: width 0.1s;"></div>
                </div>
            `;
            document.body.appendChild(bar);
        }
        bar.style.display = 'block';
    }

    updateDefusingBar(progress) {
        const p = document.getElementById('defusingProgress');
        if (p) p.style.width = `${progress * 100}%`;
    }

    hideDefusingBar() {
        const bar = document.getElementById('defusingBar');
        if (bar) bar.style.display = 'none';
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
    
    startBombTimer(initialTimer = 45) {
        // Prevent multiple timers
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        
        this.bombTimer = initialTimer; // Use server-provided timer
        this.hasExploded = false; // Track if already exploded
        this.updateTimerDisplay();
        this.showBombTimerUI(this.bombTimer);
        
        this.timerInterval = setInterval(() => {
            this.bombTimer--;
            this.updateTimerDisplay();
            this.showBombTimerUI(this.bombTimer);
            
            if (this.bombTimer <= 0 && !this.hasExploded) {
                // Don't set hasExploded here - wait for server to trigger explosion
                clearInterval(this.timerInterval);
                this.timerInterval = null;
                // Don't call explodeBomb here - wait for server message
                this.hideBombTimerUI();
            }
            
            // Faster blinking as time runs out
            if (this.bombTimer <= 10 && this.blinkInterval) {
                clearInterval(this.blinkInterval);
                this.blinkInterval = setInterval(() => {
                    if (this.bombLight) {
                        this.bombLight.visible = !this.bombLight.visible;
                    }
                }, 200);
            }
        }, 1000);
    }
    
    explodeBomb() {
        // Prevent multiple explosions
        if (this.hasExploded) {
            console.log('Bomb already exploded, ignoring duplicate call');
            return;
        }
        
        this.hasExploded = true;
        console.log('BOMB EXPLODED! Starting explosion animation...');
        
        // Create implosion effect first
        try {
            this.createImplosionEffect();
            console.log('Explosion animation started successfully');
        } catch (error) {
            console.error('Error creating explosion effect:', error);
        }
        
        // After implosion animation, clean up
        setTimeout(() => {
            this.showMessage('Bomb detonated');
            
            // Clean up
            this.cleanup();
            
            // Don't call endRound here - let server handle it
        }, 3000); // Wait for implosion to complete
    }
    
    createImplosionEffect() {
        console.log('createImplosionEffect called');
        
        // Try to get bomb position from multiple sources
        let bombPos;
        
        if (this.plantedBombPosition) {
            // Use the stored bomb position (most reliable)
            bombPos = this.plantedBombPosition.clone();
            console.log('Using stored bomb position:', bombPos);
        } else if (this.plantedBombModel) {
            // Use the planted bomb model position if available
            bombPos = this.plantedBombModel.position.clone();
            console.log('Using planted model position:', bombPos);
        } else if (this.plantedBombGroup) {
            // Use the planted bomb group position as fallback
            bombPos = this.plantedBombGroup.position.clone();
            console.log('Using planted group position:', bombPos);
        } else {
            // Last resort - use center of bomb site (where bombs are typically planted)
            console.warn('No bomb position found - using default bomb site position');
            bombPos = new THREE.Vector3(0, 1, 0); // Center of map at ground level
        }
        
        console.log('Creating explosion at position:', bombPos);
        
        // Create a massive black sphere that grows
        const explosionGeometry = new THREE.SphereGeometry(10, 16, 12);
        const explosionMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x000000,  // Pure black
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        const blackExplosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
        blackExplosion.position.copy(bombPos);
        blackExplosion.position.y = 5; // Ground level
        
        console.log('Adding explosion sphere to scene...');
        this.scene.add(blackExplosion);
        
        console.log('Black explosion sphere created at:', blackExplosion.position);
        console.log('Explosion visible:', blackExplosion.visible);
        console.log('Scene has explosion:', this.scene.children.includes(blackExplosion));
        
        // Growing animation - simple and visible
        let scale = 1;
        
        // Store interval ID for cleanup
        this.explosionInterval = setInterval(() => {
            scale += 3; // Grow by 3 units per frame
            blackExplosion.scale.set(scale, scale, scale);
            
            // Fade out as it grows
            blackExplosion.material.opacity = Math.max(0.1, 0.8 - (scale / 100));
            
            // Check if player is inside the explosion radius and kill them
            const currentRadius = scale * 10; // Scale converted to world units
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
            
            // After reaching max size, remove
            if (scale >= 60) { // Stop at reasonable size
                clearInterval(this.explosionInterval);
                this.explosionInterval = null;
                
                // Simple screen flash
                const screenFlash = document.createElement('div');
                screenFlash.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(239, 78, 35, 0.5);
                    z-index: 10000;
                    pointer-events: none;
                `;
                document.body.appendChild(screenFlash);
                
                // Camera shake
                if (window.gameInstance && window.gameInstance.camera) {
                    window.gameInstance.camera.shake(2.0, 1000);
                }
                
                // Remove explosion after a moment
                setTimeout(() => {
                    this.scene.remove(blackExplosion);
                    blackExplosion.geometry.dispose();
                    blackExplosion.material.dispose();
                }, 1000);
                
                // Remove flash quickly
                setTimeout(() => {
                    document.body.removeChild(screenFlash);
                }, 200);
            }
        }, 50); // 20 FPS for smooth growth
    }
    
    onLocalBombPlanted() {
        // Called when local player plants bomb - remove from hand
        this.hasBomb = false;
        this.isEquipped = false;
        this.bombGroup.visible = false;
        this.isPlanting = false;
        this.bombPlanted = true;
        this.hidePlantingBar();
        
        if (this.plantingInterval) {
            clearInterval(this.plantingInterval);
            this.plantingInterval = null;
        }
        
        // Update UI to show bomb is no longer in inventory
        this.updateBombUI();
        
        // Show weapon again since bomb is no longer in hand
        if (window.gameInstance && window.gameInstance.weaponSystem) {
            window.gameInstance.weaponSystem.show();
        }
        
        console.log('Bomb removed from hand after planting - waiting for timer from server');
    }
    
    onBombPlanted(timer, position = null) {
        console.log(`Remote bomb planted - Timer: ${timer}s at position:`, position);
        
        if (!this.bombModel) {
            console.log('Warning: Bomb model not loaded, cannot show planted bomb');
            return;
        }
        
        // Position at actual player location or center if not provided
        const bombPos = position || { x: 0, z: 0 };
        
        // Store the bomb position for explosion
        this.plantedBombPosition = new THREE.Vector3(bombPos.x, 1, bombPos.z);
        
        // Create a new group for the planted bomb (same as placeBombOnGround method)
        this.plantedBombGroup = new THREE.Group();
        
        // Clone the bomb model for ground placement
        const plantedBomb = this.bombModel.clone();
        
        // Make sure all meshes in the clone are visible
        plantedBomb.traverse((child) => {
            if (child.isMesh) {
                child.visible = true;
                if (child.material) {
                    child.material = child.material.clone();
                    child.material.emissive = new THREE.Color(0x220000);
                    child.material.emissiveIntensity = 0.2;
                }
            }
        });
        
        plantedBomb.scale.set(5.0, 5.0, 5.0); // Large on ground
        plantedBomb.position.set(0, 0, 0); // Local position in group
        plantedBomb.rotation.set(0, Math.random() * Math.PI * 2, 0); // Random rotation
        
        this.plantedBombGroup.add(plantedBomb);
        this.plantedBombGroup.position.set(bombPos.x, 1, bombPos.z);
        this.plantedBombGroup.visible = true;
        
        // Add to scene
        this.scene.add(this.plantedBombGroup);
        this.plantedBombModel = this.plantedBombGroup; // Keep reference for cleanup
        
        // Add red blinking light effect at bomb position
        this.addBombLight(bombPos.x, bombPos.z);
        
        // Start countdown timer for all players
        this.startBombTimer(timer);
        this.bombPlanted = true;
        this.showBombTimerUI(timer);
        
        console.log(`Bomb planted at (${bombPos.x}, ${bombPos.z}) and timer started for all players`);
    }
    
    
    onBombDefused() {
        console.log('Bomb defused by another player');
        this.cleanup();
        this.hideBombTimerUI();
    }
    
    onBombExploded() {
        console.log('Bomb exploded - showing explosion for all players');
        console.log('hasExploded before:', this.hasExploded);
        
        // Force explosion even if timer hasn't reached zero locally
        // Server controls the actual explosion timing
        this.bombTimer = 0;
        
        // Clear any running timer
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // Always show explosion when server says so
        // Reset flag in case it was set by local timer
        if (this.hasExploded) {
            console.log('Resetting hasExploded flag to show server-triggered explosion');
            this.hasExploded = false;
        }
        
        this.explodeBomb();
        this.hideBombTimerUI();
    }
    
    // The bomb timer is now rendered inside the round box (Game.updateRoundDisplay
    // reads this.bombPlanted + this.bombTimer and styles it red/urgent). We just
    // poke the round display to re-render; no standalone box anymore.
    showBombTimerUI(_timeLeft) {
        const game = window.gameInstance;
        if (game && typeof game.updateRoundDisplay === 'function') {
            game.updateRoundDisplay();
        }
        // Remove any leftover legacy standalone box from older sessions.
        const legacy = document.getElementById('bombTimer');
        if (legacy) legacy.remove();
    }

    hideBombTimerUI() {
        const legacy = document.getElementById('bombTimer');
        if (legacy) legacy.remove();
        const game = window.gameInstance;
        if (game && typeof game.updateRoundDisplay === 'function') {
            game.updateRoundDisplay();
        }
    }

    cleanup() {
        // Reset bomb state
        this.bombPlanted = false;
        this.hasExploded = false;
        this.isPlanting = false;
        this.plantedBombPosition = null; // Clear stored position

        // Cancel any in-progress defuse
        this.isDefusing = false;
        this.defuseProgress = 0;
        if (this.defusingInterval) {
            clearInterval(this.defusingInterval);
            this.defusingInterval = null;
        }
        this.hideDefusingBar();

        // Clear ALL timers
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        if (this.blinkInterval) {
            clearInterval(this.blinkInterval);
            this.blinkInterval = null;
        }
        
        if (this.indicatorBlinkInterval) {
            clearInterval(this.indicatorBlinkInterval);
            this.indicatorBlinkInterval = null;
        }
        
        if (this.explosionInterval) {
            clearInterval(this.explosionInterval);
            this.explosionInterval = null;
        }
        
        if (this.plantingInterval) {
            clearInterval(this.plantingInterval);
            this.plantingInterval = null;
        }
        
        // Hide UI
        this.hideBombTimerUI();
        this.hidePlantingBar();
        
        // Remove models
        if (this.plantedBombModel) {
            this.scene.remove(this.plantedBombModel);
            this.plantedBombModel = null;
        }
        
        if (this.bombIndicator) {
            this.scene.remove(this.bombIndicator);
            this.bombIndicator = null;
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

        // Hide any lingering action prompts.
        this.hidePlantInstructions();
        this.hideDefuseInstructions();
    }

    // UI Methods
    hideBombUI() {
        const bombIndicator = document.getElementById('bombIndicator');
        if (bombIndicator) {
            bombIndicator.style.display = 'none';
        }
        this.hideDropPrompt();
    }

    // Bottom-center prompt, shown the WHOLE time the bomb is equipped, so the
    // player always knows they can drop it with G.
    updateDropPrompt() {
        let prompt = document.getElementById('bombDropPrompt');
        if (!prompt) {
            prompt = document.createElement('div');
            prompt.id = 'bombDropPrompt';
            prompt.style.cssText = `
                position: fixed;
                bottom: 88px;
                left: 50%;
                transform: translateX(-50%);
                display: none;
                align-items: center;
                gap: 9px;
                padding: 8px 16px;
                background: rgba(26, 36, 71, 0.88);
                border: 1px solid rgba(239, 78, 35, 0.35);
                border-radius: 999px;
                color: #ef4e23;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                font-size: 12px;
                letter-spacing: 0.5px;
                backdrop-filter: blur(10px);
                z-index: 100;
                white-space: nowrap;
                pointer-events: none;
            `;
            prompt.innerHTML = `
                <span style="
                    display: inline-flex; align-items: center; justify-content: center;
                    min-width: 18px; height: 18px; padding: 0 5px;
                    background: rgba(239, 78, 35, 0.15);
                    border: 1px solid rgba(239, 78, 35, 0.6);
                    border-radius: 4px;
                    font-size: 11px; font-weight: 700; letter-spacing: 1px;
                ">G</span>
                <span>Drop the bomb</span>
            `;
            document.body.appendChild(prompt);
        }
        prompt.style.display = this.isEquipped ? 'flex' : 'none';
    }

    hideDropPrompt() {
        const prompt = document.getElementById('bombDropPrompt');
        if (prompt) prompt.style.display = 'none';
    }
    
    showBombUI() {
        if (this.hasBomb) {
            this.updateBombUI();
        }
    }
    
    updateBombUI() {
        let bombIndicator = document.getElementById('bombIndicator');
        
        if (!bombIndicator) {
            // Create bomb indicator UI
            bombIndicator = document.createElement('div');
            bombIndicator.id = 'bombIndicator';
            // Slim, minimalist pill in the lower-right: bomb glyph + status + key
            // hint on a single row. No more chunky 80×100 box.
            bombIndicator.style.cssText = `
                position: fixed;
                bottom: 150px;
                right: 24px;
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 9px 14px;
                background: rgba(26, 36, 71, 0.88);
                border: 1px solid rgba(239, 78, 35, 0.35);
                border-radius: 10px;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                backdrop-filter: blur(10px);
                z-index: 100;
                transition: border-color 0.3s ease, box-shadow 0.3s ease, background 0.3s ease;
            `;
            document.body.appendChild(bombIndicator);
        }

        if (this.hasBomb) {
            bombIndicator.style.display = 'flex';

            const isActive = this.isEquipped;
            const glowColor = isActive ? 'rgba(239, 78, 35, 0.4)' : 'rgba(239, 78, 35, 0.2)';

            // A small key-chip helper so hints render consistently.
            const keyChip = (k) => `
                <span style="
                    display: inline-flex; align-items: center; justify-content: center;
                    min-width: 16px; height: 16px; padding: 0 4px;
                    background: rgba(239, 78, 35, 0.15);
                    border: 1px solid rgba(239, 78, 35, 0.5);
                    border-radius: 3px;
                    font-size: 9px; font-weight: 700; color: #ef4e23; letter-spacing: 0.5px;
                ">${k}</span>`;

            // Filled, rounder bomb glyph: solid body with a small shine, a short
            // neck, a curved fuse, and a spark that pulses when armed.
            const bombGlyph = `
                <svg width="24" height="24" viewBox="0 0 24 24" style="flex-shrink:0;">
                    <!-- body -->
                    <circle cx="10.5" cy="15" r="6.5" fill="#ef4e23"/>
                    <!-- neck -->
                    <rect x="13.5" y="7.5" width="2.6" height="3.2" rx="0.8"
                          transform="rotate(35 14.8 9)" fill="#ef4e23"/>
                    <!-- curved fuse -->
                    <path d="M15.5 8 q3 -1.5 3.6 -3.2" fill="none"
                          stroke="#ef4e23" stroke-width="1.6" stroke-linecap="round"/>
                    <!-- shine -->
                    <circle cx="8" cy="12.5" r="1.6" fill="#fff" opacity="0.25"/>
                    <!-- spark -->
                    <g style="${isActive ? 'animation: pulse 1s infinite; transform-origin: 19px 4.5px;' : ''}">
                        <circle cx="19" cy="4.5" r="2" fill="#ef4e23"/>
                        <circle cx="19" cy="4.5" r="3.4" fill="#ef4e23" opacity="${isActive ? '0.35' : '0'}"/>
                    </g>
                </svg>`;

            bombIndicator.innerHTML = `
                ${bombGlyph}
                <div style="display: flex; flex-direction: column; line-height: 1.2; gap: 2px;">
                    <span style="font-size: 12px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #ef4e23;">
                        ${isActive ? 'Armed' : 'Bomb'}
                    </span>
                    ${isActive ? `
                        <span style="font-size: 9px; letter-spacing: 0.3px; color: rgba(239, 78, 35, 0.5); display: flex; align-items: center; gap: 5px;">
                            Hold left-click to plant
                        </span>
                    ` : `
                        <span style="font-size: 9px; letter-spacing: 0.3px; color: rgba(239, 78, 35, 0.6); display: flex; align-items: center; gap: 5px;">
                            ${keyChip('T')} Equip bomb
                        </span>
                    `}
                </div>
            `;

            if (this.isEquipped) {
                bombIndicator.style.borderColor = 'rgba(239, 78, 35, 0.6)';
                bombIndicator.style.boxShadow = `0 0 16px ${glowColor}`;
                bombIndicator.style.background = 'rgba(239, 78, 35, 0.12)';
            } else {
                bombIndicator.style.borderColor = 'rgba(239, 78, 35, 0.35)';
                bombIndicator.style.boxShadow = 'none';
                bombIndicator.style.background = 'rgba(26, 36, 71, 0.88)';
            }
        } else {
            bombIndicator.style.display = 'none';
        }

        // Persistent bottom-center prompt: visible the whole time the bomb is
        // equipped, telling the player they can drop it with G.
        this.updateDropPrompt();

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
                background: rgba(26, 36, 71, 0.88);
                border-radius: 12px;
                z-index: 200;
                padding: 20px;
                backdrop-filter: blur(10px);
                border: 1px solid rgba(239, 78, 35, 0.15);
            `;
            plantingBar.innerHTML = `
                <div style="color: rgba(239, 78, 35, 0.8); text-align: center; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">Planting Bomb</div>
                <div style="width: 100%; height: 4px; background: rgba(239, 78, 35, 0.15); border-radius: 2px; overflow: hidden;">
                    <div id="plantingProgress" style="
                        width: 0%;
                        height: 100%;
                        background: #ef4e23;
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
                background: rgba(26, 36, 71, 0.88);
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
                <div style="font-size: 32px; font-weight: 300; color: ${this.bombTimer <= 10 ? '#ff4444' : '#ef4e23'};">
                    0:${this.bombTimer.toString().padStart(2, '0')}
                </div>
            `;
        } else {
            timerDisplay.style.display = 'none';
        }
    }
    
    // Small, minimalist toast for bomb status/hints (matches the HUD style).
    showMessage(text) {
        let message = document.getElementById('bombMessage');

        if (!message) {
            message = document.createElement('div');
            message.id = 'bombMessage';
            message.style.cssText = `
                position: fixed;
                top: 32%;
                left: 50%;
                transform: translateX(-50%);
                padding: 10px 18px;
                background: rgba(26, 36, 71, 0.88);
                border: 1px solid rgba(239, 78, 35, 0.15);
                border-radius: 10px;
                color: rgba(255, 255, 255, 0.9);
                backdrop-filter: blur(10px);
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                font-size: 13px;
                font-weight: 500;
                letter-spacing: 0.5px;
                z-index: 300;
                text-align: center;
                pointer-events: none;
            `;
            document.body.appendChild(message);
        }

        message.textContent = text;
        message.style.display = 'block';

        if (this._msgTimer) clearTimeout(this._msgTimer);
        this._msgTimer = setTimeout(() => {
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
        
        // Show "hold left click to plant" when the carrier is at a bomb site
        // (same sites/radius as startPlanting), and not already planting/planted.
        if (this.isEquipped && !this.bombPlanted && !this.isPlanting) {
            const playerPos = this.camera.position;
            const sites = [{ x: -250, z: 0 }, { x: 250, z: 0 }];
            const plantRadius = 55;
            const atSite = sites.some(s => Math.hypot(playerPos.x - s.x, playerPos.z - s.z) <= plantRadius);
            if (atSite) {
                this.showPlantInstructions();
            } else {
                this.hidePlantInstructions();
            }
        } else {
            this.hidePlantInstructions();
        }

        // Show "hold E to defuse" for a defender standing near the planted bomb
        // (while not already defusing). Team is gated by the game (only the
        // defending team's keypress starts a defuse), so here we just check the
        // local player isn't the attacking team if we can tell.
        if (this.bombPlanted && this.plantedBombPosition && !this.isDefusing) {
            const gi = window.gameInstance || window.game;
            const isAttacker = gi && gi.attackingTeam && gi.playerTeam &&
                gi.playerTeam === gi.attackingTeam;
            const alive = !gi || gi.isAlive !== false;
            const dist = Math.hypot(
                this.camera.position.x - this.plantedBombPosition.x,
                this.camera.position.z - this.plantedBombPosition.z,
            );
            if (!isAttacker && alive && dist <= 8.0) {
                this.showDefuseInstructions();
            } else {
                this.hideDefuseInstructions();
            }
        } else {
            this.hideDefuseInstructions();
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
    
    // Shared minimalist action prompt: "HOLD [key] TO <action>" with a keycap
    // chip, in the same black/blur HUD style as the rest of the UI.
    _actionPromptHTML(keyLabel, actionLabel) {
        return `
            <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.6;">Hold</span>
            <span style="
                display: inline-block;
                min-width: 18px;
                padding: 3px 8px;
                margin: 0 8px;
                background: rgba(239, 78, 35, 0.15);
                border: 1px solid rgba(255, 255, 255, 0.25);
                border-radius: 5px;
                font-size: 12px;
                font-weight: 600;
                color: rgba(255, 255, 255, 0.95);
                letter-spacing: 1px;
                vertical-align: middle;
            ">${keyLabel}</span>
            <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.6;">to ${actionLabel}</span>
        `;
    }

    _basePromptStyle(topPct) {
        return `
            position: fixed;
            top: ${topPct};
            left: 50%;
            transform: translateX(-50%);
            padding: 10px 18px;
            background: rgba(26, 36, 71, 0.88);
            border: 1px solid rgba(239, 78, 35, 0.15);
            border-radius: 10px;
            backdrop-filter: blur(10px);
            color: rgba(255, 255, 255, 0.9);
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            z-index: 100;
            text-align: center;
            white-space: nowrap;
            pointer-events: none;
        `;
    }

    showPlantInstructions() {
        let instructions = document.getElementById('bombPlantInstructions');
        if (!instructions) {
            instructions = document.createElement('div');
            instructions.id = 'bombPlantInstructions';
            instructions.style.cssText = this._basePromptStyle('64%');
            instructions.innerHTML = this._actionPromptHTML('LMB', 'plant');
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

    showDefuseInstructions() {
        let instructions = document.getElementById('bombDefuseInstructions');
        if (!instructions) {
            instructions = document.createElement('div');
            instructions.id = 'bombDefuseInstructions';
            instructions.style.cssText = this._basePromptStyle('64%');
            instructions.innerHTML = this._actionPromptHTML('E', 'defuse');
            document.body.appendChild(instructions);
        }
        instructions.style.display = 'block';
    }

    hideDefuseInstructions() {
        const instructions = document.getElementById('bombDefuseInstructions');
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
                background: rgba(26, 36, 71, 0.88);
                border: 1px solid rgba(255, 102, 0, 0.5);
                border-radius: 8px;
                color: #ef4e23;
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