export class Renderer {
    constructor() {
        this.renderer = null;
        this.init();
    }

    init() {
        // logarithmicDepthBuffer: the camera spans a huge near/far range (a
        // viewmodel ~0.05 away out to a 1000-unit map). A normal depth buffer
        // loses precision at that range and the floor / bomb sites / walls
        // z-fight (shimmer) when the build-mode top camera moves. A log depth
        // buffer distributes precision so distant coplanar surfaces stay stable.
        this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x3a3a4a); 
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        
        window.addEventListener('resize', () => {
            this.renderer.setPixelRatio(window.devicePixelRatio);
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    render(scene, camera) {
        this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
        this.renderer.render(scene, camera);
    }

    getRenderer() {
        return this.renderer;
    }
}
