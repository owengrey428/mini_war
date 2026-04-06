// ===== SERVER-SIDE TERRAIN =====
const { GRAVITY, MOVE_SPEED, WEAPONS } = require('./shared-constants');

class Terrain {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.data = new Uint8ClampedArray(width * height * 4); // RGBA
        this.deltas = []; // Accumulated terrain changes per tick
    }

    // Reset delta tracking each server tick
    clearDeltas() {
        this.deltas = [];
    }

    isSolid(x, y) {
        x = Math.floor(x);
        y = Math.floor(y);
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return true;
        return this.data[(y * this.width + x) * 4 + 3] > 0;
    }

    canFit(tx, ty) {
        tx = Math.floor(tx);
        ty = Math.floor(ty);
        for (let y = ty - 5; y <= ty; y++) {
            for (let x = tx - 1; x <= tx + 1; x++) {
                if (this.isSolid(x, y)) return false;
            }
        }
        return true;
    }

    getSafeDropY(targetX) {
        let scanY = 5;
        while ((this.isSolid(targetX, scanY) || this.isSolid(targetX - 2, scanY) || this.isSolid(targetX + 2, scanY)) && scanY < this.height * 0.6) scanY++;
        for (let s = scanY; s < this.height - 20; s++) {
            let hasClearance = true;
            for (let dy = 0; dy < 15; dy++) {
                if (this.isSolid(targetX, s + dy) || this.isSolid(targetX - 2, s + dy) || this.isSolid(targetX + 2, s + dy)) {
                    hasClearance = false;
                    break;
                }
            }
            if (hasClearance) return s + 2;
        }
        return scanY + 2;
    }

    destroyPixel(x, y) {
        x = Math.floor(x);
        y = Math.floor(y);
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            this.data[(y * this.width + x) * 4 + 3] = 0;
        }
    }

    // Explode terrain and return damage info for players
    // playerDamageCallback(playerId, damage, attackerId) is called for each hit player
    explode(cx, cy, terrainRadius, playerRadius, damage, ownerId, players, soundEvents) {
        if (terrainRadius > 10) soundEvents.push({ id: 'BOOM_LARGE', x: cx, y: cy });
        else if (terrainRadius > 1) soundEvents.push({ id: 'BOOM_SMALL', x: cx, y: cy });

        if (terrainRadius <= 1) {
            this.destroyPixel(cx, cy);
            this.deltas.push({ type: 'pixel', x: Math.floor(cx), y: Math.floor(cy) });
            return;
        }

        let rSq = terrainRadius * terrainRadius;
        for (let y = Math.floor(cy - terrainRadius); y <= Math.ceil(cy + terrainRadius); y++) {
            for (let x = Math.floor(cx - terrainRadius); x <= Math.ceil(cx + terrainRadius); x++) {
                if ((x - cx) ** 2 + (y - cy) ** 2 <= rSq) {
                    this.destroyPixel(x, y);
                }
            }
        }
        // Track as a circle delta (much more compact than individual pixels)
        this.deltas.push({ type: 'explode', cx: Math.floor(cx), cy: Math.floor(cy), r: terrainRadius });

        // Damage players in radius
        if (players) {
            for (const p of players) {
                if (p.health > 0) {
                    let dist = Math.sqrt((p.x - cx) ** 2 + (p.y - 3 - cy) ** 2);
                    if (dist <= playerRadius + 3) {
                        let falloff = 1 - 0.9 * (dist / (playerRadius + 3));
                        p.takeDamage(damage * falloff, ownerId, players);
                    }
                }
            }
        }
    }

    // Build a bridge (for SUPERBRIDGE weapon)
    buildBridge(startX, bridgeY, length) {
        for (let x = Math.floor(startX); x < Math.floor(startX + length); x++) {
            for (let y = bridgeY; y < bridgeY + 3; y++) {
                if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
                    let idx = (y * this.width + x) * 4;
                    this.data[idx] = 255;
                    this.data[idx + 1] = 255;
                    this.data[idx + 2] = 255;
                    this.data[idx + 3] = 255;
                }
            }
        }
        this.deltas.push({ type: 'bridge', x: Math.floor(startX), y: bridgeY, len: length });
    }

    // Compress terrain data for network transmission
    compress() {
        // Use pako if available, otherwise send raw
        try {
            const pako = require('pako');
            return Buffer.from(pako.deflate(this.data)).toString('base64');
        } catch (e) {
            return Buffer.from(this.data).toString('base64');
        }
    }

    // Get the raw data as a regular array for serialization
    toArray() {
        return Array.from(this.data);
    }
}

module.exports = Terrain;
