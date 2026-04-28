export class SimpleMiniMap {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        this.size = 180; // Slightly smaller but should be clearer
        
        // Create the UI container
        this.createContainer();
        
        // Create the minimap camera
        this.createCamera();
        
        console.log('SimpleMiniMap: Created with size', this.size);
    }
    
    createContainer() {
        // Create the modern dark container
        this.container = document.createElement('div');
        this.container.id = 'simple-minimap';
        this.container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: ${this.size + 20}px;
            height: ${this.size + 40}px;
            background: transparent;
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 12px;
            padding: 10px;
            box-sizing: border-box;
            pointer-events: none;
            z-index: 99;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        `;
        document.body.appendChild(this.container);
        
        // Add title
        const title = document.createElement('div');
        title.textContent = 'MAP';
        title.style.cssText = `
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: rgba(255, 255, 255, 0.8);
            text-align: center;
            margin-bottom: 8px;
            background: rgba(0, 0, 0, 0.7);
            padding: 4px 8px;
            border-radius: 4px;
        `;
        this.container.appendChild(title);
        
        // Don't add a blocking map area - let WebGL render directly
    }
    
    createCamera() {
        // Create orthographic camera for top-down view
        const viewDistance = 800; // Zoom in a bit more for better detail
        this.camera = new THREE.OrthographicCamera(
            -viewDistance / 2, viewDistance / 2,  // left, right
            viewDistance / 2, -viewDistance / 2,  // top, bottom
            0.1, 2000                            // near, far (increased far plane)
        );
        
        // Position camera much lower for better visibility
        this.camera.position.set(0, 300, 0);
        this.camera.lookAt(0, 0, 0);
        
        console.log('SimpleMiniMap: Camera positioned at', this.camera.position);
    }
    
    update(playerPosition, cameraRotation) {
        if (!playerPosition) return;
        
        // Move camera to follow player (but stay above)
        this.camera.position.x = playerPosition.x;
        this.camera.position.z = playerPosition.z;
        this.camera.position.y = 300; // Keep height constant (lowered)
        
        // Always look straight down - don't use lookAt which might cause conflicts
        this.camera.rotation.x = -Math.PI / 2; // Point straight down
        this.camera.rotation.y = 0;
        
        // Enable rotation for reactive minimap - fix 180 degree flip
        if (cameraRotation !== undefined) {
            this.camera.rotation.z = -cameraRotation + Math.PI; // Rotate map with player view direction + 180 degrees
        }
        
        // Camera updated
    }
    
    render() {
        if (!this.camera) return;
        
        // Save current renderer state
        const originalAutoClear = this.renderer.autoClear;
        const originalClearColor = new THREE.Color();
        this.renderer.getClearColor(originalClearColor);
        const originalClearAlpha = this.renderer.getClearAlpha();
        
        // Calculate where to render on screen
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        
        // Position: right: 20px + 10px padding = 30px from right edge
        // Top: 20px + 10px padding + 18px title = 48px from top
        const x = screenWidth - 30 - this.size;
        const y = screenHeight - 48 - this.size;
        
        // Viewport calculated
        
        // Set up minimap rendering - use standard coordinates for now
        this.renderer.autoClear = false;
        this.renderer.setScissorTest(true);
        this.renderer.setScissor(x, y, this.size, this.size);
        this.renderer.setViewport(x, y, this.size, this.size);
        
        // Make sure canvas has proper z-index
        if (this.renderer.domElement) {
            this.renderer.domElement.style.zIndex = '100';
        }
        
        // Clear with sky blue background to show outside map area
        this.renderer.setClearColor(0x87ceeb, 1); // Sky blue background
        this.renderer.clear(true, true, false);
        
        // Apply minimap materials
        this.applyMinimapMaterials();
        
        // Enable anti-aliasing for smooth rendering
        const originalSmoothing = this.renderer.getContext().imageSmoothingEnabled;
        this.renderer.getContext().imageSmoothingEnabled = true;
        
        // Render the scene from minimap camera
        this.renderer.render(this.scene, this.camera);
        
        // Restore anti-aliasing
        this.renderer.getContext().imageSmoothingEnabled = originalSmoothing;
        
        // Restore original materials
        this.restoreOriginalMaterials();
        
        // Restore renderer state
        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, screenWidth, screenHeight);
        this.renderer.autoClear = originalAutoClear;
        this.renderer.setClearColor(originalClearColor, originalClearAlpha);
    }
    
    applyMinimapMaterials() {
        // Store original materials so we can restore them
        this.originalMaterials = [];
        
        // Minimap materials with black floor and very bright orange collisions
        const wallMaterial = new THREE.MeshBasicMaterial({ color: 0xff6600 }); // Very bright orange walls/collision
        const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 }); // Black floor
        const buildingMaterial = new THREE.MeshBasicMaterial({ color: 0xff6600 }); // Very bright orange buildings
        const bombSiteMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Pure red bomb sites
        const playerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 }); // Green player marker
        
        let objectCount = 0;
        let hiddenCount = 0;
        let visibleCount = 0;
        
        this.scene.traverse((object) => {
            if (object.isMesh) {
                objectCount++;
                
                // Store original material
                this.originalMaterials.push({
                    object: object,
                    material: object.material,
                    visible: object.visible
                });
                
                // Hide sky elements, particles, and stars
                if (object.position.y > 200) { // Only hide very high objects
                    object.visible = false;
                    hiddenCount++;
                    return;
                }
                
                // Hide points, sprites, and star particles
                if (object.isPoints || object.isSprite) {
                    object.visible = false;
                    hiddenCount++;
                    return;
                }
                
                // Hide objects with star-like names or very small spheres (stars)
                if (object.name && (object.name.includes('star') || object.name.includes('Star'))) {
                    object.visible = false;
                    hiddenCount++;
                    return;
                }
                
                // Hide very small spheres that are likely stars
                if (object.geometry && object.geometry.type === 'SphereGeometry') {
                    if (!object.geometry.boundingSphere) {
                        object.geometry.computeBoundingSphere();
                    }
                    const radius = object.geometry.boundingSphere?.radius || 0;
                    if (radius < 2) { // Hide small spheres (stars)
                        object.visible = false;
                        hiddenCount++;
                        return;
                    }
                }
                
                // Hide very tiny objects that are likely just visual effects
                if (object.geometry) {
                    if (!object.geometry.boundingSphere) {
                        object.geometry.computeBoundingSphere();
                    }
                    const radius = object.geometry.boundingSphere?.radius || 0;
                    if (radius < 0.5) { // Only hide extremely small objects
                        object.visible = false;
                        hiddenCount++;
                        return;
                    }
                }
                
                visibleCount++;
                
                // Apply appropriate minimap material based on object properties
                if (object.geometry && object.geometry.type === 'PlaneGeometry') {
                    object.material = groundMaterial; // Ground/floor
                } else if (object.geometry && object.geometry.type === 'CylinderGeometry') {
                    object.material = bombSiteMaterial; // Bomb sites (usually cylinders)
                } else if (object.geometry && object.geometry.type === 'BoxGeometry') {
                    // Check size to determine if it's a wall or building
                    const size = object.geometry.parameters;
                    if (size && (size.width > 50 || size.height > 30 || size.depth > 50)) {
                        object.material = buildingMaterial; // Large buildings
                    } else {
                        object.material = wallMaterial; // Walls and barriers
                    }
                } else {
                    object.material = wallMaterial; // Everything else
                }
            }
        });
        
    }
    
    restoreOriginalMaterials() {
        if (this.originalMaterials) {
            this.originalMaterials.forEach(state => {
                state.object.material = state.material;
                state.object.visible = state.visible;
            });
            this.originalMaterials = [];
        }
    }
    
    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}