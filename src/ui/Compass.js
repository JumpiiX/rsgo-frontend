export class Compass {
    constructor() {
        console.log('Compass: Initializing...');
        this.createCompassUI();
        console.log('Compass: Created UI elements');
    }
    
    createCompassUI() {
        // Create compass container
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
            background: rgba(20, 12, 8, 0.4);
            border: 1px solid rgba(210, 105, 30, 0.3);
            border-radius: 2px;
        `;
        document.body.appendChild(compassContainer);
        
        // Create compass strip that will slide horizontally
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
        
        // Create a clean minimalistic compass tape
        const createCompassTape = () => {
            const tape = document.createElement('div');
            tape.style.cssText = `
                position: absolute;
                display: flex;
                align-items: center;
                height: 100%;
                font-family: 'Arial', sans-serif;
            `;
            
            // Create markers - only cardinal directions and subtle ticks
            for (let deg = 0; deg < 1080; deg += 5) {
                const actualDeg = deg % 360;
                let label = '';
                let fontSize = '12px';
                let color = 'rgba(210, 105, 30, 0.3)';
                let fontWeight = 'normal';
                let width = '30px';
                
                // Major cardinal directions only
                if (actualDeg === 0) {
                    label = 'N';
                    fontSize = '18px';
                    color = '#d2691e';
                    fontWeight = 'bold';
                } else if (actualDeg === 90) {
                    label = 'E';
                    fontSize = '18px';
                    color = '#cd853f';
                    fontWeight = 'bold';
                } else if (actualDeg === 180) {
                    label = 'S';
                    fontSize = '18px';
                    color = '#cd853f';
                    fontWeight = 'bold';
                } else if (actualDeg === 270) {
                    label = 'W';
                    fontSize = '18px';
                    color = '#cd853f';
                    fontWeight = 'bold';
                }
                // Subtle tick marks every 15 degrees
                else if (actualDeg % 15 === 0) {
                    label = '|';
                    fontSize = '8px';
                    color = 'rgba(210, 105, 30, 0.2)';
                }
                // Very subtle tick marks every 5 degrees
                else if (actualDeg % 5 === 0) {
                    label = '·';
                    fontSize = '6px';
                    color = 'rgba(210, 105, 30, 0.15)';
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
        
        // Add subtle gradient overlays for fade effect at edges
        const leftFade = document.createElement('div');
        leftFade.style.cssText = `
            position: fixed;
            top: 20px;
            left: calc(50% - 150px);
            width: 30px;
            height: 40px;
            background: linear-gradient(to right, rgba(20, 12, 8, 0.6), transparent);
            z-index: 101;
            pointer-events: none;
        `;
        document.body.appendChild(leftFade);
        
        const rightFade = document.createElement('div');
        rightFade.style.cssText = `
            position: fixed;
            top: 20px;
            right: calc(50% - 150px);
            width: 30px;
            height: 40px;
            background: linear-gradient(to left, rgba(20, 12, 8, 0.6), transparent);
            z-index: 101;
            pointer-events: none;
        `;
        document.body.appendChild(rightFade);
        
        // Add center indicator (vertical line) - rust themed
        const centerLine = document.createElement('div');
        centerLine.style.cssText = `
            position: fixed;
            top: 22px;
            left: 50%;
            transform: translateX(-50%);
            width: 2px;
            height: 36px;
            background: #d2691e;
            z-index: 102;
            pointer-events: none;
            opacity: 0.8;
        `;
        document.body.appendChild(centerLine);
        
        // Add degree display below compass - minimalistic
        this.degreeDisplay = document.createElement('div');
        this.degreeDisplay.style.cssText = `
            position: fixed;
            top: 62px;
            left: 50%;
            transform: translateX(-50%);
            color: rgba(210, 105, 30, 0.6);
            font-size: 11px;
            font-weight: normal;
            font-family: 'Arial', sans-serif;
            z-index: 100;
            pointer-events: none;
            letter-spacing: 1px;
        `;
        document.body.appendChild(this.degreeDisplay);
    }
    
    update(yawRadians) {
        // yaw is continuously accumulated in InputManager
        // Convert to degrees for compass display
        let degrees = (-yawRadians * 180 / Math.PI);
        
        // Normalize to 0-360 range
        degrees = degrees % 360;
        if (degrees < 0) degrees += 360;
        
        // The compass strip should move opposite to the rotation
        // We position the middle rotation (360-720) as the active one
        const pixelsPerDegree = 1;
        const middleOffset = 360; // Offset to the middle rotation
        const offset = degrees + middleOffset;
        
        // Center the strip and apply offset
        const centerOffset = 150; // Half of container width
        const stripPosition = centerOffset - offset;
        
        // Apply transform to move the strip
        this.compassStrip.style.transform = `translateX(${stripPosition}px)`;
        
        // Update degree display
        this.degreeDisplay.textContent = `${Math.round(degrees)}°`;
    }
}