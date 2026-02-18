import { Renderer } from '../graphics/Renderer.js';
import { Scene } from '../graphics/Scene.js';
import { Camera } from '../graphics/Camera.js';
import { LightingSystem } from '../graphics/LightingSystem.js';
import { MapBuilder } from '../graphics/MapBuilder.js';
import { InputManager } from './InputManager.js';
import { NetworkClient } from '../network/NetworkClient.js';
import { PlayerManager } from '../game/PlayerManager.js';
import { BulletSystem } from '../game/BulletSystem.js';
import { CollisionSystem } from '../physics/CollisionSystem.js';

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
        this.collisionSystem = null;
        
        this.gameStarted = false;
        this.playerName = '';
        this.isAlive = true;
        this.deathCamActive = false;
        this.originalCameraPosition = null;
        this.kills = 0;
        this.health = 100;
        
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

        // Add renderer canvas to DOM
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
        
        // Bind network events to player manager
        this.network.onPlayerJoined((player) => this.playerManager.addPlayer(player));
        this.network.onPlayerLeft((playerId) => this.playerManager.removePlayer(playerId));
        this.network.onPlayerMoved((message) => this.playerManager.updatePlayer(message));
        this.network.onPlayerShot((message) => this.handleEnemyShot(message));
        this.network.onPlayerHit((message) => this.handlePlayerHit(message));
        this.network.onPlayerDied((message) => this.handlePlayerDied(message));
        this.network.onPlayerRespawned((message) => this.handlePlayerRespawned(message));
        
        // Bind input events
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
            
            // Initialize UI elements
            this.updateHealthDisplay();
            this.updateKillCounter();
            
            // Wait for network connection, then join and spawn
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
        this.camera.getCamera().updateMatrixWorld();
    }

    handleMove(position, rotation) {
        console.log('handleMove called with position:', position.x.toFixed(1), position.y.toFixed(1), position.z.toFixed(1));
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
            const target = startPos.clone().add(forward.multiplyScalar(100));
            
            this.bulletSystem.createBullet(startPos, target, true);
            
            this.checkHit(target);
            this.network.sendShoot(startPos, target);  // Send both start and target
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
        
        console.log('=== CHECKING HIT ===');
        console.log('Player position:', playerPosition.x.toFixed(1), playerPosition.y.toFixed(1), playerPosition.z.toFixed(1));
        console.log('Shoot direction:', shootDirection.x.toFixed(3), shootDirection.y.toFixed(3), shootDirection.z.toFixed(3));
        console.log('Target position:', target.x.toFixed(1), target.y.toFixed(1), target.z.toFixed(1));
        console.log('Other players count:', this.playerManager.otherPlayers.size);
        
        this.playerManager.otherPlayers.forEach((player, playerId) => {
            const playerPos = player.mesh.position;
            const distanceToPlayer = playerPosition.distanceTo(playerPos);
            
            console.log(`Player ${playerId}:`);
            console.log('  - Position:', playerPos.x.toFixed(1), playerPos.y.toFixed(1), playerPos.z.toFixed(1));
            console.log('  - Distance:', distanceToPlayer.toFixed(1));
            
            if (distanceToPlayer <= 100) {
                const directionToPlayer = new THREE.Vector3().subVectors(playerPos, playerPosition).normalize();
                const dot = shootDirection.dot(directionToPlayer);
                
                console.log('  - Direction to player:', directionToPlayer.x.toFixed(3), directionToPlayer.y.toFixed(3), directionToPlayer.z.toFixed(3));
                console.log('  - Dot product:', dot.toFixed(3));
                console.log('  - Within range (≤100):', true);
                console.log('  - Aimed well (>0.90):', dot > 0.90);
                console.log('  - Close enough (≤50):', distanceToPlayer <= 50);
                
                if (dot > 0.90 && distanceToPlayer <= 50) {
                    console.log('  *** HIT DETECTED! ***');
                    const killed = this.playerManager.hitPlayer(playerId);
                    if (this.network) {
                        console.log('  - Sending hit to server, killed:', killed);
                        this.network.sendHit(playerId, killed);
                    }
                } else {
                    console.log('  - No hit (dot too low or too far)');
                }
            } else {
                console.log('  - Too far away (>100 units)');
            }
        });
        
        console.log('=== END HIT CHECK ===');
    }

    handlePlayerHit(message) {
        console.log(`Player ${message.player_id} hit! Health: ${message.health}/${100} (damage: ${message.damage})`);
        
        // Check if it's our own player who got hit
        if (message.player_id === this.network.playerId) {
            this.health = message.health;
            this.updateHealthDisplay();
            this.showHitEffect();
            console.log('YOU GOT HIT! Health:', this.health);
        } else {
            // Another player got hit
            const player = this.playerManager.otherPlayers.get(message.player_id);
            if (player) {
                // Could add health bar above player here
            }
        }
    }

    handlePlayerDied(message) {
        // Check if it's our own player who died
        if (message.player_id === this.network.playerId) {
            this.isAlive = false;
            this.health = 0;
            this.activateDeathCam();
            
            // Get killer name instead of ID
            const killerName = this.getPlayerName(message.killer_id) || message.killer_id;
            
            // Show death message with countdown
            console.log(`You were killed by ${killerName}`);
            this.showDeathMessage(`Killed by ${killerName}`, 5);
        } else {
            // Another player died
            this.playerManager.killPlayer(message.player_id);
            
            // If we killed them, add to our kill count
            if (message.killer_id === this.network.playerId) {
                this.kills++;
                this.updateKillCounter();
                const victimName = this.getPlayerName(message.player_id) || message.player_id;
                console.log(`You killed ${victimName}! Kills: ${this.kills}`);
            }
        }
    }

    handlePlayerRespawned(message) {
        // Check if it's our own player respawning
        if (message.player.id === this.network.playerId) {
            this.isAlive = true;
            this.health = 100;  // Reset health to 100
            this.deactivateDeathCam();
            this.spawnPlayer(); // Respawn at new location
            console.log('You have respawned with full health!');
            this.hideDeathMessage();
            
            // Show health bar again and update it to 100
            const healthContainer = document.getElementById('healthContainer');
            if (healthContainer) {
                healthContainer.style.display = 'block';
            }
            this.updateHealthDisplay(); // Update to show 100 health
        } else {
            // Another player respawned - make them visible again at new position
            const existingPlayer = this.playerManager.otherPlayers.get(message.player.id);
            if (existingPlayer) {
                // Update position and make visible
                existingPlayer.mesh.position.set(message.player.x, message.player.y, message.player.z);
                existingPlayer.mesh.visible = true;
                this.playerManager.respawnPlayer(message.player.id);
                console.log(`Player ${message.player.name} respawned`);
            } else {
                // Player doesn't exist, add them
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
        // Store original position
        this.originalCameraPosition = this.camera.getPosition().clone();
        
        // Move camera high up in the sky for death cam view - make it higher and live
        this.camera.getCamera().position.set(0, 300, 0);
        this.camera.getCamera().lookAt(0, 0, 0); // Look down at the map
        
        // Disable controls during death
        this.input.isPointerLocked = false;
        document.exitPointerLock();
        
        // Hide health bar during death
        const healthContainer = document.getElementById('healthContainer');
        if (healthContainer) {
            healthContainer.style.display = 'none';
        }
    }
    
    deactivateDeathCam() {
        this.deathCamActive = false;
        // Camera position will be set by spawnPlayer()
    }
    
    showDeathMessage(message, countdown = 5) {
        // Create or update death message UI
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
                // Show respawn button after countdown
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
            
            // Add click handler for respawn button
            const respawnBtn = document.getElementById('respawnButton');
            respawnBtn.addEventListener('click', () => {
                this.requestRespawn();
            });
        }
    }
    
    requestRespawn() {
        // Send respawn request to server
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
        // Update kill counter in UI
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
        // Create health bar container if it doesn't exist
        let healthContainer = document.getElementById('healthContainer');
        if (!healthContainer) {
            healthContainer = document.createElement('div');
            healthContainer.id = 'healthContainer';
            healthContainer.style.cssText = `
                position: fixed;
                bottom: 30px;
                right: 30px;
                width: 300px;
                height: 30px;
                z-index: 100;
            `;
            document.body.appendChild(healthContainer);
            
            // Create background bar
            const healthBg = document.createElement('div');
            healthBg.style.cssText = `
                position: absolute;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 4px;
            `;
            healthContainer.appendChild(healthBg);
            
            // Create health bar
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
            healthContainer.appendChild(healthBar);
            
            // Create health text
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
                font-size: 18px;
                font-weight: bold;
                text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
            `;
            healthContainer.appendChild(healthText);
        }
        
        // Update health bar width and text
        const healthBar = document.getElementById('healthBar');
        const healthText = document.getElementById('healthText');
        const healthPercent = (this.health / 100) * 100;
        
        healthBar.style.width = `${healthPercent}%`;
        healthText.textContent = `${this.health}`;
        
        // Change color based on health
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
        // Create red flash overlay
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
        
        // Create vignette effect (darker at edges)
        hitOverlay.style.background = `radial-gradient(circle at center, 
            rgba(255, 0, 0, 0) 0%, 
            rgba(255, 0, 0, 0.2) 50%, 
            rgba(255, 0, 0, 0.6) 100%)`;
        hitOverlay.style.opacity = '1';
        
        // Also flash the screen borders red
        hitOverlay.style.boxShadow = 'inset 0 0 100px rgba(255, 0, 0, 0.8)';
        
        // Fade out the red effect
        setTimeout(() => {
            hitOverlay.style.opacity = '0';
        }, 100);
        
        // Pulse effect for dramatic impact
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
            const deltaTime = 0.016; // ~60fps
            
            // Only update movement if alive
            if (this.isAlive && !this.deathCamActive) {
                this.input.updateMovement(deltaTime, this.camera);
            }
            
            this.bulletSystem.update(deltaTime);
            this.renderer.render(this.scene.getScene(), this.camera.getCamera());
        }
    }
}