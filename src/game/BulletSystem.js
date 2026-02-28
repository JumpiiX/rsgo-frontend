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

        const geometry = new THREE.SphereGeometry(0.15, 8, 6);  
        const material = new THREE.MeshBasicMaterial({
            color: isOwnBullet ? 0xffa500 : 0xff4444,  
            emissive: isOwnBullet ? 0xff8c00 : 0xcc2222,
            emissiveIntensity: 0.5
        });
        const bulletMesh = new THREE.Mesh(geometry, material);

        
        bulletMesh.userData.isBullet = true;

        bulletMesh.position.copy(startPos);
        this.scene.add(bulletMesh);

        
        const impactInfo = this.findImpactPoint(startPos, endPos);
        const actualEndPos = impactInfo.point;

        const direction = new THREE.Vector3().subVectors(actualEndPos, startPos).normalize();
        const distance = startPos.distanceTo(actualEndPos);

        
        const bulletSpeed = 200; 
        const travelTime = Math.max(0.1, distance / bulletSpeed); 

        const bullet = {
            mesh: bulletMesh,
            direction: direction,
            speed: bulletSpeed,
            timeAlive: 0,
            maxTime: travelTime,  
            startPos: startPos.clone(),
            endPos: actualEndPos.clone(),  
            isOwnBullet: isOwnBullet,
            impactInfo: impactInfo  
        };

        this.bullets.set(bulletId, bullet);

        
        

        return bulletId;
    }

    findImpactPoint(startPos, endPos) {
        const direction = new THREE.Vector3().subVectors(endPos, startPos).normalize();
        this.raycaster.set(startPos, direction);
        this.raycaster.far = startPos.distanceTo(endPos);

        
        const meshes = [];
        this.scene.traverse((obj) => {
            
            if (obj.type === 'Mesh') {
                
                if (obj.userData && (obj.userData.isBullet || obj.userData.isImpactMark)) {
                    return;
                }
                
                if (obj.geometry && obj.geometry.type === 'SphereGeometry' && obj.userData.isBullet) {
                    return;
                }
                meshes.push(obj);
            }
        });

        
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
            return; 
        }

        const impactPos = impactInfo.point;

        
        const geometry = new THREE.SphereGeometry(0.5, 8, 8);  
        const material = new THREE.MeshBasicMaterial({
            color: isOwnBullet ? 0xffa500 : 0xff4444,  
            emissive: isOwnBullet ? 0xffa500 : 0xff4444,
            emissiveIntensity: 1,
            transparent: true,
            opacity: 1,
            fog: false  
        });
        const impactMark = new THREE.Mesh(geometry, material);

        
        impactMark.userData.isImpactMark = true;

        impactMark.position.copy(impactPos);

        
        if (impactInfo.face) {
            const normal = impactInfo.face.normal.clone();
            normal.transformDirection(impactInfo.object.matrixWorld);
            impactMark.position.add(normal.multiplyScalar(0.1));
        }

        
        impactMark.renderOrder = 1000;
        impactMark.material.depthWrite = false;  

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

        
        const impactsToRemove = [];

        this.impacts.forEach((impact, id) => {
            impact.timeAlive += deltaTime;

            if (impact.timeAlive >= impact.maxTime) {
                impactsToRemove.push(id);
            } else {
                
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
