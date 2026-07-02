export class CollisionSystem {
    constructor(scene) {
        this.scene = scene;
        this.colliders = [];
        this.boxColliders = [];
        this.cylinderColliders = [];
    }

    addBoxCollider(position, size, type = 'default', rotation = 0) {
        const box = {
            cx: position.x,
            cz: position.z,
            hx: size.x / 2,
            hz: size.z / 2,
            minY: position.y - size.y / 2,
            maxY: position.y + size.y / 2,
            rotation: rotation,
            cos: Math.cos(-rotation),
            sin: Math.sin(-rotation),
            type: type
        };
        this.boxColliders.push(box);
    }

    removeCollidersByType(type) {
        this.boxColliders = this.boxColliders.filter(c => c.type !== type);
        this.cylinderColliders = this.cylinderColliders.filter(c => c.type !== type);
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

        for (const box of this.boxColliders) {
            if (position.y < box.minY - 5 || position.y > box.maxY + 5) continue;

            const dx = position.x - box.cx;
            const dz = position.z - box.cz;
            const lx = dx * box.cos - dz * box.sin;
            const lz = dx * box.sin + dz * box.cos;
            if (lx + radius > -box.hx && lx - radius < box.hx &&
                lz + radius > -box.hz && lz - radius < box.hz) {
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
