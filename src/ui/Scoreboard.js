import { HUD, hudPanel } from './HudTheme.js';

export class Scoreboard {
    constructor() {
        this.visible = false;
        this.players = [];
        this.meta = { gameMode: null, localTeam: null, orangeScore: 0, redScore: 0, roundNumber: 1 };
        this.scoreboardElement = null;
        this.createScoreboardUI();
    }

    createScoreboardUI() {
        this.scoreboardElement = document.createElement('div');
        this.scoreboardElement.id = 'scoreboard';
        this.scoreboardElement.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 760px;
            max-width: 94vw;
            max-height: 86vh;
            ${hudPanel(14)}
            padding: 22px 24px 18px;
            z-index: 1000;
            display: none;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            box-shadow: 0 16px 50px rgba(0, 0, 0, 0.55);
        `;

        this.bodyContainer = document.createElement('div');
        this.scoreboardElement.appendChild(this.bodyContainer);

        const footer = document.createElement('div');
        footer.style.cssText = `
            text-align: center;
            color: ${HUD.textFaint};
            font-size: 10px;
            margin-top: 16px;
            text-transform: uppercase;
            letter-spacing: 2px;
        `;
        footer.textContent = 'Hold Tab';
        this.scoreboardElement.appendChild(footer);

        document.body.appendChild(this.scoreboardElement);
    }

    show() {
        this.visible = true;
        this.scoreboardElement.style.display = 'block';
        this.updateDisplay();
    }

    hide() {
        this.visible = false;
        this.scoreboardElement.style.display = 'none';
    }

    isVisible() {
        return this.visible;
    }

    updatePlayers(playersData, meta = null) {
        this.players = playersData || [];
        if (meta) this.meta = { ...this.meta, ...meta };
        if (this.visible) this.updateDisplay();
    }

    // Proactively flip a player's alive flag (e.g. on respawn) so the row
    // un-greys immediately, without waiting for the next full scoreboard push.
    setAlive(playerId, alive) {
        let changed = false;
        for (const p of this.players) {
            if (p.id === playerId && p.alive !== alive) { p.alive = alive; changed = true; }
        }
        if (changed && this.visible) this.updateDisplay();
    }

    updateDisplay() {
        this.bodyContainer.innerHTML = '';
        if (this.meta.gameMode === 'team') {
            this._renderTeamView();
        } else {
            this._renderListView();
        }
    }

    // ---- Team view: two columns, side by side ----

    _renderTeamView() {
        const local = this.meta.localTeam;
        // Your team on the left, enemy on the right.
        const left = local === 'red' ? 'red' : 'orange';
        const right = left === 'orange' ? 'red' : 'orange';
        const scoreOf = (t) => (t === 'orange' ? this.meta.orangeScore : this.meta.redScore) || 0;

        // Centered score header
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex; align-items: center; justify-content: center;
            gap: 20px; margin-bottom: 18px; padding-bottom: 14px;
            border-bottom: 1px solid ${HUD.border};
        `;
        header.innerHTML = `
            <div style="flex:1; text-align:right; font-size:12px; letter-spacing:2px; text-transform:uppercase; font-weight:600; color:${this._accent(left, local)};">
                ${this._teamLabel(left)}${left === local ? ' <span style="color:' + HUD.textFaint + '; font-weight:400;">· you</span>' : ''}
            </div>
            <div style="font-size:24px; font-weight:700; font-variant-numeric:tabular-nums; color:#e6e9f0;">
                ${scoreOf(left)}<span style="color:${HUD.textFaint}; margin:0 10px; font-weight:400;">/</span>${scoreOf(right)}
            </div>
            <div style="flex:1; text-align:left; font-size:12px; letter-spacing:2px; text-transform:uppercase; font-weight:600; color:${this._accent(right, local)};">
                ${this._teamLabel(right)}${right === local ? ' <span style="color:' + HUD.textFaint + '; font-weight:400;">· you</span>' : ''}
            </div>
        `;
        this.bodyContainer.appendChild(header);

        // Two columns
        const cols = document.createElement('div');
        cols.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 20px;';
        cols.appendChild(this._teamColumn(left, local));
        cols.appendChild(this._teamColumn(right, local));
        this.bodyContainer.appendChild(cols);
    }

    _teamColumn(team, local) {
        const isLocal = team === local;
        const accent = this._accent(team, local);
        const rows = this.players
            .filter((p) => p.team === team)
            .sort((a, b) => b.kills - a.kills);
        const showMoney = rows.some((p) => p.money !== null && p.money !== undefined);

        const col = document.createElement('div');

        // Column header row (labels)
        const head = document.createElement('div');
        head.style.cssText = `
            display: grid;
            grid-template-columns: 1fr 32px 32px 44px${showMoney ? ' 62px' : ''};
            gap: 6px; padding: 0 10px 8px;
            font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase;
            color: ${HUD.textFaint};
            border-bottom: 1px solid ${isLocal ? HUD.border : 'rgba(255,255,255,0.06)'};
        `;
        head.innerHTML = `
            <div>${this._teamLabel(team)}</div>
            <div style="text-align:right;">K</div>
            <div style="text-align:right;">D</div>
            <div style="text-align:right;">K/D</div>
            ${showMoney ? '<div style="text-align:right;">$</div>' : ''}
        `;
        col.appendChild(head);

        if (rows.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = `padding:16px 10px; text-align:center; color:${HUD.textFaint}; font-size:12px;`;
            empty.textContent = '—';
            col.appendChild(empty);
            return col;
        }

        rows.forEach((p) => {
            const kd = p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : p.kills.toFixed(2);
            const dead = p.alive === false;
            const nameColor = p.isCurrentPlayer ? accent : '#e6e9f0';

            const row = document.createElement('div');
            row.style.cssText = `
                display: grid;
                grid-template-columns: 1fr 32px 32px 44px${showMoney ? ' 62px' : ''};
                gap: 6px; align-items: center; padding: 9px 10px;
                font-size: 13px; font-variant-numeric: tabular-nums;
                border-bottom: 1px solid rgba(255,255,255,0.04);
                opacity: ${dead ? '0.4' : '1'};
                ${p.isCurrentPlayer ? `background: rgba(${this._accentRGB(team, local)}, 0.10); border-radius: 6px;` : ''}
            `;

            // marker: accent bar for local team, faint for enemy; carrier = filled dot
            const marker = p.hasBomb
                ? `<span title="carrier" style="flex:0 0 auto; width:6px; height:6px; border-radius:50%; background:${accent};"></span>`
                : `<span style="flex:0 0 auto; width:2px; height:12px; border-radius:2px; background:${isLocal ? accent : 'rgba(255,255,255,0.15)'};"></span>`;
            const name = `<span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:${p.isCurrentPlayer ? '600' : '400'}; color:${nameColor};">${this._escape(p.name)}</span>`;
            const nameCol = `<div style="display:flex; align-items:center; gap:8px; min-width:0;">${marker}${name}</div>`;

            let moneyCell = '';
            if (showMoney) {
                const m = (p.money === null || p.money === undefined)
                    ? `<span style="color:${HUD.textFaint};">—</span>`
                    : `<span style="color:#e6e9f0;">$${p.money}</span>`;
                moneyCell = `<div style="text-align:right;">${m}</div>`;
            }

            row.innerHTML = `
                ${nameCol}
                <div style="text-align:right; color:#e6e9f0;">${p.kills}</div>
                <div style="text-align:right; color:${HUD.textDim};">${p.deaths}</div>
                <div style="text-align:right; color:${HUD.textDim};">${kd}</div>
                ${moneyCell}
            `;
            col.appendChild(row);
        });

        return col;
    }

    // ---- Deathmatch fallback (single ranked list) ----

    _renderListView() {
        const header = document.createElement('div');
        header.style.cssText = `
            text-align: center; color: ${HUD.text};
            font-size: 13px; font-weight: 600; margin-bottom: 16px;
            letter-spacing: 2px; text-transform: uppercase;
            border-bottom: 1px solid ${HUD.border}; padding-bottom: 12px;
        `;
        header.textContent = 'Scoreboard';
        this.bodyContainer.appendChild(header);

        const list = document.createElement('div');
        list.style.cssText = 'max-height: 60vh; overflow-y: auto;';

        const sorted = [...this.players].sort((a, b) => b.kills - a.kills);
        if (sorted.length === 0) {
            list.innerHTML = `<div style="text-align:center; color:${HUD.textFaint}; padding:20px;">No players</div>`;
        } else {
            sorted.forEach((player, index) => {
                const kd = player.deaths > 0 ? (player.kills / player.deaths).toFixed(2) : player.kills.toFixed(2);
                const row = document.createElement('div');
                row.style.cssText = `
                    display: grid; grid-template-columns: 30px 1fr 48px 48px 56px;
                    gap: 8px; align-items: center; padding: 10px 12px;
                    font-size: 13px; font-variant-numeric: tabular-nums;
                    border-bottom: 1px solid rgba(255,255,255,0.04);
                    ${player.isCurrentPlayer ? `background: rgba(${HUD.orangeRGB}, 0.10); border-radius: 6px;` : ''}
                `;
                row.innerHTML = `
                    <div style="color:${index === 0 ? HUD.text : HUD.textFaint};">${index + 1}</div>
                    <div style="color:${player.isCurrentPlayer ? HUD.text : '#e6e9f0'}; font-weight:${player.isCurrentPlayer ? '600' : '400'}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this._escape(player.name)}</div>
                    <div style="text-align:right; color:#e6e9f0;">${player.kills}</div>
                    <div style="text-align:right; color:${HUD.textDim};">${player.deaths}</div>
                    <div style="text-align:right; color:${HUD.textDim};">${kd}</div>
                `;
                list.appendChild(row);
            });
            const colHead = document.createElement('div');
            colHead.style.cssText = `
                display: grid; grid-template-columns: 30px 1fr 48px 48px 56px; gap: 8px;
                padding: 0 12px 8px; font-size: 9px; letter-spacing:1.5px; text-transform:uppercase;
                color:${HUD.textFaint}; border-bottom: 1px solid ${HUD.border};
            `;
            colHead.innerHTML = `<div>#</div><div>Player</div><div style="text-align:right;">K</div><div style="text-align:right;">D</div><div style="text-align:right;">K/D</div>`;
            this.bodyContainer.appendChild(colHead);
        }
        this.bodyContainer.appendChild(list);
    }

    // ---- helpers ----

    // The two teams are the brand's two colors: Orange (#ef4e23) and Navy
    // (#5b7bb4). Internal team id 'red' is displayed as "Navy" everywhere in
    // the UI, so we mirror that here.
    _accent(team) {
        return team === 'orange' ? HUD.orange : '#5b7bb4';
    }
    _accentRGB(team) {
        return team === 'orange' ? HUD.orangeRGB : '91, 123, 180';
    }

    _teamLabel(team) {
        return team === 'orange' ? 'Orange' : 'Navy';
    }

    _escape(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}
