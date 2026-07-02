export class LightingSystem {
    constructor(scene) {
        this.scene = scene;
    }

    setupLights() {
        this.createAmbientLighting();
        this.createMoonlight();
        this.createStarfield();
        this.createStreetLights();
        this.createWindowLights();
    }

    createAmbientLighting() {

        const ambientLight = new THREE.AmbientLight(0xffffff, 2.5);
        this.scene.add(ambientLight);

        const hemiLight = new THREE.HemisphereLight(0x9fb8ff, 0x1a2447, 1.5);
        this.scene.add(hemiLight);
    }

    createMoonlight() {

        const moonLight = new THREE.DirectionalLight(0xffffff, 3.0);
        moonLight.position.set(-100, 300, 50);
        moonLight.castShadow = true;

        moonLight.shadow.mapSize.width = 2048;
        moonLight.shadow.mapSize.height = 2048;
        moonLight.shadow.camera.left = -300;
        moonLight.shadow.camera.right = 300;
        moonLight.shadow.camera.top = 300;
        moonLight.shadow.camera.bottom = -300;
        moonLight.shadow.camera.near = 1;
        moonLight.shadow.camera.far = 600;
        this.scene.add(moonLight);

        const moonGeometry = new THREE.SphereGeometry(15, 16, 16);
        const moonMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffee,
            transparent: true,
            opacity: 1.0
        });
        const moon = new THREE.Mesh(moonGeometry, moonMaterial);
        moon.position.set(-150, 250, 80);
        this.scene.add(moon);

        const moonGlow = new THREE.PointLight(0xffffdd, 2.5, 500);
        moonGlow.position.set(-150, 250, 80);
        this.scene.add(moonGlow);

        const fillLight = new THREE.DirectionalLight(0xbbc5dd, 1.5);
        fillLight.position.set(100, 200, -50);
        this.scene.add(fillLight);

        const overheadLight = new THREE.DirectionalLight(0xddddff, 1.0);
        overheadLight.position.set(0, 400, 0);
        this.scene.add(overheadLight);
    }

    createStarfield() {

        const starGeometry = new THREE.BufferGeometry();
        const starCount = 1000;
        const positions = new Float32Array(starCount * 3);

        for (let i = 0; i < starCount * 3; i += 3) {

            positions[i] = (Math.random() - 0.5) * 2000;
            positions[i + 1] = Math.random() * 200 + 150;
            positions[i + 2] = (Math.random() - 0.5) * 2000;
        }

        starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const starMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 2,
            transparent: true,
            opacity: 0.8
        });

        this.stars = new THREE.Points(starGeometry, starMaterial);
        this.stars.name = 'stars';

        this.stars.layers.set(1);
        this.scene.add(this.stars);

        const brightStars = [
            [-200, 180, -200], [200, 200, 200], [-150, 190, 150],
            [180, 170, -180], [-180, 185, -150], [150, 195, 180],
            [0, 220, 0], [-100, 200, 100], [100, 210, -100]
        ];

        this.brightStarLights = [];
        brightStars.forEach(pos => {
            const starLight = new THREE.PointLight(0xffffff, 0.8, 200);
            starLight.position.set(...pos);
            starLight.name = 'starLight';

            starLight.layers.set(1);
            this.scene.add(starLight);
            this.brightStarLights.push(starLight);
        });
    }

    createStreetLights() {

        const streetLightPositions = [
            [-60, 25, -80], [60, 25, 80], [-100, 25, 40],
            [100, 25, -40], [0, 25, 120], [0, 25, -120]
        ];

        streetLightPositions.forEach(pos => {
            const streetLight = new THREE.PointLight(0xff8833, 1.2, 120);
            streetLight.position.set(...pos);
            streetLight.castShadow = true;
            this.scene.add(streetLight);

        });
    }

    createWindowLights() {

        const windowLights = [
            [0, 15, 0], [-80, 12, -60], [80, 12, 60],
            [-150, 12, -150], [150, 12, 150]
        ];

        windowLights.forEach(pos => {
            const windowLight = new THREE.PointLight(0x66aaff, 0.6, 50);
            windowLight.position.set(...pos);
            this.scene.add(windowLight);
        });
    }
}
