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
import { BombSystem } from '../weapons/BombSystem.js';
import { CollisionSystem } from '../physics/CollisionSystem.js';
import { SimpleMiniMap } from '../ui/SimpleMiniMap.js';
import { Compass } from '../ui/Compass.js';
import { Scoreboard } from '../ui/Scoreboard.js';
import { KillFeed } from '../ui/KillFeed.js';
import { AmmoDisplay } from '../ui/AmmoDisplay.js';

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
        this.bombSystem = null;
        this.collisionSystem = null;
        this.miniMap = null;
        this.compass = null;
        this.scoreboard = null;
        
        // Make game instance globally available for NetworkClient
        window.game = this;
        window.gameInstance = this; // Also set gameInstance for BombSystem
        this.killFeed = null;
        this.ammoDisplay = null;

        this.gameStarted = false;
        this.playerName = '';
        this.isAlive = true;
        this.deathCamActive = false;
        this.originalCameraPosition = null;
        this.kills = 0;
        this.health = 100;
        this.shield = 100;
        
        // Round system
        this.roundNumber = 1;
        this.orangeScore = 0;
        this.redScore = 0;
        this.attackingTeam = null;
        this.isInBuildPhase = false;
        this.buildPhaseTimer = null;
        this.maxShield = 100;
        this.shieldRegenDelay = 5000; 
        this.shieldRegenRate = 10; 
        this.lastHitTime = 0;
        this.shieldRegenInterval = null;
        
        // Camera recoil
        this.cameraRecoil = { x: 0, y: 0 };
        this.recoilRecovery = 0.05;
        
        // Build mode
        this.isBuildMode = false;
        this.savedCameraPosition = null;
        this.savedCameraRotation = null;
        this.buildMoney = 800; // Starting money (will be synced with server)
        this.selectedWallType = null;
        this.isDragModeEnabled = false;
        this.isPlacingWall = false;
        this.wallStartPos = null;
        this.wallPreview = null;
        this.isDraggingFromUI = false;
        this.floatingWallPreview = null;
        this.globalDragHandlers = null;
        this.lastMouseMapPos = null;
        this.currentWallRotation = 0; // Fixed rotation, changes with R key
        
        // Grid system for wall placement (like Fortnite)
        this.gridSize = 10; // Grid cell size - smaller for better precision
        this.placedWallPositions = new Set(); // Track occupied grid positions
        
        // Prevent cursor hide function
        this.preventCursorHide = (e) => {
            if (document.body.style.cursor === 'none' || document.body.style.cursor === '') {
                document.body.style.cursor = 'default';
            }
        };

        this.setupNameScreen();
        this.setupMapSelection();
    }

    async initialize() {
        this.renderer = new Renderer();
        this.scene = new Scene();
        this.camera = new Camera();
        this.lighting = new LightingSystem(this.scene.getScene());
        this.collisionSystem = new CollisionSystem(this.scene.getScene());
        this.mapBuilder = new MapBuilder(this.scene.getScene(), this.collisionSystem);
        this.input = new InputManager();
        
        // Only create network if not already created
        if (!this.network) {
            this.network = new NetworkClient();
            this.network.connect();
            
            // Set up round system callbacks
            this.network.onRoundStartCallback = (message) => {
                this.roundNumber = message.round_number;
                this.orangeScore = message.orange_score;
                this.redScore = message.red_score;
                this.attackingTeam = message.attacking_team;
                this.startBuildPhaseTimer(message.buy_time);
                this.updateRoundDisplay();
                console.log(`Round ${this.roundNumber} started! Build phase: ${message.buy_time}s`);
                console.log(`Scores: Orange: ${this.orangeScore}, Red: ${this.redScore}`);
                console.log(`Attacking team: ${this.attackingTeam}`);
                
                // Clear any dropped bombs from previous round
                if (this.bombSystem) {
                    this.bombSystem.clearDroppedBomb();
                }
                
                // Automatically respawn dead players at round start
                if (this.gameMode === 'team' && !this.isAlive) {
                    console.log('Auto-respawning for new round...');
                    this.requestRespawn();
                    this.hideDeathMessage();
                    this.deactivateDeathCam();
                }
            };
            
            this.network.onRoundEndCallback = (message) => {
                this.orangeScore = message.orange_score;
                this.redScore = message.red_score;
                this.updateRoundDisplay();
                console.log(`Round ended! Winner: ${message.winner}, Reason: ${message.reason}`);
                console.log(`Scores updated - Orange: ${this.orangeScore}, Red: ${this.redScore}`);
            };
            
            this.network.onBuildPhaseEndCallback = () => {
                this.isInBuildPhase = false;
                this.buildPhaseTimer = null;
                this.updateRoundDisplay();
                
                // Auto-exit build mode when phase ends
                if (this.isBuildMode) {
                    this.isBuildMode = false;
                    this.exitBuildMode();
                    console.log('Exiting build mode - build phase ended');
                }
                
                console.log('Build phase ended! Combat phase started!');
            };
            
            this.network.onGiveBombCallback = (message) => {
                if (message.player_id === this.network.playerId) {
                    this.bombSystem.giveBomb();
                    console.log('You have the bomb!');
                }
            };
            
            this.network.onBombDroppedCallback = (message) => {
                // Calculate forward throw position from player's camera direction
                let thrownX = message.position_x;
                let thrownZ = message.position_z;
                
                if (this.camera && this.camera.quaternion) {
                    const throwDirection = new THREE.Vector3(0, 0, -1); // Forward
                    throwDirection.applyQuaternion(this.camera.quaternion);
                    throwDirection.normalize();
                    
                    const throwDistance = 3; // Throw 3 units forward
                    thrownX = message.position_x + throwDirection.x * throwDistance;
                    thrownZ = message.position_z + throwDirection.z * throwDistance;
                    console.log('Bomb thrown to:', thrownX.toFixed(1), '1', thrownZ.toFixed(1));
                } else {
                    console.log('Camera not ready, dropping bomb in place');
                }
                
                this.bombSystem.onBombDropped(message.position_x, message.position_y, message.position_z, thrownX, thrownZ);
                console.log('Bomb dropped at:', message.position_x, message.position_y, message.position_z);
            };
            
            this.network.onBombPickedUpCallback = (message) => {
                const isMe = message.player_id === this.network.playerId;
                this.bombSystem.onBombPickedUp(message.player_id, isMe);
                console.log(`${message.player_name} picked up the bomb`);
            };
        }
        
        this.playerManager = new PlayerManager(this.scene.getScene());
        this.playerManager.setGameMode(this.gameMode);
        this.bulletSystem = new BulletSystem(this.scene.getScene());
        this.weaponSystem = new RevolverWeapon(this.camera.getCamera(), this.scene.getScene());
        this.bombSystem = new BombSystem(this.camera.getCamera(), this.scene.getScene());

        
        document.getElementById('gameContainer').appendChild(this.renderer.getRenderer().domElement);

        this.setupSystems();
        this.animate();
    }

    setupSystems() {
        this.lighting.setupLights();
        
        // Build appropriate map based on game mode
        const mapType = this.gameMode === 'team' ? 'orangePlanet' : 'city';
        console.log('Building map with type:', mapType);
        this.mapBuilder.buildMap(mapType);
        
        this.input.setupControls(this.camera.getCamera());
        this.input.setCollisionSystem(this.collisionSystem);

        
        this.miniMap = new SimpleMiniMap(this.scene.getScene(), this.renderer.getRenderer());
        this.compass = new Compass();
        this.scoreboard = new Scoreboard();
        this.killFeed = new KillFeed();
        this.ammoDisplay = new AmmoDisplay();
        
        // Money system
        this.playerMoney = 800; // Starting money
        this.createMoneyDisplay();

        
        


        
        this.network.onPlayerJoined((player) => this.playerManager.addPlayer(player));
        this.network.onPlayerLeft((playerId) => this.playerManager.removePlayer(playerId));
        this.network.onPlayerMoved((message) => this.playerManager.updatePlayer(message));
        this.network.onPlayerShot((message) => this.handleEnemyShot(message));
        this.network.onPlayerHit((message) => this.handlePlayerHit(message));
        this.network.onPlayerDied((message) => this.handlePlayerDied(message));
        this.network.onPlayerRespawned((message) => this.handlePlayerRespawned(message));
        this.network.onShieldUpdate((message) => this.handleShieldUpdate(message));
        this.network.onMoneyUpdate((message) => this.handleMoneyUpdate(message));
        this.network.onScoreboardUpdate((data) => this.handleScoreboardUpdate(data));
        
        // Process any players that arrived before PlayerManager was ready
        this.network.processPendingPlayers();

        
        this.input.onShoot(() => this.handleShoot());
        this.input.onMove((position, rotation) => this.handleMove(position, rotation));
        this.input.onScoreboard((show) => this.handleScoreboard(show));
        this.input.onReload(() => this.handleReload());
        this.input.onBuildMode(() => this.toggleBuildMode());
        this.input.onBombToggle(() => this.handleBombToggle());
        this.input.onBombDrop(() => this.handleBombDrop());
        this.input.onBombPickup(() => this.handleBombPickup());
        this.input.onBombPlantStart(() => this.handleBombPlantStart());
        this.input.onBombPlantStop(() => this.handleBombPlantStop());
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
                document.getElementById('mapSelectionScreen').style.display = 'flex';
                
                // Initialize network early for team lobby creation
                if (!this.network) {
                    this.network = new NetworkClient();
                    this.network.connect();
                    
                    // Set up round system callbacks HERE for team games
                    this.network.onRoundStartCallback = (message) => {
                        this.roundNumber = message.round_number;
                        this.orangeScore = message.orange_score;
                        this.redScore = message.red_score;
                        this.attackingTeam = message.attacking_team;
                        this.startBuildPhaseTimer(message.buy_time);
                        this.updateRoundDisplay();
                        console.log(`Round ${this.roundNumber} started! Build phase: ${message.buy_time}s`);
                        console.log(`Scores: Orange: ${this.orangeScore}, Red: ${this.redScore}`);
                        console.log(`Attacking team: ${this.attackingTeam}`);
                        
                        // Clear any dropped bombs from previous round
                        if (this.bombSystem) {
                            this.bombSystem.clearDroppedBomb();
                        }
                        
                        // Automatically respawn dead players at round start
                        if (this.gameMode === 'team' && !this.isAlive) {
                            console.log('Auto-respawning for new round...');
                            this.requestRespawn();
                            this.hideDeathMessage();
                            this.deactivateDeathCam();
                        }
                    };
                    
                    this.network.onRoundEndCallback = (message) => {
                        this.orangeScore = message.orange_score;
                        this.redScore = message.red_score;
                        this.updateRoundDisplay();
                        console.log(`Round ended! Winner: ${message.winner}, Reason: ${message.reason}`);
                        console.log(`Scores updated - Orange: ${this.orangeScore}, Red: ${this.redScore}`);
                    };
                    
                    this.network.onBuildPhaseEndCallback = () => {
                        this.isInBuildPhase = false;
                        this.buildPhaseTimer = null;
                        this.updateRoundDisplay();
                        
                        // Auto-exit build mode when phase ends
                        if (this.isBuildMode) {
                            this.isBuildMode = false;
                            this.exitBuildMode();
                            console.log('Exiting build mode - build phase ended');
                        }
                        
                        console.log('Build phase ended! Combat phase started!');
                    };
                    
                    this.network.onGiveBombCallback = (message) => {
                        if (message.player_id === this.network.playerId) {
                            this.bombSystem.giveBomb();
                            console.log('You have the bomb!');
                        }
                    };
                    
                    this.network.onBombDroppedCallback = (message) => {
                        // Calculate forward throw position from player's camera direction
                        let thrownX = message.position_x;
                        let thrownZ = message.position_z;
                        
                        if (this.camera && this.camera.quaternion) {
                            const throwDirection = new THREE.Vector3(0, 0, -1); // Forward
                            throwDirection.applyQuaternion(this.camera.quaternion);
                            throwDirection.normalize();
                            
                            const throwDistance = 3; // Throw 3 units forward
                            thrownX = message.position_x + throwDirection.x * throwDistance;
                            thrownZ = message.position_z + throwDirection.z * throwDistance;
                            console.log('Bomb thrown to:', thrownX.toFixed(1), '1', thrownZ.toFixed(1));
                        } else {
                            console.log('Camera not ready, dropping bomb in place');
                        }
                        
                        this.bombSystem.onBombDropped(message.position_x, message.position_y, message.position_z, thrownX, thrownZ);
                        console.log('Bomb dropped at:', message.position_x, message.position_y, message.position_z);
                    };
                    
                    this.network.onBombPickedUpCallback = (message) => {
                        const isMe = message.player_id === this.network.playerId;
                        this.bombSystem.onBombPickedUp(message.player_id, isMe);
                        console.log(`${message.player_name} picked up the bomb`);
                    };
                }
            }
        });

        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                joinButton.click();
            }
        });
    }

    setupMapSelection() {
        const deathmatchButton = document.getElementById('deathmatchButton');
        const teamVsTeamButton = document.getElementById('teamVsTeamButton');

        deathmatchButton.addEventListener('click', () => {
            document.getElementById('mapSelectionScreen').style.display = 'none';
            document.getElementById('gameContainer').style.display = 'block';
            this.gameMode = 'deathmatch';
            this.startGame();
        });

        teamVsTeamButton.addEventListener('click', () => {
            document.getElementById('mapSelectionScreen').style.display = 'none';
            this.network.createTeamLobby(this.playerName);
            this.setupTeamSelection();
        });
    }

    setupTeamSelection() {
        this.selectedTeam = null;
        this.teamPlayers = { orange: [], red: [] };
        
        // Only set up callbacks and listeners once
        if (!this.teamListenersSetup) {
            this.teamListenersSetup = true;
            
            // Set up network callbacks for team updates
            this.network.onTeamLobbyCreated((message) => {
                document.getElementById('teamSelectionScreen').style.display = 'flex';
                console.log('Team lobby created:', message.lobby_id);
            });
            
            this.network.onTeamUpdate((message) => {
                console.log('Team update received:', message);
                this.teamPlayers.orange = message.orange_team;
                this.teamPlayers.red = message.red_team;
                this.updateTeamDisplay();
                this.updateStartButton(message.can_start);
            });
            
            this.network.onGameStarted((message) => {
                if (message.game_mode === 'team') {
                    document.getElementById('teamSelectionScreen').style.display = 'none';
                    document.getElementById('gameContainer').style.display = 'block';
                    this.gameMode = 'team';
                    this.playerTeam = this.selectedTeam;
                    if (this.playerManager) {
                        this.playerManager.setGameMode(this.gameMode);
                    }
                    
                    // Initialize round counter for team games
                    this.roundNumber = 1;
                    this.orangeScore = 0;
                    this.redScore = 0;
                    this.updateRoundDisplay();
                    
                    this.startGame();
                }
            });
            
            // Back button
            document.getElementById('backToMapSelection').addEventListener('click', () => {
                document.getElementById('teamSelectionScreen').style.display = 'none';
                document.getElementById('mapSelectionScreen').style.display = 'flex';
            });
            
            // Team join buttons
            document.getElementById('joinOrangeTeam').addEventListener('click', () => {
                console.log('Joining orange team...');
                this.joinTeam('orange');
            });
            
            document.getElementById('joinRedTeam').addEventListener('click', () => {
                console.log('Joining red team...');
                this.joinTeam('red');
            });
            
            // Start game button
            document.getElementById('startTeamGame').addEventListener('click', () => {
                if (this.selectedTeam) {
                    console.log('Starting team game...');
                    this.network.startTeamGame();
                }
            });
        }
        
        this.updateTeamDisplay();
    }
    
    joinTeam(team) {
        console.log('joinTeam called with:', team);
        this.selectedTeam = team;
        this.network.joinTeam(team);
        console.log('Sent join team request for:', team);
    }
    
    updateTeamDisplay() {
        // Update orange team
        const orangeSlots = document.querySelectorAll('.orange-slot');
        orangeSlots.forEach((slot, index) => {
            const player = this.teamPlayers.orange[index];
            if (player) {
                slot.textContent = `Player ${index + 1} - ${player.name}`;
                slot.style.background = 'rgba(255, 107, 53, 0.3)';
                slot.style.color = '#ff6b35';
                slot.style.fontWeight = 'bold';
            } else {
                slot.textContent = `Player ${index + 1} - Empty`;
                slot.style.background = 'rgba(255, 107, 53, 0.1)';
                slot.style.color = '#ccc';
                slot.style.fontWeight = 'normal';
            }
        });
        
        // Update red team
        const redSlots = document.querySelectorAll('.red-slot');
        redSlots.forEach((slot, index) => {
            const player = this.teamPlayers.red[index];
            if (player) {
                slot.textContent = `Player ${index + 1} - ${player.name}`;
                slot.style.background = 'rgba(220, 53, 69, 0.3)';
                slot.style.color = '#dc3545';
                slot.style.fontWeight = 'bold';
            } else {
                slot.textContent = `Player ${index + 1} - Empty`;
                slot.style.background = 'rgba(220, 53, 69, 0.1)';
                slot.style.color = '#ccc';
                slot.style.fontWeight = 'normal';
            }
        });
        
        // Update status
        const statusElement = document.getElementById('teamStatus');
        if (this.selectedTeam) {
            statusElement.textContent = `You joined ${this.selectedTeam.toUpperCase()} team`;
            statusElement.style.color = this.selectedTeam === 'orange' ? '#ff6b35' : '#dc3545';
        } else {
            statusElement.textContent = 'Select a team to join';
            statusElement.style.color = '#ccc';
        }
    }
    
    canStartGame() {
        return this.teamPlayers.orange.length > 0 || this.teamPlayers.red.length > 0;
    }
    
    updateStartButton(canStart = false) {
        const startButton = document.getElementById('startTeamGame');
        if (this.selectedTeam && canStart) {
            startButton.disabled = false;
            startButton.style.opacity = '1';
            startButton.style.background = '#28a745';
        } else {
            startButton.disabled = true;
            startButton.style.opacity = '0.5';
            startButton.style.background = '#6c757d';
        }
    }
    

    startGame() {
        if (!this.gameStarted) {
            this.gameStarted = true;
            this.initialize();

            
            this.updateHealthDisplay();
            this.updateKillCounter();

            
            setTimeout(() => {
                // Only join deathmatch lobby if we're in deathmatch mode
                if (this.gameMode === 'deathmatch' && this.network.isConnected()) {
                    this.network.joinGame(this.playerName);
                    // Deathmatch uses random spawn
                    this.spawnPlayer();
                }
                // Team mode players don't spawn yet - wait for server to send spawn position
            }, 200);
        }
    }

    spawnPlayer() {
        const spawnIndex = Math.floor(Math.random() * this.camera.spawnPoints.length);
        const spawnPoint = this.camera.spawnPoints[spawnIndex];
        this.camera.getCamera().position.set(spawnPoint.x, spawnPoint.y, spawnPoint.z);

        // Initialize physics state
        if (this.input) {
            this.input.velocity.set(0, 0, 0);
            this.input.onGround = true;
        }

        this.camera.getCamera().rotation.set(0, 0, 0);
        this.input.yaw = 0;
        this.input.pitch = 0;

        this.camera.getCamera().updateMatrixWorld();
        
        // Give player a bomb (for testing)
        if (this.bombSystem) {
            this.bombSystem.giveBomb();
        }
        
        console.log('🎯 Player spawned at:', spawnPoint);
        console.log('📍 Total spawn points available:', this.camera.spawnPoints.length);
        console.log('🎲 Selected spawn index:', spawnIndex);
    }

    handleMove(position, rotation) {
        // Block movement during build phase in team mode
        if (this.gameMode === 'team' && this.isInBuildPhase) {
            return; // Don't move during build phase
        }
        
        if (this.network && this.gameStarted && this.isAlive) {
            this.network.sendMove(position, rotation);
        } else {
            console.log('Not sending - network:', !!this.network, 'gameStarted:', this.gameStarted, 'isAlive:', this.isAlive);
        }
    }

    handleShoot() {
        // Disable shooting in build mode or build phase
        if (this.isBuildMode) {
            return;
        }
        
        // Disable shooting during build phase in team mode
        if (this.gameMode === 'team' && this.isInBuildPhase) {
            return; // Can't shoot during build phase
        }
        
        // Disable shooting if bomb is equipped
        if (this.bombSystem && this.bombSystem.isEquipped) {
            return;
        }
        
        if (this.network && this.gameStarted && this.isAlive) {
            // Check if weapon can shoot
            if (!this.weaponSystem || !this.weaponSystem.canShoot()) {
                // Show low ammo warning if empty
                if (this.weaponSystem && this.weaponSystem.currentAmmo === 0) {
                    this.ammoDisplay.showLowAmmoWarning();
                }
                return;
            }

            // Shoot the weapon (consumes ammo, adds recoil)
            if (this.weaponSystem.shoot()) {
                const forward = new THREE.Vector3();
                this.camera.getCamera().getWorldDirection(forward);

                
                const startPos = this.camera.getPosition().clone();
                startPos.add(forward.clone().multiplyScalar(1)); 

                const target = startPos.clone().add(forward.multiplyScalar(1000));  

                this.bulletSystem.createBullet(startPos, target, true);

                this.checkHit(target);
                this.network.sendShoot(startPos, target);
                
                // Add camera recoil
                this.addCameraRecoil();
                
                // Update ammo display
                this.updateAmmoDisplay();
            }
        }
    }
    
    handleReload() {
        if (this.weaponSystem && this.gameStarted && this.isAlive) {
            if (this.weaponSystem.startReload()) {
                this.updateAmmoDisplay();
            }
        }
    }
    
    handleBombToggle() {
        if (this.bombSystem && this.gameStarted && this.isAlive) {
            const isEquipped = this.bombSystem.toggleBomb();
            if (isEquipped) {
                // Hide weapon when bomb is equipped
                if (this.weaponSystem) {
                    this.weaponSystem.hide();
                }
            } else {
                // Show weapon when bomb is unequipped
                if (this.weaponSystem) {
                    this.weaponSystem.show();
                }
            }
        }
    }
    
    handleBombDrop() {
        // Only allow dropping bomb when it's equipped (visible)
        if (this.bombSystem && this.bombSystem.hasBomb && this.bombSystem.isEquipped && this.gameStarted && this.isAlive) {
            // Send drop bomb request to server
            this.network.sendDropBomb();
            console.log('Dropping bomb...');
        } else if (this.bombSystem && this.bombSystem.hasBomb && !this.bombSystem.isEquipped) {
            console.log('Equip bomb with T first before dropping');
        }
    }
    
    handleBombPickup() {
        console.log(`Pickup attempt: canPickup=${this.bombSystem?.canPickupBomb}, gameStarted=${this.gameStarted}, isAlive=${this.isAlive}`);
        if (this.bombSystem && this.bombSystem.canPickupBomb && this.gameStarted && this.isAlive) {
            // Send pickup bomb request to server
            this.network.sendPickupBomb();
            console.log('Attempting to pick up bomb...');
        } else {
            console.log('Cannot pickup bomb - conditions not met');
        }
    }
    
    handleBombPlantStart() {
        if (this.bombSystem && this.gameStarted && this.isAlive) {
            if (this.bombSystem.isEquipped) {
                this.bombSystem.startPlanting();
            }
        }
    }
    
    handleBombPlantStop() {
        if (this.bombSystem && this.gameStarted && this.isAlive) {
            this.bombSystem.cancelPlanting();
        }
    }
    
    updateAmmoDisplay() {
        if (this.weaponSystem && this.ammoDisplay) {
            const ammoStatus = this.weaponSystem.getAmmoStatus();
            this.ammoDisplay.updateAmmo(ammoStatus.current, ammoStatus.max);
            this.ammoDisplay.updateReload(ammoStatus.isReloading, ammoStatus.reloadProgress);
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
            // No player hit - check for destructible wall hits
            this.checkWallHit(playerPosition, shootDirection);
        }

        
    }

    checkWallHit(shooterPos, shootDirection) {
        const raycaster = new THREE.Raycaster();
        raycaster.set(shooterPos, shootDirection);
        raycaster.far = 1000;

        // Get all objects in the scene
        const allObjects = [];
        this.scene.getScene().traverse((child) => {
            if (child.isMesh && child.userData.isDestructible) {
                allObjects.push(child);
            }
        });

        // Find the closest destructible wall hit
        const intersects = raycaster.intersectObjects(allObjects);
        
        if (intersects.length > 0) {
            const hit = intersects[0];
            const wall = hit.object;
            
            // Check if bullet is going through an existing hole
            const bulletPassesThrough = this.checkBulletThroughHole(wall, hit.point);
            
            if (!bulletPassesThrough) {
                // Create bullet hole at the hit position
                this.createBulletHole(wall, hit.point, hit.face.normal);
            } else {
                console.log('Bullet passed through existing hole!');
                
                // Visual feedback for bullet passing through
                this.createBulletPassThroughEffect(hit.point);
                
                // Bullet passes through - continue checking for hits beyond this wall
                this.checkBulletBeyondWall(shooterPos, shootDirection, hit.distance);
            }
        }
    }

    createBulletHole(wall, hitPoint, normal) {
        // Initialize bulletHoles array if it doesn't exist
        if (!wall.userData.bulletHoles) {
            wall.userData.bulletHoles = [];
        }
        
        // MAXIMUM 2 HOLES - after that, create decals instead
        if (wall.userData.bulletHoles.length >= 2) {
            console.log('🎯 Wall has 2 holes - creating decal instead');
            this.addBulletDecalToWall(wall, hitPoint, normal);
            return;
        }
        
        const holeRadius = 1.2;
        console.log('🔫 Creating hole in wall');
        
        // Convert hit point to wall's local coordinates
        const localHitPoint = wall.worldToLocal(hitPoint.clone());
        
        // Add the hole (max 2)
        wall.userData.bulletHoles.push({
            position: localHitPoint.clone(),
            normal: normal.clone(),
            radius: holeRadius
        });
        
        // Recreate wall geometry with holes
        this.recreateWallWithHoles(wall);
        
        console.log(`🕳️ Hole ${wall.userData.bulletHoles.length} of 2 created`);
    }
    
    addBulletDecalToWall(wall, hitPoint, normal) {
        // Use SAME system as normal bullet impacts - 3D sphere!
        const decalGeometry = new THREE.SphereGeometry(0.5, 8, 8);
        const decalMaterial = new THREE.MeshBasicMaterial({
            color: 0xffa500,  // Orange like normal bullets
            emissive: 0xffa500,
            emissiveIntensity: 1,
            transparent: true,
            opacity: 1,
            fog: false
        });
        
        const decal = new THREE.Mesh(decalGeometry, decalMaterial);
        
        // Position exactly like normal bullet system
        decal.position.copy(hitPoint);
        
        // Offset from wall surface (same as normal bullets)
        const offsetDirection = normal.clone().multiplyScalar(0.1);
        decal.position.add(offsetDirection);
        
        // Same render settings as normal bullets
        decal.renderOrder = 1000;
        decal.material.depthWrite = false;
        
        // Add to scene
        this.scene.getScene().add(decal);
        
        // Store decal reference for cleanup
        if (!wall.userData.decals) {
            wall.userData.decals = [];
        }
        wall.userData.decals.push(decal);
        
        // Same fade timing as normal bullet impacts (5 seconds)
        setTimeout(() => {
            // Fade out effect
            let opacity = 1;
            const fadeInterval = setInterval(() => {
                opacity -= 0.1;
                decal.material.opacity = opacity;
                
                if (opacity <= 0) {
                    clearInterval(fadeInterval);
                    this.scene.getScene().remove(decal);
                    decal.geometry.dispose();
                    decal.material.dispose();
                    
                    const index = wall.userData.decals.indexOf(decal);
                    if (index > -1) {
                        wall.userData.decals.splice(index, 1);
                    }
                }
            }, 50);
        }, 4000); // Start fade after 4 seconds
        
        console.log('🟠 Added normal bullet impact to wall');
    }

    recreateWallWithHoles(wall) {
        if (!wall.userData.bulletHoles || wall.userData.bulletHoles.length === 0) {
            return; // No holes to create
        }
        
        // Store original properties
        const originalMaterial = wall.material;
        const originalPosition = wall.position.clone();
        const originalRotation = wall.rotation.clone();
        
        // Store original wall dimensions (destructible walls are 20x20x2)
        if (!wall.userData.originalDimensions) {
            // First time - store dimensions
            wall.userData.originalDimensions = {
                width: 20,
                height: 20,
                depth: 2
            };
        }
        
        const dims = wall.userData.originalDimensions;
        
        // Create wall shape with correct orientation
        const shape = new THREE.Shape();
        shape.moveTo(-dims.width/2, -dims.height/2);
        shape.lineTo(dims.width/2, -dims.height/2);
        shape.lineTo(dims.width/2, dims.height/2);
        shape.lineTo(-dims.width/2, dims.height/2);
        shape.closePath();
        
        // Add simple circular holes
        for (const holeData of wall.userData.bulletHoles) {
            const hole = new THREE.Path();
            hole.arc(holeData.position.x, holeData.position.y, holeData.radius, 0, Math.PI * 2, true);
            shape.holes.push(hole);
        }
        
        // Create new geometry
        const extrudeSettings = {
            depth: dims.depth,
            bevelEnabled: false
        };
        
        const newGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        
        // Center the geometry
        newGeometry.translate(0, 0, -dims.depth/2);
        
        // Replace geometry
        wall.geometry.dispose();
        wall.geometry = newGeometry;
        
        // Restore original properties
        wall.material = originalMaterial;
        wall.position.copy(originalPosition);
        wall.rotation.copy(originalRotation);
        
        console.log(`✅ Wall updated with ${wall.userData.bulletHoles.length} hole(s)`);
    }

    updateWallCollisionBounds(wall) {
        // Update collision system to account for holes
        if (this.collisionSystem && wall.userData.isDestructibleWall) {
            // For now, keep the full collision bounds - bullets will use hole detection
            // In a more advanced system, we could create complex collision shapes
            console.log('🔧 Wall collision bounds updated (keeping full bounds for now)');
        }
    }

    createBulletPassThroughEffect(hitPoint) {
        // Create a brief yellow flash effect to show bullet passing through
        const flashGeometry = new THREE.SphereGeometry(0.3, 8, 8);
        const flashMaterial = new THREE.MeshBasicMaterial({
            color: 0xFFFF00,  // Bright yellow
            transparent: true,
            opacity: 0.8
        });
        
        const flash = new THREE.Mesh(flashGeometry, flashMaterial);
        flash.position.copy(hitPoint);
        this.scene.getScene().add(flash);
        
        // Animate flash and remove after short time
        let opacity = 0.8;
        const fadeOut = () => {
            opacity -= 0.1;
            flash.material.opacity = opacity;
            
            if (opacity <= 0) {
                this.scene.getScene().remove(flash);
                flash.geometry.dispose();
                flash.material.dispose();
            } else {
                requestAnimationFrame(fadeOut);
            }
        };
        
        // Start fade out after 100ms
        setTimeout(fadeOut, 100);
        
        console.log('🔥 Bullet passed through hole - showing flash effect!');
    }

    createBulletTrail(startPos, direction) {
        // Create visible bullet trail showing bullet continuing beyond wall
        const endPos = startPos.clone().add(direction.clone().multiplyScalar(50));
        
        const trail = new THREE.BufferGeometry();
        const positions = new Float32Array([
            startPos.x, startPos.y, startPos.z,
            endPos.x, endPos.y, endPos.z
        ]);
        trail.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const trailMaterial = new THREE.LineBasicMaterial({ 
            color: 0xFF0000,  // Red bullet trail
            transparent: true,
            opacity: 0.8
        });
        
        const line = new THREE.Line(trail, trailMaterial);
        this.scene.getScene().add(line);
        
        // Remove trail after short time
        setTimeout(() => {
            this.scene.getScene().remove(line);
            trail.dispose();
            trailMaterial.dispose();
        }, 200);
        
        console.log('🔴 Created red bullet trail through wall hole');
    }

    checkBulletThroughHole(wall, hitPoint) {
        // Convert hit point to wall's local coordinates for comparison
        const localHitPoint = wall.worldToLocal(hitPoint.clone());
        
        // Check if wall has bulletHoles array and if hit point is within any existing hole
        if (!wall.userData.bulletHoles || !Array.isArray(wall.userData.bulletHoles)) {
            return false; // No holes exist yet
        }
        
        for (const hole of wall.userData.bulletHoles) {
            const distance = localHitPoint.distanceTo(hole.position);
            
            // If bullet hits within the hole radius, it passes through
            if (distance <= hole.radius) {
                return true;
            }
        }
        
        return false;
    }

    checkBulletBeyondWall(shooterPos, shootDirection, wallDistance) {
        // Create a new raycast starting just beyond the wall  
        const beyondWallPos = shooterPos.clone().add(
            shootDirection.clone().multiplyScalar(wallDistance + 0.2)
        );
        
        // With real geometry holes, bullets naturally continue through empty space
        console.log('🎯 Checking for targets beyond destructible wall hole...');
        
        // Check for player hits beyond the wall
        const raycaster = new THREE.Raycaster();
        raycaster.set(beyondWallPos, shootDirection);
        raycaster.far = 1000 - wallDistance;

        let closestHit = null;
        let closestDistance = Infinity;

        this.playerManager.otherPlayers.forEach((player, playerId) => {
            const intersects = raycaster.intersectObject(player.mesh, false);
            if (intersects.length > 0) {
                const distance = intersects[0].distance;
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestHit = { playerId, player, distance };
                }
            }
        });

        if (closestHit) {
            console.log('Bullet hit player through wall hole!');
            this.addPlayerImpact(closestHit.player.mesh, beyondWallPos, shootDirection);
            const killed = this.playerManager.hitPlayer(closestHit.playerId);
            if (this.network) {
                this.network.sendHit(closestHit.playerId, killed);
            }
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

    handleMoneyUpdate(message) {
        if (message.player_id === this.network.playerId) {
            this.updatePlayerMoney(message.money);
            console.log(`Money updated to: $${message.money}`);
        }
    }
    
    handleShieldUpdate(message) {
        
        if (message.player_id === this.network.playerId) {
            this.shield = message.shield;
            this.updateHealthDisplay();
            console.log(`Shield regenerated to: ${this.shield}`);
        }
    }

    handlePlayerDied(message) {
        console.log('Player died message received:', message);
        
        // Use names from message if available, otherwise look them up
        const killerName = message.killer_name || this.getPlayerName(message.killer_id) || 'Unknown';
        const victimName = message.victim_name || this.getPlayerName(message.player_id) || 'Unknown';
        
        // Get team information (safely check if playerManager and players exist)
        const killerTeam = message.killer_team || (this.playerManager?.players?.[message.killer_id]?.team) || null;
        const victimTeam = message.victim_team || (this.playerManager?.players?.[message.player_id]?.team) || null;
        
        // Add to kill feed
        const isYouKiller = message.killer_id === this.network.playerId;
        const isYouVictim = message.player_id === this.network.playerId;
        console.log('Kill details:', { killerName, victimName, isYouKiller, isYouVictim, myPlayerId: this.network.playerId });
        this.killFeed.addKill(killerName, victimName, isYouKiller, isYouVictim, killerTeam, victimTeam);
        
        
        if (message.player_id === this.network.playerId) {
            this.isAlive = false;
            this.health = 0;
            this.activateDeathCam();

            
            if (this.weaponSystem) {
                this.weaponSystem.hide();
            }

            
            console.log(`You were killed by ${killerName}`);
            this.showDeathMessage(`Killed by ${killerName}`, 5);
        } else {
            
            this.playerManager.killPlayer(message.player_id);

            
            if (message.killer_id === this.network.playerId) {
                console.log('You are the killer - updating kill counter');
                console.log('Before kill update - kills:', this.kills);
                this.kills++;
                console.log('After kill increment - kills:', this.kills);
                this.updateKillCounter();
                console.log(`You killed ${victimName}! Kills: ${this.kills}`);
            } else {
                console.log('You are not the killer:', { killerId: message.killer_id, myId: this.network.playerId });
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
                this.weaponSystem.resetWeapon(); // Reset to full ammo
            }

            // Use the position from the server instead of random spawn
            this.camera.getCamera().position.set(message.player.x, message.player.y + 5, message.player.z);
            // Initialize physics state
            if (this.input) {
                this.input.velocity.set(0, 0, 0);
                this.input.onGround = true;
            }
            this.camera.getCamera().rotation.set(0, 0, 0);
            this.input.yaw = 0;
            this.input.pitch = 0;
            this.camera.getCamera().updateMatrixWorld();
            
            console.log(`You respawned at position (${message.player.x}, ${message.player.y}, ${message.player.z})`);
            this.hideDeathMessage();

            
            const healthContainer = document.getElementById('healthContainer');
            if (healthContainer) {
                healthContainer.style.display = 'block';
            }
            
            // Show ammo display when respawning
            if (this.ammoDisplay) {
                this.ammoDisplay.show();
            }
            
            this.updateHealthDisplay();
            this.updateAmmoDisplay(); // Update ammo display 
        } else {
            
            // Since players are now completely removed on death, we need to re-add them
            this.playerManager.respawnPlayer(message.player);
            console.log(`Player ${message.player.name} respawned`);
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
        
        // Hide ammo display during death cam
        if (this.ammoDisplay) {
            this.ammoDisplay.hide();
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
            // In team mode, don't show respawn button during rounds
            if (this.gameMode === 'team') {
                deathMsg.innerHTML = `
                    <div style="color: #ff6666; margin-bottom: 20px;">You were eliminated</div>
                    <div style="color: #888; font-size: 16px;">Waiting for round to end...</div>
                `;
            } else {
                // Deathmatch mode - show respawn button
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
                if (respawnBtn) {
                    respawnBtn.addEventListener('click', () => {
                        this.requestRespawn();
                    });
                }
            }
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

    createMoneyDisplay() {
        const moneyDisplay = document.createElement('div');
        moneyDisplay.id = 'moneyDisplay';
        moneyDisplay.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.85);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            color: rgba(255, 255, 255, 0.9);
            padding: 14px 18px;
            font-size: 13px;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            z-index: 100;
            backdrop-filter: blur(10px);
            display: none;
            flex-direction: column;
            align-items: flex-start;
            min-width: 100px;
        `;
        moneyDisplay.innerHTML = `
            <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.6; margin-bottom: 2px;">Money</div>
            <div style="font-size: 24px; font-weight: 300; color: #4CAF50; line-height: 1;">$${this.playerMoney}</div>
        `;
        document.body.appendChild(moneyDisplay);
    }
    
    updatePlayerMoney(amount) {
        this.playerMoney = amount;
        const moneyDisplay = document.getElementById('moneyDisplay');
        if (moneyDisplay) {
            moneyDisplay.innerHTML = `
                <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.6; margin-bottom: 2px;">Money</div>
                <div style="font-size: 24px; font-weight: 300; color: #4CAF50; line-height: 1;">$${this.playerMoney}</div>
            `;
        }
        
        // Also update build mode money
        this.buildMoney = amount;
        this.updateMoneyDisplay();
    }

    updateKillCounter() {
        
        let killCounter = document.getElementById('killCounter');
        if (!killCounter) {
            killCounter = document.createElement('div');
            killCounter.id = 'killCounter';
            killCounter.style.cssText = `
                position: fixed;
                top: 280px;
                right: 20px;
                background: rgba(0, 0, 0, 0.85);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                color: rgba(255, 255, 255, 0.9);
                padding: 14px 18px;
                font-size: 13px;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                z-index: 100;
                min-width: 80px;
                backdrop-filter: blur(10px);
                display: flex;
                align-items: center;
                gap: 8px;
            `;
            document.body.appendChild(killCounter);
        }
        killCounter.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: flex-start;">
                <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.6; margin-bottom: 2px;">Eliminations</div>
                <div style="font-size: 24px; font-weight: 300; color: #4CAF50; line-height: 1;">${this.kills}</div>
            </div>
        `;
    }

    updateRoundDisplay() {
        let roundContainer = document.getElementById('roundContainer');
        if (!roundContainer) {
            roundContainer = document.createElement('div');
            roundContainer.id = 'roundContainer';
            roundContainer.style.cssText = `
                position: fixed;
                top: 20px;
                left: 20px;
                color: white;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                z-index: 100;
                background: rgba(0, 0, 0, 0.85);
                padding: 20px;
                border-radius: 12px;
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                min-width: 200px;
            `;
            document.body.appendChild(roundContainer);
        }
        
        let content = `
            <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.6; margin-bottom: 8px;">
                Round ${this.roundNumber}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div style="display: flex; align-items: center;">
                    <div style="width: 8px; height: 8px; background: #ff9900; border-radius: 50%; margin-right: 8px;"></div>
                    <span style="font-size: 24px; font-weight: 600;">${this.orangeScore}</span>
                </div>
                <div style="font-size: 14px; opacity: 0.4;">VS</div>
                <div style="display: flex; align-items: center;">
                    <span style="font-size: 24px; font-weight: 600;">${this.redScore}</span>
                    <div style="width: 8px; height: 8px; background: #ff4444; border-radius: 50%; margin-left: 8px;"></div>
                </div>
            </div>
        `;
        
        if (this.isInBuildPhase && this.buildPhaseTimer) {
            content += `
                <div style="border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 12px; margin-top: 12px;">
                    <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.6; margin-bottom: 4px;">
                        Build Phase
                    </div>
                    <div style="font-size: 28px; font-weight: 300; color: #4CAF50;">
                        ${this.buildPhaseTimer}
                    </div>
                    <div style="font-size: 11px; opacity: 0.4; margin-top: 4px;">
                        Press B for build menu
                    </div>
                </div>
            `;
        }
        
        roundContainer.innerHTML = content;
    }
    
    startBuildPhaseTimer(seconds) {
        this.isInBuildPhase = true;
        this.buildPhaseTimer = seconds;
        
        const interval = setInterval(() => {
            this.buildPhaseTimer--;
            this.updateRoundDisplay();
            
            if (this.buildPhaseTimer <= 0) {
                clearInterval(interval);
                this.isInBuildPhase = false;
                this.buildPhaseTimer = null;
                this.updateRoundDisplay();
            }
        }, 1000);
    }
    
    updateHealthDisplay() {
        
        let healthContainer = document.getElementById('healthContainer');
        if (!healthContainer) {
            healthContainer = document.createElement('div');
            healthContainer.id = 'healthContainer';
            healthContainer.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: rgba(0, 0, 0, 0.85);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                color: rgba(255, 255, 255, 0.9);
                padding: 14px 18px;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                backdrop-filter: blur(10px);
                z-index: 100;
                display: flex;
                flex-direction: column;
                gap: 12px;
                min-width: 120px;
            `;
            document.body.appendChild(healthContainer);

            
            // Shield display
            const shieldContainer = document.createElement('div');
            shieldContainer.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                gap: 4px;
            `;
            
            const shieldText = document.createElement('div');
            shieldText.id = 'shieldText';
            shieldText.innerHTML = `
                <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.6; margin-bottom: 2px;">Shield</div>
                <div style="font-size: 20px; font-weight: 600; color: #ff8c00; line-height: 1;">${this.shield}</div>
            `;
            
            const shieldBarContainer = document.createElement('div');
            shieldBarContainer.style.cssText = `
                width: 100px;
                height: 4px;
                background: rgba(255, 140, 0, 0.2);
                border-radius: 2px;
                overflow: hidden;
            `;
            
            const shieldBar = document.createElement('div');
            shieldBar.id = 'shieldBar';
            shieldBar.style.cssText = `
                height: 100%;
                background: #ff8c00;
                width: ${(this.shield / this.maxShield) * 100}%;
                transition: width 0.3s ease;
                border-radius: 2px;
            `;
            
            shieldBarContainer.appendChild(shieldBar);
            shieldContainer.appendChild(shieldText);
            shieldContainer.appendChild(shieldBarContainer);
            healthContainer.appendChild(shieldContainer);

            
            // Health display
            const healthContainerDiv = document.createElement('div');
            healthContainerDiv.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                gap: 4px;
            `;
            
            const healthText = document.createElement('div');
            healthText.id = 'healthText';
            healthText.innerHTML = `
                <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.6; margin-bottom: 2px;">Health</div>
                <div style="font-size: 20px; font-weight: 600; color: #4CAF50; line-height: 1;">${this.health}</div>
            `;
            
            const healthBarContainer = document.createElement('div');
            healthBarContainer.style.cssText = `
                width: 100px;
                height: 4px;
                background: rgba(76, 175, 80, 0.2);
                border-radius: 2px;
                overflow: hidden;
            `;
            
            const healthBar = document.createElement('div');
            healthBar.id = 'healthBar';
            healthBar.style.cssText = `
                height: 100%;
                background: #4CAF50;
                width: ${this.health}%;
                transition: width 0.3s ease;
                border-radius: 2px;
            `;
            
            healthBarContainer.appendChild(healthBar);
            healthContainerDiv.appendChild(healthText);
            healthContainerDiv.appendChild(healthBarContainer);
            healthContainer.appendChild(healthContainerDiv);
        }

        
        // Update health and shield text displays and bars
        const healthText = document.getElementById('healthText');
        const shieldText = document.getElementById('shieldText');
        const healthBar = document.getElementById('healthBar');
        const shieldBar = document.getElementById('shieldBar');

        if (healthText) {
            healthText.innerHTML = `
                <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.6; margin-bottom: 2px;">Health</div>
                <div style="font-size: 20px; font-weight: 600; color: #4CAF50; line-height: 1;">${this.health}</div>
            `;
        }

        if (shieldText) {
            shieldText.innerHTML = `
                <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.6; margin-bottom: 2px;">Shield</div>
                <div style="font-size: 20px; font-weight: 600; color: #ff8c00; line-height: 1;">${Math.round(this.shield)}</div>
            `;
        }

        // Update health bar
        if (healthBar) {
            healthBar.style.width = `${this.health}%`;
        }

        // Update shield bar
        if (shieldBar) {
            shieldBar.style.width = `${(this.shield / this.maxShield) * 100}%`;
        }

        
        // Apply color changes based on health/shield levels
        if (healthText) {
            const healthValue = healthText.querySelector('div:last-child');
            if (this.health <= 25) {
                healthValue.style.color = '#ff4444';
                if (healthBar) healthBar.style.background = '#ff4444';
            } else if (this.health <= 50) {
                healthValue.style.color = '#ffaa44';
                if (healthBar) healthBar.style.background = '#ffaa44';
            } else {
                healthValue.style.color = '#4CAF50';
                if (healthBar) healthBar.style.background = '#4CAF50';
            }
        }

        if (shieldText) {
            const shieldValue = shieldText.querySelector('div:last-child');
            if (this.shield <= 0) {
                shieldValue.style.opacity = '0.5';
                if (shieldBar) shieldBar.style.opacity = '0.5';
            } else {
                shieldValue.style.opacity = '1';
                if (shieldBar) shieldBar.style.opacity = '1';
            }
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
                if (this.isBuildMode) {
                    this.updateBuildModeMovement(deltaTime);
                } else {
                    this.input.updateMovement(deltaTime, this.camera);
                    this.updateCameraRecoil(deltaTime);
                }
                
                // Map boundary check disabled for now - simple flat map
                // if (this.gameMode === 'team') {
                //     const playerPos = this.camera.getPosition();
                //     const distanceFromCenter = Math.sqrt(playerPos.x * playerPos.x + playerPos.z * playerPos.z);
                //     
                //     const mapRadius = this.mapBuilder?.getMapRadius() || 800;
                //     if (distanceFromCenter > mapRadius) {
                //         this.takeDamage(100, 'fall-off');
                //     }
                // }
            }

            this.bulletSystem.update(deltaTime);
            

            
            if (this.weaponSystem) {
                this.weaponSystem.update(deltaTime);
                // Update ammo display during reload or when ammo changes
                this.updateAmmoDisplay();
            }
            
            // Update bomb system
            if (this.bombSystem) {
                this.bombSystem.update(deltaTime);
            }

            
            if (this.miniMap) {
                const playerPos = this.camera.getPosition();
                
                const cameraRotation = this.input.yaw;

                // Only update minimap and compass if not in build mode

                if (!this.isBuildMode) {
                    this.miniMap.update(playerPos, cameraRotation);
                    this.compass.update(cameraRotation);
                }
            }

            
            this.renderer.getRenderer().autoClear = true;

            
            this.renderer.render(this.scene.getScene(), this.camera.getCamera());

            
            if (this.miniMap && !this.isBuildMode) {
                this.miniMap.render();
            }
        }
    }

    handleScoreboard(show) {
        if (show) {
            this.scoreboard.show();
        } else {
            this.scoreboard.hide();
        }
    }

    handleScoreboardUpdate(data) {
        console.log('handleScoreboardUpdate called with data:', data);
        console.log('Current player ID:', this.network.playerId);
        const playersData = data.players.map(player => ({
            name: player.name,
            kills: player.kills,
            isCurrentPlayer: player.id === this.network.playerId
        }));
        console.log('Processed players data:', playersData);
        
        this.scoreboard.updatePlayers(playersData);
    }
    
    addCameraRecoil() {
        // Add upward and random horizontal recoil
        this.cameraRecoil.x += (Math.random() - 0.5) * 0.01; // Random horizontal
        this.cameraRecoil.y += 0.015; // Upward recoil
        
        // Apply recoil to input manager's pitch/yaw
        if (this.input) {
            this.input.pitch = Math.max(-Math.PI/2 + 0.1, this.input.pitch + this.cameraRecoil.y);
            this.input.yaw += this.cameraRecoil.x;
        }
    }
    
    updateCameraRecoil(deltaTime) {
        // Gradually reduce recoil
        this.cameraRecoil.x *= (1 - this.recoilRecovery);
        this.cameraRecoil.y *= (1 - this.recoilRecovery);
        
        // Stop very small recoil
        if (Math.abs(this.cameraRecoil.x) < 0.001) this.cameraRecoil.x = 0;
        if (Math.abs(this.cameraRecoil.y) < 0.001) this.cameraRecoil.y = 0;
    }
    
    checkForDirectMapAccess() {
        // Check URL for direct map builder access
        const urlParams = new URLSearchParams(window.location.search);
        const mapBuilder = urlParams.get('mapbuilder');
        const hash = window.location.hash;
        
        if (mapBuilder === 'orange' || hash === '#mapbuilder' || window.location.pathname.includes('mapbuilder')) {
            console.log('🗺️ Direct map builder access detected - loading orange planet map');
            this.loadDirectMapBuilder();
        }
    }
    
    loadDirectMapBuilder() {
        // Hide all UI elements except game container
        document.getElementById('nameScreen').style.display = 'none';
        document.getElementById('mapSelection').style.display = 'none';
        document.getElementById('teamSelectionScreen').style.display = 'none';
        document.getElementById('gameContainer').style.display = 'block';
        
        // Set game mode and map for orange planet
        this.gameMode = 'team';
        this.mapType = 'orangePlanet';
        this.playerName = 'MapBuilder';
        
        // Start the game directly with orange planet map
        console.log('🚀 Starting direct map builder mode');
        this.startGame();
        
        // Force spawn position to be inside the map for map builder mode
        setTimeout(() => {
            console.log('Setting map builder spawn position to (0, 10, 0) - center of map');
            if (this.camera && this.camera.getCamera()) {
                this.camera.getCamera().position.set(0, 10, 0);
            }
            if (this.input) {
                this.input.position.set(0, 10, 0);
            }
        }, 500);
        
        // Add instructions in console
        console.log('🎮 Map Builder Mode Active!');
        console.log('📍 Use WASD to move around the orange planet map');
        console.log('🖱️ Click to enable movement controls');
        console.log('🔨 Press B to enter build mode with sky camera');
        console.log('🔧 You can now build step by step with the developer');
    }
    
    toggleBuildMode() {
        if (!this.gameStarted || !this.isAlive) return;
        
        // If already in build mode, always allow exiting
        if (this.isBuildMode) {
            this.isBuildMode = false;
            this.exitBuildMode();
            return;
        }
        
        // Only allow entering build mode during build phase in team games
        if (this.gameMode === 'team' && !this.isInBuildPhase) {
            console.log('⚠️ Build mode only available during build phase');
            return;
        }
        
        this.isBuildMode = true;
        this.enterBuildMode();
    }
    
    enterBuildMode() {
        console.log('🔨 Entering build mode - switching to bird view camera');
        
        this.isBuildMode = true;
        
        // Sync build money with player money
        this.buildMoney = this.playerMoney;
        
        // Save current camera state
        this.savedCameraPosition = this.camera.getPosition().clone();
        this.savedCameraRotation = {
            yaw: this.input.yaw,
            pitch: this.input.pitch
        };
        
        // Set camera to bird view position - higher up and centered over map
        this.camera.getCamera().position.set(0, 300, 100); // Higher and slightly back for better view
        this.camera.getCamera().lookAt(0, 0, 0); // Look at map center
        
        // Update input manager rotation to match bird view
        this.input.yaw = 0;
        this.input.pitch = -Math.PI / 3; // 60 degree angle down (not straight down)
        
        // Exit pointer lock for easier UI interaction
        this.input.isPointerLocked = false;
        document.exitPointerLock();
        
        // Auto-select barrier and enable drag mode immediately
        this.selectedWallType = 'barrier';
        this.isDragModeEnabled = true;
        
        // Set wall cursor since barrier is auto-selected
        this.setWallCursor();
        
        // Hide all game UI elements
        this.hideGameUI();
        
        // Show build mode UI
        this.showBuildModeUI();
        
        // Show money display in build mode
        const moneyDisplay = document.getElementById('moneyDisplay');
        if (moneyDisplay) {
            moneyDisplay.style.display = 'flex';
        }
        
        // Don't setup wall placement system - only drag from UI allowed
        // this.setupWallPlacement();
        
        console.log('Build mode ready - barrier selected, drag mode enabled');
    }
    
    exitBuildMode() {
        console.log('🎮 Exiting build mode - returning to normal camera');
        
        // Reset build mode flag
        this.isBuildMode = false;
        
        // Restore camera state
        if (this.savedCameraPosition && this.savedCameraRotation) {
            this.camera.getCamera().position.copy(this.savedCameraPosition);
            this.input.yaw = this.savedCameraRotation.yaw;
            this.input.pitch = this.savedCameraRotation.pitch;
            
            // Apply saved rotation to camera
            const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.input.yaw);
            const pitchQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.input.pitch);
            this.camera.getCamera().quaternion.copy(yawQuaternion).multiply(pitchQuaternion);
            
            // Immediately update compass to reflect restored rotation
            if (this.compass) {
                this.compass.update(this.input.yaw);
            }
        }
        
        // Hide build mode UI
        this.hideBuildModeUI();
        
        // Hide money display when exiting build mode
        const moneyDisplay = document.getElementById('moneyDisplay');
        if (moneyDisplay) {
            moneyDisplay.style.display = 'none';
        }
        
        // Show game UI again
        this.showGameUI();
        
        // Restore default cursor
        document.body.style.cursor = 'default';
    }
    
    showBuildModeUI() {
        // Create main build UI container
        let buildUI = document.getElementById('buildModeUI');
        if (!buildUI) {
            buildUI = document.createElement('div');
            buildUI.id = 'buildModeUI';
            buildUI.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none !important;
                z-index: 1000;
                font-family: Arial, sans-serif;
            `;
            document.body.appendChild(buildUI);
        }
        
        // Ensure canvas has proper pointer events for cursor visibility
        const canvas = document.querySelector('#gameContainer canvas');
        if (canvas) {
            canvas.style.pointerEvents = 'auto';
        }
        
        buildUI.innerHTML = `
            <!-- Exit Instructions (Top Right) -->
            <div style="
                position: absolute;
                top: 30px;
                right: 30px;
                background: rgba(0, 0, 0, 0.7);
                color: white;
                padding: 12px 20px;
                border-radius: 6px;
                pointer-events: auto;
                font-size: 14px;
                border: 1px solid #333;
            ">
                Press B to exit
            </div>
            
            <!-- Minimalist Wall Selection (Left Side) -->
            <div style="
                position: absolute;
                top: 220px;
                left: 30px;
                background: rgba(0, 0, 0, 0.9);
                color: white;
                padding: 20px;
                border-radius: 4px;
                pointer-events: auto;
                width: 180px;
                border: 1px solid rgba(255, 255, 255, 0.1);
            ">
                <div style="margin-bottom: 16px; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: #fff; font-weight: 500;">
                    Build
                </div>
                
                <div class="wall-option" data-wall="barrier" style="
                    background: transparent;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    margin: 0 0 8px 0;
                    padding: 12px;
                    border-radius: 2px;
                    cursor: pointer;
                    transition: all 0.15s;
                    user-select: none;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <div style="pointer-events: none;">
                        <div style="font-size: 13px; font-weight: 500;">Barrier</div>
                    </div>
                    <div style="color: #999; font-size: 12px; pointer-events: none;">$100</div>
                </div>
                
                <div class="wall-option" data-wall="large" style="
                    background: transparent;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    margin: 0 0 8px 0;
                    padding: 12px;
                    border-radius: 2px;
                    cursor: pointer;
                    transition: all 0.15s;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <div>
                        <div style="font-size: 13px; font-weight: 500;">Large Wall</div>
                    </div>
                    <div style="color: #999; font-size: 12px;">$200</div>
                </div>
                
                <div class="wall-option" data-wall="destructible" style="
                    background: transparent;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    margin: 0 0 8px 0;
                    padding: 12px;
                    border-radius: 2px;
                    cursor: pointer;
                    transition: all 0.15s;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <div>
                        <div style="font-size: 13px; font-weight: 500;">Destructible</div>
                    </div>
                    <div style="color: #999; font-size: 12px;">$50</div>
                </div>
                
                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                    <div style="color: #666; font-size: 10px; margin-bottom: 4px;">[R] Rotate</div>
                    <div style="color: #666; font-size: 10px;">Click & Drag</div>
                </div>
            </div>
        `;
        
        // Add click handlers for wall selection
        this.setupWallSelection();
        
        buildUI.style.display = 'block';
    }
    
    setupWallSelection() {
        const wallOptions = document.querySelectorAll('.wall-option');
        wallOptions.forEach(option => {
            const wallType = option.getAttribute('data-wall');
            
            // Setup drag for both barrier AND large walls
            if (wallType === 'barrier' || wallType === 'large' || wallType === 'destructible') {
                // Start drag from UI panel
                option.addEventListener('mousedown', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    console.log(`Starting drag from ${wallType} wall UI`);
                    
                    // Enable dragging mode
                    this.selectedWallType = wallType;
                    this.isDraggingFromUI = true;
                    
                    // Create floating wall preview that follows mouse
                    this.createFloatingWallPreview();
                    
                    // Set drag cursor
                    this.setDragCursor();
                    
                    // Add global mouse move and up handlers
                    this.setupGlobalDragHandlers();
                    
                    // PREVENT cursor from being hidden
                    document.addEventListener('click', this.preventCursorHide, true);
                });
            }
            
            // Hover effects
            option.addEventListener('mouseenter', () => {
                if (!option.classList.contains('selected')) {
                    option.style.background = 'rgba(255, 255, 255, 0.1)';
                    option.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                }
            });
            
            option.addEventListener('mouseleave', () => {
                if (!option.classList.contains('selected')) {
                    option.style.background = 'transparent';
                    option.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                }
            });
        });
    }
    
    selectWallType(wallType) {
        // Remove previous selection
        document.querySelectorAll('.wall-option').forEach(option => {
            option.classList.remove('selected');
            option.style.background = 'transparent';
            option.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        });
        
        // Mark new selection
        const selectedOption = document.querySelector(`[data-wall="${wallType}"]`);
        if (selectedOption) {
            selectedOption.classList.add('selected');
            selectedOption.style.background = 'rgba(255, 255, 255, 0.2)';
            selectedOption.style.border = '1px solid rgba(255, 255, 255, 0.4)';
        }
        
        this.selectedWallType = wallType;
        console.log(`Selected wall type: ${wallType}`);
        
        // Enable drag mode and set cursor for wall building
        if (wallType === 'barrier') {
            this.isDragModeEnabled = true;
            this.setWallCursor();
            console.log('Drag mode enabled - you can now click and drag to place walls');
        } else {
            this.isDragModeEnabled = false;
        }
    }
    
    hideBuildModeUI() {
        const buildUI = document.getElementById('buildModeUI');
        if (buildUI) {
            buildUI.style.display = 'none';
        }
        
        // Reset cursor
        document.body.style.cursor = 'default';
        this.selectedWallType = null;
        
        // Remove wall placement listeners
        this.removeWallPlacement();
        
        // Reset cursor
        document.body.style.cursor = 'default';
    }
    
    setCustomCursor() {
        // Create orange crosshair cursor for build mode
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        
        // Draw orange crosshair
        ctx.strokeStyle = '#ff6b35';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        
        // Horizontal line
        ctx.beginPath();
        ctx.moveTo(8, 16);
        ctx.lineTo(24, 16);
        ctx.stroke();
        
        // Vertical line
        ctx.beginPath();
        ctx.moveTo(16, 8);
        ctx.lineTo(16, 24);
        ctx.stroke();
        
        // Center dot
        ctx.fillStyle = '#ff6b35';
        ctx.beginPath();
        ctx.arc(16, 16, 2, 0, 2 * Math.PI);
        ctx.fill();
        
        // Set cursor
        const dataURL = canvas.toDataURL();
        document.body.style.cursor = `url(${dataURL}) 16 16, auto`;
    }
    
    setWallCursor() {
        // Create big black mouse cursor like editor
        const canvas = document.createElement('canvas');
        canvas.width = 48;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        
        // Draw big black arrow cursor
        ctx.fillStyle = '#000000';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        
        // Draw arrow shape (large pointer)
        ctx.beginPath();
        ctx.moveTo(8, 8);
        ctx.lineTo(8, 28);
        ctx.lineTo(14, 24);
        ctx.lineTo(20, 36);
        ctx.lineTo(24, 34);
        ctx.lineTo(18, 22);
        ctx.lineTo(28, 22);
        ctx.closePath();
        ctx.fill();
        
        // Add white outline for visibility
        ctx.stroke();
        
        const dataURL = canvas.toDataURL();
        document.body.style.cursor = `url(${dataURL}) 8 8, auto`;
        
        // Force cursor to stay visible
        document.body.style.pointerEvents = 'auto';
    }
    
    setDragCursor() {
        // Create bigger black dragging cursor with placement indicator
        const canvas = document.createElement('canvas');
        canvas.width = 48;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        
        // Draw black placement crosshair
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        
        // Draw cross
        ctx.beginPath();
        // Vertical line
        ctx.moveTo(24, 8);
        ctx.lineTo(24, 40);
        // Horizontal line
        ctx.moveTo(8, 24);
        ctx.lineTo(40, 24);
        ctx.stroke();
        
        // Add white outline for visibility
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Draw corner brackets to indicate placement area
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Top-left bracket
        ctx.moveTo(12, 16);
        ctx.lineTo(12, 12);
        ctx.lineTo(16, 12);
        // Top-right bracket
        ctx.moveTo(32, 12);
        ctx.lineTo(36, 12);
        ctx.lineTo(36, 16);
        // Bottom-left bracket
        ctx.moveTo(12, 32);
        ctx.lineTo(12, 36);
        ctx.lineTo(16, 36);
        // Bottom-right bracket
        ctx.moveTo(32, 36);
        ctx.lineTo(36, 36);
        ctx.lineTo(36, 32);
        ctx.stroke();
        
        // Center dot
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(24, 24, 3, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        const dataURL = canvas.toDataURL();
        document.body.style.cursor = `url(${dataURL}) 24 24, auto`;
    }
    
    createFloatingWallPreview() {
        // Remove any existing floating preview
        this.clearFloatingWallPreview();
        
        // Create wall dimensions based on type
        // Barrier = 1 grid cell (10x10), Large wall = 2x2 grid cells (20x20), Destructible = 2x2 cells (20x20)
        let width, height, depth;
        if (this.selectedWallType === 'large') {
            width = 20;  // Large wall width (2 grid cells)
            height = 20; // Large wall height
            depth = 2;   // Thin wall depth (matches placed wall)
        } else if (this.selectedWallType === 'destructible') {
            width = 20;  // Destructible wall width (2 grid cells)
            height = 20; // Destructible wall height
            depth = 2;   // Thin wall depth
        } else {
            width = 10;  // Barrier width (1 grid cell)
            height = 10; // Barrier height
            depth = 2;   // Thin wall depth
        }
        
        // Create a green wall mesh that follows the mouse
        const wallGeometry = new THREE.BoxGeometry(width, height, depth);
        const wallMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x00ff00,  // Green color
            transparent: true, 
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        
        this.floatingWallPreview = new THREE.Mesh(wallGeometry, wallMaterial);
        this.floatingWallPreview.layers.set(1); // Put on layer 1 to avoid raycasting
        this.floatingWallPreview.rotation.y = this.currentWallRotation; // Set initial rotation
        this.scene.getScene().add(this.floatingWallPreview);
        
        console.log(`Created floating green ${this.selectedWallType} wall preview with rotation:`, Math.round(this.currentWallRotation * 180 / Math.PI) + '°');
    }
    
    clearFloatingWallPreview() {
        if (this.floatingWallPreview) {
            console.log('CLEANUP: Removing floating wall preview from scene');
            this.scene.getScene().remove(this.floatingWallPreview);
            this.floatingWallPreview.geometry.dispose();
            this.floatingWallPreview.material.dispose();
            this.floatingWallPreview = null;
            console.log('CLEANUP: Floating wall preview completely removed');
        } else {
            console.log('CLEANUP: No floating wall preview to remove');
        }
    }
    
    setupGlobalDragHandlers() {
        // Store handlers so we can remove them later
        this.globalDragHandlers = {
            mousemove: (event) => this.onGlobalDragMove(event),
            mouseup: (event) => this.onGlobalDragEnd(event),
            keydown: (event) => this.onBuildModeKeyDown(event)
        };
        
        // Add to document for global tracking
        document.addEventListener('mousemove', this.globalDragHandlers.mousemove);
        document.addEventListener('mouseup', this.globalDragHandlers.mouseup);
        document.addEventListener('keydown', this.globalDragHandlers.keydown);
    }
    
    removeGlobalDragHandlers() {
        if (this.globalDragHandlers) {
            document.removeEventListener('mousemove', this.globalDragHandlers.mousemove);
            document.removeEventListener('mouseup', this.globalDragHandlers.mouseup);
            document.removeEventListener('keydown', this.globalDragHandlers.keydown);
            this.globalDragHandlers = null;
        }
    }
    
    onBuildModeKeyDown(event) {
        // Handle R key for rotation during drag
        if (event.code === 'KeyR') {
            event.preventDefault();
            // Rotate 90 degrees (PI/2 radians)
            this.currentWallRotation += Math.PI / 2;
            // Keep rotation between 0 and 2*PI
            if (this.currentWallRotation >= Math.PI * 2) {
                this.currentWallRotation = 0;
            }
            
            // Update preview rotation if it exists
            if (this.floatingWallPreview) {
                this.floatingWallPreview.rotation.y = this.currentWallRotation;
            }
            
            console.log(`Wall rotation: ${Math.round(this.currentWallRotation * 180 / Math.PI)}°`);
        }
    }
    
    onGlobalDragMove(event) {
        if (!this.isDraggingFromUI || !this.floatingWallPreview) {
            if (!this.isDraggingFromUI) console.log('DRAG MOVE: Not dragging from UI, ignoring');
            if (!this.floatingWallPreview) console.log('DRAG MOVE: No floating preview, ignoring');
            return;
        }
        
        // Update floating wall position to follow mouse in 3D space
        const mapPosition = this.getMapPositionFromMouse(event);
        if (mapPosition) {
            // SNAP TO GRID - like Fortnite
            const snappedPosition = this.snapToGrid(mapPosition);
            
            // Set Y position based on wall type
            let yPos;
            if (this.selectedWallType === 'large') {
                yPos = 10; // Large walls at standard height
                yPos = 1.5; // Ramps at ground level for walking
            } else if (this.selectedWallType === 'destructible') {
                yPos = 10; // Destructible walls at standard height
            } else {
                yPos = 5; // Barriers at waist height
            }
            
            // Check if we can place at this position
            const canPlace = this.canPlaceWallAtPosition(snappedPosition, this.selectedWallType);
            
            // Change preview color based on placement validity
            if (canPlace) {
                this.floatingWallPreview.material.color.setHex(0x00ff00); // Green = can place
                this.floatingWallPreview.material.opacity = 0.5;
            } else {
                this.floatingWallPreview.material.color.setHex(0xff0000); // Red = cannot place
                this.floatingWallPreview.material.opacity = 0.3;
            }
            
            // Update preview position (snapped to grid)
            this.floatingWallPreview.position.set(snappedPosition.x, yPos, snappedPosition.z);
            // Keep rotation fixed - only changes with R key
            this.floatingWallPreview.rotation.y = this.currentWallRotation;
        }
    }
    
    onGlobalDragEnd(event) {
        if (!this.isDraggingFromUI) return;
        
        // Get drop position
        const mapPosition = this.getMapPositionFromMouse(event);
        if (mapPosition) {
            // Snap to grid and check if placement is valid
            const snappedPosition = this.snapToGrid(mapPosition);
            
            if (this.canPlaceWallAtPosition(snappedPosition, this.selectedWallType)) {
                // Place the wall at snapped grid position
                this.placeWallAtPosition(snappedPosition, this.currentWallRotation);
            } else {
                console.log('Cannot place wall here - position occupied or invalid');
            }
        }
        
        // Clean up - COMPLETE RESET
        console.log('CLEANUP: Starting complete cleanup after wall drop...');
        
        this.isDraggingFromUI = false;
        this.clearFloatingWallPreview();
        this.removeGlobalDragHandlers();
        
        // IMPORTANT: Reset ALL wall selection state
        this.selectedWallType = null;
        this.clearWallSelections(); // Clear UI selections too
        
        console.log('CLEANUP: Wall selection and preview cleared');
        
        // Remove the prevent cursor hide listener
        document.removeEventListener('click', this.preventCursorHide, true);
        
        // CRITICAL: Exit pointer lock if active
        if (document.pointerLockElement) {
            console.log('Pointer lock is active, exiting it...');
            document.exitPointerLock();
        }
        
        // Ensure pointer lock is not active in input manager
        if (this.input) {
            this.input.isPointerLocked = false;
        }
        
        // FORCE remove all cursor styles that might be hiding it
        const allElements = document.querySelectorAll('*');
        allElements.forEach(el => {
            if (el.style && el.style.cursor === 'none') {
                el.style.cursor = '';
            }
        });
        
        // Restore our custom wall cursor (big black arrow)
        setTimeout(() => {
            this.setWallCursor();
            
            // Ensure pointer events work
            document.body.style.pointerEvents = 'auto';
            const canvas = document.querySelector('#gameContainer canvas');
            if (canvas) {
                canvas.style.pointerEvents = 'auto';
            }
            
            console.log('After drop - Restored custom black cursor');
        }, 50);
        
        console.log('Drag completed - Restoring custom cursor');
    }
    
    // Grid system functions
    snapToGrid(position) {
        // Snap position to grid
        const snappedX = Math.round(position.x / this.gridSize) * this.gridSize;
        const snappedZ = Math.round(position.z / this.gridSize) * this.gridSize;
        return { x: snappedX, y: position.y, z: snappedZ };
    }
    
    getGridKey(position) {
        // Create unique key for grid position
        const gridX = Math.round(position.x / this.gridSize);
        const gridZ = Math.round(position.z / this.gridSize);
        return `${gridX}_${gridZ}`;
    }
    
    canPlaceWallAtPosition(position, wallType) {
        const gridPos = this.snapToGrid(position);
        const gridX = Math.round(gridPos.x / this.gridSize);
        const gridZ = Math.round(gridPos.z / this.gridSize);
        
        if (wallType === 'large' || wallType === 'destructible') {
            // Large wall and destructible wall take 2x2 grid spaces
            const keysToCheck = [
                `${gridX}_${gridZ}`,
                `${gridX + 1}_${gridZ}`,
                `${gridX}_${gridZ + 1}`,
                `${gridX + 1}_${gridZ + 1}`
            ];
            
            // Check if any of the 4 positions are occupied
            for (const key of keysToCheck) {
                if (this.placedWallPositions.has(key)) {
                    return false;
                }
            }
        } else {
            // Barrier takes 1 grid space
            const gridKey = `${gridX}_${gridZ}`;
            if (this.placedWallPositions.has(gridKey)) {
                return false;
            }
        }
        
        return true;
    }
    
    markGridAsOccupied(position, wallType) {
        const gridPos = this.snapToGrid(position);
        const gridX = Math.round(gridPos.x / this.gridSize);
        const gridZ = Math.round(gridPos.z / this.gridSize);
        
        if (wallType === 'large' || wallType === 'destructible') {
            // Large wall and destructible wall occupy 2x2 grid spaces
            const keysToMark = [
                `${gridX}_${gridZ}`,
                `${gridX + 1}_${gridZ}`,
                `${gridX}_${gridZ + 1}`,
                `${gridX + 1}_${gridZ + 1}`
            ];
            
            keysToMark.forEach(key => this.placedWallPositions.add(key));
        } else {
            // Barrier occupies 1 grid space
            const gridKey = `${gridX}_${gridZ}`;
            this.placedWallPositions.add(gridKey);
        }
    }
    
    
    placeWallAtPosition(position, rotation) {
        // Position is already snapped to grid
        
        // Set dimensions and cost based on wall type
        let width, height, depth, yPos, cost;
        if (this.selectedWallType === 'large') {
            width = 20;  // Large wall width (2 grid cells)
            height = 20; // Large wall height
            depth = 2;   // Thin wall depth (same as preview)
            yPos = 10;
            cost = 200;
        } else if (this.selectedWallType === 'destructible') {
            width = 20;  // Destructible wall width (2 grid cells)
            height = 20; // Destructible wall height
            depth = 2;   // Thin wall depth
            yPos = 10;   // Destructible walls at standard height
            cost = 50;   // Very cheap!
        } else {
            width = 10;  // Barrier width (1 grid cell)
            height = 10; // Barrier height
            depth = 2;   // Thin wall depth
            yPos = 5;    // Barriers at waist height
            cost = 100;
        }
        
        // Check if player has enough money
        if (this.buildMoney < cost) {
            console.log(`Not enough money for ${this.selectedWallType} wall`);
            return;
        }
        
        // Mark grid position as occupied BEFORE placing wall
        this.markGridAsOccupied(position, this.selectedWallType);
        
        // Create the actual wall
        const wallGeometry = new THREE.BoxGeometry(width, height, depth);
        
        // Different colors for different wall types
        let wallColor, emissiveColor;
        if (this.selectedWallType === 'destructible') {
            wallColor = 0xA9A9A9;  // Gray color for destructible walls
            emissiveColor = 0x444444;
        } else {
            wallColor = 0xff6b35;  // Orange color for walls/barriers
            emissiveColor = 0x331100;
        }
        
        const wallMaterial = new THREE.MeshPhongMaterial({ 
            color: wallColor,
            emissive: emissiveColor,
            emissiveIntensity: 0.2
        });
        
        const wall = new THREE.Mesh(wallGeometry, wallMaterial);
        wall.position.set(position.x, yPos, position.z);
        wall.rotation.y = rotation;
        wall.castShadow = true;
        wall.receiveShadow = true;
        
        // Mark destructible walls with special properties
        if (this.selectedWallType === 'destructible') {
            wall.userData.isDestructible = true;
            wall.userData.bulletHoles = []; // Array to track bullet holes
            wall.userData.wallType = 'destructible';
        }
        
        this.scene.getScene().add(wall);
        
        // Add collision
        this.collisionSystem.addBoxCollider(
            { x: position.x, y: yPos, z: position.z },
            { x: width, y: height, z: depth },
        );
        
        // Deduct money
        this.buildMoney -= cost;
        this.updateMoneyDisplay();
        
        const gridKey = this.getGridKey(position);
        console.log(`Placed ${this.selectedWallType} wall at grid (${position.x}, ${position.z}) [${gridKey}] for $${cost}. Money: $${this.buildMoney}`);
    }

    
    clearWallSelections() {
        // Remove all wall option selections
        document.querySelectorAll('.wall-option').forEach(option => {
            option.classList.remove('selected');
            // Reset to transparent background with subtle border
            option.style.background = 'transparent';
            option.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        });
    }
    
    updateMoneyDisplay() {
        const moneyDisplay = document.querySelector('#buildModeUI div');
        if (moneyDisplay) {
            moneyDisplay.innerHTML = `$${this.buildMoney}`;
        }
    }
    
    setupWallPlacement() {
        const canvas = document.querySelector('#gameContainer canvas');
        if (!canvas) return;
        
        this.wallPlacementHandlers = {
            mousedown: (event) => this.onWallPlaceStart(event),
            mousemove: (event) => this.onWallPlaceMove(event),
            mouseup: (event) => this.onWallPlaceEnd(event)
        };
        
        // Add event listeners for wall placement
        canvas.addEventListener('mousedown', this.wallPlacementHandlers.mousedown);
        canvas.addEventListener('mousemove', this.wallPlacementHandlers.mousemove);
        canvas.addEventListener('mouseup', this.wallPlacementHandlers.mouseup);
        
        console.log('Wall placement system enabled');
    }
    
    removeWallPlacement() {
        const canvas = document.querySelector('#gameContainer canvas');
        if (!canvas || !this.wallPlacementHandlers) return;
        
        canvas.removeEventListener('mousedown', this.wallPlacementHandlers.mousedown);
        canvas.removeEventListener('mousemove', this.wallPlacementHandlers.mousemove);
        canvas.removeEventListener('mouseup', this.wallPlacementHandlers.mouseup);
        
        console.log('Wall placement system disabled');
    }
    
    onWallPlaceStart(event) {
        // Only allow barrier placement when wall type is selected and drag mode is enabled
        if (this.selectedWallType !== 'barrier' || !this.isDragModeEnabled) return;
        
        // Get mouse position on the map
        const mapPosition = this.getMapPositionFromMouse(event);
        if (!mapPosition) return;
        
        console.log('Starting wall drag at position:', mapPosition);
        this.isPlacingWall = true;
        this.wallStartPos = mapPosition.clone();
        
        // Change cursor to indicate dragging
        this.setDragCursor();
    }
    
    onWallPlaceMove(event) {
        if (!this.isPlacingWall || this.selectedWallType !== 'barrier') return;
        
        // Update wall preview while dragging
        const mapPosition = this.getMapPositionFromMouse(event);
        if (!mapPosition) return;
        
        this.updateBarrierPreview(this.wallStartPos, mapPosition);
    }
    
    onWallPlaceEnd(event) {
        if (!this.isPlacingWall || this.selectedWallType !== 'barrier') return;
        
        const mapPosition = this.getMapPositionFromMouse(event);
        if (!mapPosition) return;
        
        // Calculate distance to ensure minimum wall length
        const distance = this.wallStartPos.distanceTo(mapPosition);
        if (distance < 3) {
            console.log('Wall too short - minimum length is 3 units');
            this.isPlacingWall = false;
            this.wallStartPos = null;
            this.clearWallPreview();
            this.setWallCursor(); // Restore wall cursor
            return;
        }
        
        console.log(`Placing wall from (${this.wallStartPos.x.toFixed(1)}, ${this.wallStartPos.z.toFixed(1)}) to (${mapPosition.x.toFixed(1)}, ${mapPosition.z.toFixed(1)}) - Distance: ${distance.toFixed(1)} units`);
        
        // Place the barrier
        this.placeBarrier(this.wallStartPos, mapPosition);
        
        // Reset drag state
        this.isPlacingWall = false;
        this.wallStartPos = null;
        
        // Clear preview
        this.clearWallPreview();
        
        // Restore wall cursor for next placement
        this.setWallCursor();
    }
    
    getMapPositionFromMouse(event) {
        const canvas = document.querySelector('#gameContainer canvas');
        if (!canvas) return null;
        
        // Get mouse coordinates relative to canvas
        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        
        // Convert to normalized device coordinates
        const mouse = new THREE.Vector2();
        mouse.x = (mouseX / canvas.clientWidth) * 2 - 1;
        mouse.y = -(mouseY / canvas.clientHeight) * 2 + 1;
        
        // Create raycaster from camera
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera.getCamera());
        
        // Get camera position to determine ground intersection
        const cameraPos = this.camera.getCamera().position;
        const ray = raycaster.ray;
        
        // Calculate intersection with ground plane at Y = 0
        // Using parametric line equation: point = origin + t * direction
        const t = -ray.origin.y / ray.direction.y;
        
        if (t > 0) {
            // Calculate the intersection point
            const intersectionPoint = new THREE.Vector3();
            intersectionPoint.x = ray.origin.x + t * ray.direction.x;
            intersectionPoint.y = 0;
            intersectionPoint.z = ray.origin.z + t * ray.direction.z;
            
            return intersectionPoint;
        }
        
        return null;
    }
    
    updateWallPreview(startPos, endPos) {
        // Remove existing preview
        this.clearWallPreview();
        
        // Calculate wall dimensions
        const distance = startPos.distanceTo(endPos);
        if (distance < 5) return; // Minimum wall size
        
        // Create preview wall
        const wallHeight = 15;
        const wallWidth = this.selectedWallType === 'large' ? 3 : 1.5;
        
        const wallGeometry = new THREE.BoxGeometry(distance, wallHeight, wallWidth);
        const wallMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff6b35, 
            transparent: true, 
            opacity: 0.5 
        });
        
        this.wallPreview = new THREE.Mesh(wallGeometry, wallMaterial);
        
        // Position wall between start and end points
        this.wallPreview.position.copy(startPos).add(endPos).multiplyScalar(0.5);
        this.wallPreview.position.y = wallHeight / 2;
        
        // Rotate wall to face the correct direction
        this.wallPreview.lookAt(endPos);
        this.wallPreview.rotateY(Math.PI / 2);
        
        this.scene.getScene().add(this.wallPreview);
    }
    
    updateBarrierPreview(startPos, endPos) {
        // Remove existing preview
        this.clearWallPreview();
        
        // Calculate wall dimensions for barrier
        const distance = startPos.distanceTo(endPos);
        if (distance < 3) return; // Minimum wall size for barriers
        
        // Create green preview for barrier
        const wallHeight = 12; // Smaller height for barriers
        const wallWidth = 1.5;  // Barrier width
        
        const wallGeometry = new THREE.BoxGeometry(distance, wallHeight, wallWidth);
        const wallMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x00ff00,  // Green preview color
            transparent: true, 
            opacity: 0.6 
        });
        
        this.wallPreview = new THREE.Mesh(wallGeometry, wallMaterial);
        
        // Position wall between start and end points
        this.wallPreview.position.copy(startPos).add(endPos).multiplyScalar(0.5);
        this.wallPreview.position.y = wallHeight / 2;
        
        // Rotate wall to face the correct direction
        this.wallPreview.lookAt(endPos);
        this.wallPreview.rotateY(Math.PI / 2);
        
        this.scene.getScene().add(this.wallPreview);
        
        // Show visual feedback
        console.log(`Barrier preview: ${distance.toFixed(1)} units long`);
    }
    
    clearWallPreview() {
        if (this.wallPreview) {
            this.scene.getScene().remove(this.wallPreview);
            this.wallPreview = null;
        }
    }
    
    placeWall(startPos, endPos, wallType) {
        const distance = startPos.distanceTo(endPos);
        if (distance < 5) return; // Minimum wall size
        
        // Check if player has enough money
        const cost = wallType === 'large' ? 200 : 100;
        if (this.buildMoney < cost) {
            console.log('Not enough money for wall');
            return;
        }
        
        // Deduct money
        this.buildMoney -= cost;
        this.updateMoneyDisplay();
        
        // Create actual wall
        const wallHeight = 15;
        const wallWidth = wallType === 'large' ? 3 : 1.5;
        
        const wallGeometry = new THREE.BoxGeometry(distance, wallHeight, wallWidth);
        const wallMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xff6b35,
            emissive: 0xff3300,
            emissiveIntensity: 0.1
        });
        
        const wall = new THREE.Mesh(wallGeometry, wallMaterial);
        
        // Position wall
        wall.position.copy(startPos).add(endPos).multiplyScalar(0.5);
        wall.position.y = wallHeight / 2;
        
        // Rotate wall
        wall.lookAt(endPos);
        wall.rotateY(Math.PI / 2);
        
        // Add shadows
        wall.castShadow = true;
        wall.receiveShadow = true;
        
        // Add to scene
        this.scene.getScene().add(wall);
        
        // Add collision
        if (this.collisionSystem) {
            this.collisionSystem.addBoxCollider(
                wall.position,
                new THREE.Vector3(distance, wallHeight, wallWidth),
                'wall'
            );
        }
        
        console.log(`Placed ${wallType} wall for $${cost}. Money remaining: $${this.buildMoney}`);
    }
    
    placeBarrier(startPos, endPos) {
        const distance = startPos.distanceTo(endPos);
        if (distance < 3) return; // Minimum wall size for barriers
        
        // Check if player has enough money for barrier
        const cost = 100;
        if (this.buildMoney < cost) {
            console.log('Not enough money for barrier');
            return;
        }
        
        // Deduct money
        this.buildMoney -= cost;
        this.updateMoneyDisplay();
        
        // Create barrier
        const wallHeight = 12; // Smaller than player height
        const wallWidth = 1.5;  // Thin wall
        
        const wallGeometry = new THREE.BoxGeometry(distance, wallHeight, wallWidth);
        const wallMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xff6b35,    // Orange like the map
            emissive: 0xff3300,
            emissiveIntensity: 0.2
        });
        
        const wall = new THREE.Mesh(wallGeometry, wallMaterial);
        
        // Position wall
        wall.position.copy(startPos).add(endPos).multiplyScalar(0.5);
        wall.position.y = wallHeight / 2;
        
        // Rotate wall
        wall.lookAt(endPos);
        wall.rotateY(Math.PI / 2);
        
        // Add shadows
        wall.castShadow = true;
        wall.receiveShadow = true;
        
        // Add to scene
        this.scene.getScene().add(wall);
        
        // Add collision
        if (this.collisionSystem) {
            this.collisionSystem.addBoxCollider(
                wall.position,
                new THREE.Vector3(distance, wallHeight, wallWidth),
                'wall'
            );
        }
        
        console.log(`Placed barrier (${distance.toFixed(1)} units) for $${cost}. Money remaining: $${this.buildMoney}`);
    }
    
    updateMoneyDisplay() {
        const moneyDisplay = document.querySelector('#buildModeUI > div');
        if (moneyDisplay) {
            moneyDisplay.textContent = `$${this.buildMoney}`;
        }
    }
    
    hideGameUI() {
        // Hide player count and name UI in top left
        const uiElement = document.getElementById('ui');
        if (uiElement) uiElement.style.display = 'none';
        
        // Hide health/shield bars
        const healthContainer = document.getElementById('healthContainer');
        if (healthContainer) healthContainer.style.display = 'none';
        
        // Hide ammo display
        if (this.ammoDisplay) this.ammoDisplay.hide();
        
        // Hide kill counter
        const killCounter = document.getElementById('killCounter');
        if (killCounter) killCounter.style.display = 'none';
        
        // Hide weapon (revolver)
        if (this.weaponSystem) this.weaponSystem.hide();
        
        // Hide compass - ULTRA AGGRESSIVE - hide EVERYTHING with compass
        // Find ANY element with compass in the id and FORCE hide it
        document.querySelectorAll('[id*="compass"]').forEach(el => {
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('visibility', 'hidden', 'important');
            el.style.setProperty('opacity', '0', 'important');
            el.style.setProperty('width', '0', 'important');
            el.style.setProperty('height', '0', 'important');
            el.style.setProperty('overflow', 'hidden', 'important');
        });
        
        // Also hide any fixed position elements at top center (where compass usually is)
        document.querySelectorAll('*').forEach(el => {
            const style = window.getComputedStyle(el);
            if (style.position === 'fixed' && 
                style.top && parseInt(style.top) < 100 && 
                style.left && style.left.includes('50%')) {
                el.style.setProperty('display', 'none', 'important');
            }
        });
        
        // Hide minimap (handled by SimpleMiniMap component)
        
        // Hide crosshair
        const crosshair = document.getElementById('crosshair');
        if (crosshair) crosshair.style.display = 'none';
    }
    
    showGameUI() {
        // Show player count and name UI in top left
        const uiElement = document.getElementById('ui');
        if (uiElement) uiElement.style.display = 'block';
        
        // Show health/shield bars
        const healthContainer = document.getElementById('healthContainer');
        if (healthContainer) healthContainer.style.display = 'block';
        
        // Show ammo display
        if (this.ammoDisplay) this.ammoDisplay.show();
        
        // Show kill counter
        const killCounter = document.getElementById('killCounter');
        if (killCounter) killCounter.style.display = 'block';
        
        // Show weapon (revolver)
        if (this.weaponSystem) this.weaponSystem.show();
        
        // Show compass - restore ALL compass elements with full styles
        const compassContainer = document.getElementById('compass-container');
        if (compassContainer) {
            compassContainer.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                width: 300px;
                height: 40px;
                z-index: 100;
                pointer-events: none;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                background: rgba(0, 0, 0, 0.85);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                backdrop-filter: blur(10px);
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            `;
        }
        
        const compassStrip = document.getElementById('compass-strip');
        if (compassStrip) {
            compassStrip.style.cssText = `
                position: relative;
                width: 1080px;
                height: 100%;
                display: flex;
                align-items: center;
            `;
        }
        
        const compassDegreeDisplay = document.getElementById('compass-degree-display');
        if (compassDegreeDisplay) {
            compassDegreeDisplay.style.cssText = `
                position: fixed;
                top: 62px;
                left: 50%;
                transform: translateX(-50%);
                color: rgba(210, 105, 30, 0.6);
                font-size: 11px;
                font-weight: normal;
                font-family: 'Arial', sans-serif;
                z-index: 100;
                pointer-events: none;
                letter-spacing: 1px;
            `;
        }
        
        // Restore any other compass elements
        document.querySelectorAll('[id*="compass"]').forEach(el => {
            el.style.removeProperty('display');
            el.style.removeProperty('visibility');
            el.style.removeProperty('opacity');
            el.style.removeProperty('width');
            el.style.removeProperty('height');
            el.style.removeProperty('overflow');
        });
        
        // Show minimap (handled by SimpleMiniMap component)
        
        // Show crosshair
        const crosshair = document.getElementById('crosshair');
        if (crosshair) crosshair.style.display = 'block';
    }
    
    updateBuildModeMovement(deltaTime) {
        const moveSpeed = 50; // Faster movement for build mode
        const camera = this.camera.getCamera();
        const moveVector = new THREE.Vector3();
        
        // Define movement directions for top-down view
        const forward = new THREE.Vector3(0, 0, -1); // North
        const right = new THREE.Vector3(1, 0, 0);    // East
        
        // Apply WASD movement
        if (this.input.controls.forward) {
            moveVector.addScaledVector(forward, moveSpeed * deltaTime);
        }
        if (this.input.controls.backward) {
            moveVector.addScaledVector(forward, -moveSpeed * deltaTime);
        }
        if (this.input.controls.right) {
            moveVector.addScaledVector(right, moveSpeed * deltaTime);
        }
        if (this.input.controls.left) {
            moveVector.addScaledVector(right, -moveSpeed * deltaTime);
        }
        
        // Apply movement to camera
        camera.position.add(moveVector);
        
        // Keep camera at sky height and looking down
        camera.position.y = 200;
        camera.lookAt(camera.position.x, 0, camera.position.z);
    }
    
    endRound(winner) {
        console.log(`Round ended! ${winner} wins!`);
        // Show round end message
        const message = winner === 'terrorists' ? 'Terrorists Win!' : 'Counter-Terrorists Win!';
        this.showRoundEndMessage(message);
        
        // Reset round after delay
        setTimeout(() => {
            this.resetRound();
        }, 5000);
    }
    
    showRoundEndMessage(text) {
        let message = document.getElementById('roundEndMessage');
        
        if (!message) {
            message = document.createElement('div');
            message.id = 'roundEndMessage';
            message.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                padding: 30px 60px;
                background: rgba(0, 0, 0, 0.95);
                border: 3px solid #ff6600;
                border-radius: 10px;
                color: #ff6600;
                font-size: 48px;
                font-weight: bold;
                z-index: 500;
                text-align: center;
                text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
            `;
            document.body.appendChild(message);
        }
        
        message.textContent = text;
        message.style.display = 'block';
        
        setTimeout(() => {
            message.style.display = 'none';
        }, 4000);
    }
    
    killPlayer(reason) {
        if (!this.isAlive) return;
        
        this.isAlive = false;
        this.health = 0;
        this.updateHealthDisplay();
        this.activateDeathCam();
        
        // Hide weapon
        if (this.weaponSystem) {
            this.weaponSystem.hide();
        }
        
        // Show death message
        this.showDeathMessage(reason || 'You died!', 3);
        
        console.log('Player killed:', reason);
    }
    
    resetRound() {
        // Respawn all players
        this.spawnPlayer();
        
        // Reset bomb system
        if (this.bombSystem) {
            this.bombSystem.cleanup();
            this.bombSystem.giveBomb(); // Give bomb again for next round
        }
        
        // Reset health
        this.health = 100;
        this.shield = 100;
        this.isAlive = true;
        this.updateHealthDisplay();
        
        // Show weapon
        if (this.weaponSystem) {
            this.weaponSystem.show();
            this.weaponSystem.resetWeapon();
        }
    }
}
