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
  kind: 'RATHA' | 'ENEMY' | 'COMMANDER' | 'WAYPOINT' | 'TEMPLE' | 'ASTRA_OBJECTIVE';
  x: number;
  z: number;
}

export type AstraId =
  | 'AGNEYASTRA'
  | 'VARUNASTRA'
  | 'VAYAVYASTRA'
  | 'NAGASTRA'
  | 'BRAHMASTRA';

export type BrahmaTrialStage = 0 | 1 | 2 | 3 | 4;

export interface AstraStatusEntry {
  id: AstraId;
  name: string;
  title: string;
  unlocked: boolean;
  story: string;
  hint: string;
}

export interface AstraUnlockPopup {
  id: AstraId;
  name: string;
  oneLineStory: string;
}

export interface EnemySummonWarning {
  active: boolean;
  bossName: string;
  remainingSec: number;
  totalSec: number;
  interrupted: boolean;
}

export interface AstraQuestHudState {
  astras: AstraStatusEntry[];
  unlockedCount: number;
  activeAstraId: AstraId | null;
  objectiveTitle: string;
  objectiveDetail: string;
  objectiveDistanceM: number;
  challengeSubProgress: string | null;
  challengeTimerSec: number | null;
  underwaterBreath: number | null; // 0..100 when diving for Varunastra
  brahmaTrialStage: BrahmaTrialStage; // 0 when not in trial, 1..4 inside trial
  allCompleted: boolean;
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

export interface HardwareBenchmarkSummary {
  completed: boolean;
  cpuScore: number;
  gpuScore: number;
  ramScore: number;
  compositeScore: number;
  lockedTier: QualityTier;
  targetFps: number;
  recommendedResScale: number;
  gpuName: string;
  cores: number;
  memoryGb: number | null;
  durationMs: number;
}

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
  targetFps: number;
  resolutionScale: number;
  hardwareBenchmark: HardwareBenchmarkSummary | null;
  // Divine Astras Quest HUD fields
  selectedAstra: AstraId | null;
  astraEnergy: number;
  maxAstraEnergy: number;
  astraCooldowns: Record<AstraId, number>;
  brahmastraAimReady: boolean;
  brahmastraSummoning: boolean;
  brahmaFlashAlpha: number;
  brahmaFadeAlpha: number;
  astraQuest: AstraQuestHudState;
  astraUnlockPopup: AstraUnlockPopup | null;
  enemySummonWarning: EnemySummonWarning | null;
  showStoryIntro: boolean;
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
  astraPressed: boolean; // Sudarshan Chakra trigger
  shootAstraPressed: boolean; // Non-cancellable Divyastra bow shoot trigger
  selectedAstra: AstraId | null;
  interactPressed: boolean;
  stealthTogglePressed: boolean;
  autoDriveTogglePressed: boolean;
}
