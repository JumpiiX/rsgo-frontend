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
            bottom: 30px;
            left: 30px;
            width: 350px;
            max-height: 200px;
            z-index: 100;
            pointer-events: none;
            display: flex;
            flex-direction: column-reverse;
            gap: 5px;
        `;
        document.body.appendChild(this.killFeedElement);
    }

    addKill(killerName, victimName, isYouKiller = false, isYouVictim = false) {
        const killEntry = {
            killer: killerName,
            victim: victimName,
            timestamp: Date.now(),
            isYouKiller,
            isYouVictim
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
                border-radius: 5px;
                padding: 8px 12px;
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 14px;
                font-family: Arial, sans-serif;
                border-left: 3px solid ${kill.isYouKiller ? '#00ff00' : kill.isYouVictim ? '#ff0000' : '#666666'};
                animation: slideIn 0.3s ease-out;
                opacity: ${opacity};
                transition: opacity 0.5s ease-out;
            `;

            // Killer name
            const killer = document.createElement('span');
            killer.style.cssText = `
                color: ${kill.isYouKiller ? '#00ff00' : '#ffffff'};
                font-weight: ${kill.isYouKiller ? 'bold' : 'normal'};
                text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
            `;
            killer.textContent = kill.killer;

            // Kill text
            const icon = document.createElement('span');
            icon.style.cssText = `
                color: #ff6666;
                font-size: 12px;
                margin: 0 8px;
                font-weight: bold;
                text-transform: uppercase;
            `;
            icon.textContent = 'killed';

            // Victim name  
            const victim = document.createElement('span');
            victim.style.cssText = `
                color: ${kill.isYouVictim ? '#ff0000' : '#cccccc'};
                font-weight: ${kill.isYouVictim ? 'bold' : 'normal'};
                text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
            `;
            victim.textContent = kill.victim;

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
                @keyframes slideIn {
                    from {
                        transform: translateX(-100%);
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