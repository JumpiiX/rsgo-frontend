import { Renderer } from '../graphics/Renderer.js';
import { Scene } from '../graphics/Scene.js';
import { Camera } from '../graphics/Camera.js';
import { LightingSystem } from '../graphics/LightingSystem.js';
import { MapBuilder } from '../graphics/MapBuilder.js';
import { InputManager } from './InputManager.js';
import { NetworkClient } from '../network/NetworkClient.js';
import { PlayerManager } from '../game/PlayerManager.js';
import { BulletSystem } from '../game/BulletSystem.js';
import { RevolverWeapon } from '../game/RevolverWeapon.js';
import { CollisionSystem } from '../physics/CollisionSystem.js';
import { MiniMap } from '../ui/MiniMap.js';
import { Compass } from '../ui/Compass.js';

export class Game {
    constructor() {
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.lighting = null;
        this.mapBuilder = null;
        this.input = null;
        this.network = null;
        this.playerManager = null;
        this.bulletSystem = null;
        this.weaponSystem = null;
        this.collisionSystem = null;
        this.miniMap = null;
        this.compass = null;

        this.gameStarted = false;
        this.playerName = '';
        this.isAlive = true;
        this.deathCamActive = false;
        this.originalCameraPosition = null;
        this.kills = 0;
        this.health = 100;
        this.shield = 100;
        this.maxShield = 100;
        this.shieldRegenDelay = 5000; 
        this.shieldRegenRate = 10; 
        this.lastHitTime = 0;
        this.shieldRegenInterval = null;

        this.setupNameScreen();
    }

    async initialize() {
        this.renderer = new Renderer();
        this.scene = new Scene();
        this.camera = new Camera();
        this.lighting = new LightingSystem(this.scene.getScene());
        this.collisionSystem = new CollisionSystem(this.scene.getScene());
        this.mapBuilder = new MapBuilder(this.scene.getScene(), this.collisionSystem);
        this.input = new InputManager();
        this.network = new NetworkClient();
        this.playerManager = new PlayerManager(this.scene.getScene());
        this.bulletSystem = new BulletSystem(this.scene.getScene());
        this.weaponSystem = new RevolverWeapon(this.camera.getCamera(), this.scene.getScene());

        
        document.getElementById('gameContainer').appendChild(this.renderer.getRenderer().domElement);

        this.setupSystems();
        this.animate();
    }

    setupSystems() {
        this.lighting.setupLights();
        this.mapBuilder.buildMap();
        this.input.setupControls(this.camera.getCamera());
        this.input.setCollisionSystem(this.collisionSystem);
        this.network.connect();

        
        this.miniMap = new MiniMap(this.scene.getScene(), this.camera, this.renderer.getRenderer());
        this.compass = new Compass();

        
        

        
        const testGeometry = new THREE.BoxGeometry(5, 5, 5);
        const testMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const testCube = new THREE.Mesh(testGeometry, testMaterial);
        testCube.position.set(0, 15, -10); 
        this.scene.getScene().add(testCube);

        
        this.network.onPlayerJoined((player) => this.playerManager.addPlayer(player));
        this.network.onPlayerLeft((playerId) => this.playerManager.removePlayer(playerId));
        this.network.onPlayerMoved((message) => this.playerManager.updatePlayer(message));
        this.network.onPlayerShot((message) => this.handleEnemyShot(message));
        this.network.onPlayerHit((message) => this.handlePlayerHit(message));
        this.network.onPlayerDied((message) => this.handlePlayerDied(message));
        this.network.onPlayerRespawned((message) => this.handlePlayerRespawned(message));
        this.network.onShieldUpdate((message) => this.handleShieldUpdate(message));

        
        this.input.onShoot(() => this.handleShoot());
        this.input.onMove((position, rotation) => this.handleMove(position, rotation));
    }

    setupNameScreen() {
        const nameInput = document.getElementById('playerName');
        const joinButton = document.getElementById('joinGame');

        joinButton.addEventListener('click', () => {
            const name = nameInput.value.trim();
            if (name) {
                this.playerName = name;
                document.getElementById('yourName').textContent = name;
                document.getElementById('nameScreen').style.display = 'none';
                document.getElementById('gameContainer').style.display = 'block';
                this.startGame();
            }
        });

        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                joinButton.click();
            }
        });
    }

    startGame() {
        if (!this.gameStarted) {
            this.gameStarted = true;
            this.initialize();

            
            this.updateHealthDisplay();
            this.updateKillCounter();

            
            setTimeout(() => {
                if (this.network.isConnected()) {
                    this.network.joinGame(this.playerName);
                }
                this.spawnPlayer();
            }, 200);
        }
    }

    spawnPlayer() {
        const spawnIndex = Math.floor(Math.random() * this.camera.spawnPoints.length);
        const spawnPoint = this.camera.spawnPoints[spawnIndex];
        this.camera.getCamera().position.set(spawnPoint.x, spawnPoint.y, spawnPoint.z);

        
        this.camera.getCamera().rotation.set(0, 0, 0);
        this.input.yaw = 0;
        this.input.pitch = 0;

        this.camera.getCamera().updateMatrixWorld();
    }

    handleMove(position, rotation) {
        
        if (this.network && this.gameStarted && this.isAlive) {
            this.network.sendMove(position, rotation);
        } else {
            console.log('Not sending - network:', !!this.network, 'gameStarted:', this.gameStarted, 'isAlive:', this.isAlive);
        }
    }

    handleShoot() {
        if (this.network && this.gameStarted && this.isAlive) {
            const forward = new THREE.Vector3();
            this.camera.getCamera().getWorldDirection(forward);

            
            const startPos = this.camera.getPosition().clone();
            startPos.add(forward.clone().multiplyScalar(1)); 

            const target = startPos.clone().add(forward.multiplyScalar(1000));  

            this.bulletSystem.createBullet(startPos, target, true);

            
            if (this.weaponSystem) {
                this.weaponSystem.animateShoot();
            }

            this.checkHit(target);
            this.network.sendShoot(startPos, target);  
        }
    }

    handleEnemyShot(message) {
        const startPos = new THREE.Vector3(message.start_x, message.start_y, message.start_z);
        const endPos = new THREE.Vector3(message.target_x, message.target_y, message.target_z);
        this.bulletSystem.createBullet(startPos, endPos, false);
    }

    checkHit(target) {
        const playerPosition = this.camera.getPosition();
        const shootDirection = new THREE.Vector3().subVectors(target, playerPosition).normalize();

        
        const raycaster = new THREE.Raycaster();
        raycaster.set(playerPosition, shootDirection);
        raycaster.far = 1000; 
        
        raycaster.camera = this.camera.getCamera();

        

        
        let closestHit = null;
        let closestDistance = Infinity;

        this.playerManager.otherPlayers.forEach((player, playerId) => {
            const playerPos = player.mesh.position;
            const distanceToPlayer = playerPosition.distanceTo(playerPos);
            

            
            const intersects = raycaster.intersectObject(player.mesh, false);

            if (intersects.length > 0) {
                const distance = intersects[0].distance;
                

                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestHit = { playerId, player, distance };
                }
            } else {
                

                
                if (distanceToPlayer <= 3) { 
                    const directionToPlayer = new THREE.Vector3().subVectors(playerPos, playerPosition).normalize();
                    const dot = shootDirection.dot(directionToPlayer);

                    if (dot > 0.9) { 
                        
                        if (distanceToPlayer < closestDistance) {
                            closestDistance = distanceToPlayer;
                            closestHit = { playerId, player, distance: distanceToPlayer };
                        }
                    }
                }
            }
        });

        
        if (closestHit) {
            

            
            this.addPlayerImpact(closestHit.player.mesh, playerPosition, shootDirection);

            const killed = this.playerManager.hitPlayer(closestHit.playerId);
            if (this.network) {
                
                this.network.sendHit(closestHit.playerId, killed);
            }
        } else {
            
        }

        
    }

    addPlayerImpact(playerMesh, shooterPos, shootDirection) {
        
        const geometry = new THREE.SphereGeometry(0.15, 6, 6);  
        const material = new THREE.MeshBasicMaterial({
            color: 0x800000,  
            emissive: 0x400000,
            emissiveIntensity: 0.5
        });
        const impactMark = new THREE.Mesh(geometry, material);

        
        impactMark.userData.isPlayerImpact = true;

        
        const toPlayer = new THREE.Vector3().subVectors(playerMesh.position, shooterPos).normalize();
        const impactOffset = toPlayer.multiplyScalar(2.2); 
        impactMark.position.copy(playerMesh.position).sub(impactOffset);
        impactMark.position.y += 1; 

        
        playerMesh.add(impactMark);

        
        setTimeout(() => {
            if (impactMark.parent) {
                impactMark.parent.remove(impactMark);
            }
        }, 5000);
    }

    handlePlayerHit(message) {
        console.log(`Player ${message.player_id} hit! Health: ${message.health}/100, Shield: ${message.shield}/100 (damage: ${message.damage})`);

        
        if (message.player_id === this.network.playerId) {
            
            this.health = message.health;
            this.shield = message.shield || 0; 

            
            this.lastHitTime = Date.now();
            this.startShieldRegen();

            this.updateHealthDisplay();
            this.showHitEffect();
            console.log(`YOU GOT HIT! Shield: ${this.shield}, Health: ${this.health}`);
        } else {
            
            const player = this.playerManager.otherPlayers.get(message.player_id);
            if (player) {
                
            }
        }
    }

    startShieldRegen() {
        
        if (this.shieldRegenInterval) {
            clearInterval(this.shieldRegenInterval);
            this.shieldRegenInterval = null;
        }

        
        
        console.log('Shield regeneration will be handled by server after 5 seconds');
    }

    handleShieldUpdate(message) {
        
        if (message.player_id === this.network.playerId) {
            this.shield = message.shield;
            this.updateHealthDisplay();
            console.log(`Shield regenerated to: ${this.shield}`);
        }
    }

    handlePlayerDied(message) {
        
        if (message.player_id === this.network.playerId) {
            this.isAlive = false;
            this.health = 0;
            this.activateDeathCam();

            
            if (this.weaponSystem) {
                this.weaponSystem.hide();
            }

            
            const killerName = this.getPlayerName(message.killer_id) || message.killer_id;

            
            console.log(`You were killed by ${killerName}`);
            this.showDeathMessage(`Killed by ${killerName}`, 5);
        } else {
            
            this.playerManager.killPlayer(message.player_id);

            
            if (message.killer_id === this.network.playerId) {
                this.kills++;
                this.updateKillCounter();
                const victimName = this.getPlayerName(message.player_id) || message.player_id;
                console.log(`You killed ${victimName}! Kills: ${this.kills}`);
            }
        }
    }

    handlePlayerRespawned(message) {
        
        if (message.player.id === this.network.playerId) {
            this.isAlive = true;
            this.health = 100;  
            this.shield = 100;  
            this.lastHitTime = 0;
            this.deactivateDeathCam();

            
            if (this.weaponSystem) {
                this.weaponSystem.show();
            }

            this.spawnPlayer(); 
            console.log('You have respawned with full health and shield!');
            this.hideDeathMessage();

            
            const healthContainer = document.getElementById('healthContainer');
            if (healthContainer) {
                healthContainer.style.display = 'block';
            }
            this.updateHealthDisplay(); 
        } else {
            
            const existingPlayer = this.playerManager.otherPlayers.get(message.player.id);
            if (existingPlayer) {
                
                existingPlayer.mesh.position.set(message.player.x, message.player.y, message.player.z);
                existingPlayer.mesh.visible = true;
                this.playerManager.respawnPlayer(message.player.id);
                console.log(`Player ${message.player.name} respawned`);
            } else {
                
                this.playerManager.addPlayer(message.player);
            }
        }
    }

    getPlayerName(playerId) {
        if (playerId === this.network.playerId) {
            return this.playerName;
        }

        const player = this.playerManager.otherPlayers.get(playerId);
        return player ? player.data.name : null;
    }

    activateDeathCam() {
        this.deathCamActive = true;
        
        this.originalCameraPosition = this.camera.getPosition().clone();

        
        this.camera.getCamera().position.set(0, 300, 0);
        this.camera.getCamera().lookAt(0, 0, 0); 

        
        this.input.isPointerLocked = false;
        document.exitPointerLock();

        
        const healthContainer = document.getElementById('healthContainer');
        if (healthContainer) {
            healthContainer.style.display = 'none';
        }
    }

    deactivateDeathCam() {
        this.deathCamActive = false;
        
    }

    showDeathMessage(message, countdown = 5) {
        
        let deathMsg = document.getElementById('deathMessage');
        if (!deathMsg) {
            deathMsg = document.createElement('div');
            deathMsg.id = 'deathMessage';
            deathMsg.style.cssText = `
                position: fixed;
                top: 20%;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(40, 40, 40, 0.9);
                color: #ff6666;
                padding: 30px;
                font-size: 28px;
                font-weight: bold;
                text-align: center;
                border-radius: 15px;
                border: 2px solid #ff6666;
                box-shadow: 0 0 20px rgba(255, 102, 102, 0.3);
                z-index: 1000;
                font-family: Arial, sans-serif;
            `;
            document.body.appendChild(deathMsg);
        }

        let timeLeft = countdown;
        const updateMessage = () => {
            if (timeLeft > 0) {
                deathMsg.innerHTML = `
                    ${message}<br/>
                    <div style="font-size: 20px; color: #ffffff; margin-top: 15px;">
                        Death cam: ${timeLeft} seconds...
                    </div>
                `;
                timeLeft--;
                setTimeout(updateMessage, 1000);
            } else {
                
                this.showRespawnButton();
            }
        };

        deathMsg.style.display = 'block';
        updateMessage();
    }

    showRespawnButton() {
        const deathMsg = document.getElementById('deathMessage');
        if (deathMsg) {
            deathMsg.innerHTML = `
                <div style="color: #ff6666; margin-bottom: 20px;">You were eliminated</div>
                <button id="respawnButton" style="
                    padding: 15px 30px;
                    font-size: 20px;
                    background: #00ff00;
                    color: #000;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    font-weight: bold;
                    transition: all 0.3s;
                " onmouseover="this.style.background='#00dd00'" onmouseout="this.style.background='#00ff00'">
                    RESPAWN
                </button>
            `;

            
            const respawnBtn = document.getElementById('respawnButton');
            respawnBtn.addEventListener('click', () => {
                this.requestRespawn();
            });
        }
    }

    requestRespawn() {
        
        if (this.network && this.network.isConnected()) {
            console.log('Requesting respawn...');
            this.network.sendRespawn();
        }
    }

    hideDeathMessage() {
        const deathMsg = document.getElementById('deathMessage');
        if (deathMsg) {
            deathMsg.style.display = 'none';
        }
    }

    updateKillCounter() {
        
        let killCounter = document.getElementById('killCounter');
        if (!killCounter) {
            killCounter = document.createElement('div');
            killCounter.id = 'killCounter';
            killCounter.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background: rgba(0, 0, 0, 0.7);
                color: white;
                padding: 10px;
                font-size: 18px;
                border-radius: 5px;
                z-index: 100;
            `;
            document.body.appendChild(killCounter);
        }
        killCounter.textContent = `Kills: ${this.kills}`;
    }

    updateHealthDisplay() {
        
        let healthContainer = document.getElementById('healthContainer');
        if (!healthContainer) {
            healthContainer = document.createElement('div');
            healthContainer.id = 'healthContainer';
            healthContainer.style.cssText = `
                position: fixed;
                bottom: 30px;
                right: 30px;
                width: 300px;
                height: 70px;
                z-index: 100;
                display: flex;
                flex-direction: column;
                gap: 5px;
            `;
            document.body.appendChild(healthContainer);

            
            const shieldContainer = document.createElement('div');
            shieldContainer.style.cssText = `
                position: relative;
                width: 100%;
                height: 30px;
            `;
            healthContainer.appendChild(shieldContainer);

            
            const shieldBg = document.createElement('div');
            shieldBg.style.cssText = `
                position: absolute;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                border: 2px solid rgba(210, 105, 30, 0.4);
                border-radius: 4px;
            `;
            shieldContainer.appendChild(shieldBg);

            
            const shieldBar = document.createElement('div');
            shieldBar.id = 'shieldBar';
            shieldBar.style.cssText = `
                position: absolute;
                height: 100%;
                background: linear-gradient(90deg, #d2691e, #ff8c00);
                border-radius: 2px;
                transition: width 0.3s ease;
                box-shadow: 0 0 10px rgba(210, 105, 30, 0.5);
            `;
            shieldContainer.appendChild(shieldBar);

            
            const shieldText = document.createElement('div');
            shieldText.id = 'shieldText';
            shieldText.style.cssText = `
                position: absolute;
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 16px;
                font-weight: bold;
                text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
            `;
            shieldContainer.appendChild(shieldText);

            
            const healthBarContainer = document.createElement('div');
            healthBarContainer.style.cssText = `
                position: relative;
                width: 100%;
                height: 30px;
            `;
            healthContainer.appendChild(healthBarContainer);

            
            const healthBg = document.createElement('div');
            healthBg.style.cssText = `
                position: absolute;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                border: 2px solid rgba(0, 255, 0, 0.3);
                border-radius: 4px;
            `;
            healthBarContainer.appendChild(healthBg);

            
            const healthBar = document.createElement('div');
            healthBar.id = 'healthBar';
            healthBar.style.cssText = `
                position: absolute;
                height: 100%;
                background: linear-gradient(90deg, #00ff00, #00dd00);
                border-radius: 2px;
                transition: width 0.3s ease;
                box-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
            `;
            healthBarContainer.appendChild(healthBar);

            
            const healthText = document.createElement('div');
            healthText.id = 'healthText';
            healthText.style.cssText = `
                position: absolute;
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 16px;
                font-weight: bold;
                text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
            `;
            healthBarContainer.appendChild(healthText);
        }

        
        const healthBar = document.getElementById('healthBar');
        const shieldBar = document.getElementById('shieldBar');
        const healthText = document.getElementById('healthText');
        const shieldText = document.getElementById('shieldText');

        const healthPercent = (this.health / 100) * 100;
        const shieldPercent = (this.shield / this.maxShield) * 100;

        
        healthBar.style.width = `${healthPercent}%`;
        shieldBar.style.width = `${shieldPercent}%`;

        
        healthText.textContent = `${this.health}`;
        shieldText.textContent = `${Math.round(this.shield)}`;

        
        const shieldContainer = shieldBar.parentElement;
        if (this.shield > 0) {
            shieldContainer.style.opacity = '1';
            shieldBar.style.background = 'linear-gradient(90deg, #d2691e, #ff8c00)';
        } else {
            shieldContainer.style.opacity = '0.5';
        }

        
        if (this.health <= 25) {
            healthBar.style.background = 'linear-gradient(90deg, #ff0000, #dd0000)';
            healthBar.style.boxShadow = '0 0 10px rgba(255, 0, 0, 0.5)';
        } else if (this.health <= 50) {
            healthBar.style.background = 'linear-gradient(90deg, #ffaa00, #ff8800)';
            healthBar.style.boxShadow = '0 0 10px rgba(255, 170, 0, 0.5)';
        } else {
            healthBar.style.background = 'linear-gradient(90deg, #00ff00, #00dd00)';
            healthBar.style.boxShadow = '0 0 10px rgba(0, 255, 0, 0.5)';
        }
    }

    showHitEffect() {
        
        let hitOverlay = document.getElementById('hitOverlay');
        if (!hitOverlay) {
            hitOverlay = document.createElement('div');
            hitOverlay.id = 'hitOverlay';
            hitOverlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 999;
                opacity: 0;
                transition: opacity 0.1s;
            `;
            document.body.appendChild(hitOverlay);
        }

        
        hitOverlay.style.background = `radial-gradient(circle at center, 
            rgba(255, 0, 0, 0) 0%, 
            rgba(255, 0, 0, 0.2) 50%, 
            rgba(255, 0, 0, 0.6) 100%)`;
        hitOverlay.style.opacity = '1';

        
        hitOverlay.style.boxShadow = 'inset 0 0 100px rgba(255, 0, 0, 0.8)';

        
        setTimeout(() => {
            hitOverlay.style.opacity = '0';
        }, 100);

        
        setTimeout(() => {
            hitOverlay.style.opacity = '0.3';
        }, 200);

        setTimeout(() => {
            hitOverlay.style.opacity = '0';
        }, 300);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        if (this.gameStarted) {
            const deltaTime = 0.016; 

            
            if (this.isAlive && !this.deathCamActive) {
                this.input.updateMovement(deltaTime, this.camera);
            }

            this.bulletSystem.update(deltaTime);

            
            if (this.weaponSystem) {
                this.weaponSystem.update(deltaTime);
            }

            
            if (this.miniMap) {
                const playerPos = this.camera.getPosition();
                
                const cameraRotation = this.input.yaw;

                

                this.miniMap.update(playerPos, cameraRotation);
                this.compass.update(cameraRotation);
            }

            
            this.renderer.getRenderer().autoClear = true;

            
            this.renderer.render(this.scene.getScene(), this.camera.getCamera());

            
            if (this.miniMap) {
                this.miniMap.render();
            }
        }
    }
}
