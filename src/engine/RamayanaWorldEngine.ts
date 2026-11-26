import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  AstraId,
  CameraPerspective,
  DemonVariant,
  InputState,
  MountKind,
  NpcRole,
  PlayableHeroId,
  PlayMode,
  QualityMode,
  QualityTier,
  RadarBlip,
  WorldHudSnapshot,
} from '../types/world';
import {
  CameraPerspectiveController,
  computeSecondPersonWaistPose,
} from './cameraSystem';
import { HERO_PROFILES, normalizeHeroId, PLAYABLE_HERO_ORDER } from './heroProfiles';
import { soundEngine } from '../utils/audio';
import {
  ASTRA_CONFIG,
  ASTRA_ENERGY_REGEN_PER_SEC,
  ASTRA_MAX_ENERGY,
  ASTRA_ORDER,
} from './astraConfig';
import { AstraQuestSystem } from './AstraQuestSystem';
import {
  OptimisticDamageRecord,
  ProjectileSyncClient,
} from './ProjectileSyncClient';
import {
  HazardZoneTickResponse,
  intersectSegmentCapsule,
  PROJECTILE_PHYSICS_REGISTRY,
  ProjectileArchetypeId,
  ProjectileImpactValidationResponse,
  ProjectileKinematicsState,
  stepProjectileKinematics,
  Vec3Like,
} from '../shared/projectilePhysics';
import {
  AstraVfxManager,
  EnemyDissolveUniforms,
  installEnemyAshDissolution,
} from './astraVfx';
import {
  getHeroPreset,
  LAN_SYNC_INTERVAL_MS,
  LanDriverVehicleReport,
  LanEnemySyncState,
  LanPlayerState,
  LanShotEvent,
  LanVehicleActionAckMessage,
  LanVehicleActionKind,
  LanVehicleActionMessage,
  LanVehicleKind,
  LanVehicleSeatIndex,
  LanVehicleSyncState,
  LanWorldSnapshot,
} from '../shared/lanMultiplayer';
import { LanMultiplayerClient } from './LanMultiplayerClient';
import { DynamicAssetScaler } from './DynamicAssetScaler';
import {
  HardwareEnvelope,
  probeHardwareEnvelope,
  runLaunchHardwareBenchmark,
} from './HardwareProfiler';
import { ObjectPoolManager, swapRemoveAt } from './ObjectPoolManager';
import { OcclusionCullingManager } from './OcclusionCullingManager';
import { QualityManager, QualityProfile } from './QualityManager';
import {
  applyRigLodDetailTier,
  computeEntityLodTier,
  MobileLodAssetCache,
  wrapBlackMountainWithLod,
  wrapBridgeWithLod,
  wrapDemonStructureWithLod,
  wrapMahadevWithLod,
  wrapPavilionWithLod,
  wrapTempleWithLod,
  wrapToranaWithLod,
  wrapVolcanoWithLod,
} from './MobileLodManager';
import { StaticColliderSpatialGrid } from './StaticColliderSpatialGrid';
import {
  ChariotRig,
  CharacterRig,
  ElephantRig,
  RoofOccluder,
  RoyalHorseRig,
  SabhaSeatDef,
  createBlackMountainModel,
  createCitizenModel,
  createColossalGoldenArcherMonument,
  createCrocodileModel,
  createDemonModel,
  createDemonStructureModel,
  createDolphinModel,
  createElephantStableModel,
  createFishSchoolGeometry,
  createFloatingCelestialIsland,
  createGiantTurtleModel,
  createHeroModel,
  createHorseStableModel,
  createJellyfishModel,
  createLordRamModel,
  createMahadevStatueModel,
  createMonumentalStepwellModel,
  createPavilionModel,
  createRathaChariotModel,
  createRoyalHorseUnit,
  createServantQuartersModel,
  createSevenStoryPalaceAndSabhaModel,
  createSharkModel,
  createSkeletonDebrisCluster,
  createTempleModel,
  createTrainingGroundsModel,
  createVolcanoModel,
  createWheelDebris,
  updateDynamicReinMesh,
} from './models';
import { createProceduralTexturesAsync, ProceduralTextures } from './textures';
import {
  ASHVA_STABLE_POS,
  BoxCollider,
  BRIDGE_HALF_SPAN,
  BRIDGE_HALF_WIDTH,
  BRIDGE_Z_LIST,
  bridgeArchHeight,
  BUILDING_LOCATIONS,
  buildAutoDriveRoute,
  CircleCollider,
  COURTYARD_ASHVA_SPAWNS,
  DEMON_VILLAGE_CENTER_X,
  DEMON_VILLAGE_CENTER_Z,
  DEMON_VILLAGE_STRUCTURES,
  DEMON_VOLCANOES,
  DEMON_ZONE_MIN_X,
  findPalaceNavPath,
  getDistrictName,
  groundHeightAt,
  HATHI_STABLE_POS,
  isInRiverWater,
  isInsideStepwellBasin,
  MISSIONS,
  PALACE_CORE_POS,
  PALACE_STORIES,
  palaceFloorHeightAt,
  palaceStoryAt,
  pickNavMeshPatrolTarget,
  RATHA_SPAWNS,
  RIVER_CENTER_X,
  RIVER_HALF_WIDTH,
  RIVER_SURFACE_Y,
  riverCenterX,
  riverHalfWidth,
  SABHA_HALL_POS,
  SERVANT_QUARTERS_POS,
  STEPWELL_POS,
  stepAutoDriveRoute,
  THRONE_POS,
  TRAINING_GROUND_POS,
  waterSurfaceAt,
  WORLD_BOUNDS,
} from './worldData';

const PostSmoothAndUnderwaterShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTexelSize: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    uSharpness: { value: 0.38 },
    uEdgeEnhance: { value: 0.38 },
    uSmoothBlend: { value: 0.62 },
    uSubmerged: { value: 0.0 },
    uDepthFactor: { value: 0.0 },
    uTime: { value: 0.0 },
    uDaylight: { value: 1.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uTexelSize;
    uniform float uSharpness;
    uniform float uEdgeEnhance;
    uniform float uSmoothBlend;
    uniform float uSubmerged;
    uniform float uDepthFactor;
    uniform float uTime;
    uniform float uDaylight;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      if (uSubmerged > 0.001) {
        float wave = sin(uv.y * 26.0 + uTime * 2.8) * cos(uv.x * 18.0 - uTime * 1.9);
        uv += vec2(wave, sin(uv.x * 22.0 + uTime * 2.3)) * (0.0026 * uSubmerged);
        uv = clamp(uv, 0.001, 0.999);
      }

      vec4 texel = texture2D(tDiffuse, uv);

      // 1:1 native pixel pass-through above water (zero blur, zero softening)
      if (uSubmerged <= 0.001) {
        gl_FragColor = texel;
        return;
      }
      vec3 finalCol = texel.rgb;

      vec3 absorption = mix(vec3(1.0), vec3(0.30, 0.68, 0.96), uSubmerged);
      vec3 tinted = finalCol * absorption;

      vec3 shallowWater = vec3(0.06, 0.36, 0.60) * mix(0.28, 1.0, uDaylight);
      vec3 deepWater = vec3(0.02, 0.15, 0.34) * mix(0.28, 1.0, uDaylight);
      vec3 waterCol = mix(shallowWater, deepWater, uDepthFactor);

      float causticA = sin(vUv.x * 16.0 + uTime * 1.6 + sin(vUv.y * 8.0 + uTime));
      float causticB = cos(vUv.x * 23.0 - uTime * 1.2 + vUv.y * 11.0);
      float caustic = pow(max(0.0, causticA * causticB), 3.0) * (1.0 - vUv.y * 0.85) * (1.0 - uDepthFactor * 0.65);
      vec3 causticCol = mix(vec3(0.18, 0.44, 0.74), vec3(0.30, 0.76, 1.0), uDaylight);

      float scatterMix = uSubmerged * (0.32 + 0.28 * uDepthFactor);
      vec3 underCol = mix(tinted, waterCol, scatterMix) + causticCol * (caustic * 0.24 * uSubmerged);

      float distCenter = length(vUv - vec2(0.5));
      float vig = smoothstep(0.35, 0.92, distCenter);
      underCol = mix(underCol, deepWater * 0.68, vig * 0.50 * uSubmerged);

      gl_FragColor = vec4(underCol, texel.a);
    }
  `,
};

const HANUMAN_TAIL_REST_PITCHES = [-1.15, -0.25, 0.42, 0.48, 0.4, 0.34] as const;

// Module-scope reusable math objects (Zero GC in render loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _camDesired = new THREE.Vector3();
const _sunDir = new THREE.Vector3();
const _moonDir = new THREE.Vector3();
const _shadowDir = new THREE.Vector3();
const _shadowRight = new THREE.Vector3();
const _shadowUp = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _dummy = new THREE.Object3D();

// Strict near clipping plane for razor-sharp 24-bit depth buffer across 4.5 km render distance
const FP_CAMERA_NEAR = 0.12;
const FP_HEAD_NECK_RADIUS = 0.22;
const _fpFwd = new THREE.Vector3();
const _fpRight = new THREE.Vector3();
const _fpUp = new THREE.Vector3();
const _fpPushBias = new THREE.Vector3();
const _fpPrimA = new THREE.Vector3();
const _fpPrimB = new THREE.Vector3();
const _fpClosest = new THREE.Vector3();
const _fpDelta = new THREE.Vector3();
const _fpHeadWorld = new THREE.Vector3();
const _fpArmL0 = new THREE.Vector3();
const _fpArmL1 = new THREE.Vector3();
const _fpArmR0 = new THREE.Vector3();
const _fpArmR1 = new THREE.Vector3();
const _fpSpineTop = new THREE.Vector3();
const _colMist = new THREE.Color(0xa8d8f8);
const _colSunset = new THREE.Color(0xc96c42);
const _colNightMist = new THREE.Color(0x040813);
const _colAsh = new THREE.Color(0x21171b);
const _colUnderDay = new THREE.Color(0x0b4b75);
const _colUnderNight = new THREE.Color(0x04192e);
const _tmpUnderCol = new THREE.Color();
const _colHemiDay = new THREE.Color(0xfff0d4);
const _colHemiNight = new THREE.Color(0x162447);
const _colHemiAsh = new THREE.Color(0x7a5460);
const _colGroundNight = new THREE.Color(0x05070c);
const _colKeyDay = new THREE.Color(0xfff5e0);
const _colKeySunset = new THREE.Color(0xff9b52);
const _colKeyMoon = new THREE.Color(0xa6c4ff);
const _colKeyAsh = new THREE.Color(0xff9666);
const _colSkyHDay = new THREE.Color(0xa8d8f8);
const _colSkyMDay = new THREE.Color(0x5aa4e8);
const _colSkyZDay = new THREE.Color(0x1e56a6);
const _colSkyHDusk = new THREE.Color(0xe67c44);
const _colSkyMDusk = new THREE.Color(0x5b3b68);
const _colSkyZDusk = new THREE.Color(0x161c3d);
const _colSkyHNight = new THREE.Color(0x050a16);
const _colSkyMNight = new THREE.Color(0x03060f);
const _colSkyZNight = new THREE.Color(0x010207);
const _tmpSkyH = new THREE.Color();
const _tmpSkyM = new THREE.Color();
const _tmpSkyZ = new THREE.Color();
const _tmpMist = new THREE.Color();
const _colBounceSand = new THREE.Color(0xdcb47d);
const _colBounceGrass = new THREE.Color(0x527a39);
const _colBounceWater = new THREE.Color(0x289cc4);
const _colBounceAsh = new THREE.Color(0x6e2610);
const _tmpBounce = new THREE.Color();
const _tmpSkySample = new THREE.Color();
const _tmpHorizonSample = new THREE.Color();
const _ikScratchL = { hipPitch: 0, kneeFlex: 0.06 };
const _ikScratchR = { hipPitch: 0, kneeFlex: 0.06 };
const _footL = { z: 0, yLift: 0, isStance: true, ankleRoll: 0 };
const _footR = { z: 0, yLift: 0, isStance: true, ankleRoll: 0 };
const _staticRes = { x: 0, z: 0 };
const _sweptRes = { x: 0, z: 0 };
const _chariotCcdRes = { x: 0, z: 0, blocked: false };
const _sepRes = { ax: 0, az: 0, bx: 0, bz: 0, collided: false };
const _chariotHullOffsets = [
  { zLocal: -1.15, r: 1.38 },
  { zLocal: 0.1, r: 1.38 },
  { zLocal: 1.4, r: 1.05 },
  { zLocal: 2.5, r: 0.9 },
];
const _chariotSpheresA = [
  { x: 0, z: 0, r: 1.38 },
  { x: 0, z: 0, r: 1.38 },
  { x: 0, z: 0, r: 1.05 },
  { x: 0, z: 0, r: 0.9 },
];
const _chariotSpheresB = [
  { x: 0, z: 0, r: 1.38 },
  { x: 0, z: 0, r: 1.38 },
  { x: 0, z: 0, r: 1.05 },
  { x: 0, z: 0, r: 0.9 },
];
const _nearestMountOut: {
  id: string;
  kind: 'RATHA' | 'HORSE' | 'ELEPHANT';
  index: number;
  label: string;
  occupiedCount: number;
  driverId: string | null;
  passengerId: string | null;
  isFull: boolean;
} = {
  id: '',
  kind: 'RATHA',
  index: 0,
  label: '',
  occupiedCount: 0,
  driverId: null,
  passengerId: null,
  isFull: false,
};

function getVehicleSeatLocalOffset(
  kind: LanVehicleKind,
  seatIndex: LanVehicleSeatIndex,
  seatHeightOverride?: number
): { x: number; y: number; z: number } {
  if (kind === 'RATHA') {
    if (seatIndex === 0) {
      return { x: 0, y: 0.62, z: -0.72 };
    }
    // Passenger Seat 1: archer standing cleanly on front-right teak deck inside the golden railing
    return { x: 0.5, y: 1.12, z: -0.12 };
  }
  if (kind === 'ELEPHANT') {
    const y = seatHeightOverride ?? 2.79;
    return seatIndex === 0
      ? { x: 0, y, z: 0.18 }
      : { x: 0, y, z: -0.34 };
  }
  // HORSE (Ashva): Seat 0 saddle center, Seat 1 tandem behind cantle on croup pad
  const y = seatHeightOverride ?? 0.88;
  return seatIndex === 0
    ? { x: 0, y, z: -0.02 }
    : { x: 0, y, z: -0.48 };
}

function computeVehicleSeatWorldPosition(
  vx: number,
  vy: number,
  vz: number,
  yaw: number,
  pitch: number,
  kind: LanVehicleKind,
  seatIndex: LanVehicleSeatIndex,
  out: { x: number; y: number; z: number },
  seatHeightOverride?: number
): void {
  const local = getVehicleSeatLocalOffset(kind, seatIndex, seatHeightOverride);
  const sinY = Math.sin(yaw);
  const cosY = Math.cos(yaw);
  if (kind === 'RATHA' && pitch !== 0) {
    const sinP = Math.sin(pitch);
    const cosP = Math.cos(pitch);
    const tiltedZ = -local.y * sinP + local.z * cosP;
    const tiltedY = local.y * cosP + local.z * sinP;
    out.x = vx + cosY * local.x + sinY * tiltedZ;
    out.z = vz - sinY * local.x + cosY * tiltedZ;
    out.y = vy + tiltedY;
    return;
  }
  out.x = vx + cosY * local.x + sinY * local.z;
  out.z = vz - sinY * local.x + cosY * local.z;
  out.y = vy + local.y;
}
const _topLampIndices = new Int32Array(8);
const _topLampDistSq = new Float64Array(8);
const _curseOffsets = [-0.24, 0, 0.24];
const DEMON_VARIANTS: readonly DemonVariant[] = [
  'BOAR_DEMON',
  'RABBIT_DEMON',
  'BRUTE_HUMAN',
  'SORCERER_HUMAN',
  'SHADOW_GHOST',
];
const TWO_PI = Math.PI * 2;

function evalFootTargetInto(
  legPhase: number,
  halfStep: number,
  liftH: number,
  out: { z: number; yLift: number; isStance: boolean; ankleRoll: number }
): void {
  const p = ((legPhase % TWO_PI) + TWO_PI) % TWO_PI;
  if (p < Math.PI) {
    const u = p / Math.PI;
    out.z = halfStep * (1 - 2 * u);
    out.yLift = 0;
    out.isStance = true;
    out.ankleRoll = THREE.MathUtils.lerp(-0.08, 0.14, u);
  } else {
    const u = (p - Math.PI) / Math.PI;
    out.z = -halfStep * Math.cos(Math.PI * u);
    out.yLift = liftH * Math.pow(Math.sin(Math.PI * u), 0.85);
    out.ankleRoll = Math.sin(u * Math.PI) * 0.24 - 0.1;
    out.isStance = false;
  }
}

/**
 * Exact Analytical Planar Two-Bone Leg Inverse Kinematics (Zero GC).
 * Solves hip X-pitch & anatomically clamped backward knee flex (kneeFlex >= 0)
 * so planted stance soles track target ground offset without foot sliding.
 */
export function solveTwoBoneLegIK(
  zFoot: number,
  yRelHip: number,
  thighL: number,
  shinL: number,
  out: { hipPitch: number; kneeFlex: number }
): void {
  const minReach = Math.abs(thighL - shinL) + 0.03;
  const maxReach = (thighL + shinL) * 0.994;
  const rawD = Math.hypot(zFoot, yRelHip);
  const d = THREE.MathUtils.clamp(rawD, minReach, maxReach);
  const targetFwdAngle = Math.atan2(zFoot, Math.max(0.05, -yRelHip));
  const cosAlpha = THREE.MathUtils.clamp(
    (d * d + thighL * thighL - shinL * shinL) / (2 * thighL * d),
    -1,
    1
  );
  const alpha = Math.acos(cosAlpha);
  const cosBeta = THREE.MathUtils.clamp(
    (thighL * thighL + shinL * shinL - d * d) / (2 * thighL * shinL),
    -1,
    1
  );
  const beta = Math.acos(cosBeta);
  out.hipPitch = THREE.MathUtils.clamp(-(targetFwdAngle + alpha), -1.42, 1.15);
  out.kneeFlex = THREE.MathUtils.clamp(Math.PI - beta, 0.04, 1.65);
}

function shortestAngleDiff(cur: number, tgt: number): number {
  let diff = tgt - cur;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function dampAngle(cur: number, tgt: number, lambda: number, dt: number): number {
  const diff = shortestAngleDiff(cur, tgt);
  return cur + diff * (1 - Math.exp(-lambda * dt));
}

export interface CharacterPoseState {
  leftHip: number;
  rightHip: number;
  leftKnee: number;
  rightKnee: number;
  leftAnkle: number;
  rightAnkle: number;
  leftLegZ: number;
  rightLegZ: number;
  leftArm: number;
  rightArm: number;
  leftArmZ: number;
  rightArmZ: number;
  leftElbow: number;
  rightElbow: number;
  hipY: number;
  torsoRotX: number;
  torsoRotY: number;
  torsoRotZ: number;
  pleatRotX: number;
  headRotX: number;
  headRotY: number;
}

export function createDefaultPoseState(hipY = 0.93): CharacterPoseState {
  return {
    leftHip: 0,
    rightHip: 0,
    leftKnee: 0.06,
    rightKnee: 0.06,
    leftAnkle: -0.04,
    rightAnkle: -0.04,
    leftLegZ: 0,
    rightLegZ: 0,
    leftArm: -0.1,
    rightArm: 0.03,
    leftArmZ: 0,
    rightArmZ: 0,
    leftElbow: -0.44,
    rightElbow: -0.22,
    hipY,
    torsoRotX: 0,
    torsoRotY: 0,
    torsoRotZ: 0,
    pleatRotX: -0.05,
    headRotX: 0,
    headRotY: 0,
  };
}

function resetPoseState(p: CharacterPoseState, hipY = 0.93): void {
  p.leftHip = 0;
  p.rightHip = 0;
  p.leftKnee = 0.06;
  p.rightKnee = 0.06;
  p.leftAnkle = -0.04;
  p.rightAnkle = -0.04;
  p.leftLegZ = 0;
  p.rightLegZ = 0;
  p.leftArm = -0.1;
  p.rightArm = 0.03;
  p.leftArmZ = 0;
  p.rightArmZ = 0;
  p.leftElbow = -0.44;
  p.rightElbow = -0.22;
  p.hipY = hipY;
  p.torsoRotX = 0;
  p.torsoRotY = 0;
  p.torsoRotZ = 0;
  p.pleatRotX = -0.05;
  p.headRotX = 0;
  p.headRotY = 0;
}

export interface QuadrupedAnimState {
  speedBlend: number;
  legX: [number, number, number, number];
  kneeX: [number, number, number, number];
  headX: number;
  headY: number;
  prevHeadX: number;
  tailX: number;
  tailZ: number;
  tailVelX: number;
  tailVelZ: number;
  maneX: number;
  maneZ: number;
  maneVelX: number;
  maneVelZ: number;
  forelockX: number;
  forelockZ: number;
  forelockVelX: number;
  forelockVelZ: number;
  prevYaw: number;
  yawRate: number;
  kinematicAccumDt: number;
}

function createDefaultQuadrupedState(initialYaw = 0): QuadrupedAnimState {
  return {
    speedBlend: 0,
    legX: [0, 0, 0, 0],
    kneeX: [0.04, 0.04, 0.04, 0.04],
    headX: 0.56,
    headY: 0,
    prevHeadX: 0.56,
    tailX: -0.06,
    tailZ: 0,
    tailVelX: 0,
    tailVelZ: 0,
    maneX: -0.34,
    maneZ: 0,
    maneVelX: 0,
    maneVelZ: 0,
    forelockX: -0.55,
    forelockZ: 0,
    forelockVelX: 0,
    forelockVelZ: 0,
    prevYaw: initialYaw,
    yawRate: 0,
    kinematicAccumDt: 0,
  };
}

interface ChariotEntity {
  id: string;
  rig: ChariotRig;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  speed: number;
  vx: number;
  vz: number;
  gaitPhase: number;
  steedStates: QuadrupedAnimState[];
  driverId: string | null;
  passengerId: string | null;
  occupancyEpoch: number;
  netSeq: number;
  driverSeq: number;
  hasRemoteSync: boolean;
  syncTargetX: number;
  syncTargetY: number;
  syncTargetZ: number;
  syncTargetYaw: number;
  syncTargetPitch: number;
  syncTargetSpeed: number;
  syncTargetVx: number;
  syncTargetVz: number;
  syncTargetGaitPhase: number;
}

interface EnemyEntity {
  id: string;
  rig: CharacterRig;
  variant: DemonVariant;
  isCommander: boolean;
  x: number;
  y: number;
  z: number;
  velY: number;
  yaw: number;
  hp: number;
  maxHp: number;
  attackCooldown: number;
  abilityCooldown: number;
  abilityState: 'IDLE' | 'WINDUP' | 'ACTIVE';
  abilityTimer: number;
  chargeDirX: number;
  chargeDirZ: number;
  strafeSign: number;
  walkPhase: number;
  alive: boolean;
  missionTag: string | null;
  pose: CharacterPoseState;
  speedBlend: number;
  hitReactTimer: number;
  hitReactPitch: number;
  hitReactYaw: number;
  ghostOpacity: number;
  kinematicAccumDt: number;
  burnTimer: number;
  burnDps: number;
  burnSparkAccum: number;
  bindTimer: number;
  liftOffset: number;
  stunTimer: number;
  customScale: number;
  dissolving: boolean;
  dissolveTimer: number;
  dissolveDuration: number;
  dissolveSparkAccum: number;
  lastDamageSource: AstraId | 'STANDARD' | 'CHAKRA';
  syncTargetX?: number;
  syncTargetY?: number;
  syncTargetZ?: number;
  syncTargetYaw?: number;
  pendingClaimDmg?: number;
}

interface RemotePlayerEntity {
  id: string;
  name: string;
  heroId: string;
  accentHex: string;
  rig: CharacterRig;
  auraRing: THREE.Mesh;
  nameplate: THREE.Sprite;
  nameplateTex: THREE.CanvasTexture;
  pose: CharacterPoseState;
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  yaw: number;
  targetYaw: number;
  vx: number;
  vz: number;
  horizSpeed: number;
  grounded: boolean;
  walkPhase: number;
  aiming: boolean;
  stealth: boolean;
  sprint: boolean;
  mountKind: MountKind;
  mountedVehicleId: string | null;
  seatIndex: LanVehicleSeatIndex | null;
  hp: number;
  maxHp: number;
  lastSeq: number;
  lastUpdateMs: number;
}

interface AnimalMountEntity {
  id: string;
  kind: 'HORSE' | 'ELEPHANT';
  label: string;
  horseRig?: RoyalHorseRig;
  elephantRig?: ElephantRig;
  homeX: number;
  homeY: number;
  homeZ: number;
  homeYaw: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  vx: number;
  vz: number;
  gaitPhase: number;
  animState: QuadrupedAnimState;
  driverId: string | null;
  passengerId: string | null;
  occupancyEpoch: number;
  netSeq: number;
  driverSeq: number;
  hasRemoteSync: boolean;
  syncTargetX: number;
  syncTargetY: number;
  syncTargetZ: number;
  syncTargetYaw: number;
  syncTargetSpeed: number;
  syncTargetVx: number;
  syncTargetVz: number;
  syncTargetGaitPhase: number;
}

interface CitizenEntity {
  rig: CharacterRig;
  poolKey: string;
  role: NpcRole;
  x: number;
  y: number;
  z: number;
  homeX: number;
  homeZ: number;
  yaw: number;
  walkPhase: number;
  patrolTimer: number;
  courtSeat: SabhaSeatDef | null;
  seated: boolean;
  canSwim: boolean;
  isSwimming: boolean;
  navQueue: Array<{ x: number; y: number; z: number }>;
  navCursor: number;
  pose: CharacterPoseState;
  speedBlend: number;
  kinematicAccumDt: number;
}

interface ProjectileEntity {
  mesh: THREE.Group;
  spinPivot?: THREE.Group;
  archetype: ProjectileArchetypeId;
  clientShotId: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  elapsedFlightSec: number;
  spinAngle: number;
  isChakra: boolean;
  stealthAmbush: boolean;
  life: number;
  astraId: AstraId | null;
  isSplitSerpent?: boolean;
  homingTargetId?: string | null;
  piercedEnemyIds?: Set<string>;
  strikeCount?: number;
  poolKey: string;
  serverRejected?: boolean;
  isRemoteVisualOnly?: boolean;
}

interface EnemyProjectileEntity {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
  drainPrana: number;
  life: number;
}

interface GroundHazardEntity {
  mesh: THREE.Mesh;
  kind: 'CURSE_SIGIL' | 'GADA_WAVE';
  x: number;
  y: number;
  z: number;
  radius: number;
  maxRadius: number;
  damage: number;
  timer: number;
  duration: number;
  detonated: boolean;
}

interface BlastEffect {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

export interface EngineCallbacks {
  onHudUpdate: (snapshot: WorldHudSnapshot) => void;
  onModeChange: (mode: PlayMode) => void;
}

export class RamayanaWorldEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private resizeObserver: ResizeObserver | null = null;
  private textures: ProceduralTextures | null = null;
  private poolManager: ObjectPoolManager;
  private occlusionManager = new OcclusionCullingManager();
  private hardwareEnvelope: HardwareEnvelope;
  private qualityManager: QualityManager;
  private dynamicScaler: DynamicAssetScaler;
  private lodCache: MobileLodAssetCache | null = null;
  private loadAbort = new AbortController();
  private worldReady = false;
  private pendingPlayOnReady = false;
  private assetProgress = 0;
  private assetStage = 'Initializing realm...';
  private blipPool: RadarBlip[] = [];
  private activeBlips: RadarBlip[] = [];
  private hudBlipsSnapshot: RadarBlip[] = [];
  private lastHudKey = '';
  private hemiLight: THREE.HemisphereLight;
  private giLightProbe: THREE.LightProbe;
  private bounceLight: THREE.DirectionalLight;
  private keyLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private torchShadowLight: THREE.SpotLight;
  private heroFillLight: THREE.PointLight;
  private combatLight: THREE.PointLight;
  private volcanoGlowLight: THREE.PointLight;
  private sabhaBounceLight: THREE.RectAreaLight | null = null;
  private palaceBounceLight: THREE.RectAreaLight | null = null;
  private isSoftwareGl: boolean;
  private shivlingWaterUniforms: { uTime: { value: number } } | null = null;
  private lampHaloPoints: THREE.Points | null = null;
  private lampHaloUniforms: { uOpacity: { value: number } } | null = null;
  private starCountMax = 2400;
  private ffCountMax = 190;
  private volcanicBombCountMax = 48;
  private volcanicSmokeCountMax = 72;
  private riverFishCountMax = 240;
  private stepwellKoiCountMax = 22;
  private tabPaused = false;
  private lampCoords: [number, number][] = [];
  private torchFlamesOuter: THREE.InstancedMesh | null = null;
  private torchFlamesCore: THREE.InstancedMesh | null = null;
  private torchFlameAnchors: Array<{ x: number; y: number; z: number; phase: number }> = [];
  private palaceTorchAnchors: Array<{ x: number; y: number; z: number; phase: number }> = [];
  private volcanoCraters: Array<{ x: number; y: number; z: number; radius: number }> = [];
  private volcanicBombMesh: THREE.InstancedMesh | null = null;
  private volcanicBombs: Array<{
    craterIdx: number;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    scale: number;
    rot: number;
  }> = [];
  private volcanicSmokeMesh: THREE.InstancedMesh | null = null;
  private volcanicSmokePuffs: Array<{
    baseX: number;
    baseY: number;
    baseZ: number;
    age: number;
    life: number;
    scale: number;
    driftX: number;
    driftZ: number;
  }> = [];

  private ramRig!: CharacterRig;
  private chariots: ChariotEntity[] = [];
  private animalTemplates: Array<{
    id: string;
    kind: 'HORSE' | 'ELEPHANT';
    label: string;
    horseRig?: RoyalHorseRig;
    elephantRig?: ElephantRig;
    homeX: number;
    homeY: number;
    homeZ: number;
    homeYaw: number;
  }> = [];
  private animals: AnimalMountEntity[] = [];
  private enemies: EnemyEntity[] = [];
  private citizens: CitizenEntity[] = [];
  private projectiles: ProjectileEntity[] = [];
  private enemyProjectiles: EnemyProjectileEntity[] = [];
  private groundHazards: GroundHazardEntity[] = [];
  private blasts: BlastEffect[] = [];
  private colliders: BoxCollider[] = [];
  private circleColliders: CircleCollider[] = [];
  private colliderGrid: StaticColliderSpatialGrid | null = null;
  private maxAnisotropy = 1;
  private simFrameCounter = 0;
  private beaconGroup: THREE.Group | null = null;
  private waterMesh: THREE.Mesh | null = null;
  private skyDome: THREE.Mesh | null = null;
  private sunDisc: THREE.Mesh | null = null;
  private sabhaSeats: SabhaSeatDef[] = [];
  private roofOccluders: RoofOccluder[] = [];
  private palaceStoryGroups: THREE.Group[] = [];
  private palaceTopRoofGroup: THREE.Group | null = null;
  private riverTurtles: Array<{
    root: THREE.Group;
    flippers: THREE.Group[];
    headGroup: THREE.Group;
    z: number;
    xOff: number;
    phase: number;
  }> = [];
  private riverCrocodiles: Array<{
    root: THREE.Group;
    tailPivot: THREE.Group;
    z: number;
    xOff: number;
    speed: number;
    phase: number;
  }> = [];
  private riverJellyfish: Array<{
    root: THREE.Group;
    bell: THREE.Mesh;
    xOff: number;
    baseY: number;
    z: number;
    phase: number;
  }> = [];
  private riverDolphins: Array<{
    root: THREE.Group;
    tailPivot: THREE.Group;
    z: number;
    xOff: number;
    phase: number;
  }> = [];
  private riverSharks: Array<{
    root: THREE.Group;
    tailPivot: THREE.Group;
    z: number;
    xOff: number;
    baseY: number;
    speed: number;
    phase: number;
  }> = [];
  private riverFishMesh: THREE.InstancedMesh | null = null;
  private riverFishAgents: Array<{
    z: number;
    xOff: number;
    depthY: number;
    speed: number;
    phase: number;
    scale: number;
  }> = [];
  private stepwellKoiMesh: THREE.InstancedMesh | null = null;
  private stepwellKoiAgents: Array<{
    angle: number;
    radius: number;
    depthY: number;
    speed: number;
    phase: number;
  }> = [];
  private stepwellTurtles: Array<{
    root: THREE.Group;
    flippers: THREE.Group[];
    headGroup: THREE.Group;
    angle: number;
    radius: number;
    phase: number;
  }> = [];
  private ascensionActive = false;
  private ascensionElapsed = 0;
  private ascensionCompleted = false;

  private frameId: number = 0;
  private clock = new THREE.Clock();
  private disposed = false;
  private mode: PlayMode = 'TITLE';

  // Player state
  private playerX = 0;
  private playerY = 0;
  private playerZ = 14;
  private playerVelY = 0;
  private playerYaw = Math.PI; // facing north toward Lord Mahadev sanctuary initially
  private playerHorizSpeed = 0;
  private playerTurnRate = 0;
  private walkPhase = 0;
  private lastResolvedMoveSpeed = 0;
  private grounded = true;
  private hp = 100;
  private maxHp = 100;
  private prana = 100;
  private maxPrana = 100;
  private karma = 0;
  private wantedLevel = 0;
  private fireCooldown = 0;
  private bowDrawHoldTimer = 0;
  private chakraCooldown = 0;
  private readonly chakraMaxCooldown = 10.0;
  private mountedChariotIndex: number | null = null;
  private mountedAnimalIndex: number | null = null;
  private mountedSeatIndex: LanVehicleSeatIndex | null = null;
  private activeHeroId: PlayableHeroId = 'RAM';
  private heroRigs = new Map<PlayableHeroId, CharacterRig>();
  private isFlying = false;
  private heroAbilityCooldown = 0;
  private heroAbilityMaxCooldown = HERO_PROFILES.RAM.specialCooldownSec;
  private flyWindAccum = 0;
  private floatingIslands: THREE.Group[] = [];
  private floatingIslandDefs: Array<{
    x: number;
    z: number;
    baseY: number;
    scale: number;
    phase: number;
    group: THREE.Group;
  }> = [];
  private floatingIslandWfUniforms: Array<{ uTime: { value: number } }> = [];
  private composer: EffectComposer | null = null;
  private composerRenderTarget: THREE.WebGLRenderTarget | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private postPass: ShaderPass | null = null;
  private underwaterSoftwareQuad: THREE.Mesh | null = null;
  private skyUniforms: {
    uHorizonColor: { value: THREE.Color };
    uMidColor: { value: THREE.Color };
    uZenithColor: { value: THREE.Color };
    uSunDir: { value: THREE.Vector3 };
    uMoonDir: { value: THREE.Vector3 };
    uTwilight: { value: number };
    uNightFactor: { value: number };
    uTime: { value: number };
    uCloudDetail: { value: number };
  } | null = null;
  private terrainShaderUniforms: {
    uSlopeDetail: { value: number };
    uTerrTime: { value: number };
  } | null = null;
  private waterShaderUniforms: {
    uTime: { value: number };
    uDaylight: { value: number };
    uSunDir: { value: THREE.Vector3 };
  } | null = null;
  private waterfallShaderUniforms: {
    uTime: { value: number };
    uDaylight: { value: number };
  } | null = null;
  private foliageWindUniforms: {
    uWindTime: { value: number };
  } | null = null;
  private torchFlameUniforms: {
    uFlameTime: { value: number };
  } | null = null;
  private sunHaloSprite: THREE.Sprite | null = null;
  private moonGroup: THREE.Group | null = null;
  private moonHaloSprite: THREE.Sprite | null = null;
  private starPoints: THREE.Points | null = null;
  private starUniforms: { uTime: { value: number }; uOpacity: { value: number } } | null = null;
  private fireflyPoints: THREE.Points | null = null;
  private fireflyUniforms: { uTime: { value: number }; uOpacity: { value: number } } | null = null;
  private nightLampLights: THREE.PointLight[] = [];
  private lampBulbMat: THREE.MeshStandardMaterial | null = null;
  private dayTime = 0.34; // Cycles 0..1 continuously through Day -> Sunset -> Starry Night -> Dawn
  private nightFactor = 0;
  private daylightFactor = 1;
  private cameraSubmerged = 0;
  private cameraSubDepthFactor = 0;
  private chariotAutoWaypoints: Array<{ x: number; z: number }> = [];
  private chariotAutoWpIdx = 0;
  private chariotAutoGoalKey = '';
  private chariotReverseIntent = false;
  private seatedOnThrone = false;
  private isRamSwimming = false;
  private autoDriveActive = false;
  private stealthActive = false;
  private stealthSpotted = false;
  private stealthRootMatsCache = new Map<THREE.Object3D, THREE.Material[]>();
  private stealthMaterialCache = new Map<
    THREE.Material,
    {
      opacity: number;
      transparent: boolean;
      depthWrite: boolean;
      emissiveHex: number;
      emissiveIntensity: number;
    }
  >();

  // Damped Ram pose state & motion-matching continuity channels (zero snapping)
  private ramWasGrounded = true;
  private ramLandingImpact = 0;
  private ramPose: CharacterPoseState = createDefaultPoseState(0.93);

  // Standalone Camera Perspective System (toggles between First-Person & Waist-Up Second-Person)
  private readonly cameraSystem = new CameraPerspectiveController();
  private camYaw = 0;
  private camPitch = 0.02;
  private cameraManualHold = 0;
  private camChariotLockTimer = 0;
  private camSmoothPos = new THREE.Vector3(0, 1.72, 14);
  private camSmoothLook = new THREE.Vector3(0, 1.72, 2);
  private readonly _spCamPos = new THREE.Vector3();
  private readonly _spCamTarget = new THREE.Vector3();
  private readonly _spTorsoWorld = new THREE.Vector3();
  private swimCamTorsoPitch = 0.25;

  // Mission & Divine Astras Quest state
  private missionIdx = 0;
  private missionProgress = 0;
  private completedMissions = 0;
  private spawnTimer = 0;
  private hudEmitAccum = 0;
  private webglError: string | null = null;
  private contextLost = false;
  private contextRestoring = false;
  private contextRecoveryTimer = 0;
  private contextLossCount = 0;
  private contextRebuildAttempts = 0;
  private boundContextLostHandler: ((e: Event) => void) | null = null;
  private boundContextRestoredHandler: (() => void) | null = null;
  private envRenderTarget: THREE.WebGLRenderTarget | null = null;

  private lanClient: LanMultiplayerClient | null = null;
  private remotePlayers = new Map<string, RemotePlayerEntity>();
  private lanSyncAccum = 0;
  private lanSnapSeq = 0;
  private lanWorldSnapshotSeq = 0;
  private lastAppliedWorldSnapshotSeq = 0;
  private vehicleActionSeq = 0;
  private pendingVehicleAction: {
    actionId: string;
    vehicleId: string;
    action: LanVehicleActionKind;
    preferredSeat?: LanVehicleSeatIndex;
    seq: number;
    sentCount: number;
    nextRetryAtMs: number;
    startedAtMs: number;
  } | null = null;
  private recentHostActionAcks = new Map<string, LanVehicleActionAckMessage>();
  private mountNoticeText: string | null = null;
  private mountNoticeExpiresMs = 0;
  private readonly _seatWorldScratch = { x: 0, y: 0, z: 0 };
  private readonly _coRiderHeadScratch = new THREE.Vector3();
  private lanLocalPlayerName = 'Lord Ram';
  private lanLocalHeroId = 'RAM';

  private astraVfx: AstraVfxManager | null = null;
  private astraQuest: AstraQuestSystem | null = null;
  private astraEnergy = ASTRA_MAX_ENERGY;
  private astraCooldowns: Record<AstraId, number> = {
    AGNEYASTRA: 0,
    VARUNASTRA: 0,
    VAYAVYASTRA: 0,
    NAGASTRA: 0,
    BRAHMASTRA: 0,
  };
  private brahmaSummonPhase:
    | 'IDLE'
    | 'NAMASKAR'
    | 'RAISE_HAND'
    | 'BLACK_FADE'
    | 'CYCLONE_SKY'
    | 'LIGHTNING_STRIKE'
    | 'LOTUS_APPEAR'
    | 'AIM_READY' = 'IDLE';
  private brahmaSummonTimer = 0;
  private brahmaFadeAlpha = 0;
  private brahmaFlashAlpha = 0;
  private brahmaCycloneMood = 0;
  private brahmaLightningFired = false;
  private cameraShakeAmount = 0;
  private slowMoTimer = 0;
  private slowMoFactor = 1.0;
  private showStoryIntro = false;
  private projectileSync = new ProjectileSyncClient();
  private readonly _projKinScratch: ProjectileKinematicsState = {
    archetype: 'ARROW',
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    elapsedSec: 0,
    spinAngle: 0,
  };
  private readonly _projCasterScratch: Vec3Like = { x: 0, y: 0, z: 0 };
  private readonly _projCasterVelScratch: Vec3Like = { x: 0, y: 0, z: 0 };
  private readonly _projTargetScratch: Vec3Like = { x: 0, y: 0, z: 0 };

  // Input buffer updated externally
  public input: InputState = {
    moveX: 0,
    moveY: 0,
    cameraDeltaX: 0,
    cameraDeltaY: 0,
    sprint: false,
    jumpPressed: false,
    fireHeld: false,
    astraPressed: false,
    shootAstraPressed: false,
    selectedAstra: null,
    interactPressed: false,
    switchSeatPressed: false,
    stealthTogglePressed: false,
    autoDriveTogglePressed: false,
    flyTogglePressed: false,
    heroSpecialPressed: false,
  };

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    this.hardwareEnvelope = probeHardwareEnvelope();
    this.isSoftwareGl = this.hardwareEnvelope.isSoftwareGl;

    this.qualityManager = new QualityManager(this.hardwareEnvelope);
    const initProfile = this.qualityManager.getProfile();
    this.dynamicScaler = new DynamicAssetScaler(
      this.hardwareEnvelope,
      initProfile
    );

    this.renderer = this.createRenderer(initProfile);
    this.maxAnisotropy = Math.max(1, this.renderer.capabilities.getMaxAnisotropy());
    container.appendChild(this.renderer.domElement);
    this.attachContextListeners(this.renderer.domElement);

    // Scene with zero atmospheric fog & crystal-clear azure sky dome
    this.scene = new THREE.Scene();
    const clearSkyColor = new THREE.Color(0xa8d8f8);
    this.scene.background = clearSkyColor;
    this.scene.fog = null;

    const initW = Math.max(1, container.clientWidth || window.innerWidth || 844);
    const initH = Math.max(1, container.clientHeight || window.innerHeight || 390);
    const initAspect = initW / initH;
    this.camera = new THREE.PerspectiveCamera(
      62,
      initAspect,
      FP_CAMERA_NEAR,
      initProfile.cameraFar
    );

    // Synchronous lightweight sky & studio lights so Title frame renders immediately at 60 FPS while heavy realm geometry streams in
    if (!this.isSoftwareGl) {
      RectAreaLightUniformsLib.init();
    }

    // Global Illumination System: L0/L1/L2 Spherical Harmonics LightProbe + Sky/Ground Hemi + Dynamic Ground Bounce + Crisp Real-Time Shadows
    this.giLightProbe = new THREE.LightProbe(new THREE.SphericalHarmonics3(), 0.72);
    this.scene.add(this.giLightProbe);

    this.hemiLight = new THREE.HemisphereLight(0xffe7bd, 0x5c4f3d, 1.18);
    this.scene.add(this.hemiLight);

    this.bounceLight = new THREE.DirectionalLight(0xdcb47d, 0.42);
    this.bounceLight.position.set(0, -18, 0);
    this.bounceLight.castShadow = false;
    this.scene.add(this.bounceLight);
    this.scene.add(this.bounceLight.target);

    this.keyLight = new THREE.DirectionalLight(0xfff5e0, 2.25);
    this.keyLight.position.set(48, 72, 36);
    this.keyLight.castShadow =
      !this.isSoftwareGl && initProfile.shadowsEnabled;
    const maxShadowTex = this.renderer.capabilities.maxTextureSize || 2048;
    const clampedKeyShadow = Math.min(maxShadowTex, initProfile.keyShadowSize);
    this.keyLight.shadow.mapSize.set(clampedKeyShadow, clampedKeyShadow);
    const d = initProfile.shadowFrustumHalf;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.camera.near = 4;
    this.keyLight.shadow.camera.far = 148;
    this.keyLight.shadow.bias = -0.00012;
    this.keyLight.shadow.normalBias = 0.016;
    this.keyLight.shadow.radius = 1.0;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    this.rimLight = new THREE.DirectionalLight(0xd4e6ff, 0.82);
    this.rimLight.position.set(-18, 12, -22);
    this.scene.add(this.rimLight);
    this.scene.add(this.rimLight.target);

    // Secondary Dynamic Shadow-Casting SpotLight for nearest active Street Lamp / Torch flame at night (disabled in daytime & LOW tier)
    this.torchShadowLight = new THREE.SpotLight(0xff9b38, 0, 28, Math.PI * 0.44, 0.6, 1.4);
    this.torchShadowLight.castShadow = false;
    const initTorchShadowSize = Math.max(256, initProfile.torchShadowSize || 512);
    this.torchShadowLight.shadow.mapSize.set(initTorchShadowSize, initTorchShadowSize);
    this.torchShadowLight.shadow.camera.near = 0.4;
    this.torchShadowLight.shadow.camera.far = 28;
    this.torchShadowLight.shadow.bias = -0.00025;
    this.torchShadowLight.shadow.normalBias = 0.02;
    this.scene.add(this.torchShadowLight);
    this.scene.add(this.torchShadowLight.target);

    // Warm Architectural Bounce RectAreaLights inside Sabha & Palace portals (desktop HIGH only for mobile fillrate budget)
    if (!this.isSoftwareGl) {
      const allowAreaBounce = initProfile.tier === 'HIGH' && !this.hardwareEnvelope.isMobile;
      this.sabhaBounceLight = new THREE.RectAreaLight(0xffcfa0, 2.2, 8.5, 4.0);
      this.sabhaBounceLight.position.set(SABHA_HALL_POS.x, groundHeightAt(SABHA_HALL_POS.x, SABHA_HALL_POS.z) + 4.4, SABHA_HALL_POS.z);
      this.sabhaBounceLight.lookAt(SABHA_HALL_POS.x, 0, SABHA_HALL_POS.z);
      this.sabhaBounceLight.visible = allowAreaBounce;
      this.scene.add(this.sabhaBounceLight);

      this.palaceBounceLight = new THREE.RectAreaLight(0xffd4a8, 2.0, 9.0, 4.2);
      this.palaceBounceLight.position.set(PALACE_CORE_POS.x, groundHeightAt(PALACE_CORE_POS.x, PALACE_CORE_POS.z) + 4.6, PALACE_CORE_POS.z);
      this.palaceBounceLight.lookAt(PALACE_CORE_POS.x, 0, PALACE_CORE_POS.z);
      this.palaceBounceLight.visible = allowAreaBounce;
      this.scene.add(this.palaceBounceLight);
    }

    // Subtle dynamic ground/lamp warm bounce light near Lord Ram for muscular definition
    this.heroFillLight = new THREE.PointLight(0xffba6b, 0.65, 11, 1.6);
    this.scene.add(this.heroFillLight);

    // Dynamic combat / Agneyastra PointLight that illuminates temples & warriors during impacts
    this.combatLight = new THREE.PointLight(0xff7d24, 0, 24, 1.5);
    this.scene.add(this.combatLight);

    // Volcano Crater Lava Warmth Glow (2.5 km east at Demon Village)
    this.volcanoGlowLight = new THREE.PointLight(0xff4a12, 3.6, 260, 1.15);
    this.volcanoGlowLight.position.set(DEMON_VILLAGE_CENTER_X + 60, 62, DEMON_VILLAGE_CENTER_Z - 18);
    this.scene.add(this.volcanoGlowLight);

    // Dynamic Starlight + Pooled Street Lamp & Torch PointLights for Exclusive Night Illumination
    for (let i = 0; i < 8; i++) {
      const lp = new THREE.PointLight(0xff9b38, 0, 26, 1.4);
      this.scene.add(lp);
      this.nightLampLights.push(lp);
    }

    // Unified Post-Processing Pipeline: lightweight screen-space edge smoothing (~35%-40% sharpness retention) + underwater volume + OutputPass.
    const rtWidth = container.clientWidth || window.innerWidth;
    const rtHeight = container.clientHeight || window.innerHeight;
    if (!this.isSoftwareGl) {
      this.rebuildPostComposer(rtWidth, rtHeight, initProfile);
    } else {
      const swOverlayMat = new THREE.ShaderMaterial({
        uniforms: {
          uSubmerged: { value: 0.0 },
          uDepthFactor: { value: 0.0 },
          uTime: { value: 0.0 },
          uDaylight: { value: 1.0 },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uSubmerged;
          uniform float uDepthFactor;
          uniform float uTime;
          uniform float uDaylight;
          varying vec2 vUv;
          void main() {
            if (uSubmerged <= 0.002) discard;
            vec3 shallowWater = vec3(0.06, 0.42, 0.72) * mix(0.32, 1.0, uDaylight);
            vec3 deepWater = vec3(0.02, 0.16, 0.36) * mix(0.32, 1.0, uDaylight);
            vec3 tint = mix(shallowWater, deepWater, uDepthFactor);
            float causticA = sin(vUv.x * 16.0 + uTime * 1.6 + sin(vUv.y * 8.0 + uTime));
            float causticB = cos(vUv.x * 23.0 - uTime * 1.2 + vUv.y * 11.0);
            float caustic = pow(max(0.0, causticA * causticB), 3.0) * (1.0 - vUv.y * 0.85) * (1.0 - uDepthFactor * 0.65);
            tint += vec3(0.28, 0.74, 1.0) * caustic * 0.35;
            float distCenter = length(vUv - vec2(0.5));
            float vig = smoothstep(0.32, 0.95, distCenter);
            float alpha = uSubmerged * (0.42 + 0.22 * uDepthFactor + 0.18 * vig);
            gl_FragColor = vec4(tint, clamp(alpha, 0.0, 0.82));
          }
        `,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      this.underwaterSoftwareQuad = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        swOverlayMat
      );
      this.underwaterSoftwareQuad.frustumCulled = false;
      this.underwaterSoftwareQuad.renderOrder = 999;
      this.underwaterSoftwareQuad.visible = false;
      this.camera.add(this.underwaterSoftwareQuad);
      this.scene.add(this.camera);
    }

    this.poolManager = new ObjectPoolManager(this.scene);

    window.addEventListener('resize', this.handleResize);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(this.container);
    }
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.emitHud();
    this.startLoop();
    void this.initializeWorldAsync();
  }

  private createRenderer(profile: QualityProfile): THREE.WebGLRenderer {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = profile.toneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(this.getEffectivePixelRatio(profile));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !this.isSoftwareGl;
    renderer.shadowMap.type = profile.shadowType;
    renderer.shadowMap.autoUpdate = profile.tier !== 'LOW';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.imageRendering = 'auto';
    return renderer;
  }

  private attachContextListeners(canvas: HTMLCanvasElement): void {
    this.detachContextListeners(canvas);
    this.boundContextLostHandler = (e: Event) => {
      e.preventDefault();
      this.handleWebglContextLost(e);
    };
    this.boundContextRestoredHandler = () => {
      this.handleWebglContextRestored();
    };
    canvas.addEventListener('webglcontextlost', this.boundContextLostHandler, false);
    canvas.addEventListener('webglcontextrestored', this.boundContextRestoredHandler, false);
  }

  private detachContextListeners(canvas: HTMLCanvasElement): void {
    if (this.boundContextLostHandler) {
      canvas.removeEventListener('webglcontextlost', this.boundContextLostHandler, false);
    }
    if (this.boundContextRestoredHandler) {
      canvas.removeEventListener('webglcontextrestored', this.boundContextRestoredHandler, false);
    }
  }

  private regenerateEnvironmentProbe(): void {
    this.envRenderTarget?.dispose();
    this.envRenderTarget = null;
    this.scene.environment = null;
    const profile = this.qualityManager.getProfile();
    if (!profile.allowEnvIbl || this.dynamicScaler.isEnvStripped()) {
      return;
    }
    // Synthesize a warm golden-hour Ayodhya sky/sun/terracotta-meadow equirectangular IBL probe
    const eqCanvas = document.createElement('canvas');
    eqCanvas.width = 256;
    eqCanvas.height = 128;
    const ctx = eqCanvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0.0, '#36609e');
      grad.addColorStop(0.28, '#7eaad4');
      grad.addColorStop(0.46, '#f6d8a8');
      grad.addColorStop(0.52, '#c89b62');
      grad.addColorStop(0.68, '#7d623e');
      grad.addColorStop(1.0, '#3e4729');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 128);

      // Warm golden solar specular reflection lobe for bronze/gold armor, water & marble
      const sunGrad = ctx.createRadialGradient(168, 36, 2, 168, 36, 46);
      sunGrad.addColorStop(0.0, 'rgba(255, 250, 232, 0.96)');
      sunGrad.addColorStop(0.32, 'rgba(255, 214, 138, 0.58)');
      sunGrad.addColorStop(1.0, 'rgba(255, 190, 110, 0.0)');
      ctx.fillStyle = sunGrad;
      ctx.fillRect(110, 0, 116, 92);

      // Soft cool skylight counter-fill lobe
      const coolGrad = ctx.createRadialGradient(48, 30, 4, 48, 30, 42);
      coolGrad.addColorStop(0.0, 'rgba(182, 214, 255, 0.45)');
      coolGrad.addColorStop(1.0, 'rgba(130, 175, 240, 0.0)');
      ctx.fillStyle = coolGrad;
      ctx.fillRect(0, 0, 100, 80);
    }

    const eqTex = new THREE.CanvasTexture(eqCanvas);
    eqTex.colorSpace = THREE.SRGBColorSpace;
    eqTex.mapping = THREE.EquirectangularReflectionMapping;
    eqTex.needsUpdate = true;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    this.envRenderTarget = pmrem.fromEquirectangular(eqTex);
    this.scene.environment = this.envRenderTarget.texture;
    eqTex.dispose();
    eqCanvas.width = 0;
    eqCanvas.height = 0;
    pmrem.dispose();
  }

  private handleWebglContextLost(e?: Event): void {
    e?.preventDefault?.();
    if (this.disposed) return;
    if (!this.contextLost) {
      this.contextLost = true;
      this.contextLossCount++;
    }
    // Keep UI free of blocking/paused error banners during automatic silent recovery
    this.webglError = null;
    if (!this.tabPaused) {
      this.scheduleContextRecoveryWatchdog(220);
    }
  }

  private handleWebglContextRestored(): void {
    if (this.disposed) return;
    this.contextRebuildAttempts = 0;
    this.restoreAllGpuAssetsSilently(false);
  }

  private scheduleContextRecoveryWatchdog(initialDelayMs = 220): void {
    if (this.disposed || this.contextRestoring) return;
    clearTimeout(this.contextRecoveryTimer);
    this.contextRecoveryTimer = window.setTimeout(() => {
      if (this.disposed || this.tabPaused || !this.contextLost) return;
      const gl = this.renderer.getContext();
      if (gl && !gl.isContextLost()) {
        // Context quietly became valid again without firing webglcontextrestored
        this.restoreAllGpuAssetsSilently(false);
        return;
      }
      try {
        gl?.getExtension('WEBGL_lose_context')?.restoreContext();
      } catch {
        // Ignore if driver disallows programmatic restoreContext
      }
      // Fallback: if native context restoration did not trigger, hot-swap WebGLRenderer in place
      clearTimeout(this.contextRecoveryTimer);
      this.contextRecoveryTimer = window.setTimeout(() => {
        if (this.disposed || this.tabPaused || !this.contextLost) return;
        const postGl = this.renderer.getContext();
        if (postGl && !postGl.isContextLost()) {
          this.restoreAllGpuAssetsSilently(false);
        } else {
          this.rebuildRendererInPlace();
        }
      }, 720);
    }, initialDelayMs);
  }

  private rebuildRendererInPlace(): void {
    if (this.disposed || this.contextRestoring) return;
    this.contextRestoring = true;
    clearTimeout(this.contextRecoveryTimer);

    // Step down quality tier once on context loss so restored buffers demand less VRAM
    if (this.contextLossCount > 0) {
      this.qualityManager.stepDownOnContextLoss();
    }

    const oldRenderer = this.renderer;
    const oldCanvas = oldRenderer.domElement;

    try {
      this.bloomPass?.dispose();
    } catch {
      // Ignore
    }
    this.bloomPass = null;
    try {
      this.composer?.dispose();
    } catch {
      // Ignore disposal errors on a lost context
    }
    this.composer = null;
    try {
      this.composerRenderTarget?.dispose();
    } catch {
      // Ignore
    }
    this.composerRenderTarget = null;
    try {
      this.envRenderTarget?.dispose();
    } catch {
      // Ignore
    }
    this.envRenderTarget = null;
    this.scene.environment = null;
    try {
      this.keyLight.shadow.map?.dispose();
    } catch {
      // Ignore
    }
    this.keyLight.shadow.map = null;
    try {
      this.torchShadowLight.shadow.map?.dispose();
    } catch {
      // Ignore
    }
    this.torchShadowLight.shadow.map = null;

    this.detachContextListeners(oldCanvas);
    try {
      oldRenderer.dispose();
    } catch {
      // Ignore
    }
    if (oldCanvas.parentNode === this.container) {
      this.container.removeChild(oldCanvas);
    }

    try {
      const nextProfile = this.qualityManager.getProfile();
      const nextRenderer = this.createRenderer(nextProfile);
      this.renderer = nextRenderer;
      this.maxAnisotropy = Math.max(1, this.renderer.capabilities.getMaxAnisotropy());
      if (this.container.firstChild) {
        this.container.insertBefore(this.renderer.domElement, this.container.firstChild);
      } else {
        this.container.appendChild(this.renderer.domElement);
      }
      this.attachContextListeners(this.renderer.domElement);
      this.contextRebuildAttempts = 0;
      this.contextRestoring = false;
      this.restoreAllGpuAssetsSilently(true);
    } catch {
      this.contextRestoring = false;
      this.contextRebuildAttempts++;
      if (this.contextRebuildAttempts <= 4) {
        this.contextRecoveryTimer = window.setTimeout(() => {
          if (!this.disposed && !this.tabPaused) {
            this.rebuildRendererInPlace();
          }
        }, 650);
      } else {
        this.webglError = 'WebGL graphics recovery failed. Reload to resume.';
        this.emitHud();
      }
    }
  }

  private restoreAllGpuAssetsSilently(alreadySteppedDown = false): void {
    if (this.disposed || this.contextRestoring) return;
    this.contextRestoring = true;
    clearTimeout(this.contextRecoveryTimer);

    const gl = this.renderer.getContext();
    if (!gl || gl.isContextLost()) {
      this.contextRestoring = false;
      this.scheduleContextRecoveryWatchdog(250);
      return;
    }

    try {
      if (!alreadySteppedDown && this.contextLossCount > 0) {
        this.qualityManager.stepDownOnContextLoss();
      }

      if (!this.isSoftwareGl) {
        RectAreaLightUniformsLib.init();
      }

      this.regenerateEnvironmentProbe();
      this.textures?.reuploadAll();
      this.astraVfx?.reuploadGpuResources();

      this.keyLight.shadow.map?.dispose();
      this.keyLight.shadow.map = null;
      this.keyLight.shadow.needsUpdate = true;
      this.torchShadowLight.shadow.map?.dispose();
      this.torchShadowLight.shadow.map = null;
      this.torchShadowLight.shadow.needsUpdate = true;

      const markTex = (tex: unknown): void => {
        if (tex && (tex as THREE.Texture).isTexture) {
          (tex as THREE.Texture).needsUpdate = true;
        }
      };

      const refreshMat = (mat: THREE.Material): void => {
        mat.needsUpdate = true;
        if ((mat as THREE.ShaderMaterial).isShaderMaterial) {
          const uniforms = (mat as THREE.ShaderMaterial).uniforms;
          if (uniforms) {
            for (const key in uniforms) {
              const entry = uniforms[key];
              if (entry && entry.value) {
                markTex(entry.value);
              }
            }
          }
          return;
        }
        const m = mat as unknown as Record<string, unknown>;
        markTex(m.map);
        markTex(m.normalMap);
        markTex(m.roughnessMap);
        markTex(m.metalnessMap);
        markTex(m.emissiveMap);
        markTex(m.aoMap);
        markTex(m.alphaMap);
        markTex(m.bumpMap);
        markTex(m.displacementMap);
        markTex(m.lightMap);
        markTex(m.envMap);
        markTex(m.sheenColorMap);
        markTex(m.sheenRoughnessMap);
      };

      markTex(this.scene.background);
      this.scene.traverse((obj) => {
        if ((obj as THREE.InstancedMesh).isInstancedMesh) {
          const inst = obj as THREE.InstancedMesh;
          inst.instanceMatrix.needsUpdate = true;
          if (inst.instanceColor) {
            inst.instanceColor.needsUpdate = true;
          }
        }
        const matRef = (obj as THREE.Mesh | THREE.Points | THREE.Sprite).material;
        if (Array.isArray(matRef)) {
          for (const mat of matRef) {
            if (mat) refreshMat(mat);
          }
        } else if (matRef) {
          refreshMat(matRef);
        }
      });

      if (this.underwaterSoftwareQuad) {
        const swMat = this.underwaterSoftwareQuad.material;
        if (Array.isArray(swMat)) {
          swMat.forEach(refreshMat);
        } else if (swMat) {
          refreshMat(swMat);
        }
      }

      this.applyQualityProfile(this.qualityManager.getProfile());
      this.renderer.shadowMap.needsUpdate = true;

      if (this.worldReady && !this.isSoftwareGl) {
        this.renderer.compile(this.scene, this.camera);
      }

      this.clock.getDelta();
      this.qualityManager.resetFrameMetrics(4.5);
      this.contextLost = false;
      this.contextRestoring = false;
      this.contextRebuildAttempts = 0;
      this.webglError = null;
      this.emitHud();
    } catch {
      this.contextRestoring = false;
      // If compilation or re-upload touched a mid-crash context, rebuild a clean WebGLRenderer
      this.contextLost = true;
      this.rebuildRendererInPlace();
    }
  }

  private getEffectivePixelRatio(profile: QualityProfile): number {
    if (this.isSoftwareGl) return 1;
    const nativeDpr = Math.max(1, window.devicePixelRatio || 1);
    return Math.min(nativeDpr, Math.max(2, profile.pixelRatioCap));
  }

  private handleVisibilityChange = (): void => {
    const hidden = typeof document !== 'undefined' && document.hidden;
    this.tabPaused = hidden;
    if (!hidden) {
      this.clock.getDelta();
      this.qualityManager.resetFrameMetrics(2.5);
      const gl = this.renderer.getContext();
      if (this.contextLost || !gl || gl.isContextLost()) {
        this.handleWebglContextLost();
        this.scheduleContextRecoveryWatchdog(60);
      }
    }
  };

  private rebuildPostComposer(
    width: number,
    height: number,
    profile: QualityProfile
  ): void {
    if (this.isSoftwareGl) return;
    const w = Math.max(64, Math.floor(width));
    const h = Math.max(64, Math.floor(height));
    const pr = this.getEffectivePixelRatio(profile);
    const rtW = Math.max(64, Math.floor(w * pr));
    const rtH = Math.max(64, Math.floor(h * pr));
    const prevSub = this.postPass ? this.postPass.uniforms.uSubmerged.value : 0.0;
    const prevDepth = this.postPass ? this.postPass.uniforms.uDepthFactor.value : 0.0;
    const prevDay = this.postPass ? this.postPass.uniforms.uDaylight.value : this.daylightFactor;

    this.bloomPass?.dispose();
    this.bloomPass = null;
    this.composer?.dispose();
    this.composerRenderTarget?.dispose();

    const rt = new THREE.WebGLRenderTarget(rtW, rtH, {
      type: profile.composerHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
      samples: profile.composerSamples,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.composerRenderTarget = rt;

    const composer = new EffectComposer(this.renderer, rt);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    composer.addPass(new RenderPass(this.scene, this.camera));

    // Zero bloom haze / zero DoF / zero softening blur — underwater shader handles volume only when submerged
    const postPass = new ShaderPass(PostSmoothAndUnderwaterShader);
    postPass.uniforms.uTexelSize.value.set(1 / rtW, 1 / rtH);
    postPass.uniforms.uSharpness.value = 1.0;
    postPass.uniforms.uEdgeEnhance.value = 1.0;
    postPass.uniforms.uSmoothBlend.value = 0.0;
    postPass.uniforms.uSubmerged.value = prevSub;
    postPass.uniforms.uDepthFactor.value = prevDepth;
    postPass.uniforms.uDaylight.value = prevDay;
    composer.addPass(postPass);
    composer.addPass(new OutputPass());

    this.composer = composer;
    this.postPass = postPass;
  }

  private applyQualityProfile(profile: QualityProfile): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const pr = this.getEffectivePixelRatio(profile);
    const shadowsActive =
      !this.isSoftwareGl &&
      profile.shadowsEnabled &&
      !this.dynamicScaler.areShadowsDisabledByEmergency();

    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = profile.toneMapping;
    this.renderer.shadowMap.enabled = shadowsActive;
    this.renderer.shadowMap.type = profile.shadowType;
    this.renderer.shadowMap.autoUpdate = shadowsActive && profile.tier !== 'LOW';
    this.renderer.shadowMap.needsUpdate = shadowsActive;
    this.keyLight.castShadow = shadowsActive;

    if (
      Math.abs(this.camera.far - profile.cameraFar) > 1 ||
      Math.abs(this.camera.near - FP_CAMERA_NEAR) > 0.001
    ) {
      this.camera.near = FP_CAMERA_NEAR;
      this.camera.far = profile.cameraFar;
      this.camera.updateProjectionMatrix();
    }

    const maxShadowTex = this.renderer.capabilities.maxTextureSize || 2048;
    const targetKeyShadow = Math.min(maxShadowTex, profile.keyShadowSize);
    if (this.keyLight.shadow.mapSize.width !== targetKeyShadow) {
      this.keyLight.shadow.map?.dispose();
      this.keyLight.shadow.map = null;
      this.keyLight.shadow.mapSize.set(targetKeyShadow, targetKeyShadow);
    }
    const frustumHalf = profile.shadowFrustumHalf;
    if (this.keyLight.shadow.camera.right !== frustumHalf) {
      this.keyLight.shadow.camera.left = -frustumHalf;
      this.keyLight.shadow.camera.right = frustumHalf;
      this.keyLight.shadow.camera.top = frustumHalf;
      this.keyLight.shadow.camera.bottom = -frustumHalf;
      this.keyLight.shadow.camera.updateProjectionMatrix();
    }

    if (shadowsActive && profile.torchShadowEnabled) {
      const tSize = Math.max(256, profile.torchShadowSize);
      if (this.torchShadowLight.shadow.mapSize.width !== tSize) {
        this.torchShadowLight.shadow.map?.dispose();
        this.torchShadowLight.shadow.map = null;
        this.torchShadowLight.shadow.mapSize.set(tSize, tSize);
      }
    } else {
      this.torchShadowLight.castShadow = false;
      this.torchShadowLight.intensity = 0;
    }

    const allowAreaBounce = profile.tier === 'HIGH' && !this.hardwareEnvelope.isMobile;
    if (this.sabhaBounceLight) {
      this.sabhaBounceLight.visible = allowAreaBounce;
    }
    if (this.palaceBounceLight) {
      this.palaceBounceLight.visible = allowAreaBounce;
    }

    const envAllowed =
      profile.allowEnvIbl && !this.dynamicScaler.isEnvStripped();
    if (!envAllowed && this.envRenderTarget) {
      this.envRenderTarget.dispose();
      this.envRenderTarget = null;
      this.scene.environment = null;
    } else if (envAllowed && !this.envRenderTarget && this.worldReady) {
      this.regenerateEnvironmentProbe();
    }

    const maxAniso = Math.min(this.maxAnisotropy, Math.max(1, profile.anisotropyCap));
    this.textures?.setAnisotropy(maxAniso);

    this.dynamicScaler.syncWithProfile(
      profile,
      this.qualityManager.getMode() !== 'AUTO'
    );
    this.astraVfx?.setShaderQuality(this.dynamicScaler.getTargetShaderLevel());

    if (!this.isSoftwareGl) {
      this.rebuildPostComposer(width, height, profile);
    }

    if (this.skyUniforms) {
      this.skyUniforms.uCloudDetail.value = profile.cloudDetailEnabled ? 1.0 : 0.0;
    }
    if (this.terrainShaderUniforms) {
      this.terrainShaderUniforms.uSlopeDetail.value = profile.shaderSlopeBlendEnabled ? 1.0 : 0.0;
    }

    const pScale = profile.particleScale;
    if (this.starPoints) {
      this.starPoints.geometry.setDrawRange(0, Math.max(1, Math.round(this.starCountMax * pScale)));
    }
    if (this.fireflyPoints) {
      this.fireflyPoints.geometry.setDrawRange(0, Math.max(1, Math.round(this.ffCountMax * pScale)));
    }
    if (this.volcanicBombMesh) {
      this.volcanicBombMesh.count = Math.max(1, Math.round(this.volcanicBombCountMax * pScale));
    }
    if (this.volcanicSmokeMesh) {
      this.volcanicSmokeMesh.count = Math.max(1, Math.round(this.volcanicSmokeCountMax * pScale));
    }
    if (this.riverFishMesh) {
      this.riverFishMesh.count = Math.max(1, Math.round(this.riverFishCountMax * pScale));
    }
    if (this.stepwellKoiMesh) {
      this.stepwellKoiMesh.count = Math.max(1, Math.round(this.stepwellKoiCountMax * pScale));
    }

    this.updateAtmosphericMood();
  }

  private applyDynamicResolutionOnly(profile: QualityProfile): void {
    if (this.isSoftwareGl || this.contextLost) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const pr = this.getEffectivePixelRatio(profile);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(width, height);
    if (this.composer) {
      const w = Math.max(64, Math.floor(width));
      const h = Math.max(64, Math.floor(height));
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
      if (this.postPass) {
        const rtW = Math.max(64, Math.floor(w * pr));
        const rtH = Math.max(64, Math.floor(h * pr));
        this.postPass.uniforms.uTexelSize.value.set(1 / rtW, 1 / rtH);
        this.postPass.uniforms.uSharpness.value = 1.0;
        this.postPass.uniforms.uEdgeEnhance.value = 1.0;
        this.postPass.uniforms.uSmoothBlend.value = 0.0;
      }
    }
  }

  public setQualityMode(mode: QualityMode): void {
    const changedTier = this.qualityManager.setMode(mode);
    if (changedTier !== null) {
      this.applyQualityProfile(this.qualityManager.getProfile());
    } else {
      this.applyDynamicResolutionOnly(this.qualityManager.getProfile());
    }
    this.emitHud();
  }

  public async rerunHardwareBenchmark(): Promise<void> {
    if (this.disposed || this.contextLost) return;
    const report = await runLaunchHardwareBenchmark(
      this.renderer,
      this.hardwareEnvelope
    );
    if (this.disposed) return;
    this.qualityManager.applyBenchmarkLock(report);
    const lockedProfile = this.qualityManager.getProfile();
    this.dynamicScaler.syncWithProfile(lockedProfile, true);
    this.applyQualityProfile(lockedProfile);
    this.emitHud();
  }

  private yieldToMainThread(): Promise<void> {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame === 'function' && typeof document !== 'undefined' && !document.hidden) {
        requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  private async initializeWorldAsync(): Promise<void> {
    const signal = this.loadAbort.signal;
    const isAborted = () => this.disposed || signal.aborted;
    const reportStage = async (progress: number, stage: string, forceYield = true): Promise<boolean> => {
      if (isAborted()) return false;
      this.assetProgress = progress;
      this.assetStage = stage;
      this.emitHud();
      if (forceYield) {
        await this.yieldToMainThread();
      }
      return !isAborted();
    };

    try {
      if (!(await reportStage(2, 'Profiling CPU, RAM & GPU capabilities'))) return;
      const benchReport = await runLaunchHardwareBenchmark(
        this.renderer,
        this.hardwareEnvelope,
        (stageLabel) => {
          if (!isAborted()) {
            this.assetStage = stageLabel;
            this.assetProgress = Math.max(this.assetProgress, 4);
            this.emitHud();
          }
        }
      );
      if (isAborted()) return;
      this.qualityManager.applyBenchmarkLock(benchReport);
      this.applyQualityProfile(this.qualityManager.getProfile());

      if (!(await reportStage(6, 'Preparing solar environment illumination'))) return;
      this.regenerateEnvironmentProbe();

      const initProfile = this.qualityManager.getProfile();
      let lastHudTs = 0;
      const loadedTextures = await createProceduralTexturesAsync(this.renderer, this.isSoftwareGl, {
        signal,
        frameBudgetMs: this.isSoftwareGl ? 10 : 6,
        textureSize: initProfile.textureSize,
        maxAnisotropy: initProfile.anisotropyCap,
        skipNonEssentialMipmaps: initProfile.skipNonEssentialMipmaps,
        onProgress: (frac, label) => {
          if (isAborted()) return;
          this.assetProgress = 6 + frac * 46;
          this.assetStage = label;
          const now = performance.now();
          if (now - lastHudTs >= 45 || frac >= 1) {
            lastHudTs = now;
            this.emitHud();
          }
        },
      });
      if (isAborted()) {
        loadedTextures.dispose();
        return;
      }
      this.textures = loadedTextures;
      this.lodCache = new MobileLodAssetCache(loadedTextures);

      this.waterMesh = await this.buildWorldEnvironmentAsync(signal, (frac, label) => {
        if (isAborted()) return;
        this.assetProgress = 52 + frac * 34;
        this.assetStage = label;
        this.emitHud();
      });
      if (isAborted()) return;

      if (!(await reportStage(87, 'Indexing spatial colliders & hero rig'))) return;
      this.colliderGrid = new StaticColliderSpatialGrid(this.colliders, this.circleColliders);
      this.heroRigs.clear();
      const showBodyParts = this.cameraSystem.isSecondPerson();
      for (const hId of PLAYABLE_HERO_ORDER) {
        const hRig = createHeroModel(hId, this.textures);
        if (hRig.headGroup) hRig.headGroup.visible = showBodyParts;
        if (hRig.backBowGroup) hRig.backBowGroup.visible = showBodyParts;
        if (hRig.capePivot) hRig.capePivot.visible = showBodyParts;
        hRig.root.visible = hId === this.activeHeroId;
        this.scene.add(hRig.root);
        this.heroRigs.set(hId, hRig);
      }
      this.ramRig = this.heroRigs.get(this.activeHeroId) ?? createLordRamModel(this.textures);
      this.beaconGroup = this.createWaypointBeacon();
      this.scene.add(this.beaconGroup);
      this.enforcePbrAndAnisotropy(this.scene);

      if (!(await reportStage(91, 'Prewarming projectile & entity object pools'))) return;
      this.initObjectPools();
      this.astraVfx = new AstraVfxManager(this.scene, this.poolManager);
      this.astraQuest = new AstraQuestSystem(this.scene, this.astraVfx, {
        getPlayerPos: () => ({
          x: this.playerX,
          y: this.playerY,
          z: this.playerZ,
          grounded: this.grounded,
          swimming: this.isRamSwimming,
        }),
        setPlayerVelY: (vy: number) => {
          this.playerVelY = vy;
          this.grounded = false;
        },
        getNightFactor: () => this.nightFactor,
        advanceToNight: () => {
          this.dayTime = 0.78;
          this.updateAtmosphericMood();
        },
        damagePlayer: (hpDmg: number, pranaDrain: number) => {
          this.inflictDamageToPlayer(hpDmg, pranaDrain);
        },
        healPlayer: (amount: number) => {
          if (this.astraQuest?.noHealActive) return;
          this.hp = Math.min(this.maxHp, this.hp + amount);
        },
        spawnTrialEnemy: (x, z, isCommander, variant, hpScale, questTag, customScale = 1) =>
          this.spawnEnemy(x, z, isCommander, questTag, variant, true, hpScale, customScale),
        countAliveTaggedEnemies: (tagPrefix: string) => {
          let cnt = 0;
          for (let i = 0; i < this.enemies.length; i++) {
            const e = this.enemies[i];
            if (e.alive && e.missionTag && e.missionTag.startsWith(tagPrefix)) cnt++;
          }
          return cnt;
        },
        clearTaggedEnemies: (tagPrefix: string) => {
          for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if ((e.alive || e.dissolving) && e.missionTag && e.missionTag.startsWith(tagPrefix)) {
              e.alive = false;
              e.dissolving = false;
              e.rig.root.scale.setScalar(1);
              this.poolManager.release(
                this.demonPoolKey(e.variant, e.isCommander),
                e.rig
              );
              swapRemoveAt(this.enemies, i);
            }
          }
        },
        getTaggedEnemyInfo: (tag: string) => {
          for (let i = 0; i < this.enemies.length; i++) {
            const e = this.enemies[i];
            if (e.alive && e.missionTag === tag) {
              return { id: e.id, x: e.x, y: e.y, z: e.z, hp: e.hp, maxHp: e.maxHp };
            }
          }
          return null;
        },
        stunEnemyById: (id: string, sec: number) => {
          for (let i = 0; i < this.enemies.length; i++) {
            const e = this.enemies[i];
            if (e.alive && e.id === id) {
              e.stunTimer = Math.max(e.stunTimer, sec);
              e.abilityState = 'IDLE';
              break;
            }
          }
        },
        getParticleScale: () => this.qualityManager.getProfile().particleScale,
        getQualityTier: () => this.qualityManager.getTier(),
        triggerCameraShake: (amount: number) => {
          this.cameraShakeAmount = Math.max(this.cameraShakeAmount, amount);
        },
      });
      this.showStoryIntro = !this.astraQuest.introSeen;
      this.input.selectedAstra = this.astraQuest.selectedAstra;
      this.resetWorldEntities();
      // Register scene & pool materials and immediately enforce hardware-appropriate shader level before compileAsync
      this.dynamicScaler.registerObjectTree(this.scene, true);
      this.applyQualityProfile(this.qualityManager.getProfile());

      if (!(await reportStage(95, 'Compiling PBR shaders asynchronously'))) return;
      try {
        if (!this.isSoftwareGl && typeof this.renderer.compileAsync === 'function') {
          await this.renderer.compileAsync(this.scene, this.camera);
        } else if (!this.isSoftwareGl) {
          this.renderer.compile(this.scene, this.camera);
        }
      } catch {
        // Recover cleanly if a transient WebGL context pause interrupts initial shader pre-compilation
      }
      if (isAborted()) return;

      this.worldReady = true;
      this.assetProgress = 100;
      this.assetStage = 'Loading 100% Successful';
      this.qualityManager.resetFrameMetrics(3.5);
      if (this.pendingPlayOnReady) {
        this.pendingPlayOnReady = false;
        this.mode = 'PLAYING';
        this.callbacks.onModeChange('PLAYING');
      }
      this.emitHud();
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError' || this.disposed) {
        return;
      }
      this.webglError = 'Failed to stream world assets cleanly. Reload to retry.';
      this.emitHud();
    }
  }

  private demonPoolKey(variant: DemonVariant, isCommander: boolean): string {
    return `demon_${variant}_${isCommander ? 'cmd' : 'std'}`;
  }

  private resetPooledCharacterRig(rig: CharacterRig): void {
    rig.root.visible = false;
    rig.root.rotation.set(0, 0, 0);
    rig.leftLeg.rotation.set(0, 0, 0);
    rig.rightLeg.rotation.set(0, 0, 0);
    rig.leftKnee.rotation.set(0, 0, 0);
    rig.rightKnee.rotation.set(0, 0, 0);
    rig.leftAnkle.rotation.set(0, 0, 0);
    rig.rightAnkle.rotation.set(0, 0, 0);
    rig.leftArm.rotation.set(0, 0, 0);
    rig.rightArm.rotation.set(0, 0, 0);
    rig.leftElbow.rotation.set(0, 0, 0);
    rig.rightElbow.rotation.set(0, 0, 0);
    rig.torso.rotation.set(0, 0, 0);
    const defaultTorsoY = rig.root.userData._defaultTorsoY;
    if (typeof defaultTorsoY === 'number') {
      rig.torso.position.y = defaultTorsoY;
    }
    rig.headGroup?.rotation.set(0, 0, 0);
    rig.customParts?.rotation.set(0, 0, 0);
    if (rig.ghostOverlayMat) {
      rig.ghostOverlayMat.opacity = 0.72;
    }
    const dissolveUniforms = rig.root.userData._dissolveUniforms as
      | EnemyDissolveUniforms
      | undefined;
    if (dissolveUniforms) {
      dissolveUniforms.uDissolve.value = 0;
      dissolveUniforms.uHeatGlow.value = 0;
      dissolveUniforms.uDissolveTime.value = 0;
    }
    const defaultShadowOpacity = rig.contactShadow.userData._defaultOpacity;
    if (typeof defaultShadowOpacity === 'number') {
      (rig.contactShadow.material as THREE.MeshBasicMaterial).opacity = defaultShadowOpacity;
    }
  }

  private resetPooledChariotRig(rig: ChariotRig): void {
    rig.root.visible = false;
    rig.root.rotation.set(0, 0, 0);
    rig.leftWheel.rotation.set(0, 0, 0);
    rig.rightWheel.rotation.set(0, 0, 0);
    for (let i = 0; i < rig.horseLegs.length; i++) {
      rig.horseLegs[i].rotation.set(0, 0, 0);
    }
    for (let i = 0; i < rig.horseKnees.length; i++) {
      rig.horseKnees[i].rotation.set(0, 0, 0);
    }
    for (let s = 0; s < rig.steeds.length; s++) {
      const st = rig.steeds[s];
      st.headPivot.rotation.set(0, 0, 0);
      st.tailGroup.rotation.set(0, 0, 0);
      for (let t = 0; t < st.tailChains.length; t++) {
        const ch = st.tailChains[t];
        ch[0].rotation.set(0, 0, 0);
        ch[1].rotation.set(0, 0, 0);
        ch[2].rotation.set(0, 0, 0);
      }
      for (let m = 0; m < st.maneChains.length; m++) {
        const mc = st.maneChains[m];
        mc[0].rotation.set(0, 0, 0);
        mc[1].rotation.set(0, 0, 0);
      }
      st.forelockChain[0].rotation.set(-0.55, 0, 0);
      st.forelockChain[1].rotation.set(-0.18, 0, 0);
    }
  }

  private initObjectPools(): void {
    const pm = this.poolManager;

    // 1. Shared Bow Arrow Geometries & Materials (Zero GPU churn across shots)
    const arrowShaftGeo = pm.registerSharedGeometry(
      new THREE.CylinderGeometry(0.015, 0.015, 1.05, 8)
    );
    const arrowTipGeo = pm.registerSharedGeometry(new THREE.ConeGeometry(0.04, 0.15, 6));
    const arrowVaneGeo = pm.registerSharedGeometry(new THREE.BoxGeometry(0.004, 0.042, 0.16));

    const arrowShaftMat = pm.registerSharedMaterial(
      new THREE.MeshPhysicalMaterial({
        color: 0xf2c84b,
        emissive: 0x6b4b08,
        emissiveIntensity: 0.45,
        roughness: 0.3,
        metalness: 0.75,
        ior: 1.56,
        envMapIntensity: 1.0,
      })
    );
    const arrowTipMat = pm.registerSharedMaterial(
      new THREE.MeshPhysicalMaterial({
        color: 0xffe07d,
        emissive: 0xd9a120,
        emissiveIntensity: 1.1,
        roughness: 0.18,
        metalness: 0.9,
        ior: 1.62,
        envMapIntensity: 1.0,
      })
    );
    const arrowVaneMat = pm.registerSharedMaterial(
      new THREE.MeshPhysicalMaterial({
        color: 0xc9382a,
        roughness: 0.58,
        sheen: 0.45,
        envMapIntensity: 1.0,
      })
    );

    pm.registerPool<THREE.Group>({
      key: 'arrow',
      prewarmCount: 16,
      maxSize: 48,
      factory: () => {
        const arrowGroup = new THREE.Group();
        const shaft = new THREE.Mesh(arrowShaftGeo, arrowShaftMat);
        shaft.rotation.x = Math.PI / 2;
        arrowGroup.add(shaft);

        const tip = new THREE.Mesh(arrowTipGeo, arrowTipMat);
        tip.rotation.x = Math.PI / 2;
        tip.position.z = 0.58;
        arrowGroup.add(tip);

        for (let v = 0; v < 3; v++) {
          const va = (v / 3) * Math.PI * 2;
          const vane = new THREE.Mesh(arrowVaneGeo, arrowVaneMat);
          vane.position.set(Math.sin(va) * 0.02, Math.cos(va) * 0.02, -0.44);
          vane.rotation.z = -va;
          arrowGroup.add(vane);
        }
        arrowGroup.visible = false;
        pm.poolRoot.add(arrowGroup);
        return arrowGroup;
      },
      onAcquire: (group) => {
        group.visible = true;
      },
      onRelease: (group) => {
        group.visible = false;
      },
      onDispose: (group) => {
        pm.disposeObject3DResources(group);
      },
    });

    // 2. Shared Sudarshan Chakra Geometries & Materials
    const chakraRimGeo = pm.registerSharedGeometry(new THREE.TorusGeometry(0.46, 0.052, 10, 28));
    const chakraHubGeo = pm.registerSharedGeometry(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 16));
    const chakraCoreGeo = pm.registerSharedGeometry(new THREE.SphereGeometry(0.14, 12, 10));
    const chakraToothGeo = pm.registerSharedGeometry(new THREE.ConeGeometry(0.068, 0.24, 4));
    const chakraFlameBladeGeo = pm.registerSharedGeometry(new THREE.ConeGeometry(0.12, 0.42, 6));
    const chakraHaloGeo = pm.registerSharedGeometry(new THREE.TorusGeometry(0.55, 0.11, 8, 24));

    const chakraGoldMat = pm.registerSharedMaterial(
      new THREE.MeshPhysicalMaterial({
        color: 0xffd24d,
        emissive: 0xd99b1e,
        emissiveIntensity: 1.1,
        roughness: 0.16,
        metalness: 0.92,
        ior: 1.62,
        clearcoat: 0.6,
        envMapIntensity: 1.0,
      })
    );
    const chakraFireOuterMat = pm.registerSharedMaterial(
      new THREE.MeshPhysicalMaterial({
        color: 0xff5a12,
        emissive: 0xff4206,
        emissiveIntensity: 2.2,
        roughness: 0.3,
        transparent: true,
        opacity: 0.88,
        envMapIntensity: 1.0,
      })
    );
    const chakraFireCoreMat = pm.registerSharedMaterial(
      new THREE.MeshPhysicalMaterial({
        color: 0xffdf70,
        emissive: 0xffbf38,
        emissiveIntensity: 2.6,
        roughness: 0.2,
        envMapIntensity: 1.0,
      })
    );

    pm.registerPool<THREE.Group>({
      key: 'chakra',
      prewarmCount: 4,
      maxSize: 12,
      factory: () => {
        const root = new THREE.Group();
        const spinPivot = new THREE.Group();
        root.add(spinPivot);
        root.userData.spinPivot = spinPivot;

        const rim = new THREE.Mesh(chakraRimGeo, chakraGoldMat);
        rim.rotation.x = Math.PI / 2;
        spinPivot.add(rim);

        const innerHub = new THREE.Mesh(chakraHubGeo, chakraGoldMat);
        spinPivot.add(innerHub);

        const coreGlow = new THREE.Mesh(chakraCoreGeo, chakraFireCoreMat);
        coreGlow.scale.set(1, 0.45, 1);
        spinPivot.add(coreGlow);

        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const tooth = new THREE.Mesh(chakraToothGeo, chakraGoldMat);
          tooth.position.set(Math.cos(a) * 0.56, 0, Math.sin(a) * 0.56);
          tooth.rotation.z = -Math.PI / 2;
          tooth.rotation.y = -a + 0.35;
          spinPivot.add(tooth);

          if (i % 2 === 0) {
            const flameBlade = new THREE.Mesh(chakraFlameBladeGeo, chakraFireOuterMat);
            flameBlade.position.set(Math.cos(a) * 0.66, 0, Math.sin(a) * 0.66);
            flameBlade.rotation.z = -Math.PI / 2;
            flameBlade.rotation.y = -a + 0.5;
            spinPivot.add(flameBlade);
          }
        }

        const fireHalo = new THREE.Mesh(chakraHaloGeo, chakraFireOuterMat);
        fireHalo.rotation.x = Math.PI / 2;
        spinPivot.add(fireHalo);

        root.visible = false;
        pm.poolRoot.add(root);
        return root;
      },
      onAcquire: (root) => {
        const spinPivot = root.userData.spinPivot as THREE.Group | undefined;
        spinPivot?.rotation.set(0, 0, 0);
        root.visible = true;
      },
      onRelease: (root) => {
        root.visible = false;
      },
      onDispose: (root) => {
        pm.disposeObject3DResources(root);
      },
    });

    // 3. Blast VFX Pool (1 shared geometry, reusable per-instance material)
    const blastGeo = pm.registerSharedGeometry(new THREE.SphereGeometry(1, 14, 14));
    pm.registerPool<THREE.Mesh>({
      key: 'blast',
      prewarmCount: 14,
      maxSize: 48,
      factory: () => {
        const mat = new THREE.MeshPhysicalMaterial({
          color: 0xff5a12,
          emissive: 0xff5a12,
          emissiveIntensity: 2.2,
          roughness: 0.25,
          transparent: true,
          opacity: 0.75,
          envMapIntensity: 1.0,
        });
        const mesh = new THREE.Mesh(blastGeo, mat);
        mesh.visible = false;
        pm.poolRoot.add(mesh);
        return mesh;
      },
      onAcquire: (mesh) => {
        mesh.scale.setScalar(0.5);
        (mesh.material as THREE.MeshPhysicalMaterial).opacity = 0.75;
        mesh.visible = true;
      },
      onRelease: (mesh) => {
        mesh.visible = false;
      },
      onDispose: (mesh) => {
        pm.disposeObject3DResources(mesh);
      },
    });

    // 4. Enemy Projectile Pool (1 shared geometry, reusable per-instance material)
    const enemyProjGeo = pm.registerSharedGeometry(new THREE.OctahedronGeometry(0.24, 1));
    pm.registerPool<THREE.Mesh>({
      key: 'enemyProjectile',
      prewarmCount: 14,
      maxSize: 48,
      factory: () => {
        const mat = new THREE.MeshPhysicalMaterial({
          color: 0xffb326,
          emissive: 0xffb326,
          emissiveIntensity: 2.2,
          roughness: 0.18,
          ior: 1.52,
          envMapIntensity: 1.0,
        });
        const mesh = new THREE.Mesh(enemyProjGeo, mat);
        mesh.visible = false;
        pm.poolRoot.add(mesh);
        return mesh;
      },
      onAcquire: (mesh) => {
        mesh.rotation.set(0, 0, 0);
        mesh.visible = true;
      },
      onRelease: (mesh) => {
        mesh.visible = false;
      },
      onDispose: (mesh) => {
        pm.disposeObject3DResources(mesh);
      },
    });

    // 5. Ground Hazard Pool (1 shared RingGeometry, reusable per-instance material)
    const hazardGeo = pm.registerSharedGeometry(new THREE.RingGeometry(0.65, 1.0, 28));
    pm.registerPool<THREE.Mesh>({
      key: 'groundHazard',
      prewarmCount: 8,
      maxSize: 24,
      factory: () => {
        const mat = new THREE.MeshPhysicalMaterial({
          color: 0xff5a12,
          emissive: 0xff5a12,
          emissiveIntensity: 2.0,
          roughness: 0.25,
          transparent: true,
          opacity: 0.78,
          side: THREE.DoubleSide,
          envMapIntensity: 1.0,
        });
        const mesh = new THREE.Mesh(hazardGeo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.visible = false;
        pm.poolRoot.add(mesh);
        return mesh;
      },
      onAcquire: (mesh) => {
        mesh.rotation.set(-Math.PI / 2, 0, 0);
        mesh.scale.setScalar(1);
        (mesh.material as THREE.MeshPhysicalMaterial).opacity = 0.78;
        mesh.visible = true;
      },
      onRelease: (mesh) => {
        mesh.visible = false;
      },
      onDispose: (mesh) => {
        pm.disposeObject3DResources(mesh);
      },
    });

    // 6. Royal Ratha Chariot Pool (Zero leak across restarts)
    pm.registerPool<ChariotRig>({
      key: 'ratha',
      prewarmCount: 5,
      maxSize: 8,
      factory: () => {
        const rig = createRathaChariotModel(this.textures!);
        this.enforcePbrAndAnisotropy(rig.root);
        this.dynamicScaler.registerObjectTree(rig.root, true);
        rig.root.visible = false;
        pm.poolRoot.add(rig.root);
        return rig;
      },
      onAcquire: (rig) => {
        rig.root.visible = true;
      },
      onRelease: (rig) => {
        this.resetPooledChariotRig(rig);
      },
      onDispose: (rig) => {
        pm.disposeObject3DResources(rig.root);
      },
    });

    // 7. Demon Rig Pools across all 5 variants (standard + commander)
    const variants: DemonVariant[] = [
      'BOAR_DEMON',
      'RABBIT_DEMON',
      'BRUTE_HUMAN',
      'SORCERER_HUMAN',
      'SHADOW_GHOST',
    ];
    for (let v = 0; v < variants.length; v++) {
      const variant = variants[v];
      const cmdTargets: Array<{ isCommander: boolean; prewarmCount: number; maxSize: number }> = [
        { isCommander: false, prewarmCount: 3, maxSize: 10 },
        { isCommander: true, prewarmCount: variant === 'BRUTE_HUMAN' ? 1 : 0, maxSize: 3 },
      ];
      for (let c = 0; c < cmdTargets.length; c++) {
        const { isCommander, prewarmCount, maxSize } = cmdTargets[c];
        pm.registerPool<CharacterRig>({
          key: this.demonPoolKey(variant, isCommander),
          prewarmCount,
          maxSize,
          factory: () => {
            const rig = createDemonModel(this.textures!, variant, isCommander);
            rig.root.userData._defaultTorsoY = rig.torso.position.y;
            rig.contactShadow.userData._defaultOpacity = (
              rig.contactShadow.material as THREE.MeshBasicMaterial
            ).opacity;
            this.enforcePbrAndAnisotropy(rig.root);
            installEnemyAshDissolution(rig.root);
            this.dynamicScaler.registerObjectTree(rig.root, true);
            rig.root.visible = false;
            pm.poolRoot.add(rig.root);
            return rig;
          },
          onAcquire: (rig) => {
            rig.root.visible = true;
          },
          onRelease: (rig) => {
            this.resetPooledCharacterRig(rig);
          },
          onDispose: (rig) => {
            pm.disposeObject3DResources(rig.root);
          },
        });
      }
    }

    // Pre-register ALL Ayodhya Citizen Role/Color Variants upfront (Zero lazy pool creation or runtime shader hitches)
    const citizenPoolConfigs: Array<{ role: NpcRole; colorHex: number; prewarmCount: number; maxSize: number }> = [
      { role: 'MINISTER', colorHex: 0xb52b27, prewarmCount: 6, maxSize: 8 },
      { role: 'COMMANDER', colorHex: 0xd98a1e, prewarmCount: 6, maxSize: 8 },
      { role: 'SPY', colorHex: 0x2f3b52, prewarmCount: 4, maxSize: 6 },
      { role: 'SERVANT', colorHex: 0xa35a2a, prewarmCount: 5, maxSize: 8 },
      { role: 'GROOM', colorHex: 0x4f6840, prewarmCount: 4, maxSize: 6 },
      { role: 'SOLDIER', colorHex: 0xc44324, prewarmCount: 4, maxSize: 8 },
      { role: 'CITIZEN', colorHex: 0xe0aa46, prewarmCount: 5, maxSize: 8 },
      { role: 'CITIZEN', colorHex: 0xd8c39e, prewarmCount: 5, maxSize: 8 },
      { role: 'CITIZEN', colorHex: 0xc76b44, prewarmCount: 2, maxSize: 6 },
      { role: 'CITIZEN', colorHex: 0x5c8a72, prewarmCount: 2, maxSize: 6 },
    ];
    for (let i = 0; i < citizenPoolConfigs.length; i++) {
      const cfg = citizenPoolConfigs[i];
      const poolKey = `citizen_${cfg.role}_${cfg.colorHex}`;
      pm.registerPool<CharacterRig>({
        key: poolKey,
        prewarmCount: cfg.prewarmCount,
        maxSize: cfg.maxSize,
        factory: () => {
          const cRig = createCitizenModel(this.textures!, cfg.colorHex, cfg.role);
          cRig.root.userData._defaultTorsoY = cRig.torso.position.y;
          this.enforcePbrAndAnisotropy(cRig.root);
          this.dynamicScaler.registerObjectTree(cRig.root, true);
          cRig.root.visible = false;
          pm.poolRoot.add(cRig.root);
          return cRig;
        },
        onAcquire: (cRig) => {
          cRig.root.visible = true;
        },
        onRelease: (cRig) => {
          this.resetPooledCharacterRig(cRig);
        },
        onDispose: (cRig) => {
          pm.disposeObject3DResources(cRig.root);
        },
      });
    }

    // Pre-warm compact projectile/VFX pools & final commander shaders synchronously
    // BEFORE renderer.compile so combat triggers zero runtime shader stalls.
    // Remaining extra standby Demon rigs warm non-blockingly via stepPrewarm() in the loop.
    pm.prewarmSyncKeys([
      'arrow',
      'chakra',
      'blast',
      'enemyProjectile',
      'groundHazard',
      'demon_BRUTE_HUMAN_cmd',
    ]);
  }

  private lockStaticHierarchy(obj: THREE.Object3D): void {
    obj.updateMatrixWorld(true);
    obj.traverse((child) => {
      child.matrixAutoUpdate = false;
    });
  }

  private enforcePbrAndAnisotropy(root: THREE.Object3D): void {
    if (root.userData._pbrTuned) return;
    root.userData._pbrTuned = true;
    const maxAniso = Math.min(
      this.maxAnisotropy,
      this.qualityManager.getProfile().anisotropyCap
    );
    const tuneTex = (tex: THREE.Texture | null | undefined) => {
      if (!tex) return;
      if (tex.generateMipmaps) {
        tex.minFilter = THREE.LinearMipmapLinearFilter;
      } else {
        tex.minFilter = THREE.LinearFilter;
      }
      tex.magFilter = THREE.LinearFilter;
      if (tex.anisotropy !== maxAniso) {
        tex.anisotropy = maxAniso;
        tex.needsUpdate = true;
      }
    };
    const epigraphNorm = this.textures?.royalEpigraphNormal ?? null;
    const mythNorm = this.textures?.mythologyArtNormal ?? null;
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (let i = 0; i < mats.length; i++) {
        const m = mats[i] as THREE.MeshPhysicalMaterial;
        if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) {
          const isTransparentOrFoliage =
            m.transparent || m.opacity < 0.99 || Boolean(m.alphaTest);
          const isLifelikeSkin = Boolean(m.userData?.lifelikeSkin);
          if (!isTransparentOrFoliage) {
            m.flatShading = isLifelikeSkin ? false : true;
            m.roughnessMap = null;
            m.aoMap = null;
            m.metalnessMap = null;
            const hasArtworkRelief =
              m.normalMap !== null &&
              (m.normalMap === epigraphNorm || m.normalMap === mythNorm);
            if (hasArtworkRelief) {
              m.normalScale?.set(0.25, 0.25);
              tuneTex(m.normalMap);
            } else if (m.normalMap !== null && m.userData?.preserveNormalMap) {
              tuneTex(m.normalMap);
            } else {
              m.normalMap = null;
            }
            m.envMapIntensity = isLifelikeSkin ? 0.62 : 0.52;
            if (!isLifelikeSkin) {
              m.roughness =
                m.metalness > 0.5
                  ? Math.max(0.28, m.roughness)
                  : Math.max(0.58, m.roughness);
            }
            m.needsUpdate = true;
          } else {
            m.envMapIntensity = Math.min(0.65, m.envMapIntensity || 0.65);
            m.normalMap = null;
            m.roughnessMap = null;
            m.needsUpdate = true;
          }
          tuneTex(m.map);
          tuneTex(m.emissiveMap);
        }
      }
    });
  }

  private async buildWorldEnvironmentAsync(
    signal: AbortSignal,
    onProgress: (frac: number, label: string) => void
  ): Promise<THREE.Mesh> {
    const textures = this.textures!;
    const checkStage = async (frac: number, label: string): Promise<void> => {
      if (this.disposed || signal.aborted) {
        throw new DOMException('World build aborted', 'AbortError');
      }
      onProgress(frac, label);
      await this.yieldToMainThread();
      if (this.disposed || signal.aborted) {
        throw new DOMException('World build aborted', 'AbortError');
      }
    };

    this.roofOccluders = [];
    this.occlusionManager.clear();

    // 0. Dynamic Day-Night Atmospheric Sky Dome Shader (expanded radius for full open-world render distance)
    const skyRadius = 3100;
    const skyGeo = new THREE.SphereGeometry(skyRadius, 18, 10);
    const initProf = this.qualityManager.getProfile();
    this.skyUniforms = {
      uHorizonColor: { value: new THREE.Color(0xa8d8f8) },
      uMidColor: { value: new THREE.Color(0x5aa4e8) },
      uZenithColor: { value: new THREE.Color(0x1e56a6) },
      uSunDir: { value: new THREE.Vector3(0.5, 0.7, -0.4).normalize() },
      uMoonDir: { value: new THREE.Vector3(-0.5, -0.7, 0.4).normalize() },
      uTwilight: { value: 0.0 },
      uNightFactor: { value: 0.0 },
      uTime: { value: 0.0 },
      uCloudDetail: { value: initProf.cloudDetailEnabled ? 1.0 : 0.0 },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vWorldDir;
        void main() {
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uHorizonColor;
        uniform vec3 uMidColor;
        uniform vec3 uZenithColor;
        uniform vec3 uSunDir;
        uniform vec3 uMoonDir;
        uniform float uTwilight;
        uniform float uNightFactor;
        uniform float uTime;
        uniform float uCloudDetail;
        varying vec3 vWorldDir;

        float skyHash(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.23);
          return fract(p.x * p.y);
        }
        float skyNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), u.x),
            mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float skyFbm(vec2 p) {
          float v = 0.55 * skyNoise(p);
          p *= 2.07;
          v += 0.30 * skyNoise(p);
          p *= 2.05;
          v += 0.15 * skyNoise(p);
          return v;
        }

        void main() {
          vec3 dir = normalize(vWorldDir);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 baseSky = h < 0.28
            ? mix(uHorizonColor, uMidColor, h / 0.28)
            : mix(uMidColor, uZenithColor, (h - 0.28) / 0.72);

          float sunDot = max(0.0, dot(dir, normalize(uSunDir)));
          float sunHalo = pow(sunDot, 22.0) * (1.0 - uNightFactor * 0.85);
          baseSky += vec3(1.0, 0.48, 0.16) * pow(sunDot, 5.0) * (0.52 * uTwilight);
          baseSky += vec3(1.0, 0.86, 0.58) * sunHalo * 0.48;

          float moonDot = max(0.0, dot(dir, normalize(uMoonDir)));
          baseSky += vec3(0.24, 0.34, 0.56) * pow(moonDot, 14.0) * (0.55 * uNightFactor);

          // Subtle diagonal Milky Way galactic haze at night
          if (uNightFactor > 0.05 && dir.y > 0.04) {
            float mwPlane = dir.x * 0.55 + dir.y * 0.45 - dir.z * 0.70;
            float mwBand = exp(-mwPlane * mwPlane * 9.5) * smoothstep(0.05, 0.35, dir.y);
            float mwDust = skyNoise(dir.xz * 6.5 + dir.y * 4.0);
            baseSky += vec3(0.08, 0.12, 0.24) * mwBand * (0.45 + 0.55 * mwDust) * uNightFactor;
          }

          // Multi-layered procedural volumetric sky clouds above horizon (skipped on LOW tier)
          if (uCloudDetail > 0.5 && dir.y > 0.035) {
            vec2 cloudUv = dir.xz / (dir.y + 0.16) * 1.45 + vec2(uTime * 0.009, uTime * 0.004);
            float c1 = skyFbm(cloudUv);
            float c2 = skyNoise(cloudUv * 2.8 - vec2(uTime * 0.012, 0.0));
            float cloudDensity = smoothstep(0.50, 0.78, c1 * 0.78 + c2 * 0.22);
            float horizonFade = smoothstep(0.035, 0.22, dir.y);
            float cloudAlpha = cloudDensity * horizonFade * mix(0.68, 0.28, uNightFactor);

            vec3 dayCloud = mix(vec3(0.84, 0.86, 0.90), vec3(1.0, 0.97, 0.92), pow(sunDot, 3.0) * 0.6 + c2 * 0.4);
            vec3 duskCloud = mix(vec3(0.45, 0.30, 0.44), vec3(1.0, 0.58, 0.32), pow(sunDot, 2.0));
            vec3 nightCloud = mix(vec3(0.04, 0.06, 0.11), vec3(0.22, 0.30, 0.46), pow(moonDot, 4.0));
            vec3 cloudCol = mix(dayCloud, duskCloud, clamp(uTwilight * 0.92, 0.0, 1.0));
            cloudCol = mix(cloudCol, nightCloud, uNightFactor);
            baseSky = mix(baseSky, cloudCol, cloudAlpha);
          }

          gl_FragColor = vec4(baseSky, 1.0);
        }
      `,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.skyDome.renderOrder = -10;
    this.scene.add(this.skyDome);

    // Sun Disc + Soft Golden Corona Glow (scaled to 2500m orbital distance so apparent angular size stays identical)
    this.sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(98, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff0c8, fog: false })
    );
    this.sunDisc.position.set(1520, 1160, -1380);
    const sunHaloCanvas = document.createElement('canvas');
    sunHaloCanvas.width = 256;
    sunHaloCanvas.height = 256;
    const shCtx = sunHaloCanvas.getContext('2d');
    if (shCtx) {
      const sg = shCtx.createRadialGradient(128, 128, 10, 128, 128, 128);
      sg.addColorStop(0, 'rgba(255, 246, 205, 0.95)');
      sg.addColorStop(0.28, 'rgba(255, 198, 96, 0.45)');
      sg.addColorStop(0.65, 'rgba(255, 140, 48, 0.14)');
      sg.addColorStop(1, 'rgba(255, 120, 30, 0.0)');
      shCtx.fillStyle = sg;
      shCtx.fillRect(0, 0, 256, 256);
    }
    const sunHaloTex = new THREE.CanvasTexture(sunHaloCanvas);
    sunHaloTex.colorSpace = THREE.SRGBColorSpace;
    this.dynamicScaler.registerStandaloneTexture(sunHaloTex, false);
    this.sunHaloSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: sunHaloTex,
        color: 0xffd27a,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
    );
    this.sunHaloSprite.scale.set(780, 780, 1);
    this.sunDisc.add(this.sunHaloSprite);
    this.scene.add(this.sunDisc);

    // Prominent Luminous Moon with Cratered 512px Lunar Texture & Crisp Glow Halo
    const lunarCanvas = document.createElement('canvas');
    lunarCanvas.width = 512;
    lunarCanvas.height = 512;
    const lctx = lunarCanvas.getContext('2d');
    if (lctx) {
      lctx.scale(2, 2);
      const grad = lctx.createRadialGradient(118, 112, 16, 128, 128, 128);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.75, '#e8eef9');
      grad.addColorStop(1, '#c9d6ed');
      lctx.fillStyle = grad;
      lctx.fillRect(0, 0, 256, 256);
      const craters: Array<[number, number, number, string]> = [
        [88, 92, 26, 'rgba(148,164,194,0.34)'],
        [156, 84, 34, 'rgba(136,154,186,0.32)'],
        [124, 154, 28, 'rgba(144,160,192,0.30)'],
        [176, 148, 18, 'rgba(130,148,180,0.28)'],
        [72, 146, 16, 'rgba(140,156,188,0.26)'],
        [114, 62, 14, 'rgba(155,172,202,0.25)'],
      ];
      craters.forEach(([cx, cy, r, col]) => {
        lctx.beginPath();
        lctx.arc(cx, cy, r, 0, Math.PI * 2);
        lctx.fillStyle = col;
        lctx.fill();
      });
    }
    const maxAniso = Math.min(this.maxAnisotropy, 16);
    const lunarTex = new THREE.CanvasTexture(lunarCanvas);
    lunarTex.colorSpace = THREE.SRGBColorSpace;
    lunarTex.generateMipmaps = true;
    lunarTex.minFilter = THREE.LinearMipmapLinearFilter;
    lunarTex.magFilter = THREE.LinearFilter;
    lunarTex.anisotropy = maxAniso;
    this.dynamicScaler.registerStandaloneTexture(lunarTex, true);

    const haloCanvas = document.createElement('canvas');
    haloCanvas.width = 256;
    haloCanvas.height = 256;
    const hctx = haloCanvas.getContext('2d');
    if (hctx) {
      const hg = hctx.createRadialGradient(128, 128, 12, 128, 128, 128);
      hg.addColorStop(0, 'rgba(220,234,255,0.85)');
      hg.addColorStop(0.35, 'rgba(166,198,255,0.32)');
      hg.addColorStop(1, 'rgba(120,160,240,0.0)');
      hctx.fillStyle = hg;
      hctx.fillRect(0, 0, 256, 256);
    }
    const haloTex = new THREE.CanvasTexture(haloCanvas);
    haloTex.colorSpace = THREE.SRGBColorSpace;
    haloTex.minFilter = THREE.LinearMipmapLinearFilter;
    haloTex.magFilter = THREE.LinearFilter;
    haloTex.anisotropy = maxAniso;
    this.dynamicScaler.registerStandaloneTexture(haloTex, false);

    this.moonGroup = new THREE.Group();
    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(125, 24, 24),
      new THREE.MeshBasicMaterial({ map: lunarTex, color: 0xf6f9ff, fog: false })
    );
    this.moonGroup.add(moonMesh);
    this.moonHaloSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: haloTex,
        color: 0xd6e6ff,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
    );
    this.moonHaloSprite.scale.set(648, 648, 1);
    this.moonGroup.add(this.moonHaloSprite);
    this.scene.add(this.moonGroup);

    // Dense Twinkling Starlight Canopy (2,400 multi-magnitude stars beyond max terrain horizon)
    const starCount = 2400;
    const starPos = new Float32Array(starCount * 3);
    const starCol = new Float32Array(starCount * 3);
    const starSize = new Float32Array(starCount);
    const starPhase = new Float32Array(starCount);
    let sSeed = 7919;
    const sRand = () => {
      sSeed = (sSeed * 16807) % 2147483647;
      return (sSeed - 1) / 2147483646;
    };
    const tmpStarCol = new THREE.Color();
    for (let i = 0; i < starCount; i++) {
      const u = sRand();
      const v = sRand();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(Math.max(0.03, v)); // Upper sky dome above horizon
      const rad = 2780 + sRand() * 140;
      starPos[i * 3] = Math.sin(phi) * Math.cos(theta) * rad;
      starPos[i * 3 + 1] = Math.cos(phi) * rad;
      starPos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * rad;

      const temp = sRand();
      if (temp < 0.25) tmpStarCol.setHex(0xc8dcff);
      else if (temp < 0.8) tmpStarCol.setHex(0xffffff);
      else tmpStarCol.setHex(0xffe4b8);
      starCol[i * 3] = tmpStarCol.r;
      starCol[i * 3 + 1] = tmpStarCol.g;
      starCol[i * 3 + 2] = tmpStarCol.b;

      starSize[i] = temp > 0.92 ? 5.2 + sRand() * 2.5 : 2.2 + sRand() * 2.6;
      starPhase[i] = sRand() * Math.PI * 2;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(starPhase, 1));
    this.starUniforms = { uTime: { value: 0 }, uOpacity: { value: 0 } };
    const starMat = new THREE.ShaderMaterial({
      uniforms: this.starUniforms,
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aPhase;
        attribute vec3 color;
        uniform float uTime;
        varying vec3 vColor;
        varying float vTwinkle;
        void main() {
          vColor = color;
          vTwinkle = 0.68 + 0.32 * sin(uTime * 2.1 + aPhase);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying vec3 vColor;
        varying float vTwinkle;
        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float d = length(c);
          if (d > 0.5) discard;
          float glow = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(vColor, glow * vTwinkle * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.starPoints = new THREE.Points(starGeo, starMat);
    this.starPoints.frustumCulled = false;
    this.starPoints.visible = false;
    this.scene.add(this.starPoints);

    // GPU-Animated Bioluminescent Fireflies Swarm across Ayodhya Groves, Stepwell & Riverbanks (Zero CPU loop / GPU upload!)
    const ffCount = 190;
    const ffPos = new Float32Array(ffCount * 3);
    const ffAmp = new Float32Array(ffCount * 3);
    const ffSpeed = new Float32Array(ffCount);
    const ffPhase = new Float32Array(ffCount);
    for (let i = 0; i < ffCount; i++) {
      const ang = sRand() * Math.PI * 2;
      const dist = 12 + sRand() * 118;
      const fx = Math.cos(ang) * dist;
      const fz = Math.sin(ang) * dist - 20;
      const fy = Math.max(0.4, groundHeightAt(fx, fz)) + 0.7 + sRand() * 3.4;
      ffPos[i * 3] = fx;
      ffPos[i * 3 + 1] = fy;
      ffPos[i * 3 + 2] = fz;
      ffAmp[i * 3] = 1.2 + sRand() * 2.4;
      ffAmp[i * 3 + 1] = 0.45 + sRand() * 0.9;
      ffAmp[i * 3 + 2] = 1.2 + sRand() * 2.4;
      ffSpeed[i] = 0.55 + sRand() * 0.85;
      ffPhase[i] = sRand() * Math.PI * 2;
    }
    const ffGeo = new THREE.BufferGeometry();
    ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
    ffGeo.setAttribute('aAmp', new THREE.BufferAttribute(ffAmp, 3));
    ffGeo.setAttribute('aSpeed', new THREE.BufferAttribute(ffSpeed, 1));
    ffGeo.setAttribute('aPhase', new THREE.BufferAttribute(ffPhase, 1));
    this.fireflyUniforms = { uTime: { value: 0 }, uOpacity: { value: 0 } };
    const ffMat = new THREE.ShaderMaterial({
      uniforms: this.fireflyUniforms,
      vertexShader: /* glsl */ `
        attribute vec3 aAmp;
        attribute float aSpeed;
        attribute float aPhase;
        uniform float uTime;
        varying float vPulse;
        void main() {
          float pulse = 0.5 + 0.5 * sin(uTime * 3.2 + aPhase * 2.3);
          vPulse = 0.25 + 0.75 * pow(pulse, 2.2);
          vec3 animated = position + vec3(
            sin(uTime * aSpeed + aPhase) * aAmp.x,
            sin(uTime * (aSpeed * 1.4) + aPhase * 1.7) * aAmp.y,
            cos(uTime * (aSpeed * 0.9) + aPhase * 0.8) * aAmp.z
          );
          vec4 mvPosition = modelViewMatrix * vec4(animated, 1.0);
          gl_PointSize = clamp(24.0 / max(1.0, -mvPosition.z) * (0.7 + 0.6 * vPulse), 2.5, 11.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying float vPulse;
        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float d = length(c);
          if (d > 0.5) discard;
          float core = smoothstep(0.5, 0.0, d);
          vec3 col = mix(vec3(0.62, 1.0, 0.28), vec3(1.0, 0.95, 0.52), core);
          gl_FragColor = vec4(col, core * vPulse * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.fireflyPoints = new THREE.Points(ffGeo, ffMat);
    this.fireflyPoints.frustumCulled = false;
    this.fireflyPoints.visible = false;
    this.scene.add(this.fireflyPoints);

    await checkStage(0.08, 'Sculpting celestial sky & displaced terrain chunks');

    // 1. Multi-Zone Stylized Low-Poly Displaced Open-World Terrain with Clean Facets & Volcanic Magma Seams
    const terrainMat = new THREE.MeshPhysicalMaterial({
      map: textures.grassEarth,
      vertexColors: true,
      flatShading: true,
      roughness: 0.92,
      metalness: 0.02,
      ior: 1.45,
      specularIntensity: 0.22,
    });
    this.terrainShaderUniforms = {
      uSlopeDetail: { value: initProf.shaderSlopeBlendEnabled ? 1.0 : 0.0 },
      uTerrTime: { value: 0.0 },
    };
    terrainMat.customProgramCacheKey = () => 'ayodhya-terrain-pbr-v1';
    terrainMat.onBeforeCompile = (shader) => {
      shader.uniforms.uSlopeDetail = this.terrainShaderUniforms!.uSlopeDetail;
      shader.uniforms.uTerrTime = this.terrainShaderUniforms!.uTerrTime;
      shader.vertexShader =
        `
        varying vec3 vTerrainWorldPos;
        varying vec3 vTerrainWorldNorm;
        ` +
        shader.vertexShader.replace(
          '#include <worldpos_vertex>',
          `
          #include <worldpos_vertex>
          vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vTerrainWorldNorm = normalize(mat3(modelMatrix) * objectNormal);
          `
        );
      shader.fragmentShader =
        `
        uniform float uSlopeDetail;
        uniform float uTerrTime;
        varying vec3 vTerrainWorldPos;
        varying vec3 vTerrainWorldNorm;
        ` +
        shader.fragmentShader
          .replace(
            '#include <color_fragment>',
            `
            #include <color_fragment>
            if (uSlopeDetail > 0.5) {
              // Break texture tiling across open fields with subtle world-space organic macro variation
              float macroA = sin(vTerrainWorldPos.x * 0.043 + cos(vTerrainWorldPos.z * 0.037) * 1.4);
              float macroB = cos(vTerrainWorldPos.z * 0.061 - sin(vTerrainWorldPos.x * 0.052) * 1.1);
              float macroTone = 0.91 + 0.14 * (macroA * 0.5 + macroB * 0.5 + 0.5);
              diffuseColor.rgb *= macroTone;

              // Expose stratified granite/earth along steep slopes & riverbanks
              float slopeAmt = smoothstep(0.92, 0.68, abs(vTerrainWorldNorm.y));
              vec3 slopeRock = vTerrainWorldPos.x > 2100.0 ? vec3(0.14, 0.11, 0.14) : vec3(0.42, 0.36, 0.28);
              diffuseColor.rgb = mix(diffuseColor.rgb, slopeRock, slopeAmt * 0.65);

              // Wet darkened shoreline soil near Sarayu water surface
              float wetBand = (1.0 - smoothstep(-0.75, 0.22, vTerrainWorldPos.y)) * step(vTerrainWorldPos.x, 260.0);
              diffuseColor.rgb *= mix(1.0, 0.64, wetBand * 0.72);
            }
            `
          )
          .replace(
            '#include <roughnessmap_fragment>',
            `
            #include <roughnessmap_fragment>
            if (uSlopeDetail > 0.5) {
              float wetRoughBand = (1.0 - smoothstep(-0.75, 0.18, vTerrainWorldPos.y)) * step(vTerrainWorldPos.x, 260.0);
              roughnessFactor = mix(roughnessFactor, 0.22, wetRoughBand * 0.75);
            }
            `
          )
          .replace(
            '#include <emissivemap_fragment>',
            `
            #include <emissivemap_fragment>
            if (uSlopeDetail > 0.5 && vTerrainWorldPos.x > 2320.0) {
              float fissure = sin(vTerrainWorldPos.x * 0.31 + sin(vTerrainWorldPos.z * 0.27) * 2.2) * cos(vTerrainWorldPos.z * 0.29);
              float vein = smoothstep(0.86, 0.99, fissure);
              float pulse = 0.72 + 0.28 * sin(uTerrTime * 2.8 + vTerrainWorldPos.x * 0.1);
              totalEmissiveRadiance += vec3(1.15, 0.22, 0.03) * vein * pulse * 0.9;
            }
            `
          );
    };

    const cGrass = new THREE.Color(0x62ab46);
    const cSand = new THREE.Color(0xdba96b);
    const cVulcanAsh = new THREE.Color(0x26212e);
    const cVulcanChar = new THREE.Color(0x191520);
    const cMagmaSeam = new THREE.Color(0x882812);
    const cDrySteppe = new THREE.Color(0xa29c54);
    const cTmp = new THREE.Color();

    const buildChunkedTerrainZone = (
      zoneCenterX: number,
      zoneCenterZ: number,
      width: number,
      depth: number,
      segW: number,
      segD: number,
      chunksX: number,
      chunksZ: number
    ) => {
      const chunkW = width / chunksX;
      const chunkD = depth / chunksZ;
      const chunkSegW = Math.round(segW / chunksX);
      const chunkSegD = Math.round(segD / chunksZ);
      const stepX = chunkW / chunkSegW;
      const stepZ = chunkD / chunkSegD;

      for (let cz = 0; cz < chunksZ; cz++) {
        for (let cx = 0; cx < chunksX; cx++) {
          const cCenterX = zoneCenterX - width * 0.5 + (cx + 0.5) * chunkW;
          const cCenterZ = zoneCenterZ - depth * 0.5 + (cz + 0.5) * chunkD;
          const geo = new THREE.PlaneGeometry(chunkW, chunkD, chunkSegW, chunkSegD);
          geo.rotateX(-Math.PI / 2);

          const pos = geo.attributes.position;
          const uv = geo.attributes.uv;
          const norm = geo.attributes.normal;
          const colors = new Float32Array(pos.count * 3);

          let minY = Infinity;
          let maxY = -Infinity;

          for (let i = 0; i < pos.count; i++) {
            const lx = pos.getX(i);
            const lz = pos.getZ(i);
            const wx = cCenterX + lx;
            const wz = cCenterZ + lz;
            const wy = groundHeightAt(wx, wz);
            pos.setY(i, wy);
            if (wy < minY) minY = wy;
            if (wy > maxY) maxY = wy;

            // Preserve global UV tiling seamlessly across adjacent terrain chunks
            const uGlobal = (wx - (zoneCenterX - width * 0.5)) / width;
            const vGlobal = 1.0 - (wz - (zoneCenterZ - depth * 0.5)) / depth;
            uv.setXY(i, uGlobal, vGlobal);

            // Analytical central-difference terrain normal -> zero normal seams across chunk edges
            const hL = groundHeightAt(wx - stepX, wz);
            const hR = groundHeightAt(wx + stepX, wz);
            const hD = groundHeightAt(wx, wz - stepZ);
            const hU = groundHeightAt(wx, wz + stepZ);
            _v1.set((hL - hR) / (2 * stepX), 1.0, (hD - hU) / (2 * stepZ)).normalize();
            norm.setXYZ(i, _v1.x, _v1.y, _v1.z);

            const rc = riverCenterX(wz);
            const rw = riverHalfWidth(wz);
            const riverDist = Math.abs(wx - rc);
            let col = cGrass;
            if (riverDist < rw + 6.8) {
              col = cSand;
            } else if (Math.hypot(wx, wz) < 18.5 || Math.hypot(wx - STEPWELL_POS.x, wz - STEPWELL_POS.z) < 12) {
              col = cSand;
            }

            if (wx > 2100) {
              const ashBlend = THREE.MathUtils.smoothstep(wx, 2100, 2320);
              const charPattern = Math.sin(wx * 0.17) * Math.cos(wz * 0.19);
              const ashCol = charPattern > 0.2 ? cVulcanChar : cVulcanAsh;
              cTmp.copy(cDrySteppe).lerp(ashCol, ashBlend);
              if (Math.hypot(wx - (DEMON_VILLAGE_CENTER_X + 75), wz - DEMON_VILLAGE_CENTER_Z) < 120 && charPattern > 0.74) {
                cTmp.lerp(cMagmaSeam, 0.72);
              }
            } else if (wx > 180) {
              const steppeBlend = THREE.MathUtils.smoothstep(wx, 180, 2100) * 0.78;
              cTmp.copy(col).lerp(cDrySteppe, steppeBlend);
            } else {
              cTmp.copy(col);
            }

            colors[i * 3] = cTmp.r;
            colors[i * 3 + 1] = cTmp.g;
            colors[i * 3 + 2] = cTmp.b;
          }
          geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
          geo.computeBoundingSphere();

          const mesh = new THREE.Mesh(geo, terrainMat);
          mesh.position.set(cCenterX, 0, cCenterZ);
          mesh.receiveShadow = true;
          this.scene.add(mesh);
          this.lockStaticHierarchy(mesh);
          this.occlusionManager.registerBounds(
            mesh,
            {
              minX: cCenterX - chunkW * 0.5,
              minY: minY - 1,
              minZ: cCenterZ - chunkD * 0.5,
              maxX: cCenterX + chunkW * 0.5,
              maxY: maxY + 2,
              maxZ: cCenterZ + chunkD * 0.5,
            },
            {
              alwaysKeepWithinDist: 105,
              skipOccluderCull: true,
            }
          );
        }
      }
    };

    buildChunkedTerrainZone(0, 0, 720, 720, 220, 220, 4, 4);
    await checkStage(0.18, 'Sculpting 2.5 km highway & volcanic plains');
    buildChunkedTerrainZone(1200, 0, 1680, 520, 220, 64, 5, 2);
    buildChunkedTerrainZone(2560, 0, 1040, 900, 220, 180, 4, 4);
    await checkStage(0.28, 'Laying Ayodhya stone avenues & Sarayu bridges');

    // 2. Royal Sandstone Pathways & 2.5 km Royal Highway (strictly non-overlapping segments; crossroads replaced by carpet or solid grass)
    const roadMat = new THREE.MeshPhysicalMaterial({
      map: textures.avenueStone,
      normalMap: textures.avenueNormal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: textures.avenueRoughness,
      roughness: 0.84,
      metalness: 0.04,
      ior: 1.52,
      specularIntensity: 0.48,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const addRoad = (w: number, d: number, x: number, z: number) => {
      if (w <= 0.5 || d <= 0.5) return;
      if (w > 220 || d > 220) {
        if (w >= d) {
          const chunks = Math.ceil(w / 200);
          const cw = w / chunks;
          const startX = x - w * 0.5;
          for (let ci = 0; ci < chunks; ci++) {
            addRoad(cw + 0.04, d, startX + (ci + 0.5) * cw, z);
          }
        } else {
          const chunks = Math.ceil(d / 200);
          const cd = d / chunks;
          const startZ = z - d * 0.5;
          for (let ci = 0; ci < chunks; ci++) {
            addRoad(w, cd + 0.04, x, startZ + (ci + 0.5) * cd);
          }
        }
        return;
      }
      const segW = Math.min(280, Math.max(4, Math.ceil(w / 8)));
      const segD = Math.max(4, Math.ceil(d / 4));
      const geo = new THREE.PlaneGeometry(w, d, segW, segD);
      geo.rotateX(-Math.PI / 2);
      const rPos = geo.attributes.position;
      for (let i = 0; i < rPos.count; i++) {
        const wx = x + rPos.getX(i);
        const wz = z + rPos.getZ(i);
        rPos.setY(i, groundHeightAt(wx, wz) + 0.018);
      }
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, roadMat);
      mesh.position.set(x, 0, z);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.lockStaticHierarchy(mesh);
      this.occlusionManager.registerBounds(
        mesh,
        {
          minX: x - w * 0.5,
          minY: -2,
          minZ: z - d * 0.5,
          maxX: x + w * 0.5,
          maxY: 16,
          maxZ: z + d * 0.5,
        },
        { alwaysKeepWithinDist: 90, skipOccluderCull: true }
      );
    };

    const westBankEnd = RIVER_CENTER_X - BRIDGE_HALF_SPAN;
    const eastBankStart = RIVER_CENTER_X + BRIDGE_HALF_SPAN;

    // North-South Avenue leading toward Mahadev Plaza & up to Sabha Crossroad (terminates cleanly outside Z in [-62, -50])
    addRoad(13, 30, 0, -35); // Z: -50 .. -20
    addRoad(13, 2.0, 0, -63); // Z: -64 .. -62 (Sabha forecourt threshold strip)
    addRoad(13, 110, 0, 74); // Z: +19 .. +129

    // Main East-West Avenue + 2.5 km Royal Highway connecting Ayodhya (0,0) to Volcanic Demon Village (2500,0)
    addRoad(-19 - -165, 12.5, (-165 + -19) * 0.5, 0);
    addRoad(westBankEnd - 19, 12.5, (19 + westBankEnd) * 0.5, 0);
    addRoad(2460 - eastBankStart, 13.0, (eastBankStart + 2460) * 0.5, 0);

    // Northern East-West Avenue (Z in [-62, -50]) split cleanly between crossroad junctions so ZERO planes overlap
    const addNorthernEwSpan = (xMin: number, xMax: number) => {
      addRoad(xMax - xMin, 12, (xMin + xMax) * 0.5, -56);
    };
    addNorthernEwSpan(-145, -39.6);
    addNorthernEwSpan(-32.4, -17.6);
    addNorthernEwSpan(-10.4, -6.5);
    addNorthernEwSpan(6.5, 14.6);
    addNorthernEwSpan(21.4, westBankEnd);
    addNorthernEwSpan(eastBankStart, 86);

    // Single flush non-overlapping Royal Red Carpet pad at the main Sabha Crossroad (0, -56),
    // while outer crossroad boxes (-36, -56), (-14, -56), and (+18, -56) remain clean solid green grass!
    const crossroadCarpetMat = new THREE.MeshPhysicalMaterial({
      map: textures.redCarpet,
      normalMap: textures.redCarpetNormal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: textures.redCarpetRoughness,
      roughness: 0.82,
      metalness: 0.05,
      ior: 1.48,
      sheen: 0.72,
      sheenRoughness: 0.62,
      sheenColor: new THREE.Color(0xff9b7a),
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const crossCarpetGeo = new THREE.PlaneGeometry(13.0, 12.0, 12, 12);
    crossCarpetGeo.rotateX(-Math.PI / 2);
    const ccPos = crossCarpetGeo.attributes.position;
    const ccUv = crossCarpetGeo.attributes.uv;
    for (let i = 0; i < ccPos.count; i++) {
      const wx = ccPos.getX(i);
      const wz = -56 + ccPos.getZ(i);
      ccPos.setY(i, groundHeightAt(wx, wz) + 0.058);
      ccUv.setXY(i, (wx + 6.5) / 5.2, (wz + 62) / 5.2);
    }
    crossCarpetGeo.computeVertexNormals();
    const crossCarpetMesh = new THREE.Mesh(crossCarpetGeo, crossroadCarpetMat);
    crossCarpetMesh.position.set(0, 0, -56);
    crossCarpetMesh.receiveShadow = true;
    crossCarpetMesh.renderOrder = 1;
    this.scene.add(crossCarpetMesh);
    this.lockStaticHierarchy(crossCarpetMesh);

    // Stables & Servant Quarters Spurs terminating strictly at Z = -62 (zero overlap with Northern EW Avenue)
    addRoad(7.2, 68, -14, -96); // Ashva-Shala Spur: Z -130 .. -62
    addRoad(7.2, 36, -36, -80); // Hathi-Shala Spur: Z -98 .. -62
    addRoad(6.8, 42, 18, -83);  // Servant Quarters Spur: Z -104 .. -62

    // Colossal Central Monumental Statue of Lord Mahadev with Black Shivling Base at (0, 0)
    const mahadev = createMahadevStatueModel(textures, 0, 0);
    this.shivlingWaterUniforms = mahadev.waterUniforms;
    const mahadevBaseY = groundHeightAt(0, 0);
    const mahadevLod = wrapMahadevWithLod(mahadev.group, 0, 0, this.lodCache!);
    mahadevLod.autoUpdate = false;
    this.scene.add(mahadevLod);
    this.lockStaticHierarchy(mahadevLod);
    this.occlusionManager.registerFromObject(mahadevLod, {
      alwaysKeepWithinDist: 75,
      onVisible: () => mahadevLod.update(this.camera),
    });
    this.occlusionManager.registerSolidOccluder({
      minX: -2.6,
      minY: mahadevBaseY,
      minZ: -2.6,
      maxX: 2.6,
      maxY: mahadevBaseY + 2.6,
      maxZ: 2.6,
    });
    this.circleColliders.push({
      x: 0,
      z: 0,
      radius: mahadev.radius,
      height: mahadev.height,
      baseY: mahadevBaseY,
    });

    // Grand Royal Torana Archways framing the central plaza & 2.5 km Frontier Gate
    this.addToranaArch(0, 20, 0);
    this.addToranaArch(21, 0, Math.PI / 2);
    this.addToranaArch(2080, 0, Math.PI / 2);

    // 3. Sculpted 20-Foot Deep Meandering Sarayu River Water Ribbon (chunked into 7 seamless frustum-culled ribbons)
    const waterMat = new THREE.MeshPhysicalMaterial({
      map: textures.water,
      normalMap: textures.waterNormal,
      normalScale: new THREE.Vector2(1.12, 1.12),
      color: 0x269cb8,
      roughness: 0.05,
      metalness: 0.10,
      ior: 1.333,
      reflectivity: 0.96,
      specularIntensity: 1.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.75,
      transparent: true,
      opacity: 0.76,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.waterShaderUniforms = {
      uTime: { value: 0.0 },
      uDaylight: { value: 1.0 },
      uSunDir: { value: new THREE.Vector3(0.5, 0.7, -0.4).normalize() },
    };
    waterMat.customProgramCacheKey = () => 'sarayu-water-pbr-v1';
    waterMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.waterShaderUniforms!.uTime;
      shader.uniforms.uDaylight = this.waterShaderUniforms!.uDaylight;
      shader.uniforms.uSunDir = this.waterShaderUniforms!.uSunDir;
      shader.vertexShader =
        `
        varying vec3 vWaterWorldPos;
        ` +
        shader.vertexShader.replace(
          '#include <worldpos_vertex>',
          `
          #include <worldpos_vertex>
          vWaterWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          `
        );
      shader.fragmentShader =
        `
        uniform float uTime;
        uniform float uDaylight;
        uniform vec3 uSunDir;
        varying vec3 vWaterWorldPos;
        ` +
        shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          `
          vec3 waterViewDir = normalize(vViewPosition);
          vec3 wNorm = normalize(vNormal);
          float wDotN = clamp(dot(waterViewDir, wNorm), 0.0, 1.0);
          float schlickFresnel = 0.03 + 0.97 * pow(1.0 - wDotN, 4.5);

          // Animated sunlit surface caustics + golden sky reflection + solar specular glint
          float waveA = sin(vWaterWorldPos.x * 1.35 + vWaterWorldPos.z * 0.85 - uTime * 2.1);
          float waveB = cos(vWaterWorldPos.x * 0.92 - vWaterWorldPos.z * 1.45 - uTime * 1.65);
          float causticGlint = pow(max(0.0, waveA * waveB), 4.0) * (0.28 + 0.55 * uDaylight);
          vec3 skyReflCol = mix(vec3(0.08, 0.14, 0.28), vec3(0.68, 0.86, 0.98), uDaylight);

          vec3 reflDir = reflect(-waterViewDir, wNorm);
          float sunSpec = pow(max(0.0, dot(reflDir, normalize(uSunDir))), 72.0) * uDaylight;

          gl_FragColor.rgb = mix(gl_FragColor.rgb, skyReflCol, schlickFresnel * 0.52);
          gl_FragColor.rgb += vec3(0.45, 0.85, 0.98) * causticGlint * 0.35;
          gl_FragColor.rgb += vec3(1.0, 0.92, 0.72) * sunSpec * 0.85;
          gl_FragColor.a = clamp(gl_FragColor.a + schlickFresnel * 0.24, 0.0, 0.96);
          #include <dithering_fragment>
          `
        );
    };
    const riverChunkCount = 7;
    const riverTotalLen = 840;
    const riverChunkSpan = riverTotalLen / riverChunkCount;
    let firstWaterMesh: THREE.Mesh | null = null;
    for (let rcIdx = 0; rcIdx < riverChunkCount; rcIdx++) {
      const cz = -riverTotalLen * 0.5 + (rcIdx + 0.5) * riverChunkSpan;
      const chunkLen = riverChunkSpan + 0.4;
      const chunkGeo = new THREE.PlaneGeometry(1, chunkLen, 14, 32);
      chunkGeo.rotateX(-Math.PI / 2);
      const cPos = chunkGeo.attributes.position;
      let minX = Infinity;
      let maxX = -Infinity;
      for (let i = 0; i < cPos.count; i++) {
        const u = cPos.getX(i);
        const wz = cz + cPos.getZ(i);
        const rc = riverCenterX(wz);
        const rw = riverHalfWidth(wz);
        const wx = rc + u * (rw * 2 + 5.2);
        cPos.setX(i, wx);
        if (wx < minX) minX = wx;
        if (wx > maxX) maxX = wx;
      }
      chunkGeo.computeVertexNormals();
      const chunkMesh = new THREE.Mesh(chunkGeo, waterMat);
      chunkMesh.position.set(0, RIVER_SURFACE_Y, cz);
      chunkMesh.renderOrder = 2;
      this.scene.add(chunkMesh);
      this.lockStaticHierarchy(chunkMesh);
      this.occlusionManager.registerBounds(
        chunkMesh,
        {
          minX: minX - 1,
          minY: RIVER_SURFACE_Y - 1,
          minZ: cz - chunkLen * 0.5,
          maxX: maxX + 1,
          maxY: RIVER_SURFACE_Y + 1,
          maxZ: cz + chunkLen * 0.5,
        },
        { alwaysKeepWithinDist: 160, skipOccluderCull: true }
      );
      if (!firstWaterMesh) firstWaterMesh = chunkMesh;
    }
    const waterMesh = firstWaterMesh!;

    // 4. Arched Carved Sandstone Bridges Matching groundHeightAt(x, z) Strictly
    const bridgeMat = new THREE.MeshStandardMaterial({
      map: textures.sandstone,
      normalMap: textures.sandstoneNormal,
      color: 0xdfb982,
      roughness: 0.74,
    });

    const deckHalfH = 0.29;
    const archDeckGeo = new THREE.BoxGeometry(
      BRIDGE_HALF_SPAN * 2,
      deckHalfH * 2,
      12.4,
      40,
      1,
      1
    );
    const deckPos = archDeckGeo.attributes.position;
    for (let i = 0; i < deckPos.count; i++) {
      const worldX = RIVER_CENTER_X + deckPos.getX(i);
      const archY = bridgeArchHeight(worldX);
      deckPos.setY(i, deckPos.getY(i) + archY - deckHalfH + 0.012);
    }
    archDeckGeo.computeVertexNormals();

    const railHalfH = 0.48;
    const archRailGeo = new THREE.BoxGeometry(
      BRIDGE_HALF_SPAN * 2,
      railHalfH * 2,
      0.58,
      40,
      1,
      1
    );
    const railPos = archRailGeo.attributes.position;
    for (let i = 0; i < railPos.count; i++) {
      const worldX = RIVER_CENTER_X + railPos.getX(i);
      const archY = bridgeArchHeight(worldX);
      railPos.setY(i, railPos.getY(i) + archY + railHalfH - 0.02);
    }
    archRailGeo.computeVertexNormals();

    BRIDGE_Z_LIST.forEach((bz) => {
      const bridgeGroup = new THREE.Group();
      bridgeGroup.position.set(RIVER_CENTER_X, 0, bz);

      const deck = new THREE.Mesh(archDeckGeo, bridgeMat);
      deck.castShadow = true;
      deck.receiveShadow = true;
      bridgeGroup.add(deck);

      [-5.9, 5.9].forEach((offsetZ) => {
        const rail = new THREE.Mesh(archRailGeo, bridgeMat);
        rail.position.set(0, 0, offsetZ);
        rail.castShadow = true;
        rail.receiveShadow = true;
        bridgeGroup.add(rail);

        this.colliders.push({
          x: RIVER_CENTER_X,
          z: bz + offsetZ,
          halfW: BRIDGE_HALF_SPAN,
          halfD: 0.45,
          height: 2.2,
          rotY: 0,
          baseY: 0,
        });
      });
      // Carved sandstone support piers extending down to the 20-ft deep river bed (-6.85m) with solid CylinderColliders
      [-7.5, 0, 7.5].forEach((pierOffX) => {
        const pierX = RIVER_CENTER_X + pierOffX;
        const topY = bridgeArchHeight(pierX) - 0.35;
        const pierH = topY + 6.9;
        [-4.2, 4.2].forEach((pierOffZ) => {
          const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, pierH, 10), bridgeMat);
          pier.position.set(pierOffX, topY - pierH * 0.5, pierOffZ);
          bridgeGroup.add(pier);
          this.circleColliders.push({
            x: pierX,
            z: bz + pierOffZ,
            radius: 1.05,
            height: pierH + 0.5,
            baseY: -7.0,
          });
        });
      });
      const bridgeLod = wrapBridgeWithLod(
        bridgeGroup,
        RIVER_CENTER_X,
        bz,
        BRIDGE_HALF_SPAN,
        this.lodCache!
      );
      bridgeLod.autoUpdate = false;
      this.scene.add(bridgeLod);
      this.lockStaticHierarchy(bridgeLod);
      this.occlusionManager.registerFromObject(bridgeLod, {
        alwaysKeepWithinDist: 75,
        onVisible: () => bridgeLod.update(this.camera),
      });
    });

    await checkStage(0.38, 'Constructing 7-story Suryavanshi Palace & Sabha Hall');

    // 5. LORD RAM'S SEVEN-STORY ROYAL PALACE COMPLEX (Zero-Overlap Masterplan)
    // 5a. Walkable Seven-Story Palace + Rajya Sabha Hall + Throne + 16 Council Seats + Every-Floor Torches
    const palaceBuilt = createSevenStoryPalaceAndSabhaModel(
      textures,
      SABHA_HALL_POS.x,
      SABHA_HALL_POS.z,
      PALACE_CORE_POS.x,
      PALACE_CORE_POS.z,
      THRONE_POS.x,
      THRONE_POS.z
    );
    this.scene.add(palaceBuilt.group);
    this.lockStaticHierarchy(palaceBuilt.group);
    this.occlusionManager.registerFromObject(palaceBuilt.group, {
      alwaysKeepWithinDist: 140,
      skipOccluderCull: true, // Keep open-window palace views uncapped from outdoor courtyard
    });
    this.colliders.push(...palaceBuilt.boxColliders);
    this.circleColliders.push(...palaceBuilt.circleColliders);
    this.sabhaSeats = palaceBuilt.seatPositions;
    this.palaceTorchAnchors = palaceBuilt.palaceTorchAnchors;
    this.roofOccluders.push(...palaceBuilt.roofOccluders);
    this.palaceStoryGroups = palaceBuilt.palaceStoryGroups;
    this.palaceTopRoofGroup = palaceBuilt.palaceTopRoofGroup;

    await checkStage(0.50, 'Building royal stables, training grounds & Surya-Kund stepwell');

    // 5b. Functional Servant Quarters Wing + Conservative Solid Rear Masonry Occluders
    const servantsBuilt = createServantQuartersModel(
      textures,
      SERVANT_QUARTERS_POS.x,
      SERVANT_QUARTERS_POS.z
    );
    this.scene.add(servantsBuilt.group);
    this.lockStaticHierarchy(servantsBuilt.group);
    this.occlusionManager.registerFromObject(servantsBuilt.group, { alwaysKeepWithinDist: 80 });
    const sqBaseY = Math.max(
      RIVER_SURFACE_Y + 0.35,
      groundHeightAt(SERVANT_QUARTERS_POS.x, SERVANT_QUARTERS_POS.z)
    );
    [-7.2, 7.2].forEach((qz) => {
      this.occlusionManager.registerSolidOccluder({
        minX: SERVANT_QUARTERS_POS.x + 5.8,
        minY: sqBaseY + 0.35,
        minZ: SERVANT_QUARTERS_POS.z + qz - 2.95,
        maxX: SERVANT_QUARTERS_POS.x + 6.2,
        maxY: sqBaseY + 3.9,
        maxZ: SERVANT_QUARTERS_POS.z + qz + 2.95,
      });
    });
    this.colliders.push(...servantsBuilt.colliders);
    this.roofOccluders.push(...servantsBuilt.roofOccluders);

    // 5c. Hathi-Shala (Elephant Stables) & Ashva-Shala (Mountable Royal Horse Stables & Courtyard Steeds)
    this.animalTemplates = [];
    const hathiBuilt = createElephantStableModel(
      textures,
      HATHI_STABLE_POS.x,
      HATHI_STABLE_POS.z
    );
    this.scene.add(hathiBuilt.group);
    this.lockStaticHierarchy(hathiBuilt.group);
    this.occlusionManager.registerFromObject(hathiBuilt.group, { alwaysKeepWithinDist: 80 });
    const hathiBaseY = Math.max(
      RIVER_SURFACE_Y + 0.35,
      groundHeightAt(HATHI_STABLE_POS.x, HATHI_STABLE_POS.z)
    );
    this.occlusionManager.registerSolidOccluder({
      minX: HATHI_STABLE_POS.x - 10.6,
      minY: hathiBaseY + 0.3,
      minZ: HATHI_STABLE_POS.z - 6.8,
      maxX: HATHI_STABLE_POS.x + 10.6,
      maxY: hathiBaseY + 5.1,
      maxZ: HATHI_STABLE_POS.z - 6.2,
    });
    this.colliders.push(...hathiBuilt.colliders);
    this.roofOccluders.push(...hathiBuilt.roofOccluders);
    hathiBuilt.elephantEntities.forEach((ent, idx) => {
      this.scene.add(ent.rig.group);
      this.animalTemplates.push({
        id: `elephant_${idx}`,
        kind: 'ELEPHANT',
        label: 'Sacred Elephant',
        elephantRig: ent.rig,
        homeX: ent.x,
        homeY: ent.y,
        homeZ: ent.z,
        homeYaw: ent.yaw,
      });
    });

    const ashvaBuilt = createHorseStableModel(
      textures,
      ASHVA_STABLE_POS.x,
      ASHVA_STABLE_POS.z
    );
    this.scene.add(ashvaBuilt.group);
    this.lockStaticHierarchy(ashvaBuilt.group);
    this.occlusionManager.registerFromObject(ashvaBuilt.group, { alwaysKeepWithinDist: 80 });
    const ashvaBaseY = Math.max(
      RIVER_SURFACE_Y + 0.35,
      groundHeightAt(ASHVA_STABLE_POS.x, ASHVA_STABLE_POS.z)
    );
    this.occlusionManager.registerSolidOccluder({
      minX: ASHVA_STABLE_POS.x - 11.4,
      minY: ashvaBaseY + 0.3,
      minZ: ASHVA_STABLE_POS.z - 5.85,
      maxX: ASHVA_STABLE_POS.x + 11.4,
      maxY: ashvaBaseY + 4.1,
      maxZ: ASHVA_STABLE_POS.z - 5.35,
    });
    this.colliders.push(...ashvaBuilt.colliders);
    this.roofOccluders.push(...ashvaBuilt.roofOccluders);
    ashvaBuilt.horseEntities.forEach((ent, idx) => {
      this.scene.add(ent.rig.group);
      this.animalTemplates.push({
        id: `ashva_stable_${idx}`,
        kind: 'HORSE',
        label: 'Royal Ashva',
        horseRig: ent.rig,
        homeX: ent.x,
        homeY: ent.y,
        homeZ: ent.z,
        homeYaw: ent.yaw,
      });
    });

    // 2 Courtyard Royal Steeds hitched along paved Ayodhya avenues for rapid mounting
    const sharedGoldMat = new THREE.MeshStandardMaterial({
      map: textures.armorMetal,
      normalMap: textures.armorNormal,
      color: 0xf4c552,
      roughness: 0.2,
      metalness: 0.9,
    });
    const sharedCaparisonMat = new THREE.MeshStandardMaterial({
      map: textures.velvetCurtain,
      normalMap: textures.velvetCurtainNormal,
      roughness: 0.56,
    });
    const sharedGemMat = new THREE.MeshPhysicalMaterial({
      color: 0xd1263c,
      roughness: 0.15,
      clearcoat: 1.0,
    });
    COURTYARD_ASHVA_SPAWNS.forEach((sp, idx) => {
      const coatMat = new THREE.MeshPhysicalMaterial({
        color: sp.coat,
        roughness: 0.36,
        metalness: 0.04,
        clearcoat: 0.22,
        clearcoatRoughness: 0.45,
        sheen: 0.42,
        sheenRoughness: 0.48,
        sheenColor: new THREE.Color(0xffffff),
      });
      const maneMat = new THREE.MeshPhysicalMaterial({
        color: sp.mane,
        roughness: 0.46,
        sheen: 0.85,
        sheenRoughness: 0.35,
        sheenColor: new THREE.Color(0xfff5e0),
      });
      const rig = createRoyalHorseUnit(coatMat, maneMat, sharedCaparisonMat, sharedGoldMat, sharedGemMat, false);
      const homeY = Math.max(RIVER_SURFACE_Y + 0.35, groundHeightAt(sp.x, sp.z));
      this.scene.add(rig.group);
      this.animalTemplates.push({
        id: `ashva_courtyard_${idx}`,
        kind: 'HORSE',
        label: 'Royal Ashva',
        horseRig: rig,
        homeX: sp.x,
        homeY,
        homeZ: sp.z,
        homeYaw: sp.yaw,
      });
    });

    // 5d. Astra-Shala Training Grounds (Gadas, Bhalas & Shields)
    const trainingBuilt = createTrainingGroundsModel(
      textures,
      TRAINING_GROUND_POS.x,
      TRAINING_GROUND_POS.z
    );
    this.scene.add(trainingBuilt.group);
    this.lockStaticHierarchy(trainingBuilt.group);
    this.occlusionManager.registerFromObject(trainingBuilt.group, { alwaysKeepWithinDist: 75 });
    this.colliders.push(...trainingBuilt.colliders);

    // 5e. Monumental Surya-Kund Stepwell (Sacred Bathing Vapi descending cleanly below courtyard)
    const stepwellBuilt = createMonumentalStepwellModel(
      textures,
      STEPWELL_POS.x,
      STEPWELL_POS.z
    );
    this.scene.add(stepwellBuilt.group);
    this.lockStaticHierarchy(stepwellBuilt.group);
    this.occlusionManager.registerFromObject(stepwellBuilt.group, {
      alwaysKeepWithinDist: 85,
      skipOccluderCull: true,
    });
    this.colliders.push(...stepwellBuilt.colliders);

    await checkStage(0.62, 'Placing Ayodhya temples & bazaar pavilions with LODs');

    // 5f. Temples & Bazaar Pavilions across Ayodhya wrapped with multi-tier THREE.LOD + OcclusionCullingManager
    const lodCache = this.lodCache!;
    BUILDING_LOCATIONS.forEach((b) => {
      if (b.type === 'TEMPLE') {
        const built = createTempleModel(textures, b.x, b.z, b.scale, b.rot);
        const lod = wrapTempleWithLod(built.group, b.x, b.z, b.scale, b.rot, lodCache);
        lod.autoUpdate = false;
        this.scene.add(lod);
        this.lockStaticHierarchy(lod);
        this.colliders.push(built.collider);
        this.occlusionManager.registerFromObject(lod, {
          alwaysKeepWithinDist: 70,
          onVisible: () => lod.update(this.camera),
        });
        // Solid stone sanctum core occluder (strictly inset inside carved stone cube so exterior rims remain untouched)
        const by = Math.max(RIVER_SURFACE_Y + 0.35, groundHeightAt(b.x, b.z));
        const halfCore = 4.2 * b.scale;
        this.occlusionManager.registerSolidOccluder({
          minX: b.x - halfCore,
          minY: by,
          minZ: b.z - halfCore,
          maxX: b.x + halfCore,
          maxY: by + 6.4 * b.scale,
          maxZ: b.z + halfCore,
        });
      } else {
        const built = createPavilionModel(textures, b.x, b.z, b.scale, b.rot);
        const lod = wrapPavilionWithLod(built.group, b.x, b.z, b.scale, b.rot, lodCache);
        lod.autoUpdate = false;
        this.scene.add(lod);
        this.lockStaticHierarchy(lod);
        this.colliders.push(built.collider);
        this.occlusionManager.registerFromObject(lod, {
          alwaysKeepWithinDist: 65,
          onVisible: () => lod.update(this.camera),
        });
      }
    });

    await checkStage(0.72, 'Erecting Volcanic Demon Village, peaks & craters');

    // 5g. 5 km Volcanic Demon Village Scenery wrapped with THREE.LOD & Solid Core Occluders
    DEMON_VILLAGE_STRUCTURES.forEach((s) => {
      const built = createDemonStructureModel(textures, s.x, s.z, s.scale, s.rot, s.kind);
      const lod = wrapDemonStructureWithLod(
        built.group,
        s.x,
        s.z,
        s.scale,
        s.rot,
        s.kind,
        lodCache
      );
      lod.autoUpdate = false;
      this.scene.add(lod);
      this.lockStaticHierarchy(lod);
      this.colliders.push(built.collider);
      this.occlusionManager.registerFromObject(lod, {
        alwaysKeepWithinDist: 85,
        onVisible: () => lod.update(this.camera),
      });
      if (s.kind === 'CITADEL') {
        const cy = groundHeightAt(s.x, s.z);
        const halfKeep = 3.9 * s.scale;
        this.occlusionManager.registerSolidOccluder({
          minX: s.x - halfKeep,
          minY: cy,
          minZ: s.z - halfKeep,
          maxX: s.x + halfKeep,
          maxY: cy + 6.8 * s.scale,
          maxZ: s.z + halfKeep,
        });
      }
    });

    this.volcanoCraters = [];
    DEMON_VOLCANOES.forEach((v) => {
      const built = createVolcanoModel(v.x, v.z, v.radius, v.height, textures);
      const lod = wrapVolcanoWithLod(built.group, v.x, v.z, v.radius, v.height, lodCache);
      lod.autoUpdate = false;
      this.scene.add(lod);
      this.lockStaticHierarchy(lod);
      this.occlusionManager.registerFromObject(lod, {
        alwaysKeepWithinDist: 160,
        skipFogCull: true, // Horizon silhouettes stay active cleanly
        onVisible: () => lod.update(this.camera),
      });
      // Solid opaque volcanic mountain interior core occluder (strictly inset inside basalt cone!)
      const vBaseY = groundHeightAt(v.x, v.z);
      const coreR = v.radius * 0.42;
      this.occlusionManager.registerSolidOccluder({
        minX: v.x - coreR,
        minY: vBaseY,
        minZ: v.z - coreR,
        maxX: v.x + coreR,
        maxY: vBaseY + v.height * 0.62,
        maxZ: v.z + coreR,
      });

      this.volcanoCraters.push({
        x: v.x,
        y: built.craterTopY,
        z: v.z,
        radius: v.radius * 0.16,
      });
      // Multi-tier stacked concentric colliders matching exact sloped cone skirt so Ratha cannot phase into volcano flanks
      [
        { rFrac: 0.94, hFrac: 0.28 },
        { rFrac: 0.72, hFrac: 0.58 },
        { rFrac: 0.46, hFrac: 1.0 },
      ].forEach((tier) => {
        this.circleColliders.push({
          x: v.x,
          z: v.z,
          radius: v.radius * tier.rFrac,
          height: v.height * tier.hFrac,
          baseY: vBaseY,
        });
      });
    });

    const blackMountains: Array<[number, number, number, number]> = [
      [2582, -148, 30, 42],
      [2612, -124, 34, 48],
      [2666, -24, 38, 54],
      [2678, 22, 34, 46],
      [2660, 96, 36, 48],
      [2614, 132, 30, 40],
      [2562, 148, 28, 34],
      [2532, -130, 26, 32],
      [2692, -82, 40, 56],
      [2672, 136, 36, 48],
    ];
    blackMountains.forEach(([mx, mz, mr, mh], idx) => {
      const mtn = createBlackMountainModel(mx, mz, mr, mh, idx * 1.73 + 0.5, textures);
      const lod = wrapBlackMountainWithLod(mtn, mx, mz, mr, mh, idx * 1.73 + 0.5, lodCache);
      lod.autoUpdate = false;
      this.scene.add(lod);
      this.lockStaticHierarchy(lod);
      this.occlusionManager.registerFromObject(lod, {
        alwaysKeepWithinDist: 160,
        skipFogCull: true,
        onVisible: () => lod.update(this.camera),
      });
      const mBaseY = groundHeightAt(mx, mz);
      const coreR = mr * 0.44;
      this.occlusionManager.registerSolidOccluder({
        minX: mx - coreR,
        minY: mBaseY,
        minZ: mz - coreR,
        maxX: mx + coreR,
        maxY: mBaseY + mh * 0.56,
        maxZ: mz + coreR,
      });

      this.circleColliders.push({
        x: mx,
        z: mz,
        radius: mr * 0.85,
        height: mh,
        baseY: mBaseY,
      });
    });

    const skeletonSites: Array<[number, number]> = [
      [2460, -14], [2474, 8], [2480, -24], [2492, -6], [2496, -32], [2504, -14],
      [2510, 10], [2522, -26], [2530, -40], [2478, 30], [2494, 34], [2516, 32],
      [2464, -42], [2502, -52], [2536, -10], [2488, 12],
    ];
    skeletonSites.forEach(([sx, sz], idx) => {
      const sk = createSkeletonDebrisCluster(sx, sz, idx * 1.37 + 0.4);
      this.scene.add(sk);
      this.lockStaticHierarchy(sk);
      this.occlusionManager.registerFromObject(sk, { alwaysKeepWithinDist: 45 });
    });

    const wheelSites: Array<[number, number]> = [
      [2456, 6], [2472, -12], [2486, -20], [2490, 18], [2506, -24], [2518, -6],
      [2472, 42], [2500, 30], [2526, 16], [2480, -48], [2512, -52], [2534, -26],
    ];
    wheelSites.forEach(([wx, wz], idx) => {
      const wd = createWheelDebris(textures, wx, wz, idx * 1.9 + 0.3);
      this.scene.add(wd);
      this.lockStaticHierarchy(wd);
      this.occlusionManager.registerFromObject(wd, { alwaysKeepWithinDist: 45 });
    });

    this.populateVolcanicAtmosphere();

    await checkStage(0.82, 'Populating Sarayu ecosystem & spatially sectored forest LODs');

    // 6. Active Sarayu River Ecosystem (5 Giant Turtles, Crocodiles, Jellyfish, Dolphins, Sharks & Fish Schools) + Surya-Kund Aquatic Life
    this.buildAquaticEcosystem();

    // 7. Scenic Sarayu Riverbank Waterfalls & Distant Himalayan Foothills
    this.buildSacredWaterfallsAndFoothills();

    // 8. Realistic Textured Trees, Shrubs, Riverbank Boulders & Flora partitioned into Spatial LOD Sectors
    this.populateInstancedNature();

    // 9. Authentic Iron Brazier Street Torches + 2.5 km Milestone Torches + 7-Story Palace Floor Torches
    this.populateAvenueTorches();
    await checkStage(1.0, 'Finalizing realm lighting & props');

    return waterMesh;
  }

  private buildSacredWaterfallsAndFoothills(): void {
    const textures = this.textures!;
    const profile = this.qualityManager.getProfile();

    this.waterfallShaderUniforms = {
      uTime: { value: 0 },
      uDaylight: { value: 1.0 },
    };

    const waterfallMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.waterfallShaderUniforms.uTime,
        uDaylight: this.waterfallShaderUniforms.uDaylight,
        tFoam: { value: textures.waterfallFoam },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vWorldY;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldY = wp.y;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uDaylight;
        uniform sampler2D tFoam;
        varying vec2 vUv;
        varying float vWorldY;
        void main() {
          vec2 uv1 = vec2(vUv.x * 2.2, vUv.y * 2.8 + uTime * 1.65);
          vec2 uv2 = vec2(vUv.x * 3.5 + 0.37, vUv.y * 4.2 + uTime * 2.35);
          float f1 = texture2D(tFoam, uv1).r;
          float f2 = texture2D(tFoam, uv2).r;
          float streak = clamp(f1 * 0.65 + f2 * 0.55, 0.0, 1.0);
          float edgeFade = smoothstep(0.0, 0.16, vUv.x) * (1.0 - smoothstep(0.84, 1.0, vUv.x));
          float topFade = 1.0 - smoothstep(0.90, 1.0, vUv.y);
          float plungeFoam = smoothstep(0.28, 0.0, vUv.y);
          vec3 waterTint = mix(vec3(0.08, 0.24, 0.36), vec3(0.22, 0.62, 0.78), uDaylight);
          vec3 foamCol = mix(vec3(0.45, 0.60, 0.72), vec3(0.94, 0.98, 1.0), uDaylight);
          vec3 col = mix(waterTint, foamCol, clamp(streak * 0.85 + plungeFoam * 0.75, 0.0, 1.0));
          float alpha = edgeFade * topFade * clamp(0.42 + streak * 0.52 + plungeFoam * 0.35, 0.0, 0.92);
          if (alpha < 0.04) discard;
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const splashMat = new THREE.MeshStandardMaterial({
      map: textures.waterfallFoam,
      color: 0xe6f8ff,
      transparent: true,
      opacity: 0.78,
      roughness: 0.38,
      depthWrite: false,
    });

    const cliffMat = new THREE.MeshStandardMaterial({
      map: textures.rockCliff,
      vertexColors: true,
      flatShading: true,
      roughness: 0.9,
      metalness: 0.02,
    });

    // Build two sculpted rocky cascade cliffs pouring from East Bank into the Sarayu River
    const cascadeSites: Array<{ z: number; height: number; width: number }> = [
      { z: -182, height: 15.5, width: 7.0 },
      { z: 168, height: 13.5, width: 6.4 },
    ];

    cascadeSites.forEach((site, idx) => {
      const rc = riverCenterX(site.z);
      const rw = riverHalfWidth(site.z);
      const cliffX = rc + rw + 8.2;
      const baseY = RIVER_SURFACE_Y - 0.6;

      const wfGroup = new THREE.Group();
      wfGroup.position.set(cliffX, baseY, site.z);

      // Multi-tiered granite/mossy rock bluff backing the cascade
      const rockTiers: Array<{ ox: number; oy: number; oz: number; rx: number; ry: number; rz: number }> = [
        { ox: 1.5, oy: site.height * 0.42, oz: 0, rx: 6.8, ry: site.height * 0.56, rz: 8.6 },
        { ox: -1.8, oy: site.height * 0.25, oz: -site.width * 0.62, rx: 4.4, ry: site.height * 0.36, rz: 3.8 },
        { ox: -1.8, oy: site.height * 0.27, oz: site.width * 0.62, rx: 4.5, ry: site.height * 0.38, rz: 3.9 },
        { ox: 4.5, oy: site.height * 0.52, oz: -3.2, rx: 5.5, ry: site.height * 0.62, rz: 6.4 },
        { ox: 4.2, oy: site.height * 0.48, oz: 3.4, rx: 5.2, ry: site.height * 0.58, rz: 6.1 },
      ];
      rockTiers.forEach((rt, rIdx) => {
        const geo = new THREE.DodecahedronGeometry(1.0, 1);
        const pos = geo.attributes.position;
        const cols = new Float32Array(pos.count * 3);
        for (let vi = 0; vi < pos.count; vi++) {
          const vx = pos.getX(vi);
          const vy = pos.getY(vi);
          const vz = pos.getZ(vi);
          const jag = 0.86 + 0.24 * Math.sin(vx * 3.1 + idx + rIdx) * Math.cos(vz * 2.9 - vy * 2.3);
          const sx = vx * rt.rx * jag;
          const sy = vy * rt.ry * (vy > 0 ? 1.04 : 0.92);
          const sz = vz * rt.rz * jag;
          pos.setXYZ(vi, sx, sy, sz);
          const mossT = THREE.MathUtils.clamp((vy + 0.15) * 0.9, 0, 1);
          const dampDark = vy < -0.25 ? 0.58 : 0.88;
          cols[vi * 3] = THREE.MathUtils.lerp(0.46, 0.38, mossT) * dampDark;
          cols[vi * 3 + 1] = THREE.MathUtils.lerp(0.42, 0.52, mossT) * dampDark;
          cols[vi * 3 + 2] = THREE.MathUtils.lerp(0.38, 0.31, mossT) * dampDark;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        geo.computeVertexNormals();
        const rockMesh = new THREE.Mesh(geo, cliffMat);
        rockMesh.position.set(rt.ox, rt.oy, rt.oz);
        rockMesh.castShadow = !this.isSoftwareGl;
        rockMesh.receiveShadow = true;
        wfGroup.add(rockMesh);
      });

      // Flowing curved waterfall sheet spilling west (-X) into the Sarayu River
      const sheetGeo = new THREE.PlaneGeometry(site.width, site.height + 1.2, 8, 14);
      const sPos = sheetGeo.attributes.position;
      for (let vi = 0; vi < sPos.count; vi++) {
        const px = sPos.getX(vi);
        const py = sPos.getY(vi);
        const vNorm = (py + (site.height + 1.2) * 0.5) / (site.height + 1.2); // 0 bottom .. 1 top
        const curveOut = Math.sin(vNorm * Math.PI * 0.55) * 1.65;
        const ripple = Math.sin(px * 1.4 + vNorm * 6.0) * 0.14;
        sPos.setZ(vi, curveOut + ripple);
      }
      sheetGeo.computeVertexNormals();
      const sheetMesh = new THREE.Mesh(sheetGeo, waterfallMat);
      sheetMesh.rotation.y = -Math.PI / 2;
      sheetMesh.position.set(-4.9, site.height * 0.46, 0);
      wfGroup.add(sheetMesh);

      // Churning splash foam ring where cascade meets Sarayu water surface
      const foamRingGeo = new THREE.RingGeometry(0.9, site.width * 0.78, 24);
      foamRingGeo.rotateX(-Math.PI / 2);
      const foamRing = new THREE.Mesh(foamRingGeo, splashMat);
      foamRing.position.set(-7.1, 0.68, 0);
      wfGroup.add(foamRing);

      this.scene.add(wfGroup);
      this.lockStaticHierarchy(wfGroup);
      this.occlusionManager.registerFromObject(wfGroup, {
        alwaysKeepWithinDist: 280,
        skipOccluderCull: true,
      });

      this.circleColliders.push({
        x: cliffX + 1.5,
        z: site.z,
        radius: 9.2,
        height: site.height + 1.0,
        baseY: RIVER_SURFACE_Y - 1.0,
      });
    });

    // Distant Northern Himalayan Foothill Ridge Peaks framing Ayodhya skyline
    const foothillSites: Array<[number, number, number, number]> = [
      [-230, -395, 62, 68],
      [-150, -412, 74, 88],
      [-65, -422, 82, 102],
      [25, -418, 78, 94],
      [115, -405, 68, 76],
      [195, -390, 58, 62],
    ];
    foothillSites.forEach(([fx, fz, fr, fh], fIdx) => {
      const mtn = createBlackMountainModel(fx, fz, fr, fh, fIdx * 2.13 + 0.8, textures);
      mtn.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          (child as THREE.Mesh).material = cliffMat;
        }
      });
      const lod = wrapBlackMountainWithLod(
        mtn,
        fx,
        fz,
        fr,
        fh,
        fIdx * 2.13 + 0.8,
        this.lodCache!,
        this.lodCache!.foothillRockMat
      );
      lod.autoUpdate = false;
      this.scene.add(lod);
      this.lockStaticHierarchy(lod);
      this.occlusionManager.registerFromObject(lod, {
        alwaysKeepWithinDist: 180,
        skipFogCull: true,
        onVisible: () => lod.update(this.camera),
      });
    });

    // Colossal Golden Warrior-Archer Monument framing Ayodhya & floating celestial temple islands
    const archerX = -56;
    const archerZ = -34;
    const archerY = groundHeightAt(archerX, archerZ);
    const archerMonument = createColossalGoldenArcherMonument(textures);
    archerMonument.position.set(archerX, archerY, archerZ);
    archerMonument.rotation.y = Math.PI * 0.16;
    this.scene.add(archerMonument);
    this.lockStaticHierarchy(archerMonument);
    this.occlusionManager.registerFromObject(archerMonument, {
      alwaysKeepWithinDist: 220,
      skipFogCull: true,
    });
    this.colliders.push({
      x: archerX,
      z: archerZ,
      halfW: 7.6,
      halfD: 7.6,
      height: 11.0,
      rotY: Math.PI * 0.16,
      baseY: archerY,
    });

    const islandSpecs: Array<[number, number, number, number]> = [
      [92, 64, -135, 1.35],
      [-108, 72, -198, 1.08],
      [154, 78, 92, 1.15],
    ];
    islandSpecs.forEach(([ix, iy, iz, iScale], idx) => {
      const built = createFloatingCelestialIsland(textures, iScale);
      built.group.position.set(ix, iy, iz);
      built.group.userData.baseY = iy;
      built.group.userData.phase = idx * 1.9;
      this.scene.add(built.group);
      this.floatingIslands.push(built.group);
      this.floatingIslandDefs.push({
        x: ix,
        z: iz,
        baseY: iy,
        scale: iScale,
        phase: idx * 1.9,
        group: built.group,
      });
      this.floatingIslandWfUniforms.push(built.waterfallUniforms);
      this.occlusionManager.registerFromObject(built.group, {
        alwaysKeepWithinDist: 4500,
        skipFogCull: true,
      });
    });
  }

  private buildAquaticEcosystem(): void {
    // 1. EXACTLY 5 Dynamically Emerging Giant Turtles in the 20-ft Deep Sarayu Channel
    const turtleZSpots = [-92, -32, 26, 78, 134];
    turtleZSpots.forEach((tz, idx) => {
      const built = createGiantTurtleModel(1.18 + (idx % 2) * 0.22);
      const rc = riverCenterX(tz);
      const xOff = (idx % 2 === 0 ? -1 : 1) * 4.5;
      built.root.position.set(rc + xOff, RIVER_SURFACE_Y - 1.2, tz);
      this.scene.add(built.root);
      this.riverTurtles.push({
        root: built.root,
        flippers: built.flippers,
        headGroup: built.headGroup,
        z: tz,
        xOff,
        phase: idx * 1.28,
      });
    });

    // 2. 4 Sarayu Marsh Crocodiles gliding near banks & surface
    [-115, -24, 48, 118].forEach((cz, idx) => {
      const croc = createCrocodileModel();
      const xOff = (idx % 2 === 0 ? -1 : 1) * 6.8;
      croc.root.position.set(riverCenterX(cz) + xOff, RIVER_SURFACE_Y - 0.14, cz);
      this.scene.add(croc.root);
      this.riverCrocodiles.push({
        root: croc.root,
        tailPivot: croc.tailPivot,
        z: cz,
        xOff,
        speed: (idx % 2 === 0 ? 1 : -1) * 2.1,
        phase: idx * 1.5,
      });
    });

    // 3. 10 Translucent Pulsing Jellyfish distributed across the 20-ft deep river column (-1.6m..-4.8m)
    const jellyTints = [0x74f2ff, 0xf294ff, 0x8effd1, 0xa8b4ff];
    for (let i = 0; i < 10; i++) {
      const jz = -120 + i * 26;
      const xOff = ((i % 3) - 1) * 4.2;
      const depthY = RIVER_SURFACE_Y - (1.4 + (i % 4) * 0.9);
      const jf = createJellyfishModel(jellyTints[i % jellyTints.length]);
      jf.root.position.set(riverCenterX(jz) + xOff, depthY, jz);
      this.scene.add(jf.root);
      this.riverJellyfish.push({
        root: jf.root,
        bell: jf.bell,
        xOff,
        baseY: depthY,
        z: jz,
        phase: i * 0.85,
      });
    }

    // 4. 4 River Dolphins swimming & leaping dynamically above the water surface
    [-76, -18, 38, 96].forEach((dz, idx) => {
      const dol = createDolphinModel();
      const xOff = (idx % 2 === 0 ? 2.5 : -2.5);
      dol.root.position.set(riverCenterX(dz) + xOff, RIVER_SURFACE_Y - 1.5, dz);
      this.scene.add(dol.root);
      this.riverDolphins.push({
        root: dol.root,
        tailPivot: dol.tailPivot,
        z: dz,
        xOff,
        phase: idx * 1.65,
      });
    });

    // 5. 4 Patrol Sharks cruising the deep mid-channel (-2.5m to -5.1m)
    [-108, -42, 18, 88].forEach((sz, idx) => {
      const sh = createSharkModel();
      const xOff = (idx % 2 === 0 ? -3.2 : 3.2);
      const depthY = RIVER_SURFACE_Y - (2.4 + (idx % 3) * 0.95);
      sh.root.position.set(riverCenterX(sz) + xOff, depthY, sz);
      this.scene.add(sh.root);
      this.riverSharks.push({
        root: sh.root,
        tailPivot: sh.tailPivot,
        z: sz,
        xOff,
        baseY: depthY,
        speed: (idx % 2 === 0 ? 1 : -1) * 4.2,
        phase: idx * 1.4,
      });
    });

    // 6. High-Density Schooling Fish (240 instanced fish across depths -0.9m..-5.8m)
    const fishGeo = createFishSchoolGeometry();
    const riverFishMat = new THREE.MeshStandardMaterial({
      color: 0xbfe2eb,
      roughness: 0.25,
      metalness: 0.45,
    });
    const fishCount = 240;
    this.riverFishMesh = new THREE.InstancedMesh(fishGeo, riverFishMat, fishCount);
    this.riverFishMesh.frustumCulled = false;
    const fishTint = new THREE.Color();
    this.riverFishAgents = [];
    for (let i = 0; i < fishCount; i++) {
      const schoolCenterZ = ((i % 8) - 4) * 34;
      const fz = schoolCenterZ + Math.sin(i * 3.1) * 10;
      const xOff = Math.cos(i * 1.9) * 8.5;
      const depthY = RIVER_SURFACE_Y - (0.9 + ((i * 7) % 50) * 0.1);
      const speed = (i % 16 < 8 ? 1 : -1) * (2.6 + (i % 5) * 0.45);
      this.riverFishAgents.push({
        z: fz,
        xOff,
        depthY,
        speed,
        phase: i * 0.47,
        scale: 0.8 + (i % 4) * 0.28,
      });
      fishTint.setHSL(0.54 + (i % 5) * 0.02, 0.55, 0.62 + (i % 3) * 0.1);
      this.riverFishMesh.setColorAt(i, fishTint);
    }
    if (this.riverFishMesh.instanceColor) this.riverFishMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.riverFishMesh);

    // 7. Surya-Kund Stepwell Small Aquatic Life (22 Golden Koi Minnows + 2 Small Pond Terrapins)
    const koiMat = new THREE.MeshStandardMaterial({
      color: 0xff9b38,
      roughness: 0.28,
      metalness: 0.2,
    });
    const koiCount = 22;
    this.stepwellKoiMesh = new THREE.InstancedMesh(fishGeo, koiMat, koiCount);
    this.stepwellKoiMesh.frustumCulled = false;
    this.stepwellKoiAgents = [];
    for (let i = 0; i < koiCount; i++) {
      this.stepwellKoiAgents.push({
        angle: (i / koiCount) * Math.PI * 2,
        radius: 1.4 + (i % 5) * 0.65,
        depthY: -0.95 - (i % 4) * 0.65,
        speed: (i % 2 === 0 ? 1 : -1) * (0.45 + (i % 3) * 0.14),
        phase: i * 0.72,
      });
      fishTint.setHSL(0.06 + (i % 4) * 0.03, 0.85, 0.58);
      this.stepwellKoiMesh.setColorAt(i, fishTint);
    }
    if (this.stepwellKoiMesh.instanceColor) this.stepwellKoiMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.stepwellKoiMesh);

    this.stepwellTurtles = [0, 1].map((idx) => {
      const mini = createGiantTurtleModel(0.38);
      const ang = idx * Math.PI;
      const rad = 2.6 + idx * 0.8;
      mini.root.position.set(
        STEPWELL_POS.x + Math.cos(ang) * rad,
        -0.58,
        STEPWELL_POS.z + Math.sin(ang) * rad
      );
      this.scene.add(mini.root);
      return {
        root: mini.root,
        flippers: mini.flippers,
        headGroup: mini.headGroup,
        angle: ang,
        radius: rad,
        phase: idx * 2.1,
      };
    });
  }

  private populateVolcanicAtmosphere(): void {
    const bombCount = 48;
    const bombGeo = new THREE.DodecahedronGeometry(0.45, 0);
    const bombMat = new THREE.MeshPhysicalMaterial({
      color: 0xff6b1c,
      emissive: 0xff4508,
      emissiveIntensity: 2.2,
      roughness: 0.35,
    });
    this.volcanicBombMesh = new THREE.InstancedMesh(bombGeo, bombMat, bombCount);
    this.volcanicBombMesh.frustumCulled = false;
    this.volcanicBombs = [];
    for (let i = 0; i < bombCount; i++) {
      const craterIdx = i % Math.max(1, this.volcanoCraters.length);
      const c = this.volcanoCraters[craterIdx] ?? { x: DEMON_VILLAGE_CENTER_X + 112, y: 54, z: -60, radius: 7 };
      const ang = (i * 2.399) % (Math.PI * 2);
      const spd = 7 + (i % 5) * 3.2;
      this.volcanicBombs.push({
        craterIdx,
        x: c.x + Math.cos(ang) * 1.8,
        y: c.y + ((i % 7) * 3.5),
        z: c.z + Math.sin(ang) * 1.8,
        vx: Math.cos(ang) * spd,
        vy: 15 + (i % 6) * 4.5,
        vz: Math.sin(ang) * spd,
        scale: 0.7 + (i % 4) * 0.35,
        rot: i * 0.7,
      });
    }
    this.scene.add(this.volcanicBombMesh);

    const smokeCount = 72;
    const smokeGeo = new THREE.SphereGeometry(1.0, 10, 8);
    const smokeMat = new THREE.MeshStandardMaterial({
      color: 0x26202b,
      emissive: 0x421406,
      emissiveIntensity: 0.42,
      roughness: 0.96,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
    });
    smokeMat.customProgramCacheKey = () => 'volcanic-smoke-soft-v1';
    smokeMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        #include <dithering_fragment>
        float fresnelSoft = clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0);
        gl_FragColor.a *= pow(fresnelSoft, 1.45);
        `
      );
    };
    this.volcanicSmokeMesh = new THREE.InstancedMesh(smokeGeo, smokeMat, smokeCount);
    this.volcanicSmokeMesh.frustumCulled = false;
    this.volcanicSmokePuffs = [];
    for (let i = 0; i < smokeCount; i++) {
      const fromCrater = i < 30 && this.volcanoCraters.length > 0;
      const crater = fromCrater ? this.volcanoCraters[i % this.volcanoCraters.length] : null;
      const bx = crater ? crater.x + ((i % 5) - 2) * 2.2 : 2440 + ((i * 29) % 165);
      const bz = crater ? crater.z + (((i * 3) % 5) - 2) * 2.2 : -95 + ((i * 43) % 185);
      const by = crater ? crater.y + 0.5 : groundHeightAt(bx, bz) + 1.5;
      const life = fromCrater ? 5.5 + (i % 4) * 1.4 : 7.5 + (i % 5) * 1.6;
      this.volcanicSmokePuffs.push({
        baseX: bx,
        baseY: by,
        baseZ: bz,
        age: (i / smokeCount) * life,
        life,
        scale: fromCrater ? 6.2 + (i % 4) * 2.4 : 3.4 + (i % 5) * 1.4,
        driftX: 1.8 + (i % 3) * 0.7,
        driftZ: -0.9 + ((i % 5) - 2) * 0.45,
      });
    }
    this.scene.add(this.volcanicSmokeMesh);
    this.occlusionManager.registerBounds(
      this.volcanicBombMesh,
      {
        minX: DEMON_ZONE_MIN_X - 40,
        minY: -5,
        minZ: -200,
        maxX: WORLD_BOUNDS.maxX,
        maxY: 165,
        maxZ: 200,
      },
      { alwaysKeepWithinDist: 220, skipOccluderCull: true }
    );
    this.occlusionManager.registerBounds(
      this.volcanicSmokeMesh,
      {
        minX: DEMON_ZONE_MIN_X - 40,
        minY: -5,
        minZ: -200,
        maxX: WORLD_BOUNDS.maxX,
        maxY: 165,
        maxZ: 200,
      },
      { alwaysKeepWithinDist: 220, skipOccluderCull: true }
    );
  }

  private addToranaArch(x: number, z: number, rotY: number): void {
    const textures = this.textures!;
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotY;

    const stoneMat = new THREE.MeshStandardMaterial({
      map: textures.sandstone,
      normalMap: textures.sandstoneNormal,
      color: 0xdfb988,
      roughness: 0.74,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      map: textures.armorMetal,
      normalMap: textures.armorNormal,
      color: 0xf4c24e,
      roughness: 0.22,
      metalness: 0.88,
    });

    [-7.6, 7.6].forEach((px) => {
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.48, 0.62, 6.8, 12),
        stoneMat
      );
      col.position.set(px, 3.4, 0);
      col.castShadow = true;
      group.add(col);

      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.55, 1.4),
        goldMat
      );
      cap.position.set(px, 6.95, 0);
      group.add(cap);

      // Register world-space cylinder collider for each Torana Arch pillar
      const wx = x + px * Math.cos(rotY);
      const wz = z - px * Math.sin(rotY);
      this.circleColliders.push({
        x: wx,
        z: wz,
        radius: 0.72,
        height: 8.8,
        baseY: groundHeightAt(wx, wz),
      });
    });

    const beam1 = new THREE.Mesh(
      new THREE.BoxGeometry(17.4, 0.75, 1.1),
      stoneMat
    );
    beam1.position.y = 7.45;
    beam1.castShadow = true;
    group.add(beam1);

    const beam2 = new THREE.Mesh(
      new THREE.BoxGeometry(18.6, 0.55, 0.9),
      goldMat
    );
    beam2.position.y = 8.45;
    group.add(beam2);

    const toranaLod = wrapToranaWithLod(group, x, z, rotY, this.lodCache!);
    toranaLod.autoUpdate = false;
    this.scene.add(toranaLod);
    this.lockStaticHierarchy(toranaLod);
    this.occlusionManager.registerFromObject(toranaLod, {
      alwaysKeepWithinDist: 75,
      onVisible: () => toranaLod.update(this.camera),
    });
  }

  private populateInstancedNature(): void {
    const textures = this.textures!;
    // Clean Stylized Multi-Branch Low-Poly Trunks + Layered Leaf Cluster Cards (LOD0 closeup + LOD1 far silhouette)
    const trunkParts: THREE.BufferGeometry[] = [];
    const mainTrunk = new THREE.CylinderGeometry(0.32, 0.62, 4.4, 6);
    mainTrunk.translate(0, 2.2, 0);
    trunkParts.push(mainTrunk);

    // 4 Radiating Boughs
    for (let b = 0; b < 4; b++) {
      const angle = (b / 4) * Math.PI * 2 + 0.35;
      const branch = new THREE.CylinderGeometry(0.12, 0.24, 2.7, 5);
      branch.translate(0, 1.35, 0);
      branch.rotateZ(0.68);
      branch.rotateY(angle);
      branch.translate(0, 3.35, 0);
      trunkParts.push(branch);
    }
    // 3 Flared Root Buttresses anchoring tree trunk cleanly into earth
    for (let rb = 0; rb < 3; rb++) {
      const rAng = (rb / 3) * Math.PI * 2 + 0.4;
      const root = new THREE.CylinderGeometry(0.14, 0.34, 1.25, 5);
      root.translate(0, 0.55, 0);
      root.rotateZ(0.45);
      root.rotateY(rAng);
      root.translate(Math.cos(rAng) * 0.18, 0, Math.sin(rAng) * 0.18);
      trunkParts.push(root);
    }
    const mergedTrunkGeo = mergeGeometries(trunkParts, false);
    trunkParts.forEach((g) => g.dispose());

    const lod1TrunkGeo = new THREE.CylinderGeometry(0.28, 0.58, 4.4, 5);
    lod1TrunkGeo.translate(0, 2.2, 0);

    const trunkMat = new THREE.MeshStandardMaterial({
      map: textures.bark,
      flatShading: true,
      roughness: 0.9,
      metalness: 0.02,
    });

    // Volumetric Crown Made of 7 Overlapping Botanical Leaf Cluster Planes (LOD0)
    const leafCardGeos: THREE.BufferGeometry[] = [];
    const crownOffsets = [
      { x: 0, y: 5.9, z: 0, s: 5.4, rx: 0.2, ry: 0.0 },
      { x: 1.5, y: 5.2, z: 0.9, s: 4.3, rx: 0.35, ry: 0.9 },
      { x: -1.5, y: 5.3, z: -0.9, s: 4.4, rx: -0.3, ry: 1.8 },
      { x: 0.9, y: 5.0, z: -1.5, s: 4.2, rx: 0.28, ry: 2.5 },
      { x: -1.1, y: 5.1, z: 1.4, s: 4.2, rx: -0.25, ry: 0.5 },
      { x: 0, y: 6.4, z: 0.2, s: 4.0, rx: 1.15, ry: 0.4 },
      { x: 0, y: 5.5, z: 0, s: 4.8, rx: -1.1, ry: 1.2 },
    ];
    crownOffsets.forEach((o) => {
      const card = new THREE.PlaneGeometry(o.s, o.s);
      card.rotateX(o.rx);
      card.rotateY(o.ry);
      card.translate(o.x, o.y, o.z);
      leafCardGeos.push(card);
    });
    const mergedCanopyGeo = mergeGeometries(leafCardGeos, false);
    leafCardGeos.forEach((g) => g.dispose());

    // Bake subtle inner crown AO vertex colors so deep interior leaves feel shaded relative to sunlit outer tips
    const applyCrownAoColors = (geo: THREE.BufferGeometry, minAo: number) => {
      const pos = geo.attributes.position;
      const cols = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const vz = pos.getZ(i);
        const r = Math.hypot(vx, vy - 5.4, vz);
        const ao = THREE.MathUtils.clamp(minAo + (r / 3.8) * (1.04 - minAo) + (vy - 5.2) * 0.05, minAo, 1.04);
        cols[i * 3] = ao;
        cols[i * 3 + 1] = ao;
        cols[i * 3 + 2] = ao;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    };
    applyCrownAoColors(mergedCanopyGeo, 0.56);

    // Simplified 2-card cross canopy for distant tree sector LOD1 (>= 140m)
    const lod1Card1 = new THREE.PlaneGeometry(5.6, 5.2);
    lod1Card1.translate(0, 5.5, 0);
    const lod1Card2 = lod1Card1.clone();
    lod1Card2.rotateY(Math.PI / 2);
    const lod1CanopyGeo = mergeGeometries([lod1Card1, lod1Card2], false);
    lod1Card1.dispose();
    lod1Card2.dispose();
    applyCrownAoColors(lod1CanopyGeo, 0.65);

    this.foliageWindUniforms = { uWindTime: { value: 0 } };
    const canopyMat = new THREE.MeshStandardMaterial({
      map: textures.foliage,
      alphaTest: 0.42,
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.82,
      metalness: 0.02,
    });
    canopyMat.customProgramCacheKey = () => 'ayodhya-foliage-wind-v1';
    canopyMat.onBeforeCompile = (shader) => {
      shader.uniforms.uWindTime = this.foliageWindUniforms!.uWindTime;
      shader.vertexShader =
        `uniform float uWindTime;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `
          #include <begin_vertex>
          float windHeight = max(0.0, transformed.y - 0.6);
          float worldSeed = 0.0;
          #ifdef USE_INSTANCING
            worldSeed = instanceMatrix[3][0] * 0.13 + instanceMatrix[3][2] * 0.17;
          #endif
          float sway = sin(uWindTime * 1.75 + worldSeed + transformed.x * 0.45 + transformed.z * 0.35);
          transformed.x += sway * 0.045 * windHeight;
          transformed.z += cos(uWindTime * 1.45 + worldSeed) * 0.032 * windHeight;
          `
        );
    };

    const treeCount = 260;
    let placed = 0;
    let seed = 17;
    const nextRand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    const foliageTint = new THREE.Color();
    const treePositions: { x: number; z: number }[] = [];
    const TREE_CELL = 100;
    interface TreePlacement {
      x: number;
      y: number;
      z: number;
      ry: number;
      scale: number;
      r: number;
      g: number;
      b: number;
    }
    const treeSectors = new Map<string, TreePlacement[]>();

    while (placed < treeCount) {
      const angle = nextRand() * Math.PI * 2;
      const radius = 34 + nextRand() * 255;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      if (Math.hypot(x, z) < 24 || Math.abs(x) < 12 || Math.abs(z) < 11 || Math.abs(z + 56) < 11) {
        continue;
      }
      // Keep the Royal Palace Complex, Stables, Training Grounds & Stepwell clear of trees
      if (x > -52 && x < 38 && z > -152 && z < -12) continue;
      // Exclude lush green forest from the volcanic east Demon Village bank
      if (x > riverCenterX(z) + riverHalfWidth(z) + 4) continue;
      if (Math.abs(x - riverCenterX(z)) < riverHalfWidth(z) + 6.5) continue;
      const hitsBuilding = this.colliders.some(
        (c) => Math.abs(x - c.x) < c.halfW + 4.5 && Math.abs(z - c.z) < c.halfD + 4.5
      );
      if (hitsBuilding) continue;

      const y = groundHeightAt(x, z);
      if (y <= RIVER_SURFACE_Y + 0.3 || isInRiverWater(x, z) || isInsideStepwellBasin(x, z)) continue;
      const s = 0.86 + nextRand() * 0.55;
      const ry = nextRand() * Math.PI * 2;
      foliageTint.setHSL(
        0.26 + (nextRand() - 0.5) * 0.07,
        0.35 + nextRand() * 0.2,
        0.75 + nextRand() * 0.25
      );

      const cellKey = `${Math.floor(x / TREE_CELL)}:${Math.floor(z / TREE_CELL)}`;
      let list = treeSectors.get(cellKey);
      if (!list) {
        list = [];
        treeSectors.set(cellKey, list);
      }
      list.push({
        x,
        y,
        z,
        ry,
        scale: s,
        r: foliageTint.r,
        g: foliageTint.g,
        b: foliageTint.b,
      });

      treePositions.push({ x, z });
      this.circleColliders.push({
        x,
        z,
        radius: 0.68 * s,
        height: 5.5 * s,
        baseY: y,
      });
      placed++;
    }

    treeSectors.forEach((items) => {
      const count = items.length;
      const trunks0 = new THREE.InstancedMesh(mergedTrunkGeo, trunkMat, count);
      const canopies0 = new THREE.InstancedMesh(mergedCanopyGeo, canopyMat, count);
      const trunks1 = new THREE.InstancedMesh(lod1TrunkGeo, trunkMat, count);
      const canopies1 = new THREE.InstancedMesh(lod1CanopyGeo, canopyMat, count);
      trunks0.castShadow = !this.isSoftwareGl;
      trunks0.receiveShadow = true;
      canopies0.castShadow = !this.isSoftwareGl;
      canopies0.receiveShadow = true;
      trunks1.castShadow = false;
      trunks1.receiveShadow = true;
      canopies1.castShadow = false;
      canopies1.receiveShadow = true;

      let minX = Infinity;
      let minY = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;
      let sumX = 0;
      let sumY = 0;
      let sumZ = 0;

      for (let idx = 0; idx < count; idx++) {
        const it = items[idx];
        _dummy.position.set(it.x, it.y, it.z);
        _dummy.rotation.set(0, it.ry, 0);
        _dummy.scale.setScalar(it.scale);
        _dummy.updateMatrix();
        trunks0.setMatrixAt(idx, _dummy.matrix);
        canopies0.setMatrixAt(idx, _dummy.matrix);
        trunks1.setMatrixAt(idx, _dummy.matrix);
        canopies1.setMatrixAt(idx, _dummy.matrix);

        foliageTint.setRGB(it.r, it.g, it.b);
        canopies0.setColorAt(idx, foliageTint);
        canopies1.setColorAt(idx, foliageTint);

        const pad = 4.6 * it.scale;
        if (it.x - pad < minX) minX = it.x - pad;
        if (it.y - 0.5 < minY) minY = it.y - 0.5;
        if (it.z - pad < minZ) minZ = it.z - pad;
        if (it.x + pad > maxX) maxX = it.x + pad;
        if (it.y + 9.5 * it.scale > maxY) maxY = it.y + 9.5 * it.scale;
        if (it.z + pad > maxZ) maxZ = it.z + pad;
        sumX += it.x;
        sumY += it.y + 4.0;
        sumZ += it.z;
      }

      trunks0.instanceMatrix.needsUpdate = true;
      canopies0.instanceMatrix.needsUpdate = true;
      trunks1.instanceMatrix.needsUpdate = true;
      canopies1.instanceMatrix.needsUpdate = true;
      if (canopies0.instanceColor) canopies0.instanceColor.needsUpdate = true;
      if (canopies1.instanceColor) canopies1.instanceColor.needsUpdate = true;
      trunks0.computeBoundingSphere();
      canopies0.computeBoundingSphere();
      trunks1.computeBoundingSphere();
      canopies1.computeBoundingSphere();
      // Keep sector InstancedMeshes exempt from local origin bbox skew since THREE.LOD handles sector culling via OcclusionCullingManager
      trunks0.frustumCulled = false;
      canopies0.frustumCulled = false;
      trunks1.frustumCulled = false;
      canopies1.frustumCulled = false;

      const lod0Group = new THREE.Group();
      lod0Group.add(trunks0, canopies0);
      const lod1Group = new THREE.Group();
      lod1Group.add(trunks1, canopies1);

      const lod = new THREE.LOD();
      // Compute world distance relative to sector centroid so THREE.LOD switches cleanly
      const cx = sumX / count;
      const cy = sumY / count;
      const cz = sumZ / count;
      lod.position.set(cx, cy, cz);
      lod0Group.position.set(-cx, -cy, -cz);
      lod1Group.position.set(-cx, -cy, -cz);
      lod.addLevel(lod0Group, 0);
      lod.addLevel(lod1Group, 140);
      lod.autoUpdate = false;

      this.scene.add(lod);
      this.lockStaticHierarchy(lod);
      this.occlusionManager.registerBounds(
        lod,
        { minX, minY, minZ, maxX, maxY, maxZ },
        {
          alwaysKeepWithinDist: 75,
          onVisible: () => lod.update(this.camera),
        }
      );
    });

    // 340 Textured Ground Shrubs, Reeds & Ferns partitioned into 120m×120m Spatial Sectors
    const shrubCard1 = new THREE.PlaneGeometry(2.2, 1.8);
    shrubCard1.translate(0, 0.75, 0);
    const shrubCard2 = shrubCard1.clone();
    shrubCard2.rotateY(Math.PI / 2);
    const shrubGeo = mergeGeometries([shrubCard1, shrubCard2], false);
    shrubCard1.dispose();
    shrubCard2.dispose();
    // Match vertexColors attribute on shared canopyMat
    {
      const sPos = shrubGeo.attributes.position;
      const sCols = new Float32Array(sPos.count * 3);
      for (let si = 0; si < sPos.count; si++) {
        const ao = THREE.MathUtils.clamp(0.65 + sPos.getY(si) * 0.24, 0.62, 1.0);
        sCols[si * 3] = ao;
        sCols[si * 3 + 1] = ao;
        sCols[si * 3 + 2] = ao;
      }
      shrubGeo.setAttribute('color', new THREE.BufferAttribute(sCols, 3));
    }

    const shrubCount = 340;
    const SHRUB_CELL = 120;
    interface ShrubPlacement {
      x: number;
      y: number;
      z: number;
      ry: number;
      scale: number;
      r: number;
      g: number;
      b: number;
    }
    const shrubSectors = new Map<string, ShrubPlacement[]>();
    for (let i = 0; i < shrubCount; i++) {
      let ox: number;
      let oz: number;
      if (i < 260) {
        const anchor = treePositions[i % treePositions.length];
        ox = anchor.x + (nextRand() - 0.5) * 9.5;
        oz = anchor.z + (nextRand() - 0.5) * 9.5;
      } else {
        oz = -280 + nextRand() * 560;
        const nearBridge = BRIDGE_Z_LIST.some((bz) => Math.abs(oz - bz) < 9.5);
        if (nearBridge) oz += 12;
        ox = riverCenterX(oz) - (riverHalfWidth(oz) + 1.8 + nextRand() * 4.2);
      }
      let oy = groundHeightAt(ox, oz);
      if (
        ox > riverCenterX(oz) + riverHalfWidth(oz) + 3 ||
        isInRiverWater(ox, oz) ||
        isInsideStepwellBasin(ox, oz) ||
        oy <= RIVER_SURFACE_Y + 0.14
      ) {
        const anchor = treePositions[i % treePositions.length];
        ox = anchor.x + (nextRand() - 0.5) * 6;
        oz = anchor.z + (nextRand() - 0.5) * 6;
        oy = groundHeightAt(ox, oz);
      }
      const py = Math.max(oy, RIVER_SURFACE_Y + 0.15);
      const ry = nextRand() * Math.PI;
      const sc = 0.65 + nextRand() * 0.65;
      foliageTint.setHSL(0.27 + (nextRand() - 0.5) * 0.08, 0.4, 0.72 + nextRand() * 0.22);

      const cellKey = `${Math.floor(ox / SHRUB_CELL)}:${Math.floor(oz / SHRUB_CELL)}`;
      let list = shrubSectors.get(cellKey);
      if (!list) {
        list = [];
        shrubSectors.set(cellKey, list);
      }
      list.push({
        x: ox,
        y: py,
        z: oz,
        ry,
        scale: sc,
        r: foliageTint.r,
        g: foliageTint.g,
        b: foliageTint.b,
      });
    }

    shrubSectors.forEach((items) => {
      const mesh = new THREE.InstancedMesh(shrubGeo, canopyMat, items.length);
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      let minX = Infinity;
      let minY = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;
      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        _dummy.position.set(it.x, it.y, it.z);
        _dummy.rotation.set(0, it.ry, 0);
        _dummy.scale.setScalar(it.scale);
        _dummy.updateMatrix();
        mesh.setMatrixAt(idx, _dummy.matrix);
        foliageTint.setRGB(it.r, it.g, it.b);
        mesh.setColorAt(idx, foliageTint);
        const pad = 1.8 * it.scale;
        if (it.x - pad < minX) minX = it.x - pad;
        if (it.y - 0.2 < minY) minY = it.y - 0.2;
        if (it.z - pad < minZ) minZ = it.z - pad;
        if (it.x + pad > maxX) maxX = it.x + pad;
        if (it.y + 2.4 * it.scale > maxY) maxY = it.y + 2.4 * it.scale;
        if (it.z + pad > maxZ) maxZ = it.z + pad;
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
      this.lockStaticHierarchy(mesh);
      this.occlusionManager.registerBounds(
        mesh,
        { minX, minY, minZ, maxX, maxY, maxZ },
        { alwaysKeepWithinDist: 65 }
      );
    });

    // Sculpted Natural Riverbank Boulders partitioned into 120m Z Sectors along Sarayu shoreline
    const bankRockCount = 72;
    const bankRockGeo = new THREE.DodecahedronGeometry(1.15, 1);
    const rockMat = new THREE.MeshStandardMaterial({
      map: textures.sandstone,
      normalMap: textures.sandstoneNormal,
      color: 0x7c6d5d,
      roughness: 0.9,
    });
    interface RockPlacement {
      x: number;
      y: number;
      z: number;
      rx: number;
      ry: number;
      rz: number;
      sx: number;
      sy: number;
      sz: number;
    }
    const rockSectors = new Map<number, RockPlacement[]>();
    for (let i = 0; i < bankRockCount; i++) {
      let rz = -260 + (i / bankRockCount) * 520 + (nextRand() - 0.5) * 4.5;
      if (BRIDGE_Z_LIST.some((bz) => Math.abs(rz - bz) < 9.2)) {
        rz += 11.5;
      }
      const side = i % 2 === 0 ? -1 : 1;
      let rx = riverCenterX(rz) + side * (riverHalfWidth(rz) + 1.45 + nextRand() * 2.4);
      for (let t = 0; t < 4 && (groundHeightAt(rx, rz) <= RIVER_SURFACE_Y + 0.14 || isInRiverWater(rx, rz)); t++) {
        rx += side * 0.85;
      }
      const ry = Math.max(groundHeightAt(rx, rz), RIVER_SURFACE_Y + 0.16);
      const sx = 0.75 + nextRand() * 0.85;
      const sy = 0.52 + nextRand() * 0.45;
      const sz = 0.75 + nextRand() * 0.85;
      const secIdx = Math.floor(rz / 120);
      let list = rockSectors.get(secIdx);
      if (!list) {
        list = [];
        rockSectors.set(secIdx, list);
      }
      list.push({
        x: rx,
        y: ry + 0.12,
        z: rz,
        rx: nextRand() * 0.4,
        ry: nextRand() * Math.PI * 2,
        rz: nextRand() * 0.4,
        sx,
        sy,
        sz,
      });
    }

    rockSectors.forEach((items) => {
      const rocks = new THREE.InstancedMesh(bankRockGeo, rockMat, items.length);
      rocks.castShadow = !this.isSoftwareGl;
      rocks.receiveShadow = true;
      rocks.frustumCulled = false;
      let minX = Infinity;
      let minY = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;
      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        _dummy.position.set(it.x, it.y, it.z);
        _dummy.rotation.set(it.rx, it.ry, it.rz);
        _dummy.scale.set(it.sx, it.sy, it.sz);
        _dummy.updateMatrix();
        rocks.setMatrixAt(idx, _dummy.matrix);
        const padX = 1.4 * it.sx;
        const padY = 1.4 * it.sy;
        const padZ = 1.4 * it.sz;
        if (it.x - padX < minX) minX = it.x - padX;
        if (it.y - padY < minY) minY = it.y - padY;
        if (it.z - padZ < minZ) minZ = it.z - padZ;
        if (it.x + padX > maxX) maxX = it.x + padX;
        if (it.y + padY > maxY) maxY = it.y + padY;
        if (it.z + padZ > maxZ) maxZ = it.z + padZ;
      }
      rocks.instanceMatrix.needsUpdate = true;
      rocks.computeBoundingSphere();
      this.scene.add(rocks);
      this.lockStaticHierarchy(rocks);
      this.occlusionManager.registerBounds(
        rocks,
        { minX, minY, minZ, maxX, maxY, maxZ },
        { alwaysKeepWithinDist: 65 }
      );
    });
  }

  private populateAvenueTorches(): void {
    const textures = this.textures!;
    this.lampCoords = [
      // Four grand torches framing the central Mahadev courtyard
      [-9.5, -9.5],
      [9.5, -9.5],
      [-9.5, 9.5],
      [9.5, 9.5],
      // Royal Sabha & 7-Story Palace approach torches
      [-10.5, -62],
      [10.5, -62],
      // Southern & Northern avenue torches
      [-8.5, 24],
      [8.5, 24],
      [-8.5, 44],
      [8.5, 44],
      // East-West avenue & Sarayu bridge approach torches
      [27, -8.5],
      [27, 8.5],
      [62, -8.5],
      [62, 8.5],
      [-28, -8.5],
      [-28, 8.5],
      [-28, -47],
      [-28, -65],
      [27, -47],
      [27, -65],
    ];
    // Add 2.5 km Royal Highway Milestone Torches every 350m guiding toward Volcanic Demon Village
    for (let hx = 350; hx <= 2200; hx += 350) {
      this.lampCoords.push([hx, -8.5], [hx, 8.5]);
    }
    const positions = this.lampCoords;

    // Multi-part forged iron & bronze standing fire torch structure
    const stonePlinthParts: THREE.BufferGeometry[] = [];
    const plinthBase = new THREE.CylinderGeometry(0.28, 0.36, 0.42, 8);
    plinthBase.translate(0, 0.21, 0);
    stonePlinthParts.push(plinthBase);
    const stonePlinthGeo = mergeGeometries(stonePlinthParts, false);
    stonePlinthParts.forEach((g) => g.dispose());

    const ironParts: THREE.BufferGeometry[] = [];
    const shaft = new THREE.CylinderGeometry(0.08, 0.13, 2.95, 8);
    shaft.translate(0, 1.88, 0);
    ironParts.push(shaft);

    const collar = new THREE.CylinderGeometry(0.22, 0.11, 0.22, 8);
    collar.translate(0, 3.28, 0);
    ironParts.push(collar);

    const brazierBowl = new THREE.CylinderGeometry(0.35, 0.18, 0.28, 8);
    brazierBowl.translate(0, 3.52, 0);
    ironParts.push(brazierBowl);

    const topRim = new THREE.TorusGeometry(0.38, 0.036, 6, 12);
    topRim.rotateX(Math.PI / 2);
    topRim.translate(0, 3.92, 0);
    ironParts.push(topRim);

    for (let r = 0; r < 6; r++) {
      const a = (r / 6) * Math.PI * 2;
      const rib = new THREE.CylinderGeometry(0.022, 0.026, 0.46, 5);
      rib.translate(Math.cos(a) * 0.36, 3.74, Math.sin(a) * 0.36);
      ironParts.push(rib);
    }
    const mergedTorchIronGeo = mergeGeometries(ironParts, false);
    ironParts.forEach((g) => g.dispose());

    const stoneMat = new THREE.MeshStandardMaterial({
      map: textures.sandstone,
      normalMap: textures.sandstoneNormal,
      color: 0x9b8366,
      roughness: 0.82,
    });
    const ironMat = new THREE.MeshStandardMaterial({
      map: textures.armorMetal,
      normalMap: textures.armorNormal,
      color: 0x2c2825,
      roughness: 0.48,
      metalness: 0.72,
    });
    const emberGeo = new THREE.DodecahedronGeometry(0.26, 0);
    emberGeo.scale(1.0, 0.55, 1.0);
    const emberMat = new THREE.MeshStandardMaterial({
      color: 0x6b200c,
      emissive: 0xff4500,
      emissiveIntensity: 1.6,
      roughness: 0.6,
    });

    this.torchFlameUniforms = { uFlameTime: { value: 0 } };
    const installFlameTurbulence = (mat: THREE.MeshPhysicalMaterial) => {
      mat.customProgramCacheKey = () => 'torch-flame-turbulence-v1';
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uFlameTime = this.torchFlameUniforms!.uFlameTime;
        shader.vertexShader =
          `uniform float uFlameTime;\n` +
          shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            float hNorm = clamp(transformed.y * 1.6, 0.0, 1.0);
            float seedF = 0.0;
            #ifdef USE_INSTANCING
              seedF = instanceMatrix[3][0] * 0.31 + instanceMatrix[3][2] * 0.27;
            #endif
            float tongue = sin(uFlameTime * 9.5 + seedF + transformed.y * 11.0);
            transformed.x += tongue * 0.055 * hNorm;
            transformed.z += cos(uFlameTime * 8.2 + seedF + transformed.y * 9.0) * 0.045 * hNorm;
            `
          );
      };
    };

    const outerFlameGeo = new THREE.ConeGeometry(0.24, 0.68, 7, 4);
    outerFlameGeo.translate(0, 0.34, 0);
    const outerFlameMat = new THREE.MeshPhysicalMaterial({
      color: 0xff7b1c,
      emissive: 0xff5a0a,
      emissiveIntensity: 2.0,
      roughness: 0.4,
      transparent: true,
      opacity: 0.9,
    });
    installFlameTurbulence(outerFlameMat);

    const coreFlameGeo = new THREE.ConeGeometry(0.13, 0.44, 6, 3);
    coreFlameGeo.translate(0, 0.22, 0);
    const coreFlameMat = new THREE.MeshPhysicalMaterial({
      color: 0xffe48a,
      emissive: 0xffc842,
      emissiveIntensity: 2.5,
      roughness: 0.25,
    });
    installFlameTurbulence(coreFlameMat);

    const totalFlames = positions.length + this.palaceTorchAnchors.length;
    const embers = new THREE.InstancedMesh(emberGeo, emberMat, totalFlames);

    // Simplified LOD1 6-sided lamp post proxy for distant spatial sectors (>= 115m)
    const litePostGeo = new THREE.CylinderGeometry(0.11, 0.24, 3.85, 6);
    litePostGeo.translate(0, 1.925, 0);

    // Designated Ayodhya Street Lamp Amber Crystal Lantern Globes mounted on outer avenue & courtyard lamp posts
    const lanternGeo = new THREE.SphereGeometry(0.24, 10, 8);
    this.lampBulbMat = new THREE.MeshStandardMaterial({
      color: 0xffd27d,
      emissive: 0xffa438,
      emissiveIntensity: 0.9,
      roughness: 0.25,
      transparent: true,
      opacity: 0.88,
    });

    this.torchFlamesOuter = new THREE.InstancedMesh(outerFlameGeo, outerFlameMat, totalFlames);
    this.torchFlamesCore = new THREE.InstancedMesh(coreFlameGeo, coreFlameMat, totalFlames);
    this.torchFlamesOuter.frustumCulled = false;
    this.torchFlamesCore.frustumCulled = false;
    this.torchFlameAnchors = [];

    const LAMP_SECTOR_W = 160;
    const lampSectors = new Map<
      number,
      Array<{ x: number; y: number; z: number; ry: number }>
    >();

    positions.forEach(([x, z], idx) => {
      const y = groundHeightAt(x, z);
      const ry = idx * 0.5;
      _dummy.position.set(x, y, z);
      _dummy.rotation.set(0, ry, 0);
      _dummy.scale.setScalar(1);
      _dummy.updateMatrix();

      const secIdx = Math.floor(x / LAMP_SECTOR_W);
      let secList = lampSectors.get(secIdx);
      if (!secList) {
        secList = [];
        lampSectors.set(secIdx, secList);
      }
      secList.push({ x, y, z, ry });

      _dummy.position.set(x, y + 3.66, z);
      _dummy.updateMatrix();
      embers.setMatrixAt(idx, _dummy.matrix);
      this.torchFlamesOuter!.setMatrixAt(idx, _dummy.matrix);
      this.torchFlamesCore!.setMatrixAt(idx, _dummy.matrix);

      this.torchFlameAnchors.push({ x, y: y + 3.66, z, phase: idx * 1.37 });

      this.circleColliders.push({
        x,
        z,
        radius: 0.38,
        height: 4.1,
        baseY: y,
      });
    });

    // Partition avenue lamp plinths, forged iron posts, and lantern globes into 160m X-axis THREE.LOD sectors
    lampSectors.forEach((items) => {
      const count = items.length;
      const plinths = new THREE.InstancedMesh(stonePlinthGeo, stoneMat, count);
      const posts0 = new THREE.InstancedMesh(mergedTorchIronGeo, ironMat, count);
      const globes = new THREE.InstancedMesh(lanternGeo, this.lampBulbMat!, count);
      const posts1 = new THREE.InstancedMesh(litePostGeo, ironMat, count);
      plinths.frustumCulled = false;
      posts0.frustumCulled = false;
      globes.frustumCulled = false;
      posts1.frustumCulled = false;

      let minX = Infinity;
      let minY = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;
      let sumX = 0;
      let sumY = 0;
      let sumZ = 0;

      for (let li = 0; li < count; li++) {
        const it = items[li];
        _dummy.position.set(it.x, it.y, it.z);
        _dummy.rotation.set(0, it.ry, 0);
        _dummy.scale.setScalar(1);
        _dummy.updateMatrix();
        plinths.setMatrixAt(li, _dummy.matrix);
        posts0.setMatrixAt(li, _dummy.matrix);
        posts1.setMatrixAt(li, _dummy.matrix);

        _dummy.position.set(it.x, it.y + 3.74, it.z);
        _dummy.updateMatrix();
        globes.setMatrixAt(li, _dummy.matrix);

        if (it.x - 1.5 < minX) minX = it.x - 1.5;
        if (it.y - 0.5 < minY) minY = it.y - 0.5;
        if (it.z - 1.5 < minZ) minZ = it.z - 1.5;
        if (it.x + 1.5 > maxX) maxX = it.x + 1.5;
        if (it.y + 4.8 > maxY) maxY = it.y + 4.8;
        if (it.z + 1.5 > maxZ) maxZ = it.z + 1.5;
        sumX += it.x;
        sumY += it.y + 2.0;
        sumZ += it.z;
      }

      plinths.instanceMatrix.needsUpdate = true;
      posts0.instanceMatrix.needsUpdate = true;
      globes.instanceMatrix.needsUpdate = true;
      posts1.instanceMatrix.needsUpdate = true;
      plinths.computeBoundingSphere();
      posts0.computeBoundingSphere();
      globes.computeBoundingSphere();
      posts1.computeBoundingSphere();

      const cx = sumX / count;
      const cy = sumY / count;
      const cz = sumZ / count;
      const lod0 = new THREE.Group();
      lod0.add(plinths, posts0, globes);
      lod0.position.set(-cx, -cy, -cz);
      const lod1 = new THREE.Group();
      lod1.add(posts1);
      lod1.position.set(-cx, -cy, -cz);

      const lod = new THREE.LOD();
      lod.position.set(cx, cy, cz);
      lod.addLevel(lod0, 0);
      lod.addLevel(lod1, 115);
      lod.autoUpdate = false;
      this.scene.add(lod);
      this.lockStaticHierarchy(lod);
      this.occlusionManager.registerBounds(
        lod,
        { minX, minY, minZ, maxX, maxY, maxZ },
        {
          alwaysKeepWithinDist: 85,
          onVisible: () => lod.update(this.camera),
        }
      );
    });

    // Also attach animated flames to EVERY floor's standing torches in the 7-story palace
    this.palaceTorchAnchors.forEach((pa, pIdx) => {
      const fIdx = positions.length + pIdx;
      _dummy.position.set(pa.x, pa.y, pa.z);
      _dummy.rotation.set(0, pa.phase, 0);
      _dummy.scale.setScalar(0.8);
      _dummy.updateMatrix();
      embers.setMatrixAt(fIdx, _dummy.matrix);
      this.torchFlamesOuter!.setMatrixAt(fIdx, _dummy.matrix);
      this.torchFlamesCore!.setMatrixAt(fIdx, _dummy.matrix);
      this.torchFlameAnchors.push(pa);
    });

    embers.instanceMatrix.needsUpdate = true;
    this.torchFlamesOuter.instanceMatrix.needsUpdate = true;
    this.torchFlamesCore.instanceMatrix.needsUpdate = true;
    embers.computeBoundingSphere();
    this.torchFlamesOuter.computeBoundingSphere();
    this.torchFlamesCore.computeBoundingSphere();
    embers.frustumCulled = false;
    this.scene.add(embers, this.torchFlamesOuter, this.torchFlamesCore);
    this.lockStaticHierarchy(embers);

    // Single-draw-call Warm Amber Emissive Glow Halos at every lamp & palace torch so night lamps stay warm when PointLights are pooled
    const haloCount = this.torchFlameAnchors.length;
    if (haloCount > 0) {
      const haloPos = new Float32Array(haloCount * 3);
      for (let i = 0; i < haloCount; i++) {
        const a = this.torchFlameAnchors[i];
        haloPos[i * 3] = a.x;
        haloPos[i * 3 + 1] = a.y + 0.18;
        haloPos[i * 3 + 2] = a.z;
      }
      const haloGeo = new THREE.BufferGeometry();
      haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPos, 3));
      this.lampHaloUniforms = { uOpacity: { value: 0 } };
      const haloMat = new THREE.ShaderMaterial({
        uniforms: this.lampHaloUniforms,
        vertexShader: /* glsl */ `
          void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = clamp(180.0 / max(2.0, -mvPosition.z), 4.0, 42.0);
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uOpacity;
          void main() {
            vec2 c = gl_PointCoord - vec2(0.5);
            float d = length(c) * 2.0;
            if (d > 1.0) discard;
            float aura = pow(1.0 - d, 2.2);
            gl_FragColor = vec4(1.0, 0.62, 0.2, aura * uOpacity);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this.lampHaloPoints = new THREE.Points(haloGeo, haloMat);
      this.lampHaloPoints.frustumCulled = false;
      this.lampHaloPoints.visible = false;
      this.scene.add(this.lampHaloPoints);
    }
  }

  private createWaypointBeacon(): THREE.Group {
    const group = new THREE.Group();
    const beamMat = new THREE.MeshPhysicalMaterial({
      color: 0xf6c343,
      emissive: 0xe6a825,
      emissiveIntensity: 1.6,
      roughness: 0.25,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 28, 16, 1, true),
      beamMat
    );
    beam.position.y = 14;
    group.add(beam);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.7, 2.2, 24),
      new THREE.MeshPhysicalMaterial({
        color: 0xf6c343,
        emissive: 0xf2b729,
        emissiveIntensity: 1.8,
        roughness: 0.22,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    group.add(ring);
    return group;
  }

  public clearInputs(): void {
    this.input.moveX = 0;
    this.input.moveY = 0;
    this.input.cameraDeltaX = 0;
    this.input.cameraDeltaY = 0;
    this.input.sprint = false;
    this.input.jumpPressed = false;
    this.input.fireHeld = false;
    this.input.astraPressed = false;
    this.input.shootAstraPressed = false;
    this.input.interactPressed = false;
    this.input.switchSeatPressed = false;
    this.input.stealthTogglePressed = false;
    this.input.autoDriveTogglePressed = false;
    this.input.flyTogglePressed = false;
    this.input.heroSpecialPressed = false;
    this.playerHorizSpeed = 0;
    this.playerTurnRate = 0;
    this.lastResolvedMoveSpeed = 0;
  }

  public resetWorldEntities(): void {
    this.clearInputs();
    this.setStealthMode(false);
    this.restoreRamStandingClothes();
    this.abortBrahmaSummon();
    this.astraQuest?.failBrahmaTrial('World restarted.');
    this.astraEnergy = ASTRA_MAX_ENERGY;
    for (const id of ASTRA_ORDER) this.astraCooldowns[id] = 0;
    // Release active pooled entities cleanly back to their pools (zero GPU leaks on restart)
    for (let i = 0; i < this.chariots.length; i++) {
      this.poolManager.release('ratha', this.chariots[i].rig);
    }
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.alive || e.dissolving) {
        e.dissolving = false;
        e.rig.root.scale.setScalar(1);
        this.poolManager.release(this.demonPoolKey(e.variant, e.isCommander), e.rig);
      }
    }
    for (let i = 0; i < this.citizens.length; i++) {
      const c = this.citizens[i];
      this.poolManager.release(c.poolKey, c.rig);
    }
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      this.poolManager.release(p.poolKey, p.mesh);
    }
    for (let i = 0; i < this.enemyProjectiles.length; i++) {
      this.poolManager.release('enemyProjectile', this.enemyProjectiles[i].mesh);
    }
    for (let i = 0; i < this.groundHazards.length; i++) {
      this.poolManager.release('groundHazard', this.groundHazards[i].mesh);
    }
    for (let i = 0; i < this.blasts.length; i++) {
      this.poolManager.release('blast', this.blasts[i].mesh);
    }
    this.chariots.length = 0;
    this.enemies.length = 0;
    this.citizens.length = 0;
    this.projectiles.length = 0;
    this.enemyProjectiles.length = 0;
    this.groundHazards.length = 0;
    this.blasts.length = 0;

    // Reset player state & restore standing cloth transforms
    this.autoDriveActive = false;
    this.chariotAutoWaypoints.length = 0;
    this.chariotAutoWpIdx = 0;
    this.chariotAutoGoalKey = '';
    this.chariotReverseIntent = false;
    this.bowDrawHoldTimer = 0;
    this.chakraCooldown = 0;
    this.playerX = 0;
    this.playerZ = 14;
    this.playerY = groundHeightAt(this.playerX, this.playerZ);
    this.playerVelY = 0;
    this.grounded = true;
    this.playerYaw = Math.PI;
    this.walkPhase = 0;
    resetPoseState(this.ramPose, 0.93);
    this.ramRig.root.position.set(this.playerX, this.playerY, this.playerZ);
    this.ramRig.root.rotation.order = 'YXZ';
    this.ramRig.root.rotation.set(0, this.playerYaw, 0);
    this.syncRigVisibilityForPerspective(false);
    this.camYaw = 0;
    this.camPitch = 0.02;
    this.isFlying = false;
    this.heroAbilityCooldown = 0;
    const activeProfile = HERO_PROFILES[this.activeHeroId];
    this.maxHp = activeProfile.maxHp;
    this.hp = this.maxHp;
    this.maxPrana = activeProfile.maxPrana;
    this.prana = this.maxPrana;
    this.karma = 0;
    this.wantedLevel = 0;
    this.mountedChariotIndex = null;
    this.mountedAnimalIndex = null;
    this.mountedSeatIndex = null;
    this.pendingVehicleAction = null;
    this.recentHostActionAcks.clear();
    this.lastAppliedWorldSnapshotSeq = 0;
    this.lanWorldSnapshotSeq = 0;
    this.mountNoticeText = null;
    this.mountNoticeExpiresMs = 0;
    this.seatedOnThrone = false;
    this.isRamSwimming = false;
    this.cameraManualHold = 0;
    this.camChariotLockTimer = 0;
    this.missionIdx = 0;
    this.missionProgress = 0;
    this.completedMissions = 0;
    this.ascensionActive = false;
    this.ascensionElapsed = 0;
    this.ascensionCompleted = false;

    // Reset all mountable Stable Elephants, Stable Horses & Courtyard Ashvas to home stalls
    this.animals = this.animalTemplates.map((tpl) => {
      const obj = tpl.horseRig ? tpl.horseRig.group : tpl.elephantRig!.group;
      obj.position.set(tpl.homeX, tpl.homeY, tpl.homeZ);
      obj.rotation.set(0, tpl.homeYaw, 0);
      return {
        id: tpl.id,
        kind: tpl.kind,
        label: tpl.label,
        horseRig: tpl.horseRig,
        elephantRig: tpl.elephantRig,
        homeX: tpl.homeX,
        homeY: tpl.homeY,
        homeZ: tpl.homeZ,
        homeYaw: tpl.homeYaw,
        x: tpl.homeX,
        y: tpl.homeY,
        z: tpl.homeZ,
        yaw: tpl.homeYaw,
        speed: 0,
        vx: 0,
        vz: 0,
        gaitPhase: 0,
        animState: createDefaultQuadrupedState(tpl.homeYaw),
        driverId: null,
        passengerId: null,
        occupancyEpoch: 0,
        netSeq: 0,
        driverSeq: 0,
        hasRemoteSync: false,
        syncTargetX: tpl.homeX,
        syncTargetY: tpl.homeY,
        syncTargetZ: tpl.homeZ,
        syncTargetYaw: tpl.homeYaw,
        syncTargetSpeed: 0,
        syncTargetVx: 0,
        syncTargetVz: 0,
        syncTargetGaitPhase: 0,
      };
    });

    // Spawn 5 Royal Rathas around Ayodhya & Frontier from pool with secured initial reins
    RATHA_SPAWNS.forEach((sp, i) => {
      const rig = this.poolManager.acquire<ChariotRig>('ratha');
      const y = this.surfaceHeightAt(sp.x, sp.z);
      rig.root.position.set(sp.x, y, sp.z);
      rig.root.rotation.y = sp.yaw;
      if (rig.leftReinMesh && rig.leftBridleHook && rig.leftRailHook) {
        updateDynamicReinMesh(rig.leftReinMesh, rig.leftBridleHook, rig.leftRailHook, 0.2);
      }
      if (rig.rightReinMesh && rig.rightBridleHook && rig.rightRailHook) {
        updateDynamicReinMesh(rig.rightReinMesh, rig.rightBridleHook, rig.rightRailHook, 0.2);
      }
      this.chariots.push({
        id: `ratha_${i}`,
        rig,
        x: sp.x,
        y,
        z: sp.z,
        yaw: sp.yaw,
        pitch: 0,
        speed: 0,
        vx: 0,
        vz: 0,
        gaitPhase: 0,
        steedStates: rig.steeds.map(() => createDefaultQuadrupedState(sp.yaw)),
        driverId: null,
        passengerId: null,
        occupancyEpoch: 0,
        netSeq: 0,
        driverSeq: 0,
        hasRemoteSync: false,
        syncTargetX: sp.x,
        syncTargetY: y,
        syncTargetZ: sp.z,
        syncTargetYaw: sp.yaw,
        syncTargetPitch: 0,
        syncTargetSpeed: 0,
        syncTargetVx: 0,
        syncTargetVz: 0,
        syncTargetGaitPhase: 0,
      });
    });

    // Spawn exclusively traditionally attired Ayodhya NPCs (ALL wear dhoti, padukas & janeu)
    // Includes 6 Ministers, 6 Commanders, 4 Spies (each assigned an exact Sabha seat!), plus Swimming Bathers, Servants, Grooms, Soldiers & Citizens
    const spawnTradNpc = (
      role: NpcRole,
      x: number,
      z: number,
      colorHex: number,
      courtSeat: SabhaSeatDef | null = null,
      canSwim = false
    ) => {
      const poolKey = `citizen_${role}_${colorHex}`;
      const rig = this.poolManager.acquire<CharacterRig>(poolKey);
      const initY = this.surfaceHeightAt(x, z);
      const safe = this.resolveStaticColliders(x, z, 0.48, initY, false, false, canSwim);
      const y = this.surfaceHeightAt(safe.x, safe.z);
      rig.root.position.set(safe.x, y, safe.z);
      this.citizens.push({
        rig,
        poolKey,
        role,
        x: safe.x,
        y,
        z: safe.z,
        homeX: safe.x,
        homeZ: safe.z,
        yaw: Math.random() * Math.PI * 2,
        walkPhase: Math.random() * 6,
        patrolTimer: 1.0 + Math.random() * 2.5,
        courtSeat,
        seated: false,
        canSwim,
        isSwimming: false,
        navQueue: [],
        navCursor: 0,
        pose: createDefaultPoseState(0.875),
        speedBlend: 0,
        kinematicAccumDt: 0,
      });
    };

    const ministerSeats = this.sabhaSeats.filter((s) => s.role === 'MINISTER');
    const commanderSeats = this.sabhaSeats.filter((s) => s.role === 'COMMANDER');
    const spySeats = this.sabhaSeats.filter((s) => s.role === 'SPY');

    // 6 Ministers positioned around the Sabha forecourt & temple plaza
    [
      [-9, -56], [9, -56], [-12, -46], [12, -46], [-8, -32], [8, -32],
    ].forEach(([nx, nz], idx) => {
      spawnTradNpc('MINISTER', nx, nz, 0xb52b27, ministerSeats[idx] ?? null);
    });

    // 6 Commanders stationed at Sabha terrace, Training Grounds & Palace Gate
    [
      [-24, -66], [-28, -82], [14, -62], [-15, -62], [-34, -66], [14, -74],
    ].forEach(([nx, nz], idx) => {
      spawnTradNpc('COMMANDER', nx, nz, 0xd98a1e, commanderSeats[idx] ?? null);
    });

    // 4 Spies stationed discreetly around Bazaar, Stepwell & River Avenue
    [
      [-18, -14], [18, -16], [-18, 28], [18, 28],
    ].forEach(([nx, nz], idx) => {
      spawnTradNpc('SPY', nx, nz, 0x2f3b52, spySeats[idx] ?? null);
    });

    // 5 Functional Servants tending Servant Quarters & Palace Courtyards
    [
      [20, -94], [22, -100], [18, -90], [21, -104], [12, -88],
    ].forEach(([nx, nz]) => {
      spawnTradNpc('SERVANT', nx, nz, 0xa35a2a);
    });

    // 4 Stable Grooms tending Elephant & Horse Stables
    [
      [-34, -96], [-26, -98], [-18, -126], [-8, -126],
    ].forEach(([nx, nz]) => {
      spawnTradNpc('GROOM', nx, nz, 0x4f6840);
    });

    // 4 Soldiers guarding Training Grounds & Courtyard Gates
    [
      [-30, -76], [-40, -76], [-8, 16], [8, 16],
    ].forEach(([nx, nz]) => {
      spawnTradNpc('SOLDIER', nx, nz, 0xc44324);
    });

    // 6 Swimmer Devotees patrolling Sarayu Riverbanks & Surya-Kund East Steps (voluntarily entering & swimming in water)
    [
      [26, -24], [27, 22], [25, 42], [26, -84],
      [-19, -28], [-22, -28],
    ].forEach(([nx, nz], idx) => {
      spawnTradNpc('CITIZEN', nx, nz, idx % 2 === 0 ? 0xe0aa46 : 0xd8c39e, null, true);
    });

    // 8 Townsfolk strolling Ayodhya Bazaar, Courtyards & able to wade/swim seamlessly into Sarayu & Surya-Kund
    const citizenColors = [0xd8c39e, 0xc76b44, 0x5c8a72, 0xe0aa46];
    for (let i = 0; i < 8; i++) {
      const x = (i % 2 === 0 ? -1 : 1) * (10 + (i % 4) * 4);
      const z = 18 + i * 5;
      spawnTradNpc('CITIZEN', x, z, citizenColors[i % citizenColors.length], null, true);
    }

    // Populate ONLY the 2.5 km Volcanic Demon Village (x >= DEMON_ZONE_MIN_X, STRICTLY zero demons near Ayodhya)
    const cx = DEMON_VILLAGE_CENTER_X;
    const cz = DEMON_VILLAGE_CENTER_Z;
    const demonVillagePatrols: Array<{ x: number; z: number; variant: DemonVariant }> = [
      { x: cx - 38, z: cz + 6, variant: 'BOAR_DEMON' },
      { x: cx - 26, z: cz - 10, variant: 'RABBIT_DEMON' },
      { x: cx - 8, z: cz + 12, variant: 'BRUTE_HUMAN' },
      { x: cx + 10, z: cz - 8, variant: 'SORCERER_HUMAN' },
      { x: cx - 12, z: cz - 24, variant: 'SHADOW_GHOST' },
      { x: cx + 26, z: cz + 8, variant: 'BOAR_DEMON' },
      { x: cx - 4, z: cz + 30, variant: 'RABBIT_DEMON' },
      { x: cx + 20, z: cz + 32, variant: 'BRUTE_HUMAN' },
      { x: cx + 38, z: cz - 14, variant: 'SORCERER_HUMAN' },
      { x: cx + 30, z: cz - 32, variant: 'SHADOW_GHOST' },
    ];
    demonVillagePatrols.forEach((p) => {
      this.spawnEnemy(p.x, p.z, false, null, p.variant);
    });

    // Spawn initial mission squad if current mission has combat targets (Mission 1 is Sabha Throne Ascension!)
    this.spawnMissionSquad();
    this.syncCameraImmediate();
    this.updateDynamicHeroLighting(this.camYaw);
    this.emitHud();
  }

  private surfaceHeightAt(x: number, z: number, refY = this.playerY): number {
    let h = groundHeightAt(x, z);

    // Smooth Stepwell East Entry Staircase connecting ground (8.9, -0.25) down into Surya-Kund (-4.8)
    if (
      Math.abs(z - STEPWELL_POS.z) <= 2.65 &&
      x >= STEPWELL_POS.x + 3.5 &&
      x <= STEPWELL_POS.x + 9.2
    ) {
      const frac = THREE.MathUtils.clamp((STEPWELL_POS.x + 8.9 - x) / 5.2, 0, 1);
      const stairY = -0.25 - frac * 4.55;
      h = Math.max(h, stairY);
    }

    // Walkable Sabha Hall sandstone floor (+0.42m) & Simhasana Throne Dais (+0.88m)
    if (
      Math.abs(x - SABHA_HALL_POS.x) <= 14.0 &&
      Math.abs(z - SABHA_HALL_POS.z) <= 11.0
    ) {
      h = Math.max(h, 0.42);
      if (Math.hypot(x - THRONE_POS.x, z - THRONE_POS.z) <= 3.3) {
        h = Math.max(h, 0.88);
      }
    } else if (
      Math.abs(x - SABHA_HALL_POS.x) <= 8.2 &&
      z >= SABHA_HALL_POS.z + 10.8 &&
      z <= SABHA_HALL_POS.z + 13.4
    ) {
      const rampT = THREE.MathUtils.clamp(
        (SABHA_HALL_POS.z + 13.4 - z) / 2.6,
        0,
        1
      );
      h = Math.max(h, 0.42 * rampT);
    }

    // Walkable Seven-Story Palace floors & Gold-Detailed Staircases
    const palaceH = palaceFloorHeightAt(x, z, refY);
    if (palaceH !== null && palaceH > h) {
      h = palaceH;
    }

    // Walkable Celestial Sky Platforms (Vayavyastra Trial)
    const skyH = this.astraQuest?.getExtraFloorHeightAt(x, z, refY);
    if (skyH !== null && skyH !== undefined && skyH > h) {
      h = skyH;
    }

    // Walkable Floating Celestial Islands (meadow crown, ceremonial -Z stairs & gilded temple terrace)
    const islandH = this.floatingIslandSupportHeightAt(x, z, refY);
    if (islandH !== null && islandH > h) {
      h = islandH;
    }
    return h;
  }

  private isInsideRegularOctagonXZ(dx: number, dz: number, apothem: number): boolean {
    const c8 = 0.9238795325;
    const s8 = 0.3826834324;
    return (
      Math.abs(dx * s8 + dz * c8) <= apothem &&
      Math.abs(dx * c8 + dz * s8) <= apothem &&
      Math.abs(dx * c8 - dz * s8) <= apothem &&
      Math.abs(dx * s8 - dz * c8) <= apothem
    );
  }

  private pushOutRegularOctagonXZ(
    nx: number,
    nz: number,
    cx: number,
    cz: number,
    apothem: number,
    radius: number,
    out: { x: number; z: number }
  ): void {
    const c8 = 0.9238795325;
    const s8 = 0.3826834324;
    const dx = nx - cx;
    const dz = nz - cz;
    const lim = apothem + radius;
    const p0 = dx * s8 + dz * c8;
    const p1 = dx * c8 + dz * s8;
    const p2 = dx * c8 - dz * s8;
    const p3 = dx * s8 - dz * c8;
    const a0 = Math.abs(p0);
    const a1 = Math.abs(p1);
    const a2 = Math.abs(p2);
    const a3 = Math.abs(p3);
    if (a0 >= lim || a1 >= lim || a2 >= lim || a3 >= lim) {
      out.x = nx;
      out.z = nz;
      return;
    }
    // Push along the face normal with smallest penetration (largest projection)
    let bestPen = lim - a0;
    let pushX = s8;
    let pushZ = c8;
    let sign = p0 >= 0 ? 1 : -1;

    const pen1 = lim - a1;
    if (pen1 < bestPen) {
      bestPen = pen1;
      pushX = c8;
      pushZ = s8;
      sign = p1 >= 0 ? 1 : -1;
    }
    const pen2 = lim - a2;
    if (pen2 < bestPen) {
      bestPen = pen2;
      pushX = c8;
      pushZ = -s8;
      sign = p2 >= 0 ? 1 : -1;
    }
    const pen3 = lim - a3;
    if (pen3 < bestPen) {
      bestPen = pen3;
      pushX = s8;
      pushZ = -c8;
      sign = p3 >= 0 ? 1 : -1;
    }
    out.x = nx + pushX * sign * bestPen;
    out.z = nz + pushZ * sign * bestPen;
  }

  private floatingIslandSupportHeightAt(
    x: number,
    z: number,
    refY: number
  ): number | null {
    let best: number | null = null;
    for (let i = 0; i < this.floatingIslandDefs.length; i++) {
      const isl = this.floatingIslandDefs[i];
      const s = isl.scale;
      const dx = x - isl.x;
      const dz = z - isl.z;
      const maxSpan = 17.5 * s;
      if (Math.abs(dx) > maxSpan || Math.abs(dz) > maxSpan) continue;

      const curY = isl.group.position.y;
      const meadowY = curY + 1.4 * s;
      if (refY + 1.55 < meadowY) continue;

      // 1. Top Gilded Temple Citadel Terrace (+4.8s)
      const templeHalf = 6.0 * s;
      if (Math.abs(dx) <= templeHalf && Math.abs(dz) <= templeHalf) {
        const templeTopY = curY + 4.8 * s;
        if (templeTopY <= refY + 1.55 && (best === null || templeTopY > best)) {
          best = templeTopY;
        }
      }

      // 2. Ceremonial -Z Sandstone Stairway connecting meadow (+1.4s) to temple terrace (+4.8s)
      if (Math.abs(dx) <= 2.0 * s && dz >= -10.4 * s && dz <= -6.0 * s) {
        const stairT = THREE.MathUtils.clamp((dz + 10.4 * s) / (4.4 * s), 0, 1);
        const stairY = curY + (1.4 + 3.4 * stairT) * s;
        if (stairY <= refY + 1.55 && (best === null || stairY > best)) {
          best = stairY;
        }
      }

      // 3. Verdant Octagonal Meadow Crown (+1.4s)
      const meadowApothem = 16.5 * s * 0.9238795325;
      if (this.isInsideRegularOctagonXZ(dx, dz, meadowApothem)) {
        if (meadowY <= refY + 1.55 && (best === null || meadowY > best)) {
          best = meadowY;
        }
      }
    }
    return best;
  }

  private floatingIslandCeilingLimitAt(
    px: number,
    py: number,
    pz: number
  ): number | null {
    let minCeil: number | null = null;
    for (let i = 0; i < this.floatingIslandDefs.length; i++) {
      const isl = this.floatingIslandDefs[i];
      const s = isl.scale;
      const curY = isl.group.position.y;
      if (py >= curY + 1.3 * s) continue;

      const dx = px - isl.x;
      const dz = pz - isl.z;
      if (Math.abs(dx) > 17.5 * s || Math.abs(dz) > 17.5 * s) continue;

      // Main inverted cone underside + topDisc bottom
      const rMain = Math.hypot(dx, dz);
      if (rMain <= 16.0 * s) {
        let hullY = curY - (1.0 - rMain / (16.0 * s)) * 28.0 * s;
        if (rMain <= 14.8 * s) {
          hullY = Math.min(hullY, curY - 1.4 * s);
        }
        if (py <= hullY + 0.8 && (minCeil === null || hullY < minCeil)) {
          minCeil = hullY;
        }
      }

      // subSpire1 at (8.5s, -11s, -4s), r=7s, h=18s (tip -20s, top -2s)
      const rSub1 = Math.hypot(dx - 8.5 * s, dz + 4.0 * s);
      if (rSub1 <= 7.0 * s) {
        const sub1Y = curY - 2.0 * s - (1.0 - rSub1 / (7.0 * s)) * 18.0 * s;
        if (py <= sub1Y + 0.8 && (minCeil === null || sub1Y < minCeil)) {
          minCeil = sub1Y;
        }
      }

      // subSpire2 at (-7.5s, -10s, 5.5s), r=6s, h=15s (tip -17.5s, top -2.5s)
      const rSub2 = Math.hypot(dx + 7.5 * s, dz - 5.5 * s);
      if (rSub2 <= 6.0 * s) {
        const sub2Y = curY - 2.5 * s - (1.0 - rSub2 / (6.0 * s)) * 15.0 * s;
        if (py <= sub2Y + 0.8 && (minCeil === null || sub2Y < minCeil)) {
          minCeil = sub2Y;
        }
      }
    }
    return minCeil;
  }

  private resolveFloatingIslandXZ(
    nx: number,
    nz: number,
    radius: number,
    entityY: number,
    out: { x: number; z: number }
  ): void {
    let rx = nx;
    let rz = nz;
    for (let i = 0; i < this.floatingIslandDefs.length; i++) {
      const isl = this.floatingIslandDefs[i];
      const s = isl.scale;
      const curY = isl.group.position.y;
      const localY = entityY - curY;
      if (localY > 17.6 * s || localY + 1.75 < -28.0 * s) continue;
      if (
        Math.abs(rx - isl.x) > 18.5 * s + radius ||
        Math.abs(rz - isl.z) > 18.5 * s + radius
      ) {
        continue;
      }

      // 1. Inverted underside rock cones (when below meadow top)
      if (localY < 0.05 * s) {
        const hTest = Math.min(-0.05 * s, localY + 0.85);
        if (hTest >= -28.0 * s) {
          const rMainCone = ((hTest + 28.0 * s) / (28.0 * s)) * 16.0 * s;
          const dx = rx - isl.x;
          const dz = rz - isl.z;
          const dSq = dx * dx + dz * dz;
          const lim = rMainCone + radius;
          if (dSq < lim * lim) {
            if (dSq > 1e-8) {
              const d = Math.sqrt(dSq);
              const k = lim / d;
              rx = isl.x + dx * k;
              rz = isl.z + dz * k;
            } else {
              rx += lim;
            }
          }
        }
        if (hTest >= -20.0 * s && hTest <= -2.0 * s) {
          const r1Cone = ((hTest + 20.0 * s) / (18.0 * s)) * 7.0 * s;
          const cx1 = isl.x + 8.5 * s;
          const cz1 = isl.z - 4.0 * s;
          const dx = rx - cx1;
          const dz = rz - cz1;
          const dSq = dx * dx + dz * dz;
          const lim = r1Cone + radius;
          if (dSq < lim * lim && dSq > 1e-8) {
            const d = Math.sqrt(dSq);
            const k = lim / d;
            rx = cx1 + dx * k;
            rz = cz1 + dz * k;
          }
        }
        if (hTest >= -17.5 * s && hTest <= -2.5 * s) {
          const r2Cone = ((hTest + 17.5 * s) / (15.0 * s)) * 6.0 * s;
          const cx2 = isl.x - 7.5 * s;
          const cz2 = isl.z + 5.5 * s;
          const dx = rx - cx2;
          const dz = rz - cz2;
          const dSq = dx * dx + dz * dz;
          const lim = r2Cone + radius;
          if (dSq < lim * lim && dSq > 1e-8) {
            const d = Math.sqrt(dSq);
            const k = lim / d;
            rx = cx2 + dx * k;
            rz = cz2 + dz * k;
          }
        }
      }

      // 2. Meadow Disc Outer Rim (octagonal cylinder y ∈ [-1.4s, +1.4s])
      if (localY + 1.65 > -1.4 * s && localY < 1.4 * s - 0.45) {
        const tRim = THREE.MathUtils.clamp((localY + 1.4 * s) / (2.8 * s), 0, 1);
        const rimRadius = (14.8 + 1.7 * tRim) * s;
        this.pushOutRegularOctagonXZ(
          rx,
          rz,
          isl.x,
          isl.z,
          rimRadius * 0.9238795325,
          radius,
          out
        );
        rx = out.x;
        rz = out.z;
      }

      // 3. Temple Citadel Base Box ([-6s, 6s], y ∈ [1.2s, 4.8s]), allowing -Z staircase ascent
      if (localY + 1.65 > 1.2 * s && localY < 4.8 * s - 0.42) {
        const dx = rx - isl.x;
        const dz = rz - isl.z;
        const onStairCorridor =
          Math.abs(dx) <= 2.0 * s && dz >= -10.4 * s && dz <= -5.5 * s;
        let stairPass = false;
        if (onStairCorridor) {
          const stairT = THREE.MathUtils.clamp((dz + 10.4 * s) / (4.4 * s), 0, 1);
          const stairLocalY = (1.4 + 3.4 * stairT) * s;
          if (localY >= stairLocalY - 0.65) {
            stairPass = true;
          }
        }
        if (!stairPass) {
          const half = 6.0 * s;
          const cx = THREE.MathUtils.clamp(dx, -half, half);
          const cz = THREE.MathUtils.clamp(dz, -half, half);
          const dlx = dx - cx;
          const dlz = dz - cz;
          const dSq = dlx * dlx + dlz * dlz;
          if (dSq < radius * radius) {
            if (dSq > 1e-8) {
              const d = Math.sqrt(dSq);
              const push = radius - d;
              rx += (dlx / d) * push;
              rz += (dlz / d) * push;
            } else {
              const penX = half - Math.abs(dx);
              const penZ = half - Math.abs(dz);
              if (penX < penZ) {
                rx += (dx >= 0 ? 1 : -1) * (penX + radius);
              } else {
                rz += (dz >= 0 ? 1 : -1) * (penZ + radius);
              }
            }
          }
        }
      }

      // 4. 4 Corner Towers & Spires at (±4.4s, ±4.4s)
      if (localY + 1.65 > 2.75 * s && localY < 11.5 * s) {
        const towerR = localY >= 8.25 * s
          ? Math.max(0.25 * s, ((11.5 * s - Math.max(8.25 * s, localY)) / (3.4 * s)) * 1.45 * s)
          : 1.3 * s;
        const lim = towerR + radius;
        const limSq = lim * lim;
        const cOff = 4.4 * s;
        for (let sx = -1; sx <= 1; sx += 2) {
          for (let sz = -1; sz <= 1; sz += 2) {
            const tx = isl.x + sx * cOff;
            const tz = isl.z + sz * cOff;
            const dx = rx - tx;
            const dz = rz - tz;
            const dSq = dx * dx + dz * dz;
            if (dSq < limSq && dSq > 1e-8) {
              const d = Math.sqrt(dSq);
              const k = lim / d;
              rx = tx + dx * k;
              rz = tz + dz * k;
            }
          }
        }
      }

      // 5. Central Gilded Shikhara Cone (y ∈ [4.75s, 17.25s], base r=4.4s)
      if (localY + 1.65 > 4.75 * s && localY < 17.25 * s) {
        const yTest = THREE.MathUtils.clamp(localY + 0.5, 4.75 * s, 17.25 * s);
        const shikharaR = ((17.25 * s - yTest) / (12.5 * s)) * 4.4 * s;
        const dx = rx - isl.x;
        const dz = rz - isl.z;
        const lim = shikharaR + radius;
        const dSq = dx * dx + dz * dz;
        if (dSq < lim * lim) {
          if (dSq > 1e-8) {
            const d = Math.sqrt(dSq);
            const k = lim / d;
            rx = isl.x + dx * k;
            rz = isl.z + dz * k;
          } else {
            rx += lim;
          }
        }
      }
    }
    out.x = rx;
    out.z = rz;
  }

  private isPointInsideFloatingIslandSolid(
    px: number,
    py: number,
    pz: number
  ): boolean {
    for (let i = 0; i < this.floatingIslandDefs.length; i++) {
      const isl = this.floatingIslandDefs[i];
      const s = isl.scale;
      const curY = isl.group.position.y;
      const localY = py - curY;
      if (localY < -28.0 * s || localY > 17.25 * s) continue;
      const dx = px - isl.x;
      const dz = pz - isl.z;
      if (Math.abs(dx) > 17.5 * s || Math.abs(dz) > 17.5 * s) continue;

      if (localY >= -1.4 * s && localY <= 1.4 * s) {
        const tRim = (localY + 1.4 * s) / (2.8 * s);
        const rimR = (14.8 + 1.7 * tRim) * s;
        if (this.isInsideRegularOctagonXZ(dx, dz, rimR * 0.9238795325)) {
          return true;
        }
      }
      if (localY >= -28.0 * s && localY <= 0) {
        const rMain = ((localY + 28.0 * s) / (28.0 * s)) * 16.0 * s;
        if (dx * dx + dz * dz <= rMain * rMain) return true;
      }
      if (localY >= -20.0 * s && localY <= -2.0 * s) {
        const r1 = ((localY + 20.0 * s) / (18.0 * s)) * 7.0 * s;
        const ddx = dx - 8.5 * s;
        const ddz = dz + 4.0 * s;
        if (ddx * ddx + ddz * ddz <= r1 * r1) return true;
      }
      if (localY >= -17.5 * s && localY <= -2.5 * s) {
        const r2 = ((localY + 17.5 * s) / (15.0 * s)) * 6.0 * s;
        const ddx = dx + 7.5 * s;
        const ddz = dz - 5.5 * s;
        if (ddx * ddx + ddz * ddz <= r2 * r2) return true;
      }
      if (localY >= 1.2 * s && localY <= 4.8 * s && Math.abs(dx) <= 6.0 * s && Math.abs(dz) <= 6.0 * s) {
        return true;
      }
      if (localY >= 4.75 * s && localY <= 17.25 * s) {
        const shikharaR = ((17.25 * s - localY) / (12.5 * s)) * 4.4 * s;
        if (dx * dx + dz * dz <= shikharaR * shikharaR) return true;
      }
      if (localY >= 2.75 * s && localY <= 11.5 * s) {
        const tR = localY >= 8.25 * s ? ((11.5 * s - localY) / (3.4 * s)) * 1.45 * s : 1.3 * s;
        const tSq = tR * tR;
        const cOff = 4.4 * s;
        for (let sx = -1; sx <= 1; sx += 2) {
          for (let sz = -1; sz <= 1; sz += 2) {
            const ddx = dx - sx * cOff;
            const ddz = dz - sz * cOff;
            if (ddx * ddx + ddz * ddz <= tSq) return true;
          }
        }
      }
    }
    return false;
  }

  private triggerThroneAscension(): void {
    if (this.ascensionActive || this.ascensionCompleted) return;
    this.ascensionActive = true;
    this.ascensionElapsed = 0;
    soundEngine.playMissionChime();

    // Bake Obstacle-Free Ayodhya + Palace Navigation Mesh paths for all Ministers, Commanders & Spies
    for (let i = 0; i < this.citizens.length; i++) {
      const c = this.citizens[i];
      if (c.courtSeat && !c.seated) {
        c.navCursor = 0;
        findPalaceNavPath(
          c.x,
          c.y,
          c.z,
          c.courtSeat.x,
          c.courtSeat.y,
          c.courtSeat.z,
          false,
          c.navQueue
        );
      }
    }

    // Complete Mission 1 ("Ascend the Royal Simhasana") immediately upon ascension
    const activeMission = MISSIONS[this.missionIdx];
    if (activeMission && activeMission.id === 'mission_sabha') {
      this.missionProgress = 1;
      this.karma += activeMission.rewardKarma;
      this.completedMissions++;
      if (this.missionIdx + 1 < MISSIONS.length) {
        this.missionIdx++;
        this.missionProgress = 0;
        this.spawnMissionSquad();
      }
    }
    this.emitHud();
  }

  private restoreRamStandingClothes(): void {
    if (this.ramRig.centerPleat) {
      this.ramRig.centerPleat.scale.set(1.12, 1.0, 0.34);
    }
    if (this.ramRig.capePivot) {
      this.ramRig.capePivot.position.set(-0.118, 0.605, -0.096);
      this.ramRig.capePivot.scale.set(1, 1, 1);
    }
  }

  private spawnMissionSquad(): void {
    const mission = MISSIONS[this.missionIdx];
    if (!mission || mission.id === 'mission_sabha') return;
    const wx = Math.max(DEMON_ZONE_MIN_X + 20, mission.waypoint.x);
    const wz = mission.waypoint.z;
    const isFinal = mission.id === 'mission_commander';
    const variantCycle: DemonVariant[] = isFinal
      ? ['BRUTE_HUMAN', 'BOAR_DEMON', 'RABBIT_DEMON', 'SORCERER_HUMAN', 'SHADOW_GHOST']
      : ['BRUTE_HUMAN', 'BOAR_DEMON', 'SORCERER_HUMAN', 'RABBIT_DEMON', 'SHADOW_GHOST'];

    for (let i = 0; i < mission.targetCount; i++) {
      const angle = (i / mission.targetCount) * Math.PI * 2;
      const dist = 8 + (i % 2) * 5;
      const ex = Math.max(DEMON_ZONE_MIN_X + 10, wx + Math.cos(angle) * dist);
      const ez = wz + Math.sin(angle) * dist;
      const isCmd = isFinal && i === 0;
      const variant = variantCycle[i % variantCycle.length];
      this.spawnEnemy(ex, ez, isCmd, mission.id, variant);
    }
  }

  private spawnEnemy(
    x: number,
    z: number,
    isCommander: boolean,
    missionTag: string | null,
    variant: DemonVariant = 'BRUTE_HUMAN',
    ignoreDemonBoundary = false,
    hpScale = 1.0,
    customScale = 1.0
  ): string {
    // Absolute mathematical boundary enforcement: roamers never spawn west of DEMON_ZONE_MIN_X;
    // Quest trial bosses (Takshaka & Central Sanctum Maha-Asura) are explicitly allowed at their shrines.
    const safeX = ignoreDemonBoundary ? x : Math.max(DEMON_ZONE_MIN_X, x);
    const rig = this.poolManager.acquire<CharacterRig>(
      this.demonPoolKey(variant, isCommander)
    );
    rig.root.scale.setScalar(customScale);
    const y = groundHeightAt(safeX, z);
    rig.root.position.set(safeX, y, z);

    const baseHp =
      variant === 'BRUTE_HUMAN'
        ? 72
        : variant === 'BOAR_DEMON'
        ? 64
        : variant === 'SORCERER_HUMAN'
        ? 48
        : variant === 'SHADOW_GHOST'
        ? 52
        : 45; // RABBIT_DEMON agile skirmisher
    const scaledHp = Math.round((isCommander ? 185 : baseHp) * hpScale);
    const enemyId = `demon_${variant}_${Date.now()}_${Math.random()}`;

    this.enemies.push({
      id: enemyId,
      rig,
      variant,
      isCommander,
      x: safeX,
      y,
      z,
      velY: 0,
      yaw: 0,
      hp: scaledHp,
      maxHp: scaledHp,
      attackCooldown: 1.0,
      abilityCooldown: 1.8 + Math.random() * 1.6,
      abilityState: 'IDLE',
      abilityTimer: 0,
      chargeDirX: 0,
      chargeDirZ: 1,
      strafeSign: Math.random() < 0.5 ? -1 : 1,
      walkPhase: Math.random() * 6,
      alive: true,
      missionTag,
      pose: createDefaultPoseState(variant === 'RABBIT_DEMON' ? 0.88 : 0.96),
      speedBlend: 0,
      hitReactTimer: 0,
      hitReactPitch: 0,
      hitReactYaw: 0,
      ghostOpacity: 0.72,
      kinematicAccumDt: 0,
      burnTimer: 0,
      burnDps: 0,
      burnSparkAccum: 0,
      bindTimer: 0,
      liftOffset: 0,
      stunTimer: 0,
      customScale,
      dissolving: false,
      dissolveTimer: 0,
      dissolveDuration: 2.0,
      dissolveSparkAccum: 0,
      lastDamageSource: 'STANDARD',
    });
    return enemyId;
  }

  public setMode(nextMode: PlayMode): void {
    if (nextMode === 'PLAYING' && !this.worldReady) {
      this.pendingPlayOnReady = true;
      this.emitHud();
      return;
    }
    if (nextMode !== 'PLAYING') {
      if (nextMode === 'TITLE') this.pendingPlayOnReady = false;
      this.clearInputs();
    } else {
      // Also wipe latched one-shot/held inputs upon entering/resuming play so zero sticky movement carries over
      this.input.jumpPressed = false;
      this.input.astraPressed = false;
      this.input.shootAstraPressed = false;
      this.input.interactPressed = false;
      this.input.switchSeatPressed = false;
      this.input.stealthTogglePressed = false;
      this.input.autoDriveTogglePressed = false;
      this.input.flyTogglePressed = false;
      this.input.heroSpecialPressed = false;
      this.input.fireHeld = false;
      this.qualityManager.resetFrameMetrics(2.5);
    }
    this.mode = nextMode;
    this.callbacks.onModeChange(nextMode);
    this.emitHud();
  }

  public getActiveHeroId(): PlayableHeroId {
    return this.activeHeroId;
  }

  public setActiveHero(nextHeroId: string): void {
    const targetId = normalizeHeroId(nextHeroId);
    const profile = HERO_PROFILES[targetId];
    this.lanLocalHeroId = targetId;

    if (targetId === this.activeHeroId) {
      this.emitHud();
      return;
    }

    const hpRatio = this.maxHp > 0 ? THREE.MathUtils.clamp(this.hp / this.maxHp, 0.08, 1.0) : 1.0;
    const pranaRatio =
      this.maxPrana > 0 ? THREE.MathUtils.clamp(this.prana / this.maxPrana, 0.08, 1.0) : 1.0;
    this.activeHeroId = targetId;
    this.maxHp = profile.maxHp;
    this.hp = Math.max(1, Math.round(this.maxHp * hpRatio));
    this.maxPrana = profile.maxPrana;
    this.prana = Math.min(this.maxPrana, Math.round(this.maxPrana * pranaRatio));
    this.heroAbilityMaxCooldown = profile.specialCooldownSec;
    this.heroAbilityCooldown = Math.min(this.heroAbilityCooldown, profile.specialCooldownSec);
    if (!profile.canFly && this.isFlying) {
      this.isFlying = false;
    }

    const targetRig = this.heroRigs.get(targetId);
    if (targetRig) {
      this.heroRigs.forEach((rig) => {
        rig.root.visible = false;
      });
      targetRig.root.position.set(this.playerX, this.playerY, this.playerZ);
      targetRig.root.rotation.order = 'YXZ';
      targetRig.root.rotation.set(0, this.playerYaw, 0);
      targetRig.root.visible = true;
      this.ramRig = targetRig;
      this.syncRigVisibilityForPerspective(this.input.fireHeld || this.bowDrawHoldTimer > 0);
      this.restoreRamStandingClothes();
      if (this.stealthActive) {
        this.setStealthMode(true);
      }
    }

    if (this.worldReady) {
      this.spawnBlast(
        this.playerX,
        this.playerY + 1.05,
        this.playerZ,
        targetId === 'HANUMAN' ? 0xff7a1a : targetId === 'LAKSHMAN' ? 0x38bdf8 : targetId === 'BHARAT' ? 0x34d399 : 0xf6c343
      );
      soundEngine.playMissionChime();
    }
    this.emitHud();
  }

  public setMultiplayerClient(
    client: LanMultiplayerClient | null,
    localPlayerName = 'Lord Ram',
    localHeroId = 'RAM'
  ): void {
    this.lanClient = client;
    this.lanLocalPlayerName = localPlayerName;
    this.lanLocalHeroId = localHeroId;
    if (!client) {
      this.clearRemotePlayers();
      this.clearAllMultiplayerVehicleLocks();
      return;
    }

    client.setEngineHandlers({
      onMatchStarted: () => {
        this.lastAppliedWorldSnapshotSeq = 0;
        this.pendingVehicleAction = null;
        this.recentHostActionAcks.clear();
        if (this.mode !== 'PLAYING') {
          this.setMode('PLAYING');
        }
      },
      onRemotePlayerState: (st) => {
        this.upsertRemotePlayerState(st);
      },
      onWorldSnapshot: (snapshot) => {
        this.applyRemoteWorldSnapshot(snapshot);
      },
      onRemoteShot: (shot) => {
        this.spawnRemoteShotVisual(shot);
      },
      onEnemyDamageClaim: (enemyId, amount, source) => {
        if (!client.isHostingMatch()) return;
        const safeAmt = Math.min(400, Math.max(0, Number(amount) || 0));
        if (safeAmt <= 0) return;
        for (let i = 0; i < this.enemies.length; i++) {
          const e = this.enemies[i];
          if (e.id === enemyId && e.alive) {
            this.damageEnemy(e, safeAmt, source);
            break;
          }
        }
      },
      onVehicleAction: (action) => {
        this.processHostVehicleAction(action);
      },
      onVehicleActionAck: (ack) => {
        this.handleVehicleActionAck(ack);
      },
      onPeerListChanged: (activeIds) => {
        for (const id of Array.from(this.remotePlayers.keys())) {
          if (!activeIds.has(id)) {
            this.removeRemotePlayer(id);
            this.clearPlayerFromAllVehicles(id);
          }
        }
        // Also sweep any vehicle occupant IDs that disappeared before a player state arrived
        const localId = client.getLocalPlayerId();
        for (let i = 0; i < this.chariots.length; i++) {
          const ch = this.chariots[i];
          if (ch.driverId && ch.driverId !== localId && !activeIds.has(ch.driverId)) {
            ch.driverId = null;
            ch.speed = 0;
            ch.occupancyEpoch++;
          }
          if (ch.passengerId && ch.passengerId !== localId && !activeIds.has(ch.passengerId)) {
            ch.passengerId = null;
            ch.occupancyEpoch++;
          }
        }
        for (let i = 0; i < this.animals.length; i++) {
          const an = this.animals[i];
          if (an.driverId && an.driverId !== localId && !activeIds.has(an.driverId)) {
            an.driverId = null;
            an.speed = 0;
            an.occupancyEpoch++;
          }
          if (an.passengerId && an.passengerId !== localId && !activeIds.has(an.passengerId)) {
            an.passengerId = null;
            an.occupancyEpoch++;
          }
        }
      },
      onSessionClosed: () => {
        this.clearRemotePlayers();
        this.clearAllMultiplayerVehicleLocks();
      },
    });
  }

  private getLocalPlayerSyncId(): string {
    if (this.lanClient?.isMultiplayerActive()) {
      return this.lanClient.getLocalPlayerId() || 'local';
    }
    return 'local';
  }

  private clearAllMultiplayerVehicleLocks(): void {
    this.pendingVehicleAction = null;
    this.recentHostActionAcks.clear();
    this.lastAppliedWorldSnapshotSeq = 0;
    const localId = this.getLocalPlayerSyncId();
    for (let i = 0; i < this.chariots.length; i++) {
      const ch = this.chariots[i];
      ch.driverId = this.mountedChariotIndex === i && this.mountedSeatIndex === 0 ? localId : null;
      ch.passengerId = this.mountedChariotIndex === i && this.mountedSeatIndex === 1 ? localId : null;
      ch.hasRemoteSync = false;
    }
    for (let i = 0; i < this.animals.length; i++) {
      const an = this.animals[i];
      an.driverId = this.mountedAnimalIndex === i && this.mountedSeatIndex === 0 ? localId : null;
      an.passengerId = this.mountedAnimalIndex === i && this.mountedSeatIndex === 1 ? localId : null;
      an.hasRemoteSync = false;
    }
  }

  private showMountNotice(text: string, durationMs = 2400): void {
    this.mountNoticeText = text;
    this.mountNoticeExpiresMs = performance.now() + durationMs;
    this.emitHud();
  }

  private findVehicleById(vehicleId: string):
    | { kind: 'RATHA'; index: number; chariot: ChariotEntity }
    | { kind: 'HORSE' | 'ELEPHANT'; index: number; animal: AnimalMountEntity }
    | null {
    for (let i = 0; i < this.chariots.length; i++) {
      if (this.chariots[i].id === vehicleId) {
        return { kind: 'RATHA', index: i, chariot: this.chariots[i] };
      }
    }
    for (let i = 0; i < this.animals.length; i++) {
      if (this.animals[i].id === vehicleId) {
        return { kind: this.animals[i].kind, index: i, animal: this.animals[i] };
      }
    }
    return null;
  }

  private getLocalMountedVehicle():
    | { kind: 'RATHA'; id: string; index: number; chariot: ChariotEntity }
    | { kind: 'HORSE' | 'ELEPHANT'; id: string; index: number; animal: AnimalMountEntity }
    | null {
    if (this.mountedChariotIndex !== null && this.chariots[this.mountedChariotIndex]) {
      const ch = this.chariots[this.mountedChariotIndex];
      return { kind: 'RATHA', id: ch.id, index: this.mountedChariotIndex, chariot: ch };
    }
    if (this.mountedAnimalIndex !== null && this.animals[this.mountedAnimalIndex]) {
      const an = this.animals[this.mountedAnimalIndex];
      return { kind: an.kind, id: an.id, index: this.mountedAnimalIndex, animal: an };
    }
    return null;
  }

  private clearPlayerFromAllVehicles(playerId: string): boolean {
    let changed = false;
    for (let i = 0; i < this.chariots.length; i++) {
      const ch = this.chariots[i];
      if (ch.driverId === playerId) {
        ch.driverId = null;
        ch.speed = 0;
        ch.occupancyEpoch++;
        changed = true;
      }
      if (ch.passengerId === playerId) {
        ch.passengerId = null;
        ch.occupancyEpoch++;
        changed = true;
      }
    }
    for (let i = 0; i < this.animals.length; i++) {
      const an = this.animals[i];
      if (an.driverId === playerId) {
        an.driverId = null;
        an.speed = 0;
        an.occupancyEpoch++;
        changed = true;
      }
      if (an.passengerId === playerId) {
        an.passengerId = null;
        an.occupancyEpoch++;
        changed = true;
      }
    }
    return changed;
  }

  private boardVehicleLocal(
    kind: LanVehicleKind,
    index: number,
    seatIndex: LanVehicleSeatIndex
  ): void {
    const localId = this.getLocalPlayerSyncId();
    const wasStealth = this.stealthActive;
    this.clearPlayerFromAllVehicles(localId);
    if (kind === 'RATHA') {
      const ch = this.chariots[index];
      if (!ch) return;
      this.mountedChariotIndex = index;
      this.mountedAnimalIndex = null;
      this.mountedSeatIndex = seatIndex;
      if (seatIndex === 0) ch.driverId = localId;
      else ch.passengerId = localId;
      ch.occupancyEpoch++;
    } else {
      const an = this.animals[index];
      if (!an) return;
      this.mountedAnimalIndex = index;
      this.mountedChariotIndex = null;
      this.mountedSeatIndex = seatIndex;
      if (seatIndex === 0) an.driverId = localId;
      else an.passengerId = localId;
      an.occupancyEpoch++;
    }
    this.autoDriveActive = false;
    this.isRamSwimming = false;
    this.setStealthMode(wasStealth);
    this.cameraManualHold = 0;
    this.camChariotLockTimer = 0.7;
    soundEngine.playMountChariot();
    this.emitHud();
  }

  private dismountLocalPlayerCleanly(sendNetworkAction: boolean): void {
    const current = this.getLocalMountedVehicle();
    if (!current) return;
    const localId = this.getLocalPlayerSyncId();
    const wasDriver = this.mountedSeatIndex === 0;
    const wasStealth = this.stealthActive;
    this.autoDriveActive = false;

    if (current.kind === 'RATHA') {
      const ch = current.chariot;
      if (wasDriver) {
        ch.speed = 0;
        if (ch.driverId === localId) ch.driverId = null;
        if (ch.rig.leftReinMesh && ch.rig.leftBridleHook && ch.rig.leftRailHook) {
          updateDynamicReinMesh(ch.rig.leftReinMesh, ch.rig.leftBridleHook, ch.rig.leftRailHook, 0.2);
        }
        if (ch.rig.rightReinMesh && ch.rig.rightBridleHook && ch.rig.rightRailHook) {
          updateDynamicReinMesh(ch.rig.rightReinMesh, ch.rig.rightBridleHook, ch.rig.rightRailHook, 0.2);
        }
      } else if (ch.passengerId === localId) {
        ch.passengerId = null;
      }
      ch.occupancyEpoch++;
      this.mountedChariotIndex = null;
      this.mountedSeatIndex = null;
      this.restoreRamStandingClothes();
      this.setStealthMode(wasStealth);
      this.cameraManualHold = 0;
      this.camChariotLockTimer = 0;

      const sinChY = Math.sin(ch.yaw);
      const cosChY = Math.cos(ch.yaw);
      const sideSign = wasDriver ? 1 : -1;
      let chosenX = ch.x + cosChY * 2.85 * sideSign;
      let chosenZ = ch.z - sinChY * 2.85 * sideSign;
      if (isInRiverWater(chosenX, chosenZ)) {
        const altX = ch.x - cosChY * 2.85 * sideSign;
        const altZ = ch.z + sinChY * 2.85 * sideSign;
        if (!isInRiverWater(altX, altZ)) {
          chosenX = altX;
          chosenZ = altZ;
        } else {
          const backX = ch.x - sinChY * 2.95;
          const backZ = ch.z - cosChY * 2.95;
          if (!isInRiverWater(backX, backZ)) {
            chosenX = backX;
            chosenZ = backZ;
          }
        }
      }
      const safePos = this.resolveStaticColliders(chosenX, chosenZ, 0.58, ch.y);
      this.playerX = safePos.x;
      this.playerZ = safePos.z;
      this.playerY = this.surfaceHeightAt(this.playerX, this.playerZ, ch.y);
    } else {
      const an = current.animal;
      if (wasDriver) {
        an.speed = 0;
        if (an.driverId === localId) an.driverId = null;
        if (an.horseRig?.leftReinMesh && an.horseRig.rightReinMesh && an.horseRig.leftPommelHook && an.horseRig.rightPommelHook) {
          an.horseRig.group.updateMatrixWorld(true);
          an.horseRig.leftBitAnchor.getWorldPosition(_v1);
          an.horseRig.group.worldToLocal(_v1);
          updateDynamicReinMesh(an.horseRig.leftReinMesh, _v1, an.horseRig.leftPommelHook, 0.18);
          an.horseRig.rightBitAnchor.getWorldPosition(_v2);
          an.horseRig.group.worldToLocal(_v2);
          updateDynamicReinMesh(an.horseRig.rightReinMesh, _v2, an.horseRig.rightPommelHook, 0.18);
        }
      } else if (an.passengerId === localId) {
        an.passengerId = null;
      }
      an.occupancyEpoch++;
      this.mountedAnimalIndex = null;
      this.mountedSeatIndex = null;
      this.restoreRamStandingClothes();
      this.setStealthMode(wasStealth);
      this.cameraManualHold = 0;
      this.camChariotLockTimer = 0;

      const offDist = (an.kind === 'ELEPHANT' ? 2.25 : 1.55) * (wasDriver ? 1 : -1);
      const safePos = this.resolveStaticColliders(
        an.x + Math.cos(an.yaw) * offDist,
        an.z - Math.sin(an.yaw) * offDist,
        0.58,
        an.y
      );
      this.playerX = safePos.x;
      this.playerZ = safePos.z;
      this.playerY = this.surfaceHeightAt(this.playerX, this.playerZ, an.y);
    }

    this.ramRig.root.rotation.order = 'YXZ';
    this.ramRig.root.rotation.set(0, this.playerYaw, 0);
    soundEngine.playMountChariot();

    if (sendNetworkAction && this.lanClient?.isClientInMatch()) {
      this.queueClientVehicleAction(current.id, 'DISMOUNT');
    } else if (this.lanClient?.isHostingMatch()) {
      this.lanClient.sendWorldSnapshot(this.buildHostWorldSnapshot());
    }
    this.emitHud();
  }

  private queueClientVehicleAction(
    vehicleId: string,
    action: LanVehicleActionKind,
    preferredSeat?: LanVehicleSeatIndex
  ): void {
    if (!this.lanClient?.isClientInMatch()) return;
    const seq = ++this.vehicleActionSeq;
    const now = performance.now();
    const actionId = `va_${this.getLocalPlayerSyncId()}_${seq}_${Math.round(now)}`;
    this.pendingVehicleAction = {
      actionId,
      vehicleId,
      action,
      preferredSeat,
      seq,
      sentCount: 1,
      nextRetryAtMs: now + 180,
      startedAtMs: now,
    };
    this.lanClient.sendVehicleAction({
      actionId,
      vehicleId,
      action,
      preferredSeat,
      seq,
      clientTsMs: Date.now(),
    });
  }

  private processHostVehicleAction(msg: LanVehicleActionMessage): void {
    if (!this.lanClient?.isHostingMatch()) return;
    const cached = this.recentHostActionAcks.get(msg.actionId);
    if (cached) {
      this.lanClient.sendVehicleActionAck(cached);
      return;
    }

    const sendAndCacheAck = (ack: Omit<LanVehicleActionAckMessage, 'type'>) => {
      const fullAck: LanVehicleActionAckMessage = { type: 'VEHICLE_ACTION_ACK', ...ack };
      this.recentHostActionAcks.set(msg.actionId, fullAck);
      if (this.recentHostActionAcks.size > 128) {
        const oldestKey = this.recentHostActionAcks.keys().next().value;
        if (oldestKey) this.recentHostActionAcks.delete(oldestKey);
      }
      this.lanClient?.sendVehicleActionAck(ack);
      this.lanClient?.sendWorldSnapshot(this.buildHostWorldSnapshot());
    };

    const ref = this.findVehicleById(msg.vehicleId);
    if (!ref) {
      sendAndCacheAck({
        actionId: msg.actionId,
        targetPlayerId: msg.playerId,
        vehicleId: msg.vehicleId,
        action: msg.action,
        accepted: false,
        reason: 'NOT_FOUND',
        assignedSeat: null,
        driverId: null,
        passengerId: null,
        epoch: 0,
        serverTimeMs: Date.now(),
      });
      return;
    }

    const v = ref.kind === 'RATHA' ? ref.chariot : ref.animal;

    if (msg.action === 'BOARD') {
      if (v.driverId === msg.playerId) {
        sendAndCacheAck({
          actionId: msg.actionId,
          targetPlayerId: msg.playerId,
          vehicleId: msg.vehicleId,
          action: 'BOARD',
          accepted: true,
          assignedSeat: 0,
          driverId: v.driverId,
          passengerId: v.passengerId,
          epoch: v.occupancyEpoch,
          serverTimeMs: Date.now(),
        });
        return;
      }
      if (v.passengerId === msg.playerId) {
        sendAndCacheAck({
          actionId: msg.actionId,
          targetPlayerId: msg.playerId,
          vehicleId: msg.vehicleId,
          action: 'BOARD',
          accepted: true,
          assignedSeat: 1,
          driverId: v.driverId,
          passengerId: v.passengerId,
          epoch: v.occupancyEpoch,
          serverTimeMs: Date.now(),
        });
        return;
      }

      if (v.driverId !== null && v.passengerId !== null) {
        sendAndCacheAck({
          actionId: msg.actionId,
          targetPlayerId: msg.playerId,
          vehicleId: msg.vehicleId,
          action: 'BOARD',
          accepted: false,
          reason: 'FULL',
          assignedSeat: null,
          driverId: v.driverId,
          passengerId: v.passengerId,
          epoch: v.occupancyEpoch,
          serverTimeMs: Date.now(),
        });
        return;
      }

      this.clearPlayerFromAllVehicles(msg.playerId);
      let assignedSeat: LanVehicleSeatIndex;
      if (msg.preferredSeat === 1 && v.passengerId === null) {
        v.passengerId = msg.playerId;
        assignedSeat = 1;
      } else if (v.driverId === null) {
        v.driverId = msg.playerId;
        assignedSeat = 0;
      } else {
        v.passengerId = msg.playerId;
        assignedSeat = 1;
      }
      v.occupancyEpoch++;
      sendAndCacheAck({
        actionId: msg.actionId,
        targetPlayerId: msg.playerId,
        vehicleId: msg.vehicleId,
        action: 'BOARD',
        accepted: true,
        assignedSeat,
        driverId: v.driverId,
        passengerId: v.passengerId,
        epoch: v.occupancyEpoch,
        serverTimeMs: Date.now(),
      });
      return;
    }

    if (msg.action === 'DISMOUNT') {
      const changed = this.clearPlayerFromAllVehicles(msg.playerId);
      if (changed) {
        v.occupancyEpoch++;
      }
      sendAndCacheAck({
        actionId: msg.actionId,
        targetPlayerId: msg.playerId,
        vehicleId: msg.vehicleId,
        action: 'DISMOUNT',
        accepted: true,
        assignedSeat: null,
        driverId: v.driverId,
        passengerId: v.passengerId,
        epoch: v.occupancyEpoch,
        serverTimeMs: Date.now(),
      });
      return;
    }

    // SWITCH_SEAT
    if (v.driverId === msg.playerId) {
      if (v.passengerId === null) {
        v.driverId = null;
        v.passengerId = msg.playerId;
        v.speed = 0;
        v.occupancyEpoch++;
        sendAndCacheAck({
          actionId: msg.actionId,
          targetPlayerId: msg.playerId,
          vehicleId: msg.vehicleId,
          action: 'SWITCH_SEAT',
          accepted: true,
          assignedSeat: 1,
          driverId: v.driverId,
          passengerId: v.passengerId,
          epoch: v.occupancyEpoch,
          serverTimeMs: Date.now(),
        });
      } else {
        // Swap Driver <-> Passenger cleanly; notify swapped co-rider on next snapshot too
        const prevPassenger = v.passengerId;
        v.driverId = prevPassenger;
        v.passengerId = msg.playerId;
        v.occupancyEpoch++;
        if (prevPassenger === this.getLocalPlayerSyncId()) {
          this.mountedSeatIndex = 0;
        }
        sendAndCacheAck({
          actionId: msg.actionId,
          targetPlayerId: msg.playerId,
          vehicleId: msg.vehicleId,
          action: 'SWITCH_SEAT',
          accepted: true,
          assignedSeat: 1,
          driverId: v.driverId,
          passengerId: v.passengerId,
          epoch: v.occupancyEpoch,
          serverTimeMs: Date.now(),
        });
      }
      return;
    }

    if (v.passengerId === msg.playerId) {
      if (v.driverId === null) {
        v.passengerId = null;
        v.driverId = msg.playerId;
        v.occupancyEpoch++;
        sendAndCacheAck({
          actionId: msg.actionId,
          targetPlayerId: msg.playerId,
          vehicleId: msg.vehicleId,
          action: 'SWITCH_SEAT',
          accepted: true,
          assignedSeat: 0,
          driverId: v.driverId,
          passengerId: v.passengerId,
          epoch: v.occupancyEpoch,
          serverTimeMs: Date.now(),
        });
      } else {
        sendAndCacheAck({
          actionId: msg.actionId,
          targetPlayerId: msg.playerId,
          vehicleId: msg.vehicleId,
          action: 'SWITCH_SEAT',
          accepted: false,
          reason: 'SEAT_TAKEN',
          assignedSeat: 1,
          driverId: v.driverId,
          passengerId: v.passengerId,
          epoch: v.occupancyEpoch,
          serverTimeMs: Date.now(),
        });
      }
      return;
    }

    sendAndCacheAck({
      actionId: msg.actionId,
      targetPlayerId: msg.playerId,
      vehicleId: msg.vehicleId,
      action: 'SWITCH_SEAT',
      accepted: false,
      reason: 'NOT_OCCUPANT',
      assignedSeat: null,
      driverId: v.driverId,
      passengerId: v.passengerId,
      epoch: v.occupancyEpoch,
      serverTimeMs: Date.now(),
    });
  }

  private handleVehicleActionAck(ack: LanVehicleActionAckMessage): void {
    const localId = this.getLocalPlayerSyncId();
    if (ack.targetPlayerId !== localId) return;

    if (this.pendingVehicleAction?.actionId === ack.actionId) {
      this.pendingVehicleAction = null;
    }

    const ref = this.findVehicleById(ack.vehicleId);
    if (ref) {
      const v = ref.kind === 'RATHA' ? ref.chariot : ref.animal;
      if (ack.epoch >= v.occupancyEpoch) {
        v.driverId = ack.driverId;
        v.passengerId = ack.passengerId;
        v.occupancyEpoch = ack.epoch;
      }
    }

    if (!ack.accepted) {
      if (ack.action === 'BOARD') {
        const mounted = this.getLocalMountedVehicle();
        if (mounted && mounted.id === ack.vehicleId) {
          this.dismountLocalPlayerCleanly(false);
        }
        this.showMountNotice(
          ack.reason === 'FULL'
            ? 'Vehicle is full (2/2 riders)'
            : 'Could not board vehicle'
        );
      } else if (ack.action === 'SWITCH_SEAT') {
        this.showMountNotice(
          ack.reason === 'SEAT_TAKEN'
            ? 'Driver seat is already occupied'
            : 'Cannot switch seats right now'
        );
      }
      return;
    }

    if (ack.action === 'DISMOUNT' || ack.assignedSeat === null) {
      if (this.getLocalMountedVehicle()) {
        this.dismountLocalPlayerCleanly(false);
      }
      return;
    }

    if (ref) {
      const mounted = this.getLocalMountedVehicle();
      if (!mounted || mounted.id !== ack.vehicleId) {
        this.boardVehicleLocal(ref.kind, ref.index, ack.assignedSeat);
      } else if (this.mountedSeatIndex !== ack.assignedSeat) {
        this.mountedSeatIndex = ack.assignedSeat;
        this.autoDriveActive = false;
        soundEngine.playMountChariot();
        this.emitHud();
      }
    }
  }

  private triggerSwitchSeat(): void {
    const current = this.getLocalMountedVehicle();
    if (!current) return;
    if (!this.lanClient?.isMultiplayerActive()) return;

    const localId = this.getLocalPlayerSyncId();
    const v = current.kind === 'RATHA' ? current.chariot : current.animal;

    if (this.lanClient.isHostingMatch()) {
      this.processHostVehicleAction({
        type: 'VEHICLE_ACTION',
        actionId: `host_sw_${++this.vehicleActionSeq}_${Date.now()}`,
        playerId: localId,
        vehicleId: current.id,
        action: 'SWITCH_SEAT',
        seq: this.vehicleActionSeq,
        clientTsMs: Date.now(),
      });
      // Reconcile local mountedSeatIndex directly from updated host slots
      if (v.driverId === localId) {
        this.mountedSeatIndex = 0;
      } else if (v.passengerId === localId) {
        this.mountedSeatIndex = 1;
        this.autoDriveActive = false;
      }
      soundEngine.playMountChariot();
      this.emitHud();
      return;
    }

    this.queueClientVehicleAction(current.id, 'SWITCH_SEAT');
  }

  private createNameplateSprite(name: string, accentHex: string): {
    sprite: THREE.Sprite;
    texture: THREE.CanvasTexture;
  } {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 256, 64);
      ctx.fillStyle = 'rgba(13, 16, 22, 0.82)';
      ctx.strokeStyle = accentHex;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(14, 10, 228, 42, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#F7F1E3';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name.slice(0, 16), 128, 31);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(this.maxAnisotropy, 16);
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.9, 0.48, 1);
    sprite.position.set(0, 2.38, 0);
    return { sprite, texture };
  }

  private upsertRemotePlayerState(st: LanPlayerState): void {
    if (!this.worldReady || !this.textures) return;
    const localId = this.lanClient?.getLocalPlayerId();
    if (localId && st.id === localId) return;

    let rp = this.remotePlayers.get(st.id);
    if (!rp) {
      const rig = createHeroModel(st.heroId, this.textures);
      const ringGeo = new THREE.RingGeometry(0.55, 0.72, 24);
      ringGeo.rotateX(-Math.PI / 2);
      const accent = st.accentHex || getHeroPreset(st.heroId).accentHex;
      const ringMat = new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const auraRing = new THREE.Mesh(ringGeo, ringMat);
      auraRing.position.y = 0.04;
      rig.root.add(auraRing);

      const { sprite, texture } = this.createNameplateSprite(st.name, accent);
      rig.root.add(sprite);
      rig.root.position.set(st.x, st.y, st.z);
      rig.root.rotation.order = 'YXZ';
      rig.root.rotation.set(0, st.yaw, 0);
      this.scene.add(rig.root);

      rp = {
        id: st.id,
        name: st.name,
        heroId: st.heroId,
        accentHex: accent,
        rig,
        auraRing,
        nameplate: sprite,
        nameplateTex: texture,
        pose: createDefaultPoseState(0.93),
        x: st.x,
        y: st.y,
        z: st.z,
        targetX: st.x,
        targetY: st.y,
        targetZ: st.z,
        yaw: st.yaw,
        targetYaw: st.yaw,
        vx: st.vx ?? 0,
        vz: st.vz ?? 0,
        horizSpeed: st.horizSpeed,
        grounded: st.grounded,
        walkPhase: st.walkPhase,
        aiming: st.aiming,
        stealth: st.stealth,
        sprint: st.sprint,
        mountKind: st.mountKind,
        mountedVehicleId: st.mountedVehicleId ?? null,
        seatIndex: st.seatIndex ?? null,
        hp: st.hp,
        maxHp: st.maxHp,
        lastSeq: st.seq ?? 0,
        lastUpdateMs: performance.now(),
      };
      this.remotePlayers.set(st.id, rp);
    } else {
      // Drop delayed out-of-order packets while allowing sequence resets on restart
      if (
        typeof st.seq === 'number' &&
        st.seq > 0 &&
        rp.lastSeq > 0 &&
        st.seq <= rp.lastSeq &&
        rp.lastSeq - st.seq < 120
      ) {
        return;
      }
      if (rp.heroId !== st.heroId) {
        const oldRig = rp.rig;
        const nextRig = createHeroModel(st.heroId, this.textures);
        nextRig.root.add(rp.auraRing);
        nextRig.root.add(rp.nameplate);
        nextRig.root.position.copy(oldRig.root.position);
        nextRig.root.rotation.order = 'YXZ';
        nextRig.root.rotation.copy(oldRig.root.rotation);
        this.scene.remove(oldRig.root);
        this.poolManager.disposeObject3DResources(oldRig.root);
        this.scene.add(nextRig.root);
        rp.rig = nextRig;
        rp.heroId = st.heroId;
      }
      rp.lastSeq = st.seq ?? rp.lastSeq;
      rp.targetX = st.x;
      rp.targetY = st.y;
      rp.targetZ = st.z;
      rp.targetYaw = st.yaw;
      rp.vx = st.vx ?? 0;
      rp.vz = st.vz ?? 0;
      rp.horizSpeed = st.horizSpeed;
      rp.grounded = st.grounded;
      rp.walkPhase = st.walkPhase;
      rp.aiming = st.aiming;
      rp.stealth = st.stealth;
      rp.sprint = st.sprint;
      rp.mountKind = st.mountKind;
      rp.mountedVehicleId = st.mountedVehicleId ?? null;
      rp.seatIndex = st.seatIndex ?? null;
      rp.hp = st.hp;
      rp.maxHp = st.maxHp;
      rp.lastUpdateMs = performance.now();
    }

    // Host validates & absorbs non-host Seat 0 driver kinematics for vehicles driven by peers
    if (this.lanClient?.isHostingMatch() && st.driverVehicle) {
      this.applyHostDriverReport(st.id, st.driverVehicle, st.sentAtMs);
    }
  }

  private applyHostDriverReport(
    senderId: string,
    report: LanDriverVehicleReport,
    sentAtMs?: number
  ): void {
    const ref = this.findVehicleById(report.vehicleId);
    if (!ref) return;
    const v = ref.kind === 'RATHA' ? ref.chariot : ref.animal;
    if (v.driverId !== senderId) return;
    if (report.epoch < v.occupancyEpoch) return;
    if (report.seq <= v.driverSeq && v.driverSeq - report.seq < 120) return;

    v.driverSeq = report.seq;
    const metrics = this.lanClient?.getNetworkMetrics();
    let leadSec = metrics ? metrics.oneWayLatencySec : 0.02;
    if (typeof sentAtMs === 'number' && metrics) {
      const estAgeMs = Date.now() + metrics.clockOffsetMs - sentAtMs;
      if (estAgeMs > 0 && estAgeMs < 250) {
        leadSec = Math.min(0.16, estAgeMs * 0.001);
      }
    }

    // Clamp max plausible speed to prevent wild teleportation
    const maxPlausibleSpd = ref.kind === 'RATHA' ? 88 : ref.kind === 'HORSE' ? 40 : 20;
    const clampedSpeed = THREE.MathUtils.clamp(report.speed, -maxPlausibleSpd, maxPlausibleSpd);
    const vx = THREE.MathUtils.clamp(report.vx, -maxPlausibleSpd, maxPlausibleSpd);
    const vz = THREE.MathUtils.clamp(report.vz, -maxPlausibleSpd, maxPlausibleSpd);

    v.syncTargetX = report.x + vx * leadSec;
    v.syncTargetZ = report.z + vz * leadSec;
    v.syncTargetY = report.y;
    v.syncTargetYaw = report.yaw;
    if (ref.kind === 'RATHA') {
      ref.chariot.syncTargetPitch = report.pitch;
    }
    v.syncTargetSpeed = clampedSpeed;
    v.syncTargetVx = vx;
    v.syncTargetVz = vz;
    v.syncTargetGaitPhase = report.gaitPhase;
    v.hasRemoteSync = true;
  }

  private removeRemotePlayer(id: string): void {
    const rp = this.remotePlayers.get(id);
    if (!rp) return;
    this.remotePlayers.delete(id);
    this.scene.remove(rp.rig.root);
    rp.auraRing.geometry.dispose();
    (rp.auraRing.material as THREE.Material).dispose();
    rp.nameplateTex.dispose();
    (rp.nameplate.material as THREE.Material).dispose();
    this.poolManager.disposeObject3DResources(rp.rig.root);
  }

  private clearRemotePlayers(): void {
    for (const id of Array.from(this.remotePlayers.keys())) {
      this.removeRemotePlayer(id);
    }
  }

  private updateSyncedVehicles(dt: number, elapsed: number): void {
    const localId = this.getLocalPlayerSyncId();
    const isHost = Boolean(this.lanClient?.isHostingMatch());
    const profDistScale = this.qualityManager.getProfile().distanceCullScale;
    const profDistScaleSq = profDistScale * profDistScale;

    for (let i = 0; i < this.chariots.length; i++) {
      const ch = this.chariots[i];
      const isLocalDriver = this.mountedChariotIndex === i && this.mountedSeatIndex === 0;
      if (isLocalDriver) continue;

      if (ch.hasRemoteSync && (!isHost || (ch.driverId !== null && ch.driverId !== localId))) {
        const prevX = ch.x;
        const prevZ = ch.z;

        // Dead-reckon along velocity + smoothly converge target with bounded correction
        ch.syncTargetX += ch.syncTargetVx * dt;
        ch.syncTargetZ += ch.syncTargetVz * dt;

        const dxErr = ch.syncTargetX - ch.x;
        const dzErr = ch.syncTargetZ - ch.z;
        const errSq = dxErr * dxErr + dzErr * dzErr;

        if (errSq > 144) {
          ch.x = ch.syncTargetX;
          ch.z = ch.syncTargetZ;
          ch.yaw = ch.syncTargetYaw;
        } else {
          const posAlpha = 1 - Math.exp(-13.5 * dt);
          ch.x = THREE.MathUtils.lerp(ch.x, ch.syncTargetX, posAlpha);
          ch.z = THREE.MathUtils.lerp(ch.z, ch.syncTargetZ, posAlpha);
          ch.yaw = dampAngle(ch.yaw, ch.syncTargetYaw, 14, dt);
        }
        ch.speed = THREE.MathUtils.damp(ch.speed, ch.syncTargetSpeed, 12, dt);
        ch.vx = ch.syncTargetVx;
        ch.vz = ch.syncTargetVz;

        const res = this.resolveChariotStaticCCD(prevX, prevZ, ch.x, ch.z, ch.yaw, ch.y);
        ch.x = res.x;
        ch.z = res.z;
        this.syncChariotTerrainSupport(ch, dt);

        const movedDist = Math.hypot(ch.x - prevX, ch.z - prevZ);
        const chSign = ch.speed >= 0 ? 1 : -1;
        ch.rig.leftWheel.rotation.x += chSign * movedDist * 1.1;
        ch.rig.rightWheel.rotation.x += chSign * movedDist * 1.1;
        ch.gaitPhase += (movedDist / 2.25) * Math.PI * 2;
      } else if (isHost && ch.driverId === null && Math.abs(ch.speed) > 0.05) {
        ch.speed = THREE.MathUtils.damp(ch.speed, 0, 5.5, dt);
        const prevX = ch.x;
        const prevZ = ch.z;
        const nextX = ch.x + Math.sin(ch.yaw) * ch.speed * dt;
        const nextZ = ch.z + Math.cos(ch.yaw) * ch.speed * dt;
        const res = this.resolveChariotStaticCCD(prevX, prevZ, nextX, nextZ, ch.yaw, ch.y);
        ch.x = res.x;
        ch.z = res.z;
        if (res.blocked) ch.speed *= 0.35;
        ch.vx = (ch.x - prevX) / Math.max(0.001, dt);
        ch.vz = (ch.z - prevZ) / Math.max(0.001, dt);
        this.syncChariotTerrainSupport(ch, dt);
        const movedDist = Math.hypot(ch.x - prevX, ch.z - prevZ);
        const chSign = ch.speed >= 0 ? 1 : -1;
        ch.rig.leftWheel.rotation.x += chSign * movedDist * 1.1;
        ch.rig.rightWheel.rotation.x += chSign * movedDist * 1.1;
        ch.gaitPhase += (movedDist / 2.25) * Math.PI * 2;
      } else {
        ch.vx = 0;
        ch.vz = 0;
      }

      // Keep synced moving chariot horses trotting/galloping smoothly even when driven by a peer
      if (Math.abs(ch.speed) > 0.35) {
        const dSq = (ch.x - this.playerX) * (ch.x - this.playerX) + (ch.z - this.playerZ) * (ch.z - this.playerZ);
        if (dSq <= 19600 * profDistScaleSq || this.mountedChariotIndex === i) {
          const chariotSpdNorm = THREE.MathUtils.clamp(Math.abs(ch.speed) / 28, 0, 1);
          for (let sIdx = 0; sIdx < ch.rig.steeds.length; sIdx++) {
            this.animateRoyalHorseRig(
              ch.rig.steeds[sIdx],
              ch.gaitPhase + sIdx * 0.45,
              chariotSpdNorm,
              elapsed,
              i * 3.1 + sIdx * 1.4,
              ch.steedStates[sIdx],
              dt,
              ch.yaw
            );
          }
        }
      }
    }

    for (let i = 0; i < this.animals.length; i++) {
      const an = this.animals[i];
      const isLocalDriver = this.mountedAnimalIndex === i && this.mountedSeatIndex === 0;
      if (isLocalDriver) continue;

      if (an.hasRemoteSync && (!isHost || (an.driverId !== null && an.driverId !== localId))) {
        const prevX = an.x;
        const prevZ = an.z;

        an.syncTargetX += an.syncTargetVx * dt;
        an.syncTargetZ += an.syncTargetVz * dt;

        const dxErr = an.syncTargetX - an.x;
        const dzErr = an.syncTargetZ - an.z;
        const errSq = dxErr * dxErr + dzErr * dzErr;
        if (errSq > 144) {
          an.x = an.syncTargetX;
          an.z = an.syncTargetZ;
          an.yaw = an.syncTargetYaw;
        } else {
          const posAlpha = 1 - Math.exp(-13.5 * dt);
          an.x = THREE.MathUtils.lerp(an.x, an.syncTargetX, posAlpha);
          an.z = THREE.MathUtils.lerp(an.z, an.syncTargetZ, posAlpha);
          an.yaw = dampAngle(an.yaw, an.syncTargetYaw, 14, dt);
        }
        an.speed = THREE.MathUtils.damp(an.speed, an.syncTargetSpeed, 12, dt);
        an.vx = an.syncTargetVx;
        an.vz = an.syncTargetVz;

        const anRadius = an.kind === 'ELEPHANT' ? 1.55 : 0.95;
        const res = this.moveSweptWithStaticCCD(prevX, prevZ, an.x, an.z, anRadius, an.y, false, false);
        an.x = res.x;
        an.z = res.z;
        an.y = Math.max(RIVER_SURFACE_Y + 0.12, this.surfaceHeightAt(an.x, an.z, an.y));
        const movedDist = Math.hypot(an.x - prevX, an.z - prevZ);
        const stride = an.kind === 'ELEPHANT' ? 2.6 : 2.25;
        an.gaitPhase += (movedDist / stride) * Math.PI * 2;
        const anObj = an.horseRig ? an.horseRig.group : an.elephantRig!.group;
        anObj.position.set(an.x, an.y, an.z);
        anObj.rotation.y = an.yaw;
      } else if (isHost && an.driverId === null && Math.abs(an.speed) > 0.05) {
        an.speed = THREE.MathUtils.damp(an.speed, 0, 7.5, dt);
        const prevX = an.x;
        const prevZ = an.z;
        const nextX = an.x + Math.sin(an.yaw) * an.speed * dt;
        const nextZ = an.z + Math.cos(an.yaw) * an.speed * dt;
        const anRadius = an.kind === 'ELEPHANT' ? 1.55 : 0.95;
        const res = this.moveSweptWithStaticCCD(prevX, prevZ, nextX, nextZ, anRadius, an.y, false, false);
        an.x = res.x;
        an.z = res.z;
        an.y = Math.max(RIVER_SURFACE_Y + 0.12, this.surfaceHeightAt(an.x, an.z, an.y));
        an.vx = (an.x - prevX) / Math.max(0.001, dt);
        an.vz = (an.z - prevZ) / Math.max(0.001, dt);
        const movedDist = Math.hypot(an.x - prevX, an.z - prevZ);
        const stride = an.kind === 'ELEPHANT' ? 2.6 : 2.25;
        an.gaitPhase += (movedDist / stride) * Math.PI * 2;
        const anObj = an.horseRig ? an.horseRig.group : an.elephantRig!.group;
        anObj.position.set(an.x, an.y, an.z);
        anObj.rotation.y = an.yaw;
      } else {
        an.vx = 0;
        an.vz = 0;
      }
    }
  }

  private updateRemotePlayers(dt: number, elapsed: number): void {
    const netLeadSec = this.lanClient ? this.lanClient.getNetworkMetrics().oneWayLatencySec : 0.02;
    const alpha = 1 - Math.exp(-15 * dt);
    this.remotePlayers.forEach((rp) => {
      if (rp.mountedVehicleId && rp.seatIndex !== null) {
        const ref = this.findVehicleById(rp.mountedVehicleId);
        if (ref) {
          rp.auraRing.visible = false;
          rp.rig.contactShadow.visible = false;
          if (ref.kind === 'RATHA') {
            const ch = ref.chariot;
            computeVehicleSeatWorldPosition(
              ch.x,
              ch.y,
              ch.z,
              ch.yaw,
              ch.pitch,
              'RATHA',
              rp.seatIndex,
              this._seatWorldScratch
            );
            rp.x = this._seatWorldScratch.x;
            rp.y = this._seatWorldScratch.y;
            rp.z = this._seatWorldScratch.z;
            rp.yaw = rp.seatIndex === 0 ? ch.yaw : dampAngle(rp.yaw, rp.targetYaw, 16, dt);
            rp.rig.root.position.set(rp.x, rp.y, rp.z);
            rp.rig.root.rotation.order = 'YXZ';
            rp.rig.root.rotation.set(-ch.pitch, rp.yaw, 0);
            if (rp.seatIndex === 0) {
              this.applyChariotSittingPose(rp.rig, 0, rp.aiming, elapsed, dt, rp.pose);
            } else {
              this.applyChariotPassengerPose(rp.rig, rp.aiming, elapsed, dt, rp.pose);
            }
            return;
          } else {
            const an = ref.animal;
            const seatH = an.elephantRig
              ? an.elephantRig.seatHeight
              : an.horseRig
              ? an.horseRig.seatHeight
              : 0.88;
            computeVehicleSeatWorldPosition(
              an.x,
              an.y,
              an.z,
              an.yaw,
              0,
              an.kind,
              rp.seatIndex,
              this._seatWorldScratch,
              seatH
            );
            rp.x = this._seatWorldScratch.x;
            rp.y = this._seatWorldScratch.y;
            rp.z = this._seatWorldScratch.z;
            rp.yaw = an.yaw;
            rp.rig.root.position.set(rp.x, rp.y, rp.z);
            rp.rig.root.rotation.order = 'YXZ';
            rp.rig.root.rotation.set(0, rp.yaw, 0);
            const maxSpd = an.kind === 'ELEPHANT' ? 16 : 36;
            const spdNorm = THREE.MathUtils.clamp(Math.abs(an.speed) / maxSpd, 0, 1);
            this.applyAnimalRidingPose(
              rp.rig,
              an.kind,
              an.gaitPhase,
              spdNorm,
              rp.aiming,
              elapsed,
              dt,
              rp.pose
            );
            return;
          }
        }
      }

      rp.auraRing.visible = true;
      rp.rig.contactShadow.visible = true;
      const predX = rp.targetX + rp.vx * Math.min(0.14, netLeadSec);
      const predZ = rp.targetZ + rp.vz * Math.min(0.14, netLeadSec);
      const errSq = (predX - rp.x) * (predX - rp.x) + (predZ - rp.z) * (predZ - rp.z);
      if (errSq > 144) {
        rp.x = predX;
        rp.y = rp.targetY;
        rp.z = predZ;
      } else {
        rp.x = THREE.MathUtils.lerp(rp.x, predX, alpha);
        rp.y = THREE.MathUtils.lerp(rp.y, rp.targetY, alpha);
        rp.z = THREE.MathUtils.lerp(rp.z, predZ, alpha);
      }
      rp.yaw = dampAngle(rp.yaw, rp.targetYaw, 16, dt);

      rp.rig.root.position.set(rp.x, rp.y, rp.z);
      rp.rig.root.rotation.order = 'YXZ';
      rp.rig.root.rotation.set(0, rp.yaw, 0);

      const moveNorm = THREE.MathUtils.clamp(rp.horizSpeed / 12, 0, 1);
      if (rp.horizSpeed > 0.25) {
        rp.walkPhase += dt * (rp.sprint ? 12.5 : 8.5);
      }
      this.applyArticulatedLocomotion(
        rp.rig,
        rp.walkPhase,
        moveNorm,
        rp.sprint,
        rp.grounded,
        rp.aiming,
        false,
        0.93,
        elapsed,
        dt,
        rp.pose
      );
    });
  }

  private applyRemoteWorldSnapshot(snapshot: LanWorldSnapshot): void {
    if (!this.worldReady) return;

    // Ignore delayed out-of-order world snapshots
    if (
      typeof snapshot.snapshotSeq === 'number' &&
      snapshot.snapshotSeq > 0 &&
      this.lastAppliedWorldSnapshotSeq > 0 &&
      snapshot.snapshotSeq <= this.lastAppliedWorldSnapshotSeq &&
      this.lastAppliedWorldSnapshotSeq - snapshot.snapshotSeq < 120
    ) {
      return;
    }
    this.lastAppliedWorldSnapshotSeq = snapshot.snapshotSeq ?? this.lastAppliedWorldSnapshotSeq;

    const localId = this.lanClient?.getLocalPlayerId();
    for (let i = 0; i < snapshot.players.length; i++) {
      const p = snapshot.players[i];
      if (!localId || p.id !== localId) {
        this.upsertRemotePlayerState(p);
      }
    }

    if (!this.lanClient?.isClientInMatch()) return;

    this.dayTime = snapshot.dayTime;
    this.missionIdx = snapshot.missionIdx;
    this.missionProgress = snapshot.missionProgress;
    this.completedMissions = snapshot.completedMissions;

    // Reconcile all vehicles (Chariots, Horses, Elephants) and seat assignments
    if (Array.isArray(snapshot.vehicles)) {
      const metrics = this.lanClient.getNetworkMetrics();
      let hostLeadSec = metrics.oneWayLatencySec;
      if (typeof snapshot.serverTimeMs === 'number' && metrics.clockOffsetMs !== 0) {
        const ageMs = Date.now() + metrics.clockOffsetMs - snapshot.serverTimeMs;
        if (ageMs >= 0 && ageMs < 240) {
          hostLeadSec = Math.min(0.18, ageMs * 0.001 + metrics.jitterMs * 0.0005);
        }
      }

      let authorMountedId: string | null = null;
      let authorSeat: LanVehicleSeatIndex | null = null;

      for (let i = 0; i < snapshot.vehicles.length; i++) {
        const sv = snapshot.vehicles[i];
        const ref = this.findVehicleById(sv.id);
        if (!ref) continue;
        const v = ref.kind === 'RATHA' ? ref.chariot : ref.animal;

        if (sv.epoch >= v.occupancyEpoch) {
          v.driverId = sv.driverId;
          v.passengerId = sv.passengerId;
          v.occupancyEpoch = sv.epoch;
        }

        if (localId && v.driverId === localId) {
          authorMountedId = sv.id;
          authorSeat = 0;
        } else if (localId && v.passengerId === localId) {
          authorMountedId = sv.id;
          authorSeat = 1;
        }

        const isLocalDriver =
          authorMountedId === sv.id && authorSeat === 0 && !this.pendingVehicleAction;

        if (isLocalDriver) {
          // Keep driver steering smooth locally; only correct hard divergence (> 8m)
          const div = Math.hypot(sv.x - v.x, sv.z - v.z);
          if (div > 8.0) {
            v.x = sv.x;
            v.y = sv.y;
            v.z = sv.z;
            v.yaw = sv.yaw;
          }
          continue;
        }

        if (sv.seq >= v.netSeq || v.netSeq - sv.seq > 120 || !v.hasRemoteSync) {
          v.netSeq = sv.seq;
          v.syncTargetX = sv.x + sv.vx * hostLeadSec;
          v.syncTargetZ = sv.z + sv.vz * hostLeadSec;
          v.syncTargetY = sv.y;
          v.syncTargetYaw = sv.yaw;
          if (ref.kind === 'RATHA') {
            ref.chariot.syncTargetPitch = sv.pitch;
          }
          v.syncTargetSpeed = sv.speed;
          v.syncTargetVx = sv.vx;
          v.syncTargetVz = sv.vz;
          v.syncTargetGaitPhase = sv.gaitPhase;
          v.hasRemoteSync = true;
        }
      }

      // Reconcile local seat with host truth unless a brand-new pending action is in-flight (< 1s)
      const pendingFresh =
        this.pendingVehicleAction &&
        performance.now() - this.pendingVehicleAction.startedAtMs < 1100;
      if (!pendingFresh && localId) {
        const localMount = this.getLocalMountedVehicle();
        if (authorMountedId && authorSeat !== null) {
          if (!localMount || localMount.id !== authorMountedId) {
            const ref = this.findVehicleById(authorMountedId);
            if (ref) {
              this.boardVehicleLocal(ref.kind, ref.index, authorSeat);
            }
          } else if (this.mountedSeatIndex !== authorSeat) {
            this.mountedSeatIndex = authorSeat;
            this.autoDriveActive = false;
            this.emitHud();
          }
        } else if (localMount) {
          this.dismountLocalPlayerCleanly(false);
        }
      }
    }

    const existingById = new Map<string, EnemyEntity>();
    for (let i = 0; i < this.enemies.length; i++) {
      existingById.set(this.enemies[i].id, this.enemies[i]);
    }

    const seenIds = new Set<string>();
    for (let i = 0; i < snapshot.enemies.length; i++) {
      const se = snapshot.enemies[i];
      seenIds.add(se.id);
      const existing = existingById.get(se.id);
      if (!existing) {
        if (!se.alive) continue;
        const createdId = this.spawnEnemy(
          se.x,
          se.z,
          se.isCommander,
          se.missionTag,
          se.variant,
          true,
          1.0,
          se.customScale
        );
        const created = this.enemies[this.enemies.length - 1];
        if (created && created.id === createdId) {
          created.id = se.id;
          created.hp = se.hp;
          created.maxHp = se.maxHp;
          created.yaw = se.yaw;
          created.syncTargetX = se.x;
          created.syncTargetY = se.y;
          created.syncTargetZ = se.z;
          created.syncTargetYaw = se.yaw;
        }
      } else {
        existing.syncTargetX = se.x;
        existing.syncTargetY = se.y;
        existing.syncTargetZ = se.z;
        existing.syncTargetYaw = se.yaw;
        existing.hp = se.hp;
        existing.maxHp = se.maxHp;
        if (existing.alive && !se.alive) {
          existing.alive = false;
          if (se.dissolving) {
            this.startEnemyAshDissolution(existing);
          } else {
            existing.rig.root.scale.setScalar(1);
            this.poolManager.release(
              this.demonPoolKey(existing.variant, existing.isCommander),
              existing.rig
            );
          }
        }
      }
    }

    // Remove stale non-boss enemies pruned on Host
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!seenIds.has(e.id) && e.alive && !e.dissolving) {
        e.alive = false;
        e.rig.root.scale.setScalar(1);
        this.poolManager.release(
          this.demonPoolKey(e.variant, e.isCommander),
          e.rig
        );
        swapRemoveAt(this.enemies, i);
      }
    }
  }

  private buildHostWorldSnapshot(): LanWorldSnapshot {
    const hero = getHeroPreset(this.lanLocalHeroId);
    const localMount = this.getLocalMountedVehicle();
    const localPlayer: LanPlayerState = {
      id: this.lanClient?.getLocalPlayerId() || 'host',
      name: this.lanLocalPlayerName,
      heroId: hero.id,
      accentHex: hero.accentHex,
      x: Number(this.playerX.toFixed(2)),
      y: Number(this.playerY.toFixed(2)),
      z: Number(this.playerZ.toFixed(2)),
      yaw: Number(this.playerYaw.toFixed(3)),
      horizSpeed: Number(this.playerHorizSpeed.toFixed(2)),
      grounded: this.grounded,
      walkPhase: Number(this.walkPhase.toFixed(2)),
      aiming: this.input.fireHeld || this.bowDrawHoldTimer > 0,
      stealth: this.stealthActive,
      sprint: this.input.sprint,
      mountKind: localMount ? localMount.kind : 'NONE',
      mountedVehicleId: localMount ? localMount.id : null,
      seatIndex: localMount ? this.mountedSeatIndex : null,
      vx: Number(this._projCasterVelScratch.x.toFixed(2)),
      vz: Number(this._projCasterVelScratch.z.toFixed(2)),
      sentAtMs: Date.now(),
      hp: Math.round(this.hp),
      maxHp: this.maxHp,
      selectedAstra: this.astraQuest?.selectedAstra ?? null,
      seq: ++this.lanSnapSeq,
    };

    const vehiclesOut: LanVehicleSyncState[] = [];
    for (let i = 0; i < this.chariots.length; i++) {
      const ch = this.chariots[i];
      vehiclesOut.push({
        id: ch.id,
        kind: 'RATHA',
        x: Number(ch.x.toFixed(2)),
        y: Number(ch.y.toFixed(2)),
        z: Number(ch.z.toFixed(2)),
        yaw: Number(ch.yaw.toFixed(3)),
        pitch: Number(ch.pitch.toFixed(3)),
        speed: Number(ch.speed.toFixed(2)),
        vx: Number(ch.vx.toFixed(2)),
        vz: Number(ch.vz.toFixed(2)),
        gaitPhase: Number(ch.gaitPhase.toFixed(2)),
        driverId: ch.driverId,
        passengerId: ch.passengerId,
        epoch: ch.occupancyEpoch,
        seq: ++ch.netSeq,
      });
    }
    for (let i = 0; i < this.animals.length; i++) {
      const an = this.animals[i];
      vehiclesOut.push({
        id: an.id,
        kind: an.kind,
        x: Number(an.x.toFixed(2)),
        y: Number(an.y.toFixed(2)),
        z: Number(an.z.toFixed(2)),
        yaw: Number(an.yaw.toFixed(3)),
        pitch: 0,
        speed: Number(an.speed.toFixed(2)),
        vx: Number(an.vx.toFixed(2)),
        vz: Number(an.vz.toFixed(2)),
        gaitPhase: Number(an.gaitPhase.toFixed(2)),
        driverId: an.driverId,
        passengerId: an.passengerId,
        epoch: an.occupancyEpoch,
        seq: ++an.netSeq,
      });
    }

    const enemiesOut: LanEnemySyncState[] = [];
    const cap = Math.min(this.enemies.length, 48);
    for (let i = 0; i < cap; i++) {
      const e = this.enemies[i];
      enemiesOut.push({
        id: e.id,
        variant: e.variant,
        isCommander: e.isCommander,
        x: Number(e.x.toFixed(2)),
        y: Number(e.y.toFixed(2)),
        z: Number(e.z.toFixed(2)),
        yaw: Number(e.yaw.toFixed(3)),
        hp: Math.round(e.hp),
        maxHp: e.maxHp,
        alive: e.alive,
        dissolving: e.dissolving,
        customScale: e.customScale,
        missionTag: e.missionTag,
      });
    }

    return {
      snapshotSeq: ++this.lanWorldSnapshotSeq,
      serverTimeMs: Date.now(),
      dayTime: Number(this.dayTime.toFixed(4)),
      missionIdx: this.missionIdx,
      missionProgress: this.missionProgress,
      completedMissions: this.completedMissions,
      players: [localPlayer],
      vehicles: vehiclesOut,
      enemies: enemiesOut,
    };
  }

  private spawnRemoteShotVisual(shot: LanShotEvent): void {
    if (!this.worldReady) return;
    const isChakra = shot.archetype === 'CHAKRA';
    const astraId: AstraId | null =
      shot.archetype === 'AGNEYASTRA' ||
      shot.archetype === 'VARUNASTRA' ||
      shot.archetype === 'VAYAVYASTRA' ||
      shot.archetype === 'NAGASTRA' ||
      shot.archetype === 'BRAHMASTRA'
        ? shot.archetype
        : null;

    let poolKey = 'arrow';
    let meshGroup: THREE.Group;
    let spinPivot: THREE.Group | undefined;

    if (isChakra) {
      poolKey = 'chakra';
      meshGroup = this.poolManager.acquire<THREE.Group>(poolKey);
      spinPivot = meshGroup.userData.spinPivot as THREE.Group | undefined;
      soundEngine.playAstraBlast();
    } else if (astraId) {
      poolKey = `astra_arrow_${astraId}`;
      meshGroup = this.poolManager.acquire<THREE.Group>(poolKey);
      soundEngine.playAstraRelease(astraId);
    } else if (shot.archetype === 'NAGASTRA_SERPENT') {
      poolKey = 'astra_serpent';
      meshGroup = this.poolManager.acquire<THREE.Group>(poolKey);
    } else {
      meshGroup = this.poolManager.acquire<THREE.Group>(poolKey);
      soundEngine.playBowShot();
    }

    const profile = PROJECTILE_PHYSICS_REGISTRY[shot.archetype];
    meshGroup.position.set(shot.origin.x, shot.origin.y, shot.origin.z);
    meshGroup.lookAt(
      shot.origin.x + shot.dir.x,
      shot.origin.y + shot.dir.y,
      shot.origin.z + shot.dir.z
    );

    this.projectiles.push({
      mesh: meshGroup,
      spinPivot,
      archetype: shot.archetype,
      clientShotId: shot.shotId,
      x: shot.origin.x,
      y: shot.origin.y,
      z: shot.origin.z,
      vx: shot.dir.x * profile.speed,
      vy: shot.dir.y * profile.speed,
      vz: shot.dir.z * profile.speed,
      elapsedFlightSec: 0,
      spinAngle: 0,
      isChakra,
      stealthAmbush: shot.stealthAmbush,
      life: profile.maxLifeSec,
      astraId,
      isSplitSerpent: shot.archetype === 'NAGASTRA_SERPENT',
      homingTargetId: shot.homingTargetId,
      poolKey,
      isRemoteVisualOnly: true,
    });
  }

  private resolveRemoteAstraVisualImpact(
    p: ProjectileEntity,
    hitX: number,
    hitY: number,
    hitZ: number
  ): void {
    const astraId = p.astraId;
    if (!astraId) {
      this.spawnBlast(hitX, hitY, hitZ, p.isChakra ? 0xff5a12 : 0xf6c343);
      return;
    }
    const cfg = ASTRA_CONFIG[astraId];
    const profile = this.qualityManager.getProfile();
    const gY = groundHeightAt(hitX, hitZ);

    if (astraId === 'AGNEYASTRA') {
      this.astraVfx?.spawnAgniMandalaField(
        hitX,
        gY,
        hitZ,
        cfg.radius,
        2.5,
        0,
        profile.particleScale,
        profile.tier
      );
      soundEngine.playAstraImpact('AGNEYASTRA');
    } else if (astraId === 'VARUNASTRA') {
      this.astraVfx?.spawnWaterWave(hitX, gY, hitZ, cfg.radius, profile.particleScale, profile.tier);
      soundEngine.playAstraImpact('VARUNASTRA');
    } else if (astraId === 'VAYAVYASTRA') {
      this.astraVfx?.spawnTornado(
        hitX,
        gY,
        hitZ,
        cfg.radius,
        cfg.liftHeight,
        0,
        cfg.effectDurationSec,
        profile.particleScale
      );
      soundEngine.playAstraImpact('VAYAVYASTRA');
    } else if (astraId === 'NAGASTRA') {
      soundEngine.playAstraImpact('NAGASTRA');
      this.spawnBlast(hitX, hitY, hitZ, cfg.primaryHex);
    } else if (astraId === 'BRAHMASTRA') {
      this.astraVfx?.spawnBrahmastraBeamAndCrater(
        p.x,
        p.y + 1.1,
        p.z,
        hitX,
        hitY,
        hitZ,
        cfg.craterRadius,
        cfg.craterDepth,
        cfg.craterDurationSec,
        profile.particleScale,
        profile.tier
      );
      soundEngine.playAstraImpact('BRAHMASTRA');
    }
  }

  public reviveAtPalace(): void {
    if (!this.worldReady) return;
    this.clearInputs();
    this.autoDriveActive = false;
    this.setStealthMode(false);
    this.restoreRamStandingClothes();
    this.abortBrahmaSummon();
    this.astraQuest?.failBrahmaTrial('Fallen in battle.');
    this.astraEnergy = ASTRA_MAX_ENERGY;
    for (const id of ASTRA_ORDER) this.astraCooldowns[id] = 0;
    for (let i = 0; i < this.enemyProjectiles.length; i++) {
      this.poolManager.release('enemyProjectile', this.enemyProjectiles[i].mesh);
    }
    for (let i = 0; i < this.groundHazards.length; i++) {
      this.poolManager.release('groundHazard', this.groundHazards[i].mesh);
    }
    this.enemyProjectiles.length = 0;
    this.groundHazards.length = 0;
    this.bowDrawHoldTimer = 0;
    this.chakraCooldown = 0;
    this.hp = this.maxHp;
    this.prana = this.maxPrana;
    if (this.mountedChariotIndex !== null || this.mountedAnimalIndex !== null) {
      this.dismountLocalPlayerCleanly(true);
    }
    this.mountedChariotIndex = null;
    this.mountedAnimalIndex = null;
    this.mountedSeatIndex = null;
    this.seatedOnThrone = false;
    this.isRamSwimming = false;
    this.cameraManualHold = 0;
    this.camChariotLockTimer = 0;
    this.playerX = 0;
    this.playerZ = 14;
    this.playerY = groundHeightAt(0, 14);
    this.playerVelY = 0;
    this.grounded = true;
    this.ramRig.root.position.set(this.playerX, this.playerY, this.playerZ);
    this.ramRig.root.rotation.order = 'YXZ';
    this.ramRig.root.rotation.set(0, this.playerYaw, 0);
    this.wantedLevel = Math.max(0, this.wantedLevel - 1);
    this.syncCameraImmediate();
    this.updateDynamicHeroLighting(this.camYaw);
    this.setMode('PLAYING');
  }

  private indoorCeilingLimitAt(px: number, py: number, pz: number): number | null {
    let bestCeil: number | null = null;
    const stIdx = palaceStoryAt(px, py + 0.72, pz);
    if (stIdx !== null) {
      const st = PALACE_STORIES[stIdx];
      bestCeil = st.floorY + st.clearHeight - 0.32;
    }
    for (let i = 0; i < this.roofOccluders.length; i++) {
      const oc = this.roofOccluders[i];
      if (
        px >= oc.minX &&
        px <= oc.maxX &&
        pz >= oc.minZ &&
        pz <= oc.maxZ &&
        py < oc.roofY - 0.25
      ) {
        const roofCeil = oc.roofY - 0.32;
        if (bestCeil === null || roofCeil < bestCeil) {
          bestCeil = roofCeil;
        }
      }
    }
    const islCeil = this.floatingIslandCeilingLimitAt(px, py, pz);
    if (islCeil !== null) {
      const safeIslCeil = islCeil - 0.28;
      if (bestCeil === null || safeIslCeil < bestCeil) {
        bestCeil = safeIslCeil;
      }
    }
    return bestCeil;
  }

  private getNearFrustumSafetyMargin(): number {
    const near = Math.max(0.05, this.camera.near);
    const halfH = near * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5));
    const halfW = halfH * Math.max(0.5, this.camera.aspect);
    return Math.min(0.115, Math.sqrt(near * near + halfH * halfH + halfW * halfW));
  }

  private resolveCameraSphereBoundary(
    eye: THREE.Vector3,
    center: THREE.Vector3,
    minRadius: number,
    pushBias: THREE.Vector3
  ): void {
    _fpDelta.subVectors(eye, center);
    const dSq = _fpDelta.lengthSq();
    const minSq = minRadius * minRadius;
    if (dSq >= minSq) return;

    if (dSq < 1e-7) {
      _fpDelta.copy(pushBias);
    } else {
      _fpDelta.multiplyScalar(1 / Math.sqrt(dSq));
      // Prevent resolution from pushing downward into chest cavity or backward into quiver
      if (_fpDelta.y < -0.45 || _fpDelta.dot(pushBias) < -0.55) {
        _fpDelta.lerp(pushBias, 0.72);
        if (_fpDelta.lengthSq() < 1e-6) {
          _fpDelta.copy(pushBias);
        } else {
          _fpDelta.normalize();
        }
      }
    }
    eye.copy(center).addScaledVector(_fpDelta, minRadius);
  }

  private resolveCameraCapsuleBoundary(
    eye: THREE.Vector3,
    segA: THREE.Vector3,
    segB: THREE.Vector3,
    minRadius: number,
    pushBias: THREE.Vector3
  ): void {
    _fpDelta.subVectors(segB, segA);
    const abLenSq = _fpDelta.lengthSq();
    let t = 0;
    if (abLenSq > 1e-7) {
      t = THREE.MathUtils.clamp(
        _fpClosest.subVectors(eye, segA).dot(_fpDelta) / abLenSq,
        0,
        1
      );
    }
    _fpClosest.copy(segA).addScaledVector(_fpDelta, t);
    this.resolveCameraSphereBoundary(eye, _fpClosest, minRadius, pushBias);
  }

  private clampCameraAgainstEnvironment(eye: THREE.Vector3, nearPad: number): void {
    const wallPad = Math.max(0.14, nearPad + 0.04);
    const grid = this.colliderGrid;
    if (grid) {
      grid.queryAABB(eye.x - wallPad, eye.x + wallPad, eye.z - wallPad, eye.z + wallPad);

      const outB = grid.outBoxes;
      const outBLen = grid.outBoxesLength;
      for (let i = 0; i < outBLen; i++) {
        const box = this.colliders[outB[i]];
        if (box.height <= 1.65) continue;
        const baseY = box.baseY ?? 0;
        if (eye.y > baseY + box.height || eye.y < baseY + 0.15) continue;

        const rotY = box.rotY ?? 0;
        const cosR = rotY === 0 ? 1 : Math.cos(rotY);
        const sinR = rotY === 0 ? 0 : Math.sin(rotY);
        const dxW = eye.x - box.x;
        const dzW = eye.z - box.z;
        const lx = dxW * cosR - dzW * sinR;
        const lz = dxW * sinR + dzW * cosR;

        const cx = THREE.MathUtils.clamp(lx, -box.halfW, box.halfW);
        const cz = THREE.MathUtils.clamp(lz, -box.halfD, box.halfD);
        const dlx = lx - cx;
        const dlz = lz - cz;
        const dSq = dlx * dlx + dlz * dlz;
        if (dSq < wallPad * wallPad) {
          let pushLx = 0;
          let pushLz = 0;
          if (dSq > 1e-8) {
            const d = Math.sqrt(dSq);
            const push = wallPad - d;
            pushLx = (dlx / d) * push;
            pushLz = (dlz / d) * push;
          } else {
            const penX = box.halfW - Math.abs(lx);
            const penZ = box.halfD - Math.abs(lz);
            if (penX < penZ) {
              pushLx = (lx >= 0 ? 1 : -1) * (penX + wallPad);
            } else {
              pushLz = (lz >= 0 ? 1 : -1) * (penZ + wallPad);
            }
          }
          eye.x += pushLx * cosR + pushLz * sinR;
          eye.z += -pushLx * sinR + pushLz * cosR;
        }
      }

      const outC = grid.outCircles;
      const outCLen = grid.outCirclesLength;
      for (let i = 0; i < outCLen; i++) {
        const c = this.circleColliders[outC[i]];
        if (c.height <= 1.65) continue;
        const baseY = c.baseY ?? 0;
        if (eye.y > baseY + c.height || eye.y < baseY + 0.15) continue;
        const dx = eye.x - c.x;
        const dz = eye.z - c.z;
        const lim = c.radius + wallPad;
        const dSq = dx * dx + dz * dz;
        if (dSq < lim * lim && dSq > 1e-8) {
          const d = Math.sqrt(dSq);
          const s = lim / d;
          eye.x = c.x + dx * s;
          eye.z = c.z + dz * s;
        }
      }
    }

    // Floating Island Horizontal Solid Collision for Camera
    _staticRes.x = eye.x;
    _staticRes.z = eye.z;
    this.resolveFloatingIslandXZ(eye.x, eye.z, wallPad, eye.y - 0.85, _staticRes);
    eye.x = _staticRes.x;
    eye.z = _staticRes.z;

    const eyeFloor = this.surfaceHeightAt(eye.x, eye.z, Math.max(this.playerY, eye.y - 0.3)) + Math.max(0.18, nearPad + 0.08);
    if (eye.y < eyeFloor) eye.y = eyeFloor;
    const postCeil = this.indoorCeilingLimitAt(eye.x, eye.y, eye.z) ?? this.indoorCeilingLimitAt(this.playerX, this.playerY, this.playerZ);
    if (postCeil !== null) {
      const ceilClamp = Math.max(eyeFloor, postCeil - nearPad * 0.5);
      if (eye.y > ceilClamp) eye.y = ceilClamp;
    }
  }

  private computeFirstPersonEyePosition(out: THREE.Vector3): void {
    const nearPad = this.getNearFrustumSafetyMargin();
    const headNeckMinRadius = FP_HEAD_NECK_RADIUS + nearPad;

    _fpFwd.set(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
    _fpRight.set(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    _fpUp.set(0, 1, 0);
    _fpPushBias
      .copy(_fpFwd)
      .multiplyScalar(0.86)
      .addScaledVector(_fpUp, 0.51)
      .normalize();

    if (!this.ramRig) {
      out.set(
        this.playerX + _fpFwd.x * headNeckMinRadius,
        this.playerY + 1.715,
        this.playerZ + _fpFwd.z * headNeckMinRadius
      );
      this.clampCameraAgainstEnvironment(out, nearPad);
      return;
    }

    this.ramRig.root.updateMatrixWorld(true);

    // 1. World-space anatomical landmarks from live articulated rig
    if (this.ramRig.headGroup) {
      _fpHeadWorld.set(0, -0.055, -0.01);
      this.ramRig.headGroup.localToWorld(_fpHeadWorld);
    } else {
      _fpHeadWorld.set(0, 0.72, -0.01);
      this.ramRig.torso.localToWorld(_fpHeadWorld);
    }

    // 2. State-aware nominal eye anchor (swimming decouples from stroke bob/roll)
    if (this.isRamSwimming) {
      const sinS = Math.sin(this.swimCamTorsoPitch);
      const cosS = Math.cos(this.swimCamTorsoPitch);
      const spineLen = 0.74;
      _fpSpineTop.set(
        this.playerX + _fpFwd.x * (sinS * spineLen),
        this.playerY + this.ramPose.hipY + cosS * spineLen,
        this.playerZ + _fpFwd.z * (sinS * spineLen)
      );
      out
        .copy(_fpSpineTop)
        .addScaledVector(_fpFwd, 0.28)
        .addScaledVector(_fpUp, 0.16);
    } else {
      if (this.ramRig.headGroup) {
        _camTarget.set(0, 0.015, 0);
        this.ramRig.headGroup.localToWorld(_camTarget);
      } else {
        _camTarget.set(0, 0.79, 0);
        this.ramRig.torso.localToWorld(_camTarget);
      }
      const downwardChestClearance = Math.max(0, Math.sin(this.camPitch)) * 0.04;
      out
        .copy(_camTarget)
        .addScaledVector(_fpFwd, headNeckMinRadius + downwardChestClearance * 0.5)
        .addScaledVector(_fpUp, downwardChestClearance * 0.5);
    }

    // 3. Transform live arm/shoulder landmarks once outside solver loop
    _fpArmL0.set(0, 0, 0);
    this.ramRig.leftArm.localToWorld(_fpArmL0);
    _fpArmL1.set(0, -0.22, 0);
    this.ramRig.leftArm.localToWorld(_fpArmL1);

    _fpArmR0.set(0, 0, 0);
    this.ramRig.rightArm.localToWorld(_fpArmR0);
    _fpArmR1.set(0, -0.22, 0);
    this.ramRig.rightArm.localToWorld(_fpArmR1);

    // 4. Multi-primitive anatomical collision boundary enforcement (2 iterations)
    const neckCapRadius = 0.11 + nearPad;
    const torsoCapRadius = 0.165 + nearPad;
    const armGuardRadius = 0.075 + nearPad;
    const quiverGuardRadius = 0.105 + nearPad;

    for (let iter = 0; iter < 2; iter++) {
      // Shoulder & upper-arm guards (critical during overhead swim strokes & bow aiming)
      this.resolveCameraCapsuleBoundary(out, _fpArmL0, _fpArmL1, armGuardRadius, _fpPushBias);
      this.resolveCameraCapsuleBoundary(out, _fpArmR0, _fpArmR1, armGuardRadius, _fpPushBias);

      // Upper torso & pectoral chest capsule
      _fpPrimA.set(0, 0.34, 0.0);
      this.ramRig.torso.localToWorld(_fpPrimA);
      _fpPrimB.set(0, 0.57, 0.0);
      this.ramRig.torso.localToWorld(_fpPrimB);
      this.resolveCameraCapsuleBoundary(out, _fpPrimA, _fpPrimB, torsoCapRadius, _fpPushBias);

      // Back-mounted arrow quiver guard (prevents rear-look clipping on mounts/throne)
      _fpPrimA.set(0.09, 0.66, -0.14);
      this.ramRig.torso.localToWorld(_fpPrimA);
      this.resolveCameraSphereBoundary(out, _fpPrimA, quiverGuardRadius, _fpPushBias);

      // Neck-to-clavicle choker capsule
      _fpPrimA.set(0, 0.60, 0.01);
      this.ramRig.torso.localToWorld(_fpPrimA);
      _fpPrimB.set(0, 0.75, -0.01);
      this.ramRig.torso.localToWorld(_fpPrimB);
      this.resolveCameraCapsuleBoundary(out, _fpPrimA, _fpPrimB, neckCapRadius, _fpPushBias);

      // Primary 0.22m (+ near-frustum safety) Head & Neck exclusion sphere
      this.resolveCameraSphereBoundary(out, _fpHeadWorld, headNeckMinRadius, _fpPushBias);

      // Co-rider head exclusion sphere on shared 2-player vehicles so camera never clips into partner
      const localMount = this.getLocalMountedVehicle();
      if (localMount) {
        const occ = localMount.kind === 'RATHA' ? localMount.chariot : localMount.animal;
        const coRiderId = this.mountedSeatIndex === 0 ? occ.passengerId : occ.driverId;
        if (coRiderId && this.remotePlayers.has(coRiderId)) {
          const otherSeat: LanVehicleSeatIndex = this.mountedSeatIndex === 0 ? 1 : 0;
          const vX = occ.x;
          const vY = occ.y;
          const vZ = occ.z;
          const vYaw = occ.yaw;
          const vPitch = localMount.kind === 'RATHA' ? localMount.chariot.pitch : 0;
          const seatH =
            localMount.kind === 'RATHA'
              ? undefined
              : localMount.animal.elephantRig
              ? localMount.animal.elephantRig.seatHeight
              : localMount.animal.horseRig
              ? localMount.animal.horseRig.seatHeight
              : 0.88;
          computeVehicleSeatWorldPosition(
            vX,
            vY,
            vZ,
            vYaw,
            vPitch,
            localMount.kind,
            otherSeat,
            this._seatWorldScratch,
            seatH
          );
          this._coRiderHeadScratch.set(
            this._seatWorldScratch.x,
            this._seatWorldScratch.y + (localMount.kind === 'RATHA' && otherSeat === 1 ? 1.56 : 1.52),
            this._seatWorldScratch.z
          );
          this.resolveCameraSphereBoundary(
            out,
            this._coRiderHeadScratch,
            headNeckMinRadius,
            _fpPushBias
          );
        }
      }
    }

    // 5. Ensure outward anatomical push-out never places eye inside terrain, ceilings, or walls
    this.clampCameraAgainstEnvironment(out, nearPad);
  }

  public getCameraPerspective(): CameraPerspective {
    return this.cameraSystem.getPerspective();
  }

  public setCameraPerspective(next: CameraPerspective): CameraPerspective {
    const updated = this.cameraSystem.setPerspective(next);
    const isBowDrawn =
      this.input.fireHeld ||
      this.bowDrawHoldTimer > 0 ||
      this.brahmaSummonPhase === 'AIM_READY' ||
      this.brahmaSummonPhase === 'LOTUS_APPEAR';
    this.syncRigVisibilityForPerspective(isBowDrawn);
    this.syncCameraImmediate();
    this.emitHud();
    return updated;
  }

  public toggleCameraPerspective(): CameraPerspective {
    const updated = this.cameraSystem.togglePerspective();
    const isBowDrawn =
      this.input.fireHeld ||
      this.bowDrawHoldTimer > 0 ||
      this.brahmaSummonPhase === 'AIM_READY' ||
      this.brahmaSummonPhase === 'LOTUS_APPEAR';
    this.syncRigVisibilityForPerspective(isBowDrawn);
    this.syncCameraImmediate();
    this.emitHud();
    return updated;
  }

  private syncRigVisibilityForPerspective(isBowDrawn = false): void {
    if (!this.ramRig) return;
    const showBodyParts = this.cameraSystem.isSecondPerson();
    if (this.ramRig.headGroup) this.ramRig.headGroup.visible = showBodyParts;
    if (this.ramRig.capePivot) this.ramRig.capePivot.visible = showBodyParts;
    if (this.ramRig.backBowGroup) {
      this.ramRig.backBowGroup.visible = showBodyParts && !isBowDrawn;
    }
  }

  private applyFirstPersonCamera(applyShake: boolean): void {
    this.computeFirstPersonEyePosition(_camDesired);
    const cosP = Math.cos(this.camPitch);
    const lookDirX = -Math.sin(this.camYaw) * cosP;
    const lookDirY = -Math.sin(this.camPitch);
    const lookDirZ = -Math.cos(this.camYaw) * cosP;

    _camTarget.set(
      _camDesired.x + lookDirX * 12.0,
      _camDesired.y + lookDirY * 12.0,
      _camDesired.z + lookDirZ * 12.0
    );

    this.camSmoothPos.copy(_camDesired);
    this.camSmoothLook.copy(_camTarget);
    this.updateRoofOcclusion(this.camSmoothPos.x, this.camSmoothPos.y, this.camSmoothPos.z);

    this.camera.position.copy(this.camSmoothPos);
    if (applyShake && this.cameraShakeAmount > 0.01) {
      const shakeAmp = Math.min(0.08, this.cameraShakeAmount * 0.06);
      this.camera.position.x += (Math.random() - 0.5) * shakeAmp;
      this.camera.position.y += (Math.random() - 0.5) * shakeAmp * 0.8;
      this.camera.position.z += (Math.random() - 0.5) * shakeAmp;
    }
    this.camera.lookAt(this.camSmoothLook);
  }

  private applySecondPersonCamera(applyShake: boolean): void {
    if (!this.ramRig) {
      this.applyFirstPersonCamera(applyShake);
      return;
    }
    this.ramRig.root.updateMatrixWorld(true);
    this.ramRig.torso.getWorldPosition(this._spTorsoWorld);
    const heroScale = HERO_PROFILES[this.activeHeroId].scale;
    const nearPad = Math.max(0.24, this.camera.near + 0.09);

    computeSecondPersonWaistPose(
      {
        torsoWorldPos: this._spTorsoWorld,
        facingYaw: this.ramRig.root.rotation.y,
        pitch: this.camPitch,
        heroScale,
        fovDeg: this.camera.fov,
        nearPad,
      },
      this._spCamPos,
      this._spCamTarget,
      (pos, pad) => this.clampCameraAgainstEnvironment(pos, pad)
    );

    this.camSmoothPos.copy(this._spCamPos);
    this.camSmoothLook.copy(this._spCamTarget);
    this.updateRoofOcclusion(this.camSmoothPos.x, this.camSmoothPos.y, this.camSmoothPos.z);

    this.camera.position.copy(this.camSmoothPos);
    if (applyShake && this.cameraShakeAmount > 0.01) {
      const shakeAmp = Math.min(0.06, this.cameraShakeAmount * 0.045);
      this.camera.position.x += (Math.random() - 0.5) * shakeAmp;
      this.camera.position.y += (Math.random() - 0.5) * shakeAmp * 0.8;
      this.camera.position.z += (Math.random() - 0.5) * shakeAmp;
    }
    this.camera.lookAt(this.camSmoothLook);
  }

  private applyActiveCamera(applyShake: boolean): void {
    if (this.cameraSystem.isFirstPerson()) {
      this.applyFirstPersonCamera(applyShake);
    } else {
      this.applySecondPersonCamera(applyShake);
    }
  }

  private syncCameraImmediate(): void {
    this.applyActiveCamera(false);
  }

  /**
   * Hides upper palace stories above curStory + 1 while indoors so upper floors stay hidden until ascending stairs,
   * and toggles overhanging exterior roofs only when sitting between camera and player.
   */
  private updateRoofOcclusion(camX: number, camY: number, camZ: number): void {
    const px = this.playerX;
    const py = this.playerY + 1.5;
    const pz = this.playerZ;

    if (this.palaceStoryGroups.length === 7) {
      const curStory = palaceStoryAt(px, this.playerY + 0.72, pz);
      for (let m = 0; m < this.palaceStoryGroups.length; m++) {
        this.palaceStoryGroups[m].visible = curStory === null || m <= curStory + 1;
      }
      if (this.palaceTopRoofGroup) {
        this.palaceTopRoofGroup.visible = curStory === null || curStory >= 5;
      }
    }

    for (let i = 0; i < this.roofOccluders.length; i++) {
      const oc = this.roofOccluders[i];
      const playerInsideFootprint =
        px >= oc.minX - 0.6 &&
        px <= oc.maxX + 0.6 &&
        pz >= oc.minZ - 0.6 &&
        pz <= oc.maxZ + 0.6 &&
        this.playerY < oc.roofY - 0.35;

      let hideRoof = playerInsideFootprint && camY > oc.roofY - 1.1;

      if (!hideRoof && ((camY >= oc.roofY && py < oc.roofY) || (camY < oc.roofY && py >= oc.roofY))) {
        const denom = py - camY;
        if (Math.abs(denom) > 0.001) {
          const t = (oc.roofY - camY) / denom;
          if (t >= 0 && t <= 1) {
            const ix = camX + (px - camX) * t;
            const iz = camZ + (pz - camZ) * t;
            if (
              ix >= oc.minX - 0.6 &&
              ix <= oc.maxX + 0.6 &&
              iz >= oc.minZ - 0.6 &&
              iz <= oc.maxZ + 0.6
            ) {
              hideRoof = true;
            }
          }
        }
      }

      oc.obj.visible = !hideRoof;
    }
  }

  private resolveStaticColliders(
    x: number,
    z: number,
    radius: number,
    entityY = 0,
    isDemon = false,
    isChariot = false,
    allowWater = true
  ): { x: number; z: number } {
    let nx = x;
    let nz = z;
    const grid = this.colliderGrid;
    const qPad = radius + 2.5;
    let qX = nx;
    let qZ = nz;
    if (grid) {
      grid.queryAABB(qX - qPad, qX + qPad, qZ - qPad, qZ + qPad);
    }
    const radiusSq = radius * radius;
    const bridgeMargin = BRIDGE_HALF_WIDTH - 0.55 - radius;

    for (let iter = 0; iter < 4; iter++) {
      // 1. Open-world rectangular bounds clamp (covering full 5 km realm)
      nx = THREE.MathUtils.clamp(
        nx,
        WORLD_BOUNDS.minX + radius,
        WORLD_BOUNDS.maxX - radius
      );
      nz = THREE.MathUtils.clamp(
        nz,
        WORLD_BOUNDS.minZ + radius,
        WORLD_BOUNDS.maxZ - radius
      );

      // Absolute Demon Boundary Constraint: ZERO demon infiltration into Ayodhya under any circumstance
      if (isDemon) {
        nx = Math.max(DEMON_ZONE_MIN_X, nx);
      }

      // Keep Royal Rathas out of the deep excavated Stepwell basin pit
      if (isChariot) {
        const swDx = nx - STEPWELL_POS.x;
        const swDz = nz - STEPWELL_POS.z;
        const swLimit = 9.4 + radius;
        if (Math.abs(swDx) < swLimit && Math.abs(swDz) < swLimit) {
          if (Math.abs(swDx) > Math.abs(swDz)) {
            nx = STEPWELL_POS.x + (swDx >= 0 ? swLimit : -swLimit);
          } else {
            nz = STEPWELL_POS.z + (swDz >= 0 ? swLimit : -swLimit);
          }
        }
      }

      // 2. Keep Rathas, Demons, and non-swimming units outside deep Sarayu river outside bridge decks
      if (!allowWater || isDemon || isChariot) {
        let onAnyBridgeCorridor = false;
        for (let b = 0; b < BRIDGE_Z_LIST.length; b++) {
          if (Math.abs(nz - BRIDGE_Z_LIST[b]) <= bridgeMargin) {
            onAnyBridgeCorridor = true;
            break;
          }
        }
        const rc = riverCenterX(nz);
        const rw = riverHalfWidth(nz);
        if (!onAnyBridgeCorridor && Math.abs(nx - rc) < rw + radius) {
          if (nx < rc) {
            nx = rc - (rw + radius);
          } else {
            nx = rc + (rw + radius);
          }
        }
      }

      if (!grid) continue;

      if (Math.abs(nx - qX) > 1.8 || Math.abs(nz - qZ) > 1.8) {
        qX = nx;
        qZ = nz;
        grid.queryAABB(qX - qPad, qX + qPad, qZ - qPad, qZ + qPad);
      }

      // 3. Oriented Bounding Box (OBB) Colliders via O(1) spatial hash lookup
      const outB = grid.outBoxes;
      const outBLen = grid.outBoxesLength;
      for (let i = 0; i < outBLen; i++) {
        const box = this.colliders[outB[i]];
        const baseY = box.baseY ?? 0;
        if (entityY > baseY + box.height || entityY + 1.65 <= baseY) continue;
        if (box.isStairStep && entityY + 0.48 >= baseY + box.height) continue;
        if (
          box.isStairRamp &&
          box.stairZStart !== undefined &&
          box.stairZEnd !== undefined &&
          box.stairYStart !== undefined &&
          box.stairYEnd !== undefined
        ) {
          const clampZ = THREE.MathUtils.clamp(nz, box.stairZEnd, box.stairZStart);
          const t =
            (box.stairZStart - clampZ) / Math.max(0.01, box.stairZStart - box.stairZEnd);
          const rampY = box.stairYStart + (box.stairYEnd - box.stairYStart) * t;
          if (entityY >= rampY - 0.65 && entityY >= box.stairYStart - 0.45) {
            continue;
          }
        }

        const rotY = box.rotY ?? 0;
        const cosR = rotY === 0 ? 1 : Math.cos(rotY);
        const sinR = rotY === 0 ? 0 : Math.sin(rotY);
        const dxW = nx - box.x;
        const dzW = nz - box.z;

        const lx = dxW * cosR - dzW * sinR;
        const lz = dxW * sinR + dzW * cosR;

        const cx = THREE.MathUtils.clamp(lx, -box.halfW, box.halfW);
        const cz = THREE.MathUtils.clamp(lz, -box.halfD, box.halfD);
        const dlx = lx - cx;
        const dlz = lz - cz;
        const dSq = dlx * dlx + dlz * dlz;

        if (dSq < radiusSq) {
          let pushLx = 0;
          let pushLz = 0;
          if (dSq > 1e-8) {
            const d = Math.sqrt(dSq);
            const push = radius - d;
            pushLx = (dlx / d) * push;
            pushLz = (dlz / d) * push;
          } else {
            const penX = box.halfW - Math.abs(lx);
            const penZ = box.halfD - Math.abs(lz);
            if (penX < penZ) {
              pushLx = (lx >= 0 ? 1 : -1) * (penX + radius);
            } else {
              pushLz = (lz >= 0 ? 1 : -1) * (penZ + radius);
            }
          }
          nx += pushLx * cosR + pushLz * sinR;
          nz += -pushLx * sinR + pushLz * cosR;
        }
      }

      // 4. Cylindrical Rigid Colliders via O(1) spatial hash lookup
      const outC = grid.outCircles;
      const outCLen = grid.outCirclesLength;
      for (let i = 0; i < outCLen; i++) {
        const c = this.circleColliders[outC[i]];
        const baseY = c.baseY ?? 0;
        if (entityY > baseY + c.height || entityY + 1.65 <= baseY) continue;

        const dx = nx - c.x;
        const dz = nz - c.z;
        const minD = radius + c.radius;
        const dSq = dx * dx + dz * dz;
        if (dSq < minD * minD) {
          if (dSq > 1e-8) {
            const d = Math.sqrt(dSq);
            const push = minD - d;
            nx += (dx / d) * push;
            nz += (dz / d) * push;
          } else {
            nx += minD;
          }
        }
      }
      // 5. Floating Celestial Islands Rigid Collision (cones, meadow rim, temple base, towers & shikhara)
      this.resolveFloatingIslandXZ(nx, nz, radius, entityY, _staticRes);
      nx = _staticRes.x;
      nz = _staticRes.z;
    }

    _staticRes.x = nx;
    _staticRes.z = nz;
    return _staticRes;
  }

  private moveSweptWithStaticCCD(
    startX: number,
    startZ: number,
    targetX: number,
    targetZ: number,
    radius: number,
    entityY = 0,
    isDemon = false,
    allowWater = true
  ): { x: number; z: number } {
    const dx = targetX - startX;
    const dz = targetZ - startZ;
    const dist = Math.hypot(dx, dz);
    const maxStep = Math.max(0.16, radius * 0.3);
    const steps = Math.min(48, Math.max(1, Math.ceil(dist / maxStep)));

    let cx = startX;
    let cz = startZ;
    let curY = entityY;
    for (let s = 1; s <= steps; s++) {
      const stepTargetX = startX + (dx * s) / steps;
      const stepTargetZ = startZ + (dz * s) / steps;
      const resolved = this.resolveStaticColliders(
        stepTargetX,
        stepTargetZ,
        radius,
        curY,
        isDemon,
        false,
        allowWater
      );
      cx = resolved.x;
      cz = resolved.z;
      const surfY = this.surfaceHeightAt(cx, cz, curY);
      if (surfY >= curY - 0.85 && curY <= surfY + 0.42) {
        curY = surfY;
      }
    }
    _sweptRes.x = cx;
    _sweptRes.z = cz;
    return _sweptRes;
  }

  private resolveChariotStaticCCD(
    startX: number,
    startZ: number,
    targetX: number,
    targetZ: number,
    yaw: number,
    baseY: number
  ): { x: number; z: number; blocked: boolean } {
    // Infallible 4-sphere compound rigid CCD sweep spanning rear carriage deck, axle, yoke & lead horses
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);

    const dx = targetX - startX;
    const dz = targetZ - startZ;
    const dist = Math.hypot(dx, dz);
    const steps = Math.min(72, Math.max(1, Math.ceil(dist / 0.18)));

    let cx = startX;
    let cz = startZ;
    let curY = baseY;
    let blocked = false;

    for (let s = 1; s <= steps; s++) {
      const frac = s / steps;
      let candX = startX + dx * frac;
      let candZ = startZ + dz * frac;

      // Resolve all 4 compound rigid spheres at this substep
      for (let pass = 0; pass < 2; pass++) {
        for (let k = 0; k < _chariotHullOffsets.length; k++) {
          const ho = _chariotHullOffsets[k];
          const sx = candX + sinY * ho.zLocal;
          const sz = candZ + cosY * ho.zLocal;
          const res = this.resolveStaticColliders(sx, sz, ho.r, curY, false, true);
          const corrX = res.x - sx;
          const corrZ = res.z - sz;
          if (corrX * corrX + corrZ * corrZ > 0.000025) {
            candX += corrX;
            candZ += corrZ;
          }
        }
      }

      // Prevent Ratha from phasing into vertical terrain cliffs or volcanic shear walls (>1.45m step rise)
      const nextY = groundHeightAt(candX, candZ);
      if (nextY - curY > 1.45 && dist > 0.01) {
        blocked = true;
        break;
      }
      cx = candX;
      cz = candZ;
      curY = nextY;
    }

    const remX = cx - targetX;
    const remZ = cz - targetZ;
    if (remX * remX + remZ * remZ > 0.0196) {
      blocked = true;
    }
    _chariotCcdRes.x = cx;
    _chariotCcdRes.z = cz;
    _chariotCcdRes.blocked = blocked;
    return _chariotCcdRes;
  }

  private fillChariotCompoundSpheres(
    ch: ChariotEntity,
    out: Array<{ x: number; z: number; r: number }>
  ): void {
    const sinY = Math.sin(ch.yaw);
    const cosY = Math.cos(ch.yaw);
    out[0].x = ch.x - sinY * 1.15;
    out[0].z = ch.z - cosY * 1.15;
    out[1].x = ch.x + sinY * 0.1;
    out[1].z = ch.z + cosY * 0.1;
    out[2].x = ch.x + sinY * 1.4;
    out[2].z = ch.z + cosY * 1.4;
    out[3].x = ch.x + sinY * 2.5;
    out[3].z = ch.z + cosY * 2.5;
  }

  private separateCirclePair(
    ax: number,
    az: number,
    ar: number,
    bx: number,
    bz: number,
    br: number,
    weightA: number
  ): { ax: number; az: number; bx: number; bz: number; collided: boolean } {
    const dx = bx - ax;
    const dz = bz - az;
    const minD = ar + br;
    const dSq = dx * dx + dz * dz;
    if (dSq >= minD * minD) {
      _sepRes.collided = false;
      return _sepRes;
    }
    const d = Math.sqrt(dSq);
    const nx = d > 1e-5 ? dx / d : 1;
    const nz = d > 1e-5 ? dz / d : 0;
    const overlap = minD - d;
    const weightB = 1 - weightA;
    _sepRes.ax = ax - nx * overlap * weightA;
    _sepRes.az = az - nz * overlap * weightA;
    _sepRes.bx = bx + nx * overlap * weightB;
    _sepRes.bz = bz + nz * overlap * weightB;
    _sepRes.collided = true;
    return _sepRes;
  }

  private resolveDynamicPairwiseCollisions(): void {
    const playerRadius = 0.58;
    const citizenRadius = 0.48;

    for (let pass = 0; pass < 2; pass++) {
      // 1. Chariot vs Chariot rigid separation
      for (let i = 0; i < this.chariots.length; i++) {
        for (let j = i + 1; j < this.chariots.length; j++) {
          const ci = this.chariots[i];
          const cj = this.chariots[j];
          this.fillChariotCompoundSpheres(ci, _chariotSpheresA);
          this.fillChariotCompoundSpheres(cj, _chariotSpheresB);
          for (let aIdx = 0; aIdx < 4; aIdx++) {
            const si = _chariotSpheresA[aIdx];
            for (let bIdx = 0; bIdx < 4; bIdx++) {
              const sj = _chariotSpheresB[bIdx];
              const wI =
                this.mountedChariotIndex === i
                  ? 0.78
                  : this.mountedChariotIndex === j
                  ? 0.22
                  : 0.5;
              const sep = this.separateCirclePair(si.x, si.z, si.r, sj.x, sj.z, sj.r, wI);
              if (sep.collided) {
                ci.x += sep.ax - si.x;
                ci.z += sep.az - si.z;
                cj.x += sep.bx - sj.x;
                cj.z += sep.bz - sj.z;
                if (this.mountedChariotIndex === i) ci.speed *= 0.65;
                if (this.mountedChariotIndex === j) cj.speed *= 0.65;
              }
            }
          }
        }
      }

      // 2. Player (on foot) vs Unmounted Chariots, Animals, Rakshasas, and Citizens
      if (this.mountedChariotIndex === null && this.mountedAnimalIndex === null) {
        for (let i = 0; i < this.chariots.length; i++) {
          const ch = this.chariots[i];
          if (Math.abs(this.playerY - ch.y) > 3.6) continue;
          this.fillChariotCompoundSpheres(ch, _chariotSpheresA);
          for (let sIdx = 0; sIdx < 4; sIdx++) {
            const s = _chariotSpheresA[sIdx];
            const sep = this.separateCirclePair(
              this.playerX,
              this.playerZ,
              playerRadius,
              s.x,
              s.z,
              s.r,
              1.0
            );
            if (sep.collided) {
              this.playerX = sep.ax;
              this.playerZ = sep.az;
            }
          }
        }

        for (let i = 0; i < this.animals.length; i++) {
          const a = this.animals[i];
          if (Math.abs(this.playerY - a.y) > 2.8) continue;
          const ar = a.kind === 'ELEPHANT' ? 1.55 : 0.95;
          const sep = this.separateCirclePair(this.playerX, this.playerZ, playerRadius, a.x, a.z, ar, 0.9);
          if (sep.collided) {
            this.playerX = sep.ax;
            this.playerZ = sep.az;
          }
        }

        for (let i = 0; i < this.enemies.length; i++) {
          const e = this.enemies[i];
          if (!e.alive || Math.abs(this.playerY - e.y) > 2.2) continue;
          const er = e.isCommander ? 0.92 : 0.68;
          const sep = this.separateCirclePair(
            this.playerX,
            this.playerZ,
            playerRadius,
            e.x,
            e.z,
            er,
            0.55
          );
          if (sep.collided) {
            this.playerX = sep.ax;
            this.playerZ = sep.az;
            e.x = sep.bx;
            e.z = sep.bz;
          }
        }

        for (let i = 0; i < this.citizens.length; i++) {
          const c = this.citizens[i];
          if (Math.abs(this.playerY - c.y) > 2.0) continue;
          const sep = this.separateCirclePair(
            this.playerX,
            this.playerZ,
            playerRadius,
            c.x,
            c.z,
            citizenRadius,
            c.seated ? 1.0 : 0.35
          );
          if (sep.collided) {
            this.playerX = sep.ax;
            this.playerZ = sep.az;
            if (!c.seated) {
              c.x = sep.bx;
              c.z = sep.bz;
            }
          }
        }
      }

      // 2b. Mountable Animals vs Chariots & Animals
      for (let i = 0; i < this.animals.length; i++) {
        const ai = this.animals[i];
        const ri = ai.kind === 'ELEPHANT' ? 1.55 : 0.95;
        for (let cIdx = 0; cIdx < this.chariots.length; cIdx++) {
          const ch = this.chariots[cIdx];
          this.fillChariotCompoundSpheres(ch, _chariotSpheresA);
          for (let sIdx = 0; sIdx < 4; sIdx++) {
            const s = _chariotSpheresA[sIdx];
            const sep = this.separateCirclePair(ai.x, ai.z, ri, s.x, s.z, s.r, 0.85);
            if (sep.collided) {
              ai.x = sep.ax;
              ai.z = sep.az;
            }
          }
        }
        for (let j = i + 1; j < this.animals.length; j++) {
          const aj = this.animals[j];
          const rj = aj.kind === 'ELEPHANT' ? 1.55 : 0.95;
          const wA = this.mountedAnimalIndex === i ? 0.25 : this.mountedAnimalIndex === j ? 0.75 : 0.5;
          const sep = this.separateCirclePair(ai.x, ai.z, ri, aj.x, aj.z, rj, wA);
          if (sep.collided) {
            ai.x = sep.ax;
            ai.z = sep.az;
            aj.x = sep.bx;
            aj.z = sep.bz;
          }
        }
      }

      // 3. Rakshasas vs Chariots, Rakshasas vs Rakshasas, Rakshasas vs Citizens
      for (let i = 0; i < this.enemies.length; i++) {
        const ei = this.enemies[i];
        if (!ei.alive) continue;
        const ri = ei.isCommander ? 0.92 : 0.68;

        for (let cIdx = 0; cIdx < this.chariots.length; cIdx++) {
          const ch = this.chariots[cIdx];
          if (Math.abs(ei.y - ch.y) > 3.5) continue;
          this.fillChariotCompoundSpheres(ch, _chariotSpheresA);
          for (let sIdx = 0; sIdx < 4; sIdx++) {
            const s = _chariotSpheresA[sIdx];
            const sep = this.separateCirclePair(ei.x, ei.z, ri, s.x, s.z, s.r, 1.0);
            if (sep.collided) {
              ei.x = sep.ax;
              ei.z = sep.az;
            }
          }
        }

        for (let j = i + 1; j < this.enemies.length; j++) {
          const ej = this.enemies[j];
          if (!ej.alive) continue;
          const rj = ej.isCommander ? 0.92 : 0.68;
          const sep = this.separateCirclePair(ei.x, ei.z, ri, ej.x, ej.z, rj, 0.5);
          if (sep.collided) {
            ei.x = sep.ax;
            ei.z = sep.az;
            ej.x = sep.bx;
            ej.z = sep.bz;
          }
        }

        for (let cIdx = 0; cIdx < this.citizens.length; cIdx++) {
          const cit = this.citizens[cIdx];
          const sep = this.separateCirclePair(ei.x, ei.z, ri, cit.x, cit.z, citizenRadius, 0.25);
          if (sep.collided) {
            ei.x = sep.ax;
            ei.z = sep.az;
            cit.x = sep.bx;
            cit.z = sep.bz;
          }
        }
      }

      // 4. Citizens vs Chariots, Animals & Citizens
      for (let i = 0; i < this.citizens.length; i++) {
        const ci = this.citizens[i];
        if (ci.seated) continue;
        for (let cIdx = 0; cIdx < this.chariots.length; cIdx++) {
          const ch = this.chariots[cIdx];
          this.fillChariotCompoundSpheres(ch, _chariotSpheresA);
          for (let sIdx = 0; sIdx < 4; sIdx++) {
            const s = _chariotSpheresA[sIdx];
            const sep = this.separateCirclePair(
              ci.x,
              ci.z,
              citizenRadius,
              s.x,
              s.z,
              s.r,
              1.0
            );
            if (sep.collided) {
              ci.x = sep.ax;
              ci.z = sep.az;
            }
          }
        }
        for (let aIdx = 0; aIdx < this.animals.length; aIdx++) {
          const a = this.animals[aIdx];
          const ar = a.kind === 'ELEPHANT' ? 1.55 : 0.95;
          const sep = this.separateCirclePair(ci.x, ci.z, citizenRadius, a.x, a.z, ar, 1.0);
          if (sep.collided) {
            ci.x = sep.ax;
            ci.z = sep.az;
          }
        }
        for (let j = i + 1; j < this.citizens.length; j++) {
          const cj = this.citizens[j];
          const sep = this.separateCirclePair(
            ci.x,
            ci.z,
            citizenRadius,
            cj.x,
            cj.z,
            citizenRadius,
            cj.seated ? 1.0 : 0.5
          );
          if (sep.collided) {
            ci.x = sep.ax;
            ci.z = sep.az;
            if (!cj.seated) {
              cj.x = sep.bx;
              cj.z = sep.bz;
            }
          }
        }
      }
    }

    // Final hard static collider & terrain ground lock pass (zero post-separation wall/ground penetration)
    if (this.mountedChariotIndex === null && this.mountedAnimalIndex === null && !this.seatedOnThrone) {
      const pLock = this.resolveStaticColliders(
        this.playerX,
        this.playerZ,
        playerRadius,
        this.playerY,
        false,
        false,
        true
      );
      this.playerX = pLock.x;
      this.playerZ = pLock.z;
      const gY = this.surfaceHeightAt(this.playerX, this.playerZ);
      if (this.playerY < gY) {
        this.playerY = gY;
        this.playerVelY = 0;
        this.grounded = true;
      }
    }

    for (let i = 0; i < this.animals.length; i++) {
      const a = this.animals[i];
      const ar = a.kind === 'ELEPHANT' ? 1.55 : 0.95;
      const res = this.resolveStaticColliders(a.x, a.z, ar, a.y, false, false, true);
      a.x = res.x;
      a.z = res.z;
      a.y = Math.max(RIVER_SURFACE_Y + 0.12, this.surfaceHeightAt(a.x, a.z, a.y));
      const obj = a.horseRig ? a.horseRig.group : a.elephantRig!.group;
      obj.position.set(a.x, a.y, a.z);
      obj.rotation.y = a.yaw;
    }

    for (let i = 0; i < this.chariots.length; i++) {
      const ch = this.chariots[i];
      const res = this.resolveChariotStaticCCD(ch.x, ch.z, ch.x, ch.z, ch.yaw, ch.y);
      ch.x = res.x;
      ch.z = res.z;
      this.syncChariotTerrainSupport(ch, 0.016);
    }

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.alive) continue;
      const er = e.isCommander ? 0.92 : 0.68;
      const res = this.resolveStaticColliders(e.x, e.z, er, e.y, true, false, false);
      e.x = Math.max(DEMON_ZONE_MIN_X, res.x);
      e.z = res.z;
      e.y = groundHeightAt(e.x, e.z);
    }

    for (let i = 0; i < this.citizens.length; i++) {
      const c = this.citizens[i];
      if (c.seated) continue;
      const res = this.resolveStaticColliders(
        c.x,
        c.z,
        citizenRadius,
        this.surfaceHeightAt(c.x, c.z, c.y),
        false,
        false,
        c.canSwim
      );
      c.x = res.x;
      c.z = res.z;
    }
  }

  private syncChariotTerrainSupport(ch: ChariotEntity, _dt: number): void {
    const sinY = Math.sin(ch.yaw);
    const cosY = Math.cos(ch.yaw);
    const rearY = groundHeightAt(ch.x - sinY * 0.6, ch.z - cosY * 0.6);
    const centerY = groundHeightAt(ch.x, ch.z);
    const frontY = groundHeightAt(ch.x + sinY * 2.75, ch.z + cosY * 2.75);
    const targetPitch = THREE.MathUtils.clamp(
      Math.atan2(frontY - rearY, 3.35),
      -0.42,
      0.42
    );
    // Rigid surface snapping: zero damp lag or floating offset so wheel rims & hooves lock cleanly
    ch.pitch = targetPitch;
    const planeY = THREE.MathUtils.lerp(rearY, frontY, 0.6 / 3.35);
    ch.y = Math.max(centerY, planeY);
    ch.rig.root.position.set(ch.x, ch.y, ch.z);
    ch.rig.root.rotation.order = 'YXZ';
    ch.rig.root.rotation.y = ch.yaw;
    ch.rig.root.rotation.x = -ch.pitch;
  }

  private raySegmentIntersectsOBB(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    box: BoxCollider
  ): number | null {
    const rotY = box.rotY ?? 0;
    const cosR = rotY === 0 ? 1 : Math.cos(rotY);
    const sinR = rotY === 0 ? 0 : Math.sin(rotY);

    const adx = ax - box.x;
    const adz = az - box.z;
    const alx = adx * cosR - adz * sinR;
    const alz = adx * sinR + adz * cosR;

    const bdx = bx - box.x;
    const bdz = bz - box.z;
    const blx = bdx * cosR - bdz * sinR;
    const blz = bdx * sinR + bdz * cosR;

    const baseY = box.baseY ?? 0;
    const minY = baseY;
    const maxY = baseY + box.height;

    let tMin = 0;
    let tMax = 1;

    // X slab
    const dx = blx - alx;
    if (Math.abs(dx) < 1e-6) {
      if (alx < -box.halfW || alx > box.halfW) return null;
    } else {
      const inv = 1 / dx;
      let t1 = (-box.halfW - alx) * inv;
      let t2 = (box.halfW - alx) * inv;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tMin) tMin = t1;
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return null;
    }

    // Y slab
    const dy = by - ay;
    if (Math.abs(dy) < 1e-6) {
      if (ay < minY || ay > maxY) return null;
    } else {
      const inv = 1 / dy;
      let t1 = (minY - ay) * inv;
      let t2 = (maxY - ay) * inv;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tMin) tMin = t1;
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return null;
    }

    // Z slab
    const dz = blz - alz;
    if (Math.abs(dz) < 1e-6) {
      if (alz < -box.halfD || alz > box.halfD) return null;
    } else {
      const inv = 1 / dz;
      let t1 = (-box.halfD - alz) * inv;
      let t2 = (box.halfD - alz) * inv;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tMin) tMin = t1;
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return null;
    }

    return tMin >= 0 && tMin <= 1 ? tMin : null;
  }

  private raySegmentIntersectsCylinder(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cz: number,
    radius: number,
    minY: number,
    maxY: number
  ): number | null {
    const dx = bx - ax;
    const dz = bz - az;
    const fx = ax - cx;
    const fz = az - cz;
    const a = dx * dx + dz * dz;
    const b = 2 * (fx * dx + fz * dz);
    const c = fx * fx + fz * fz - radius * radius;
    if (c <= 0 && ay >= minY && ay <= maxY) return 0;
    if (a < 1e-8) return null;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sqrtD = Math.sqrt(disc);
    const t = (-b - sqrtD) / (2 * a);
    if (t < 0 || t > 1) return null;
    const hitY = ay + (by - ay) * t;
    if (hitY < minY || hitY > maxY) return null;
    return t;
  }

  private findNearestMount(): {
    id: string;
    kind: 'RATHA' | 'HORSE' | 'ELEPHANT';
    index: number;
    label: string;
    occupiedCount: number;
    driverId: string | null;
    passengerId: string | null;
    isFull: boolean;
  } | null {
    let found = false;
    let bestDistSq = Infinity;

    for (let i = 0; i < this.chariots.length; i++) {
      const c = this.chariots[i];
      if (Math.abs(c.y - this.playerY) > 3.5) continue;
      const dx = c.x - this.playerX;
      const dz = c.z - this.playerZ;
      const dSq = dx * dx + dz * dz;
      if (dSq < 4.8 * 4.8 && dSq < bestDistSq) {
        bestDistSq = dSq;
        found = true;
        _nearestMountOut.id = c.id;
        _nearestMountOut.kind = 'RATHA';
        _nearestMountOut.index = i;
        _nearestMountOut.label = 'Royal Ratha';
        _nearestMountOut.driverId = c.driverId;
        _nearestMountOut.passengerId = c.passengerId;
        _nearestMountOut.occupiedCount = (c.driverId ? 1 : 0) + (c.passengerId ? 1 : 0);
        _nearestMountOut.isFull = c.driverId !== null && c.passengerId !== null;
      }
    }

    for (let i = 0; i < this.animals.length; i++) {
      const a = this.animals[i];
      if (Math.abs(a.y - this.playerY) > 3.5) continue;
      const reach = a.kind === 'ELEPHANT' ? 4.6 : 4.0;
      const dx = a.x - this.playerX;
      const dz = a.z - this.playerZ;
      const dSq = dx * dx + dz * dz;
      if (dSq < reach * reach && dSq < bestDistSq) {
        bestDistSq = dSq;
        found = true;
        _nearestMountOut.id = a.id;
        _nearestMountOut.kind = a.kind;
        _nearestMountOut.index = i;
        _nearestMountOut.label = a.label;
        _nearestMountOut.driverId = a.driverId;
        _nearestMountOut.passengerId = a.passengerId;
        _nearestMountOut.occupiedCount = (a.driverId ? 1 : 0) + (a.passengerId ? 1 : 0);
        _nearestMountOut.isFull = a.driverId !== null && a.passengerId !== null;
      }
    }
    return found ? _nearestMountOut : null;
  }

  private getThroneSeatAnchor(): { x: number; y: number; z: number } {
    const sabhaBaseY = Math.max(
      RIVER_SURFACE_Y + 0.35,
      groundHeightAt(SABHA_HALL_POS.x, SABHA_HALL_POS.z)
    );
    return { x: THRONE_POS.x, y: sabhaBaseY + 0.635, z: THRONE_POS.z + 0.04 };
  }

  private isNearThrone(): boolean {
    return (
      this.mountedChariotIndex === null &&
      this.mountedAnimalIndex === null &&
      Math.hypot(this.playerX - THRONE_POS.x, this.playerZ - THRONE_POS.z) <= 3.8 &&
      Math.abs(this.playerY - 0.88) <= 1.8
    );
  }

  public selectAstra(id: AstraId | null): void {
    if (this.astraQuest?.selectAstra(id)) {
      this.input.selectedAstra = this.astraQuest.selectedAstra;
      if (this.brahmaSummonPhase === 'AIM_READY' && id !== 'BRAHMASTRA') {
        this.abortBrahmaSummon();
      }
      this.emitHud();
    }
  }

  public dismissStoryIntro(): void {
    this.showStoryIntro = false;
    this.astraQuest?.markIntroSeen();
    this.emitHud();
  }

  public dismissUnlockPopup(): void {
    this.astraQuest?.dismissUnlockPopup();
    this.emitHud();
  }

  private abortBrahmaSummon(): void {
    this.brahmaSummonPhase = 'IDLE';
    this.brahmaSummonTimer = 0;
    this.brahmaFadeAlpha = 0;
    this.brahmaFlashAlpha = 0;
    this.brahmaCycloneMood = 0;
    this.brahmaLightningFired = false;
    this.slowMoTimer = 0;
    this.slowMoFactor = 1.0;
    if (this.astraVfx) {
      this.astraVfx.handLotusRig.group.visible = false;
      this.astraVfx.setStormCyclone(0, this.playerX, this.playerZ, 0);
    }
    soundEngine.setAmbienceDuck(false);
  }

  private startBrahmastraSummon(): void {
    if (this.brahmaSummonPhase !== 'IDLE') return;
    if (this.seatedOnThrone) {
      this.seatedOnThrone = false;
      this.playerZ = THRONE_POS.z + 1.65;
      this.playerY = this.surfaceHeightAt(this.playerX, this.playerZ, 0.9);
      this.restoreRamStandingClothes();
    }
    if (this.mountedChariotIndex !== null || this.mountedAnimalIndex !== null) {
      this.dismountLocalPlayerCleanly(true);
    }
    if (this.stealthActive) {
      this.setStealthMode(false);
    }
    this.brahmaSummonPhase = 'NAMASKAR';
    this.brahmaSummonTimer = 2.3;
    this.brahmaLightningFired = false;
    this.brahmaFadeAlpha = 0;
    this.brahmaFlashAlpha = 0;
    this.brahmaCycloneMood = 0;
    if (this.astraVfx) {
      this.astraVfx.handLotusRig.group.visible = false;
    }
    soundEngine.setAmbienceDuck(true);
    soundEngine.playBrahmaMantraChant();
    this.emitHud();
  }

  private resolveAimDirection(dirOut: THREE.Vector3): void {
    const cosP = Math.cos(this.camPitch);
    let dirX = -Math.sin(this.camYaw) * cosP;
    let dirY = -Math.sin(this.camPitch);
    let dirZ = -Math.cos(this.camYaw) * cosP;

    const eyeX = this.camSmoothPos.x;
    const eyeY = this.camSmoothPos.y;
    const eyeZ = this.camSmoothPos.z;
    let bestScore = 0.72;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.x - eyeX;
      const dy = enemy.y + 1.25 - eyeY;
      const dz = enemy.z - eyeZ;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 38 || dist < 0.5) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      const nz = dz / dist;
      const dot = nx * dirX + ny * dirY + nz * dirZ;
      if (dot > bestScore) {
        bestScore = dot;
        dirX = nx;
        dirY = ny;
        dirZ = nz;
      }
    }
    dirOut.set(dirX, dirY, dirZ).normalize();
  }

  private fireArrow(isChakra: boolean, astraId: AstraId | null = null): void {
    this.resolveAimDirection(_v1);
    const dirX = _v1.x;
    const dirY = _v1.y;
    const dirZ = _v1.z;

    // On foot, keep Ram's body aligned with first-person look yaw
    if (
      this.mountedChariotIndex === null &&
      this.mountedAnimalIndex === null &&
      !this.seatedOnThrone
    ) {
      this.playerYaw = this.camYaw + Math.PI;
    }

    const archetype: ProjectileArchetypeId = isChakra
      ? 'CHAKRA'
      : astraId
      ? astraId
      : 'ARROW';
    const profile = PROJECTILE_PHYSICS_REGISTRY[archetype];
    const clientShotId = this.projectileSync.nextShotId(archetype);

    const isStealthAmbush = this.stealthActive && !this.stealthSpotted;
    let meshGroup: THREE.Group;
    let spinPivot: THREE.Group | undefined;
    let poolKey = 'arrow';

    if (isChakra) {
      poolKey = 'chakra';
      meshGroup = this.poolManager.acquire<THREE.Group>(poolKey);
      spinPivot = meshGroup.userData.spinPivot as THREE.Group | undefined;
      soundEngine.playAstraBlast();
    } else if (astraId) {
      poolKey = `astra_arrow_${astraId}`;
      meshGroup = this.poolManager.acquire<THREE.Group>(poolKey);
      soundEngine.playAstraRelease(astraId);
    } else {
      meshGroup = this.poolManager.acquire<THREE.Group>(poolKey);
      soundEngine.playBowShot();
    }

    const startY =
      this.mountedChariotIndex !== null
        ? this.mountedSeatIndex === 1
          ? this.playerY + 1.52
          : this.playerY + 2.35
        : this.mountedAnimalIndex !== null
        ? this.playerY + 1.5
        : this.playerY + 1.45;
    const startX = this.playerX + dirX * 0.75;
    const startZ = this.playerZ + dirZ * 0.75;
    meshGroup.position.set(startX, startY, startZ);
    meshGroup.lookAt(startX + dirX, startY + dirY, startZ + dirZ);

    // Optional lock-on target ID along Chakra's launch cone so it curves cleanly across clusters
    let chakraLockId: string | null = null;
    if (isChakra) {
      let bestLockDot = 0.72;
      for (let ei = 0; ei < this.enemies.length; ei++) {
        const e = this.enemies[ei];
        if (!e.alive) continue;
        const edx = e.x - startX;
        const edz = e.z - startZ;
        const edist = Math.hypot(edx, edz);
        if (edist > 36 || edist < 1.2) continue;
        const dot = (edx / edist) * dirX + (edz / edist) * dirZ;
        if (dot > bestLockDot) {
          bestLockDot = dot;
          chakraLockId = e.id;
        }
      }
    }

    const velFrac = profile.inheritCasterVelFraction;
    const initVx = dirX * profile.speed + this._projCasterVelScratch.x * velFrac;
    const initVy =
      dirY * profile.speed + this._projCasterVelScratch.y * velFrac * 0.4;
    const initVz = dirZ * profile.speed + this._projCasterVelScratch.z * velFrac;

    const entity: ProjectileEntity = {
      mesh: meshGroup,
      spinPivot,
      archetype,
      clientShotId,
      x: startX,
      y: startY,
      z: startZ,
      vx: initVx,
      vy: initVy,
      vz: initVz,
      elapsedFlightSec: 0,
      spinAngle: 0,
      isChakra,
      stealthAmbush: isStealthAmbush,
      life: profile.maxLifeSec,
      astraId,
      homingTargetId: chakraLockId,
      piercedEnemyIds: isChakra ? new Set<string>() : undefined,
      strikeCount: 0,
      poolKey,
    };
    this.projectiles.push(entity);

    if (this.lanClient?.isMultiplayerActive()) {
      this.lanClient.sendShot({
        shotId: clientShotId,
        archetype,
        origin: { x: startX, y: startY, z: startZ },
        dir: { x: dirX, y: dirY, z: dirZ },
        stealthAmbush: isStealthAmbush,
        homingTargetId: chakraLockId,
      });
    }

    const nearby = this.projectileSync.buildNearbySnapshots(
      this.playerX,
      this.playerZ,
      this.enemies
    );
    this.projectileSync.registerShot(
      clientShotId,
      archetype,
      { x: startX, y: startY, z: startZ },
      { x: dirX, y: dirY, z: dirZ },
      { x: this.playerX, y: this.playerY, z: this.playerZ },
      isStealthAmbush,
      nearby,
      null,
      chakraLockId,
      () => {
        // Server rejected cooldown/spawn sanity — disarm projectile immediately
        entity.serverRejected = true;
      },
      this._projCasterVelScratch
    );
  }

  private spawnSplitSerpents(
    originX: number,
    originY: number,
    originZ: number,
    excludeEnemyId: string | null,
    parentClientShotId: string
  ): void {
    const cfg = ASTRA_CONFIG.NAGASTRA;
    const serpentProfile = PROJECTILE_PHYSICS_REGISTRY.NAGASTRA_SERPENT;
    const count = cfg.splitCount;
    const nearby = this.projectileSync.buildNearbySnapshots(
      originX,
      originZ,
      this.enemies
    );
    for (let s = 0; s < count; s++) {
      let bestTarget: EnemyEntity | null = null;
      let bestDistSq = cfg.radius * cfg.radius * 2.2;
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (!e.alive || (s === 0 && e.id === excludeEnemyId)) continue;
        const dSq =
          (e.x - originX) * (e.x - originX) + (e.z - originZ) * (e.z - originZ);
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestTarget = e;
        }
      }
      const ang = (s / count) * Math.PI * 2 + 0.4;
      const dirX = Math.cos(ang);
      const dirZ = Math.sin(ang);
      const vx = dirX * 18;
      const vz = dirZ * 18;
      const mesh = this.poolManager.acquire<THREE.Group>('astra_serpent');
      const sy = originY + 0.35;
      mesh.position.set(originX, sy, originZ);
      const clientShotId = this.projectileSync.nextShotId('NAGASTRA_SERPENT');
      const homingTargetId = bestTarget ? bestTarget.id : excludeEnemyId;
      const serpentEntity: ProjectileEntity = {
        mesh,
        archetype: 'NAGASTRA_SERPENT',
        clientShotId,
        x: originX,
        y: sy,
        z: originZ,
        vx,
        vy: 3.2,
        vz,
        elapsedFlightSec: 0,
        spinAngle: 0,
        isChakra: false,
        stealthAmbush: false,
        life: serpentProfile.maxLifeSec,
        astraId: 'NAGASTRA',
        isSplitSerpent: true,
        homingTargetId,
        poolKey: 'astra_serpent',
      };
      this.projectiles.push(serpentEntity);

      this.projectileSync.registerShot(
        clientShotId,
        'NAGASTRA_SERPENT',
        { x: originX, y: sy, z: originZ },
        { x: dirX, y: 0.18, z: dirZ },
        { x: this.playerX, y: this.playerY, z: this.playerZ },
        false,
        nearby,
        parentClientShotId,
        homingTargetId,
        () => {
          serpentEntity.serverRejected = true;
        }
      );
    }
  }

  private resolveAstraImpact(
    p: ProjectileEntity,
    hitX: number,
    hitY: number,
    hitZ: number,
    hitEnemy: EnemyEntity | null,
    optimisticOut: OptimisticDamageRecord[]
  ): void {
    const astraId = p.astraId;
    if (!astraId) return;
    const cfg = ASTRA_CONFIG[astraId];
    const profile = this.qualityManager.getProfile();
    const gY = groundHeightAt(hitX, hitZ);
    const dmgMult =
      (p.stealthAmbush ? 2.0 : 1.0) * HERO_PROFILES[this.activeHeroId].attackDamageMultiplier;

    // Notify quest targets (Fire Bowls, Underwater Pearls, Brahmastra Stage 2 Seals)
    this.astraQuest?.onPlayerArrowHitPoint(hitX, hitY, hitZ, astraId);

    if (p.isSplitSerpent) {
      if (hitEnemy) {
        const dmg = Math.round(cfg.splashDamage * dmgMult);
        const killed = this.damageEnemy(hitEnemy, dmg, 'NAGASTRA');
        optimisticOut.push({
          enemyId: hitEnemy.id,
          damage: dmg,
          karmaAwarded: 0,
          wasKilledByShot: killed,
        });
        hitEnemy.bindTimer = Math.max(hitEnemy.bindTimer, cfg.effectDurationSec);
        hitEnemy.burnTimer = Math.max(hitEnemy.burnTimer, cfg.effectDurationSec);
        hitEnemy.burnDps = Math.max(hitEnemy.burnDps, cfg.dotDamagePerSec);
        this.astraVfx?.spawnNagaBind(hitEnemy.id, hitEnemy.x, hitEnemy.y, hitEnemy.z, cfg.effectDurationSec);
      }
      this.spawnBlast(hitX, hitY, hitZ, cfg.primaryHex);
      return;
    }

    if (astraId === 'AGNEYASTRA') {
      this.astraVfx?.spawnAgniMandalaField(
        hitX,
        gY,
        hitZ,
        cfg.radius,
        3.0,
        14,
        profile.particleScale,
        profile.tier,
        p.clientShotId
      );
      soundEngine.playAstraImpact('AGNEYASTRA');
      this.cameraShakeAmount = Math.max(this.cameraShakeAmount, cfg.cameraShake);
      const rSq = cfg.radius * cfg.radius;
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (!e.alive) continue;
        const dSq = (e.x - hitX) * (e.x - hitX) + (e.z - hitZ) * (e.z - hitZ);
        if (dSq <= rSq) {
          const isDirect = hitEnemy === e;
          e.burnTimer = Math.max(e.burnTimer, cfg.effectDurationSec);
          e.burnDps = Math.max(e.burnDps, cfg.dotDamagePerSec);
          const dmg = Math.round((isDirect ? cfg.damage : cfg.splashDamage) * dmgMult);
          const killed = this.damageEnemy(e, dmg, 'AGNEYASTRA');
          optimisticOut.push({
            enemyId: e.id,
            damage: dmg,
            karmaAwarded: 0,
            wasKilledByShot: killed,
          });
        }
      }
    } else if (astraId === 'VARUNASTRA') {
      this.astraVfx?.spawnWaterWave(hitX, gY, hitZ, cfg.radius, profile.particleScale, profile.tier);
      soundEngine.playAstraImpact('VARUNASTRA');
      this.cameraShakeAmount = Math.max(this.cameraShakeAmount, cfg.cameraShake);
      this.astraQuest?.onWaterWaveImpact(hitX, hitZ, cfg.radius);
      const rSq = cfg.radius * cfg.radius;
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (!e.alive) continue;
        const dx = e.x - hitX;
        const dz = e.z - hitZ;
        const dSq = dx * dx + dz * dz;
        if (dSq <= rSq) {
          e.burnTimer = 0;
          e.burnDps = 0;
          const dist = Math.max(0.4, Math.sqrt(dSq));
          const push = cfg.knockbackForce * 0.42 * (1 - dist / (cfg.radius + 1));
          const res = this.moveSweptWithStaticCCD(
            e.x,
            e.z,
            e.x + (dx / dist) * push,
            e.z + (dz / dist) * push,
            e.isCommander ? 0.92 : 0.68,
            e.y,
            true
          );
          e.x = res.x;
          e.z = res.z;
          const isDirect = hitEnemy === e;
          const dmg = Math.round((isDirect ? cfg.damage : cfg.splashDamage) * dmgMult);
          const killed = this.damageEnemy(e, dmg, 'VARUNASTRA');
          optimisticOut.push({
            enemyId: e.id,
            damage: dmg,
            karmaAwarded: 0,
            wasKilledByShot: killed,
          });
        }
      }
    } else if (astraId === 'VAYAVYASTRA') {
      this.astraVfx?.spawnTornado(
        hitX,
        gY,
        hitZ,
        cfg.radius,
        cfg.liftHeight,
        cfg.dotDamagePerSec,
        cfg.effectDurationSec,
        profile.particleScale,
        p.clientShotId
      );
      soundEngine.playAstraImpact('VAYAVYASTRA');
      this.cameraShakeAmount = Math.max(this.cameraShakeAmount, cfg.cameraShake);
      if (hitEnemy) {
        const dmg = Math.round(cfg.damage * dmgMult);
        const killed = this.damageEnemy(hitEnemy, dmg, 'VAYAVYASTRA');
        optimisticOut.push({
          enemyId: hitEnemy.id,
          damage: dmg,
          karmaAwarded: 0,
          wasKilledByShot: killed,
        });
      }
    } else if (astraId === 'NAGASTRA') {
      soundEngine.playAstraImpact('NAGASTRA');
      this.cameraShakeAmount = Math.max(this.cameraShakeAmount, cfg.cameraShake);
      if (hitEnemy) {
        const dmg = Math.round(cfg.damage * dmgMult);
        const killed = this.damageEnemy(hitEnemy, dmg, 'NAGASTRA');
        optimisticOut.push({
          enemyId: hitEnemy.id,
          damage: dmg,
          karmaAwarded: 0,
          wasKilledByShot: killed,
        });
        hitEnemy.bindTimer = Math.max(hitEnemy.bindTimer, cfg.effectDurationSec);
        this.astraVfx?.spawnNagaBind(hitEnemy.id, hitEnemy.x, hitEnemy.y, hitEnemy.z, cfg.effectDurationSec);
      }
      this.spawnSplitSerpents(
        hitX,
        hitY,
        hitZ,
        hitEnemy ? hitEnemy.id : null,
        p.clientShotId
      );
      this.spawnBlast(hitX, hitY, hitZ, cfg.primaryHex);
    } else if (astraId === 'BRAHMASTRA') {
      this.astraVfx?.spawnBrahmastraBeamAndCrater(
        this.playerX,
        this.playerY + 1.65,
        this.playerZ,
        hitX,
        hitY,
        hitZ,
        cfg.craterRadius,
        cfg.craterDepth,
        cfg.craterDurationSec,
        profile.particleScale,
        profile.tier
      );
      soundEngine.playAstraImpact('BRAHMASTRA');
      this.cameraShakeAmount = Math.max(this.cameraShakeAmount, cfg.cameraShake);
      this.brahmaFlashAlpha = Math.max(this.brahmaFlashAlpha, 0.85);
      const rSq = cfg.radius * cfg.radius;
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (!e.alive) continue;
        const dx = e.x - hitX;
        const dz = e.z - hitZ;
        const dSq = dx * dx + dz * dz;
        if (dSq <= rSq) {
          const dist = Math.max(0.4, Math.sqrt(dSq));
          const push = cfg.knockbackForce * 0.48 * (1 - dist / (cfg.radius + 2));
          const res = this.moveSweptWithStaticCCD(
            e.x,
            e.z,
            e.x + (dx / dist) * push,
            e.z + (dz / dist) * push,
            e.isCommander ? 0.92 : 0.68,
            e.y,
            true
          );
          e.x = res.x;
          e.z = res.z;
          const isDirect = hitEnemy === e;
          const dmg = Math.round((isDirect ? cfg.damage : cfg.splashDamage) * dmgMult);
          const killed = this.damageEnemy(e, dmg, 'BRAHMASTRA');
          optimisticOut.push({
            enemyId: e.id,
            damage: dmg,
            karmaAwarded: 0,
            wasKilledByShot: killed,
          });
        }
      }
    }
  }

  private spawnBlast(x: number, y: number, z: number, colorHex: number): void {
    const mesh = this.poolManager.acquire<THREE.Mesh>('blast');
    const mat = mesh.material as THREE.MeshPhysicalMaterial;
    mat.color.setHex(colorHex);
    mat.emissive.setHex(colorHex);
    mat.opacity = 0.75;
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(0.5);
    this.blasts.push({ mesh, life: 0.36, maxLife: 0.36 });

    // Dynamic fire-flash illumination on blast impact (skip if far from camera)
    const bDx = x - this.camera.position.x;
    const bDz = z - this.camera.position.z;
    if (bDx * bDx + bDz * bDz <= 14400) {
      this.combatLight.color.setHex(colorHex);
      this.combatLight.position.set(x, y + 1.4, z);
      this.combatLight.intensity = 10;
    }
  }

  private startEnemyAshDissolution(enemy: EnemyEntity): void {
    enemy.dissolving = true;
    enemy.dissolveDuration = 2.0;
    enemy.dissolveTimer = 2.0;
    enemy.dissolveSparkAccum = 0;
    enemy.abilityState = 'IDLE';
    enemy.hitReactTimer = 0;
    const uniforms = enemy.rig.root.userData._dissolveUniforms as
      | EnemyDissolveUniforms
      | undefined;
    if (uniforms) {
      uniforms.uDissolve.value = 0.01;
      uniforms.uHeatGlow.value = 1.0;
    }
    this.astraVfx?.spawnAshIncinerationBurst(
      enemy.x,
      enemy.y,
      enemy.z,
      enemy.customScale * (enemy.isCommander ? 1.35 : 1.0),
      this.qualityManager.getProfile().particleScale
    );
  }

  private damageEnemy(
    enemy: EnemyEntity,
    amount: number,
    source: AstraId | 'STANDARD' | 'CHAKRA' = 'STANDARD'
  ): boolean {
    if (!enemy.alive || amount <= 0) return false;
    enemy.lastDamageSource = source;

    // On LAN Clients, forward damage claims to Host authoritatively while showing hit reaction
    if (this.lanClient?.isClientInMatch()) {
      enemy.pendingClaimDmg = (enemy.pendingClaimDmg ?? 0) + amount;
      if (enemy.pendingClaimDmg >= 4 || enemy.hp - amount <= 0) {
        const claimAmt = enemy.pendingClaimDmg;
        enemy.pendingClaimDmg = 0;
        this.lanClient.sendEnemyDamageClaim(
          enemy.id,
          claimAmt,
          source,
          `lan_${Date.now()}`
        );
      }
      enemy.hp = Math.max(1, enemy.hp - amount);
      enemy.hitReactTimer = 0.24;
      enemy.hitReactPitch = -0.3;
      soundEngine.playHit();
      return false;
    }

    enemy.hp -= amount;
    this.astraQuest?.onPlayerDamagedEnemy(enemy.id, amount);
    soundEngine.playHit();
    if (enemy.hp > 0) {
      enemy.hitReactTimer = 0.28;
      enemy.hitReactPitch = -0.34;
      enemy.hitReactYaw = (Math.random() < 0.5 ? -1 : 1) * (0.28 + Math.random() * 0.2);
      return false;
    }
    if (enemy.hp <= 0) {
      enemy.alive = false;
      if (source === 'AGNEYASTRA') {
        this.startEnemyAshDissolution(enemy);
      } else {
        enemy.rig.root.scale.setScalar(1);
        this.poolManager.release(
          this.demonPoolKey(enemy.variant, enemy.isCommander),
          enemy.rig
        );
      }
      this.karma += enemy.isCommander ? 150 : 35;
      this.prana = Math.min(this.maxPrana, this.prana + 14);

      if (this.wantedLevel < 5 && Math.random() < 0.45) {
        this.wantedLevel = Math.min(5, this.wantedLevel + 1);
      }

      const activeMission = MISSIONS[this.missionIdx];
      if (
        activeMission &&
        (enemy.missionTag === activeMission.id ||
          Math.hypot(
            enemy.x - activeMission.waypoint.x,
            enemy.z - activeMission.waypoint.z
          ) < 35)
      ) {
        this.missionProgress++;
        if (this.missionProgress >= activeMission.targetCount) {
          this.karma += activeMission.rewardKarma;
          this.completedMissions++;
          if (!this.astraQuest?.noHealActive) {
            this.hp = Math.min(this.maxHp, this.hp + 25);
          }
          soundEngine.playMissionChime();

          if (this.missionIdx + 1 < MISSIONS.length) {
            this.missionIdx++;
            this.missionProgress = 0;
            this.spawnMissionSquad();
          } else {
            this.setMode('VICTORY');
          }
        }
      }
      return true;
    }
    return false;
  }

  private reconcileServerImpact(
    res: ProjectileImpactValidationResponse,
    optimistic: OptimisticDamageRecord[]
  ): void {
    if (!res.accepted) {
      // Server rejected trajectory/impact claim — roll back unconfirmed optimistic HP/karma & interrupted kills
      for (let i = 0; i < optimistic.length; i++) {
        const rec = optimistic[i];
        this.karma = Math.max(0, this.karma - rec.karmaAwarded);
        for (let ei = 0; ei < this.enemies.length; ei++) {
          const e = this.enemies[ei];
          if (e.id !== rec.enemyId) continue;
          if (!e.alive && rec.wasKilledByShot && e.dissolving) {
            e.alive = true;
            e.dissolving = false;
            e.dissolveTimer = 0;
            e.hp = Math.min(e.maxHp, rec.damage);
            const u = e.rig.root.userData._dissolveUniforms as
              | EnemyDissolveUniforms
              | undefined;
            if (u) {
              u.uDissolve.value = 0;
              u.uHeatGlow.value = 0;
            }
          } else if (e.alive) {
            e.hp = Math.min(e.maxHp, e.hp + rec.damage);
          }
          break;
        }
      }
      return;
    }

    // Apply any positive server-authorized hit missed or under-applied locally
    for (let i = 0; i < res.authorizedHits.length; i++) {
      const auth = res.authorizedHits[i];
      let localApplied = 0;
      for (let oi = 0; oi < optimistic.length; oi++) {
        if (optimistic[oi].enemyId === auth.enemyId) {
          localApplied += optimistic[oi].damage;
        }
      }
      const delta = auth.damage - localApplied;
      if (delta > 1) {
        for (let ei = 0; ei < this.enemies.length; ei++) {
          const e = this.enemies[ei];
          if (e.id === auth.enemyId && e.alive) {
            const src: AstraId | 'STANDARD' | 'CHAKRA' =
              res.archetype === 'CHAKRA'
                ? 'CHAKRA'
                : res.archetype === 'ARROW'
                ? 'STANDARD'
                : res.archetype === 'NAGASTRA_SERPENT'
                ? 'NAGASTRA'
                : res.archetype;
            this.damageEnemy(e, delta, src);
            break;
          }
        }
      }
    }
  }

  private reconcileZoneTick(
    res: HazardZoneTickResponse,
    optimisticByEnemy: Map<string, number>
  ): void {
    if (!res.accepted) {
      for (const [enemyId, dmg] of optimisticByEnemy.entries()) {
        for (let ei = 0; ei < this.enemies.length; ei++) {
          const e = this.enemies[ei];
          if (e.id === enemyId && e.alive) {
            e.hp = Math.min(e.maxHp, e.hp + dmg);
            break;
          }
        }
      }
      return;
    }

    const src: AstraId = res.zoneKind === 'AGNI_MANDALA' ? 'AGNEYASTRA' : 'VAYAVYASTRA';
    for (let i = 0; i < res.authorizedTicks.length; i++) {
      const auth = res.authorizedTicks[i];
      const localDmg = optimisticByEnemy.get(auth.enemyId) ?? 0;
      const delta = auth.damage - localDmg;
      if (delta > 1.5) {
        for (let ei = 0; ei < this.enemies.length; ei++) {
          const e = this.enemies[ei];
          if (e.id === auth.enemyId && e.alive) {
            this.damageEnemy(e, delta, src);
            break;
          }
        }
      }
    }
  }

  private updateDynamicHeroLighting(viewYaw: number): void {
    // Position cool grazing backlight behind Lord Ram relative to camera yaw
    const backYaw = viewYaw + Math.PI + 0.42;
    this.rimLight.position.set(
      this.playerX + Math.sin(backYaw) * 24,
      this.playerY + 12,
      this.playerZ + Math.cos(backYaw) * 24
    );
    this.rimLight.target.position.set(
      this.playerX,
      this.playerY + 1.25,
      this.playerZ
    );

    // Dynamic warm bounce/lamp illumination responding to nearest Deepastambha flame
    let nearestLampDistSq = 999 * 999;
    for (let i = 0; i < this.lampCoords.length; i++) {
      const [lx, lz] = this.lampCoords[i];
      const dx = lx - this.playerX;
      const dz = lz - this.playerZ;
      const dSq = dx * dx + dz * dz;
      if (dSq < nearestLampDistSq) nearestLampDistSq = dSq;
    }
    const nearestLampDist = Math.sqrt(nearestLampDistSq);
    const lampProximity = Math.max(0, 1 - nearestLampDist / 16);
    this.heroFillLight.position.set(
      this.playerX + Math.sin(viewYaw + 0.6) * 2.2,
      this.playerY + 1.35,
      this.playerZ + Math.cos(viewYaw + 0.6) * 2.2
    );
    this.heroFillLight.intensity = (0.55 + lampProximity * 1.35) * this.daylightFactor;
  }

  private updateHairAndCapePhysics(dt: number, elapsed: number): void {
    const strands = this.ramRig.hairStrands;
    const clampedDt = Math.min(0.033, dt);
    const speedFactor = THREE.MathUtils.clamp(this.playerHorizSpeed / 14.5, 0, 1.35);
    const jumpLift = THREE.MathUtils.clamp(-this.playerVelY * 0.04, -0.18, 0.35);

    if (strands) {
      for (let i = 0; i < strands.length; i++) {
        const s = strands[i];
        const breeze = Math.sin(elapsed * 2.5 + s.windPhase) * 0.045;
        const microFlutter = Math.cos(elapsed * 4.7 + s.windPhase * 1.4) * 0.025 * (0.4 + speedFactor);

        // Target backward trail from running/chariot velocity + vertical bounce + turning whip
        const targetPitch =
          s.restPitch + speedFactor * 0.52 + jumpLift + breeze + microFlutter;
        const targetRoll =
          s.restRoll +
          THREE.MathUtils.clamp(-this.playerTurnRate * 0.075, -0.34, 0.34) +
          Math.sin(elapsed * 1.9 + s.windPhase) * 0.035;

        // Second-order damped spring physics
        const accPitch =
          -s.stiffness * (s.pitchAngle - targetPitch) - s.damping * s.pitchVel;
        const accRoll =
          -s.stiffness * (s.rollAngle - targetRoll) - s.damping * s.rollVel;

        s.pitchVel += accPitch * clampedDt;
        s.pitchAngle += s.pitchVel * clampedDt;
        s.rollVel += accRoll * clampedDt;
        s.rollAngle += s.rollVel * clampedDt;

        // Prevent hair from clipping forward into back/shoulders
        s.pitchAngle = THREE.MathUtils.clamp(s.pitchAngle, 0.08, 1.25);

        const segs = s.segments;
        for (let k = 0; k < segs.length; k++) {
          const frac = k === 0 ? 0.42 : 0.24;
          const waveLag =
            Math.sin(elapsed * (3.6 + speedFactor * 4.5) - k * 0.9 + s.windPhase) *
            (0.025 + speedFactor * 0.055);
          segs[k].rotation.x =
            (k === 0 ? s.pitchAngle * 0.65 : s.pitchAngle * frac) + waveLag;
          segs[k].rotation.z =
            k === 0 ? s.rollAngle : (s.rollAngle - s.restRoll) * 0.35;
        }
      }
    }

    if (this.ramRig.capePivot) {
      if (this.mountedChariotIndex !== null) {
        this.ramRig.capePivot.position.set(-0.118, 0.605, -0.042);
        this.ramRig.capePivot.scale.set(1, 0.48, 1);
        this.ramRig.capePivot.rotation.x = THREE.MathUtils.damp(
          this.ramRig.capePivot.rotation.x,
          0.02 + Math.sin(elapsed * 3.1) * 0.015,
          10,
          clampedDt
        );
        this.ramRig.capePivot.rotation.z = THREE.MathUtils.damp(
          this.ramRig.capePivot.rotation.z,
          0,
          10,
          clampedDt
        );
      } else {
        this.ramRig.capePivot.position.set(-0.118, 0.605, -0.096);
        this.ramRig.capePivot.scale.set(1, 1, 1);
        const targetCapeX =
          0.04 + speedFactor * 0.48 + Math.sin(elapsed * 2.8) * 0.035 + Math.max(0, jumpLift * 0.7);
        const targetCapeZ =
          THREE.MathUtils.clamp(-this.playerTurnRate * 0.05, -0.22, 0.22);
        this.ramRig.capePivot.rotation.x = THREE.MathUtils.damp(
          this.ramRig.capePivot.rotation.x,
          targetCapeX,
          8.5,
          clampedDt
        );
        this.ramRig.capePivot.rotation.z = THREE.MathUtils.damp(
          this.ramRig.capePivot.rotation.z,
          targetCapeZ,
          8.5,
          clampedDt
        );
      }
    }

    if (this.ramRig.tailSegments && this.ramRig.tailSegments.length > 0) {
      const segs = this.ramRig.tailSegments;
      const tailWaveFreq = this.isFlying ? 6.2 : 2.6 + speedFactor * 3.8;
      for (let i = 0; i < segs.length; i++) {
        const restPitch =
          i < HANUMAN_TAIL_REST_PITCHES.length ? HANUMAN_TAIL_REST_PITCHES[i] : 0.3;
        const basePitch = i === 0 ? restPitch - speedFactor * 0.24 : restPitch;
        segs[i].rotation.x =
          basePitch + Math.sin(elapsed * tailWaveFreq - i * 0.55) * (0.06 + speedFactor * 0.08);
        segs[i].rotation.z = Math.cos(elapsed * (tailWaveFreq * 0.7) - i * 0.6) * 0.12;
      }
    }

    if (this.ramRig.heroAuraMesh) {
      this.ramRig.heroAuraMesh.rotation.z = elapsed * 0.55;
      const pulse = 1 + Math.sin(elapsed * 3.2) * 0.04;
      this.ramRig.heroAuraMesh.scale.setScalar(pulse);
    }
  }

  private setStealthMode(enabled: boolean): void {
    const applyObj = (root: THREE.Object3D, shadowMesh: THREE.Mesh | undefined, active: boolean) => {
      let cachedMats = this.stealthRootMatsCache.get(root);
      if (!cachedMats) {
        cachedMats = [];
        root.traverse((obj) => {
          if (shadowMesh && obj === shadowMesh) return;
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh || !mesh.material) return;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (let i = 0; i < mats.length; i++) {
            const mat = mats[i];
            if (!cachedMats!.includes(mat)) {
              cachedMats!.push(mat);
            }
          }
        });
        this.stealthRootMatsCache.set(root, cachedMats);
      }

      for (let i = 0; i < cachedMats.length; i++) {
        const mat = cachedMats[i];
        if (!this.stealthMaterialCache.has(mat)) {
          const mAny = mat as THREE.MeshStandardMaterial;
          this.stealthMaterialCache.set(mat, {
            opacity: mat.opacity,
            transparent: mat.transparent,
            depthWrite: mat.depthWrite,
            emissiveHex: mAny.emissive ? mAny.emissive.getHex() : 0,
            emissiveIntensity:
              typeof mAny.emissiveIntensity === 'number' ? mAny.emissiveIntensity : 0,
          });
        }
        const orig = this.stealthMaterialCache.get(mat)!;
        const mAny = mat as THREE.MeshStandardMaterial;
        if (active) {
          mat.transparent = true;
          mat.opacity = 0.48;
          mat.depthWrite = false;
          if (mAny.emissive) {
            mAny.emissive.setHex(0x4f78ff);
            mAny.emissiveIntensity = 0.34;
          }
        } else {
          mat.transparent = orig.transparent;
          mat.opacity = orig.opacity;
          mat.depthWrite = orig.depthWrite;
          if (mAny.emissive) {
            mAny.emissive.setHex(orig.emissiveHex);
            mAny.emissiveIntensity = orig.emissiveIntensity;
          }
        }
        mat.needsUpdate = true;
      }
    };

    this.stealthActive = enabled;
    if (!enabled) {
      this.stealthSpotted = false;
    }

    // Clear chariots & animals first, then apply to active mount & Lord Ram
    for (let i = 0; i < this.chariots.length; i++) {
      applyObj(this.chariots[i].rig.root, this.chariots[i].rig.contactShadow, false);
    }
    for (let i = 0; i < this.animals.length; i++) {
      const a = this.animals[i];
      applyObj(a.horseRig ? a.horseRig.group : a.elephantRig!.group, undefined, false);
    }
    if (enabled && this.mountedChariotIndex !== null) {
      const ch = this.chariots[this.mountedChariotIndex];
      applyObj(ch.rig.root, ch.rig.contactShadow, true);
    }
    if (enabled && this.mountedAnimalIndex !== null) {
      const an = this.animals[this.mountedAnimalIndex];
      applyObj(an.horseRig ? an.horseRig.group : an.elephantRig!.group, undefined, true);
    }
    applyObj(this.ramRig.root, this.ramRig.contactShadow, enabled);
  }

  private applyChariotSittingPose(
    rig: CharacterRig,
    steerRate: number,
    isAiming: boolean,
    elapsed: number,
    dt = 0.016,
    poseState: CharacterPoseState = this.ramPose
  ): void {
    const breath = Math.sin(elapsed * 2.2) * 0.01;
    const steerShift = THREE.MathUtils.clamp(steerRate * 0.16, -0.22, 0.22);
    const tLeftArm = isAiming ? -1.16 : -0.76 - steerShift;
    const tRightArm = isAiming ? -0.68 : -0.76 + steerShift;
    const tLeftArmZ = isAiming ? 0 : 0.09;
    const tRightArmZ = isAiming ? 0 : -0.09;
    const tLeftElbow = isAiming ? -0.32 : -0.72;
    const tRightElbow = isAiming ? -1.24 : -0.72;
    const tTorsoY = THREE.MathUtils.clamp(-steerRate * 0.14, -0.18, 0.18);

    const p = poseState;
    const lam = 16;
    p.hipY = THREE.MathUtils.damp(p.hipY, 0.94, lam, dt);
    p.leftHip = THREE.MathUtils.damp(p.leftHip, -1.46, lam, dt);
    p.rightHip = THREE.MathUtils.damp(p.rightHip, -1.46, lam, dt);
    p.leftLegZ = THREE.MathUtils.damp(p.leftLegZ, 0, lam, dt);
    p.rightLegZ = THREE.MathUtils.damp(p.rightLegZ, 0, lam, dt);
    p.leftKnee = THREE.MathUtils.damp(p.leftKnee, 1.38, lam, dt);
    p.rightKnee = THREE.MathUtils.damp(p.rightKnee, 1.38, lam, dt);
    p.leftAnkle = THREE.MathUtils.damp(p.leftAnkle, 0.08, lam, dt);
    p.rightAnkle = THREE.MathUtils.damp(p.rightAnkle, 0.08, lam, dt);
    p.pleatRotX = THREE.MathUtils.damp(p.pleatRotX, -1.35, lam, dt);
    p.torsoRotX = THREE.MathUtils.damp(p.torsoRotX, -0.04 + breath, lam, dt);
    p.torsoRotY = THREE.MathUtils.damp(p.torsoRotY, tTorsoY, lam, dt);
    p.torsoRotZ = THREE.MathUtils.damp(p.torsoRotZ, 0, lam, dt);
    p.leftArm = THREE.MathUtils.damp(p.leftArm, tLeftArm, lam, dt);
    p.rightArm = THREE.MathUtils.damp(p.rightArm, tRightArm, lam, dt);
    p.leftArmZ = THREE.MathUtils.damp(p.leftArmZ, tLeftArmZ, lam, dt);
    p.rightArmZ = THREE.MathUtils.damp(p.rightArmZ, tRightArmZ, lam, dt);
    p.leftElbow = THREE.MathUtils.damp(p.leftElbow, tLeftElbow, lam, dt);
    p.rightElbow = THREE.MathUtils.damp(p.rightElbow, tRightElbow, lam, dt);

    rig.torso.position.y = p.hipY;
    rig.leftLeg.position.y = p.hipY;
    rig.rightLeg.position.y = p.hipY;
    rig.leftLeg.rotation.set(p.leftHip, 0, p.leftLegZ);
    rig.rightLeg.rotation.set(p.rightHip, 0, p.rightLegZ);
    rig.leftKnee.rotation.x = p.leftKnee;
    rig.rightKnee.rotation.x = p.rightKnee;
    rig.leftAnkle.rotation.x = p.leftAnkle;
    rig.rightAnkle.rotation.x = p.rightAnkle;

    if (rig.centerPleat) {
      rig.centerPleat.rotation.x = p.pleatRotX;
      rig.centerPleat.scale.set(1.06, 0.88, 0.34);
    }
    if (rig.capePivot) {
      rig.capePivot.position.set(-0.118, 0.605, -0.042);
      rig.capePivot.scale.set(1, 0.48, 1);
      rig.capePivot.rotation.x = 0.02;
    }

    rig.torso.rotation.set(p.torsoRotX, p.torsoRotY, p.torsoRotZ);
    rig.leftArm.rotation.set(p.leftArm, 0, p.leftArmZ);
    rig.rightArm.rotation.set(p.rightArm, 0, p.rightArmZ);
    rig.leftElbow.rotation.x = p.leftElbow;
    rig.rightElbow.rotation.x = p.rightElbow;
  }

  private applyChariotPassengerPose(
    rig: CharacterRig,
    isAiming: boolean,
    elapsed: number,
    dt = 0.016,
    poseState: CharacterPoseState = this.ramPose
  ): void {
    const p = poseState;
    const lam = 16;
    const sway = Math.sin(elapsed * 2.3) * 0.014;
    p.hipY = THREE.MathUtils.damp(p.hipY, 0.93, lam, dt);
    p.leftHip = THREE.MathUtils.damp(p.leftHip, -0.12, lam, dt);
    p.rightHip = THREE.MathUtils.damp(p.rightHip, 0.1, lam, dt);
    p.leftLegZ = THREE.MathUtils.damp(p.leftLegZ, -0.08, lam, dt);
    p.rightLegZ = THREE.MathUtils.damp(p.rightLegZ, 0.08, lam, dt);
    p.leftKnee = THREE.MathUtils.damp(p.leftKnee, 0.18, lam, dt);
    p.rightKnee = THREE.MathUtils.damp(p.rightKnee, 0.14, lam, dt);
    p.leftAnkle = THREE.MathUtils.damp(p.leftAnkle, -0.06, lam, dt);
    p.rightAnkle = THREE.MathUtils.damp(p.rightAnkle, -0.06, lam, dt);
    p.pleatRotX = THREE.MathUtils.damp(p.pleatRotX, -0.08, lam, dt);
    p.torsoRotX = THREE.MathUtils.damp(p.torsoRotX, 0.04 + sway, lam, dt);
    p.torsoRotY = THREE.MathUtils.damp(p.torsoRotY, isAiming ? 0.12 : 0, lam, dt);
    p.torsoRotZ = THREE.MathUtils.damp(p.torsoRotZ, 0, lam, dt);
    p.leftArm = THREE.MathUtils.damp(p.leftArm, isAiming ? -1.24 : -0.34, lam, dt);
    p.rightArm = THREE.MathUtils.damp(p.rightArm, isAiming ? -0.68 : -0.58, lam, dt);
    p.leftArmZ = THREE.MathUtils.damp(p.leftArmZ, isAiming ? 0.04 : 0.1, lam, dt);
    p.rightArmZ = THREE.MathUtils.damp(p.rightArmZ, isAiming ? -0.04 : -0.1, lam, dt);
    p.leftElbow = THREE.MathUtils.damp(p.leftElbow, isAiming ? -0.28 : -0.32, lam, dt);
    p.rightElbow = THREE.MathUtils.damp(p.rightElbow, isAiming ? -1.28 : -0.68, lam, dt);

    rig.torso.position.y = p.hipY;
    rig.leftLeg.position.y = p.hipY;
    rig.rightLeg.position.y = p.hipY;
    rig.leftLeg.rotation.set(p.leftHip, 0, p.leftLegZ);
    rig.rightLeg.rotation.set(p.rightHip, 0, p.rightLegZ);
    rig.leftKnee.rotation.x = p.leftKnee;
    rig.rightKnee.rotation.x = p.rightKnee;
    rig.leftAnkle.rotation.x = p.leftAnkle;
    rig.rightAnkle.rotation.x = p.rightAnkle;

    if (rig.centerPleat) {
      rig.centerPleat.rotation.x = p.pleatRotX;
      rig.centerPleat.scale.set(1.0, 1.0, 1.0);
    }
    if (rig.capePivot) {
      rig.capePivot.position.set(-0.118, 0.605, -0.052);
      rig.capePivot.scale.set(1, 1, 1);
      rig.capePivot.rotation.x = 0.08 + Math.sin(elapsed * 2.8) * 0.03;
    }

    rig.torso.rotation.set(p.torsoRotX, p.torsoRotY, p.torsoRotZ);
    rig.leftArm.rotation.set(p.leftArm, 0, p.leftArmZ);
    rig.rightArm.rotation.set(p.rightArm, 0, p.rightArmZ);
    rig.leftElbow.rotation.x = p.leftElbow;
    rig.rightElbow.rotation.x = p.rightElbow;
  }

  private applyThroneSittingPose(
    rig: CharacterRig,
    isAiming: boolean,
    elapsed: number,
    dt = 0.016
  ): void {
    const p = this.ramPose;
    const lam = 15;
    p.hipY = THREE.MathUtils.damp(p.hipY, 0.88, lam, dt);
    p.leftHip = THREE.MathUtils.damp(p.leftHip, -1.42, lam, dt);
    p.rightHip = THREE.MathUtils.damp(p.rightHip, -1.42, lam, dt);
    p.leftLegZ = THREE.MathUtils.damp(p.leftLegZ, 0.06, lam, dt);
    p.rightLegZ = THREE.MathUtils.damp(p.rightLegZ, -0.06, lam, dt);
    p.leftKnee = THREE.MathUtils.damp(p.leftKnee, 1.44, lam, dt);
    p.rightKnee = THREE.MathUtils.damp(p.rightKnee, 1.44, lam, dt);
    p.leftAnkle = THREE.MathUtils.damp(p.leftAnkle, 0.04, lam, dt);
    p.rightAnkle = THREE.MathUtils.damp(p.rightAnkle, 0.04, lam, dt);
    p.pleatRotX = THREE.MathUtils.damp(p.pleatRotX, -1.35, lam, dt);
    p.torsoRotX = THREE.MathUtils.damp(p.torsoRotX, -0.02 + Math.sin(elapsed * 1.8) * 0.008, lam, dt);
    p.torsoRotY = THREE.MathUtils.damp(p.torsoRotY, 0, lam, dt);
    p.torsoRotZ = THREE.MathUtils.damp(p.torsoRotZ, 0, lam, dt);
    p.leftArm = THREE.MathUtils.damp(p.leftArm, isAiming ? -1.16 : -0.58, lam, dt);
    p.rightArm = THREE.MathUtils.damp(p.rightArm, isAiming ? -0.68 : -0.58, lam, dt);
    p.leftArmZ = THREE.MathUtils.damp(p.leftArmZ, 0, lam, dt);
    p.rightArmZ = THREE.MathUtils.damp(p.rightArmZ, 0, lam, dt);
    p.leftElbow = THREE.MathUtils.damp(p.leftElbow, isAiming ? -0.32 : -0.82, lam, dt);
    p.rightElbow = THREE.MathUtils.damp(p.rightElbow, isAiming ? -1.24 : -0.82, lam, dt);

    rig.torso.position.y = p.hipY;
    rig.leftLeg.position.y = p.hipY;
    rig.rightLeg.position.y = p.hipY;
    rig.leftLeg.rotation.set(p.leftHip, 0, p.leftLegZ);
    rig.rightLeg.rotation.set(p.rightHip, 0, p.rightLegZ);
    rig.leftKnee.rotation.x = p.leftKnee;
    rig.rightKnee.rotation.x = p.rightKnee;
    rig.leftAnkle.rotation.x = p.leftAnkle;
    rig.rightAnkle.rotation.x = p.rightAnkle;

    if (rig.centerPleat) {
      rig.centerPleat.rotation.x = p.pleatRotX;
      rig.centerPleat.scale.set(1.06, 0.88, 0.34);
    }
    if (rig.capePivot) {
      rig.capePivot.position.set(-0.118, 0.605, -0.042);
      rig.capePivot.scale.set(1, 0.48, 1);
      rig.capePivot.rotation.x = 0.02;
    }

    rig.torso.rotation.set(p.torsoRotX, p.torsoRotY, p.torsoRotZ);
    rig.leftArm.rotation.set(p.leftArm, 0, p.leftArmZ);
    rig.rightArm.rotation.set(p.rightArm, 0, p.rightArmZ);
    rig.leftElbow.rotation.x = p.leftElbow;
    rig.rightElbow.rotation.x = p.rightElbow;
  }

  private applyAnimalRidingPose(
    rig: CharacterRig,
    kind: 'HORSE' | 'ELEPHANT',
    gaitCycle: number,
    speedNorm: number,
    isAiming: boolean,
    elapsed: number,
    dt = 0.016,
    poseState: CharacterPoseState = this.ramPose
  ): void {
    const bounce = Math.abs(Math.sin(gaitCycle)) * 0.024 * speedNorm;
    const tHipY = 0.9 + bounce;
    const isEle = kind === 'ELEPHANT';
    const tHipX = isEle ? -1.38 : -0.88;
    const tLeftLegZ = isEle ? -0.18 : -0.5;
    const tRightLegZ = isEle ? 0.18 : 0.5;
    const tKnee = isEle ? 1.38 : 1.08;
    const tAnkle = isEle ? 0.02 : -0.14;
    const bob = !isEle ? Math.sin(gaitCycle) * 0.04 * speedNorm : 0;
    const tLeftArm = isAiming ? -1.16 : isEle ? -0.68 : -0.64 + bob;
    const tRightArm = isAiming ? -0.68 : isEle ? -0.68 : -0.64 + bob;
    const tLeftArmZ = isAiming ? 0 : isEle ? 0.04 : 0.11;
    const tRightArmZ = isAiming ? 0 : isEle ? -0.04 : -0.11;
    const tLeftElbow = isAiming ? -0.32 : isEle ? -0.72 : -0.82;
    const tRightElbow = isAiming ? -1.24 : isEle ? -0.72 : -0.82;

    const p = poseState;
    const lam = 16;
    p.hipY = THREE.MathUtils.damp(p.hipY, tHipY, lam, dt);
    p.leftHip = THREE.MathUtils.damp(p.leftHip, tHipX, lam, dt);
    p.rightHip = THREE.MathUtils.damp(p.rightHip, tHipX, lam, dt);
    p.leftLegZ = THREE.MathUtils.damp(p.leftLegZ, tLeftLegZ, lam, dt);
    p.rightLegZ = THREE.MathUtils.damp(p.rightLegZ, tRightLegZ, lam, dt);
    p.leftKnee = THREE.MathUtils.damp(p.leftKnee, tKnee, lam, dt);
    p.rightKnee = THREE.MathUtils.damp(p.rightKnee, tKnee, lam, dt);
    p.leftAnkle = THREE.MathUtils.damp(p.leftAnkle, tAnkle, lam, dt);
    p.rightAnkle = THREE.MathUtils.damp(p.rightAnkle, tAnkle, lam, dt);
    p.pleatRotX = THREE.MathUtils.damp(p.pleatRotX, -1.25, lam, dt);
    p.torsoRotX = THREE.MathUtils.damp(p.torsoRotX, 0.06 * speedNorm + Math.sin(elapsed * 2.4) * 0.01, lam, dt);
    p.torsoRotY = THREE.MathUtils.damp(p.torsoRotY, 0, lam, dt);
    p.torsoRotZ = THREE.MathUtils.damp(p.torsoRotZ, 0, lam, dt);
    p.leftArm = THREE.MathUtils.damp(p.leftArm, tLeftArm, lam, dt);
    p.rightArm = THREE.MathUtils.damp(p.rightArm, tRightArm, lam, dt);
    p.leftArmZ = THREE.MathUtils.damp(p.leftArmZ, tLeftArmZ, lam, dt);
    p.rightArmZ = THREE.MathUtils.damp(p.rightArmZ, tRightArmZ, lam, dt);
    p.leftElbow = THREE.MathUtils.damp(p.leftElbow, tLeftElbow, lam, dt);
    p.rightElbow = THREE.MathUtils.damp(p.rightElbow, tRightElbow, lam, dt);

    rig.torso.position.y = p.hipY;
    rig.leftLeg.position.y = p.hipY;
    rig.rightLeg.position.y = p.hipY;
    rig.leftLeg.rotation.set(p.leftHip, 0, p.leftLegZ);
    rig.rightLeg.rotation.set(p.rightHip, 0, p.rightLegZ);
    rig.leftKnee.rotation.x = p.leftKnee;
    rig.rightKnee.rotation.x = p.rightKnee;
    rig.leftAnkle.rotation.x = p.leftAnkle;
    rig.rightAnkle.rotation.x = p.rightAnkle;

    if (rig.centerPleat) {
      rig.centerPleat.rotation.x = p.pleatRotX;
      rig.centerPleat.scale.set(1.06, 0.85, 0.34);
    }
    if (rig.capePivot) {
      rig.capePivot.position.set(-0.118, 0.605, -0.06);
      rig.capePivot.scale.set(1, 0.65, 1);
      rig.capePivot.rotation.x = 0.08 + speedNorm * 0.28 + Math.sin(elapsed * 3.1) * 0.03;
    }

    rig.torso.rotation.set(p.torsoRotX, p.torsoRotY, p.torsoRotZ);
    rig.leftArm.rotation.set(p.leftArm, 0, p.leftArmZ);
    rig.rightArm.rotation.set(p.rightArm, 0, p.rightArmZ);
    rig.leftElbow.rotation.x = p.leftElbow;
    rig.rightElbow.rotation.x = p.rightElbow;
  }

  private animateRoyalHorseRig(
    hr: RoyalHorseRig,
    gaitPhase: number,
    speedNorm: number,
    elapsed: number,
    seed: number,
    state?: QuadrupedAnimState,
    dt = 0.016,
    entityYaw = 0
  ): void {
    const safeDt = Math.min(0.05, Math.max(0.001, dt));
    const clampedTarget = THREE.MathUtils.clamp(speedNorm, 0, 1);
    const amp = state
      ? (state.speedBlend = THREE.MathUtils.damp(state.speedBlend, clampedTarget, 8.5, safeDt))
      : clampedTarget;
    const moving = amp > 0.015;

    const tHeadX =
      0.56 +
      Math.sin(elapsed * 1.65 + seed) * 0.045 +
      (moving ? Math.sin(gaitPhase) * 0.085 * amp : 0);
    const tHeadY = moving ? Math.cos(gaitPhase * 0.5 + seed) * 0.04 * amp : 0;

    // 2nd-order physics spring-damper for articulated horse tail hair strands (gravity + gallop + wind + centrifugal yaw whip)
    let yawRate = 0;
    if (state) {
      const rawYawRate = shortestAngleDiff(state.prevYaw, entityYaw) / safeDt;
      state.prevYaw = entityYaw;
      state.yawRate = THREE.MathUtils.damp(state.yawRate, THREE.MathUtils.clamp(rawYawRate, -5.0, 5.0), 10.0, safeDt);
      yawRate = state.yawRate;
    }

    const windGust =
      Math.sin(elapsed * 2.1 + seed) * 0.055 +
      Math.cos(elapsed * 4.3 + seed * 1.3) * 0.025 * (0.4 + amp);
    const gallopImpulse = moving ? Math.cos(gaitPhase * 2.0) * 0.095 * amp : 0;
    // Negative X rotates tail backwards along -Z behind horse's rump; gravity restores towards 0
    const targetTailX = THREE.MathUtils.clamp(
      -0.06 - 0.34 * amp + gallopImpulse + windGust,
      -0.78,
      0.04
    );
    const lateralWind =
      Math.sin(elapsed * 2.5 + seed * 0.8) * (0.065 + 0.05 * amp) +
      Math.cos(elapsed * 4.9 + seed) * 0.028 * amp;
    const centrifugalWhip = THREE.MathUtils.clamp(-yawRate * 0.14 * (0.35 + amp), -0.45, 0.45);
    const targetTailZ = lateralWind + centrifugalWhip;

    let tailXAngle = targetTailX;
    let tailZAngle = targetTailZ;
    let headPitchRate = 0;

    if (state) {
      state.prevHeadX = state.headX;
      state.headX = THREE.MathUtils.damp(state.headX, tHeadX, 11, safeDt);
      state.headY = THREE.MathUtils.damp(state.headY, tHeadY, 11, safeDt);
      headPitchRate = THREE.MathUtils.clamp((state.headX - state.prevHeadX) / safeDt, -3.5, 3.5);

      // Spring-damper integration for tail (k = 68, c = 11.5)
      const accX = -68.0 * (state.tailX - targetTailX) - 11.5 * state.tailVelX;
      const accZ = -58.0 * (state.tailZ - targetTailZ) - 10.2 * state.tailVelZ;
      state.tailVelX += accX * safeDt;
      state.tailVelZ += accZ * safeDt;
      state.tailX = THREE.MathUtils.clamp(state.tailX + state.tailVelX * safeDt, -0.95, 0.08);
      state.tailZ = THREE.MathUtils.clamp(state.tailZ + state.tailVelZ * safeDt, -0.68, 0.68);
      tailXAngle = state.tailX;
      tailZAngle = state.tailZ;

      hr.headPivot.rotation.x = state.headX;
      hr.headPivot.rotation.y = state.headY;
    } else {
      hr.headPivot.rotation.x = tHeadX;
      hr.headPivot.rotation.y = tHeadY;
    }

    hr.tailGroup.rotation.x = tailXAngle;
    hr.tailGroup.rotation.z = tailZAngle;

    // Cascade traveling wind & gallop whip wave down all 5x3 articulated horse tail hair chains
    const chains = hr.tailChains;
    const chainVelImpulse = state ? state.tailVelX * 0.036 : 0;
    const chainLatVelImpulse = state ? state.tailVelZ * 0.048 : 0;
    for (let p = 0; p < chains.length; p++) {
      const spread = p - 2;
      const [seg0, seg1, seg2] = chains[p];
      const phaseSeed = seed + p * 0.65;
      const wave0 = Math.sin(elapsed * (3.2 + amp * 5.2) + phaseSeed) * (0.045 + amp * 0.085);
      const wave1 = Math.sin(elapsed * (3.2 + amp * 5.2) - 0.85 + phaseSeed) * (0.068 + amp * 0.13);
      const wave2 = Math.sin(elapsed * (3.2 + amp * 5.2) - 1.7 + phaseSeed) * (0.09 + amp * 0.175);
      const swishZ1 = Math.sin(elapsed * (2.9 + amp * 3.8) - 0.6 + phaseSeed) * (0.04 + amp * 0.08);
      const swishZ2 = Math.sin(elapsed * (2.9 + amp * 3.8) - 1.3 + phaseSeed) * (0.068 + amp * 0.12);

      seg0.rotation.x = THREE.MathUtils.clamp(
        -0.32 - Math.abs(spread) * 0.04 - amp * 0.25 + wave0 + chainVelImpulse,
        -1.18,
        0.04
      );
      seg0.rotation.z = spread * (0.075 + amp * 0.025) + tailZAngle * 0.2;

      seg1.rotation.x = THREE.MathUtils.clamp(0.14 - amp * 0.18 + wave1 - chainVelImpulse * 0.85, -0.62, 0.42);
      seg1.rotation.z = swishZ1 + chainLatVelImpulse * 0.72;

      seg2.rotation.x = THREE.MathUtils.clamp(0.12 - amp * 0.16 + wave2 - chainVelImpulse * 1.15, -0.72, 0.46);
      seg2.rotation.z = swishZ2 + chainLatVelImpulse;
    }

    // 2nd-order spring-damper for 7x2 Dorsal Mane & 2-Link Forelock (gravity drape + gallop lift + headwind + centrifugal turn whip)
    const gallopBounce = moving ? Math.sin(gaitPhase * 2.0 + 0.5) * 0.16 * amp : 0;
    const targetManeX = THREE.MathUtils.clamp(
      -0.34 - 0.48 * amp + windGust * 1.2 + gallopBounce - headPitchRate * 0.06,
      -1.08,
      -0.08
    );
    const targetManeZ = THREE.MathUtils.clamp(
      lateralWind * 0.85 + centrifugalWhip * 0.75,
      -0.52,
      0.52
    );

    const targetForelockX = THREE.MathUtils.clamp(
      -0.55 - 0.36 * amp + windGust * 1.4 + gallopBounce * 0.9 - headPitchRate * 0.11,
      -1.2,
      -0.12
    );
    const targetForelockZ = THREE.MathUtils.clamp(
      lateralWind * 0.9 + centrifugalWhip * 0.85,
      -0.48,
      0.48
    );

    let maneXAngle = targetManeX;
    let maneZAngle = targetManeZ;
    let forelockXAngle = targetForelockX;
    let forelockZAngle = targetForelockZ;
    let maneVelX = 0;
    let maneVelZ = 0;
    let forelockVelX = 0;

    if (state) {
      const mAccX = -76.0 * (state.maneX - targetManeX) - 12.2 * state.maneVelX;
      const mAccZ = -64.0 * (state.maneZ - targetManeZ) - 10.6 * state.maneVelZ;
      state.maneVelX += mAccX * safeDt;
      state.maneVelZ += mAccZ * safeDt;
      state.maneX = THREE.MathUtils.clamp(state.maneX + state.maneVelX * safeDt, -1.16, -0.05);
      state.maneZ = THREE.MathUtils.clamp(state.maneZ + state.maneVelZ * safeDt, -0.58, 0.58);
      maneXAngle = state.maneX;
      maneZAngle = state.maneZ;
      maneVelX = state.maneVelX;
      maneVelZ = state.maneVelZ;

      const fAccX = -82.0 * (state.forelockX - targetForelockX) - 11.4 * state.forelockVelX;
      const fAccZ = -70.0 * (state.forelockZ - targetForelockZ) - 10.0 * state.forelockVelZ;
      state.forelockVelX += fAccX * safeDt;
      state.forelockVelZ += fAccZ * safeDt;
      state.forelockX = THREE.MathUtils.clamp(state.forelockX + state.forelockVelX * safeDt, -1.28, -0.08);
      state.forelockZ = THREE.MathUtils.clamp(state.forelockZ + state.forelockVelZ * safeDt, -0.52, 0.52);
      forelockXAngle = state.forelockX;
      forelockZAngle = state.forelockZ;
      forelockVelX = state.forelockVelX;
    }

    const maneChains = hr.maneChains;
    const maneWaveFreq = 3.6 + amp * 5.6;
    for (let m = 0; m < maneChains.length; m++) {
      const [mRoot, mTip] = maneChains[m];
      const sideSign = m % 2 === 0 ? -1 : 1;
      const mSeed = seed + (6 - m) * 0.42;
      const rootWave = Math.sin(elapsed * maneWaveFreq + mSeed) * (0.045 + amp * 0.11);
      const tipWave = Math.sin(elapsed * maneWaveFreq - 0.95 + mSeed) * (0.075 + amp * 0.17);
      const latFlutter = Math.cos(elapsed * (3.1 + amp * 4.2) + mSeed) * (0.04 + amp * 0.085);

      mRoot.rotation.x = THREE.MathUtils.clamp(
        maneXAngle + rootWave + maneVelX * 0.025,
        -1.25,
        -0.02
      );
      mRoot.rotation.z = sideSign * (0.24 + amp * 0.08) + maneZAngle * 0.65;

      mTip.rotation.x = THREE.MathUtils.clamp(
        -0.14 - 0.24 * amp + tipWave - maneVelX * 0.04,
        -0.88,
        0.38
      );
      mTip.rotation.z = sideSign * 0.08 + latFlutter + maneVelZ * 0.045;
    }

    const [fRoot, fTip] = hr.forelockChain;
    fRoot.rotation.x = forelockXAngle;
    fRoot.rotation.z = forelockZAngle * 0.6;
    fTip.rotation.x = THREE.MathUtils.clamp(
      -0.18 - 0.22 * amp + Math.sin(elapsed * maneWaveFreq - 0.7 + seed) * (0.06 + amp * 0.14) - forelockVelX * 0.035,
      -0.85,
      0.32
    );
    fTip.rotation.z = forelockZAngle * 0.8 + Math.cos(elapsed * 3.8 + seed) * (0.035 + amp * 0.07);

    for (let ei = 0; ei < hr.ears.length; ei++) {
      hr.ears[ei].rotation.x = 0.25 + Math.sin(elapsed * 3.4 + seed + ei) * 0.08;
    }

    // Stance-locked diagonal-paired horse gait [LF, RF, LH, RH]:
    const phaseOffsets = [0, Math.PI, Math.PI + 0.36, 0.36];
    const sweepAmp = 0.52 * amp;
    for (let li = 0; li < hr.legs.length; li++) {
      const p = ((gaitPhase + phaseOffsets[li % 4]) % TWO_PI + TWO_PI) % TWO_PI;
      let tLegX = 0;
      let tKneeX = 0.04;
      if (moving) {
        if (p < Math.PI) {
          const u = p / Math.PI;
          tLegX = THREE.MathUtils.lerp(-sweepAmp, sweepAmp, u);
          tKneeX = 0.04 + Math.sin(u * Math.PI) * 0.06 * amp;
        } else {
          const u = (p - Math.PI) / Math.PI;
          tLegX = Math.cos(u * Math.PI) * sweepAmp;
          tKneeX = 0.06 + Math.pow(Math.sin(u * Math.PI), 0.78) * (0.76 * amp);
        }
      }
      if (state) {
        state.legX[li] = THREE.MathUtils.damp(state.legX[li], tLegX, 16, dt);
        state.kneeX[li] = THREE.MathUtils.damp(state.kneeX[li], tKneeX, 16, dt);
        hr.legs[li].rotation.x = state.legX[li];
        if (hr.knees[li]) hr.knees[li].rotation.x = state.kneeX[li];
      } else {
        hr.legs[li].rotation.x = tLegX;
        if (hr.knees[li]) hr.knees[li].rotation.x = tKneeX;
      }
    }
  }

  private applySwimmingPose(
    rig: CharacterRig,
    phase: number,
    moveIntensity: number,
    elapsed: number,
    divePitch = 0,
    poseState?: CharacterPoseState,
    dt = 0.016
  ): void {
    const tHipY = 0.9;
    const stroke = 0.25 + moveIntensity * 0.55 + divePitch;
    const tTorsoRotX = stroke + Math.sin(elapsed * 2.4) * 0.04;
    const tTorsoRotY = Math.sin(phase) * 0.14 * moveIntensity;
    const armReach = moveIntensity > 0.1 ? 1.15 : 0.45;
    const tLeftArm = -0.85 + Math.sin(phase) * armReach;
    const tRightArm = -0.85 + Math.sin(phase + Math.PI) * armReach;
    const tLeftElbow = -0.45 - Math.max(0, Math.cos(phase)) * 0.45;
    const tRightElbow = -0.45 - Math.max(0, Math.cos(phase + Math.PI)) * 0.45;
    const kick = Math.sin(phase * 1.6 + elapsed * 3.0) * (0.28 + moveIntensity * 0.25);
    const tLeftLeg = 0.25 + kick;
    const tRightLeg = 0.25 - kick;
    const tLeftKnee = 0.22 + Math.max(0, -kick) * 0.4;
    const tRightKnee = 0.22 + Math.max(0, kick) * 0.4;

    const pose = rig === this.ramRig ? this.ramPose : poseState;
    if (pose) {
      const lam = 10;
      pose.hipY = THREE.MathUtils.damp(pose.hipY, tHipY, lam, dt);
      pose.torsoRotX = THREE.MathUtils.damp(pose.torsoRotX, tTorsoRotX, lam, dt);
      pose.torsoRotY = THREE.MathUtils.damp(pose.torsoRotY, tTorsoRotY, lam, dt);
      pose.torsoRotZ = THREE.MathUtils.damp(pose.torsoRotZ, 0, lam, dt);
      pose.leftArm = THREE.MathUtils.damp(pose.leftArm, tLeftArm, lam, dt);
      pose.rightArm = THREE.MathUtils.damp(pose.rightArm, tRightArm, lam, dt);
      pose.leftArmZ = THREE.MathUtils.damp(pose.leftArmZ, 0, lam, dt);
      pose.rightArmZ = THREE.MathUtils.damp(pose.rightArmZ, 0, lam, dt);
      pose.leftElbow = THREE.MathUtils.damp(pose.leftElbow, tLeftElbow, lam, dt);
      pose.rightElbow = THREE.MathUtils.damp(pose.rightElbow, tRightElbow, lam, dt);
      pose.leftHip = THREE.MathUtils.damp(pose.leftHip, tLeftLeg, lam, dt);
      pose.rightHip = THREE.MathUtils.damp(pose.rightHip, tRightLeg, lam, dt);
      pose.leftLegZ = THREE.MathUtils.damp(pose.leftLegZ, -0.06, lam, dt);
      pose.rightLegZ = THREE.MathUtils.damp(pose.rightLegZ, 0.06, lam, dt);
      pose.leftKnee = THREE.MathUtils.damp(pose.leftKnee, tLeftKnee, lam, dt);
      pose.rightKnee = THREE.MathUtils.damp(pose.rightKnee, tRightKnee, lam, dt);
      pose.leftAnkle = THREE.MathUtils.damp(pose.leftAnkle, 0.35, lam, dt);
      pose.rightAnkle = THREE.MathUtils.damp(pose.rightAnkle, 0.35, lam, dt);
      pose.pleatRotX = THREE.MathUtils.damp(pose.pleatRotX, -0.25, lam, dt);

      rig.torso.position.y = pose.hipY;
      rig.leftLeg.position.y = pose.hipY;
      rig.rightLeg.position.y = pose.hipY;
      rig.torso.rotation.set(pose.torsoRotX, pose.torsoRotY, pose.torsoRotZ);
      rig.leftArm.rotation.set(pose.leftArm, 0, pose.leftArmZ);
      rig.rightArm.rotation.set(pose.rightArm, 0, pose.rightArmZ);
      rig.leftElbow.rotation.x = pose.leftElbow;
      rig.rightElbow.rotation.x = pose.rightElbow;
      rig.leftLeg.rotation.set(pose.leftHip, 0, pose.leftLegZ);
      rig.rightLeg.rotation.set(pose.rightHip, 0, pose.rightLegZ);
      rig.leftKnee.rotation.x = pose.leftKnee;
      rig.rightKnee.rotation.x = pose.rightKnee;
      rig.leftAnkle.rotation.x = pose.leftAnkle;
      rig.rightAnkle.rotation.x = pose.rightAnkle;
      if (rig.centerPleat) rig.centerPleat.rotation.x = pose.pleatRotX;
    } else {
      rig.torso.position.y = tHipY;
      rig.leftLeg.position.y = tHipY;
      rig.rightLeg.position.y = tHipY;
      rig.torso.rotation.set(tTorsoRotX, tTorsoRotY, 0);
      rig.leftArm.rotation.set(tLeftArm, 0, 0);
      rig.rightArm.rotation.set(tRightArm, 0, 0);
      rig.leftElbow.rotation.x = tLeftElbow;
      rig.rightElbow.rotation.x = tRightElbow;
      rig.leftLeg.rotation.set(tLeftLeg, 0, -0.06);
      rig.rightLeg.rotation.set(tRightLeg, 0, 0.06);
      rig.leftKnee.rotation.x = tLeftKnee;
      rig.rightKnee.rotation.x = tRightKnee;
      rig.leftAnkle.rotation.x = 0.35;
      rig.rightAnkle.rotation.x = 0.35;
    }
  }

  private applyArticulatedLocomotion(
    rig: CharacterRig,
    phase: number,
    moveIntensity: number,
    sprint: boolean,
    isGrounded: boolean,
    isAiming: boolean,
    isRakshasa: boolean,
    baseHipY: number,
    elapsed: number,
    dt = 0.016,
    poseState?: CharacterPoseState,
    torsoPitchAdd = 0,
    torsoYawAdd = 0,
    armRightPitchOverride: number | null = null,
    armRightElbowOverride: number | null = null
  ): void {
    const thighL = isRakshasa ? 0.48 : rig === this.ramRig ? 0.445 : 0.43;
    const shinL = isRakshasa ? 0.4 : rig === this.ramRig ? 0.405 : 0.37;
    const soleOffset = 0.08;
    const fullReach = thighL + shinL;

    let tLeftHip = 0.02;
    let tRightHip = -0.02;
    let tLeftKnee = 0.06;
    let tRightKnee = 0.06;
    let tLeftAnkle = -0.04;
    let tRightAnkle = -0.04;
    let tLeftArm = isAiming ? -1.16 : -0.1;
    let tRightArm = isAiming ? -0.68 : 0.03;
    let tLeftElbow = isAiming ? -0.32 : -0.44;
    let tRightElbow = isAiming ? -1.24 : -0.22;
    let tTorsoRotX = 0;
    let tTorsoRotY = 0;
    let tTorsoRotZ = 0;
    let tHipY = baseHipY;

    const crouchDrop = !isRakshasa && rig === this.ramRig ? Math.max(0, 0.93 - baseHipY) : 0;

    if (!isGrounded) {
      solveTwoBoneLegIK(0.28, -(fullReach - 0.16), thighL, shinL, _ikScratchL);
      solveTwoBoneLegIK(-0.22, -(fullReach - 0.14), thighL, shinL, _ikScratchR);
      tLeftHip = _ikScratchL.hipPitch;
      tLeftKnee = _ikScratchL.kneeFlex;
      tLeftAnkle = -0.18;
      tRightHip = _ikScratchR.hipPitch;
      tRightKnee = _ikScratchR.kneeFlex;
      tRightAnkle = -0.22;

      tLeftArm = isAiming ? -1.12 : -0.45;
      tLeftElbow = isAiming ? -0.35 : -0.68;
      tRightArm = isAiming ? -0.58 : 0.26;
      tRightElbow = isAiming ? -1.15 : -0.58;
      tTorsoRotX = 0.06;
    } else if (moveIntensity > 0.04) {
      const halfStepBase = sprint ? 0.58 : isRakshasa ? 0.44 : 0.44;
      const halfStep = halfStepBase * THREE.MathUtils.clamp(moveIntensity, 0.15, 1.0);
      const liftH = (sprint ? 0.28 : 0.19) * THREE.MathUtils.clamp(moveIntensity, 0.2, 1.0);

      evalFootTargetInto(phase, halfStep, liftH, _footL);
      evalFootTargetInto(phase + Math.PI, halfStep, liftH, _footR);

      const maxChord = fullReach * 0.988 - crouchDrop * 0.65;
      const reqL = _footL.isStance
        ? Math.sqrt(Math.max(0.16, maxChord * maxChord - _footL.z * _footL.z))
        : maxChord;
      const reqR = _footR.isStance
        ? Math.sqrt(Math.max(0.16, maxChord * maxChord - _footR.z * _footR.z))
        : maxChord;
      const effReach = Math.min(reqL, reqR);
      const pelvisDrop = fullReach - effReach;
      const impactDip = rig === this.ramRig ? this.ramLandingImpact * 0.14 : 0;
      tHipY = baseHipY - pelvisDrop - impactDip;

      const hipClearance = Math.max(0.28, tHipY - soleOffset);
      solveTwoBoneLegIK(_footL.z, _footL.yLift - hipClearance, thighL, shinL, _ikScratchL);
      solveTwoBoneLegIK(_footR.z, _footR.yLift - hipClearance, thighL, shinL, _ikScratchR);

      tLeftHip = _ikScratchL.hipPitch;
      tLeftKnee = _ikScratchL.kneeFlex;
      tRightHip = _ikScratchR.hipPitch;
      tRightKnee = _ikScratchR.kneeFlex;

      tLeftAnkle = _footL.isStance
        ? THREE.MathUtils.clamp(-(tLeftHip + tLeftKnee) + _footL.ankleRoll * 0.12, -0.58, 0.44)
        : THREE.MathUtils.clamp(-(tLeftHip + tLeftKnee) + _footL.ankleRoll, -0.58, 0.44);
      tRightAnkle = _footR.isStance
        ? THREE.MathUtils.clamp(-(tRightHip + tRightKnee) + _footR.ankleRoll * 0.12, -0.58, 0.44)
        : THREE.MathUtils.clamp(-(tRightHip + tRightKnee) + _footR.ankleRoll, -0.58, 0.44);

      const armAmp = (sprint ? 0.66 : 0.44) * moveIntensity;
      const rightShoulder = Math.sin(phase) * armAmp;
      const leftShoulder = Math.sin(phase + Math.PI) * armAmp;

      if (isRakshasa) {
        tRightArm = -0.58 + rightShoulder * 0.45;
        tRightElbow = -0.62;
        tLeftArm = leftShoulder * 0.85;
        tLeftElbow = -0.45 - 0.3 * Math.max(0, -leftShoulder);
      } else {
        tRightArm = isAiming ? -0.68 : rightShoulder;
        tRightElbow = isAiming
          ? -1.24
          : -0.34 - 0.36 * Math.max(0, -rightShoulder);
        tLeftArm = isAiming ? -1.16 : leftShoulder * 0.65 - 0.14;
        tLeftElbow = isAiming ? -0.32 : -0.48 - 0.22 * Math.max(0, -leftShoulder);
      }

      tTorsoRotY = Math.sin(phase) * (sprint ? 0.11 : 0.068) * moveIntensity;
      tTorsoRotX = (sprint ? 0.12 : 0.04) * moveIntensity + impactDip * 0.9;
      tTorsoRotZ = Math.cos(phase) * (sprint ? 0.032 : 0.018) * moveIntensity;
    } else {
      const idleReach = Math.max(0.28, baseHipY - soleOffset - (rig === this.ramRig ? this.ramLandingImpact * 0.14 : 0));
      solveTwoBoneLegIK(0.035, -idleReach, thighL, shinL, _ikScratchL);
      solveTwoBoneLegIK(-0.035, -idleReach, thighL, shinL, _ikScratchR);
      tLeftHip = _ikScratchL.hipPitch;
      tLeftKnee = _ikScratchL.kneeFlex;
      tRightHip = _ikScratchR.hipPitch;
      tRightKnee = _ikScratchR.kneeFlex;
      tLeftAnkle = -(tLeftHip + tLeftKnee);
      tRightAnkle = -(tRightHip + tRightKnee);
      tHipY = baseHipY - (rig === this.ramRig ? this.ramLandingImpact * 0.14 : 0) + (isRakshasa ? 0 : Math.sin(elapsed * 2.1) * 0.003);
      tTorsoRotX = rig === this.ramRig ? this.ramLandingImpact * 0.16 : 0;
    }

    tTorsoRotX += torsoPitchAdd;
    tTorsoRotY += torsoYawAdd;
    if (armRightPitchOverride !== null) tRightArm = armRightPitchOverride;
    if (armRightElbowOverride !== null) tRightElbow = armRightElbowOverride;

    const pose = rig === this.ramRig ? this.ramPose : poseState;
    if (pose) {
      const lam = isGrounded ? 18 : 12;
      pose.leftHip = THREE.MathUtils.damp(pose.leftHip, tLeftHip, lam, dt);
      pose.rightHip = THREE.MathUtils.damp(pose.rightHip, tRightHip, lam, dt);
      pose.leftKnee = THREE.MathUtils.damp(pose.leftKnee, tLeftKnee, lam, dt);
      pose.rightKnee = THREE.MathUtils.damp(pose.rightKnee, tRightKnee, lam, dt);
      pose.leftAnkle = THREE.MathUtils.damp(pose.leftAnkle, tLeftAnkle, lam, dt);
      pose.rightAnkle = THREE.MathUtils.damp(pose.rightAnkle, tRightAnkle, lam, dt);
      pose.leftLegZ = THREE.MathUtils.damp(pose.leftLegZ, 0, lam, dt);
      pose.rightLegZ = THREE.MathUtils.damp(pose.rightLegZ, 0, lam, dt);
      pose.leftArm = THREE.MathUtils.damp(pose.leftArm, tLeftArm, lam, dt);
      pose.rightArm = THREE.MathUtils.damp(pose.rightArm, tRightArm, lam, dt);
      pose.leftArmZ = THREE.MathUtils.damp(pose.leftArmZ, 0, lam, dt);
      pose.rightArmZ = THREE.MathUtils.damp(pose.rightArmZ, 0, lam, dt);
      pose.leftElbow = THREE.MathUtils.damp(pose.leftElbow, tLeftElbow, lam, dt);
      pose.rightElbow = THREE.MathUtils.damp(pose.rightElbow, tRightElbow, lam, dt);
      pose.hipY = THREE.MathUtils.damp(pose.hipY, tHipY, lam, dt);
      pose.torsoRotX = THREE.MathUtils.damp(pose.torsoRotX, tTorsoRotX, lam, dt);
      pose.torsoRotY = THREE.MathUtils.damp(pose.torsoRotY, tTorsoRotY, lam, dt);
      pose.torsoRotZ = THREE.MathUtils.damp(pose.torsoRotZ, tTorsoRotZ, lam, dt);
      pose.pleatRotX = THREE.MathUtils.damp(pose.pleatRotX, -0.045, lam, dt);

      rig.leftLeg.rotation.set(pose.leftHip, 0, pose.leftLegZ);
      rig.rightLeg.rotation.set(pose.rightHip, 0, pose.rightLegZ);
      rig.leftKnee.rotation.x = pose.leftKnee;
      rig.rightKnee.rotation.x = pose.rightKnee;
      rig.leftAnkle.rotation.x = pose.leftAnkle;
      rig.rightAnkle.rotation.x = pose.rightAnkle;
      rig.leftArm.rotation.set(pose.leftArm, 0, pose.leftArmZ);
      rig.rightArm.rotation.set(pose.rightArm, 0, pose.rightArmZ);
      rig.leftElbow.rotation.x = pose.leftElbow;
      rig.rightElbow.rotation.x = pose.rightElbow;

      rig.leftLeg.position.y = pose.hipY;
      rig.rightLeg.position.y = pose.hipY;
      rig.torso.position.y = pose.hipY;
      rig.torso.rotation.set(pose.torsoRotX, pose.torsoRotY, pose.torsoRotZ);
      if (rig.centerPleat) rig.centerPleat.rotation.x = pose.pleatRotX;
    } else {
      rig.leftLeg.rotation.set(tLeftHip, 0, 0);
      rig.rightLeg.rotation.set(tRightHip, 0, 0);
      rig.leftKnee.rotation.x = tLeftKnee;
      rig.rightKnee.rotation.x = tRightKnee;
      rig.leftAnkle.rotation.x = tLeftAnkle;
      rig.rightAnkle.rotation.x = tRightAnkle;
      rig.leftArm.rotation.set(tLeftArm, 0, 0);
      rig.rightArm.rotation.set(tRightArm, 0, 0);
      rig.leftElbow.rotation.x = tLeftElbow;
      rig.rightElbow.rotation.x = tRightElbow;
      rig.leftLeg.position.y = tHipY;
      rig.rightLeg.position.y = tHipY;
      rig.torso.position.y = tHipY;
      rig.torso.rotation.set(tTorsoRotX, tTorsoRotY, tTorsoRotZ);
    }
  }

  private stepSimulation(rawDt: number, elapsed: number): void {
    if (this.slowMoTimer > 0) {
      this.slowMoTimer = Math.max(0, this.slowMoTimer - rawDt);
      if (this.slowMoTimer <= 0) this.slowMoFactor = 1.0;
    }
    const dt = rawDt * this.slowMoFactor;
    this.simFrameCounter++;
    const camX = this.camera.position.x;
    const camZ = this.camera.position.z;

    // Fade screen flash & shake + tick Astra Energy & Cooldowns
    this.brahmaFlashAlpha = Math.max(0, this.brahmaFlashAlpha - rawDt * 2.4);
    this.cameraShakeAmount = THREE.MathUtils.damp(this.cameraShakeAmount, 0, 8.5, rawDt);
    this.astraEnergy = Math.min(ASTRA_MAX_ENERGY, this.astraEnergy + ASTRA_ENERGY_REGEN_PER_SEC * dt);
    for (const aId of ASTRA_ORDER) {
      this.astraCooldowns[aId] = Math.max(0, this.astraCooldowns[aId] - dt);
    }
    if (this.input.selectedAstra !== (this.astraQuest?.selectedAstra ?? null)) {
      this.astraQuest?.selectAstra(this.input.selectedAstra);
    }

    // 0. Animate active nearby torch flame tongues (< 110m from camera; distant ones stay frozen beyond fog)
    if (this.torchFlamesOuter && this.torchFlamesCore && this.torchFlameAnchors.length > 0) {
      let anyFlameUpdated = false;
      for (let i = 0; i < this.torchFlameAnchors.length; i++) {
        const anchor = this.torchFlameAnchors[i];
        const fdx = anchor.x - camX;
        const fdz = anchor.z - camZ;
        if (fdx * fdx + fdz * fdz > 12100) continue;

        anyFlameUpdated = true;
        const flickerA = Math.sin(elapsed * 11.5 + anchor.phase) * 0.14 + Math.cos(elapsed * 19.2 + anchor.phase * 1.7) * 0.08;
        const swayX = Math.sin(elapsed * 7.8 + anchor.phase) * 0.08;
        const swayZ = Math.cos(elapsed * 6.9 + anchor.phase) * 0.08;

        _dummy.position.set(anchor.x, anchor.y, anchor.z);
        _dummy.rotation.set(swayX, anchor.phase, swayZ);
        _dummy.scale.set(1 - flickerA * 0.25, 1 + flickerA, 1 - flickerA * 0.25);
        _dummy.updateMatrix();
        this.torchFlamesOuter.setMatrixAt(i, _dummy.matrix);

        _dummy.scale.set(0.92, 0.94 + flickerA * 0.85, 0.92);
        _dummy.updateMatrix();
        this.torchFlamesCore.setMatrixAt(i, _dummy.matrix);
      }
      if (anyFlameUpdated) {
        this.torchFlamesOuter.instanceMatrix.needsUpdate = true;
        this.torchFlamesCore.instanceMatrix.needsUpdate = true;
      }
    }

    // 1. Strict First-Person Camera look rotation (horizontal 360 + vertical pitch; no zoom/perspective switching)
    const hasManualDrag =
      Math.abs(this.input.cameraDeltaX) > 0.25 ||
      Math.abs(this.input.cameraDeltaY) > 0.25;
    if (hasManualDrag) {
      this.cameraManualHold = 1.65;
      this.camChariotLockTimer = 0;
    }
    this.cameraManualHold = Math.max(0, this.cameraManualHold - dt);
    this.camChariotLockTimer = Math.max(0, this.camChariotLockTimer - dt);

    this.camYaw -= this.input.cameraDeltaX * 0.0065;
    this.camPitch = THREE.MathUtils.clamp(
      this.camPitch + this.input.cameraDeltaY * 0.0055,
      -1.22,
      1.28
    );
    this.input.cameraDeltaX = 0;
    this.input.cameraDeltaY = 0;

    // Keep SkyDome & Starfield centered smoothly relative to player across 2.5 km world & step seamless day-night cycle
    const dayCycleDurationSec = 140;
    this.dayTime = (this.dayTime + dt / dayCycleDurationSec) % 1.0;
    if (this.skyDome) {
      this.skyDome.position.set(this.playerX, 0, this.playerZ);
    }
    if (this.starPoints && this.starPoints.visible) {
      this.starPoints.position.set(this.playerX, 0, this.playerZ);
    }
    if (this.starUniforms && this.starPoints?.visible) {
      this.starUniforms.uTime.value = elapsed;
    }
    if (this.fireflyUniforms && this.fireflyPoints?.visible) {
      this.fireflyUniforms.uTime.value = elapsed;
    }
    if (this.skyUniforms) {
      this.skyUniforms.uTime.value = elapsed;
    }
    if (this.terrainShaderUniforms) {
      this.terrainShaderUniforms.uTerrTime.value = elapsed;
    }
    if (this.waterShaderUniforms) {
      this.waterShaderUniforms.uTime.value = elapsed;
    }
    if (this.waterfallShaderUniforms) {
      this.waterfallShaderUniforms.uTime.value = elapsed;
    }
    if (this.foliageWindUniforms) {
      this.foliageWindUniforms.uWindTime.value = elapsed;
    }
    if (this.torchFlameUniforms) {
      this.torchFlameUniforms.uFlameTime.value = elapsed;
    }

    if (this.shivlingWaterUniforms) {
      const shivDistSq = this.playerX * this.playerX + this.playerZ * this.playerZ;
      if (shivDistSq <= 19600) {
        this.shivlingWaterUniforms.uTime.value = elapsed;
      }
    }
    for (let i = 0; i < this.floatingIslandWfUniforms.length; i++) {
      this.floatingIslandWfUniforms[i].uTime.value = elapsed;
    }
    for (let i = 0; i < this.floatingIslands.length; i++) {
      const isl = this.floatingIslands[i];
      const baseY = typeof isl.userData.baseY === 'number' ? isl.userData.baseY : isl.position.y;
      const phase = typeof isl.userData.phase === 'number' ? isl.userData.phase : i;
      isl.position.y = baseY + Math.sin(elapsed * 0.65 + phase) * 1.1;
    }

    // Animate Mountable Sacred Elephants & Royal Ashvas (visibility culled after camera lookAt)
    const pxIdle = this.playerX;
    const pzIdle = this.playerZ;
    const profDistScale = this.qualityManager.getProfile().distanceCullScale;
    const profDistScaleSq = profDistScale * profDistScale;
    for (let i = 0; i < this.animals.length; i++) {
      const a = this.animals[i];
      const dx = a.x - pxIdle;
      const dz = a.z - pzIdle;
      const dSq = dx * dx + dz * dz;
      const isMounted = i === this.mountedAnimalIndex;
      if (!isMounted && dSq > 19600 * profDistScaleSq) continue;
      a.animState.kinematicAccumDt += dt;
      if (!isMounted && dSq > 2500 * profDistScaleSq && ((i + this.simFrameCounter) & 3) !== 0) continue;
      const animDt = Math.min(0.12, a.animState.kinematicAccumDt);
      a.animState.kinematicAccumDt = 0;

      const moving = Math.abs(a.speed) > 0.35;
      if (a.horseRig) {
        const spdNorm = THREE.MathUtils.clamp(Math.abs(a.speed) / 16, 0, 1);
        this.animateRoyalHorseRig(a.horseRig, a.gaitPhase, spdNorm, elapsed, i * 1.7, a.animState, animDt, a.yaw);
      } else if (a.elephantRig) {
        const er = a.elephantRig;
        a.animState.speedBlend = THREE.MathUtils.damp(a.animState.speedBlend, moving ? 1 : 0, 7.5, animDt);
        er.trunkPivot.rotation.x = Math.sin(elapsed * 1.4 + i * 1.9) * 0.16;
        for (let ei = 0; ei < er.earPivots.length; ei++) {
          const side = ei % 2 === 0 ? -1 : 1;
          er.earPivots[ei].rotation.y = side * (0.12 + Math.sin(elapsed * 2.1 + i + ei) * 0.08);
        }
        for (let li = 0; li < er.legs.length; li++) {
          const ph = a.gaitPhase + (li % 2) * Math.PI + (li >= 2 ? 0.6 : 0);
          const tLeg = moving ? -Math.sin(ph) * 0.34 * a.animState.speedBlend : 0;
          a.animState.legX[li] = THREE.MathUtils.damp(a.animState.legX[li], tLeg, 14, animDt);
          er.legs[li].rotation.x = a.animState.legX[li];
        }
      }
    }

    // Keep idle & parked chariot horses alive with distance-LOD breathing (visibility culled after camera lookAt)
    for (let i = 0; i < this.chariots.length; i++) {
      const ch = this.chariots[i];
      if (i === this.mountedChariotIndex && (this.mountedSeatIndex !== 1 || Math.abs(ch.speed) > 0.35)) {
        continue;
      }
      const dSq = (ch.x - pxIdle) * (ch.x - pxIdle) + (ch.z - pzIdle) * (ch.z - pzIdle);
      if (dSq > 8100 * profDistScaleSq) continue;
      for (let sIdx = 0; sIdx < ch.rig.steeds.length; sIdx++) {
        const st = ch.steedStates[sIdx];
        st.kinematicAccumDt += dt;
        if (dSq > 2500 * profDistScaleSq && ((i + this.simFrameCounter) & 3) !== 0) continue;
        const sDt = Math.min(0.12, st.kinematicAccumDt);
        st.kinematicAccumDt = 0;
        this.animateRoyalHorseRig(
          ch.rig.steeds[sIdx],
          ch.gaitPhase + sIdx * 0.45,
          0,
          elapsed,
          i * 3.1 + sIdx * 1.4,
          st,
          sDt,
          ch.yaw
        );
      }
    }

    // Gentle river water & normal ripple animation + volcanic bombs/smoke + Demon Village atmosphere shift
    if (this.textures) {
      this.textures.water.offset.y -= dt * 0.35;
      this.textures.waterNormal.offset.y -= dt * 0.42;
      this.textures.waterNormal.offset.x += dt * 0.08;
    }
    this.stepVolcanicAtmosphere(dt);
    this.updateAtmosphericMood();

    // Expire transient vehicle notices and retry reliable VEHICLE_ACTION on packet loss
    if (this.mountNoticeText && performance.now() > this.mountNoticeExpiresMs) {
      this.mountNoticeText = null;
    }
    if (this.pendingVehicleAction) {
      const nowMs = performance.now();
      if (!this.lanClient?.isClientInMatch()) {
        this.pendingVehicleAction = null;
      } else if (nowMs >= this.pendingVehicleAction.nextRetryAtMs) {
        if (this.pendingVehicleAction.sentCount >= 8) {
          this.pendingVehicleAction = null;
          this.showMountNotice('Seat sync timed out — restored cleanly');
        } else {
          this.pendingVehicleAction.sentCount++;
          this.pendingVehicleAction.nextRetryAtMs = nowMs + 180;
          this.lanClient.sendVehicleAction({
            actionId: this.pendingVehicleAction.actionId,
            vehicleId: this.pendingVehicleAction.vehicleId,
            action: this.pendingVehicleAction.action,
            preferredSeat: this.pendingVehicleAction.preferredSeat,
            seq: this.pendingVehicleAction.seq,
            clientTsMs: Date.now(),
          });
        }
      }
    }

    // 2. Explicit Interact (Quest Altar/Pearl/Moon-Dial -> Simhasana Throne OR Mount / Dismount)
    if (this.input.interactPressed) {
      this.input.interactPressed = false;
      if (this.astraQuest?.handleInteract()) {
        this.emitHud();
      } else if (this.seatedOnThrone) {
        this.seatedOnThrone = false;
        this.playerZ = THRONE_POS.z + 1.65;
        this.playerY = this.surfaceHeightAt(this.playerX, this.playerZ, 0.9);
        this.restoreRamStandingClothes();
        soundEngine.playMountChariot();
        this.emitHud();
      } else if (this.mountedChariotIndex !== null || this.mountedAnimalIndex !== null) {
        this.dismountLocalPlayerCleanly(true);
      } else if (this.isNearThrone()) {
        this.seatedOnThrone = true;
        this.autoDriveActive = false;
        this.isRamSwimming = false;
        const anchor = this.getThroneSeatAnchor();
        this.playerX = anchor.x;
        this.playerZ = anchor.z;
        this.playerY = anchor.y;
        this.playerYaw = 0;
        this.playerVelY = 0;
        this.grounded = true;
        this.triggerThroneAscension();
        soundEngine.playMountChariot();
        this.emitHud();
      } else {
        const nearMount = this.findNearestMount();
        if (nearMount) {
          if (nearMount.isFull) {
            this.showMountNotice(`${nearMount.label} is full (2/2 players)`);
          } else {
            const openSeat: LanVehicleSeatIndex = nearMount.driverId === null ? 0 : 1;
            this.boardVehicleLocal(nearMount.kind, nearMount.index, openSeat);
            if (this.lanClient?.isClientInMatch()) {
              this.queueClientVehicleAction(nearMount.id, 'BOARD', openSeat);
            } else if (this.lanClient?.isHostingMatch()) {
              this.lanClient.sendWorldSnapshot(this.buildHostWorldSnapshot());
            }
          }
        }
      }
    }

    // 2b. Universal Stealth Mode toggle, Seat Swap (G), & Paved-Path Auto-Drive toggle
    if (this.input.stealthTogglePressed) {
      this.input.stealthTogglePressed = false;
      this.setStealthMode(!this.stealthActive);
      this.emitHud();
    }

    if (this.input.switchSeatPressed) {
      this.input.switchSeatPressed = false;
      this.triggerSwitchSeat();
    }

    if (this.input.autoDriveTogglePressed) {
      this.input.autoDriveTogglePressed = false;
      if (this.mountedChariotIndex !== null || this.mountedAnimalIndex !== null) {
        if (this.mountedSeatIndex === 1) {
          this.showMountNotice('Only the driver can toggle Auto-Drive');
        } else {
          this.autoDriveActive = !this.autoDriveActive;
          this.chariotAutoWaypoints.length = 0;
          this.chariotAutoWpIdx = 0;
          this.chariotAutoGoalKey = '';
          soundEngine.playMountChariot();
          this.emitHud();
        }
      }
    }

    // Dead-reckon & terrain-snap remotely driven vehicles before positioning any local Passenger
    if (this.lanClient?.isMultiplayerActive()) {
      this.updateSyncedVehicles(dt, elapsed);
    }

    // 3. Movement & Brahmastra Summon Pose Lock
    const summonLocked =
      this.brahmaSummonPhase !== 'IDLE' && this.brahmaSummonPhase !== 'AIM_READY';
    const mx = summonLocked ? 0 : this.input.moveX;
    const my = summonLocked ? 0 : this.input.moveY;
    const mag = Math.min(1, Math.hypot(mx, my));

    const prevYaw = this.playerYaw;
    const prevX = this.playerX;
    const prevZ = this.playerZ;
    const isDrawingBow =
      this.input.fireHeld ||
      this.bowDrawHoldTimer > 0 ||
      this.brahmaSummonPhase === 'AIM_READY';

    if (this.seatedOnThrone) {
      const anchor = this.getThroneSeatAnchor();
      this.playerX = anchor.x;
      this.playerZ = anchor.z;
      this.playerY = anchor.y;
      this.playerVelY = 0;
      this.grounded = true;
      this.playerYaw = 0;
      if (this.input.jumpPressed || mag > 0.75) {
        this.input.jumpPressed = false;
        this.seatedOnThrone = false;
        this.playerZ = THRONE_POS.z + 1.65;
        this.playerY = this.surfaceHeightAt(this.playerX, this.playerZ, 0.9);
        this.restoreRamStandingClothes();
      } else {
        this.ramRig.contactShadow.visible = false;
        this.ramRig.root.position.set(this.playerX, this.playerY, this.playerZ);
        this.ramRig.root.rotation.order = 'YXZ';
        this.ramRig.root.rotation.set(0, this.playerYaw, 0);
        this.applyThroneSittingPose(this.ramRig, isDrawingBow, elapsed, dt);
      }
    } else if (this.mountedChariotIndex !== null) {
      this.input.jumpPressed = false;
      this.isRamSwimming = false;
      const ch = this.chariots[this.mountedChariotIndex];
      const isPassenger = this.mountedSeatIndex === 1;
      let steerInput = 0;

      if (!isPassenger) {
        const startChX = ch.x;
        const startChZ = ch.z;

        if (this.autoDriveActive) {
          const activeMission = MISSIONS[this.missionIdx];
          const goalX =
            activeMission && activeMission.id !== 'mission_sabha' ? activeMission.waypoint.x : 0;
          const goalZ =
            activeMission && activeMission.id !== 'mission_sabha' ? activeMission.waypoint.z : -56;
          const goalKey = `${goalX.toFixed(0)}:${goalZ.toFixed(0)}`;
          if (this.chariotAutoWaypoints.length === 0 || this.chariotAutoGoalKey !== goalKey) {
            buildAutoDriveRoute(ch.x, ch.z, ch.yaw, goalX, goalZ, this.chariotAutoWaypoints);
            this.chariotAutoWpIdx = 0;
            this.chariotAutoGoalKey = goalKey;
          }
          const lookahead = THREE.MathUtils.clamp(6.0 + Math.abs(ch.speed) * 0.28, 6.0, 14.0);
          const route = stepAutoDriveRoute(
            ch.x,
            ch.z,
            this.chariotAutoWaypoints,
            this.chariotAutoWpIdx,
            goalX,
            goalZ,
            lookahead
          );
          this.chariotAutoWpIdx = route.wpIdx;

          const toTx = route.targetX - ch.x;
          const toTz = route.targetZ - ch.z;
          const distT = Math.hypot(toTx, toTz);

          const autoMaxSpeed = this.input.sprint ? 76 : 28;
          const stopAtGoal = route.distToGoal < 7.5 || my < -0.25 || distT < 0.35;

          let yawDiff = 0;
          if (!stopAtGoal && distT > 0.15) {
            const desiredYaw = Math.atan2(toTx, toTz);
            yawDiff = desiredYaw - ch.yaw;
            while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
            while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
            steerInput = THREE.MathUtils.clamp(-yawDiff * 0.7, -1, 1);
            // Strict angular-velocity clamp prevents sudden 180 deg whips or erratic spinning
            const maxTurnStep = (Math.abs(yawDiff) > 0.75 ? 1.75 : 2.15) * dt;
            ch.yaw += THREE.MathUtils.clamp(yawDiff, -maxTurnStep, maxTurnStep);
          }

          // Slow gently during sharp corners or initial alignment so chariot remains strictly on paved road
          const alignFactor = Math.abs(yawDiff) > 0.7 ? 0.16 : Math.max(0.35, Math.cos(yawDiff));
          const targetAutoSpeed = stopAtGoal ? 0 : autoMaxSpeed * alignFactor;
          ch.speed = THREE.MathUtils.damp(ch.speed, targetAutoSpeed, 4.5, dt);

          const prevChX = ch.x;
          const prevChZ = ch.z;
          const nextX = ch.x + Math.sin(ch.yaw) * ch.speed * dt;
          const nextZ = ch.z + Math.cos(ch.yaw) * ch.speed * dt;
          const resolved = this.resolveChariotStaticCCD(ch.x, ch.z, nextX, nextZ, ch.yaw, ch.y);
          const movedChDist = Math.hypot(resolved.x - prevChX, resolved.z - prevChZ);
          const chSign = ch.speed >= 0 ? 1 : -1;
          ch.x = resolved.x;
          ch.z = resolved.z;
          if (resolved.blocked) {
            ch.speed *= 0.35;
          }
          ch.rig.leftWheel.rotation.x += chSign * movedChDist * 1.1;
          ch.rig.rightWheel.rotation.x += chSign * movedChDist * 1.1;
          ch.gaitPhase += (movedChDist / 2.25) * Math.PI * 2;
        } else {
          // Manual Ratha Control with speed-coupled directional steering & hysteresis (zero erratic spinning)
          this.chariotAutoWaypoints.length = 0;
          const maxSpeed = this.input.sprint ? 82 : 28;
          const targetSpeed = my * maxSpeed;
          ch.speed = THREE.MathUtils.damp(ch.speed, targetSpeed, 4.8, dt);

          if (ch.speed < -1.0) this.chariotReverseIntent = true;
          else if (ch.speed > 0.4 || my > 0.1) this.chariotReverseIntent = false;

          if (Math.abs(mx) > 0.08) {
            const turnSign = this.chariotReverseIntent ? -1 : 1;
            steerInput = mx * turnSign;
            const speedFrac = Math.min(1, Math.abs(ch.speed) / 14);
            const turnRate = THREE.MathUtils.lerp(0.82, 1.48, speedFrac);
            ch.yaw -= steerInput * turnRate * dt;
          }

          const prevChX = ch.x;
          const prevChZ = ch.z;
          const nextX = ch.x + Math.sin(ch.yaw) * ch.speed * dt;
          const nextZ = ch.z + Math.cos(ch.yaw) * ch.speed * dt;
          const resolved = this.resolveChariotStaticCCD(
            ch.x,
            ch.z,
            nextX,
            nextZ,
            ch.yaw,
            ch.y
          );
          const movedChDist = Math.hypot(resolved.x - prevChX, resolved.z - prevChZ);
          const chSign = ch.speed >= 0 ? 1 : -1;
          ch.x = resolved.x;
          ch.z = resolved.z;
          if (resolved.blocked) {
            ch.speed *= 0.35;
          }
          ch.rig.leftWheel.rotation.x += chSign * movedChDist * 1.1;
          ch.rig.rightWheel.rotation.x += chSign * movedChDist * 1.1;
          ch.gaitPhase += (movedChDist / 2.25) * Math.PI * 2;
        }
        this.syncChariotTerrainSupport(ch, dt);
        ch.vx = (ch.x - startChX) / Math.max(0.001, dt);
        ch.vz = (ch.z - startChZ) / Math.max(0.001, dt);

        const chariotSpdNorm = THREE.MathUtils.clamp(Math.abs(ch.speed) / 28, 0, 1);
        for (let sIdx = 0; sIdx < ch.rig.steeds.length; sIdx++) {
          this.animateRoyalHorseRig(
            ch.rig.steeds[sIdx],
            ch.gaitPhase + sIdx * 0.45,
            chariotSpdNorm,
            elapsed,
            (this.mountedChariotIndex ?? 0) * 3.1 + sIdx * 1.4,
            ch.steedStates[sIdx],
            dt,
            ch.yaw
          );
        }

        // Chariot ramming damage against Rakshasas (disabled while stealth mode is active to bypass hostiles)
        if (!this.stealthActive && Math.abs(ch.speed) > 10) {
          for (const e of this.enemies) {
            if (!e.alive) continue;
            const d = Math.hypot(e.x - ch.x, e.z - ch.z);
            if (d < 3.1) {
              this.damageEnemy(e, 45);
              this.spawnBlast(e.x, e.y + 1, e.z, 0xf4c44e);
            }
          }
        }
      }

      // Sync local Driver (Seat 0) or Passenger (Seat 1) cleanly onto Ratha seat & pitch plane
      const activeSeat: LanVehicleSeatIndex = isPassenger ? 1 : 0;
      computeVehicleSeatWorldPosition(
        ch.x,
        ch.y,
        ch.z,
        ch.yaw,
        ch.pitch,
        'RATHA',
        activeSeat,
        this._seatWorldScratch
      );
      this.playerX = this._seatWorldScratch.x;
      this.playerZ = this._seatWorldScratch.z;
      this.playerY = this._seatWorldScratch.y;
      this.playerVelY = 0;
      this.grounded = true;
      this.playerYaw = isPassenger ? this.camYaw + Math.PI : ch.yaw;
      this.ramRig.root.position.set(this.playerX, this.playerY, this.playerZ);
      this.ramRig.root.rotation.order = 'YXZ';
      this.ramRig.root.rotation.y = this.playerYaw;
      this.ramRig.root.rotation.x = -ch.pitch;
      this.ramRig.contactShadow.visible = false;
      if (isPassenger) {
        this.applyChariotPassengerPose(this.ramRig, isDrawingBow, elapsed, dt);
      } else {
        this.applyChariotSittingPose(
          this.ramRig,
          steerInput,
          isDrawingBow,
          elapsed,
          dt
        );
      }
    } else if (this.mountedAnimalIndex !== null) {
      this.input.jumpPressed = false;
      this.isRamSwimming = false;
      const an = this.animals[this.mountedAnimalIndex];
      const isEle = an.kind === 'ELEPHANT';
      const isPassenger = this.mountedSeatIndex === 1;
      const anRadius = isEle ? 1.55 : 0.95;
      const maxSpeed = isEle ? (this.input.sprint ? 16 : 9.5) : (this.input.sprint ? 36 : 16);

      if (!isPassenger) {
        const startAnX = an.x;
        const startAnZ = an.z;
        if (this.autoDriveActive) {
          const activeMission = MISSIONS[this.missionIdx];
          const goalX =
            activeMission && activeMission.id !== 'mission_sabha' ? activeMission.waypoint.x : 0;
          const goalZ =
            activeMission && activeMission.id !== 'mission_sabha' ? activeMission.waypoint.z : -56;
          const goalKey = `${goalX.toFixed(0)}:${goalZ.toFixed(0)}`;
          if (this.chariotAutoWaypoints.length === 0 || this.chariotAutoGoalKey !== goalKey) {
            buildAutoDriveRoute(an.x, an.z, an.yaw, goalX, goalZ, this.chariotAutoWaypoints);
            this.chariotAutoWpIdx = 0;
            this.chariotAutoGoalKey = goalKey;
          }
          const route = stepAutoDriveRoute(
            an.x,
            an.z,
            this.chariotAutoWaypoints,
            this.chariotAutoWpIdx,
            goalX,
            goalZ,
            7.0
          );
          this.chariotAutoWpIdx = route.wpIdx;
          const toTx = route.targetX - an.x;
          const toTz = route.targetZ - an.z;
          const distT = Math.hypot(toTx, toTz);
          const stopAtGoal = route.distToGoal < 6.0 || my < -0.25 || distT < 0.35;
          let yawDiff = 0;
          if (!stopAtGoal && distT > 0.12) {
            const desiredYaw = Math.atan2(toTx, toTz);
            yawDiff = desiredYaw - an.yaw;
            while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
            while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
            const maxTurnStep = 2.6 * dt;
            an.yaw += THREE.MathUtils.clamp(yawDiff, -maxTurnStep, maxTurnStep);
          }
          const alignFactor = Math.abs(yawDiff) > 0.7 ? 0.25 : Math.max(0.42, Math.cos(yawDiff));
          const targetSpd = stopAtGoal ? 0 : maxSpeed * alignFactor;
          an.speed = THREE.MathUtils.damp(an.speed, targetSpd, 5.0, dt);
        } else {
          this.chariotAutoWaypoints.length = 0;
          // Camera-relative joystick / keyboard movement for fluid Horse & Elephant riding
          _forward.set(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
          _right.set(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
          _v1.set(0, 0, 0).addScaledVector(_forward, my).addScaledVector(_right, mx);

          if (mag > 0.08 && _v1.lengthSq() > 0.001) {
            _v1.normalize();
            const targetYaw = Math.atan2(_v1.x, _v1.z);
            let diff = targetYaw - an.yaw;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            an.yaw += diff * Math.min(1, 9.0 * dt);
            an.speed = THREE.MathUtils.damp(an.speed, maxSpeed * mag, 6.0, dt);
          } else {
            an.speed = THREE.MathUtils.damp(an.speed, 0, 7.5, dt);
          }
        }

        const nextX = an.x + Math.sin(an.yaw) * an.speed * dt;
        const nextZ = an.z + Math.cos(an.yaw) * an.speed * dt;
        const res = this.moveSweptWithStaticCCD(an.x, an.z, nextX, nextZ, anRadius, an.y, false, false);
        const movedDist = Math.hypot(res.x - an.x, res.z - an.z);
        an.x = res.x;
        an.z = res.z;
        an.y = Math.max(RIVER_SURFACE_Y + 0.12, this.surfaceHeightAt(an.x, an.z, an.y));
        an.vx = (an.x - startAnX) / Math.max(0.001, dt);
        an.vz = (an.z - startAnZ) / Math.max(0.001, dt);
        const animalStride = isEle ? 2.6 : 2.25;
        an.gaitPhase += (movedDist / animalStride) * Math.PI * 2;

        const anObj = an.horseRig ? an.horseRig.group : an.elephantRig!.group;
        anObj.position.set(an.x, an.y, an.z);
        anObj.rotation.y = an.yaw;
      }

      const seatY = an.elephantRig
        ? an.elephantRig.seatHeight
        : an.horseRig
        ? an.horseRig.seatHeight
        : 0.88;
      const activeSeat: LanVehicleSeatIndex = isPassenger ? 1 : 0;
      computeVehicleSeatWorldPosition(
        an.x,
        an.y,
        an.z,
        an.yaw,
        0,
        an.kind,
        activeSeat,
        this._seatWorldScratch,
        seatY
      );
      this.playerX = this._seatWorldScratch.x;
      this.playerZ = this._seatWorldScratch.z;
      this.playerY = this._seatWorldScratch.y;
      this.playerVelY = 0;
      this.grounded = true;
      this.playerYaw = an.yaw;
      this.ramRig.root.position.set(this.playerX, this.playerY, this.playerZ);
      this.ramRig.root.rotation.order = 'YXZ';
      this.ramRig.root.rotation.set(0, this.playerYaw, 0);
      this.ramRig.contactShadow.visible = false;
      this.applyAnimalRidingPose(
        this.ramRig,
        an.kind,
        an.gaitPhase,
        THREE.MathUtils.clamp(Math.abs(an.speed) / maxSpeed, 0, 1),
        isDrawingBow,
        elapsed,
        dt
      );
    } else {
      const activeProfile = HERO_PROFILES[this.activeHeroId];
      if (this.input.flyTogglePressed) {
        this.input.flyTogglePressed = false;
        if (activeProfile.canFly && !this.isRamSwimming) {
          this.isFlying = !this.isFlying;
          if (this.isFlying && this.grounded) {
            this.playerY += 1.15;
            this.playerVelY = 4.2;
            this.grounded = false;
          }
          soundEngine.playAstraRelease('VAYAVYASTRA');
          this.emitHud();
        }
      }

      this.ramRig.contactShadow.visible = !this.isFlying;
      this.restoreRamStandingClothes();
      this.ramRig.root.rotation.order = 'YXZ';
      this.ramRig.root.rotation.x = this.isFlying ? THREE.MathUtils.clamp(-my * 0.28, -0.35, 0.35) : 0;

      const preGroundY = this.surfaceHeightAt(this.playerX, this.playerZ);
      const waterSurf = waterSurfaceAt(this.playerX, this.playerZ);
      const waterDepth = waterSurf !== null ? waterSurf - preGroundY : 0;
      const swimming = !this.isFlying && waterSurf !== null && waterDepth > 0.95;
      this.isRamSwimming = swimming;

      _forward.set(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
      _right.set(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));

      _v1.set(0, 0, 0)
        .addScaledVector(_forward, my)
        .addScaledVector(_right, mx);

      let resolvedDist = 0;
      if (mag > 0.08 && _v1.lengthSq() > 0.001) {
        _v1.normalize();
        const moveSpeed = this.isFlying
          ? this.input.sprint
            ? activeProfile.flySpeed * 1.45
            : activeProfile.flySpeed
          : swimming
          ? this.input.sprint
            ? 8.8
            : 5.8
          : this.stealthActive
          ? 6.0
          : this.input.sprint
          ? activeProfile.sprintSpeed
          : activeProfile.walkSpeed;
        const nextX = this.playerX + _v1.x * moveSpeed * mag * dt;
        const nextZ = this.playerZ + _v1.z * moveSpeed * mag * dt;
        if (this.isFlying && this.playerY > preGroundY + 5.5) {
          const clampedX = THREE.MathUtils.clamp(
            nextX,
            WORLD_BOUNDS.minX + 1.5,
            WORLD_BOUNDS.maxX - 1.5
          );
          const clampedZ = THREE.MathUtils.clamp(
            nextZ,
            WORLD_BOUNDS.minZ + 1.5,
            WORLD_BOUNDS.maxZ - 1.5
          );
          this.resolveFloatingIslandXZ(clampedX, clampedZ, 0.58, this.playerY, _staticRes);
          this.playerX = _staticRes.x;
          this.playerZ = _staticRes.z;
          resolvedDist = Math.hypot(this.playerX - prevX, this.playerZ - prevZ);
        } else {
          const resolved = this.moveSweptWithStaticCCD(
            this.playerX,
            this.playerZ,
            nextX,
            nextZ,
            0.58,
            this.playerY,
            false,
            true
          );
          resolvedDist = Math.hypot(resolved.x - this.playerX, resolved.z - this.playerZ);
          this.playerX = resolved.x;
          this.playerZ = resolved.z;
        }

        const targetYaw = this.camYaw + Math.PI;
        let diff = targetYaw - this.playerYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.playerYaw += diff * Math.min(1, 20 * dt);

        const strideLength = swimming
          ? 2.25
          : this.stealthActive
          ? 1.52
          : !this.stealthActive && this.input.sprint && resolvedDist / Math.max(0.001, dt) > 10
          ? 2.32
          : 1.76;
        this.walkPhase += (resolvedDist / strideLength) * Math.PI * 2;
      } else {
        // Keep body oriented with first-person gaze even when turning on the spot
        let diff = this.camYaw + Math.PI - this.playerYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.playerYaw += diff * Math.min(1, 20 * dt);
      }
      this.lastResolvedMoveSpeed = resolvedDist / Math.max(0.001, dt);
      const effectiveMoveIntensity = THREE.MathUtils.clamp(this.lastResolvedMoveSpeed / 4.5, 0, 1);

      const groundY = this.surfaceHeightAt(this.playerX, this.playerZ);
      const postWaterSurf = waterSurfaceAt(this.playerX, this.playerZ);
      const postWaterDepth = postWaterSurf !== null ? postWaterSurf - groundY : 0;
      const activeSwim = !this.isFlying && postWaterSurf !== null && postWaterDepth > 0.95;
      this.isRamSwimming = activeSwim;

      if (this.isFlying) {
        const pitchClimb = my * -Math.sin(this.camPitch) * (this.input.sprint ? 22 : 14);
        const jumpSurge = this.input.jumpPressed ? 11.5 : 0;
        const diveDrop = this.stealthActive ? -9.5 : 0;
        const targetFlyVelY = jumpSurge !== 0 ? jumpSurge : diveDrop !== 0 ? diveDrop : pitchClimb;
        this.input.jumpPressed = false;
        this.playerVelY = THREE.MathUtils.damp(this.playerVelY, targetFlyVelY, 8.0, dt);
        const flyCeil = this.floatingIslandCeilingLimitAt(this.playerX, this.playerY, this.playerZ);
        const maxFlyY = flyCeil !== null ? Math.min(215, Math.max(groundY, flyCeil - 1.75)) : 215;
        this.playerY = THREE.MathUtils.clamp(
          this.playerY + this.playerVelY * dt,
          groundY,
          maxFlyY
        );
        if (flyCeil !== null && this.playerY >= maxFlyY - 0.02 && this.playerVelY > 0) {
          this.playerVelY = 0;
        }
        if (this.playerY <= groundY + 0.05 && this.playerVelY <= -1.2 && !this.input.sprint) {
          this.playerY = groundY;
          this.playerVelY = 0;
          this.grounded = true;
          this.isFlying = false;
        } else {
          this.grounded = false;
        }
        this.flyWindAccum += dt;
        if (this.flyWindAccum >= 0.16 && (this.lastResolvedMoveSpeed > 8 || Math.abs(this.playerVelY) > 2)) {
          this.flyWindAccum = 0;
          this.astraVfx?.spawnSpriteBurst(
            this.playerX,
            this.playerY + 0.4,
            this.playerZ,
            4,
            'GOLD',
            0.9,
            3.5,
            0.35,
            0.45,
            this.qualityManager.getProfile().particleScale
          );
        }
        this.ramRig.root.position.set(this.playerX, this.playerY, this.playerZ);
        this.ramRig.root.rotation.y = this.playerYaw;
        this.applyArticulatedLocomotion(
          this.ramRig,
          this.walkPhase,
          0.18,
          false,
          false,
          isDrawingBow,
          false,
          0.93,
          elapsed,
          dt,
          this.ramPose,
          0.18
        );
      } else if (activeSwim && postWaterSurf !== null) {
        const surfaceSwimY = postWaterSurf - 1.16 + Math.sin(elapsed * 2.4) * 0.04;
        const wantsDive = this.stealthActive || (my > 0.15 && this.camPitch > 0.22);
        const diveVel = wantsDive
          ? -THREE.MathUtils.clamp(
              this.stealthActive ? 3.2 : (this.camPitch - 0.18) * 5.2,
              0.8,
              4.2
            )
          : 0;
        if (this.input.jumpPressed) {
          this.playerVelY = postWaterDepth < 1.55 ? 7.8 : 6.4;
          soundEngine.playMountChariot();
        } else if (wantsDive) {
          this.playerVelY = THREE.MathUtils.damp(this.playerVelY, diveVel, 6.5, dt);
        } else {
          const buoyantPull = this.playerY < surfaceSwimY ? 5.2 : 12.0;
          this.playerVelY += (surfaceSwimY - this.playerY) * buoyantPull * dt;
          this.playerVelY *= Math.exp(-5.0 * dt);
        }
        this.input.jumpPressed = false;
        this.playerY = THREE.MathUtils.clamp(
          this.playerY + this.playerVelY * dt,
          groundY + 0.15,
          postWaterSurf + 1.2
        );
        this.grounded = this.playerY <= groundY + 0.2;
        this.ramWasGrounded = this.grounded;
        this.ramLandingImpact = 0;

        this.ramRig.root.position.set(this.playerX, this.playerY, this.playerZ);
        this.ramRig.root.rotation.y = this.playerYaw;
        const divePitch = this.playerVelY < -0.4 ? Math.min(0.65, -this.playerVelY * 0.14) : 0;
        const targetSwimPitch = 0.25 + effectiveMoveIntensity * 0.55 + divePitch;
        this.swimCamTorsoPitch = THREE.MathUtils.damp(
          this.swimCamTorsoPitch,
          targetSwimPitch,
          7.5,
          dt
        );
        this.applySwimmingPose(this.ramRig, this.walkPhase, effectiveMoveIntensity, elapsed, divePitch, this.ramPose, dt);
      } else {
        this.swimCamTorsoPitch = THREE.MathUtils.damp(this.swimCamTorsoPitch, 0.25, 10, dt);
        if (this.input.jumpPressed && this.grounded) {
          this.playerVelY = activeProfile.jumpVelocity;
          this.grounded = false;
          soundEngine.playMountChariot();
        } else if (this.input.jumpPressed && !this.grounded && activeProfile.canFly && !activeSwim) {
          // Double-jump in mid-air seamlessly ignites Hanuman Flight
          this.isFlying = true;
          this.playerVelY = 4.6;
          soundEngine.playAstraRelease('VAYAVYASTRA');
          this.emitHud();
        } else if (this.grounded && groundY < this.playerY - 0.55) {
          this.grounded = false;
          this.playerVelY = 0;
        }
        this.input.jumpPressed = false;

        if (this.grounded) {
          this.playerY = groundY;
          this.playerVelY = 0;
        } else {
          this.playerVelY -= 24 * dt;
          this.playerY += this.playerVelY * dt;
          const jumpCeil = this.floatingIslandCeilingLimitAt(this.playerX, this.playerY, this.playerZ);
          if (jumpCeil !== null && this.playerY > jumpCeil - 1.75) {
            this.playerY = Math.max(groundY, jumpCeil - 1.75);
            if (this.playerVelY > 0) this.playerVelY = 0;
          }
          if (this.playerY <= groundY) {
            this.playerY = groundY;
            this.playerVelY = 0;
            this.grounded = true;
          }
        }

        if (!this.ramWasGrounded && this.grounded) {
          this.ramLandingImpact = 1.0;
        }
        this.ramLandingImpact *= Math.exp(-11.0 * dt);
        this.ramWasGrounded = this.grounded;

        this.ramRig.root.position.set(this.playerX, this.playerY, this.playerZ);
        this.ramRig.root.rotation.y = this.playerYaw;

        const crouchHipY = this.stealthActive && this.grounded ? 0.81 : 0.93;
        const stealthLean = this.stealthActive && this.grounded ? 0.22 : 0;
        this.applyArticulatedLocomotion(
          this.ramRig,
          this.walkPhase,
          effectiveMoveIntensity,
          !this.stealthActive && this.input.sprint && this.lastResolvedMoveSpeed > 10,
          this.grounded,
          isDrawingBow,
          false,
          crouchHipY,
          elapsed,
          dt,
          this.ramPose,
          stealthLean
        );
      }
    }

    // Track horizontal velocity & turn rate for physics-based hair & cape simulation + ballistic momentum inheritance
    const safeDt = Math.max(0.001, dt);
    const velX = (this.playerX - prevX) / safeDt;
    const velZ = (this.playerZ - prevZ) / safeDt;
    const velMag = Math.hypot(velX, velZ);
    if (velMag > 65 && velMag > 1e-5) {
      const clampScale = 65 / velMag;
      this._projCasterVelScratch.x = velX * clampScale;
      this._projCasterVelScratch.z = velZ * clampScale;
    } else {
      this._projCasterVelScratch.x = velX;
      this._projCasterVelScratch.z = velZ;
    }
    this._projCasterVelScratch.y = THREE.MathUtils.clamp(this.playerVelY, -25, 25);
    this.playerHorizSpeed = velMag;
    let yawDelta = this.playerYaw - prevYaw;
    while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
    while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
    this.playerTurnRate = THREE.MathUtils.damp(
      this.playerTurnRate,
      yawDelta / safeDt,
      10,
      dt
    );
    this.updateHairAndCapePhysics(dt, elapsed);

    // 4. Sharnga Dhanush Bow, Sudarshan Chakra & Divyastra Shoot + Brahmastra Summon Sequence
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.bowDrawHoldTimer = Math.max(0, this.bowDrawHoldTimer - dt);
    this.chakraCooldown = Math.max(0, this.chakraCooldown - dt);
    this.prana = Math.min(
      this.maxPrana,
      this.prana + dt * 5.5 * HERO_PROFILES[this.activeHeroId].pranaRegenMultiplier
    );

    if (!summonLocked && this.input.fireHeld) {
      this.bowDrawHoldTimer = 0.42;
      if (this.fireCooldown <= 0) {
        this.fireCooldown = 0.28;
        this.fireArrow(false, null);
        if (this.stealthActive) {
          this.setStealthMode(false);
        }
      }
    }

    if (this.input.shootAstraPressed) {
      this.input.shootAstraPressed = false;
      const activeAstra = this.astraQuest?.selectedAstra ?? null;
      if (activeAstra && this.astraQuest?.unlocked[activeAstra]) {
        const cfg = ASTRA_CONFIG[activeAstra];
        if (activeAstra === 'BRAHMASTRA') {
          if (
            this.brahmaSummonPhase === 'IDLE' &&
            this.astraCooldowns.BRAHMASTRA <= 0 &&
            this.astraEnergy >= cfg.energyCost
          ) {
            this.startBrahmastraSummon();
          } else if (this.brahmaSummonPhase === 'AIM_READY') {
            this.astraEnergy = Math.max(0, this.astraEnergy - cfg.energyCost);
            this.astraCooldowns.BRAHMASTRA = cfg.cooldownSec;
            this.brahmaSummonPhase = 'IDLE';
            this.brahmaCycloneMood = 0;
            this.astraVfx?.setStormCyclone(0, this.playerX, this.playerZ, 0);
            if (this.astraVfx) this.astraVfx.handLotusRig.group.visible = false;
            soundEngine.setAmbienceDuck(false);
            this.bowDrawHoldTimer = 0.45;
            this.fireArrow(false, 'BRAHMASTRA');
            if (this.stealthActive) this.setStealthMode(false);
          }
        } else if (
          this.brahmaSummonPhase === 'IDLE' &&
          this.astraCooldowns[activeAstra] <= 0 &&
          this.astraEnergy >= cfg.energyCost
        ) {
          this.astraEnergy = Math.max(0, this.astraEnergy - cfg.energyCost);
          this.astraCooldowns[activeAstra] = cfg.cooldownSec;
          this.bowDrawHoldTimer = 0.42;
          this.fireArrow(false, activeAstra);
          if (this.stealthActive) this.setStealthMode(false);
        }
      }
    }

    // Step Brahmastra Summon Sequence (Namaskar -> Raise Hand -> Black Fade -> Cyclone Sky -> Lightning -> Lotus in Hand -> Aim Ready)
    if (this.brahmaSummonPhase !== 'IDLE' && this.brahmaSummonPhase !== 'AIM_READY') {
      this.brahmaSummonTimer -= rawDt;
      const lam = 12;
      if (this.brahmaSummonPhase === 'NAMASKAR') {
        this.ramPose.leftArm = THREE.MathUtils.damp(this.ramPose.leftArm, -0.82, lam, rawDt);
        this.ramPose.rightArm = THREE.MathUtils.damp(this.ramPose.rightArm, -0.82, lam, rawDt);
        this.ramPose.leftArmZ = THREE.MathUtils.damp(this.ramPose.leftArmZ, -0.34, lam, rawDt);
        this.ramPose.rightArmZ = THREE.MathUtils.damp(this.ramPose.rightArmZ, 0.34, lam, rawDt);
        this.ramPose.leftElbow = THREE.MathUtils.damp(this.ramPose.leftElbow, -1.65, lam, rawDt);
        this.ramPose.rightElbow = THREE.MathUtils.damp(this.ramPose.rightElbow, -1.65, lam, rawDt);
        if (this.brahmaSummonTimer <= 0) {
          this.brahmaSummonPhase = 'RAISE_HAND';
          this.brahmaSummonTimer = 1.15;
        }
      } else if (this.brahmaSummonPhase === 'RAISE_HAND') {
        this.ramPose.leftArm = THREE.MathUtils.damp(this.ramPose.leftArm, -0.1, lam, rawDt);
        this.ramPose.leftArmZ = THREE.MathUtils.damp(this.ramPose.leftArmZ, 0, lam, rawDt);
        this.ramPose.leftElbow = THREE.MathUtils.damp(this.ramPose.leftElbow, -0.44, lam, rawDt);
        this.ramPose.rightArm = THREE.MathUtils.damp(this.ramPose.rightArm, -2.88, lam, rawDt);
        this.ramPose.rightArmZ = THREE.MathUtils.damp(this.ramPose.rightArmZ, 0.08, lam, rawDt);
        this.ramPose.rightElbow = THREE.MathUtils.damp(this.ramPose.rightElbow, -0.14, lam, rawDt);
        this.ramPose.torsoRotX = THREE.MathUtils.damp(this.ramPose.torsoRotX, -0.16, lam, rawDt);
        if (this.brahmaSummonTimer <= 0) {
          this.brahmaSummonPhase = 'BLACK_FADE';
          this.brahmaSummonTimer = 0.35;
        }
      } else if (this.brahmaSummonPhase === 'BLACK_FADE') {
        this.brahmaFadeAlpha = Math.min(1, this.brahmaFadeAlpha + rawDt * 3.4);
        this.ramPose.rightArm = -2.88;
        this.ramPose.rightElbow = -0.14;
        if (this.brahmaSummonTimer <= 0) {
          this.brahmaSummonPhase = 'CYCLONE_SKY';
          this.brahmaSummonTimer = 1.45;
          this.brahmaCycloneMood = 1.0;
          this.astraVfx?.setStormCyclone(1.0, this.playerX, this.playerZ, 0.85);
          soundEngine.playCycloneWind(2.4);
          soundEngine.playThunderClap(0.55);
        }
      } else if (this.brahmaSummonPhase === 'CYCLONE_SKY') {
        this.brahmaFadeAlpha = Math.max(0, this.brahmaFadeAlpha - rawDt * 3.2);
        this.ramPose.rightArm = -2.88;
        this.ramPose.rightElbow = -0.14;
        if (Math.random() < rawDt * 3.5) {
          this.astraVfx?.setStormCyclone(1.0, this.playerX, this.playerZ, 0.9);
        }
        if (this.brahmaSummonTimer <= 0) {
          this.brahmaSummonPhase = 'LIGHTNING_STRIKE';
          this.brahmaSummonTimer = 0.65;
          this.brahmaLightningFired = false;
        }
      } else if (this.brahmaSummonPhase === 'LIGHTNING_STRIKE') {
        this.ramPose.rightArm = -2.88;
        this.ramPose.rightElbow = -0.14;
        this.ramPose.torsoRotX = -0.14;
        if (!this.brahmaLightningFired) {
          this.brahmaLightningFired = true;
          this.ramRig.root.updateMatrixWorld(true);
          if (this.ramRig.rightHandAnchor) {
            this.ramRig.rightHandAnchor.getWorldPosition(_v1);
          } else {
            _v1.set(this.playerX, this.playerY + 2.35, this.playerZ);
          }
          this.astraVfx?.spawnLightningBolt(_v1.x + 2.5, _v1.y + 62, _v1.z - 2.0, _v1.x, _v1.y, _v1.z);
          this.astraVfx?.spawnSpriteBurst(_v1.x, _v1.y, _v1.z, 26, 'GOLD', 3.0, 12.0, 0.9, 0.85, this.qualityManager.getProfile().particleScale);
          this.astraVfx?.triggerFlashLight(_v1.x, _v1.y + 0.5, _v1.z, 0xffe484, 22, this.qualityManager.getTier());
          this.brahmaFlashAlpha = 1.0;
          this.cameraShakeAmount = Math.max(this.cameraShakeAmount, 0.9);
          soundEngine.playThunderClap(1.0);
          const tierNow = this.qualityManager.getTier();
          if (tierNow !== 'LOW') {
            this.slowMoTimer = ASTRA_CONFIG.BRAHMASTRA.slowMoDurationSec;
            this.slowMoFactor = ASTRA_CONFIG.BRAHMASTRA.slowMoFactor;
          }
          if (this.astraVfx) {
            this.astraVfx.handLotusRig.group.visible = true;
          }
        }
        if (this.brahmaSummonTimer <= 0) {
          this.brahmaSummonPhase = 'LOTUS_APPEAR';
          this.brahmaSummonTimer = 0.85;
        }
      } else if (this.brahmaSummonPhase === 'LOTUS_APPEAR') {
        this.ramPose.leftArm = THREE.MathUtils.damp(this.ramPose.leftArm, -1.16, 10, rawDt);
        this.ramPose.leftElbow = THREE.MathUtils.damp(this.ramPose.leftElbow, -0.32, 10, rawDt);
        this.ramPose.rightArm = THREE.MathUtils.damp(this.ramPose.rightArm, -0.68, 10, rawDt);
        this.ramPose.rightArmZ = THREE.MathUtils.damp(this.ramPose.rightArmZ, 0, 10, rawDt);
        this.ramPose.rightElbow = THREE.MathUtils.damp(this.ramPose.rightElbow, -1.24, 10, rawDt);
        this.ramPose.torsoRotX = THREE.MathUtils.damp(this.ramPose.torsoRotX, 0, 10, rawDt);
        if (this.brahmaSummonTimer <= 0) {
          this.brahmaSummonPhase = 'AIM_READY';
        }
      }
      // Apply summon upper-body arm/torso transforms directly onto RamRig
      this.ramRig.leftArm.rotation.set(this.ramPose.leftArm, 0, this.ramPose.leftArmZ);
      this.ramRig.rightArm.rotation.set(this.ramPose.rightArm, 0, this.ramPose.rightArmZ);
      this.ramRig.leftElbow.rotation.x = this.ramPose.leftElbow;
      this.ramRig.rightElbow.rotation.x = this.ramPose.rightElbow;
      this.ramRig.torso.rotation.x = this.ramPose.torsoRotX;
    }

    // Position summoned Golden Lotus Brahmastra cleanly inside Ram's right palm
    if (this.astraVfx && this.astraVfx.handLotusRig.group.visible) {
      this.ramRig.root.updateMatrixWorld(true);
      if (this.ramRig.rightHandAnchor) {
        this.ramRig.rightHandAnchor.getWorldPosition(_v1);
        this.astraVfx.handLotusRig.group.position.copy(_v1);
      } else {
        this.astraVfx.handLotusRig.group.position.set(this.playerX, this.playerY + 1.5, this.playerZ);
      }
      this.astraVfx.handLotusRig.group.rotation.set(
        this.brahmaSummonPhase === 'AIM_READY' ? 0 : -Math.PI * 0.45,
        this.playerYaw,
        0
      );
    }

    // Toggle Sharnga Dhanush between Hand-Drawn and Back-Slung (strictly empty-handed during NAMASKAR..LIGHTNING_STRIKE)
    const emptyHandsSummon =
      this.brahmaSummonPhase === 'NAMASKAR' ||
      this.brahmaSummonPhase === 'RAISE_HAND' ||
      this.brahmaSummonPhase === 'BLACK_FADE' ||
      this.brahmaSummonPhase === 'CYCLONE_SKY' ||
      this.brahmaSummonPhase === 'LIGHTNING_STRIKE';
    const showDrawnBow =
      !emptyHandsSummon &&
      (this.input.fireHeld || this.bowDrawHoldTimer > 0 || this.brahmaSummonPhase === 'AIM_READY' || this.brahmaSummonPhase === 'LOTUS_APPEAR');
    if (this.ramRig.bowGroup) this.ramRig.bowGroup.visible = showDrawnBow;
    this.syncRigVisibilityForPerspective(showDrawnBow);

    if (!summonLocked && this.input.astraPressed) {
      this.input.astraPressed = false;
      if (this.chakraCooldown <= 0) {
        this.chakraCooldown = this.chakraMaxCooldown;
        this.fireArrow(true, null);
        if (this.stealthActive) {
          this.setStealthMode(false);
        }
      }
    }

    this.heroAbilityCooldown = Math.max(0, this.heroAbilityCooldown - dt);
    if (!summonLocked && this.input.heroSpecialPressed) {
      this.input.heroSpecialPressed = false;
      if (this.heroAbilityCooldown <= 0) {
        this.executeHeroSpecialAbility();
      }
    }

    // 5. Projectiles Update, Unique Weapon Kinematics & Continuous Segment Collision Detection (CCD)
    this._projCasterScratch.x = this.playerX;
    this._projCasterScratch.y = this.playerY;
    this._projCasterScratch.z = this.playerZ;
    this.projectileSync.maybeSyncActors(this._projCasterScratch, this.enemies);

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.serverRejected) {
        this.poolManager.release(p.poolKey, p.mesh);
        swapRemoveAt(this.projectiles, i);
        continue;
      }
      p.life -= dt;

      // Resolve homing target coordinates for Nagastra split serpents & lock-on Chakra without allocating
      let tgtPos: Vec3Like | null = null;
      if (p.isSplitSerpent || (p.isChakra && p.homingTargetId)) {
        let tgt: EnemyEntity | null = null;
        if (p.homingTargetId) {
          for (let ei = 0; ei < this.enemies.length; ei++) {
            const candidate = this.enemies[ei];
            if (
              candidate.alive &&
              candidate.id === p.homingTargetId &&
              !(p.piercedEnemyIds && p.piercedEnemyIds.has(candidate.id))
            ) {
              tgt = candidate;
              break;
            }
          }
        }
        if (!tgt && p.isSplitSerpent) {
          let bestSq = 400;
          for (let ei = 0; ei < this.enemies.length; ei++) {
            const c = this.enemies[ei];
            if (!c.alive) continue;
            const dSq = (c.x - p.x) * (c.x - p.x) + (c.z - p.z) * (c.z - p.z);
            if (dSq < bestSq) {
              bestSq = dSq;
              tgt = c;
            }
          }
          p.homingTargetId = tgt ? tgt.id : null;
        }
        if (tgt) {
          this._projTargetScratch.x = tgt.x;
          this._projTargetScratch.y = tgt.y;
          this._projTargetScratch.z = tgt.z;
          tgtPos = this._projTargetScratch;
        }
      }

      const ax = p.x;
      const ay = p.y;
      const az = p.z;

      // Step shared deterministic per-weapon kinematics (ballistic arrow, Chakra boomerang, elemental waves/drills)
      const ks = this._projKinScratch;
      ks.archetype = p.archetype;
      ks.x = ax;
      ks.y = ay;
      ks.z = az;
      ks.vx = p.vx;
      ks.vy = p.vy;
      ks.vz = p.vz;
      ks.elapsedSec = p.elapsedFlightSec;
      ks.spinAngle = p.spinAngle;

      stepProjectileKinematics(ks, dt, tgtPos, this._projCasterScratch);

      p.vx = ks.vx;
      p.vy = ks.vy;
      p.vz = ks.vz;
      p.elapsedFlightSec = ks.elapsedSec;
      p.spinAngle = ks.spinAngle;

      const bx = ks.x;
      const by = ks.y;
      const bz = ks.z;

      const profile = PROJECTILE_PHYSICS_REGISTRY[p.archetype];

      // Check boomerang return catch for Sudarshan Chakra after outbound arc
      if (
        p.isChakra &&
        p.elapsedFlightSec >= profile.returnAfterSec &&
        Math.hypot(bx - this.playerX, bz - this.playerZ) <= profile.returnCatchRadius
      ) {
        this.projectileSync.validateImpact(
          p.clientShotId,
          p.archetype,
          p.elapsedFlightSec,
          'CASTER_RETURN',
          { x: bx, y: by, z: bz },
          null,
          this._projCasterScratch,
          [],
          p.homingTargetId ?? null,
          [],
          (res, rec) => this.reconcileServerImpact(res, rec),
          {
            casterVel: this._projCasterVelScratch,
            strikeIndex: p.strikeCount ?? 0,
            isFinalImpact: true,
          }
        );
        this.poolManager.release(p.poolKey, p.mesh);
        swapRemoveAt(this.projectiles, i);
        continue;
      }

      let bestT = 2.0;
      let hitEnemy: EnemyEntity | null = null;
      let hitEnvironment = false;

      // A. Continuous Ray-Segment vs Enemy Bounding Capsules (matching server capsule test)
      const segDx = bx - ax;
      const segDy = by - ay;
      const segDz = bz - az;
      const segLenSq = segDx * segDx + segDy * segDy + segDz * segDz;

      for (let eIdx = 0; eIdx < this.enemies.length; eIdx++) {
        const e = this.enemies[eIdx];
        if (!e.alive) continue;
        if (p.piercedEnemyIds && p.piercedEnemyIds.has(e.id)) continue;
        const scale = (e.isCommander ? 1.38 : 1.06) * e.customScale;
        const capR = 0.68 * scale + profile.hitRadius;
        const minY = e.y + 0.1;
        const maxY = e.y + 2.1 * scale;
        const t = intersectSegmentCapsule(
          ax,
          ay,
          az,
          bx,
          by,
          bz,
          e.x,
          e.z,
          capR,
          minY,
          maxY
        );
        if (t !== null && t < bestT) {
          bestT = t;
          hitEnemy = e;
          hitEnvironment = false;
        }
      }

      // B & C. Continuous Ray-Segment vs Spatial-Hashed Static OBBs & Cylinders
      const grid = this.colliderGrid;
      if (grid) {
        grid.queryAABB(
          Math.min(ax, bx) - 0.1,
          Math.max(ax, bx) + 0.1,
          Math.min(az, bz) - 0.1,
          Math.max(az, bz) + 0.1
        );
        const outB = grid.outBoxes;
        const outBLen = grid.outBoxesLength;
        for (let c = 0; c < outBLen; c++) {
          const tHit = this.raySegmentIntersectsOBB(
            ax,
            ay,
            az,
            bx,
            by,
            bz,
            this.colliders[outB[c]]
          );
          if (tHit !== null && tHit < bestT) {
            bestT = tHit;
            hitEnemy = null;
            hitEnvironment = true;
          }
        }

        if (segLenSq > 1e-7) {
          const outC = grid.outCircles;
          const outCLen = grid.outCirclesLength;
          for (let c = 0; c < outCLen; c++) {
            const cc = this.circleColliders[outC[c]];
            const baseY = cc.baseY ?? 0;
            const tHit = this.raySegmentIntersectsCylinder(
              ax,
              ay,
              az,
              bx,
              by,
              bz,
              cc.x,
              cc.z,
              cc.radius,
              baseY,
              baseY + cc.height
            );
            if (tHit !== null && tHit < bestT) {
              bestT = tHit;
              hitEnemy = null;
              hitEnvironment = true;
            }
          }
        }
      }

      // D. Swept Terrain & Floating Island Heightfield Check
      for (let s = 1; s <= 4; s++) {
        const ts = s / 4;
        if (ts >= bestT) break;
        const sx = ax + segDx * ts;
        const sy = ay + segDy * ts;
        const sz = az + segDz * ts;
        if (
          sy <= groundHeightAt(sx, sz) ||
          this.isPointInsideFloatingIslandSolid(sx, sy, sz)
        ) {
          bestT = ts;
          hitEnemy = null;
          hitEnvironment = true;
          break;
        }
      }

      if (bestT <= 1.0) {
        const hitX = ax + segDx * bestT;
        const hitY = Math.max(
          groundHeightAt(hitX, az + segDz * bestT) + 0.08,
          ay + segDy * bestT
        );
        const hitZ = az + segDz * bestT;
        p.x = hitX;
        p.y = hitY;
        p.z = hitZ;
        p.mesh.position.set(hitX, hitY, hitZ);

        const dmgMult =
          (p.stealthAmbush ? 2.0 : 1.0) * HERO_PROFILES[this.activeHeroId].attackDamageMultiplier;
        if (p.isRemoteVisualOnly) {
          this.resolveRemoteAstraVisualImpact(p, hitX, hitY, hitZ);
          this.poolManager.release(p.poolKey, p.mesh);
          swapRemoveAt(this.projectiles, i);
          continue;
        }
        const optimisticHits: OptimisticDamageRecord[] = [];
        const nearbySnap = this.projectileSync.buildNearbySnapshots(
          hitX,
          hitZ,
          this.enemies
        );

        let keepPiercingFlight = false;
        const strikeIndex = p.strikeCount ?? 0;

        if (p.astraId) {
          this.resolveAstraImpact(p, hitX, hitY, hitZ, hitEnemy, optimisticHits);
        } else if (hitEnemy) {
          if (p.isChakra) {
            this.spawnBlast(hitX, hitY, hitZ, 0xff5a12);
            const aoeSq = profile.aoeRadius * profile.aoeRadius;
            for (let eIdx = 0; eIdx < this.enemies.length; eIdx++) {
              const other = this.enemies[eIdx];
              if (!other.alive) continue;
              if (p.piercedEnemyIds && p.piercedEnemyIds.has(other.id)) continue;
              const odx = other.x - hitX;
              const odz = other.z - hitZ;
              if (odx * odx + odz * odz <= aoeSq) {
                const dmg = Math.round(
                  (other === hitEnemy ? profile.directDamage : profile.splashDamage) *
                    dmgMult
                );
                const killed = this.damageEnemy(other, dmg, 'CHAKRA');
                p.piercedEnemyIds?.add(other.id);
                optimisticHits.push({
                  enemyId: other.id,
                  damage: dmg,
                  karmaAwarded: 0,
                  wasKilledByShot: killed,
                });
              }
            }
            p.piercedEnemyIds?.add(hitEnemy.id);
            p.strikeCount = strikeIndex + 1;
            keepPiercingFlight = p.strikeCount < profile.maxImpactHits;
          } else {
            const dmg = Math.round(profile.directDamage * dmgMult);
            const killed = this.damageEnemy(hitEnemy, dmg, 'STANDARD');
            const karmaGain = p.stealthAmbush ? 15 : 0;
            if (karmaGain > 0) this.karma += karmaGain;
            optimisticHits.push({
              enemyId: hitEnemy.id,
              damage: dmg,
              karmaAwarded: karmaGain,
              wasKilledByShot: killed,
            });
            this.spawnBlast(hitX, hitY, hitZ, p.stealthAmbush ? 0x58a6ff : 0xf6c343);
          }
        } else if (hitEnvironment) {
          this.astraQuest?.onPlayerArrowHitPoint(hitX, hitY, hitZ, null);
          if (p.isChakra) {
            this.spawnBlast(hitX, hitY, hitZ, 0xff5a12);
            const aoeSq = profile.aoeRadius * profile.aoeRadius;
            for (let eIdx = 0; eIdx < this.enemies.length; eIdx++) {
              const other = this.enemies[eIdx];
              if (!other.alive) continue;
              if (p.piercedEnemyIds && p.piercedEnemyIds.has(other.id)) continue;
              const odx = other.x - hitX;
              const odz = other.z - hitZ;
              if (odx * odx + odz * odz <= aoeSq) {
                const dmg = Math.round(profile.splashDamage * dmgMult);
                const killed = this.damageEnemy(other, dmg, 'CHAKRA');
                p.piercedEnemyIds?.add(other.id);
                optimisticHits.push({
                  enemyId: other.id,
                  damage: dmg,
                  karmaAwarded: 0,
                  wasKilledByShot: killed,
                });
              }
            }
          } else {
            this.spawnBlast(hitX, hitY, hitZ, 0xe8c47a);
          }
        }

        const isFinalImpact = !keepPiercingFlight;
        this.projectileSync.validateImpact(
          p.clientShotId,
          p.archetype,
          p.elapsedFlightSec,
          hitEnemy ? 'ENEMY' : 'ENVIRONMENT',
          { x: hitX, y: hitY, z: hitZ },
          hitEnemy ? hitEnemy.id : null,
          this._projCasterScratch,
          nearbySnap,
          p.homingTargetId ?? null,
          optimisticHits,
          (res, rec) => this.reconcileServerImpact(res, rec),
          {
            casterVel: this._projCasterVelScratch,
            strikeIndex,
            isFinalImpact,
          }
        );

        if (keepPiercingFlight) {
          // Advance Chakra slightly past struck capsule so next frame doesn't re-collide cleanly
          p.x = bx;
          p.y = by;
          p.z = bz;
          p.mesh.position.set(p.x, p.y, p.z);
        } else {
          this.poolManager.release(p.poolKey, p.mesh);
          swapRemoveAt(this.projectiles, i);
          continue;
        }
      }

      p.x = bx;
      p.y = by;
      p.z = bz;
      p.mesh.position.set(p.x, p.y, p.z);
      if (!p.isChakra) {
        p.mesh.lookAt(p.x + p.vx, p.y + p.vy, p.z + p.vz);
      }
      if (p.astraId === 'AGNEYASTRA') {
        const uData = p.mesh.userData;
        if (uData.mandalaMain) (uData.mandalaMain as THREE.Mesh).rotation.z += dt * 7.8;
        if (uData.mandalaInner) (uData.mandalaInner as THREE.Mesh).rotation.z -= dt * 11.5;
        if (uData.mandalaSide) (uData.mandalaSide as THREE.Mesh).rotation.z += dt * 9.0;
        const mMats = uData.mandalaMats as THREE.ShaderMaterial[] | undefined;
        if (mMats) {
          for (let mi = 0; mi < mMats.length; mi++) {
            mMats[mi].uniforms.uTime.value = elapsed;
          }
        }
        const qProfile = this.qualityManager.getProfile();
        const cDx = p.x - camX;
        const cDz = p.z - camZ;
        if (cDx * cDx + cDz * cDz <= 14400) {
          this.combatLight.color.setHex(0xff6b1c);
          this.combatLight.position.set(p.x, p.y + 0.4, p.z);
          this.combatLight.intensity = 11.5 + Math.sin(elapsed * 26) * 2.0;
          this.astraVfx?.updateAgniHeatLight(p.x, p.y, p.z, elapsed, 17.5, qProfile.tier);
        }
        if (Math.random() < dt * 26 * qProfile.particleScale) {
          this.astraVfx?.spawnSpriteBurst(
            p.x,
            p.y,
            p.z,
            1,
            'EMBER',
            0.6,
            3.2,
            0.56,
            0.42,
            1
          );
        }
        // Magnetic radial heat vortex pull on nearby enemies toward flying Agniastra center
        const pullMaxR = profile.heatPullRadius > 0 ? profile.heatPullRadius : 11.5;
        const pullMaxRSq = pullMaxR * pullMaxR;
        for (let eIdx = 0; eIdx < this.enemies.length; eIdx++) {
          const e = this.enemies[eIdx];
          if (!e.alive) continue;
          const pdx = p.x - e.x;
          const pdz = p.z - e.z;
          const pdSq = pdx * pdx + pdz * pdz;
          if (pdSq <= pullMaxRSq && pdSq > 0.35) {
            const pd = Math.sqrt(pdSq);
            const pullStep = 13.0 * (1 - pd / (pullMaxR + 1.5)) * dt;
            const er = e.isCommander ? 0.92 : 0.68;
            const res = this.moveSweptWithStaticCCD(
              e.x,
              e.z,
              e.x + (pdx / pd) * pullStep,
              e.z + (pdz / pd) * pullStep,
              er,
              e.y,
              true
            );
            e.x = res.x;
            e.z = res.z;
          }
        }
      }
      if (p.spinPivot) {
        p.spinPivot.rotation.y = p.spinAngle;
        const cDx = p.x - camX;
        const cDz = p.z - camZ;
        if (cDx * cDx + cDz * cDz <= 14400) {
          this.combatLight.color.setHex(0xff6b1c);
          this.combatLight.position.set(p.x, p.y + 0.4, p.z);
          this.combatLight.intensity = 6.5;
        }
      }

      if (p.life <= 0) {
        const expY = Math.max(p.y, groundHeightAt(p.x, p.z) + 0.2);
        if (p.isRemoteVisualOnly) {
          this.resolveRemoteAstraVisualImpact(p, p.x, expY, p.z);
          this.poolManager.release(p.poolKey, p.mesh);
          swapRemoveAt(this.projectiles, i);
          continue;
        }
        const optimisticHits: OptimisticDamageRecord[] = [];
        const nearbySnap = this.projectileSync.buildNearbySnapshots(
          p.x,
          p.z,
          this.enemies
        );

        if (p.astraId) {
          this.resolveAstraImpact(p, p.x, expY, p.z, null, optimisticHits);
        } else if (p.isChakra) {
          this.spawnBlast(
            p.x,
            Math.max(p.y, groundHeightAt(p.x, p.z) + 0.5),
            p.z,
            0xff5a12
          );
          const aoeSq = profile.aoeRadius * profile.aoeRadius;
          for (let eIdx = 0; eIdx < this.enemies.length; eIdx++) {
            const other = this.enemies[eIdx];
            if (!other.alive) continue;
            if (p.piercedEnemyIds && p.piercedEnemyIds.has(other.id)) continue;
            const odx = other.x - p.x;
            const odz = other.z - p.z;
            if (odx * odx + odz * odz <= aoeSq) {
              const dmg = Math.round(
                (p.stealthAmbush ? 144 : profile.splashDamage) *
                  HERO_PROFILES[this.activeHeroId].attackDamageMultiplier
              );
              const killed = this.damageEnemy(other, dmg, 'CHAKRA');
              optimisticHits.push({
                enemyId: other.id,
                damage: dmg,
                karmaAwarded: 0,
                wasKilledByShot: killed,
              });
            }
          }
        }

        this.projectileSync.validateImpact(
          p.clientShotId,
          p.archetype,
          p.elapsedFlightSec,
          'EXPIRED',
          { x: p.x, y: expY, z: p.z },
          null,
          this._projCasterScratch,
          nearbySnap,
          p.homingTargetId ?? null,
          optimisticHits,
          (res, rec) => this.reconcileServerImpact(res, rec),
          {
            casterVel: this._projCasterVelScratch,
            strikeIndex: p.strikeCount ?? 0,
            isFinalImpact: true,
          }
        );

        this.poolManager.release(p.poolKey, p.mesh);
        swapRemoveAt(this.projectiles, i);
      }
    }

    // 6. Blast Visuals (Pooled, O(1) swap-remove)
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      b.life -= dt;
      const t = 1 - b.life / b.maxLife;
      b.mesh.scale.setScalar(0.5 + t * 4.5);
      (b.mesh.material as THREE.MeshPhysicalMaterial).opacity = Math.max(0, 0.75 * (1 - t));
      if (b.life <= 0) {
        this.poolManager.release('blast', b.mesh);
        swapRemoveAt(this.blasts, i);
      }
    }

    // Compact defeated & fully incinerated enemies (rigs already returned to Demon Pool)
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!this.enemies[i].alive && !this.enemies[i].dissolving) {
        swapRemoveAt(this.enemies, i);
      }
    }

    // 7. Five-Variant Demon AI, Unique Abilities, Enemy Projectiles & Ground Hazards
    //    Absolute Boundary Enforcement: Demons spawn & patrol ONLY inside the 5 km Demon Badlands (x >= DEMON_ZONE_MIN_X)
    const isLanClient = Boolean(this.lanClient?.isClientInMatch());
    this.spawnTimer += dt;
    const activeAlive = this.enemies.length;
    if (
      !isLanClient &&
      this.spawnTimer > 5.5 &&
      activeAlive < 14 + this.wantedLevel * 2 &&
      this.playerX >= DEMON_ZONE_MIN_X - 40
    ) {
      this.spawnTimer = 0;
      const angle = Math.random() * Math.PI * 2;
      const rx = THREE.MathUtils.clamp(
        this.playerX + Math.cos(angle) * 44,
        DEMON_ZONE_MIN_X + 15,
        WORLD_BOUNDS.maxX - 80
      );
      const rz = THREE.MathUtils.clamp(
        this.playerZ + Math.sin(angle) * 44,
        -240,
        240
      );
      if (!isInRiverWater(rx, rz)) {
        const v = DEMON_VARIANTS[Math.floor(Math.random() * DEMON_VARIANTS.length)];
        this.spawnEnemy(rx, rz, this.wantedLevel >= 4 && Math.random() < 0.22, null, v);
      }
    }

    if (this.astraVfx && this.astraVfx.agniMandalas.length > 0) {
      const am = this.astraVfx.agniMandalas[this.astraVfx.agniMandalas.length - 1];
      const cDx = am.x - camX;
      const cDz = am.z - camZ;
      if (cDx * cDx + cDz * cDz <= 14400) {
        const tierNow = this.qualityManager.getTier();
        const fade = Math.min(1, Math.max(0, am.life / 0.6));
        this.astraVfx.updateAgniHeatLight(am.x, am.y + 1.0, am.z, elapsed, 20.0 * fade, tierNow);
        this.combatLight.color.setHex(0xff6b1c);
        this.combatLight.position.set(am.x, am.y + 1.2, am.z);
        this.combatLight.intensity = 10.5 * fade;
      }
    }

    let spottedByAny = false;
    const detectConeDist = this.mountedChariotIndex !== null ? 8.0 : 6.0;

    for (let eIdx = 0; eIdx < this.enemies.length; eIdx++) {
      const e = this.enemies[eIdx];
      if (!e.alive) {
        if (e.dissolving) {
          e.dissolveTimer -= dt;
          const progress = THREE.MathUtils.clamp(
            1 - e.dissolveTimer / Math.max(0.01, e.dissolveDuration),
            0,
            1
          );
          const dUniforms = e.rig.root.userData._dissolveUniforms as
            | EnemyDissolveUniforms
            | undefined;
          if (dUniforms) {
            dUniforms.uDissolve.value = progress;
            dUniforms.uHeatGlow.value = 1.0;
            dUniforms.uDissolveTime.value = elapsed;
          }
          const defaultShadowOpacity =
            typeof e.rig.contactShadow.userData._defaultOpacity === 'number'
              ? (e.rig.contactShadow.userData._defaultOpacity as number)
              : 0.85;
          (e.rig.contactShadow.material as THREE.MeshBasicMaterial).opacity =
            defaultShadowOpacity * (1 - progress);

          e.dissolveSparkAccum += dt;
          if (e.dissolveSparkAccum >= 0.14) {
            e.dissolveSparkAccum = 0;
            this.astraVfx?.spawnAshIncinerationBurst(
              e.x,
              e.y,
              e.z,
              e.customScale * (e.isCommander ? 1.35 : 1.0),
              this.qualityManager.getProfile().particleScale
            );
          }

          if (e.dissolveTimer <= 0) {
            e.dissolving = false;
            e.rig.root.scale.setScalar(1);
            this.poolManager.release(
              this.demonPoolKey(e.variant, e.isCommander),
              e.rig
            );
          }
        }
        continue;
      }

      if (summonLocked) {
        // Dramatically freeze all surrounding enemies during Brahmastra summon chant & lightning
        continue;
      }

      if (isLanClient) {
        // On LAN Clients, smoothly interpolate enemy positions & facing from Host authoritative snapshot
        if (
          e.syncTargetX !== undefined &&
          e.syncTargetY !== undefined &&
          e.syncTargetZ !== undefined &&
          e.syncTargetYaw !== undefined
        ) {
          const prevX = e.x;
          const prevZ = e.z;
          const eAlpha = 1 - Math.exp(-14 * dt);
          e.x = THREE.MathUtils.lerp(e.x, e.syncTargetX, eAlpha);
          e.y = THREE.MathUtils.lerp(e.y, e.syncTargetY, eAlpha);
          e.z = THREE.MathUtils.lerp(e.z, e.syncTargetZ, eAlpha);
          e.yaw = dampAngle(e.yaw, e.syncTargetYaw, 14, dt);
          const moved = Math.hypot(e.x - prevX, e.z - prevZ);
          const spdNorm = THREE.MathUtils.clamp(moved / Math.max(0.001, dt) / 5.5, 0, 1);
          if (spdNorm > 0.05) e.walkPhase += (moved / 1.5) * Math.PI * 2;
          if (e.variant !== 'BOAR_DEMON' && e.variant !== 'SHADOW_GHOST') {
            this.applyArticulatedLocomotion(
              e.rig,
              e.walkPhase,
              spdNorm,
              false,
              true,
              false,
              true,
              e.variant === 'RABBIT_DEMON' ? 0.88 : 0.96,
              elapsed,
              dt,
              e.pose
            );
          }
        }
        continue;
      }

      // Active Agneyastra Fiery Circular Mandala Vortex Pull, Dynamic Radial Heat & DoT
      let insideAgniMandala = false;
      if (this.astraVfx && this.astraVfx.agniMandalas.length > 0) {
        for (let mi = 0; mi < this.astraVfx.agniMandalas.length; mi++) {
          const am = this.astraVfx.agniMandalas[mi];
          const mdx = am.x - e.x;
          const mdz = am.z - e.z;
          const mDistSq = mdx * mdx + mdz * mdz;
          if (mDistSq <= am.pullRadius * am.pullRadius) {
            insideAgniMandala = true;
            if (mDistSq > 0.45) {
              const mDist = Math.sqrt(mDistSq);
              const pullStep = 7.4 * (1 - mDist / (am.pullRadius + 1.2)) * dt;
              const er = e.isCommander ? 0.92 : 0.68;
              const res = this.moveSweptWithStaticCCD(
                e.x,
                e.z,
                e.x + (mdx / mDist) * pullStep,
                e.z + (mdz / mDist) * pullStep,
                er,
                e.y,
                true
              );
              e.x = res.x;
              e.z = res.z;
            }
            e.burnTimer = Math.max(e.burnTimer, 0.4);
            e.burnDps = Math.max(e.burnDps, am.dps);
            const agniTickDmg = am.dps * dt;
            this.damageEnemy(e, agniTickDmg, 'AGNEYASTRA');
            am.optimisticDmg.set(e.id, (am.optimisticDmg.get(e.id) ?? 0) + agniTickDmg);
            if (!e.alive) break;
          }
        }
        if (!e.alive) continue;
      }

      // Sync pre-dissolution heat shimmer glow on burning enemies
      const liveDissolveUniforms = e.rig.root.userData._dissolveUniforms as
        | EnemyDissolveUniforms
        | undefined;
      if (liveDissolveUniforms) {
        const targetHeat = insideAgniMandala
          ? 0.85
          : e.burnTimer > 0 && e.lastDamageSource === 'AGNEYASTRA'
          ? 0.52
          : 0;
        liveDissolveUniforms.uHeatGlow.value = THREE.MathUtils.damp(
          liveDissolveUniforms.uHeatGlow.value,
          targetHeat,
          8.0,
          dt
        );
        if (liveDissolveUniforms.uHeatGlow.value > 0.01) {
          liveDissolveUniforms.uDissolveTime.value = elapsed;
        }
      }

      // Elemental Burn / Venom DoT & Naga Bind / Vayu Tornado Lift
      if (e.burnTimer > 0) {
        e.burnTimer = Math.max(0, e.burnTimer - dt);
        e.burnSparkAccum += dt;
        if (e.burnDps > 0) {
          this.damageEnemy(e, e.burnDps * dt, e.lastDamageSource);
          if (!e.alive) continue;
        }
        if (e.burnSparkAccum >= 0.25) {
          e.burnSparkAccum = 0;
          this.astraVfx?.spawnSpriteBurst(
            e.x,
            e.y + 1.1,
            e.z,
            2,
            'EMBER',
            0.5,
            2.5,
            0.48,
            0.45,
            this.qualityManager.getProfile().particleScale
          );
        }
      }

      let pulledByTornado = false;
      if (this.astraVfx && this.astraVfx.tornados.length > 0) {
        for (let ti = 0; ti < this.astraVfx.tornados.length; ti++) {
          const tn = this.astraVfx.tornados[ti];
          const tdx = tn.x - e.x;
          const tdz = tn.z - e.z;
          const tDist = Math.hypot(tdx, tdz);
          if (tDist <= tn.radius) {
            pulledByTornado = true;
            const pullSpd = 6.5 * dt;
            if (tDist > 0.6) {
              e.x += (tdx / tDist) * pullSpd;
              e.z += (tdz / tDist) * pullSpd;
            }
            const targetLift = tn.liftHeight * (1 - (tDist / tn.radius) * 0.35);
            e.liftOffset = THREE.MathUtils.damp(e.liftOffset, targetLift, 4.5, dt);
            e.yaw += dt * 7.5;
            const vayuTickDmg = tn.dps * dt;
            this.damageEnemy(e, vayuTickDmg, 'VAYAVYASTRA');
            tn.optimisticDmg.set(e.id, (tn.optimisticDmg.get(e.id) ?? 0) + vayuTickDmg);
            if (!e.alive) break;
          }
        }
        if (!e.alive) continue;
      }
      if (!pulledByTornado && e.liftOffset > 0.01) {
        e.liftOffset = THREE.MathUtils.damp(e.liftOffset, 0, 6.0, dt);
      }

      if (e.bindTimer > 0) e.bindTimer = Math.max(0, e.bindTimer - dt);
      if (e.stunTimer > 0) e.stunTimer = Math.max(0, e.stunTimer - dt);

      const dx = this.playerX - e.x;
      const dz = this.playerZ - e.z;
      const dSq = dx * dx + dz * dz;
      const enemyTier = computeEntityLodTier(dSq);

      e.hitReactTimer = Math.max(0, e.hitReactTimer - dt);
      const recoilT = e.hitReactTimer > 0 ? Math.sin((e.hitReactTimer / 0.28) * Math.PI) : 0;
      const recoilPitch = e.hitReactPitch * recoilT;
      const recoilYaw = e.hitReactYaw * recoilT;

      e.kinematicAccumDt += dt;
      const updatePose = dSq <= 3025 || ((eIdx + this.simFrameCounter) & 3) === 0;

      if (e.bindTimer > 0 || e.stunTimer > 0 || pulledByTornado) {
        e.y = groundHeightAt(e.x, e.z) + e.liftOffset;
        continue;
      }

      const dist = Math.sqrt(dSq);
      const er = e.isCommander ? 0.92 : 0.68;
      e.attackCooldown = Math.max(0, e.attackCooldown - dt);
      e.abilityCooldown = Math.max(0, e.abilityCooldown - dt);

      let canDetectPlayer = true;
      if (this.stealthActive) {
        const invDist = dist > 0.001 ? 1 / dist : 1;
        const dirToPlayerX = dx * invDist;
        const dirToPlayerZ = dz * invDist;
        const eFwdX = Math.sin(e.yaw);
        const eFwdZ = Math.cos(e.yaw);
        const facingDot = dirToPlayerX * eFwdX + dirToPlayerZ * eFwdZ;
        const inFrontCone = facingDot > 0.28 && dist <= detectConeDist;
        const closeBump = dist <= 2.25;
        canDetectPlayer = inFrontCone || closeBump;
        if (canDetectPlayer) spottedByAny = true;
      }

      if (!canDetectPlayer || dist >= 48) {
        // Stealth patrol / calm lookout
        e.abilityState = 'IDLE';
        if (enemyTier === 'CULLED') continue;
        const groundY = groundHeightAt(e.x, e.z);
        if (this.stealthActive && !canDetectPlayer) {
          e.yaw += Math.sin(elapsed * 0.65 + e.walkPhase) * 0.25 * dt;
        }
        if (e.variant === 'SHADOW_GHOST') {
          e.y = THREE.MathUtils.damp(
            e.y,
            groundY + 0.35 + Math.sin(elapsed * 2.8 + e.walkPhase) * 0.16,
            8.0,
            dt
          );
          if (e.rig.customParts) e.rig.customParts.rotation.y += dt * 1.4;
          e.ghostOpacity = THREE.MathUtils.damp(e.ghostOpacity, 0.68, 8.0, dt);
          if (e.rig.ghostOverlayMat) e.rig.ghostOverlayMat.opacity = e.ghostOpacity;
          if (updatePose) {
            const poseDt = Math.min(0.12, e.kinematicAccumDt);
            e.kinematicAccumDt = 0;
            e.pose.torsoRotX = THREE.MathUtils.damp(e.pose.torsoRotX, recoilPitch, 14, poseDt);
            e.pose.torsoRotY = THREE.MathUtils.damp(e.pose.torsoRotY, recoilYaw, 14, poseDt);
            e.pose.leftArm = THREE.MathUtils.damp(e.pose.leftArm, -0.35 + Math.sin(elapsed * 2.0) * 0.1, 10, poseDt);
            e.pose.rightArm = THREE.MathUtils.damp(e.pose.rightArm, -0.35 + Math.cos(elapsed * 2.0) * 0.1, 10, poseDt);
            e.rig.torso.rotation.set(e.pose.torsoRotX, e.pose.torsoRotY, 0);
            e.rig.leftArm.rotation.x = e.pose.leftArm;
            e.rig.rightArm.rotation.x = e.pose.rightArm;
          }
        } else if (e.variant === 'BOAR_DEMON') {
          e.y = groundY;
          e.speedBlend = THREE.MathUtils.damp(e.speedBlend, 0, 8.0, dt);
          if (updatePose) {
            const poseDt = Math.min(0.12, e.kinematicAccumDt);
            e.kinematicAccumDt = 0;
            e.pose.torsoRotX = THREE.MathUtils.damp(e.pose.torsoRotX, recoilPitch, 14, poseDt);
            e.pose.torsoRotY = THREE.MathUtils.damp(e.pose.torsoRotY, recoilYaw, 14, poseDt);
            e.pose.leftHip = THREE.MathUtils.damp(e.pose.leftHip, 0, 12, poseDt);
            e.pose.rightHip = THREE.MathUtils.damp(e.pose.rightHip, 0, 12, poseDt);
            e.pose.leftArm = THREE.MathUtils.damp(e.pose.leftArm, 0, 12, poseDt);
            e.pose.rightArm = THREE.MathUtils.damp(e.pose.rightArm, 0, 12, poseDt);
            e.rig.torso.rotation.set(e.pose.torsoRotX, e.pose.torsoRotY, 0);
            e.rig.leftLeg.rotation.x = e.pose.leftHip;
            e.rig.rightLeg.rotation.x = e.pose.rightHip;
            e.rig.leftArm.rotation.x = e.pose.leftArm;
            e.rig.rightArm.rotation.x = e.pose.rightArm;
          }
        } else {
          e.y = groundY;
          if (updatePose) {
            const poseDt = Math.min(0.12, e.kinematicAccumDt);
            e.kinematicAccumDt = 0;
            this.applyArticulatedLocomotion(
              e.rig,
              e.walkPhase,
              0,
              false,
              true,
              false,
              true,
              e.variant === 'RABBIT_DEMON' ? 0.88 : 0.96,
              elapsed,
              poseDt,
              e.pose,
              recoilPitch,
              recoilYaw
            );
          }
        }
        continue;
      }
      const groundY = groundHeightAt(e.x, e.z);
      const targetLookYaw = Math.atan2(dx, dz);

      // Unique Combat AI per Demon Variant
      if (e.variant === 'BOAR_DEMON') {
        // ANIMAL 1: BOAR DEMON — Bull-rush charge telegraph -> high-speed tusk stampede
        let boarTargetTorsoX = 0;
        let boarMoveNorm = 0;
        if (e.abilityState === 'IDLE') {
          e.yaw = dampAngle(e.yaw, targetLookYaw, 9.5, dt);
          if (dist < 16 && e.abilityCooldown <= 0) {
            e.abilityState = 'WINDUP';
            e.abilityTimer = 0.65;
            e.chargeDirX = dx / Math.max(0.01, dist);
            e.chargeDirZ = dz / Math.max(0.01, dist);
            boarTargetTorsoX = 0.28;
          } else if (dist > 2.2) {
            const nx = e.x + (dx / dist) * 4.4 * dt;
            const nz = e.z + (dz / dist) * 4.4 * dt;
            const res = this.moveSweptWithStaticCCD(e.x, e.z, nx, nz, er, groundY, true);
            const movedDist = Math.hypot(res.x - e.x, res.z - e.z);
            e.x = res.x;
            e.z = res.z;
            e.walkPhase += (movedDist / 1.45) * Math.PI * 2;
            boarMoveNorm = 0.55;
          } else if (e.attackCooldown <= 0) {
            e.attackCooldown = 1.25;
            this.inflictDamageToPlayer(this.mountedChariotIndex !== null ? 5 : 10, 0);
          }
        } else if (e.abilityState === 'WINDUP') {
          e.abilityTimer -= dt;
          boarTargetTorsoX = 0.34 + Math.sin(elapsed * 28) * 0.05;
          boarMoveNorm = 0.25;
          if (e.abilityTimer <= 0) {
            e.abilityState = 'ACTIVE';
            e.abilityTimer = 1.05;
          }
        } else {
          // Stampeding forward at 13.5 m/s
          e.abilityTimer -= dt;
          const nx = e.x + e.chargeDirX * 13.5 * dt;
          const nz = e.z + e.chargeDirZ * 13.5 * dt;
          const res = this.moveSweptWithStaticCCD(e.x, e.z, nx, nz, er, groundY, true);
          e.x = res.x;
          e.z = res.z;
          e.walkPhase += dt * 18;
          boarTargetTorsoX = 0.22;
          boarMoveNorm = 1.0;
          if (Math.hypot(this.playerX - e.x, this.playerZ - e.z) < 2.25 && e.attackCooldown <= 0) {
            e.attackCooldown = 0.9;
            this.inflictDamageToPlayer(this.mountedChariotIndex !== null ? 7 : 15, 0);
            this.spawnBlast(this.playerX, this.playerY + 1, this.playerZ, 0xff5a12);
            e.abilityState = 'IDLE';
            e.abilityCooldown = 3.2;
          } else if (e.abilityTimer <= 0) {
            e.abilityState = 'IDLE';
            e.abilityCooldown = 3.0;
          }
        }
        e.y = groundHeightAt(e.x, e.z);
        e.speedBlend = THREE.MathUtils.damp(e.speedBlend, boarMoveNorm, 9.5, dt);
        if (updatePose) {
          const poseDt = Math.min(0.12, e.kinematicAccumDt);
          e.kinematicAccumDt = 0;
          e.pose.torsoRotX = THREE.MathUtils.damp(e.pose.torsoRotX, boarTargetTorsoX + recoilPitch, 14, poseDt);
          e.pose.torsoRotY = THREE.MathUtils.damp(e.pose.torsoRotY, recoilYaw, 14, poseDt);
          e.rig.torso.rotation.set(e.pose.torsoRotX, e.pose.torsoRotY, 0);
          const amp = 0.55 * e.speedBlend;
          e.pose.leftHip = THREE.MathUtils.damp(e.pose.leftHip, Math.sin(e.walkPhase) * amp, 16, poseDt);
          e.pose.rightHip = THREE.MathUtils.damp(e.pose.rightHip, Math.sin(e.walkPhase + 0.5) * amp, 16, poseDt);
          e.pose.leftArm = THREE.MathUtils.damp(e.pose.leftArm, -Math.sin(e.walkPhase) * amp, 16, poseDt);
          e.pose.rightArm = THREE.MathUtils.damp(e.pose.rightArm, -Math.sin(e.walkPhase + 0.5) * amp, 16, poseDt);
          e.rig.leftLeg.rotation.x = e.pose.leftHip;
          e.rig.rightLeg.rotation.x = e.pose.rightHip;
          e.rig.leftArm.rotation.x = e.pose.leftArm;
          e.rig.rightArm.rotation.x = e.pose.rightArm;
        }
      } else if (e.variant === 'RABBIT_DEMON') {
        // ANIMAL 2: DEMON HARE — Evasive zigzag weave & parabolic vault slam with radial thorn burst
        e.yaw = dampAngle(e.yaw, targetLookYaw, 12.5, dt);
        let rabbitMoveNorm = 0;
        let rabbitGrounded = true;
        if (e.abilityState === 'IDLE') {
          if (dist < 14 && e.abilityCooldown <= 0) {
            e.abilityState = 'ACTIVE';
            e.velY = 8.4;
            e.abilityTimer = 0.05;
            e.chargeDirX = dx / Math.max(0.01, dist);
            e.chargeDirZ = dz / Math.max(0.01, dist);
            e.strafeSign *= -1;
            rabbitMoveNorm = 1.0;
            rabbitGrounded = false;
          } else {
            // Lateral hop-strafe while closing in
            const invD = 1 / Math.max(0.01, dist);
            const perpX = -dz * invD * e.strafeSign;
            const perpZ = dx * invD * e.strafeSign;
            const appW = dist > 5.0 ? 0.72 : -0.15;
            const moveX = dx * invD * appW + perpX * 0.68;
            const moveZ = dz * invD * appW + perpZ * 0.68;
            const res = this.moveSweptWithStaticCCD(
              e.x,
              e.z,
              e.x + moveX * 6.2 * dt,
              e.z + moveZ * 6.2 * dt,
              er,
              groundY,
              true
            );
            const movedDist = Math.hypot(res.x - e.x, res.z - e.z);
            e.x = res.x;
            e.z = res.z;
            e.walkPhase += (movedDist / 1.76) * Math.PI * 2;
            const hopOffset = Math.abs(Math.sin(e.walkPhase)) * 0.36;
            e.y = groundHeightAt(e.x, e.z) + hopOffset;
            rabbitMoveNorm = THREE.MathUtils.clamp(movedDist / Math.max(0.001, dt) / 3.5, 0, 1);
            rabbitGrounded = hopOffset < 0.08;
          }
        } else {
          // Mid-air vault trajectory -> slam radial bone spikes on touchdown
          e.velY -= 22 * dt;
          const res = this.moveSweptWithStaticCCD(
            e.x,
            e.z,
            e.x + e.chargeDirX * 8.2 * dt,
            e.z + e.chargeDirZ * 8.2 * dt,
            er,
            e.y,
            true
          );
          e.x = res.x;
          e.z = res.z;
          e.y += e.velY * dt;
          rabbitMoveNorm = 1.0;
          rabbitGrounded = false;
          const landY = groundHeightAt(e.x, e.z);
          if (e.y <= landY) {
            e.y = landY;
            e.velY = 0;
            e.abilityState = 'IDLE';
            e.abilityCooldown = 3.1;
            rabbitGrounded = true;
            this.spawnBlast(e.x, e.y + 0.5, e.z, 0xffb326);
            // Fire 4 radial bone shards on landing
            for (let k = 0; k < 4; k++) {
              const ka = (k / 4) * Math.PI * 2 + e.yaw;
              this.spawnEnemyProjectile(
                e.x,
                e.y + 0.9,
                e.z,
                Math.sin(ka) * 14,
                0.2,
                Math.cos(ka) * 14,
                0xffb326,
                6,
                0
              );
            }
            if (Math.hypot(this.playerX - e.x, this.playerZ - e.z) < 2.8) {
              this.inflictDamageToPlayer(this.mountedChariotIndex !== null ? 5 : 10, 0);
            }
          }
        }
        if (updatePose) {
          const poseDt = Math.min(0.12, e.kinematicAccumDt);
          e.kinematicAccumDt = 0;
          this.applyArticulatedLocomotion(
            e.rig,
            e.walkPhase,
            rabbitMoveNorm,
            true,
            rabbitGrounded,
            false,
            true,
            0.88,
            elapsed,
            poseDt,
            e.pose,
            recoilPitch,
            recoilYaw
          );
        }
      } else if (e.variant === 'SHADOW_GHOST') {
        // SHADOW GHOST — Translucent hover + phase-blink flank teleport + draining Soul-Wisp projectile
        e.yaw = dampAngle(e.yaw, targetLookYaw, 10.5, dt);
        if (e.rig.customParts) e.rig.customParts.rotation.y += dt * 2.4;
        if (e.abilityState === 'IDLE') {
          e.ghostOpacity = THREE.MathUtils.damp(e.ghostOpacity, 0.72, 10, dt);
          if (e.rig.ghostOverlayMat) e.rig.ghostOverlayMat.opacity = e.ghostOpacity;
          if (dist < 22 && e.abilityCooldown <= 0) {
            e.abilityState = 'WINDUP';
            e.abilityTimer = 0.65;
          } else if (dist > 7.5) {
            const nx = e.x + (dx / dist) * 5.4 * dt;
            const nz = e.z + (dz / dist) * 5.4 * dt;
            const res = this.moveSweptWithStaticCCD(e.x, e.z, nx, nz, er, groundY, true);
            e.x = res.x;
            e.z = res.z;
          }
          e.y = THREE.MathUtils.damp(
            e.y,
            groundHeightAt(e.x, e.z) + 0.35 + Math.sin(elapsed * 3.1 + e.walkPhase) * 0.18,
            9.0,
            dt
          );
        } else {
          // Fade out -> blink flank behind player (strictly constrained to Demon Badlands x >= DEMON_ZONE_MIN_X)
          e.abilityTimer -= dt;
          const targetAlpha = THREE.MathUtils.clamp(e.abilityTimer / 0.65, 0.12, 0.72);
          e.ghostOpacity = THREE.MathUtils.damp(e.ghostOpacity, targetAlpha, 14, dt);
          if (e.rig.ghostOverlayMat) e.rig.ghostOverlayMat.opacity = e.ghostOpacity;
          if (e.abilityTimer <= 0) {
            const flankAngle = this.playerYaw + Math.PI + (Math.random() - 0.5) * 1.4;
            const bx = THREE.MathUtils.clamp(
              this.playerX + Math.sin(flankAngle) * 8.5,
              DEMON_ZONE_MIN_X,
              WORLD_BOUNDS.maxX - 40
            );
            const bz = THREE.MathUtils.clamp(this.playerZ + Math.cos(flankAngle) * 8.5, -260, 260);
            if (!isInRiverWater(bx, bz)) {
              const safeBlink = this.resolveStaticColliders(bx, bz, er, groundHeightAt(bx, bz), true);
              e.x = Math.max(DEMON_ZONE_MIN_X, safeBlink.x);
              e.z = safeBlink.z;
            }
            e.y = groundHeightAt(e.x, e.z) + 0.4;
            e.yaw = Math.atan2(this.playerX - e.x, this.playerZ - e.z);
            this.spawnBlast(e.x, e.y + 1.0, e.z, 0x56f0ff);
            const pdx = this.playerX - e.x;
            const pdz = this.playerZ - e.z;
            const pDist = Math.max(0.1, Math.hypot(pdx, pdz));
            this.spawnEnemyProjectile(
              e.x,
              e.y + 1.25,
              e.z,
              (pdx / pDist) * 16,
              (this.playerY + 1.2 - (e.y + 1.25)) / pDist * 16,
              (pdz / pDist) * 16,
              0x56f0ff,
              9,
              14
            );
            e.abilityState = 'IDLE';
            e.abilityCooldown = 4.2;
          }
        }
        if (updatePose) {
          const poseDt = Math.min(0.12, e.kinematicAccumDt);
          e.kinematicAccumDt = 0;
          const tLArm = -0.45 + Math.sin(elapsed * 2.5) * 0.18;
          const tRArm = e.abilityState === 'WINDUP' ? -1.1 : -0.45 + Math.cos(elapsed * 2.5) * 0.18;
          e.pose.torsoRotX = THREE.MathUtils.damp(e.pose.torsoRotX, recoilPitch, 14, poseDt);
          e.pose.torsoRotY = THREE.MathUtils.damp(e.pose.torsoRotY, recoilYaw, 14, poseDt);
          e.pose.leftArm = THREE.MathUtils.damp(e.pose.leftArm, tLArm, 12, poseDt);
          e.pose.rightArm = THREE.MathUtils.damp(e.pose.rightArm, tRArm, 12, poseDt);
          e.rig.torso.rotation.set(e.pose.torsoRotX, e.pose.torsoRotY, 0);
          e.rig.leftArm.rotation.x = e.pose.leftArm;
          e.rig.rightArm.rotation.x = e.pose.rightArm;
        }
      } else if (e.variant === 'SORCERER_HUMAN') {
        // HUMAN 2: CURSED SORCERER — Kites at range, fires 3-orb curse spread & places delayed ground curse sigil
        e.yaw = dampAngle(e.yaw, targetLookYaw, 10.5, dt);
        let sorcIntensity = 0;
        let armPitchOvr: number | null = null;
        let armElbowOvr: number | null = null;
        if (e.abilityState === 'IDLE') {
          if (dist < 10) {
            const res = this.moveSweptWithStaticCCD(
              e.x,
              e.z,
              e.x - (dx / dist) * 3.8 * dt,
              e.z - (dz / dist) * 3.8 * dt,
              er,
              groundY,
              true
            );
            const movedDist = Math.hypot(res.x - e.x, res.z - e.z);
            e.x = res.x;
            e.z = res.z;
            e.walkPhase += (movedDist / 1.76) * Math.PI * 2;
            sorcIntensity = THREE.MathUtils.clamp(movedDist / Math.max(0.001, dt) / 3.2, 0, 1);
          } else if (dist > 19) {
            const res = this.moveSweptWithStaticCCD(
              e.x,
              e.z,
              e.x + (dx / dist) * 4.2 * dt,
              e.z + (dz / dist) * 4.2 * dt,
              er,
              groundY,
              true
            );
            const movedDist = Math.hypot(res.x - e.x, res.z - e.z);
            e.x = res.x;
            e.z = res.z;
            e.walkPhase += (movedDist / 1.76) * Math.PI * 2;
            sorcIntensity = THREE.MathUtils.clamp(movedDist / Math.max(0.001, dt) / 3.2, 0, 1);
          }
          if (dist < 28 && e.abilityCooldown <= 0) {
            e.abilityState = 'WINDUP';
            e.abilityTimer = 0.72;
          }
        } else {
          e.abilityTimer -= dt;
          armPitchOvr = -1.65;
          armElbowOvr = -0.25;
          if (e.abilityTimer <= 0) {
            // Fire 3-orb green curse fan OR place Curse Sigil trap beneath player
            if (Math.random() < 0.55) {
              const baseAng = Math.atan2(dx, dz);
              for (let oi = 0; oi < _curseOffsets.length; oi++) {
                const a = baseAng + _curseOffsets[oi];
                this.spawnEnemyProjectile(
                  e.x,
                  e.y + 1.45,
                  e.z,
                  Math.sin(a) * 17,
                  0.15,
                  Math.cos(a) * 17,
                  0x52ff9b,
                  8,
                  0
                );
              }
            } else {
              this.spawnGroundHazard('CURSE_SIGIL', this.playerX, this.playerZ, 3.2, 13, 1.25);
            }
            e.abilityState = 'IDLE';
            e.abilityCooldown = 3.4;
          }
        }
        e.y = groundHeightAt(e.x, e.z);
        if (updatePose) {
          const poseDt = Math.min(0.12, e.kinematicAccumDt);
          e.kinematicAccumDt = 0;
          this.applyArticulatedLocomotion(
            e.rig,
            e.walkPhase,
            sorcIntensity,
            false,
            true,
            false,
            true,
            0.96,
            elapsed,
            poseDt,
            e.pose,
            recoilPitch,
            recoilYaw,
            armPitchOvr,
            armElbowOvr
          );
        }
      } else {
        // HUMAN 1: BRUTE_HUMAN (incl. Boss Viradha) — Slow advance + Gada Club Ground-Slam Shockwave
        e.yaw = dampAngle(e.yaw, targetLookYaw, 9.5, dt);
        let bruteIntensity = 0;
        let armPitchOvr: number | null = null;
        let armElbowOvr: number | null = null;
        if (e.abilityState === 'IDLE') {
          if (dist < 5.6 && e.abilityCooldown <= 0) {
            e.abilityState = 'WINDUP';
            e.abilityTimer = 0.78;
          } else if (dist > 2.1) {
            const speed = e.isCommander ? 5.2 : 4.2;
            const res = this.moveSweptWithStaticCCD(
              e.x,
              e.z,
              e.x + (dx / dist) * speed * dt,
              e.z + (dz / dist) * speed * dt,
              er,
              groundY,
              true
            );
            const movedDist = Math.hypot(res.x - e.x, res.z - e.z);
            e.x = res.x;
            e.z = res.z;
            e.walkPhase += (movedDist / 1.76) * Math.PI * 2;
            bruteIntensity = THREE.MathUtils.clamp(movedDist / Math.max(0.001, dt) / 3.2, 0, 1);
          } else if (e.attackCooldown <= 0) {
            e.attackCooldown = 1.4;
            this.inflictDamageToPlayer(this.mountedChariotIndex !== null ? 6 : e.isCommander ? 16 : 10, 0);
          }
        } else {
          // Overhead Gada slam windup -> Shockwave Ring
          e.abilityTimer -= dt;
          armPitchOvr = -2.15;
          armElbowOvr = -0.3;
          if (e.abilityTimer <= 0) {
            this.spawnGroundHazard('GADA_WAVE', e.x, e.z, e.isCommander ? 7.5 : 5.8, e.isCommander ? 16 : 11, 0.6);
            this.spawnBlast(e.x, e.y + 0.5, e.z, 0xff5a12);
            soundEngine.playAstraBlast();
            e.abilityState = 'IDLE';
            e.abilityCooldown = 3.8;
          }
        }
        e.y = groundHeightAt(e.x, e.z);
        if (updatePose) {
          const poseDt = Math.min(0.12, e.kinematicAccumDt);
          e.kinematicAccumDt = 0;
          this.applyArticulatedLocomotion(
            e.rig,
            e.walkPhase,
            bruteIntensity,
            false,
            true,
            false,
            true,
            0.96,
            elapsed,
            poseDt,
            e.pose,
            recoilPitch,
            recoilYaw,
            armPitchOvr,
            armElbowOvr
          );
        }
      }
    }
    this.stealthSpotted = this.stealthActive && spottedByAny;

    // 7b. Update Enemy Projectiles & Ground Hazards (paused while Brahmastra summon freezes world)
    if (!summonLocked) {
      this.stepEnemyProjectilesAndHazards(dt);
    }

    // 7c. Step Divine Astras Quest System & Pooled Astra VFX
    if (this.astraQuest) {
      this.astraQuest.update(dt, elapsed);
    }
    if (this.astraVfx) {
      // Flush throttled server validation ticks for persistent elemental hazard zones
      if (this.projectileSync.isServerEnabled()) {
        for (let mi = 0; mi < this.astraVfx.agniMandalas.length; mi++) {
          const am = this.astraVfx.agniMandalas[mi];
          if (!am.zoneShotId) continue;
          am.syncAccum += dt;
          if ((am.syncAccum >= 0.45 || am.life - dt <= 0) && am.optimisticDmg.size > 0) {
            const batchDt = am.syncAccum;
            am.syncAccum = 0;
            const snapshot = new Map(am.optimisticDmg);
            am.optimisticDmg.clear();
            const nearby = this.projectileSync.buildNearbySnapshots(am.x, am.z, this.enemies, 32);
            this.projectileSync.validateZoneTick(
              am.zoneShotId,
              'AGNI_MANDALA',
              batchDt,
              nearby,
              snapshot,
              (res, opt) => this.reconcileZoneTick(res, opt)
            );
          }
        }
        for (let ti = 0; ti < this.astraVfx.tornados.length; ti++) {
          const tn = this.astraVfx.tornados[ti];
          if (!tn.zoneShotId) continue;
          tn.syncAccum += dt;
          if ((tn.syncAccum >= 0.45 || tn.life - dt <= 0) && tn.optimisticDmg.size > 0) {
            const batchDt = tn.syncAccum;
            tn.syncAccum = 0;
            const snapshot = new Map(tn.optimisticDmg);
            tn.optimisticDmg.clear();
            const nearby = this.projectileSync.buildNearbySnapshots(tn.x, tn.z, this.enemies, 32);
            this.projectileSync.validateZoneTick(
              tn.zoneShotId,
              'VAYU_TORNADO',
              batchDt,
              nearby,
              snapshot,
              (res, opt) => this.reconcileZoneTick(res, opt)
            );
          }
        }
      }

      const pScale = this.qualityManager.getProfile().particleScale;
      this.astraVfx.update(dt, elapsed, pScale, (id: string) => {
        for (let ei = 0; ei < this.enemies.length; ei++) {
          const en = this.enemies[ei];
          if (en.alive && en.id === id) {
            return { x: en.x, y: en.y, z: en.z };
          }
        }
        return null;
      });
    }

    // 8. Traditionally Attired NPCs & 60-Second Sabha Throne Ascension Seating Routine
    if (this.ascensionActive && !this.ascensionCompleted) {
      this.ascensionElapsed += dt;
    }

    let allCouncilSeated = true;
    const citPx = this.playerX;
    const citPz = this.playerZ;
    for (let ci = 0; ci < this.citizens.length; ci++) {
      const c = this.citizens[ci];
      const citDistSq = (c.x - citPx) * (c.x - citPx) + (c.z - citPz) * (c.z - citPz);
      c.kinematicAccumDt += dt;
      const updateRigKin = citDistSq <= 3025 || ((ci + this.simFrameCounter) & 3) === 0;

      if (this.ascensionActive && c.courtSeat) {
        if (c.seated) {
          // Hold clean seated posture right atop the assigned Sabha cushion (smooth transition from walk)
          c.x = c.courtSeat.x;
          c.y = c.courtSeat.y;
          c.z = c.courtSeat.z;
          c.yaw = dampAngle(c.yaw, c.courtSeat.faceYaw, 9.0, dt);
          if (updateRigKin) {
            const poseDt = Math.min(0.12, c.kinematicAccumDt);
            c.kinematicAccumDt = 0;
            const p = c.pose;
            const lam = 12;
            p.hipY = THREE.MathUtils.damp(p.hipY, 0.56, lam, poseDt);
            p.leftHip = THREE.MathUtils.damp(p.leftHip, -1.42, lam, poseDt);
            p.rightHip = THREE.MathUtils.damp(p.rightHip, -1.42, lam, poseDt);
            p.leftLegZ = THREE.MathUtils.damp(p.leftLegZ, 0, lam, poseDt);
            p.rightLegZ = THREE.MathUtils.damp(p.rightLegZ, 0, lam, poseDt);
            p.leftKnee = THREE.MathUtils.damp(p.leftKnee, 1.32, lam, poseDt);
            p.rightKnee = THREE.MathUtils.damp(p.rightKnee, 1.32, lam, poseDt);
            p.leftAnkle = THREE.MathUtils.damp(p.leftAnkle, 0, lam, poseDt);
            p.rightAnkle = THREE.MathUtils.damp(p.rightAnkle, 0, lam, poseDt);
            p.leftArm = THREE.MathUtils.damp(p.leftArm, -0.35, lam, poseDt);
            p.rightArm = THREE.MathUtils.damp(p.rightArm, -0.35, lam, poseDt);
            p.leftArmZ = THREE.MathUtils.damp(p.leftArmZ, 0, lam, poseDt);
            p.rightArmZ = THREE.MathUtils.damp(p.rightArmZ, 0, lam, poseDt);
            p.leftElbow = THREE.MathUtils.damp(p.leftElbow, -0.55, lam, poseDt);
            p.rightElbow = THREE.MathUtils.damp(p.rightElbow, -0.55, lam, poseDt);
            p.torsoRotX = THREE.MathUtils.damp(p.torsoRotX, 0, lam, poseDt);
            p.torsoRotY = THREE.MathUtils.damp(p.torsoRotY, 0, lam, poseDt);
            p.torsoRotZ = THREE.MathUtils.damp(p.torsoRotZ, 0, lam, poseDt);
            p.pleatRotX = THREE.MathUtils.damp(p.pleatRotX, -1.25, lam, poseDt);

            c.rig.torso.position.y = p.hipY;
            c.rig.leftLeg.position.y = p.hipY;
            c.rig.rightLeg.position.y = p.hipY;
            c.rig.torso.rotation.set(p.torsoRotX, p.torsoRotY, p.torsoRotZ);
            c.rig.leftLeg.rotation.set(p.leftHip, 0, p.leftLegZ);
            c.rig.rightLeg.rotation.set(p.rightHip, 0, p.rightLegZ);
            c.rig.leftKnee.rotation.x = p.leftKnee;
            c.rig.rightKnee.rotation.x = p.rightKnee;
            c.rig.leftAnkle.rotation.x = p.leftAnkle;
            c.rig.rightAnkle.rotation.x = p.rightAnkle;
            c.rig.leftArm.rotation.set(p.leftArm, 0, p.leftArmZ);
            c.rig.rightArm.rotation.set(p.rightArm, 0, p.rightArmZ);
            c.rig.leftElbow.rotation.x = p.leftElbow;
            c.rig.rightElbow.rotation.x = p.rightElbow;
            if (c.rig.centerPleat) c.rig.centerPleat.rotation.x = p.pleatRotX;
          }
          continue;
        }

        allCouncilSeated = false;
        const sdx = c.courtSeat.x - c.x;
        const sdz = c.courtSeat.z - c.z;
        const dist = Math.hypot(sdx, sdz);

        if (dist <= 0.65 || this.ascensionElapsed >= 56.0) {
          c.x = c.courtSeat.x;
          c.y = c.courtSeat.y;
          c.z = c.courtSeat.z;
          c.seated = true;
          c.navQueue.length = 0;
          c.navCursor = 0;
          continue;
        }

        // Follow pre-computed obstacle-free Navigation Mesh waypoints strictly without collider bypass
        let tgtX = c.courtSeat.x;
        let tgtZ = c.courtSeat.z;
        if (c.navCursor >= c.navQueue.length) {
          findPalaceNavPath(
            c.x,
            c.y,
            c.z,
            c.courtSeat.x,
            c.courtSeat.y,
            c.courtSeat.z,
            false,
            c.navQueue
          );
          c.navCursor = 0;
        }
        while (
          c.navCursor < c.navQueue.length &&
          Math.hypot(c.navQueue[c.navCursor].x - c.x, c.navQueue[c.navCursor].z - c.z) < 1.15
        ) {
          c.navCursor++;
        }
        if (c.navCursor < c.navQueue.length) {
          tgtX = c.navQueue[c.navCursor].x;
          tgtZ = c.navQueue[c.navCursor].z;
        }
        const wdx = tgtX - c.x;
        const wdz = tgtZ - c.z;
        const wDist = Math.max(0.01, Math.hypot(wdx, wdz));

        const timeLeft = Math.max(4.0, 26.0 - this.ascensionElapsed);
        const speed = THREE.MathUtils.clamp(Math.max(5.5, dist / timeLeft), 5.5, 14.0);
        const dirX = wdx / wDist;
        const dirZ = wdz / wDist;
        c.yaw = dampAngle(c.yaw, Math.atan2(dirX, dirZ), 10.5, dt);
        const curSurfY = this.surfaceHeightAt(c.x, c.z, c.y);
        const stepNx = c.x + dirX * speed * dt;
        const stepNz = c.z + dirZ * speed * dt;
        const resMain = this.moveSweptWithStaticCCD(c.x, c.z, stepNx, stepNz, 0.46, curSurfY, false, false);
        let chosenX = resMain.x;
        let chosenZ = resMain.z;
        const mDx = chosenX - c.x;
        const mDz = chosenZ - c.z;
        if (mDx * mDx + mDz * mDz < (speed * dt * 0.2) * (speed * dt * 0.2)) {
          // Tangential obstacle slide along perpendicular axis (copy slideA before slideB overwrites _sweptRes)
          const slideA = this.moveSweptWithStaticCCD(
            c.x,
            c.z,
            c.x - dirZ * speed * dt,
            c.z + dirX * speed * dt,
            0.46,
            curSurfY,
            false,
            false
          );
          const sax = slideA.x;
          const saz = slideA.z;
          const slideB = this.moveSweptWithStaticCCD(
            c.x,
            c.z,
            c.x + dirZ * speed * dt,
            c.z - dirX * speed * dt,
            0.46,
            curSurfY,
            false,
            false
          );
          const sbx = slideB.x;
          const sbz = slideB.z;
          const distASq = (tgtX - sax) * (tgtX - sax) + (tgtZ - saz) * (tgtZ - saz);
          const distBSq = (tgtX - sbx) * (tgtX - sbx) + (tgtZ - sbz) * (tgtZ - sbz);
          if (distASq <= distBSq) {
            chosenX = sax;
            chosenZ = saz;
          } else {
            chosenX = sbx;
            chosenZ = sbz;
          }
        }
        const movedDist = Math.hypot(chosenX - c.x, chosenZ - c.z);
        c.x = chosenX;
        c.z = chosenZ;
        c.y = THREE.MathUtils.damp(c.y, this.surfaceHeightAt(c.x, c.z, c.y), 14.0, dt);
        c.walkPhase += (movedDist / 2.2) * Math.PI * 2;
        if (updateRigKin) {
          const poseDt = Math.min(0.12, c.kinematicAccumDt);
          c.kinematicAccumDt = 0;
          this.applyArticulatedLocomotion(
            c.rig,
            c.walkPhase,
            THREE.MathUtils.clamp(movedDist / Math.max(0.001, dt) / 3.2, 0, 1),
            true,
            true,
            false,
            false,
            0.875,
            elapsed,
            poseDt,
            c.pose
          );
        }
      } else {
        // Strict Baked Navigation Mesh Patrol + Distance-LOD Kinematics
        if (citDistSq > 11025) {
          continue;
        }
        c.patrolTimer -= dt;
        if (c.navCursor >= c.navQueue.length || c.patrolTimer <= 0) {
          const wantWater = c.canSwim && !c.isSwimming && Math.random() < 0.72;
          c.patrolTimer = c.canSwim ? 7.0 + Math.random() * 4.0 : 5.0 + Math.random() * 4.0;
          pickNavMeshPatrolTarget(
            c.x,
            c.y,
            c.z,
            c.homeX,
            c.homeZ,
            c.canSwim,
            wantWater,
            c.navQueue
          );
          c.navCursor = 0;
        }

        const wp = c.navCursor < c.navQueue.length ? c.navQueue[c.navCursor] : undefined;
        if (wp) {
          const wpdx = wp.x - c.x;
          const wpdz = wp.z - c.z;
          if (wpdx * wpdx + wpdz * wpdz < 0.7225) {
            c.navCursor++;
            c.patrolTimer = Math.min(c.patrolTimer, 0.2);
          }
        }

        const activeWp = c.navCursor < c.navQueue.length ? c.navQueue[c.navCursor] : undefined;
        const tgtX = activeWp ? activeWp.x : c.homeX;
        const tgtZ = activeWp ? activeWp.z : c.homeZ;
        const pdx = tgtX - c.x;
        const pdz = tgtZ - c.z;
        const pDist = Math.max(0.01, Math.hypot(pdx, pdz));
        const pDirX = pdx / pDist;
        const pDirZ = pdz / pDist;
        c.yaw = dampAngle(c.yaw, Math.atan2(pDirX, pDirZ), 8.5, dt);

        const spd = c.isSwimming ? 2.1 : 1.8;
        const nx = c.x + pDirX * spd * dt;
        const nz = c.z + pDirZ * spd * dt;
        const curSurfY = this.surfaceHeightAt(c.x, c.z, c.y);
        let movedDist = 0;
        if (c.canSwim || (!isInRiverWater(nx, nz) && !isInsideStepwellBasin(nx, nz))) {
          const res = this.moveSweptWithStaticCCD(
            c.x,
            c.z,
            nx,
            nz,
            0.48,
            curSurfY,
            false,
            c.canSwim
          );
          movedDist = Math.hypot(res.x - c.x, res.z - c.z);
          if (movedDist < spd * dt * 0.2) {
            c.navQueue.length = 0;
            c.navCursor = 0;
            c.patrolTimer = 0;
          }
          c.x = res.x;
          c.z = res.z;
        } else {
          c.navQueue.length = 0;
          c.navCursor = 0;
          c.patrolTimer = 0;
        }

        const cGroundY = this.surfaceHeightAt(c.x, c.z, c.y);
        const cWaterSurf = c.canSwim ? waterSurfaceAt(c.x, c.z) : null;
        if (cWaterSurf !== null && cWaterSurf - cGroundY > 0.95) {
          c.isSwimming = true;
          const swimTargetY = cWaterSurf - 1.15 + Math.sin(elapsed * 2.2 + c.walkPhase) * 0.04;
          c.y = THREE.MathUtils.damp(c.y, Math.max(cGroundY + 0.1, swimTargetY), 6.0, dt);
          c.walkPhase += Math.max(dt * 3.0, (movedDist / 1.8) * Math.PI * 2);
          if (updateRigKin) {
            const poseDt = Math.min(0.12, c.kinematicAccumDt);
            c.kinematicAccumDt = 0;
            this.applySwimmingPose(c.rig, c.walkPhase, 0.85, elapsed, 0, c.pose, poseDt);
          }
        } else {
          c.isSwimming = false;
          c.y = THREE.MathUtils.damp(c.y, cGroundY, 12.0, dt);
          c.walkPhase += (movedDist / 1.68) * Math.PI * 2;
          if (updateRigKin) {
            const poseDt = Math.min(0.12, c.kinematicAccumDt);
            c.kinematicAccumDt = 0;
            this.applyArticulatedLocomotion(
              c.rig,
              c.walkPhase,
              THREE.MathUtils.clamp(movedDist / Math.max(0.001, dt) / 2.2, 0, 1),
              false,
              true,
              false,
              false,
              0.875,
              elapsed,
              poseDt,
              c.pose
            );
          }
        }
      }
    }
    if (this.ascensionActive && allCouncilSeated) {
      this.ascensionCompleted = true;
    }

    // 8b. Enforce Rigid-Body Pairwise Boundaries Across All Dynamic Characters, Chariots, Animals & Static Mesh Locks
    this.resolveDynamicPairwiseCollisions();

    // Sync final locked physics transforms to Three.js scene objects
    if (this.mountedChariotIndex !== null) {
      const ch = this.chariots[this.mountedChariotIndex];
      const activeSeat: LanVehicleSeatIndex = this.mountedSeatIndex === 1 ? 1 : 0;
      computeVehicleSeatWorldPosition(
        ch.x,
        ch.y,
        ch.z,
        ch.yaw,
        ch.pitch,
        'RATHA',
        activeSeat,
        this._seatWorldScratch
      );
      this.playerX = this._seatWorldScratch.x;
      this.playerZ = this._seatWorldScratch.z;
      this.playerY = this._seatWorldScratch.y;
      this.playerYaw = activeSeat === 1 ? this.camYaw + Math.PI : ch.yaw;
      this.ramRig.root.rotation.order = 'YXZ';
      this.ramRig.root.rotation.x = -ch.pitch;
    } else if (this.mountedAnimalIndex !== null) {
      const an = this.animals[this.mountedAnimalIndex];
      const seatY = an.elephantRig
        ? an.elephantRig.seatHeight
        : an.horseRig
        ? an.horseRig.seatHeight
        : 0.88;
      const activeSeat: LanVehicleSeatIndex = this.mountedSeatIndex === 1 ? 1 : 0;
      computeVehicleSeatWorldPosition(
        an.x,
        an.y,
        an.z,
        an.yaw,
        0,
        an.kind,
        activeSeat,
        this._seatWorldScratch,
        seatY
      );
      this.playerX = this._seatWorldScratch.x;
      this.playerZ = this._seatWorldScratch.z;
      this.playerY = this._seatWorldScratch.y;
      this.playerYaw = an.yaw;
      this.ramRig.root.rotation.order = 'YXZ';
      this.ramRig.root.rotation.x = 0;
    } else if (this.seatedOnThrone) {
      const anchor = this.getThroneSeatAnchor();
      this.playerX = anchor.x;
      this.playerZ = anchor.z;
      this.playerY = anchor.y;
      this.playerYaw = 0;
    }
    this.ramRig.root.position.set(this.playerX, this.playerY, this.playerZ);
    this.ramRig.root.rotation.y = this.playerYaw;

    // Attach Reins Dynamically from Bridle Bits into Driver's Hands on BOTH Chariots and Mounted Royal Horses
    if (this.mountedChariotIndex !== null) {
      const ch = this.chariots[this.mountedChariotIndex];
      this.ramRig.root.updateMatrixWorld(true);
      ch.rig.root.updateMatrixWorld(true);

      const leftSteed = ch.rig.steeds[0];
      const rightSteed = ch.rig.steeds[1] ?? leftSteed;
      if (leftSteed && rightSteed) {
        leftSteed.leftBitAnchor.getWorldPosition(_v3);
        ch.rig.root.worldToLocal(_v3);
        rightSteed.rightBitAnchor.getWorldPosition(_v4);
        ch.rig.root.worldToLocal(_v4);
      } else {
        if (ch.rig.leftBridleHook) _v3.copy(ch.rig.leftBridleHook);
        if (ch.rig.rightBridleHook) _v4.copy(ch.rig.rightBridleHook);
      }

      if (
        this.mountedSeatIndex !== 1 &&
        !isDrawingBow &&
        this.ramRig.leftHandAnchor &&
        this.ramRig.rightHandAnchor &&
        ch.rig.leftReinMesh &&
        ch.rig.rightReinMesh
      ) {
        this.ramRig.leftHandAnchor.getWorldPosition(_v1);
        ch.rig.root.worldToLocal(_v1);
        updateDynamicReinMesh(ch.rig.leftReinMesh, _v3, _v1, 0.14);

        this.ramRig.rightHandAnchor.getWorldPosition(_v2);
        ch.rig.root.worldToLocal(_v2);
        updateDynamicReinMesh(ch.rig.rightReinMesh, _v4, _v2, 0.14);
      } else if (
        ch.rig.leftReinMesh &&
        ch.rig.rightReinMesh &&
        ch.rig.leftRailHook &&
        ch.rig.rightRailHook
      ) {
        updateDynamicReinMesh(ch.rig.leftReinMesh, _v3, ch.rig.leftRailHook, 0.2);
        updateDynamicReinMesh(ch.rig.rightReinMesh, _v4, ch.rig.rightRailHook, 0.2);
      }
    } else if (this.mountedAnimalIndex !== null) {
      const an = this.animals[this.mountedAnimalIndex];
      const hr = an.horseRig;
      if (hr && hr.leftReinMesh && hr.rightReinMesh) {
        this.ramRig.root.updateMatrixWorld(true);
        hr.group.updateMatrixWorld(true);

        hr.leftBitAnchor.getWorldPosition(_v3);
        hr.group.worldToLocal(_v3);
        hr.rightBitAnchor.getWorldPosition(_v4);
        hr.group.worldToLocal(_v4);

        if (
          this.mountedSeatIndex !== 1 &&
          !isDrawingBow &&
          this.ramRig.leftHandAnchor &&
          this.ramRig.rightHandAnchor
        ) {
          this.ramRig.leftHandAnchor.getWorldPosition(_v1);
          hr.group.worldToLocal(_v1);
          updateDynamicReinMesh(hr.leftReinMesh, _v3, _v1, 0.08);

          this.ramRig.rightHandAnchor.getWorldPosition(_v2);
          hr.group.worldToLocal(_v2);
          updateDynamicReinMesh(hr.rightReinMesh, _v4, _v2, 0.08);
        } else if (hr.leftPommelHook && hr.rightPommelHook) {
          updateDynamicReinMesh(hr.leftReinMesh, _v3, hr.leftPommelHook, 0.16);
          updateDynamicReinMesh(hr.rightReinMesh, _v4, hr.rightPommelHook, 0.16);
        }
      }
    }



    // 9. Update Mission Beacon & Dynamic Night Street Lamps / Torches Pool
    const activeMission = MISSIONS[this.missionIdx];
    if (this.beaconGroup) {
      if (activeMission) {
        this.beaconGroup.visible = true;
        const by = groundHeightAt(
          activeMission.waypoint.x,
          activeMission.waypoint.z
        );
        this.beaconGroup.position.set(
          activeMission.waypoint.x,
          by,
          activeMission.waypoint.z
        );
        this.beaconGroup.rotation.y = elapsed * 0.8;
      } else {
        this.beaconGroup.visible = false;
      }
    }

    if (this.combatLight.intensity > 0.005) {
      this.combatLight.intensity = THREE.MathUtils.damp(
        this.combatLight.intensity,
        0,
        9.0,
        dt
      );
      if (this.combatLight.intensity <= 0.005) {
        this.combatLight.intensity = 0;
      }
    }
    this.updateDynamicHeroLighting(this.camYaw);
    this.updateNightLampsPool(elapsed);

    // 10. Strict First-Person Eye-Locked Camera (No third-person angles, zoom, or cinematic pullouts)
    if (this.mountedChariotIndex !== null) {
      const ch = this.chariots[this.mountedChariotIndex];
      const shouldAlign =
        this.mountedSeatIndex === 1
          ? this.camChariotLockTimer > 0
          : this.cameraManualHold <= 0 &&
            (this.camChariotLockTimer > 0 || Math.abs(ch.speed) > 0.6);
      if (shouldAlign) {
        const targetForwardYaw = ch.yaw + Math.PI;
        let diff = targetForwardYaw - this.camYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const alignLambda = this.camChariotLockTimer > 0 ? 11.5 : 4.2;
        this.camYaw += diff * (1 - Math.exp(-alignLambda * dt));
      }
      if (this.mountedSeatIndex === 1) {
        this.playerYaw = this.camYaw + Math.PI;
        this.ramRig.root.rotation.y = this.playerYaw;
      }
    } else if (this.mountedAnimalIndex !== null) {
      const an = this.animals[this.mountedAnimalIndex];
      const shouldAlign =
        this.mountedSeatIndex === 1
          ? this.camChariotLockTimer > 0
          : this.cameraManualHold <= 0 &&
            (this.camChariotLockTimer > 0 || Math.abs(an.speed) > 0.6);
      if (shouldAlign) {
        const targetForwardYaw = an.yaw + Math.PI;
        let diff = targetForwardYaw - this.camYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.camYaw += diff * (1 - Math.exp(-4.5 * dt));
      }
    } else if (!this.seatedOnThrone) {
      this.playerYaw = this.camYaw + Math.PI;
      this.ramRig.root.rotation.y = this.playerYaw;
    }

    this.applyActiveCamera(true);

    // 10b. Post-Camera Occlusion Culling, Entity Detail LOD & Transform Sync
    if (this.remotePlayers.size > 0) {
      this.updateRemotePlayers(dt, elapsed);
    }

    if (this.lanClient?.isMultiplayerActive()) {
      this.lanSyncAccum += dt;
      if (this.lanSyncAccum >= LAN_SYNC_INTERVAL_MS / 1000) {
        this.lanSyncAccum = 0;
        const hero = getHeroPreset(this.lanLocalHeroId);
        const localMount = this.getLocalMountedVehicle();
        const isClientDriver =
          !this.lanClient.isHostingMatch() && localMount && this.mountedSeatIndex === 0;
        let driverVehicle: LanDriverVehicleReport | undefined;
        if (isClientDriver && localMount) {
          if (localMount.kind === 'RATHA') {
            const ch = localMount.chariot;
            driverVehicle = {
              vehicleId: ch.id,
              x: Number(ch.x.toFixed(2)),
              y: Number(ch.y.toFixed(2)),
              z: Number(ch.z.toFixed(2)),
              yaw: Number(ch.yaw.toFixed(3)),
              pitch: Number(ch.pitch.toFixed(3)),
              speed: Number(ch.speed.toFixed(2)),
              vx: Number(ch.vx.toFixed(2)),
              vz: Number(ch.vz.toFixed(2)),
              gaitPhase: Number(ch.gaitPhase.toFixed(2)),
              seq: ++ch.netSeq,
              epoch: ch.occupancyEpoch,
            };
          } else {
            const an = localMount.animal;
            driverVehicle = {
              vehicleId: an.id,
              x: Number(an.x.toFixed(2)),
              y: Number(an.y.toFixed(2)),
              z: Number(an.z.toFixed(2)),
              yaw: Number(an.yaw.toFixed(3)),
              pitch: 0,
              speed: Number(an.speed.toFixed(2)),
              vx: Number(an.vx.toFixed(2)),
              vz: Number(an.vz.toFixed(2)),
              gaitPhase: Number(an.gaitPhase.toFixed(2)),
              seq: ++an.netSeq,
              epoch: an.occupancyEpoch,
            };
          }
        }
        const safeDt = Math.max(0.001, dt);
        this.lanClient.sendLocalPlayerState({
          name: this.lanLocalPlayerName,
          heroId: hero.id,
          accentHex: hero.accentHex,
          x: Number(this.playerX.toFixed(2)),
          y: Number(this.playerY.toFixed(2)),
          z: Number(this.playerZ.toFixed(2)),
          yaw: Number(this.playerYaw.toFixed(3)),
          horizSpeed: Number(this.playerHorizSpeed.toFixed(2)),
          grounded: this.grounded,
          walkPhase: Number(this.walkPhase.toFixed(2)),
          aiming: this.input.fireHeld || this.bowDrawHoldTimer > 0,
          stealth: this.stealthActive,
          sprint: this.input.sprint,
          mountKind: localMount ? localMount.kind : 'NONE',
          mountedVehicleId: localMount ? localMount.id : null,
          seatIndex: localMount ? (this.mountedSeatIndex ?? 0) : null,
          vx: Number(((this.playerX - prevX) / safeDt).toFixed(2)),
          vz: Number(((this.playerZ - prevZ) / safeDt).toFixed(2)),
          sentAtMs: Date.now(),
          driverVehicle,
          hp: Math.round(this.hp),
          maxHp: this.maxHp,
          selectedAstra: this.astraQuest?.selectedAstra ?? null,
          seq: ++this.lanSnapSeq,
        });

        if (this.lanClient.isHostingMatch()) {
          this.lanClient.sendWorldSnapshot(this.buildHostWorldSnapshot());
        }
      }
    }

    const fog = this.scene.fog as THREE.Fog | null;
    this.occlusionManager.prepareCullingBasis(
      this.camera,
      fog ? fog.far : Number.POSITIVE_INFINITY,
      true
    );

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.alive && !e.dissolving) continue;
      const dSq =
        (e.x - this.playerX) * (e.x - this.playerX) +
        (e.z - this.playerZ) * (e.z - this.playerZ);
      const tier = computeEntityLodTier(
        dSq,
        1600 * profDistScaleSq,
        6724 * profDistScaleSq,
        15625 * profDistScaleSq
      );
      const vis =
        tier !== 'CULLED' &&
        this.occlusionManager.isSphereVisible(
          e.x,
          e.y + 1.05,
          e.z,
          e.isCommander ? 1.85 : 1.45,
          15625 * profDistScaleSq,
          144
        );
      e.rig.root.visible = vis;
      if (!vis) {
        e.rig.contactShadow.visible = false;
        continue;
      }
      e.rig.contactShadow.visible = tier === 'FULL';
      applyRigLodDetailTier(e.rig.root, tier);
      e.rig.root.position.set(e.x, e.y, e.z);
      e.rig.root.rotation.y = e.yaw;
    }

    for (let i = 0; i < this.citizens.length; i++) {
      const c = this.citizens[i];
      const dSq =
        (c.x - this.playerX) * (c.x - this.playerX) +
        (c.z - this.playerZ) * (c.z - this.playerZ);
      const isCouncil = this.ascensionActive && c.courtSeat !== null;
      const maxRange = (isCouncil ? 15625 : 11025) * profDistScaleSq;
      const tier = computeEntityLodTier(
        dSq,
        1600 * profDistScaleSq,
        6724 * profDistScaleSq,
        maxRange
      );
      const vis =
        tier !== 'CULLED' &&
        this.occlusionManager.isSphereVisible(
          c.x,
          c.y + 0.95,
          c.z,
          1.3,
          maxRange,
          100
        );
      c.rig.root.visible = vis;
      if (!vis) {
        c.rig.contactShadow.visible = false;
        continue;
      }
      c.rig.contactShadow.visible = tier === 'FULL' && !c.seated;
      applyRigLodDetailTier(c.rig.root, tier);
      c.rig.root.position.set(c.x, c.y, c.z);
      c.rig.root.rotation.y = c.yaw;
    }

    for (let i = 0; i < this.animals.length; i++) {
      const a = this.animals[i];
      const obj = a.horseRig ? a.horseRig.group : a.elephantRig!.group;
      if (i === this.mountedAnimalIndex) {
        obj.visible = true;
        applyRigLodDetailTier(obj, 'FULL');
        continue;
      }
      const dSq =
        (a.x - this.playerX) * (a.x - this.playerX) +
        (a.z - this.playerZ) * (a.z - this.playerZ);
      const maxAnRange = 19600 * profDistScaleSq;
      const tier = computeEntityLodTier(
        dSq,
        2500 * profDistScaleSq,
        8100 * profDistScaleSq,
        maxAnRange
      );
      const isEle = a.kind === 'ELEPHANT';
      const vis =
        tier !== 'CULLED' &&
        this.occlusionManager.isSphereVisible(
          a.x,
          a.y + (isEle ? 1.8 : 1.15),
          a.z,
          isEle ? 2.9 : 1.9,
          maxAnRange,
          196
        );
      obj.visible = vis;
      if (vis) {
        applyRigLodDetailTier(obj, tier);
      }
    }

    for (let i = 0; i < this.chariots.length; i++) {
      const ch = this.chariots[i];
      if (i === this.mountedChariotIndex) {
        ch.rig.root.visible = true;
        ch.rig.contactShadow.visible = true;
        applyRigLodDetailTier(ch.rig.root, 'FULL');
        continue;
      }
      const dSq =
        (ch.x - this.playerX) * (ch.x - this.playerX) +
        (ch.z - this.playerZ) * (ch.z - this.playerZ);
      const maxChRange = 19600 * profDistScaleSq;
      const tier = computeEntityLodTier(
        dSq,
        2500 * profDistScaleSq,
        8100 * profDistScaleSq,
        maxChRange
      );
      const vis =
        tier !== 'CULLED' &&
        this.occlusionManager.isSphereVisible(
          ch.x,
          ch.y + 1.4,
          ch.z,
          3.8,
          maxChRange,
          256
        );
      ch.rig.root.visible = vis;
      ch.rig.contactShadow.visible = vis && tier === 'FULL';
      if (vis) {
        applyRigLodDetailTier(ch.rig.root, tier);
      }
    }

    this.stepAquaticEcosystem(dt, elapsed);

    // Update Underwater Post-Processing Volume based on exact camera submergence below Sarayu / Stepwell surface
    this.updateUnderwaterPostProcessing(elapsed);
  }

  private inflictDamageToPlayer(hpDmg: number, pranaDrain: number): void {
    const resistance = HERO_PROFILES[this.activeHeroId].damageResistance;
    const reducedHpDmg = hpDmg > 0 ? Math.max(1, Math.round(hpDmg * (1 - resistance))) : 0;
    const reducedPranaDrain =
      pranaDrain > 0 ? Math.max(1, Math.round(pranaDrain * (1 - resistance * 0.5))) : 0;
    this.hp = Math.max(0, this.hp - reducedHpDmg);
    if (reducedPranaDrain > 0) {
      this.prana = Math.max(0, this.prana - reducedPranaDrain);
    }
    soundEngine.playHit();
    if (this.hp <= 0) {
      this.clearInputs();
      this.abortBrahmaSummon();
      this.astraQuest?.failBrahmaTrial('Defeated during trial.');
      this.setStealthMode(false);
      this.setMode('DEFEATED');
    }
  }

  private spawnEnemyProjectile(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    colorHex: number,
    damage: number,
    drainPrana: number
  ): void {
    const mesh = this.poolManager.acquire<THREE.Mesh>('enemyProjectile');
    const mat = mesh.material as THREE.MeshPhysicalMaterial;
    mat.color.setHex(colorHex);
    mat.emissive.setHex(colorHex);
    mesh.position.set(x, y, z);
    this.enemyProjectiles.push({
      mesh,
      x,
      y,
      z,
      vx,
      vy,
      vz,
      damage,
      drainPrana,
      life: 2.2,
    });
  }

  private spawnGroundHazard(
    kind: 'CURSE_SIGIL' | 'GADA_WAVE',
    x: number,
    z: number,
    maxRadius: number,
    damage: number,
    duration: number
  ): void {
    const y = groundHeightAt(x, z) + 0.08;
    const hCol = kind === 'CURSE_SIGIL' ? 0x52ff9b : 0xff5a12;
    const mesh = this.poolManager.acquire<THREE.Mesh>('groundHazard');
    const mat = mesh.material as THREE.MeshPhysicalMaterial;
    mat.color.setHex(hCol);
    mat.emissive.setHex(hCol);
    mat.opacity = 0.78;
    mesh.position.set(x, y, z);
    this.groundHazards.push({
      mesh,
      kind,
      x,
      y,
      z,
      radius: 1.0,
      maxRadius,
      damage,
      timer: 0,
      duration,
      detonated: false,
    });
  }

  private stepEnemyProjectilesAndHazards(dt: number): void {
    const hitR = this.mountedChariotIndex !== null ? 1.4 : 0.9;
    for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
      const ep = this.enemyProjectiles[i];
      ep.life -= dt;
      ep.x += ep.vx * dt;
      ep.y += ep.vy * dt;
      ep.z += ep.vz * dt;
      ep.mesh.position.set(ep.x, ep.y, ep.z);
      ep.mesh.rotation.y += dt * 7;

      const dPlayer = Math.hypot(ep.x - this.playerX, ep.z - this.playerZ);
      const dyPlayer = Math.abs(ep.y - (this.playerY + 1.1));
      if (dPlayer < hitR && dyPlayer < 1.5) {
        this.inflictDamageToPlayer(
          this.mountedChariotIndex !== null ? Math.ceil(ep.damage * 0.6) : ep.damage,
          ep.drainPrana
        );
        this.spawnBlast(ep.x, ep.y, ep.z, (ep.mesh.material as THREE.MeshPhysicalMaterial).color.getHex());
        ep.life = 0;
      } else if (ep.y < groundHeightAt(ep.x, ep.z)) {
        ep.life = 0;
      }

      if (ep.life <= 0) {
        this.poolManager.release('enemyProjectile', ep.mesh);
        swapRemoveAt(this.enemyProjectiles, i);
      }
    }

    for (let i = this.groundHazards.length - 1; i >= 0; i--) {
      const hz = this.groundHazards[i];
      hz.timer += dt;
      const p = Math.min(1, hz.timer / hz.duration);
      if (hz.kind === 'GADA_WAVE') {
        hz.radius = 0.8 + p * hz.maxRadius;
        hz.mesh.scale.setScalar(hz.radius);
        (hz.mesh.material as THREE.MeshPhysicalMaterial).opacity = 0.85 * (1 - p);
        const dP = Math.hypot(this.playerX - hz.x, this.playerZ - hz.z);
        if (!hz.detonated && Math.abs(dP - hz.radius) < 1.15 && (this.grounded || this.mountedChariotIndex !== null)) {
          hz.detonated = true;
          this.inflictDamageToPlayer(this.mountedChariotIndex !== null ? Math.ceil(hz.damage * 0.55) : hz.damage, 0);
        }
      } else {
        hz.mesh.scale.setScalar(hz.maxRadius * (0.4 + p * 0.6));
        (hz.mesh.material as THREE.MeshPhysicalMaterial).opacity = 0.35 + p * 0.55;
        if (hz.timer >= hz.duration && !hz.detonated) {
          hz.detonated = true;
          this.spawnBlast(hz.x, hz.y + 0.6, hz.z, 0x52ff9b);
          if (Math.hypot(this.playerX - hz.x, this.playerZ - hz.z) < hz.maxRadius) {
            this.inflictDamageToPlayer(this.mountedChariotIndex !== null ? 6 : hz.damage, 8);
          }
        }
      }

      if (hz.timer >= hz.duration) {
        this.poolManager.release('groundHazard', hz.mesh);
        swapRemoveAt(this.groundHazards, i);
      }
    }
  }

  private stepVolcanicAtmosphere(dt: number): void {
    const camDistToVolcano = this.camera.position.x - DEMON_ZONE_MIN_X;
    this.volcanoGlowLight.visible = camDistToVolcano >= -420;
    if (camDistToVolcano < -750 || (this.volcanicBombMesh && this.volcanicSmokeMesh && !this.volcanicBombMesh.visible && !this.volcanicSmokeMesh.visible)) {
      return;
    }
    if (this.volcanicBombMesh && this.volcanicBombMesh.visible && this.volcanoCraters.length > 0) {
      const activeBombs = Math.min(this.volcanicBombMesh.count, this.volcanicBombs.length);
      for (let i = 0; i < activeBombs; i++) {
        const b = this.volcanicBombs[i];
        b.vy -= 14.5 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;
        b.rot += dt * 3.2;
        if (b.y < groundHeightAt(b.x, b.z) - 2) {
          const c = this.volcanoCraters[b.craterIdx];
          const ang = (i * 2.399 + b.rot) % (Math.PI * 2);
          const spd = 6.5 + (i % 5) * 3.0;
          b.x = c.x + Math.cos(ang) * 1.4;
          b.y = c.y + 0.2;
          b.z = c.z + Math.sin(ang) * 1.4;
          b.vx = Math.cos(ang) * spd;
          b.vy = 14 + (i % 6) * 4.2;
          b.vz = Math.sin(ang) * spd;
        }
        _dummy.position.set(b.x, b.y, b.z);
        _dummy.rotation.set(b.rot, b.rot * 0.7, 0);
        _dummy.scale.setScalar(b.scale);
        _dummy.updateMatrix();
        this.volcanicBombMesh.setMatrixAt(i, _dummy.matrix);
      }
      this.volcanicBombMesh.instanceMatrix.needsUpdate = true;
    }

    if (this.volcanicSmokeMesh && this.volcanicSmokeMesh.visible) {
      const activeSmoke = Math.min(this.volcanicSmokeMesh.count, this.volcanicSmokePuffs.length);
      for (let i = 0; i < activeSmoke; i++) {
        const s = this.volcanicSmokePuffs[i];
        s.age += dt;
        if (s.age >= s.life) s.age = 0;
        const frac = s.age / s.life;
        const sx = s.baseX + s.driftX * s.age;
        const sz = s.baseZ + s.driftZ * s.age;
        const sy = s.baseY + frac * (i < 30 ? 32 : 12);
        const sc = s.scale * (0.45 + frac * 1.15) * (1 - Math.max(0, (frac - 0.72) / 0.28));
        _dummy.position.set(sx, sy, sz);
        _dummy.rotation.set(frac * 1.2, frac * 0.8, 0);
        _dummy.scale.setScalar(Math.max(0.05, sc));
        _dummy.updateMatrix();
        this.volcanicSmokeMesh.setMatrixAt(i, _dummy.matrix);
      }
      this.volcanicSmokeMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private stepAquaticEcosystem(dt: number, elapsed: number): void {
    const camX = this.camera.position.x;
    const camZ = this.camera.position.z;
    const nearRiverZone = Math.abs(camX - 128) <= 220;
    const stepwellDistSq =
      (camX - STEPWELL_POS.x) * (camX - STEPWELL_POS.x) +
      (camZ - STEPWELL_POS.z) * (camZ - STEPWELL_POS.z);
    const nearStepwellZone = stepwellDistSq <= 18225; // <= 135m

    if (this.riverFishMesh) {
      this.riverFishMesh.visible = nearRiverZone;
    }
    if (this.stepwellKoiMesh) {
      this.stepwellKoiMesh.visible = nearStepwellZone;
    }

    // Skip simulation cleanly when far beyond Sarayu River & Surya-Kund Stepwell visibility band
    if (!nearRiverZone && !nearStepwellZone) {
      for (let i = 0; i < this.riverTurtles.length; i++) this.riverTurtles[i].root.visible = false;
      for (let i = 0; i < this.riverCrocodiles.length; i++) this.riverCrocodiles[i].root.visible = false;
      for (let i = 0; i < this.riverJellyfish.length; i++) this.riverJellyfish[i].root.visible = false;
      for (let i = 0; i < this.riverDolphins.length; i++) this.riverDolphins[i].root.visible = false;
      for (let i = 0; i < this.riverSharks.length; i++) this.riverSharks[i].root.visible = false;
      for (let i = 0; i < this.stepwellTurtles.length; i++) this.stepwellTurtles[i].root.visible = false;
      return;
    }

    if (nearRiverZone) {
      // 1. 5 Dynamically Emerging Giant Turtles swimming down & surfacing
      for (let i = 0; i < this.riverTurtles.length; i++) {
        const t = this.riverTurtles[i];
        t.z += (i % 2 === 0 ? 1 : -1) * 1.15 * dt;
        if (t.z > 165) t.z = -165;
        if (t.z < -165) t.z = 165;
        const wx = riverCenterX(t.z) + t.xOff;
        const wave = Math.sin(elapsed * 0.55 + t.phase);
        const y = THREE.MathUtils.lerp(RIVER_SURFACE_Y - 2.9, RIVER_SURFACE_Y - 0.06, (wave + 1) * 0.5);
        if (!this.occlusionManager.isSphereVisible(wx, y, t.z, 2.2, 19600)) {
          t.root.visible = false;
          continue;
        }
        t.root.visible = true;
        t.root.position.set(wx, y, t.z);
        t.root.rotation.y = i % 2 === 0 ? 0 : Math.PI;
        t.root.rotation.x = -Math.cos(elapsed * 0.55 + t.phase) * 0.18;
        t.headGroup.rotation.x = Math.sin(elapsed * 2.2 + t.phase) * 0.14;
        for (let f = 0; f < t.flippers.length; f++) {
          t.flippers[f].rotation.z = (f % 2 === 0 ? 1 : -1) * Math.sin(elapsed * 3.8 + t.phase + f) * 0.34;
        }
      }

      // 2. River Crocodiles
      for (let i = 0; i < this.riverCrocodiles.length; i++) {
        const c = this.riverCrocodiles[i];
        c.z += c.speed * dt;
        if (c.z > 160) c.z = -160;
        if (c.z < -160) c.z = 160;
        const wx = riverCenterX(c.z) + c.xOff;
        const cy = RIVER_SURFACE_Y - 0.16 + Math.sin(elapsed * 1.4 + c.phase) * 0.05;
        if (!this.occlusionManager.isSphereVisible(wx, cy, c.z, 2.5, 19600)) {
          c.root.visible = false;
          continue;
        }
        c.root.visible = true;
        c.root.position.set(wx, cy, c.z);
        c.root.rotation.y = c.speed >= 0 ? 0 : Math.PI;
        c.tailPivot.rotation.y = Math.sin(elapsed * 4.5 + c.phase) * 0.32;
      }

      // 3. Bioluminescent Jellyfish pulsing gently in the 20-ft deep river column
      for (let i = 0; i < this.riverJellyfish.length; i++) {
        const jf = this.riverJellyfish[i];
        const wx = riverCenterX(jf.z) + jf.xOff + Math.sin(elapsed * 0.8 + jf.phase) * 0.65;
        const pulse = Math.sin(elapsed * 2.6 + jf.phase);
        const jy = jf.baseY + pulse * 0.38;
        if (!this.occlusionManager.isSphereVisible(wx, jy, jf.z, 1.3, 14400)) {
          jf.root.visible = false;
          continue;
        }
        jf.root.visible = true;
        jf.root.position.set(wx, jy, jf.z);
        jf.bell.scale.set(1 - pulse * 0.12, 1 + pulse * 0.15, 1 - pulse * 0.12);
      }

      // 4. River Dolphins swimming & executing clear surface leaps
      for (let i = 0; i < this.riverDolphins.length; i++) {
        const d = this.riverDolphins[i];
        d.z += 5.4 * dt;
        if (d.z > 160) d.z = -160;
        const wx = riverCenterX(d.z) + d.xOff;
        const leapCycle = (elapsed * 0.72 + d.phase) % (Math.PI * 2);
        const isLeaping = leapCycle < Math.PI;
        const y = isLeaping
          ? RIVER_SURFACE_Y + Math.sin(leapCycle) * 1.95 - 0.15
          : RIVER_SURFACE_Y - 1.5 - Math.sin(leapCycle - Math.PI) * 1.1;
        if (!this.occlusionManager.isSphereVisible(wx, y, d.z, 2.2, 19600)) {
          d.root.visible = false;
          continue;
        }
        d.root.visible = true;
        const pitch = isLeaping
          ? -Math.cos(leapCycle) * 0.65
          : Math.cos(leapCycle - Math.PI) * 0.32;
        d.root.position.set(wx, y, d.z);
        d.root.rotation.set(pitch, 0, 0);
        d.tailPivot.rotation.x = Math.sin(elapsed * 9.0 + d.phase) * 0.38;
      }

      // 5. Pelagic Sharks patrolling deep water
      for (let i = 0; i < this.riverSharks.length; i++) {
        const s = this.riverSharks[i];
        s.z += s.speed * dt;
        if (s.z > 168) s.z = -168;
        if (s.z < -168) s.z = 168;
        const wx = riverCenterX(s.z) + s.xOff + Math.sin(elapsed * 0.9 + s.phase) * 1.2;
        if (!this.occlusionManager.isSphereVisible(wx, s.baseY, s.z, 2.6, 19600)) {
          s.root.visible = false;
          continue;
        }
        s.root.visible = true;
        s.root.position.set(wx, s.baseY, s.z);
        s.root.rotation.y = s.speed >= 0 ? 0 : Math.PI;
        s.tailPivot.rotation.y = Math.sin(elapsed * 6.2 + s.phase) * 0.35;
      }

      // 6. Scaled Schooling Fish in the 20-ft River
      if (this.riverFishMesh && this.riverFishAgents.length > 0) {
        const activeFish = Math.min(this.riverFishMesh.count, this.riverFishAgents.length);
        for (let i = 0; i < activeFish; i++) {
          const f = this.riverFishAgents[i];
          f.z += f.speed * dt;
          if (f.z > 175) f.z = -175;
          if (f.z < -175) f.z = 175;
          const wx = riverCenterX(f.z) + f.xOff + Math.sin(elapsed * 1.6 + f.phase) * 0.8;
          _dummy.position.set(wx, f.depthY, f.z);
          _dummy.rotation.set(
            0,
            (f.speed >= 0 ? 0 : Math.PI) + Math.sin(elapsed * 9.5 + f.phase) * 0.16,
            0
          );
          _dummy.scale.setScalar(f.scale);
          _dummy.updateMatrix();
          this.riverFishMesh.setMatrixAt(i, _dummy.matrix);
        }
        this.riverFishMesh.instanceMatrix.needsUpdate = true;
      }
    } else {
      for (let i = 0; i < this.riverTurtles.length; i++) this.riverTurtles[i].root.visible = false;
      for (let i = 0; i < this.riverCrocodiles.length; i++) this.riverCrocodiles[i].root.visible = false;
      for (let i = 0; i < this.riverJellyfish.length; i++) this.riverJellyfish[i].root.visible = false;
      for (let i = 0; i < this.riverDolphins.length; i++) this.riverDolphins[i].root.visible = false;
      for (let i = 0; i < this.riverSharks.length; i++) this.riverSharks[i].root.visible = false;
    }

    // 7. Surya-Kund Stepwell Koi Minnows & Small Pond Terrapins
    if (nearStepwellZone) {
      if (this.stepwellKoiMesh && this.stepwellKoiAgents.length > 0) {
        const activeKoi = Math.min(this.stepwellKoiMesh.count, this.stepwellKoiAgents.length);
        for (let i = 0; i < activeKoi; i++) {
          const k = this.stepwellKoiAgents[i];
          k.angle += k.speed * dt;
          const kx = STEPWELL_POS.x + Math.cos(k.angle) * k.radius;
          const kz = STEPWELL_POS.z + Math.sin(k.angle) * k.radius;
          const tangentYaw = Math.atan2(-Math.sin(k.angle) * k.speed, Math.cos(k.angle) * k.speed);
          _dummy.position.set(kx, k.depthY + Math.sin(elapsed * 2.0 + k.phase) * 0.12, kz);
          _dummy.rotation.set(0, tangentYaw + Math.sin(elapsed * 10 + k.phase) * 0.15, 0);
          _dummy.scale.setScalar(0.85);
          _dummy.updateMatrix();
          this.stepwellKoiMesh.setMatrixAt(i, _dummy.matrix);
        }
        this.stepwellKoiMesh.instanceMatrix.needsUpdate = true;
      }

      for (let i = 0; i < this.stepwellTurtles.length; i++) {
        const st = this.stepwellTurtles[i];
        st.angle += 0.28 * dt;
        const sx = STEPWELL_POS.x + Math.cos(st.angle) * st.radius;
        const sz = STEPWELL_POS.z + Math.sin(st.angle) * st.radius;
        const sy = -0.56 + Math.sin(elapsed * 1.4 + st.phase) * 0.04;
        if (!this.occlusionManager.isSphereVisible(sx, sy, sz, 1.2, 18225)) {
          st.root.visible = false;
          continue;
        }
        st.root.visible = true;
        st.root.position.set(sx, sy, sz);
        st.root.rotation.y = Math.atan2(-Math.sin(st.angle), Math.cos(st.angle));
        st.headGroup.rotation.x = Math.sin(elapsed * 2.5 + st.phase) * 0.12;
        for (let f = 0; f < st.flippers.length; f++) {
          st.flippers[f].rotation.z = (f % 2 === 0 ? 1 : -1) * Math.sin(elapsed * 4.2 + st.phase + f) * 0.25;
        }
      }
    } else {
      for (let i = 0; i < this.stepwellTurtles.length; i++) {
        this.stepwellTurtles[i].root.visible = false;
      }
    }
  }

  private updateNightLampsPool(elapsed: number): void {
    // At night, designated Street Lamps & Torches illuminate the dark streets/palace halls via tier-scaled pooled warm PointLights + emissive halos
    const nightGlow = THREE.MathUtils.smoothstep(this.nightFactor, 0.12, 0.72);
    const profile = this.qualityManager.getProfile();
    if (this.lampBulbMat) {
      this.lampBulbMat.emissiveIntensity = THREE.MathUtils.lerp(0.35, 3.6, nightGlow);
    }
    if (this.lampHaloUniforms && this.lampHaloPoints) {
      this.lampHaloUniforms.uOpacity.value = nightGlow * 0.58;
      this.lampHaloPoints.visible = nightGlow > 0.02;
    }

    const activeCap = Math.min(this.nightLampLights.length, profile.maxActiveNightLamps);
    if (nightGlow <= 0.01 || this.torchFlameAnchors.length === 0 || activeCap === 0) {
      for (let i = 0; i < this.nightLampLights.length; i++) {
        this.nightLampLights[i].intensity = 0;
      }
      this.torchShadowLight.intensity = 0;
      this.torchShadowLight.castShadow = false;
      return;
    }

    let bestCount = 0;
    const fx = this.playerX;
    const fz = this.playerZ;
    const maxRangeSq = 92 * 92;

    for (let i = 0; i < this.torchFlameAnchors.length; i++) {
      const a = this.torchFlameAnchors[i];
      const dx = a.x - fx;
      const dz = a.z - fz;
      const distSq = dx * dx + dz * dz;
      if (distSq >= maxRangeSq) continue;

      if (bestCount < activeCap) {
        let pos = bestCount;
        while (pos > 0 && _topLampDistSq[pos - 1] > distSq) {
          _topLampDistSq[pos] = _topLampDistSq[pos - 1];
          _topLampIndices[pos] = _topLampIndices[pos - 1];
          pos--;
        }
        _topLampDistSq[pos] = distSq;
        _topLampIndices[pos] = i;
        bestCount++;
      } else if (distSq < _topLampDistSq[activeCap - 1]) {
        let pos = activeCap - 1;
        while (pos > 0 && _topLampDistSq[pos - 1] > distSq) {
          _topLampDistSq[pos] = _topLampDistSq[pos - 1];
          _topLampIndices[pos] = _topLampIndices[pos - 1];
          pos--;
        }
        _topLampDistSq[pos] = distSq;
        _topLampIndices[pos] = i;
      }
    }

    for (let i = 0; i < this.nightLampLights.length; i++) {
      const light = this.nightLampLights[i];
      if (i >= bestCount || i >= activeCap) {
        light.intensity = 0;
        continue;
      }
      const anchor = this.torchFlameAnchors[_topLampIndices[i]];
      const flicker =
        1.0 +
        Math.sin(elapsed * 9.5 + anchor.phase) * 0.1 +
        Math.cos(elapsed * 15.2 + anchor.phase * 1.4) * 0.06;
      const distFade = 1.0 - THREE.MathUtils.smoothstep(Math.sqrt(_topLampDistSq[i]), 46, 88);
      light.position.set(anchor.x, anchor.y + 0.35, anchor.z);
      light.intensity = 11.5 * nightGlow * flicker * distFade;
      if (i === 0) {
        if (profile.torchShadowEnabled && !this.isSoftwareGl) {
          this.torchShadowLight.position.set(anchor.x, anchor.y + 0.45, anchor.z);
          this.torchShadowLight.target.position.set(anchor.x, anchor.y - 4.0, anchor.z + 0.25);
          this.torchShadowLight.intensity = 16.0 * nightGlow * flicker * distFade;
          this.torchShadowLight.castShadow = true;
        } else {
          this.torchShadowLight.intensity = 0;
          this.torchShadowLight.castShadow = false;
        }
      }
    }
    if (bestCount === 0) {
      this.torchShadowLight.intensity = 0;
      this.torchShadowLight.castShadow = false;
    }
  }

  private updateUnderwaterPostProcessing(elapsed: number): void {
    const camSurf = waterSurfaceAt(this.camera.position.x, this.camera.position.z);
    const subDepth = camSurf !== null ? camSurf - this.camera.position.y : -1.0;
    this.cameraSubmerged = THREE.MathUtils.smoothstep(subDepth, -0.05, 0.22);
    this.cameraSubDepthFactor = THREE.MathUtils.clamp(subDepth / 6.0, 0, 1);

    if (this.postPass) {
      this.postPass.uniforms.uSubmerged.value = this.cameraSubmerged;
      if (this.cameraSubmerged > 0.001) {
        this.postPass.uniforms.uDepthFactor.value = this.cameraSubDepthFactor;
        this.postPass.uniforms.uTime.value = elapsed;
        this.postPass.uniforms.uDaylight.value = this.daylightFactor;
      }
    }

    if (this.underwaterSoftwareQuad) {
      const mat = this.underwaterSoftwareQuad.material as THREE.ShaderMaterial;
      mat.uniforms.uSubmerged.value = this.cameraSubmerged;
      mat.uniforms.uDepthFactor.value = this.cameraSubDepthFactor;
      mat.uniforms.uTime.value = elapsed;
      mat.uniforms.uDaylight.value = this.daylightFactor;
      this.underwaterSoftwareQuad.visible = this.cameraSubmerged > 0.004;
    }

    if (this.cameraSubmerged > 0.01) {
      const bg = this.scene.background as THREE.Color | null;
      _tmpUnderCol.copy(_colUnderNight).lerp(_colUnderDay, this.daylightFactor);
      if (bg) bg.lerp(_tmpUnderCol, this.cameraSubmerged);
    }
  }

  private updateAtmosphericMood(): void {
    // 1. Solar & Lunar Orbital Elevation -> Seamless Day / Sunset / Starry Night Cycle
    const dayAngle = this.dayTime * Math.PI * 2;
    const sunElev = Math.sin(dayAngle);
    const sunCos = Math.cos(dayAngle);
    _sunDir.set(sunCos * 0.88, sunElev, -0.42).normalize();
    _moonDir.set(-_sunDir.x, -_sunDir.y, -_sunDir.z).normalize();

    const sunStrength = THREE.MathUtils.smoothstep(sunElev, -0.04, 0.24);
    const twilight = Math.exp(-Math.pow(sunElev / 0.19, 2));
    this.daylightFactor = THREE.MathUtils.smoothstep(sunElev, -0.14, 0.22);
    this.nightFactor = 1.0 - this.daylightFactor;
    const moonStrength = THREE.MathUtils.smoothstep(_moonDir.y, -0.04, 0.24) * this.nightFactor;

    if (this.sunDisc) {
      this.sunDisc.position.set(
        this.playerX + _sunDir.x * 2500,
        _sunDir.y * 2500,
        this.playerZ + _sunDir.z * 2500
      );
      this.sunDisc.visible = sunElev > -0.1;
      const sunMat = this.sunDisc.material as THREE.MeshBasicMaterial;
      sunMat.color.copy(_colKeyDay).lerp(_colKeySunset, twilight);
    }

    if (this.moonGroup) {
      this.moonGroup.position.set(
        this.playerX + _moonDir.x * 2320,
        _moonDir.y * 2320,
        this.playerZ + _moonDir.z * 2320
      );
      this.moonGroup.visible = _moonDir.y > -0.12;
      if (this.moonHaloSprite) {
        (this.moonHaloSprite.material as THREE.SpriteMaterial).opacity =
          0.35 + 0.55 * moonStrength;
      }
    }

    if (this.starUniforms) {
      const starOp = THREE.MathUtils.smoothstep(this.nightFactor, 0.18, 0.78);
      this.starUniforms.uOpacity.value = starOp;
      if (this.starPoints) this.starPoints.visible = starOp > 0.01;
    }
    if (this.fireflyUniforms) {
      const ffOp = THREE.MathUtils.smoothstep(this.nightFactor, 0.2, 0.72);
      this.fireflyUniforms.uOpacity.value = ffOp;
      if (this.fireflyPoints) this.fireflyPoints.visible = ffOp > 0.01;
    }

    // 2. Shift gradually from Ayodhya sky toward dark volcanic ash atmosphere near 2.5 km Demon Village
    const ashT = THREE.MathUtils.smoothstep(
      this.playerX,
      DEMON_ZONE_MIN_X - 180,
      DEMON_ZONE_MIN_X + 260
    );

    _tmpSkyH.copy(_colSkyHDay).lerp(_colSkyHDusk, twilight * 0.85).lerp(_colSkyHNight, this.nightFactor);
    _tmpSkyM.copy(_colSkyMDay).lerp(_colSkyMDusk, twilight * 0.85).lerp(_colSkyMNight, this.nightFactor);
    _tmpSkyZ.copy(_colSkyZDay).lerp(_colSkyZDusk, twilight * 0.85).lerp(_colSkyZNight, this.nightFactor);
    if (ashT > 0.001) {
      _tmpSkyH.lerp(_colAsh, ashT);
      _tmpSkyM.lerp(_colAsh, ashT * 0.85);
    }
    if (this.skyUniforms) {
      this.skyUniforms.uHorizonColor.value.copy(_tmpSkyH);
      this.skyUniforms.uMidColor.value.copy(_tmpSkyM);
      this.skyUniforms.uZenithColor.value.copy(_tmpSkyZ);
      this.skyUniforms.uSunDir.value.copy(_sunDir);
      this.skyUniforms.uMoonDir.value.copy(_moonDir);
      this.skyUniforms.uTwilight.value = twilight;
      this.skyUniforms.uNightFactor.value = this.nightFactor;
    }
    if (this.waterShaderUniforms) {
      this.waterShaderUniforms.uDaylight.value = this.daylightFactor;
      this.waterShaderUniforms.uSunDir.value.copy(_sunDir);
    }
    if (this.waterfallShaderUniforms) {
      this.waterfallShaderUniforms.uDaylight.value = this.daylightFactor;
    }

    _tmpMist.copy(_colMist).lerp(_colSunset, twilight * 0.65).lerp(_colNightMist, this.nightFactor).lerp(_colAsh, ashT);
    const bg = this.scene.background as THREE.Color;
    if (bg) bg.copy(_tmpMist);

    // Keep fog density strictly zero across the realm
    if (this.scene.fog !== null) {
      this.scene.fog = null;
    }

    this.scene.environmentIntensity = THREE.MathUtils.lerp(1.22, 0.12, this.nightFactor);

    // Biome-aware dynamic ground light bounce & Spherical Harmonics L0/L1 Global Illumination probe
    const inWater = isInRiverWater(this.playerX, this.playerZ) || isInsideStepwellBasin(this.playerX, this.playerZ);
    const onStonePlaza =
      Math.hypot(this.playerX, this.playerZ) < 28 ||
      (this.playerZ < -22 && Math.abs(this.playerX) < 58);
    if (inWater) {
      _tmpBounce.copy(_colBounceWater);
    } else if (onStonePlaza) {
      _tmpBounce.copy(_colBounceSand);
    } else {
      _tmpBounce.copy(_colBounceGrass);
    }
    if (ashT > 0.01) {
      _tmpBounce.lerp(_colBounceAsh, ashT);
    }
    if (twilight > 0.05) {
      _tmpBounce.lerp(_colKeySunset, twilight * 0.35);
    }
    _tmpBounce.multiplyScalar(THREE.MathUtils.lerp(1.0, 0.18, this.nightFactor));

    this.bounceLight.color.copy(_tmpBounce);
    this.bounceLight.position.set(this.playerX, this.playerY - 18, this.playerZ);
    this.bounceLight.target.position.set(this.playerX, this.playerY + 4, this.playerZ);
    this.bounceLight.intensity = THREE.MathUtils.lerp(0.48, 0.1, this.nightFactor);

    const sh = this.giLightProbe.sh;
    sh.zero();
    _tmpSkySample.copy(_tmpSkyZ).multiplyScalar(THREE.MathUtils.lerp(0.55, 0.16, this.nightFactor));
    _tmpHorizonSample.copy(_tmpSkyH).multiplyScalar(THREE.MathUtils.lerp(0.45, 0.12, this.nightFactor));
    sh.coefficients[0].set(
      _tmpHorizonSample.r + _tmpBounce.r * 0.4,
      _tmpHorizonSample.g + _tmpBounce.g * 0.4,
      _tmpHorizonSample.b + _tmpBounce.b * 0.4
    );
    sh.coefficients[2].set(
      _tmpSkySample.r - _tmpBounce.r * 0.65,
      _tmpSkySample.g - _tmpBounce.g * 0.65,
      _tmpSkySample.b - _tmpBounce.b * 0.65
    );
    sh.coefficients[6].set(
      (_tmpSkySample.r + _tmpBounce.r) * 0.25,
      (_tmpSkySample.g + _tmpBounce.g) * 0.25,
      (_tmpSkySample.b + _tmpBounce.b) * 0.25
    );
    this.giLightProbe.intensity = THREE.MathUtils.lerp(0.68, 0.24, this.nightFactor);

    this.hemiLight.color
      .copy(_colHemiDay)
      .lerp(_colHemiNight, this.nightFactor)
      .lerp(_colHemiAsh, ashT);
    this.hemiLight.groundColor
      .copy(_tmpBounce)
      .lerp(_colGroundNight, this.nightFactor * 0.65);
    this.hemiLight.intensity =
      THREE.MathUtils.lerp(0.96, 0.28, this.nightFactor) * THREE.MathUtils.lerp(1.0, 0.78, ashT);

    this.rimLight.color.setHex(0xd4e6ff).lerp(_colKeyMoon, this.nightFactor);
    this.rimLight.intensity = THREE.MathUtils.lerp(0.82, 0.22, this.nightFactor);

    if (sunStrength >= moonStrength) {
      _shadowDir.set(_sunDir.x, Math.max(0.11, _sunDir.y), _sunDir.z).normalize();
      this.keyLight.color.copy(_colKeyDay).lerp(_colKeySunset, twilight * 0.78).lerp(_colKeyAsh, ashT);
      this.keyLight.intensity = THREE.MathUtils.lerp(2.25, 1.48, ashT) * sunStrength;
    } else {
      _shadowDir.set(_moonDir.x, Math.max(0.11, _moonDir.y), _moonDir.z).normalize();
      this.keyLight.color.copy(_colKeyMoon).lerp(_colKeyAsh, ashT * 0.5);
      this.keyLight.intensity = 0.62 * moonStrength;
    }

    // Snap directional shadow camera target to world shadow-texel grid to prevent shimmering on edges
    const shadowSize = Math.max(512, this.keyLight.shadow.mapSize.width || 1024);
    const frustumW = this.keyLight.shadow.camera.right - this.keyLight.shadow.camera.left;
    const texelWorld = frustumW / shadowSize;
    _shadowRight.crossVectors(_worldUp, _shadowDir);
    if (_shadowRight.lengthSq() < 1e-5) _shadowRight.set(1, 0, 0);
    _shadowRight.normalize();
    _shadowUp.crossVectors(_shadowDir, _shadowRight).normalize();

    _v1.set(this.playerX, this.playerY, this.playerZ);
    const projR = Math.round(_v1.dot(_shadowRight) / texelWorld) * texelWorld;
    const projU = Math.round(_v1.dot(_shadowUp) / texelWorld) * texelWorld;
    const projD = _v1.dot(_shadowDir);
    _v2.copy(_shadowRight).multiplyScalar(projR)
      .addScaledVector(_shadowUp, projU)
      .addScaledVector(_shadowDir, projD);

    this.keyLight.target.position.copy(_v2);
    this.keyLight.position.set(
      _v2.x + _shadowDir.x * 72,
      _v2.y + Math.max(8, _shadowDir.y * 72),
      _v2.z + _shadowDir.z * 72
    );

    // 3. Stage 3 Shadow Gauntlet & Brahmastra Summon Storm Darkening Override
    const darkBlend = Math.max(this.astraQuest?.darknessOverride ?? 0, this.brahmaCycloneMood);
    if (darkBlend > 0.01) {
      if (this.skyUniforms) {
        this.skyUniforms.uHorizonColor.value.lerp(_colSkyHNight, darkBlend * 0.9);
        this.skyUniforms.uMidColor.value.lerp(_colSkyMNight, darkBlend * 0.92);
        this.skyUniforms.uZenithColor.value.lerp(_colSkyZNight, darkBlend * 0.95);
      }
      if (bg) bg.lerp(_colNightMist, darkBlend * 0.92);
      this.keyLight.intensity *= 1 - darkBlend * 0.78;
      this.hemiLight.intensity *= 1 - darkBlend * 0.65;
    }
  }

  private executeHeroSpecialAbility(): void {
    const hero = HERO_PROFILES[this.activeHeroId];
    this.heroAbilityMaxCooldown = hero.specialCooldownSec;
    this.heroAbilityCooldown = hero.specialCooldownSec;
    const profile = this.qualityManager.getProfile();
    if (this.stealthActive) {
      this.setStealthMode(false);
    }

    if (this.activeHeroId === 'HANUMAN') {
      // Vajra-Gada Meteor Slam: crashes down from sky with massive AoE shockwave launching demons airborne
      const gY = this.surfaceHeightAt(this.playerX, this.playerZ);
      const dropHeight = Math.max(0, this.playerY - gY);
      if (dropHeight > 1.2) {
        this.playerY = gY;
        this.playerVelY = 0;
        this.grounded = true;
        this.isFlying = false;
        this.ramRig.root.position.set(this.playerX, this.playerY, this.playerZ);
        this.ramRig.root.rotation.x = 0;
      }
      const radius = dropHeight > 3.5 ? 14.5 : 11.5;
      const slamDmg = Math.round(hero.specialDamage * (dropHeight > 3.5 ? 1.6 : 1.15));
      this.astraVfx?.spawnWaterWave(this.playerX, gY, this.playerZ, radius, profile.particleScale, profile.tier);
      this.astraVfx?.spawnSpriteBurst(
        this.playerX,
        gY + 0.8,
        this.playerZ,
        28,
        'GOLD',
        2.8,
        14.0,
        0.75,
        0.9,
        profile.particleScale
      );
      this.spawnBlast(this.playerX, gY + 1.0, this.playerZ, 0xff7b1c);
      this.cameraShakeAmount = Math.max(this.cameraShakeAmount, dropHeight > 3.5 ? 1.15 : 0.85);
      soundEngine.playAstraImpact('BRAHMASTRA');

      const rSq = radius * radius;
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (!e.alive) continue;
        const dx = e.x - this.playerX;
        const dz = e.z - this.playerZ;
        const dSq = dx * dx + dz * dz;
        if (dSq <= rSq) {
          const dist = Math.max(0.5, Math.sqrt(dSq));
          const push = 9.5 * (1 - dist / (radius + 1.5));
          const res = this.moveSweptWithStaticCCD(
            e.x,
            e.z,
            e.x + (dx / dist) * push,
            e.z + (dz / dist) * push,
            e.isCommander ? 0.92 : 0.68,
            e.y,
            true
          );
          e.x = res.x;
          e.z = res.z;
          e.liftOffset = Math.max(e.liftOffset, dropHeight > 3.5 ? 4.2 : 2.6);
          e.stunTimer = Math.max(e.stunTimer, 2.4);
          e.abilityState = 'IDLE';
          this.damageEnemy(e, slamDmg, 'CHAKRA');
        }
      }
      this.mountNoticeText =
        dropHeight > 3.5 ? 'Vajra-Gada Meteor Slam! Massive AoE Destruction!' : 'Vajra-Gada Seismic Slam!';
      this.mountNoticeExpiresMs = performance.now() + 2600;
    } else if (this.activeHeroId === 'RAM') {
      // Surya Blade Wave: Golden Solar Cleave + Ignite
      const gY = this.surfaceHeightAt(this.playerX, this.playerZ);
      const radius = 9.2;
      this.astraVfx?.spawnAgniMandalaField(
        this.playerX,
        gY,
        this.playerZ,
        radius,
        2.5,
        10,
        profile.particleScale,
        profile.tier
      );
      this.spawnBlast(this.playerX, this.playerY + 1.1, this.playerZ, 0xf6c343);
      this.cameraShakeAmount = Math.max(this.cameraShakeAmount, 0.55);
      soundEngine.playAstraImpact('AGNEYASTRA');

      const rSq = radius * radius;
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (!e.alive) continue;
        const dSq = (e.x - this.playerX) * (e.x - this.playerX) + (e.z - this.playerZ) * (e.z - this.playerZ);
        if (dSq <= rSq) {
          e.burnTimer = Math.max(e.burnTimer, 3.5);
          e.burnDps = Math.max(e.burnDps, 16);
          this.damageEnemy(e, hero.specialDamage, 'AGNEYASTRA');
        }
      }
      this.mountNoticeText = 'Surya Blade Wave unleashed!';
      this.mountNoticeExpiresMs = performance.now() + 2200;
    } else if (this.activeHeroId === 'LAKSHMAN') {
      // Seshanaga 3x Piercing Serpent Volley
      const baseYaw = this.camYaw;
      for (let s = -1; s <= 1; s++) {
        this.camYaw = baseYaw + s * 0.11;
        this.fireArrow(false, 'NAGASTRA');
      }
      this.camYaw = baseYaw;
      this.mountNoticeText = 'Seshanaga Triple Serpent Volley!';
      this.mountNoticeExpiresMs = performance.now() + 2200;
    } else {
      // Bharat: Dharma Aegis Cleave + Sanctuary Heal
      const gY = this.surfaceHeightAt(this.playerX, this.playerZ);
      const radius = 9.8;
      this.astraVfx?.spawnWaterWave(this.playerX, gY, this.playerZ, radius, profile.particleScale, profile.tier);
      this.spawnBlast(this.playerX, this.playerY + 1.0, this.playerZ, 0x34d399);
      this.hp = Math.min(this.maxHp, this.hp + Math.round(this.maxHp * 0.22));
      this.prana = Math.min(this.maxPrana, this.prana + 25);
      soundEngine.playMissionChime();
      const rSq = radius * radius;
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (!e.alive) continue;
        const dx = e.x - this.playerX;
        const dz = e.z - this.playerZ;
        const dSq = dx * dx + dz * dz;
        if (dSq <= rSq) {
          const dist = Math.max(0.5, Math.sqrt(dSq));
          const res = this.moveSweptWithStaticCCD(
            e.x,
            e.z,
            e.x + (dx / dist) * 7.2,
            e.z + (dz / dist) * 7.2,
            e.isCommander ? 0.92 : 0.68,
            e.y,
            true
          );
          e.x = res.x;
          e.z = res.z;
          e.stunTimer = Math.max(e.stunTimer, 1.8);
          this.damageEnemy(e, hero.specialDamage, 'CHAKRA');
        }
      }
      this.mountNoticeText = 'Dharma Aegis Cleave — Vitals Restored!';
      this.mountNoticeExpiresMs = performance.now() + 2400;
    }
    this.emitHud();
  }

  private emitHud(): void {
    const activeMission = MISSIONS[this.missionIdx];
    const nearMount = this.findNearestMount();
    const nearThrone = this.isNearThrone();
    const district = getDistrictName(this.playerX, this.playerZ);
    const currentChariot =
      this.mountedChariotIndex !== null
        ? this.chariots[this.mountedChariotIndex]
        : null;
    const currentAnimal =
      this.mountedAnimalIndex !== null
        ? this.animals[this.mountedAnimalIndex]
        : null;

    const mountKind: MountKind = currentChariot
      ? 'RATHA'
      : currentAnimal
      ? currentAnimal.kind
      : 'NONE';

    const inMultiplayer = Boolean(this.lanClient?.isMultiplayerActive());
    const activeMountObj = currentChariot ?? currentAnimal;
    const mountedSeatIndex: LanVehicleSeatIndex | null =
      mountKind !== 'NONE' ? (this.mountedSeatIndex ?? 0) : null;
    const mountedOccupantCount = activeMountObj
      ? (activeMountObj.driverId ? 1 : 0) + (activeMountObj.passengerId ? 1 : 0)
      : 0;
    const partnerId =
      activeMountObj && mountedSeatIndex !== null
        ? mountedSeatIndex === 0
          ? activeMountObj.passengerId
          : activeMountObj.driverId
        : null;
    const mountedPartnerName = partnerId
      ? this.remotePlayers.get(partnerId)?.name ??
        this.lanClient?.getSnapshot().players.find((p) => p.id === partnerId)?.name ??
        null
      : null;
    const canSwitchSeat = Boolean(
      inMultiplayer &&
        activeMountObj &&
        mountedSeatIndex !== null &&
        (mountedSeatIndex === 0 || activeMountObj.driverId === null)
    );
    const nearMountFull = Boolean(nearMount?.isFull && mountKind === 'NONE');

    const blips = this.activeBlips;
    blips.length = 0;
    let blipCursor = 0;
    const pushBlip = (id: string, kind: RadarBlip['kind'], x: number, z: number) => {
      let slot = this.blipPool[blipCursor];
      if (!slot) {
        slot = { id, kind, x, z };
        this.blipPool.push(slot);
      } else {
        slot.id = id;
        slot.kind = kind;
        slot.x = x;
        slot.z = z;
      }
      blipCursor++;
      blips.push(slot);
    };

    for (let i = 0; i < this.chariots.length; i++) {
      const c = this.chariots[i];
      pushBlip(c.id, 'RATHA', c.x, c.z);
    }
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.alive) {
        pushBlip(e.id, e.isCommander ? 'COMMANDER' : 'ENEMY', e.x, e.z);
      }
    }
    this.remotePlayers.forEach((rp) => {
      pushBlip(`ally_${rp.id}`, 'ALLY_PLAYER', rp.x, rp.z);
    });
    if (activeMission) {
      pushBlip(
        activeMission.id,
        'WAYPOINT',
        activeMission.waypoint.x,
        activeMission.waypoint.z
      );
    }
    const objTarget = this.astraQuest?.getObjectiveTarget();
    if (objTarget) {
      pushBlip(
        `astra_obj_${objTarget.astraId ?? 'done'}`,
        'ASTRA_OBJECTIVE',
        objTarget.x,
        objTarget.z
      );
    }

    let councilTotal = 0;
    let councilSeated = 0;
    for (let i = 0; i < this.citizens.length; i++) {
      const cit = this.citizens[i];
      if (cit.courtSeat !== null) {
        councilTotal++;
        if (cit.seated) councilSeated++;
      }
    }
    const demonVillageDistanceM = Math.round(
      Math.hypot(
        this.playerX - DEMON_VILLAGE_CENTER_X,
        this.playerZ - DEMON_VILLAGE_CENTER_Z
      )
    );

    const mountSpeedKmh = currentChariot
      ? Math.round(Math.abs(currentChariot.speed) * 3.2)
      : currentAnimal
      ? Math.round(Math.abs(currentAnimal.speed) * 3.2)
      : 0;

    let promptHint: string | null = this.astraQuest?.getPromptHint() ?? null;
    if (promptHint) {
      // Quest contextual hint has priority near shrine switches / sanctum
    } else if (this.mountNoticeText && performance.now() <= this.mountNoticeExpiresMs) {
      promptHint = this.mountNoticeText;
    } else if (this.brahmaSummonPhase === 'AIM_READY') {
      promptHint = 'Brahmastra Nocked — Press X or tap Shoot to unleash golden beam!';
    } else if (this.seatedOnThrone) {
      promptHint = 'Seated on the Royal Simhasana — E or Move to Rise · Drag to Orbit View';
    } else if (mountKind !== 'NONE') {
      const mLabel =
        mountKind === 'ELEPHANT'
          ? 'Sacred Elephant'
          : mountKind === 'HORSE'
          ? 'Royal Ashva'
          : 'Royal Ratha';
      if (inMultiplayer && mountedSeatIndex === 1) {
        promptHint = mountedPartnerName
          ? `Passenger on ${mLabel} (${mountedPartnerName} driving) · Aim & Fire freely · E: Dismount`
          : `Passenger on ${mLabel} · G: Take Reins (Driver) · E: Dismount`;
      } else if (this.autoDriveActive) {
        promptHint = `${mLabel} Auto-Drive on Paved Road — V: Manual · Shift: Gallop · E: Dismount`;
      } else {
        promptHint = this.stealthActive
          ? this.stealthSpotted
            ? 'Spotted in Stealth! Break line of sight · E to dismount'
            : `Stealth ${mLabel} — C: Reveal · V: Auto-Drive · E: Dismount`
          : inMultiplayer
          ? `Driving ${mLabel} (${mountedOccupantCount}/2) — G: Swap Seat · V: Auto-Drive · E: Dismount`
          : `Riding ${mLabel} — V: Auto-Drive · Shift: Gallop · E: Dismount · Demon Village ${demonVillageDistanceM}m`;
      }
    } else if (nearThrone) {
      promptHint = 'Royal Simhasana Throne — Press E or tap Sit to ascend the throne';
    } else if (this.isRamSwimming) {
      promptHint = 'Swimming — Space/Jump to boost up steps · Move to shore to climb out';
    } else if (this.stealthActive) {
      promptHint = this.stealthSpotted
        ? 'Detected! Move behind foes to regain Stealth'
        : 'Stealth Crouching (2x Ambush Shot) — C to stand';
    } else if (nearMount) {
      if (inMultiplayer && nearMount.isFull) {
        promptHint = `${nearMount.label} Full (2/2 riders)`;
      } else if (inMultiplayer && nearMount.occupiedCount === 1) {
        const seatLabel = nearMount.driverId === null ? 'Driver' : 'Passenger';
        promptHint = `${nearMount.label} (1/2) — Press E to board as ${seatLabel}`;
      } else {
        promptHint = `${nearMount.label} nearby — Press E or tap Mount`;
      }
    }

    const hpVal = Math.round(this.hp);
    const pranaVal = Math.round(this.prana);
    const chakraCd = Number(this.chakraCooldown.toFixed(1));
    const ascElapsed = Number(this.ascensionElapsed.toFixed(1));
    const roundedProgress = Math.round(this.assetProgress);
    const qMode = this.qualityManager.getMode();
    const qTier = this.qualityManager.getTier();
    const fpsVal = this.qualityManager.getFps();
    const targetFpsVal = this.qualityManager.getTargetFps();
    const resScaleVal = this.qualityManager.getDynamicResolutionScale();
    const benchSummary = this.qualityManager.getBenchmarkSummary();
    const pX = Math.round(this.playerX * 10);
    const pZ = Math.round(this.playerZ * 10);
    const pYaw = Math.round(this.camYaw * 50);

    const questHud = this.astraQuest
      ? this.astraQuest.buildHudState()
      : {
          astras: [],
          unlockedCount: 0,
          activeAstraId: 'AGNEYASTRA' as const,
          objectiveTitle: 'Trial of Fire: Agneyastra',
          objectiveDetail: 'Loading Divine Astras...',
          objectiveDistanceM: 0,
          challengeSubProgress: null,
          challengeTimerSec: null,
          underwaterBreath: null,
          brahmaTrialStage: 0 as const,
          allCompleted: false,
        };
    const enemySummonWarning = this.astraQuest?.getEnemySummonWarning() ?? null;
    const unlockPopup = this.astraQuest?.activeUnlockPopup ?? null;
    const selAstra = this.astraQuest?.selectedAstra ?? null;
    const aEnergy = Math.round(this.astraEnergy);
    const cdKey = `${this.astraCooldowns.AGNEYASTRA.toFixed(1)},${this.astraCooldowns.VARUNASTRA.toFixed(1)},${this.astraCooldowns.VAYAVYASTRA.toFixed(1)},${this.astraCooldowns.NAGASTRA.toFixed(1)},${this.astraCooldowns.BRAHMASTRA.toFixed(1)}`;
    const fAlpha = Number(this.brahmaFlashAlpha.toFixed(2));
    const dAlpha = Number(this.brahmaFadeAlpha.toFixed(2));

    const resPct = Math.round(resScaleVal * 100);
    const benchKey = benchSummary ? `${benchSummary.compositeScore}:${benchSummary.lockedTier}` : '0';
    const heroAbCd = Number(this.heroAbilityCooldown.toFixed(1));
    const camPersp = this.cameraSystem.getPerspective();
    const hudKey = `${hpVal}|${pranaVal}|${this.karma}|${this.wantedLevel}|${mountKind}|${nearMount?.label ?? ''}|${nearMountFull ? 1 : 0}|${mountedSeatIndex ?? ''}|${mountedOccupantCount}|${mountedPartnerName ?? ''}|${canSwitchSeat ? 1 : 0}|${nearThrone ? 1 : 0}|${this.seatedOnThrone ? 1 : 0}|${this.autoDriveActive ? 1 : 0}|${mountSpeedKmh}|${this.stealthActive ? 1 : 0}|${this.stealthSpotted ? 1 : 0}|${chakraCd}|${district.label}|${pX}|${pZ}|${pYaw}|${this.missionIdx}|${this.missionProgress}|${this.completedMissions}|${demonVillageDistanceM}|${this.ascensionActive ? 1 : 0}|${ascElapsed}|${councilSeated}|${this.worldReady ? 1 : 0}|${roundedProgress}|${this.assetStage}|${this.webglError ?? ''}|${qMode}|${qTier}|${fpsVal}|${targetFpsVal}|${resPct}|${benchKey}|${selAstra ?? ''}|${aEnergy}|${cdKey}|${this.brahmaSummonPhase}|${fAlpha}|${dAlpha}|${questHud.unlockedCount}|${questHud.challengeSubProgress ?? ''}|${questHud.challengeTimerSec ?? ''}|${questHud.underwaterBreath ?? ''}|${questHud.brahmaTrialStage}|${enemySummonWarning?.remainingSec ?? ''}|${unlockPopup?.id ?? ''}|${this.showStoryIntro ? 1 : 0}|${this.activeHeroId}|${this.isFlying ? 1 : 0}|${heroAbCd}|${camPersp}|${promptHint ?? ''}`;
    if (hudKey === this.lastHudKey) {
      return;
    }
    this.lastHudKey = hudKey;

    this.hudBlipsSnapshot.length = blips.length;
    for (let i = 0; i < blips.length; i++) {
      const b = blips[i];
      const existing = this.hudBlipsSnapshot[i];
      if (existing) {
        existing.id = b.id;
        existing.kind = b.kind;
        existing.x = b.x;
        existing.z = b.z;
      } else {
        this.hudBlipsSnapshot[i] = { id: b.id, kind: b.kind, x: b.x, z: b.z };
      }
    }

    this.callbacks.onHudUpdate({
      hp: hpVal,
      maxHp: this.maxHp,
      prana: pranaVal,
      maxPrana: this.maxPrana,
      karma: this.karma,
      wantedLevel: this.wantedLevel,
      inChariot: mountKind === 'RATHA',
      nearChariot: nearMount?.kind === 'RATHA',
      mountKind,
      nearMountLabel: nearMount ? nearMount.label : null,
      nearMountFull,
      mountedSeatIndex,
      mountedPartnerName,
      mountedOccupantCount,
      canSwitchSeat,
      nearThrone,
      onThrone: this.seatedOnThrone,
      autoDriveActive: this.autoDriveActive,
      chariotSpeedKmh: mountSpeedKmh,
      stealthActive: this.stealthActive,
      stealthSpotted: this.stealthSpotted,
      chakraCooldown: chakraCd,
      chakraMaxCooldown: this.chakraMaxCooldown,
      districtName: district.label,
      playerX: this.playerX,
      playerZ: this.playerZ,
      playerYaw: this.camYaw,
      missionTitle: activeMission
        ? activeMission.title
        : 'Ayodhya Secured — Free Roam',
      missionProgress: this.missionProgress,
      missionTarget: activeMission ? activeMission.targetCount : 0,
      completedMissions: this.completedMissions,
      totalMissions: MISSIONS.length,
      demonVillageDistanceM,
      ascensionActive: this.ascensionActive,
      ascensionElapsed: ascElapsed,
      courtSeatedCount: councilSeated,
      courtTotalCount: councilTotal,
      promptHint,
      blips: this.hudBlipsSnapshot.slice(),
      assetsReady: this.worldReady,
      assetProgress: roundedProgress,
      assetStage: this.assetStage,
      webglError: this.webglError,
      qualityMode: qMode,
      qualityTier: qTier,
      fps: fpsVal,
      targetFps: targetFpsVal,
      resolutionScale: resScaleVal,
      hardwareBenchmark: benchSummary,
      selectedAstra: selAstra,
      astraEnergy: aEnergy,
      maxAstraEnergy: ASTRA_MAX_ENERGY,
      astraCooldowns: {
        AGNEYASTRA: Number(this.astraCooldowns.AGNEYASTRA.toFixed(1)),
        VARUNASTRA: Number(this.astraCooldowns.VARUNASTRA.toFixed(1)),
        VAYAVYASTRA: Number(this.astraCooldowns.VAYAVYASTRA.toFixed(1)),
        NAGASTRA: Number(this.astraCooldowns.NAGASTRA.toFixed(1)),
        BRAHMASTRA: Number(this.astraCooldowns.BRAHMASTRA.toFixed(1)),
      },
      brahmastraAimReady: this.brahmaSummonPhase === 'AIM_READY',
      brahmastraSummoning:
        this.brahmaSummonPhase !== 'IDLE' && this.brahmaSummonPhase !== 'AIM_READY',
      brahmaFlashAlpha: fAlpha,
      brahmaFadeAlpha: dAlpha,
      astraQuest: questHud,
      astraUnlockPopup: unlockPopup,
      enemySummonWarning,
      showStoryIntro: this.showStoryIntro,
      activeHeroId: this.activeHeroId,
      isFlying: this.isFlying,
      heroAbilityCooldown: heroAbCd,
      heroAbilityMaxCooldown: this.heroAbilityMaxCooldown,
      cameraPerspective: camPersp,
    });
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (this.contextLost || !gl || gl.isContextLost() || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      if (this.contextLost || gl.isContextLost()) {
        if (sync) {
          try {
            gl.deleteSync(sync);
          } catch {
            // Ignore cleanup failure on lost context
          }
        }
        this.frameId = window.setTimeout(cb, 80);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;

      const gl = this.renderer.getContext();
      if (!this.contextLost && (!gl || gl.isContextLost())) {
        this.handleWebglContextLost();
      }

      if (this.tabPaused || this.contextLost) {
        this.clock.getDelta();
        if (this.isSoftwareGl || this.contextLost) {
          this.frameId = window.setTimeout(tick, 140);
        } else {
          this.frameId = requestAnimationFrame(tick);
        }
        return;
      }

      const rawDt = this.clock.getDelta();
      const dt = Math.min(0.05, rawDt);
      const elapsed = this.clock.elapsedTime;

      const scaleAdj = this.qualityManager.recordFrame(
        rawDt,
        this.worldReady && this.mode === 'PLAYING'
      );
      if (scaleAdj.tierChanged !== null) {
        this.applyQualityProfile(this.qualityManager.getProfile());
        this.emitHud();
      } else if (scaleAdj.resolutionChanged) {
        this.applyDynamicResolutionOnly(this.qualityManager.getProfile());
        this.emitHud();
      }

      if (!this.worldReady) {
        // Strict First-Person eye view while world assets stream in asynchronously
        this.updateAtmosphericMood();
        this.applyFirstPersonCamera(false);
        const readyGl = this.renderer.getContext();
        if (!readyGl || readyGl.isContextLost()) {
          this.handleWebglContextLost();
          this.frameId = window.setTimeout(tick, 140);
          return;
        }
        this.renderer.render(this.scene, this.camera);
        if (this.isSoftwareGl) {
          this.afterDraw(tick);
        } else {
          this.frameId = requestAnimationFrame(tick);
        }
        return;
      }

      const profile = this.qualityManager.getProfile();
      if (profile.tier === 'LOW' && (this.simFrameCounter & 1) === 0) {
        this.renderer.shadowMap.needsUpdate = true;
      }

      if (this.mode === 'PLAYING') {
        this.stepSimulation(dt, elapsed);
        this.hudEmitAccum += dt;
        if (this.hudEmitAccum >= 0.16) {
          this.hudEmitAccum = 0;
          this.emitHud();
        }
      } else if (this.mode === 'TITLE') {
        // Strict First-Person eye view on Title Screen with ambient day-night/volcanic eruptions
        this.simFrameCounter++;
        this.stepVolcanicAtmosphere(dt);
        this.updateAtmosphericMood();
        this.updateNightLampsPool(elapsed);
        if (this.skyUniforms) this.skyUniforms.uTime.value = elapsed;
        if (this.waterShaderUniforms) this.waterShaderUniforms.uTime.value = elapsed;
        if (this.waterfallShaderUniforms) this.waterfallShaderUniforms.uTime.value = elapsed;
        if (this.foliageWindUniforms) this.foliageWindUniforms.uWindTime.value = elapsed;
        if (this.torchFlameUniforms) this.torchFlameUniforms.uFlameTime.value = elapsed;
        if (this.shivlingWaterUniforms) {
          this.shivlingWaterUniforms.uTime.value = elapsed;
        }
        for (let i = 0; i < this.floatingIslandWfUniforms.length; i++) {
          this.floatingIslandWfUniforms[i].uTime.value = elapsed;
        }
        for (let i = 0; i < this.floatingIslands.length; i++) {
          const isl = this.floatingIslands[i];
          const baseY = typeof isl.userData.baseY === 'number' ? isl.userData.baseY : isl.position.y;
          const phase = typeof isl.userData.phase === 'number' ? isl.userData.phase : i;
          isl.position.y = baseY + Math.sin(elapsed * 0.65 + phase) * 1.1;
        }
        this.playerHorizSpeed = 0;
        this.playerTurnRate = 0;
        this.updateHairAndCapePhysics(dt, elapsed);
        this.updateDynamicHeroLighting(this.camYaw);
        this.applyFirstPersonCamera(false);
        this.updateUnderwaterPostProcessing(elapsed);
      }

      // Incremental micro-budgeted background preloading of standby rigs (zero frame drops)
      this.poolManager.stepPrewarm(this.isSoftwareGl ? 0.6 : 1.5);

      // Live real-time VRAM/heap budget enforcement, texture downscaling & shader simplification
      this.dynamicScaler.stepFrame(
        rawDt,
        {
          allowAutoScale: this.worldReady && this.mode === 'PLAYING',
          renderer: this.renderer,
          qualityManager: this.qualityManager,
          textures: this.textures,
          poolManager: this.poolManager,
          astraVfx: this.astraVfx,
          keyShadowSize: this.keyLight.shadow.mapSize.width,
          torchShadowSize: this.torchShadowLight.shadow.mapSize.width,
          torchShadowEnabled: this.torchShadowLight.castShadow,
          composerRt: this.composerRenderTarget,
          hasEnvProbe: Boolean(this.envRenderTarget),
          onProfileNeedsApply: () => {
            this.applyQualityProfile(this.qualityManager.getProfile());
            this.emitHud();
          },
          onEmergencyEnvironmentStrip: () => {
            this.envRenderTarget?.dispose();
            this.envRenderTarget = null;
            this.scene.environment = null;
          },
        },
        this.isSoftwareGl ? 0.8 : 2.0
      );

      // Run Frustum + Solid AABB Occlusion Culling right before draw (zero fog cutoff)
      const fog = this.scene.fog as THREE.Fog | null;
      this.camera.updateMatrixWorld();
      this.occlusionManager.update(
        this.camera,
        fog ? fog.far : Number.POSITIVE_INFINITY,
        true
      );

      const activeGl = this.renderer.getContext();
      if (!activeGl || activeGl.isContextLost()) {
        this.handleWebglContextLost();
        this.frameId = window.setTimeout(tick, 140);
        return;
      }

      if (this.composer && !this.isSoftwareGl && this.cameraSubmerged > 0.002) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.frameId = window.setTimeout(tick, 16);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private handleResize = (): void => {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth || window.innerWidth || 844);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight || 390);
    const profile = this.qualityManager.getProfile();
    const effectivePr = this.getEffectivePixelRatio(profile);
    const aspect = width / height;
    this.camera.aspect = aspect;
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();
    if (this.contextLost) return;
    this.renderer.setPixelRatio(effectivePr);
    this.renderer.setSize(width, height);
    if (!this.isSoftwareGl && this.composer) {
      this.rebuildPostComposer(width, height, profile);
    }
  };

  public dispose(): void {
    this.disposed = true;
    this.loadAbort.abort();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    clearTimeout(this.contextRecoveryTimer);
    window.removeEventListener('resize', this.handleResize);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.detachContextListeners(this.renderer.domElement);
    this.occlusionManager.clear();
    this.clearRemotePlayers();
    this.dynamicScaler.dispose();
    this.projectileSync.dispose();
    this.astraVfx?.dispose();
    this.poolManager.dispose();
    soundEngine.setAmbienceDuck(false);
    this.lodCache?.dispose();
    this.lodCache = null;
    this.stealthRootMatsCache.clear();
    this.stealthMaterialCache.clear();
    this.bloomPass?.dispose();
    this.bloomPass = null;
    this.composer?.dispose();
    this.composerRenderTarget?.dispose();
    this.composerRenderTarget = null;
    this.envRenderTarget?.dispose();
    this.envRenderTarget = null;
    this.scene.environment = null;
    this.textures?.dispose();
    this.textures = null;
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh || (obj as THREE.Points).isPoints) {
        const renderObj = obj as THREE.Mesh | THREE.Points;
        renderObj.geometry?.dispose();
        if (Array.isArray(renderObj.material)) {
          renderObj.material.forEach((m) => m.dispose());
        } else {
          renderObj.material?.dispose();
        }
      } else if ((obj as THREE.Sprite).isSprite) {
        (obj as THREE.Sprite).material?.dispose();
      }
    });
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
