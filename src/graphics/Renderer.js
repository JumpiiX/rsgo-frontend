export class Renderer {
    constructor() {
        this.renderer = null;
        this.init();
    }

    init() {

        try {
            this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
        } catch (e) {

            try { window.umami && window.umami.track('webgl-unsupported'); } catch (_) {}
            throw e;
        }

        this._maxPixelRatio = 1.5;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this._maxPixelRatio));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x3a3a4a);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        window.addEventListener('resize', () => {
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this._maxPixelRatio));
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
