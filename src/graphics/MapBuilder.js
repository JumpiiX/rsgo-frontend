import { MaterialManager } from '../utils/MaterialManager.js';

export class MapBuilder {
    constructor(scene) {
        this.scene = scene;
        this.materials = new MaterialManager();
    }

    buildMap() {
        this.createGround();
        this.createMapBoundaries();
        this.createCityBlocks();
        this.createStreets();
        this.createVehicles();
        this.createTrees();
        this.createHidingSpots();
        this.createCityProps();
        this.createDecorations();
    }

    createGround() {
        const groundGeometry = new THREE.PlaneGeometry(800, 800);
        const ground = new THREE.Mesh(groundGeometry, this.materials.get('ground'));
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }

    createMapBoundaries() {
        // Irregular boundaries like Valorant maps
        const walls = [
            // North boundaries (irregular)
            { pos: [-200, 20, -380], size: [200, 40, 8] },
            { pos: [-50, 20, -350], size: [100, 40, 8] },
            { pos: [100, 20, -380], size: [200, 40, 8] },
            { pos: [250, 20, -320], size: [100, 40, 8] },
            
            // South boundaries (irregular)
            { pos: [-150, 20, 380], size: [200, 40, 8] },
            { pos: [50, 20, 350], size: [150, 40, 8] },
            { pos: [200, 20, 380], size: [200, 40, 8] },
            
            // East boundaries (angled)
            { pos: [380, 20, -200], size: [8, 40, 200] },
            { pos: [350, 20, 0], size: [8, 40, 150] },
            { pos: [380, 20, 200], size: [8, 40, 200] },
            
            // West boundaries (angled)
            { pos: [-380, 20, -150], size: [8, 40, 200] },
            { pos: [-350, 20, 50], size: [8, 40, 200] },
            { pos: [-380, 20, 250], size: [8, 40, 150] },
            
            // Diagonal corners
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
        });
    }

    createCityBlocks() {
        // Varied buildings with different heights and styles
        const cityBlocks = [
            // SITE A - Mixed architecture
            { pos: [-180, 45, -250], size: [100, 90, 70], type: 'darkBuilding' }, // Tall office
            { pos: [-80, 20, -260], size: [50, 40, 50], type: 'building' },       // Medium residential
            { pos: [-140, 12, -180], size: [35, 24, 45], type: 'crate' },        // Low warehouse
            { pos: [-220, 30, -200], size: [40, 60, 30], type: 'darkBuilding' }, // Narrow tower
            
            // Unique shaped buildings
            { pos: [-200, 18, -100], size: [25, 36, 100], type: 'darkBuilding' }, // Long corridor
            { pos: [-250, 25, -50], size: [70, 50, 35], type: 'building' },      // Wide building
            { pos: [-150, 35, -50], size: [30, 70, 30], type: 'darkBuilding' },  // Tall skinny
            
            // MID - Varied heights creating skyline
            { pos: [0, 40, -100], size: [70, 80, 55], type: 'darkBuilding' },    // Main tower
            { pos: [-50, 20, 0], size: [55, 40, 70], type: 'building' },         // Low wide
            { pos: [50, 30, 0], size: [55, 60, 70], type: 'darkBuilding' },      // Medium tall
            { pos: [0, 15, -30], size: [100, 30, 20], type: 'building' },        // Connector
            
            // Market area with small shops
            { pos: [-30, 8, 100], size: [20, 16, 25], type: 'building' },
            { pos: [0, 10, 100], size: [25, 20, 25], type: 'darkBuilding' },
            { pos: [30, 7, 100], size: [20, 14, 25], type: 'crate' },
            { pos: [60, 9, 100], size: [18, 18, 25], type: 'building' },
            
            // SITE B - Industrial zone
            { pos: [200, 25, 250], size: [90, 50, 90], type: 'darkBuilding' },   // Factory
            { pos: [120, 30, 200], size: [50, 60, 35], type: 'building' },       // Office
            { pos: [250, 15, 150], size: [35, 30, 70], type: 'crate' },         // Storage
            { pos: [150, 20, 280], size: [40, 40, 40], type: 'darkBuilding' },  // Cube building
            
            // East residential complex
            { pos: [300, 50, 0], size: [70, 100, 60], type: 'darkBuilding' },   // Apartment tower
            { pos: [250, 12, -100], size: [50, 24, 50], type: 'building' },     // Houses
            { pos: [280, 18, -50], size: [30, 36, 40], type: 'building' },      // Small apartment
            { pos: [320, 8, 100], size: [40, 16, 80], type: 'crate' },          // Garage
            
            // West commercial district
            { pos: [-300, 45, 0], size: [70, 90, 80], type: 'darkBuilding' },   // Shopping mall
            { pos: [-250, 10, 100], size: [50, 20, 50], type: 'building' },     // Shop
            { pos: [-280, 25, -80], size: [35, 50, 35], type: 'darkBuilding' }, // Small tower
            { pos: [-320, 15, 50], size: [25, 30, 60], type: 'building' },      // Store
            
            // Corner landmarks (varied heights)
            { pos: [-320, 60, -320], size: [35, 120, 35], type: 'darkBuilding' }, // NW Tower
            { pos: [320, 40, 320], size: [45, 80, 45], type: 'darkBuilding' },    // SE Tower
            { pos: [320, 35, -320], size: [40, 70, 40], type: 'building' },       // NE Tower
            { pos: [-320, 45, 320], size: [38, 90, 38], type: 'darkBuilding' },   // SW Tower
            
            // Unique structures
            { pos: [150, 6, -150], size: [35, 12, 35], type: 'crate' },         // Low bunker
            { pos: [-150, 10, 150], size: [45, 20, 45], type: 'building' },     // Security post
            { pos: [180, 15, -200], size: [25, 30, 50], type: 'darkBuilding' }, // Guard house
            { pos: [-180, 12, 200], size: [40, 24, 30], type: 'building' },     // Checkpoint
            
            // Additional varied buildings
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

            // Add windows to taller buildings
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
                // Front windows
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
        // Realistic street network
        const streets = [
            // Main roads
            { pos: [0, 0.1, 0], size: [600, 0.2, 12] },      // Central avenue
            { pos: [0, 0.1, -150], size: [500, 0.2, 10] },   // North street
            { pos: [0, 0.1, 150], size: [500, 0.2, 10] },    // South street
            
            // Vertical streets
            { pos: [-150, 0.1, 0], size: [10, 0.2, 600] },   // West avenue
            { pos: [150, 0.1, 0], size: [10, 0.2, 600] },    // East avenue
            { pos: [-75, 0.1, 0], size: [8, 0.2, 400] },     // West mid street
            { pos: [75, 0.1, 0], size: [8, 0.2, 400] },      // East mid street
            
            // Diagonal streets
            { pos: [-200, 0.1, -200], size: [150, 0.2, 8] }, // NW diagonal
            { pos: [200, 0.1, 200], size: [150, 0.2, 8] },   // SE diagonal
            { pos: [-200, 0.1, 200], size: [8, 0.2, 150] },  // SW diagonal
            { pos: [200, 0.1, -200], size: [8, 0.2, 150] },  // NE diagonal
            
            // Small alleys
            { pos: [-250, 0.1, -50], size: [80, 0.2, 6] },
            { pos: [250, 0.1, 50], size: [80, 0.2, 6] },
            { pos: [50, 0.1, -250], size: [6, 0.2, 80] },
            { pos: [-50, 0.1, 250], size: [6, 0.2, 80] },
            
            // Parking areas
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
        // Parked and abandoned vehicles for cover
        const vehicles = [
            // Cars on streets
            { pos: [-100, 2, -20], rot: 0.2, type: 'car' },
            { pos: [120, 2, 30], rot: -0.5, type: 'car' },
            { pos: [-180, 2, 120], rot: 0, type: 'van' },
            { pos: [200, 2, -150], rot: 1.2, type: 'car' },
            { pos: [-50, 2, 180], rot: -0.3, type: 'car' },
            { pos: [80, 2, -200], rot: 0.8, type: 'van' },
            
            // Parking lot vehicles
            { pos: [-170, 2, 90], rot: 0, type: 'car' },
            { pos: [-190, 2, 90], rot: 0, type: 'car' },
            { pos: [-170, 2, 110], rot: 0, type: 'van' },
            { pos: [170, 2, -90], rot: 3.14, type: 'car' },
            { pos: [190, 2, -90], rot: 3.14, type: 'car' },
            { pos: [170, 2, -110], rot: 3.14, type: 'van' },
            
            // Abandoned/destroyed vehicles for cover
            { pos: [0, 2, -80], rot: 0.4, type: 'destroyed' },
            { pos: [-130, 2, 0], rot: -0.6, type: 'destroyed' },
            { pos: [150, 2, 50], rot: 1.0, type: 'destroyed' },
            
            // Trucks and vans
            { pos: [-250, 3, -100], rot: 1.57, type: 'truck' },
            { pos: [280, 3, 150], rot: -1.57, type: 'truck' },
            { pos: [50, 2, 250], rot: 0, type: 'van' },
        ];
        
        vehicles.forEach(vehicle => {
            let geometry, material;
            
            if (vehicle.type === 'car') {
                // Car body
                geometry = new THREE.BoxGeometry(8, 3, 4);
                material = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
            } else if (vehicle.type === 'van') {
                // Van body
                geometry = new THREE.BoxGeometry(10, 4, 4.5);
                material = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
            } else if (vehicle.type === 'truck') {
                // Truck body
                geometry = new THREE.BoxGeometry(14, 5, 5);
                material = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });
            } else if (vehicle.type === 'destroyed') {
                // Destroyed car
                geometry = new THREE.BoxGeometry(8, 2.5, 4);
                material = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
            }
            
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(...vehicle.pos);
            mesh.rotation.y = vehicle.rot;
            mesh.castShadow = true;
            this.scene.add(mesh);
            
            // Add wheels
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
        });
    }
    
    createTrees() {
        // Trees and vegetation for atmosphere
        const trees = [
            // Street trees
            { pos: [-30, 0, -180], size: 1.2 },
            { pos: [30, 0, -180], size: 1.0 },
            { pos: [-30, 0, 180], size: 1.1 },
            { pos: [30, 0, 180], size: 1.3 },
            
            // Park area trees
            { pos: [-200, 0, 250], size: 1.5 },
            { pos: [-220, 0, 270], size: 1.2 },
            { pos: [-180, 0, 270], size: 1.0 },
            { pos: [-210, 0, 290], size: 1.4 },
            
            { pos: [200, 0, -250], size: 1.3 },
            { pos: [220, 0, -270], size: 1.1 },
            { pos: [180, 0, -270], size: 1.2 },
            
            // Scattered trees
            { pos: [-100, 0, -50], size: 0.9 },
            { pos: [100, 0, 50], size: 1.0 },
            { pos: [-280, 0, 0], size: 1.4 },
            { pos: [280, 0, 0], size: 1.3 },
            { pos: [0, 0, -280], size: 1.2 },
            { pos: [0, 0, 280], size: 1.1 },
            
            // Corner trees
            { pos: [-350, 0, -350], size: 1.5 },
            { pos: [350, 0, 350], size: 1.5 },
            { pos: [-350, 0, 350], size: 1.4 },
            { pos: [350, 0, -350], size: 1.4 },
        ];
        
        trees.forEach(tree => {
            // Tree trunk
            const trunkGeometry = new THREE.CylinderGeometry(
                tree.size * 0.8, 
                tree.size * 1.2, 
                8 * tree.size, 
                6
            );
            const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x3a2a1a });
            const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
            trunk.position.set(tree.pos[0], tree.pos[1] + 4 * tree.size, tree.pos[2]);
            trunk.castShadow = true;
            this.scene.add(trunk);
            
            // Tree leaves (3 layers for fuller look)
            const leafMaterial = new THREE.MeshLambertMaterial({ color: 0x1a3a1a });
            
            // Bottom layer
            const leaves1 = new THREE.Mesh(
                new THREE.ConeGeometry(5 * tree.size, 6 * tree.size, 6),
                leafMaterial
            );
            leaves1.position.set(tree.pos[0], tree.pos[1] + 10 * tree.size, tree.pos[2]);
            leaves1.castShadow = true;
            this.scene.add(leaves1);
            
            // Middle layer
            const leaves2 = new THREE.Mesh(
                new THREE.ConeGeometry(4 * tree.size, 5 * tree.size, 6),
                leafMaterial
            );
            leaves2.position.set(tree.pos[0], tree.pos[1] + 13 * tree.size, tree.pos[2]);
            leaves2.castShadow = true;
            this.scene.add(leaves2);
            
            // Top layer
            const leaves3 = new THREE.Mesh(
                new THREE.ConeGeometry(3 * tree.size, 4 * tree.size, 6),
                leafMaterial
            );
            leaves3.position.set(tree.pos[0], tree.pos[1] + 16 * tree.size, tree.pos[2]);
            leaves3.castShadow = true;
            this.scene.add(leaves3);
        });
    }
    
    createCityProps() {
        // Street lamps, benches, trash cans, etc.
        const props = [
            // Street lamps
            { type: 'lamp', pos: [-75, 0, -100] },
            { type: 'lamp', pos: [75, 0, -100] },
            { type: 'lamp', pos: [-75, 0, 100] },
            { type: 'lamp', pos: [75, 0, 100] },
            { type: 'lamp', pos: [-150, 0, 0] },
            { type: 'lamp', pos: [150, 0, 0] },
            
            // Benches
            { type: 'bench', pos: [-50, 1, -200], rot: 0 },
            { type: 'bench', pos: [50, 1, 200], rot: 3.14 },
            { type: 'bench', pos: [-200, 1, 50], rot: 1.57 },
            { type: 'bench', pos: [200, 1, -50], rot: -1.57 },
            
            // Trash bins
            { type: 'bin', pos: [-20, 0, -150] },
            { type: 'bin', pos: [20, 0, 150] },
            { type: 'bin', pos: [-100, 0, 20] },
            { type: 'bin', pos: [100, 0, -20] },
            
            // Bus stops
            { type: 'busStop', pos: [-120, 0, -50], rot: 0 },
            { type: 'busStop', pos: [120, 0, 50], rot: 3.14 },
        ];
        
        props.forEach(prop => {
            if (prop.type === 'lamp') {
                // Lamp post
                const postGeometry = new THREE.CylinderGeometry(0.3, 0.4, 15, 6);
                const postMaterial = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
                const post = new THREE.Mesh(postGeometry, postMaterial);
                post.position.set(prop.pos[0], prop.pos[1] + 7.5, prop.pos[2]);
                this.scene.add(post);
                
                // Lamp light
                const lampLight = new THREE.PointLight(0xffaa66, 0.5, 40);
                lampLight.position.set(prop.pos[0], prop.pos[1] + 14, prop.pos[2]);
                this.scene.add(lampLight);
                
            } else if (prop.type === 'bench') {
                const benchGeometry = new THREE.BoxGeometry(6, 1, 2);
                const benchMaterial = new THREE.MeshLambertMaterial({ color: 0x4a3a2a });
                const bench = new THREE.Mesh(benchGeometry, benchMaterial);
                bench.position.set(...prop.pos);
                bench.rotation.y = prop.rot;
                this.scene.add(bench);
                
            } else if (prop.type === 'bin') {
                const binGeometry = new THREE.CylinderGeometry(1, 1.2, 3, 6);
                const binMaterial = new THREE.MeshLambertMaterial({ color: 0x2a4a2a });
                const bin = new THREE.Mesh(binGeometry, binMaterial);
                bin.position.set(prop.pos[0], prop.pos[1] + 1.5, prop.pos[2]);
                this.scene.add(bin);
                
            } else if (prop.type === 'busStop') {
                // Bus stop shelter
                const shelterGeometry = new THREE.BoxGeometry(8, 10, 3);
                const shelterMaterial = new THREE.MeshLambertMaterial({ 
                    color: 0x3a3a4a,
                    transparent: true,
                    opacity: 0.8
                });
                const shelter = new THREE.Mesh(shelterGeometry, shelterMaterial);
                shelter.position.set(prop.pos[0], prop.pos[1] + 5, prop.pos[2]);
                shelter.rotation.y = prop.rot;
                this.scene.add(shelter);
            }
        });
    }

    createHidingSpots() {
        // Tactical cover spots for intense gunfights
        const covers = [
            // Site A cover boxes
            { pos: [-180, 3, -220], size: [8, 6, 8], type: 'crate' },
            { pos: [-220, 3, -280], size: [12, 6, 8], type: 'crate' },
            { pos: [-150, 2, -250], size: [6, 4, 12], type: 'crate' },
            
            // Mid area cover
            { pos: [0, 3, -150], size: [15, 6, 6], type: 'crate' },
            { pos: [-30, 2, -70], size: [8, 4, 8], type: 'crate' },
            { pos: [30, 2, -70], size: [8, 4, 8], type: 'crate' },
            
            // Site B cover
            { pos: [180, 3, 220], size: [8, 6, 8], type: 'crate' },
            { pos: [220, 3, 280], size: [12, 6, 8], type: 'crate' },
            { pos: [150, 2, 250], size: [6, 4, 12], type: 'crate' },
            
            // Long A corridor cover
            { pos: [-100, 2, -150], size: [6, 4, 20], type: 'wall' },
            { pos: [-120, 2, -180], size: [20, 4, 6], type: 'wall' },
            
            // Long B corridor cover
            { pos: [100, 2, 150], size: [6, 4, 20], type: 'wall' },
            { pos: [120, 2, 180], size: [20, 4, 6], type: 'wall' },
            
            // Connector passage walls
            { pos: [0, 4, 50], size: [100, 8, 4], type: 'wall' },
            { pos: [0, 4, -50], size: [100, 8, 4], type: 'wall' },
            
            // Sniper nest barriers
            { pos: [-320, 2, -320], size: [15, 4, 4], type: 'wall' },
            { pos: [320, 2, 320], size: [15, 4, 4], type: 'wall' },
            { pos: [320, 2, -320], size: [4, 4, 15], type: 'wall' },
            { pos: [-320, 2, 320], size: [4, 4, 15], type: 'wall' },
            
            // Scattered tactical boxes
            { pos: [180, 3, -100], size: [10, 6, 10], type: 'crate' },
            { pos: [-180, 3, 100], size: [10, 6, 10], type: 'crate' },
            { pos: [250, 2, 0], size: [8, 4, 16], type: 'crate' },
            { pos: [-250, 2, 0], size: [8, 4, 16], type: 'crate' },
            
            // Tunnel entrance cover
            { pos: [150, 2, -120], size: [12, 4, 4], type: 'wall' },
            { pos: [-150, 2, 120], size: [12, 4, 4], type: 'wall' },
            
            // Additional strategic barriers
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
}