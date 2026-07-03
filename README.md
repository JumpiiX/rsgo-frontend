<h1 align="center">RSGO&nbsp;·&nbsp;Frontend</h1>

<p align="center"><b>The shooter you build yourself.</b><br/>
No fixed map. Nothing to memorise. Every round, the players build the battlefield.</p>

<p align="center"><a href="https://rsgo.io"><b>Play at rsgo.io →</b></a></p>

<p align="center">
  <img src="https://img.shields.io/badge/-%23ef4e23-ef4e23?style=flat&label=RSGO&labelColor=1a2447" alt="RSGO" />
  <img src="https://img.shields.io/badge/three.js-v0.158-1a2447?style=flat&logo=three.js&labelColor=ef4e23" alt="Three.js" />
  <img src="https://img.shields.io/badge/vanilla-JS%20ES6-1a2447?style=flat&logo=javascript&labelColor=11182f" alt="Vanilla JS" />
  <img src="https://img.shields.io/badge/realtime-websocket-1a2447?style=flat&labelColor=11182f" alt="WebSocket" />
  <img src="https://img.shields.io/badge/build%20step-none-1a2447?style=flat&labelColor=11182f" alt="No build step" />
</p>

---

## What is RSGO?

A competitive 3D multiplayer FPS with one twist: **you don't buy guns, you buy the map.**

Each round opens with a short **build phase** — spend your economy on walls, cover and angles, then fight on the battlefield you just made. Because the players author a fresh map every round, there's nothing fixed to pre-aim or memorise. **Skill over study.**

This repository is the **game client** — a browser FPS built from scratch with Three.js, talking to the Rust game server in real time over WebSocket.

## How it plays

- **Build phase** — press **B**, drop into a top-down view, and place structures (walls, barriers, cover) with your round economy.
- **Fight** — the round plays out on the map the teams just built. Move, shoot, plant or defuse the bomb.
- **Repeat** — every round is a new layout. No two rounds are the same.

Two modes: **Deathmatch** (free-for-all warmup) and **Team vs Team** (5v5, build → attack/defend → bomb).

## Under the hood

| Area | What lives here |
|------|-----------------|
| `src/core/` | Game loop, input & FPS controls, orchestration |
| `src/graphics/` | Three.js renderer, scene, camera, map & lighting |
| `src/game/` | Players, weapons, bullets, kill-cam, replays |
| `src/network/` | WebSocket client & message protocol |
| `src/physics/` | Movement & projectile collision |
| `src/ui/` | HUD, scoreboard, minimap, kill feed |

Pure **ES6 modules**, Three.js from CDN, **no build step** — it runs straight in the browser.
