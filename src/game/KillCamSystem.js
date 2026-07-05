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

        if (!document.getElementById('killcamStyles')) {
            const st = document.createElement('style');
            st.id = 'killcamStyles';
            st.textContent = `
                @keyframes kcFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes kcBarIn  { from { transform: scaleY(0); } to { transform: scaleY(1); } }
                @keyframes kcRise   { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translate(-50%, 0); } }
            `;
            document.head.appendChild(st);
        }

        const ui = document.createElement('div');
        ui.id = 'killcamUI';
        ui.style.cssText = `
            position: fixed; inset: 0; z-index: 500; display: none;
            pointer-events: none;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            color: #e8edff;
        `;
        ui.innerHTML = `
            <!-- Cinematic letterbox bars (top + bottom) -->
            <div style="position:absolute; top:0; left:0; right:0; height:70px;
                        background:linear-gradient(180deg, rgba(13,19,38,0.92) 0%, rgba(13,19,38,0) 100%);
                        transform-origin:top; animation:kcBarIn 0.4s ease both;"></div>
            <div style="position:absolute; bottom:0; left:0; right:0; height:110px;
                        background:linear-gradient(0deg, rgba(13,19,38,0.92) 0%, rgba(13,19,38,0) 100%);
                        transform-origin:bottom; animation:kcBarIn 0.4s ease both;"></div>

            <!-- TOP: big KILL CAM header + replay countdown -->
            <div style="position:absolute; top:18px; left:50%; transform:translateX(-50%); text-align:center; animation:kcRise 0.45s 0.1s ease both;">
                <div id="killcamLabel" style="font-size:22px; font-weight:800; letter-spacing:6px; text-transform:uppercase; color:#ef4e23; text-shadow:0 0 18px rgba(239,78,35,0.5);">Kill Cam</div>
                <div id="killcamTimer" style="margin-top:4px; font-size:13px; font-weight:600; letter-spacing:2px; color:rgba(232,237,255,0.75);"></div>
            </div>

            <!-- BOTTOM: 'Killed by XX' banner -->
            <div id="killcamBottom" style="position:absolute; bottom:30px; left:50%; transform:translateX(-50%); text-align:center; animation:kcRise 0.45s 0.18s ease both;">
                <div id="killcamSubtitle" style="font-size:18px; font-weight:700; letter-spacing:1px;"></div>
                <div id="killcamHint" style="margin-top:8px; font-size:11px; color:rgba(232,237,255,0.5); letter-spacing:0.5px; display:none;">
                    <span style="display:inline-flex;gap:6px;align-items:center;">
                        <kbd style="padding:2px 7px;border:1px solid rgba(232,237,255,0.25);border-radius:4px;font-family:inherit;">◀</kbd>
                        <kbd style="padding:2px 7px;border:1px solid rgba(232,237,255,0.25);border-radius:4px;font-family:inherit;">▶</kbd>
                        cycle teammates
                    </span>
                </div>
            </div>
        `;
        document.body.appendChild(ui);
        this.ui = ui;
        this.labelEl = ui.querySelector('#killcamLabel');
        this.subtitleEl = ui.querySelector('#killcamSubtitle');
        this.timerEl = ui.querySelector('#killcamTimer');
        this.hintEl = ui.querySelector('#killcamHint');
        this.bottomEl = ui.querySelector('#killcamBottom');
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

        if (this.input) this.input.isPointerLocked = false;
        if (document.pointerLockElement) document.exitPointerLock();

        const START_DELAY_MS = 400;
        if (this._startTimer) clearTimeout(this._startTimer);
        this._startTimer = setTimeout(() => {
            this._startTimer = null;

            if (this.state !== 'idle') return;
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
        }, START_DELAY_MS);
    }

    updateUIForReplay() {
        const killerName = this.getPlayerName(this.replayTargetId);
        this.labelEl.textContent = 'Kill Cam';
        this.labelEl.style.color = '#ef4e23';
        this.labelEl.style.textShadow = '0 0 18px rgba(239,78,35,0.5)';

        this.subtitleEl.innerHTML = killerName
            ? `Killed by <span style="color:#ef4e23;">${killerName}</span>`
            : 'Killed';
        this.hintEl.style.display = 'none';
        this.timerEl.style.display = '';
    }

    updateUIForSpectate() {
        const name = this.getPlayerName(this.spectateTargetId);
        this.labelEl.textContent = 'Spectating';
        this.labelEl.style.color = '#9fb0d8';
        this.labelEl.style.textShadow = 'none';
        this.subtitleEl.innerHTML = name
            ? `Following <span style="color:#9fb0d8;">${name}</span>`
            : 'Teammate';
        this.hintEl.style.display = 'block';
        this.timerEl.style.display = 'none';
    }

    updateReplayTimer() {
        if (!this.timerEl || this.state !== 'replaying') return;
        const now = performance.now() / 1000;
        const elapsed = now - (this.recorder.replayWallStart || now);
        const remaining = Math.max(0, (this.recorder.replayDuration || this.replayDuration) - elapsed);
        this.timerEl.textContent = `Replay · ${Math.ceil(remaining)}s`;
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

    // While spectating a teammate, hide THAT teammate's character model so the
    // spectator (whose camera sits at the teammate's head) doesn't see the body
    // clipping through the view. Every other player's model stays visible.
    // Pass null to restore all models (spectating ended).
    _setSpectatedModelHidden(targetId) {
        if (!this.playerManager || !this.playerManager.otherPlayers) return;
        this.playerManager.otherPlayers.forEach((entry, id) => {
            const model = entry && entry.model;
            if (!model) return;
            model.visible = (id !== targetId);
        });
    }

    onLocalPlayerRespawned() {

        if (this._startTimer) { clearTimeout(this._startTimer); this._startTimer = null; }
        if (this.recorder.isPlaying) this.recorder.stopPlayback();
        this.state = 'idle';
        this.replayTargetId = null;
        this.spectateTargetId = null;
        this._setSpectatedModelHidden(null); // restore all character models
        this.hideUI();
    }

    // Who is the camera currently watching? The killer during the replay,
    // the spectated teammate while spectating. Used to tint the viewmodel with
    // the correct team's colour.
    getWatchedPlayerId() {
        if (this.state === 'replaying') return this.replayTargetId;
        if (this.state === 'spectating') return this.spectateTargetId;
        return null;
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
        this._setSpectatedModelHidden(this.spectateTargetId);
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
        this._setSpectatedModelHidden(this.spectateTargetId);
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
            this.updateReplayTimer();
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

        return this.state === 'replaying' || this.state === 'spectating' || !!this._startTimer;
    }

    destroy() {
        if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
        if (this.ui && this.ui.parentNode) this.ui.parentNode.removeChild(this.ui);
    }
}
