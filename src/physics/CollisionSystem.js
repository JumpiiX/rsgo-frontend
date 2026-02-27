export class CollisionSystem {
    constructor(scene) {
        this.scene = scene;
        this.colliders = [];
        this.boxColliders = [];
        this.cylinderColliders = [];
    }

    addBoxCollider(position, size, type = 'default') {
        const bounds = {
            minX: position.x - size.x / 2,
            maxX: position.x + size.x / 2,
            minZ: position.z - size.z / 2,
            maxZ: position.z + size.z / 2,
            minY: position.y - size.y / 2,
            maxY: position.y + size.y / 2,
            type: type
        };
        this.boxColliders.push(bounds);
    }

    addCylinderCollider(position, radius, height, type = 'default') {
        const cylinder = {
            x: position.x,
            z: position.z,
            y: position.y,
            radius: radius,
            height: height,
            type: type
        };
        this.cylinderColliders.push(cylinder);
    }

    // Compatibility method for buildings
    addBuildingCollider(position, size) {
        this.addBoxCollider(position, size, 'building');
    }

    checkCollision(position, radius = 1.5) {
        // Check box colliders
        for (const bounds of this.boxColliders) {
            if (position.x + radius > bounds.minX &&
                position.x - radius < bounds.maxX &&
                position.z + radius > bounds.minZ &&
                position.z - radius < bounds.maxZ &&
                position.y >= bounds.minY &&
                position.y <= bounds.maxY + 10) { // Player height allowance
                return true;
            }
        }

        // Check cylinder colliders
        for (const cylinder of this.cylinderColliders) {
            const dx = position.x - cylinder.x;
            const dz = position.z - cylinder.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance < cylinder.radius + radius &&
                position.y >= cylinder.y &&
                position.y <= cylinder.y + cylinder.height) {
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
        // Colliders are now added dynamically by MapBuilder
        // This method is kept for compatibility but does nothing
    }
}
