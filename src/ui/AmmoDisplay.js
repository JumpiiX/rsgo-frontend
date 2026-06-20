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

        this.ammoContainer = document.createElement('div');
        this.ammoContainer.id = 'ammoContainer';
        this.ammoContainer.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 14px 18px;
            background: rgba(26, 36, 71, 0.88);
            border: 1px solid rgba(239, 78, 35, 0.18);
            border-radius: 12px;
            color: rgba(239, 78, 35, 0.9);
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            backdrop-filter: blur(10px);
            z-index: 100;
            min-width: 160px;
            user-select: none;
        `;

        this.ammoContainer.innerHTML = `
            <div style="
                font-size: 10px;
                letter-spacing: 2px;
                text-transform: uppercase;
                color: rgba(239, 78, 35, 0.55);
                margin-bottom: 6px;
            ">Ammo</div>

            <div id="ammoPips" style="
                display: flex;
                gap: 4px;
                margin-bottom: 10px;
                align-items: center;
            "></div>

            <div style="display: flex; align-items: baseline; gap: 6px;">
                <div id="ammoCurrent" style="
                    font-size: 32px;
                    font-weight: 600;
                    line-height: 1;
                    color: #fff;
                    font-variant-numeric: tabular-nums;
                ">10</div>
                <div style="
                    font-size: 14px;
                    color: rgba(239, 78, 35, 0.4);
                    font-variant-numeric: tabular-nums;
                ">/ <span id="ammoMax">10</span></div>
            </div>

            <div id="ammoReloadHint" style="
                display: none;
                margin-top: 10px;
                padding-top: 10px;
                border-top: 1px solid rgba(239, 78, 35, 0.12);
                font-size: 11px;
                color: rgba(239, 78, 35, 0.55);
                display: flex;
                align-items: center;
                gap: 8px;
            ">
                <span>Reload</span>
                <span id="ammoReloadKey" style="
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 20px;
                    height: 20px;
                    padding: 0 6px;
                    background: rgba(239, 78, 35, 0.15);
                    border: 1px solid rgba(239, 78, 35, 0.5);
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 600;
                    color: #ef4e23;
                ">R</span>
            </div>

            <div id="ammoReloadingLabel" style="
                display: none;
                margin-top: 10px;
                padding-top: 10px;
                border-top: 1px solid rgba(239, 78, 35, 0.12);
                font-size: 11px;
                letter-spacing: 1.5px;
                text-transform: uppercase;
                color: #ef4e23;
                font-weight: 600;
            ">Reloading</div>
        `;

        document.body.appendChild(this.ammoContainer);

        this.pipsContainer = document.getElementById('ammoPips');
        this.currentEl = document.getElementById('ammoCurrent');
        this.maxEl = document.getElementById('ammoMax');
        this.reloadHintEl = document.getElementById('ammoReloadHint');
        this.reloadingLabelEl = document.getElementById('ammoReloadingLabel');
        this.reloadKeyEl = document.getElementById('ammoReloadKey');

        this.renderPips();
        this.updateDisplay();
    }

    renderPips() {
        if (!this.pipsContainer) return;
        this.pipsContainer.innerHTML = '';
        for (let i = 0; i < this.maxAmmo; i++) {
            const pip = document.createElement('div');
            pip.dataset.index = String(i);
            pip.style.cssText = `
                width: 6px;
                height: 14px;
                border-radius: 2px;
                background: rgba(239, 78, 35, 0.15);
                transition: background 0.2s ease, transform 0.15s ease, opacity 0.2s ease;
            `;
            this.pipsContainer.appendChild(pip);
        }
    }

    setPipState(index, state) {
        if (!this.pipsContainer) return;
        const pip = this.pipsContainer.children[index];
        if (!pip) return;
        if (state === 'loaded') {
            pip.style.background = '#ef4e23';
            pip.style.opacity = '1';
            pip.style.transform = 'scaleY(1)';
        } else if (state === 'empty') {
            pip.style.background = 'rgba(239, 78, 35, 0.15)';
            pip.style.opacity = '0.7';
            pip.style.transform = 'scaleY(0.7)';
        } else if (state === 'filling') {
            pip.style.background = 'rgba(239, 78, 35, 0.55)';
            pip.style.opacity = '1';
            pip.style.transform = 'scaleY(0.9)';
        }
    }

    updateAmmo(current, max) {
        const sizeChanged = max !== this.maxAmmo;
        this.currentAmmo = current;
        this.maxAmmo = max;
        if (sizeChanged) {
            this.renderPips();
        }
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

        if (this.currentAmmo === 0) {
            this.currentEl.style.color = '#ef4e23';
            this.currentEl.style.animation = 'ammoPulse 0.9s infinite';
        } else if (this.currentAmmo <= Math.ceil(this.maxAmmo * 0.3)) {
            this.currentEl.style.color = '#ef4e23';
            this.currentEl.style.animation = 'none';
        } else {
            this.currentEl.style.color = '#ef4e23';
            this.currentEl.style.animation = 'none';
        }

        if (this.isReloading) {
            const filledCount = Math.floor(this.reloadProgress * this.maxAmmo);
            for (let i = 0; i < this.maxAmmo; i++) {
                if (i < filledCount) this.setPipState(i, 'loaded');
                else if (i === filledCount) this.setPipState(i, 'filling');
                else this.setPipState(i, 'empty');
            }
            this.currentEl.style.opacity = '0.5';
            this.reloadHintEl.style.display = 'none';
            this.reloadingLabelEl.style.display = 'block';
        } else {
            for (let i = 0; i < this.maxAmmo; i++) {
                this.setPipState(i, i < this.currentAmmo ? 'loaded' : 'empty');
            }
            this.currentEl.style.opacity = '1';
            this.reloadingLabelEl.style.display = 'none';
            if (this.currentAmmo < this.maxAmmo) {
                this.reloadHintEl.style.display = 'flex';
                if (this.currentAmmo <= Math.ceil(this.maxAmmo * 0.3) || this.currentAmmo === 0) {
                    this.reloadKeyEl.style.animation = 'ammoKeyGlow 1s infinite';
                } else {
                    this.reloadKeyEl.style.animation = 'none';
                }
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
