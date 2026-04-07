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
            width: 500px;
            max-height: 600px;
            background: rgba(0, 0, 0, 0.85);
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 10px;
            padding: 20px;
            z-index: 1000;
            display: none;
            font-family: Arial, sans-serif;
            backdrop-filter: blur(5px);
            box-shadow: 0 0 30px rgba(0, 0, 0, 0.7);
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            text-align: center;
            color: #ffffff;
            font-size: 28px;
            font-weight: bold;
            margin-bottom: 20px;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
            border-bottom: 2px solid rgba(255, 255, 255, 0.3);
            padding-bottom: 10px;
        `;
        header.textContent = 'LEADERBOARD';
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
            color: #cccccc;
            font-size: 14px;
            margin-top: 10px;
            opacity: 0.7;
        `;
        footer.textContent = 'Hold TAB to view scoreboard';
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
                padding: 12px 15px;
                margin: 5px 0;
                background: ${index === 0 ? 'rgba(255, 215, 0, 0.2)' : 'rgba(255, 255, 255, 0.1)'};
                border: 1px solid ${index === 0 ? 'rgba(255, 215, 0, 0.5)' : 'rgba(255, 255, 255, 0.2)'};
                border-radius: 5px;
                transition: background 0.3s ease;
            `;

            // Rank
            const rank = document.createElement('div');
            rank.style.cssText = `
                font-size: 18px;
                font-weight: bold;
                color: ${index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : index === 2 ? '#CD7F32' : '#ffffff'};
                min-width: 40px;
                text-align: center;
            `;
            rank.textContent = `#${index + 1}`;

            // Player name
            const name = document.createElement('div');
            name.style.cssText = `
                flex: 1;
                font-size: 16px;
                color: ${player.isCurrentPlayer ? '#00ff00' : '#ffffff'};
                font-weight: ${player.isCurrentPlayer ? 'bold' : 'normal'};
                margin: 0 15px;
                text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
            `;
            name.textContent = player.isCurrentPlayer ? `${player.name} (You)` : player.name;

            // Kills
            const kills = document.createElement('div');
            kills.style.cssText = `
                font-size: 16px;
                color: #ff6666;
                font-weight: bold;
                min-width: 60px;
                text-align: center;
                text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
            `;
            kills.textContent = `${player.kills} kills`;

            playerRow.appendChild(rank);
            playerRow.appendChild(name);
            playerRow.appendChild(kills);

            // Hover effect
            playerRow.addEventListener('mouseenter', () => {
                playerRow.style.background = 'rgba(255, 255, 255, 0.2)';
            });

            playerRow.addEventListener('mouseleave', () => {
                playerRow.style.background = index === 0 ? 'rgba(255, 215, 0, 0.2)' : 'rgba(255, 255, 255, 0.1)';
            });

            this.playersContainer.appendChild(playerRow);
        });

        // Update total players count
        const totalPlayers = document.createElement('div');
        totalPlayers.style.cssText = `
            text-align: center;
            color: #cccccc;
            font-size: 14px;
            margin-top: 15px;
            padding-top: 10px;
            border-top: 1px solid rgba(255, 255, 255, 0.2);
        `;
        totalPlayers.textContent = `Total Players: ${this.players.length}`;
        this.playersContainer.appendChild(totalPlayers);
    }
}