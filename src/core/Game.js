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
import { NotificationFeed } from '../ui/NotificationFeed.js';
import { AmmoDisplay } from '../ui/AmmoDisplay.js';
import { KillCamSystem } from '../game/KillCamSystem.js';
import { ReplayRecorder } from '../game/ReplayRecorder.js';

export class Game {
    constructor() {
        ensureHudKeyframes();
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

        window.game = this;
        window.gameInstance = this;
        this.killFeed = null;
        this.notifications = null;
        this.ammoDisplay = null;

        this.gameStarted = false;
        this.playerName = '';
        this.isAlive = true;
        this.deathCamActive = false;
        this.originalCameraPosition = null;
        this.kills = 0;
        this.health = 100;
        this.shield = 100;

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

        this.cameraRecoil = { x: 0, y: 0 };
        this.recoilRecovery = 0.05;

        this.isBuildMode = false;
        this.savedCameraPosition = null;
        this.savedCameraRotation = null;
        this.buildMoney = 800;
        this.selectedWallType = null;
        this.isDragModeEnabled = false;
        this.buildWalls = [];
        // Reusable objects for hit detection — avoids allocating a new Raycaster
        // and Vector3s on every shot (reduces GC pressure on weak machines).
        this._raycaster = new THREE.Raycaster();
        this._shootDirVec = new THREE.Vector3();
        this._dirToPlayerVec = new THREE.Vector3();
        this.isPlacingWall = false;
        this.wallStartPos = null;
        this.wallPreview = null;
        this.isDraggingFromUI = false;
        this.floatingWallPreview = null;
        this.globalDragHandlers = null;
        this.lastMouseMapPos = null;
        this.currentWallRotation = 0;

        this.myHalfSign = 0;

        this.gridSize = 20;
        this.placedWallPositions = new Set();

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

        if (!this.network) {
            this.network = new NetworkClient();
            this.network.connect();

            this.network.onRoundStartCallback = (message) => {
                this.roundNumber = message.round_number;
                this.orangeScore = message.orange_score;
                this.redScore = message.red_score;
                this.attackingTeam = message.attacking_team;

                if (message.round_number === 1) this._track('match-started');
                this.startBuildPhaseTimer(message.buy_time);
                this.updateRoundDisplay();
                console.log(`Round ${this.roundNumber} started! Build phase: ${message.buy_time}s`);
                console.log(`Scores: Orange: ${this.orangeScore}, Red: ${this.redScore}`);
                console.log(`Attacking team: ${this.attackingTeam}`);

                const doRoundRespawn = () => {
                    console.log('New round starting - force respawning player');
                    this.isAlive = true;

                    if (this._postRoundCleanupTimer) {
                        clearTimeout(this._postRoundCleanupTimer);
                        this._postRoundCleanupTimer = null;
                        if (this.playerManager) this.playerManager.clearAllPlayers();
                    }

                    if (this.gameMode !== 'team') {
                        this.spawnPlayer();
                    }
                    this.hideDeathMessage();
                    this.deactivateDeathCam();
                    if (this.killCam) this.killCam.onLocalPlayerRespawned();
                    console.log('Player force-respawned for new round');
                    if (this.bombSystem) {
                        this.bombSystem.clearDroppedBomb();

                        this.bombSystem.removeBomb();
                    }
                };

                const killCamActive = this.killCam && this.killCam.isActive && this.killCam.isActive();
                if (this.replayRecorder && this.replayRecorder.isPlaying) {
                    const elapsed = performance.now() / 1000 - this.replayRecorder.replayWallStart;
                    const remaining = Math.max(0, this.replayRecorder.replayDuration - elapsed) * 1000;

                    setTimeout(doRoundRespawn, remaining + 1200);
                } else if (killCamActive) {

                    setTimeout(doRoundRespawn, 1500);
                } else {
                    doRoundRespawn();
                }
            };

            this.network.onRoundEndCallback = (message) => {
                this.orangeScore = message.orange_score;
                this.redScore = message.red_score;

                this.stopRoundTimer();
                this.updateRoundDisplay();
                console.log(`Round ended! Winner: ${message.winner}, Reason: ${message.reason}`);
                console.log(`Scores updated - Orange: ${this.orangeScore}, Red: ${this.redScore}`);
                this.handleRoundEndMessage(message);
            };

            this.network.onMatchEndCallback = (message) => {
                console.log('🏆 Match ended! Winner:', message.winner);
                this.handleMatchEnd(message);
            };

            this.network.onBuildPhaseEndCallback = (roundTime) => {
                this.isInBuildPhase = false;
                this.buildPhaseTimer = null;
                this.updateRoundDisplay();

                if (this.isBuildMode) {
                    this.isBuildMode = false;
                    this.exitBuildMode();
                    console.log('Exiting build mode - build phase ended');
                }

                this.startRoundTimer(roundTime || 100);

                console.log('Build phase ended! Combat phase started!');
            };

            this.network.onGiveBombCallback = (message) => {
                if (message.player_id === this.network.playerId) {
                    this.bombSystem.giveBomb();
                    console.log('You have the bomb!');
                }
            };

            this.network.onBombDroppedCallback = (message) => {

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

                    if (message.player_id === this.network.playerId) {
                        this.bombSystem.onLocalBombPlanted();
                        console.log('Bomb removed from local player hand after server confirmation');
                    }
                }
                this.notify('Bomb planted', 'Site under attack');
                this._track('bomb-planted', { is_local: message.player_id === this.network.playerId });
            };

            this.network.onBombDefusedCallback = (message) => {
                console.log(`Bomb defused by player ${message.player_id}`);
                if (this.bombSystem) {
                    this.bombSystem.onBombDefused();
                }
                this.notify('Bomb defused', 'Site secured');
                this._track('bomb-defused', { is_local: message.player_id === this.network.playerId });
            };

            this.network.onBombExplodedCallback = () => {
                console.log('Bomb exploded!');
                if (this.bombSystem) {
                    this.bombSystem.onBombExploded();
                }
                this.notify('Bomb detonated');
                this._track('bomb-exploded');
            };

            this.network.onMapResetCallback = () => {
                console.log('Halftime — resetting map (clearing built walls)');
                this.clearBuildWalls();
            };

            this.network.onWallHole((message) => this.applyServerWallHole(message));
        }

        this.playerManager = new PlayerManager(
            this.scene.getScene(),
            this.renderer ? this.renderer.getRenderer() : null,
            this.camera ? this.camera.getCamera() : null
        );
        this.playerManager.setGameMode(this.gameMode);
        this.playerManager.setLocalTeam(this.playerTeam || null);
        this.bulletSystem = new BulletSystem(this.scene.getScene());
        this.weaponSystem = new RifleWeapon(this.camera.getCamera(), this.scene.getScene(), this.playerTeam);
        this.bombSystem = new BombSystem(this.camera.getCamera(), this.scene.getScene());

        document.getElementById('gameContainer').appendChild(this.renderer.getRenderer().domElement);

        document.addEventListener('keydown', (e) => {
            if (e.code === 'F8') { e.preventDefault(); this.togglePerfOverlay(); }
        });

        this.setupSystems();
        this.animate();
    }

    setupSystems() {
        this.lighting.setupLights();

        const mapType = this.gameMode === 'team' ? 'orangePlanet' : 'city';
        console.log('Building map with type:', mapType);
        this.mapBuilder.buildMap(mapType);

        this.input.setupControls(this.camera.getCamera());
        this.input.setCollisionSystem(this.collisionSystem);

        this.miniMap = new SimpleMiniMap(this.scene.getScene(), this.renderer.getRenderer());
        this.compass = new Compass();
        this.scoreboard = new Scoreboard();

        this.notifColumn = document.createElement('div');
        this.notifColumn.id = 'notifColumn';
        this.notifColumn.style.cssText = `
            position: fixed;
            top: 20px;
            left: 280px;
            width: 320px;
            z-index: 100;
            pointer-events: none;
            display: flex;
            flex-direction: column;
            gap: 8px;
        `;
        document.body.appendChild(this.notifColumn);

        this.notifications = new NotificationFeed(this.notifColumn);
        this.killFeed = new KillFeed(this.notifColumn);
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

        this.playerMoney = 800;
        this.buildMoney = 800;
        this.createMoneyDisplay();

        this.network.onPlayerJoined((player) => this.playerManager.addPlayer(player));
        this.network.onPlayerLeft((playerId) => this.playerManager.removePlayer(playerId));
        this.network.onPlayerMoved((message) => {

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

            setTimeout(() => { to.style.display = 'flex'; to.classList.add('show'); }, 180);
        }
    }

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

                const waitLobby = setInterval(() => {
                    if (this._lobbyReady) {
                        clearInterval(waitLobby);
                        clearTimeout(this._loaderSafety);
                        steps.forEach((s) => s.classList.add('done'));
                        steps.forEach((s) => s.classList.remove('active'));
                        setTimeout(goToTeamSelect, 400);
                    }
                }, 100);

                this._loaderSafety = setTimeout(() => { clearInterval(waitLobby); goToTeamSelect(); }, 4000);
                return;
            }
            advance();
        }, 700);
    }

    setupNameScreen() {
        const nameInput = document.getElementById('playerName');
        const joinButton = document.getElementById('joinGame');

        setTimeout(() => nameInput.focus(), 100);

        const refreshArrow = () => joinButton.classList.toggle('ready', nameInput.value.trim().length > 0);
        nameInput.addEventListener('input', refreshArrow);
        refreshArrow();

        joinButton.addEventListener('click', () => {
            const name = nameInput.value.trim();
            if (name) {
                this.playerName = name;
                this._track('name-entered');
                const yn = document.getElementById('yourName'); if (yn) yn.textContent = name;

                this.transitionScreen('nameScreen', 'loadingScreen');
                this.runJoinLoader();

                if (!this.network) {
                    this.network = new NetworkClient();
                    this.network.connect();

                    this.network.onRoundStartCallback = (message) => {
                        this.roundNumber = message.round_number;
                        this.orangeScore = message.orange_score;
                        this.redScore = message.red_score;
                        this.attackingTeam = message.attacking_team;

                        if (message.round_number === 1) this._track('match-started');
                        this.startBuildPhaseTimer(message.buy_time);
                        this.updateRoundDisplay();
                        console.log(`Round ${this.roundNumber} started! Build phase: ${message.buy_time}s`);
                        console.log(`Scores: Orange: ${this.orangeScore}, Red: ${this.redScore}`);
                        console.log(`Attacking team: ${this.attackingTeam}`);

                        const doRoundRespawn = () => {
                            console.log('New round starting - force respawning player');
                            this.isAlive = true;

                            if (this._postRoundCleanupTimer) {
                                clearTimeout(this._postRoundCleanupTimer);
                                this._postRoundCleanupTimer = null;
                                if (this.playerManager) this.playerManager.clearAllPlayers();
                            }

                            if (this.gameMode !== 'team') {
                                this.spawnPlayer();
                            }
                            this.hideDeathMessage();
                            this.deactivateDeathCam();
                            if (this.killCam) this.killCam.onLocalPlayerRespawned();
                            console.log('Player force-respawned for new round');

                            if (this.bombSystem) {
                                this.bombSystem.clearDroppedBomb();

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
                        this.stopRoundTimer();
                        this.updateRoundDisplay();
                        console.log(`Round ended! Winner: ${message.winner}, Reason: ${message.reason}`);
                        console.log(`Scores updated - Orange: ${this.orangeScore}, Red: ${this.redScore}`);
                        this.handleRoundEndMessage(message);
                    };

                    this.network.onMatchEndCallback = (message) => {
                        console.log('🏆 Match ended! Winner:', message.winner);
                        this.handleMatchEnd(message);
                    };

                    this.network.onBuildPhaseEndCallback = () => {
                        this.isInBuildPhase = false;
                        this.buildPhaseTimer = null;
                        this.updateRoundDisplay();

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

                            if (message.player_id === this.network.playerId) {
                                this.bombSystem.onLocalBombPlanted();
                                console.log('Bomb removed from local player hand after server confirmation');
                            }
                        }
                        this.notify('Bomb planted', 'Site under attack');
                    };

                    this.network.onBombDefusedCallback = (message) => {
                        console.log(`Bomb defused by player ${message.player_id}`);
                        if (this.bombSystem) {
                            this.bombSystem.onBombDefused();
                        }
                        this.notify('Bomb defused', 'Site secured');
                    };

                    this.network.onBombExplodedCallback = () => {
                        console.log('Bomb exploded!');
                        if (this.bombSystem) {
                            this.bombSystem.onBombExploded();
                        }
                        this.notify('Bomb detonated');
                    };

                    this.network.onMapResetCallback = () => {
                        console.log('Halftime — resetting map (clearing built walls)');
                        this.clearBuildWalls();
                    };

                    this.network.onWallHole((message) => this.applyServerWallHole(message));
                }

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

        if (!this.teamListenersSetup) {
            this.teamListenersSetup = true;

            this.network.onTeamLobbyCreated((message) => {

                this._lobbyReady = true;
                console.log('Team lobby created:', message.lobby_id);
            });

            this.network.onTeamUpdate((message) => {
                console.log('Team update received:', message);
                this.teamPlayers.orange = message.orange_team;
                this.teamPlayers.red = message.red_team;

                if (!this.playerTeams) this.playerTeams = {};
                (message.orange_team || []).forEach((p) => { if (p && p.id) this.playerTeams[p.id] = 'orange'; });
                (message.red_team || []).forEach((p) => { if (p && p.id) this.playerTeams[p.id] = 'red'; });
                this.updateTeamDisplay();
                this.updateStartButton(message.can_start);
            });

            this.network.onGameStarted((message) => {
                if (message.game_mode === 'team') {

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

                    this.roundNumber = 1;
                    this.orangeScore = 0;
                    this.redScore = 0;
                    this.updateRoundDisplay();

                    this.startGame();
                }
            });

            document.getElementById('joinOrangeTeam').addEventListener('click', () => {
                console.log('Joining orange team...');
                this.joinTeam('orange');
            });

            document.getElementById('joinRedTeam').addEventListener('click', () => {
                console.log('Joining red team...');
                this.joinTeam('red');
            });

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

        this.updateTeamDisplay();
        console.log('Sent join team request for:', team);
    }

    updateTeamDisplay() {
        const myName = this.playerName;

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

        const orangeHalf = document.getElementById('joinOrangeTeam');
        const navyHalf = document.getElementById('joinRedTeam');
        const screen = document.getElementById('teamSelectionScreen');
        if (orangeHalf) orangeHalf.classList.toggle('selected', this.selectedTeam === 'orange');
        if (navyHalf) navyHalf.classList.toggle('selected', this.selectedTeam === 'red');
        if (screen) screen.classList.toggle('has-pick', !!this.selectedTeam);

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

        startButton.disabled = !(this.selectedTeam && canStart);
    }

    startGame() {
        if (!this.gameStarted) {
            this.gameStarted = true;
            this.showLoadingScreen();
            // Safety net: never let the loading screen get stuck if the intro
            // path doesn't run for some reason.
            setTimeout(() => this.hideLoadingScreen(), 6000);
            this.initialize();

            this.updateHealthDisplay();
            this.updateKillCounter();

            setTimeout(() => {

                if (this.gameMode === 'deathmatch' && this.network.isConnected()) {
                    this.network.joinGame(this.playerName);

                    this.spawnPlayer();
                }

            }, 200);
        }
    }

    // Delay the intro cinematic until the heavy character models have finished
    // loading/decoding. The GLB/FBX decode + first GPU upload cause a one-time
    // main-thread hitch; if the intro camera is already moving when it happens,
    // you see a stutter. By waiting for playerManager.loaded first, the decode
    // happens on the static pre-intro screen instead. Capped at ~3s so a failed
    // model load can never hang the intro forever.
    _startIntroWhenLoaded(spawnPos, spawnYaw, waited = 0) {
        const ready = !this.playerManager
            || this.playerManager.loaded
            || this.playerManager.loadFailed;
        if (ready || waited >= 3000) {
            this.hideLoadingScreen();
            this.startIntroCinematic(spawnPos, spawnYaw);
            return;
        }
        setTimeout(() => this._startIntroWhenLoaded(spawnPos, spawnYaw, waited + 50), 50);
    }

    showLoadingScreen() {
        if (document.getElementById('matchLoadingScreen')) return;
        const el = document.createElement('div');
        el.id = 'matchLoadingScreen';
        el.style.cssText = `
            position: fixed; inset: 0; z-index: 100000;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            background: #0d1326; color: #cdd6f4;
            font-family: 'JetBrains Mono', ui-monospace, monospace;`;
        el.innerHTML = `
            <div style="font-size: 22px; letter-spacing: 4px; text-transform: uppercase; color:#ef4e23; font-weight:800; margin-bottom: 22px;">RSGO</div>
            <div style="font-size: 13px; letter-spacing: 2px; opacity: 0.7; margin-bottom: 18px;">LOADING MATCH…</div>
            <div style="width: 220px; height: 4px; background: rgba(255,255,255,0.12); border-radius: 4px; overflow: hidden;">
                <div style="width: 40%; height: 100%; background: #ef4e23; border-radius: 4px;
                    animation: rsgoLoadingBar 1.1s ease-in-out infinite;"></div>
            </div>
            <style>
                @keyframes rsgoLoadingBar {
                    0%   { transform: translateX(-100%); }
                    100% { transform: translateX(320%); }
                }
            </style>`;
        document.body.appendChild(el);
    }

    hideLoadingScreen() {
        const el = document.getElementById('matchLoadingScreen');
        if (el) el.remove();
    }

    startIntroCinematic(spawnPos, spawnYaw) {
        const cam = this.camera.getCamera();

        const lookDir = new THREE.Vector3(-Math.sin(spawnYaw), 0, -Math.cos(spawnYaw));

        const side = Math.sign(spawnPos.z) || -1;
        const A = new THREE.Vector3(0, 620, 40);
        const B = new THREE.Vector3(side * -260, 380, side * 120);
        const C = new THREE.Vector3(spawnPos.x - lookDir.x * 220, 150, spawnPos.z - lookDir.z * 220);
        const D = spawnPos.clone();
        this._introCurve = new THREE.CatmullRomCurve3([A, B, C, D], false, 'catmullrom', 0.5);

        this._introLookStart = new THREE.Vector3(0, 0, 0);
        this._introLookEnd = spawnPos.clone().add(lookDir.clone().multiplyScalar(60));
        this._introLookEnd.y = spawnPos.y;

        this._introDuration = 6000;
        this._introStartMs = null;
        this._introWarmup = 0;
        this._introSpawnPos = spawnPos.clone();
        this._introSpawnYaw = spawnYaw;
        this._introPlaying = true;

        if (this.playerManager) this.playerManager.deferAdds = true;

        this._setHudVisibleForIntro(false);

        if (this.mapBuilder && this.mapBuilder.introDecor) this.mapBuilder.introDecor.visible = true;

        cam.position.copy(A);
        cam.lookAt(this._introLookStart);
    }

    updateIntroCinematic() {
        const cam = this.camera.getCamera();

        this._setHudVisibleForIntro(false);

        if (this._introStartMs === null) {
            this._introWarmup = (this._introWarmup || 0) + 1;

            cam.position.copy(this._introCurve.getPoint(0));
            cam.lookAt(this._introLookStart);
            if (this._introWarmup < 3) return;
            this._introStartMs = performance.now();
            this._introWarmup = 0;
        }

        const t = Math.min(1, (performance.now() - this._introStartMs) / this._introDuration);

        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        const p = this._introCurve.getPoint(e);
        cam.position.copy(p);

        const lookT = Math.min(1, e * 1.15);
        const look = this._introLookStart.clone().lerp(this._introLookEnd, lookT);
        cam.lookAt(look);

        if (t >= 1) this.finishIntroCinematic();
    }

    finishIntroCinematic() {
        this._introPlaying = false;
        this._introDone = true;

        const cam = this.camera.getCamera();
        cam.position.copy(this._introSpawnPos);
        this.input.yaw = this._introSpawnYaw;
        this.input.pitch = 0;
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.input.yaw);
        cam.quaternion.copy(q);
        cam.updateMatrixWorld();
        this._setHudVisibleForIntro(true);
        this._hudPrevDisplay = null;

        if (this.playerManager) this.playerManager.flushDeferredPlayers();

        this.updateBuildPrompt();

        if (this.mapBuilder && this.mapBuilder.introDecor) this.mapBuilder.introDecor.visible = false;

        this._introCurve = null;
        this.hideLoadingScreen();
    }

    _setHudVisibleForIntro(visible, keepPovWeapon = false) {

        const ids = [
            'roundContainer',
            'healthContainer',
            'killCounter',
            'simple-minimap',
            'minimap-player-arrow',
            'compass-container',
            'compass-center-line',
            'compass-left-fade',
            'compass-right-fade',
            'compass-degree-display',
            'ammoContainer',
            'bombIndicator',
            'bombDropPrompt',
            'notifColumn',
        ];

        if (!keepPovWeapon) ids.push('crosshair');
        if (!this._hudPrevDisplay) this._hudPrevDisplay = {};
        ids.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (visible) {

                el.style.display = (id in this._hudPrevDisplay) ? this._hudPrevDisplay[id] : '';
            } else {

                if (!(id in this._hudPrevDisplay)) this._hudPrevDisplay[id] = el.style.display;
                el.style.display = 'none';
            }
        });
        if (this.ammoDisplay) { visible ? this.ammoDisplay.show() : this.ammoDisplay.hide(); }

        if (this.weaponSystem) {
            if (visible || keepPovWeapon) this.weaponSystem.show();
            else this.weaponSystem.hide();
        }

        if (keepPovWeapon && !visible) {
            const cx = document.getElementById('crosshair');
            if (cx) cx.style.display = '';
        }
    }

    spawnPlayer() {
        const spawnIndex = Math.floor(Math.random() * this.camera.spawnPoints.length);
        const spawnPoint = this.camera.spawnPoints[spawnIndex];
        this.camera.getCamera().position.set(spawnPoint.x, spawnPoint.y, spawnPoint.z);

        if (this.input) {
            this.input.velocity.set(0, 0, 0);
            this.input.onGround = true;
        }

        this.camera.getCamera().rotation.set(0, 0, 0);
        this.input.yaw = 0;
        this.input.pitch = 0;

        this.camera.getCamera().updateMatrixWorld();

        console.log('🎯 Player spawned at:', spawnPoint);
        console.log('📍 Total spawn points available:', this.camera.spawnPoints.length);
        console.log('🎲 Selected spawn index:', spawnIndex);
    }

    handleMove(position, rotation) {

        if (this.gameMode === 'team' && this.isInBuildPhase) {
            return;
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

        if (this.isBuildMode) {
            return;
        }

        if (this.gameMode === 'team' && this.isInBuildPhase) {
            return;
        }

        if (this.bombSystem && this.bombSystem.isEquipped) {
            return;
        }

        if (this.network && this.gameStarted && this.isAlive) {

            if (!this.weaponSystem || !this.weaponSystem.canShoot()) {

                if (this.weaponSystem && this.weaponSystem.currentAmmo === 0) {
                    this.ammoDisplay.showLowAmmoWarning();
                }
                return;
            }

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
                    this.showHitmarker(hitPlayer.killed);
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

                if (this.weaponSystem) {
                    this.weaponSystem.hide();
                }
            } else {

                if (this.weaponSystem) {
                    this.weaponSystem.show();
                }
            }
        }
    }

    handleBombDrop() {

        if (this.bombSystem && this.bombSystem.hasBomb && this.bombSystem.isEquipped && this.gameStarted && this.isAlive) {

            this.network.sendDropBomb();
            console.log('Dropping bomb...');
        } else if (this.bombSystem && this.bombSystem.hasBomb && !this.bombSystem.isEquipped) {
            console.log('Equip bomb with T first before dropping');
        }
    }

    handleBombPickup() {
        console.log(`Pickup attempt: canPickup=${this.bombSystem?.canPickupBomb}, gameStarted=${this.gameStarted}, isAlive=${this.isAlive}`);
        if (this.bombSystem && this.bombSystem.canPickupBomb && this.gameStarted && this.isAlive) {

            this.network.sendPickupBomb();
            console.log('Attempting to pick up bomb...');
        } else {
            console.log('Cannot pickup bomb - conditions not met');
        }
    }

    handleBombPlantStart() {
        if (this.bombSystem && this.gameStarted && this.isAlive) {
            if (this.bombSystem.isEquipped && !this.bombSystem.isPlanting) {

                this.bombSystem.startPlanting((progress) => {
                    if (progress >= 1.0) {

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

        if (this.gameMode === 'team' &&
            this.attackingTeam &&
            this.playerTeam &&
            this.playerTeam === this.attackingTeam) {
            return;
        }

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

        if (this.playerManager) {
            this.playerManager.playerShoot(shooterId);
        }
    }

    checkHit(target) {
        const playerPosition = this.camera.getPosition();
        const shootDirection = this._shootDirVec.subVectors(target, playerPosition).normalize();

        const raycaster = this._raycaster;
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
                    const directionToPlayer = this._dirToPlayerVec.subVectors(playerPos, playerPosition).normalize();
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

            if (this.isShotBlockedByWall(playerPosition, shootDirection, closestHit.distance)) {
                this.checkWallHit(playerPosition, shootDirection);
                return null;
            }

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

    isShotBlockedByWall(from, dir, playerDistance) {
        const raycaster = this._raycaster;
        raycaster.set(from, dir);
        raycaster.far = playerDistance;

        const walls = [];
        this.scene.getScene().traverse((child) => {
            if (child.isMesh && (child.userData.isMapWall || child.userData.isDestructible)) {
                walls.push(child);
            }
        });

        const hits = raycaster.intersectObjects(walls);
        for (const hit of hits) {
            if (hit.distance >= playerDistance) break;
            const wall = hit.object;

            if (wall.userData.isDestructible && this.checkBulletThroughHole(wall, hit.point)) {
                continue;
            }
            return true;
        }
        return false;
    }

    checkWallHit(shooterPos, shootDirection) {
        const raycaster = this._raycaster;
        raycaster.set(shooterPos, shootDirection);
        raycaster.far = 1000;

        const allObjects = [];
        this.scene.getScene().traverse((child) => {
            if (child.isMesh && child.userData.isDestructible) {
                allObjects.push(child);
            }
        });

        const intersects = raycaster.intersectObjects(allObjects);

        if (intersects.length > 0) {
            const hit = intersects[0];
            const wall = hit.object;

            const bulletPassesThrough = this.checkBulletThroughHole(wall, hit.point);

            if (!bulletPassesThrough) {

                this.createBulletHole(wall, hit.point, hit.face.normal);
            } else {
                console.log('Bullet passed through existing hole!');

                this.createBulletPassThroughEffect(hit.point);

                this.checkBulletBeyondWall(shooterPos, shootDirection, hit.distance);
            }
        }
    }

    createBulletHole(wall, hitPoint, normal) {

        if (!wall.userData.bulletHoles) {
            wall.userData.bulletHoles = [];
        }

        if (wall.userData.bulletHoles.length >= 2) {
            console.log('🎯 Wall has 2 holes - creating decal instead');
            this.addBulletDecalToWall(wall, hitPoint, normal);
            return;
        }

        const holeRadius = 1.2;
        console.log('🔫 Creating hole in wall');

        const localHitPoint = wall.worldToLocal(hitPoint.clone());

        wall.userData.bulletHoles.push({
            position: localHitPoint.clone(),
            normal: normal.clone(),
            radius: holeRadius
        });

        this.recreateWallWithHoles(wall);

        console.log(`🕳️ Hole ${wall.userData.bulletHoles.length} of 2 created`);

        if (this.network) {
            this.network.sendWallHit(
                wall.position.x, wall.position.z,
                localHitPoint.x, hitPoint.y, holeRadius
            );
        }
    }

    applyServerWallHole(message) {
        const { wall_x, wall_z, local_x, world_y, radius } = message;

        let wall = null, best = 4.0;
        for (const w of (this.buildWalls || [])) {
            if (!w.userData || !w.userData.isDestructible) continue;
            const d2 = (w.position.x - wall_x) ** 2 + (w.position.z - wall_z) ** 2;
            if (d2 <= best) { best = d2; wall = w; }
        }
        if (!wall) return;
        if (!wall.userData.bulletHoles) wall.userData.bulletHoles = [];
        if (wall.userData.bulletHoles.length >= 2) return;

        const localY = world_y - wall.position.y;

        const dup = wall.userData.bulletHoles.some((h) =>
            Math.abs(h.position.x - local_x) < 0.5 && Math.abs(h.position.y - localY) < 0.5);
        if (dup) return;

        wall.userData.bulletHoles.push({
            position: new THREE.Vector3(local_x, localY, 0),
            normal: new THREE.Vector3(0, 0, 1),
            radius: radius || 1.2,
        });
        this.recreateWallWithHoles(wall);
        console.log('🕳️ Applied server wall hole at', local_x, localY);
    }

    addBulletDecalToWall(wall, hitPoint, normal) {

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

        const n = normal.clone().normalize();
        decal.position.copy(hitPoint).add(n.clone().multiplyScalar(0.05));
        decal.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);

        decal.renderOrder = 1000;

        this.scene.getScene().add(decal);

        if (!wall.userData.decals) {
            wall.userData.decals = [];
        }
        wall.userData.decals.push(decal);

        setTimeout(() => {

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
        }, 4000);

        console.log('🟠 Added normal bullet impact to wall');
    }

    recreateWallWithHoles(wall) {
        if (!wall.userData.bulletHoles || wall.userData.bulletHoles.length === 0) {
            return;
        }

        const originalMaterial = wall.material;
        const originalPosition = wall.position.clone();
        const originalRotation = wall.rotation.clone();

        if (!wall.userData.originalDimensions) {

            wall.userData.originalDimensions = {
                width: 20,
                height: 20,
                depth: 2
            };
        }

        const dims = wall.userData.originalDimensions;

        const shape = new THREE.Shape();
        shape.moveTo(-dims.width/2, -dims.height/2);
        shape.lineTo(dims.width/2, -dims.height/2);
        shape.lineTo(dims.width/2, dims.height/2);
        shape.lineTo(-dims.width/2, dims.height/2);
        shape.closePath();

        for (const holeData of wall.userData.bulletHoles) {
            const hole = new THREE.Path();
            hole.arc(holeData.position.x, holeData.position.y, holeData.radius, 0, Math.PI * 2, true);
            shape.holes.push(hole);
        }

        const extrudeSettings = {
            depth: dims.depth,
            bevelEnabled: false
        };

        const newGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

        newGeometry.translate(0, 0, -dims.depth/2);

        wall.geometry.dispose();
        wall.geometry = newGeometry;

        wall.material = originalMaterial;
        wall.position.copy(originalPosition);
        wall.rotation.copy(originalRotation);

        console.log(`✅ Wall updated with ${wall.userData.bulletHoles.length} hole(s)`);
    }

    updateWallCollisionBounds(wall) {

        if (this.collisionSystem && wall.userData.isDestructibleWall) {

            console.log('🔧 Wall collision bounds updated (keeping full bounds for now)');
        }
    }

    createBulletPassThroughEffect(hitPoint) {

        const flashGeometry = new THREE.SphereGeometry(0.3, 8, 8);
        const flashMaterial = new THREE.MeshBasicMaterial({
            color: 0xef4e23,
            transparent: true,
            opacity: 0.8
        });

        const flash = new THREE.Mesh(flashGeometry, flashMaterial);
        flash.position.copy(hitPoint);
        this.scene.getScene().add(flash);

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

        setTimeout(fadeOut, 100);

        console.log('🔥 Bullet passed through hole - showing flash effect!');
    }

    createBulletTrail(startPos, direction) {

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

        setTimeout(() => {
            this.scene.getScene().remove(line);
            trail.dispose();
            trailMaterial.dispose();
        }, 200);

        console.log('🔴 Created red bullet trail through wall hole');
    }

    checkBulletThroughHole(wall, hitPoint) {

        const localHitPoint = wall.worldToLocal(hitPoint.clone());

        if (!wall.userData.bulletHoles || !Array.isArray(wall.userData.bulletHoles)) {
            return false;
        }

        for (const hole of wall.userData.bulletHoles) {
            const distance = localHitPoint.distanceTo(hole.position);

            if (distance <= hole.radius) {
                return true;
            }
        }

        return false;
    }

    checkBulletBeyondWall(shooterPos, shootDirection, wallDistance) {

        const beyondWallPos = shooterPos.clone().add(
            shootDirection.clone().multiplyScalar(wallDistance + 0.2)
        );

        console.log('🎯 Checking for targets beyond destructible wall hole...');

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

        // Grey out the victim on the scoreboard immediately.
        if (this.scoreboard && message.player_id) {
            this.scoreboard.setAlive(message.player_id, false);
        }

        const killerName = message.killer_name || this.getPlayerName(message.killer_id) || 'Unknown';
        const victimName = message.victim_name || this.getPlayerName(message.player_id) || 'Unknown';

        const killerTeam = message.killer_team || (this.playerManager?.players?.[message.killer_id]?.team) || null;
        const victimTeam = message.victim_team || (this.playerManager?.players?.[message.player_id]?.team) || null;

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
            this._track('died');
            const healthContainer = document.getElementById('healthContainer');
            if (healthContainer) healthContainer.style.display = 'none';
            if (this.ammoDisplay) this.ammoDisplay.hide();

            if (this.killCam) {
                this.killCam.onLocalPlayerDied(message.killer_id);
                this._track('killcam-shown');
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

        if (this._postRoundCleanupTimer) {
            clearTimeout(this._postRoundCleanupTimer);
            this._postRoundCleanupTimer = null;
        }

        // Un-grey this player on the scoreboard immediately (covers both the
        // local player and others), independent of scoreboard-push timing.
        if (this.scoreboard && message.player && message.player.id) {
            this.scoreboard.setAlive(message.player.id, true);
        }

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

            this.finishRoundCleanup();

            if (this.weaponSystem) {
                this.weaponSystem.show();
                this.weaponSystem.resetWeapon();
            }

            if (typeof message.player.z === 'number' && message.player.z !== 0) {
                this.myHalfSign = message.player.z < 0 ? -1 : 1;
            }

            this.camera.getCamera().position.set(message.player.x, message.player.y + 5, message.player.z);

            if (this.input) {
                this.input.velocity.set(0, 0, 0);
                this.input.onGround = true;
            }
            this.camera.getCamera().rotation.set(0, 0, 0);

            this.input.yaw = Math.atan2(message.player.x, message.player.z);
            this.input.pitch = 0;

            const spawnYawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.input.yaw);
            this.camera.getCamera().quaternion.copy(spawnYawQ);
            this.camera.getCamera().updateMatrixWorld();

            console.log(`You respawned at position (${message.player.x}, ${message.player.y}, ${message.player.z}), facing map (yaw ${this.input.yaw.toFixed(2)})`);
            this.hideDeathMessage();

            if (!this._introHasPlayed) {
                this._introHasPlayed = true;
                const cam = this.camera.getCamera();
                this._startIntroWhenLoaded(cam.position.clone(), this.input.yaw);
            }

            const healthContainer = document.getElementById('healthContainer');
            if (healthContainer) {
                healthContainer.style.display = 'block';
            }

            if (this.ammoDisplay) {
                this.ammoDisplay.show();
            }

            this.updateHealthDisplay();
            this.updateAmmoDisplay();
        } else {

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

            if (this.gameMode === 'team') {
                deathMsg.innerHTML = `
                    <div style="color: #ef4e23; margin-bottom: 20px;">You were eliminated</div>
                    <div style="color: rgba(239, 78, 35, 0.5); font-size: 16px;">Waiting for round to end...</div>
                `;
            } else {

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

    handleRoundEndMessage(message) {
        this._track('round-won', { winner: message.winner, reason: message.reason });

        const winnerName = message.winner === 'orange' ? 'Orange'
            : message.winner === 'red' ? 'Navy'
            : (message.winner || 'Team');

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
        case 'Time Up':
            title = `${winnerName} defenders win`;
            subtitle = 'Time ran out';
            break;
        default:
            break;
        }
        this.showRoundEndMessage(title, subtitle, accent);

        const replayActive =
            (this.replayRecorder && this.replayRecorder.isPlaying) ||
            (this.killCam && this.killCam.isActive && this.killCam.isActive());

        if (replayActive) {

            this._pendingRoundCleanup = true;
            return;
        }

        if (this._postRoundCleanupTimer) {
            clearTimeout(this._postRoundCleanupTimer);
        }
        this._postRoundCleanupTimer = setTimeout(() => {
            this._postRoundCleanupTimer = null;
            if (this.playerManager) {
                this.playerManager.clearAllPlayers();
            }
        }, 6000);
    }

    _track(eventName, data) {
        try { window.umami && window.umami.track(eventName, data); } catch (e) {}
    }

    _sampleLowFps(realDelta) {
        if (this._lowFpsTracked || !this.gameStarted) return;
        const LOW_FPS_THRESHOLD = 25;
        const LOW_FPS_WINDOW_MS = 3000;
        const ms = Math.max(0.0001, realDelta) * 1000;
        if (!this._lowFpsSamples) this._lowFpsSamples = [];
        this._lowFpsSamples.push(ms);
        if (this._lowFpsSamples.length > 90) this._lowFpsSamples.shift();
        const avgMs = this._lowFpsSamples.reduce((a, b) => a + b, 0) / this._lowFpsSamples.length;
        const fps = 1000 / avgMs;
        const now = performance.now();
        if (fps < LOW_FPS_THRESHOLD) {
            if (!this._lowFpsSince) this._lowFpsSince = now;
            else if (now - this._lowFpsSince >= LOW_FPS_WINDOW_MS) {
                this._lowFpsTracked = true;
                this._track('low-fps', { fps: Math.round(fps) });
            }
        } else {
            this._lowFpsSince = null;
        }
    }

    handleMatchEnd(message) {
        if (this._matchEndShown) return;
        this._matchEndShown = true;
        this._track('match-finished', { winner: message.winner });

        this.stopRoundTimer();
        if (this.input) this.input.isPointerLocked = false;
        if (document.exitPointerLock) document.exitPointerLock();

        const isNavy = message.winner === 'red' || message.winner === 'navy';
        const color = isNavy ? '#5b7bb4' : '#ef4e23';
        const teamName = isNavy ? 'NAVY' : 'ORANGE';
        const score = `${this.orangeScore} : ${this.redScore}`;

        if (!document.getElementById('matchEndStyles')) {
            const st = document.createElement('style');
            st.id = 'matchEndStyles';
            st.textContent = `
                @keyframes meSweep { from { transform: scaleY(0); } to { transform: scaleY(1); } }
                @keyframes meRise  { 0% { opacity: 0; transform: translateY(40px) scale(0.92); }
                                     100% { opacity: 1; transform: translateY(0) scale(1); } }
                @keyframes mePulse { 0%,100% { text-shadow: 0 0 30px currentColor; }
                                     50% { text-shadow: 0 0 70px currentColor; } }
                @keyframes meBarGrow { from { width: 0; } to { width: var(--meW); } }
                @keyframes meFadeIn { from { opacity: 0; } to { opacity: 1; } }
            `;
            document.head.appendChild(st);
        }

        const overlay = document.createElement('div');
        overlay.id = 'matchEndOverlay';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 100000;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            color: #fff; overflow: hidden;
        `;

        overlay.innerHTML = `
            <div style="position:absolute; inset:0; background:rgba(13,19,38,0.96); animation: meFadeIn 0.4s ease both;"></div>
            <div style="position:absolute; inset:0; transform-origin: bottom;
                        background: radial-gradient(circle at 50% 60%, ${color}22 0%, rgba(13,19,38,0) 60%);
                        animation: meSweep 0.8s cubic-bezier(.2,.8,.2,1) both;"></div>

            <div style="position:relative; text-align:center; animation: meRise 0.9s 0.25s cubic-bezier(.2,.8,.2,1) both;">
                <div style="font-size: 13px; letter-spacing: 8px; text-transform: uppercase; opacity: 0.5; margin-bottom: 18px;">
                    Match Over
                </div>
                <div style="font-size: clamp(48px, 11vw, 150px); font-weight: 900; letter-spacing: 6px; color: ${color}; line-height: 1; animation: mePulse 2.2s ease-in-out infinite;">
                    ${teamName}
                </div>
                <div style="font-size: clamp(20px, 3vw, 36px); font-weight: 300; letter-spacing: 10px; text-transform: uppercase; opacity: 0.85; margin-top: 10px;">
                    Wins
                </div>
                <div style="margin-top: 34px; font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: 4px; color: rgba(255,255,255,0.9);">
                    ${score}
                </div>
                <div style="display:flex; justify-content:center; gap:18px; margin-top:8px; font-size:11px; letter-spacing:2px; text-transform:uppercase; opacity:0.45;">
                    <span style="color:#ef4e23;">Orange</span><span>·</span><span style="color:#5b7bb4;">Navy</span>
                </div>
                <div id="matchEndReturn" style="margin-top: 46px; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; opacity: 0; animation: meFadeIn 0.6s 2.4s ease forwards;">
                    Returning to lobby…
                </div>
            </div>

            <!-- thin animated accent bars top & bottom -->
            <div style="position:absolute; top:0; left:0; height:4px; background:${color}; --meW:100%; width:0; animation: meBarGrow 1.2s 0.3s ease both;"></div>
            <div style="position:absolute; bottom:0; right:0; height:4px; background:${color}; --meW:100%; width:0; animation: meBarGrow 1.2s 0.3s ease both;"></div>
        `;
        document.body.appendChild(overlay);

        setTimeout(() => {
            try { if (this.network && this.network.ws) this.network.ws.close(); } catch (e) {}

            window.location.href = window.location.origin + '/';
        }, 6500);
    }

    cleanupForRoundTransition() {

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
        moneyDisplay.style.display = 'none';
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
                top: 234px;
                right: 24px;
                color: rgba(239, 78, 35, 0.9);
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                z-index: 100;
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 7px;
                text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
            `;
            document.body.appendChild(killCounter);
        }

        killCounter.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                 stroke="#ef4e23" stroke-width="2" stroke-linecap="round" style="flex-shrink:0;">
                <circle cx="12" cy="12" r="7"/>
                <line x1="12" y1="1" x2="12" y2="5"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="1" y1="12" x2="5" y2="12"/>
                <line x1="19" y1="12" x2="23" y2="12"/>
                <circle cx="12" cy="12" r="1.6" fill="#ef4e23" stroke="none"/>
            </svg>
            <span style="font-size: 22px; font-weight: 700; color: #ef4e23; line-height: 1; font-variant-numeric: tabular-nums;">${this.kills}</span>
            <span style="font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.5;">Kills</span>
        `;
    }

    _teamMark(team, fontSize = 13) {
        const isNavy = team === 'red' || team === 'navy';
        const color = isNavy ? '#9fb0d8' : '#ef4e23';
        const label = isNavy ? 'NAVY' : 'ORANGE';
        return `<span style="font-weight: 800; letter-spacing: 2px; color: ${color}; font-size: ${fontSize}px;">${label}</span>`;
    }

    _teamLogo(team) {
        const isNavy = team === 'red' || team === 'navy';
        const color = isNavy ? '#9fb0d8' : '#ef4e23';
        return `
            <div style="display:flex; align-items:center; gap:6px;">
                <span style="width:9px; height:9px; border-radius:2px; background:${color}; display:inline-block;"></span>
                ${this._teamMark(team, 12)}
            </div>`;
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

        const ORANGE = '#ef4e23', NAVY = '#1a2447', RED = '#ff4444';

        const bombTicking = this.bombSystem && this.bombSystem.bombPlanted &&
            typeof this.bombSystem.bombTimer === 'number' && this.bombSystem.bombTimer > 0;

        let timeLabel, timeValue, timeColor, timePulse = false;
        if (bombTicking) {
            timeLabel = '⚠ Bomb Planted';
            timeValue = `0:${String(Math.max(0, this.bombSystem.bombTimer)).padStart(2, '0')}`;
            timeColor = RED;
            timePulse = true;
        } else if (this.isInBuildPhase && this.buildPhaseTimer) {
            timeLabel = 'Build Phase';
            timeValue = this.formatClock(this.buildPhaseTimer);
            timeColor = ORANGE;
        } else if (typeof this.roundTimer === 'number') {
            const low = this.roundTimer <= 15;
            timeLabel = 'Round Time';
            timeValue = this.formatClock(this.roundTimer);
            timeColor = low ? RED : ORANGE;
            timePulse = low;
        } else {

            timeLabel = 'Round Time';
            timeValue = '—';
            timeColor = ORANGE;
        }

        const content = `
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.55; margin-bottom: 12px;">
                Round ${this.roundNumber}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 14px;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; flex: 1;">
                    ${this._teamLogo('orange')}
                    <span style="font-size: 26px; font-weight: 700; color: ${ORANGE}; line-height: 1; font-variant-numeric: tabular-nums;">${this.orangeScore}</span>
                </div>
                <div style="font-size: 12px; opacity: 0.35; font-weight: 600;">VS</div>
                <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; flex: 1;">
                    ${this._teamLogo('red')}
                    <span style="font-size: 26px; font-weight: 700; color: #9fb0d8; line-height: 1; font-variant-numeric: tabular-nums;">${this.redScore}</span>
                </div>
            </div>
            <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px; text-align: center;">
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 4px; color: ${timeColor}; opacity: 0.85;${timePulse ? ' animation: rsgoBombPulse 1s infinite;' : ''}">
                    ${timeLabel}
                </div>
                <div style="font-size: 34px; font-weight: 700; color: ${timeColor}; line-height: 1; font-variant-numeric: tabular-nums;${timePulse ? ' animation: rsgoBombPulse 1s infinite;' : ''}">
                    ${timeValue}
                </div>
                ${bombTicking ? '<div style="font-size: 10px; color: rgba(255,68,68,0.6); margin-top: 5px;">Defuse to win — hold E</div>' : ''}
            </div>
        `;

        if (!document.getElementById('rsgoBombPulseStyle')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'rsgoBombPulseStyle';
            styleEl.textContent = '@keyframes rsgoBombPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }';
            document.head.appendChild(styleEl);
        }

        roundContainer.innerHTML = content;

        if (typeof this.refreshBuildBanner === 'function') {
            this.refreshBuildBanner();
        }

        this.updateBuildPrompt();
    }

    updateBuildPrompt() {

        const introPendingOrPlaying = this._introPlaying || (!this._introDone && this.gameStarted);

        const kcActive = !!(this.killCam && this.killCam.isActive && this.killCam.isActive());
        const promptDelayed = kcActive || (this._buildPromptDelayUntil && performance.now() < this._buildPromptDelayUntil);
        const shouldShow = this.gameMode === 'team' && this.isInBuildPhase &&
            !this.isBuildMode && !introPendingOrPlaying && !promptDelayed;
        let el = document.getElementById('buildPrompt');

        if (!shouldShow) {
            if (el) el.style.display = 'none';
            return;
        }

        if (!el) {
            el = document.createElement('div');
            el.id = 'buildPrompt';
            el.style.cssText = `
                position: fixed; top: 16%; left: 50%; transform: translateX(-50%);
                z-index: 1500; pointer-events: none; text-align: center;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            `;
            el.innerHTML = `
                <div style="
                    display: inline-flex; flex-direction: column; align-items: center; gap: 10px;
                    background: rgba(19,26,54,0.92); border: 1px solid rgba(239,78,35,0.35);
                    border-radius: 14px; padding: 18px 26px; backdrop-filter: blur(10px);
                    box-shadow: 0 8px 30px rgba(0,0,0,0.4);">
                    <div style="font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: #9fb0d8;">
                        Build Phase
                    </div>
                    <div style="display:flex; align-items:center; gap:14px;">
                        <kbd style="
                            display:inline-flex; align-items:center; justify-content:center;
                            min-width: 46px; height: 46px; padding: 0 12px;
                            background: #ef4e23; color: #131a36; border-radius: 10px;
                            font-size: 24px; font-weight: 800; line-height: 1;
                            box-shadow: 0 3px 0 rgba(0,0,0,0.35); animation: rsgoKeyPulse 1.4s ease-in-out infinite;">B</kbd>
                        <div style="text-align:left;">
                            <div style="font-size: 19px; font-weight: 700; color: #e8edff; line-height:1.2;">Press B to build</div>
                            <div style="font-size: 13px; color: #9fb0d8; margin-top:2px;">Place walls before the round starts</div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(el);

            if (!document.getElementById('rsgoKeyPulseStyle')) {
                const st = document.createElement('style');
                st.id = 'rsgoKeyPulseStyle';
                st.textContent = '@keyframes rsgoKeyPulse { 0%,100% { transform: scale(1); box-shadow:0 3px 0 rgba(0,0,0,0.35),0 0 0 0 rgba(239,78,35,0.5); } 50% { transform: scale(1.08); box-shadow:0 3px 0 rgba(0,0,0,0.35),0 0 0 10px rgba(239,78,35,0); } }';
                document.head.appendChild(st);
            }
        }
        el.style.display = 'block';
    }

    startBuildPhaseTimer(seconds) {

        this.stopRoundTimer();
        this.isInBuildPhase = true;
        this.buildPhaseTimer = seconds;
        this._track('build-phase-started');

        if (this._introHasPlayed && !this._introPlaying) this._introDone = true;
        this.updateRoundDisplay();

        const interval = setInterval(() => {
            this.buildPhaseTimer--;
            this.updateRoundDisplay();

            if (this.buildPhaseTimer <= 0) {
                clearInterval(interval);
                this.isInBuildPhase = false;
                this.buildPhaseTimer = null;

                if (typeof this.roundTimer !== 'number') {
                    this.startRoundTimer(100);
                }
                this.updateRoundDisplay();
            }
        }, 1000);
    }

    startRoundTimer(seconds) {
        this.stopRoundTimer();
        this.roundTimer = seconds;
        this.updateRoundDisplay();
        this.roundTimerInterval = setInterval(() => {

            if (this.bombSystem && this.bombSystem.bombPlanted) return;
            this.roundTimer--;
            this.updateRoundDisplay();
            if (this.roundTimer <= 0) {
                this.stopRoundTimer();
            }
        }, 1000);
    }

    stopRoundTimer() {
        if (this.roundTimerInterval) {
            clearInterval(this.roundTimerInterval);
            this.roundTimerInterval = null;
        }
        this.roundTimer = null;
        this.updateRoundDisplay();
    }

    formatClock(totalSeconds) {
        const s = Math.max(0, Math.floor(totalSeconds));
        const m = Math.floor(s / 60);
        const ss = String(s % 60).padStart(2, '0');
        return `${m}:${ss}`;
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

        if (healthBar) {
            healthBar.style.width = `${this.health}%`;
        }

        if (shieldBar) {
            shieldBar.style.width = `${(this.shield / this.maxShield) * 100}%`;
        }

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

            const nowMs = performance.now();
            const realDelta = this._lastFrameMs ? Math.min(0.1, (nowMs - this._lastFrameMs) / 1000) : 0.016;
            this._lastFrameMs = nowMs;

            const deltaTime = realDelta;

            if (this.replayRecorder && !this.replayRecorder.isPlaying) {
                this.replayRecorder.captureFrame();
            }

            const kcActive = !!(this.killCam && this.killCam.isActive && this.killCam.isActive());
            if (kcActive !== this._kcHudHidden) {
                this._kcHudHidden = kcActive;

                this._setHudVisibleForIntro(!kcActive, true);

                if (this.weaponSystem && this.weaponSystem.setTeam) {
                    if (kcActive) {
                        const killerId = this.killCam.replayTargetId;
                        const killerTeam = (this.playerTeams && this.playerTeams[killerId]) || this.playerTeam;
                        this.weaponSystem.setTeam(killerTeam);
                    } else {
                        this.weaponSystem.setTeam(this.playerTeam);
                    }
                }
            }

            if (kcActive) {
                this._setHudVisibleForIntro(false, true);
                this._buildPromptDelayUntil = performance.now() + 1200;
            }

            if (this._introPlaying) {

                this.updateIntroCinematic();
            } else if (this.killCam && this.killCam.isActive()) {
                this.killCam.update();
            } else if (this.isAlive && !this.deathCamActive) {
                if (this.isBuildMode) {
                    this.updateBuildModeMovement(deltaTime);
                } else {
                    this.input.updateMovement(deltaTime, this.camera);
                    this.updateCameraRecoil(deltaTime);
                }

            }

            this.bulletSystem.update(deltaTime);

            if (this.playerManager) {
                this.playerManager.update(realDelta);
            }

            if (this.weaponSystem) {
                this.weaponSystem.update(deltaTime);

                if (!this._introPlaying) this.updateAmmoDisplay();
            }

            if (this.bombSystem) {
                this.bombSystem.update(deltaTime);
            }

            // Minimap + compass are visual-only. Their canvas redraw / WebGL
            // scissor render / DOM writes are CPU-heavy, so throttle them:
            // minimap ~15fps (every 4th frame), compass ~30fps (every 2nd).
            // No gameplay impact; big CPU saving under throttle.
            this._hudTick = (this._hudTick || 0) + 1;
            const doMinimap = this.miniMap && !this.isBuildMode && !this._introPlaying && (this._hudTick % 4 === 0);
            if (this.miniMap && !this.isBuildMode && !this._introPlaying) {
                const cameraRotation = this.input.yaw;
                if (doMinimap) this.miniMap.update(this.camera.getPosition(), cameraRotation);
                if (this._hudTick % 2 === 0) this.compass.update(cameraRotation);
            }

            this.renderer.getRenderer().autoClear = true;

            this.renderer.render(this.scene.getScene(), this.camera.getCamera());

            if (doMinimap) {
                this.miniMap.render();
            }

            this.updatePerfOverlay(realDelta);

            this._sampleLowFps(realDelta);
        }
    }

    updatePerfOverlay(realDelta) {
        if (!this._perfVisible) return;

        if (!this._perfSamples) this._perfSamples = [];
        const ms = Math.max(0.0001, realDelta) * 1000;
        this._perfSamples.push(ms);
        if (this._perfSamples.length > 30) this._perfSamples.shift();
        const avgMs = this._perfSamples.reduce((a, b) => a + b, 0) / this._perfSamples.length;
        const fps = Math.round(1000 / avgMs);

        const now = performance.now();
        if (this._perfLastWrite && now - this._perfLastWrite < 200) return;
        this._perfLastWrite = now;

        let el = document.getElementById('perfOverlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'perfOverlay';
            el.style.cssText = `
                position: fixed; top: 20px; right: 20px; z-index: 100001;
                background: rgba(13,19,38,0.88); border: 1px solid rgba(255,255,255,0.12);
                border-radius: 10px; padding: 12px 14px; min-width: 150px;
                font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px;
                color: #cdd6f4; backdrop-filter: blur(8px); line-height: 1.7; pointer-events: none;`;
            document.body.appendChild(el);
        }

        const info = this.renderer && this.renderer.getRenderer
            ? this.renderer.getRenderer().info : null;
        const calls = info ? info.render.calls : '?';
        const tris = info ? info.render.triangles : 0;
        const geos = info ? info.memory.geometries : '?';
        const texs = info ? info.memory.textures : '?';
        const players = this.playerManager && this.playerManager.otherPlayers
            ? this.playerManager.otherPlayers.size : 0;

        const worstMs = Math.max(...this._perfSamples);
        const lowFps = Math.round(1000 / worstMs);

        const fpsColor = fps >= 55 ? '#a6e3a1' : fps >= 30 ? '#f9e2af' : '#f38ba8';
        const trisStr = tris > 1000 ? `${(tris / 1000).toFixed(1)}k` : String(tris);

        el.innerHTML = `
            <div style="font-size:10px; letter-spacing:1.5px; opacity:0.5; text-transform:uppercase; margin-bottom:6px;">Performance · F8</div>
            <div style="color:${fpsColor}; font-weight:700; font-size:20px;">${fps} <span style="font-size:11px;opacity:0.6;">fps</span></div>
            <div style="opacity:0.85; margin-top:2px;">low: ${lowFps} fps · ${avgMs.toFixed(1)} ms</div>
            <div style="opacity:0.7; margin-top:6px;">draws: ${calls} · tris: ${trisStr}</div>
            <div style="opacity:0.5; margin-top:4px; font-size:11px;">players: ${players}</div>
        `;
    }

    togglePerfOverlay() {
        this._perfVisible = !this._perfVisible;
        if (!this._perfVisible) {
            const el = document.getElementById('perfOverlay');
            if (el) el.remove();
            this._perfSamples = [];
        }
        console.log('Perf overlay:', this._perfVisible ? 'ON' : 'OFF');
    }

    handleScoreboard(show) {
        if (show) {
            this.scoreboard.show();
        } else {
            this.scoreboard.hide();
        }
    }

    handleScoreboardUpdate(data) {
        const playersData = data.players.map(player => ({
            id: player.id,
            name: player.name,
            kills: player.kills,
            deaths: player.deaths ?? 0,
            team: player.team || this.playerTeams?.[player.id] || null,
            money: (player.money === null || player.money === undefined) ? null : player.money,
            alive: player.alive !== false,
            hasBomb: !!player.has_bomb,
            isCurrentPlayer: player.id === this.network.playerId
        }));

        this.scoreboard.updatePlayers(playersData, {
            gameMode: this.gameMode,
            localTeam: this.playerTeam || null,
            orangeScore: this.orangeScore,
            redScore: this.redScore,
            roundNumber: this.roundNumber,
        });
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

    showHitmarker(killed = false) {
        const cx = document.getElementById('crosshair');
        if (!cx) return;

        const glow = killed ? '#ff3b3b' : '#ef4e23';
        const peak = killed ? 1.9 : 1.5;
        const spin = killed ? 360 : 180;

        const base = 'translate(-50%, -50%)';

        cx.style.transition = 'none';
        cx.style.transform = `${base} scale(${peak}) rotate(${spin}deg)`;
        cx.style.filter = `drop-shadow(0 0 5px ${glow}) drop-shadow(0 0 10px ${glow}) brightness(1.7)`;

        requestAnimationFrame(() => {
            cx.style.transition = 'transform 0.26s cubic-bezier(.2,.9,.25,1), filter 0.26s ease';
            cx.style.transform = base;
            cx.style.filter = 'none';
        });

        if (this._hitmarkerTimeout) clearTimeout(this._hitmarkerTimeout);
        this._hitmarkerTimeout = setTimeout(() => {
            cx.style.transition = 'none';
            cx.style.transform = base;
            cx.style.filter = 'none';
        }, 320);

        if (killed) this._killBurst();
    }

    _killBurst() {
        if (!document.getElementById('killBurstStyle')) {
            const st = document.createElement('style');
            st.id = 'killBurstStyle';
            st.textContent = `@keyframes rsgoKillBurst {
                0%   { transform: translate(-50%,-50%) scale(0.3); opacity: 0.9; }
                100% { transform: translate(-50%,-50%) scale(2.6); opacity: 0; }
            }`;
            document.head.appendChild(st);
        }
        const ring = document.createElement('div');
        ring.style.cssText = `
            position: fixed; top: 50%; left: 50%;
            width: 54px; height: 54px; border-radius: 50%;
            border: 3px solid #ff3b3b; box-shadow: 0 0 14px rgba(255,59,59,0.7);
            pointer-events: none; z-index: 201;
            animation: rsgoKillBurst 0.42s cubic-bezier(.2,.7,.3,1) forwards;
        `;
        document.body.appendChild(ring);
        setTimeout(() => ring.remove(), 480);
    }

    checkForDirectMapAccess() {

        const urlParams = new URLSearchParams(window.location.search);
        const mapBuilder = urlParams.get('mapbuilder');
        const hash = window.location.hash;

        if (mapBuilder === 'orange' || hash === '#mapbuilder' || window.location.pathname.includes('mapbuilder')) {
            console.log('🗺️ Direct map builder access detected - loading orange planet map');
            this.loadDirectMapBuilder();
        }
    }

    loadDirectMapBuilder() {

        document.getElementById('nameScreen').style.display = 'none';
        document.getElementById('mapSelection').style.display = 'none';
        document.getElementById('teamSelectionScreen').style.display = 'none';
        document.getElementById('gameContainer').style.display = 'block';

        this.gameMode = 'team';
        this.mapType = 'orangePlanet';
        this.playerName = 'MapBuilder';

        console.log('🚀 Starting direct map builder mode');
        this.startGame();

        setTimeout(() => {
            console.log('Setting map builder spawn position to (0, 10, 0) - center of map');
            if (this.camera && this.camera.getCamera()) {
                this.camera.getCamera().position.set(0, 10, 0);
            }
            if (this.input) {
                this.input.position.set(0, 10, 0);
            }
        }, 500);

        console.log('🎮 Map Builder Mode Active!');
        console.log('📍 Use WASD to move around the orange planet map');
        console.log('🖱️ Click to enable movement controls');
        console.log('🔨 Press B to enter build mode with sky camera');
        console.log('🔧 You can now build step by step with the developer');
    }

    toggleBuildMode() {
        if (!this.gameStarted || !this.isAlive) return;

        if (this.isBuildMode) {
            this.isBuildMode = false;
            this.exitBuildMode();
            this.updateBuildPrompt();
            return;
        }

        if (this.gameMode === 'team' && !this.isInBuildPhase) {
            console.log('⚠️ Build mode only available during build phase');
            return;
        }

        this.isBuildMode = true;
        this.enterBuildMode();
        this.updateBuildPrompt();
    }

    enterBuildMode() {
        console.log('🔨 Entering build mode - switching to bird view camera');

        this.isBuildMode = true;

        this.buildMoney = this.playerMoney;

        this.savedCameraPosition = this.camera.getPosition().clone();
        this.savedCameraRotation = {
            yaw: this.input.yaw,
            pitch: this.input.pitch
        };

        const half = this.myHalfSign || -1;
        const cam = this.camera.getCamera();
        cam.position.set(0, 300, 100 * half);
        cam.up.set(0, 1, 0);
        cam.lookAt(0, 0, 0);

        this.input.yaw = 0;
        this.input.pitch = -Math.PI / 3;

        this.input.isPointerLocked = false;
        document.exitPointerLock();

        this.selectedWallType = 'barrier';
        this.isDragModeEnabled = true;

        this.setWallCursor();

        this.hideGameUI();

        this.showBuildModeUI();

        const moneyDisplay = document.getElementById('moneyDisplay');
        if (moneyDisplay) {
            moneyDisplay.style.display = 'none';
        }

        const roundContainer = document.getElementById('roundContainer');
        if (roundContainer) {
            roundContainer.style.display = 'none';
        }

        if (this.notifColumn) this.notifColumn.style.display = 'none';

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

        this.createGridLines();

        this.createEnemyZoneOverlay();

        console.log('Build mode ready - barrier selected, drag mode enabled');
    }

    createEnemyZoneOverlay() {
        this.removeEnemyZoneOverlay();
        if (!this.myHalfSign) return;
        this.enemyZoneGroup = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({
            color: 0xd63030, transparent: true, opacity: 0.28,
            side: THREE.DoubleSide, depthWrite: false,
        });
        const PATH = 100;
        for (const c of this.enemyTunnelCorridors()) {

            const len = c.len;
            const geo = new THREE.PlaneGeometry(PATH, len);
            const strip = new THREE.Mesh(geo, mat);
            strip.rotation.x = -Math.PI / 2;

            strip.rotation.z = Math.atan2(c.ux, c.uz);

            const midAlong = len / 2;
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

        this.gridGroup = new THREE.Group();

        const gridExtent = 400;
        const lineColor = 0x000000;
        const lineMaterial = new THREE.LineBasicMaterial({
            color: lineColor,
            opacity: 0.3,
            transparent: true
        });

        for (let x = -gridExtent + 10; x <= gridExtent; x += this.gridSize) {
            const points = [];
            points.push(new THREE.Vector3(x - 10, 0.1, -gridExtent));
            points.push(new THREE.Vector3(x - 10, 0.1, gridExtent));
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, lineMaterial);
            this.gridGroup.add(line);
        }

        for (let z = -gridExtent + 10; z <= gridExtent; z += this.gridSize) {
            const points = [];
            points.push(new THREE.Vector3(-gridExtent, 0.1, z - 10));
            points.push(new THREE.Vector3(gridExtent, 0.1, z - 10));
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, lineMaterial);
            this.gridGroup.add(line);
        }

        this.scene.getScene().add(this.gridGroup);
        console.log('Grid lines created with size:', this.gridSize);
    }

    removeGridLines() {
        if (this.gridGroup) {
            this.scene.getScene().remove(this.gridGroup);

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

        this.isBuildMode = false;

        if (this.savedCameraPosition && this.savedCameraRotation) {
            this.camera.getCamera().position.copy(this.savedCameraPosition);
            this.input.yaw = this.savedCameraRotation.yaw;
            this.input.pitch = this.savedCameraRotation.pitch;

            const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.input.yaw);
            const pitchQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.input.pitch);
            this.camera.getCamera().quaternion.copy(yawQuaternion).multiply(pitchQuaternion);

            if (this.compass) {
                this.compass.update(this.input.yaw);
            }
        }

        this.hideBuildModeUI();

        this.removeGridLines();
        this.removeEnemyZoneOverlay();

        this.deselectWallPlacement();

        const moneyDisplay = document.getElementById('moneyDisplay');
        if (moneyDisplay) {
            moneyDisplay.style.display = 'none';
        }

        const roundContainer = document.getElementById('roundContainer');
        if (roundContainer) {
            roundContainer.style.display = 'block';
        }

        if (this.notifColumn) this.notifColumn.style.display = 'flex';

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

        this.showGameUI();

        if (this.compass) {

            document.querySelectorAll('[id*="compass"]').forEach(el => el.remove());

            import('../ui/Compass.js').then(module => {
                this.compass = new module.Compass();
            });
        }

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

        const myTeam = this.playerTeam === 'red' ? 'red' : 'orange';
        const main = myTeam === 'red' ? '#1a2447' : '#ef4e23';
        const slotInner = (hotkey, name, price, wallType) => {
            const swatch = `background: ${main}; border: 2px solid ${main};`;
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
                ${slotInner('1', 'Barrier', 400, 'barrier')}
                ${slotInner('2', 'Large Wall', 800, 'large')}
                ${slotInner('3', 'Destructible', 600, 'destructible')}
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
            ">Drag a wall onto the map to place it — or click to pick, then click to place</div>

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

            timerEl.style.animation = (t != null && t <= 10) ? 'hudUrgent 0.7s ease infinite' : 'none';
        }
        const moneyEl = document.getElementById('buildBannerMoney');
        if (moneyEl) {
            moneyEl.textContent = `$${this.buildMoney}`;
        }

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
        this._lastValidatedCell = null; // force a fresh validation on first hover
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

            if (wallType === 'barrier' || wallType === 'large' || wallType === 'destructible') {

                // Press-and-hold on a slot begins a DRAG: the preview follows
                // the cursor and releasing the mouse over the map DROPS/places
                // the wall. (A plain click still enters place-mode too.)
                option.addEventListener('mousedown', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.startWallPlacementFromHotkey(wallType);
                    this._dragDropping = true;
                    // Position the preview immediately under the cursor.
                    this.onGlobalDragMove(event);
                });
                option.addEventListener('mouseup', (e) => { e.stopPropagation(); });
                option.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    // If this was a real drag (mousedown already started it),
                    // don't re-trigger; the click fires right after mouseup.
                    if (!this.isDraggingFromUI) this.startWallPlacementFromHotkey(wallType);
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

        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');

        ctx.strokeStyle = '#ef4e23';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(8, 16);
        ctx.lineTo(24, 16);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(16, 8);
        ctx.lineTo(16, 24);
        ctx.stroke();

        ctx.fillStyle = '#ef4e23';
        ctx.beginPath();
        ctx.arc(16, 16, 2, 0, 2 * Math.PI);
        ctx.fill();

        const dataURL = canvas.toDataURL();
        document.body.style.cursor = `url(${dataURL}) 16 16, auto`;
    }

    setWallCursor() {

        const canvas = document.createElement('canvas');
        canvas.width = 48;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#000000';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;

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

        ctx.stroke();

        const dataURL = canvas.toDataURL();
        document.body.style.cursor = `url(${dataURL}) 8 8, auto`;

        document.body.style.pointerEvents = 'auto';
    }

    setDragCursor() {

        const canvas = document.createElement('canvas');
        canvas.width = 48;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');

        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';

        ctx.beginPath();

        ctx.moveTo(24, 8);
        ctx.lineTo(24, 40);

        ctx.moveTo(8, 24);
        ctx.lineTo(40, 24);
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();

        ctx.moveTo(12, 16);
        ctx.lineTo(12, 12);
        ctx.lineTo(16, 12);

        ctx.moveTo(32, 12);
        ctx.lineTo(36, 12);
        ctx.lineTo(36, 16);

        ctx.moveTo(12, 32);
        ctx.lineTo(12, 36);
        ctx.lineTo(16, 36);

        ctx.moveTo(32, 36);
        ctx.lineTo(36, 36);
        ctx.lineTo(36, 32);
        ctx.stroke();

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

        this.clearFloatingWallPreview();

        const wallLength = 20;
        const wallThickness = 2;

        let height;
        if (this.selectedWallType === 'barrier') {
            height = 10;
        } else {
            height = 20;
        }

        const width = wallLength;
        const depth = wallThickness;

        const wallGeometry = new THREE.BoxGeometry(width, height, depth);
        const wallMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });

        this.floatingWallPreview = new THREE.Mesh(wallGeometry, wallMaterial);
        this.floatingWallPreview.layers.set(1);
        this.floatingWallPreview.rotation.y = this.currentWallRotation;
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
        if (this.globalDragHandlers) return;

        this.globalDragHandlers = {
            mousemove: (event) => this.onGlobalDragMove(event),
            mouseup: (event) => this.onGlobalDragEnd(event),
            keydown: (event) => this.onBuildModeKeyDown(event),

            contextmenu: (event) => {
                if (this.isDraggingFromUI) {
                    event.preventDefault();
                    this.deselectWallPlacement();
                }
            },
        };

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

        if (event.code === 'KeyQ' || event.code === 'Escape') {
            if (this.isDraggingFromUI) {
                event.preventDefault();
                this.deselectWallPlacement();
            }
        }
    }

    onGlobalDragMove(event) {
        if (!this.isDraggingFromUI || !this.floatingWallPreview) return;

        const mapPosition = this.getMapPositionFromMouse(event);
        if (!mapPosition) return;

        const snappedPosition = this.snapToGrid(mapPosition);

        let yPos;
        if (this.selectedWallType === 'large') {
            yPos = 10;
        } else if (this.selectedWallType === 'destructible') {
            yPos = 10;
        } else {
            yPos = 5;
        }

        // Cheap every-move update: move the preview to follow the cursor.
        this.floatingWallPreview.position.set(snappedPosition.x, yPos, snappedPosition.z);
        this.floatingWallPreview.rotation.y = this.currentWallRotation;

        // The expensive validation (BFS tunnel-seal check over every placed
        // wall) only needs to run when the target GRID CELL or rotation
        // actually changes. Running it on every raw mousemove is what made WASD
        // camera panning stutter while a wall was selected. Since placement
        // snaps to a 20-unit grid, most mousemoves land on the same cell and
        // now skip the BFS entirely — while still giving instant green/red
        // feedback the moment you move to a new cell.
        const cellKey = `${snappedPosition.x}_${snappedPosition.z}_${this.currentWallRotation.toFixed(3)}`;
        if (cellKey === this._lastValidatedCell) return;
        this._lastValidatedCell = cellKey;

        const canPlace = this.canPlaceWallAtPosition(snappedPosition, this.selectedWallType);
        if (canPlace) {
            this.floatingWallPreview.material.color.setHex(0x00ff00);
            this.floatingWallPreview.material.opacity = 0.5;
        } else {
            this.floatingWallPreview.material.color.setHex(0xff0000);
            this.floatingWallPreview.material.opacity = 0.3;
        }
    }

    onGlobalDragEnd(event) {
        const wasDragDrop = this._dragDropping;
        this._dragDropping = false;

        if (!this.isDraggingFromUI) return;

        if (event && typeof event.button === 'number' && event.button !== 0) return;

        // Released back over the build UI (e.g. on the hotbar): don't place,
        // just keep the wall selected so a click or another drag can place it.
        if (event && event.target && event.target.closest &&
            event.target.closest('#buildModeUI')) return;

        const mapPosition = this.getMapPositionFromMouse(event);
        if (mapPosition) {
            const snappedPosition = this.snapToGrid(mapPosition);
            if (this.canPlaceWallAtPosition(snappedPosition, this.selectedWallType, true)) {
                this.placeWallAtPosition(snappedPosition, this.currentWallRotation);
                this.refreshBuildBanner();
                // Walls changed — invalidate the cached validation so the next
                // hover re-checks (this cell is now occupied).
                this._lastValidatedCell = null;

                // Drag-and-drop is one-shot: after dropping, deselect so nothing
                // stays attached to the cursor. (Click-selection keeps the wall
                // selected for placing many.)
                if (wasDragDrop) {
                    this.deselectWallPlacement();
                }
            } else {
                console.log('Cannot place wall here - occupied / invalid / enemy tunnel');
            }
        }
    }

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

    snapToGrid(position) {

        const isVertical = Math.abs(this.currentWallRotation % Math.PI) > 0.1;

        let snappedX, snappedZ;

        if (isVertical) {

            snappedX = Math.round(position.x / this.gridSize) * this.gridSize;

            snappedZ = Math.round((position.z + 10) / this.gridSize) * this.gridSize - 10;
        } else {

            snappedX = Math.round((position.x + 10) / this.gridSize) * this.gridSize - 10;
            snappedZ = Math.round(position.z / this.gridSize) * this.gridSize;
        }

        return { x: snappedX, y: position.y, z: snappedZ };
    }

    getGridKey(position) {

        const gridX = Math.round(position.x / this.gridSize);
        const gridZ = Math.round(position.z / this.gridSize);
        return `${gridX}_${gridZ}`;
    }

    enemyTunnelCorridors() {

        const SPAWN_Z = 300, SITE_X = 250, HALF_WIDTH = 50;
        const SITE_HALF = 90;

        const enemyZ = -this.myHalfSign * SPAWN_Z;
        if (!this.myHalfSign) return [];
        const mk = (siteX) => {
            const sx = 0, sz = enemyZ, ex = siteX, ez = 0;
            const dx = ex - sx, dz = ez - sz;
            const fullLen = Math.hypot(dx, dz);
            const ux = dx / fullLen, uz = dz / fullLen;
            const px = -uz, pz = ux;

            const len = Math.max(20, fullLen - SITE_HALF);
            return { sx, sz, len, ux, uz, px, pz, halfWidth: HALF_WIDTH };
        };
        return [mk(-SITE_X), mk(SITE_X)];
    }

    isInEnemyTunnel(x, z) {

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

    wallTouchesEnemyTunnel(pos) {
        if (!this.myHalfSign) return false;
        const fp = this.candidateFootprint(pos);
        const STEP = 2;
        for (let dx = -fp.hx; dx <= fp.hx; dx += STEP) {
            for (let dz = -fp.hz; dz <= fp.hz; dz += STEP) {
                if (this.isInEnemyTunnel(fp.x + dx, fp.z + dz)) return true;
            }

            if (this.isInEnemyTunnel(fp.x + dx, fp.z + fp.hz)) return true;
        }

        for (let dz = -fp.hz; dz <= fp.hz; dz += STEP) {
            if (this.isInEnemyTunnel(fp.x + fp.hx, fp.z + dz)) return true;
        }
        return false;
    }

    wallFootprint(mesh) {
        const len = 20, thick = 2;
        const vertical = Math.abs((mesh.rotation.y % Math.PI)) > 0.1;
        const hx = vertical ? thick / 2 : len / 2;
        const hz = vertical ? len / 2 : thick / 2;
        return { x: mesh.position.x, z: mesh.position.z, hx, hz };
    }

    candidateFootprint(pos) {
        const len = 20, thick = 2;
        const vertical = Math.abs((this.currentWallRotation % Math.PI)) > 0.1;
        const hx = vertical ? thick / 2 : len / 2;
        const hz = vertical ? len / 2 : thick / 2;
        return { x: pos.x, z: pos.z, hx, hz };
    }

    tunnels() {
        if (this._tunnelList) return this._tunnelList;
        const SPAWN_Z = 300, SITE_X = 250, PATH = 100;
        const mk = (sx, sz, ex, ez) => {
            const dx = ex - sx, dz = ez - sz;
            const len = Math.hypot(dx, dz);
            const ux = dx / len, uz = dz / len;
            const px = -uz, pz = ux;
            return { sx, sz, ux, uz, px, pz, len, half: PATH / 2 };
        };
        this._tunnelList = [
            mk(0, -SPAWN_Z, -SITE_X, 0),
            mk(0, -SPAWN_Z, SITE_X, 0),
            mk(0, SPAWN_Z, -SITE_X, 0),
            mk(0, SPAWN_Z, SITE_X, 0),
            mk(-SITE_X, 0, SITE_X, 0),
        ];
        return this._tunnelList;
    }

    tunnelPassable(c, walls, pad) {
        const stepA = 4, stepP = 4;
        const blocked = (wx, wz) => {
            for (const w of walls) {
                if (Math.abs(wx - w.x) <= w.hx + pad && Math.abs(wz - w.z) <= w.hz + pad) return true;
            }
            return false;
        };
        const toWorld = (a, p) => ({ x: c.sx + c.ux * a + c.px * p, z: c.sz + c.uz * a + c.pz * p });
        const cols = [], rows = [];
        for (let a = 0; a <= c.len; a += stepA) cols.push(a);
        for (let p = -c.half; p <= c.half; p += stepP) rows.push(p);
        const key = (ci, ri) => ci + '_' + ri;
        const open = new Set();
        for (let ci = 0; ci < cols.length; ci++) {
            for (let ri = 0; ri < rows.length; ri++) {
                const w = toWorld(cols[ci], rows[ri]);
                if (!blocked(w.x, w.z)) open.add(key(ci, ri));
            }
        }
        const queue = [], seen = new Set();
        for (let ri = 0; ri < rows.length; ri++) {
            if (open.has(key(0, ri))) { queue.push([0, ri]); seen.add(key(0, ri)); }
        }
        const last = cols.length - 1;
        while (queue.length) {
            const [ci, ri] = queue.pop();
            if (ci === last) return true;
            for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nc = ci + dc, nr = ri + dr;
                if (nc < 0 || nr < 0 || nc >= cols.length || nr >= rows.length) continue;
                const k = key(nc, nr);
                if (open.has(k) && !seen.has(k)) { seen.add(k); queue.push([nc, nr]); }
            }
        }
        return false;
    }

    wouldSealAnyTunnel(position) {
        const walls = (this.buildWalls || []).map((m) => this.wallFootprint(m));
        walls.push(this.candidateFootprint(position));
        const pad = 1;
        for (const c of this.tunnels()) {
            if (!this.tunnelPassable(c, walls, pad)) return true;
        }
        return false;
    }

    // Single source of truth for wall prices — MUST match the backend
    // (message_handler.rs handle_place_structure). A mismatch desyncs the
    // client's displayed money from the server's authoritative value.
    wallCost(wallType) {
        if (wallType === 'large') return 800;
        if (wallType === 'destructible') return 600;
        return 400; // barrier / small
    }

    canPlaceWallAtPosition(position, wallType, shouldFlash = false) {
        const gridPos = this.snapToGrid(position);

        if (this.wallTouchesEnemyTunnel(gridPos)) {
            if (shouldFlash) this.flashBuildZoneWarning("Can't build in enemy tunnels");
            return false;
        }

        if (this.wouldSealAnyTunnel(gridPos)) {
            if (shouldFlash) this.flashBuildZoneWarning("Can't fully close a tunnel");
            return false;
        }

        const cost = this.wallCost(wallType);
        if (this.buildMoney < cost) {

            if (shouldFlash) {
                this.flashMoneyRed();
            }
            return false;
        }

        const isVertical = Math.abs(this.currentWallRotation % Math.PI) > 0.1;
        const wallKey = `${gridPos.x}_${gridPos.z}_${isVertical ? 'V' : 'H'}`;

        if (this.placedWallPositions.has(wallKey)) {
            return false;
        }

        return true;
    }

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

        const isVertical = Math.abs(this.currentWallRotation % Math.PI) > 0.1;
        const wallKey = `${gridPos.x}_${gridPos.z}_${isVertical ? 'V' : 'H'}`;
        this.placedWallPositions.add(wallKey);

        console.log(`Marked ${isVertical ? 'vertical' : 'horizontal'} wall at (${gridPos.x}, ${gridPos.z})`);
    }

    handleRemoteBuildingPlaced(message) {

        console.log('Received building placement message:', message);
        const position = { x: message.x, z: message.z, y: 0 };
        const rotation = message.rotation;
        const wallType = message.building_type;

        console.log(`Remote player ${message.player_id} placed ${wallType} at (${position.x}, ${position.z}) rotation: ${rotation}`);

        const team = (this.playerTeams && this.playerTeams[message.player_id]) || 'orange';
        this.placeRemoteWall(position, rotation, wallType, team);
    }

    placeRemoteWall(position, rotation, wallType, team = 'orange') {

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

        const savedRotation = this.currentWallRotation;
        this.currentWallRotation = rotation;
        this.markGridAsOccupied(position, wallType);
        this.currentWallRotation = savedRotation;

        const wallGeometry = new THREE.BoxGeometry(width, height, depth);
        const isDestructible = wallType === 'destructible';

        const wallMaterial = new THREE.MeshPhongMaterial({ emissiveIntensity: 0.2 });
        const wall = new THREE.Mesh(wallGeometry, wallMaterial);
        wall.position.set(position.x, yPos, position.z);
        wall.rotation.y = rotation;
        wall.castShadow = true;
        wall.receiveShadow = true;

        this.decorateWall(wall, width, height, depth, team, isDestructible);

        if (wallType === 'destructible') {
            wall.userData.isDestructible = true;
            wall.userData.bulletHoles = [];
            wall.userData.wallType = 'destructible';
        }

        this.scene.add(wall);
        this.buildWalls.push(wall);

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

    teamWallColors(team) {
        return team === 'red'
            ? { main: 0x1a2447, accent: 0xef4e23, emissive: 0x0d1326 }
            : { main: 0xef4e23, accent: 0x1a2447, emissive: 0x331100 };
    }

    decorateWall(wall, width, height, depth, team, isDestructible) {
        const c = this.teamWallColors(team);
        if (wall.material) {
            wall.material.map = null;
            wall.material.color = new THREE.Color(c.main);
            if ('emissive' in wall.material) wall.material.emissive = new THREE.Color(c.emissive);
            wall.material.needsUpdate = true;
        }
    }

    placeWallAtPosition(position, rotation) {

        const wallLength = 20;
        const wallThickness = 2;

        let height, yPos;
        if (this.selectedWallType === 'large') {
            height = 20;
            yPos = 10;
        } else if (this.selectedWallType === 'destructible') {
            height = 20;
            yPos = 10;
        } else {

            height = 10;
            yPos = 5;
        }
        const cost = this.wallCost(this.selectedWallType);

        const width = wallLength;
        const depth = wallThickness;

        if (this.buildMoney < cost) {
            console.log(`Not enough money for ${this.selectedWallType} wall`);
            return;
        }

        if (this.network && this.network.isConnected()) {
            console.log(`Sending building placement: ${this.selectedWallType} at (${position.x}, ${position.z}) rotation: ${rotation}`);
            this.network.sendPlaceBuilding(position, rotation, this.selectedWallType);
            this._track('structure-placed', { type: this.selectedWallType });
        } else {
            console.log('Network not connected, building placement not sent');
        }

        this.markGridAsOccupied(position, this.selectedWallType);

        const wallGeometry = new THREE.BoxGeometry(width, height, depth);
        const isDestructible = this.selectedWallType === 'destructible';

        const wallMaterial = new THREE.MeshPhongMaterial({ emissiveIntensity: 0.2 });
        const wall = new THREE.Mesh(wallGeometry, wallMaterial);
        wall.position.set(position.x, yPos, position.z);
        wall.rotation.y = rotation;
        wall.castShadow = true;
        wall.receiveShadow = true;

        this.decorateWall(wall, width, height, depth, this.playerTeam, isDestructible);

        if (this.selectedWallType === 'destructible') {
            wall.userData.isDestructible = true;
            wall.userData.bulletHoles = [];
            wall.userData.wallType = 'destructible';
        }

        this.scene.getScene().add(wall);
        this.buildWalls.push(wall);

        this.collisionSystem.addBoxCollider(
            { x: position.x, y: yPos, z: position.z },
            { x: width, y: height, z: depth },
            'buildWall',
            rotation
        );

        this.buildMoney -= cost;
        this.playerMoney = this.buildMoney;
        this.updateMoneyDisplay();

        const gridKey = this.getGridKey(position);
        console.log(`Placed ${this.selectedWallType} wall at grid (${position.x}, ${position.z}) [${gridKey}] for $${cost}. Money: $${this.buildMoney}`);
    }

    clearWallSelections() {

        document.querySelectorAll('.wall-option').forEach(option => {
            option.classList.remove('selected');

            option.style.background = 'transparent';
            option.style.border = '1px solid rgba(239, 78, 35, 0.12)';
        });
    }

    updateMoneyDisplay() {

        const moneyAmount = document.getElementById('moneyAmount');
        if (moneyAmount) {
            moneyAmount.textContent = `$${this.buildMoney}`;
        }

        const moneyDisplay = document.getElementById('moneyDisplay');
        if (moneyDisplay) {
            if (this.isBuildMode) {
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

            const originalColor = moneyAmount.style.color || '#ef4e23';
            const originalBorder = moneyDisplay.style.border;

            moneyAmount.style.color = '#ef4e23';
            moneyDisplay.style.border = '1px solid rgba(239, 78, 35, 0.6)';
            moneyDisplay.style.animation = 'shake 0.3s';

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

        if (this.selectedWallType !== 'barrier' || !this.isDragModeEnabled) return;

        const mapPosition = this.getMapPositionFromMouse(event);
        if (!mapPosition) return;

        console.log('Starting wall drag at position:', mapPosition);
        this.isPlacingWall = true;
        this.wallStartPos = mapPosition.clone();

        this.setDragCursor();
    }

    onWallPlaceMove(event) {
        if (!this.isPlacingWall || this.selectedWallType !== 'barrier') return;

        const mapPosition = this.getMapPositionFromMouse(event);
        if (!mapPosition) return;

        this.updateBarrierPreview(this.wallStartPos, mapPosition);
    }

    onWallPlaceEnd(event) {
        if (!this.isPlacingWall || this.selectedWallType !== 'barrier') return;

        const mapPosition = this.getMapPositionFromMouse(event);
        if (!mapPosition) return;

        const distance = this.wallStartPos.distanceTo(mapPosition);
        if (distance < 3) {
            console.log('Wall too short - minimum length is 3 units');
            this.isPlacingWall = false;
            this.wallStartPos = null;
            this.clearWallPreview();
            this.setWallCursor();
            return;
        }

        console.log(`Placing wall from (${this.wallStartPos.x.toFixed(1)}, ${this.wallStartPos.z.toFixed(1)}) to (${mapPosition.x.toFixed(1)}, ${mapPosition.z.toFixed(1)}) - Distance: ${distance.toFixed(1)} units`);

        this.placeBarrier(this.wallStartPos, mapPosition);

        this.isPlacingWall = false;
        this.wallStartPos = null;

        this.clearWallPreview();

        this.setWallCursor();
    }

    getMapPositionFromMouse(event) {
        const canvas = document.querySelector('#gameContainer canvas');
        if (!canvas) return null;

        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        const mouse = new THREE.Vector2();
        mouse.x = (mouseX / canvas.clientWidth) * 2 - 1;
        mouse.y = -(mouseY / canvas.clientHeight) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera.getCamera());

        const cameraPos = this.camera.getCamera().position;
        const ray = raycaster.ray;

        const t = -ray.origin.y / ray.direction.y;

        if (t > 0) {

            const intersectionPoint = new THREE.Vector3();
            intersectionPoint.x = ray.origin.x + t * ray.direction.x;
            intersectionPoint.y = 0;
            intersectionPoint.z = ray.origin.z + t * ray.direction.z;

            return intersectionPoint;
        }

        return null;
    }

    updateWallPreview(startPos, endPos) {

        this.clearWallPreview();

        const distance = startPos.distanceTo(endPos);
        if (distance < 5) return;

        const wallHeight = 15;
        const wallWidth = this.selectedWallType === 'large' ? 3 : 1.5;

        const wallGeometry = new THREE.BoxGeometry(distance, wallHeight, wallWidth);
        const wallMaterial = new THREE.MeshBasicMaterial({
            color: 0xef4e23,
            transparent: true,
            opacity: 0.5
        });

        this.wallPreview = new THREE.Mesh(wallGeometry, wallMaterial);

        this.wallPreview.position.copy(startPos).add(endPos).multiplyScalar(0.5);
        this.wallPreview.position.y = wallHeight / 2;

        this.wallPreview.lookAt(endPos);
        this.wallPreview.rotateY(Math.PI / 2);

        this.scene.getScene().add(this.wallPreview);
    }

    updateBarrierPreview(startPos, endPos) {

        this.clearWallPreview();

        const distance = startPos.distanceTo(endPos);
        if (distance < 3) return;

        const wallHeight = 12;
        const wallWidth = 1.5;

        const wallGeometry = new THREE.BoxGeometry(distance, wallHeight, wallWidth);
        const wallMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.6
        });

        this.wallPreview = new THREE.Mesh(wallGeometry, wallMaterial);

        this.wallPreview.position.copy(startPos).add(endPos).multiplyScalar(0.5);
        this.wallPreview.position.y = wallHeight / 2;

        this.wallPreview.lookAt(endPos);
        this.wallPreview.rotateY(Math.PI / 2);

        this.scene.getScene().add(this.wallPreview);

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
        if (distance < 5) return;

        const cost = this.wallCost(wallType);
        if (this.buildMoney < cost) {
            console.log('Not enough money for wall');
            return;
        }

        this.buildMoney -= cost;
        this.playerMoney = this.buildMoney;
        this.updateMoneyDisplay();

        const wallHeight = 15;
        const wallWidth = wallType === 'large' ? 3 : 1.5;

        const wallGeometry = new THREE.BoxGeometry(distance, wallHeight, wallWidth);
        const wallMaterial = new THREE.MeshLambertMaterial({
            color: 0xef4e23,
            emissive: 0xff3300,
            emissiveIntensity: 0.1
        });

        const wall = new THREE.Mesh(wallGeometry, wallMaterial);

        wall.position.copy(startPos).add(endPos).multiplyScalar(0.5);
        wall.position.y = wallHeight / 2;

        wall.lookAt(endPos);
        wall.rotateY(Math.PI / 2);

        wall.castShadow = true;
        wall.receiveShadow = true;

        this.scene.getScene().add(wall);

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
        if (distance < 3) return;

        const cost = this.wallCost('barrier');
        if (this.buildMoney < cost) {
            console.log('Not enough money for barrier');
            return;
        }

        this.buildMoney -= cost;
        this.playerMoney = this.buildMoney;
        this.updateMoneyDisplay();

        const wallHeight = 12;
        const wallWidth = 1.5;

        const wallGeometry = new THREE.BoxGeometry(distance, wallHeight, wallWidth);
        const wallMaterial = new THREE.MeshLambertMaterial({
            color: 0xef4e23,
            emissive: 0xff3300,
            emissiveIntensity: 0.2
        });

        const wall = new THREE.Mesh(wallGeometry, wallMaterial);

        wall.position.copy(startPos).add(endPos).multiplyScalar(0.5);
        wall.position.y = wallHeight / 2;

        wall.lookAt(endPos);
        wall.rotateY(Math.PI / 2);

        wall.castShadow = true;
        wall.receiveShadow = true;

        this.scene.getScene().add(wall);

        if (this.collisionSystem) {
            this.collisionSystem.addBoxCollider(
                wall.position,
                new THREE.Vector3(distance, wallHeight, wallWidth),
                'wall'
            );
        }

        console.log(`Placed barrier (${distance.toFixed(1)} units) for $${cost}. Money remaining: $${this.buildMoney}`);
    }

    hideGameUI() {

        const uiElement = document.getElementById('ui');
        if (uiElement) uiElement.style.display = 'none';

        const healthContainer = document.getElementById('healthContainer');
        if (healthContainer) healthContainer.style.display = 'none';

        if (this.ammoDisplay) this.ammoDisplay.hide();

        const killCounter = document.getElementById('killCounter');
        if (killCounter) killCounter.style.display = 'none';

        if (this.weaponSystem) this.weaponSystem.hide();

        document.querySelectorAll('[id*="compass"]').forEach(el => {
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('visibility', 'hidden', 'important');
            el.style.setProperty('opacity', '0', 'important');
            el.style.setProperty('width', '0', 'important');
            el.style.setProperty('height', '0', 'important');
            el.style.setProperty('overflow', 'hidden', 'important');
        });

        document.querySelectorAll('*').forEach(el => {
            const style = window.getComputedStyle(el);
            if (style.position === 'fixed' &&
                style.top && parseInt(style.top) < 100 &&
                style.left && style.left.includes('50%')) {
                el.style.setProperty('display', 'none', 'important');
            }
        });

        const crosshair = document.getElementById('crosshair');
        if (crosshair) crosshair.style.display = 'none';
    }

    showGameUI() {

        const uiElement = document.getElementById('ui');
        if (uiElement) uiElement.style.display = 'block';

        const healthContainer = document.getElementById('healthContainer');
        if (healthContainer) healthContainer.style.display = 'block';

        if (this.ammoDisplay) this.ammoDisplay.show();

        const killCounter = document.getElementById('killCounter');
        if (killCounter) killCounter.style.display = 'block';

        if (this.weaponSystem) this.weaponSystem.show();

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

        document.querySelectorAll('[id*="compass"]').forEach(el => {
            el.style.removeProperty('display');
            el.style.removeProperty('visibility');
            el.style.removeProperty('opacity');
            el.style.removeProperty('width');
            el.style.removeProperty('height');
            el.style.removeProperty('overflow');
        });

        const crosshair = document.getElementById('crosshair');
        if (crosshair) crosshair.style.display = 'block';
    }

    updateBuildModeMovement(deltaTime) {
        const moveSpeed = 50;
        const camera = this.camera.getCamera();
        const moveVector = new THREE.Vector3();

        const forward = new THREE.Vector3(0, 0, -1);
        const right = new THREE.Vector3(1, 0, 0);

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

        camera.position.add(moveVector);

        camera.position.y = 200;
        camera.lookAt(camera.position.x, 0, camera.position.z);
    }

    endRound(winner) {
        console.log(`Round ended! ${winner} wins!`);

        const message = winner === 'terrorists' ? 'Terrorists Win!' : 'Counter-Terrorists Win!';
        this.showRoundEndMessage(message);

        setTimeout(() => {
            this.resetRound();
        }, 5000);
    }

    notify(title, subtitle = '', accent = '#ef4e23') {
        if (this.notifications) this.notifications.push(title, subtitle, accent);
    }

    showRoundEndMessage(title, subtitle = '', accent = '#ffffff') {
        let message = document.getElementById('roundEndMessage');

        if (!message) {
            message = document.createElement('div');
            message.id = 'roundEndMessage';

            message.style.cssText = `
                width: 100%;
                box-sizing: border-box;
                padding: 16px 22px;
                background: rgba(26, 36, 71, 0.92);
                border: 1px solid rgba(239, 78, 35, 0.2);
                border-left: 5px solid ${accent};
                border-radius: 4px 12px 12px 4px;
                backdrop-filter: blur(10px);
                color: #ef4e23;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                text-align: left;
                opacity: 0;
                transform: translateX(-12px);
                transition: opacity 0.25s ease, transform 0.25s ease;
                pointer-events: none;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            `;

            const col = document.getElementById('notifColumn') || document.body;
            col.insertBefore(message, col.firstChild);
        }

        message.style.borderLeftColor = accent;

        message.innerHTML = `
            <div style="font-size: 32px; font-weight: 800; letter-spacing: 0.5px; line-height: 1.05; color: #ef4e23; text-transform: uppercase;">${title}</div>
            ${subtitle ? `<div style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; color: rgba(239, 78, 35, 0.6); margin-top: 6px;">${subtitle}</div>` : ''}
        `;

        message.style.display = 'block';
        requestAnimationFrame(() => {
            message.style.opacity = '1';
            message.style.transform = 'translateX(0)';
        });

        if (this._roundEndMsgTimer) clearTimeout(this._roundEndMsgTimer);
        this._roundEndMsgTimer = setTimeout(() => {
            message.style.opacity = '0';
            message.style.transform = 'translateX(-12px)';
            setTimeout(() => { message.style.display = 'none'; }, 300);
        }, 6000);
    }

    killPlayer(reason) {
        if (!this.isAlive) return;

        this.isAlive = false;
        this.health = 0;
        this.updateHealthDisplay();
        this.activateDeathCam();

        if (this.weaponSystem) {
            this.weaponSystem.hide();
        }

        this.showDeathMessage(reason || 'You died!', 3);

        console.log('Player killed:', reason);
    }

    resetRound() {

        this.spawnPlayer();

        if (this.bombSystem) {
            this.bombSystem.cleanup();
            this.bombSystem.giveBomb();
        }

        this.health = 100;
        this.shield = 100;
        this.isAlive = true;
        this.updateHealthDisplay();

        if (this.weaponSystem) {
            this.weaponSystem.show();
            this.weaponSystem.resetWeapon();
        }
    }
}
