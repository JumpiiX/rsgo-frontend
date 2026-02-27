export class BulletSystem {
    constructor(scene) {
        this.scene = scene;
        this.bullets = new Map();
        this.bulletId = 0;
        this.impacts = new Map();
        this.impactId = 0;
        this.raycaster = new THREE.Raycaster();
    }

    createBullet(startPos, endPos, isOwnBullet = false) {
        const bulletId = this.bulletId++;

        const geometry = new THREE.SphereGeometry(0.15, 8, 6);  // Smaller bullet: 0.15 instead of 0.5
        const material = new THREE.MeshBasicMaterial({
            color: isOwnBullet ? 0xffa500 : 0xff4444,  // Your bullets: bright orange, enemy: red
            emissive: isOwnBullet ? 0xff8c00 : 0xcc2222,
            emissiveIntensity: 0.5
        });
        const bulletMesh = new THREE.Mesh(geometry, material);

        // Mark this as a bullet to avoid raycasting it
        bulletMesh.userData.isBullet = true;

        bulletMesh.position.copy(startPos);
        this.scene.add(bulletMesh);

        // Find the actual impact point (where bullet should stop)
        const impactInfo = this.findImpactPoint(startPos, endPos);
        const actualEndPos = impactInfo.point;

        const direction = new THREE.Vector3().subVectors(actualEndPos, startPos).normalize();
        const distance = startPos.distanceTo(actualEndPos);

        // Calculate travel time based on a constant bullet speed (e.g., 200 units/second)
        const bulletSpeed = 200; // units per second
        const travelTime = Math.max(0.1, distance / bulletSpeed); // Minimum 0.1 seconds

        const bullet = {
            mesh: bulletMesh,
            direction: direction,
            speed: bulletSpeed,
            timeAlive: 0,
            maxTime: travelTime,  // Dynamic time based on actual distance
            startPos: startPos.clone(),
            endPos: actualEndPos.clone(),  // Use actual impact point, not original target
            isOwnBullet: isOwnBullet,
            impactInfo: impactInfo  // Store impact info to create decal later
        };

        this.bullets.set(bulletId, bullet);

        // Don't create impact mark immediately - wait for bullet to arrive!
        // this.createImpactMark(startPos, endPos, isOwnBullet);

        return bulletId;
    }

    findImpactPoint(startPos, endPos) {
        const direction = new THREE.Vector3().subVectors(endPos, startPos).normalize();
        this.raycaster.set(startPos, direction);
        this.raycaster.far = startPos.distanceTo(endPos);

        // Get all mesh objects but filter out unwanted ones
        const meshes = [];
        this.scene.traverse((obj) => {
            // Only include actual mesh objects
            if (obj.type === 'Mesh') {
                // Skip bullets and impact marks
                if (obj.userData && (obj.userData.isBullet || obj.userData.isImpactMark)) {
                    return;
                }
                // Skip spheres that are bullets (but not all spheres)
                if (obj.geometry && obj.geometry.type === 'SphereGeometry' && obj.userData.isBullet) {
                    return;
                }
                meshes.push(obj);
            }
        });

        // Get all objects that can be hit (buildings, ground, players, etc)
        const intersects = this.raycaster.intersectObjects(meshes, false);

        if (intersects.length > 0) {
            const impact = intersects[0];
            return {
                point: impact.point,
                face: impact.face,
                object: impact.object,
                hasImpact: true
            };
        }

        return {
            point: endPos,
            face: null,
            object: null,
            hasImpact: false
        };
    }

    createImpactMarkFromInfo(impactInfo, isOwnBullet) {
        if (!impactInfo.hasImpact) {
            return; // No impact to create
        }

        const impactPos = impactInfo.point;

        // Create impact mark as a sphere/dot
        const geometry = new THREE.SphereGeometry(0.5, 8, 8);  // Smaller decal: 0.5 instead of 2
        const material = new THREE.MeshBasicMaterial({
            color: isOwnBullet ? 0xffa500 : 0xff4444,  // Your impacts: orange, enemy: red
            emissive: isOwnBullet ? 0xffa500 : 0xff4444,
            emissiveIntensity: 1,
            transparent: true,
            opacity: 1,
            fog: false  // Don't let fog hide the markers
        });
        const impactMark = new THREE.Mesh(geometry, material);

        // Mark this as an impact mark
        impactMark.userData.isImpactMark = true;

        impactMark.position.copy(impactPos);

        // Move slightly away from surface to prevent z-fighting
        if (impactInfo.face) {
            const normal = impactInfo.face.normal.clone();
            normal.transformDirection(impactInfo.object.matrixWorld);
            impactMark.position.add(normal.multiplyScalar(0.1));
        }

        // Make sure it renders at maximum priority for visibility
        impactMark.renderOrder = 1000;
        impactMark.material.depthWrite = false;  // Don't write to depth buffer to avoid z-fighting

        this.scene.add(impactMark);

        const impactMarkId = this.impactId++;
        this.impacts.set(impactMarkId, {
            mesh: impactMark,
            timeAlive: 0,
            maxTime: 5.0
        });
    }

    update(deltaTime) {
        const bulletsToRemove = [];

        this.bullets.forEach((bullet, id) => {
            bullet.timeAlive += deltaTime;

            if (bullet.timeAlive >= bullet.maxTime) {
                // Bullet reached its destination - create impact mark NOW!
                this.createImpactMarkFromInfo(bullet.impactInfo, bullet.isOwnBullet);
                bulletsToRemove.push(id);
            } else {
                const progress = bullet.timeAlive / bullet.maxTime;
                bullet.mesh.position.lerpVectors(bullet.startPos, bullet.endPos, progress);
            }
        });

        bulletsToRemove.forEach(id => {
            const bullet = this.bullets.get(id);
            this.scene.remove(bullet.mesh);
            this.bullets.delete(id);
        });

        // Update impact marks
        const impactsToRemove = [];

        this.impacts.forEach((impact, id) => {
            impact.timeAlive += deltaTime;

            if (impact.timeAlive >= impact.maxTime) {
                impactsToRemove.push(id);
            } else {
                // Fade out impact mark over last second
                const timeLeft = impact.maxTime - impact.timeAlive;
                if (timeLeft < 1.0) {
                    impact.mesh.material.opacity = 0.7 * timeLeft;
                }
            }
        });

        impactsToRemove.forEach(id => {
            const impact = this.impacts.get(id);
            this.scene.remove(impact.mesh);
            this.impacts.delete(id);
        });
    }
}
