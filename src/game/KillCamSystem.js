export class KillCamSystem {
    constructor({ camera, input, playerManager, getLocalPlayerId, getLocalTeam, weaponSystem, recorder, onHitmarker }) {
        this.camera = camera;
        this.input = input;
        this.playerManager = playerManager;
        this.getLocalPlayerId = getLocalPlayerId;
        this.getLocalTeam = getLocalTeam;
        this.weaponSystem = weaponSystem;
        this.recorder = recorder;
        this.onHitmarker = onHitmarker;

        this.state = 'idle';
        this.replayDuration = 5.0;
        this.replayTargetId = null;
        this.spectateTargetId = null;

        this.createUI();
        this.attachKeys();
    }

    createUI() {
        const ui = document.createElement('div');
        ui.id = 'killcamUI';
        ui.style.cssText = `
            position: fixed;
            top: 24px;
            left: 50%;
            transform: translateX(-50%);
            padding: 12px 22px;
            background: rgba(0, 0, 0, 0.85);
            border: 1px solid rgba(255, 255, 255, 0.10);
            border-radius: 12px;
            color: #fff;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 13px;
            letter-spacing: 1px;
            text-transform: uppercase;
            z-index: 500;
            display: none;
            text-align: center;
            backdrop-filter: blur(10px);
            pointer-events: none;
        `;
        ui.innerHTML = `
            <div id="killcamLabel" style="font-weight: 600; color: #ff8c1a;">Kill Cam</div>
            <div id="killcamSubtitle" style="margin-top: 4px; font-size: 11px; color: rgba(255,255,255,0.7); letter-spacing: 0.5px; text-transform: none;"></div>
            <div id="killcamHint" style="margin-top: 8px; font-size: 10px; color: rgba(255,255,255,0.45); letter-spacing: 0.5px; text-transform: none; display: none;">
                <span style="display:inline-flex;gap:6px;align-items:center;">
                    <kbd style="padding:2px 6px;border:1px solid rgba(255,255,255,0.2);border-radius:3px;font-family:inherit;">◀</kbd>
                    <kbd style="padding:2px 6px;border:1px solid rgba(255,255,255,0.2);border-radius:3px;font-family:inherit;">▶</kbd>
                    cycle teammates
                </span>
            </div>
        `;
        document.body.appendChild(ui);
        this.ui = ui;
        this.labelEl = ui.querySelector('#killcamLabel');
        this.subtitleEl = ui.querySelector('#killcamSubtitle');
        this.hintEl = ui.querySelector('#killcamHint');
    }

    attachKeys() {
        this._keyHandler = (e) => {
            if (this.state !== 'spectating') return;
            if (e.code === 'ArrowLeft' || e.key === 'ArrowLeft') {
                this.cycleSpectate(-1);
                e.preventDefault();
            } else if (e.code === 'ArrowRight' || e.key === 'ArrowRight') {
                this.cycleSpectate(1);
                e.preventDefault();
            }
        };
        document.addEventListener('keydown', this._keyHandler);
    }

    onLocalPlayerDied(killerId) {
        this.replayTargetId = killerId;
        if (this.recorder.startPlayback(this.replayDuration)) {
            this.state = 'replaying';
            if (this.weaponSystem && typeof this.weaponSystem.show === 'function') {
                this.weaponSystem.show();
            }
            this.showUI();
            this.updateUIForReplay();
        } else {
            this.startSpectating();
        }

        if (this.input) this.input.isPointerLocked = false;
        if (document.pointerLockElement) document.exitPointerLock();
    }

    updateUIForReplay() {
        const killerName = this.getPlayerName(this.replayTargetId);
        this.labelEl.textContent = 'Kill Cam';
        this.labelEl.style.color = '#ff8c1a';
        this.subtitleEl.textContent = killerName ? `Killed by ${killerName}` : 'Killed';
        this.hintEl.style.display = 'none';
    }

    updateUIForSpectate() {
        const name = this.getPlayerName(this.spectateTargetId);
        this.labelEl.textContent = 'Spectating';
        this.labelEl.style.color = '#6ad26a';
        this.subtitleEl.textContent = name || 'Teammate';
        this.hintEl.style.display = 'block';
    }

    getPlayerName(id) {
        if (!id || !this.playerManager) return null;
        const p = this.playerManager.otherPlayers && this.playerManager.otherPlayers.get(id);
        if (p && p.data && p.data.name) return p.data.name;
        if (id === this.getLocalPlayerId()) return 'You';
        return null;
    }

    showUI() {
        if (this.ui) this.ui.style.display = 'block';
    }

    hideUI() {
        if (this.ui) this.ui.style.display = 'none';
    }

    onLocalPlayerRespawned() {
        if (this.recorder.isPlaying) this.recorder.stopPlayback();
        this.state = 'idle';
        this.replayTargetId = null;
        this.spectateTargetId = null;
        this.hideUI();
    }

    getAliveTeammates() {
        const myId = this.getLocalPlayerId();
        const myTeam = this.getLocalTeam ? this.getLocalTeam() : null;
        const list = [];
        if (!this.playerManager || !this.playerManager.otherPlayers) return list;
        this.playerManager.otherPlayers.forEach((p, id) => {
            if (id === myId) return;
            if (!p || !p.mesh) return;
            if (this.playerManager.respawning && this.playerManager.respawning.has(id)) return;
            const team = p.data && p.data.team;
            if (myTeam && team && team !== myTeam) return;
            list.push(id);
        });
        return list;
    }

    pickInitialSpectateTarget() {
        const teammates = this.getAliveTeammates();
        if (teammates.length === 0) {
            const myId = this.getLocalPlayerId();
            const anyAlive = [];
            this.playerManager.otherPlayers.forEach((p, id) => {
                if (id === myId) return;
                if (this.playerManager.respawning && this.playerManager.respawning.has(id)) return;
                anyAlive.push(id);
            });
            return anyAlive[0] || null;
        }
        return teammates[0];
    }

    cycleSpectate(direction) {
        const teammates = this.getAliveTeammates();
        if (teammates.length === 0) return;
        let idx = teammates.indexOf(this.spectateTargetId);
        if (idx === -1) idx = 0;
        else idx = (idx + direction + teammates.length) % teammates.length;
        this.spectateTargetId = teammates[idx];
        this.updateUIForSpectate();
    }

    startSpectating() {
        this.spectateTargetId = this.pickInitialSpectateTarget();
        if (this.weaponSystem && typeof this.weaponSystem.hide === 'function') {
            this.weaponSystem.hide();
        }
        if (this.recorder.isPlaying) this.recorder.stopPlayback();
        if (!this.spectateTargetId) {
            this.state = 'idle';
            this.hideUI();
            return;
        }
        this.state = 'spectating';
        this.updateUIForSpectate();
    }

    applyCameraFromTransform(tr) {
        if (!tr || !this.camera) return;
        const cam = this.camera.getCamera ? this.camera.getCamera() : this.camera;
        cam.up.set(0, 1, 0);
        cam.rotation.order = 'XYZ';
        cam.position.set(tr.x, tr.y, tr.z);
        const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), tr.yaw);
        const pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tr.pitch);
        cam.quaternion.copy(yawQ).multiply(pitchQ);
        cam.updateMatrixWorld(true);
    }

    update() {
        if (this.state === 'replaying') {
            const result = this.recorder.updatePlayback(this.replayTargetId);
            if (!result) return;
            if (result.done) {
                this.startSpectating();
                return;
            }
            if (result.targetTransform) {
                this.applyCameraFromTransform(result.targetTransform);
            }
            if (result.hitmarker && typeof this.onHitmarker === 'function') {
                this.onHitmarker();
            }
        } else if (this.state === 'spectating') {
            if (this.spectateTargetId &&
                this.playerManager.respawning &&
                this.playerManager.respawning.has(this.spectateTargetId)) {
                this.cycleSpectate(1);
            }
            const liveTr = this.getLiveTransform(this.spectateTargetId);
            if (liveTr) this.applyCameraFromTransform(liveTr);
        }
    }

    getLiveTransform(playerId) {
        if (!playerId) return null;
        const p = this.playerManager.otherPlayers.get(playerId);
        if (!p || !p.mesh) return null;
        const pos = p.mesh.position;
        return { x: pos.x, y: pos.y, z: pos.z, yaw: p.mesh.rotation.y, pitch: p.pitch || 0 };
    }

    isActive() {
        return this.state === 'replaying' || this.state === 'spectating';
    }

    destroy() {
        if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
        if (this.ui && this.ui.parentNode) this.ui.parentNode.removeChild(this.ui);
    }
}
