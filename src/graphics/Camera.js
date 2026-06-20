export class Camera {
    constructor() {
        this.camera = null;
        this.spawnPoints = [
            // Attacker spawn points (bottom spawn area at z = -300)
            { x: 0, y: 10, z: -300 },      
            { x: -15, y: 10, z: -300 },      
            { x: 15, y: 10, z: -300 },       
            { x: -30, y: 10, z: -300 },     
            { x: 30, y: 10, z: -300 },      

            // Defender spawn points (top spawn area at z = 300)
            { x: 0, y: 10, z: 300 },      
            { x: -15, y: 10, z: 300 },      
            { x: 15, y: 10, z: 300 },       
            { x: -30, y: 10, z: 300 },     
            { x: 30, y: 10, z: 300 },      
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
        
        // Near plane very close (0.01) so the first-person weapon viewmodel can
        // sit right up against the camera without being clipped. The map-wide
        // z-fighting that a tiny near plane would normally cause is handled by
        // the renderer's logarithmicDepthBuffer, so we can keep near this small.
        this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.01, 1000);
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
    
    shake(intensity = 1.0, duration = 500) {
        // Camera shake effect for explosions
        const originalPosition = this.camera.position.clone();
        const startTime = Date.now();
        
        const shakeInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            if (elapsed > duration) {
                clearInterval(shakeInterval);
                this.camera.position.copy(originalPosition);
                return;
            }
            
            // Decay the shake over time
            const decay = 1 - (elapsed / duration);
            const currentIntensity = intensity * decay;
            
            // Random shake offset
            this.camera.position.x = originalPosition.x + (Math.random() - 0.5) * currentIntensity * 2;
            this.camera.position.y = originalPosition.y + (Math.random() - 0.5) * currentIntensity;
            this.camera.position.z = originalPosition.z + (Math.random() - 0.5) * currentIntensity * 2;
        }, 16); // 60 FPS
    }
}
