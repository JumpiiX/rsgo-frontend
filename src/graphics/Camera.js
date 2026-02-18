export class Camera {
    constructor() {
        this.camera = null;
        this.spawnPoints = [
            // T-Side spawns (attacking team)
            { x: 0, y: 10, z: 350 },        // South main spawn
            { x: -50, y: 10, z: 330 },      // South left spawn
            { x: 50, y: 10, z: 330 },       // South right spawn
            { x: -100, y: 10, z: 300 },     // South wide left
            { x: 100, y: 10, z: 300 },      // South wide right
            
            // CT-Side spawns (defending team)
            { x: 0, y: 10, z: -350 },       // North main spawn
            { x: -50, y: 10, z: -330 },     // North left spawn
            { x: 50, y: 10, z: -330 },      // North right spawn
            { x: -100, y: 10, z: -300 },    // North wide left
            { x: 100, y: 10, z: -300 },     // North wide right
            
            // Mid spawns for deathmatch mode
            { x: -300, y: 10, z: 0 },       // West warehouse spawn
            { x: 300, y: 10, z: 0 },        // East warehouse spawn
            { x: 0, y: 10, z: 0 },          // Center spawn
            { x: -150, y: 10, z: -150 },    // Northwest tactical spawn
            { x: 150, y: 10, z: 150 },      // Southeast tactical spawn
        ];
        this.init();
    }

    init() {
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 10, 0);

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