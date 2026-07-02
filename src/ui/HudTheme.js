export const HUD = {
    navy: '#1a2447',
    orange: '#ef4e23',
    orangeRGB: '239, 78, 35',
    navyRGB: '26, 36, 71',

    panelBg: 'rgba(26, 36, 71, 0.88)',
    border: 'rgba(239, 78, 35, 0.18)',
    text: '#ef4e23',
    textDim: 'rgba(239, 78, 35, 0.55)',
    textFaint: 'rgba(239, 78, 35, 0.35)',
    track: 'rgba(239, 78, 35, 0.15)',
    fill: '#ef4e23',
};

export function hudPanel(radius = 12) {
    return `
        background: ${HUD.panelBg};
        border: 1px solid ${HUD.border};
        border-radius: ${radius}px;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
    `;
}

let injected = false;
export function ensureHudKeyframes() {
    if (injected) return;
    injected = true;
    const style = document.createElement('style');
    style.id = 'hud-theme-keyframes';
    style.textContent = `
        @keyframes hudPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.45; }
        }
        @keyframes hudUrgent {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.55; transform: scale(1.06); }
        }
        @keyframes hudFlash {
            0%, 100% { box-shadow: 0 0 0 0 rgba(${HUD.orangeRGB}, 0.0); }
            50% { box-shadow: 0 0 0 4px rgba(${HUD.orangeRGB}, 0.35); }
        }
    `;
    document.head.appendChild(style);
}
