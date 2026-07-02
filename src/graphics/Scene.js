export class Scene {
    constructor() {
        this.scene = null;
        this.init();
    }

    init() {
        this.scene = new THREE.Scene();

        const SKY_NAVY = 0x1d294e;
        this.scene.background = new THREE.Color(SKY_NAVY);

        this.scene.fog = new THREE.Fog(SKY_NAVY, 520, 1150);
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
