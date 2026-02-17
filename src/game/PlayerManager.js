export class PlayerManager {
    constructor(scene) {
        this.scene = scene;
        this.otherPlayers = new Map();
        this.playerHealth = new Map();
        this.respawning = new Map();
    }

    addPlayer(player) {
        if (this.otherPlayers.has(player.id)) {
            return;
        }
        
        // Create a simple colored cube for other players
        const geometry = new THREE.CapsuleGeometry(1, 4, 4, 8);
        const material = new THREE.MeshLambertMaterial({ color: 0xff4444 });
        const playerMesh = new THREE.Mesh(geometry, material);
        
        playerMesh.position.set(player.x, player.y, player.z);
        playerMesh.castShadow = true;
        
        // Add a simple name label above the player
        const nameSprite = this.createNameSprite(player.name);
        nameSprite.position.set(0, 3, 0);
        playerMesh.add(nameSprite);
        
        this.scene.add(playerMesh);
        this.otherPlayers.set(player.id, {
            mesh: playerMesh,
            data: player
        });
        
        this.playerHealth.set(player.id, 5);
        
        this.updatePlayerCount();
    }

    removePlayer(playerId) {
        const player = this.otherPlayers.get(playerId);
        if (player) {
            this.scene.remove(player.mesh);
            this.otherPlayers.delete(playerId);
        }
        this.playerHealth.delete(playerId);
        this.respawning.delete(playerId);
        this.updatePlayerCount();
    }

    updatePlayer(message) {
        const player = this.otherPlayers.get(message.player_id);
        if (player) {
            player.mesh.position.set(message.x, message.y, message.z);
            player.mesh.rotation.y = message.rotation_y;
        }
    }

    createNameSprite(name) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        
        context.fillStyle = 'rgba(0, 0, 0, 0.8)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        context.fillStyle = 'white';
        context.font = '24px Arial';
        context.textAlign = 'center';
        context.fillText(name, canvas.width / 2, canvas.height / 2 + 8);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(4, 1, 1);
        
        return sprite;
    }

    updatePlayerCount() {
        const playerCountElement = document.getElementById('playerCount');
        if (playerCountElement) {
            playerCountElement.textContent = this.otherPlayers.size + 1;
        }
    }

    getPlayerCount() {
        return this.otherPlayers.size + 1;
    }

    hitPlayer(playerId) {
        if (this.playerHealth.has(playerId)) {
            const currentHealth = this.playerHealth.get(playerId);
            const newHealth = currentHealth - 1;
            this.playerHealth.set(playerId, newHealth);
            
            if (newHealth <= 0) {
                this.killPlayer(playerId);
                return true;
            }
        }
        return false;
    }

    killPlayer(playerId) {
        const player = this.otherPlayers.get(playerId);
        if (player && !this.respawning.has(playerId)) {
            player.mesh.visible = false;
            this.respawning.set(playerId, true);
            
            setTimeout(() => {
                this.respawnPlayer(playerId);
            }, 5000);
        }
    }

    respawnPlayer(playerId) {
        const player = this.otherPlayers.get(playerId);
        if (player) {
            player.mesh.visible = true;
            this.playerHealth.set(playerId, 5);
            this.respawning.delete(playerId);
        }
    }
}