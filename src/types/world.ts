export type PlayMode = 'TITLE' | 'PLAYING' | 'PAUSED' | 'DEFEATED' | 'VICTORY';

export type DistrictId =
  | 'ROYAL_PALACE'
  | 'SARAYU_GHAT'
  | 'BAZAAR_CHOWK'
  | 'PANCHAVATI_GROVE'
  | 'RAKSHASA_OUTPOST';

export interface MissionDef {
  id: string;
  title: string;
  giver: string;
  district: DistrictId;
  description: string;
  targetCount: number;
  waypoint: { x: number; z: number };
  rewardKarma: number;
}

export interface RadarBlip {
  id: string;
  kind: 'RATHA' | 'ENEMY' | 'COMMANDER' | 'WAYPOINT' | 'TEMPLE';
  x: number;
  z: number;
}

export type NpcRole =
  | 'CITIZEN'
  | 'MINISTER'
  | 'COMMANDER'
  | 'SPY'
  | 'SERVANT'
  | 'GROOM'
  | 'SOLDIER';

export type MountKind = 'NONE' | 'RATHA' | 'HORSE' | 'ELEPHANT';

export type QualityTier = 'HIGH' | 'MEDIUM' | 'LOW';
export type QualityMode = 'AUTO' | QualityTier;

export interface WorldHudSnapshot {
  hp: number;
  maxHp: number;
  prana: number;
  maxPrana: number;
  karma: number;
  wantedLevel: number; // 0 to 5 stars
  inChariot: boolean;
  nearChariot: boolean;
  mountKind: MountKind;
  nearMountLabel: string | null;
  nearThrone: boolean;
  onThrone: boolean;
  autoDriveActive: boolean;
  chariotSpeedKmh: number;
  stealthActive: boolean;
  stealthSpotted: boolean;
  chakraCooldown: number;
  chakraMaxCooldown: number;
  districtName: string;
  playerX: number;
  playerZ: number;
  playerYaw: number;
  missionTitle: string;
  missionProgress: number;
  missionTarget: number;
  completedMissions: number;
  totalMissions: number;
  demonVillageDistanceM: number;
  ascensionActive: boolean;
  ascensionElapsed: number;
  courtSeatedCount: number;
  courtTotalCount: number;
  promptHint: string | null;
  blips: RadarBlip[];
  webglError: string | null;
  assetsReady: boolean;
  assetProgress: number;
  assetStage: string;
  qualityMode: QualityMode;
  qualityTier: QualityTier;
  fps: number;
}

export type DemonVariant =
  | 'BOAR_DEMON'
  | 'RABBIT_DEMON'
  | 'BRUTE_HUMAN'
  | 'SORCERER_HUMAN'
  | 'SHADOW_GHOST';

export interface InputState {
  moveX: number; // -1..1 (right joystick or A/D)
  moveY: number; // -1..1 (right joystick or W/S; +1 = forward)
  cameraDeltaX: number;
  cameraDeltaY: number;
  zoomDelta: number;
  sprint: boolean;
  jumpPressed: boolean;
  fireHeld: boolean;
  astraPressed: boolean;
  interactPressed: boolean;
  stealthTogglePressed: boolean;
  autoDriveTogglePressed: boolean;
}
