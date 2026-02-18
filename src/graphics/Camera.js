export class Camera {
    constructor() {
        this.camera = null;
        this.spawnPoints = [
            // Central street crossing - completely open
            { x: 0, y: 10, z: 30 },
            
            // Street left side - far from buildings
            { x: -60, y: 10, z: 0 },
            
            // Street right side - far from buildings  
            { x: 60, y: 10, z: 0 },
            
            // North street area - safe zone
            { x: 0, y: 10, z: -150 },
            
            // South street area - safe zone
            { x: 0, y: 10, z: 150 },
            
            // West street area
            { x: -150, y: 10, z: 0 },
            
            // East street area
            { x: 150, y: 10, z: 0 },
            
            // Diagonal open areas
            { x: -90, y: 10, z: -90 },
            { x: 90, y: 10, z: 90 }
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