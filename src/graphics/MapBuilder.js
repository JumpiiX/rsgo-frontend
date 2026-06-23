import { MaterialManager } from '../utils/MaterialManager.js';

// RSGO navy palette for the map (replaces the old greys for a modern look).
// Base navy is the brand #1a2447; floors/walls are lighter navy tints so the
// layout still reads with depth — all in the same navy family.
const MAP_COLORS = {
    ground: 0x121a36, // deep navy base plane
    floor:  0x2a3a63, // walkable areas / paths — mid navy, clearly above ground
    wall:   0x3b4f82, // walls — lighter navy so they clearly stand out
    wallEmissive: 0x0d1326,
};

export class MapBuilder {
    constructor(scene, collisionSystem = null) {
        this.scene = scene;
        this.collisionSystem = collisionSystem;
        this.materials = new MaterialManager();
    }

    buildMap(mapType = 'city') {
        console.log('🗺️ MapBuilder.buildMap called with type:', mapType);
        if (mapType === 'orangePlanet') {
            console.log('✅ Building minimalist competitive map');
            this.buildMinimalistMap();
        }
    }
    
    buildOrangePlanetMap() {
        this.buildMinimalistMap();
    }
    
    buildMinimalistMap() {
        console.log('Building Minimalist Competitive Map...');
        
        // Map parameters
        this.wallHeight = 25;
        this.wallThickness = 4;
        this.pathWidth = 100;
        this.spawnSize = 120;
        this.bombSiteSize = 180;
        
        // Key positions
        this.bottomSpawnZ = -300;
        this.topSpawnZ = 300;
        this.siteAX = -250;
        this.siteBX = 250;
        this.siteZ = 0;
        
        // 1. Create ground
        this.createMinimalistGround();
        
        // 2. Create clean floor areas
        this.createCleanFloorLayout();
        
        // 3. Create simple walls
        this.createSimpleWalls();
    }
    
    createMinimalistGround() {
        const groundGeometry = new THREE.PlaneGeometry(1200, 1200);
        const groundMaterial = new THREE.MeshLambertMaterial({
            color: MAP_COLORS.ground,
            side: THREE.DoubleSide
        });
        
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }
    
    createCleanFloorLayout() {
        const floorColor = MAP_COLORS.floor;

        this.createFloor(0, this.bottomSpawnZ, this.spawnSize, this.spawnSize, floorColor);
        this.createFloor(0, this.topSpawnZ, this.spawnSize, this.spawnSize, floorColor);
        this.createFloor(this.siteAX, this.siteZ, this.bombSiteSize, this.bombSiteSize, floorColor);
        this.createFloor(this.siteBX, this.siteZ, this.bombSiteSize, this.bombSiteSize, floorColor);

        this.createBombSiteMarker(this.siteAX, this.siteZ, 'A');
        this.createBombSiteMarker(this.siteBX, this.siteZ, 'B');

        // Spawn markers so you can tell at a glance which side is which:
        // attacker spawn (z = -300) = RED, defender spawn (z = +300) = BLUE.
        // These match the server's team-role spawns in spawn_system.rs.
        this.createSpawnMarker(0, this.bottomSpawnZ, 0xff0000); // attacker = red
        this.createSpawnMarker(0, this.topSpawnZ, 0x0000ff);    // defender = blue

        const diagonals = [
            { sx: 0, sz: this.bottomSpawnZ, ex: this.siteAX, ez: this.siteZ },
            { sx: 0, sz: this.bottomSpawnZ, ex: this.siteBX, ez: this.siteZ },
            { sx: 0, sz: this.topSpawnZ, ex: this.siteAX, ez: this.siteZ },
            { sx: 0, sz: this.topSpawnZ, ex: this.siteBX, ez: this.siteZ },
        ];
        for (const d of diagonals) {
            const dx = d.ex - d.sx;
            const dz = d.ez - d.sz;
            const len = Math.sqrt(dx * dx + dz * dz);
            const angle = Math.atan2(dx, dz);
            this.createAngledFloor((d.sx + d.ex) / 2, (d.sz + d.ez) / 2, this.pathWidth, len, angle, floorColor);
        }

        const midLength = Math.abs(this.siteBX - this.siteAX) - this.bombSiteSize;
        this.createFloor(0, this.siteZ, midLength, this.pathWidth, floorColor);
    }

    createBombSiteMarker(x, z, letter) {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const cx = size / 2;
        const cy = size / 2;

        // Navy disc + thin orange ring + orange letter (brand palette).
        ctx.fillStyle = '#1a2447';
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.46, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ef4e23';
        ctx.lineWidth = size * 0.03;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.44, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#ef4e23';
        ctx.font = `bold ${Math.round(size * 0.62)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, cx, cy + size * 0.02);

        const texture = new THREE.CanvasTexture(canvas);
        texture.anisotropy = 16;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;

        const markerGeometry = new THREE.PlaneGeometry(110, 110);
        const markerMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
        });
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(x, 0.15, z);
        marker.name = letter === 'A' ? 'bombSiteA' : 'bombSiteB';
        this.scene.add(marker);
    }

    createSpawnMarker(x, z, color) {
        // A filled disc with a brighter ring outline, laid flat on the floor.
        const radius = 50;

        const discGeometry = new THREE.CircleGeometry(radius, 48);
        const discMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
        });
        const disc = new THREE.Mesh(discGeometry, discMaterial);
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(x, 0.2, z);
        disc.name = 'spawnMarker';
        this.scene.add(disc);

        const ringGeometry = new THREE.RingGeometry(radius * 0.9, radius, 48);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, 0.25, z);
        ring.name = 'spawnMarkerRing';
        this.scene.add(ring);
    }

    createSimpleWalls() {
        const halfSpawn = this.spawnSize / 2;
        const halfSite = this.bombSiteSize / 2;
        const halfMid = this.pathWidth / 2;
        const halfPath = this.pathWidth / 2;

        const rects = {
            bottomSpawn: {
                xMin: -halfSpawn, xMax: halfSpawn,
                zMin: this.bottomSpawnZ - halfSpawn, zMax: this.bottomSpawnZ + halfSpawn,
            },
            topSpawn: {
                xMin: -halfSpawn, xMax: halfSpawn,
                zMin: this.topSpawnZ - halfSpawn, zMax: this.topSpawnZ + halfSpawn,
            },
            siteA: {
                xMin: this.siteAX - halfSite, xMax: this.siteAX + halfSite,
                zMin: this.siteZ - halfSite, zMax: this.siteZ + halfSite,
            },
            siteB: {
                xMin: this.siteBX - halfSite, xMax: this.siteBX + halfSite,
                zMin: this.siteZ - halfSite, zMax: this.siteZ + halfSite,
            },
            mid: {
                xMin: this.siteAX + halfSite, xMax: this.siteBX - halfSite,
                zMin: this.siteZ - halfMid, zMax: this.siteZ + halfMid,
            },
        };

        const diagonals = [
            this.buildDiagonal(0, this.bottomSpawnZ, this.siteAX, this.siteZ, halfPath),
            this.buildDiagonal(0, this.bottomSpawnZ, this.siteBX, this.siteZ, halfPath),
            this.buildDiagonal(0, this.topSpawnZ, this.siteAX, this.siteZ, halfPath),
            this.buildDiagonal(0, this.topSpawnZ, this.siteBX, this.siteZ, halfPath),
        ];

        this._allRects = rects;
        this._allDiagonals = diagonals;

        this.placeEdgeWalls(rects.bottomSpawn, [diagonals[0], diagonals[1]]);
        this.placeEdgeWalls(rects.topSpawn, [diagonals[2], diagonals[3]]);
        this.placeEdgeWalls(rects.siteA, [diagonals[0], diagonals[2], { isMid: true, edge: 'right' }], rects.mid);
        this.placeEdgeWalls(rects.siteB, [diagonals[1], diagonals[3], { isMid: true, edge: 'left' }], rects.mid);

        this.placeMidConnectorWalls(rects.mid);

        for (const diag of diagonals) {
            this.placeDiagonalLongWalls(diag);
        }
    }

    isOnGrey(x, z) {
        const r = this._allRects;
        if (!r) return false;
        for (const key of Object.keys(r)) {
            const rect = r[key];
            if (x >= rect.xMin - 1e-3 && x <= rect.xMax + 1e-3 &&
                z >= rect.zMin - 1e-3 && z <= rect.zMax + 1e-3) {
                return true;
            }
        }
        for (const diag of this._allDiagonals) {
            const lx = x - diag.sx;
            const lz = z - diag.sz;
            const along = lx * diag.ux + lz * diag.uz;
            const perp = lx * diag.px + lz * diag.pz;
            if (along >= -1e-3 && along <= diag.len + 1e-3 &&
                perp >= -diag.halfPath - 1e-3 && perp <= diag.halfPath + 1e-3) {
                return true;
            }
        }
        return false;
    }

    buildDiagonal(sx, sz, ex, ez, halfPath) {
        const dx = ex - sx;
        const dz = ez - sz;
        const len = Math.sqrt(dx * dx + dz * dz);
        const ux = dx / len;
        const uz = dz / len;
        const px = -uz;
        const pz = ux;
        return {
            sx, sz, ex, ez, len,
            ux, uz, px, pz, halfPath,
            sideA: { ox: sx + px * halfPath, oz: sz + pz * halfPath, ux, uz },
            sideB: { ox: sx - px * halfPath, oz: sz - pz * halfPath, ux, uz },
        };
    }

    placeEdgeWalls(rect, openings, midRect = null) {
        const edges = [
            { axis: 'z', value: rect.zMin, min: rect.xMin, max: rect.xMax, name: 'bottom' },
            { axis: 'z', value: rect.zMax, min: rect.xMin, max: rect.xMax, name: 'top' },
            { axis: 'x', value: rect.xMin, min: rect.zMin, max: rect.zMax, name: 'left' },
            { axis: 'x', value: rect.xMax, min: rect.zMin, max: rect.zMax, name: 'right' },
        ];

        for (const edge of edges) {
            const cuts = [];
            for (const op of openings) {
                if (op.isMid && midRect) {
                    if (
                        (op.edge === 'right' && edge.name === 'right' && edge.axis === 'x') ||
                        (op.edge === 'left' && edge.name === 'left' && edge.axis === 'x')
                    ) {
                        cuts.push({ a: midRect.zMin, b: midRect.zMax });
                    }
                    continue;
                }
                const interval = this.diagonalEdgeOverlap(op, edge);
                if (interval) cuts.push(interval);
            }
            this.emitEdgeSegments(edge, cuts);
        }
    }

    diagonalEdgeOverlap(diag, edge) {
        const corners = this.diagonalCorners(diag);
        let lo = Infinity, hi = -Infinity;
        const intersect = (p1, p2) => {
            if (edge.axis === 'z') {
                if ((p1.z - edge.value) * (p2.z - edge.value) > 0) return null;
                if (p1.z === p2.z) return null;
                const t = (edge.value - p1.z) / (p2.z - p1.z);
                return p1.x + t * (p2.x - p1.x);
            } else {
                if ((p1.x - edge.value) * (p2.x - edge.value) > 0) return null;
                if (p1.x === p2.x) return null;
                const t = (edge.value - p1.x) / (p2.x - p1.x);
                return p1.z + t * (p2.z - p1.z);
            }
        };
        for (let i = 0; i < 4; i++) {
            const p1 = corners[i];
            const p2 = corners[(i + 1) % 4];
            const v = intersect(p1, p2);
            if (v !== null) {
                if (v < lo) lo = v;
                if (v > hi) hi = v;
            }
        }
        for (const c of corners) {
            const coord = edge.axis === 'z' ? c.x : c.z;
            const other = edge.axis === 'z' ? c.z : c.x;
            if (Math.abs(other - edge.value) < 1e-6) {
                if (coord < lo) lo = coord;
                if (coord > hi) hi = coord;
            }
        }
        if (!isFinite(lo) || !isFinite(hi) || hi - lo < 1e-6) return null;
        const a = Math.max(lo, edge.min);
        const b = Math.min(hi, edge.max);
        if (b - a < 1e-6) return null;
        return { a, b };
    }

    diagonalCorners(diag) {
        const { sx, sz, ex, ez, px, pz, halfPath } = diag;
        return [
            { x: sx + px * halfPath, z: sz + pz * halfPath },
            { x: ex + px * halfPath, z: ez + pz * halfPath },
            { x: ex - px * halfPath, z: ez - pz * halfPath },
            { x: sx - px * halfPath, z: sz - pz * halfPath },
        ];
    }

    emitEdgeSegments(edge, cuts) {
        cuts.sort((a, b) => a.a - b.a);
        const merged = [];
        for (const c of cuts) {
            if (merged.length && c.a <= merged[merged.length - 1].b) {
                merged[merged.length - 1].b = Math.max(merged[merged.length - 1].b, c.b);
            } else {
                merged.push({ a: c.a, b: c.b });
            }
        }

        let cursor = edge.min;
        for (const m of merged) {
            if (m.a > cursor) {
                this.emitAxisWall(edge, cursor, m.a);
            }
            cursor = Math.max(cursor, m.b);
        }
        if (cursor < edge.max) {
            this.emitAxisWall(edge, cursor, edge.max);
        }
    }

    emitAxisWall(edge, start, end) {
        const length = end - start;
        if (length < 0.5) return;
        const mid = (start + end) / 2;
        const y = this.wallHeight / 2;
        if (edge.axis === 'z') {
            this.createWall(mid, y, edge.value, length, this.wallHeight, this.wallThickness);
        } else {
            this.createWall(edge.value, y, mid, this.wallThickness, this.wallHeight, length);
        }
    }

    placeMidConnectorWalls(mid) {
        this.emitMidEdge(mid, mid.zMin, -1);
        this.emitMidEdge(mid, mid.zMax, 1);
    }

    emitMidEdge(mid, zEdge, outwardSign) {
        const probe = 1.5;
        const step = 1;
        const segments = [];
        let active = null;
        for (let x = mid.xMin; x <= mid.xMax; x += step) {
            const nz = zEdge + outwardSign * probe;
            const outwardBlue = !this.isOnGrey(x, nz);
            if (outwardBlue) {
                if (!active) active = { start: x, end: x };
                else active.end = x;
            } else if (active) {
                segments.push(active);
                active = null;
            }
        }
        if (active) segments.push(active);

        const y = this.wallHeight / 2;
        for (const seg of segments) {
            const length = seg.end - seg.start;
            if (length < 2) continue;
            const cx = (seg.start + seg.end) / 2;
            this.createWall(cx, y, zEdge, length, this.wallHeight, this.wallThickness);
        }
    }

    placeDiagonalLongWalls(diag) {
        this.emitDiagonalSide(diag, 1);
        this.emitDiagonalSide(diag, -1);
    }

    emitDiagonalSide(diag, sign) {
        const { sx, sz, px, pz, halfPath, len, ux, uz } = diag;
        const ox = sx + px * halfPath * sign;
        const oz = sz + pz * halfPath * sign;
        const probe = 1.5;
        const step = 1;
        const segments = [];
        let active = null;
        for (let t = 0; t <= len; t += step) {
            const x = ox + ux * t;
            const z = oz + uz * t;
            const nx = x + px * sign * probe;
            const nz = z + pz * sign * probe;
            const outwardBlue = !this.isOnGrey(nx, nz);
            if (outwardBlue) {
                if (!active) active = { start: t, end: t };
                else active.end = t;
            } else if (active) {
                segments.push(active);
                active = null;
            }
        }
        if (active) segments.push(active);

        const rotation = Math.atan2(ux, uz);
        const chunkLen = 6;
        for (const seg of segments) {
            const total = seg.end - seg.start;
            if (total < 2) continue;
            const chunks = Math.max(1, Math.ceil(total / chunkLen));
            const chunkSize = total / chunks;
            for (let i = 0; i < chunks; i++) {
                const tMid = seg.start + chunkSize * (i + 0.5);
                const cx = ox + ux * tMid;
                const cz = oz + uz * tMid;
                this.createAngledWall(cx, this.wallHeight / 2, cz, this.wallThickness, this.wallHeight, chunkSize, rotation);
            }
        }
    }

    createWall(x, y, z, width, height, depth) {
        const wallGeometry = new THREE.BoxGeometry(width, height, depth);
        const wallMaterial = new THREE.MeshLambertMaterial({
            color: MAP_COLORS.wall,
            emissive: MAP_COLORS.wallEmissive,
            emissiveIntensity: 0.05
        });
        
        const wall = new THREE.Mesh(wallGeometry, wallMaterial);
        wall.position.set(x, y, z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        wall.userData.isMapWall = true; // so shots can be occlusion-tested against it
        this.scene.add(wall);

        if (this.collisionSystem) {
            this.collisionSystem.addBoxCollider(
                { x, y, z },
                { x: width, y: height, z: depth }
            );
        }

        return wall;
    }

    createAngledWall(x, y, z, width, height, depth, rotation) {
        const wallGeometry = new THREE.BoxGeometry(width, height, depth);
        const wallMaterial = new THREE.MeshLambertMaterial({
            color: MAP_COLORS.wall,
            emissive: MAP_COLORS.wallEmissive,
            emissiveIntensity: 0.05
        });
        
        const wall = new THREE.Mesh(wallGeometry, wallMaterial);
        wall.position.set(x, y, z);
        wall.rotation.y = rotation;
        wall.castShadow = true;
        wall.receiveShadow = true;
        wall.userData.isMapWall = true; // so shots can be occlusion-tested against it
        this.scene.add(wall);
        
        if (this.collisionSystem) {
            // The collider is rotation-aware now, so pass the real rotation and the
            // wall's true extents (no need to inflate to an axis-aligned bounding box).
            this.collisionSystem.addBoxCollider(
                { x, y, z },
                { x: width, y: height, z: depth },
                'default',
                rotation
            );
        }

        return wall;
    }
    
    createFloor(x, z, width, depth, color = MAP_COLORS.floor) {
        const floorGeometry = new THREE.PlaneGeometry(width, depth);
        const floorMaterial = new THREE.MeshLambertMaterial({
            color: color,
            side: THREE.DoubleSide
        });
        
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(x, 0.1, z);
        floor.receiveShadow = true;
        this.scene.add(floor);
        
        return floor;
    }
    
    createAngledFloor(x, z, width, depth, rotation, color = MAP_COLORS.floor) {
        const floorGeometry = new THREE.PlaneGeometry(width, depth);
        const floorMaterial = new THREE.MeshLambertMaterial({
            color: color,
            side: THREE.DoubleSide
        });

        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.rotation.z = rotation;
        floor.position.set(x, 0.1, z);
        floor.receiveShadow = true;
        this.scene.add(floor);

        return floor;
    }
}