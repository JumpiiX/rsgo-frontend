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

        // Fog starts only BEYOND the play area (which reaches ~±360, diagonal
        // corners ~±425). near=520 keeps all combat crystal-clear; the outer
        // decoration (the monolith city ring at ~700-950) fades softly into the
        // navy by far=1150 — no hard map edge. (Old near=200 fogged combat.)
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
