// ===== SERVER-SIDE MAP GENERATOR =====
const SeededRandom = require('./seeded-random');

const TERRAIN_TYPES = ['fortress', 'towers', 'terraced', 'tunnels', 'arena', 'skyscraper'];

const PALETTES = [
    { name: 'Forest',  primary: [34, 139, 34],   secondary: [101, 67, 33],  accent: [59, 122, 44] },
    { name: 'Ice',     primary: [135, 206, 235], secondary: [176, 224, 230], accent: [224, 255, 255] },
    { name: 'Desert',  primary: [194, 178, 128], secondary: [222, 184, 135], accent: [139, 115, 85] },
    { name: 'Stone',   primary: [128, 128, 128], secondary: [169, 169, 169], accent: [105, 105, 105] },
    { name: 'Lava',    primary: [139, 0, 0],     secondary: [255, 69, 0],    accent: [255, 99, 71] },
    { name: 'Ocean',   primary: [0, 105, 148],   secondary: [32, 178, 170],  accent: [46, 139, 87] }
];

function generateMap(terrain, seed) {
    const rng = new SeededRandom(seed);
    const W = terrain.width;
    const H = terrain.height;

    const type = rng.pick(TERRAIN_TYPES);
    const palette = rng.pick(PALETTES);
    const noiseSeed = rng.next() * 10000;

    function valueNoise2D(x, y, scale) {
        let sx = x / scale, sy = y / scale;
        let ix = Math.floor(sx), iy = Math.floor(sy);
        let fx = sx - ix, fy = sy - iy;
        fx = fx * fx * (3 - 2 * fx);
        fy = fy * fy * (3 - 2 * fy);
        function hash2(nx, ny) { return ((Math.sin(nx * 127.1 + ny * 269.5 + noiseSeed * 311.7) * 43758.5453) % 1 + 1) % 1; }
        let a = hash2(ix, iy), b = hash2(ix + 1, iy);
        let c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
        return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
    }

    let solidMap = new Array(W * H).fill(false);

    // Helper: fill a rectangle
    function fillRect(x1, y1, w, h) {
        for (let y = Math.floor(y1); y < Math.floor(y1 + h); y++) {
            for (let x = Math.floor(x1); x < Math.floor(x1 + w); x++) {
                if (x >= 0 && x < W && y >= 0 && y < H) solidMap[y * W + x] = true;
            }
        }
    }

    // Helper: clear a rectangle
    function clearRect(x1, y1, w, h) {
        for (let y = Math.floor(y1); y < Math.floor(y1 + h); y++) {
            for (let x = Math.floor(x1); x < Math.floor(x1 + w); x++) {
                if (x >= 0 && x < W && y >= 0 && y < H) solidMap[y * W + x] = false;
            }
        }
    }

    const floorThickness = Math.max(4, Math.floor(H * 0.04));
    const wallThickness = Math.max(3, Math.floor(W * 0.02));

    switch (type) {
        case 'fortress': {
            // 3-4 horizontal floors with rooms and corridors
            let numFloors = 3 + rng.nextInt(2);
            let floorSpacing = Math.floor((H * 0.75) / numFloors);
            let groundY = Math.floor(H * 0.88);

            // Ground floor
            fillRect(0, groundY, W, H - groundY);

            // Upper floors
            let floorYs = [groundY];
            for (let f = 1; f < numFloors; f++) {
                let fy = groundY - f * floorSpacing;
                floorYs.push(fy);
                fillRect(0, fy, W, floorThickness);
            }

            // Vertical walls dividing floors into rooms
            let numWalls = 2 + rng.nextInt(3);
            let wallPositions = [];
            for (let i = 0; i < numWalls; i++) {
                let wx = Math.floor(W * (0.15 + (i / numWalls) * 0.7) + rng.nextRange(-W * 0.05, W * 0.05));
                wallPositions.push(wx);
                // Walls span from top floor to ground
                fillRect(wx, floorYs[floorYs.length - 1], wallThickness, groundY - floorYs[floorYs.length - 1]);
            }

            // Cut doorways/gaps in each floor and wall for movement
            for (let f = 1; f < numFloors; f++) {
                let fy = floorYs[f];
                let numGaps = 2 + rng.nextInt(2);
                for (let g = 0; g < numGaps; g++) {
                    let gapX = Math.floor(rng.nextRange(W * 0.05, W * 0.85));
                    let gapW = Math.floor(rng.nextRange(12, 25));
                    clearRect(gapX, fy, gapW, floorThickness);
                }
            }

            // Cut doorways in walls
            for (let wx of wallPositions) {
                for (let fy of floorYs) {
                    if (rng.next() < 0.7) {
                        let doorY = fy - Math.floor(rng.nextRange(10, 18));
                        clearRect(wx, doorY, wallThickness, Math.floor(rng.nextRange(8, 14)));
                    }
                }
            }

            // Add some small platforms between floors for easier navigation
            for (let f = 1; f < numFloors; f++) {
                let aboveY = floorYs[f];
                let belowY = (f > 0) ? floorYs[f - 1] : groundY;
                let midY = Math.floor((aboveY + belowY) / 2);
                let numSteps = 1 + rng.nextInt(3);
                for (let s = 0; s < numSteps; s++) {
                    let sx = Math.floor(rng.nextRange(W * 0.05, W * 0.85));
                    let sw = Math.floor(rng.nextRange(15, 35));
                    fillRect(sx, midY + rng.nextInt(8) - 4, sw, 3);
                }
            }
            break;
        }

        case 'towers': {
            // 2-4 tall towers connected by platforms at different heights
            let groundY = Math.floor(H * 0.88);
            fillRect(0, groundY, W, H - groundY);

            let numTowers = 2 + rng.nextInt(3);
            let towerSpacing = W / (numTowers + 1);
            let towerPositions = [];

            for (let t = 0; t < numTowers; t++) {
                let tx = Math.floor(towerSpacing * (t + 1) + rng.nextRange(-towerSpacing * 0.15, towerSpacing * 0.15));
                let tw = Math.floor(rng.nextRange(10, 20));
                let towerTop = Math.floor(H * rng.nextRange(0.12, 0.35));
                towerPositions.push({ x: tx, w: tw, top: towerTop });

                // Tower column
                fillRect(tx - tw / 2, towerTop, tw, groundY - towerTop);

                // Hollow out interior passages
                let interiorW = tw - wallThickness * 2;
                if (interiorW > 3) {
                    for (let py = towerTop + 10; py < groundY - 10; py += Math.floor(rng.nextRange(18, 30))) {
                        // Leave a floor with a gap
                        fillRect(tx - tw / 2, py, tw, 3);
                        let gapSide = rng.next() > 0.5 ? -1 : 1;
                        clearRect(tx + gapSide * (tw / 4), py, Math.floor(tw * 0.4), 3);
                    }
                }
            }

            // Connect towers with platforms at various heights
            for (let i = 0; i < towerPositions.length - 1; i++) {
                let t1 = towerPositions[i], t2 = towerPositions[i + 1];
                let numBridges = 2 + rng.nextInt(2);
                let maxTop = Math.max(t1.top, t2.top);
                for (let b = 0; b < numBridges; b++) {
                    let by = Math.floor(maxTop + (groundY - maxTop) * ((b + 1) / (numBridges + 1)));
                    let bx1 = t1.x + t1.w / 2;
                    let bx2 = t2.x - t2.w / 2;
                    fillRect(bx1, by, bx2 - bx1, 3);
                    // Gap in the middle of the bridge
                    let midBridge = (bx1 + bx2) / 2;
                    clearRect(midBridge - 5, by, 10, 3);
                }
            }

            // Side ledges on the edges
            for (let s = 0; s < 3; s++) {
                let ly = Math.floor(H * rng.nextRange(0.2, 0.75));
                let lw = Math.floor(rng.nextRange(15, 30));
                if (rng.next() > 0.5) fillRect(0, ly, lw, 3);
                else fillRect(W - lw, ly, lw, 3);
            }
            break;
        }

        case 'terraced': {
            // Stepped terrain with multiple tiers, like rice paddies going up
            let numTiers = 4 + rng.nextInt(2);
            let goingRight = rng.next() > 0.5;
            let tierHeight = Math.floor(H * 0.7 / numTiers);
            let baseY = Math.floor(H * 0.88);

            for (let t = 0; t < numTiers; t++) {
                let tierY = baseY - t * tierHeight;
                let tierStart, tierEnd;
                if (goingRight) {
                    tierStart = Math.floor(W * (t / numTiers) * 0.6);
                    tierEnd = W;
                } else {
                    tierStart = 0;
                    tierEnd = Math.floor(W * (1 - (t / numTiers) * 0.6));
                }

                // Tier floor
                fillRect(tierStart, tierY, tierEnd - tierStart, floorThickness);
                // Fill below the tier to make it solid
                fillRect(tierStart, tierY, tierEnd - tierStart, baseY - tierY + (H - baseY));

                // Add a retaining wall at the step edge
                let wallX = goingRight ? tierStart : tierEnd - wallThickness;
                if (t > 0) {
                    let prevTierY = baseY - (t - 1) * tierHeight;
                    fillRect(wallX, tierY, wallThickness, prevTierY - tierY);
                }
            }

            // Cut passages through the tier walls
            for (let t = 1; t < numTiers; t++) {
                let tierY = baseY - t * tierHeight;
                let prevTierY = baseY - (t - 1) * tierHeight;
                let wallX = goingRight ? Math.floor(W * (t / numTiers) * 0.6) : Math.floor(W * (1 - (t / numTiers) * 0.6)) - wallThickness;
                let doorH = Math.floor(rng.nextRange(8, 14));
                clearRect(wallX, prevTierY - doorH - 2, wallThickness + 2, doorH);
            }

            // Add floating platforms between tiers for jump shortcuts
            for (let t = 0; t < numTiers - 1; t++) {
                let midY = baseY - t * tierHeight - tierHeight / 2;
                let numPlats = 1 + rng.nextInt(2);
                for (let p = 0; p < numPlats; p++) {
                    let px = Math.floor(rng.nextRange(W * 0.1, W * 0.9));
                    fillRect(px, Math.floor(midY), Math.floor(rng.nextRange(15, 30)), 3);
                }
            }

            // Carve some vertical shafts through the tiers
            let numShafts = 1 + rng.nextInt(2);
            for (let s = 0; s < numShafts; s++) {
                let sx = Math.floor(rng.nextRange(W * 0.2, W * 0.8));
                let shaftW = Math.floor(rng.nextRange(8, 15));
                clearRect(sx, Math.floor(H * 0.15), shaftW, Math.floor(H * 0.7));
            }
            break;
        }

        case 'tunnels': {
            // Thick solid terrain with carved-out tunnel pathways
            solidMap.fill(true);

            // Clear sky area
            for (let x = 0; x < W; x++) {
                for (let y = 0; y < Math.floor(H * 0.12); y++) {
                    solidMap[y * W + x] = false;
                }
            }

            // Carve 3-4 horizontal tunnels at different heights
            let numTunnels = 3 + rng.nextInt(2);
            let tunnelYs = [];
            for (let t = 0; t < numTunnels; t++) {
                let ty = Math.floor(H * (0.18 + t * 0.7 / numTunnels));
                tunnelYs.push(ty);
                let tunnelH = Math.floor(rng.nextRange(12, 20));
                // Main horizontal tunnel
                clearRect(0, ty, W, tunnelH);

                // Add some alcoves/rooms along the tunnel
                let numAlcoves = 2 + rng.nextInt(3);
                for (let a = 0; a < numAlcoves; a++) {
                    let ax = Math.floor(rng.nextRange(W * 0.05, W * 0.85));
                    let aw = Math.floor(rng.nextRange(15, 30));
                    let ah = Math.floor(rng.nextRange(8, 15));
                    let aboveOrBelow = rng.next() > 0.5 ? -ah : tunnelH;
                    clearRect(ax, ty + aboveOrBelow, aw, ah);
                }
            }

            // Connect tunnels with vertical shafts
            let numShafts = 2 + rng.nextInt(3);
            for (let s = 0; s < numShafts; s++) {
                let sx = Math.floor(rng.nextRange(W * 0.08, W * 0.88));
                let shaftW = Math.floor(rng.nextRange(6, 12));
                let startTunnel = rng.nextInt(Math.max(1, numTunnels - 1));
                let endTunnel = startTunnel + 1 + rng.nextInt(Math.max(1, numTunnels - startTunnel - 1));
                if (endTunnel >= numTunnels) endTunnel = numTunnels - 1;
                let sy1 = tunnelYs[startTunnel];
                let sy2 = tunnelYs[endTunnel] + 15;
                clearRect(sx, sy1, shaftW, sy2 - sy1);
            }

            // Open areas on the surface
            let numOpenings = 2 + rng.nextInt(2);
            for (let o = 0; o < numOpenings; o++) {
                let ox = Math.floor(rng.nextRange(W * 0.05, W * 0.75));
                let ow = Math.floor(rng.nextRange(20, 45));
                clearRect(ox, Math.floor(H * 0.08), ow, tunnelYs[0] - Math.floor(H * 0.08));
            }
            break;
        }

        case 'arena': {
            // Central open arena with surrounding walls and elevated platforms
            let groundY = Math.floor(H * 0.88);
            fillRect(0, groundY, W, H - groundY);

            // Thick walls on both sides
            let wallW = Math.floor(W * 0.08);
            let wallTop = Math.floor(H * 0.2);
            fillRect(0, wallTop, wallW, groundY - wallTop);
            fillRect(W - wallW, wallTop, wallW, groundY - wallTop);

            // Platforms inside the walls
            let numLevels = 3 + rng.nextInt(2);
            for (let l = 0; l < numLevels; l++) {
                let ly = Math.floor(wallTop + (groundY - wallTop) * ((l + 0.5) / numLevels));
                // Left ledge extending inward
                let leftW = Math.floor(rng.nextRange(W * 0.12, W * 0.22));
                fillRect(wallW, ly, leftW, 3);
                // Right ledge extending inward
                let rightW = Math.floor(rng.nextRange(W * 0.12, W * 0.22));
                fillRect(W - wallW - rightW, ly, rightW, 3);

                // Sometimes a central platform
                if (rng.next() > 0.4) {
                    let cw = Math.floor(rng.nextRange(W * 0.15, W * 0.3));
                    let cx = Math.floor((W - cw) / 2 + rng.nextRange(-W * 0.05, W * 0.05));
                    fillRect(cx, ly + rng.nextInt(6) - 3, cw, 3);
                }
            }

            // Doorways through the side walls
            for (let l = 0; l < numLevels; l++) {
                let ly = Math.floor(wallTop + (groundY - wallTop) * ((l + 0.5) / numLevels));
                if (rng.next() > 0.3) {
                    clearRect(0, ly - 10, wallW, 12);
                }
                if (rng.next() > 0.3) {
                    clearRect(W - wallW, ly - 10, wallW, 12);
                }
            }

            // Top overhang / ceiling pieces
            let roofW = Math.floor(W * 0.25);
            fillRect(0, wallTop, roofW, floorThickness);
            fillRect(W - roofW, wallTop, roofW, floorThickness);

            // Central pillar or obstacle
            if (rng.next() > 0.4) {
                let px = Math.floor(W / 2 - wallThickness);
                let pTop = Math.floor(H * rng.nextRange(0.35, 0.55));
                fillRect(px, pTop, wallThickness * 2, groundY - pTop);
                // Ledges on the pillar
                for (let pl = 0; pl < 2; pl++) {
                    let ply = Math.floor(pTop + (groundY - pTop) * ((pl + 1) / 3));
                    fillRect(px - 10, ply, 10, 3);
                    fillRect(px + wallThickness * 2, ply, 10, 3);
                }
            }
            break;
        }

        case 'skyscraper': {
            // Multiple building-like structures side by side with floors and rooms
            let groundY = Math.floor(H * 0.88);
            fillRect(0, groundY, W, H - groundY);

            let numBuildings = 2 + rng.nextInt(2);
            let buildingSpacing = W / numBuildings;

            for (let b = 0; b < numBuildings; b++) {
                let bx = Math.floor(b * buildingSpacing + buildingSpacing * 0.1);
                let bw = Math.floor(buildingSpacing * 0.7);
                let numStories = 3 + rng.nextInt(3);
                let storyH = Math.floor((H * 0.65) / numStories);
                let buildingTop = groundY - numStories * storyH;

                // Outer walls
                fillRect(bx, buildingTop, wallThickness, groundY - buildingTop);
                fillRect(bx + bw - wallThickness, buildingTop, wallThickness, groundY - buildingTop);

                // Floors
                for (let s = 0; s <= numStories; s++) {
                    let fy = buildingTop + s * storyH;
                    fillRect(bx, fy, bw, floorThickness);

                    // Gaps in each floor for vertical movement
                    if (s > 0 && s < numStories) {
                        let gapX = bx + Math.floor(rng.nextRange(wallThickness + 3, bw - wallThickness - 12));
                        let gapW = Math.floor(rng.nextRange(8, 15));
                        clearRect(gapX, fy, gapW, floorThickness);
                    }
                }

                // Roof platform extends slightly wider
                fillRect(bx - 5, buildingTop, bw + 10, 3);

                // Doorways in outer walls for entry/exit
                for (let s = 0; s < numStories; s++) {
                    let doorY = buildingTop + s * storyH + floorThickness + 2;
                    let doorH = Math.min(storyH - floorThickness - 3, 12);
                    if (doorH > 5) {
                        // Left wall doorway
                        if (rng.next() > 0.35) clearRect(bx, doorY, wallThickness, doorH);
                        // Right wall doorway
                        if (rng.next() > 0.35) clearRect(bx + bw - wallThickness, doorY, wallThickness, doorH);
                    }
                }
            }

            // Connecting platforms between buildings
            for (let b = 0; b < numBuildings - 1; b++) {
                let b1x = Math.floor(b * buildingSpacing + buildingSpacing * 0.1 + buildingSpacing * 0.7);
                let b2x = Math.floor((b + 1) * buildingSpacing + buildingSpacing * 0.1);
                let numBridges = 1 + rng.nextInt(2);
                for (let br = 0; br < numBridges; br++) {
                    let by = Math.floor(H * rng.nextRange(0.25, 0.7));
                    fillRect(b1x, by, b2x - b1x, 3);
                }
            }
            break;
        }
    }

    // Pit safety pass — add escape ledges to deep enclosed shafts
    const MAX_SAFE_DEPTH = 50;
    const LEDGE_INTERVAL = 16;
    let processedCols = new Set();
    for (let x = 2; x < W - 2; x++) {
        if (processedCols.has(x)) continue;
        let y2 = 0;
        while (y2 < H) {
            while (y2 < H && solidMap[y2 * W + x]) y2++;
            if (y2 >= H) break;
            let airTop = y2;
            while (y2 < H && !solidMap[y2 * W + x]) y2++;
            if (y2 >= H) continue;
            let depth = y2 - airTop;
            if (depth <= MAX_SAFE_DEPTH) continue;
            let midY = Math.floor((airTop + y2) / 2);
            let left = x, right = x;
            while (left > 0 && !solidMap[midY * W + (left - 1)]) left--;
            while (right < W - 1 && !solidMap[midY * W + (right + 1)]) right++;
            let shaftW = right - left + 1;
            if (shaftW > 18) continue;
            for (let cx = left; cx <= right; cx++) processedCols.add(cx);
            let center = Math.floor((left + right) / 2);
            let side = 1;
            for (let ly = y2 - LEDGE_INTERVAL; ly > airTop + 8; ly -= LEDGE_INTERVAL) {
                for (let dx = 0; dx < Math.min(5, shaftW); dx++) {
                    let lx = (side > 0) ? center + dx : center - dx;
                    if (lx >= 0 && lx < W) {
                        solidMap[ly * W + lx] = true;
                        if (ly + 1 < H) solidMap[(ly + 1) * W + lx] = true;
                    }
                }
                side *= -1;
            }
        }
    }

    // Convert solidMap to RGBA terrain data with depth-based coloring
    for (let x = 0; x < W; x++) {
        for (let y = 0; y < H; y++) {
            let idx = (y * W + x) * 4;
            if (solidMap[y * W + x]) {
                let depth = 0;
                for (let sy = y - 1; sy >= 0; sy--) {
                    if (solidMap[sy * W + x]) depth++;
                    else break;
                }
                let r, g, b;
                if (depth < 8) {
                    let t = depth / 8;
                    r = palette.primary[0] * (1 - t) + palette.secondary[0] * t;
                    g = palette.primary[1] * (1 - t) + palette.secondary[1] * t;
                    b = palette.primary[2] * (1 - t) + palette.secondary[2] * t;
                } else if (depth < 20) {
                    let t = (depth - 8) / 12;
                    r = palette.secondary[0] * (1 - t) + palette.accent[0] * t;
                    g = palette.secondary[1] * (1 - t) + palette.accent[1] * t;
                    b = palette.secondary[2] * (1 - t) + palette.accent[2] * t;
                } else {
                    r = palette.accent[0];
                    g = palette.accent[1];
                    b = palette.accent[2];
                }
                let noise = (valueNoise2D(x, y, 8) - 0.5) * 20;
                terrain.data[idx] = Math.max(0, Math.min(255, Math.floor(r + noise)));
                terrain.data[idx + 1] = Math.max(0, Math.min(255, Math.floor(g + noise)));
                terrain.data[idx + 2] = Math.max(0, Math.min(255, Math.floor(b + noise)));
                terrain.data[idx + 3] = 255;
            } else {
                terrain.data[idx] = 0;
                terrain.data[idx + 1] = 0;
                terrain.data[idx + 2] = 0;
                terrain.data[idx + 3] = 0;
            }
        }
    }

    return { type, palette: palette.name, seed };
}

module.exports = { generateMap, TERRAIN_TYPES, PALETTES };
