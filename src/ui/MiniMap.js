export class MiniMap {
    constructor(scene, playerCamera, renderer) {
        console.log('MiniMap: Initializing...', scene, playerCamera, renderer);
        this.scene = scene;
        this.playerCamera = playerCamera; // Store reference but don't modify it
        this.renderer = renderer;

        // Create orthographic camera for top-down view
        const mapSize = 200; // Size of the mini-map viewport
        const viewSize = 600; // Show good portion of map
        this.mapCamera = new THREE.OrthographicCamera(
            -viewSize / 2, viewSize / 2,
            viewSize / 2, -viewSize / 2,
            0.1, 1000
        );

        // Position camera above the world looking down
        this.mapCamera.position.set(0, 400, 0);
        this.mapCamera.lookAt(0, 0, 0);

        // Set up special rendering for minimap
        this.setupMinimapMaterials();

        // Create player indicator arrow overlay (HTML)
        this.createPlayerArrow();

        // Create border for minimap
        this.createMapBorder();

        this.mapSize = mapSize;
    }

    setupMinimapMaterials() {
        // Store original materials and set minimap-specific ones for better visibility
        this.originalMaterials = new Map();

        // Create materials for minimap
        this.minimapMaterials = {
            wall: new THREE.MeshBasicMaterial({ color: 0x445566 }), // Dark blue-gray for walls
            ground: new THREE.MeshBasicMaterial({ color: 0x1a1a2e }), // Dark background
            building: new THREE.MeshBasicMaterial({ color: 0x334455 }), // Buildings
            obstacle: new THREE.MeshBasicMaterial({ color: 0x556677 }), // Obstacles
            player: new THREE.MeshBasicMaterial({ color: 0x00ff00 }), // Players bright green
            tree: new THREE.MeshBasicMaterial({ color: 0x2d4a2b }), // Trees dark green
        };
    }

    createPlayerArrow() {
        // Create clean, narrow arrow in rust/orange theme
        const arrow = document.createElement('div');
        arrow.id = 'minimap-player-arrow';
        arrow.style.cssText = `
            position: fixed;
            top: 110px;
            right: 110px;
            width: 0;
            height: 0;
            border-left: 6px solid transparent;
            border-right: 6px solid transparent;
            border-bottom: 16px solid #d2691e;
            z-index: 102;
            pointer-events: none;
            transform: translate(50%, -50%);
            filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.4));
        `;
        document.body.appendChild(arrow);
    }

    createMapBorder() {
        // This will be rendered as HTML overlay
        const mapContainer = document.createElement('div');
        mapContainer.id = 'minimap-container';
        mapContainer.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            width: 200px;
            height: 200px;
            border: 2px solid rgba(139, 90, 43, 0.6);
            background: transparent;
            z-index: 100;
            pointer-events: none;
            box-shadow: 0 0 15px rgba(0, 0, 0, 0.5);
            border-radius: 4px;
        `;
        document.body.appendChild(mapContainer);
    }

    update(playerPosition, playerRotation) {
        // Update map camera to follow player
        this.mapCamera.position.x = playerPosition.x;
        this.mapCamera.position.z = playerPosition.z;
        this.mapCamera.position.y = 400; // Keep height constant

        // First look straight down
        this.mapCamera.lookAt(playerPosition.x, 0, playerPosition.z);

        // Apply rotation - positive rotation to make view direction appear at top
        // When player looks in a direction, that direction should be UP on the minimap
        this.mapCamera.rotation.z = playerRotation;

        // Arrow doesn't need transform since map rotates
    }

    render() {
        // Store the current renderer state
        const autoClear = this.renderer.autoClear;
        const clearAlpha = this.renderer.getClearAlpha();
        const clearColor = new THREE.Color();
        this.renderer.getClearColor(clearColor);

        // Get canvas dimensions (use clientWidth/Height for actual pixel size)
        const canvas = this.renderer.domElement;
        const pixelRatio = window.devicePixelRatio || 1;
        const width = canvas.clientWidth * pixelRatio;
        const height = canvas.clientHeight * pixelRatio;

        // Set minimap viewport (top-right corner)
        const mapWidth = this.mapSize * pixelRatio;
        const mapHeight = this.mapSize * pixelRatio;

        // Disable auto-clear to preserve main scene render
        this.renderer.autoClear = false;

        // Set scissor test to only affect minimap area
        this.renderer.setScissorTest(true);
        this.renderer.setScissor(
            width - mapWidth - (10 * pixelRatio),
            height - mapHeight - (10 * pixelRatio),
            mapWidth,
            mapHeight
        );

        this.renderer.setViewport(
            width - mapWidth - (10 * pixelRatio),
            height - mapHeight - (10 * pixelRatio),
            mapWidth,
            mapHeight
        );

        // Set beige/sand background for minimap
        this.renderer.setClearColor(0x2d2416, 1);
        this.renderer.setClearAlpha(1);
        this.renderer.clear(true, true, false);

        // Apply minimap-specific materials
        this.applyMinimapColors();

        // Render minimap
        this.renderer.render(this.scene, this.mapCamera);

        // Restore original materials
        this.restoreOriginalColors();

        // Restore renderer state
        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, width, height);
        this.renderer.autoClear = autoClear;
        this.renderer.setClearAlpha(clearAlpha);
        this.renderer.setClearColor(clearColor, clearAlpha);
    }

    applyMinimapColors() {
        // Store original materials and visibility
        this.originalStates = [];

        // Custom materials for minimap
        const wallMaterial = new THREE.MeshBasicMaterial({ color: 0x8B5A2B }); // Saddle brown for walls
        const buildingMaterial = new THREE.MeshBasicMaterial({ color: 0x654321 }); // Dark brown for buildings
        const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x2d2416 }); // Dark sand for ground
        const obstacleMaterial = new THREE.MeshBasicMaterial({ color: 0xA0522D }); // Sienna for obstacles

        this.scene.traverse((object) => {
            if (object.isMesh) {
                // Store original state
                this.originalStates.push({
                    object: object,
                    material: object.material,
                    visible: object.visible
                });

                // Hide stars and sky objects (high Y position)
                if (object.position.y > 100) {
                    object.visible = false;
                }
                // Apply colors based on object type/position
                else if (object.geometry && object.geometry.type === 'PlaneGeometry') {
                    // Ground plane
                    object.material = groundMaterial;
                }
                else if (object.geometry && object.geometry.type === 'BoxGeometry') {
                    // Buildings and walls
                    const size = object.geometry.parameters;
                    if (size && (size.width > 50 || size.height > 30 || size.depth > 50)) {
                        // Large objects are buildings
                        object.material = buildingMaterial;
                    } else {
                        // Smaller boxes are walls/obstacles
                        object.material = wallMaterial;
                    }
                }
                else {
                    // Other obstacles
                    object.material = obstacleMaterial;
                }
            }
            // Hide point lights and sprites
            else if (object.isPoints || object.isSprite || object.isLight) {
                this.originalStates.push({
                    object: object,
                    visible: object.visible
                });
                object.visible = false;
            }
        });
    }

    restoreOriginalColors() {
        // Restore all original materials and visibility
        if (this.originalStates) {
            this.originalStates.forEach(state => {
                if (state.material) {
                    state.object.material = state.material;
                }
                state.object.visible = state.visible;
            });
            this.originalStates = [];
        }
    }
}
