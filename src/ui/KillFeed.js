export class KillFeed {

    constructor(parent = document.body) {
        this.maxKills = 5;
        this.killTimeout = 5000;
        this.kills = [];
        this.parent = parent;
        this.createKillFeedUI();
    }

    createKillFeedUI() {
        this.killFeedElement = document.createElement('div');
        this.killFeedElement.id = 'killFeed';

        this.killFeedElement.style.cssText = `
            width: 100%;
            pointer-events: none;
            display: flex;
            flex-direction: column;
            gap: 5px;
        `;
        this.parent.appendChild(this.killFeedElement);
    }

    addKill(killerName, victimName, isYouKiller = false, isYouVictim = false, killerTeam = null, victimTeam = null) {
        const killEntry = {
            killer: killerName,
            victim: victimName,
            timestamp: Date.now(),
            isYouKiller,
            isYouVictim,
            killerTeam,
            victimTeam
        };

        this.kills.unshift(killEntry);

        if (this.kills.length > this.maxKills) {
            this.kills.pop();
        }

        this.updateDisplay();

        setTimeout(() => {
            this.removeOldKills();
        }, this.killTimeout);
    }

    removeOldKills() {
        const now = Date.now();
        this.kills = this.kills.filter(kill => now - kill.timestamp < this.killTimeout);
        this.updateDisplay();
    }

    updateDisplay() {
        this.killFeedElement.innerHTML = '';

        this.kills.forEach((kill, index) => {
            const killRow = document.createElement('div');

            const age = Date.now() - kill.timestamp;
            const opacity = Math.max(0.3, 1 - (age / this.killTimeout) * 0.5);

            const involvesYou = kill.isYouKiller || kill.isYouVictim;
            killRow.style.cssText = `
                background: ${involvesYou ? 'rgba(239, 78, 35, 0.16)' : 'rgba(26, 36, 71, 0.85)'};
                border-left: 3px solid ${involvesYou ? '#ef4e23' : 'rgba(239, 78, 35, 0.25)'};
                border-radius: 0 6px 6px 0;
                padding: 7px 12px;
                display: flex;
                align-items: center;
                font-size: 13px;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                animation: slideInLeft 0.2s ease-out;
                opacity: ${opacity};
                transition: opacity 0.3s ease-out;
                backdrop-filter: blur(6px);
            `;

            const killer = document.createElement('span');
            killer.style.cssText = `
                color: ${kill.isYouKiller ? '#fff' : 'rgba(239, 78, 35, 0.95)'};
                font-weight: ${kill.isYouKiller ? '700' : '500'};
            `;
            killer.textContent = kill.killer || 'Player';

            const icon = document.createElement('span');
            icon.style.cssText = `
                margin: 0 9px;
                color: rgba(239, 78, 35, 0.55);
                font-weight: 700;
            `;
            icon.textContent = '→';

            const victim = document.createElement('span');
            victim.style.cssText = `
                color: ${kill.isYouVictim ? '#fff' : 'rgba(239, 78, 35, 0.7)'};
                font-weight: ${kill.isYouVictim ? '700' : '500'};
            `;
            victim.textContent = kill.victim || 'Player';

            killRow.appendChild(killer);
            killRow.appendChild(icon);
            killRow.appendChild(victim);

            this.killFeedElement.appendChild(killRow);
        });

        if (!document.getElementById('killFeedStyles')) {
            const style = document.createElement('style');
            style.id = 'killFeedStyles';
            style.textContent = `
                @keyframes slideInLeft {
                    from {
                        transform: translateX(-20px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }

    clear() {
        this.kills = [];
        this.updateDisplay();
    }
}