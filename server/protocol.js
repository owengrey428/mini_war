// ===== PROTOCOL - Message Types =====
const C2S = {
    JOIN_LOBBY: 'joinLobby',
    CREATE_ROOM: 'createRoom',
    JOIN_ROOM: 'joinRoom',
    LEAVE_ROOM: 'leaveRoom',
    TOGGLE_READY: 'toggleReady',
    START_GAME: 'startGame',
    INPUT: 'input',
    CHAT: 'chat',
    NEXT_ROUND: 'nextRound',
    UPDATE_SETTINGS: 'updateSettings',
};

const S2C = {
    LOBBY_STATE: 'lobbyState',
    ROOM_STATE: 'roomState',
    GAME_START: 'gameStart',
    STATE_UPDATE: 'state',
    TERRAIN_DELTA: 'terrainDelta',
    SOUND_EVENT: 'sound',
    VISUAL_EVENT: 'visual',
    CRATE_SPAWN: 'crateSpawn',
    CRATE_PICKUP: 'cratePickup',
    ROUND_END: 'roundEnd',
    SERIES_END: 'seriesEnd',
    PLAYER_JOINED: 'playerJoined',
    PLAYER_LEFT: 'playerLeft',
    CHAT: 'chat',
    ERROR: 'error',
};

// Input bitmask encoding
const INPUT_BITS = {
    LEFT: 1,
    RIGHT: 2,
    JUMP: 4,
    DOWN: 8,
    PRIMARY: 16,
    SECONDARY: 32,
    SWITCH: 64,
};

function encodeInput(keys) {
    let mask = 0;
    if (keys.left) mask |= INPUT_BITS.LEFT;
    if (keys.right) mask |= INPUT_BITS.RIGHT;
    if (keys.jump) mask |= INPUT_BITS.JUMP;
    if (keys.down) mask |= INPUT_BITS.DOWN;
    if (keys.primary) mask |= INPUT_BITS.PRIMARY;
    if (keys.secondary) mask |= INPUT_BITS.SECONDARY;
    if (keys.switch) mask |= INPUT_BITS.SWITCH;
    return mask;
}

function decodeInput(mask) {
    return {
        left: !!(mask & INPUT_BITS.LEFT),
        right: !!(mask & INPUT_BITS.RIGHT),
        jump: !!(mask & INPUT_BITS.JUMP),
        down: !!(mask & INPUT_BITS.DOWN),
        primary: !!(mask & INPUT_BITS.PRIMARY),
        secondary: !!(mask & INPUT_BITS.SECONDARY),
        switch: !!(mask & INPUT_BITS.SWITCH),
    };
}

module.exports = { C2S, S2C, INPUT_BITS, encodeInput, decodeInput };
