export class Scoreboard {
    constructor() {
        this.visible = false;
        this.players = [];
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
            width: 450px;
            max-height: 500px;
            background: rgba(0, 0, 0, 0.9);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 24px;
            z-index: 1000;
            display: none;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            backdrop-filter: blur(10px);
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            text-align: center;
            color: rgba(255, 255, 255, 0.9);
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 20px;
            letter-spacing: 2px;
            text-transform: uppercase;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            padding-bottom: 12px;
        `;
        header.textContent = 'Scoreboard';
        this.scoreboardElement.appendChild(header);

        // Players container
        this.playersContainer = document.createElement('div');
        this.playersContainer.id = 'playersContainer';
        this.playersContainer.style.cssText = `
            max-height: 400px;
            overflow-y: auto;
            margin-bottom: 20px;
        `;
        this.scoreboardElement.appendChild(this.playersContainer);

        // Footer instruction
        const footer = document.createElement('div');
        footer.style.cssText = `
            text-align: center;
            color: rgba(255, 255, 255, 0.4);
            font-size: 11px;
            margin-top: 16px;
            text-transform: uppercase;
            letter-spacing: 1px;
        `;
        footer.textContent = 'Tab to close';
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

    updatePlayers(playersData) {
        this.players = playersData.sort((a, b) => b.kills - a.kills);
        if (this.visible) {
            this.updateDisplay();
        }
    }

    updateDisplay() {
        this.playersContainer.innerHTML = '';

        if (this.players.length === 0) {
            const noPlayers = document.createElement('div');
            noPlayers.style.cssText = `
                text-align: center;
                color: #cccccc;
                font-size: 16px;
                padding: 20px;
            `;
            noPlayers.textContent = 'No players in game';
            this.playersContainer.appendChild(noPlayers);
            return;
        }

        this.players.forEach((player, index) => {
            const playerRow = document.createElement('div');
            playerRow.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 12px;
                margin: 2px 0;
                background: ${index === 0 ? 'rgba(76, 175, 80, 0.1)' : 'transparent'};
                border-left: 2px solid ${index === 0 ? '#4CAF50' : 'transparent'};
                transition: all 0.2s ease;
            `;

            // Rank
            const rank = document.createElement('div');
            rank.style.cssText = `
                font-size: 13px;
                font-weight: 500;
                color: ${index === 0 ? '#4CAF50' : 'rgba(255, 255, 255, 0.5)'};
                min-width: 30px;
                text-align: left;
            `;
            rank.textContent = `${index + 1}`;

            // Player name
            const name = document.createElement('div');
            name.style.cssText = `
                flex: 1;
                font-size: 13px;
                color: ${player.isCurrentPlayer ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.8)'};
                font-weight: ${player.isCurrentPlayer ? '500' : '400'};
                margin: 0 20px;
            `;
            name.textContent = player.name;

            // Kills
            const kills = document.createElement('div');
            kills.style.cssText = `
                font-size: 14px;
                color: rgba(255, 255, 255, 0.9);
                font-weight: 300;
                min-width: 30px;
                text-align: right;
            `;
            kills.textContent = `${player.kills}`;

            playerRow.appendChild(rank);
            playerRow.appendChild(name);
            playerRow.appendChild(kills);

            // Hover effect
            playerRow.addEventListener('mouseenter', () => {
                if (index !== 0) playerRow.style.background = 'rgba(255, 255, 255, 0.03)';
            });

            playerRow.addEventListener('mouseleave', () => {
                if (index !== 0) playerRow.style.background = 'transparent';
            });

            this.playersContainer.appendChild(playerRow);
        });

        // Update total players count
        const totalPlayers = document.createElement('div');
        totalPlayers.style.cssText = `
            text-align: center;
            color: rgba(255, 255, 255, 0.4);
            font-size: 11px;
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            text-transform: uppercase;
            letter-spacing: 1px;
        `;
        totalPlayers.textContent = `${this.players.length} Players`;
        this.playersContainer.appendChild(totalPlayers);
    }
}