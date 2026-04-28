import { Game } from './core/Game.js';

if (window.isMapBuilderMode) {
    console.log('🗺️ Map Builder Mode Detected!');
    
    // Wait for DOM to load, then start map builder
    window.addEventListener('DOMContentLoaded', () => {
        
        // Create game instance
        const game = new Game();
        
        // Set up for direct map access
        game.gameMode = 'team';
        game.mapType = 'orangePlanet';
        game.playerName = 'MapBuilder';
        game.gameStarted = false;
        
        // Start the game directly with orange planet
        setTimeout(() => {
            console.log('🚀 Loading clean flat orange planet...');
            game.startGame();
        }, 200);
        
        console.log('🎮 Map Builder Active! Use WASD + mouse to explore');
        console.log('🔧 Ready to build step by step!');
    });
} else {
    // Normal game initialization
    const game = new Game();
}
