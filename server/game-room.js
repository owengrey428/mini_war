// ===== GAME ROOM - Server-Side Game Simulation =====
const { S2C } = require('./protocol');
const { decodeInput } = require('./protocol');
const Terrain = require('./simulation/terrain');
const { generateMap } = require('./simulation/map-generator');
const PlayerSim = require('./simulation/player-sim');
const SeededRandom = require('./simulation/seeded-random');
const { ToxicCloud, Construct, Trap, Creature, AirstrikeEvent, LightningEvent, Boulder } = require('./simulation/entity-sim');
const { GRAVITY, WEAPONS, LOOT_POOL, SPAWN_X_FRACTIONS } = require('./simulation/shared-constants');

const DEFAULT_SETTINGS = {
    startHealth: 500,
    crateInterval: 300,
    arenaScale: 1,
    seriesMode: 'single',
    mapSelectionMode: 'random',
    playerColors: ['#00C3FF', '#FF3333', '#FFD700', '#FF00FF'],
};

class GameRoom {
    constructor(code, settings) {
        this.code = code;
        this.settings = { ...DEFAULT_SETTINGS, ...settings };
        this.players = []; // { ws, name, isHost, ready, color, slot }
        this.isRunning = false;
        this.tickInterval = null;
        this.broadcastInterval = null;

        // Game state
        this.terrain = null;
        this.simPlayers = [];
        this.projectiles = [];
        this.crates = [];
        this.boulders = [];
        this.activeEvents = [];
        this.traps = [];
        this.creatures = [];
        this.constructs = [];
        this.frameCount = 0;
        this.rng = null;
        this.crateIdCounter = 0;

        // AFK detection: auto-end if no movement for 45 seconds (2700 frames at 60Hz)
        this.afkFrameLimit = 2700;
        this.lastMovementFrame = 0;
        this.lastPlayerPositions = [];

        // Series state
        this.gameState = {
            mode: 'single',
            currentRound: 0,
            roundsNeeded: 1,
            wins: {},
            lastLoser: 0,
        };
    }

    addPlayer(ws, name, isHost) {
        const slot = this.players.length;
        this.players.push({
            ws,
            name,
            isHost,
            ready: isHost, // Host is always ready
            color: this.settings.playerColors[slot] || '#FFF',
            slot,
        });
    }

    removePlayer(ws) {
        const idx = this.players.findIndex(p => p.ws === ws);
        if (idx === -1) return -1;

        const slot = idx;
        this.players.splice(idx, 1);

        // If the host left, assign new host
        if (this.players.length > 0 && !this.players.some(p => p.isHost)) {
            this.players[0].isHost = true;
            this.players[0].ready = true;
        }

        // If game was running and not enough players, end it
        if (this.isRunning && this.players.length < 2) {
            this.stop();
        }

        return slot;
    }

    updateSettings(settings) {
        this.settings = { ...this.settings, ...settings };
    }

    startGame() {
        const seed = Math.floor(Math.random() * 100000);
        this.rng = new SeededRandom(seed);

        const arenaW = Math.floor(320 * this.settings.arenaScale);
        const arenaH = Math.floor(200 * this.settings.arenaScale);

        // Generate terrain
        this.terrain = new Terrain(arenaW, arenaH);
        const mapInfo = generateMap(this.terrain, seed);

        // Reset game state
        this.resetGameState();

        // Create simulation players
        this.simPlayers = [];
        for (let i = 0; i < this.players.length; i++) {
            const spawnX = Math.floor(arenaW * SPAWN_X_FRACTIONS[i]);
            const spawnY = 20;
            const color = this.players[i].color || this.settings.playerColors[i];
            const p = new PlayerSim(i + 1, spawnX, spawnY, color, this.settings.startHealth);
            this.simPlayers.push(p);
        }

        // Position players on terrain
        for (const p of this.simPlayers) {
            let s = this.terrain.getSafeDropY(p.x);
            while (s < arenaH - 1 && !this.terrain.isSolid(p.x, s)) s++;
            p.y = s - 2;
            p.highestY = p.y;
        }

        // Reset entities
        this.projectiles = [];
        this.crates = [];
        this.boulders = [];
        this.activeEvents = [];
        this.traps = [];
        this.creatures = [];
        this.constructs = [];
        this.frameCount = 0;
        this.lastMovementFrame = 0;
        this.lastPlayerPositions = [];
        this.crateIdCounter = 0;

        // Compress terrain for sending
        const terrainData = this.terrain.compress();

        // Notify all players
        for (let i = 0; i < this.players.length; i++) {
            this.send(this.players[i].ws, {
                type: S2C.GAME_START,
                yourSlot: i,
                playerId: i + 1,
                terrain: terrainData,
                arenaW,
                arenaH,
                settings: this.settings,
                seed,
                mapInfo,
                playerCount: this.players.length,
                playerColors: this.players.map(p => p.color),
            });
        }

        this.isRunning = true;

        // Start simulation at 60Hz
        this.tickInterval = setInterval(() => this.tick(), 1000 / 60);

        // Broadcast state at 30Hz
        this.broadcastInterval = setInterval(() => this.broadcastState(), 1000 / 30);
    }

    resetGameState() {
        this.gameState.mode = this.settings.seriesMode;
        this.gameState.currentRound = 0;
        this.gameState.wins = {};
        this.gameState.lastLoser = 0;
        if (this.gameState.mode === 'single') this.gameState.roundsNeeded = 1;
        else if (this.gameState.mode === 'bo3') this.gameState.roundsNeeded = 2;
        else if (this.gameState.mode === 'bo5') this.gameState.roundsNeeded = 3;
        else if (this.gameState.mode === 'gauntlet') this.gameState.roundsNeeded = 15;
    }

    handleInput(ws, inputMask) {
        const idx = this.players.findIndex(p => p.ws === ws);
        if (idx === -1 || idx >= this.simPlayers.length) return;

        const input = decodeInput(inputMask);
        this.simPlayers[idx].setInput(input);
    }

    tick() {
        if (!this.isRunning) return;
        this.frameCount++;

        const soundEvents = [];
        const visualEvents = [];

        // Crate spawning
        let crateInt = this.settings.crateInterval;
        if (this.frameCount % crateInt === 0) this.spawnCrate();
        if (this.frameCount % (crateInt * 12) === 0) { for (let i = 0; i < 4; i++) this.spawnCrate(); }

        // Crate physics
        for (const c of this.crates) {
            if (c.y >= this.terrain.height - 5) { c.y = this.terrain.height - 5; c.vy = 0; }
            else if (!this.terrain.isSolid(c.x, c.y + 4)) { c.vy += GRAVITY; c.y += c.vy; }
            else { c.vy = 0; }
        }

        // Update events
        for (let i = this.activeEvents.length - 1; i >= 0; i--) {
            let alive;
            const ev = this.activeEvents[i];
            if (ev instanceof AirstrikeEvent) {
                alive = ev.update(this.terrain, this.simPlayers, this.projectiles, soundEvents, this.rng);
            } else if (ev instanceof LightningEvent) {
                alive = ev.update(this.terrain, this.simPlayers, visualEvents, soundEvents, this.rng);
            } else {
                alive = ev.update(this.terrain, this.simPlayers, soundEvents);
            }
            if (!alive) this.activeEvents.splice(i, 1);
        }

        // Update boulders
        for (let i = this.boulders.length - 1; i >= 0; i--) {
            this.boulders[i].update(this.terrain, this.simPlayers, soundEvents);
            if (!this.boulders[i].active) this.boulders.splice(i, 1);
        }

        // Update creatures
        for (let i = this.creatures.length - 1; i >= 0; i--) {
            this.creatures[i].update(this.terrain, this.simPlayers, this.projectiles, visualEvents, soundEvents, this.creatures);
            if (!this.creatures[i].active) {
                // Check if a sheep was killed
                const cr = this.creatures[i];
                if (cr.type === 'SHEEP' && cr.hp <= 0) {
                    // Sheep kill health bonus handled in projectile collision
                }
                this.creatures.splice(i, 1);
            }
        }

        // Update traps
        for (let i = this.traps.length - 1; i >= 0; i--) {
            this.traps[i].update(this.terrain, this.simPlayers, soundEvents);
            if (!this.traps[i].active) this.traps.splice(i, 1);
        }

        // Update constructs
        for (let i = this.constructs.length - 1; i >= 0; i--) {
            this.constructs[i].update(this.terrain, this.simPlayers, this.projectiles, soundEvents);
            if (!this.constructs[i].active) this.constructs.splice(i, 1);
        }

        // Projectile updates
        this.updateProjectiles(soundEvents, visualEvents);

        // Player updates
        for (const p of this.simPlayers) {
            p.update(this.terrain, this.simPlayers, this.projectiles, this.crates, this.creatures, soundEvents, visualEvents, this.rng, this.frameCount);
        }

        // Process entity creation events from player actions
        for (const ev of visualEvents) {
            if (ev.type === 'CREATE_AIRSTRIKE') {
                this.activeEvents.push(new AirstrikeEvent(ev.ownerId, ev.playerX, this.terrain.width, this.rng));
            } else if (ev.type === 'CREATE_BOULDER') {
                this.boulders.push(new Boulder(this.terrain, this.rng));
            } else if (ev.type === 'CREATE_LIGHTNING') {
                this.activeEvents.push(new LightningEvent(ev.ownerId, this.rng));
            } else if (ev.type === 'CREATE_TOXIC') {
                this.activeEvents.push(new ToxicCloud(ev.x, ev.y, ev.ownerId));
            } else if (ev.type === 'CREATE_TRAP') {
                this.traps.push(new Trap(ev.trapType, ev.x, ev.y, ev.ownerId));
            } else if (ev.type === 'CREATE_CONSTRUCT') {
                this.constructs.push(new Construct(ev.constructType, ev.x, ev.y, ev.facing, ev.ownerId));
            } else if (ev.type === 'CREATE_CREATURE') {
                this.creatures.push(new Creature(ev.creatureType, ev.x, ev.y, ev.facing, ev.ownerId, this.rng));
            }
        }

        // Store events for next broadcast
        this.pendingSoundEvents = (this.pendingSoundEvents || []).concat(soundEvents);
        this.pendingVisualEvents = (this.pendingVisualEvents || []).concat(
            visualEvents.filter(v => !v.type.startsWith('CREATE_'))
        );
        this.pendingTerrainDeltas = (this.pendingTerrainDeltas || []).concat(this.terrain.deltas);
        this.terrain.clearDeltas();

        // AFK detection: check if any alive player has moved
        let anyMoved = false;
        let alivePlayers = this.simPlayers.filter(p => p.health > 0);
        for (let i = 0; i < this.simPlayers.length; i++) {
            let p = this.simPlayers[i];
            if (p.health <= 0) continue;
            let prev = this.lastPlayerPositions[i];
            if (!prev || Math.abs(p.x - prev.x) > 0.5 || Math.abs(p.y - prev.y) > 0.5) {
                anyMoved = true;
            }
            this.lastPlayerPositions[i] = { x: p.x, y: p.y };
        }
        if (anyMoved) this.lastMovementFrame = this.frameCount;

        // Auto-end if no movement for 45 seconds
        if (this.frameCount - this.lastMovementFrame >= this.afkFrameLimit && this.isRunning && this.frameCount > 60) {
            // Player with most health wins
            let bestHP = -1, winnerId = 0;
            for (const p of alivePlayers) {
                if (p.health > bestHP) { bestHP = p.health; winnerId = p.id; }
            }
            this.handleRoundEnd(winnerId);
            return;
        }

        // Win condition check
        if (alivePlayers.length <= 1 && this.isRunning) {
            let winnerId = alivePlayers.length === 1 ? alivePlayers[0].id : 0;
            this.handleRoundEnd(winnerId);
        }
    }

    updateProjectiles(soundEvents, visualEvents) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            let p = this.projectiles[i];
            if (p.frames !== undefined) p.frames++;
            if (p.weapon.gravity) p.vy += GRAVITY;

            // Homing
            if (p.weapon.id === 'HOMING') {
                let target = this.simPlayers.find(pl => pl.id !== p.owner && pl.health > 0);
                if (target) {
                    let desiredAng = Math.atan2((target.y - 3) - p.y, target.x - p.x);
                    let currAng = Math.atan2(p.vy, p.vx);
                    let diff = desiredAng - currAng;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    let turn = Math.max(-0.1, Math.min(0.1, diff));
                    let newAng = currAng + turn;
                    p.vx = Math.cos(newAng) * 2.8; p.vy = Math.sin(newAng) * 2.8;
                }
            }

            // Boomerang
            if (p.weapon.id === 'BOOMERANG') {
                if (p.distance > 150) p.returning = true;
                if (p.returning) {
                    let owner = this.simPlayers.find(pl => pl.id === p.owner);
                    if (owner) {
                        let ang = Math.atan2((owner.y - 3) - p.y, owner.x - p.x);
                        p.vx = Math.cos(ang) * 5; p.vy = Math.sin(ang) * 5;
                        if (Math.hypot(p.x - owner.x, p.y - owner.y) < 10) {
                            owner.inventory.push({ weapon: WEAPONS.BOOMERANG, ammo: 1 });
                            this.projectiles.splice(i, 1); continue;
                        }
                    }
                }
            }

            // Cluster
            if (p.weapon.id === 'CLUSTER' && p.frames > 45) {
                this.terrain.explode(p.x, p.y, p.weapon.terrainRadius, p.weapon.playerRadius, p.weapon.damage, p.owner, this.simPlayers, soundEvents);
                for (let c = 0; c < 5; c++) {
                    this.projectiles.push({
                        owner: p.owner, x: p.x, y: p.y,
                        vx: (this.rng.next() * 4 - 2), vy: (this.rng.next() * -3 - 1),
                        weapon: WEAPONS.BOMBLET, ammoHealth: 1, distance: 0
                    });
                }
                this.projectiles.splice(i, 1); continue;
            }

            // Movement
            let steps = Math.ceil(Math.abs(p.vx) + Math.abs(p.vy));
            let dx = p.vx / steps, dy = p.vy / steps;
            let destroyed = false, hitTerrain = false;

            for (let s = 0; s < steps; s++) {
                p.x += dx; p.y += dy; p.distance += Math.abs(dx);

                // Player hit
                let hitTarget = false;
                for (let target of this.simPlayers) {
                    if (target.id !== p.owner && target.health > 0) {
                        if (Math.abs(p.x - target.x) < 4 && Math.abs(p.y - (target.y - 3)) < 5) {
                            hitTarget = true;
                            if (p.weapon.terrainRadius <= 1) target.takeDamage(p.weapon.damage, p.owner, this.simPlayers);
                            destroyed = true; break;
                        }
                    }
                }

                // Terrain hit
                if (!hitTarget && this.terrain.isSolid(p.x, p.y)) {
                    if (p.weapon.id === 'BOOMERANG') { p.vx *= -1; p.vy *= -1; p.returning = true; break; }
                    else { hitTerrain = true; p.ammoHealth--; if (p.ammoHealth <= 0) destroyed = true; }
                }

                // Creature hit (sheep)
                if (!hitTarget) {
                    for (let cr of this.creatures) {
                        if (cr.type === 'SHEEP' && Math.hypot(p.x - cr.x, p.y - cr.y) < 8) {
                            cr.hp -= p.weapon.damage; hitTarget = true; destroyed = true;
                            if (cr.hp <= 0) {
                                let killer = this.simPlayers.find(pl => pl.id === p.owner);
                                if (killer) {
                                    killer.health = Math.min(this.settings.startHealth, killer.health + 25);
                                    killer.roundStats.sheepKilled++;
                                    visualEvents.push({ type: 'TEXT', text: '+25 HP', color: '#0F0', x: killer.x, y: killer.y - 10, frames: 40 });
                                }
                            }
                            break;
                        }
                    }
                }

                // Boulder hit
                if (!hitTarget) {
                    for (let b of this.boulders) {
                        if (Math.hypot(p.x - b.x, p.y - b.y) < b.radius) {
                            hitTarget = true; b.hp -= p.weapon.damage; destroyed = true; break;
                        }
                    }
                }

                if (p.distance >= p.weapon.range || p.x < -100 || p.x > this.terrain.width + 100 || p.y < -500 || p.y > this.terrain.height + 100) destroyed = true;

                if (destroyed) {
                    this.terrain.explode(p.x, p.y, p.weapon.terrainRadius, p.weapon.playerRadius, p.weapon.damage, p.owner, this.simPlayers, soundEvents);
                    this.projectiles.splice(i, 1); break;
                } else if (hitTerrain) {
                    this.terrain.destroyPixel(p.x, p.y);
                    this.terrain.deltas.push({ type: 'pixel', x: Math.floor(p.x), y: Math.floor(p.y) });
                    hitTerrain = false;
                }
            }
        }
    }

    spawnCrate() {
        let spawnX = 20 + this.rng.next() * (this.terrain.width - 40);
        let id = ++this.crateIdCounter;
        this.crates.push({ id, x: spawnX, y: this.terrain.getSafeDropY(spawnX), vy: 0 });
        if (this.crates.length > 15) this.crates.shift();
    }

    broadcastState() {
        if (!this.isRunning) return;

        const state = {
            type: S2C.STATE_UPDATE,
            tick: this.frameCount,
            players: this.simPlayers.map(p => p.serialize()),
            projectiles: this.projectiles.map(p => ({
                x: Math.round(p.x), y: Math.round(p.y),
                vx: Math.round(p.vx * 10) / 10, vy: Math.round(p.vy * 10) / 10,
                color: p.weapon.color, owner: p.owner,
            })),
            crates: this.crates.map(c => ({ id: c.id, x: Math.round(c.x), y: Math.round(c.y) })),
            creatures: this.creatures.map(c => c.serialize()),
            constructs: this.constructs.map(c => c.serialize()),
            traps: this.traps.map(t => t.serialize()),
            boulders: this.boulders.map(b => b.serialize()),
            events: this.activeEvents.length,
        };

        this.broadcast(state);

        // Send terrain deltas if any
        if (this.pendingTerrainDeltas && this.pendingTerrainDeltas.length > 0) {
            this.broadcast({ type: S2C.TERRAIN_DELTA, ops: this.pendingTerrainDeltas });
            this.pendingTerrainDeltas = [];
        }

        // Send sound events
        if (this.pendingSoundEvents && this.pendingSoundEvents.length > 0) {
            this.broadcast({ type: S2C.SOUND_EVENT, sounds: this.pendingSoundEvents });
            this.pendingSoundEvents = [];
        }

        // Send visual events
        if (this.pendingVisualEvents && this.pendingVisualEvents.length > 0) {
            this.broadcast({ type: S2C.VISUAL_EVENT, effects: this.pendingVisualEvents });
            this.pendingVisualEvents = [];
        }
    }

    handleRoundEnd(winnerId) {
        this.isRunning = false;
        clearInterval(this.tickInterval);
        clearInterval(this.broadcastInterval);

        // One final state broadcast
        this.broadcastState();

        if (this.gameState.mode === 'single') {
            const stats = {};
            for (const p of this.simPlayers) stats[p.id] = p.roundStats;
            this.broadcast({
                type: S2C.ROUND_END,
                winnerId,
                stats,
                isSeries: false,
            });
            return;
        }

        // Series mode
        if (winnerId > 0) this.gameState.wins[winnerId] = (this.gameState.wins[winnerId] || 0) + 1;
        this.gameState.currentRound++;

        // Accumulate stats
        for (const p of this.simPlayers) {
            for (let key in p.roundStats) {
                p.seriesStats[key] = (p.seriesStats[key] || 0) + p.roundStats[key];
            }
        }

        let seriesOver = false;
        if (this.gameState.mode === 'gauntlet') {
            seriesOver = this.gameState.currentRound >= 15;
        } else {
            seriesOver = Object.values(this.gameState.wins).some(w => w >= this.gameState.roundsNeeded);
        }

        if (seriesOver) {
            let best = 0, champId = 0;
            for (let id in this.gameState.wins) {
                if (this.gameState.wins[id] > best) { best = this.gameState.wins[id]; champId = parseInt(id); }
            }
            const stats = {};
            for (const p of this.simPlayers) stats[p.id] = p.seriesStats;
            this.broadcast({
                type: S2C.SERIES_END,
                championId: champId,
                stats,
                wins: this.gameState.wins,
            });
        } else {
            const stats = {};
            for (const p of this.simPlayers) stats[p.id] = p.roundStats;
            this.broadcast({
                type: S2C.ROUND_END,
                winnerId,
                stats,
                isSeries: true,
                round: this.gameState.currentRound,
                wins: this.gameState.wins,
                scoreText: this.simPlayers.map(p => `P${p.id}: ${this.gameState.wins[p.id] || 0}`).join('  |  '),
            });
        }
    }

    nextRound() {
        if (this.isRunning) return;

        const seed = Math.floor(this.rng.next() * 100000);
        const arenaW = Math.floor(320 * this.settings.arenaScale);
        const arenaH = Math.floor(200 * this.settings.arenaScale);

        this.terrain = new Terrain(arenaW, arenaH);
        const mapInfo = generateMap(this.terrain, seed);

        // Reset entities
        this.projectiles = [];
        this.crates = [];
        this.boulders = [];
        this.activeEvents = [];
        this.traps = [];
        this.creatures = [];
        this.constructs = [];
        this.frameCount = 0;
        this.lastMovementFrame = 0;
        this.lastPlayerPositions = [];
        this.crateIdCounter = 0;

        // Reset players for new round
        for (let i = 0; i < this.simPlayers.length; i++) {
            const p = this.simPlayers[i];
            p.resetForRound();
            p.x = Math.floor(arenaW * SPAWN_X_FRACTIONS[i]);
            let s = this.terrain.getSafeDropY(p.x);
            while (s < arenaH - 1 && !this.terrain.isSolid(p.x, s)) s++;
            p.y = s - 2;
            p.highestY = p.y;
        }

        const terrainData = this.terrain.compress();

        for (let i = 0; i < this.players.length; i++) {
            this.send(this.players[i].ws, {
                type: S2C.GAME_START,
                yourSlot: i,
                playerId: i + 1,
                terrain: terrainData,
                arenaW,
                arenaH,
                settings: this.settings,
                seed,
                mapInfo,
                playerCount: this.players.length,
                playerColors: this.players.map(p => p.color),
                isNextRound: true,
                round: this.gameState.currentRound,
            });
        }

        this.isRunning = true;
        this.pendingSoundEvents = [];
        this.pendingVisualEvents = [];
        this.pendingTerrainDeltas = [];

        this.tickInterval = setInterval(() => this.tick(), 1000 / 60);
        this.broadcastInterval = setInterval(() => this.broadcastState(), 1000 / 30);
    }

    stop() {
        this.isRunning = false;
        if (this.tickInterval) clearInterval(this.tickInterval);
        if (this.broadcastInterval) clearInterval(this.broadcastInterval);
    }

    broadcast(data) {
        const msg = JSON.stringify(data);
        for (const p of this.players) {
            if (p.ws.readyState === 1) { // OPEN
                p.ws.send(msg);
            }
        }
    }

    send(ws, data) {
        if (ws.readyState === 1) {
            ws.send(JSON.stringify(data));
        }
    }
}

module.exports = GameRoom;
