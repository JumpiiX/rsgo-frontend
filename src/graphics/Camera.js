export class Camera {
    constructor() {
        this.camera = null;
        this.spawnPoints = [
            // Near central plaza - safe open area
            { x: 20, y: 10, z: 20 },
            
            // Near left building - front courtyard
            { x: -100, y: 10, z: -80 },
            
            // Near right building - open area
            { x: 120, y: 10, z: 80 },
            
            // Near industrial area - loading dock
            { x: -180, y: 10, z: 20 },
            
            // Near corner structure - open plaza
            { x: 130, y: 10, z: -130 }
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