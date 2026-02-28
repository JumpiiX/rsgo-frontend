export class Camera {
    constructor() {
        this.camera = null;
        this.spawnPoints = [
            
            { x: -30, y: 10, z: 320 },      
            { x: -50, y: 10, z: 330 },      
            { x: 50, y: 10, z: 330 },       
            { x: -100, y: 10, z: 300 },     
            { x: 100, y: 10, z: 300 },      

            
            
            { x: -50, y: 10, z: -330 },     
            { x: 50, y: 10, z: -330 },      
            { x: -100, y: 10, z: -300 },    
            { x: 100, y: 10, z: -300 },     

            
            { x: -200, y: 10, z: 100 },     
            { x: 200, y: 10, z: -100 },     
            { x: -50, y: 10, z: 150 },      
            { x: -100, y: 10, z: -100 },    
            { x: 100, y: 10, z: 100 },      
        ];
        this.init();
    }

    init() {
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 10, 0);

        
        this.camera.layers.enable(1);

        
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
