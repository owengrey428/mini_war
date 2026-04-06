// ===== SERVER-SIDE ENTITY SIMULATION =====
const { GRAVITY, MOVE_SPEED, MAX_FALL_SPEED, JUMP_POWER, WEAPONS } = require('./shared-constants');

class ToxicCloud {
    constructor(x, y, ownerId) {
        this.x = x; this.y = y; this.ownerId = ownerId;
        this.framesAlive = 0; this.maxFrames = 180; this.radius = 20;
        this.dmg = 36 / 180;
    }
    update(terrain, players, soundEvents) {
        for (const p of players) {
            if (p.health > 0 && Math.hypot(p.x - this.x, (p.y - 3) - this.y) <= this.radius) {
                p.takeDamage(this.dmg, this.ownerId, players);
            }
        }
        this.framesAlive++;
        return this.framesAlive < this.maxFrames;
    }
    serialize() {
        return { type: 'toxic', x: this.x, y: this.y, framesAlive: this.framesAlive, maxFrames: this.maxFrames, radius: this.radius };
    }
}

class Construct {
    constructor(type, x, y, facing, ownerId) {
        this.type = type; this.x = x; this.y = y; this.facing = facing; this.ownerId = ownerId;
        this.active = true; this.frames = 0;
        if (this.type === 'TOWER') { this.hp = 50; this.maxFrames = 1800; }
        if (this.type === 'PLASMA') { this.maxFrames = 360; }
    }
    update(terrain, players, projectiles, soundEvents) {
        this.frames++;
        if (this.frames >= this.maxFrames || this.hp <= 0) { this.active = false; return; }
        if (this.type === 'TOWER') {
            if (this.frames % 30 === 0) {
                let target = players.find(p => p.id !== this.ownerId && p.health > 0 && Math.abs(p.x - this.x) < 100 && Math.abs(p.y - this.y) < 25);
                if (target) {
                    soundEvents.push({ id: 'RIFLE', x: this.x, y: this.y });
                    let dx = target.x - this.x; let dy = (target.y - 3) - (this.y - 10); let dist = Math.hypot(dx, dy);
                    let speed = 6; let vx = (dx / dist) * speed; let vy = (dy / dist) * speed;
                    projectiles.push({ owner: this.ownerId, x: this.x, y: this.y - 10, vx, vy, weapon: { color: '#FF0', damage: 9, ammoHealth: 1, range: 200, terrainRadius: 1, playerRadius: 1, gravity: false }, ammoHealth: 1, distance: 0 });
                }
            }
        } else if (this.type === 'PLASMA') {
            if (this.frames % 10 === 0) this.x += this.facing;
            let currentDamage = 14;
            if (this.frames > 300) { let dissolveTicks = Math.floor((this.frames - 300) / 20); currentDamage = 14 * (1 - (0.33 * dissolveTicks)); }
            for (const p of players) {
                if (p.health > 0 && p.id !== this.ownerId && Math.abs(p.x - this.x) < 5 && Math.abs(p.y - this.y) < 20) {
                    p.takeDamage(currentDamage / 30, this.ownerId, players);
                }
            }
        }
    }
    serialize() {
        return { type: this.type === 'TOWER' ? 'tower' : 'plasma', x: this.x, y: this.y, facing: this.facing, frames: this.frames, hp: this.hp, active: this.active };
    }
}

class Trap {
    constructor(type, x, y, ownerId) {
        this.type = type; this.x = x; this.y = y; this.ownerId = ownerId; this.active = true;
    }
    update(terrain, players, soundEvents) {
        let hit = false;
        for (const p of players) {
            if (p.health > 0 && p.id !== this.ownerId && Math.hypot(p.x - this.x, p.y - this.y) < 5) hit = true;
        }
        if (hit) {
            terrain.explode(this.x, this.y, 15, 20, 36, this.ownerId, players, soundEvents);
            this.active = false;
        }
    }
    serialize() {
        return { type: this.type === 'MINE' ? 'mine' : 'fake', x: this.x, y: this.y, active: this.active };
    }
}

class Creature {
    constructor(type, x, y, facing, ownerId, rng) {
        this.type = type; this.x = x; this.y = y; this.vx = 0; this.vy = 0;
        this.facing = facing; this.ownerId = ownerId; this.onGround = false; this.active = true;
        this.framesAlive = 0; this.clumpTimer = 0; this.rng = rng;
        if (this.type === 'ANT') { this.color = '#A22'; this.speed = MOVE_SPEED * 0.72; this.damage = 14; this.terrainRadius = 9; this.playerRadius = 13; this.hp = 1; }
        else if (this.type === 'SHEEP') { this.color = '#EEE'; this.speed = MOVE_SPEED * (0.4 + rng.next() * 0.3); this.hp = 100; }
        else if (this.type === 'HOLOTROOPER') { this.color = '#55F'; this.speed = MOVE_SPEED * 0.8; this.shootCooldown = 0; this.hp = 1; }
        else if (this.type === 'GHOST') { this.color = 'rgba(255,255,255,0.5)'; this.speed = MOVE_SPEED; this.shootCooldown = 0; this.hp = 999; }
    }
    update(terrain, players, projectiles, visualEvents, soundEvents, creatures) {
        this.framesAlive++;
        if (this.hp <= 0) { this.active = false; return; }
        if (this.type === 'HOLOTROOPER' && this.framesAlive > 600) { this.active = false; return; }
        if (this.type === 'GHOST' && this.framesAlive > 600) { this.active = false; return; }

        let nearest = null; let minDist = Infinity;
        if (this.type === 'ANT' || this.type === 'HOLOTROOPER') {
            for (const p of players) {
                if (p.health > 0 && p.id !== this.ownerId) {
                    let dist = Math.abs(p.x - this.x);
                    if (dist < minDist) { minDist = dist; nearest = p; }
                }
            }
            if (nearest) this.facing = Math.sign(nearest.x - this.x) || this.facing;
        }

        if (this.type === 'HOLOTROOPER' || this.type === 'GHOST') {
            this.shootCooldown--;
            if (nearest && Math.abs(nearest.x - this.x) < 150 && this.shootCooldown <= 0) {
                if (this.type === 'HOLOTROOPER') {
                    soundEvents.push({ id: 'RIFLE', x: this.x, y: this.y });
                    projectiles.push({ owner: this.ownerId, x: this.x + (this.facing * 5), y: this.y - 3, vx: this.facing * 6, vy: 0, weapon: WEAPONS.RIFLE, ammoHealth: 1, distance: 0 });
                } else if (this.type === 'GHOST') {
                    visualEvents.push({ type: 'LASER', x: this.x, y: this.y - 3, facing: this.facing, frames: 5, color: '#444' });
                }
                this.shootCooldown = 45;
            }
        }

        if (!this.onGround) { this.vy += GRAVITY; if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED; } else this.vy = 0;
        this.onGround = terrain.isSolid(this.x, this.y + 1) || terrain.isSolid(this.x - 1, this.y + 1) || terrain.isSolid(this.x + 1, this.y + 1);
        let intendedVx = this.speed * this.facing; this.vx = 0;

        let targetX = this.x + intendedVx; let highestPoint = this.y; let impassable = false;
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
            let scanX = Math.floor(targetX) + offsetX, scanY = this.y;
            while (terrain.isSolid(scanX, scanY) && (this.y - scanY) < 16) scanY--;
            if (terrain.isSolid(scanX, scanY)) impassable = true;
            if (scanY < highestPoint) highestPoint = scanY;
        }
        if (!impassable && terrain.canFit(targetX, highestPoint)) {
            let dy = this.y - highestPoint; let angle = Math.atan2(dy, Math.abs(intendedVx)) * (180 / Math.PI);
            if (angle >= 83) this.vx = 0; else if (angle >= 75) this.vx = intendedVx * 0.5; else this.vx = intendedVx;
            if (this.vx !== 0) {
                this.x += this.vx; let snapLimit = 20;
                while ((terrain.isSolid(this.x, this.y) || terrain.isSolid(this.x - 1, this.y) || terrain.isSolid(this.x + 1, this.y)) && snapLimit > 0) { this.y--; snapLimit--; }
            }
        } else this.vx = 0;

        if (this.onGround && this.type === 'SHEEP') {
            if (this.rng.next() < 0.03) { this.vy = JUMP_POWER * (0.6 + this.rng.next() * 0.4); this.onGround = false; }
        }

        if (Math.abs(this.vx) < 0.1) {
            if (this.onGround) { this.vy = JUMP_POWER * 0.4; this.onGround = false; } else if (this.type === 'SHEEP' || this.type === 'GHOST') this.facing *= -1;
        }

        let steps = Math.abs(this.vy), dirY = Math.sign(this.vy);
        for (let i = 0; i < steps; i++) {
            let checkY = (dirY === -1) ? (this.y - 6 + dirY) : (this.y + dirY);
            let solid = terrain.isSolid(this.x, checkY) || terrain.isSolid(this.x - 1, checkY) || terrain.isSolid(this.x + 1, checkY);
            if (!solid) this.y += dirY; else { this.vy = 0; break; }
        }

        if (this.y >= terrain.height - 1) { this.y = terrain.height - 1; this.vy = 0; this.onGround = true; }

        if (this.type === 'SHEEP') {
            let closeSheep = 0;
            for (let c of creatures) { if (c !== this && c.type === 'SHEEP' && Math.abs(c.x - this.x) < 10 && Math.abs(c.y - this.y) < 10) closeSheep++; }
            if (closeSheep >= 2) { this.clumpTimer++; if (this.clumpTimer > 300) { this.facing *= -1; this.speed = MOVE_SPEED * (0.3 + this.rng.next() * 0.4); this.clumpTimer = 0; } } else this.clumpTimer = 0;
            if (this.rng.next() < 0.005) this.facing *= -1;
        }

        if (this.type === 'ANT') {
            let hit = false;
            for (const p of players) { if (p.health > 0 && p.id !== this.ownerId && Math.hypot(p.x - this.x, (p.y - 3) - this.y) < 12) hit = true; }
            if (hit) { terrain.explode(this.x, this.y, this.terrainRadius, this.playerRadius, this.damage, this.ownerId, players, soundEvents); this.active = false; }
        } else if (this.type === 'SHEEP') {
            if (this.vy > 2) {
                for (const p of players) {
                    if (p.health > 0 && Math.abs(p.x - this.x) < 8 && p.y > this.y && Math.abs(p.y - this.y) < 12) {
                        p.takeDamage(90, this.ownerId, players); this.hp = 0;
                    }
                }
            }
        }

        if (this.x < 2) { this.x = 2; this.facing = 1; }
        if (this.x > terrain.width - 2) { this.x = terrain.width - 2; this.facing = -1; }
    }
    serialize() {
        return { type: this.type.toLowerCase(), x: this.x, y: this.y, facing: this.facing, hp: this.hp };
    }
}

class AirstrikeEvent {
    constructor(ownerId, playerX, arenaW, rng) {
        this.framesAlive = 0; this.maxFrames = 300; this.bombsDropped = 0; this.ownerId = ownerId;
        if (playerX < arenaW / 2) { this.minX = arenaW / 2; this.maxX = arenaW; } else { this.minX = 0; this.maxX = arenaW / 2; }
        this.dropFrames = [];
        for (let i = 0; i < 25; i++) this.dropFrames.push(Math.floor(rng.next() * 290));
        this.dropFrames.sort((a, b) => a - b);
    }
    update(terrain, players, projectiles, soundEvents, rng) {
        while (this.bombsDropped < 25 && this.framesAlive >= this.dropFrames[this.bombsDropped]) {
            let dropX = this.minX + rng.next() * (this.maxX - this.minX);
            projectiles.push({
                owner: this.ownerId, x: dropX, y: 0, vx: 0, vy: 2,
                weapon: { color: '#FF5500', damage: 36, ammoHealth: 1, range: 1000, terrainRadius: 16, playerRadius: 21, gravity: true },
                ammoHealth: 1, distance: 0
            });
            this.bombsDropped++;
        }
        this.framesAlive++;
        return this.framesAlive < this.maxFrames;
    }
}

class LightningEvent {
    constructor(ownerId, rng) {
        this.framesAlive = 0; this.maxFrames = 90; this.strikesDone = 0; this.ownerId = ownerId;
        this.hitPlayers = new Set(); this.dropFrames = [];
        for (let i = 0; i < 7; i++) this.dropFrames.push(Math.floor(rng.next() * 85));
        this.dropFrames.sort((a, b) => a - b);
    }
    update(terrain, players, visualEvents, soundEvents, rng) {
        while (this.strikesDone < 7 && this.framesAlive >= this.dropFrames[this.strikesDone]) {
            let validTargets = players.filter(p => p.health > 0 && !this.hitPlayers.has(p.id));
            let exposedTargets = validTargets.filter(p => {
                let cover = 0;
                for (let y = p.y; y >= 0; y--) { if (terrain.isSolid(p.x, y)) cover++; }
                return cover < 3;
            });
            let targetX, targetY;
            if (exposedTargets.length > 0) {
                let target = exposedTargets[rng.nextInt(exposedTargets.length)];
                this.hitPlayers.add(target.id);
                target.takeDamage(45, this.ownerId, players);
                targetX = target.x; targetY = target.y;
            } else {
                targetX = rng.next() * terrain.width; targetY = 0;
                while (targetY < terrain.height && !terrain.isSolid(targetX, targetY)) targetY++;
                let baseR = 20 + rng.next() * 5;
                terrain.explode(targetX, targetY, baseR * 0.62, baseR * 0.85, 27 + rng.next() * 9, this.ownerId, players, soundEvents);
            }
            visualEvents.push({ type: 'LIGHTNING', x: targetX, y: targetY, frames: 10 });
            soundEvents.push({ id: 'LIGHTNING', x: targetX, y: targetY });
            this.strikesDone++;
        }
        this.framesAlive++;
        return this.framesAlive < this.maxFrames;
    }
}

class Boulder {
    constructor(terrain, rng) {
        let highestY = terrain.height, bestX = terrain.width / 2;
        for (let scanX = 0; scanX < terrain.width; scanX++) {
            let scanY = 0;
            while (scanY < terrain.height && !terrain.isSolid(scanX, scanY)) scanY++;
            if (scanY < highestY) { highestY = scanY; bestX = scanX; }
        }
        this.x = bestX; this.y = 0; this.vx = 0; this.vy = 0;
        this.radius = 6; this.impacts = 0; this.hp = 75; this.active = true;
    }
    update(terrain, players, soundEvents) {
        this.vy += GRAVITY; let hitGround = false;
        if (this.vy > 0) {
            for (let i = 0; i < Math.ceil(this.vy); i++) {
                if (terrain.isSolid(this.x, this.y + this.radius)) { hitGround = true; break; }
                this.y++;
            }
        } else this.y += this.vy;

        if (hitGround) {
            let embedSafeguard = 50;
            while (terrain.isSolid(this.x, this.y + this.radius - 1) && embedSafeguard > 0) { this.y--; embedSafeguard--; }
            if (this.impacts === 0) {
                terrain.explode(this.x, this.y + this.radius, 4 + this.radius, 0, 0, 0, null, soundEvents);
                this.vy = -Math.sqrt(2 * GRAVITY * 10);
                this.vx = (this.x < terrain.width / 2) ? 1.5 : -1.5;
                this.impacts++;
            } else if (this.impacts === 1) {
                terrain.explode(this.x, this.y + this.radius, 2 + this.radius, 0, 0, 0, null, soundEvents);
                this.vy = -Math.sqrt(2 * GRAVITY * 5);
                this.impacts++;
            } else this.vy = 0;
        }

        if (this.impacts >= 2 && hitGround) {
            if (Math.abs(this.vx) < 0.1) this.vx = 0;
            else {
                let dir = Math.sign(this.vx), wallAhead = false;
                for (let i = 0; i < this.radius; i++) if (terrain.isSolid(this.x + dir * (this.radius + 1), this.y - i)) wallAhead = true;
                if (wallAhead) {
                    let climbY = this.y;
                    while (terrain.isSolid(this.x + dir * (this.radius + 1), climbY) && (this.y - climbY) < this.radius) climbY--;
                    if (!terrain.isSolid(this.x + dir * (this.radius + 1), climbY)) { this.y = climbY; this.vx *= 0.85; } else this.vx *= -0.6;
                }
                this.x += this.vx; this.vx *= 0.97;
            }
        } else if (!hitGround) this.x += this.vx;

        if (this.hp <= 0 || this.x < -20 || this.x > terrain.width + 20 || this.y > terrain.height + 20) this.active = false;
        for (const p of players) {
            if (p.health > 0 && Math.hypot(p.x - this.x, (p.y - 3) - this.y) < this.radius + 4) {
                p.takeDamage(90, 0, players);
            }
        }
    }
    serialize() {
        return { type: 'boulder', x: this.x, y: this.y, radius: this.radius };
    }
}

module.exports = { ToxicCloud, Construct, Trap, Creature, AirstrikeEvent, LightningEvent, Boulder };
