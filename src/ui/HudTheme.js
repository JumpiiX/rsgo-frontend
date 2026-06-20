// Shared HUD theme — strict RSGO navy + orange palette. Every HUD element pulls
// its colors + panel style from here so the whole interface stays consistent
// (and a palette change is a one-file edit).
//
// Design rules:
//   • Only two hues: navy (#1a2447) and orange (#ef4e23).
//   • Panels = translucent navy + orange hairline border + blur.
//   • Text/values/bars = orange; labels = dim orange; tracks = faint orange.
//   • State (low health, bomb urgency) is shown by PULSE/animation, never by a
//     new color.

export const HUD = {
    navy: '#1a2447',
    orange: '#ef4e23',
    orangeRGB: '239, 78, 35',
    navyRGB: '26, 36, 71',

    // Common alpha tokens.
    panelBg: 'rgba(26, 36, 71, 0.88)',   // navy panel
    border: 'rgba(239, 78, 35, 0.18)',   // orange hairline
    text: '#ef4e23',                     // primary value text
    textDim: 'rgba(239, 78, 35, 0.55)',  // labels
    textFaint: 'rgba(239, 78, 35, 0.35)',
    track: 'rgba(239, 78, 35, 0.15)',    // empty bar/pip background
    fill: '#ef4e23',                     // bar/pip fill
};

// Standard panel CSS string (background + border + blur + radius).
export function hudPanel(radius = 12) {
    return `
        background: ${HUD.panelBg};
        border: 1px solid ${HUD.border};
        border-radius: ${radius}px;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
    `;
}

// Inject shared keyframes (pulse / urgent-pulse / flash) once.
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
