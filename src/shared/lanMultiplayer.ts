import type { AstraId, DemonVariant, MountKind } from '../types/world';
import type { ProjectileArchetypeId } from './projectilePhysics';

export const LAN_MAX_PLAYERS = 6;
export const LAN_MIN_PLAYERS = 2;
export const LAN_TCP_PORT = 38472;
export const LAN_UDP_DISCOVERY_PORT = 38473;
export const LAN_SYNC_INTERVAL_MS = 50; // 20 Hz lightweight state sync

export interface LanHeroPreset {
  id: string;
  label: string;
  accentHex: string;
}

export const LAN_HERO_PRESETS: readonly LanHeroPreset[] = [
  { id: 'RAM', label: 'Lord Ram', accentHex: '#F6C343' },
  { id: 'LAKSHMAN', label: 'Lakshman', accentHex: '#38BDF8' },
  { id: 'HANUMAN', label: 'Hanuman', accentHex: '#FB923C' },
  { id: 'BHARAT', label: 'Bharat', accentHex: '#34D399' },
  { id: 'SHATRUGHNA', label: 'Shatrughna', accentHex: '#A78BFA' },
  { id: 'ANGAD', label: 'Angad', accentHex: '#F472B6' },
] as const;

export interface LanPlayerInfo {
  id: string;
  name: string;
  heroId: string;
  accentHex: string;
  isHost: boolean;
  ready: boolean;
  slotIndex: number;
}

export interface LanPlayerState {
  id: string;
  name: string;
  heroId: string;
  accentHex: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  horizSpeed: number;
  grounded: boolean;
  walkPhase: number;
  aiming: boolean;
  stealth: boolean;
  sprint: boolean;
  mountKind: MountKind;
  hp: number;
  maxHp: number;
  selectedAstra: AstraId | null;
  seq: number;
}

export interface LanEnemySyncState {
  id: string;
  variant: DemonVariant;
  isCommander: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  dissolving: boolean;
  customScale: number;
  missionTag: string | null;
}

export interface LanDiscoveredRoom {
  roomId: string;
  roomName: string;
  roomCode: string;
  hostName: string;
  hostIp: string;
  port: number;
  playerCount: number;
  maxPlayers: number;
  sessionStarted: boolean;
  transport: 'NATIVE_TCP' | 'WS_LAN';
  lastSeenMs: number;
}

export interface LanShotEvent {
  playerId: string;
  shotId: string;
  archetype: ProjectileArchetypeId;
  origin: { x: number; y: number; z: number };
  dir: { x: number; y: number; z: number };
  stealthAmbush: boolean;
  homingTargetId: string | null;
}

export interface LanWorldSnapshot {
  serverTimeMs: number;
  dayTime: number;
  missionIdx: number;
  missionProgress: number;
  completedMissions: number;
  players: LanPlayerState[];
  enemies: LanEnemySyncState[];
}

export type LanWireMessage =
  | {
      type: 'CREATE_ROOM';
      roomName: string;
      roomCode: string;
      playerName: string;
      heroId: string;
    }
  | {
      type: 'HELLO';
      roomId?: string;
      roomCode: string;
      playerName: string;
      heroId: string;
    }
  | {
      type: 'WELCOME';
      roomId: string;
      roomName: string;
      roomCode: string;
      hostId: string;
      yourPlayerId: string;
      sessionStarted: boolean;
      players: LanPlayerInfo[];
    }
  | {
      type: 'LOBBY_UPDATE';
      roomId: string;
      roomName: string;
      roomCode: string;
      hostId: string;
      sessionStarted: boolean;
      players: LanPlayerInfo[];
    }
  | {
      type: 'ERROR';
      code: string;
      message: string;
    }
  | {
      type: 'PLAYER_READY';
      ready: boolean;
    }
  | {
      type: 'START_MATCH';
      startedAtMs: number;
    }
  | {
      type: 'PLAYER_STATE';
      state: LanPlayerState;
    }
  | {
      type: 'WORLD_SNAPSHOT';
      snapshot: LanWorldSnapshot;
    }
  | {
      type: 'PLAYER_SHOT';
      shot: LanShotEvent;
    }
  | {
      type: 'ENEMY_DAMAGE_CLAIM';
      enemyId: string;
      amount: number;
      source: AstraId | 'STANDARD' | 'CHAKRA';
      shotId: string;
    }
  | {
      type: 'PING';
      ts: number;
    }
  | {
      type: 'PONG';
      ts: number;
    }
  | {
      type: 'LEAVE';
    };

export function sanitizeLanName(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.replace(/[^\w\s-]/g, '').trim().slice(0, 18);
  return cleaned.length > 0 ? cleaned : fallback;
}

export function sanitizeRoomCode(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
}

export function generateRoomCode(): string {
  return String(1000 + Math.floor(Math.random() * 9000));
}

export function getHeroPreset(heroId: string): LanHeroPreset {
  return (
    LAN_HERO_PRESETS.find((h) => h.id === heroId) ?? LAN_HERO_PRESETS[0]
  );
}
