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

        console.log('Adding new player:', player.id, player.name, 'at position', player.x, player.y, player.z);

        
        
        const geometry = new THREE.CapsuleGeometry(2, 5, 4, 8);
        const material = new THREE.MeshLambertMaterial({
            color: 0xff4444,  
            emissive: 0x880000,
            emissiveIntensity: 0.3
        });
        const playerMesh = new THREE.Mesh(geometry, material);

        playerMesh.position.set(player.x, player.y, player.z);
        playerMesh.castShadow = true;

        
        const nameSprite = this.createNameSprite(player.name);
        nameSprite.position.set(0, 6, 0); // Moved higher above player  
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
            console.log('Updating player', message.player_id, 'position to', message.x.toFixed(1), message.y.toFixed(1), message.z.toFixed(1));
            player.mesh.position.set(message.x, message.y, message.z);
            player.mesh.rotation.y = message.rotation_y;
        } else {
            console.log('Player not found in otherPlayers map:', message.player_id);
        }
    }

    createNameSprite(name) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;

        // Semi-transparent dark background
        context.fillStyle = 'rgba(0, 0, 0, 0.6)';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // White text with thick shadow
        context.fillStyle = 'white';
        context.font = 'bold 36px Arial';
        context.textAlign = 'center';
        context.strokeStyle = 'black';
        context.lineWidth = 6;
        context.strokeText(name, canvas.width / 2, canvas.height / 2 + 12);
        context.fillText(name, canvas.width / 2, canvas.height / 2 + 12);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(6, 1.5, 1);

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
            
            const impactsToRemove = [];
            player.mesh.traverse((child) => {
                if (child.userData && child.userData.isPlayerImpact) {
                    impactsToRemove.push(child);
                }
            });
            impactsToRemove.forEach(impact => {
                player.mesh.remove(impact);
            });

            // Remove player completely from scene instead of just hiding
            this.scene.remove(player.mesh);
            this.otherPlayers.delete(playerId);
            this.playerHealth.delete(playerId);
            this.respawning.set(playerId, true);
            this.updatePlayerCount();
        }
    }

    respawnPlayer(player) {
        // Re-add the player to the scene since they were completely removed on death
        this.addPlayer(player);
        this.respawning.delete(player.id);
    }
}
