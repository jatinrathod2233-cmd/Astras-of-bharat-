import type { AstraId } from '../types/world';
import {
  generateRoomCode,
  getHeroPreset,
  LAN_MAX_PLAYERS,
  LAN_TCP_PORT,
  LanDiscoveredRoom,
  LanPlayerInfo,
  LanPlayerState,
  LanShotEvent,
  LanVehicleActionAckMessage,
  LanVehicleActionMessage,
  LanWireMessage,
  LanWorldSnapshot,
  sanitizeLanName,
  sanitizeRoomCode,
} from '../shared/lanMultiplayer';

export interface LanNetworkMetrics {
  rttMs: number;
  jitterMs: number;
  clockOffsetMs: number;
  oneWayLatencySec: number;
}

export type LanTransportKind = 'NATIVE_ANDROID_HOTSPOT' | 'LOCAL_WS';

export interface LanNetworkInfo {
  primaryIp: string;
  suggestedHostIp: string;
  port: number;
}

export interface LanSessionSnapshot {
  active: boolean;
  connecting: boolean;
  transport: LanTransportKind;
  isHost: boolean;
  sessionStarted: boolean;
  roomId: string;
  roomName: string;
  roomCode: string;
  hostId: string;
  localPlayerId: string;
  players: LanPlayerInfo[];
  discoveredRooms: LanDiscoveredRoom[];
  networkInfo: LanNetworkInfo;
  pingMs: number | null;
  error: string | null;
}

interface NativeLanBridge {
  isNativeAndroid?: () => boolean;
  lanIsSupported?: () => boolean;
  lanGetNetworkInfo?: () => string;
  lanStartHost?: (
    roomName: string,
    hostName: string,
    roomCode: string,
    heroId: string
  ) => void;
  lanStartDiscovery?: () => void;
  lanStopDiscovery?: () => void;
  lanJoinHost?: (
    hostIp: string,
    port: number,
    roomCode: string,
    playerName: string,
    heroId: string
  ) => void;
  lanSend?: (wireJson: string) => void;
  lanStopAll?: () => void;
}

export interface LanEngineHandlers {
  onMatchStarted?: () => void;
  onRemotePlayerState?: (state: LanPlayerState) => void;
  onWorldSnapshot?: (snapshot: LanWorldSnapshot) => void;
  onRemoteShot?: (shot: LanShotEvent) => void;
  onEnemyDamageClaim?: (
    enemyId: string,
    amount: number,
    source: AstraId | 'STANDARD' | 'CHAKRA',
    shotId: string
  ) => void;
  onVehicleAction?: (action: LanVehicleActionMessage) => void;
  onVehicleActionAck?: (ack: LanVehicleActionAckMessage) => void;
  onPeerListChanged?: (activeIds: Set<string>) => void;
  onSessionClosed?: () => void;
}

function getNativeBridge(): NativeLanBridge | null {
  if (typeof window === 'undefined') return null;
  const b = (window as unknown as { AndroidBridge?: NativeLanBridge }).AndroidBridge;
  if (b && b.isNativeAndroid?.() && b.lanIsSupported?.()) {
    return b;
  }
  return null;
}

export class LanMultiplayerClient {
  private readonly listeners = new Set<(snap: LanSessionSnapshot) => void>();
  private engineHandlers: LanEngineHandlers = {};

  private ws: WebSocket | null = null;
  private discoveryTimer: number | null = null;
  private pingTimer: number | null = null;
  private roomExpiryTimer: number | null = null;

  private active = false;
  private connecting = false;
  private isHost = false;
  private sessionStarted = false;
  private roomId = '';
  private roomName = 'Ayodhya Sabha';
  private roomCode = generateRoomCode();
  private hostId = '';
  private localPlayerId = '';
  private players: LanPlayerInfo[] = [];
  private discoveredMap = new Map<string, LanDiscoveredRoom>();
  private networkInfo: LanNetworkInfo = {
    primaryIp: '127.0.0.1',
    suggestedHostIp: '192.168.43.1',
    port: typeof window !== 'undefined' && window.location.port ? Number(window.location.port) : 3000,
  };
  private pingMs: number | null = null;
  private smoothedRttMs = 24;
  private jitterMs = 6;
  private clockOffsetMs = 0;
  private hasClockSync = false;
  private error: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const bridge = getNativeBridge();
      if (bridge) {
        this.networkInfo.port = LAN_TCP_PORT;
        (window as unknown as { __onNativeLanEvent?: (raw: string) => void }).__onNativeLanEvent =
          (raw: string) => this.handleNativeEvent(raw);
      }
    }
    this.refreshNetworkInfo();
  }

  public getTransportKind(): LanTransportKind {
    return getNativeBridge() ? 'NATIVE_ANDROID_HOTSPOT' : 'LOCAL_WS';
  }

  public setEngineHandlers(handlers: LanEngineHandlers): void {
    this.engineHandlers = handlers;
  }

  public subscribe(listener: (snap: LanSessionSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getSnapshot(): LanSessionSnapshot {
    return {
      active: this.active,
      connecting: this.connecting,
      transport: this.getTransportKind(),
      isHost: this.isHost,
      sessionStarted: this.sessionStarted,
      roomId: this.roomId,
      roomName: this.roomName,
      roomCode: this.roomCode,
      hostId: this.hostId,
      localPlayerId: this.localPlayerId,
      players: this.players.map((p) => ({ ...p })),
      discoveredRooms: Array.from(this.discoveredMap.values()).sort(
        (a, b) => b.lastSeenMs - a.lastSeenMs
      ),
      networkInfo: { ...this.networkInfo },
      pingMs: this.pingMs,
      error: this.error,
    };
  }

  public refreshNetworkInfo(): void {
    const bridge = getNativeBridge();
    if (bridge?.lanGetNetworkInfo) {
      try {
        const parsed = JSON.parse(bridge.lanGetNetworkInfo()) as Partial<LanNetworkInfo>;
        this.networkInfo = {
          primaryIp: parsed.primaryIp || '192.168.43.1',
          suggestedHostIp: parsed.suggestedHostIp || '192.168.43.1',
          port: parsed.port || LAN_TCP_PORT,
        };
        this.emit();
      } catch {
        // Ignore parse failures
      }
      return;
    }

    if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
      fetch('/api/lan/info')
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { primaryIp?: string; port?: number } | null) => {
          if (data?.primaryIp) {
            this.networkInfo = {
              primaryIp: data.primaryIp,
              suggestedHostIp: window.location.hostname || data.primaryIp,
              port: data.port || 3000,
            };
            this.emit();
          }
        })
        .catch(() => {
          // Offline without local HTTP server
        });
    }
  }

  public startDiscovery(): void {
    this.stopDiscovery();
    const bridge = getNativeBridge();
    if (bridge?.lanStartDiscovery) {
      bridge.lanStartDiscovery();
    } else {
      const pollRooms = () => {
        if (typeof window === 'undefined' || !window.location.protocol.startsWith('http')) return;
        fetch('/api/lan/rooms')
          .then((r) => (r.ok ? r.json() : null))
          .then((data: { rooms?: LanDiscoveredRoom[] } | null) => {
            if (!data?.rooms) return;
            const nextMap = new Map<string, LanDiscoveredRoom>();
            for (const room of data.rooms) {
              nextMap.set(room.roomId, room);
            }
            this.discoveredMap = nextMap;
            this.emit();
          })
          .catch(() => {
            // Ignore transient poll errors
          });
      };
      pollRooms();
      this.discoveryTimer = window.setInterval(pollRooms, 1500);
    }

    if (typeof window !== 'undefined') {
      this.roomExpiryTimer = window.setInterval(() => {
        const now = Date.now();
        let removed = false;
        this.discoveredMap.forEach((r, id) => {
          if (now - r.lastSeenMs > 5000) {
            this.discoveredMap.delete(id);
            removed = true;
          }
        });
        if (removed) this.emit();
      }, 1500);
    }
  }

  public stopDiscovery(): void {
    const bridge = getNativeBridge();
    if (bridge?.lanStopDiscovery) {
      bridge.lanStopDiscovery();
    }
    if (this.discoveryTimer !== null) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }
    if (this.roomExpiryTimer !== null) {
      clearInterval(this.roomExpiryTimer);
      this.roomExpiryTimer = null;
    }
  }

  public hostRoom(
    roomName: string,
    playerName: string,
    roomCode: string,
    heroId: string
  ): void {
    this.leaveRoom();
    this.error = null;
    this.connecting = true;
    this.isHost = true;
    this.roomName = sanitizeLanName(roomName, 'Ayodhya Sabha');
    this.roomCode = sanitizeRoomCode(roomCode) || generateRoomCode();
    const cleanPlayer = sanitizeLanName(playerName, 'Lord Ram');
    const hero = getHeroPreset(heroId);
    this.emit();

    const bridge = getNativeBridge();
    if (bridge?.lanStartHost) {
      this.refreshNetworkInfo();
      bridge.lanStartHost(this.roomName, cleanPlayer, this.roomCode, hero.id);
      return;
    }

    this.connectWebSocket(this.buildWsUrl(), () => {
      this.sendWire({
        type: 'CREATE_ROOM',
        roomName: this.roomName,
        roomCode: this.roomCode,
        playerName: cleanPlayer,
        heroId: hero.id,
      });
    });
  }

  public joinRoom(
    hostIp: string,
    port: number,
    roomCode: string,
    playerName: string,
    heroId: string,
    roomId?: string
  ): void {
    this.leaveRoom();
    this.error = null;
    this.connecting = true;
    this.isHost = false;
    const cleanCode = sanitizeRoomCode(roomCode);
    const cleanPlayer = sanitizeLanName(playerName, 'Warrior');
    const hero = getHeroPreset(heroId);
    this.emit();

    const bridge = getNativeBridge();
    if (bridge?.lanJoinHost) {
      bridge.lanJoinHost(
        hostIp.trim() || this.networkInfo.suggestedHostIp,
        port || LAN_TCP_PORT,
        cleanCode,
        cleanPlayer,
        hero.id
      );
      return;
    }

    const wsUrl = this.buildWsUrl(hostIp.trim(), port);
    this.connectWebSocket(wsUrl, () => {
      this.sendWire({
        type: 'HELLO',
        roomId,
        roomCode: cleanCode,
        playerName: cleanPlayer,
        heroId: hero.id,
      });
    });
  }

  public setReady(ready: boolean): void {
    if (!this.active) return;
    this.sendWire({ type: 'PLAYER_READY', ready });
  }

  public startMatch(): void {
    if (!this.active || !this.isHost) return;
    this.sendWire({ type: 'START_MATCH', startedAtMs: Date.now() });
  }

  public leaveRoom(): void {
    if (this.active) {
      this.sendWire({ type: 'LEAVE' });
    }
    const bridge = getNativeBridge();
    if (bridge?.lanStopAll) {
      bridge.lanStopAll();
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.stopPingLoop();
    const wasActive = this.active;
    this.active = false;
    this.connecting = false;
    this.isHost = false;
    this.sessionStarted = false;
    this.roomId = '';
    this.hostId = '';
    this.localPlayerId = '';
    this.players = [];
    this.pingMs = null;
    this.emit();
    if (wasActive) {
      this.engineHandlers.onSessionClosed?.();
    }
  }

  public sendLocalPlayerState(state: Omit<LanPlayerState, 'id'>): void {
    if (!this.active || !this.sessionStarted || !this.localPlayerId) return;
    this.sendWire({
      type: 'PLAYER_STATE',
      state: {
        ...state,
        id: this.localPlayerId,
      },
    });
  }

  public sendWorldSnapshot(snapshot: LanWorldSnapshot): void {
    if (!this.active || !this.isHost || !this.sessionStarted) return;
    this.sendWire({
      type: 'WORLD_SNAPSHOT',
      snapshot,
    });
  }

  public sendShot(shot: Omit<LanShotEvent, 'playerId'>): void {
    if (!this.active || !this.sessionStarted || !this.localPlayerId) return;
    this.sendWire({
      type: 'PLAYER_SHOT',
      shot: {
        ...shot,
        playerId: this.localPlayerId,
      },
    });
  }

  public sendEnemyDamageClaim(
    enemyId: string,
    amount: number,
    source: AstraId | 'STANDARD' | 'CHAKRA',
    shotId: string
  ): void {
    if (!this.active || this.isHost || !this.sessionStarted) return;
    this.sendWire({
      type: 'ENEMY_DAMAGE_CLAIM',
      enemyId,
      amount,
      source,
      shotId,
    });
  }

  public sendVehicleAction(
    action: Omit<LanVehicleActionMessage, 'type' | 'playerId'>
  ): void {
    if (!this.active || !this.sessionStarted || !this.localPlayerId) return;
    this.sendWire({
      type: 'VEHICLE_ACTION',
      ...action,
      playerId: this.localPlayerId,
    });
  }

  public sendVehicleActionAck(
    ack: Omit<LanVehicleActionAckMessage, 'type'>
  ): void {
    if (!this.active || !this.isHost || !this.sessionStarted) return;
    this.sendWire({
      type: 'VEHICLE_ACTION_ACK',
      ...ack,
    });
  }

  public getNetworkMetrics(): LanNetworkMetrics {
    const rttMs = this.pingMs !== null ? this.smoothedRttMs : 24;
    const jitter = this.jitterMs;
    return {
      rttMs,
      jitterMs: jitter,
      clockOffsetMs: this.clockOffsetMs,
      oneWayLatencySec: Math.min(0.18, Math.max(0, (rttMs * 0.5 + jitter * 0.5) * 0.001)),
    };
  }

  public getLocalPlayerId(): string {
    return this.localPlayerId;
  }

  public isMultiplayerActive(): boolean {
    return this.active && this.sessionStarted;
  }

  public isHostingMatch(): boolean {
    return this.active && this.isHost && this.sessionStarted;
  }

  public isClientInMatch(): boolean {
    return this.active && !this.isHost && this.sessionStarted;
  }

  public dispose(): void {
    this.stopDiscovery();
    this.leaveRoom();
    this.listeners.clear();
  }

  private buildWsUrl(customHost?: string, customPort?: number): string {
    if (typeof window === 'undefined') return 'ws://127.0.0.1:3000/ws/lan';
    const isHttps = window.location.protocol === 'https:';
    const proto = isHttps ? 'wss:' : 'ws:';
    if (!customHost || customHost === window.location.hostname) {
      return `${proto}//${window.location.host}/ws/lan`;
    }
    const cleanPort = customPort && customPort > 0 ? customPort : this.networkInfo.port || 3000;
    return `${proto}//${customHost}:${cleanPort}/ws/lan`;
  }

  private connectWebSocket(url: string, onOpen: () => void): void {
    try {
      const sock = new WebSocket(url);
      this.ws = sock;
      sock.onopen = () => {
        onOpen();
      };
      sock.onmessage = (evt) => {
        if (typeof evt.data !== 'string') return;
        try {
          const parsed = JSON.parse(evt.data) as LanWireMessage;
          this.handleWireMessage(parsed);
        } catch {
          // Ignore invalid JSON frames
        }
      };
      sock.onerror = () => {
        if (this.connecting && !this.active) {
          this.error = 'Could not reach LAN host. Verify Wi-Fi connection and IP.';
          this.connecting = false;
          this.emit();
        }
      };
      sock.onclose = () => {
        if (this.ws !== sock) return;
        this.ws = null;
        this.stopPingLoop();
        const wasActive = this.active;
        this.active = false;
        this.connecting = false;
        this.sessionStarted = false;
        this.players = [];
        this.emit();
        if (wasActive) {
          this.engineHandlers.onSessionClosed?.();
        }
      };
    } catch (err) {
      this.connecting = false;
      this.error = err instanceof Error ? err.message : 'Failed to open WebSocket.';
      this.emit();
    }
  }

  private handleNativeEvent(rawJson: string): void {
    try {
      const parsed = JSON.parse(rawJson) as {
        event?: string;
        room?: LanDiscoveredRoom;
        payload?: LanWireMessage;
      };
      if (parsed.event === 'ROOM_DISCOVERED' && parsed.room) {
        this.discoveredMap.set(parsed.room.roomId, parsed.room);
        this.emit();
        return;
      }
      if (parsed.event === 'DISCONNECTED') {
        this.stopPingLoop();
        const wasActive = this.active;
        this.active = false;
        this.connecting = false;
        this.sessionStarted = false;
        this.players = [];
        this.emit();
        if (wasActive) {
          this.engineHandlers.onSessionClosed?.();
        }
        return;
      }
      if (parsed.event === 'WIRE' && parsed.payload) {
        this.handleWireMessage(parsed.payload);
      }
    } catch {
      // Ignore malformed native event JSON
    }
  }

  private handleWireMessage(msg: LanWireMessage): void {
    switch (msg.type) {
      case 'ERROR': {
        this.error = msg.message;
        this.connecting = false;
        if (!this.active) {
          this.emit();
        }
        return;
      }
      case 'WELCOME': {
        this.active = true;
        this.connecting = false;
        this.error = null;
        this.roomId = msg.roomId;
        this.roomName = msg.roomName;
        this.roomCode = msg.roomCode;
        this.hostId = msg.hostId;
        this.localPlayerId = msg.yourPlayerId;
        this.isHost = msg.hostId === msg.yourPlayerId;
        this.sessionStarted = msg.sessionStarted;
        this.players = msg.players.slice(0, LAN_MAX_PLAYERS);
        this.startPingLoop();
        this.notifyPeerList();
        this.emit();
        if (this.sessionStarted) {
          this.engineHandlers.onMatchStarted?.();
        }
        return;
      }
      case 'LOBBY_UPDATE': {
        this.roomId = msg.roomId;
        this.roomName = msg.roomName;
        this.roomCode = msg.roomCode;
        this.hostId = msg.hostId;
        this.isHost = msg.hostId === this.localPlayerId;
        this.sessionStarted = msg.sessionStarted;
        this.players = msg.players.slice(0, LAN_MAX_PLAYERS);
        this.notifyPeerList();
        this.emit();
        return;
      }
      case 'START_MATCH': {
        this.sessionStarted = true;
        this.emit();
        this.engineHandlers.onMatchStarted?.();
        if (this.active) {
          this.sendWire({ type: 'PING', ts: Date.now() });
        }
        return;
      }
      case 'PLAYER_STATE': {
        if (msg.state.id !== this.localPlayerId) {
          this.engineHandlers.onRemotePlayerState?.(msg.state);
        }
        return;
      }
      case 'WORLD_SNAPSHOT': {
        this.engineHandlers.onWorldSnapshot?.(msg.snapshot);
        return;
      }
      case 'PLAYER_SHOT': {
        if (msg.shot.playerId !== this.localPlayerId) {
          this.engineHandlers.onRemoteShot?.(msg.shot);
        }
        return;
      }
      case 'ENEMY_DAMAGE_CLAIM': {
        if (this.isHost) {
          this.engineHandlers.onEnemyDamageClaim?.(
            msg.enemyId,
            msg.amount,
            msg.source,
            msg.shotId
          );
        }
        return;
      }
      case 'VEHICLE_ACTION': {
        if (this.isHost) {
          this.engineHandlers.onVehicleAction?.(msg);
        }
        return;
      }
      case 'VEHICLE_ACTION_ACK': {
        this.engineHandlers.onVehicleActionAck?.(msg);
        return;
      }
      case 'PONG': {
        const now = Date.now();
        const rawRtt = Math.max(1, Math.min(800, now - msg.ts));
        if (this.pingMs === null) {
          this.smoothedRttMs = rawRtt;
          this.jitterMs = Math.min(25, rawRtt * 0.25);
        } else {
          const delta = Math.abs(rawRtt - this.smoothedRttMs);
          this.jitterMs = this.jitterMs * 0.8 + delta * 0.2;
          this.smoothedRttMs = this.smoothedRttMs * 0.78 + rawRtt * 0.22;
        }
        if (typeof msg.serverTimeMs === 'number' && Number.isFinite(msg.serverTimeMs)) {
          const sampleOffset = msg.serverTimeMs + rawRtt * 0.5 - now;
          this.clockOffsetMs = this.hasClockSync
            ? this.clockOffsetMs * 0.8 + sampleOffset * 0.2
            : sampleOffset;
          this.hasClockSync = true;
        }
        this.pingMs = Math.round(this.smoothedRttMs);
        this.emit();
        return;
      }
    }
  }

  private notifyPeerList(): void {
    const ids = new Set<string>();
    for (const p of this.players) {
      if (p.id !== this.localPlayerId) {
        ids.add(p.id);
      }
    }
    this.engineHandlers.onPeerListChanged?.(ids);
  }

  private sendWire(msg: LanWireMessage): void {
    const raw = JSON.stringify(msg);
    const bridge = getNativeBridge();
    if (bridge?.lanSend) {
      bridge.lanSend(raw);
      return;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(raw);
    }
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    if (typeof window === 'undefined') return;
    this.hasClockSync = false;
    this.sendWire({ type: 'PING', ts: Date.now() });
    this.pingTimer = window.setInterval(() => {
      if (this.active) {
        this.sendWire({ type: 'PING', ts: Date.now() });
      }
    }, 1200);
  }

  private stopPingLoop(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private emit(): void {
    const snap = this.getSnapshot();
    this.listeners.forEach((cb) => cb(snap));
  }
}
