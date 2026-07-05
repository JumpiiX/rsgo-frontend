import { HUD } from './HudTheme.js';

export class SimpleMiniMap {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        this.size = 200;
        this.worldViewSize = 800;

        this.mapShapes = this.buildMapShapes();

        this.createContainer();
        this.createCanvas();
        this.createPlayerIcon();
    }

    buildMapShapes() {
        const spawnSize = 120;
        const bombSiteSize = 180;
        const pathWidth = 100;
        const bottomSpawnZ = -300;
        const topSpawnZ = 300;
        const siteAX = -250;
        const siteBX = 250;
        const siteZ = 0;
        const midLength = Math.abs(siteBX - siteAX) - bombSiteSize;

        const rects = [
            { cx: 0, cz: bottomSpawnZ, w: spawnSize, h: spawnSize, angle: 0 },
            { cx: 0, cz: topSpawnZ, w: spawnSize, h: spawnSize, angle: 0 },
            { cx: siteAX, cz: siteZ, w: bombSiteSize, h: bombSiteSize, angle: 0 },
            { cx: siteBX, cz: siteZ, w: bombSiteSize, h: bombSiteSize, angle: 0 },
            { cx: 0, cz: siteZ, w: midLength, h: pathWidth, angle: 0 },
        ];

        const addDiagonal = (sx, sz, ex, ez) => {
            const dx = ex - sx;
            const dz = ez - sz;
            const len = Math.sqrt(dx * dx + dz * dz);
            const angle = Math.atan2(dx, dz);
            rects.push({
                cx: (sx + ex) / 2,
                cz: (sz + ez) / 2,
                w: pathWidth,
                h: len,
                angle: angle,
            });
        };

        addDiagonal(0, bottomSpawnZ, siteAX, siteZ);
        addDiagonal(0, bottomSpawnZ, siteBX, siteZ);
        addDiagonal(0, topSpawnZ, siteAX, siteZ);
        addDiagonal(0, topSpawnZ, siteBX, siteZ);

        const sites = [
            { cx: siteAX, cz: siteZ, letter: 'A' },
            { cx: siteBX, cz: siteZ, letter: 'B' },
        ];

        return { rects, sites };
    }

    createContainer() {
        this.container = document.createElement('div');
        this.container.id = 'simple-minimap';
        this.container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: ${this.size + 2}px;
            height: ${this.size + 2}px;
            background: rgba(${HUD.navyRGB}, 0.85);
            border: 2px solid ${HUD.orange};
            border-radius: 50%;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
            padding: 0;
            box-sizing: border-box;
            pointer-events: none;
            z-index: 99;
            overflow: hidden;
        `;
        document.body.appendChild(this.container);
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = this.size * dpr;
        this.canvas.height = this.size * dpr;
        this.canvas.style.cssText = `
            position: absolute;
            top: 1px;
            left: 1px;
            width: ${this.size}px;
            height: ${this.size}px;
            display: block;
        `;
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        this.ctx.scale(dpr, dpr);
        this.playerPos = { x: 0, z: 0 };
        this.cameraRotation = 0;
        this.draw();
    }

    createPlayerIcon() {
        this.playerIcon = document.createElement('div');
        this.playerIcon.id = 'minimap-player-arrow';
        this.playerIcon.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" style="transform: translate(-50%, -50%);">
                <path d="M 12 2 L 20 20 L 12 15 L 4 20 Z"
                      fill="${HUD.orange}"
                      stroke="${HUD.navy}"
                      stroke-width="1.4"
                      stroke-linejoin="round"
                      opacity="1"/>
            </svg>
        `;
        this.playerIcon.style.cssText = `
            position: fixed;
            width: 24px;
            height: 24px;
            z-index: 101;
            pointer-events: none;
            filter: drop-shadow(0 0 4px rgba(0, 0, 0, 0.85));
        `;
        document.body.appendChild(this.playerIcon);

        this.positionPlayerIcon();
        this._onResize = () => this.positionPlayerIcon();
        window.addEventListener('resize', this._onResize);
    }

    positionPlayerIcon() {
        if (!this.playerIcon) return;
        const centerX = window.innerWidth - 20 - (this.size + 2) / 2;
        const centerY = 20 + (this.size + 2) / 2;
        this.playerIcon.style.left = centerX + 'px';
        this.playerIcon.style.top = centerY + 'px';
    }

    update(playerPosition, cameraRotation) {
        if (!playerPosition) return;
        this.playerPos.x = playerPosition.x;
        this.playerPos.z = playerPosition.z;
        if (cameraRotation !== undefined) {
            this.cameraRotation = cameraRotation;
        }
        this.draw();
    }

    // Show a red dot where the bomb is planted (pass {x, z}); pass null to clear.
    setBombPosition(pos) {
        this.bombPos = (pos && typeof pos.x === 'number') ? { x: pos.x, z: pos.z } : null;
    }

    // Living teammates to draw as small facing arrows: [{ x, z, yaw, alive }].
    setTeammates(list) {
        this.teammates = Array.isArray(list) ? list : [];
    }

    render() {
    }

    // World (x,z) -> minimap screen pixel. Derived to EXACTLY match
    // applyWorldTransform (translate center; rotate cam+π; scale -scale; translate -player):
    //   sx = center + scale*( cos(cam)*dx - sin(cam)*dz)
    //   sy = center + scale*( sin(cam)*dx + cos(cam)*dz)
    worldToScreen(x, z, scale) {
        const cx = this.size / 2, cy = this.size / 2;
        const ca = Math.cos(this.cameraRotation);
        const sa = Math.sin(this.cameraRotation);
        const dx = x - this.playerPos.x;
        const dz = z - this.playerPos.z;
        return {
            x: cx + (ca * dx - sa * dz) * scale,
            y: cy + (sa * dx + ca * dz) * scale,
        };
    }

    draw() {
        const ctx = this.ctx;
        if (!ctx) return;
        const s = this.size;
        const scale = s / this.worldViewSize;

        ctx.clearRect(0, 0, s, s);

        // --- World-transformed layer: paths + bomb-site circles/labels ---
        ctx.save();
        ctx.beginPath();
        ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
        ctx.clip();

        this.drawPathUnion(scale);
        this.applyWorldTransform(ctx, scale);

        for (const site of this.mapShapes.sites) {
            ctx.save();
            ctx.translate(site.cx, site.cz);
            ctx.fillStyle = HUD.orange;
            ctx.beginPath();
            ctx.arc(0, 0, 55, 0, Math.PI * 2);
            ctx.fill();
            ctx.scale(1, -1);
            ctx.rotate(-this.cameraRotation - Math.PI);
            ctx.fillStyle = HUD.navy;
            ctx.font = 'bold 70px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(site.letter, 0, 4);
            ctx.restore();
        }
        ctx.restore();

        // --- Screen-space layer: teammates + bomb dot (unambiguous facing) ---
        ctx.save();
        ctx.beginPath();
        ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
        ctx.clip();

        if (this.teammates && this.teammates.length) {
            for (const t of this.teammates) {
                if (t.alive === false) continue;
                const yaw = t.yaw || 0;
                // Teammate's WORLD position and a point one step in front of them
                // (forward = (sin(yaw), cos(yaw)), matching the game's yaw =
                // atan2(x, z) convention). Map BOTH through the exact same
                // world->screen transform, then aim the arrow along the screen
                // vector between them. This locks the arrow to the teammate's
                // true world facing — it does NOT spin when the local player
                // rotates the camera (the map rotation cancels out correctly).
                const p = this.worldToScreen(t.x, t.z, scale);
                // Step BEHIND->AHEAD reversed: the model's forward mapped to the
                // opposite on screen, so negate the forward step to flip it 180°.
                const f = this.worldToScreen(t.x - Math.sin(yaw), t.z - Math.cos(yaw), scale);
                const screenAngle = Math.atan2(f.y - p.y, f.x - p.x);
                ctx.save();
                ctx.translate(p.x, p.y);
                // Arrow is modelled pointing along +X at angle 0; rotate to the
                // computed screen facing.
                ctx.rotate(screenAngle);
                ctx.beginPath();
                ctx.moveTo(8, 0);
                ctx.lineTo(-6, 6);
                ctx.lineTo(-3, 0);
                ctx.lineTo(-6, -6);
                ctx.closePath();
                ctx.fillStyle = '#6ee7b7';
                ctx.strokeStyle = HUD.navy;
                ctx.lineWidth = 1.2;
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            }
        }

        if (this.bombPos) {
            const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
            const p = this.worldToScreen(this.bombPos.x, this.bombPos.z, scale);
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.fillStyle = `rgba(229, 62, 62, ${0.3 + 0.3 * pulse})`;
            ctx.beginPath();
            ctx.arc(0, 0, 9 + 4 * pulse, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ff2b2b';
            ctx.beginPath();
            ctx.arc(0, 0, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.restore();
        }

        ctx.restore();
    }

    applyWorldTransform(c, scale) {
        const s = this.size;
        c.translate(s / 2, s / 2);
        c.rotate(this.cameraRotation + Math.PI);
        c.scale(-scale, -scale);
        c.translate(-this.playerPos.x, -this.playerPos.z);
    }

    drawPathUnion(scale) {
        const s = this.size;
        const dpr = window.devicePixelRatio || 1;

        if (!this._pathCanvas) {
            this._pathCanvas = document.createElement('canvas');
            this._pathCanvas.width = s * dpr;
            this._pathCanvas.height = s * dpr;
            this._pathCtx = this._pathCanvas.getContext('2d');
        }
        const pc = this._pathCtx;

        pc.setTransform(dpr, 0, 0, dpr, 0, 0);
        pc.clearRect(0, 0, s, s);

        pc.save();
        this.applyWorldTransform(pc, scale);
        pc.fillStyle = `rgb(${HUD.orangeRGB})`;
        for (const r of this.mapShapes.rects) {
            pc.save();
            pc.translate(r.cx, r.cz);
            if (r.angle) pc.rotate(-r.angle);
            pc.fillRect(-r.w / 2, -r.h / 2, r.w, r.h);
            pc.restore();
        }
        pc.restore();

        this.ctx.save();
        this.ctx.globalAlpha = 0.45;
        this.ctx.drawImage(this._pathCanvas, 0, 0, s, s);
        this.ctx.restore();
    }

    destroy() {
        if (this._onResize) {
            window.removeEventListener('resize', this._onResize);
            this._onResize = null;
        }
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        if (this.playerIcon && this.playerIcon.parentNode) {
            this.playerIcon.parentNode.removeChild(this.playerIcon);
        }
    }
}
