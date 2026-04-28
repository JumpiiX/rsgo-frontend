export class KillFeed {
    constructor() {
        this.maxKills = 5;
        this.killTimeout = 5000;
        this.kills = [];
        this.createKillFeedUI();
    }

    createKillFeedUI() {
        this.killFeedElement = document.createElement('div');
        this.killFeedElement.id = 'killFeed';
        this.killFeedElement.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            width: 280px;
            max-height: 200px;
            z-index: 100;
            pointer-events: none;
            display: flex;
            flex-direction: column-reverse;
            gap: 4px;
        `;
        document.body.appendChild(this.killFeedElement);
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
            
            killRow.style.cssText = `
                background: rgba(0, 0, 0, 0.7);
                border-left: 2px solid ${kill.isYouKiller ? '#4CAF50' : kill.isYouVictim ? '#f44336' : 'rgba(255, 255, 255, 0.2)'};
                padding: 6px 10px;
                display: flex;
                align-items: center;
                font-size: 12px;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                animation: slideInLeft 0.2s ease-out;
                opacity: ${opacity};
                transition: opacity 0.3s ease-out;
            `;

            // Killer name with team color
            const killer = document.createElement('span');
            // Determine killer team color (you can pass team info in addKill method)
            const killerColor = kill.isYouKiller ? '#4CAF50' : (kill.killerTeam === 'orange' ? '#ff6b35' : kill.killerTeam === 'red' ? '#dc3545' : 'rgba(255, 255, 255, 0.8)');
            killer.style.cssText = `
                color: ${killerColor};
                font-weight: ${kill.isYouKiller ? '500' : '400'};
            `;
            killer.textContent = kill.killer || 'Player';

            // Death icon (skull)
            const icon = document.createElement('span');
            icon.style.cssText = `
                display: inline-flex;
                margin: 0 8px;
                opacity: 0.6;
            `;
            icon.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255, 255, 255, 0.5)">
                    <path d="M12 2C7.03 2 3 6.03 3 11c0 3.5 2 6.5 5 8l1 3h6l1-3c3-1.5 5-4.5 5-8 0-4.97-4.03-9-9-9zm0 2c3.86 0 7 3.14 7 7 0 2.8-1.64 5.21-4 6.34V19h-6v-1.66C6.64 16.21 5 13.8 5 11c0-3.86 3.14-7 7-7zm-3 6c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1zm6 0c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1zm-3 4c-1.1 0-2 .9-2 2h4c0-1.1-.9-2-2-2z"/>
                </svg>
            `;

            // Victim name with team color
            const victim = document.createElement('span');
            const victimColor = kill.isYouVictim ? '#f44336' : (kill.victimTeam === 'orange' ? '#ff6b35' : kill.victimTeam === 'red' ? '#dc3545' : 'rgba(255, 255, 255, 0.6)');
            victim.style.cssText = `
                color: ${victimColor};
                font-weight: ${kill.isYouVictim ? '500' : '400'};
            `;
            victim.textContent = kill.victim || 'Player';

            killRow.appendChild(killer);
            killRow.appendChild(icon);
            killRow.appendChild(victim);

            this.killFeedElement.appendChild(killRow);
        });

        // Add animation styles if not already present
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