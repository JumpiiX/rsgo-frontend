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
        const wsUrl = window.location.hostname === 'localhost'
            ? 'ws://localhost:6969'
            : `ws://${window.location.hostname}:6969`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.connected = true;
        };

        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
        };

        this.ws.onclose = () => {
            this.connected = false;
            setTimeout(() => this.connect(), 3000);
        };

        this.ws.onerror = (error) => {
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
                console.log('Received player movement:', message.player_id, 'at', message.x.toFixed(1), message.y.toFixed(1), message.z.toFixed(1));
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
        if (this.isConnected()) {
            this.send({
                type: 'create_team_lobby',
                name: playerName
            });
        }
    }

    joinTeam(team) {
        if (this.isConnected()) {
            this.send({
                type: 'join_team',
                team: team
            });
        }
    }

    startTeamGame() {
        if (this.isConnected()) {
            this.send({
                type: 'start_team_game'
            });
        }
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
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
