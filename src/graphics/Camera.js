export class Camera {
    constructor() {
        this.camera = null;
        this.spawnPoints = [
            // Orange team (left side) - INSIDE new map boundaries
            { x: -300, y: 10, z: 0 },      
            { x: -280, y: 10, z: 50 },      
            { x: -280, y: 10, z: -50 },       
            { x: -300, y: 10, z: 100 },     
            { x: -300, y: 10, z: -100 },      

            // Red team (right side) - INSIDE new map boundaries
            { x: 300, y: 10, z: 0 },     
            { x: 280, y: 10, z: 50 },      
            { x: 280, y: 10, z: -50 },    
            { x: 300, y: 10, z: 100 },     
            { x: 300, y: 10, z: -100 },      
        ];
        this.init();
    }

    init() {
        const aspect = window.innerWidth / window.innerHeight;
        let fov = 75;
        
        if (aspect < 1.0) {
            fov = 90;
        } else if (aspect < 1.3) {
            fov = 80;
        }
        
        this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 1000);
        this.camera.position.set(0, 10, 0);

        
        this.camera.layers.enable(1);
        

        
        window.addEventListener('resize', () => {
            const newAspect = window.innerWidth / window.innerHeight;
            this.camera.aspect = newAspect;
            
            if (newAspect < 1.0) {
                this.camera.fov = 90;
            } else if (newAspect < 1.3) {
                this.camera.fov = 80;
            } else {
                this.camera.fov = 75;
            }
            
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
