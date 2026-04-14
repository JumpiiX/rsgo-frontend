# RSGO Frontend

<p align="center">
  <a href="https://threejs.org/">
    <img src="https://img.shields.io/badge/3d-three.js-black?style=flat&logo=three.js" alt="3D with Three.js" />
  </a>
  <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript">
    <img src="https://img.shields.io/badge/vanilla-javascript-yellow?style=flat&logo=javascript" alt="Vanilla JavaScript" />
  </a>
  <a href="https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API">
    <img src="https://img.shields.io/badge/realtime-websocket-blue?style=flat" alt="Real-time WebSocket" />
  </a>
  <a href="https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API">
    <img src="https://img.shields.io/badge/controls-pointer--lock-green?style=flat" alt="Pointer Lock Controls" />
  </a>
  <br />
  <a href="https://unpkg.com/three@0.158.0/">
    <img src="https://img.shields.io/badge/three.js-v0.158.0-orange?style=flat" alt="Three.js Version" />
  </a>
  <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules">
    <img src="https://img.shields.io/badge/modules-es6-purple?style=flat" alt="ES6 Modules" />
  </a>
</p>

3D multiplayer FPS client built from scratch with Three.js. Real-time gameplay with WebSocket communication to Rust backend.

## Architecture

**Core Game Engine** (`src/core/`)
- Main game loop and system orchestration
- Input handling with FPS controls and pointer lock
- WebSocket client for server communication

**3D Graphics** (`src/graphics/`)
- Three.js renderer and scene management
- Camera system with first-person perspective
- Map building and lighting systems

**Game Systems** (`src/game/`)
- Player management with 3D character models
- Weapon system with revolver mechanics
- Bullet physics and collision detection

**Network Layer** (`src/network/`)
- WebSocket client for real-time server communication
- Message handling for game events
- Player state synchronization

**User Interface** (`src/ui/`)
- HUD elements (health, ammo, minimap)
- Scoreboard and kill feed
- Death camera and respawn interface

**Physics** (`src/physics/`)
- Collision detection for movement and projectiles
- Map boundary enforcement

Uses ES6 modules with Three.js loaded from CDN. No build process - runs directly in browser.