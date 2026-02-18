export class CollisionSystem {
    constructor(scene) {
        this.scene = scene;
        this.colliders = [];
        this.buildingBounds = [];
    }

    addBuildingCollider(position, size) {
        const bounds = {
            minX: position.x - size.x / 2,
            maxX: position.x + size.x / 2,
            minZ: position.z - size.z / 2,
            maxZ: position.z + size.z / 2,
            minY: 0,
            maxY: size.y
        };
        this.buildingBounds.push(bounds);
        
        // Create debug visualization
        const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            wireframe: true,
            transparent: true,
            opacity: 0.0 // Invisible but still used for collision
        });
        const collider = new THREE.Mesh(geometry, material);
        collider.position.copy(position);
        this.colliders.push(collider);
    }

    checkCollision(position, radius = 1.5) {
        // Smaller radius for better movement near walls
        for (const bounds of this.buildingBounds) {
            // Check if position + radius intersects with building bounds
            // Only check X and Z, ignore Y for now (player height is around 10)
            if (position.x + radius > bounds.minX &&
                position.x - radius < bounds.maxX &&
                position.z + radius > bounds.minZ &&
                position.z - radius < bounds.maxZ) {
                return true;
            }
        }
        return false;
    }

    getValidPosition(currentPos, newPos, radius = 1.5) {
        // If new position has no collision, return it
        if (!this.checkCollision(newPos, radius)) {
            return newPos;
        }

        // Try to slide along walls
        const validPos = currentPos.clone();
        
        // Try X movement only
        const xOnly = new THREE.Vector3(newPos.x, currentPos.y, currentPos.z);
        if (!this.checkCollision(xOnly, radius)) {
            validPos.x = newPos.x;
        }
        
        // Try Z movement only
        const zOnly = new THREE.Vector3(currentPos.x, currentPos.y, newPos.z);
        if (!this.checkCollision(zOnly, radius)) {
            validPos.z = newPos.z;
        }
        
        // Always allow Y movement (for jumping/gravity later)
        validPos.y = newPos.y;
        
        return validPos;
    }

    setupBuildingColliders() {
        // Match the actual buildings from MapBuilder.js
        
        // Central plaza area
        this.addBuildingCollider(
            new THREE.Vector3(0, 8, 0),
            new THREE.Vector3(40, 16, 30)
        );
        
        // Residential blocks
        this.addBuildingCollider(
            new THREE.Vector3(-120, 15, -120),
            new THREE.Vector3(60, 30, 40)
        );
        this.addBuildingCollider(
            new THREE.Vector3(120, 15, 120),
            new THREE.Vector3(60, 30, 40)
        );
        this.addBuildingCollider(
            new THREE.Vector3(-120, 12, 80),
            new THREE.Vector3(50, 24, 35)
        );
        this.addBuildingCollider(
            new THREE.Vector3(120, 12, -80),
            new THREE.Vector3(50, 24, 35)
        );
        
        // Smaller buildings
        this.addBuildingCollider(
            new THREE.Vector3(-80, 10, -40),
            new THREE.Vector3(30, 20, 25)
        );
        this.addBuildingCollider(
            new THREE.Vector3(80, 10, 40),
            new THREE.Vector3(30, 20, 25)
        );
        this.addBuildingCollider(
            new THREE.Vector3(-40, 8, -100),
            new THREE.Vector3(25, 16, 20)
        );
        this.addBuildingCollider(
            new THREE.Vector3(40, 8, 100),
            new THREE.Vector3(25, 16, 20)
        );
        
        // Industrial buildings
        this.addBuildingCollider(
            new THREE.Vector3(-160, 18, 0),
            new THREE.Vector3(35, 36, 60)
        );
        this.addBuildingCollider(
            new THREE.Vector3(160, 18, 0),
            new THREE.Vector3(35, 36, 60)
        );
        
        // Map boundary walls
        this.addBuildingCollider(
            new THREE.Vector3(0, 12.5, -200),
            new THREE.Vector3(400, 25, 4)
        );
        this.addBuildingCollider(
            new THREE.Vector3(0, 12.5, 200),
            new THREE.Vector3(400, 25, 4)
        );
        this.addBuildingCollider(
            new THREE.Vector3(-200, 12.5, 0),
            new THREE.Vector3(4, 25, 400)
        );
        this.addBuildingCollider(
            new THREE.Vector3(200, 12.5, 0),
            new THREE.Vector3(4, 25, 400)
        );
        
        // Tactical cover spots
        // Dumpsters
        this.addBuildingCollider(
            new THREE.Vector3(-60, 2, -80),
            new THREE.Vector3(6, 4, 4)
        );
        this.addBuildingCollider(
            new THREE.Vector3(60, 2, 80),
            new THREE.Vector3(6, 4, 4)
        );
        
        // Car wrecks
        this.addBuildingCollider(
            new THREE.Vector3(25, 2, -15),
            new THREE.Vector3(8, 4, 3)
        );
        this.addBuildingCollider(
            new THREE.Vector3(-25, 2, 15),
            new THREE.Vector3(8, 4, 3)
        );
        
        // Shipping containers
        this.addBuildingCollider(
            new THREE.Vector3(140, 4, -140),
            new THREE.Vector3(15, 8, 6)
        );
        this.addBuildingCollider(
            new THREE.Vector3(-140, 4, 140),
            new THREE.Vector3(15, 8, 6)
        );
        
        // Small kiosks
        this.addBuildingCollider(
            new THREE.Vector3(70, 3, -70),
            new THREE.Vector3(4, 6, 4)
        );
        this.addBuildingCollider(
            new THREE.Vector3(-70, 3, 70),
            new THREE.Vector3(4, 6, 4)
        );
        
        // Corner barriers
        this.addBuildingCollider(
            new THREE.Vector3(90, 1.5, -90),
            new THREE.Vector3(3, 3, 12)
        );
        this.addBuildingCollider(
            new THREE.Vector3(-90, 1.5, 90),
            new THREE.Vector3(3, 3, 12)
        );
    }
}