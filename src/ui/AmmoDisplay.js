export class AmmoDisplay {
    constructor() {
        this.currentAmmo = 10;
        this.maxAmmo = 10;
        this.isReloading = false;
        this.reloadProgress = 0;
        this.createAmmoUI();
    }

    createAmmoUI() {
        this.ammoContainer = document.createElement('div');
        this.ammoContainer.id = 'ammoContainer';
        this.ammoContainer.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.85);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            color: rgba(255, 255, 255, 0.9);
            padding: 14px 24px;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            backdrop-filter: blur(10px);
            z-index: 100;
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 16px;
        `;

        // Bullet display
        this.bulletsContainer = document.createElement('div');
        this.bulletsContainer.id = 'bulletsContainer';
        this.bulletsContainer.style.cssText = `
            display: flex;
            gap: 8px;
            align-items: center;
            justify-content: center;
            flex-wrap: wrap;
        `;

        // Ammo count text
        this.ammoText = document.createElement('div');
        this.ammoText.id = 'ammoText';
        this.ammoText.style.cssText = `
            color: rgba(255, 255, 255, 0.9);
            font-size: 20px;
            font-weight: 600;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
        `;

        // Reload hint (shows when ammo < max)
        this.reloadHint = document.createElement('div');
        this.reloadHint.id = 'reloadHint';
        this.reloadHint.style.cssText = `
            color: rgba(255, 170, 0, 0.9);
            font-size: 12px;
            font-weight: 500;
            text-align: center;
            display: none;
            background: rgba(255, 170, 0, 0.1);
            padding: 4px 8px;
            border-radius: 6px;
            border: 1px solid rgba(255, 170, 0, 0.3);
        `;

        // Reload progress bar
        this.reloadContainer = document.createElement('div');
        this.reloadContainer.id = 'reloadContainer';
        this.reloadContainer.style.cssText = `
            width: 200px;
            height: 8px;
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 4px;
            overflow: hidden;
            display: none;
        `;

        this.reloadBar = document.createElement('div');
        this.reloadBar.id = 'reloadBar';
        this.reloadBar.style.cssText = `
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, #ff6600, #ffaa00);
            transition: width 0.1s ease;
            border-radius: 3px;
        `;

        this.reloadText = document.createElement('div');
        this.reloadText.id = 'reloadText';
        this.reloadText.style.cssText = `
            color: #ffaa00;
            font-size: 16px;
            font-weight: bold;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
            text-align: center;
            display: none;
            margin-top: 5px;
        `;

        this.reloadContainer.appendChild(this.reloadBar);
        
        // Remove bullets container - we don't need visual bullets anymore
        this.ammoContainer.appendChild(this.ammoText);
        this.ammoContainer.appendChild(this.reloadHint);
        this.ammoContainer.appendChild(this.reloadContainer);
        this.ammoContainer.appendChild(this.reloadText);

        document.body.appendChild(this.ammoContainer);

        this.updateDisplay();
    }

    createBullets() {
        this.bulletsContainer.innerHTML = '';

        for (let i = 0; i < this.maxAmmo; i++) {
            const bullet = document.createElement('div');
            bullet.className = 'bullet';
            
            const isEmpty = i >= this.currentAmmo;
            
            bullet.style.cssText = `
                width: 12px;
                height: 20px;
                background: ${isEmpty ? 'rgba(100, 100, 100, 0.5)' : 'linear-gradient(180deg, #ffcc00, #ff9900)'};
                border: 1px solid ${isEmpty ? 'rgba(150, 150, 150, 0.3)' : '#cc6600'};
                border-radius: 6px 6px 2px 2px;
                position: relative;
                transition: all 0.3s ease;
                transform: ${isEmpty ? 'scale(0.8)' : 'scale(1)'};
                opacity: ${isEmpty ? '0.4' : '1'};
                box-shadow: ${isEmpty ? 'none' : '0 2px 4px rgba(255, 153, 0, 0.4)'};
            `;

            // Add bullet tip
            const tip = document.createElement('div');
            tip.style.cssText = `
                position: absolute;
                top: -3px;
                left: 50%;
                transform: translateX(-50%);
                width: 6px;
                height: 6px;
                background: ${isEmpty ? 'rgba(80, 80, 80, 0.5)' : '#cc6600'};
                border-radius: 50%;
            `;
            bullet.appendChild(tip);

            this.bulletsContainer.appendChild(bullet);
        }
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
        // Update ammo text with label
        this.ammoText.innerHTML = `
            <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.6; margin-bottom: 2px;">Ammo</div>
            <div style="font-size: 20px; font-weight: 600; line-height: 1;">${this.currentAmmo} / ${this.maxAmmo}</div>
        `;
        
        // Color based on ammo level
        const ammoValue = this.ammoText.querySelector('div:last-child');
        if (this.currentAmmo === 0) {
            ammoValue.style.color = '#ff4444';
            ammoValue.style.animation = 'pulse 1s infinite';
        } else if (this.currentAmmo <= 3) {
            ammoValue.style.color = '#ffaa44';
            ammoValue.style.animation = 'none';
        } else {
            ammoValue.style.color = '#ffffff';
            ammoValue.style.animation = 'none';
        }

        // Update reload hint (show when ammo < max and not reloading)
        if (this.currentAmmo < this.maxAmmo && !this.isReloading) {
            this.reloadHint.style.display = 'block';
            this.reloadHint.textContent = 'Press R to reload';
        } else {
            this.reloadHint.style.display = 'none';
        }

        // Update reload display
        if (this.isReloading) {
            this.reloadContainer.style.display = 'block';
            this.reloadText.style.display = 'block';
            this.reloadBar.style.width = `${this.reloadProgress * 100}%`;
            this.reloadText.textContent = `RELOADING... ${Math.ceil((1 - this.reloadProgress) * 3)}s`;
            
            // Animate R key
            this.animateReloadKey();
        } else {
            this.reloadContainer.style.display = 'none';
            this.reloadText.style.display = 'none';
        }

        // Add CSS animations if not already present
        if (!document.getElementById('ammoStyles')) {
            const style = document.createElement('style');
            style.id = 'ammoStyles';
            style.textContent = `
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.5; }
                    100% { opacity: 1; }
                }
                
                @keyframes reloadKeyBounce {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.2); }
                    100% { transform: scale(1); }
                }
                
                .reload-key-hint {
                    animation: reloadKeyBounce 0.6s ease-in-out;
                }
            `;
            document.head.appendChild(style);
        }
    }

    animateReloadKey() {
        // Show R key hint during reload
        if (!this.reloadKeyHint) {
            this.reloadKeyHint = document.createElement('div');
            this.reloadKeyHint.style.cssText = `
                position: absolute;
                bottom: -40px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.8);
                color: #ffaa00;
                padding: 5px 10px;
                border-radius: 5px;
                font-size: 14px;
                font-weight: bold;
                border: 1px solid #ffaa00;
            `;
            this.ammoContainer.appendChild(this.reloadKeyHint);
        }
        
        this.reloadKeyHint.textContent = 'R';
        this.reloadKeyHint.className = 'reload-key-hint';
        this.reloadKeyHint.style.display = 'block';
        
        // Hide hint when reload finishes
        if (!this.isReloading && this.reloadKeyHint) {
            this.reloadKeyHint.style.display = 'none';
        }
    }

    showLowAmmoWarning() {
        if (this.currentAmmo <= 3 && this.currentAmmo > 0) {
            // Flash R key hint
            if (!this.lowAmmoHint) {
                this.lowAmmoHint = document.createElement('div');
                this.lowAmmoHint.style.cssText = `
                    position: fixed;
                    bottom: 200px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(255, 100, 100, 0.9);
                    color: white;
                    padding: 10px 15px;
                    border-radius: 5px;
                    font-size: 14px;
                    font-weight: bold;
                    z-index: 200;
                    animation: pulse 1s infinite;
                `;
                document.body.appendChild(this.lowAmmoHint);
            }
            
            this.lowAmmoHint.textContent = `LOW AMMO! Press R to reload (${this.currentAmmo} left)`;
            this.lowAmmoHint.style.display = 'block';
            
            // Hide after 3 seconds
            setTimeout(() => {
                if (this.lowAmmoHint) {
                    this.lowAmmoHint.style.display = 'none';
                }
            }, 3000);
        }
    }
    
    hide() {
        this.ammoContainer.style.display = 'none';
    }
    
    show() {
        this.ammoContainer.style.display = 'flex';
    }
}