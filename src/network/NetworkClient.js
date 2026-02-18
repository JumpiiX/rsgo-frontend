export class NetworkClient {
    constructor() {
        this.ws = null;
        this.playerId = null;
        this.connected = false;
        this.onPlayerJoinedCallback = null;
        this.onPlayerLeftCallback = null;
        this.onPlayerMovedCallback = null;
        this.onPlayerShotCallback = null;
        this.onPlayerHitCallback = null;
        this.onPlayerDiedCallback = null;
        this.onPlayerRespawnedCallback = null;
    }

    connect() {
        this.ws = new WebSocket('ws://localhost:8080');
        
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
                break;
                
            case 'player_joined':
                if (this.onPlayerJoinedCallback && message.player.id !== this.playerId) {
                    this.onPlayerJoinedCallback(message.player);
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
            console.log('Sending position to server:', position.x.toFixed(1), position.y.toFixed(1), position.z.toFixed(1));
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
}