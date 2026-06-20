export class NetworkClient {
    constructor() {
        this.ws = null;
        this.playerId = null;
        this.connected = false;
        this.pendingPlayers = [];
        this.onPlayerJoinedCallback = null;
        this.onPlayerLeftCallback = null;
        this.onPlayerMovedCallback = null;
        this.onPlayerShotCallback = null;
        this.onPlayerHitCallback = null;
        this.onPlayerDiedCallback = null;
        this.onPlayerRespawnedCallback = null;
        this.onShieldUpdateCallback = null;
        this.onScoreboardUpdateCallback = null;
        this.onTeamLobbyCreatedCallback = null;
        this.onTeamUpdateCallback = null;
        this.onGameStartedCallback = null;
        this.currentLobbyId = null;
        this.gameMode = null;
    }

    connect() {
        // Pick the WS scheme from the PAGE protocol. On an https:// page the
        // browser BLOCKS insecure ws:// (mixed content) — the socket looks like
        // it "opens" then is silently killed, so the backend never sees the
        // connection. On https we therefore use wss:// and route through the
        // reverse proxy path (/ws) which terminates TLS in front of the backend.
        let wsUrl;
        if (window.location.hostname === 'localhost') {
            wsUrl = 'ws://localhost:6969';
        } else if (window.location.protocol === 'https:') {
            // Secure: go through the proxy on the same host:443, path /ws.
            wsUrl = `wss://${window.location.host}/ws`;
        } else {
            // Plain http: direct to the backend port.
            wsUrl = `ws://${window.location.hostname}:6969`;
        }
        console.log('[WS] connecting to', wsUrl);
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.connected = true;
            const n = (this._pendingSends && this._pendingSends.length) || 0;
            console.log('[WS] OPEN — flushing', n, 'queued message(s)');
            // Flush any messages queued while the socket was still connecting.
            if (this._pendingSends && this._pendingSends.length) {
                const queued = this._pendingSends;
                this._pendingSends = [];
                queued.forEach((m) => {
                    console.log('[WS] flush →', m.type);
                    this.ws.send(JSON.stringify(m));
                });
            }
        };

        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
        };

        this.ws.onclose = (ev) => {
            this.connected = false;
            console.warn('[WS] CLOSED code=', ev.code, 'reason=', ev.reason, 'wasClean=', ev.wasClean);
            setTimeout(() => this.connect(), 3000);
        };

        this.ws.onerror = (error) => {
            console.error('[WS] ERROR', error);
        };
    }

    handleMessage(message) {
        switch (message.type) {
        case 'welcome':
            this.playerId = message.player_id;
            this.currentLobbyId = message.lobby_id;
            this.gameMode = message.game_mode;
            break;

        case 'team_lobby_created':
            this.currentLobbyId = message.lobby_id;
            if (this.onTeamLobbyCreatedCallback) {
                this.onTeamLobbyCreatedCallback(message);
            }
            break;

        case 'team_update':
            if (this.onTeamUpdateCallback) {
                this.onTeamUpdateCallback(message);
            }
            break;

        case 'game_started':
            this.gameMode = message.game_mode;
            if (this.onGameStartedCallback) {
                this.onGameStartedCallback(message);
            }
            break;

        case 'structure_placed':
            if (this.onBuildingPlacedCallback) {
                // Convert backend message format to frontend format
                const buildingMsg = {
                    player_id: message.player_id,
                    x: message.x,
                    z: message.z,
                    rotation: message.y,  // y field stores rotation
                    building_type: message.structure_type
                };
                this.onBuildingPlacedCallback(buildingMsg);
            }
            break;

        case 'player_joined':
            console.log('Received player_joined message:', message);
            console.log('Message player ID:', message.player.id);
            console.log('My player ID:', this.playerId);
            if (message.player.id !== this.playerId) {
                console.log('Adding player via direct call to game instance');
                // Direct call to game instance if callback not set up yet
                if (this.onPlayerJoinedCallback) {
                    console.log('Calling onPlayerJoinedCallback for player:', message.player.id);
                    this.onPlayerJoinedCallback(message.player);
                } else if (window.game && window.game.playerManager) {
                    console.log('Calling playerManager.addPlayer directly for player:', message.player.id);
                    window.game.playerManager.addPlayer(message.player);
                } else {
                    console.log('PlayerManager not ready, storing player for later:', message.player.id);
                    this.pendingPlayers.push(message.player);
                }
            }
            break;

        case 'player_left':
            if (this.onPlayerLeftCallback) {
                this.onPlayerLeftCallback(message.player_id);
            }
            break;

        case 'player_moved':
            if (this.onPlayerMovedCallback && message.player_id !== this.playerId) {
                // NOTE: logging every movement message (hundreds/sec) caused
                // visible stutter, especially with DevTools open. Keep it off.
                this.onPlayerMovedCallback(message);
            }
            break;

        case 'player_shot':
            if (this.onPlayerShotCallback) {
                this.onPlayerShotCallback(message);
            }
            break;

        case 'player_hit':
            if (this.onPlayerHitCallback) {
                this.onPlayerHitCallback(message);
            }
            break;

        case 'player_died':
            if (this.onPlayerDiedCallback) {
                this.onPlayerDiedCallback(message);
            }
            break;

        case 'player_respawned':
            if (this.onPlayerRespawnedCallback) {
                this.onPlayerRespawnedCallback(message);
            }
            break;

        case 'shield_update':
            if (this.onShieldUpdateCallback) {
                this.onShieldUpdateCallback(message);
            }
            break;

        case 'scoreboard_update':
            console.log('Scoreboard update received:', message);
            if (this.onScoreboardUpdateCallback) {
                this.onScoreboardUpdateCallback(message);
            }
            break;
            
        case 'round_start':
            console.log('Round started:', message);
            if (this.onRoundStartCallback) {
                this.onRoundStartCallback(message);
            }
            break;
            
        case 'round_end':
            console.log('Round ended:', message);
            if (this.onRoundEndCallback) {
                this.onRoundEndCallback(message);
            }
            break;
            
        case 'build_phase_end':
            console.log('Build phase ended');
            if (this.onBuildPhaseEndCallback) {
                this.onBuildPhaseEndCallback();
            }
            break;
            
        case 'bomb_planted':
            console.log('Bomb planted:', message);
            if (this.onBombPlantedCallback) {
                this.onBombPlantedCallback(message);
            }
            break;
            
        case 'bomb_defused':
            console.log('Bomb defused:', message);
            if (this.onBombDefusedCallback) {
                this.onBombDefusedCallback(message);
            }
            break;
            
        case 'bomb_exploded':
            console.log('Bomb exploded');
            if (this.onBombExplodedCallback) {
                this.onBombExplodedCallback();
            }
            break;
            
        case 'money_update':
            console.log('Money update:', message);
            if (this.onMoneyUpdateCallback) {
                this.onMoneyUpdateCallback(message);
            }
            break;
            
        case 'give_bomb':
            console.log('Player given bomb:', message);
            if (this.onGiveBombCallback) {
                this.onGiveBombCallback(message);
            }
            break;
            
        case 'bomb_dropped':
            console.log('Bomb dropped:', message);
            if (this.onBombDroppedCallback) {
                this.onBombDroppedCallback(message);
            }
            break;
            
        case 'bomb_picked_up':
            console.log('Bomb picked up:', message);
            if (this.onBombPickedUpCallback) {
                this.onBombPickedUpCallback(message);
            }
            break;
            
        case 'match_end':
            console.log('Match ended:', message);
            if (this.onMatchEndCallback) {
                this.onMatchEndCallback(message);
            }
            break;

        case 'map_reset':
            console.log('Map reset (halftime)');
            if (this.onMapResetCallback) {
                this.onMapResetCallback();
            }
            break;
        }
    }

    joinGame(playerName) {
        if (this.isConnected()) {
            this.send({
                type: 'join',
                name: playerName
            });
        }
    }

    sendMove(position, rotation) {
        if (this.isConnected()) {
            // Position logging removed for cleaner console
            this.send({
                type: 'move',
                x: position.x,
                y: position.y,
                z: position.z,
                rotation_x: rotation.x,
                rotation_y: rotation.y
            });
        }
    }

    sendShoot(startPos, target) {
        if (this.isConnected()) {
            this.send({
                type: 'shoot',
                start_x: startPos.x,
                start_y: startPos.y,
                start_z: startPos.z,
                target_x: target.x,
                target_y: target.y,
                target_z: target.z
            });
        }
    }

    sendHit(targetPlayerId, wasKilled) {
        if (this.isConnected()) {
            this.send({
                type: 'hit',
                target_player_id: targetPlayerId,
                killed: wasKilled
            });
        }
    }

    sendRespawn() {
        if (this.isConnected()) {
            this.send({
                type: 'respawn'
            });
        }
    }
    
    sendPlantBomb() {
        if (this.isConnected()) {
            this.send({
                type: 'plant_bomb'
            });
        }
    }
    
    sendPlantBombWithPosition(x, z) {
        console.log('sendPlantBombWithPosition called with:', x, z);
        console.log('Is connected?', this.isConnected());
        console.log('WebSocket state:', this.ws ? this.ws.readyState : 'no ws');
        
        if (this.isConnected()) {
            const message = {
                type: 'plant_bomb',
                position_x: x,
                position_z: z
            };
            console.log('Sending plant_bomb message:', JSON.stringify(message));
            this.send(message);
            console.log('Message sent!');
        } else {
            console.error('Cannot send plant_bomb - not connected!');
        }
    }
    
    sendDefuseBomb() {
        if (this.isConnected()) {
            this.send({
                type: 'defuse_bomb'
            });
        }
    }
    
    sendDropBomb() {
        if (this.isConnected()) {
            this.send({
                type: 'drop_bomb'
            });
        }
    }
    
    sendPickupBomb() {
        if (this.isConnected()) {
            this.send({
                type: 'pickup_bomb'
            });
        }
    }
    
    sendBuyItem(item) {
        if (this.isConnected()) {
            this.send({
                type: 'buy_item',
                item: item
            });
        }
    }

    createTeamLobby(playerName) {
        // No isConnected() guard — send() now queues until the socket opens, so
        // this works even when called immediately after connect().
        this.send({
            type: 'create_team_lobby',
            name: playerName
        });
    }

    joinTeam(team) {
        this.send({
            type: 'join_team',
            team: team
        });
    }

    startTeamGame() {
        if (this.isConnected()) {
            this.send({
                type: 'start_team_game'
            });
        }
    }

    sendPlaceBuilding(position, rotation, buildingType) {
        if (this.isConnected()) {
            this.send({
                type: 'place_structure',
                structure_type: buildingType,
                x: position.x,
                y: rotation, // Using y field to store rotation
                z: position.z
            });
        }
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            // Per-message send logging floods the console during movement (one
            // 'move' per frame) and causes stutter; only log the lobby/team msgs.
            if (data.type !== 'move') console.log('[WS] send →', data.type, 'readyState=OPEN');
            this.ws.send(JSON.stringify(data));
        } else {
            // Socket not open yet (still CONNECTING). Queue the message and flush
            // it on open — otherwise early messages like create_team_lobby /
            // join_team are silently lost, which broke the shared lobby (each
            // window failed to register and looked solo).
            if (!this._pendingSends) this._pendingSends = [];
            this._pendingSends.push(data);
            console.log('[WS] QUEUED (socket not open) →', data.type,
                'readyState=', this.ws ? this.ws.readyState : 'no-ws');
        }
    }

    isConnected() {
        return this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    onPlayerJoined(callback) {
        this.onPlayerJoinedCallback = callback;
    }

    onPlayerLeft(callback) {
        this.onPlayerLeftCallback = callback;
    }

    onPlayerMoved(callback) {
        this.onPlayerMovedCallback = callback;
    }

    onPlayerShot(callback) {
        this.onPlayerShotCallback = callback;
    }

    onPlayerHit(callback) {
        this.onPlayerHitCallback = callback;
    }

    onPlayerDied(callback) {
        this.onPlayerDiedCallback = callback;
    }

    onPlayerRespawned(callback) {
        this.onPlayerRespawnedCallback = callback;
    }

    onShieldUpdate(callback) {
        this.onShieldUpdateCallback = callback;
    }

    onMoneyUpdate(callback) {
        this.onMoneyUpdateCallback = callback;
    }

    onScoreboardUpdate(callback) {
        this.onScoreboardUpdateCallback = callback;
    }

    onTeamLobbyCreated(callback) {
        this.onTeamLobbyCreatedCallback = callback;
    }

    onTeamUpdate(callback) {
        this.onTeamUpdateCallback = callback;
    }

    onGameStarted(callback) {
        this.onGameStartedCallback = callback;
    }

    onBuildingPlaced(callback) {
        this.onBuildingPlacedCallback = callback;
    }
    
    processPendingPlayers() {
        console.log('Processing', this.pendingPlayers.length, 'pending players');
        for (const player of this.pendingPlayers) {
            if (this.onPlayerJoinedCallback) {
                console.log('Adding pending player via callback:', player.id);
                this.onPlayerJoinedCallback(player);
            } else if (window.game && window.game.playerManager) {
                console.log('Adding pending player via direct call:', player.id);
                window.game.playerManager.addPlayer(player);
            }
        }
        this.pendingPlayers = [];
    }
}
