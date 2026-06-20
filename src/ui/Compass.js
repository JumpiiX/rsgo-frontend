import { HUD, hudPanel } from './HudTheme.js';

export class Compass {
    constructor() {
        console.log('Compass: Initializing...');
        this.createCompassUI();
        console.log('Compass: Created UI elements');
    }

    createCompassUI() {
        
        const compassContainer = document.createElement('div');
        compassContainer.id = 'compass-container';
        compassContainer.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            width: 300px;
            height: 40px;
            z-index: 100;
            pointer-events: none;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            ${hudPanel(12)}
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        `;
        document.body.appendChild(compassContainer);

        
        this.compassStrip = document.createElement('div');
        this.compassStrip.id = 'compass-strip';
        this.compassStrip.style.cssText = `
            position: relative;
            width: 1080px; /* 3 full rotations for seamless wrapping */
            height: 100%;
            display: flex;
            align-items: center;
        `;
        compassContainer.appendChild(this.compassStrip);

        
        const createCompassTape = () => {
            const tape = document.createElement('div');
            tape.id = 'compass-tape';
            tape.style.cssText = `
                position: absolute;
                display: flex;
                align-items: center;
                height: 100%;
                font-family: 'Arial', sans-serif;
            `;

            
            for (let deg = 0; deg < 1080; deg += 5) {
                const actualDeg = deg % 360;
                let label = '';
                let fontSize = '12px';
                let color = HUD.textFaint;
                let fontWeight = 'normal';
                const width = '30px';

                // Cardinals = bright orange; N a touch brighter.
                if (actualDeg === 0) {
                    label = 'N'; fontSize = '18px'; color = HUD.orange; fontWeight = '700';
                } else if (actualDeg === 90) {
                    label = 'E'; fontSize = '18px'; color = `rgba(${HUD.orangeRGB}, 0.8)`; fontWeight = '600';
                } else if (actualDeg === 180) {
                    label = 'S'; fontSize = '18px'; color = `rgba(${HUD.orangeRGB}, 0.8)`; fontWeight = '600';
                } else if (actualDeg === 270) {
                    label = 'W'; fontSize = '18px'; color = `rgba(${HUD.orangeRGB}, 0.8)`; fontWeight = '600';
                } else if (actualDeg % 15 === 0) {
                    label = '|'; fontSize = '8px'; color = `rgba(${HUD.orangeRGB}, 0.25)`;
                } else if (actualDeg % 5 === 0) {
                    label = '·'; fontSize = '6px'; color = `rgba(${HUD.orangeRGB}, 0.18)`;
                }

                if (label) {
                    const marker = document.createElement('div');
                    marker.style.cssText = `
                        position: absolute;
                        left: ${deg}px;
                        width: ${width};
                        text-align: center;
                        color: ${color};
                        font-size: ${fontSize};
                        font-weight: ${fontWeight};
                        user-select: none;
                        letter-spacing: 1px;
                    `;
                    marker.textContent = label;
                    tape.appendChild(marker);
                }
            }

            return tape;
        };

        this.compassStrip.appendChild(createCompassTape());

        
        const leftFade = document.createElement('div');
        leftFade.id = 'compass-left-fade';
        leftFade.style.cssText = `
            position: fixed;
            top: 20px;
            left: calc(50% - 150px);
            width: 30px;
            height: 40px;
            background: linear-gradient(to right, rgba(${HUD.navyRGB}, 0.85), transparent);
            z-index: 101;
            pointer-events: none;
        `;
        document.body.appendChild(leftFade);

        const rightFade = document.createElement('div');
        rightFade.id = 'compass-right-fade';
        rightFade.style.cssText = `
            position: fixed;
            top: 20px;
            right: calc(50% - 150px);
            width: 30px;
            height: 40px;
            background: linear-gradient(to left, rgba(${HUD.navyRGB}, 0.85), transparent);
            z-index: 101;
            pointer-events: none;
        `;
        document.body.appendChild(rightFade);

        
        const centerLine = document.createElement('div');
        centerLine.id = 'compass-center-line';
        centerLine.style.cssText = `
            position: fixed;
            top: 22px;
            left: 50%;
            transform: translateX(-50%);
            width: 2px;
            height: 36px;
            background: ${HUD.orange};
            z-index: 102;
            pointer-events: none;
            opacity: 0.9;
        `;
        document.body.appendChild(centerLine);

        
        this.degreeDisplay = document.createElement('div');
        this.degreeDisplay.id = 'compass-degree-display';
        this.degreeDisplay.style.cssText = `
            position: fixed;
            top: 62px;
            left: 50%;
            transform: translateX(-50%);
            color: ${HUD.textDim};
            font-size: 11px;
            font-weight: normal;
            font-family: 'Inter', sans-serif;
            z-index: 100;
            pointer-events: none;
            letter-spacing: 1px;
        `;
        document.body.appendChild(this.degreeDisplay);
    }

    update(yawRadians) {
        
        
        let degrees = (-yawRadians * 180 / Math.PI);

        
        degrees = degrees % 360;
        if (degrees < 0) degrees += 360;

        
        
        const pixelsPerDegree = 1;
        const middleOffset = 360; 
        const offset = degrees + middleOffset;

        
        const centerOffset = 150; 
        const stripPosition = centerOffset - offset;

        
        this.compassStrip.style.transform = `translateX(${stripPosition}px)`;

        
        this.degreeDisplay.textContent = `${Math.round(degrees)}°`;
    }
}
