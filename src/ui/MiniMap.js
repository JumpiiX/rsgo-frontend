export class MiniMap {
    constructor(scene, playerCamera, renderer) {
        console.log('MiniMap: Initializing...', scene, playerCamera, renderer);
        this.scene = scene;
        this.playerCamera = playerCamera; 
        this.renderer = renderer;

        
        const mapSize = 200; 
        const viewSize = 1000; // Increase view size to capture more of the map 
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
            wall: new THREE.MeshBasicMaterial({ color: 0x1a1a1a }), // Even darker gray walls
            ground: new THREE.MeshBasicMaterial({ color: 0x050505 }), // Almost black ground
            building: new THREE.MeshBasicMaterial({ color: 0x0f0f0f }), // Very dark buildings
            obstacle: new THREE.MeshBasicMaterial({ color: 0x222222 }), // Darker gray obstacles
            player: new THREE.MeshBasicMaterial({ color: 0xff8c00 }), // Orange player
            tree: new THREE.MeshBasicMaterial({ color: 0x0f1a0f }), // Very dark green trees
        };
    }

    createPlayerArrow() {
        
        const arrow = document.createElement('div');
        arrow.id = 'minimap-player-arrow';
        arrow.style.cssText = `
            position: fixed;
            top: ${10 + this.mapSize / 2}px;
            right: ${10 + this.mapSize / 2}px;
            width: 0;
            height: 0;
            border-left: 6px solid transparent;
            border-right: 6px solid transparent;
            border-bottom: 16px solid #ff8c00;
            z-index: 102;
            pointer-events: none;
            transform: translate(50%, -50%);
            filter: drop-shadow(0 0 4px rgba(255, 140, 0, 0.6));
        `;
        document.body.appendChild(arrow);
    }

    createMapBorder() {
        // Create modern dark container like other UI elements
        const minimapContainer = document.createElement('div');
        minimapContainer.id = 'minimap-modern-container';
        minimapContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 240px;
            width: ${this.mapSize + 20}px;
            height: ${this.mapSize + 20}px;
            background: rgba(0, 0, 0, 0.85);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            backdrop-filter: blur(10px);
            padding: 10px;
            box-sizing: border-box;
            pointer-events: none;
            z-index: 99;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        document.body.appendChild(minimapContainer);

        // Add title and inner container
        const titleDiv = document.createElement('div');
        titleDiv.style.cssText = `
            position: absolute;
            top: 6px;
            left: 10px;
            right: 10px;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 1px;
            opacity: 0.6;
            color: rgba(255, 255, 255, 0.6);
            text-align: center;
            pointer-events: none;
            z-index: 1;
        `;
        titleDiv.textContent = 'Map';
        minimapContainer.appendChild(titleDiv);
        
        // Create inner border for the map area
        const mapInner = document.createElement('div');
        mapInner.id = 'minimap-inner-border';
        mapInner.style.cssText = `
            width: ${this.mapSize}px;
            height: ${this.mapSize - 20}px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            overflow: hidden;
            background: #000;
            margin-top: 20px;
        `;
        minimapContainer.appendChild(mapInner);
    }

    update(playerPosition, playerRotation) {
        
        this.mapCamera.position.x = playerPosition.x;
        this.mapCamera.position.z = playerPosition.z;
        this.mapCamera.position.y = 400; 

        
        this.mapCamera.lookAt(playerPosition.x, 0, playerPosition.z);

        
        // Reset camera rotation to ensure it's always pointing straight down
        this.mapCamera.rotation.x = -Math.PI / 2; // Point straight down
        this.mapCamera.rotation.y = 0;
        this.mapCamera.rotation.z = 0;

        
    }

    render() {
        
        const autoClear = this.renderer.autoClear;
        const clearAlpha = this.renderer.getClearAlpha();
        const clearColor = new THREE.Color();
        this.renderer.getClearColor(clearColor);

        
        const width = window.innerWidth;
        const height = window.innerHeight;

        
        const mapWidth = this.mapSize;
        const mapHeight = this.mapSize - 20; // Reduced by 20px for title

        
        this.renderer.autoClear = false;

        
        // Simple positioning: match the CSS container exactly
        // Container CSS: top: 20px, right: 240px, size: 220x220, padding: 10px
        // Inner map area starts at: top: 50px (20 + 20 title + 10 padding), right: 250px (240 + 10 padding)
        const containerX = width - 240 - 10 - mapWidth; // right: 240px + 10px padding from right edge
        const containerY = height - (20 + 20 + 10) - mapHeight; // WebGL Y from bottom: screen height - (top + title + padding + map height)
        
        // Debug: containerX should be around 688 for 1138 screen width
        
        this.renderer.setScissorTest(true);
        this.renderer.setScissor(
            containerX,
            containerY,
            mapWidth,
            mapHeight
        );

        this.renderer.setViewport(
            containerX,
            containerY,
            mapWidth,
            mapHeight
        );

        
        this.renderer.setClearColor(0x000000, 1); // Pure black background
        this.renderer.setClearAlpha(1);
        this.renderer.clear(true, true, false);

        
        this.applyMinimapColors();

        // Debug: Check if we have objects to render
        const visibleObjects = this.scene.children.filter(obj => obj.visible).length;
        if (visibleObjects === 0) {
            console.log('⚠️ Minimap: No visible objects in scene');
        }
        
        this.renderer.render(this.scene, this.mapCamera);

        
        this.restoreOriginalColors();

        
        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
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
