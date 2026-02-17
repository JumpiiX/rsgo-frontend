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
        
        bulletMesh.position.copy(startPos);
        this.scene.add(bulletMesh);
        
        const direction = new THREE.Vector3().subVectors(endPos, startPos).normalize();
        const distance = startPos.distanceTo(endPos);
        const speed = distance / 0.5; // 0.5 seconds travel time
        
        const bullet = {
            mesh: bulletMesh,
            direction: direction,
            speed: speed,
            timeAlive: 0,
            maxTime: 0.5,
            startPos: startPos.clone(),
            endPos: endPos.clone()
        };
        
        this.bullets.set(bulletId, bullet);
        
        // Check for impact point
        this.createImpactMark(startPos, endPos, isOwnBullet);
        
        return bulletId;
    }
    
    createImpactMark(startPos, endPos, isOwnBullet) {
        const direction = new THREE.Vector3().subVectors(endPos, startPos).normalize();
        this.raycaster.set(startPos, direction);
        this.raycaster.far = startPos.distanceTo(endPos);
        
        // Get all objects that can be hit (buildings, ground, etc)
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);
        
        if (intersects.length > 0) {
            const impact = intersects[0];
            const impactPos = impact.point;
            
            // Create impact mark
            const geometry = new THREE.PlaneGeometry(2, 2);
            const material = new THREE.MeshBasicMaterial({
                color: isOwnBullet ? 0x4444ff : 0xff4444,
                transparent: true,
                opacity: 0.7,
                side: THREE.DoubleSide
            });
            const impactMark = new THREE.Mesh(geometry, material);
            
            impactMark.position.copy(impactPos);
            
            // Align impact mark with surface normal
            if (impact.face) {
                const normal = impact.face.normal.clone();
                normal.transformDirection(impact.object.matrixWorld);
                impactMark.lookAt(impactPos.clone().add(normal));
            }
            
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