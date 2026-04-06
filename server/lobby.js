// ===== LOBBY MANAGER =====
const GameRoom = require('./game-room');
const { S2C } = require('./protocol');

class Lobby {
    constructor() {
        this.rooms = new Map(); // roomCode -> GameRoom
        this.playerRooms = new Map(); // ws -> roomCode
    }

    generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
        let code;
        do {
            code = '';
            for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
        } while (this.rooms.has(code));
        return code;
    }

    createRoom(ws, playerName, settings) {
        // Leave any existing room first
        this.leaveRoom(ws);

        const code = this.generateRoomCode();
        const room = new GameRoom(code, settings);
        room.addPlayer(ws, playerName, true); // isHost = true
        this.rooms.set(code, room);
        this.playerRooms.set(ws, code);

        this.sendRoomState(room);
        return code;
    }

    joinRoom(ws, playerName, roomCode) {
        const code = roomCode.toUpperCase();
        const room = this.rooms.get(code);

        if (!room) {
            this.send(ws, { type: S2C.ERROR, message: 'Room not found: ' + code });
            return false;
        }

        if (room.isRunning) {
            this.send(ws, { type: S2C.ERROR, message: 'Game already in progress' });
            return false;
        }

        if (room.players.length >= 4) {
            this.send(ws, { type: S2C.ERROR, message: 'Room is full (max 4 players)' });
            return false;
        }

        // Leave any existing room first
        this.leaveRoom(ws);

        room.addPlayer(ws, playerName, false);
        this.playerRooms.set(ws, code);

        // Notify all players in the room
        room.broadcast({ type: S2C.PLAYER_JOINED, name: playerName, slot: room.players.length - 1 });
        this.sendRoomState(room);
        return true;
    }

    leaveRoom(ws) {
        const code = this.playerRooms.get(ws);
        if (!code) return;

        const room = this.rooms.get(code);
        if (!room) {
            this.playerRooms.delete(ws);
            return;
        }

        const slot = room.removePlayer(ws);
        this.playerRooms.delete(ws);

        if (room.players.length === 0) {
            // Room empty, clean up
            room.stop();
            this.rooms.delete(code);
        } else {
            // Notify remaining players
            room.broadcast({ type: S2C.PLAYER_LEFT, slot });
            this.sendRoomState(room);
        }
    }

    toggleReady(ws) {
        const code = this.playerRooms.get(ws);
        if (!code) return;
        const room = this.rooms.get(code);
        if (!room) return;

        const player = room.players.find(p => p.ws === ws);
        if (player) {
            player.ready = !player.ready;
            this.sendRoomState(room);
        }
    }

    startGame(ws) {
        const code = this.playerRooms.get(ws);
        if (!code) return;
        const room = this.rooms.get(code);
        if (!room) return;

        // Only host can start
        const player = room.players.find(p => p.ws === ws);
        if (!player || !player.isHost) {
            this.send(ws, { type: S2C.ERROR, message: 'Only the host can start the game' });
            return;
        }

        // All players must be ready (except host)
        const allReady = room.players.every(p => p.isHost || p.ready);
        if (!allReady) {
            this.send(ws, { type: S2C.ERROR, message: 'All players must be ready' });
            return;
        }

        if (room.players.length < 2) {
            this.send(ws, { type: S2C.ERROR, message: 'Need at least 2 players' });
            return;
        }

        room.startGame();
    }

    handleInput(ws, inputMask) {
        const code = this.playerRooms.get(ws);
        if (!code) return;
        const room = this.rooms.get(code);
        if (!room || !room.isRunning) return;

        room.handleInput(ws, inputMask);
    }

    updateSettings(ws, settings) {
        const code = this.playerRooms.get(ws);
        if (!code) return;
        const room = this.rooms.get(code);
        if (!room) return;

        const player = room.players.find(p => p.ws === ws);
        if (!player || !player.isHost) return;

        room.updateSettings(settings);
        this.sendRoomState(room);
    }

    nextRound(ws) {
        const code = this.playerRooms.get(ws);
        if (!code) return;
        const room = this.rooms.get(code);
        if (!room) return;

        const player = room.players.find(p => p.ws === ws);
        if (!player || !player.isHost) return;

        room.nextRound();
    }

    handleChat(ws, message) {
        const code = this.playerRooms.get(ws);
        if (!code) return;
        const room = this.rooms.get(code);
        if (!room) return;

        const player = room.players.find(p => p.ws === ws);
        if (!player) return;

        room.broadcast({ type: S2C.CHAT, from: player.name, message: message.slice(0, 200) });
    }

    handleDisconnect(ws) {
        this.leaveRoom(ws);
    }

    sendRoomState(room) {
        const state = {
            type: S2C.ROOM_STATE,
            code: room.code,
            players: room.players.map((p, i) => ({
                name: p.name,
                slot: i,
                isHost: p.isHost,
                ready: p.ready,
                color: p.color || null,
            })),
            settings: room.settings,
            isRunning: room.isRunning,
        };
        room.broadcast(state);
    }

    getRoomList() {
        const list = [];
        for (const [code, room] of this.rooms) {
            if (!room.isRunning) {
                list.push({
                    code,
                    players: room.players.length,
                    maxPlayers: 4,
                    hostName: room.players.find(p => p.isHost)?.name || 'Unknown',
                });
            }
        }
        return list;
    }

    send(ws, data) {
        if (ws.readyState === 1) { // WebSocket.OPEN
            ws.send(JSON.stringify(data));
        }
    }
}

module.exports = Lobby;
