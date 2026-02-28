export class MiniMap {
    constructor(scene, playerCamera, renderer) {
        console.log('MiniMap: Initializing...', scene, playerCamera, renderer);
        this.scene = scene;
        this.playerCamera = playerCamera; 
        this.renderer = renderer;

        
        const mapSize = 200; 
        const viewSize = 600; 
        this.mapCamera = new THREE.OrthographicCamera(
            -viewSize / 2, viewSize / 2,
            viewSize / 2, -viewSize / 2,
            0.1, 1000
        );

        
        this.mapCamera.position.set(0, 400, 0);
        this.mapCamera.lookAt(0, 0, 0);

        
        this.setupMinimapMaterials();

        
        this.createPlayerArrow();

        
        this.createMapBorder();

        this.mapSize = mapSize;
    }

    setupMinimapMaterials() {
        
        this.originalMaterials = new Map();

        
        this.minimapMaterials = {
            wall: new THREE.MeshBasicMaterial({ color: 0x445566 }), 
            ground: new THREE.MeshBasicMaterial({ color: 0x1a1a2e }), 
            building: new THREE.MeshBasicMaterial({ color: 0x334455 }), 
            obstacle: new THREE.MeshBasicMaterial({ color: 0x556677 }), 
            player: new THREE.MeshBasicMaterial({ color: 0x00ff00 }), 
            tree: new THREE.MeshBasicMaterial({ color: 0x2d4a2b }), 
        };
    }

    createPlayerArrow() {
        
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
        
        this.mapCamera.position.x = playerPosition.x;
        this.mapCamera.position.z = playerPosition.z;
        this.mapCamera.position.y = 400; 

        
        this.mapCamera.lookAt(playerPosition.x, 0, playerPosition.z);

        
        
        this.mapCamera.rotation.z = playerRotation;

        
    }

    render() {
        
        const autoClear = this.renderer.autoClear;
        const clearAlpha = this.renderer.getClearAlpha();
        const clearColor = new THREE.Color();
        this.renderer.getClearColor(clearColor);

        
        const canvas = this.renderer.domElement;
        const pixelRatio = window.devicePixelRatio || 1;
        const width = canvas.clientWidth * pixelRatio;
        const height = canvas.clientHeight * pixelRatio;

        
        const mapWidth = this.mapSize * pixelRatio;
        const mapHeight = this.mapSize * pixelRatio;

        
        this.renderer.autoClear = false;

        
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

        
        this.renderer.setClearColor(0x2d2416, 1);
        this.renderer.setClearAlpha(1);
        this.renderer.clear(true, true, false);

        
        this.applyMinimapColors();

        
        this.renderer.render(this.scene, this.mapCamera);

        
        this.restoreOriginalColors();

        
        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, width, height);
        this.renderer.autoClear = autoClear;
        this.renderer.setClearAlpha(clearAlpha);
        this.renderer.setClearColor(clearColor, clearAlpha);
    }

    applyMinimapColors() {
        
        this.originalStates = [];

        
        const wallMaterial = new THREE.MeshBasicMaterial({ color: 0x8B5A2B }); 
        const buildingMaterial = new THREE.MeshBasicMaterial({ color: 0x654321 }); 
        const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x2d2416 }); 
        const obstacleMaterial = new THREE.MeshBasicMaterial({ color: 0xA0522D }); 

        this.scene.traverse((object) => {
            if (object.isMesh) {
                
                this.originalStates.push({
                    object: object,
                    material: object.material,
                    visible: object.visible
                });

                
                if (object.position.y > 100) {
                    object.visible = false;
                }
                
                else if (object.geometry && object.geometry.type === 'PlaneGeometry') {
                    
                    object.material = groundMaterial;
                }
                else if (object.geometry && object.geometry.type === 'BoxGeometry') {
                    
                    const size = object.geometry.parameters;
                    if (size && (size.width > 50 || size.height > 30 || size.depth > 50)) {
                        
                        object.material = buildingMaterial;
                    } else {
                        
                        object.material = wallMaterial;
                    }
                }
                else {
                    
                    object.material = obstacleMaterial;
                }
            }
            
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
