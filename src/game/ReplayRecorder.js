export class ReplayRecorder {
    constructor({ playerManager, bulletSystem, getLocalPlayerId, getLocalTransform, scene }) {
        this.playerManager = playerManager;
        this.bulletSystem = bulletSystem;
        this.getLocalPlayerId = getLocalPlayerId;
        this.getLocalTransform = getLocalTransform;
        this.scene = scene;

        this.bufferDuration = 6.0;
        this.snapshotInterval = 1 / 30;
        this.snapshots = [];
        this.pendingShots = [];
        this.lastSnapshotTime = 0;

        this.localBodyMesh = null;
        this.localBodyMixer = null;
        this.frozenLivePositions = null;
        this.replayedShotIndex = 0;
        this.isPlaying = false;
        this.suppressLiveShots = false;
    }

    recordShotEvent(shooterId, sx, sy, sz, tx, ty, tz) {
        if (!shooterId) return;
        this.pendingShots.push({
            shooterId,
            sx, sy, sz, tx, ty, tz,
            t: performance.now() / 1000,
        });
    }

    captureFrame() {
        const now = performance.now() / 1000;
        if (now - this.lastSnapshotTime < this.snapshotInterval) return;
        this.lastSnapshotTime = now;

        const players = [];
        const localId = this.getLocalPlayerId && this.getLocalPlayerId();
        if (localId && this.getLocalTransform) {
            const t = this.getLocalTransform();
            if (t) {
                players.push({
                    id: localId,
                    x: t.x, y: t.y, z: t.z,
                    yaw: t.yaw, pitch: t.pitch,
                    alive: t.alive !== false,
                });
            }
        }

        this.playerManager.otherPlayers.forEach((p, id) => {
            if (!p || !p.mesh) return;
            const pos = p.mesh.position;
            players.push({
                id,
                x: pos.x, y: pos.y, z: pos.z,
                yaw: p.mesh.rotation.y,
                pitch: p.pitch || 0,
                alive: true,
            });
        });

        const shotsThisFrame = this.pendingShots;
        this.pendingShots = [];

        this.snapshots.push({ t: now, players, shots: shotsThisFrame });

        const cutoff = now - this.bufferDuration;
        while (this.snapshots.length > 0 && this.snapshots[0].t < cutoff) {
            this.snapshots.shift();
        }
    }

    ensureLocalBodyMesh() {
        if (this.localBodyMesh) return this.localBodyMesh;

        // Show the dead local player as their REAL character (the player who got
        // killed should appear with their own skin in the kill cam, not a red
        // capsule). Falls back to a capsule if the model can't be built.
        let mesh = null;
        try {
            const localId = this.getLocalPlayerId && this.getLocalPlayerId();
            if (localId && this.playerManager.createStandaloneModel) {
                const built = this.playerManager.createStandaloneModel(localId);
                if (built) {
                    mesh = built.mesh;
                    this.localBodyMixer = built.mixer;
                }
            }
        } catch (e) {
            console.warn('Replay local body model failed, using capsule:', e);
            mesh = null;
        }
        if (!mesh) {
            const geometry = new THREE.CapsuleGeometry(2, 5, 4, 8);
            const material = new THREE.MeshLambertMaterial({ color: 0xff6b35, emissive: 0x994020, emissiveIntensity: 0.3 });
            mesh = new THREE.Mesh(geometry, material);
            this.localBodyMixer = null;
        }
        mesh.visible = false;
        mesh.userData.isReplayLocalBody = true;
        this.scene.add(mesh);
        this.localBodyMesh = mesh;
        return mesh;
    }

    findBracketingSnapshots(time) {
        if (this.snapshots.length === 0) return null;
        if (time <= this.snapshots[0].t) return { a: this.snapshots[0], b: this.snapshots[0], k: 0 };
        if (time >= this.snapshots[this.snapshots.length - 1].t) {
            const last = this.snapshots[this.snapshots.length - 1];
            return { a: last, b: last, k: 0 };
        }
        let lo = 0, hi = this.snapshots.length - 1;
        while (lo + 1 < hi) {
            const mid = (lo + hi) >> 1;
            if (this.snapshots[mid].t <= time) lo = mid;
            else hi = mid;
        }
        const a = this.snapshots[lo];
        const b = this.snapshots[hi];
        const span = b.t - a.t;
        const k = span > 0 ? (time - a.t) / span : 0;
        return { a, b, k };
    }

    lerp(a, b, t) { return a + (b - a) * t; }
    lerpAngle(a, b, t) {
        let diff = b - a;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        return a + diff * t;
    }

    interpPlayer(a, b, k, id) {
        const pa = a.players.find(p => p.id === id);
        const pb = b.players.find(p => p.id === id);
        if (!pa && !pb) return null;
        if (!pa) return pb;
        if (!pb) return pa;
        return {
            id,
            x: this.lerp(pa.x, pb.x, k),
            y: this.lerp(pa.y, pb.y, k),
            z: this.lerp(pa.z, pb.z, k),
            yaw: this.lerpAngle(pa.yaw, pb.yaw, k),
            pitch: this.lerp(pa.pitch, pb.pitch, k),
            alive: pb.alive,
        };
    }

    startPlayback(replayDuration = 5.0) {
        if (this.snapshots.length === 0) return false;
        const now = performance.now() / 1000;

        // Flush any pending shots (the KILLING shot is fired right before death
        // and would otherwise sit unflushed in pendingShots → never replayed,
        // which is why the last shot was missing from the kill cam). Append a
        // final snapshot at the current positions so the killing blow is in the
        // replay window.
        if (this.pendingShots.length > 0) {
            const players = [];
            const lid = this.getLocalPlayerId && this.getLocalPlayerId();
            if (lid && this.getLocalTransform) {
                const t = this.getLocalTransform();
                if (t) players.push({ id: lid, x: t.x, y: t.y, z: t.z, yaw: t.yaw, pitch: t.pitch, alive: false });
            }
            this.playerManager.otherPlayers.forEach((p, id) => {
                if (!p || !p.mesh) return;
                players.push({ id, x: p.mesh.position.x, y: p.mesh.position.y, z: p.mesh.position.z, yaw: p.mesh.rotation.y, pitch: p.pitch || 0, alive: true });
            });
            this.snapshots.push({ t: now, players, shots: this.pendingShots });
            this.pendingShots = [];
        }

        this.replayWallStart = now;
        this.replayDuration = replayDuration;
        const oldest = this.snapshots[0].t;
        // End the sampled window a bit BEFORE the moment of death, so the killing
        // shot + its hitmarker land with ~1.2s of replay still to watch instead
        // of flashing in the very last frame (or getting cut off).
        const END_PAD = 1.2;
        this.replaySampleStart = Math.max(oldest, now - (replayDuration - END_PAD));
        this.replayedShotIndex = 0;
        this.isPlaying = true;
        this.suppressLiveShots = true;

        this.frozenLivePositions = new Map();
        this.playerManager.otherPlayers.forEach((p, id) => {
            if (p && p.mesh) {
                this.frozenLivePositions.set(id, {
                    x: p.mesh.position.x, y: p.mesh.position.y, z: p.mesh.position.z,
                    yaw: p.mesh.rotation.y, pitch: p.pitch || 0,
                });
            }
        });
        this.ensureLocalBodyMesh();
        return true;
    }

    stopPlayback() {
        this.isPlaying = false;
        this.suppressLiveShots = false;
        if (this.localBodyMesh) this.localBodyMesh.visible = false;
        // Re-show any player mesh we hid during the replay (the watched killer).
        this.playerManager.otherPlayers.forEach((p) => {
            if (p && p.mesh) p.mesh.visible = true;
        });
        if (this.frozenLivePositions) {
            this.frozenLivePositions.forEach((snap, id) => {
                const p = this.playerManager.otherPlayers.get(id);
                if (p && p.mesh) {
                    p.mesh.position.set(snap.x, snap.y, snap.z);
                    p.mesh.rotation.y = snap.yaw;
                    p.pitch = snap.pitch;
                }
            });
            this.frozenLivePositions = null;
        }
    }

    // Hard reset for round transitions: stop any replay WITHOUT restoring the
    // frozen kill-spot positions (the meshes are about to be cleared/respawned
    // anyway), and fully remove the local body ghost so no red capsule lingers
    // at the kill spot during the next build phase.
    resetForRound() {
        this.isPlaying = false;
        this.suppressLiveShots = false;
        this.frozenLivePositions = null;
        this.snapshots = [];
        this.pendingShots = [];
        if (this.localBodyMesh) {
            this.scene.remove(this.localBodyMesh);
            // The body may be a capsule mesh OR a character model group; dispose
            // geometry/materials across the whole subtree.
            this.localBodyMesh.traverse((c) => {
                if (c.geometry) c.geometry.dispose();
                if (c.material) {
                    if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
                    else c.material.dispose();
                }
            });
            this.localBodyMesh = null;
            this.localBodyMixer = null;
        }
    }

    updatePlayback(targetPlayerId) {
        if (!this.isPlaying) return null;
        const now = performance.now() / 1000;
        const elapsed = now - this.replayWallStart;

        // Advance the local body's animation so it shows the idle pose, not a
        // frozen T-pose.
        if (this.localBodyMixer) {
            const dt = this._lastPlaybackTime ? Math.min(0.1, now - this._lastPlaybackTime) : 0.016;
            this.localBodyMixer.update(dt);
        }
        this._lastPlaybackTime = now;

        if (elapsed >= this.replayDuration) return { done: true };

        const sampleTime = this.replaySampleStart + elapsed;
        const bracket = this.findBracketingSnapshots(sampleTime);
        if (!bracket) return { done: false };
        const { a, b, k } = bracket;

        const seenIds = new Set();
        b.players.forEach(p => {
            seenIds.add(p.id);
            const interp = this.interpPlayer(a, b, k, p.id);
            if (!interp) return;
            const localId = this.getLocalPlayerId && this.getLocalPlayerId();
            if (p.id === localId) {
                if (this.localBodyMesh) {
                    this.localBodyMesh.position.set(interp.x, interp.y, interp.z);
                    this.localBodyMesh.rotation.y = interp.yaw;
                    this.localBodyMesh.visible = true;
                }
            } else {
                const remote = this.playerManager.otherPlayers.get(p.id);
                if (remote && remote.mesh) {
                    remote.mesh.position.set(interp.x, interp.y, interp.z);
                    remote.mesh.rotation.y = interp.yaw;
                    remote.pitch = interp.pitch;
                    // Hide the killer we're watching — the camera sits at their
                    // position, so their body blocks the view of the shots. Keep
                    // every other player visible.
                    remote.mesh.visible = (p.id !== targetPlayerId);
                }
            }
        });

        let hitmarkerThisFrame = false;
        const localId = this.getLocalPlayerId && this.getLocalPlayerId();
        for (let i = 0; i < this.snapshots.length; i++) {
            const snap = this.snapshots[i];
            if (snap.t > sampleTime) break;
            if (i < this.replayedShotIndex) continue;
            if (snap.shots && snap.shots.length > 0 && this.bulletSystem) {
                for (const shot of snap.shots) {
                    const start = new THREE.Vector3(shot.sx, shot.sy, shot.sz);
                    const target = new THREE.Vector3(shot.tx, shot.ty, shot.tz);
                    const isOwn = shot.shooterId === targetPlayerId;
                    this.bulletSystem.createBullet(start, target, isOwn);
                    if (shot.shooterId === targetPlayerId && localId) {
                        const victim = this.interpPlayer(a, b, k, localId);
                        if (victim && this.rayHitsBody(start, target, victim, localId)) {
                            hitmarkerThisFrame = true;
                        }
                    }
                }
            }
            this.replayedShotIndex = i + 1;
        }

        const targetInterp = this.interpPlayer(a, b, k, targetPlayerId);
        return { done: false, targetTransform: targetInterp, hitmarker: hitmarkerThisFrame };
    }

    // Does the shot ray (start->target) pass within the victim's BODY capsule?
    // The body is a vertical segment from feet to head with the character's
    // radius, so torso/leg hits register — not just shots near the origin point.
    // This is what fixes "only some hitmarkers show" in the kill cam.
    rayHitsBody(start, target, victim, victimId) {
        const dims = (this.playerManager.getPlayerDims && this.playerManager.getPlayerDims(victimId)) || null;
        const height = dims ? dims.height : 11;
        const radius = dims ? Math.max(2, dims.radius * 1.3) : 4; // a touch generous

        // victim origin is at ~eye height; body spans from feet to head.
        const feetY = victim.y - 10;       // FEET_BELOW_ORIGIN
        const headY = feetY + height;
        // Body segment B0->B1 (vertical), shot segment S0->S1.
        const S0 = start, S1 = target;
        const B0 = { x: victim.x, y: feetY, z: victim.z };
        const B1 = { x: victim.x, y: headY, z: victim.z };
        const dist = this.segmentSegmentDistance(S0, S1, B0, B1);
        return dist <= radius;
    }

    // Shortest distance between two 3D segments p1->q1 and p2->q2.
    segmentSegmentDistance(p1, q1, p2, q2) {
        const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
        const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
        const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
        const aa = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
        let s, t;
        const EPS = 1e-8;
        if (aa <= EPS && e <= EPS) { s = 0; t = 0; }
        else if (aa <= EPS) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
        else {
            const c = dot(d1, r);
            if (e <= EPS) { t = 0; s = Math.min(1, Math.max(0, -c / aa)); }
            else {
                const b = dot(d1, d2);
                const denom = aa * e - b * b;
                s = denom > EPS ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
                t = (b * s + f) / e;
                if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / aa)); }
                else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / aa)); }
            }
        }
        const c1 = { x: p1.x + d1.x * s, y: p1.y + d1.y * s, z: p1.z + d1.z * s };
        const c2 = { x: p2.x + d2.x * t, y: p2.y + d2.y * t, z: p2.z + d2.z * t };
        const dd = sub(c1, c2);
        return Math.sqrt(dot(dd, dd));
    }

    shouldSuppressLiveShot() {
        return this.suppressLiveShots;
    }
}
