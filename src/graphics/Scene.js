export class Scene {
    constructor() {
        this.scene = null;
        this.init();
    }

    init() {
        this.scene = new THREE.Scene();
        // Set a lighter sky background for better visibility
        this.scene.background = new THREE.Color(0x4a5a7a);
        // Add subtle fog for depth, but far away
        this.scene.fog = new THREE.Fog(0x4a5a7a, 200, 1000);
    }

    getScene() {
        return this.scene;
    }

    add(object) {
        this.scene.add(object);
    }

    remove(object) {
        this.scene.remove(object);
    }
}
