import crypto from 'crypto';
import type http from 'http';
import type { Duplex } from 'stream';
import os from 'os';
import {
  getHeroPreset,
  LAN_MAX_PLAYERS,
  LanDiscoveredRoom,
  LanPlayerInfo,
  LanWireMessage,
  sanitizeLanName,
  sanitizeRoomCode,
} from '../shared/lanMultiplayer.ts';

const WS_MAGIC_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME_BYTES = 262144;

interface WsClient {
  id: string;
  socket: Duplex;
  buffer: Buffer;
  closed: boolean;
  roomId: string | null;
}

interface LanRoom {
  roomId: string;
  roomName: string;
  roomCode: string;
  hostId: string;
  sessionStarted: boolean;
  createdAtMs: number;
  clients: Map<string, { ws: WsClient; info: LanPlayerInfo }>;
}

export function getLocalIpv4Addresses(): string[] {
  const ifaces = os.networkInterfaces();
  const out: string[] = [];
  for (const name of Object.keys(ifaces)) {
    const entries = ifaces[name];
    if (!entries) continue;
    for (const info of entries) {
      if (info.family === 'IPv4' && !info.internal) {
        out.push(info.address);
      }
    }
  }
  return out;
}

function encodeWsFrame(opcode: number, payload: Buffer): Buffer {
  const len = payload.length;
  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  return Buffer.concat([header, payload]);
}

function sendWsText(client: WsClient, msg: LanWireMessage): void {
  if (client.closed || client.socket.destroyed) return;
  try {
    const payload = Buffer.from(JSON.stringify(msg), 'utf8');
    client.socket.write(encodeWsFrame(0x1, payload));
  } catch {
    client.closed = true;
  }
}

export class LanRoomServer {
  private readonly rooms = new Map<string, LanRoom>();
  private readonly clients = new Map<string, WsClient>();

  public attachToHttpServer(server: http.Server): void {
    server.on('upgrade', (req, socket, head) => {
      const urlPath = (req.url ?? '').split('?')[0];
      if (urlPath !== '/ws/lan') {
        socket.destroy();
        return;
      }

      const key = req.headers['sec-websocket-key'];
      if (typeof key !== 'string' || !key.trim()) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      const accept = crypto
        .createHash('sha1')
        .update(key.trim() + WS_MAGIC_GUID)
        .digest('base64');

      const responseHeaders = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '\r\n',
      ].join('\r\n');

      socket.write(responseHeaders);
      if ('setNoDelay' in socket && typeof (socket as { setNoDelay?: (b: boolean) => void }).setNoDelay === 'function') {
        (socket as { setNoDelay: (b: boolean) => void }).setNoDelay(true);
      }

      const client: WsClient = {
        id: `p_${crypto.randomBytes(5).toString('hex')}`,
        socket,
        buffer: head && head.length > 0 ? Buffer.from(head) : Buffer.alloc(0),
        closed: false,
        roomId: null,
      };
      this.clients.set(client.id, client);

      socket.on('data', (chunk: Buffer) => {
        if (client.closed) return;
        client.buffer = Buffer.concat([client.buffer, chunk]);
        this.drainFrames(client);
      });

      const cleanup = () => this.handleDisconnect(client);
      socket.on('close', cleanup);
      socket.on('end', cleanup);
      socket.on('error', cleanup);
    });
  }

  public listRooms(port: number): LanDiscoveredRoom[] {
    const addrs = getLocalIpv4Addresses();
    const primaryIp = addrs[0] ?? '127.0.0.1';
    const out: LanDiscoveredRoom[] = [];
    this.rooms.forEach((room) => {
      const hostEntry = room.clients.get(room.hostId);
      out.push({
        roomId: room.roomId,
        roomName: room.roomName,
        roomCode: room.roomCode,
        hostName: hostEntry?.info.name ?? 'Host',
        hostIp: primaryIp,
        port,
        playerCount: room.clients.size,
        maxPlayers: LAN_MAX_PLAYERS,
        sessionStarted: room.sessionStarted,
        transport: 'WS_LAN',
        lastSeenMs: Date.now(),
      });
    });
    return out;
  }

  private drainFrames(client: WsClient): void {
    while (client.buffer.length >= 2 && !client.closed) {
      const first = client.buffer[0];
      const second = client.buffer[1];
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let payloadLen = second & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (client.buffer.length < 4) return;
        payloadLen = client.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (client.buffer.length < 10) return;
        const hi = client.buffer.readUInt32BE(2);
        const lo = client.buffer.readUInt32BE(6);
        if (hi > 0 || lo > MAX_FRAME_BYTES) {
          this.closeClient(client);
          return;
        }
        payloadLen = lo;
        offset = 10;
      }

      if (payloadLen > MAX_FRAME_BYTES) {
        this.closeClient(client);
        return;
      }

      const maskLen = masked ? 4 : 0;
      const totalLen = offset + maskLen + payloadLen;
      if (client.buffer.length < totalLen) return;

      let payload = client.buffer.subarray(offset + maskLen, totalLen);
      if (masked) {
        const mask = client.buffer.subarray(offset, offset + 4);
        const decoded = Buffer.allocUnsafe(payloadLen);
        for (let i = 0; i < payloadLen; i++) {
          decoded[i] = payload[i] ^ mask[i & 3];
        }
        payload = decoded;
      }

      client.buffer = client.buffer.subarray(totalLen);

      if (opcode === 0x8) {
        // Close
        try {
          client.socket.write(encodeWsFrame(0x8, Buffer.alloc(0)));
        } catch {
          // ignore
        }
        this.closeClient(client);
        return;
      }
      if (opcode === 0x9) {
        // Ping -> Pong
        try {
          client.socket.write(encodeWsFrame(0xa, payload));
        } catch {
          this.closeClient(client);
        }
        continue;
      }
      if (opcode === 0xa) {
        continue;
      }
      if (opcode === 0x1) {
        const text = payload.toString('utf8');
        try {
          const parsed = JSON.parse(text) as LanWireMessage;
          if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
            this.handleMessage(client, parsed);
          }
        } catch {
          sendWsText(client, {
            type: 'ERROR',
            code: 'BAD_MESSAGE',
            message: 'Malformed JSON message.',
          });
        }
      }
    }
  }

  private closeClient(client: WsClient): void {
    if (client.closed) return;
    client.closed = true;
    try {
      client.socket.destroy();
    } catch {
      // ignore
    }
    this.handleDisconnect(client);
  }

  private handleDisconnect(client: WsClient): void {
    client.closed = true;
    this.clients.delete(client.id);
    const roomId = client.roomId;
    if (!roomId) return;
    client.roomId = null;

    const room = this.rooms.get(roomId);
    if (!room) return;
    room.clients.delete(client.id);

    if (room.clients.size === 0) {
      this.rooms.delete(roomId);
      return;
    }

    // Migrate host cleanly if original host left
    if (room.hostId === client.id) {
      const nextHost = room.clients.values().next().value;
      if (nextHost) {
        room.hostId = nextHost.info.id;
        nextHost.info.isHost = true;
        nextHost.info.ready = true;
      }
    }

    this.broadcastLobby(room);
  }

  private broadcastLobby(room: LanRoom): void {
    const players = Array.from(room.clients.values()).map((c) => c.info);
    const update: LanWireMessage = {
      type: 'LOBBY_UPDATE',
      roomId: room.roomId,
      roomName: room.roomName,
      roomCode: room.roomCode,
      hostId: room.hostId,
      sessionStarted: room.sessionStarted,
      players,
    };
    room.clients.forEach((entry) => sendWsText(entry.ws, update));
  }

  private handleMessage(client: WsClient, msg: LanWireMessage): void {
    if (msg.type === 'PING') {
      sendWsText(client, { type: 'PONG', ts: msg.ts });
      return;
    }

    if (msg.type === 'CREATE_ROOM') {
      if (client.roomId) {
        this.handleDisconnect(client);
        this.clients.set(client.id, client);
        client.closed = false;
      }
      const roomCode = sanitizeRoomCode(msg.roomCode) || '1008';
      const roomName = sanitizeLanName(msg.roomName, "Ayodhya Sabha");
      const playerName = sanitizeLanName(msg.playerName, 'Host Ram');
      const hero = getHeroPreset(msg.heroId);
      const roomId = `room_${crypto.randomBytes(4).toString('hex')}`;

      const hostInfo: LanPlayerInfo = {
        id: client.id,
        name: playerName,
        heroId: hero.id,
        accentHex: hero.accentHex,
        isHost: true,
        ready: true,
        slotIndex: 0,
      };

      const room: LanRoom = {
        roomId,
        roomName,
        roomCode,
        hostId: client.id,
        sessionStarted: false,
        createdAtMs: Date.now(),
        clients: new Map([[client.id, { ws: client, info: hostInfo }]]),
      };
      this.rooms.set(roomId, room);
      client.roomId = roomId;

      sendWsText(client, {
        type: 'WELCOME',
        roomId,
        roomName,
        roomCode,
        hostId: room.hostId,
        yourPlayerId: client.id,
        sessionStarted: false,
        players: [hostInfo],
      });
      return;
    }

    if (msg.type === 'HELLO') {
      const code = sanitizeRoomCode(msg.roomCode);
      let targetRoom: LanRoom | undefined;
      if (msg.roomId && this.rooms.has(msg.roomId)) {
        targetRoom = this.rooms.get(msg.roomId);
      } else if (code) {
        for (const r of this.rooms.values()) {
          if (r.roomCode === code) {
            targetRoom = r;
            break;
          }
        }
      }

      if (!targetRoom) {
        sendWsText(client, {
          type: 'ERROR',
          code: 'ROOM_NOT_FOUND',
          message: 'No active LAN room matches that code.',
        });
        return;
      }

      if (targetRoom.roomCode !== code) {
        sendWsText(client, {
          type: 'ERROR',
          code: 'BAD_CODE',
          message: 'Incorrect Room PIN.',
        });
        return;
      }

      if (targetRoom.clients.size >= LAN_MAX_PLAYERS) {
        sendWsText(client, {
          type: 'ERROR',
          code: 'ROOM_FULL',
          message: `Room is full (max ${LAN_MAX_PLAYERS} players).`,
        });
        return;
      }

      const usedSlots = new Set(
        Array.from(targetRoom.clients.values()).map((c) => c.info.slotIndex)
      );
      let freeSlot = 0;
      while (usedSlots.has(freeSlot)) freeSlot++;

      const hero = getHeroPreset(msg.heroId);
      const info: LanPlayerInfo = {
        id: client.id,
        name: sanitizeLanName(msg.playerName, `Warrior ${freeSlot + 1}`),
        heroId: hero.id,
        accentHex: hero.accentHex,
        isHost: false,
        ready: targetRoom.sessionStarted,
        slotIndex: freeSlot,
      };
      targetRoom.clients.set(client.id, { ws: client, info });
      client.roomId = targetRoom.roomId;

      const players = Array.from(targetRoom.clients.values()).map((c) => c.info);
      sendWsText(client, {
        type: 'WELCOME',
        roomId: targetRoom.roomId,
        roomName: targetRoom.roomName,
        roomCode: targetRoom.roomCode,
        hostId: targetRoom.hostId,
        yourPlayerId: client.id,
        sessionStarted: targetRoom.sessionStarted,
        players,
      });
      this.broadcastLobby(targetRoom);
      return;
    }

    const room = client.roomId ? this.rooms.get(client.roomId) : undefined;
    if (!room) return;

    if (msg.type === 'LEAVE') {
      this.handleDisconnect(client);
      this.clients.set(client.id, client);
      client.closed = false;
      return;
    }

    if (msg.type === 'PLAYER_READY') {
      const entry = room.clients.get(client.id);
      if (entry) {
        entry.info.ready = Boolean(msg.ready) || entry.info.isHost;
        this.broadcastLobby(room);
      }
      return;
    }

    if (msg.type === 'START_MATCH') {
      if (client.id !== room.hostId) return;
      room.sessionStarted = true;
      const startMsg: LanWireMessage = {
        type: 'START_MATCH',
        startedAtMs: Date.now(),
      };
      room.clients.forEach((entry) => sendWsText(entry.ws, startMsg));
      this.broadcastLobby(room);
      return;
    }

    if (msg.type === 'WORLD_SNAPSHOT') {
      if (client.id !== room.hostId) return;
      room.clients.forEach((entry, pid) => {
        if (pid !== client.id) {
          sendWsText(entry.ws, msg);
        }
      });
      return;
    }

    if (msg.type === 'PLAYER_STATE') {
      const safeState = { ...msg.state, id: client.id };
      const forward: LanWireMessage = { type: 'PLAYER_STATE', state: safeState };
      room.clients.forEach((entry, pid) => {
        if (pid !== client.id) {
          sendWsText(entry.ws, forward);
        }
      });
      return;
    }

    if (msg.type === 'PLAYER_SHOT') {
      const forward: LanWireMessage = {
        type: 'PLAYER_SHOT',
        shot: { ...msg.shot, playerId: client.id },
      };
      room.clients.forEach((entry, pid) => {
        if (pid !== client.id) {
          sendWsText(entry.ws, forward);
        }
      });
      return;
    }

    if (msg.type === 'ENEMY_DAMAGE_CLAIM') {
      const hostEntry = room.clients.get(room.hostId);
      if (hostEntry && hostEntry.ws.id !== client.id) {
        sendWsText(hostEntry.ws, msg);
      }
    }
  }
}
