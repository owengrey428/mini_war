// ===== SERVER-SIDE PLAYER SIMULATION =====
const { GRAVITY, MOVE_SPEED, MAX_FALL_SPEED, FAST_FALL_SPEED, JUMP_POWER, HIGH_JUMP_POWER, WEAPONS, LOOT_POOL } = require('./shared-constants');

class PlayerSim {
    constructor(id, x, y, color, startHealth) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.color = color;
        this.startHealth = startHealth;

        this.vx = 0;
        this.vy = 0;
        this.facing = 1;

        this.inventory = [];
        this.currentWeaponIndex = 0;
        this.primaryLatched = false;
        this.secondaryLatched = false;
        this.switchLatched = false;

        this.roundStats = this.emptyStats();
        this.seriesStats = this.emptyStats();

        this.input = { left: false, right: false, jump: false, down: false, primary: false, secondary: false, switch: false };
        this.prevInput = { ...this.input };

        this.resetForRound();
    }

    emptyStats() {
        return { totalDamage: 0, damageToSelf: 0, shotsFired: 0, shotsHit: 0, killCount: 0, distanceTraveled: 0, cratesCollected: 0, sheepKilled: 0 };
    }

    resetForRound() {
        this.health = this.startHealth;
        this.lives = 1;
        this.onGround = false;
        this.highestY = this.y;
        this.jumps = 0;
        this.jumpHoldTimer = 0;
        this.jumpSequenceEnded = false;
        this.isPhasing = false;
        this.recoilRemaining = 0;
        this.speedMod = 1;
        this.jumpMod = 1;
        this.buffTimer = 0;
        this.voodooTimer = 0;
        this.freezeTimer = 0;
        this.cloakTimer = 0;
        this.rearTurretTimer = 0;
        this.inventory = [];
        this.currentWeaponIndex = 0;
        this.roundStats = this.emptyStats();
    }

    setInput(inputObj) {
        this.prevInput = { ...this.input };
        this.input = inputObj;
    }

    update(terrain, players, projectiles, crates, creatures, soundEvents, visualEvents, rng, frameCount) {
        if (this.health <= 0) return;

        // Buff timers
        if (this.buffTimer > 0) { this.buffTimer--; if (this.buffTimer <= 0) { this.speedMod = 1; this.jumpMod = 1; } }
        if (this.voodooTimer > 0) this.voodooTimer--;
        if (this.cloakTimer > 0) this.cloakTimer--;
        if (this.rearTurretTimer > 0) {
            this.rearTurretTimer--;
            if (frameCount % 45 === 0) {
                let target = players.find(p => p.id !== this.id && p.health > 0 && Math.sign(p.x - this.x) === -this.facing && Math.abs(p.x - this.x) < 50 && Math.abs(p.y - this.y) < 15);
                if (target) {
                    soundEvents.push({ id: 'RIFLE', x: this.x, y: this.y });
                    projectiles.push({ owner: this.id, x: this.x + (-this.facing * 5), y: this.y - 3, vx: -this.facing * 6, vy: 0, weapon: WEAPONS.RIFLE, ammoHealth: 1, distance: 0 });
                }
            }
        }

        let prevX = this.x;

        if (this.freezeTimer > 0) {
            this.freezeTimer--;
            this.vx = 0; this.vy = 0;
        } else {
            // Recoil
            if (this.recoilRemaining > 0) {
                let step = Math.min(MOVE_SPEED * 2, this.recoilRemaining);
                let dir = -this.facing, stepAmount = step / Math.ceil(step);
                for (let i = 0; i < Math.ceil(step); i++) {
                    if (terrain.canFit(this.x + (dir * stepAmount), this.y)) this.x += (dir * stepAmount);
                    else { this.recoilRemaining = 0; break; }
                }
                this.recoilRemaining -= step;
                if (this.x < 2) this.x = 2;
                if (this.x > terrain.width - 2) this.x = terrain.width - 2;
            }

            let prevOnGround = this.onGround;
            this.onGround = terrain.isSolid(this.x, this.y + 1) || terrain.isSolid(this.x - 1, this.y + 1) || terrain.isSolid(this.x + 1, this.y + 1);

            // Movement
            let intendedVx = 0;
            if (this.input.left) { intendedVx = -(MOVE_SPEED * this.speedMod); this.facing = -1; }
            if (this.input.right) { intendedVx = (MOVE_SPEED * this.speedMod); this.facing = 1; }

            this.vx = 0;
            if (intendedVx !== 0 && this.recoilRemaining <= 0) {
                let targetX = this.x + intendedVx; let highestPoint = this.y; let impassable = false;
                for (let offsetX = -1; offsetX <= 1; offsetX++) {
                    let scanX = Math.floor(targetX) + offsetX, scanY = this.y;
                    while (terrain.isSolid(scanX, scanY) && (this.y - scanY) < 16) scanY--;
                    if (terrain.isSolid(scanX, scanY)) impassable = true;
                    if (scanY < highestPoint) highestPoint = scanY;
                }
                if (!impassable && terrain.canFit(targetX, highestPoint)) {
                    let dy = this.y - highestPoint;
                    let angle = Math.atan2(dy, Math.abs(intendedVx)) * (180 / Math.PI);
                    if (angle >= 83) this.vx = 0;
                    else if (angle >= 75) this.vx = intendedVx * 0.5;
                    else this.vx = intendedVx;
                    if (this.vx !== 0) {
                        this.x += this.vx;
                        let snapLimit = 20;
                        while ((terrain.isSolid(this.x, this.y) || terrain.isSolid(this.x - 1, this.y) || terrain.isSolid(this.x + 1, this.y)) && snapLimit > 0) { this.y--; snapLimit--; }
                    }
                } else this.vx = 0;
            }

            // Gravity
            if (!this.onGround) {
                this.vy += GRAVITY;
                if (this.input.down) this.vy = FAST_FALL_SPEED;
                else if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;
            } else { this.vy = 0; this.jumps = 0; this.jumpSequenceEnded = false; }

            // Jumping
            if (this.input.jump && !this.jumpSequenceEnded && this.recoilRemaining <= 0) {
                this.jumpHoldTimer++;
                if (this.jumpHoldTimer === 1 && this.jumps < 2) {
                    soundEvents.push({ id: 'JUMP', x: this.x, y: this.y });
                    this.vy = (JUMP_POWER * this.jumpMod);
                    this.jumps++;
                    this.onGround = false;
                    if (this.jumps > 1) this.highestY = this.y - ((this.y - this.highestY) / 2);
                } else if (this.jumpHoldTimer > 10 && this.jumps === 1) {
                    this.vy = (HIGH_JUMP_POWER * this.jumpMod);
                    this.jumpSequenceEnded = true;
                }
            } else this.jumpHoldTimer = 0;
            if (!this.input.jump && this.onGround) this.jumpHoldTimer = 0;

            // Vertical collision
            let steps = Math.abs(this.vy), dirY = Math.sign(this.vy);
            let currentlyEmbedded = terrain.isSolid(this.x, this.y) || terrain.isSolid(this.x, this.y - 6);

            for (let i = 0; i < steps; i++) {
                let checkY = (dirY === -1) ? (this.y - 6 + dirY) : (this.y + dirY);
                let solid = terrain.isSolid(this.x, checkY) || terrain.isSolid(this.x - 1, checkY) || terrain.isSolid(this.x + 1, checkY);
                if (dirY === -1 && solid) {
                    let thickness = 0, testY = checkY;
                    while ((terrain.isSolid(this.x, testY) || terrain.isSolid(this.x - 1, testY) || terrain.isSolid(this.x + 1, testY)) && thickness <= 15) { testY--; thickness++; }
                    if (thickness <= 15) {
                        solid = false;
                        if (!this.isPhasing) { this.isPhasing = true; this.vy *= 0.75; steps = Math.abs(this.vy); }
                    } else this.isPhasing = false;
                } else if (dirY === 1 && solid) { if (currentlyEmbedded) solid = false; }
                if (!solid) { this.y += dirY; currentlyEmbedded = terrain.isSolid(this.x, this.y) || terrain.isSolid(this.x, this.y - 6); }
                else { this.vy = 0; break; }
            }
            if (!terrain.isSolid(this.x, this.y) && !terrain.isSolid(this.x, this.y - 6)) this.isPhasing = false;

            if (this.y >= terrain.height - 1) { this.y = terrain.height - 1; this.vy = 0; this.onGround = true; }

            // Fall damage
            if (this.vy > 0 && this.y < this.highestY) this.highestY = this.y;
            if (!prevOnGround && this.onGround) {
                let fallDist = this.y - this.highestY;
                if (fallDist >= 150) {
                    let dmg = (15 + ((Math.min(fallDist, 300) - 150) / 150) * 30) * 0.5;
                    this.takeDamage(dmg, 0, players);
                    soundEvents.push({ id: 'HURT', x: this.x, y: this.y });
                }
                this.highestY = this.y;
            } else if (this.onGround) this.highestY = this.y;
        }

        // Track distance
        this.roundStats.distanceTraveled += Math.abs(this.x - prevX);

        // Weapon switching (edge-triggered)
        if (this.input.switch) {
            if (!this.switchLatched && this.inventory.length > 0) {
                this.currentWeaponIndex = (this.currentWeaponIndex + 1) % this.inventory.length;
                this.switchLatched = true;
            }
        } else this.switchLatched = false;

        // Primary fire (edge-triggered)
        if (this.input.primary && this.freezeTimer <= 0) {
            if (!this.primaryLatched) {
                this.firePrimary(terrain, players, projectiles, soundEvents, visualEvents, rng, frameCount);
                this.primaryLatched = true;
            }
        } else this.primaryLatched = false;

        // Secondary fire
        if (this.input.secondary && this.freezeTimer <= 0) {
            if (this.inventory.length > 0) {
                let wpn = this.inventory[this.currentWeaponIndex].weapon;
                if (!this.secondaryLatched || wpn.id === 'MINIGUN') {
                    if (wpn.id !== 'MINIGUN' || frameCount % 3 === 0) {
                        this.fireSecondary(terrain, players, projectiles, crates, creatures, soundEvents, visualEvents, rng, frameCount);
                    }
                    this.secondaryLatched = true;
                }
            }
        } else this.secondaryLatched = false;

        // Crate pickup
        for (let i = crates.length - 1; i >= 0; i--) {
            let c = crates[i];
            if (Math.abs(this.x - c.x) < 8 && Math.abs(this.y - 3 - c.y) < 8) {
                let drop = LOOT_POOL[rng.nextInt(LOOT_POOL.length)];
                soundEvents.push({ id: 'PICKUP', x: this.x, y: this.y });
                this.inventory.push({ weapon: drop, ammo: drop.maxAmmo });
                this.roundStats.cratesCollected++;
                // Notify clients which weapon was picked up
                visualEvents.push({ type: 'CRATE_PICKUP', crateId: c.id, playerId: this.id, weaponId: drop.id });
                crates.splice(i, 1);
            }
        }
        if (this.x < 2) this.x = 2;
        if (this.x > terrain.width - 2) this.x = terrain.width - 2;
    }

    firePrimary(terrain, players, projectiles, soundEvents, visualEvents, rng, frameCount) {
        soundEvents.push({ id: 'RIFLE', x: this.x, y: this.y });
        this.roundStats.shotsFired++;
        projectiles.push({ owner: this.id, x: this.x + (this.facing * 3), y: this.y - 3, vx: this.facing * 6, vy: 0, weapon: WEAPONS.RIFLE, ammoHealth: WEAPONS.RIFLE.ammoHealth, distance: 0 });
    }

    fireSecondary(terrain, players, projectiles, crates, creatures, soundEvents, visualEvents, rng, frameCount) {
        if (this.inventory.length === 0) return;
        let item = this.inventory[this.currentWeaponIndex];
        let wpn = item.weapon;
        let consumeItem = true;
        this.roundStats.shotsFired++;

        soundEvents.push({ id: wpn.id, x: this.x, y: this.y });

        if (wpn.type === 'EVENT') {
            if (wpn.id === 'AIRSTRIKE') {
                // Return the event to be created externally
                visualEvents.push({ type: 'CREATE_AIRSTRIKE', ownerId: this.id, playerX: this.x });
            }
            if (wpn.id === 'BOULDER') {
                visualEvents.push({ type: 'CREATE_BOULDER' });
            }
            if (wpn.id === 'LIGHTNING') {
                visualEvents.push({ type: 'CREATE_LIGHTNING', ownerId: this.id });
            }
            if (wpn.id === 'TOXIC_FART') {
                visualEvents.push({ type: 'CREATE_TOXIC', ownerId: this.id, x: this.x, y: this.y });
            }
            if (wpn.id === 'FREEZER') {
                visualEvents.push({ type: 'FREEZE_BLAST', x: this.x, y: this.y, frames: 10 });
                for (const p of players) {
                    if (p.id !== this.id && p.health > 0 && Math.hypot(p.x - this.x, p.y - this.y) <= 25) {
                        p.freezeTimer = 420;
                    }
                }
            }
        } else if (wpn.type === 'TRAP') {
            let pX = this.x + (this.facing * 8); let pY = this.y;
            while (pY < terrain.height && !terrain.isSolid(pX, pY)) pY++;
            visualEvents.push({ type: 'CREATE_TRAP', trapType: wpn.id, x: pX, y: pY - 1, ownerId: this.id });
        } else if (wpn.type === 'CONSTRUCT') {
            let pX = this.x + (this.facing * 10);
            if (wpn.id === 'TOWER') {
                let pY = this.y;
                while (pY < terrain.height && !terrain.isSolid(pX, pY)) pY++;
                visualEvents.push({ type: 'CREATE_CONSTRUCT', constructType: wpn.id, x: pX, y: pY - 1, facing: this.facing, ownerId: this.id });
            } else if (wpn.id === 'PLASMA') {
                visualEvents.push({ type: 'CREATE_CONSTRUCT', constructType: wpn.id, x: pX, y: this.y, facing: this.facing, ownerId: this.id });
            }
        } else if (wpn.type === 'POWER') {
            let maxHP = this.startHealth;
            if (wpn.id === 'HEAL') {
                let healAmt = Math.floor(maxHP * 0.15);
                this.health = Math.min(maxHP, this.health + healAmt);
                visualEvents.push({ type: 'TEXT', text: '+' + healAmt, color: '#0F0', x: this.x, y: this.y - 10, frames: 40 });
            } else if (wpn.id === 'TELEPORT') {
                this.x = 20 + rng.next() * (terrain.width - 40);
                let safeTop = terrain.getSafeDropY(this.x); let groundY = safeTop;
                while (groundY < terrain.height - 1 && !terrain.isSolid(this.x, groundY)) groundY++;
                this.y = groundY - 2; this.vy = 0; this.highestY = this.y;
                visualEvents.push({ type: 'TEXT', text: 'ZAP!', color: '#00F', x: this.x, y: this.y - 10, frames: 40 });
                soundEvents.push({ id: 'TELEPORT', x: this.x, y: this.y });
            } else if (wpn.id === 'MEGA_SPEED') {
                this.speedMod = 2; this.buffTimer = 1800;
                visualEvents.push({ type: 'TEXT', text: 'SPEEDx2', color: '#F0F', x: this.x, y: this.y - 10, frames: 40 });
            } else if (wpn.id === 'MEGA_JUMP') {
                this.jumpMod = 1.5; this.buffTimer = 1800;
                visualEvents.push({ type: 'TEXT', text: 'JUMPx2', color: '#A0A', x: this.x, y: this.y - 10, frames: 40 });
            } else if (wpn.id === 'VOODOO') {
                this.voodooTimer = 600;
                visualEvents.push({ type: 'TEXT', text: 'VOODOO', color: '#A00', x: this.x, y: this.y - 10, frames: 40 });
            } else if (wpn.id === 'CLOAKER') {
                this.cloakTimer = 630;
                visualEvents.push({ type: 'TEXT', text: 'CLOAK', color: '#555', x: this.x, y: this.y - 10, frames: 40 });
            } else if (wpn.id === 'REAR_TURRET') {
                this.rearTurretTimer = 1800;
                visualEvents.push({ type: 'TEXT', text: 'TURRET', color: '#888', x: this.x, y: this.y - 10, frames: 40 });
            } else if (wpn.id === 'SUPERBRIDGE') {
                let startX = this.x + (this.facing === 1 ? 4 : -204);
                let bridgeY = Math.floor(this.y + 2);
                terrain.buildBridge(startX, bridgeY, 200);
            } else if (wpn.id === 'STEAL') {
                let closest = null, minDist = Infinity;
                for (const p of players) {
                    if (p.id !== this.id && p.health > 0) {
                        let dist = Math.hypot(p.x - this.x, p.y - this.y);
                        if (dist < minDist) { minDist = dist; closest = p; }
                    }
                }
                if (closest && closest.inventory.length > 0) {
                    let stealCount = Math.min(3, closest.inventory.length);
                    for (let i = 0; i < stealCount; i++) {
                        let randIdx = rng.nextInt(closest.inventory.length);
                        let stolenItem = closest.inventory.splice(randIdx, 1)[0];
                        this.inventory.push(stolenItem);
                    }
                    if (closest.currentWeaponIndex >= closest.inventory.length) closest.currentWeaponIndex = 0;
                    visualEvents.push({ type: 'TEXT', text: 'STOLEN!', color: '#90F', x: closest.x, y: closest.y - 10, frames: 40 });
                } else {
                    consumeItem = false;
                    visualEvents.push({ type: 'TEXT', text: 'FAILED', color: '#888', x: this.x, y: this.y - 10, frames: 40 });
                }
            }
        } else if (wpn.type === 'CREATURE') {
            if (wpn.id === 'SHEEP') {
                for (let i = 0; i < 10; i++) {
                    let initFacing = rng.next() > 0.5 ? 1 : -1;
                    let sX = this.x + (initFacing * (5 + rng.next() * 15));
                    let sY = this.y - (rng.next() * 15);
                    visualEvents.push({ type: 'CREATE_CREATURE', creatureType: wpn.id, x: sX, y: sY, facing: initFacing, ownerId: this.id });
                }
            } else {
                visualEvents.push({ type: 'CREATE_CREATURE', creatureType: wpn.id, x: this.x + (this.facing * 5), y: this.y, facing: this.facing, ownerId: this.id });
            }
        } else if (wpn.type === 'INSTANT' && wpn.id === 'LASER') {
            let lx = this.x + this.facing * 5; let ly = this.y - 3;
            while (lx >= 0 && lx <= terrain.width) {
                terrain.destroyPixel(lx, ly);
                terrain.destroyPixel(lx, ly - 1);
                terrain.destroyPixel(lx, ly + 1);
                for (const p of players) {
                    if (p.id !== this.id && p.health > 0 && Math.hypot(p.x - lx, (p.y - 3) - ly) < 4) {
                        p.takeDamage(27, this.id, players);
                    }
                }
                lx += this.facing;
            }
            // Track laser delta as a line
            terrain.deltas.push({ type: 'laser', x: this.x + this.facing * 5, y: ly, facing: this.facing });
            visualEvents.push({ type: 'LASER', x: this.x + this.facing * 5, y: ly, facing: this.facing, frames: 5, color: '#F0F' });
        } else if (wpn.id === 'SHOTGUN') {
            projectiles.push({ owner: this.id, x: this.x + (this.facing * 3), y: this.y - 3, vx: this.facing * 6, vy: -1, weapon: wpn, ammoHealth: wpn.ammoHealth, distance: 0 });
            projectiles.push({ owner: this.id, x: this.x + (this.facing * 3), y: this.y - 3, vx: this.facing * 6, vy: 0, weapon: wpn, ammoHealth: wpn.ammoHealth, distance: 0 });
            projectiles.push({ owner: this.id, x: this.x + (this.facing * 3), y: this.y - 3, vx: this.facing * 6, vy: 1, weapon: wpn, ammoHealth: wpn.ammoHealth, distance: 0 });
            if (wpn.recoil > 0) this.recoilRemaining = wpn.recoil;
        } else if (wpn.id === 'SPREADFIRE') {
            for (let a = -2; a <= 2; a++) {
                projectiles.push({ owner: this.id, x: this.x + (this.facing * 3), y: this.y - 3, vx: this.facing * 6, vy: a, weapon: wpn, ammoHealth: wpn.ammoHealth, distance: 0 });
            }
        } else {
            let projVy = wpn.gravity ? -2 : 0;
            projectiles.push({ owner: this.id, x: this.x + (this.facing * 3), y: this.y - 3, vx: this.facing * 6, vy: projVy, weapon: wpn, ammoHealth: wpn.ammoHealth, distance: 0, frames: 0 });
            if (wpn.recoil > 0) this.recoilRemaining = wpn.recoil;
        }

        if (consumeItem && item.ammo !== Infinity) {
            item.ammo--;
            if (item.ammo <= 0) {
                this.inventory.splice(this.currentWeaponIndex, 1);
                if (this.currentWeaponIndex >= this.inventory.length) this.currentWeaponIndex = 0;
            }
        }
    }

    takeDamage(amt, attackerId, players) {
        if (this.voodooTimer > 0) {
            let attacker = players.find(p => p.id === attackerId);
            if (attacker && attacker.id !== this.id) {
                attacker.takeDamage(amt, 0, players);
            }
            return;
        }

        let maxHP = this.startHealth;
        let getTier = (h) => { if (h > maxHP * 0.7) return 3; if (h > maxHP * 0.3) return 2; if (h > 0) return 1; return 0; };
        let oldTier = getTier(this.health);

        this.health -= amt;

        // Track stats
        if (attackerId > 0 && attackerId !== this.id) {
            let attacker = players.find(p => p.id === attackerId);
            if (attacker) { attacker.roundStats.totalDamage += amt; attacker.roundStats.shotsHit++; }
        }
        if (attackerId === 0 || attackerId === this.id) {
            this.roundStats.damageToSelf += amt;
        }

        let newTier = getTier(this.health);

        if (this.health <= 0) {
            this.health = 0; this.lives = 0;
            this.inventory = []; this.currentWeaponIndex = 0;
            this.speedMod = 1; this.jumpMod = 1; this.buffTimer = 0;
            // Track kill
            if (attackerId > 0) {
                let attacker = players.find(p => p.id === attackerId);
                if (attacker) attacker.roundStats.killCount++;
            }
        } else if (newTier < oldTier && oldTier > 1) {
            this.inventory = []; this.currentWeaponIndex = 0;
            this.speedMod = 1; this.jumpMod = 1; this.buffTimer = 0;
        }
    }

    serialize() {
        return {
            id: this.id,
            x: Math.round(this.x * 10) / 10,
            y: Math.round(this.y * 10) / 10,
            vx: Math.round(this.vx * 10) / 10,
            vy: Math.round(this.vy * 10) / 10,
            health: Math.round(this.health),
            facing: this.facing,
            color: this.color,
            onGround: this.onGround,
            inventory: this.inventory.map(item => ({ id: item.weapon.id, ammo: item.ammo })),
            currentWeaponIndex: this.currentWeaponIndex,
            voodooTimer: this.voodooTimer > 0 ? 1 : 0,
            freezeTimer: this.freezeTimer > 0 ? 1 : 0,
            cloakTimer: this.cloakTimer > 0 ? 1 : 0,
            rearTurretTimer: this.rearTurretTimer > 0 ? 1 : 0,
            speedMod: this.speedMod,
            jumpMod: this.jumpMod,
        };
    }
}

module.exports = PlayerSim;
