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
        
        const geometry = new THREE.SphereGeometry(0.5, 8, 6);
        const material = new THREE.MeshBasicMaterial({ 
            color: isOwnBullet ? 0x4444ff : 0xff4444,
            emissive: isOwnBullet ? 0x2222aa : 0xaa2222,
            emissiveIntensity: 0.3
        });
        const bulletMesh = new THREE.Mesh(geometry, material);
        
        // Mark this as a bullet to avoid raycasting it
        bulletMesh.userData.isBullet = true;
        
        bulletMesh.position.copy(startPos);
        this.scene.add(bulletMesh);
        
        // Find the actual impact point (where bullet should stop)
        const actualEndPos = this.findImpactPoint(startPos, endPos);
        
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
            endPos: actualEndPos.clone()  // Use actual impact point, not original target
        };
        
        this.bullets.set(bulletId, bullet);
        
        // Create impact mark at actual impact point
        this.createImpactMark(startPos, endPos, isOwnBullet);
        
        return bulletId;
    }
    
    findImpactPoint(startPos, endPos) {
        const direction = new THREE.Vector3().subVectors(endPos, startPos).normalize();
        this.raycaster.set(startPos, direction);
        this.raycaster.far = startPos.distanceTo(endPos);
        
        // Filter out bullets, impact marks, and other non-solid objects
        const raycastableObjects = this.scene.children.filter(obj => {
            // Skip bullets and impact marks to prevent them from blocking each other
            if (obj.userData && (obj.userData.isBullet || obj.userData.isImpactMark)) {
                return false;
            }
            // Skip spheres (which are bullets)
            if (obj.geometry && obj.geometry.type === 'SphereGeometry') {
                return false;
            }
            // Skip player capsules (other players)
            if (obj.geometry && obj.geometry.type === 'CapsuleGeometry') {
                return false;
            }
            // Skip sprites (name labels)
            if (obj.type === 'Sprite') {
                return false;
            }
            return obj.type === 'Mesh' || obj.type === 'Group';
        });
        
        // Get all objects that can be hit (buildings, ground, etc)
        const intersects = this.raycaster.intersectObjects(raycastableObjects, true);
        
        if (intersects.length > 0) {
            const impact = intersects[0];
            return impact.point;  // Return the actual impact point
        }
        
        return endPos;  // If no impact, return original target
    }
    
    createImpactMark(startPos, endPos, isOwnBullet) {
        const direction = new THREE.Vector3().subVectors(endPos, startPos).normalize();
        this.raycaster.set(startPos, direction);
        this.raycaster.far = startPos.distanceTo(endPos);
        
        // Filter out bullets, impact marks, and other non-solid objects
        const raycastableObjects = this.scene.children.filter(obj => {
            // Skip bullets and impact marks to prevent them from blocking each other
            if (obj.userData && (obj.userData.isBullet || obj.userData.isImpactMark)) {
                return false;
            }
            // Skip spheres (which are bullets)
            if (obj.geometry && obj.geometry.type === 'SphereGeometry') {
                return false;
            }
            // Skip player capsules (other players)
            if (obj.geometry && obj.geometry.type === 'CapsuleGeometry') {
                return false;
            }
            // Skip sprites (name labels)
            if (obj.type === 'Sprite') {
                return false;
            }
            return obj.type === 'Mesh' || obj.type === 'Group';
        });
        
        // Get all objects that can be hit (buildings, ground, etc)
        const intersects = this.raycaster.intersectObjects(raycastableObjects, true);
        
        if (intersects.length > 0) {
            const impact = intersects[0];
            const impactPos = impact.point;
            
            // Create impact mark as a sphere/dot
            const geometry = new THREE.SphereGeometry(2, 8, 8);  // Bigger sphere for far visibility
            const material = new THREE.MeshBasicMaterial({
                color: isOwnBullet ? 0x4444ff : 0xff4444,
                emissive: isOwnBullet ? 0x4444ff : 0xff4444,
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
            if (impact.face) {
                const normal = impact.face.normal.clone();
                normal.transformDirection(impact.object.matrixWorld);
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
    }

    update(deltaTime) {
        const bulletsToRemove = [];
        
        this.bullets.forEach((bullet, id) => {
            bullet.timeAlive += deltaTime;
            
            if (bullet.timeAlive >= bullet.maxTime) {
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