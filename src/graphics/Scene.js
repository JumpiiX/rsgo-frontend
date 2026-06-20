export class Scene {
    constructor() {
        this.scene = null;
        this.init();
    }

    init() {
        this.scene = new THREE.Scene();
        
        // Navy sky + matching fog (was a grey-blue 0x4a5a7a). Slightly lighter
        // than the ground navy so there's a subtle horizon.
        const SKY_NAVY = 0x1d294e;
        this.scene.background = new THREE.Color(SKY_NAVY);

        this.scene.fog = new THREE.Fog(SKY_NAVY, 200, 1000);
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
