import { MaterialManager } from '../utils/MaterialManager.js';

export class MapBuilder {
    constructor(scene, collisionSystem = null) {
        this.scene = scene;
        this.collisionSystem = collisionSystem;
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
        
        const trees = [
            
            { pos: [-30, 0, -180], size: 1.2 },
            { pos: [30, 0, -180], size: 1.0 },
            { pos: [-30, 0, 180], size: 1.1 },
            { pos: [30, 0, 180], size: 1.3 },

            
            { pos: [-200, 0, 250], size: 1.5 },
            { pos: [-220, 0, 270], size: 1.2 },
            { pos: [-180, 0, 270], size: 1.0 },
            { pos: [-210, 0, 290], size: 1.4 },

            { pos: [200, 0, -250], size: 1.3 },
            { pos: [220, 0, -270], size: 1.1 },
            { pos: [180, 0, -270], size: 1.2 },

            
            { pos: [-100, 0, -50], size: 0.9 },
            { pos: [100, 0, 50], size: 1.0 },
            { pos: [-280, 0, 0], size: 1.4 },
            { pos: [280, 0, 0], size: 1.3 },
            { pos: [0, 0, -280], size: 1.2 },
            { pos: [0, 0, 280], size: 1.1 },

            
            { pos: [-350, 0, -350], size: 1.5 },
            { pos: [350, 0, 350], size: 1.5 },
            { pos: [-350, 0, 350], size: 1.4 },
            { pos: [350, 0, -350], size: 1.4 },
        ];

        trees.forEach(tree => {
            
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

            
            const leafMaterial = new THREE.MeshLambertMaterial({ color: 0x1a3a1a });

            
            const leaves1 = new THREE.Mesh(
                new THREE.ConeGeometry(5 * tree.size, 6 * tree.size, 6),
                leafMaterial
            );
            leaves1.position.set(tree.pos[0], tree.pos[1] + 10 * tree.size, tree.pos[2]);
            leaves1.castShadow = true;
            this.scene.add(leaves1);

            
            const leaves2 = new THREE.Mesh(
                new THREE.ConeGeometry(4 * tree.size, 5 * tree.size, 6),
                leafMaterial
            );
            leaves2.position.set(tree.pos[0], tree.pos[1] + 13 * tree.size, tree.pos[2]);
            leaves2.castShadow = true;
            this.scene.add(leaves2);

            
            const leaves3 = new THREE.Mesh(
                new THREE.ConeGeometry(3 * tree.size, 4 * tree.size, 6),
                leafMaterial
            );
            leaves3.position.set(tree.pos[0], tree.pos[1] + 16 * tree.size, tree.pos[2]);
            leaves3.castShadow = true;
            this.scene.add(leaves3);

            
            if (this.collisionSystem) {
                this.collisionSystem.addCylinderCollider(
                    new THREE.Vector3(tree.pos[0], tree.pos[1], tree.pos[2]),
                    tree.size * 1.5,  
                    20 * tree.size,   
                    'tree'
                );
            }
        });
    }

    createCityProps() {
        
        const props = [
            
            { type: 'lamp', pos: [-75, 0, -100] },
            { type: 'lamp', pos: [75, 0, -100] },
            { type: 'lamp', pos: [-75, 0, 100] },
            { type: 'lamp', pos: [75, 0, 100] },
            { type: 'lamp', pos: [-150, 0, 0] },
            { type: 'lamp', pos: [150, 0, 0] },

            
            { type: 'bench', pos: [-50, 1, -200], rot: 0 },
            { type: 'bench', pos: [50, 1, 200], rot: 3.14 },
            { type: 'bench', pos: [-200, 1, 50], rot: 1.57 },
            { type: 'bench', pos: [200, 1, -50], rot: -1.57 },

            
            { type: 'bin', pos: [-20, 0, -150] },
            { type: 'bin', pos: [20, 0, 150] },
            { type: 'bin', pos: [-100, 0, 20] },
            { type: 'bin', pos: [100, 0, -20] },

            
            { type: 'busStop', pos: [-120, 0, -50], rot: 0 },
            { type: 'busStop', pos: [120, 0, 50], rot: 3.14 },
        ];

        props.forEach(prop => {
            if (prop.type === 'lamp') {
                
                const postGeometry = new THREE.CylinderGeometry(0.3, 0.4, 15, 6);
                const postMaterial = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
                const post = new THREE.Mesh(postGeometry, postMaterial);
                post.position.set(prop.pos[0], prop.pos[1] + 7.5, prop.pos[2]);
                this.scene.add(post);

                
                const lampLight = new THREE.PointLight(0xffaa66, 0.5, 40);
                lampLight.position.set(prop.pos[0], prop.pos[1] + 14, prop.pos[2]);
                this.scene.add(lampLight);

                
                if (this.collisionSystem) {
                    this.collisionSystem.addCylinderCollider(
                        new THREE.Vector3(prop.pos[0], prop.pos[1], prop.pos[2]),
                        0.5,  
                        15,   
                        'prop'
                    );
                }

            } else if (prop.type === 'bench') {
                const benchGeometry = new THREE.BoxGeometry(6, 1, 2);
                const benchMaterial = new THREE.MeshLambertMaterial({ color: 0x4a3a2a });
                const bench = new THREE.Mesh(benchGeometry, benchMaterial);
                bench.position.set(...prop.pos);
                bench.rotation.y = prop.rot;
                this.scene.add(bench);

                
                if (this.collisionSystem) {
                    this.collisionSystem.addBoxCollider(
                        new THREE.Vector3(...prop.pos),
                        new THREE.Vector3(6, 1, 2),
                        'prop'
                    );
                }

            } else if (prop.type === 'bin') {
                const binGeometry = new THREE.CylinderGeometry(1, 1.2, 3, 6);
                const binMaterial = new THREE.MeshLambertMaterial({ color: 0x2a4a2a });
                const bin = new THREE.Mesh(binGeometry, binMaterial);
                bin.position.set(prop.pos[0], prop.pos[1] + 1.5, prop.pos[2]);
                this.scene.add(bin);

                
                if (this.collisionSystem) {
                    this.collisionSystem.addCylinderCollider(
                        new THREE.Vector3(prop.pos[0], prop.pos[1], prop.pos[2]),
                        1.2,  
                        3,    
                        'prop'
                    );
                }

            } else if (prop.type === 'busStop') {
                
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

                
                if (this.collisionSystem) {
                    this.collisionSystem.addBoxCollider(
                        new THREE.Vector3(prop.pos[0], prop.pos[1] + 5, prop.pos[2]),
                        new THREE.Vector3(8, 10, 3),
                        'prop'
                    );
                }
            }
        });
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

            
            const fireLight = new THREE.PointLight(0xff4400, 0.7, 30);
            fireLight.position.set(pos[0], pos[1] + 4, pos[2]);
            this.scene.add(fireLight);
        });

        
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

            
            const towerLight = new THREE.PointLight(0xff0000, 0.8, 100);
            towerLight.position.set(pos[0], pos[1] + 35, pos[2]);
            this.scene.add(towerLight);
        });
    }

    createSpawnMarkers() {
        
        const spawnPoints = [
            
            { x: -30, y: 10, z: 320 },      
            { x: -50, y: 10, z: 330 },      
            { x: 50, y: 10, z: 330 },       
            { x: -100, y: 10, z: 300 },     
            { x: 100, y: 10, z: 300 },      

            
            
            { x: -50, y: 10, z: -330 },     
            { x: 50, y: 10, z: -330 },      
            { x: -100, y: 10, z: -300 },    
            { x: 100, y: 10, z: -300 },     

            
            { x: -200, y: 10, z: 100 },     
            { x: 200, y: 10, z: -100 },     
            { x: -50, y: 10, z: 150 },      
            { x: -100, y: 10, z: -100 },    
            { x: 100, y: 10, z: 100 },      
        ];

        
        const spawnColors = [
            0xFF1493,  
            0xFF4500,  
            0xFFD700,  
            0x32CD32,  
            0x00CED1,  
            0x1E90FF,  
            0x8A2BE2,  
            0xDC143C,  
            0xFF69B4,  
            0x00FA9A,  
            0xFFB6C1,  
            0x20B2AA,  
            0xF0E68C,  
            0x9ACD32,  
            0xFF6347,  
        ];

        spawnPoints.forEach((spawn, index) => {
            const color = spawnColors[index];

            
            const lineGeometry = new THREE.CylinderGeometry(1, 1, 200, 8);
            const lineMaterial = new THREE.MeshBasicMaterial({
                color: color,
                emissive: color,
                emissiveIntensity: 1
            });
            const line = new THREE.Mesh(lineGeometry, lineMaterial);
            line.position.set(spawn.x, spawn.y + 100, spawn.z); 
            this.scene.add(line);

            
            const sphereGeometry = new THREE.SphereGeometry(3, 8, 8);
            const sphereMaterial = new THREE.MeshBasicMaterial({
                color: color,
                emissive: color,
                emissiveIntensity: 0.5
            });
            const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
            sphere.position.set(spawn.x, spawn.y, spawn.z);
            this.scene.add(sphere);
        });

        console.log('DEBUG: Spawn markers RE-ENABLED with new colors:');
        console.log('  T-Side (1-5): Deep Pink, Orange Red, Gold, Lime Green, Dark Turquoise');
        console.log('  CT-Side (6-10): Dodger Blue, Blue Violet, Crimson, Hot Pink, Medium Spring Green');
        console.log('  Mid (11-15): Light Pink, Light Sea Green, Khaki, Yellow Green, Tomato');
    }
}
