export class Scene {
    constructor() {
        this.scene = null;
        this.init();
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x6a6a7a, 600, 1600); // Maximum brightness fog
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