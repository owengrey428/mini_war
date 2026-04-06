// ===== REVIVAL MULTIPLAYER SERVER =====
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const Lobby = require('./lobby');
const { C2S } = require('./protocol');

const PORT = process.env.PORT || 3000;
const STATIC_ROOT = path.join(__dirname, '..');

// MIME types for static file serving
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ico': 'image/x-icon',
};

// HTTP Server - serves static files
const server = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index_v2.html';

    const filePath = path.join(STATIC_ROOT, urlPath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Security: prevent directory traversal
    if (!filePath.startsWith(STATIC_ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('Not Found');
            } else {
                res.writeHead(500);
                res.end('Server Error');
            }
            return;
        }
        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache',
        });
        res.end(data);
    });
});

// WebSocket Server
const wss = new WebSocketServer({ server });
const lobby = new Lobby();

wss.on('connection', (ws, req) => {
    const clientIP = req.socket.remoteAddress;
    console.log(`[CONNECT] Client connected from ${clientIP}`);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw);
        } catch (e) {
            console.error('[ERROR] Invalid JSON from client');
            return;
        }

        switch (msg.type) {
            case C2S.CREATE_ROOM:
                const code = lobby.createRoom(ws, msg.playerName || 'Player', msg.settings || {});
                console.log(`[ROOM] Created room ${code} by ${msg.playerName}`);
                break;

            case C2S.JOIN_ROOM:
                const joined = lobby.joinRoom(ws, msg.playerName || 'Player', msg.roomCode);
                if (joined) console.log(`[ROOM] ${msg.playerName} joined room ${msg.roomCode}`);
                break;

            case C2S.LEAVE_ROOM:
                lobby.leaveRoom(ws);
                break;

            case C2S.TOGGLE_READY:
                lobby.toggleReady(ws);
                break;

            case C2S.START_GAME:
                lobby.startGame(ws);
                console.log(`[GAME] Game started`);
                break;

            case C2S.INPUT:
                lobby.handleInput(ws, msg.k);
                break;

            case C2S.CHAT:
                lobby.handleChat(ws, msg.message || '');
                break;

            case C2S.NEXT_ROUND:
                lobby.nextRound(ws);
                break;

            case C2S.UPDATE_SETTINGS:
                lobby.updateSettings(ws, msg.settings || {});
                break;

            case C2S.JOIN_LOBBY:
                // Send room list
                ws.send(JSON.stringify({
                    type: 'lobbyState',
                    rooms: lobby.getRoomList(),
                }));
                break;

            default:
                console.log(`[WARN] Unknown message type: ${msg.type}`);
        }
    });

    ws.on('close', () => {
        console.log(`[DISCONNECT] Client disconnected`);
        lobby.handleDisconnect(ws);
    });

    ws.on('error', (err) => {
        console.error(`[ERROR] WebSocket error:`, err.message);
    });
});

// Heartbeat to detect dead connections
const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            lobby.handleDisconnect(ws);
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(heartbeat);
});

// Start server — bind 0.0.0.0 for container/cloud deployment
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════╗');
    console.log('  ║     REVIVAL MULTIPLAYER SERVER        ║');
    console.log('  ╠══════════════════════════════════════╣');
    console.log(`  ║  Listening on ${HOST}:${PORT}              ║`);
    console.log('  ╚══════════════════════════════════════╝');
    console.log('');
});
