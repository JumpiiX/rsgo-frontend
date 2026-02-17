export class MaterialManager {
    constructor() {
        this.materials = this.createMaterials();
    }

    createMaterials() {
        return {
            ground: new THREE.MeshLambertMaterial({ color: 0x2a2a2a }),
            wall: new THREE.MeshLambertMaterial({ color: 0x3d3d3d }),
            building: new THREE.MeshLambertMaterial({ color: 0x2f2f2f }),
            darkBuilding: new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
            crate: new THREE.MeshLambertMaterial({ color: 0x4a4a4a }),
            window: new THREE.MeshLambertMaterial({ 
                color: 0x1a3366, 
                transparent: true, 
                opacity: 0.8 
            }),
            street: new THREE.MeshLambertMaterial({ color: 0x1f1f1f })
        };
    }

    get(materialName) {
        return this.materials[materialName] || this.materials.ground;
    }

    add(name, material) {
        this.materials[name] = material;
    }
}