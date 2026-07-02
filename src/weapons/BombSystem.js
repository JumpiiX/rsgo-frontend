import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class BombSystem {
    constructor(camera, scene) {
        this.camera = camera;
        this.scene = scene;
        this.bombModel = null;
        this.bombGroup = new THREE.Group();
        this.isEquipped = false;
        this.hasBomb = false;
        this.isPlanting = false;
        this.plantProgress = 0;
        this.plantDuration = 3000;
        this.isDefusing = false;
        this.defuseProgress = 0;
        this.defuseDuration = 5000;
        this.bombPlanted = false;
        this.plantedBombPosition = null;

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

            let meshCount = 0;
            this.bombModel.traverse((child) => {
                if (child.isMesh) {
                    meshCount++;
                    console.log('Found mesh:', child.name, 'Geometry:', child.geometry, 'Material:', child.material);

                    if (child.material) {
                        child.material.transparent = false;
                        child.material.opacity = 1;
                        child.material.visible = true;

                        child.material.emissive = new THREE.Color(0x111111);
                        child.material.needsUpdate = true;
                    }
                    child.frustumCulled = false;
                }
            });
            console.log('Total meshes found:', meshCount);

            this.bombModel.scale.set(0.8, 0.8, 0.8);
            this.bombModel.position.set(0, 0, 0);
            this.bombModel.rotation.set(0, 0, 0);

            this.bombGroup.add(this.bombModel);

            this.scene.add(this.bombGroup);

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

    removeBomb() {
        this.hasBomb = false;
        this.isEquipped = false;
        if (this.bombGroup) {
            this.bombGroup.visible = false;
        }

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

        this.updateBombPosition();

        if (window.gameInstance && window.gameInstance.weaponSystem) {
            window.gameInstance.weaponSystem.hide();
        }

        this.updateBombUI();

        console.log('Bomb equipped successfully');
        return true;
    }

    unequipBomb() {
        if (!this.bombModel) return;

        this.isEquipped = false;
        this.bombGroup.visible = false;

        if (window.gameInstance && window.gameInstance.weaponSystem) {
            window.gameInstance.weaponSystem.show();
        }

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
        this.plantDuration = 3000;
        this.onProgressCallback = onProgressCallback;
        this.showPlantingBar();

        this.plantingInterval = setInterval(() => {
            this.plantProgress += 100;
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

        this.plantProgress += deltaTime * 1000;

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

        const playerPos = this.camera.position.clone();
        console.log(`Sending plant bomb request at position: ${playerPos.x}, ${playerPos.z}`);

        if (window.gameInstance && window.gameInstance.network) {
            window.gameInstance.network.sendPlantBombWithPosition(playerPos.x, playerPos.z);
        }

        console.log('Plant bomb request sent to server - waiting for confirmation');
    }

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
        this.defuseDuration = 5000;
        this.showDefusingBar();

        this.defusingInterval = setInterval(() => {

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

        const light = new THREE.PointLight(0xff0000, 3, 20);
        light.position.set(x, 3, z);
        this.scene.add(light);
        this.bombLight = light;

        const sphereGeometry = new THREE.SphereGeometry(0.3, 8, 8);
        const sphereMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 1
        });
        this.blinkSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        this.blinkSphere.position.set(x, 4, z);
        this.scene.add(this.blinkSphere);

        this.blinkInterval = setInterval(() => {
            this.bombLight.visible = !this.bombLight.visible;
            this.blinkSphere.visible = !this.blinkSphere.visible;
        }, 500);
    }

    startBombTimer(initialTimer = 45) {

        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        this.bombTimer = initialTimer;
        this.hasExploded = false;
        this.updateTimerDisplay();
        this.showBombTimerUI(this.bombTimer);

        this.timerInterval = setInterval(() => {
            this.bombTimer--;
            this.updateTimerDisplay();
            this.showBombTimerUI(this.bombTimer);

            if (this.bombTimer <= 0 && !this.hasExploded) {

                clearInterval(this.timerInterval);
                this.timerInterval = null;

                this.hideBombTimerUI();
            }

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

        if (this.hasExploded) {
            console.log('Bomb already exploded, ignoring duplicate call');
            return;
        }

        this.hasExploded = true;
        console.log('BOMB EXPLODED! Starting explosion animation...');

        try {
            this.createImplosionEffect();
            console.log('Explosion animation started successfully');
        } catch (error) {
            console.error('Error creating explosion effect:', error);
        }

        setTimeout(() => {
            this.showMessage('Bomb detonated');

            this.cleanup();

        }, 3000);
    }

    createImplosionEffect() {
        console.log('createImplosionEffect called');

        let bombPos;

        if (this.plantedBombPosition) {

            bombPos = this.plantedBombPosition.clone();
            console.log('Using stored bomb position:', bombPos);
        } else if (this.plantedBombModel) {

            bombPos = this.plantedBombModel.position.clone();
            console.log('Using planted model position:', bombPos);
        } else if (this.plantedBombGroup) {

            bombPos = this.plantedBombGroup.position.clone();
            console.log('Using planted group position:', bombPos);
        } else {

            console.warn('No bomb position found - using default bomb site position');
            bombPos = new THREE.Vector3(0, 1, 0);
        }

        console.log('Creating explosion at position:', bombPos);

        const explosionGeometry = new THREE.SphereGeometry(10, 16, 12);
        const explosionMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        const blackExplosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
        blackExplosion.position.copy(bombPos);
        blackExplosion.position.y = 5;

        console.log('Adding explosion sphere to scene...');
        this.scene.add(blackExplosion);

        console.log('Black explosion sphere created at:', blackExplosion.position);
        console.log('Explosion visible:', blackExplosion.visible);
        console.log('Scene has explosion:', this.scene.children.includes(blackExplosion));

        let scale = 1;

        this.explosionInterval = setInterval(() => {
            scale += 3;
            blackExplosion.scale.set(scale, scale, scale);

            blackExplosion.material.opacity = Math.max(0.1, 0.8 - (scale / 100));

            const currentRadius = scale * 10;
            if (window.gameInstance && window.gameInstance.camera && window.gameInstance.isAlive) {
                const playerPos = window.gameInstance.camera.getPosition();
                const distance = Math.sqrt(
                    Math.pow(playerPos.x - bombPos.x, 2) +
                    Math.pow(playerPos.z - bombPos.z, 2)
                );

                if (distance < currentRadius) {
                    window.gameInstance.killPlayer('Consumed by explosion');
                }
            }

            if (scale >= 60) {
                clearInterval(this.explosionInterval);
                this.explosionInterval = null;

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

                if (window.gameInstance && window.gameInstance.camera) {
                    window.gameInstance.camera.shake(2.0, 1000);
                }

                setTimeout(() => {
                    this.scene.remove(blackExplosion);
                    blackExplosion.geometry.dispose();
                    blackExplosion.material.dispose();
                }, 1000);

                setTimeout(() => {
                    document.body.removeChild(screenFlash);
                }, 200);
            }
        }, 50);
    }

    onLocalBombPlanted() {

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

        this.updateBombUI();

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

        const bombPos = position || { x: 0, z: 0 };

        this.plantedBombPosition = new THREE.Vector3(bombPos.x, 1, bombPos.z);

        this.plantedBombGroup = new THREE.Group();

        const plantedBomb = this.bombModel.clone();

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

        plantedBomb.scale.set(5.0, 5.0, 5.0);
        plantedBomb.position.set(0, 0, 0);
        plantedBomb.rotation.set(0, Math.random() * Math.PI * 2, 0);

        this.plantedBombGroup.add(plantedBomb);
        this.plantedBombGroup.position.set(bombPos.x, 1, bombPos.z);
        this.plantedBombGroup.visible = true;

        this.scene.add(this.plantedBombGroup);
        this.plantedBombModel = this.plantedBombGroup;

        this.addBombLight(bombPos.x, bombPos.z);

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

        this.bombTimer = 0;

        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        if (this.hasExploded) {
            console.log('Resetting hasExploded flag to show server-triggered explosion');
            this.hasExploded = false;
        }

        this.explodeBomb();
        this.hideBombTimerUI();
    }

    showBombTimerUI(_timeLeft) {
        const game = window.gameInstance;
        if (game && typeof game.updateRoundDisplay === 'function') {
            game.updateRoundDisplay();
        }

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

        this.bombPlanted = false;
        this.hasExploded = false;
        this.isPlanting = false;
        this.plantedBombPosition = null;

        this.isDefusing = false;
        this.defuseProgress = 0;
        if (this.defusingInterval) {
            clearInterval(this.defusingInterval);
            this.defusingInterval = null;
        }
        this.hideDefusingBar();

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

        this.hideBombTimerUI();
        this.hidePlantingBar();

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

        if (this.explosionInterval) {
            clearInterval(this.explosionInterval);
            this.explosionInterval = null;
        }

        this.bombPlanted = false;
        this.isPlanting = false;
        this.plantProgress = 0;

        this.hidePlantInstructions();
        this.hideDefuseInstructions();
    }

    hideBombUI() {
        const bombIndicator = document.getElementById('bombIndicator');
        if (bombIndicator) {
            bombIndicator.style.display = 'none';
        }
        this.hideDropPrompt();
    }

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

            bombIndicator = document.createElement('div');
            bombIndicator.id = 'bombIndicator';

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

            const keyChip = (k) => `
                <span style="
                    display: inline-flex; align-items: center; justify-content: center;
                    min-width: 16px; height: 16px; padding: 0 4px;
                    background: rgba(239, 78, 35, 0.15);
                    border: 1px solid rgba(239, 78, 35, 0.5);
                    border-radius: 3px;
                    font-size: 9px; font-weight: 700; color: #ef4e23; letter-spacing: 0.5px;
                ">${k}</span>`;

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

        this.updateDropPrompt();

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

        if (this.isEquipped && this.bombGroup) {
            this.updateBombPosition();
        }

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

        if (this.droppedBomb && !this.hasBomb) {
            if (!this.lastPickupCheck || Date.now() - this.lastPickupCheck > 100) {
                this.checkCanPickup();
                this.lastPickupCheck = Date.now();
            }
        }
    }

    updateBombPosition() {
        if (!this.bombGroup || !this.camera) return;

        const offset = new THREE.Vector3(0.3, -0.3, -0.5);

        offset.applyQuaternion(this.camera.quaternion);

        const bombPos = new THREE.Vector3();
        bombPos.copy(this.camera.position);
        bombPos.add(offset);

        this.bombGroup.position.copy(bombPos);

        this.bombGroup.quaternion.copy(this.camera.quaternion);

        this.bombGroup.rotateY(Math.PI / 6);
        this.bombGroup.rotateX(-Math.PI / 8);
    }

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

    onBombDropped(x, y, z, thrownX, thrownZ) {
        this.hasBomb = false;
        this.isEquipped = false;
        this.bombGroup.visible = false;
        this.updateBombUI();

        if (thrownX !== undefined && thrownZ !== undefined) {
            this.showDroppedBomb(x, y, z, thrownX, thrownZ);
        } else {
            this.showDroppedBomb(x, y, z);
        }

        this.checkCanPickup();
    }

    showDroppedBomb(x, y, z, thrownX, thrownZ) {
        if (this.droppedBomb) {
            this.scene.remove(this.droppedBomb);
        }

        this.droppedBomb = new THREE.Group();

        if (this.bombModel) {
            const groundBomb = this.bombModel.clone();

            groundBomb.scale.set(4.0, 4.0, 4.0);
            groundBomb.position.set(0, 0, 0);

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

        const light = new THREE.PointLight(0xff6600, 2, 15);
        light.position.set(0, 1, 0);
        this.droppedBomb.add(light);

        const sphereGeometry = new THREE.SphereGeometry(0.5, 8, 8);
        const sphereMaterial = new THREE.MeshBasicMaterial({
            color: 0xff6600,
            transparent: true,
            opacity: 0.6
        });
        const glowSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        glowSphere.position.set(0, 2, 0);
        this.droppedBomb.add(glowSphere);

        const startPos = new THREE.Vector3(x, y + 1, z);

        if (thrownX !== undefined && thrownZ !== undefined) {
            this.droppedBombPosition = new THREE.Vector3(thrownX, 1, thrownZ);
        } else {
            this.droppedBombPosition = new THREE.Vector3(x, 1, z);
        }

        this.scene.add(this.droppedBomb);

        if (thrownX !== undefined && thrownZ !== undefined) {

            this.droppedBomb.position.copy(startPos);
            this.animateBombThrow(startPos, this.droppedBombPosition);
        } else {

            this.droppedBomb.position.copy(this.droppedBombPosition);
        }

        this.createPickupPrompt();
    }

    animateBombThrow(startPos, endPos) {
        const duration = 600;
        const startTime = Date.now();
        const maxHeight = Math.max(startPos.y, endPos.y) + 2;

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            if (progress < 1) {

                const x = startPos.x + (endPos.x - startPos.x) * progress;
                const z = startPos.z + (endPos.z - startPos.z) * progress;

                const arcProgress = 4 * progress * (1 - progress);
                const y = startPos.y + (maxHeight - startPos.y) * arcProgress + (endPos.y - startPos.y) * progress;

                this.droppedBomb.position.set(x, y, z);

                this.droppedBomb.rotation.x = progress * Math.PI * 3;
                this.droppedBomb.rotation.z = progress * Math.PI * 2;

                requestAnimationFrame(animate);
            } else {

                this.droppedBomb.position.copy(endPos);
                this.droppedBomb.rotation.set(0, 0, 0);
                console.log(`Bomb landed at: ${endPos.x.toFixed(1)}, ${endPos.y}, ${endPos.z.toFixed(1)}`);
            }
        };

        animate();
    }

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

    onBombPickedUp(playerId, isMe) {

        if (this.droppedBomb) {
            this.scene.remove(this.droppedBomb);
            this.droppedBomb = null;
            this.droppedBombPosition = null;
        }

        this.hidePickupPrompt();
        this.canPickupBomb = false;

        if (isMe) {
            this.giveBomb();
        }
    }

    checkCanPickup() {
        if (!this.droppedBombPosition || !this.camera) return false;

        const gameInstance = window.gameInstance || window.game;
        if (gameInstance && gameInstance.attackingTeam && gameInstance.playerTeam) {
            if (gameInstance.playerTeam !== gameInstance.attackingTeam) {
                this.hidePickupPrompt();
                this.canPickupBomb = false;
                return false;
            }
        }

        const distance = this.camera.position.distanceTo(this.droppedBombPosition);

        const horizontalDistance = new THREE.Vector2(
            this.camera.position.x - this.droppedBombPosition.x,
            this.camera.position.z - this.droppedBombPosition.z
        ).length();
        this.canPickupBomb = horizontalDistance < 5.0;

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