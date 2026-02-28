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

    
    addBuildingCollider(position, size) {
        this.addBoxCollider(position, size, 'building');
    }

    checkCollision(position, radius = 1.5) {
        
        for (const bounds of this.boxColliders) {
            if (position.x + radius > bounds.minX &&
                position.x - radius < bounds.maxX &&
                position.z + radius > bounds.minZ &&
                position.z - radius < bounds.maxZ &&
                position.y >= bounds.minY &&
                position.y <= bounds.maxY + 10) { 
                return true;
            }
        }

        
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
        
        if (!this.checkCollision(newPos, radius)) {
            return newPos;
        }

        
        const validPos = currentPos.clone();

        
        const xOnly = new THREE.Vector3(newPos.x, currentPos.y, currentPos.z);
        if (!this.checkCollision(xOnly, radius)) {
            validPos.x = newPos.x;
        }

        
        const zOnly = new THREE.Vector3(currentPos.x, currentPos.y, newPos.z);
        if (!this.checkCollision(zOnly, radius)) {
            validPos.z = newPos.z;
        }

        
        validPos.y = newPos.y;

        return validPos;
    }

    setupBuildingColliders() {
        
        
    }
}
