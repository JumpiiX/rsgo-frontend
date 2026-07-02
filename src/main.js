import { Game } from './core/Game.js';

if (window.isMapBuilderMode) {
    console.log('🗺️ Map Builder Mode Detected!');

    window.addEventListener('DOMContentLoaded', () => {

        const game = new Game();

        game.gameMode = 'team';
        game.mapType = 'orangePlanet';
        game.playerName = 'MapBuilder';
        game.gameStarted = false;

        setTimeout(() => {
            console.log('🚀 Loading clean flat orange planet...');
            game.startGame();
        }, 200);

        console.log('🎮 Map Builder Active! Use WASD + mouse to explore');
        console.log('🔧 Ready to build step by step!');
    });
} else {

    const game = new Game();
}
