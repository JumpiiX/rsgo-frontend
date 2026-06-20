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
import { RifleWeapon } from '../game/RifleWeapon.js';
import { BombSystem } from '../weapons/BombSystem.js';
import { CollisionSystem } from '../physics/CollisionSystem.js';
import { SimpleMiniMap } from '../ui/SimpleMiniMap.js';
import { Compass } from '../ui/Compass.js';
import { HUD, ensureHudKeyframes } from '../ui/HudTheme.js';
import { Scoreboard } from '../ui/Scoreboard.js';
import { KillFeed } from '../ui/KillFeed.js';
import { AmmoDisplay } from '../ui/AmmoDisplay.js';
import { KillCamSystem } from '../game/KillCamSystem.js';
import { ReplayRecorder } from '../game/ReplayRecorder.js';

export class Game {
    constructor() {
        ensureHudKeyframes(); // shared HUD pulse/flash animations
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
        this.buildWalls = []; // Track all placed walls for cleanup
        this.isPlacingWall = false;
        this.wallStartPos = null;
        this.wallPreview = null;
        this.isDraggingFromUI = false;
        this.floatingWallPreview = null;
        this.globalDragHandlers = null;
        this.lastMouseMapPos = null;
        this.currentWallRotation = 0; // Fixed rotation, changes with R key
        // Which half of the map is the local player's, derived from spawn Z:
        //  -1 = bottom half (z<0), +1 = top half (z>0). Set on respawn. Used by
        // build mode to forbid placing in the ENEMY's two diagonal tunnels.
        this.myHalfSign = 0;

        // Grid system - clean checkerboard pattern
        this.gridSize = 20; // Grid size = wall length for perfect squares
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
                
                const doRoundRespawn = () => {
                    console.log('New round starting - force respawning player');
                    this.isAlive = true;
                    // A new round arrived: cancel any pending post-round cleanup
                    // and clear leftover meshes now so respawns start clean.
                    if (this._postRoundCleanupTimer) {
                        clearTimeout(this._postRoundCleanupTimer);
                        this._postRoundCleanupTimer = null;
                        if (this.playerManager) this.playerManager.clearAllPlayers();
                    }
                    // Team mode is positioned by the server's player_respawned
                    // message; only random-spawn for non-team modes. (Also: there
                    // is no respawn() method — this previously threw.)
                    if (this.gameMode !== 'team') {
                        this.spawnPlayer();
                    }
                    this.hideDeathMessage();
                    this.deactivateDeathCam();
                    if (this.killCam) this.killCam.onLocalPlayerRespawned();
                    console.log('Player force-respawned for new round');
                    if (this.bombSystem) {
                        this.bombSystem.clearDroppedBomb();
                        // Clear any bomb left over from a previous round; the
                        // server re-grants it to one attacker via give_bomb.
                        this.bombSystem.removeBomb();
                    }
                };

                // If the kill cam / replay is showing the killing blow, let it
                // play out fully before respawning — otherwise the last kill of a
                // round cuts the kill cam short the instant the next round starts.
                const killCamActive = this.killCam && this.killCam.isActive && this.killCam.isActive();
                if (this.replayRecorder && this.replayRecorder.isPlaying) {
                    const elapsed = performance.now() / 1000 - this.replayRecorder.replayWallStart;
                    const remaining = Math.max(0, this.replayRecorder.replayDuration - elapsed) * 1000;
                    // Add a short hold after the replay so the final frame (and the
                    // dead body lying on the floor) is visible before respawn.
                    setTimeout(doRoundRespawn, remaining + 1200);
                } else if (killCamActive) {
                    // Kill cam active but not replaying (e.g. spectating) — give a
                    // brief grace period rather than yanking it immediately.
                    setTimeout(doRoundRespawn, 1500);
                } else {
                    doRoundRespawn();
                }
            };
            
            this.network.onRoundEndCallback = (message) => {
                this.orangeScore = message.orange_score;
                this.redScore = message.red_score;
                this.updateRoundDisplay();
                console.log(`Round ended! Winner: ${message.winner}, Reason: ${message.reason}`);
                console.log(`Scores updated - Orange: ${this.orangeScore}, Red: ${this.redScore}`);
                this.handleRoundEndMessage(message);
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
                // Drop at server-authoritative position. We don't apply a
                // client-side forward throw because the local camera may
                // not be aimed where the dropper was facing (e.g. on death
                // the death cam has already snapped the camera elsewhere),
                // which produced phantom bombs under remote players.
                this.bombSystem.onBombDropped(message.position_x, message.position_y, message.position_z);
                console.log('Bomb dropped at:', message.position_x, message.position_y, message.position_z);
            };

            this.network.onBombPickedUpCallback = (message) => {
                const isMe = message.player_id === this.network.playerId;
                this.bombSystem.onBombPickedUp(message.player_id, isMe);
                console.log(`${message.player_name} picked up the bomb`);
            };
            
            this.network.onBombPlantedCallback = (message) => {
                console.log(`Bomb planted by player ${message.player_id} - Timer: ${message.timer}s at position:`, message.position_x, message.position_z);
                if (this.bombSystem) {
                    const position = { 
                        x: message.position_x || 0, 
                        z: message.position_z || 0 
                    };
                    this.bombSystem.onBombPlanted(message.timer, position);
                    
                    // If this player planted the bomb, remove it from their hand
                    if (message.player_id === this.network.playerId) {
                        this.bombSystem.onLocalBombPlanted();
                        console.log('Bomb removed from local player hand after server confirmation');
                    }
                }
            };
            
            this.network.onBombDefusedCallback = (message) => {
                console.log(`Bomb defused by player ${message.player_id}`);
                if (this.bombSystem) {
                    this.bombSystem.onBombDefused();
                }
            };
            
            this.network.onBombExplodedCallback = () => {
                console.log('Bomb exploded!');
                if (this.bombSystem) {
                    this.bombSystem.onBombExploded();
                }
            };

            this.network.onMapResetCallback = () => {
                console.log('Halftime — resetting map (clearing built walls)');
                this.clearBuildWalls();
            };
        }

        this.playerManager = new PlayerManager(this.scene.getScene());
        this.playerManager.setGameMode(this.gameMode);
        this.playerManager.setLocalTeam(this.playerTeam || null);
        this.bulletSystem = new BulletSystem(this.scene.getScene());
        this.weaponSystem = new RifleWeapon(this.camera.getCamera(), this.scene.getScene(), this.playerTeam);
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

        this.replayRecorder = new ReplayRecorder({
            playerManager: this.playerManager,
            bulletSystem: this.bulletSystem,
            scene: this.scene.getScene(),
            getLocalPlayerId: () => this.network && this.network.playerId,
            getLocalTransform: () => {
                const pos = this.camera.getPosition();
                return {
                    x: pos.x, y: pos.y, z: pos.z,
                    yaw: this.input ? this.input.yaw : 0,
                    pitch: this.input ? this.input.pitch : 0,
                    alive: this.isAlive !== false,
                };
            },
        });

        this.killCam = new KillCamSystem({
            camera: this.camera,
            input: this.input,
            playerManager: this.playerManager,
            getLocalPlayerId: () => this.network && this.network.playerId,
            getLocalTeam: () => this.playerTeam || null,
            weaponSystem: this.weaponSystem,
            recorder: this.replayRecorder,
            onHitmarker: () => this.showHitmarker(),
        });
        
        // Money system
        this.playerMoney = 800; // Starting money (will be synced from server)
        this.buildMoney = 800; // Make sure build money is also initialized
        this.createMoneyDisplay();

        
        


        
        this.network.onPlayerJoined((player) => this.playerManager.addPlayer(player));
        this.network.onPlayerLeft((playerId) => this.playerManager.removePlayer(playerId));
        this.network.onPlayerMoved((message) => {
            // During the build phase nobody can legitimately move (the sender
            // blocks its own movement in handleMove). Any player_moved that
            // arrives now is a stale/in-flight update from the previous round
            // that would drag a freshly respawned model back to last round's
            // kill spot. Discard it — the authoritative build-phase positions
            // come from player_respawned.
            if (this.gameMode === 'team' && this.isInBuildPhase) {
                return;
            }
            this.playerManager.updatePlayer(message);
        });
        this.network.onPlayerShot((message) => this.handleEnemyShot(message));
        this.network.onPlayerHit((message) => this.handlePlayerHit(message));
        this.network.onPlayerDied((message) => this.handlePlayerDied(message));
        this.network.onBuildingPlaced((message) => this.handleRemoteBuildingPlaced(message));
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
        this.input.onDefuseStart(() => this.handleDefuseStart());
        this.input.onDefuseStop(() => this.handleDefuseStop());
    }

    // Fade one full-screen onboarding screen out and the next one in.
    transitionScreen(fromId, toId) {
        const from = document.getElementById(fromId);
        const to = document.getElementById(toId);
        if (from) {
            from.classList.add('leaving');
            setTimeout(() => {
                from.classList.remove('show', 'leaving');
                from.style.display = 'none';
            }, 380);
        }
        if (to) {
            // small delay so the fade-out reads before fade-in
            setTimeout(() => { to.style.display = 'flex'; to.classList.add('show'); }, 180);
        }
    }

    // Animated "joining match" loader: lights up each step, waits for the server
    // lobby, then transitions into team selection. Purely visual pacing over the
    // real connection (the lobby is created in parallel from setupNameScreen).
    runJoinLoader() {
        const steps = Array.from(document.querySelectorAll('#loadingSteps li'));
        const hint = document.getElementById('loadingHint');
        const hints = ['connecting', 'loading arena', 'almost ready'];
        let i = 0;
        const advance = () => {
            steps.forEach((s, idx) => {
                s.classList.toggle('done', idx < i);
                s.classList.toggle('active', idx === i);
            });
            if (hint && hints[i]) hint.textContent = hints[i];
        };
        advance();
        // Only ever transition to team select ONCE — otherwise the safety timer
        // below could re-show the team screen on top of a game that already
        // started (the bug: team-select reappeared after clicking Start match).
        let transitioned = false;
        const goToTeamSelect = () => {
            if (transitioned || this.gameStarted) return;
            transitioned = true;
            this.transitionScreen('loadingScreen', 'teamSelectionScreen');
        };
        const tick = setInterval(() => {
            i++;
            if (i >= steps.length) {
                clearInterval(tick);
                // Wait until the server lobby is ready (usually already is), then go.
                const waitLobby = setInterval(() => {
                    if (this._lobbyReady) {
                        clearInterval(waitLobby);
                        clearTimeout(this._loaderSafety);
                        steps.forEach((s) => s.classList.add('done'));
                        steps.forEach((s) => s.classList.remove('active'));
                        setTimeout(goToTeamSelect, 400);
                    }
                }, 100);
                // Safety: never hang on the loader — but goToTeamSelect() no-ops
                // if we already transitioned or the game has started.
                this._loaderSafety = setTimeout(() => { clearInterval(waitLobby); goToTeamSelect(); }, 4000);
                return;
            }
            advance();
        }, 700);
    }

    setupNameScreen() {
        const nameInput = document.getElementById('playerName');
        const joinButton = document.getElementById('joinGame');

        // Autofocus the name field.
        setTimeout(() => nameInput.focus(), 100);

        // Light up the arrow only once a name is typed.
        const refreshArrow = () => joinButton.classList.toggle('ready', nameInput.value.trim().length > 0);
        nameInput.addEventListener('input', refreshArrow);
        refreshArrow();

        joinButton.addEventListener('click', () => {
            const name = nameInput.value.trim();
            if (name) {
                this.playerName = name;
                const yn = document.getElementById('yourName'); if (yn) yn.textContent = name;
                // Smoothly transition name -> animated loader -> team select.
                this.transitionScreen('nameScreen', 'loadingScreen');
                this.runJoinLoader();

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
                        
                        const doRoundRespawn = () => {
                            console.log('New round starting - force respawning player');
                            this.isAlive = true;
                            // A new round arrived: cancel any pending post-round
                            // cleanup and clear leftover meshes now.
                            if (this._postRoundCleanupTimer) {
                                clearTimeout(this._postRoundCleanupTimer);
                                this._postRoundCleanupTimer = null;
                                if (this.playerManager) this.playerManager.clearAllPlayers();
                            }
                            // In team mode the authoritative spawn position comes
                            // from the server's player_respawned message (handled in
                            // handlePlayerRespawned, which places the camera at the
                            // team-based spawn). Calling spawnPlayer() here would pick
                            // a RANDOM local spawn point and clobber that, which made
                            // both players land on the same spawn from round 2 on.
                            if (this.gameMode !== 'team') {
                                this.spawnPlayer();
                            }
                            this.hideDeathMessage();
                            this.deactivateDeathCam();
                            if (this.killCam) this.killCam.onLocalPlayerRespawned();
                            console.log('Player force-respawned for new round');

                            if (this.bombSystem) {
                                this.bombSystem.clearDroppedBomb();
                                // Clear any bomb left over from a previous round;
                                // the server re-grants it to one attacker via give_bomb.
                                this.bombSystem.removeBomb();
                            }
                        };

                        const killCamActive2 = this.killCam && this.killCam.isActive && this.killCam.isActive();
                        if (this.replayRecorder && this.replayRecorder.isPlaying) {
                            const elapsed = performance.now() / 1000 - this.replayRecorder.replayWallStart;
                            const remaining = Math.max(0, this.replayRecorder.replayDuration - elapsed) * 1000;
                            setTimeout(doRoundRespawn, remaining + 1200);
                        } else if (killCamActive2) {
                            setTimeout(doRoundRespawn, 1500);
                        } else {
                            doRoundRespawn();
                        }
                    };
                    
                    this.network.onRoundEndCallback = (message) => {
                        this.orangeScore = message.orange_score;
                        this.redScore = message.red_score;
                        this.updateRoundDisplay();
                        console.log(`Round ended! Winner: ${message.winner}, Reason: ${message.reason}`);
                        console.log(`Scores updated - Orange: ${this.orangeScore}, Red: ${this.redScore}`);
                        this.handleRoundEndMessage(message);
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
                        // Drop at server-authoritative position only — see
                        // the comment on the other onBombDroppedCallback above.
                        this.bombSystem.onBombDropped(message.position_x, message.position_y, message.position_z);
                        console.log('Bomb dropped at:', message.position_x, message.position_y, message.position_z);
                    };
                    
                    this.network.onBombPickedUpCallback = (message) => {
                        const isMe = message.player_id === this.network.playerId;
                        this.bombSystem.onBombPickedUp(message.player_id, isMe);
                        console.log(`${message.player_name} picked up the bomb`);
                    };
                    
                    this.network.onBombPlantedCallback = (message) => {
                        console.log(`Bomb planted by player ${message.player_id} - Timer: ${message.timer}s at position:`, message.position_x, message.position_z);
                        if (this.bombSystem) {
                            const position = { 
                                x: message.position_x || 0, 
                                z: message.position_z || 0 
                            };
                            this.bombSystem.onBombPlanted(message.timer, position);
                            
                            // If this player planted the bomb, remove it from their hand
                            if (message.player_id === this.network.playerId) {
                                this.bombSystem.onLocalBombPlanted();
                                console.log('Bomb removed from local player hand after server confirmation');
                            }
                        }
                    };
                    
                    this.network.onBombDefusedCallback = (message) => {
                        console.log(`Bomb defused by player ${message.player_id}`);
                        if (this.bombSystem) {
                            this.bombSystem.onBombDefused();
                        }
                    };
                    
                    this.network.onBombExplodedCallback = () => {
                        console.log('Bomb exploded!');
                        if (this.bombSystem) {
                            this.bombSystem.onBombExploded();
                        }
                    };

                    this.network.onMapResetCallback = () => {
                        console.log('Halftime — resetting map (clearing built walls)');
                        this.clearBuildWalls();
                    };
                }

                // Skip the old mode-select step: it's always Team vs Team. Create
                // the team lobby now; the team-select screen appears via the
                // onTeamLobbyCreated callback once the loader finishes.
                this.network.createTeamLobby(this.playerName);
                this.setupTeamSelection();
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
                // Lobby is ready: mark the loader's final step done, then glide
                // from the loader into team selection.
                this._lobbyReady = true;
                console.log('Team lobby created:', message.lobby_id);
            });
            
            this.network.onTeamUpdate((message) => {
                console.log('Team update received:', message);
                this.teamPlayers.orange = message.orange_team;
                this.teamPlayers.red = message.red_team;
                // Keep a player_id -> team map so placed walls can be colored by
                // the team that built them (the wall message only carries player_id).
                if (!this.playerTeams) this.playerTeams = {};
                (message.orange_team || []).forEach((p) => { if (p && p.id) this.playerTeams[p.id] = 'orange'; });
                (message.red_team || []).forEach((p) => { if (p && p.id) this.playerTeams[p.id] = 'red'; });
                this.updateTeamDisplay();
                this.updateStartButton(message.can_start);
            });
            
            this.network.onGameStarted((message) => {
                if (message.game_mode === 'team') {
                    // Cancel any pending loader→team-select transition so the
                    // team screen can't pop back up over the running game.
                    if (this._loaderSafety) { clearTimeout(this._loaderSafety); this._loaderSafety = null; }
                    ['nameScreen', 'loadingScreen', 'teamSelectionScreen'].forEach((id) => {
                        const el = document.getElementById(id);
                        if (el) { el.classList.remove('show'); el.style.display = 'none'; }
                    });
                    document.getElementById('gameContainer').style.display = 'block';
                    this.gameMode = 'team';
                    this.playerTeam = this.selectedTeam;
                    if (this.playerManager) {
                        this.playerManager.setGameMode(this.gameMode);
                        this.playerManager.setLocalTeam(this.playerTeam);
                    }
                    
                    // Initialize round counter for team games
                    this.roundNumber = 1;
                    this.orangeScore = 0;
                    this.redScore = 0;
                    this.updateRoundDisplay();
                    
                    this.startGame();
                }
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
        // Instant UI feedback for the local picker (highlight/grow the chosen
        // half). The ROSTERS + start button stay server-driven (onTeamUpdate),
        // so every player in the lobby sees the same authoritative state.
        this.updateTeamDisplay();
        console.log('Sent join team request for:', team);
    }
    
    updateTeamDisplay() {
        const myName = this.playerName;
        // Build a roster of player chips (only filled — no permanent empty slots).
        const renderRoster = (containerId, players) => {
            const el = document.getElementById(containerId);
            if (!el) return;
            el.innerHTML = '';
            if (!players || players.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'half-empty';
                empty.textContent = 'Waiting for players…';
                el.appendChild(empty);
                return;
            }
            players.forEach((p) => {
                const chip = document.createElement('div');
                chip.className = 'roster-chip' + (p.name === myName ? ' you' : '');
                chip.textContent = p.name;
                el.appendChild(chip);
            });
        };
        renderRoster('orangeTeamSlots', this.teamPlayers.orange);
        renderRoster('redTeamSlots', this.teamPlayers.red);

        // Highlight the half the local player picked.
        const orangeHalf = document.getElementById('joinOrangeTeam');
        const navyHalf = document.getElementById('joinRedTeam');
        const screen = document.getElementById('teamSelectionScreen');
        if (orangeHalf) orangeHalf.classList.toggle('selected', this.selectedTeam === 'orange');
        if (navyHalf) navyHalf.classList.toggle('selected', this.selectedTeam === 'red');
        if (screen) screen.classList.toggle('has-pick', !!this.selectedTeam);

        // Status line ('red' is internally the Navy team).
        const statusElement = document.getElementById('teamStatus');
        if (statusElement) {
            statusElement.textContent = this.selectedTeam
                ? `You're on ${this.selectedTeam === 'orange' ? 'ORANGE' : 'NAVY'} — waiting to start`
                : 'Pick a side to join';
        }
    }
    
    canStartGame() {
        return this.teamPlayers.orange.length > 0 || this.teamPlayers.red.length > 0;
    }
    
    updateStartButton(canStart = false) {
        const startButton = document.getElementById('startTeamGame');
        // Enabled vs disabled styling is handled entirely by the .rsgo-btn CSS
        // (orange fill when enabled, hollow navy/orange when disabled) so we only
        // toggle the disabled flag — no off-palette colors.
        startButton.disabled = !(this.selectedTeam && canStart);
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
        
        // Bomb is given by server in team games
        
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
            const trueRotation = {
                x: this.input ? this.input.pitch : (rotation.x || 0),
                y: this.input ? this.input.yaw : (rotation.y || 0),
            };
            this.network.sendMove(position, trueRotation);
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
                const cameraDir = new THREE.Vector3();
                this.camera.getCamera().getWorldDirection(cameraDir);
                const forward = this.getShotSpreadDirection(cameraDir);

                const startPos = this.camera.getPosition().clone();
                startPos.add(forward.clone().multiplyScalar(1));

                const muzzlePos = this.getMuzzlePosition();
                const tracerStart = startPos.clone().add(forward.clone().multiplyScalar(6));

                const target = startPos.clone().add(forward.multiplyScalar(1000));

                this.bulletSystem.createBullet(tracerStart, target, true);
                if (this.replayRecorder && this.network && this.network.playerId) {
                    this.replayRecorder.recordShotEvent(
                        this.network.playerId,
                        tracerStart.x, tracerStart.y, tracerStart.z,
                        target.x, target.y, target.z,
                    );
                }

                const hitPlayer = this.checkHit(target);
                if (hitPlayer) {
                    this.showHitmarker();
                }
                this.network.sendShoot(startPos, target);

                this.addCameraRecoil();
                this.flashMuzzle(tracerStart);

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
            if (this.bombSystem.isEquipped && !this.bombSystem.isPlanting) {
                // Start planting with progress
                this.bombSystem.startPlanting((progress) => {
                    if (progress >= 1.0) {
                        // BombSystem.completePlanting() will handle sending to server
                        console.log('Bomb planting complete - sending to server...');
                    }
                });
                console.log('Holding to plant bomb...');
            }
        }
    }
    
    handleBombPlantStop() {
        if (this.bombSystem && this.gameStarted && this.isAlive) {
            this.bombSystem.cancelPlanting();
        }
    }

    handleDefuseStart() {
        if (!this.bombSystem || !this.gameStarted || !this.isAlive) return;
        // Only the DEFENDING team can defuse. Defender = not on the attacking team.
        if (this.gameMode === 'team' &&
            this.attackingTeam &&
            this.playerTeam &&
            this.playerTeam === this.attackingTeam) {
            return; // attacker can't defuse
        }
        // Only meaningful once a bomb is actually planted.
        if (!this.bombSystem.bombPlanted) return;
        this.bombSystem.startDefusing();
    }

    handleDefuseStop() {
        if (this.bombSystem) {
            this.bombSystem.cancelDefusing();
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
        const shooterId = message.shooter_id || message.player_id;
        if (this.replayRecorder) {
            this.replayRecorder.recordShotEvent(
                shooterId,
                message.start_x, message.start_y, message.start_z,
                message.target_x, message.target_y, message.target_z,
            );
            if (this.replayRecorder.shouldSuppressLiveShot()) return;
        }
        const startPos = new THREE.Vector3(message.start_x, message.start_y, message.start_z);
        const endPos = new THREE.Vector3(message.target_x, message.target_y, message.target_z);
        this.bulletSystem.createBullet(startPos, endPos, false);

        // Trigger the shooter's firing animation on their player model.
        if (this.playerManager) {
            this.playerManager.playerShoot(shooterId);
        }
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
            

            
            const intersects = raycaster.intersectObject(player.mesh, true);

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
            return { playerId: closestHit.playerId, killed };
        }
        this.checkWallHit(playerPosition, shootDirection);
        return null;

        
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
        // Small FLAT bullet mark — same as normal walls (was a big 0.5 sphere
        // "bubble", which we no longer want). A thin circle laid on the surface.
        const decalGeometry = new THREE.CircleGeometry(0.18, 12);
        const decalMaterial = new THREE.MeshBasicMaterial({
            color: 0xef4e23,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            fog: false,
            side: THREE.DoubleSide,
        });

        const decal = new THREE.Mesh(decalGeometry, decalMaterial);

        // Lay it flat on the wall face, lifted slightly off the surface.
        const n = normal.clone().normalize();
        decal.position.copy(hitPoint).add(n.clone().multiplyScalar(0.05));
        decal.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);

        decal.renderOrder = 1000;
        
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
            color: 0xef4e23,
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
            color: 0xef4e23,
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
            const intersects = raycaster.intersectObject(player.mesh, true);
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
            color: 0xef4e23,
            emissive: 0xef4e23,
            emissiveIntensity: 0.6
        });
        const impactMark = new THREE.Mesh(geometry, material);


        impactMark.userData.isPlayerImpact = true;
        // Decorative only — don't let impact marks intercept shooting raycasts.
        impactMark.raycast = () => {};

        
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
            console.log(`💰 Money update received: $${this.playerMoney} -> $${message.money}`);
            this.updatePlayerMoney(message.money);
            console.log(`💰 Money updated to: $${message.money} (playerMoney=${this.playerMoney}, buildMoney=${this.buildMoney})`);
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
            this.deathCamActive = true;
            this.input.isPointerLocked = false;
            document.exitPointerLock();
            const healthContainer = document.getElementById('healthContainer');
            if (healthContainer) healthContainer.style.display = 'none';
            if (this.ammoDisplay) this.ammoDisplay.hide();

            if (this.killCam) {
                this.killCam.onLocalPlayerDied(message.killer_id);
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
        if (message.player.id === this.network.playerId &&
            this.replayRecorder && this.replayRecorder.isPlaying) {
            const elapsed = performance.now() / 1000 - this.replayRecorder.replayWallStart;
            const remaining = Math.max(0, this.replayRecorder.replayDuration - elapsed) * 1000;
            if (remaining > 50) {
                setTimeout(() => this.handlePlayerRespawned(message), remaining + 50);
                return;
            }
        }

        if (message.player.id === this.network.playerId) {
            this.isAlive = true;
            this.health = 100;
            this.shield = 100;
            this.lastHitTime = 0;
            this.deactivateDeathCam();
            if (this.killCam) {
                this.killCam.onLocalPlayerRespawned();
            }
            // The replay (if any) has now finished and the kill cam has just
            // restored remote meshes to their kill-spot positions. Run the
            // deferred round cleanup to remove the ghost mesh and snap remote
            // players back to their fresh spawns.
            this.finishRoundCleanup();

            if (this.weaponSystem) {
                this.weaponSystem.show();
                this.weaponSystem.resetWeapon(); // Reset to full ammo
            }

            // Remember which half of the map is ours (sign of spawn Z). Build
            // mode uses this to forbid placing in the enemy's two diagonal tunnels.
            if (typeof message.player.z === 'number' && message.player.z !== 0) {
                this.myHalfSign = message.player.z < 0 ? -1 : 1;
            }

            // Use the position from the server instead of random spawn
            this.camera.getCamera().position.set(message.player.x, message.player.y + 5, message.player.z);
            // Initialize physics state
            if (this.input) {
                this.input.velocity.set(0, 0, 0);
                this.input.onGround = true;
            }
            this.camera.getCamera().rotation.set(0, 0, 0);
            // Always spawn facing the map center (origin), regardless of which
            // spawn side. At yaw 0 the camera looks down -z; the facing
            // direction is (-sin yaw, -cos yaw), so to point from the spawn
            // toward (0,0) we need yaw = atan2(x, z). Attackers (z=-300) end up
            // facing +z and defenders (z=+300) facing -z, both toward the map.
            this.input.yaw = Math.atan2(message.player.x, message.player.z);
            this.input.pitch = 0;
            // Apply the yaw to the camera immediately so the first frame is
            // already facing the map (the input handler only updates the
            // quaternion on mouse movement).
            const spawnYawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.input.yaw);
            this.camera.getCamera().quaternion.copy(spawnYawQ);
            this.camera.getCamera().updateMatrixWorld();

            console.log(`You respawned at position (${message.player.x}, ${message.player.y}, ${message.player.z}), facing map (yaw ${this.input.yaw.toFixed(2)})`);
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
                background: rgba(26, 36, 71, 0.92);
                color: #ef4e23;
                padding: 30px;
                font-size: 28px;
                font-weight: 700;
                text-align: center;
                border-radius: 14px;
                border: 1px solid rgba(239, 78, 35, 0.4);
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
                z-index: 1000;
                font-family: 'Inter', -apple-system, sans-serif;
            `;
            document.body.appendChild(deathMsg);
        }

        let timeLeft = countdown;
        const updateMessage = () => {
            if (timeLeft > 0) {
                deathMsg.innerHTML = `
                    ${message}<br/>
                    <div style="font-size: 20px; color: rgba(239, 78, 35, 0.7); margin-top: 15px;">
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
                    <div style="color: #ef4e23; margin-bottom: 20px;">You were eliminated</div>
                    <div style="color: rgba(239, 78, 35, 0.5); font-size: 16px;">Waiting for round to end...</div>
                `;
            } else {
                // Deathmatch mode - show respawn button
                deathMsg.innerHTML = `
                    <div style="color: #ef4e23; margin-bottom: 20px;">You were eliminated</div>
                    <button id="respawnButton" style="
                        padding: 15px 30px;
                        font-size: 20px;
                        background: #ef4e23;
                        color: #1a2447;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        font-weight: bold;
                        transition: all 0.3s;
                    " onmouseover="this.style.background='#ff6038'" onmouseout="this.style.background='#ef4e23'">
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

    // Called on every round_end. Shows the win banner and keeps players visible
    // and able to fight for a short post-round window before the meshes are
    // cleared (the server starts the next round ~3s later). When the local
    // player died this round a kill-cam replay is already running, so cleanup is
    // deferred by that path instead and we don't double-schedule.
    handleRoundEndMessage(message) {
        // Build a clean banner: big title + small-caps reason, team-colored accent.
        const winnerName = message.winner === 'orange' ? 'Orange'
            : message.winner === 'red' ? 'Navy'
            : (message.winner || 'Team');
        // Single accent — orange — for both teams (palette is strict 2-color).
        const accent = '#ef4e23';

        let title = `${winnerName} team wins`;
        let subtitle = '';
        switch (message.reason) {
        case 'Bomb Defused':
            title = `${winnerName} defenders win`;
            subtitle = 'Bomb defused';
            break;
        case 'Bomb Exploded':
            title = `${winnerName} attackers win`;
            subtitle = 'Bomb detonated';
            break;
        case 'Team Eliminated':
            title = `${winnerName} team wins`;
            subtitle = 'Enemy eliminated';
            break;
        default:
            break;
        }
        this.showRoundEndMessage(title, subtitle, accent);

        const replayActive =
            (this.replayRecorder && this.replayRecorder.isPlaying) ||
            (this.killCam && this.killCam.isActive && this.killCam.isActive());

        if (replayActive) {
            // The kill cam owns the meshes; cleanup happens at local respawn.
            this._pendingRoundCleanup = true;
            return;
        }

        // No replay (e.g. defuse / bomb / you survived): keep everyone visible
        // and fightable for a moment, THEN clear. The next round's respawn
        // (~3s) will re-position everyone.
        if (this._postRoundCleanupTimer) {
            clearTimeout(this._postRoundCleanupTimer);
        }
        this._postRoundCleanupTimer = setTimeout(() => {
            this._postRoundCleanupTimer = null;
            if (this.playerManager) {
                this.playerManager.clearAllPlayers();
            }
        }, 6000); // long enough for the ~3s death animation + a beat lying down
    }

    cleanupForRoundTransition() {
        // Called on round_end. The hard part: a round usually ends the instant
        // the local player dies (team eliminated), so the kill cam replay of
        // who killed us is just STARTING and needs its snapshot buffer + the
        // real remote meshes (it animates them) to play out (~5s).
        //
        // So we never wipe the kill cam / snapshots here. We only clear the
        // remote player meshes when NO replay is active. When a replay IS
        // active, the kill cam owns the meshes; the actual stale-position
        // cleanup then happens at the local respawn (see handlePlayerRespawned,
        // which runs only after the replay finishes) via finishRoundCleanup().
        const replayActive =
            (this.replayRecorder && this.replayRecorder.isPlaying) ||
            (this.killCam && this.killCam.isActive && this.killCam.isActive());

        if (replayActive) {
            this._pendingRoundCleanup = true;
            return;
        }

        if (this.playerManager) {
            this.playerManager.clearAllPlayers();
        }
    }

    // Remove every structure built during the build phase: the wall meshes,
    // their collision boxes, and the occupied-grid bookkeeping. Used for the
    // halftime map reset when sides switch.
    clearBuildWalls() {
        if (this.buildWalls && this.buildWalls.length) {
            this.buildWalls.forEach((wall) => {
                this.scene.remove(wall);
                if (wall.geometry) wall.geometry.dispose();
                if (wall.material) wall.material.dispose();
            });
        }
        this.buildWalls = [];

        if (this.placedWallPositions) {
            this.placedWallPositions.clear();
        }

        if (this.collisionSystem) {
            this.collisionSystem.removeCollidersByType('buildWall');
        }

        console.log('🧹 Build walls cleared (map reset)');
    }

    // Runs once the kill cam replay has finished (called from the local
    // respawn, which is itself deferred until the replay ends). Removes the
    // replay's leftovers — the ghost body mesh — and resets kill cam state.
    // We do NOT clearAllPlayers() here: by now every remote player's
    // player_respawned has already arrived and moved their mesh to a fresh
    // spawn. Instead we re-assert those fresh positions, because the kill
    // cam's stopPlayback (triggered just before this) restores remote meshes
    // to their frozen kill-spot positions — this undoes that.
    finishRoundCleanup() {
        if (!this._pendingRoundCleanup) return;
        this._pendingRoundCleanup = false;
        if (this.killCam) {
            this.killCam.state = 'idle';
            this.killCam.replayTargetId = null;
            this.killCam.spectateTargetId = null;
            this.killCam.hideUI();
        }
        if (this.replayRecorder) {
            this.replayRecorder.resetForRound();
        }
        if (this.playerManager) {
            // Snap every remote mesh back to its authoritative position (the
            // fresh spawn delivered by player_respawned and stored in .data),
            // overriding any kill-spot restore the kill cam just applied.
            this.playerManager.otherPlayers.forEach((p) => {
                if (p && p.mesh && p.data) {
                    p.mesh.position.set(p.data.x, p.data.y, p.data.z);
                }
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

    createMoneyDisplay() {
        const moneyDisplay = document.createElement('div');
        moneyDisplay.id = 'moneyDisplay';
        moneyDisplay.style.cssText = `
            position: fixed;
            bottom: 170px;
            right: 20px;
            background: rgba(26, 36, 71, 0.88);
            border: 1px solid rgba(239, 78, 35, 0.18);
            border-radius: 12px;
            color: rgba(239, 78, 35, 0.9);
            padding: 14px 18px;
            font-size: 13px;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            z-index: 100;
            backdrop-filter: blur(10px);
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            min-width: 100px;
        `;
        moneyDisplay.innerHTML = `
            <style>
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
            </style>
            <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.6; margin-bottom: 2px;">Money</div>
            <div id="moneyAmount" style="font-size: 24px; font-weight: 300; color: #ef4e23; line-height: 1;">$${this.buildMoney}</div>
        `;
        moneyDisplay.style.display = 'none'; // Hide by default, only show in build mode
        document.body.appendChild(moneyDisplay);
    }
    
    updatePlayerMoney(amount) {
        this.playerMoney = amount;
        this.buildMoney = amount;
        this.updateMoneyDisplay();
        if (typeof this.refreshBuildBanner === 'function') {
            this.refreshBuildBanner();
        }
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
                background: rgba(26, 36, 71, 0.88);
                border: 1px solid rgba(239, 78, 35, 0.18);
                border-radius: 12px;
                color: rgba(239, 78, 35, 0.9);
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
                <div style="font-size: 24px; font-weight: 300; color: #ef4e23; line-height: 1;">${this.kills}</div>
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
                color: #ef4e23;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                z-index: 100;
                background: rgba(26, 36, 71, 0.88);
                padding: 20px;
                border-radius: 12px;
                backdrop-filter: blur(10px);
                border: 1px solid rgba(239, 78, 35, 0.18);
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
                    <div style="width: 8px; height: 8px; background: #ef4e23; border-radius: 50%; margin-right: 8px;"></div>
                    <span style="font-size: 24px; font-weight: 600;">${this.orangeScore}</span>
                </div>
                <div style="font-size: 14px; opacity: 0.4;">VS</div>
                <div style="display: flex; align-items: center;">
                    <span style="font-size: 24px; font-weight: 600;">${this.redScore}</span>
                    <div style="width: 8px; height: 8px; background: transparent; border: 2px solid #ef4e23; border-radius: 50%; margin-left: 8px; box-sizing: border-box;"></div>
                </div>
            </div>
        `;
        
        if (this.isInBuildPhase && this.buildPhaseTimer) {
            content += `
                <div style="border-top: 1px solid rgba(239, 78, 35, 0.12); padding-top: 12px; margin-top: 12px;">
                    <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.6; margin-bottom: 4px;">
                        Build Phase
                    </div>
                    <div style="font-size: 28px; font-weight: 300; color: #ef4e23;">
                        ${this.buildPhaseTimer}
                    </div>
                    <div style="font-size: 11px; opacity: 0.4; margin-top: 4px;">
                        Press B for build menu
                    </div>
                </div>
            `;
        }
        
        roundContainer.innerHTML = content;

        if (typeof this.refreshBuildBanner === 'function') {
            this.refreshBuildBanner();
        }
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
                left: 20px;
                background: rgba(26, 36, 71, 0.88);
                border: 1px solid rgba(239, 78, 35, 0.18);
                border-radius: 12px;
                color: rgba(239, 78, 35, 0.9);
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
                <div style="font-size: 20px; font-weight: 600; color: #ef4e23; line-height: 1;">${this.shield}</div>
            `;
            
            // Shield = OUTLINED bar (orange border, hollow) to distinguish it
            // from the solid-fill health bar below — using only orange + navy.
            const shieldBarContainer = document.createElement('div');
            shieldBarContainer.style.cssText = `
                width: 100px;
                height: 6px;
                background: transparent;
                border: 1px solid rgba(239, 78, 35, 0.5);
                border-radius: 3px;
                overflow: hidden;
            `;

            const shieldBar = document.createElement('div');
            shieldBar.id = 'shieldBar';
            shieldBar.style.cssText = `
                height: 100%;
                background: rgba(239, 78, 35, 0.55);
                width: ${(this.shield / this.maxShield) * 100}%;
                transition: width 0.3s ease;
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
                <div style="font-size: 20px; font-weight: 600; color: #ef4e23; line-height: 1;">${this.health}</div>
            `;
            
            // Health = SOLID orange bar on a faint orange track.
            const healthBarContainer = document.createElement('div');
            healthBarContainer.style.cssText = `
                width: 100px;
                height: 6px;
                background: rgba(239, 78, 35, 0.15);
                border-radius: 3px;
                overflow: hidden;
            `;

            const healthBar = document.createElement('div');
            healthBar.id = 'healthBar';
            healthBar.style.cssText = `
                height: 100%;
                background: #ef4e23;
                width: ${this.health}%;
                transition: width 0.3s ease;
                border-radius: 3px;
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
                <div style="font-size: 20px; font-weight: 600; color: #ef4e23; line-height: 1;">${this.health}</div>
            `;
        }

        if (shieldText) {
            shieldText.innerHTML = `
                <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.6; margin-bottom: 2px;">Shield</div>
                <div style="font-size: 20px; font-weight: 600; color: #ef4e23; line-height: 1;">${Math.round(this.shield)}</div>
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

        
        // Health stays ORANGE always; LOW health is signalled by a pulse (not a
        // color change) to keep the strict 2-color palette.
        if (healthText) {
            const healthValue = healthText.querySelector('div:last-child');
            healthValue.style.color = '#ef4e23';
            if (healthBar) healthBar.style.background = '#ef4e23';
            const low = this.health <= 25;
            healthValue.style.animation = low ? 'hudUrgent 0.7s ease infinite' : 'none';
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

        
        // Orange damage vignette (was red) — stays in palette while still reading
        // as an alarm flash at the screen edges.
        hitOverlay.style.background = `radial-gradient(circle at center,
            rgba(239, 78, 35, 0) 0%,
            rgba(239, 78, 35, 0.18) 55%,
            rgba(239, 78, 35, 0.6) 100%)`;
        hitOverlay.style.opacity = '1';
        hitOverlay.style.boxShadow = 'inset 0 0 100px rgba(239, 78, 35, 0.8)';

        
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

            // Real wall-clock frame time, used for remote-player animation +
            // interpolation so they stay smooth regardless of display refresh
            // rate (the fixed 0.016 above desyncs animation on non-60Hz screens).
            const nowMs = performance.now();
            const realDelta = this._lastFrameMs ? Math.min(0.1, (nowMs - this._lastFrameMs) / 1000) : 0.016;
            this._lastFrameMs = nowMs;

            
            if (this.replayRecorder && !this.replayRecorder.isPlaying) {
                this.replayRecorder.captureFrame();
            }

            if (this.killCam && this.killCam.isActive()) {
                this.killCam.update();
            } else if (this.isAlive && !this.deathCamActive) {
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

            // Advance remote player animation mixers (idle/run/shoot/death).
            if (this.playerManager) {
                this.playerManager.update(realDelta);
            }


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
        const pitchKick = 0.022 + Math.random() * 0.006;
        const yawKick = (Math.random() - 0.5) * 0.012;

        this.cameraRecoil.y += pitchKick;
        this.cameraRecoil.x += yawKick;
        this._recoilDebtPitch = (this._recoilDebtPitch || 0) + pitchKick;
        this._recoilDebtYaw = (this._recoilDebtYaw || 0) + yawKick;

        if (this.input) {
            this.input.pitch = Math.max(-Math.PI / 2 + 0.1, this.input.pitch + pitchKick);
            this.input.yaw += yawKick;
        }

        this._shotHeat = Math.min(1, (this._shotHeat || 0) + 0.35);
        this._lastShotTime = performance.now();
    }

    updateCameraRecoil(deltaTime) {
        const recoverFactor = Math.min(1, deltaTime * 8);
        const pitchPay = (this._recoilDebtPitch || 0) * recoverFactor * 0.55;
        const yawPay = (this._recoilDebtYaw || 0) * recoverFactor * 0.55;

        if (this.input && (pitchPay || yawPay)) {
            this.input.pitch -= pitchPay;
            this.input.yaw -= yawPay;
        }
        this._recoilDebtPitch = (this._recoilDebtPitch || 0) - pitchPay;
        this._recoilDebtYaw = (this._recoilDebtYaw || 0) - yawPay;

        this.cameraRecoil.x *= (1 - this.recoilRecovery);
        this.cameraRecoil.y *= (1 - this.recoilRecovery);
        if (Math.abs(this.cameraRecoil.x) < 0.001) this.cameraRecoil.x = 0;
        if (Math.abs(this.cameraRecoil.y) < 0.001) this.cameraRecoil.y = 0;

        if (this._shotHeat) {
            this._shotHeat = Math.max(0, this._shotHeat - deltaTime * 1.6);
        }
    }

    getShotSpreadDirection(forward) {
        const heat = this._shotHeat || 0;
        if (heat <= 0) return forward.clone();
        const maxSpread = 0.025;
        const spread = maxSpread * heat;
        const rx = (Math.random() - 0.5) * 2 * spread;
        const ry = (Math.random() - 0.5) * 2 * spread;
        const right = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        right.crossVectors(forward, up).normalize();
        const trueUp = new THREE.Vector3().crossVectors(right, forward).normalize();
        return forward.clone().add(right.multiplyScalar(rx)).add(trueUp.multiplyScalar(ry)).normalize();
    }

    getMuzzlePosition() {
        const camera = this.camera.getCamera();
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const right = new THREE.Vector3();
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
        const down = new THREE.Vector3();
        down.crossVectors(right, forward).normalize().multiplyScalar(-1);
        const muzzle = this.camera.getPosition().clone();
        muzzle.add(forward.clone().multiplyScalar(2.0));
        muzzle.add(right.multiplyScalar(0.15));
        muzzle.add(down.multiplyScalar(0.05));
        return muzzle;
    }

    flashMuzzle(pos) {
        if (!pos || !this.scene) return;
        const geometry = new THREE.SphereGeometry(0.07, 6, 6);
        const material = new THREE.MeshBasicMaterial({
            color: 0xef4e23,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
        });
        const flash = new THREE.Mesh(geometry, material);
        flash.userData.isBullet = true;
        flash.position.copy(pos);
        flash.renderOrder = 1000;
        this.scene.getScene().add(flash);

        const start = performance.now();
        const dur = 50;
        const animate = () => {
            const t = (performance.now() - start) / dur;
            if (t >= 1) {
                this.scene.getScene().remove(flash);
                flash.geometry.dispose();
                flash.material.dispose();
                return;
            }
            const s = 1 + t * 0.6;
            flash.scale.setScalar(s);
            flash.material.opacity = 0.85 * (1 - t);
            requestAnimationFrame(animate);
        };
        animate();
    }

    showHitmarker() {
        let hm = document.getElementById('hitmarker');
        if (!hm) {
            hm = document.createElement('div');
            hm.id = 'hitmarker';
            hm.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                width: 18px;
                height: 18px;
                transform: translate(-50%, -50%);
                pointer-events: none;
                z-index: 200;
                opacity: 0;
                transition: opacity 0.06s linear;
            `;
            hm.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 18 18">
                    <line x1="2" y1="2" x2="7" y2="7" stroke="#ef4e23" stroke-width="2.5" stroke-linecap="round"/>
                    <line x1="16" y1="2" x2="11" y2="7" stroke="#ef4e23" stroke-width="2.5" stroke-linecap="round"/>
                    <line x1="2" y1="16" x2="7" y2="11" stroke="#ef4e23" stroke-width="2.5" stroke-linecap="round"/>
                    <line x1="16" y1="16" x2="11" y2="11" stroke="#ef4e23" stroke-width="2.5" stroke-linecap="round"/>
                </svg>
            `;
            document.body.appendChild(hm);
        }
        hm.style.opacity = '1';
        if (this._hitmarkerTimeout) clearTimeout(this._hitmarkerTimeout);
        this._hitmarkerTimeout = setTimeout(() => {
            hm.style.opacity = '0';
        }, 140);
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

        const moneyDisplay = document.getElementById('moneyDisplay');
        if (moneyDisplay) {
            moneyDisplay.style.display = 'none';
        }

        const roundContainer = document.getElementById('roundContainer');
        if (roundContainer) {
            roundContainer.style.display = 'none';
        }

        if (this.bombSystem) {
            this.bombSystem.hideBombUI();
        }

        const minimap = document.getElementById('simple-minimap');
        if (minimap) {
            minimap.style.display = 'none';
        }
        const minimapArrow = document.getElementById('minimap-player-arrow');
        if (minimapArrow) {
            minimapArrow.style.display = 'none';
        }
        
        // Don't setup wall placement system - only drag from UI allowed
        // this.setupWallPlacement();
        
        // Create visible grid lines on the floor
        this.createGridLines();

        // Tint the two ENEMY diagonal tunnels reddish so the player can see at a
        // glance where they're not allowed to build.
        this.createEnemyZoneOverlay();

        console.log('Build mode ready - barrier selected, drag mode enabled');
    }

    // Lay translucent red strips over the enemy's two diagonal tunnels (the lanes
    // a team may NOT build in). Only visible in build mode.
    createEnemyZoneOverlay() {
        this.removeEnemyZoneOverlay();
        if (!this.myHalfSign) return; // half unknown → nothing to mark
        this.enemyZoneGroup = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({
            color: 0xd63030, transparent: true, opacity: 0.28,
            side: THREE.DoubleSide, depthWrite: false,
        });
        const SITE_TRIM = 110; // stop the strip before the (shared) bomb site
        // pathWidth of the diagonal floors in MapBuilder is 100, so match it.
        const STRIP_WIDTH = 100;
        for (const c of this.enemyTunnelCorridors()) {
            // Cover the lane from the enemy spawn down to just shy of the site, so
            // the overlay matches the actual rule (sites stay buildable / unmarked).
            const len = Math.max(20, c.len - SITE_TRIM);
            const geo = new THREE.PlaneGeometry(STRIP_WIDTH, len);
            const strip = new THREE.Mesh(geo, mat);
            strip.rotation.x = -Math.PI / 2;
            // MATCH MapBuilder.createAngledFloor: it uses rotation.z = atan2(dx,dz)
            // with dx,dz = (site - spawn). Our (ux,uz) is that same direction
            // normalized, so the angle is atan2(ux, uz) WITHOUT negation. (The
            // earlier minus sign rotated the strip off the tunnel.)
            strip.rotation.z = Math.atan2(c.ux, c.uz);
            const midAlong = len / 2; // start at the spawn end
            strip.position.set(c.sx + c.ux * midAlong, 0.3, c.sz + c.uz * midAlong);
            strip.renderOrder = 2;
            this.enemyZoneGroup.add(strip);
        }
        this.scene.getScene().add(this.enemyZoneGroup);
    }

    removeEnemyZoneOverlay() {
        if (this.enemyZoneGroup) {
            this.scene.getScene().remove(this.enemyZoneGroup);
            this.enemyZoneGroup.traverse((o) => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) o.material.dispose();
            });
            this.enemyZoneGroup = null;
        }
    }
    
    createGridLines() {
        // Create a visible grid on the floor for build mode
        this.gridGroup = new THREE.Group();
        
        const gridExtent = 400; // How far the grid extends from center
        const lineColor = 0x000000; // Black lines
        const lineMaterial = new THREE.LineBasicMaterial({ 
            color: lineColor,
            opacity: 0.3,
            transparent: true
        });
        
        // Create lines along X axis (vertical lines when looking from above)
        // Offset by 10 to align with wall edges
        for (let x = -gridExtent + 10; x <= gridExtent; x += this.gridSize) {
            const points = [];
            points.push(new THREE.Vector3(x - 10, 0.1, -gridExtent));
            points.push(new THREE.Vector3(x - 10, 0.1, gridExtent));
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, lineMaterial);
            this.gridGroup.add(line);
        }
        
        // Create lines along Z axis (horizontal lines when looking from above)
        // Offset by 10 to align with wall edges
        for (let z = -gridExtent + 10; z <= gridExtent; z += this.gridSize) {
            const points = [];
            points.push(new THREE.Vector3(-gridExtent, 0.1, z - 10));
            points.push(new THREE.Vector3(gridExtent, 0.1, z - 10));
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, lineMaterial);
            this.gridGroup.add(line);
        }
        
        // Add grid to scene
        this.scene.getScene().add(this.gridGroup);
        console.log('Grid lines created with size:', this.gridSize);
    }
    
    removeGridLines() {
        if (this.gridGroup) {
            this.scene.getScene().remove(this.gridGroup);
            // Dispose of all geometries and materials
            this.gridGroup.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this.gridGroup = null;
            console.log('Grid lines removed');
        }
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

        // Remove grid lines + enemy-zone overlay
        this.removeGridLines();
        this.removeEnemyZoneOverlay();
        // Put any in-hand wall down so it doesn't linger after exit.
        this.deselectWallPlacement();

        const moneyDisplay = document.getElementById('moneyDisplay');
        if (moneyDisplay) {
            moneyDisplay.style.display = 'none';
        }

        const roundContainer = document.getElementById('roundContainer');
        if (roundContainer) {
            roundContainer.style.display = 'block';
        }

        if (this.bombSystem) {
            this.bombSystem.showBombUI();
        }

        const minimap = document.getElementById('simple-minimap');
        if (minimap) {
            minimap.style.display = 'block';
        }
        const minimapArrow = document.getElementById('minimap-player-arrow');
        if (minimapArrow) {
            minimapArrow.style.display = 'block';
        }
        
        // Show game UI again
        this.showGameUI();
        
        // Force recreate compass if it's not working
        if (this.compass) {
            // Remove any broken compass elements
            document.querySelectorAll('[id*="compass"]').forEach(el => el.remove());
            
            // Recreate compass - import Compass class
            import('../ui/Compass.js').then(module => {
                this.compass = new module.Compass();
            });
        }
        
        // Restore default cursor
        document.body.style.cursor = 'default';
    }
    
    showBuildModeUI() {
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
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                color: #ef4e23;
            `;
            document.body.appendChild(buildUI);
        }

        const canvas = document.querySelector('#gameContainer canvas');
        if (canvas) {
            canvas.style.pointerEvents = 'auto';
        }

        const keyStyle = `
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 22px;
            height: 22px;
            padding: 0 6px;
            background: rgba(239, 78, 35, 0.10);
            border: 1px solid rgba(239, 78, 35, 0.25);
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.5px;
            color: #ef4e23;
        `;

        // Swatch previews each wall in MY team color, with the X marker for the
        // destructible one (X in the accent/opposite color).
        const myTeam = this.playerTeam === 'red' ? 'red' : 'orange';
        const main = myTeam === 'red' ? '#1a2447' : '#ef4e23';
        const accent = myTeam === 'red' ? '#ef4e23' : '#1a2447';
        const slotInner = (hotkey, name, price, wallType) => {
            const isDestructible = wallType === 'destructible';
            // Small CSS X via crossed linear-gradients for the destructible swatch.
            const swatch = isDestructible
                ? `background:
                     linear-gradient(to top right, transparent 44%, ${accent} 44%, ${accent} 56%, transparent 56%),
                     linear-gradient(to top left, transparent 44%, ${accent} 44%, ${accent} 56%, transparent 56%),
                     ${main};
                   border: 2px solid ${accent};`
                : `background: ${main}; border: 2px solid ${main};`;
            return `
            <div class="wall-option" data-wall="${wallType}" style="
                position: relative;
                width: 110px;
                padding: 14px 14px 12px 14px;
                background: rgba(26, 36, 71, 0.9);
                border: 1px solid rgba(239, 78, 35, 0.12);
                border-radius: 8px;
                cursor: pointer;
                transition: background 0.15s, border-color 0.15s, transform 0.1s;
                user-select: none;
                pointer-events: auto;
            ">
                <div style="
                    position: absolute;
                    top: 8px;
                    left: 8px;
                    ${keyStyle}
                ">${hotkey}</div>
                <div style="
                    position: absolute; top: 10px; right: 10px;
                    width: 18px; height: 18px; border-radius: 3px;
                    box-sizing: border-box; ${swatch}
                    pointer-events: none;
                "></div>
                <div style="
                    margin-top: 22px;
                    font-size: 13px;
                    font-weight: 500;
                    color: #ef4e23;
                    pointer-events: none;
                ">${name}</div>
                <div style="
                    margin-top: 4px;
                    font-size: 12px;
                    color: rgba(239, 78, 35, 0.6);
                    font-weight: 500;
                    pointer-events: none;
                ">$${price}</div>
            </div>
        `;
        };

        buildUI.innerHTML = `
            <!-- TOP BANNER -->
            <div id="buildTopBanner" style="
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 44px;
                background: linear-gradient(180deg, rgba(26, 36, 71, 0.95) 0%, rgba(26, 36, 71, 0.7) 100%);
                border-bottom: 1px solid rgba(239, 78, 35, 0.10);
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 24px;
                pointer-events: auto;
            ">
                <div style="display: flex; align-items: center; gap: 14px;">
                    <div style="
                        width: 8px; height: 8px;
                        border-radius: 50%;
                        background: #ef4e23;
                        box-shadow: 0 0 8px #ef4e23;
                        animation: hudPulse 1.2s ease infinite;
                    "></div>
                    <div style="
                        font-size: 11px;
                        text-transform: uppercase;
                        letter-spacing: 2px;
                        font-weight: 600;
                        color: rgba(239, 78, 35, 0.7);
                    ">Build Phase</div>
                    <!-- Big, prominent countdown. -->
                    <div id="buildBannerTimer" style="
                        font-size: 24px;
                        font-weight: 700;
                        color: #ef4e23;
                        font-variant-numeric: tabular-nums;
                        line-height: 1;
                    ">--</div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="
                        font-size: 11px;
                        text-transform: uppercase;
                        letter-spacing: 1.5px;
                        color: rgba(239, 78, 35, 0.5);
                    ">Money</div>
                    <div id="buildBannerMoney" style="
                        font-size: 18px;
                        font-weight: 500;
                        color: #ef4e23;
                        font-variant-numeric: tabular-nums;
                    ">$${this.buildMoney}</div>
                </div>
            </div>

            <!-- CAMERA CONTROLS HINT (top-left under banner) -->
            <div style="
                position: absolute;
                top: 64px;
                left: 24px;
                padding: 14px 16px;
                background: rgba(26, 36, 71, 0.9);
                border: 1px solid rgba(239, 78, 35, 0.10);
                border-radius: 8px;
                pointer-events: none;
            ">
                <div style="
                    font-size: 10px;
                    text-transform: uppercase;
                    letter-spacing: 1.5px;
                    color: rgba(239, 78, 35, 0.5);
                    margin-bottom: 10px;
                ">Camera</div>
                <div style="display: grid; grid-template-columns: 28px 28px 28px; grid-template-rows: 28px 28px; gap: 8px; margin-bottom: 8px; justify-content: center;">
                    <div></div><div style="${keyStyle}">W</div><div></div>
                    <div style="${keyStyle}">A</div><div style="${keyStyle}">S</div><div style="${keyStyle}">D</div>
                </div>
                <div style="
                    font-size: 11px;
                    color: rgba(239, 78, 35, 0.6);
                    text-align: center;
                ">Move camera</div>
                <div style="
                    margin-top: 12px;
                    padding-top: 12px;
                    border-top: 1px solid rgba(239, 78, 35, 0.10);
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                ">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div style="${keyStyle}">L-Click</div>
                        <div style="font-size: 11px; color: rgba(239, 78, 35, 0.6);">Place wall</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div style="${keyStyle}">R</div>
                        <div style="font-size: 11px; color: rgba(239, 78, 35, 0.6);">Rotate 90°</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div style="${keyStyle}">R-Click</div>
                        <div style="${keyStyle}">Q</div>
                        <div style="font-size: 11px; color: rgba(239, 78, 35, 0.6);">Put down</div>
                    </div>
                </div>
            </div>

            <!-- EXIT BUTTON (top-right under banner) -->
            <button id="buildExitButton" style="
                position: absolute;
                top: 64px;
                right: 24px;
                padding: 10px 16px;
                background: rgba(239, 78, 35, 0.12);
                border: 1px solid rgba(239, 78, 35, 0.5);
                color: #ef4e23;
                font-family: inherit;
                font-size: 12px;
                font-weight: 600;
                letter-spacing: 1px;
                text-transform: uppercase;
                border-radius: 8px;
                cursor: pointer;
                pointer-events: auto;
                display: flex;
                align-items: center;
                gap: 10px;
                transition: background 0.15s, border-color 0.15s;
            ">
                <span>Exit Build</span>
                <span style="${keyStyle} background: rgba(220,60,60,0.2); border-color: rgba(220,60,60,0.4); color: #ef4e23;">B</span>
            </button>

            <!-- BOTTOM HOTBAR -->
            <div style="
                position: absolute;
                bottom: 36px;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                gap: 10px;
                padding: 12px;
                background: rgba(26, 36, 71, 0.92);
                border: 1px solid rgba(239, 78, 35, 0.10);
                border-radius: 12px;
                pointer-events: auto;
                box-shadow: 0 8px 24px rgba(0,0,0,0.4);
            ">
                ${slotInner('1', 'Barrier', 100, 'barrier')}
                ${slotInner('2', 'Large Wall', 200, 'large')}
                ${slotInner('3', 'Destructible', 50, 'destructible')}
            </div>

            <!-- HINT BELOW HOTBAR -->
            <div id="buildBottomHint" style="
                position: absolute;
                bottom: 14px;
                left: 50%;
                transform: translateX(-50%);
                font-size: 11px;
                color: rgba(239, 78, 35, 0.45);
                letter-spacing: 1px;
                text-transform: uppercase;
                pointer-events: none;
            ">Pick a wall, then click to place — place as many as you like</div>

            <!-- ENEMY-ZONE LEGEND (bottom-left) -->
            <div style="
                position: absolute;
                bottom: 36px;
                left: 24px;
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 10px 14px;
                background: rgba(26, 36, 71, 0.9);
                border: 1px solid rgba(239, 78, 35, 0.10);
                border-radius: 8px;
                pointer-events: none;
            ">
                <div style="
                    width: 22px; height: 22px; border-radius: 4px;
                    background: repeating-linear-gradient(45deg,
                        rgba(214,48,48,0.55) 0 6px, rgba(214,48,48,0.2) 6px 12px);
                    border: 1px solid rgba(214,48,48,0.7);
                "></div>
                <div style="font-size: 11px; color: rgba(239, 78, 35, 0.65); line-height:1.35;">
                    Enemy tunnels<br><span style="color:rgba(239,78,35,0.4);">no building here</span>
                </div>
            </div>
        `;

        this.setupWallSelection();
        this.setupBuildUIHotkeys();
        this.setupBuildExitButton();
        this.refreshBuildBanner();

        buildUI.style.display = 'block';
    }

    refreshBuildBanner() {
        const timerEl = document.getElementById('buildBannerTimer');
        if (timerEl) {
            const t = this.buildPhaseTimer;
            timerEl.textContent = t != null ? `${t}s` : '--';
            // Pulse the countdown when time is running out (≤10s), no color change.
            timerEl.style.animation = (t != null && t <= 10) ? 'hudUrgent 0.7s ease infinite' : 'none';
        }
        const moneyEl = document.getElementById('buildBannerMoney');
        if (moneyEl) {
            moneyEl.textContent = `$${this.buildMoney}`;
        }
        // Bottom hint reflects whether a wall is currently in hand.
        const hintEl = document.getElementById('buildBottomHint');
        if (hintEl) {
            const placed = (this.buildWalls && this.buildWalls.length) || 0;
            hintEl.textContent = this.selectedWallType
                ? `Click to place · ${placed} built · right-click / Q to put down`
                : `Pick a wall, then click to place — place as many as you like`;
        }
    }

    setupBuildUIHotkeys() {
        if (this._buildHotkeyHandler) {
            document.removeEventListener('keydown', this._buildHotkeyHandler);
        }
        const wallByKey = { '1': 'barrier', '2': 'large', '3': 'destructible' };
        this._buildHotkeyHandler = (e) => {
            if (!this.isBuildMode) return;
            const wall = wallByKey[e.key];
            if (!wall) return;
            this.startWallPlacementFromHotkey(wall);
        };
        document.addEventListener('keydown', this._buildHotkeyHandler);
    }

    startWallPlacementFromHotkey(wallType) {
        if (this.isDraggingFromUI) {
            this.cancelWallPlacement();
        }
        this.selectWallType(wallType);
        this.selectedWallType = wallType;
        this.isDraggingFromUI = true;
        this.createFloatingWallPreview();
        this.setDragCursor();
        this.setupGlobalDragHandlers();
        document.addEventListener('click', this.preventCursorHide, true);
    }

    cancelWallPlacement() {
        if (this.floatingWallPreview) {
            if (this.floatingWallPreview.parent) {
                this.floatingWallPreview.parent.remove(this.floatingWallPreview);
            }
            this.floatingWallPreview = null;
        }
        this.isDraggingFromUI = false;
        this.removeGlobalDragHandlers();
        document.removeEventListener('click', this.preventCursorHide, true);
    }

    setupBuildExitButton() {
        const btn = document.getElementById('buildExitButton');
        if (!btn) return;
        btn.addEventListener('mouseenter', () => {
            btn.style.background = 'rgba(239, 78, 35, 0.25)';
            btn.style.borderColor = 'rgba(239, 78, 35, 0.7)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'rgba(239, 78, 35, 0.12)';
            btn.style.borderColor = 'rgba(239, 78, 35, 0.5)';
        });
        btn.addEventListener('click', () => {
            if (typeof this.toggleBuildMode === 'function') {
                this.toggleBuildMode();
            }
        });
    }
    
    setupWallSelection() {
        const wallOptions = document.querySelectorAll('.wall-option');
        wallOptions.forEach(option => {
            const wallType = option.getAttribute('data-wall');
            
            // CLICK a card = select that wall type (ghost goes "in hand" and
            // follows the cursor). Same flow as pressing the 1/2/3 hotkey. Then
            // left-click the map to place as many as you want.
            if (wallType === 'barrier' || wallType === 'large' || wallType === 'destructible') {
                // stopPropagation on mousedown/mouseup so the document-level
                // place handler doesn't fire from the click that happens on the card.
                option.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
                option.addEventListener('mouseup', (e) => { e.stopPropagation(); });
                option.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.startWallPlacementFromHotkey(wallType);
                });
            }
            
            option.addEventListener('mouseenter', () => {
                if (!option.classList.contains('selected')) {
                    option.style.background = 'rgba(239, 78, 35, 0.12)';
                    option.style.borderColor = 'rgba(239, 78, 35, 0.4)';
                }
            });

            option.addEventListener('mouseleave', () => {
                if (!option.classList.contains('selected')) {
                    option.style.background = 'rgba(26, 36, 71, 0.9)';
                    option.style.borderColor = 'rgba(239, 78, 35, 0.12)';
                }
            });
        });
    }

    selectWallType(wallType) {
        document.querySelectorAll('.wall-option').forEach(option => {
            option.classList.remove('selected');
            option.style.background = 'rgba(26, 36, 71, 0.9)';
            option.style.border = '1px solid rgba(239, 78, 35, 0.12)';
            option.style.boxShadow = 'none';
        });

        const selectedOption = document.querySelector(`[data-wall="${wallType}"]`);
        if (selectedOption) {
            selectedOption.classList.add('selected');
            selectedOption.style.background = 'rgba(239, 78, 35, 0.18)';
            selectedOption.style.border = '1px solid rgba(239, 78, 35, 0.7)';
            selectedOption.style.boxShadow = '0 0 0 1px rgba(239, 78, 35, 0.3), 0 0 12px rgba(239, 78, 35, 0.18)';
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

        document.body.style.cursor = 'default';
        this.selectedWallType = null;

        this.removeWallPlacement();

        if (this._buildHotkeyHandler) {
            document.removeEventListener('keydown', this._buildHotkeyHandler);
            this._buildHotkeyHandler = null;
        }

        document.body.style.cursor = 'default';
    }
    
    setCustomCursor() {
        // Create orange crosshair cursor for build mode
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        
        // Draw orange crosshair
        ctx.strokeStyle = '#ef4e23';
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
        ctx.fillStyle = '#ef4e23';
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
        
        // ALL walls have same length for clean grid
        const wallLength = 20;  // All walls same length (one grid square)
        const wallThickness = 2;  // All walls same thickness
        
        let height;
        if (this.selectedWallType === 'barrier') {
            height = 10; // Barrier half height
        } else {
            height = 20; // Full height for large and destructible
        }
        
        const width = wallLength;
        const depth = wallThickness;
        
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
        if (this.globalDragHandlers) return; // already attached (place-many keeps them on)
        // Store handlers so we can remove them later
        this.globalDragHandlers = {
            mousemove: (event) => this.onGlobalDragMove(event),
            mouseup: (event) => this.onGlobalDragEnd(event),
            keydown: (event) => this.onBuildModeKeyDown(event),
            // Right-click anywhere = put the wall down (and suppress the browser menu).
            contextmenu: (event) => {
                if (this.isDraggingFromUI) {
                    event.preventDefault();
                    this.deselectWallPlacement();
                }
            },
        };

        // Add to document for global tracking
        document.addEventListener('mousemove', this.globalDragHandlers.mousemove);
        document.addEventListener('mouseup', this.globalDragHandlers.mouseup);
        document.addEventListener('keydown', this.globalDragHandlers.keydown);
        document.addEventListener('contextmenu', this.globalDragHandlers.contextmenu);
    }

    removeGlobalDragHandlers() {
        if (this.globalDragHandlers) {
            document.removeEventListener('mousemove', this.globalDragHandlers.mousemove);
            document.removeEventListener('mouseup', this.globalDragHandlers.mouseup);
            document.removeEventListener('keydown', this.globalDragHandlers.keydown);
            document.removeEventListener('contextmenu', this.globalDragHandlers.contextmenu);
            this.globalDragHandlers = null;
        }
    }
    
    onBuildModeKeyDown(event) {
        // R = rotate the wall in hand 90°.
        if (event.code === 'KeyR') {
            event.preventDefault();
            this.currentWallRotation += Math.PI / 2;
            if (this.currentWallRotation >= Math.PI * 2) {
                this.currentWallRotation = 0;
            }
            if (this.floatingWallPreview) {
                this.floatingWallPreview.rotation.y = this.currentWallRotation;
            }
            console.log(`Wall rotation: ${Math.round(this.currentWallRotation * 180 / Math.PI)}°`);
            return;
        }
        // Q or Esc = put the wall down (deselect), staying in build mode.
        if (event.code === 'KeyQ' || event.code === 'Escape') {
            if (this.isDraggingFromUI) {
                event.preventDefault();
                this.deselectWallPlacement();
            }
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
    
    // LEFT-CLICK on the map = place a wall AND keep the same wall type in hand
    // so the player can place many in a row (RTS-style). Right-click / Q / Esc
    // put the wall down (see onBuildModePointerDown / onBuildModeKeyDown).
    onGlobalDragEnd(event) {
        if (!this.isDraggingFromUI) return;
        // Only the LEFT button places. Other buttons are handled as "put down".
        if (event && typeof event.button === 'number' && event.button !== 0) return;
        // Ignore clicks that land on the build UI (hotbar, banner, buttons).
        if (event && event.target && event.target.closest &&
            event.target.closest('#buildModeUI')) return;

        const mapPosition = this.getMapPositionFromMouse(event);
        if (mapPosition) {
            const snappedPosition = this.snapToGrid(mapPosition);
            if (this.canPlaceWallAtPosition(snappedPosition, this.selectedWallType, true)) {
                this.placeWallAtPosition(snappedPosition, this.currentWallRotation);
                this.refreshBuildBanner(); // update money / count
            } else {
                console.log('Cannot place wall here - occupied / invalid / enemy tunnel');
            }
        }
        // DO NOT reset the selection — keep the wall in hand for the next click.
        // The ghost preview stays attached and keeps following the cursor.
    }

    // Put the wall down: clear the in-hand wall type + ghost, back to no selection.
    deselectWallPlacement() {
        if (!this.isDraggingFromUI && !this.selectedWallType) return;
        this.isDraggingFromUI = false;
        this.clearFloatingWallPreview();
        this.selectedWallType = null;
        this.clearWallSelections();
        document.removeEventListener('click', this.preventCursorHide, true);
        if (document.pointerLockElement) document.exitPointerLock();
        if (this.input) this.input.isPointerLocked = false;
        this.setWallCursor();
        this.refreshBuildBanner();
    }
    
    // Grid system functions
    snapToGrid(position) {
        // Snap walls to grid edges based on rotation
        // This ensures walls connect perfectly at corners
        const isVertical = Math.abs(this.currentWallRotation % Math.PI) > 0.1;
        
        let snappedX, snappedZ;
        
        if (isVertical) {
            // Vertical walls snap to grid lines on X, centers on Z
            snappedX = Math.round(position.x / this.gridSize) * this.gridSize;
            // Offset by half wall length so ends align with grid
            snappedZ = Math.round((position.z + 10) / this.gridSize) * this.gridSize - 10;
        } else {
            // Horizontal walls snap to centers on X, grid lines on Z  
            snappedX = Math.round((position.x + 10) / this.gridSize) * this.gridSize - 10;
            snappedZ = Math.round(position.z / this.gridSize) * this.gridSize;
        }
        
        return { x: snappedX, y: position.y, z: snappedZ };
    }
    
    getGridKey(position) {
        // Create unique key for grid position
        const gridX = Math.round(position.x / this.gridSize);
        const gridZ = Math.round(position.z / this.gridSize);
        return `${gridX}_${gridZ}`;
    }
    
    // The four diagonal tunnels of the bowtie map, as corridors from a spawn
    // (0, ±300) to a site (±250, 0). A team owns the two tunnels on ITS side and
    // may NOT build in the enemy's two — otherwise it could wall off the enemy's
    // only routes to the sites. halfWidth is generous so a wall anywhere across
    // the corridor is caught.
    enemyTunnelCorridors() {
        const SPAWN_Z = 300, SITE_X = 250, HALF_WIDTH = 60;
        // Our half is myHalfSign; the enemy spawns on the opposite side.
        const enemyZ = -this.myHalfSign * SPAWN_Z;
        if (!this.myHalfSign) return []; // unknown half → don't restrict
        const mk = (siteX) => {
            const sx = 0, sz = enemyZ, ex = siteX, ez = 0;
            const dx = ex - sx, dz = ez - sz;
            const len = Math.hypot(dx, dz);
            const ux = dx / len, uz = dz / len;   // along
            const px = -uz, pz = ux;              // perpendicular
            return { sx, sz, len, ux, uz, px, pz, halfWidth: HALF_WIDTH };
        };
        return [mk(-SITE_X), mk(SITE_X)];
    }

    // Is (x,z) inside one of the ENEMY tunnel corridors? We also exclude the
    // shared bomb-site boxes (radius ~halfSite around ±250,0) so a team can
    // still build on the sites themselves — only the enemy's tunnel LANES are off
    // limits, not the contested sites.
    isInEnemyTunnel(x, z) {
        const SITE_X = 250, SITE_HALF = 90; // bomb-site half-size (shared ground)
        // On a bomb site → allowed (shared).
        if (Math.abs(z) <= SITE_HALF &&
            (Math.abs(x - SITE_X) <= SITE_HALF || Math.abs(x + SITE_X) <= SITE_HALF)) {
            return false;
        }
        for (const c of this.enemyTunnelCorridors()) {
            const lx = x - c.sx, lz = z - c.sz;
            const along = lx * c.ux + lz * c.uz;
            const perp = lx * c.px + lz * c.pz;
            if (along >= 0 && along <= c.len &&
                perp >= -c.halfWidth && perp <= c.halfWidth) {
                return true;
            }
        }
        return false;
    }

    // Axis-aligned footprint (half-extents in x/z) of a placed wall mesh. Walls
    // are 20 long × 2 thick boxes rotated about Y; at 0/180° they're 20 wide in
    // x, at 90/270° they're 20 wide in z.
    wallFootprint(mesh) {
        const len = 20, thick = 2;
        const vertical = Math.abs((mesh.rotation.y % Math.PI)) > 0.1; // ~90°
        const hx = vertical ? thick / 2 : len / 2;
        const hz = vertical ? len / 2 : thick / 2;
        return { x: mesh.position.x, z: mesh.position.z, hx, hz };
    }

    // Footprint for a CANDIDATE wall at a snapped grid pos with current rotation.
    candidateFootprint(pos) {
        const len = 20, thick = 2;
        const vertical = Math.abs((this.currentWallRotation % Math.PI)) > 0.1;
        const hx = vertical ? thick / 2 : len / 2;
        const hz = vertical ? len / 2 : thick / 2;
        return { x: pos.x, z: pos.z, hx, hz };
    }

    // Would placing this wall fully SEAL the mid tunnel (the direct A↔B corridor)?
    // We flood-fill the open space of the mid corridor (with the candidate wall
    // added) and check whether the A-side opening still connects to the B-side
    // opening. If they're cut off, this placement closes the only direct route →
    // refuse it. Partial walls are fine; only the sealing wall is blocked.
    wouldSealMidTunnel(position) {
        // Mid corridor bounds (from MapBuilder: x∈[-160,160], z∈[-50,50]).
        const X_MIN = -160, X_MAX = 160, Z_MIN = -50, Z_MAX = 50;
        // Only relevant if the candidate actually sits in/around the corridor.
        if (position.z < Z_MIN - 20 || position.z > Z_MAX + 20) return false;
        if (position.x < X_MIN - 20 || position.x > X_MAX + 20) return false;

        const walls = (this.buildWalls || []).map((m) => this.wallFootprint(m));
        walls.push(this.candidateFootprint(position));

        const step = 5;
        const pad = 1; // shrink wall test a hair so touching walls still leave a seam? no — keep solid
        const blocked = (x, z) => {
            for (const w of walls) {
                if (Math.abs(x - w.x) <= w.hx + pad && Math.abs(z - w.z) <= w.hz + pad) return true;
            }
            return false;
        };

        // Build the grid of open cells inside the corridor.
        const cols = [], rows = [];
        for (let x = X_MIN; x <= X_MAX; x += step) cols.push(x);
        for (let z = Z_MIN; z <= Z_MAX; z += step) rows.push(z);
        const key = (ci, ri) => ci + '_' + ri;
        const open = new Set();
        for (let ci = 0; ci < cols.length; ci++) {
            for (let ri = 0; ri < rows.length; ri++) {
                if (!blocked(cols[ci], rows[ri])) open.add(key(ci, ri));
            }
        }
        // Seeds: open cells on the far-LEFT column (A side). Targets: far-RIGHT.
        const queue = [];
        const seen = new Set();
        for (let ri = 0; ri < rows.length; ri++) {
            if (open.has(key(0, ri))) { queue.push([0, ri]); seen.add(key(0, ri)); }
        }
        const lastCol = cols.length - 1;
        while (queue.length) {
            const [ci, ri] = queue.shift();
            if (ci === lastCol) return false; // reached B side → tunnel still open
            for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nc = ci + dc, nr = ri + dr;
                if (nc < 0 || nr < 0 || nc >= cols.length || nr >= rows.length) continue;
                const k = key(nc, nr);
                if (open.has(k) && !seen.has(k)) { seen.add(k); queue.push([nc, nr]); }
            }
        }
        // Never reached the right side → this wall seals the corridor.
        return true;
    }

    canPlaceWallAtPosition(position, wallType, shouldFlash = false) {
        const gridPos = this.snapToGrid(position);

        // ZONE RULE: can't build in the enemy's two diagonal tunnels.
        if (this.isInEnemyTunnel(gridPos.x, gridPos.z)) {
            if (shouldFlash) this.flashBuildZoneWarning("Can't build in enemy tunnels");
            return false;
        }

        // ZONE RULE 2: can't place the wall that would fully seal the mid tunnel
        // (the direct A↔B corridor). Partial walls are fine; only the sealing one
        // is refused, so there's always a way through mid.
        if (this.wouldSealMidTunnel(gridPos)) {
            if (shouldFlash) this.flashBuildZoneWarning("Can't fully close the mid tunnel");
            return false;
        }

        // Check if player has enough money
        const cost = wallType === 'large' ? 200 : 100;
        if (this.buildMoney < cost) {
            // Only flash on drop attempt, not while dragging
            if (shouldFlash) {
                this.flashMoneyRed();
            }
            return false;
        }

        // Create unique key based on position and rotation
        // This ensures walls don't overlap
        const isVertical = Math.abs(this.currentWallRotation % Math.PI) > 0.1;
        const wallKey = `${gridPos.x}_${gridPos.z}_${isVertical ? 'V' : 'H'}`;

        // Check if this exact wall position and orientation is taken
        if (this.placedWallPositions.has(wallKey)) {
            return false;
        }

        return true;
    }

    // Brief banner explaining why a drop was refused (enemy tunnel / sealing mid).
    flashBuildZoneWarning(msg = "Can't build here") {
        let el = document.getElementById('buildZoneWarning');
        if (!el) {
            el = document.createElement('div');
            el.id = 'buildZoneWarning';
            el.style.cssText = `
                position: fixed; top: 96px; left: 50%; transform: translateX(-50%);
                padding: 10px 18px; border-radius: 8px; z-index: 1002;
                background: rgba(26,36,71,0.95); border: 1px solid ${HUD.orange};
                color: ${HUD.orange}; font-family: 'Inter', sans-serif; font-size: 13px;
                font-weight: 600; letter-spacing: 0.5px; pointer-events: none;
                box-shadow: 0 4px 16px rgba(0,0,0,0.4); opacity: 0; transition: opacity 0.15s;`;
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.style.opacity = '1';
        clearTimeout(this._buildZoneWarnTimer);
        this._buildZoneWarnTimer = setTimeout(() => { el.style.opacity = '0'; }, 1400);
    }
    
    markGridAsOccupied(position, wallType) {
        const gridPos = this.snapToGrid(position);
        
        // Mark this exact position and orientation as occupied
        const isVertical = Math.abs(this.currentWallRotation % Math.PI) > 0.1;
        const wallKey = `${gridPos.x}_${gridPos.z}_${isVertical ? 'V' : 'H'}`;
        this.placedWallPositions.add(wallKey);
        
        console.log(`Marked ${isVertical ? 'vertical' : 'horizontal'} wall at (${gridPos.x}, ${gridPos.z})`);
    }
    
    
    handleRemoteBuildingPlaced(message) {
        // Another player placed a building
        console.log('Received building placement message:', message);
        const position = { x: message.x, z: message.z, y: 0 };
        const rotation = message.rotation;
        const wallType = message.building_type;
        
        console.log(`Remote player ${message.player_id} placed ${wallType} at (${position.x}, ${position.z}) rotation: ${rotation}`);

        // Place the wall visually without spending money — colored by the team
        // that built it (looked up from player_id).
        const team = (this.playerTeams && this.playerTeams[message.player_id]) || 'orange';
        this.placeRemoteWall(position, rotation, wallType, team);
    }

    placeRemoteWall(position, rotation, wallType, team = 'orange') {
        // Similar to placeWallAtPosition but without money check and network send
        const wallLength = 20;
        const wallThickness = 2;
        
        let height, yPos;
        if (wallType === 'large') {
            height = 20;
            yPos = 10;
        } else if (wallType === 'destructible') {
            height = 20;
            yPos = 10;
        } else {
            height = 10;
            yPos = 5;
        }
        
        const width = wallLength;
        const depth = wallThickness;
        
        // Mark grid position as occupied
        const savedRotation = this.currentWallRotation;
        this.currentWallRotation = rotation;
        this.markGridAsOccupied(position, wallType);
        this.currentWallRotation = savedRotation;
        
        // Create the wall geometry
        const wallGeometry = new THREE.BoxGeometry(width, height, depth);
        const isDestructible = wallType === 'destructible';

        const wallMaterial = new THREE.MeshPhongMaterial({ emissiveIntensity: 0.2 });
        const wall = new THREE.Mesh(wallGeometry, wallMaterial);
        wall.position.set(position.x, yPos, position.z);
        wall.rotation.y = rotation;
        wall.castShadow = true;
        wall.receiveShadow = true;
        // Color by team + add the destructible X marker.
        this.decorateWall(wall, width, height, depth, team, isDestructible);
        
        if (wallType === 'destructible') {
            wall.userData.isDestructible = true;
            wall.userData.bulletHoles = [];
            wall.userData.wallType = 'destructible';
        }
        
        this.scene.add(wall);
        this.buildWalls.push(wall);
        
        // Add collision
        if (this.collisionSystem) {
            const collisionHeight = wallType === 'barrier' ? 5 : 10;
            this.collisionSystem.addBoxCollider(
                new THREE.Vector3(position.x, yPos, position.z),
                new THREE.Vector3(width, height, depth),
                'buildWall',
                rotation
            );
        }
    }

    // Palette: a team's MAIN color + its ACCENT (the opposite). Orange team =
    // orange/navy, navy team ('red') = navy/orange. Flipped per team.
    teamWallColors(team) {
        return team === 'red'
            ? { main: 0x1a2447, accent: 0xef4e23, emissive: 0x0d1326 } // navy team
            : { main: 0xef4e23, accent: 0x1a2447, emissive: 0x331100 }; // orange team
    }

    // Build a wall's material color (by team) and, for destructible walls, add a
    // bold X (two corner-to-corner diagonals) + thick edge outline in the ACCENT
    // (opposite) color so the player can tell "shoot here" at a glance.
    decorateWall(wall, width, height, depth, team, isDestructible) {
        const c = this.teamWallColors(team);
        if (!isDestructible) {
            // Plain wall — just the team main color.
            if (wall.material) {
                wall.material.map = null;
                wall.material.color = new THREE.Color(c.main);
                if ('emissive' in wall.material) wall.material.emissive = new THREE.Color(c.emissive);
                wall.material.needsUpdate = true;
            }
            return;
        }

        // Destructible: PAINT the X + border directly INTO the wall surface via a
        // canvas texture (flat, flush, part of the wall) instead of building 3D
        // bars on top. The texture is driven through BOTH map AND emissiveMap with
        // full-white emissive, so the navy/orange render as their EXACT palette
        // colors, unlit — no Phong shading washing them out, and no color shift
        // when the wall is shot and its geometry (UVs) is rebuilt.
        const tex = this.makeDestructibleTexture(c.main, c.accent);
        if (wall.material) {
            // color BLACK so the lit (Phong) channel contributes nothing, and
            // drive the surface purely from the emissive texture. Result: the wall
            // shows the EXACT palette navy/orange, fully unlit — no shading washes
            // them into a different-looking color, and no shift when shot.
            wall.material.map = null;
            wall.material.color = new THREE.Color(0x000000);
            if ('emissiveMap' in wall.material) {
                wall.material.emissiveMap = tex;
                wall.material.emissive = new THREE.Color(0xffffff);
                wall.material.emissiveIntensity = 1;
            } else {
                wall.material.map = tex;
            }
            wall.material.needsUpdate = true;
        }
    }

    // Build (and cache) a canvas texture: solid `main` fill, with an accent-color
    // border frame + corner-to-corner X painted flat into it. Cached per
    // main/accent pair so we don't redraw a canvas for every wall.
    makeDestructibleTexture(main, accent) {
        this._destructibleTexCache = this._destructibleTexCache || {};
        const key = main + '_' + accent;
        if (this._destructibleTexCache[key]) return this._destructibleTexCache[key];

        const S = 256;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = S;
        const ctx = canvas.getContext('2d');
        const hex = (n) => '#' + n.toString(16).padStart(6, '0');

        // Fill with the wall's main color.
        ctx.fillStyle = hex(main);
        ctx.fillRect(0, 0, S, S);

        // Accent strokes — ~6% of the wall, so a touch thinner than before.
        ctx.strokeStyle = hex(accent);
        ctx.lineWidth = S * 0.06;
        ctx.lineCap = 'square';

        // Border frame (inset by half the line width so it sits fully inside).
        const inset = ctx.lineWidth / 2;
        ctx.strokeRect(inset, inset, S - 2 * inset, S - 2 * inset);

        // Corner-to-corner X, all the way into the corners.
        ctx.beginPath();
        ctx.moveTo(inset, inset);         ctx.lineTo(S - inset, S - inset);
        ctx.moveTo(S - inset, inset);     ctx.lineTo(inset, S - inset);
        ctx.stroke();

        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        // Tag as sRGB so the palette hex values render as their EXACT colors
        // (without this the renderer treats it as linear and the navy/orange
        // come out as a washed-out, different-looking shade).
        if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
        this._destructibleTexCache[key] = tex;
        return tex;
    }

    placeWallAtPosition(position, rotation) {
        // Position is already snapped to grid
        
        // ALL walls have same length (20 units) for clean grid
        const wallLength = 20;  // All walls same length
        const wallThickness = 2;  // All walls same thickness
        
        let height, yPos, cost;
        if (this.selectedWallType === 'large') {
            height = 20; // Full height
            yPos = 10;
            cost = 200;
        } else if (this.selectedWallType === 'destructible') {
            height = 20; // Full height
            yPos = 10;
            cost = 50;
        } else {
            // Barrier - same length, half height
            height = 10; // Half height
            yPos = 5;
            cost = 100;
        }
        
        const width = wallLength;
        const depth = wallThickness;
        
        // Check if player has enough money
        if (this.buildMoney < cost) {
            console.log(`Not enough money for ${this.selectedWallType} wall`);
            return;
        }
        
        // Send to network FIRST so other players see it
        if (this.network && this.network.isConnected()) {
            console.log(`Sending building placement: ${this.selectedWallType} at (${position.x}, ${position.z}) rotation: ${rotation}`);
            this.network.sendPlaceBuilding(position, rotation, this.selectedWallType);
        } else {
            console.log('Network not connected, building placement not sent');
        }
        
        // Mark grid position as occupied BEFORE placing wall (pass rotation)
        this.markGridAsOccupied(position, this.selectedWallType);
        
        // Create wall with correct orientation
        // Wall always has length 20, but rotation determines which axis
        const wallGeometry = new THREE.BoxGeometry(width, height, depth);
        const isDestructible = this.selectedWallType === 'destructible';

        const wallMaterial = new THREE.MeshPhongMaterial({ emissiveIntensity: 0.2 });
        const wall = new THREE.Mesh(wallGeometry, wallMaterial);
        wall.position.set(position.x, yPos, position.z);
        wall.rotation.y = rotation;
        wall.castShadow = true;
        wall.receiveShadow = true;
        // Color by MY team + add the destructible X marker.
        this.decorateWall(wall, width, height, depth, this.playerTeam, isDestructible);
        
        // Mark destructible walls with special properties
        if (this.selectedWallType === 'destructible') {
            wall.userData.isDestructible = true;
            wall.userData.bulletHoles = []; // Array to track bullet holes
            wall.userData.wallType = 'destructible';
        }
        
        this.scene.getScene().add(wall);
        this.buildWalls.push(wall);  // Track for cleanup
        
        // Add collision
        this.collisionSystem.addBoxCollider(
            { x: position.x, y: yPos, z: position.z },
            { x: width, y: height, z: depth },
        );
        
        // Deduct money
        this.buildMoney -= cost;
        this.playerMoney = this.buildMoney; // Keep playerMoney in sync
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
            option.style.border = '1px solid rgba(239, 78, 35, 0.12)';
        });
    }
    
    updateMoneyDisplay() {
        // Update the money display in bottom right
        const moneyAmount = document.getElementById('moneyAmount');
        if (moneyAmount) {
            moneyAmount.textContent = `$${this.buildMoney}`;
        }
        
        // Show/hide money display based on build mode
        const moneyDisplay = document.getElementById('moneyDisplay');
        if (moneyDisplay) {
            if (this.isBuildMode) {  // Fixed typo: was inBuildMode, should be isBuildMode
                moneyDisplay.style.display = 'flex';
            } else {
                moneyDisplay.style.display = 'none';
            }
        }
    }
    
    flashMoneyRed() {
        const moneyAmount = document.getElementById('moneyAmount');
        const moneyDisplay = document.getElementById('moneyDisplay');
        
        if (moneyAmount && moneyDisplay) {
            // Store original color
            const originalColor = moneyAmount.style.color || '#ef4e23';
            const originalBorder = moneyDisplay.style.border;
            
            // Flash red
            moneyAmount.style.color = '#ef4e23';
            moneyDisplay.style.border = '1px solid rgba(239, 78, 35, 0.6)';
            moneyDisplay.style.animation = 'shake 0.3s';
            
            // Reset after animation
            setTimeout(() => {
                moneyAmount.style.color = originalColor;
                moneyDisplay.style.border = originalBorder || '1px solid rgba(76, 175, 80, 0.3)';
                moneyDisplay.style.animation = '';
            }, 300);
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
            color: 0xef4e23, 
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
        this.playerMoney = this.buildMoney; // Keep playerMoney in sync
        this.updateMoneyDisplay();
        
        // Create actual wall
        const wallHeight = 15;
        const wallWidth = wallType === 'large' ? 3 : 1.5;
        
        const wallGeometry = new THREE.BoxGeometry(distance, wallHeight, wallWidth);
        const wallMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xef4e23,
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
        this.playerMoney = this.buildMoney; // Keep playerMoney in sync
        this.updateMoneyDisplay();
        
        // Create barrier
        const wallHeight = 12; // Smaller than player height
        const wallWidth = 1.5;  // Thin wall
        
        const wallGeometry = new THREE.BoxGeometry(distance, wallHeight, wallWidth);
        const wallMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xef4e23,    // Orange like the map
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
    
    // Removed duplicate updateMoneyDisplay
    
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
                background: rgba(26, 36, 71, 0.88);
                border: 1px solid rgba(239, 78, 35, 0.18);
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
    
    // Clean, minimalist round-end banner matching the rest of the HUD.
    // title: the big line (e.g. "Defenders win"); subtitle: small caps reason
    // (e.g. "Bomb defused"); accent: thin top color bar (team color).
    showRoundEndMessage(title, subtitle = '', accent = '#ffffff') {
        let message = document.getElementById('roundEndMessage');

        if (!message) {
            message = document.createElement('div');
            message.id = 'roundEndMessage';
            // Compact, minimal banner pinned near the TOP of the screen — not a
            // big box in the middle that blocks the view.
            message.style.cssText = `
                position: fixed;
                top: 14px;
                left: 50%;
                transform: translateX(-50%) translateY(-8px);
                padding: 7px 16px;
                background: rgba(26, 36, 71, 0.9);
                border: 1px solid rgba(239, 78, 35, 0.18);
                border-left: 3px solid ${accent};
                border-radius: 8px;
                backdrop-filter: blur(8px);
                color: #ef4e23;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                z-index: 500;
                text-align: center;
                white-space: nowrap;
                opacity: 0;
                transition: opacity 0.2s ease, transform 0.2s ease;
                pointer-events: none;
            `;
            document.body.appendChild(message);
        }
        // Keep the accent on the left border even when reusing the element.
        message.style.borderLeftColor = accent;

        message.innerHTML = `
            <span style="font-size: 14px; font-weight: 500; letter-spacing: 0.3px;">${title}</span>
            ${subtitle ? `<span style="font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.5; margin-left: 8px;">${subtitle}</span>` : ''}
        `;

        message.style.display = 'block';
        requestAnimationFrame(() => {
            message.style.opacity = '1';
            message.style.transform = 'translateX(-50%) translateY(0)';
        });

        if (this._roundEndMsgTimer) clearTimeout(this._roundEndMsgTimer);
        this._roundEndMsgTimer = setTimeout(() => {
            message.style.opacity = '0';
            message.style.transform = 'translateX(-50%) translateY(-8px)';
            setTimeout(() => { message.style.display = 'none'; }, 250);
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
