import { MaterialManager } from '../utils/MaterialManager.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

const MAP_COLORS = {
    ground: 0x121a36,
    floor:  0x2a3a63,
    wall:   0x3b4f82,
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

        this.wallHeight = 25;
        this.wallThickness = 4;
        this.pathWidth = 100;
        this.spawnSize = 120;
        this.bombSiteSize = 180;

        this.bottomSpawnZ = -300;
        this.topSpawnZ = 300;
        this.siteAX = -250;
        this.siteBX = 250;
        this.siteZ = 0;

        this.createMinimalistGround();

        this.createCleanFloorLayout();

        this.createSimpleWalls();

        this.finalizeStaticWalls();

        this.createOuterDecoration();

        this.createIntroDecor();
    }

    createIntroDecor() {
        const group = new THREE.Group();
        group.name = 'introDecor';
        group.visible = false;

        const ORANGE = 0xef4e23, NAVY = 0x1a2447, LEAF = 0x2f6f4a, TRUNK = 0x4a3520;
        const H = (n) => this._deco_hash(n);

        const onPlayArea = (x, z) => {
            if (Math.abs(z) <= 90 && (Math.abs(x - 250) <= 110 || Math.abs(x + 250) <= 110)) return true;
            if (Math.abs(x) <= 90 && Math.abs(Math.abs(z) - 300) <= 90) return true;

            const lane = (sx, sz, ex, ez) => {
                const dx = ex - sx, dz = ez - sz, len = Math.hypot(dx, dz);
                const ux = dx / len, uz = dz / len, px = -uz, pz = ux;
                const lx = x - sx, lz = z - sz;
                const al = lx * ux + lz * uz, pe = lx * px + lz * pz;
                return al >= 0 && al <= len && Math.abs(pe) <= 70;
            };
            if (lane(0, -300, -250, 0) || lane(0, -300, 250, 0) ||
                lane(0, 300, -250, 0) || lane(0, 300, 250, 0) || lane(-250, 0, 250, 0)) return true;
            return false;
        };

        const treeGroup = new THREE.Group();
        treeGroup.name = 'mapTrees';
        const trunkGeo = new THREE.CylinderGeometry(2.2, 3, 16, 6);
        const leafGeo = new THREE.ConeGeometry(11, 26, 7);
        const trunkMat = new THREE.MeshLambertMaterial({ color: TRUNK });
        const leafMat = new THREE.MeshLambertMaterial({ color: LEAF, emissive: 0x12351f, emissiveIntensity: 0.2 });

        const KEEPOUT_X = 430, KEEPOUT_Z = 470;
        const nearArena = (x, z) => Math.abs(x) < KEEPOUT_X && Math.abs(z) < KEEPOUT_Z;

        let placed = 0;
        for (let i = 0; i < 800 && placed < 90; i++) {

            const ang = H(i * 1.3) * Math.PI * 2;
            const rad = 480 + H(i * 2.7 + 4) * 400;
            const x = Math.cos(ang) * rad;
            const z = Math.sin(ang) * rad;
            if (nearArena(x, z) || onPlayArea(x, z)) continue;
            const s = 0.7 + H(i * 3.9) * 0.9;
            const trunk = new THREE.Mesh(trunkGeo, trunkMat);
            trunk.position.set(x, 8 * s, z); trunk.scale.setScalar(s);
            const leaf = new THREE.Mesh(leafGeo, leafMat);
            leaf.position.set(x, (16 + 13) * s, z); leaf.scale.setScalar(s);
            treeGroup.add(trunk); treeGroup.add(leaf);
            placed++;
        }
        this.scene.add(treeGroup);
        this.mapTrees = treeGroup;

        const crateGeo = new THREE.BoxGeometry(10, 10, 10);
        const crateMat = new THREE.MeshLambertMaterial({ color: NAVY, emissive: 0x0d1326, emissiveIntensity: 0.1 });
        const postGeo = new THREE.CylinderGeometry(1, 1, 26, 6);
        const postMat = new THREE.MeshLambertMaterial({ color: 0x2a3a63 });
        const bulbGeo = new THREE.SphereGeometry(2.6, 8, 8);
        const bulbMat = new THREE.MeshBasicMaterial({ color: ORANGE });
        let props = 0;
        for (let i = 0; i < 400 && props < 60; i++) {
            const x = (H(i * 5.1 + 1) - 0.5) * 780;
            const z = (H(i * 6.3 + 7) - 0.5) * 780;
            if (onPlayArea(x, z)) continue;
            if (H(i * 7.7) > 0.5) {
                const crate = new THREE.Mesh(crateGeo, crateMat);
                crate.position.set(x, 5, z); crate.rotation.y = H(i) * Math.PI;
                group.add(crate);
            } else {
                const post = new THREE.Mesh(postGeo, postMat); post.position.set(x, 13, z);
                const bulb = new THREE.Mesh(bulbGeo, bulbMat); bulb.position.set(x, 27, z);
                group.add(post); group.add(bulb);
            }
            props++;
        }

        const glowMat = new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        [-250, 250].forEach((sx) => {
            const outline = new THREE.Mesh(new THREE.RingGeometry(95, 100, 48), glowMat);
            outline.rotation.x = -Math.PI / 2; outline.position.set(sx, 0.4, 0);
            group.add(outline);
        });

        this.scene.add(group);
        this.introDecor = group;
    }

    _deco_hash(n) {
        const s = Math.sin(n * 12.9898) * 43758.5453;
        return s - Math.floor(s);
    }

    _makeWindowTexture(seed, cols, rows) {
        const cell = 16;
        const canvas = document.createElement('canvas');
        canvas.width = cols * cell;
        canvas.height = rows * cell;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#1a2447';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const pad = 4, wW = cell - pad * 2, wH = cell - pad * 2;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const lit = this._deco_hash(seed * 7.1 + r * 31.7 + c * 13.3) > 0.30;
                ctx.fillStyle = lit ? '#ef4e23' : 'rgba(239,78,35,0.18)';
                ctx.fillRect(c * cell + pad, r * cell + pad, wW, wH);
            }
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        return tex;
    }

    createOuterDecoration() {
        const group = new THREE.Group();
        group.name = 'outerDecoration';

        const rings = [
            { radius: 720, count: 26, baseH: 120, varH: 160, w: 40, d: 40 },
            { radius: 920, count: 34, baseH: 220, varH: 300, w: 54, d: 54 },
        ];

        const totalTowers = rings.reduce((n, r) => n + r.count, 0);
        const sharedWindowTex = this._makeWindowTexture(1, 6, 14);
        const towerMat = new THREE.MeshLambertMaterial({
            map: sharedWindowTex,
            emissive: 0xffffff,
            emissiveMap: sharedWindowTex,
            emissiveIntensity: 0.9,
        });
        const unitBox = new THREE.BoxGeometry(1, 1, 1);
        const towers = new THREE.InstancedMesh(unitBox, towerMat, totalTowers);
        towers.castShadow = false;
        towers.receiveShadow = false;
        towers.frustumCulled = false;

        const m4 = new THREE.Matrix4();
        const quat = new THREE.Quaternion();
        const up = new THREE.Vector3(0, 1, 0);
        const pos = new THREE.Vector3();
        const scl = new THREE.Vector3();

        let idx = 0;
        for (const ring of rings) {
            for (let i = 0; i < ring.count; i++) {
                const a = (i / ring.count) * Math.PI * 2;
                const rJit = (this._deco_hash(idx) - 0.5) * 130;
                const aJit = (this._deco_hash(idx + 99) - 0.5) * (Math.PI / ring.count);
                const r = ring.radius + rJit;
                const ang = a + aJit;
                const x = Math.cos(ang) * r;
                const z = Math.sin(ang) * r;

                const h = ring.baseH + this._deco_hash(idx + 7) * ring.varH;
                const wj = ring.w * (0.7 + this._deco_hash(idx + 3) * 0.8);
                const dj = ring.d * (0.7 + this._deco_hash(idx + 5) * 0.8);

                pos.set(x, h / 2, z);
                quat.setFromAxisAngle(up, -ang + Math.PI / 2);
                scl.set(wj, h, dj);
                m4.compose(pos, quat, scl);
                towers.setMatrixAt(idx, m4);
                idx++;
            }
        }
        towers.instanceMatrix.needsUpdate = true;
        group.add(towers);

        const cityGround = new THREE.Mesh(
            new THREE.PlaneGeometry(7000, 7000),
            new THREE.MeshLambertMaterial({ color: 0x161e3e })
        );
        cityGround.rotation.x = -Math.PI / 2;
        cityGround.position.y = -0.5;
        cityGround.receiveShadow = false;
        group.add(cityGround);

        this.scene.add(group);
        this.outerDecoration = group;

        this.createDecorationAirplane(group);
    }

    createDecorationAirplane(group) {
        const ORANGE = 0xef4e23;
        const loader = new GLTFLoader();
        loader.load(
            '/models/airbus.glb',
            (gltf) => {
                const plane = gltf.scene;

                plane.traverse((child) => {
                    if (child.isMesh) {
                        child.material = new THREE.MeshLambertMaterial({
                            color: ORANGE,
                            emissive: ORANGE,
                            emissiveIntensity: 0.25,
                            fog: false,
                        });
                        child.castShadow = false;
                        child.receiveShadow = false;
                    }
                });

                const box = new THREE.Box3().setFromObject(plane);
                const size = box.getSize(new THREE.Vector3());
                const longest = Math.max(size.x, size.y, size.z) || 1;
                const scale = 140 / longest;
                plane.scale.setScalar(scale);

                const ang = Math.PI * 0.25;
                const r = 640;
                plane.position.set(Math.cos(ang) * r, 200, Math.sin(ang) * r);

                plane.rotation.y = -ang;
                plane.rotation.z = 0.12;

                group.add(plane);
                console.log('Decoration airbus loaded (orange).');
            },
            undefined,
            (err) => console.error('Failed to load decoration airbus:', err)
        );
    }

    createMinimalistGround() {

        const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
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

        this.createSpawnMarker(0, this.bottomSpawnZ, 'attacker');
        this.createSpawnMarker(0, this.topSpawnZ, 'defender');

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

    createSpawnMarker(x, z, role) {
        const radius = 52;
        const isAttacker = role === 'attacker';

        const hex = isAttacker ? '#ef4e23' : '#5b7bb4';

        const S = 512;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = S;
        const ctx = canvas.getContext('2d');
        const c = S / 2;

        ctx.fillStyle = isAttacker ? 'rgba(239,78,35,0.10)' : 'rgba(91,123,180,0.12)';
        ctx.beginPath();
        ctx.arc(c, c, S * 0.46, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = hex;
        ctx.lineWidth = S * 0.012;
        ctx.beginPath();
        ctx.arc(c, c, S * 0.45, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = hex;
        ctx.strokeStyle = hex;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        if (isAttacker) {

            ctx.lineWidth = S * 0.03;
            const drawChevron = (cy) => {
                ctx.beginPath();
                ctx.moveTo(c - S * 0.12, cy + S * 0.05);
                ctx.lineTo(c, cy - S * 0.05);
                ctx.lineTo(c + S * 0.12, cy + S * 0.05);
                ctx.stroke();
            };
            drawChevron(c - S * 0.10);
            drawChevron(c + S * 0.02);
        } else {

            ctx.lineWidth = S * 0.028;
            const w = S * 0.13, top = c - S * 0.13, bot = c + S * 0.15;
            ctx.beginPath();
            ctx.moveTo(c - w, top);
            ctx.lineTo(c + w, top);
            ctx.lineTo(c + w, c + S * 0.02);
            ctx.quadraticCurveTo(c + w, bot, c, bot);
            ctx.quadraticCurveTo(c - w, bot, c - w, c + S * 0.02);
            ctx.closePath();
            ctx.stroke();
        }

        ctx.font = `bold ${Math.round(S * 0.11)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(isAttacker ? 'ATTACK' : 'DEFEND', c, c + S * 0.30);

        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 16;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;

        const marker = new THREE.Mesh(
            new THREE.PlaneGeometry(radius * 2, radius * 2),
            new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false })
        );
        marker.rotation.x = -Math.PI / 2;

        marker.rotation.z = z < 0 ? Math.PI : 0;
        marker.position.set(x, 0.2, z);
        marker.name = 'spawnMarker';
        this.scene.add(marker);
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
        const geo = new THREE.BoxGeometry(width, height, depth);
        geo.translate(x, y, z);
        (this._wallGeoms || (this._wallGeoms = [])).push(geo);

        if (this.collisionSystem) {
            this.collisionSystem.addBoxCollider(
                { x, y, z },
                { x: width, y: height, z: depth }
            );
        }
        return null;
    }

    createAngledWall(x, y, z, width, height, depth, rotation) {
        const geo = new THREE.BoxGeometry(width, height, depth);
        geo.rotateY(rotation);
        geo.translate(x, y, z);
        (this._wallGeoms || (this._wallGeoms = [])).push(geo);

        if (this.collisionSystem) {

            this.collisionSystem.addBoxCollider(
                { x, y, z },
                { x: width, y: height, z: depth },
                'default',
                rotation
            );
        }
        return null;
    }

    finalizeStaticWalls() {
        if (!this._wallGeoms || this._wallGeoms.length === 0) return;
        const merged = BufferGeometryUtils.mergeGeometries(this._wallGeoms, false);

        this._wallGeoms.forEach((g) => g.dispose());
        this._wallGeoms = null;

        const mat = new THREE.MeshLambertMaterial({
            color: MAP_COLORS.wall,
            emissive: MAP_COLORS.wallEmissive,
            emissiveIntensity: 0.05,
        });
        const wallsMesh = new THREE.Mesh(merged, mat);
        wallsMesh.castShadow = true;
        wallsMesh.receiveShadow = true;
        wallsMesh.userData.isMapWall = true;
        wallsMesh.name = 'staticWalls';
        this.scene.add(wallsMesh);
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