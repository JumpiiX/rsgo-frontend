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

    checkCollision(position, radius = 2) {
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

    getValidPosition(currentPos, newPos, radius = 2) {
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
        // Main left building - smaller and properly positioned
        this.addBuildingCollider(
            new THREE.Vector3(-100, 30, -80),
            new THREE.Vector3(40, 60, 40)
        );
        
        // Main right building - smaller collision box
        this.addBuildingCollider(
            new THREE.Vector3(120, 35, 80),
            new THREE.Vector3(50, 70, 45)
        );
        
        // Industrial complex at (-180, 20) - adjusted size
        this.addBuildingCollider(
            new THREE.Vector3(-180, 25, 20),
            new THREE.Vector3(40, 50, 40)
        );
        
        // Corner tower structure at (130, -130) - smaller
        this.addBuildingCollider(
            new THREE.Vector3(130, 20, -130),
            new THREE.Vector3(30, 40, 30)
        );
        
        // Additional small buildings
        this.addBuildingCollider(
            new THREE.Vector3(-50, 15, 100),
            new THREE.Vector3(25, 30, 25)
        );
        
        this.addBuildingCollider(
            new THREE.Vector3(50, 15, -50),
            new THREE.Vector3(25, 30, 25)
        );
    }
}