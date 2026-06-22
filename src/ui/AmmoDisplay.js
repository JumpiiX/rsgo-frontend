export class AmmoDisplay {
    constructor() {
        this.currentAmmo = 10;
        this.maxAmmo = 10;
        this.isReloading = false;
        this.reloadProgress = 0;
        this.createAmmoUI();
    }

    createAmmoUI() {
        if (!document.getElementById('ammoStyles')) {
            const style = document.createElement('style');
            style.id = 'ammoStyles';
            style.textContent = `
                @keyframes ammoPulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.45; }
                }
                @keyframes ammoKeyGlow {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(239, 78, 35, 0); }
                    50% { box-shadow: 0 0 0 4px rgba(239, 78, 35, 0.3); }
                }
            `;
            document.head.appendChild(style);
        }

        // Compact ammo readout: just a big current number, a small "/ max", and a
        // thin reload progress bar underneath. No more 30 pip-bars hogging space.
        this.ammoContainer = document.createElement('div');
        this.ammoContainer.id = 'ammoContainer';
        this.ammoContainer.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 24px;
            color: rgba(239, 78, 35, 0.9);
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            z-index: 100;
            user-select: none;
            text-align: right;
            text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
        `;

        this.ammoContainer.innerHTML = `
            <div style="display: flex; align-items: baseline; justify-content: flex-end; gap: 6px; line-height: 1;">
                <div id="ammoCurrent" style="
                    font-size: 44px;
                    font-weight: 700;
                    color: #ef4e23;
                    font-variant-numeric: tabular-nums;
                ">30</div>
                <div style="
                    font-size: 18px;
                    font-weight: 500;
                    color: rgba(239, 78, 35, 0.6);
                    font-variant-numeric: tabular-nums;
                ">/ <span id="ammoMax">30</span></div>
            </div>

            <div id="ammoBarTrack" style="
                margin-top: 6px;
                margin-left: auto;
                width: 96px;
                height: 3px;
                border-radius: 2px;
                background: rgba(239, 78, 35, 0.18);
                overflow: hidden;
            ">
                <div id="ammoBarFill" style="
                    height: 100%;
                    width: 100%;
                    background: #ef4e23;
                    border-radius: 2px;
                    transition: width 0.08s linear;
                "></div>
            </div>

            <div id="ammoReloadHint" style="
                display: none;
                margin-top: 6px;
                font-size: 11px;
                letter-spacing: 0.5px;
                color: rgba(239, 78, 35, 0.65);
                align-items: center;
                justify-content: flex-end;
                gap: 6px;
            ">
                <span>Reload</span>
                <span id="ammoReloadKey" style="
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 18px;
                    height: 18px;
                    padding: 0 5px;
                    background: rgba(239, 78, 35, 0.15);
                    border: 1px solid rgba(239, 78, 35, 0.5);
                    border-radius: 4px;
                    font-size: 10px;
                    font-weight: 700;
                    color: #ef4e23;
                ">R</span>
            </div>

            <div id="ammoReloadingLabel" style="
                display: none;
                margin-top: 6px;
                font-size: 11px;
                letter-spacing: 1.5px;
                text-transform: uppercase;
                color: #ef4e23;
                font-weight: 600;
            ">Reloading</div>
        `;

        document.body.appendChild(this.ammoContainer);

        this.currentEl = document.getElementById('ammoCurrent');
        this.maxEl = document.getElementById('ammoMax');
        this.barFillEl = document.getElementById('ammoBarFill');
        this.reloadHintEl = document.getElementById('ammoReloadHint');
        this.reloadingLabelEl = document.getElementById('ammoReloadingLabel');
        this.reloadKeyEl = document.getElementById('ammoReloadKey');

        this.updateDisplay();
    }

    updateAmmo(current, max) {
        this.currentAmmo = current;
        this.maxAmmo = max;
        this.updateDisplay();
    }

    updateReload(isReloading, progress = 0) {
        this.isReloading = isReloading;
        this.reloadProgress = progress;
        this.updateDisplay();
    }

    updateDisplay() {
        if (!this.currentEl) return;

        this.currentEl.textContent = this.currentAmmo;
        if (this.maxEl) this.maxEl.textContent = this.maxAmmo;

        // Always orange; just pulse when fully empty.
        this.currentEl.style.color = '#ef4e23';
        this.currentEl.style.animation = this.currentAmmo === 0 ? 'ammoPulse 0.9s infinite' : 'none';

        if (this.isReloading) {
            // Bar fills left-to-right with reload progress.
            if (this.barFillEl) this.barFillEl.style.width = `${Math.round(this.reloadProgress * 100)}%`;
            this.currentEl.style.opacity = '0.7';
            this.reloadHintEl.style.display = 'none';
            this.reloadingLabelEl.style.display = 'block';
        } else {
            // Bar shows magazine fullness.
            if (this.barFillEl) {
                const frac = this.maxAmmo > 0 ? this.currentAmmo / this.maxAmmo : 0;
                this.barFillEl.style.width = `${Math.round(frac * 100)}%`;
            }
            this.currentEl.style.opacity = '1';
            this.reloadingLabelEl.style.display = 'none';
            if (this.currentAmmo < this.maxAmmo) {
                this.reloadHintEl.style.display = 'flex';
                this.reloadKeyEl.style.animation =
                    (this.currentAmmo <= Math.ceil(this.maxAmmo * 0.3)) ? 'ammoKeyGlow 1s infinite' : 'none';
            } else {
                this.reloadHintEl.style.display = 'none';
            }
        }
    }

    animateReloadKey() {
    }

    showLowAmmoWarning() {
        if (this.reloadKeyEl) {
            this.reloadKeyEl.animate(
                [
                    { transform: 'scale(1)' },
                    { transform: 'scale(1.25)' },
                    { transform: 'scale(1)' },
                ],
                { duration: 350, iterations: 2 }
            );
        }
    }

    hide() {
        if (this.ammoContainer) this.ammoContainer.style.display = 'none';
    }

    show() {
        if (this.ammoContainer) this.ammoContainer.style.display = 'block';
    }
}
