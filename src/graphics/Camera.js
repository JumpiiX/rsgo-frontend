export class Camera {
    constructor() {
        this.camera = null;
        this.spawnPoints = [
            // T-Side spawns (attacking team)
            { x: -30, y: 10, z: 320 },      // South main spawn (moved left to avoid wall)
            { x: -50, y: 10, z: 330 },      // South left spawn
            { x: 50, y: 10, z: 330 },       // South right spawn
            { x: -100, y: 10, z: 300 },     // South wide left
            { x: 100, y: 10, z: 300 },      // South wide right

            // CT-Side spawns (defending team)
            // Removed problematic spawn #6
            { x: -50, y: 10, z: -330 },     // North left spawn
            { x: 50, y: 10, z: -330 },      // North right spawn
            { x: -100, y: 10, z: -300 },    // North wide left
            { x: 100, y: 10, z: -300 },     // North wide right

            // Mid spawns for deathmatch mode
            { x: -200, y: 10, z: 100 },     // West mid open area
            { x: 200, y: 10, z: -100 },     // East mid open area
            { x: -50, y: 10, z: 150 },      // South-west open area (moved from 0,200)
            { x: -100, y: 10, z: -100 },    // Northwest open area
            { x: 100, y: 10, z: 100 },      // Southeast open area
        ];
        this.init();
    }

    init() {
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 10, 0);

        // Enable rendering of layer 1 for weapon overlay
        this.camera.layers.enable(1);

        // Handle window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
        });
    }

    getCamera() {
        return this.camera;
    }

    getPosition() {
        return this.camera.position;
    }

    getRotation() {
        return this.camera.rotation;
    }

    spawnAtIndex(index) {
        const spawnIndex = index % this.spawnPoints.length;
        const spawn = this.spawnPoints[spawnIndex];
        this.camera.position.set(spawn.x, spawn.y, spawn.z);
    }
}
