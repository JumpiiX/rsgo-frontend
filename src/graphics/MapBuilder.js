import { MaterialManager } from '../utils/MaterialManager.js';

export class MapBuilder {
    constructor(scene, collisionSystem = null) {
        this.scene = scene;
        this.collisionSystem = collisionSystem;
        this.materials = new MaterialManager();
    }

    buildMap(mapType = 'city') {
        console.log('🗺️ MapBuilder.buildMap called with type:', mapType);
        if (mapType === 'orangePlanet') {
            console.log('✅ Building orange planet map');
            this.buildOrangePlanetMap();
        } else {
            console.log('❌ Building city map - THIS SHOULD NOT HAPPEN IN MAP BUILDER MODE');
            // DISABLED: Original city map
            // this.createGround();
            // this.createMapBoundaries();
            // this.createCityBlocks();
            // this.createStreets();
            // this.createVehicles();
            // this.createTrees();
            // this.createHidingSpots();
            // this.createCityProps();
            // this.createDecorations();
        }
    }
    
    buildOrangePlanetMap() {
        console.log('Building Clean Flat Orange Planet Map...');
        this.createVariedOrangeTerrain();
        this.createTeamSpawnZones();
        this.createBombSites();
    }
    
    createOrangePlanetGround() {
        // Create larger circular orange ground
        const groundGeometry = new THREE.CircleGeometry(500, 128); // Increased from 300 to 500
        
        // Orange planet material
        const orangeMaterial = new THREE.MeshLambertMaterial({
            color: 0xff6b35,
            transparent: true,
            opacity: 0.9
        });
        
        const ground = new THREE.Mesh(groundGeometry, orangeMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        ground.position.y = -2;
        this.scene.add(ground);
        
        // Add many more texture spots for bigger map
        for (let i = 0; i < 40; i++) {
            const spotGeometry = new THREE.CircleGeometry(Math.random() * 30 + 15, 16);
            const spotMaterial = new THREE.MeshLambertMaterial({
                color: new THREE.Color().setHSL(0.08, 0.8, Math.random() * 0.4 + 0.2),
                transparent: true,
                opacity: 0.6
            });
            
            const spot = new THREE.Mesh(spotGeometry, spotMaterial);
            spot.rotation.x = -Math.PI / 2;
            spot.position.x = (Math.random() - 0.5) * 900;
            spot.position.z = (Math.random() - 0.5) * 900;
            spot.position.y = -1.5;
            this.scene.add(spot);
        }
    }
    
    createPlanetBoundaries() {
        // Store map radius for boundary checking - no visible boundaries
        this.mapRadius = 900;
    }
    
    createOrangeHouses() {
        // More houses for bigger map
        const housePositions = [
            // Center area houses
            { x: 80, z: 80, rotation: 0 },
            { x: -120, z: 100, rotation: Math.PI/4 },
            { x: 150, z: -80, rotation: Math.PI/2 },
            { x: -90, z: -140, rotation: Math.PI },
            { x: 0, z: 160, rotation: -Math.PI/3 },
            { x: -180, z: 0, rotation: Math.PI/6 },
            { x: 120, z: -150, rotation: -Math.PI/4 },
            
            // Outer ring houses
            { x: 280, z: 200, rotation: Math.PI/3 },
            { x: -250, z: 220, rotation: -Math.PI/4 },
            { x: 300, z: -180, rotation: Math.PI/6 },
            { x: -280, z: -200, rotation: Math.PI },
            { x: 200, z: 300, rotation: -Math.PI/2 },
            { x: -220, z: -280, rotation: Math.PI/4 },
            { x: -300, z: 150, rotation: -Math.PI/3 },
            { x: 250, z: -250, rotation: Math.PI/2 },
            
            // Mid-range scattered houses
            { x: 60, z: -200, rotation: Math.PI/8 },
            { x: -150, z: 180, rotation: -Math.PI/8 },
            { x: 180, z: 60, rotation: 3*Math.PI/4 },
            { x: -80, z: -180, rotation: Math.PI/5 },
            { x: 220, z: -100, rotation: -Math.PI/6 }
        ];
        
        housePositions.forEach(pos => {
            this.createPlanetHouse(pos.x, pos.z, pos.rotation);
        });
    }
    
    createPlanetHouse(x, z, rotation) {
        const group = new THREE.Group();
        
        // Base
        const baseGeometry = new THREE.BoxGeometry(25, 20, 25);
        const baseMaterial = new THREE.MeshLambertMaterial({ color: 0xd84315 });
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.y = 10;
        base.castShadow = true;
        group.add(base);
        
        // Roof
        const roofGeometry = new THREE.ConeGeometry(18, 12, 4);
        const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x8b1600 });
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.y = 26;
        roof.rotation.y = Math.PI/4;
        roof.castShadow = true;
        group.add(roof);
        
        // Door
        const doorGeometry = new THREE.BoxGeometry(6, 15, 1);
        const doorMaterial = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });
        const door = new THREE.Mesh(doorGeometry, doorMaterial);
        door.position.set(0, 7.5, 12.8);
        group.add(door);
        
        group.position.set(x, 0, z);
        group.rotation.y = rotation;
        this.scene.add(group);
        
        // Add collision
        if (this.collisionSystem) {
            this.collisionSystem.addBoxCollider(
                { x: x, y: 10, z: z },
                { x: 25, y: 20, z: 25 }
            );
        }
    }
    
    createPlanetRocks() {
        // No rocks for clean map
    }
    
    createBoulderClusters() {
        // No boulder clusters for clean map
    }
    
    createCraters() {
        // More craters for bigger map
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 350 + 100;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            
            const craterSize = Math.random() * 15 + 10;
            const craterGeometry = new THREE.RingGeometry(craterSize, craterSize + 8, 16);
            const craterMaterial = new THREE.MeshLambertMaterial({ 
                color: 0x440b00,
                transparent: true,
                opacity: 0.7
            });
            
            const crater = new THREE.Mesh(craterGeometry, craterMaterial);
            crater.rotation.x = -Math.PI / 2;
            crater.position.set(x, -1, z);
            this.scene.add(crater);
        }
        
        // Add some deep crater pits
        this.createDeepCraters();
    }
    
    createDeepCraters() {
        const deepCraterPositions = [
            { x: 100, z: -200 },
            { x: -150, z: 150 },
            { x: 250, z: 100 },
            { x: -200, z: -100 }
        ];
        
        deepCraterPositions.forEach(pos => {
            // Create crater rim
            const rimGeometry = new THREE.RingGeometry(25, 35, 32);
            const rimMaterial = new THREE.MeshLambertMaterial({ 
                color: 0x8b1600,
                transparent: true,
                opacity: 0.8
            });
            
            const rim = new THREE.Mesh(rimGeometry, rimMaterial);
            rim.rotation.x = -Math.PI / 2;
            rim.position.set(pos.x, 1, pos.z);
            this.scene.add(rim);
            
            // Create crater center
            const centerGeometry = new THREE.CircleGeometry(25, 32);
            const centerMaterial = new THREE.MeshLambertMaterial({ 
                color: 0x220600,
                transparent: true,
                opacity: 0.9
            });
            
            const center = new THREE.Mesh(centerGeometry, centerMaterial);
            center.rotation.x = -Math.PI / 2;
            center.position.set(pos.x, -0.5, pos.z);
            this.scene.add(center);
        });
    }
    
    createTeamSpawnZones() {
        // Orange team spawn zone (moved further for bigger map)
        const orangeZoneGeometry = new THREE.CircleGeometry(40, 32);
        const orangeZoneMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff6b35,
            transparent: true,
            opacity: 0.4
        });
        const orangeZone = new THREE.Mesh(orangeZoneGeometry, orangeZoneMaterial);
        orangeZone.rotation.x = -Math.PI / 2;
        orangeZone.position.set(-350, 1, 0);
        this.scene.add(orangeZone);
        
        // Red team spawn zone (moved further for bigger map)
        const redZoneGeometry = new THREE.CircleGeometry(40, 32);
        const redZoneMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xdc3545,
            transparent: true,
            opacity: 0.4
        });
        const redZone = new THREE.Mesh(redZoneGeometry, redZoneMaterial);
        redZone.rotation.x = -Math.PI / 2;
        redZone.position.set(350, 1, 0);
        this.scene.add(redZone);
        
        // Store spawn positions - UPDATE TO MATCH
        this.spawnPositions = {
            orange: { x: -300, y: 10, z: 0 },
            red: { x: 300, y: 10, z: 0 }
        };
    }
    
    // Getter for map radius (for boundary checking)
    getMapRadius() {
        return this.mapRadius || 500;
    }
    
    // Getter for team spawn positions
    getSpawnPosition(team) {
        return this.spawnPositions ? this.spawnPositions[team] : { x: 0, y: 10, z: 0 };
    }

    createGround() {
        const groundGeometry = new THREE.PlaneGeometry(800, 800);
        const ground = new THREE.Mesh(groundGeometry, this.materials.get('ground'));
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }

    createMapBoundaries() {
        
        const walls = [
            
            { pos: [-200, 20, -380], size: [200, 40, 8] },
            { pos: [-50, 20, -350], size: [100, 40, 8] },
            { pos: [100, 20, -380], size: [200, 40, 8] },
            { pos: [250, 20, -320], size: [100, 40, 8] },

            
            { pos: [-150, 20, 380], size: [200, 40, 8] },
            { pos: [50, 20, 350], size: [150, 40, 8] },
            { pos: [200, 20, 380], size: [200, 40, 8] },

            
            { pos: [380, 20, -200], size: [8, 40, 200] },
            { pos: [350, 20, 0], size: [8, 40, 150] },
            { pos: [380, 20, 200], size: [8, 40, 200] },

            
            { pos: [-380, 20, -150], size: [8, 40, 200] },
            { pos: [-350, 20, 50], size: [8, 40, 200] },
            { pos: [-380, 20, 250], size: [8, 40, 150] },

            
            { pos: [-320, 20, -320], size: [80, 40, 80] },
            { pos: [320, 20, -280], size: [60, 40, 60] },
            { pos: [300, 20, 300], size: [80, 40, 80] },
            { pos: [-300, 20, 320], size: [60, 40, 60] }
        ];

        walls.forEach(wall => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(...wall.size), this.materials.get('wall'));
            mesh.position.set(...wall.pos);
            mesh.castShadow = true;
            this.scene.add(mesh);

            
            if (this.collisionSystem) {
                this.collisionSystem.addBoxCollider(
                    new THREE.Vector3(...wall.pos),
                    new THREE.Vector3(...wall.size),
                    'wall'
                );
            }
        });
    }

    createCityBlocks() {
        
        const cityBlocks = [
            
            { pos: [-180, 45, -250], size: [100, 90, 70], type: 'darkBuilding' }, 
            { pos: [-80, 20, -260], size: [50, 40, 50], type: 'building' },       
            { pos: [-140, 12, -180], size: [35, 24, 45], type: 'crate' },        
            { pos: [-220, 30, -200], size: [40, 60, 30], type: 'darkBuilding' }, 

            
            { pos: [-200, 18, -100], size: [25, 36, 100], type: 'darkBuilding' }, 
            { pos: [-250, 25, -50], size: [70, 50, 35], type: 'building' },      
            { pos: [-150, 35, -50], size: [30, 70, 30], type: 'darkBuilding' },  

            
            { pos: [0, 40, -100], size: [70, 80, 55], type: 'darkBuilding' },    
            { pos: [-50, 20, 0], size: [55, 40, 70], type: 'building' },         
            { pos: [50, 30, 0], size: [55, 60, 70], type: 'darkBuilding' },      
            { pos: [0, 15, -30], size: [100, 30, 20], type: 'building' },        

            
            { pos: [-30, 8, 100], size: [20, 16, 25], type: 'building' },
            { pos: [0, 10, 100], size: [25, 20, 25], type: 'darkBuilding' },
            { pos: [30, 7, 100], size: [20, 14, 25], type: 'crate' },
            { pos: [60, 9, 100], size: [18, 18, 25], type: 'building' },

            
            { pos: [200, 25, 250], size: [90, 50, 90], type: 'darkBuilding' },   
            { pos: [120, 30, 200], size: [50, 60, 35], type: 'building' },       
            { pos: [250, 15, 150], size: [35, 30, 70], type: 'crate' },         
            { pos: [150, 20, 280], size: [40, 40, 40], type: 'darkBuilding' },  

            
            { pos: [300, 50, 0], size: [70, 100, 60], type: 'darkBuilding' },   
            { pos: [250, 12, -100], size: [50, 24, 50], type: 'building' },     
            { pos: [280, 18, -50], size: [30, 36, 40], type: 'building' },      
            { pos: [320, 8, 100], size: [40, 16, 80], type: 'crate' },          

            
            { pos: [-300, 45, 0], size: [70, 90, 80], type: 'darkBuilding' },   
            { pos: [-250, 10, 100], size: [50, 20, 50], type: 'building' },     
            { pos: [-280, 25, -80], size: [35, 50, 35], type: 'darkBuilding' }, 
            { pos: [-320, 15, 50], size: [25, 30, 60], type: 'building' },      

            
            { pos: [-320, 60, -320], size: [35, 120, 35], type: 'darkBuilding' }, 
            { pos: [320, 40, 320], size: [45, 80, 45], type: 'darkBuilding' },    
            { pos: [320, 35, -320], size: [40, 70, 40], type: 'building' },       
            { pos: [-320, 45, 320], size: [38, 90, 38], type: 'darkBuilding' },   

            
            { pos: [150, 6, -150], size: [35, 12, 35], type: 'crate' },         
            { pos: [-150, 10, 150], size: [45, 20, 45], type: 'building' },     
            { pos: [180, 15, -200], size: [25, 30, 50], type: 'darkBuilding' }, 
            { pos: [-180, 12, 200], size: [40, 24, 30], type: 'building' },     

            
            { pos: [100, 18, -50], size: [30, 36, 25], type: 'building' },
            { pos: [-100, 22, 50], size: [35, 44, 30], type: 'darkBuilding' },
            { pos: [0, 25, -200], size: [80, 50, 20], type: 'darkBuilding' },
            { pos: [0, 8, 200], size: [60, 16, 35], type: 'crate' },
        ];

        cityBlocks.forEach(block => {
            const building = new THREE.Mesh(
                new THREE.BoxGeometry(...block.size),
                this.materials.get(block.type)
            );
            building.position.set(...block.pos);
            building.castShadow = true;
            this.scene.add(building);

            
            if (this.collisionSystem) {
                this.collisionSystem.addBoxCollider(
                    new THREE.Vector3(...block.pos),
                    new THREE.Vector3(...block.size),
                    'building'
                );
            }

            
            if (block.size[1] > 15) {
                this.addWindows(block.pos, block.size);
            }
        });
    }

    addWindows(buildingPos, buildingSize) {
        const windowsPerFloor = Math.floor(buildingSize[0] / 8);
        const floors = Math.floor(buildingSize[1] / 6);

        for (let floor = 1; floor < floors; floor++) {
            for (let win = 0; win < windowsPerFloor; win++) {
                
                const windowFront = new THREE.Mesh(
                    new THREE.BoxGeometry(2, 2, 0.2),
                    this.materials.get('window')
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
        
        const streets = [
            
            { pos: [0, 0.1, 0], size: [600, 0.2, 12] },      
            { pos: [0, 0.1, -150], size: [500, 0.2, 10] },   
            { pos: [0, 0.1, 150], size: [500, 0.2, 10] },    

            
            { pos: [-150, 0.1, 0], size: [10, 0.2, 600] },   
            { pos: [150, 0.1, 0], size: [10, 0.2, 600] },    
            { pos: [-75, 0.1, 0], size: [8, 0.2, 400] },     
            { pos: [75, 0.1, 0], size: [8, 0.2, 400] },      

            
            { pos: [-200, 0.1, -200], size: [150, 0.2, 8] }, 
            { pos: [200, 0.1, 200], size: [150, 0.2, 8] },   
            { pos: [-200, 0.1, 200], size: [8, 0.2, 150] },  
            { pos: [200, 0.1, -200], size: [8, 0.2, 150] },  

            
            { pos: [-250, 0.1, -50], size: [80, 0.2, 6] },
            { pos: [250, 0.1, 50], size: [80, 0.2, 6] },
            { pos: [50, 0.1, -250], size: [6, 0.2, 80] },
            { pos: [-50, 0.1, 250], size: [6, 0.2, 80] },

            
            { pos: [-180, 0.05, 100], size: [40, 0.1, 30] },
            { pos: [180, 0.05, -100], size: [40, 0.1, 30] },
            { pos: [0, 0.05, 50], size: [30, 0.1, 20] },
        ];

        streets.forEach(street => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(...street.size), this.materials.get('street'));
            mesh.position.set(...street.pos);
            mesh.receiveShadow = true;
            this.scene.add(mesh);
        });
    }

    createVehicles() {
        
        const vehicles = [
            
            { pos: [-100, 2, -20], rot: 0.2, type: 'car' },
            { pos: [120, 2, 30], rot: -0.5, type: 'car' },
            { pos: [-180, 2, 120], rot: 0, type: 'van' },
            { pos: [200, 2, -150], rot: 1.2, type: 'car' },
            { pos: [-50, 2, 180], rot: -0.3, type: 'car' },
            { pos: [80, 2, -200], rot: 0.8, type: 'van' },

            
            { pos: [-170, 2, 90], rot: 0, type: 'car' },
            { pos: [-190, 2, 90], rot: 0, type: 'car' },
            { pos: [-170, 2, 110], rot: 0, type: 'van' },
            { pos: [170, 2, -90], rot: 3.14, type: 'car' },
            { pos: [190, 2, -90], rot: 3.14, type: 'car' },
            { pos: [170, 2, -110], rot: 3.14, type: 'van' },

            
            { pos: [0, 2, -80], rot: 0.4, type: 'destroyed' },
            { pos: [-130, 2, 0], rot: -0.6, type: 'destroyed' },
            { pos: [150, 2, 50], rot: 1.0, type: 'destroyed' },

            
            { pos: [-250, 3, -100], rot: 1.57, type: 'truck' },
            { pos: [280, 3, 150], rot: -1.57, type: 'truck' },
            { pos: [50, 2, 250], rot: 0, type: 'van' },
        ];

        vehicles.forEach(vehicle => {
            let geometry, material;

            if (vehicle.type === 'car') {
                
                geometry = new THREE.BoxGeometry(8, 3, 4);
                material = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
            } else if (vehicle.type === 'van') {
                
                geometry = new THREE.BoxGeometry(10, 4, 4.5);
                material = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
            } else if (vehicle.type === 'truck') {
                
                geometry = new THREE.BoxGeometry(14, 5, 5);
                material = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });
            } else if (vehicle.type === 'destroyed') {
                
                geometry = new THREE.BoxGeometry(8, 2.5, 4);
                material = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
            }

            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(...vehicle.pos);
            mesh.rotation.y = vehicle.rot;
            mesh.castShadow = true;
            this.scene.add(mesh);

            
            if (vehicle.type !== 'destroyed') {
                const wheelGeometry = new THREE.CylinderGeometry(0.8, 0.8, 0.5, 8);
                const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x0a0a0a });
                const wheelPositions = [
                    [-2.5, -1, 1.5], [2.5, -1, 1.5],
                    [-2.5, -1, -1.5], [2.5, -1, -1.5]
                ];

                wheelPositions.forEach(wp => {
                    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
                    wheel.position.set(
                        vehicle.pos[0] + wp[0] * Math.cos(vehicle.rot) - wp[2] * Math.sin(vehicle.rot),
                        vehicle.pos[1] + wp[1],
                        vehicle.pos[2] + wp[0] * Math.sin(vehicle.rot) + wp[2] * Math.cos(vehicle.rot)
                    );
                    wheel.rotation.z = Math.PI / 2;
                    wheel.rotation.y = vehicle.rot;
                    this.scene.add(wheel);
                });
            }

            
            if (this.collisionSystem) {
                
                const vehicleSize = vehicle.type === 'bus' ?
                    new THREE.Vector3(10, 4, 25) :
                    new THREE.Vector3(8, 3, 15);

                this.collisionSystem.addBoxCollider(
                    new THREE.Vector3(vehicle.pos[0], vehicle.pos[1] + vehicleSize.y / 2, vehicle.pos[2]),
                    vehicleSize,
                    'vehicle'
                );
            }
        });
    }

    createTrees() {
        // No trees for clean map
    }

    createCityProps() {
        // No city props for clean map
    }

    createHidingSpots() {
        
        const covers = [
            
            { pos: [-180, 3, -220], size: [8, 6, 8], type: 'crate' },
            { pos: [-220, 3, -280], size: [12, 6, 8], type: 'crate' },
            { pos: [-150, 2, -250], size: [6, 4, 12], type: 'crate' },

            
            { pos: [0, 3, -150], size: [15, 6, 6], type: 'crate' },
            { pos: [-30, 2, -70], size: [8, 4, 8], type: 'crate' },
            { pos: [30, 2, -70], size: [8, 4, 8], type: 'crate' },

            
            { pos: [180, 3, 220], size: [8, 6, 8], type: 'crate' },
            { pos: [220, 3, 280], size: [12, 6, 8], type: 'crate' },
            { pos: [150, 2, 250], size: [6, 4, 12], type: 'crate' },

            
            { pos: [-100, 2, -150], size: [6, 4, 20], type: 'wall' },
            { pos: [-120, 2, -180], size: [20, 4, 6], type: 'wall' },

            
            { pos: [100, 2, 150], size: [6, 4, 20], type: 'wall' },
            { pos: [120, 2, 180], size: [20, 4, 6], type: 'wall' },

            
            { pos: [0, 4, 50], size: [100, 8, 4], type: 'wall' },
            { pos: [0, 4, -50], size: [100, 8, 4], type: 'wall' },

            
            { pos: [-320, 2, -320], size: [15, 4, 4], type: 'wall' },
            { pos: [320, 2, 320], size: [15, 4, 4], type: 'wall' },
            { pos: [320, 2, -320], size: [4, 4, 15], type: 'wall' },
            { pos: [-320, 2, 320], size: [4, 4, 15], type: 'wall' },

            
            { pos: [180, 3, -100], size: [10, 6, 10], type: 'crate' },
            { pos: [-180, 3, 100], size: [10, 6, 10], type: 'crate' },
            { pos: [250, 2, 0], size: [8, 4, 16], type: 'crate' },
            { pos: [-250, 2, 0], size: [8, 4, 16], type: 'crate' },

            
            { pos: [150, 2, -120], size: [12, 4, 4], type: 'wall' },
            { pos: [-150, 2, 120], size: [12, 4, 4], type: 'wall' },

            
            { pos: [80, 3, 0], size: [4, 6, 30], type: 'wall' },
            { pos: [-80, 3, 0], size: [4, 6, 30], type: 'wall' },
            { pos: [0, 3, 200], size: [60, 6, 4], type: 'wall' },
            { pos: [0, 3, -200], size: [60, 6, 4], type: 'wall' },
        ];

        covers.forEach(cover => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(...cover.size), this.materials.get(cover.type));
            mesh.position.set(...cover.pos);
            mesh.castShadow = true;
            this.scene.add(mesh);
        });
    }

    createDecorations() {
        // No decorations for clean map
    }

    createSpawnMarkers() {
        // No spawn markers for clean map
    }
    
    // Modern Orange Planet Map Functions
    createModernOrangePlanetGround() {
        // Create much larger circular orange ground - modern and spacious
        const groundGeometry = new THREE.CircleGeometry(800, 64); // Much bigger: 800 radius
        const groundMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xff6b35,  // Clean orange
            roughness: 0.8,
            metalness: 0.1
        });
        
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
        
        // Add subtle grid pattern
        this.addGridPattern();
    }
    
    addGridPattern() {
        // Minimalist grid lines for modern look
        const gridHelper = new THREE.GridHelper(1600, 40, 0xff4515, 0xff7850);
        gridHelper.position.y = 0.1;
        gridHelper.material.opacity = 0.3;
        gridHelper.material.transparent = true;
        this.scene.add(gridHelper);
    }
    
    createModernPlanetBoundaries() {
        // No boundaries - completely clean map
    }
    
    createModernStructures() {
        // Modern minimalist structures - fewer but bigger and cleaner
        const structures = [
            // Central command tower
            { pos: [0, 30, 0], size: [40, 60, 40], color: 0xd94d1a },
            
            // Corner platforms
            { pos: [300, 15, 300], size: [80, 30, 80], color: 0xcc3d17 },
            { pos: [-300, 15, -300], size: [80, 30, 80], color: 0xcc3d17 },
            { pos: [300, 15, -300], size: [80, 30, 80], color: 0xcc3d17 },
            { pos: [-300, 15, 300], size: [80, 30, 80], color: 0xcc3d17 },
            
            // Mid-range towers
            { pos: [200, 25, 0], size: [30, 50, 30], color: 0xe55a2b },
            { pos: [-200, 25, 0], size: [30, 50, 30], color: 0xe55a2b },
            { pos: [0, 25, 200], size: [30, 50, 30], color: 0xe55a2b },
            { pos: [0, 25, -200], size: [30, 50, 30], color: 0xe55a2b },
            
            // Outer ring structures
            { pos: [400, 12, 200], size: [25, 24, 60], color: 0xb8381a },
            { pos: [-400, 12, -200], size: [25, 24, 60], color: 0xb8381a },
            { pos: [400, 12, -200], size: [60, 24, 25], color: 0xb8381a },
            { pos: [-400, 12, 200], size: [60, 24, 25], color: 0xb8381a },
        ];
        
        structures.forEach(struct => {
            const geometry = new THREE.BoxGeometry(...struct.size);
            const material = new THREE.MeshLambertMaterial({ 
                color: struct.color,
                roughness: 0.4,
                metalness: 0.3
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(...struct.pos);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
            
            if (this.collisionSystem) {
                this.collisionSystem.addBoxCollider(...struct.pos, ...struct.size);
            }
        });
    }
    
    createMinimalistCover() {
        // Clean, modern cover objects scattered strategically
        const covers = [
            // Sleek barriers
            { pos: [150, 6, 150], size: [40, 12, 8], color: 0xa63318 },
            { pos: [-150, 6, -150], size: [40, 12, 8], color: 0xa63318 },
            { pos: [150, 6, -150], size: [8, 12, 40], color: 0xa63318 },
            { pos: [-150, 6, 150], size: [8, 12, 40], color: 0xa63318 },
            
            // Modern pillars
            { pos: [100, 8, 0], size: [12, 16, 12], color: 0xbf3c1b },
            { pos: [-100, 8, 0], size: [12, 16, 12], color: 0xbf3c1b },
            { pos: [0, 8, 100], size: [12, 16, 12], color: 0xbf3c1b },
            { pos: [0, 8, -100], size: [12, 16, 12], color: 0xbf3c1b },
            
            // Angular cover pieces
            { pos: [250, 5, 100], size: [20, 10, 40], color: 0x9e2f15 },
            { pos: [-250, 5, -100], size: [20, 10, 40], color: 0x9e2f15 },
            { pos: [100, 5, 250], size: [40, 10, 20], color: 0x9e2f15 },
            { pos: [-100, 5, -250], size: [40, 10, 20], color: 0x9e2f15 },
            
            // Scattered modern blocks
            { pos: [350, 4, 0], size: [15, 8, 15], color: 0x8b2a13 },
            { pos: [-350, 4, 0], size: [15, 8, 15], color: 0x8b2a13 },
            { pos: [0, 4, 350], size: [15, 8, 15], color: 0x8b2a13 },
            { pos: [0, 4, -350], size: [15, 8, 15], color: 0x8b2a13 },
        ];
        
        covers.forEach(cover => {
            const geometry = new THREE.BoxGeometry(...cover.size);
            const material = new THREE.MeshLambertMaterial({ 
                color: cover.color,
                roughness: 0.6,
                metalness: 0.2
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(...cover.pos);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
            
            if (this.collisionSystem) {
                this.collisionSystem.addBoxCollider(...cover.pos, ...cover.size);
            }
        });
    }
    
    createModernTeamSpawnZones() {
        // No spawn zone objects for clean map
        this.spawnPositions = {
            orange: { x: -400, y: 10, z: -400 },
            red: { x: 400, y: 10, z: 400 }
        };
        this.mapRadius = 800;
    }
    
    
    addAtmosphericElements() {
        // No atmospheric elements for clean map
    }
    
    // CS:GO Style Orange Planet Map Functions
    createVariedOrangeTerrain() {
        // Create rectangular orange ground - SMALLER MAP
        console.log('🕳️ Creating ground with hole for underground site...');
        
        const groundMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xff3300,  // True neon orange
            emissive: 0xff2200,
            emissiveIntensity: 0.3
        });
        
        // Create one simple rectangular ground - SMALLER
        const groundParts = [
            // Single ground piece - REDUCED SIZE
            { size: [1000, 600], position: [0, 0, 0] }
        ];
        
        groundParts.forEach(part => {
            const geometry = new THREE.PlaneGeometry(part.size[0], part.size[1]);
            const ground = new THREE.Mesh(geometry, groundMaterial);
            ground.rotation.x = -Math.PI / 2;
            ground.position.set(part.position[0], 0, part.position[2]);
            ground.receiveShadow = true;
            this.scene.add(ground);
            
            // ADD GROUND COLLISION for physics
            if (this.collisionSystem) {
                // Add invisible floor collision at y = -1
                this.collisionSystem.addBoxCollider(
                    new THREE.Vector3(part.position[0], -1, part.position[2]),
                    new THREE.Vector3(part.size[0], 2, part.size[1]),
                    'ground'
                );
            }
        });
        
        console.log('✅ Ground created with hole at bomb site A location');
        
        // Add high walls around the rectangular boundary
        this.createBoundaryWalls();
    }
    
    createBoundaryWalls() {
        // Create high walls around the rectangular map boundary
        const wallHeight = 80;
        const wallThickness = 20;
        
        // Orange wall material to match the ground
        const wallMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xcc2200,  // Slightly darker orange for walls
            emissive: 0x881100,
            emissiveIntensity: 0.2
        });
        
        // Wall dimensions (map is now 1000 x 600)
        const mapWidth = 1000;
        const mapDepth = 600;
        
        // North wall (far side)
        const northWall = new THREE.Mesh(
            new THREE.BoxGeometry(mapWidth + wallThickness * 2, wallHeight, wallThickness),
            wallMaterial
        );
        northWall.position.set(0, wallHeight / 2, -mapDepth / 2 - wallThickness / 2);
        northWall.castShadow = true;
        northWall.receiveShadow = true;
        this.scene.add(northWall);
        
        // South wall (near side)
        const southWall = new THREE.Mesh(
            new THREE.BoxGeometry(mapWidth + wallThickness * 2, wallHeight, wallThickness),
            wallMaterial
        );
        southWall.position.set(0, wallHeight / 2, mapDepth / 2 + wallThickness / 2);
        southWall.castShadow = true;
        southWall.receiveShadow = true;
        this.scene.add(southWall);
        
        // East wall (right side)
        const eastWall = new THREE.Mesh(
            new THREE.BoxGeometry(wallThickness, wallHeight, mapDepth),
            wallMaterial
        );
        eastWall.position.set(mapWidth / 2 + wallThickness / 2, wallHeight / 2, 0);
        eastWall.castShadow = true;
        eastWall.receiveShadow = true;
        this.scene.add(eastWall);
        
        // West wall (left side)
        const westWall = new THREE.Mesh(
            new THREE.BoxGeometry(wallThickness, wallHeight, mapDepth),
            wallMaterial
        );
        westWall.position.set(-mapWidth / 2 - wallThickness / 2, wallHeight / 2, 0);
        westWall.castShadow = true;
        westWall.receiveShadow = true;
        this.scene.add(westWall);
        
        // Add collision for ALL boundary walls
        if (this.collisionSystem) {
            // North wall collision
            this.collisionSystem.addBoxCollider(
                new THREE.Vector3(0, wallHeight / 2, -mapDepth / 2 - wallThickness / 2),
                new THREE.Vector3(mapWidth + wallThickness * 2, wallHeight, wallThickness),
                'wall'
            );
            // South wall collision
            this.collisionSystem.addBoxCollider(
                new THREE.Vector3(0, wallHeight / 2, mapDepth / 2 + wallThickness / 2),
                new THREE.Vector3(mapWidth + wallThickness * 2, wallHeight, wallThickness),
                'wall'
            );
            // East wall collision
            this.collisionSystem.addBoxCollider(
                new THREE.Vector3(mapWidth / 2 + wallThickness / 2, wallHeight / 2, 0),
                new THREE.Vector3(wallThickness, wallHeight, mapDepth),
                'wall'
            );
            // West wall collision
            this.collisionSystem.addBoxCollider(
                new THREE.Vector3(-mapWidth / 2 - wallThickness / 2, wallHeight / 2, 0),
                new THREE.Vector3(wallThickness, wallHeight, mapDepth),
                'wall'
            );
        }
    }
    
    createOrangeHills() {
        // No hills for clean flat map
    }
    
    createBombSites() {
        console.log('🎯 Creating Single Center Bomb Site...');
        
        // Single bomb site in center between spawns
        this.createCenterBombSite();
    }
    
    createCenterBombSite() {
        // Simple bright orange circle in center of map for bomb planting
        console.log('🎯 Creating Center Bomb Site...');
        
        const bombSiteRadius = 60; // Bigger size so it's more visible
        
        // Create bright orange circle for bomb site
        const bombSiteGeometry = new THREE.CircleGeometry(bombSiteRadius, 32);
        const bombSiteMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff8844,  // Brighter orange color
            transparent: false
        });
        
        const bombSiteCircle = new THREE.Mesh(bombSiteGeometry, bombSiteMaterial);
        bombSiteCircle.rotation.x = -Math.PI / 2; // Lay flat on ground
        bombSiteCircle.position.set(0, 0.2, 0); // Center of map, ABOVE ground so it's visible
        bombSiteCircle.receiveShadow = false;
        
        // Make sure it's not treated as a collision object
        bombSiteCircle.userData.nonCollidable = true;
        
        this.scene.add(bombSiteCircle);
        
        // Add pre-placed barriers and walls around bomb site
        this.createBombSiteDefenses();
        
        console.log('✅ Center Bomb Site (Bright Orange Circle) created at center (0,0)');
        console.log('🎯 Bomb site radius:', bombSiteRadius, 'position:', bombSiteCircle.position);
        console.log('🎯 Added to scene:', this.scene.children.length, 'total objects');
    }
    
    createBombSiteDefenses() {
        // Create structured houses around bomb site for competitive gameplay
        
        // Orange materials for structures
        const houseMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xff6633,  // Orange house color
            emissive: 0xff3300,
            emissiveIntensity: 0.05
        });
        
        const roofMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xcc4422,  // Darker orange for roofs
            emissive: 0x992200,
            emissiveIntensity: 0.05
        });
        
        // SYMMETRIC HOUSES - Identical on both sides for fair gameplay
        this.createHouse(-120, 0, -80, houseMaterial, roofMaterial);  // Left side house north
        this.createHouse(120, 0, -80, houseMaterial, roofMaterial);   // Right side house north (mirror)
        
        this.createHouse(-120, 0, 80, houseMaterial, roofMaterial);   // Left side house south
        this.createHouse(120, 0, 80, houseMaterial, roofMaterial);    // Right side house south (mirror)
        
        // NO BOXES AT BOMB SITE - removed per user request
        
        // MID-LINE WALLS to block spawn sight lines (smaller for smaller map)
        const wallStructures = [
            // Left wall
            { pos: [-250, 10, 0], size: [15, 20, 200] },
            
            // Right wall (mirror)
            { pos: [250, 10, 0], size: [15, 20, 200] }
        ];
        
        wallStructures.forEach(wall => {
            const wallMesh = new THREE.Mesh(
                new THREE.BoxGeometry(...wall.size),
                houseMaterial
            );
            wallMesh.position.set(...wall.pos);
            wallMesh.castShadow = true;
            wallMesh.receiveShadow = true;
            this.scene.add(wallMesh);
            
            if (this.collisionSystem) {
                this.collisionSystem.addBoxCollider(
                    new THREE.Vector3(...wall.pos),
                    new THREE.Vector3(...wall.size),
                    'wall'
                );
            }
        });
    }
    
    createHouse(x, y, z, wallMaterial, roofMaterial) {
        // Simple house structure for competitive map
        const houseGroup = new THREE.Group();
        
        // House base (walls)
        const houseBase = new THREE.Mesh(
            new THREE.BoxGeometry(30, 20, 30),
            wallMaterial
        );
        houseBase.position.y = 10;
        houseBase.castShadow = true;
        houseBase.receiveShadow = true;
        houseGroup.add(houseBase);
        
        // Roof (pyramid shape)
        const roofGeometry = new THREE.ConeGeometry(21, 10, 4);
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.y = 25;
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        houseGroup.add(roof);
        
        // Door opening (dark rectangle)
        const doorMaterial = new THREE.MeshLambertMaterial({ color: 0x331100 });
        const door = new THREE.Mesh(
            new THREE.BoxGeometry(8, 12, 1),
            doorMaterial
        );
        door.position.set(0, 6, 15.5);
        houseGroup.add(door);
        
        // Window (small dark square)
        const window1 = new THREE.Mesh(
            new THREE.BoxGeometry(6, 6, 1),
            doorMaterial
        );
        window1.position.set(10, 12, 15.5);
        houseGroup.add(window1);
        
        const window2 = new THREE.Mesh(
            new THREE.BoxGeometry(6, 6, 1),
            doorMaterial
        );
        window2.position.set(-10, 12, 15.5);
        houseGroup.add(window2);
        
        // Position the entire house
        houseGroup.position.set(x, y, z);
        this.scene.add(houseGroup);
        
        // Add collision for the house
        if (this.collisionSystem) {
            this.collisionSystem.addBoxCollider(
                new THREE.Vector3(x, 10, z),
                new THREE.Vector3(30, 20, 30),
                'building'
            );
        }
    }
    
    createSunkenBombSiteA() {
        // Site A - Simple box that goes straight down  
        console.log('🔧 Creating Simple Box Pit...');
        
        const pitDepth = 8;   // Moderate depth  
        const pitSize = 80;   // Smaller, more reasonable size
        
        // Just create a simple floor inside the hole (at ground level)
        const pitFloor = new THREE.Mesh(
            new THREE.PlaneGeometry(pitSize, pitSize),
            new THREE.MeshLambertMaterial({ 
                color: 0x881100,  // Dark orange
                emissive: 0x441100,
                emissiveIntensity: 0.1
            })
        );
        pitFloor.rotation.x = -Math.PI / 2;
        pitFloor.position.set(0, -pitDepth, -200);  // Much deeper below ground level
        pitFloor.receiveShadow = true;
        this.scene.add(pitFloor);
        
        // Add walls around the pit that go from ground level to pit floor
        const wallHeight = pitDepth + 2; // Extend walls above ground level
        const wallMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x661100,  // Even darker orange for pit walls
            emissive: 0x331100,
            emissiveIntensity: 0.1
        });
        
        // North wall - connects ground to pit floor
        const northWall = new THREE.Mesh(new THREE.PlaneGeometry(pitSize, wallHeight), wallMaterial);
        northWall.position.set(0, -pitDepth/2 + 1, -200 - pitSize/2);
        this.scene.add(northWall);
        
        // South wall
        const southWall = new THREE.Mesh(new THREE.PlaneGeometry(pitSize, wallHeight), wallMaterial);
        southWall.position.set(0, -pitDepth/2 + 1, -200 + pitSize/2);
        southWall.rotation.y = Math.PI;
        this.scene.add(southWall);
        
        // East wall
        const eastWall = new THREE.Mesh(new THREE.PlaneGeometry(pitSize, wallHeight), wallMaterial);
        eastWall.position.set(pitSize/2, -pitDepth/2 + 1, -200);
        eastWall.rotation.y = Math.PI/2;
        this.scene.add(eastWall);
        
        // West wall
        const westWall = new THREE.Mesh(new THREE.PlaneGeometry(pitSize, wallHeight), wallMaterial);
        westWall.position.set(-pitSize/2, -pitDepth/2 + 1, -200);
        westWall.rotation.y = -Math.PI/2;
        this.scene.add(westWall);
        
        // Add collision detection for the pit floor so players can walk on it
        if (this.collisionSystem) {
            this.collisionSystem.addBoxCollider(
                new THREE.Vector3(0, -pitDepth + 1, -200),  // Position slightly above pit floor
                new THREE.Vector3(pitSize, 2, pitSize), // Size (width, height, depth)
                'pit_floor'
            );
            console.log('✅ Added collision for pit floor at Y:', -pitDepth + 1);
        }
        
        console.log('✅ Bomb Site A (Sunken Pit with walls) created at z:-200');
    }
    
    createElevatedBombSiteB() {
        // Site B - Elevated platform at bottom-center of map (z: 200)
        const platformHeight = 20;
        const platformSize = 120;
        
        // Create the elevated platform
        const platformGeometry = new THREE.BoxGeometry(platformSize, platformHeight, platformSize);
        const platformMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xff4400,  // Brighter orange for platform
            emissive: 0xcc2200,
            emissiveIntensity: 0.1
        });
        
        const platform = new THREE.Mesh(platformGeometry, platformMaterial);
        platform.position.set(0, platformHeight/2, 200);
        platform.castShadow = true;
        platform.receiveShadow = true;
        this.scene.add(platform);
        
        // Platform top surface
        const topSurface = new THREE.Mesh(
            new THREE.PlaneGeometry(platformSize, platformSize),
            new THREE.MeshLambertMaterial({ 
                color: 0xff5500,
                emissive: 0xdd3300,
                emissiveIntensity: 0.2
            })
        );
        topSurface.rotation.x = -Math.PI / 2;
        topSurface.position.set(0, platformHeight + 0.1, 200);
        topSurface.receiveShadow = true;
        this.scene.add(topSurface);
        
        // Simple ramps for access
        const rampMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xee3300,
            emissive: 0x991100,
            emissiveIntensity: 0.1
        });
        
        // Left ramp
        const leftRamp = new THREE.Mesh(
            new THREE.BoxGeometry(40, 2, 60),
            rampMaterial
        );
        leftRamp.position.set(-platformSize/2 - 20, 10, 200);
        leftRamp.rotation.z = -0.3;
        this.scene.add(leftRamp);
        
        // Right ramp
        const rightRamp = new THREE.Mesh(
            new THREE.BoxGeometry(40, 2, 60),
            rampMaterial
        );
        rightRamp.position.set(platformSize/2 + 20, 10, 200);
        rightRamp.rotation.z = 0.3;
        this.scene.add(rightRamp);
        
        // Add "B" marker
        const markerB = new THREE.Mesh(
            new THREE.CircleGeometry(15, 32),
            new THREE.MeshLambertMaterial({ 
                color: 0xffff00,
                emissive: 0xffff00,
                emissiveIntensity: 0.3
            })
        );
        markerB.rotation.x = -Math.PI / 2;
        markerB.position.set(0, platformHeight + 0.2, 200);
        this.scene.add(markerB);
        
        console.log('✅ Bomb Site B (Elevated) created at z:200');
    }
    
    createBombsiteA() {
        // A Site: Industrial area with large structures
        console.log('Creating Bombsite A - Industrial Zone');
        
        // Main A site platform (elevated)
        const aPlatformGeometry = new THREE.BoxGeometry(150, 8, 120);
        const aPlatformMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xcc5522,
            roughness: 0.4
        });
        const aPlatform = new THREE.Mesh(aPlatformGeometry, aPlatformMaterial);
        aPlatform.position.set(-350, 19, -350);
        aPlatform.receiveShadow = true;
        this.scene.add(aPlatform);
        
        // A Site buildings - varied sizes
        const aSiteBuildings = [
            // Large factory building
            { pos: [-300, 35, -400], size: [80, 50, 60], color: 0xb8381a },
            // Medium warehouse
            { pos: [-400, 25, -320], size: [50, 30, 40], color: 0xcc3d17 },
            // Small office building
            { pos: [-320, 20, -300], size: [30, 20, 35], color: 0xd94d1a },
            // Tall silo tower
            { pos: [-380, 40, -380], size: [20, 60, 20], color: 0xa63318 },
            // Storage containers
            { pos: [-350, 18, -320], size: [40, 16, 25], color: 0xe55a2b },
            { pos: [-280, 18, -380], size: [35, 16, 20], color: 0xe55a2b },
        ];
        
        aSiteBuildings.forEach(building => {
            const geometry = new THREE.BoxGeometry(...building.size);
            const material = new THREE.MeshLambertMaterial({ color: building.color });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(...building.pos);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
            
            if (this.collisionSystem) {
                this.collisionSystem.addBoxCollider(...building.pos, ...building.size);
            }
        });
        
        // A Site bomb marker
        this.createBombMarker(-350, 24, -350, 'A');
    }
    
    createBombsiteB() {
        // No bombsite B for clean map
    }
    
    createBombMarker(x, y, z, site) {
        // No bomb markers for clean map
    }
    
    createVariedBuildings() {
        // Mid-map connecting buildings with variety
        const midBuildings = [
            // Central connector building
            { pos: [0, 20, -100], size: [40, 25, 60], color: 0xd94d1a, type: 'connector' },
            { pos: [0, 20, 100], size: [40, 25, 60], color: 0xd94d1a, type: 'connector' },
            
            // Pathway buildings
            { pos: [-150, 15, 0], size: [30, 20, 35], color: 0xe55a2b, type: 'pathway' },
            { pos: [150, 15, 0], size: [30, 20, 35], color: 0xe55a2b, type: 'pathway' },
            
            // Varied cover structures
            { pos: [-100, 12, -150], size: [25, 18, 40], color: 0xff6b35, type: 'cover' },
            { pos: [100, 12, 150], size: [25, 18, 40], color: 0xff6b35, type: 'cover' },
            { pos: [200, 10, -100], size: [20, 15, 30], color: 0xff7847, type: 'cover' },
            { pos: [-200, 10, 100], size: [20, 15, 30], color: 0xff7847, type: 'cover' },
            
            // Unique structures
            { pos: [50, 25, 50], size: [15, 40, 15], color: 0xcc3d17, type: 'tower' }, // Observation tower
            { pos: [-50, 18, -50], size: [35, 25, 20], color: 0xb8381a, type: 'bridge' }, // Bridge structure
        ];
        
        midBuildings.forEach(building => {
            let geometry;
            if (building.type === 'tower') {
                geometry = new THREE.CylinderGeometry(building.size[0]/2, building.size[0]/2 + 2, building.size[1], 8);
            } else {
                geometry = new THREE.BoxGeometry(...building.size);
            }
            
            const material = new THREE.MeshLambertMaterial({ color: building.color });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(...building.pos);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
            
            if (this.collisionSystem) {
                this.collisionSystem.addBoxCollider(...building.pos, ...building.size);
            }
        });
    }
    
    createOrangeCaves() {
        // Underground orange caves/tunnels for flanking routes
        console.log('Creating Orange Mountain Caves...');
        
        const caves = [
            // Cave entrance near A site
            { entrance: { x: -200, y: 5, z: -200 }, tunnel: { x: -100, y: 5, z: -100 } },
            // Cave entrance near B site  
            { entrance: { x: 250, y: 5, z: 200 }, tunnel: { x: 150, y: 5, z: 100 } },
            // Central underground connection
            { entrance: { x: -50, y: 5, z: 150 }, tunnel: { x: 50, y: 5, z: -150 } },
        ];
        
        caves.forEach((cave, index) => {
            // Cave entrance
            const entranceGeometry = new THREE.SphereGeometry(20, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
            const entranceMaterial = new THREE.MeshLambertMaterial({ 
                color: 0x994422,
                side: THREE.DoubleSide
            });
            const entrance = new THREE.Mesh(entranceGeometry, entranceMaterial);
            entrance.position.set(cave.entrance.x, cave.entrance.y, cave.entrance.z);
            entrance.rotation.x = Math.PI;
            this.scene.add(entrance);
            
            // Orange crystal formations inside caves
            this.addCrystalFormations(cave.entrance.x, cave.entrance.y - 5, cave.entrance.z);
            this.addCrystalFormations(cave.tunnel.x, cave.tunnel.y - 5, cave.tunnel.z);
        });
    }
    
    addCrystalFormations(x, y, z) {
        // Comic-style orange crystals
        const crystalCount = 3 + Math.random() * 4;
        for (let i = 0; i < crystalCount; i++) {
            const offsetX = (Math.random() - 0.5) * 30;
            const offsetZ = (Math.random() - 0.5) * 30;
            
            const crystalGeometry = new THREE.ConeGeometry(2 + Math.random() * 3, 5 + Math.random() * 8, 6);
            const crystalMaterial = new THREE.MeshLambertMaterial({ 
                color: 0xffaa33,
                emissive: 0xffaa33,
                emissiveIntensity: 0.4
            });
            
            const crystal = new THREE.Mesh(crystalGeometry, crystalMaterial);
            crystal.position.set(x + offsetX, y + crystal.geometry.parameters.height/2, z + offsetZ);
            crystal.rotation.z = (Math.random() - 0.5) * 0.4;
            this.scene.add(crystal);
        }
    }
    
    createConnectingPaths() {
        // Clear pathways between sites with strategic cover
        const pathways = [
            // Main middle path
            { start: { x: -200, z: 0 }, end: { x: 200, z: 0 }, width: 25 },
            // Upper connector (A to mid)
            { start: { x: -250, z: -200 }, end: { x: 0, z: -50 }, width: 20 },
            // Lower connector (B to mid)
            { start: { x: 250, z: 200 }, end: { x: 0, z: 50 }, width: 20 },
            // Flanking route
            { start: { x: -100, z: 300 }, end: { x: 100, z: -300 }, width: 15 },
        ];
        
        pathways.forEach(path => {
            // Create subtle path marking on ground
            const pathLength = Math.sqrt(
                Math.pow(path.end.x - path.start.x, 2) + 
                Math.pow(path.end.z - path.start.z, 2)
            );
            
            const pathGeometry = new THREE.PlaneGeometry(pathLength, path.width);
            const pathMaterial = new THREE.MeshLambertMaterial({ 
                color: 0xff9966,
                transparent: true,
                opacity: 0.3
            });
            
            const pathMesh = new THREE.Mesh(pathGeometry, pathMaterial);
            const midX = (path.start.x + path.end.x) / 2;
            const midZ = (path.start.z + path.end.z) / 2;
            const angle = Math.atan2(path.end.z - path.start.z, path.end.x - path.start.x);
            
            pathMesh.rotation.x = -Math.PI / 2;
            pathMesh.rotation.z = angle;
            pathMesh.position.set(midX, 1, midZ);
            this.scene.add(pathMesh);
        });
    }
    
    addComicStyleElements() {
        // Fun, kid-friendly decorative elements
        
        // Orange planet trees (crystalline formations)
        this.addOrangeTrees();
        
        // Comic-style lighting orbs
        this.addGlowingOrbs();
        
        // Playful decoration props
        this.addComicProps();
    }
    
    addOrangeTrees() {
        // No orange trees for clean map
    }
    
    addGlowingOrbs() {
        // Floating glowing orbs for atmosphere
        const orbPositions = [
            { x: 0, y: 30, z: 0 }, // Central high orb
            { x: -300, y: 25, z: -300 }, // A site orb
            { x: 350, y: 25, z: 350 }, // B site orb
            { x: 200, y: 20, z: -200 }, // Mid orbs
            { x: -200, y: 20, z: 200 },
        ];
        
        orbPositions.forEach(pos => {
            const orbGeometry = new THREE.SphereGeometry(4, 16, 16);
            const orbMaterial = new THREE.MeshLambertMaterial({ 
                color: 0xffdd77,
                emissive: 0xffdd77,
                emissiveIntensity: 0.6
            });
            
            const orb = new THREE.Mesh(orbGeometry, orbMaterial);
            orb.position.set(pos.x, pos.y, pos.z);
            this.scene.add(orb);
            
            // Add point light
            const light = new THREE.PointLight(0xffdd77, 0.8, 80);
            light.position.set(pos.x, pos.y, pos.z);
            this.scene.add(light);
        });
    }
    
    addComicProps() {
        // No comic props for clean map
    }
    
    createTeamSpawnZones() {
        // Team spawns WELL INSIDE the map (map is 1000x600, so -500 to +500 in X, -300 to +300 in Z)
        // Spawning at ±300 to be VERY safely inside
        this.spawnPositions = {
            orange: { x: -300, y: 10, z: 0 },  // Well inside left edge
            red: { x: 300, y: 10, z: 0 }       // Well inside right edge
        };
        
        // Visual spawn zone markers (optional)
        const spawnZoneMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xff6600,
            transparent: true,
            opacity: 0.3,
            emissive: 0xff3300,
            emissiveIntensity: 0.1
        });
        
        // Orange spawn zone circle
        const orangeSpawnGeometry = new THREE.CircleGeometry(40, 32);
        const orangeSpawn = new THREE.Mesh(orangeSpawnGeometry, spawnZoneMaterial);
        orangeSpawn.rotation.x = -Math.PI / 2;
        orangeSpawn.position.set(-300, 0.1, 0);  // Match spawn position
        this.scene.add(orangeSpawn);
        
        // Red spawn zone circle
        const redSpawnMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xff0000,
            transparent: true,
            opacity: 0.3,
            emissive: 0xcc0000,
            emissiveIntensity: 0.1
        });
        const redSpawn = new THREE.Mesh(orangeSpawnGeometry, redSpawnMaterial);
        redSpawn.rotation.x = -Math.PI / 2;
        redSpawn.position.set(300, 0.1, 0);  // Match spawn position
        this.scene.add(redSpawn);
        
        // Set map bounds for rectangular map (now 1000 x 600)
        this.mapBounds = {
            width: 1000,
            depth: 600,
            height: 80
        };
    }
    
    createMapStructures() {
        console.log('Creating diverse map structures...');
        
        // Different materials for variety
        const concreteMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x888888,
            roughness: 0.9
        });
        
        const metalMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x445566,
            metalness: 0.7,
            roughness: 0.3
        });
        
        const woodMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x8B4513,
            roughness: 0.8
        });
        
        // Create towers (different from build mode structures)
        const towers = [
            { pos: [-400, 20, -200], size: [25, 40, 25], material: concreteMaterial },
            { pos: [400, 20, -200], size: [25, 40, 25], material: concreteMaterial },
            { pos: [-400, 20, 200], size: [25, 40, 25], material: concreteMaterial },
            { pos: [400, 20, 200], size: [25, 40, 25], material: concreteMaterial }
        ];
        
        towers.forEach(tower => {
            // Tower base
            const towerBase = new THREE.Mesh(
                new THREE.CylinderGeometry(tower.size[0]/2, tower.size[0]/2 + 5, tower.size[1], 8),
                tower.material
            );
            towerBase.position.set(tower.pos[0], tower.pos[1], tower.pos[2]);
            towerBase.castShadow = true;
            towerBase.receiveShadow = true;
            this.scene.add(towerBase);
            
            // Tower top platform
            const platform = new THREE.Mesh(
                new THREE.CylinderGeometry(tower.size[0]/2 + 8, tower.size[0]/2, 5, 8),
                tower.material
            );
            platform.position.set(tower.pos[0], tower.pos[1] + tower.size[1]/2 + 2.5, tower.pos[2]);
            platform.castShadow = true;
            this.scene.add(platform);
            
            if (this.collisionSystem) {
                this.collisionSystem.addBoxCollider(
                    new THREE.Vector3(tower.pos[0], tower.pos[1], tower.pos[2]),
                    new THREE.Vector3(tower.size[0], tower.size[1], tower.size[2]),
                    'structure'
                );
            }
        });
        
        // Create bunkers (low fortified positions)
        const bunkers = [
            { pos: [-200, 4, -100], size: [40, 8, 30] },
            { pos: [200, 4, -100], size: [40, 8, 30] },
            { pos: [-200, 4, 100], size: [40, 8, 30] },
            { pos: [200, 4, 100], size: [40, 8, 30] }
        ];
        
        bunkers.forEach(bunker => {
            // Main bunker body
            const bunkerMesh = new THREE.Mesh(
                new THREE.BoxGeometry(bunker.size[0], bunker.size[1], bunker.size[2]),
                concreteMaterial
            );
            bunkerMesh.position.set(bunker.pos[0], bunker.pos[1], bunker.pos[2]);
            bunkerMesh.castShadow = true;
            bunkerMesh.receiveShadow = true;
            this.scene.add(bunkerMesh);
            
            // Bunker entrance (cut-out)
            const entrance = new THREE.Mesh(
                new THREE.BoxGeometry(10, 6, 5),
                new THREE.MeshLambertMaterial({ color: 0x222222 })
            );
            entrance.position.set(bunker.pos[0], bunker.pos[1], bunker.pos[2] + bunker.size[2]/2 - 2.5);
            this.scene.add(entrance);
            
            if (this.collisionSystem) {
                this.collisionSystem.addBoxCollider(
                    new THREE.Vector3(bunker.pos[0], bunker.pos[1], bunker.pos[2]),
                    new THREE.Vector3(bunker.size[0], bunker.size[1], bunker.size[2]),
                    'structure'
                );
            }
        });
        
        // Create shipping containers (unique to map, not buildable)
        const containers = [
            { pos: [-300, 5, 0], size: [15, 10, 40], rotation: 0.3 },
            { pos: [300, 5, 0], size: [15, 10, 40], rotation: -0.3 },
            { pos: [0, 5, -300], size: [40, 10, 15], rotation: 0 },
            { pos: [0, 5, 300], size: [40, 10, 15], rotation: 0 },
            // Stacked containers
            { pos: [-150, 5, -250], size: [15, 10, 40], rotation: 0.8 },
            { pos: [-150, 15, -250], size: [15, 10, 40], rotation: 0.8 },
            { pos: [150, 5, 250], size: [15, 10, 40], rotation: -0.8 },
            { pos: [150, 15, 250], size: [15, 10, 40], rotation: -0.8 }
        ];
        
        containers.forEach(container => {
            const containerMesh = new THREE.Mesh(
                new THREE.BoxGeometry(container.size[0], container.size[1], container.size[2]),
                metalMaterial
            );
            containerMesh.position.set(container.pos[0], container.pos[1], container.pos[2]);
            containerMesh.rotation.y = container.rotation;
            containerMesh.castShadow = true;
            containerMesh.receiveShadow = true;
            
            // Add container details
            const stripeMaterial = new THREE.MeshLambertMaterial({ color: 0xFF6600 });
            const stripe = new THREE.Mesh(
                new THREE.BoxGeometry(container.size[0] + 0.1, 2, container.size[2] + 0.1),
                stripeMaterial
            );
            stripe.position.set(container.pos[0], container.pos[1], container.pos[2]);
            stripe.rotation.y = container.rotation;
            
            this.scene.add(containerMesh);
            this.scene.add(stripe);
            
            if (this.collisionSystem) {
                this.collisionSystem.addBoxCollider(
                    new THREE.Vector3(container.pos[0], container.pos[1], container.pos[2]),
                    new THREE.Vector3(container.size[0], container.size[1], container.size[2]),
                    'structure'
                );
            }
        });
    }
    
    createCoverElements() {
        console.log('Creating varied cover elements...');
        
        // Concrete blocks material
        const blockMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x999999,
            roughness: 0.9
        });
        
        // Create concrete blocks (different sizes than buildable walls)
        const blocks = [
            // Mid-map cover
            { pos: [-100, 3, -50], size: [20, 6, 6] },
            { pos: [100, 3, -50], size: [20, 6, 6] },
            { pos: [-100, 3, 50], size: [20, 6, 6] },
            { pos: [100, 3, 50], size: [20, 6, 6] },
            
            // Angled blocks for variety
            { pos: [-250, 3, -150], size: [25, 6, 8], rotation: Math.PI/6 },
            { pos: [250, 3, -150], size: [25, 6, 8], rotation: -Math.PI/6 },
            { pos: [-250, 3, 150], size: [25, 6, 8], rotation: -Math.PI/6 },
            { pos: [250, 3, 150], size: [25, 6, 8], rotation: Math.PI/6 }
        ];
        
        blocks.forEach(block => {
            const blockMesh = new THREE.Mesh(
                new THREE.BoxGeometry(block.size[0], block.size[1], block.size[2]),
                blockMaterial
            );
            blockMesh.position.set(block.pos[0], block.pos[1], block.pos[2]);
            if (block.rotation) {
                blockMesh.rotation.y = block.rotation;
            }
            blockMesh.castShadow = true;
            blockMesh.receiveShadow = true;
            this.scene.add(blockMesh);
            
            if (this.collisionSystem) {
                this.collisionSystem.addBoxCollider(
                    new THREE.Vector3(block.pos[0], block.pos[1], block.pos[2]),
                    new THREE.Vector3(block.size[0], block.size[1], block.size[2]),
                    'cover'
                );
            }
        });
        
        // Create sandbag positions
        const sandbagMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x8B7355,
            roughness: 1.0
        });
        
        const sandbags = [
            { pos: [-180, 2, 0], size: [30, 4, 10] },
            { pos: [180, 2, 0], size: [30, 4, 10] },
            { pos: [0, 2, -180], size: [10, 4, 30] },
            { pos: [0, 2, 180], size: [10, 4, 30] }
        ];
        
        sandbags.forEach(sandbag => {
            // Create rounded sandbag shape
            const sandbagMesh = new THREE.Mesh(
                new THREE.CapsuleGeometry(sandbag.size[2]/2, sandbag.size[0], 8, 16),
                sandbagMaterial
            );
            sandbagMesh.position.set(sandbag.pos[0], sandbag.pos[1] + 2, sandbag.pos[2]);
            sandbagMesh.rotation.z = Math.PI/2;
            sandbagMesh.castShadow = true;
            sandbagMesh.receiveShadow = true;
            this.scene.add(sandbagMesh);
            
            if (this.collisionSystem) {
                this.collisionSystem.addBoxCollider(
                    new THREE.Vector3(sandbag.pos[0], sandbag.pos[1], sandbag.pos[2]),
                    new THREE.Vector3(sandbag.size[0], sandbag.size[1], sandbag.size[2]),
                    'cover'
                );
            }
        });
        
        // Create wooden crates for variety
        const crateMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x654321,
            roughness: 0.8
        });
        
        const crates = [
            { pos: [-350, 4, -100], size: [8, 8, 8] },
            { pos: [-345, 4, -95], size: [8, 8, 8] },
            { pos: [-350, 12, -97], size: [8, 8, 8] },
            
            { pos: [350, 4, 100], size: [8, 8, 8] },
            { pos: [345, 4, 95], size: [8, 8, 8] },
            { pos: [350, 12, 97], size: [8, 8, 8] }
        ];
        
        crates.forEach(crate => {
            const crateMesh = new THREE.Mesh(
                new THREE.BoxGeometry(crate.size[0], crate.size[1], crate.size[2]),
                crateMaterial
            );
            crateMesh.position.set(crate.pos[0], crate.pos[1], crate.pos[2]);
            crateMesh.rotation.y = Math.random() * 0.3;
            crateMesh.castShadow = true;
            crateMesh.receiveShadow = true;
            this.scene.add(crateMesh);
            
            if (this.collisionSystem) {
                this.collisionSystem.addBoxCollider(
                    new THREE.Vector3(crate.pos[0], crate.pos[1], crate.pos[2]),
                    new THREE.Vector3(crate.size[0], crate.size[1], crate.size[2]),
                    'cover'
                );
            }
        });
    }
    
    createConnectorPaths() {
        console.log('Creating connector paths and bridges...');
        
        // Create elevated walkways/bridges
        const bridgeMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x555555,
            metalness: 0.5,
            roughness: 0.5
        });
        
        // Elevated walkways connecting different areas
        const walkways = [
            // North-South connector
            { start: [-500, 15, -200], end: [-500, 15, 200], width: 15 },
            { start: [500, 15, -200], end: [500, 15, 200], width: 15 },
            
            // East-West connector  
            { start: [-200, 15, 0], end: [200, 15, 0], width: 20 }
        ];
        
        walkways.forEach(walkway => {
            const length = Math.sqrt(
                Math.pow(walkway.end[0] - walkway.start[0], 2) + 
                Math.pow(walkway.end[2] - walkway.start[2], 2)
            );
            
            // Walkway platform
            const platform = new THREE.Mesh(
                new THREE.BoxGeometry(
                    walkway.start[0] === walkway.end[0] ? walkway.width : length,
                    2,
                    walkway.start[2] === walkway.end[2] ? walkway.width : length
                ),
                bridgeMaterial
            );
            
            platform.position.set(
                (walkway.start[0] + walkway.end[0]) / 2,
                walkway.start[1],
                (walkway.start[2] + walkway.end[2]) / 2
            );
            platform.castShadow = true;
            platform.receiveShadow = true;
            this.scene.add(platform);
            
            // Add railings
            const railingMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
            const railHeight = 5;
            
            // Left railing
            const leftRail = new THREE.Mesh(
                new THREE.BoxGeometry(
                    walkway.start[0] === walkway.end[0] ? 1 : length,
                    railHeight,
                    walkway.start[2] === walkway.end[2] ? 1 : length
                ),
                railingMaterial
            );
            leftRail.position.set(
                (walkway.start[0] + walkway.end[0]) / 2 + (walkway.start[0] === walkway.end[0] ? walkway.width/2 : 0),
                walkway.start[1] + railHeight/2 + 1,
                (walkway.start[2] + walkway.end[2]) / 2 + (walkway.start[2] === walkway.end[2] ? walkway.width/2 : 0)
            );
            this.scene.add(leftRail);
            
            // Right railing
            const rightRail = new THREE.Mesh(
                new THREE.BoxGeometry(
                    walkway.start[0] === walkway.end[0] ? 1 : length,
                    railHeight,
                    walkway.start[2] === walkway.end[2] ? 1 : length
                ),
                railingMaterial
            );
            rightRail.position.set(
                (walkway.start[0] + walkway.end[0]) / 2 - (walkway.start[0] === walkway.end[0] ? walkway.width/2 : 0),
                walkway.start[1] + railHeight/2 + 1,
                (walkway.start[2] + walkway.end[2]) / 2 - (walkway.start[2] === walkway.end[2] ? walkway.width/2 : 0)
            );
            this.scene.add(rightRail);
            
            if (this.collisionSystem) {
                this.collisionSystem.addBoxCollider(
                    platform.position,
                    new THREE.Vector3(
                        walkway.start[0] === walkway.end[0] ? walkway.width : length,
                        2,
                        walkway.start[2] === walkway.end[2] ? walkway.width : length
                    ),
                    'platform'
                );
            }
        });
        
        // Add ramps to access elevated areas
        const rampMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x666666,
            roughness: 0.7
        });
        
        const ramps = [
            { pos: [-500, 7.5, 0], size: [15, 2, 30], rotation: { x: -0.3, y: 0, z: 0 } },
            { pos: [500, 7.5, 0], size: [15, 2, 30], rotation: { x: -0.3, y: 0, z: 0 } },
            { pos: [0, 7.5, 0], size: [30, 2, 15], rotation: { x: 0, y: 0, z: -0.3 } }
        ];
        
        ramps.forEach(ramp => {
            const rampMesh = new THREE.Mesh(
                new THREE.BoxGeometry(ramp.size[0], ramp.size[1], ramp.size[2]),
                rampMaterial
            );
            rampMesh.position.set(ramp.pos[0], ramp.pos[1], ramp.pos[2]);
            rampMesh.rotation.x = ramp.rotation.x;
            rampMesh.rotation.y = ramp.rotation.y;
            rampMesh.rotation.z = ramp.rotation.z;
            rampMesh.castShadow = true;
            rampMesh.receiveShadow = true;
            this.scene.add(rampMesh);
        });
    }
}
