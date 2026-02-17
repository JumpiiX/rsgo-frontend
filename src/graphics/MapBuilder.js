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
        this.createHidingSpots();
        this.createDecorations();
    }

    createGround() {
        const groundGeometry = new THREE.PlaneGeometry(400, 400);
        const ground = new THREE.Mesh(groundGeometry, this.materials.get('ground'));
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }

    createMapBoundaries() {
        const walls = [
            { pos: [0, 12.5, -200], size: [400, 25, 4] },
            { pos: [0, 12.5, 200], size: [400, 25, 4] },
            { pos: [-200, 12.5, 0], size: [4, 25, 400] },
            { pos: [200, 12.5, 0], size: [4, 25, 400] }
        ];

        walls.forEach(wall => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(...wall.size), this.materials.get('wall'));
            mesh.position.set(...wall.pos);
            mesh.castShadow = true;
            this.scene.add(mesh);
        });
    }

    createCityBlocks() {
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
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(...street.size), this.materials.get('street'));
            mesh.position.set(...street.pos);
            mesh.receiveShadow = true;
            this.scene.add(mesh);
        });
    }

    createHidingSpots() {
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