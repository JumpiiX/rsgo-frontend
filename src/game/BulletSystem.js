export class BulletSystem {
    constructor(scene) {
        this.scene = scene;
        this.tracers = new Map();
        this.tracerId = 0;
        this.impacts = new Map();
        this.impactId = 0;
        this.sparks = new Map();
        this.sparkId = 0;
        this.raycaster = new THREE.Raycaster();
    }

    createBullet(startPos, endPos, isOwnBullet = false) {
        const impactInfo = this.findImpactPoint(startPos, endPos);
        const actualEndPos = impactInfo.point;

        this.createTracer(startPos, actualEndPos, isOwnBullet);
        this.createMuzzleSpark(startPos, isOwnBullet);

        if (impactInfo.hasImpact) {
            this.createImpactBurst(actualEndPos, impactInfo, isOwnBullet);
            this.createImpactMarkFromInfo(impactInfo, isOwnBullet);
        }

        return null;
    }

    createTracer(startPos, endPos, isOwnBullet) {
        const color = 0xef4e23;
        const geometry = new THREE.BufferGeometry().setFromPoints([startPos, endPos]);
        const material = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.7,
            linewidth: 1,
            depthWrite: false,
            fog: false,
        });
        const line = new THREE.Line(geometry, material);
        line.userData.isBullet = true;
        line.renderOrder = 999;
        this.scene.add(line);

        const id = this.tracerId++;
        this.tracers.set(id, {
            mesh: line,
            timeAlive: 0,
            maxTime: 0.06,
        });
    }

    createMuzzleSpark(pos, isOwnBullet) {
        const color = 0xef4e23;
        const geometry = new THREE.SphereGeometry(0.18, 6, 6);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(pos);
        mesh.userData.isBullet = true;
        this.scene.add(mesh);

        const id = this.sparkId++;
        this.sparks.set(id, {
            mesh,
            timeAlive: 0,
            maxTime: 0.06,
            startScale: 1,
            endScale: 0.3,
        });
    }

    createImpactBurst(pos, impactInfo, isOwnBullet) {
        const isPlayer = impactInfo.object && impactInfo.object.userData &&
            (impactInfo.object.userData.isPlayer || impactInfo.object.userData.playerId);
        const color = 0xef4e23;
        const size = isPlayer ? 0.45 : 0.3;

        const geometry = new THREE.SphereGeometry(size, 8, 6);
        const material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(pos);
        mesh.userData.isBullet = true;
        mesh.renderOrder = 999;
        this.scene.add(mesh);

        const id = this.sparkId++;
        this.sparks.set(id, {
            mesh,
            timeAlive: 0,
            maxTime: 0.18,
            startScale: 1,
            endScale: 2.4,
        });
    }

    findImpactPoint(startPos, endPos) {
        const direction = new THREE.Vector3().subVectors(endPos, startPos).normalize();
        this.raycaster.set(startPos, direction);
        this.raycaster.far = startPos.distanceTo(endPos);

        const meshes = [];
        this.scene.traverse((obj) => {
            if (obj.type !== 'Mesh') return;
            if (obj.userData && (obj.userData.isBullet || obj.userData.isImpactMark)) return;
            if (obj.geometry && obj.geometry.type === 'SphereGeometry' && obj.userData.isBullet) return;
            meshes.push(obj);
        });

        const intersects = this.raycaster.intersectObjects(meshes, false);

        if (intersects.length > 0) {
            const impact = intersects[0];
            return {
                point: impact.point,
                face: impact.face,
                object: impact.object,
                hasImpact: true,
            };
        }

        return {
            point: endPos,
            face: null,
            object: null,
            hasImpact: false,
        };
    }

    createImpactMarkFromInfo(impactInfo, isOwnBullet) {
        if (!impactInfo.hasImpact) return;

        if (impactInfo.object && impactInfo.object.userData &&
            (impactInfo.object.userData.isDestructible || impactInfo.object.userData.wallType === 'destructible')) {
            return;
        }

        const isPlayer = impactInfo.object && impactInfo.object.userData &&
            (impactInfo.object.userData.isPlayer || impactInfo.object.userData.playerId);
        if (isPlayer) return;

        const impactPos = impactInfo.point;

        const geometry = new THREE.CircleGeometry(0.18, 12);
        const material = new THREE.MeshBasicMaterial({
            color: 0xef4e23,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            fog: false,
            side: THREE.DoubleSide,
        });
        const decal = new THREE.Mesh(geometry, material);
        decal.userData.isImpactMark = true;
        decal.position.copy(impactPos);

        if (impactInfo.face) {
            const normal = impactInfo.face.normal.clone();
            normal.transformDirection(impactInfo.object.matrixWorld);
            decal.position.add(normal.multiplyScalar(0.02));
            const lookTarget = decal.position.clone().add(normal);
            decal.lookAt(lookTarget);
        }

        decal.renderOrder = 998;
        this.scene.add(decal);

        const id = this.impactId++;
        this.impacts.set(id, {
            mesh: decal,
            timeAlive: 0,
            maxTime: 6.0,
        });
    }

    update(deltaTime) {
        const tracersToRemove = [];
        this.tracers.forEach((tracer, id) => {
            tracer.timeAlive += deltaTime;
            const t = tracer.timeAlive / tracer.maxTime;
            if (t >= 1) {
                tracersToRemove.push(id);
            } else {
                tracer.mesh.material.opacity = 0.95 * (1 - t);
            }
        });
        tracersToRemove.forEach(id => {
            const t = this.tracers.get(id);
            this.scene.remove(t.mesh);
            t.mesh.geometry.dispose();
            t.mesh.material.dispose();
            this.tracers.delete(id);
        });

        const sparksToRemove = [];
        this.sparks.forEach((spark, id) => {
            spark.timeAlive += deltaTime;
            const t = spark.timeAlive / spark.maxTime;
            if (t >= 1) {
                sparksToRemove.push(id);
            } else {
                const scale = spark.startScale + (spark.endScale - spark.startScale) * t;
                spark.mesh.scale.setScalar(scale);
                spark.mesh.material.opacity = (1 - t) * 0.9;
            }
        });
        sparksToRemove.forEach(id => {
            const s = this.sparks.get(id);
            this.scene.remove(s.mesh);
            s.mesh.geometry.dispose();
            s.mesh.material.dispose();
            this.sparks.delete(id);
        });

        const impactsToRemove = [];
        this.impacts.forEach((impact, id) => {
            impact.timeAlive += deltaTime;
            if (impact.timeAlive >= impact.maxTime) {
                impactsToRemove.push(id);
            } else {
                const timeLeft = impact.maxTime - impact.timeAlive;
                if (timeLeft < 1.0) {
                    impact.mesh.material.opacity = 0.85 * timeLeft;
                }
            }
        });
        impactsToRemove.forEach(id => {
            const impact = this.impacts.get(id);
            this.scene.remove(impact.mesh);
            impact.mesh.geometry.dispose();
            impact.mesh.material.dispose();
            this.impacts.delete(id);
        });
    }
}
