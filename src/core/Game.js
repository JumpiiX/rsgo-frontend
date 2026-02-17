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
        
        this.setupNameScreen();
    }

    async initialize() {
        this.renderer = new Renderer();
        this.scene = new Scene();
        this.camera = new Camera();
        this.lighting = new LightingSystem(this.scene.getScene());
        this.mapBuilder = new MapBuilder(this.scene.getScene());
        this.input = new InputManager();
        this.network = new NetworkClient();
        this.playerManager = new PlayerManager(this.scene.getScene());
        this.bulletSystem = new BulletSystem(this.scene.getScene());
        this.collisionSystem = new CollisionSystem(this.scene.getScene());

        // Add renderer canvas to DOM
        document.getElementById('gameContainer').appendChild(this.renderer.getRenderer().domElement);

        this.setupSystems();
        this.animate();
    }

    setupSystems() {
        this.lighting.setupLights();
        this.mapBuilder.buildMap();
        this.collisionSystem.setupBuildingColliders();
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
        if (this.network && this.gameStarted) {
            this.network.sendMove(position, rotation);
        }
    }

    handleShoot() {
        if (this.network && this.gameStarted) {
            const forward = new THREE.Vector3();
            this.camera.getCamera().getWorldDirection(forward);
            const startPos = this.camera.getPosition().clone();
            const target = startPos.clone().add(forward.multiplyScalar(100));
            
            this.bulletSystem.createBullet(startPos, target, true);
            
            this.checkHit(target);
            this.network.sendShoot(target);
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
        
        this.playerManager.otherPlayers.forEach((player, playerId) => {
            const playerPos = player.mesh.position;
            const distanceToPlayer = playerPosition.distanceTo(playerPos);
            
            if (distanceToPlayer <= 100) {
                const directionToPlayer = new THREE.Vector3().subVectors(playerPos, playerPosition).normalize();
                const dot = shootDirection.dot(directionToPlayer);
                
                if (dot > 0.95 && distanceToPlayer <= 5) {
                    const killed = this.playerManager.hitPlayer(playerId);
                    if (this.network) {
                        this.network.sendHit(playerId, killed);
                    }
                }
            }
        });
    }

    handlePlayerHit(message) {
        // Visual feedback could be added here (red flash, etc.)
    }

    handlePlayerDied(message) {
        this.playerManager.killPlayer(message.player_id);
    }

    handlePlayerRespawned(message) {
        this.playerManager.addPlayer(message.player);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        if (this.gameStarted) {
            const deltaTime = 0.016; // ~60fps
            this.input.updateMovement(deltaTime, this.camera);
            this.bulletSystem.update(deltaTime);
            this.renderer.render(this.scene.getScene(), this.camera.getCamera());
        }
    }
}