// ===== SHARED CONSTANTS (extracted from index_v2.html) =====

const GRAVITY = 0.209;
const MOVE_SPEED = 1.76;
const MAX_FALL_SPEED = 8;
const FAST_FALL_SPEED = 12;
const JUMP_POWER = -3.7;
const HIGH_JUMP_POWER = -3.94;
const OFFSET = 15;

const WEAPONS = {
    RIFLE:       { id: 'RIFLE',       color: '#FFF', damage: 5,  ammoHealth: 1, range: 200, terrainRadius: 1, playerRadius: 1, gravity: false, recoil: 0, maxAmmo: Infinity, sx: 56, sy: 24, type: 'GUN' },
    SHOTGUN:     { id: 'SHOTGUN',     color: '#AAA', damage: 23, ammoHealth: 2, range: 80,  terrainRadius: 1, playerRadius: 1, gravity: false, recoil: 25, maxAmmo: 8, sx: 0, sy: 0, type: 'GUN' },
    BAZOOKA:     { id: 'BAZOOKA',     color: '#F00', damage: 45, ammoHealth: 3, range: 400, terrainRadius: 12, playerRadius: 17, gravity: false, recoil: 15, maxAmmo: 5, sx: 8, sy: 0, type: 'GUN' },
    GRENADE:     { id: 'GRENADE',     color: '#0F0', damage: 27, ammoHealth: 3, range: 200, terrainRadius: 12, playerRadius: 17, gravity: true,  recoil: 0, maxAmmo: 3, sx: 16, sy: 0, type: 'GUN' },
    MINIGUN:     { id: 'MINIGUN',     color: '#CCC', damage: 11, ammoHealth: 1, range: 350, terrainRadius: 1, playerRadius: 1, gravity: false, recoil: 3,  maxAmmo: 45, sx: 24, sy: 0, type: 'GUN' },
    SPREADFIRE:  { id: 'SPREADFIRE',  color: '#FF0', damage: 36, ammoHealth: 1, range: 50,  terrainRadius: 1, playerRadius: 1, gravity: false, recoil: 0,  maxAmmo: 25, sx: 32, sy: 0, type: 'GUN' },
    HOMING:      { id: 'HOMING',      color: '#F55', damage: 45, ammoHealth: 1, range: 600, terrainRadius: 12, playerRadius: 17, gravity: false, recoil: 5,  maxAmmo: 3, sx: 40, sy: 0, type: 'SPECIAL' },
    BOOMERANG:   { id: 'BOOMERANG',   color: '#0FF', damage: 18, ammoHealth: 99, range: 300, terrainRadius: 1, playerRadius: 5, gravity: false, recoil: 0,  maxAmmo: 1, sx: 48, sy: 0, type: 'SPECIAL' },
    CLUSTER:     { id: 'CLUSTER',     color: '#F80', damage: 16, ammoHealth: 1, range: 200, terrainRadius: 12, playerRadius: 17, gravity: true,  recoil: 0, maxAmmo: 2, sx: 56, sy: 0, type: 'SPECIAL' },
    BOMBLET:     { id: 'BOMBLET',     color: '#FF0', damage: 16, ammoHealth: 1, range: 100, terrainRadius: 12, playerRadius: 17, gravity: true,  recoil: 0, maxAmmo: 0, type: 'GUN' },
    LASER:       { id: 'LASER',       color: '#F0F', maxAmmo: 2, type: 'INSTANT', sx: 0, sy: 8 },
    TOXIC_FART:  { id: 'TOXIC_FART',  color: '#0A0', maxAmmo: 1, type: 'EVENT', sx: 8, sy: 8 },
    AIRSTRIKE:   { id: 'AIRSTRIKE',   color: '#F50', maxAmmo: 1, type: 'EVENT', sx: 16, sy: 8 },
    BOULDER:     { id: 'BOULDER',     color: '#888', maxAmmo: 1, type: 'EVENT', sx: 24, sy: 8 },
    LIGHTNING:   { id: 'LIGHTNING',    color: '#FF0', maxAmmo: 1, type: 'EVENT', sx: 32, sy: 8 },
    FREEZER:     { id: 'FREEZER',     color: '#0FF', maxAmmo: 1, type: 'EVENT', sx: 40, sy: 8 },
    MINE:        { id: 'MINE',        color: '#333', maxAmmo: 1, type: 'TRAP', sx: 48, sy: 8 },
    FAKE:        { id: 'FAKE',        color: '#8B4513', maxAmmo: 1, type: 'TRAP', sx: 56, sy: 8 },
    TOWER:       { id: 'TOWER',       color: '#666', maxAmmo: 1, type: 'CONSTRUCT', sx: 0, sy: 16 },
    PLASMA:      { id: 'PLASMA',      color: '#0FF', maxAmmo: 1, type: 'CONSTRUCT', sx: 8, sy: 16 },
    SHEEP:       { id: 'SHEEP',       color: '#FFF', maxAmmo: 1, type: 'CREATURE', sx: 16, sy: 16 },
    ANT:         { id: 'ANT',         color: '#A22', maxAmmo: 1, type: 'CREATURE', sx: 24, sy: 16 },
    HOLOTROOPER: { id: 'HOLOTROOPER', color: '#55F', maxAmmo: 1, type: 'CREATURE', sx: 32, sy: 16 },
    GHOST:       { id: 'GHOST',       color: '#88F', maxAmmo: 1, type: 'CREATURE', sx: 40, sy: 16 },
    HEAL:        { id: 'HEAL',        color: '#0F0', maxAmmo: 1, type: 'POWER', sx: 48, sy: 16 },
    SUPERBRIDGE: { id: 'SUPERBRIDGE', color: '#0FF', maxAmmo: 1, type: 'POWER', sx: 56, sy: 16 },
    STEAL:       { id: 'STEAL',       color: '#90F', maxAmmo: 1, type: 'POWER', sx: 0, sy: 24 },
    TELEPORT:    { id: 'TELEPORT',    color: '#00F', maxAmmo: 1, type: 'POWER', sx: 8, sy: 24 },
    MEGA_SPEED:  { id: 'MEGA_SPEED',  color: '#F0F', maxAmmo: 1, type: 'POWER', sx: 16, sy: 24 },
    MEGA_JUMP:   { id: 'MEGA_JUMP',   color: '#A0A', maxAmmo: 1, type: 'POWER', sx: 24, sy: 24 },
    VOODOO:      { id: 'VOODOO',      color: '#A00', maxAmmo: 1, type: 'POWER', sx: 32, sy: 24 },
    CLOAKER:     { id: 'CLOAKER',     color: '#555', maxAmmo: 1, type: 'POWER', sx: 40, sy: 24 },
    REAR_TURRET: { id: 'REAR_TURRET', color: '#888', maxAmmo: 1, type: 'POWER', sx: 48, sy: 24 }
};

const LOOT_POOL = Object.values(WEAPONS).filter(w => w.id !== 'RIFLE' && w.id !== 'BOMBLET');

const SPAWN_X_FRACTIONS = [0.2, 0.8, 0.4, 0.6];

module.exports = {
    GRAVITY, MOVE_SPEED, MAX_FALL_SPEED, FAST_FALL_SPEED,
    JUMP_POWER, HIGH_JUMP_POWER, OFFSET,
    WEAPONS, LOOT_POOL, SPAWN_X_FRACTIONS
};
