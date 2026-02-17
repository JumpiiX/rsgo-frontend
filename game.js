import * as THREE from 'three';

class Game {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = {
            forward: false,
            backward: false,
            left: false,
            right: false
        };
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.moveSpeed = 30;
        this.lookSpeed = 0.002;
        this.health = 100;
        this.isPointerLocked = false;
        this.ws = null;
        this.playerId = null;
        this.playerName = '';
        this.otherPlayers = new Map();
        this.spawnPoints = [
            { x: 0, y: 10, z: 0 },
            { x: 40, y: 10, z: 40 },
            { x: -40, y: 10, z: -40 }
        ];
        this.gameStarted = false;
        
        this.setupNameScreen();
    }

    init() {
        this.setupRenderer();
        this.setupScene();
        this.setupCamera();
        this.setupLights();
        this.setupMap();
        this.setupControls();
        this.setupPointerLock();
        this.connectToServer();
        this.animate();
        
        console.log('Game initialized!');
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x0a0a0a); // Dark background
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.getElementById('gameContainer').appendChild(this.renderer.domElement);
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x1a1a1a, 200, 800); // Dark fog
    }

    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 10, 0);
    }

    setupLights() {
        this.createAmbientLighting();
        this.createMoonlight();
        this.createStreetLights();
        this.createWindowLights();
    }

    createAmbientLighting() {
        // Ambient moonlight
        const ambientLight = new THREE.AmbientLight(0x4d5f8f, 0.4);
        this.scene.add(ambientLight);
    }

    createMoonlight() {
        // Strong moonlight from above
        const moonLight = new THREE.DirectionalLight(0xa8b5d1, 0.8);
        moonLight.position.set(-100, 200, 50);
        moonLight.castShadow = true;
        moonLight.shadow.mapSize.width = 4096;
        moonLight.shadow.mapSize.height = 4096;
        moonLight.shadow.camera.left = -300;
        moonLight.shadow.camera.right = 300;
        moonLight.shadow.camera.top = 300;
        moonLight.shadow.camera.bottom = -300;
        moonLight.shadow.camera.near = 1;
        moonLight.shadow.camera.far = 500;
        this.scene.add(moonLight);
    }

    createStreetLights() {
        // Street lamps with warm orange glow
        const streetLightPositions = [
            [-60, 25, -80], [60, 25, 80], [-100, 25, 40], 
            [100, 25, -40], [0, 25, 120], [0, 25, -120]
        ];

        streetLightPositions.forEach(pos => {
            const streetLight = new THREE.PointLight(0xff8833, 0.8, 80);
            streetLight.position.set(...pos);
            streetLight.castShadow = true;
            this.scene.add(streetLight);

            // Light pole
            const poleGeometry = new THREE.CylinderGeometry(0.5, 0.5, 25);
            const poleMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
            const pole = new THREE.Mesh(poleGeometry, poleMaterial);
            pole.position.set(pos[0], 12.5, pos[2]);
            pole.castShadow = true;
            this.scene.add(pole);
        });
    }

    createWindowLights() {
        // Building window lights (blue/white glow)
        const windowLights = [
            [0, 15, 0], [-80, 12, -60], [80, 12, 60],
            [-150, 12, -150], [150, 12, 150]
        ];

        windowLights.forEach(pos => {
            const windowLight = new THREE.PointLight(0x66aaff, 0.6, 50);
            windowLight.position.set(...pos);
            this.scene.add(windowLight);
        });
    }

    setupMap() {
        this.createGround();
        this.createMapBoundaries();
        this.createCityBlocks();
        this.createStreets();
        this.createHidingSpots();
        this.createDecorations();
    }

    createMaterials() {
        return {
            ground: new THREE.MeshLambertMaterial({ color: 0x2a2a2a }),
            wall: new THREE.MeshLambertMaterial({ color: 0x3d3d3d }),
            building: new THREE.MeshLambertMaterial({ color: 0x2f2f2f }),
            darkBuilding: new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
            crate: new THREE.MeshLambertMaterial({ color: 0x4a4a4a }),
            window: new THREE.MeshLambertMaterial({ color: 0x1a3366, transparent: true, opacity: 0.8 }),
            street: new THREE.MeshLambertMaterial({ color: 0x1f1f1f })
        };
    }

    createGround() {
        const materials = this.createMaterials();
        const groundGeometry = new THREE.PlaneGeometry(400, 400);
        const ground = new THREE.Mesh(groundGeometry, materials.ground);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }

    createMapBoundaries() {
        const materials = this.createMaterials();
        const walls = [
            { pos: [0, 12.5, -200], size: [400, 25, 4] },
            { pos: [0, 12.5, 200], size: [400, 25, 4] },
            { pos: [-200, 12.5, 0], size: [4, 25, 400] },
            { pos: [200, 12.5, 0], size: [4, 25, 400] }
        ];

        walls.forEach(wall => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(...wall.size), materials.wall);
            mesh.position.set(...wall.pos);
            mesh.castShadow = true;
            this.scene.add(mesh);
        });
    }

    createCityBlocks() {
        const materials = this.createMaterials();
        
        // Main city blocks with alleyways
        const cityBlocks = [
            // Central plaza area
            { pos: [0, 8, 0], size: [40, 16, 30], type: 'building' },
            
            // Residential blocks (with gaps for streets)
            { pos: [-120, 15, -120], size: [60, 30, 40], type: 'darkBuilding' },
            { pos: [120, 15, 120], size: [60, 30, 40], type: 'darkBuilding' },
            { pos: [-120, 12, 80], size: [50, 24, 35], type: 'building' },
            { pos: [120, 12, -80], size: [50, 24, 35], type: 'building' },
            
            // Smaller buildings
            { pos: [-80, 10, -40], size: [30, 20, 25], type: 'building' },
            { pos: [80, 10, 40], size: [30, 20, 25], type: 'building' },
            { pos: [-40, 8, -100], size: [25, 16, 20], type: 'darkBuilding' },
            { pos: [40, 8, 100], size: [25, 16, 20], type: 'darkBuilding' },
            
            // Industrial buildings
            { pos: [-160, 18, 0], size: [35, 36, 60], type: 'darkBuilding' },
            { pos: [160, 18, 0], size: [35, 36, 60], type: 'darkBuilding' },
        ];

        cityBlocks.forEach(block => {
            const building = new THREE.Mesh(
                new THREE.BoxGeometry(...block.size), 
                materials[block.type]
            );
            building.position.set(...block.pos);
            building.castShadow = true;
            this.scene.add(building);

            // Add windows to taller buildings
            if (block.size[1] > 15) {
                this.addWindows(block.pos, block.size, materials);
            }
        });
    }

    addWindows(buildingPos, buildingSize, materials) {
        const windowsPerFloor = Math.floor(buildingSize[0] / 8);
        const floors = Math.floor(buildingSize[1] / 6);

        for (let floor = 1; floor < floors; floor++) {
            for (let win = 0; win < windowsPerFloor; win++) {
                // Front windows
                const windowFront = new THREE.Mesh(
                    new THREE.BoxGeometry(2, 2, 0.2),
                    materials.window
                );
                windowFront.position.set(
                    buildingPos[0] - buildingSize[0]/2 + win * 8 + 4,
                    buildingPos[1] - buildingSize[1]/2 + floor * 6,
                    buildingPos[2] + buildingSize[2]/2 + 0.1
                );
                this.scene.add(windowFront);
            }
        }
    }

    createStreets() {
        const materials = this.createMaterials();
        
        // Main cross streets
        const streets = [
            { pos: [0, 0.1, 0], size: [400, 0.2, 15] }, // Main horizontal street
            { pos: [0, 0.1, 0], size: [15, 0.2, 400] }, // Main vertical street
            { pos: [-120, 0.1, 0], size: [10, 0.2, 200] }, // Side street
            { pos: [120, 0.1, 0], size: [10, 0.2, 200] }, // Side street
            { pos: [0, 0.1, 120], size: [200, 0.2, 10] }, // Cross street
            { pos: [0, 0.1, -120], size: [200, 0.2, 10] }, // Cross street
        ];

        streets.forEach(street => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(...street.size), materials.street);
            mesh.position.set(...street.pos);
            mesh.receiveShadow = true;
            this.scene.add(mesh);
        });
    }

    createHidingSpots() {
        const materials = this.createMaterials();
        
        // Tactical cover spots
        const covers = [
            // Dumpsters in alleys
            { pos: [-60, 2, -80], size: [6, 4, 4], type: 'crate' },
            { pos: [60, 2, 80], size: [6, 4, 4], type: 'crate' },
            
            // Car wrecks on streets
            { pos: [25, 2, -15], size: [8, 4, 3], type: 'crate' },
            { pos: [-25, 2, 15], size: [8, 4, 3], type: 'crate' },
            
            // Shipping containers
            { pos: [140, 4, -140], size: [15, 8, 6], type: 'crate' },
            { pos: [-140, 4, 140], size: [15, 8, 6], type: 'crate' },
            
            // Small kiosks/stands
            { pos: [70, 3, -70], size: [4, 6, 4], type: 'building' },
            { pos: [-70, 3, 70], size: [4, 6, 4], type: 'building' },
            
            // Corner barriers
            { pos: [90, 1.5, -90], size: [3, 3, 12], type: 'wall' },
            { pos: [-90, 1.5, 90], size: [3, 3, 12], type: 'wall' },
        ];

        covers.forEach(cover => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(...cover.size), materials[cover.type]);
            mesh.position.set(...cover.pos);
            mesh.castShadow = true;
            this.scene.add(mesh);
        });
    }

    createDecorations() {
        const materials = this.createMaterials();
        
        // Add some atmosphere objects
        // Fire barrels (with point lights)
        const fireBarrels = [
            [-30, 3, -30], [30, 3, 30], [-100, 3, 0], [100, 3, 0]
        ];

        fireBarrels.forEach(pos => {
            const barrel = new THREE.Mesh(
                new THREE.CylinderGeometry(1.5, 1.5, 6),
                new THREE.MeshLambertMaterial({ color: 0x8B4513 })
            );
            barrel.position.set(...pos);
            barrel.castShadow = true;
            this.scene.add(barrel);

            // Fire light
            const fireLight = new THREE.PointLight(0xff4400, 0.7, 30);
            fireLight.position.set(pos[0], pos[1] + 4, pos[2]);
            this.scene.add(fireLight);
        });

        // Antenna/radio towers
        const towers = [
            [-170, 40, -170], [170, 40, 170]
        ];

        towers.forEach(pos => {
            const tower = new THREE.Mesh(
                new THREE.CylinderGeometry(0.3, 0.3, 80),
                new THREE.MeshLambertMaterial({ color: 0x666666 })
            );
            tower.position.set(pos[0], pos[1], pos[2]);
            tower.castShadow = true;
            this.scene.add(tower);

            // Blinking tower light
            const towerLight = new THREE.PointLight(0xff0000, 0.8, 100);
            towerLight.position.set(pos[0], pos[1] + 35, pos[2]);
            this.scene.add(towerLight);
        });
    }

    setupControls() {
        document.addEventListener('keydown', (event) => {
            switch(event.code) {
                case 'KeyW':
                    this.controls.forward = true;
                    break;
                case 'KeyS':
                    this.controls.backward = true;
                    break;
                case 'KeyA':
                    this.controls.left = true;
                    break;
                case 'KeyD':
                    this.controls.right = true;
                    break;
                case 'Escape':
                    document.exitPointerLock();
                    break;
            }
        });

        document.addEventListener('keyup', (event) => {
            switch(event.code) {
                case 'KeyW':
                    this.controls.forward = false;
                    break;
                case 'KeyS':
                    this.controls.backward = false;
                    break;
                case 'KeyA':
                    this.controls.left = false;
                    break;
                case 'KeyD':
                    this.controls.right = false;
                    break;
            }
        });

        document.addEventListener('mousemove', (event) => {
            if (this.isPointerLocked) {
                const movementX = event.movementX || 0;
                const movementY = event.movementY || 0;

                // Simple mouse look - just rotate camera directly
                // Left/right mouse = rotate around Y axis (horizontal)
                this.camera.rotation.y -= movementX * this.lookSpeed;
                
                // Up/down mouse = rotate around X axis (vertical) - INVERTED for FPS feel
                this.camera.rotation.x -= movementY * this.lookSpeed;
                
                // Prevent flipping upside down
                this.camera.rotation.x = Math.max(-1.5, Math.min(1.5, this.camera.rotation.x));
            }
        });

        document.addEventListener('click', () => {
            if (this.isPointerLocked) {
                this.shoot();
            } else {
                this.renderer.domElement.requestPointerLock();
            }
        });

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    setupPointerLock() {
        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = document.pointerLockElement === this.renderer.domElement;
        });
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
            this.init();
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.sendJoinMessage();
            }
        }
    }

    connectToServer() {
        this.ws = new WebSocket('ws://localhost:8080');
        
        this.ws.onopen = () => {
            console.log('Connected to server');
            if (this.gameStarted && this.playerName) {
                this.sendJoinMessage();
            }
        };
        
        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleServerMessage(message);
        };
        
        this.ws.onclose = () => {
            console.log('Disconnected from server');
            setTimeout(() => this.connectToServer(), 3000);
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    sendJoinMessage() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'join',
                name: this.playerName
            }));
        }
    }

    handleServerMessage(message) {
        switch (message.type) {
            case 'welcome':
                this.playerId = message.player_id;
                console.log('Assigned player ID:', this.playerId);
                break;
                
            case 'player_joined':
                this.addOtherPlayer(message.player);
                this.updatePlayerCount();
                break;
                
            case 'player_left':
                this.removeOtherPlayer(message.player_id);
                this.updatePlayerCount();
                break;
                
            case 'player_moved':
                this.updateOtherPlayer(message);
                break;
                
            case 'player_shot':
                console.log('Player', message.shooter_id, 'shot!');
                break;
        }
    }

    addOtherPlayer(player) {
        if (player.id === this.playerId) return;
        
        const geometry = new THREE.CapsuleGeometry(1, 4, 4, 8);
        const material = new THREE.MeshLambertMaterial({ color: 0xff4444 });
        const playerMesh = new THREE.Mesh(geometry, material);
        
        playerMesh.position.set(player.x, player.y, player.z);
        playerMesh.castShadow = true;
        
        const nameSprite = this.createNameSprite(player.name);
        nameSprite.position.set(0, 3, 0);
        playerMesh.add(nameSprite);
        
        this.scene.add(playerMesh);
        this.otherPlayers.set(player.id, {
            mesh: playerMesh,
            data: player
        });
        
        console.log('Added player:', player.name);
    }

    removeOtherPlayer(playerId) {
        const player = this.otherPlayers.get(playerId);
        if (player) {
            this.scene.remove(player.mesh);
            this.otherPlayers.delete(playerId);
        }
    }

    updateOtherPlayer(message) {
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
        document.getElementById('playerCount').textContent = this.otherPlayers.size + 1;
    }

    sendPositionUpdate() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.gameStarted) {
            this.ws.send(JSON.stringify({
                type: 'move',
                x: this.camera.position.x,
                y: this.camera.position.y,
                z: this.camera.position.z,
                rotation_x: this.camera.rotation.x,
                rotation_y: this.camera.rotation.y
            }));
        }
    }

    updateMovement(deltaTime) {
        if (!this.gameStarted) return;
        
        // Simplified movement - direct control
        const moveVector = new THREE.Vector3();
        
        // Get camera direction vectors
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0; // Keep movement on ground plane
        forward.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
        right.normalize();

        // Apply WASD movement
        if (this.controls.forward) {
            moveVector.addScaledVector(forward, this.moveSpeed * deltaTime);
        }
        if (this.controls.backward) {
            moveVector.addScaledVector(forward, -this.moveSpeed * deltaTime);
        }
        if (this.controls.right) {
            moveVector.addScaledVector(right, this.moveSpeed * deltaTime);
        }
        if (this.controls.left) {
            moveVector.addScaledVector(right, -this.moveSpeed * deltaTime);
        }

        // Boundary check (keep player inside the bigger arena)
        const newPos = this.camera.position.clone().add(moveVector);
        if (Math.abs(newPos.x) < 195 && Math.abs(newPos.z) < 195) {
            this.camera.position.add(moveVector);
            
            // Only send position update if we actually moved
            if (moveVector.length() > 0.01) {
                this.sendPositionUpdate();
            }
        }
    }

    shoot() {
        console.log('Bang! Shot fired at', this.camera.position);
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const forward = new THREE.Vector3();
            this.camera.getWorldDirection(forward);
            const target = this.camera.position.clone().add(forward.multiplyScalar(100));
            
            this.ws.send(JSON.stringify({
                type: 'shoot',
                target_x: target.x,
                target_y: target.y,
                target_z: target.z
            }));
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        if (this.gameStarted) {
            const deltaTime = 0.016; // ~60fps
            this.updateMovement(deltaTime);
            this.renderer.render(this.scene, this.camera);
        }
    }

    spawnPlayer() {
        const spawnIndex = this.otherPlayers.size % this.spawnPoints.length;
        const spawn = this.spawnPoints[spawnIndex];
        this.camera.position.set(spawn.x, spawn.y, spawn.z);
    }
}

// Start the game
const game = new Game();

// Add spawn logic after joining
document.addEventListener('DOMContentLoaded', () => {
    const originalStartGame = game.startGame.bind(game);
    game.startGame = function() {
        originalStartGame();
        this.spawnPlayer();
    };
});