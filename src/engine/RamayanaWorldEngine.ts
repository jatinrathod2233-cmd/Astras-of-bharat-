import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  DemonVariant,
  InputState,
  MountKind,
  NpcRole,
  PlayMode,
  RadarBlip,
  WorldHudSnapshot,
} from '../types/world';
import { soundEngine } from '../utils/audio';
import { ObjectPoolManager, swapRemoveAt } from './ObjectPoolManager';
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
  createCrocodileModel,
  createDemonModel,
  createDemonStructureModel,
  createDolphinModel,
  createElephantStableModel,
  createFishSchoolGeometry,
  createGiantTurtleModel,
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
import { createProceduralTextures, ProceduralTextures } from './textures';
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

const UnderwaterVolumeShader = {
  uniforms: {
    tDiffuse: { value: null },
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
      if (uSubmerged <= 0.001) {
        gl_FragColor = texel;
        return;
      }
      vec3 absorption = mix(vec3(1.0), vec3(0.30, 0.68, 0.96), uSubmerged);
      vec3 tinted = texel.rgb * absorption;

      vec3 shallowWater = vec3(0.06, 0.36, 0.60) * mix(0.28, 1.0, uDaylight);
      vec3 deepWater = vec3(0.02, 0.15, 0.34) * mix(0.28, 1.0, uDaylight);
      vec3 waterCol = mix(shallowWater, deepWater, uDepthFactor);

      float causticA = sin(vUv.x * 16.0 + uTime * 1.6 + sin(vUv.y * 8.0 + uTime));
      float causticB = cos(vUv.x * 23.0 - uTime * 1.2 + vUv.y * 11.0);
      float caustic = pow(max(0.0, causticA * causticB), 3.0) * (1.0 - vUv.y * 0.85) * (1.0 - uDepthFactor * 0.65);
      vec3 causticCol = mix(vec3(0.18, 0.44, 0.74), vec3(0.30, 0.76, 1.0), uDaylight);

      float scatterMix = uSubmerged * (0.32 + 0.28 * uDepthFactor);
      vec3 finalCol = mix(tinted, waterCol, scatterMix) + causticCol * (caustic * 0.24 * uSubmerged);

      float distCenter = length(vUv - vec2(0.5));
      float vig = smoothstep(0.35, 0.92, distCenter);
      finalCol = mix(finalCol, deepWater * 0.68, vig * 0.50 * uSubmerged);

      gl_FragColor = vec4(finalCol, texel.a);
    }
  `,
};

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
const _camClipResult = { x: 0, y: 0, z: 0 };
const _dummy = new THREE.Object3D();
const _colMist = new THREE.Color(0xc8c2b9);
const _colSunset = new THREE.Color(0xc96c42);
const _colNightMist = new THREE.Color(0x040813);
const _colAsh = new THREE.Color(0x21171b);
const _colUnderDay = new THREE.Color(0x0b4b75);
const _colUnderNight = new THREE.Color(0x04192e);
const _tmpUnderCol = new THREE.Color();
const _colHemiDay = new THREE.Color(0xffe7bd);
const _colHemiNight = new THREE.Color(0x162447);
const _colHemiAsh = new THREE.Color(0x7a5460);
const _colGroundNight = new THREE.Color(0x05070c);
const _colKeyDay = new THREE.Color(0xfff1d6);
const _colKeySunset = new THREE.Color(0xff9b52);
const _colKeyMoon = new THREE.Color(0xa6c4ff);
const _colKeyAsh = new THREE.Color(0xff9666);
const _colSkyHDay = new THREE.Color(0xc8c2b9);
const _colSkyMDay = new THREE.Color(0x9ea8b8);
const _colSkyZDay = new THREE.Color(0x4b6891);
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
  kind: 'RATHA' | 'HORSE' | 'ELEPHANT';
  index: number;
  label: string;
} = { kind: 'RATHA', index: 0, label: '' };
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

interface ChariotEntity {
  id: string;
  rig: ChariotRig;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  speed: number;
  gaitPhase: number;
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
  gaitPhase: number;
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
}

interface ProjectileEntity {
  mesh: THREE.Group;
  spinPivot?: THREE.Group;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  isChakra: boolean;
  stealthAmbush: boolean;
  life: number;
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
  private textures: ProceduralTextures;
  private poolManager: ObjectPoolManager;
  private hemiLight: THREE.HemisphereLight;
  private giLightProbe: THREE.LightProbe;
  private bounceLight: THREE.DirectionalLight;
  private keyLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private torchShadowLight: THREE.SpotLight;
  private heroFillLight: THREE.PointLight;
  private combatLight: THREE.PointLight;
  private volcanoGlowLight: THREE.PointLight;
  private isSoftwareGl: boolean;
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

  private ramRig: CharacterRig;
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
  private colliderGrid!: StaticColliderSpatialGrid;
  private maxAnisotropy = 1;
  private simFrameCounter = 0;
  private beaconGroup: THREE.Group;
  private waterMesh: THREE.Mesh;
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
  private composer: EffectComposer | null = null;
  private underwaterPass: ShaderPass | null = null;
  private underwaterSoftwareQuad: THREE.Mesh | null = null;
  private skyUniforms: {
    uHorizonColor: { value: THREE.Color };
    uMidColor: { value: THREE.Color };
    uZenithColor: { value: THREE.Color };
    uSunDir: { value: THREE.Vector3 };
    uMoonDir: { value: THREE.Vector3 };
    uTwilight: { value: number };
    uNightFactor: { value: number };
  } | null = null;
  private moonGroup: THREE.Group | null = null;
  private moonHaloSprite: THREE.Sprite | null = null;
  private starPoints: THREE.Points | null = null;
  private starUniforms: { uTime: { value: number }; uOpacity: { value: number } } | null = null;
  private fireflyPoints: THREE.Points | null = null;
  private fireflyUniforms: { uTime: { value: number }; uOpacity: { value: number } } | null = null;
  private fireflyBase: Array<{
    bx: number;
    by: number;
    bz: number;
    ampX: number;
    ampY: number;
    ampZ: number;
    speed: number;
    phase: number;
  }> = [];
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
  private ramPose = {
    leftHip: 0,
    rightHip: 0,
    leftKnee: 0.06,
    rightKnee: 0.06,
    leftAnkle: -0.04,
    rightAnkle: -0.04,
    leftArm: -0.1,
    rightArm: 0.03,
    leftElbow: -0.44,
    rightElbow: -0.22,
    hipY: 0.93,
    torsoRotX: 0,
    torsoRotY: 0,
    torsoRotZ: 0,
  };

  // Camera state (Free 360 horizontal + unrestricted vertical orbit + zoom distance)
  private camYaw = 0;
  private camPitch = 0.34;
  private camDistanceFoot = 7.0;
  private camDistanceChariot = 10.6;
  private cameraManualHold = 0;
  private camChariotLockTimer = 0;
  private camSmoothPos = new THREE.Vector3(0, 6, 22);
  private camSmoothLook = new THREE.Vector3(0, 1.8, 12);

  // Mission state
  private missionIdx = 0;
  private missionProgress = 0;
  private completedMissions = 0;
  private spawnTimer = 0;
  private hudEmitAccum = 0;
  private webglError: string | null = null;

  // Input buffer updated externally
  public input: InputState = {
    moveX: 0,
    moveY: 0,
    cameraDeltaX: 0,
    cameraDeltaY: 0,
    zoomDelta: 0,
    sprint: false,
    jumpPressed: false,
    fireHeld: false,
    astraPressed: false,
    interactPressed: false,
    stealthTogglePressed: false,
    autoDriveTogglePressed: false,
  };

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    this.isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    const nativePixelRatio = this.isSoftwareGl
      ? 1
      : Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.maxAnisotropy = Math.max(1, this.renderer.capabilities.getMaxAnisotropy());
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setPixelRatio(nativePixelRatio);
    this.renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.imageRendering = 'auto';
    container.appendChild(this.renderer.domElement);

    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.webglError = 'WebGL rendering context paused. Restoring scene...';
      this.emitHud();
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.webglError = null;
      this.emitHud();
    });

    // Scene, thick misty atmospheric fog & matched horizon sky dome
    this.scene = new THREE.Scene();
    const mistColor = new THREE.Color(0xc8c2b9);
    this.scene.background = mistColor;
    this.scene.fog = new THREE.FogExp2(0xc8c2b9, 0.0086);

    this.camera = new THREE.PerspectiveCamera(
      58,
      (container.clientWidth || window.innerWidth) /
        (container.clientHeight || window.innerHeight),
      0.5,
      850
    );

    // Studio RoomEnvironment for crisp metallic gold & armor specular/Fresnel reflections
    if (!this.isSoftwareGl) {
      RectAreaLightUniformsLib.init();
    }
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmrem.dispose();

    // Global Illumination System: L0/L1/L2 Spherical Harmonics LightProbe + Sky/Ground Hemi + Dynamic Ground Bounce + Crisp Real-Time Shadows
    this.giLightProbe = new THREE.LightProbe(new THREE.SphericalHarmonics3(), 0.72);
    this.scene.add(this.giLightProbe);

    this.hemiLight = new THREE.HemisphereLight(0xffe7bd, 0x4b4032, 0.78);
    this.scene.add(this.hemiLight);

    this.bounceLight = new THREE.DirectionalLight(0xdcb47d, 0.42);
    this.bounceLight.position.set(0, -18, 0);
    this.bounceLight.castShadow = false;
    this.scene.add(this.bounceLight);
    this.scene.add(this.bounceLight.target);

    this.keyLight = new THREE.DirectionalLight(0xfff1d6, 2.25);
    this.keyLight.position.set(48, 72, 36);
    this.keyLight.castShadow = !this.isSoftwareGl;
    const shadowSize = this.isSoftwareGl ? 1024 : 2048;
    this.keyLight.shadow.mapSize.set(shadowSize, shadowSize);
    const d = 22;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.camera.near = 4;
    this.keyLight.shadow.camera.far = 148;
    this.keyLight.shadow.bias = -0.00018;
    this.keyLight.shadow.normalBias = 0.015;
    this.keyLight.shadow.radius = 1.6;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    this.rimLight = new THREE.DirectionalLight(0xc8dcf8, 0.9);
    this.rimLight.position.set(-18, 12, -22);
    this.scene.add(this.rimLight);
    this.scene.add(this.rimLight.target);

    // Secondary Dynamic Shadow-Casting SpotLight for nearest active Street Lamp / Torch flame at night (disabled in daytime for 60 FPS)
    this.torchShadowLight = new THREE.SpotLight(0xff9b38, 0, 28, Math.PI * 0.44, 0.6, 1.4);
    this.torchShadowLight.castShadow = false;
    this.torchShadowLight.shadow.mapSize.set(this.isSoftwareGl ? 512 : 1024, this.isSoftwareGl ? 512 : 1024);
    this.torchShadowLight.shadow.camera.near = 0.4;
    this.torchShadowLight.shadow.camera.far = 28;
    this.torchShadowLight.shadow.bias = -0.00025;
    this.torchShadowLight.shadow.normalBias = 0.02;
    this.scene.add(this.torchShadowLight);
    this.scene.add(this.torchShadowLight.target);

    // Warm Architectural Bounce RectAreaLights inside Sabha & Palace portals (hardware GPU)
    if (!this.isSoftwareGl) {
      const sabhaBounce = new THREE.RectAreaLight(0xffcfa0, 2.2, 8.5, 4.0);
      sabhaBounce.position.set(SABHA_HALL_POS.x, groundHeightAt(SABHA_HALL_POS.x, SABHA_HALL_POS.z) + 4.4, SABHA_HALL_POS.z);
      sabhaBounce.lookAt(SABHA_HALL_POS.x, 0, SABHA_HALL_POS.z);
      this.scene.add(sabhaBounce);

      const palaceBounce = new THREE.RectAreaLight(0xffd4a8, 2.0, 9.0, 4.2);
      palaceBounce.position.set(PALACE_CORE_POS.x, groundHeightAt(PALACE_CORE_POS.x, PALACE_CORE_POS.z) + 4.6, PALACE_CORE_POS.z);
      palaceBounce.lookAt(PALACE_CORE_POS.x, 0, PALACE_CORE_POS.z);
      this.scene.add(palaceBounce);
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

    this.textures = createProceduralTextures(this.renderer, this.isSoftwareGl);

    this.waterMesh = this.buildWorldEnvironment();
    this.colliderGrid = new StaticColliderSpatialGrid(this.colliders, this.circleColliders);
    this.ramRig = createLordRamModel(this.textures);
    this.scene.add(this.ramRig.root);
    this.enforcePbrAndAnisotropy(this.scene);

    this.beaconGroup = this.createWaypointBeacon();
    this.scene.add(this.beaconGroup);

    // Underwater Post-Processing Volume (Native-Resolution MSAA EffectComposer + UnderwaterVolumeShader + OutputPass;
    // zero Bloom or Depth-of-Field blur passes). Direct hardware MSAA backbuffer is used above water.
    const rtWidth = container.clientWidth || window.innerWidth;
    const rtHeight = container.clientHeight || window.innerHeight;
    if (!this.isSoftwareGl) {
      const maxSamples = this.renderer.capabilities.maxSamples || 4;
      const msaaSamples = Math.min(8, Math.max(4, maxSamples));
      const renderTarget = new THREE.WebGLRenderTarget(
        Math.max(1, Math.floor(rtWidth * nativePixelRatio)),
        Math.max(1, Math.floor(rtHeight * nativePixelRatio)),
        {
          type: THREE.HalfFloatType,
          samples: msaaSamples,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
        }
      );
      this.composer = new EffectComposer(this.renderer, renderTarget);
      this.composer.setPixelRatio(nativePixelRatio);
      this.composer.setSize(rtWidth, rtHeight);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.underwaterPass = new ShaderPass(UnderwaterVolumeShader);
      this.composer.addPass(this.underwaterPass);
      this.composer.addPass(new OutputPass());
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
    this.initObjectPools();

    this.resetWorldEntities();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    window.addEventListener('resize', this.handleResize);
    this.emitHud();
    this.startLoop();
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
        const rig = createRathaChariotModel(this.textures);
        this.enforcePbrAndAnisotropy(rig.root);
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
            const rig = createDemonModel(this.textures, variant, isCommander);
            rig.root.userData._defaultTorsoY = rig.torso.position.y;
            this.enforcePbrAndAnisotropy(rig.root);
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
    const maxAniso = this.maxAnisotropy;
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (let i = 0; i < mats.length; i++) {
        const m = mats[i] as THREE.MeshPhysicalMaterial;
        if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) {
          m.envMapIntensity = Math.max(1.0, m.envMapIntensity || 1.0);
          if (m.map) { m.map.generateMipmaps = true; m.map.minFilter = THREE.LinearMipmapLinearFilter; m.map.magFilter = THREE.LinearFilter; m.map.anisotropy = maxAniso; }
          if (m.normalMap) { m.normalMap.generateMipmaps = true; m.normalMap.minFilter = THREE.LinearMipmapLinearFilter; m.normalMap.magFilter = THREE.LinearFilter; m.normalMap.anisotropy = maxAniso; }
          if (m.roughnessMap) { m.roughnessMap.generateMipmaps = true; m.roughnessMap.minFilter = THREE.LinearMipmapLinearFilter; m.roughnessMap.magFilter = THREE.LinearFilter; m.roughnessMap.anisotropy = maxAniso; }
          if (m.metalnessMap) { m.metalnessMap.generateMipmaps = true; m.metalnessMap.minFilter = THREE.LinearMipmapLinearFilter; m.metalnessMap.magFilter = THREE.LinearFilter; m.metalnessMap.anisotropy = maxAniso; }
          if (m.emissiveMap) { m.emissiveMap.generateMipmaps = true; m.emissiveMap.minFilter = THREE.LinearMipmapLinearFilter; m.emissiveMap.magFilter = THREE.LinearFilter; m.emissiveMap.anisotropy = maxAniso; }
        }
      }
    });
  }

  private buildWorldEnvironment(): THREE.Mesh {
    this.roofOccluders = [];
    // 0. Dynamic Day-Night Atmospheric Sky Dome Shader + Sun + Prominent Moon + Dense Starlight + Ambient Fireflies
    const skyRadius = 780;
    const skyGeo = new THREE.SphereGeometry(skyRadius, 32, 20);
    this.skyUniforms = {
      uHorizonColor: { value: new THREE.Color(0xc8c2b9) },
      uMidColor: { value: new THREE.Color(0x9ea8b8) },
      uZenithColor: { value: new THREE.Color(0x4b6891) },
      uSunDir: { value: new THREE.Vector3(0.5, 0.7, -0.4).normalize() },
      uMoonDir: { value: new THREE.Vector3(-0.5, -0.7, 0.4).normalize() },
      uTwilight: { value: 0.0 },
      uNightFactor: { value: 0.0 },
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
        varying vec3 vWorldDir;
        void main() {
          float h = clamp(vWorldDir.y, 0.0, 1.0);
          vec3 baseSky = h < 0.28
            ? mix(uHorizonColor, uMidColor, h / 0.28)
            : mix(uMidColor, uZenithColor, (h - 0.28) / 0.72);
          float sunDot = max(0.0, dot(normalize(vWorldDir), normalize(uSunDir)));
          baseSky += vec3(1.0, 0.48, 0.16) * pow(sunDot, 5.0) * (0.45 * uTwilight);
          float moonDot = max(0.0, dot(normalize(vWorldDir), normalize(uMoonDir)));
          baseSky += vec3(0.24, 0.34, 0.56) * pow(moonDot, 14.0) * (0.55 * uNightFactor);
          gl_FragColor = vec4(baseSky, 1.0);
        }
      `,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyDome);

    // Sun Disc
    this.sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(26, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffe8ba, fog: false })
    );
    this.sunDisc.position.set(340, 260, -310);
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
    const maxAniso = Math.max(1, this.renderer.capabilities.getMaxAnisotropy());
    const lunarTex = new THREE.CanvasTexture(lunarCanvas);
    lunarTex.colorSpace = THREE.SRGBColorSpace;
    lunarTex.generateMipmaps = true;
    lunarTex.minFilter = THREE.LinearMipmapLinearFilter;
    lunarTex.magFilter = THREE.LinearFilter;
    lunarTex.anisotropy = maxAniso;

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

    this.moonGroup = new THREE.Group();
    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(28, 24, 24),
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
    this.moonHaloSprite.scale.set(145, 145, 1);
    this.moonGroup.add(this.moonHaloSprite);
    this.scene.add(this.moonGroup);

    // Dense Twinkling Starlight Canopy (2,400 multi-magnitude stars)
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
      const rad = 710 + sRand() * 35;
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
    this.scene.add(this.starPoints);

    // Ambient Bioluminescent Fireflies Swarm across Ayodhya Groves, Stepwell & Riverbanks
    const ffCount = 190;
    const ffPos = new Float32Array(ffCount * 3);
    const ffPhase = new Float32Array(ffCount);
    this.fireflyBase = [];
    for (let i = 0; i < ffCount; i++) {
      const ang = sRand() * Math.PI * 2;
      const dist = 12 + sRand() * 118;
      const fx = Math.cos(ang) * dist;
      const fz = Math.sin(ang) * dist - 20;
      const fy = Math.max(0.4, groundHeightAt(fx, fz)) + 0.7 + sRand() * 3.4;
      this.fireflyBase.push({
        bx: fx,
        by: fy,
        bz: fz,
        ampX: 1.2 + sRand() * 2.4,
        ampY: 0.45 + sRand() * 0.9,
        ampZ: 1.2 + sRand() * 2.4,
        speed: 0.55 + sRand() * 0.85,
        phase: sRand() * Math.PI * 2,
      });
      ffPos[i * 3] = fx;
      ffPos[i * 3 + 1] = fy;
      ffPos[i * 3 + 2] = fz;
      ffPhase[i] = sRand() * Math.PI * 2;
    }
    const ffGeo = new THREE.BufferGeometry();
    ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
    ffGeo.setAttribute('aPhase', new THREE.BufferAttribute(ffPhase, 1));
    this.fireflyUniforms = { uTime: { value: 0 }, uOpacity: { value: 0 } };
    const ffMat = new THREE.ShaderMaterial({
      uniforms: this.fireflyUniforms,
      vertexShader: /* glsl */ `
        attribute float aPhase;
        uniform float uTime;
        varying float vPulse;
        void main() {
          float pulse = 0.5 + 0.5 * sin(uTime * 3.2 + aPhase * 2.3);
          vPulse = 0.25 + 0.75 * pow(pulse, 2.2);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
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
    this.scene.add(this.fireflyPoints);

    // 1. Multi-Zone High-Density Displaced Open-World Terrain
    //    Zone 1: Ayodhya Precincts (720x720 @ 220x220 = ~3.2m mesh fidelity for Stepwell & Riverbanks)
    //    Zone 2: 5 km Royal Highway & Plains (4240x520 @ 240x64)
    //    Zone 3: Dense High-Fidelity Volcanic Basin & Calderas (1040x900 @ 220x180 = ~4.7m fidelity!)
    const terrainMat = new THREE.MeshPhysicalMaterial({
      map: this.textures.grassEarth,
      normalMap: this.textures.grassNormal,
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughnessMap: this.textures.grassRoughness,
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.02,
      ior: 1.45,
      specularIntensity: 0.35,
    });

    const cGrass = new THREE.Color(0x5e7841);
    const cSand = new THREE.Color(0xc29e68);
    const cVulcanAsh = new THREE.Color(0x1f1b24);
    const cVulcanChar = new THREE.Color(0x141117);
    const cMagmaSeam = new THREE.Color(0x6e200d);
    const cDrySteppe = new THREE.Color(0x887c4b);
    const cTmp = new THREE.Color();

    const buildTerrainZone = (
      centerX: number,
      centerZ: number,
      width: number,
      depth: number,
      segW: number,
      segD: number
    ) => {
      const geo = new THREE.PlaneGeometry(width, depth, segW, segD);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      const colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const wx = centerX + pos.getX(i);
        const wz = centerZ + pos.getZ(i);
        const wy = groundHeightAt(wx, wz);
        pos.setY(i, wy);

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
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, terrainMat);
      mesh.position.set(centerX, 0, centerZ);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.lockStaticHierarchy(mesh);
    };

    buildTerrainZone(0, 0, 720, 720, 220, 220);
    buildTerrainZone(1200, 0, 1680, 520, 220, 64);
    buildTerrainZone(2560, 0, 1040, 900, 220, 180);

    // 2. Royal Sandstone Pathways & 2.5 km Royal Highway (strictly non-overlapping segments; crossroads replaced by carpet or solid grass)
    const roadMat = new THREE.MeshPhysicalMaterial({
      map: this.textures.avenueStone,
      normalMap: this.textures.avenueNormal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: this.textures.avenueRoughness,
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
      map: this.textures.redCarpet,
      normalMap: this.textures.redCarpetNormal,
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughnessMap: this.textures.redCarpetRoughness,
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
    const mahadev = createMahadevStatueModel(this.textures, 0, 0);
    this.scene.add(mahadev.group);
    this.lockStaticHierarchy(mahadev.group);
    this.circleColliders.push({
      x: 0,
      z: 0,
      radius: mahadev.radius,
      height: mahadev.height,
      baseY: groundHeightAt(0, 0),
    });

    // Grand Royal Torana Archways framing the central plaza & 2.5 km Frontier Gate
    this.addToranaArch(0, 20, 0);
    this.addToranaArch(21, 0, Math.PI / 2);
    this.addToranaArch(2080, 0, Math.PI / 2);

    // 3. Sculpted 20-Foot Deep Meandering Sarayu River Water Ribbon (clear translucent aqua revealing full depth & aquatic life)
    const waterGeo = new THREE.PlaneGeometry(1, 840, 14, 220);
    waterGeo.rotateX(-Math.PI / 2);
    const wPos = waterGeo.attributes.position;
    for (let i = 0; i < wPos.count; i++) {
      const u = wPos.getX(i);
      const wz = wPos.getZ(i);
      const rc = riverCenterX(wz);
      const rw = riverHalfWidth(wz);
      wPos.setX(i, rc + u * (rw * 2 + 5.2));
    }
    waterGeo.computeVertexNormals();
    const waterMat = new THREE.MeshPhysicalMaterial({
      map: this.textures.water,
      normalMap: this.textures.waterNormal,
      normalScale: new THREE.Vector2(1.0, 1.0),
      color: 0x269cb8,
      roughness: 0.06,
      metalness: 0.08,
      ior: 1.333,
      reflectivity: 0.94,
      specularIntensity: 1.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.55,
      transparent: true,
      opacity: 0.74,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    waterMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        vec3 waterViewDir = normalize(vViewPosition);
        float wDotN = clamp(dot(waterViewDir, normalize(vNormal)), 0.0, 1.0);
        float schlickFresnel = 0.02 + 0.98 * pow(1.0 - wDotN, 5.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.68, 0.86, 0.98), schlickFresnel * 0.45);
        gl_FragColor.a = clamp(gl_FragColor.a + schlickFresnel * 0.24, 0.0, 0.96);
        #include <dithering_fragment>
        `
      );
    };
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.set(0, RIVER_SURFACE_Y, 0);
    waterMesh.renderOrder = 2;
    this.scene.add(waterMesh);
    this.lockStaticHierarchy(waterMesh);

    // 4. Arched Carved Sandstone Bridges Matching groundHeightAt(x, z) Strictly
    const bridgeMat = new THREE.MeshStandardMaterial({
      map: this.textures.sandstone,
      normalMap: this.textures.sandstoneNormal,
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
      const deck = new THREE.Mesh(archDeckGeo, bridgeMat);
      deck.position.set(RIVER_CENTER_X, 0, bz);
      deck.castShadow = true;
      deck.receiveShadow = true;
      this.scene.add(deck);
      this.lockStaticHierarchy(deck);

      [-5.9, 5.9].forEach((offsetZ) => {
        const rail = new THREE.Mesh(archRailGeo, bridgeMat);
        rail.position.set(RIVER_CENTER_X, 0, bz + offsetZ);
        rail.castShadow = true;
        rail.receiveShadow = true;
        this.scene.add(rail);
        this.lockStaticHierarchy(rail);

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
          pier.position.set(pierX, topY - pierH * 0.5, bz + pierOffZ);
          this.scene.add(pier);
          this.lockStaticHierarchy(pier);
          this.circleColliders.push({
            x: pierX,
            z: bz + pierOffZ,
            radius: 1.05,
            height: pierH + 0.5,
            baseY: -7.0,
          });
        });
      });
    });

    // 5. LORD RAM'S SEVEN-STORY ROYAL PALACE COMPLEX (Zero-Overlap Masterplan)
    // 5a. Walkable Seven-Story Palace + Rajya Sabha Hall + Throne + 16 Council Seats + Every-Floor Torches
    const palaceBuilt = createSevenStoryPalaceAndSabhaModel(
      this.textures,
      SABHA_HALL_POS.x,
      SABHA_HALL_POS.z,
      PALACE_CORE_POS.x,
      PALACE_CORE_POS.z,
      THRONE_POS.x,
      THRONE_POS.z
    );
    this.scene.add(palaceBuilt.group);
    this.lockStaticHierarchy(palaceBuilt.group);
    this.colliders.push(...palaceBuilt.boxColliders);
    this.circleColliders.push(...palaceBuilt.circleColliders);
    this.sabhaSeats = palaceBuilt.seatPositions;
    this.palaceTorchAnchors = palaceBuilt.palaceTorchAnchors;
    this.roofOccluders.push(...palaceBuilt.roofOccluders);
    this.palaceStoryGroups = palaceBuilt.palaceStoryGroups;
    this.palaceTopRoofGroup = palaceBuilt.palaceTopRoofGroup;

    // 5b. Functional Servant Quarters Wing
    const servantsBuilt = createServantQuartersModel(
      this.textures,
      SERVANT_QUARTERS_POS.x,
      SERVANT_QUARTERS_POS.z
    );
    this.scene.add(servantsBuilt.group);
    this.lockStaticHierarchy(servantsBuilt.group);
    this.colliders.push(...servantsBuilt.colliders);
    this.roofOccluders.push(...servantsBuilt.roofOccluders);

    // 5c. Hathi-Shala (Elephant Stables) & Ashva-Shala (Mountable Royal Horse Stables & Courtyard Steeds)
    this.animalTemplates = [];
    const hathiBuilt = createElephantStableModel(
      this.textures,
      HATHI_STABLE_POS.x,
      HATHI_STABLE_POS.z
    );
    this.scene.add(hathiBuilt.group);
    this.lockStaticHierarchy(hathiBuilt.group);
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
      this.textures,
      ASHVA_STABLE_POS.x,
      ASHVA_STABLE_POS.z
    );
    this.scene.add(ashvaBuilt.group);
    this.lockStaticHierarchy(ashvaBuilt.group);
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
      map: this.textures.armorMetal,
      normalMap: this.textures.armorNormal,
      color: 0xf4c552,
      roughness: 0.2,
      metalness: 0.9,
    });
    const sharedCaparisonMat = new THREE.MeshStandardMaterial({
      map: this.textures.velvetCurtain,
      normalMap: this.textures.velvetCurtainNormal,
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
        roughness: 0.38,
        metalness: 0.04,
        sheen: 0.35,
        sheenColor: new THREE.Color(0xffffff),
      });
      const maneMat = new THREE.MeshStandardMaterial({ color: sp.mane, roughness: 0.65 });
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
      this.textures,
      TRAINING_GROUND_POS.x,
      TRAINING_GROUND_POS.z
    );
    this.scene.add(trainingBuilt.group);
    this.lockStaticHierarchy(trainingBuilt.group);
    this.colliders.push(...trainingBuilt.colliders);

    // 5e. Monumental Surya-Kund Stepwell (Sacred Bathing Vapi descending cleanly below courtyard)
    const stepwellBuilt = createMonumentalStepwellModel(
      this.textures,
      STEPWELL_POS.x,
      STEPWELL_POS.z
    );
    this.scene.add(stepwellBuilt.group);
    this.lockStaticHierarchy(stepwellBuilt.group);
    this.colliders.push(...stepwellBuilt.colliders);

    // 5f. Temples & Bazaar Pavilions across Ayodhya
    BUILDING_LOCATIONS.forEach((b) => {
      if (b.type === 'TEMPLE') {
        const built = createTempleModel(
          this.textures,
          b.x,
          b.z,
          b.scale,
          b.rot
        );
        this.scene.add(built.group);
        this.lockStaticHierarchy(built.group);
        this.colliders.push(built.collider);
      } else {
        const built = createPavilionModel(
          this.textures,
          b.x,
          b.z,
          b.scale,
          b.rot
        );
        this.scene.add(built.group);
        this.lockStaticHierarchy(built.group);
        this.colliders.push(built.collider);
      }
    });

    // 5g. 5 km Volcanic Demon Village Scenery (Citadel, Watchtowers, Huts, High-Fidelity Volcanoes, Black Mountains, Skeletons, Wheel Debris)
    DEMON_VILLAGE_STRUCTURES.forEach((s) => {
      const built = createDemonStructureModel(
        this.textures,
        s.x,
        s.z,
        s.scale,
        s.rot,
        s.kind
      );
      this.scene.add(built.group);
      this.lockStaticHierarchy(built.group);
      this.colliders.push(built.collider);
    });

    this.volcanoCraters = [];
    DEMON_VOLCANOES.forEach((v) => {
      const built = createVolcanoModel(v.x, v.z, v.radius, v.height);
      this.scene.add(built.group);
      this.lockStaticHierarchy(built.group);
      this.volcanoCraters.push({
        x: v.x,
        y: built.craterTopY,
        z: v.z,
        radius: v.radius * 0.16,
      });
      // Multi-tier stacked concentric colliders matching exact sloped cone skirt so Ratha cannot phase into volcano flanks
      const vBaseY = groundHeightAt(v.x, v.z);
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
      const mtn = createBlackMountainModel(mx, mz, mr, mh, idx * 1.73 + 0.5);
      this.scene.add(mtn);
      this.lockStaticHierarchy(mtn);
      this.circleColliders.push({
        x: mx,
        z: mz,
        radius: mr * 0.85,
        height: mh,
        baseY: groundHeightAt(mx, mz),
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
    });

    const wheelSites: Array<[number, number]> = [
      [2456, 6], [2472, -12], [2486, -20], [2490, 18], [2506, -24], [2518, -6],
      [2472, 42], [2500, 30], [2526, 16], [2480, -48], [2512, -52], [2534, -26],
    ];
    wheelSites.forEach(([wx, wz], idx) => {
      const wd = createWheelDebris(this.textures, wx, wz, idx * 1.9 + 0.3);
      this.scene.add(wd);
      this.lockStaticHierarchy(wd);
    });

    this.populateVolcanicAtmosphere();

    // 6. Active Sarayu River Ecosystem (5 Giant Turtles, Crocodiles, Jellyfish, Dolphins, Sharks & Fish Schools) + Surya-Kund Aquatic Life
    this.buildAquaticEcosystem();

    // 7. Realistic Textured Trees, Shrubs, Riverbank Boulders & Flora (West Bank + Highway)
    this.populateInstancedNature();

    // 8. Authentic Iron Brazier Street Torches + 2.5 km Milestone Torches + 7-Story Palace Floor Torches
    this.populateAvenueTorches();

    return waterMesh;
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
    this.stepwellKoiMesh = new THREE.InstancedMesh(fishGeo.clone(), koiMat, koiCount);
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
    const smokeGeo = new THREE.IcosahedronGeometry(1.0, 1);
    const smokeMat = new THREE.MeshStandardMaterial({
      color: 0x1b171f,
      roughness: 1.0,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
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
  }

  private addToranaArch(x: number, z: number, rotY: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotY;

    const stoneMat = new THREE.MeshStandardMaterial({
      map: this.textures.sandstone,
      normalMap: this.textures.sandstoneNormal,
      color: 0xdfb988,
      roughness: 0.74,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      map: this.textures.armorMetal,
      normalMap: this.textures.armorNormal,
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

    this.scene.add(group);
    this.lockStaticHierarchy(group);
  }

  private populateInstancedNature(): void {
    // Realistic Multi-Branch Bark Trunks + Layered Leaf Cluster Cards
    const trunkParts: THREE.BufferGeometry[] = [];
    const mainTrunk = new THREE.CylinderGeometry(0.32, 0.62, 4.4, 10);
    mainTrunk.translate(0, 2.2, 0);
    trunkParts.push(mainTrunk);

    // 4 Radiating Boughs
    for (let b = 0; b < 4; b++) {
      const angle = (b / 4) * Math.PI * 2 + 0.35;
      const branch = new THREE.CylinderGeometry(0.12, 0.24, 2.7, 7);
      branch.translate(0, 1.35, 0);
      branch.rotateZ(0.68);
      branch.rotateY(angle);
      branch.translate(0, 3.35, 0);
      trunkParts.push(branch);
    }
    const mergedTrunkGeo = mergeGeometries(trunkParts, false);
    trunkParts.forEach((g) => g.dispose());

    const trunkMat = new THREE.MeshStandardMaterial({
      map: this.textures.bark,
      normalMap: this.textures.barkNormal,
      normalScale: new THREE.Vector2(1.3, 1.3),
      roughness: 0.88,
      metalness: 0.02,
    });

    // Volumetric Crown Made of 7 Overlapping Botanical Leaf Cluster Planes
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

    const canopyMat = new THREE.MeshStandardMaterial({
      map: this.textures.foliage,
      normalMap: this.textures.foliageNormal,
      normalScale: new THREE.Vector2(0.8, 0.8),
      alphaTest: 0.42,
      side: THREE.DoubleSide,
      roughness: 0.78,
      metalness: 0.02,
    });

    const treeCount = 260;
    const trunks = new THREE.InstancedMesh(mergedTrunkGeo, trunkMat, treeCount);
    const canopies = new THREE.InstancedMesh(mergedCanopyGeo, canopyMat, treeCount);
    trunks.castShadow = !this.isSoftwareGl;
    trunks.receiveShadow = true;
    canopies.castShadow = !this.isSoftwareGl;
    canopies.receiveShadow = true;

    let placed = 0;
    let seed = 17;
    const nextRand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    const foliageTint = new THREE.Color();
    const treePositions: { x: number; z: number }[] = [];

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
      _dummy.position.set(x, y, z);
      _dummy.rotation.set(0, nextRand() * Math.PI * 2, 0);
      _dummy.scale.setScalar(s);
      _dummy.updateMatrix();

      trunks.setMatrixAt(placed, _dummy.matrix);
      canopies.setMatrixAt(placed, _dummy.matrix);

      foliageTint.setHSL(
        0.26 + (nextRand() - 0.5) * 0.07,
        0.35 + nextRand() * 0.2,
        0.75 + nextRand() * 0.25
      );
      canopies.setColorAt(placed, foliageTint);
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

    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
    trunks.computeBoundingSphere();
    canopies.computeBoundingSphere();
    this.scene.add(trunks, canopies);
    this.lockStaticHierarchy(trunks);
    this.lockStaticHierarchy(canopies);

    // 340 Textured Ground Shrubs, Reeds & Ferns across open groves and sculpted riverbanks (strictly above waterline)
    const shrubCard1 = new THREE.PlaneGeometry(2.2, 1.8);
    shrubCard1.translate(0, 0.75, 0);
    const shrubCard2 = shrubCard1.clone();
    shrubCard2.rotateY(Math.PI / 2);
    const shrubGeo = mergeGeometries([shrubCard1, shrubCard2], false);
    shrubCard1.dispose();
    shrubCard2.dispose();

    const shrubCount = 340;
    const shrubs = new THREE.InstancedMesh(shrubGeo, canopyMat, shrubCount);
    shrubs.receiveShadow = true;
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
      _dummy.position.set(ox, Math.max(oy, RIVER_SURFACE_Y + 0.15), oz);
      _dummy.rotation.set(0, nextRand() * Math.PI, 0);
      _dummy.scale.setScalar(0.65 + nextRand() * 0.65);
      _dummy.updateMatrix();
      shrubs.setMatrixAt(i, _dummy.matrix);
      foliageTint.setHSL(0.27 + (nextRand() - 0.5) * 0.08, 0.4, 0.72 + nextRand() * 0.22);
      shrubs.setColorAt(i, foliageTint);
    }
    shrubs.instanceMatrix.needsUpdate = true;
    if (shrubs.instanceColor) shrubs.instanceColor.needsUpdate = true;
    shrubs.computeBoundingSphere();
    this.scene.add(shrubs);
    this.lockStaticHierarchy(shrubs);

    // Sculpted Natural Riverbank Boulders along the curving Sarayu shoreline (strictly above waterline)
    const bankRockCount = 72;
    const bankRockGeo = new THREE.DodecahedronGeometry(1.15, 1);
    const rockMat = new THREE.MeshStandardMaterial({
      map: this.textures.sandstone,
      normalMap: this.textures.sandstoneNormal,
      color: 0x7c6d5d,
      roughness: 0.9,
    });
    const bankRocks = new THREE.InstancedMesh(bankRockGeo, rockMat, bankRockCount);
    bankRocks.castShadow = !this.isSoftwareGl;
    bankRocks.receiveShadow = true;
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
      _dummy.position.set(rx, ry + 0.12, rz);
      _dummy.rotation.set(nextRand() * 0.4, nextRand() * Math.PI * 2, nextRand() * 0.4);
      _dummy.scale.set(sx, sy, sz);
      _dummy.updateMatrix();
      bankRocks.setMatrixAt(i, _dummy.matrix);
    }
    bankRocks.instanceMatrix.needsUpdate = true;
    bankRocks.computeBoundingSphere();
    this.scene.add(bankRocks);
    this.lockStaticHierarchy(bankRocks);
  }

  private populateAvenueTorches(): void {
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
      map: this.textures.sandstone,
      normalMap: this.textures.sandstoneNormal,
      color: 0x9b8366,
      roughness: 0.82,
    });
    const ironMat = new THREE.MeshStandardMaterial({
      map: this.textures.armorMetal,
      normalMap: this.textures.armorNormal,
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

    const outerFlameGeo = new THREE.ConeGeometry(0.24, 0.68, 7);
    outerFlameGeo.translate(0, 0.34, 0);
    const outerFlameMat = new THREE.MeshPhysicalMaterial({
      color: 0xff7b1c,
      emissive: 0xff5a0a,
      emissiveIntensity: 2.0,
      roughness: 0.4,
      transparent: true,
      opacity: 0.9,
    });

    const coreFlameGeo = new THREE.ConeGeometry(0.13, 0.44, 6);
    coreFlameGeo.translate(0, 0.22, 0);
    const coreFlameMat = new THREE.MeshPhysicalMaterial({
      color: 0xffe48a,
      emissive: 0xffc842,
      emissiveIntensity: 2.5,
      roughness: 0.25,
    });

    const totalFlames = positions.length + this.palaceTorchAnchors.length;
    const plinths = new THREE.InstancedMesh(stonePlinthGeo, stoneMat, positions.length);
    const posts = new THREE.InstancedMesh(mergedTorchIronGeo, ironMat, positions.length);
    const embers = new THREE.InstancedMesh(emberGeo, emberMat, totalFlames);

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
    const streetLampGlobes = new THREE.InstancedMesh(lanternGeo, this.lampBulbMat, positions.length);

    this.torchFlamesOuter = new THREE.InstancedMesh(outerFlameGeo, outerFlameMat, totalFlames);
    this.torchFlamesCore = new THREE.InstancedMesh(coreFlameGeo, coreFlameMat, totalFlames);
    this.torchFlamesOuter.frustumCulled = false;
    this.torchFlamesCore.frustumCulled = false;
    this.torchFlameAnchors = [];

    positions.forEach(([x, z], idx) => {
      const y = groundHeightAt(x, z);
      _dummy.position.set(x, y, z);
      _dummy.rotation.set(0, idx * 0.5, 0);
      _dummy.scale.setScalar(1);
      _dummy.updateMatrix();
      plinths.setMatrixAt(idx, _dummy.matrix);
      posts.setMatrixAt(idx, _dummy.matrix);

      _dummy.position.set(x, y + 3.74, z);
      _dummy.updateMatrix();
      streetLampGlobes.setMatrixAt(idx, _dummy.matrix);

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

    plinths.instanceMatrix.needsUpdate = true;
    posts.instanceMatrix.needsUpdate = true;
    embers.instanceMatrix.needsUpdate = true;
    streetLampGlobes.instanceMatrix.needsUpdate = true;
    this.torchFlamesOuter.instanceMatrix.needsUpdate = true;
    this.torchFlamesCore.instanceMatrix.needsUpdate = true;
    plinths.computeBoundingSphere();
    posts.computeBoundingSphere();
    embers.computeBoundingSphere();
    streetLampGlobes.computeBoundingSphere();
    this.torchFlamesOuter.computeBoundingSphere();
    this.torchFlamesCore.computeBoundingSphere();
    this.scene.add(
      plinths,
      posts,
      embers,
      streetLampGlobes,
      this.torchFlamesOuter,
      this.torchFlamesCore
    );
    this.lockStaticHierarchy(plinths);
    this.lockStaticHierarchy(posts);
    this.lockStaticHierarchy(embers);
    this.lockStaticHierarchy(streetLampGlobes);
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
    this.input.zoomDelta = 0;
    this.input.sprint = false;
    this.input.jumpPressed = false;
    this.input.fireHeld = false;
    this.input.astraPressed = false;
    this.input.interactPressed = false;
    this.input.stealthTogglePressed = false;
    this.input.autoDriveTogglePressed = false;
    this.playerHorizSpeed = 0;
    this.playerTurnRate = 0;
    this.lastResolvedMoveSpeed = 0;
  }

  public resetWorldEntities(): void {
    this.clearInputs();
    this.setStealthMode(false);
    this.restoreRamStandingClothes();
    // Release active pooled entities cleanly back to their pools (zero GPU leaks on restart)
    for (let i = 0; i < this.chariots.length; i++) {
      this.poolManager.release('ratha', this.chariots[i].rig);
    }
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.alive) {
        this.poolManager.release(this.demonPoolKey(e.variant, e.isCommander), e.rig);
      }
    }
    for (let i = 0; i < this.citizens.length; i++) {
      const c = this.citizens[i];
      this.poolManager.release(c.poolKey, c.rig);
    }
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      this.poolManager.release(p.isChakra ? 'chakra' : 'arrow', p.mesh);
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
    this.chariotAutoWaypoints = [];
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
    this.ramRig.root.position.set(this.playerX, this.playerY, this.playerZ);
    this.ramRig.root.rotation.order = 'YXZ';
    this.ramRig.root.rotation.set(0, this.playerYaw, 0);
    this.camYaw = 0;
    this.camPitch = 0.34;
    this.camDistanceFoot = 7.0;
    this.camDistanceChariot = 10.6;
    this.hp = 100;
    this.prana = 100;
    this.karma = 0;
    this.wantedLevel = 0;
    this.mountedChariotIndex = null;
    this.mountedAnimalIndex = null;
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
        gaitPhase: 0,
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
        gaitPhase: 0,
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
      if (!this.poolManager.getPool<CharacterRig>(poolKey)) {
        this.poolManager.registerPool<CharacterRig>({
          key: poolKey,
          prewarmCount: 0,
          maxSize: 16,
          factory: () => {
            const cRig = createCitizenModel(this.textures, colorHex, role);
            cRig.root.userData._defaultTorsoY = cRig.torso.position.y;
            this.enforcePbrAndAnisotropy(cRig.root);
            cRig.root.visible = false;
            this.poolManager.poolRoot.add(cRig.root);
            return cRig;
          },
          onAcquire: (cRig) => {
            cRig.root.visible = true;
          },
          onRelease: (cRig) => {
            this.resetPooledCharacterRig(cRig);
          },
          onDispose: (cRig) => {
            this.poolManager.disposeObject3DResources(cRig.root);
          },
        });
      }
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
    return h;
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
        c.navQueue = findPalaceNavPath(
          c.x,
          c.y,
          c.z,
          c.courtSeat.x,
          c.courtSeat.y,
          c.courtSeat.z,
          false
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
    this.ramRig.leftLeg.rotation.z = 0;
    this.ramRig.rightLeg.rotation.z = 0;
    this.ramRig.torso.rotation.set(0, 0, 0);
    if (this.ramRig.centerPleat) {
      this.ramRig.centerPleat.rotation.x = -0.045;
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
    variant: DemonVariant = 'BRUTE_HUMAN'
  ): void {
    // Absolute mathematical boundary enforcement: ZERO demons can ever spawn west of DEMON_ZONE_MIN_X
    const safeX = Math.max(DEMON_ZONE_MIN_X, x);
    const rig = this.poolManager.acquire<CharacterRig>(
      this.demonPoolKey(variant, isCommander)
    );
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

    this.enemies.push({
      id: `demon_${variant}_${Date.now()}_${Math.random()}`,
      rig,
      variant,
      isCommander,
      x: safeX,
      y,
      z,
      velY: 0,
      yaw: 0,
      hp: isCommander ? 185 : baseHp,
      maxHp: isCommander ? 185 : baseHp,
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
    });
  }

  public setMode(nextMode: PlayMode): void {
    if (nextMode !== 'PLAYING') {
      this.clearInputs();
    } else {
      // Also wipe latched one-shot/held inputs upon entering/resuming play so zero sticky movement carries over
    this.input.jumpPressed = false;
    this.input.astraPressed = false;
    this.input.interactPressed = false;
    this.input.stealthTogglePressed = false;
    this.input.autoDriveTogglePressed = false;
    this.input.fireHeld = false;
    }
    this.mode = nextMode;
    this.callbacks.onModeChange(nextMode);
    this.emitHud();
  }

  public reviveAtPalace(): void {
    this.clearInputs();
    this.autoDriveActive = false;
    this.setStealthMode(false);
    this.restoreRamStandingClothes();
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
    this.mountedChariotIndex = null;
    this.mountedAnimalIndex = null;
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
    const stIdx = palaceStoryAt(px, py + 0.72, pz);
    if (stIdx !== null) {
      const st = PALACE_STORIES[stIdx];
      return st.floorY + st.clearHeight - 0.32;
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
        return oc.roofY - 0.32;
      }
    }
    return null;
  }

  private syncCameraImmediate(): void {
    const isMounted = this.mountedChariotIndex !== null || this.mountedAnimalIndex !== null;
    const dist = isMounted ? this.camDistanceChariot : this.camDistanceFoot;
    const horizDist = dist * Math.cos(this.camPitch);
    const vertHeight = 1.65 + dist * Math.sin(this.camPitch);
    const tx = this.playerX;
    const ty = this.playerY + 1.65;
    const tz = this.playerZ;
    const camX = this.playerX + Math.sin(this.camYaw) * horizDist;
    const camZ = this.playerZ + Math.cos(this.camYaw) * horizDist;
    const camY = Math.max(this.surfaceHeightAt(camX, camZ, this.playerY) + 0.45, this.playerY + vertHeight);
    this.clipCameraAgainstStaticColliders(tx, ty, tz, camX, camY, camZ);
    this.camSmoothPos.set(_camClipResult.x, _camClipResult.y, _camClipResult.z);
    this.camSmoothLook.set(tx, ty, tz);
    this.updateRoofOcclusion(this.camSmoothPos.x, this.camSmoothPos.y, this.camSmoothPos.z);
    this.camera.position.copy(this.camSmoothPos);
    this.camera.lookAt(this.camSmoothLook);
  }

  /**
   * Traces from lookTarget -> desiredCamera against solid structural walls/pillars/mountains
   * and enforces indoor ceiling height clamping so ceilings stay visible overhead without blocking sightlines.
   */
  private clipCameraAgainstStaticColliders(
    tx: number,
    ty: number,
    tz: number,
    desiredX: number,
    desiredY: number,
    desiredZ: number
  ): void {
    const steps = 10;
    const margin = 0.34;
    let safeFrac = 1.0;

    const minQx = Math.min(tx, desiredX) - margin;
    const maxQx = Math.max(tx, desiredX) + margin;
    const minQz = Math.min(tz, desiredZ) - margin;
    const maxQz = Math.max(tz, desiredZ) + margin;
    const grid = this.colliderGrid;
    grid.queryAABB(minQx, maxQx, minQz, maxQz);
    const outB = grid.outBoxes;
    const outBLen = grid.outBoxesLength;
    const outC = grid.outCircles;
    const outCLen = grid.outCirclesLength;

    for (let s = 1; s <= steps; s++) {
      const frac = s / steps;
      const sx = tx + (desiredX - tx) * frac;
      const sy = ty + (desiredY - ty) * frac;
      const sz = tz + (desiredZ - tz) * frac;

      let hit = false;
      for (let i = 0; i < outBLen; i++) {
        const box = this.colliders[outB[i]];
        // Allow unobstructed sightlines over low window sills, dado walls, cots & balcony balustrades
        if (box.height <= 1.65) continue;
        const baseY = box.baseY ?? 0;
        if (sy > baseY + box.height || sy < baseY + 0.15) continue;

        const rotY = box.rotY ?? 0;
        const cosR = Math.cos(rotY);
        const sinR = Math.sin(rotY);
        const dxW = sx - box.x;
        const dzW = sz - box.z;
        const lx = dxW * cosR - dzW * sinR;
        const lz = dxW * sinR + dzW * cosR;
        if (Math.abs(lx) <= box.halfW + margin && Math.abs(lz) <= box.halfD + margin) {
          hit = true;
          break;
        }
      }

      if (!hit) {
        for (let i = 0; i < outCLen; i++) {
          const c = this.circleColliders[outC[i]];
          if (c.height <= 1.65) continue;
          const baseY = c.baseY ?? 0;
          if (sy > baseY + c.height || sy < baseY + 0.15) continue;
          const dx = sx - c.x;
          const dz = sz - c.z;
          const lim = c.radius + margin;
          if (dx * dx + dz * dz <= lim * lim) {
            hit = true;
            break;
          }
        }
      }

      if (hit) {
        safeFrac = Math.max(0.18, (s - 1) / steps);
        break;
      }
    }

    const cx = tx + (desiredX - tx) * safeFrac;
    const cz = tz + (desiredZ - tz) * safeFrac;
    let cy = ty + (desiredY - ty) * safeFrac;
    const floorClearance = this.surfaceHeightAt(cx, cz, this.playerY) + 0.42;
    if (cy < floorClearance) cy = floorClearance;

    const ceilLimit = this.indoorCeilingLimitAt(this.playerX, this.playerY, this.playerZ);
    if (ceilLimit !== null && cy > ceilLimit) {
      cy = Math.max(floorClearance, ceilLimit);
    }

    _camClipResult.x = cx;
    _camClipResult.y = cy;
    _camClipResult.z = cz;
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
    grid.queryAABB(qX - qPad, qX + qPad, qZ - qPad, qZ + qPad);
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
    kind: 'RATHA' | 'HORSE' | 'ELEPHANT';
    index: number;
    label: string;
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
        _nearestMountOut.kind = 'RATHA';
        _nearestMountOut.index = i;
        _nearestMountOut.label = 'Royal Ratha';
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
        _nearestMountOut.kind = a.kind;
        _nearestMountOut.index = i;
        _nearestMountOut.label = a.label;
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

  private fireArrow(isChakra: boolean): void {
    // Determine aim direction: camera forward or auto-aim toward nearby Rakshasa
    let dirX = -Math.sin(this.camYaw);
    let dirZ = -Math.cos(this.camYaw);
    let dirY = 0.02;

    // Gentle GTA-style soft lock-on within 36m ahead
    let bestScore = 0.55;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.x - this.playerX;
      const dz = enemy.z - this.playerZ;
      const dist = Math.hypot(dx, dz);
      if (dist > 38 || dist < 0.5) continue;
      const nx = dx / dist;
      const nz = dz / dist;
      const dot = nx * dirX + nz * dirZ;
      if (dot > bestScore) {
        bestScore = dot;
        dirX = nx;
        dirZ = nz;
        dirY = (enemy.y + 1.3 - (this.playerY + 1.5)) / dist;
      }
    }

    // Face Lord Ram toward shot
    this.playerYaw = Math.atan2(dirX, dirZ);

    const isStealthAmbush = this.stealthActive && !this.stealthSpotted;
    let meshGroup: THREE.Group;
    let spinPivot: THREE.Group | undefined;

    if (isChakra) {
      meshGroup = this.poolManager.acquire<THREE.Group>('chakra');
      spinPivot = meshGroup.userData.spinPivot as THREE.Group | undefined;
      soundEngine.playAstraBlast();
    } else {
      meshGroup = this.poolManager.acquire<THREE.Group>('arrow');
      soundEngine.playBowShot();
    }

    const startY =
      this.mountedChariotIndex !== null
        ? this.playerY + 2.35
        : this.mountedAnimalIndex !== null
        ? this.playerY + 1.5
        : this.playerY + 1.45;
    meshGroup.position.set(
      this.playerX + dirX * 0.75,
      startY,
      this.playerZ + dirZ * 0.75
    );
    meshGroup.lookAt(
      meshGroup.position.x + dirX,
      meshGroup.position.y + dirY,
      meshGroup.position.z + dirZ
    );

    const speed = isChakra ? 34 : 48;
    this.projectiles.push({
      mesh: meshGroup,
      spinPivot,
      x: meshGroup.position.x,
      y: meshGroup.position.y,
      z: meshGroup.position.z,
      vx: dirX * speed,
      vy: dirY * speed,
      vz: dirZ * speed,
      isChakra,
      stealthAmbush: isStealthAmbush,
      life: isChakra ? 1.6 : 1.3,
    });
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

    // Dynamic fire-flash illumination on blast impact
    this.combatLight.color.setHex(colorHex);
    this.combatLight.position.set(x, y + 1.4, z);
    this.combatLight.intensity = 10;
  }

  private damageEnemy(enemy: EnemyEntity, amount: number): void {
    if (!enemy.alive) return;
    enemy.hp -= amount;
    soundEngine.playHit();
    if (enemy.hp <= 0) {
      enemy.alive = false;
      this.poolManager.release(
        this.demonPoolKey(enemy.variant, enemy.isCommander),
        enemy.rig
      );
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
          this.hp = Math.min(this.maxHp, this.hp + 25);
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
  }

  private setStealthMode(enabled: boolean): void {
    const applyObj = (root: THREE.Object3D, shadowMesh: THREE.Mesh | undefined, active: boolean) => {
      root.traverse((obj) => {
        if (shadowMesh && obj === shadowMesh) return;
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh || !mesh.material) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (let i = 0; i < mats.length; i++) {
          const mat = mats[i];
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
      });
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
    elapsed: number
  ): void {
    // Seated posture on Ratha throne bench: pelvis flush on cushion, thighs horizontal inside front rail, shins straight onto deck
    rig.torso.position.y = 0.94;
    rig.leftLeg.position.y = 0.94;
    rig.rightLeg.position.y = 0.94;

    rig.leftLeg.rotation.set(-1.46, 0, 0);
    rig.rightLeg.rotation.set(-1.46, 0, 0);
    rig.leftKnee.rotation.x = 1.38;
    rig.rightKnee.rotation.x = 1.38;
    rig.leftAnkle.rotation.x = 0.08;
    rig.rightAnkle.rotation.x = 0.08;

    // Fold Pitambara front pleat neatly onto horizontal lap so cloth never clips underneath cushion/floor
    if (rig.centerPleat) {
      rig.centerPleat.rotation.x = -1.35;
      rig.centerPleat.scale.set(1.06, 0.88, 0.34);
    }
    if (rig.capePivot) {
      rig.capePivot.position.set(-0.118, 0.605, -0.042);
      rig.capePivot.scale.set(1, 0.48, 1);
      rig.capePivot.rotation.x = 0.02;
    }

    const breath = Math.sin(elapsed * 2.2) * 0.01;
    rig.torso.rotation.x = -0.04 + breath;
    rig.torso.rotation.y = THREE.MathUtils.clamp(-steerRate * 0.14, -0.18, 0.18);

    // Arms extend forward gripping dynamic chariot reins or draw the Sharnga bow cleanly
    if (isAiming) {
      rig.leftArm.rotation.set(-1.16, 0, 0);
      rig.leftElbow.rotation.x = -0.32;
      rig.rightArm.rotation.set(-0.68, 0, 0);
      rig.rightElbow.rotation.x = -1.24;
    } else {
      const steerShift = THREE.MathUtils.clamp(steerRate * 0.16, -0.22, 0.22);
      rig.leftArm.rotation.set(-0.76 - steerShift, 0, 0.09);
      rig.leftElbow.rotation.x = -0.72;
      rig.rightArm.rotation.set(-0.76 + steerShift, 0, -0.09);
      rig.rightElbow.rotation.x = -0.72;
    }
  }

  private applyThroneSittingPose(
    rig: CharacterRig,
    isAiming: boolean,
    elapsed: number
  ): void {
    rig.torso.position.y = 0.88;
    rig.leftLeg.position.y = 0.88;
    rig.rightLeg.position.y = 0.88;
    rig.leftLeg.rotation.set(-1.42, 0, 0.06);
    rig.rightLeg.rotation.set(-1.42, 0, -0.06);
    rig.leftKnee.rotation.x = 1.44;
    rig.rightKnee.rotation.x = 1.44;
    rig.leftAnkle.rotation.x = 0.04;
    rig.rightAnkle.rotation.x = 0.04;

    if (rig.centerPleat) {
      rig.centerPleat.rotation.x = -1.35;
      rig.centerPleat.scale.set(1.06, 0.88, 0.34);
    }
    if (rig.capePivot) {
      rig.capePivot.position.set(-0.118, 0.605, -0.042);
      rig.capePivot.scale.set(1, 0.48, 1);
      rig.capePivot.rotation.x = 0.02;
    }

    rig.torso.rotation.x = -0.02 + Math.sin(elapsed * 1.8) * 0.008;
    rig.torso.rotation.y = 0;

    if (isAiming) {
      rig.leftArm.rotation.set(-1.16, 0, 0);
      rig.leftElbow.rotation.x = -0.32;
      rig.rightArm.rotation.set(-0.68, 0, 0);
      rig.rightElbow.rotation.x = -1.24;
    } else {
      rig.leftArm.rotation.set(-0.58, 0, 0);
      rig.leftElbow.rotation.x = -0.82;
      rig.rightArm.rotation.set(-0.58, 0, 0);
      rig.rightElbow.rotation.x = -0.82;
    }
  }

  private applyAnimalRidingPose(
    rig: CharacterRig,
    kind: 'HORSE' | 'ELEPHANT',
    gaitCycle: number,
    speedNorm: number,
    isAiming: boolean,
    elapsed: number
  ): void {
    const bounce = Math.abs(Math.sin(gaitCycle)) * 0.024 * speedNorm;
    const hipY = 0.90 + bounce;
    rig.torso.position.y = hipY;
    rig.leftLeg.position.y = hipY;
    rig.rightLeg.position.y = hipY;
    if (kind === 'ELEPHANT') {
      // Seated squarely atop the flat 3.59m velvet howdah cushion with shins draping over front cushion brow
      rig.leftLeg.rotation.set(-1.38, 0, -0.18);
      rig.rightLeg.rotation.set(-1.38, 0, 0.18);
      rig.leftKnee.rotation.x = 1.38;
      rig.rightKnee.rotation.x = 1.38;
      rig.leftAnkle.rotation.x = 0.02;
      rig.rightAnkle.rotation.x = 0.02;
    } else {
      // Embraced astride the Royal Horse saddle & caparison with knees clearing flanks cleanly
      rig.leftLeg.rotation.set(-0.88, 0, -0.50);
      rig.rightLeg.rotation.set(-0.88, 0, 0.50);
      rig.leftKnee.rotation.x = 1.08;
      rig.rightKnee.rotation.x = 1.08;
      rig.leftAnkle.rotation.x = -0.14;
      rig.rightAnkle.rotation.x = -0.14;
    }

    if (rig.centerPleat) {
      rig.centerPleat.rotation.x = -1.25;
      rig.centerPleat.scale.set(1.06, 0.85, 0.34);
    }
    if (rig.capePivot) {
      rig.capePivot.position.set(-0.118, 0.605, -0.06);
      rig.capePivot.scale.set(1, 0.65, 1);
      rig.capePivot.rotation.x = 0.08 + speedNorm * 0.28 + Math.sin(elapsed * 3.1) * 0.03;
    }

    rig.torso.rotation.x = 0.06 * speedNorm + Math.sin(elapsed * 2.4) * 0.01;
    rig.torso.rotation.y = 0;

    if (isAiming) {
      rig.leftArm.rotation.set(-1.16, 0, 0);
      rig.leftElbow.rotation.x = -0.32;
      rig.rightArm.rotation.set(-0.68, 0, 0);
      rig.rightElbow.rotation.x = -1.24;
    } else if (kind === 'HORSE') {
      // Symmetrical forward rein-holding grip positioned directly above the horse's pommel/crest
      const bob = Math.sin(gaitCycle) * 0.04 * speedNorm;
      rig.leftArm.rotation.set(-0.64 + bob, 0, 0.11);
      rig.leftElbow.rotation.x = -0.82;
      rig.rightArm.rotation.set(-0.64 + bob, 0, -0.11);
      rig.rightElbow.rotation.x = -0.82;
    } else {
      rig.leftArm.rotation.set(-0.68, 0, 0.04);
      rig.leftElbow.rotation.x = -0.72;
      rig.rightArm.rotation.set(-0.68, 0, -0.04);
      rig.rightElbow.rotation.x = -0.72;
    }
  }

  private animateRoyalHorseRig(
    hr: RoyalHorseRig,
    gaitPhase: number,
    speedNorm: number,
    elapsed: number,
    seed: number
  ): void {
    const moving = speedNorm > 0.025;
    hr.headPivot.rotation.x =
      0.56 +
      Math.sin(elapsed * 1.65 + seed) * 0.045 +
      (moving ? Math.sin(gaitPhase) * 0.085 * speedNorm : 0);
    hr.headPivot.rotation.y = moving ? Math.cos(gaitPhase * 0.5 + seed) * 0.04 * speedNorm : 0;

    hr.tailGroup.rotation.x =
      -0.04 - 0.16 * speedNorm + (moving ? Math.cos(gaitPhase * 2.0) * 0.05 * speedNorm : 0);
    hr.tailGroup.rotation.z =
      Math.sin(elapsed * 2.8 + seed) * (0.11 + 0.08 * speedNorm);
    for (let p = 0; p < hr.tailPlumes.length; p++) {
      hr.tailPlumes[p].rotation.z =
        (p - 2) * 0.075 + Math.sin(elapsed * 3.2 + seed + p * 0.5) * 0.06;
    }

    for (let ei = 0; ei < hr.ears.length; ei++) {
      hr.ears[ei].rotation.x = 0.25 + Math.sin(elapsed * 3.4 + seed + ei) * 0.08;
    }

    // Stance-locked diagonal-paired horse gait [LF, RF, LH, RH]:
    // Linear -v hoof sweep during grounded stance half-cycle + curved dorsal recovery during swing half-cycle
    const phaseOffsets = [0, Math.PI, Math.PI + 0.36, 0.36];
    const amp = THREE.MathUtils.clamp(speedNorm, 0, 1);
    const TWO_PI = Math.PI * 2;
    const sweepAmp = 0.52 * amp;
    for (let li = 0; li < hr.legs.length; li++) {
      const p = ((gaitPhase + phaseOffsets[li % 4]) % TWO_PI + TWO_PI) % TWO_PI;
      if (!moving) {
        hr.legs[li].rotation.x = 0;
        if (hr.knees[li]) hr.knees[li].rotation.x = 0.04;
      } else if (p < Math.PI) {
        // Stance phase: hoof sweeps smoothly front-to-back matching ground speed
        const u = p / Math.PI;
        hr.legs[li].rotation.x = THREE.MathUtils.lerp(-sweepAmp, sweepAmp, u);
        if (hr.knees[li]) hr.knees[li].rotation.x = 0.04 + Math.sin(u * Math.PI) * 0.06 * amp;
      } else {
        // Swing recovery phase: fetlock & cannon tuck sharply backward as leg returns forward
        const u = (p - Math.PI) / Math.PI;
        hr.legs[li].rotation.x = Math.cos(u * Math.PI) * sweepAmp;
        if (hr.knees[li]) hr.knees[li].rotation.x = 0.06 + Math.pow(Math.sin(u * Math.PI), 0.78) * (0.76 * amp);
      }
    }
  }

  private applySwimmingPose(
    rig: CharacterRig,
    phase: number,
    moveIntensity: number,
    elapsed: number,
    divePitch = 0
  ): void {
    const hipY = 0.90;
    rig.torso.position.y = hipY;
    rig.leftLeg.position.y = hipY;
    rig.rightLeg.position.y = hipY;
    const stroke = 0.25 + moveIntensity * 0.55 + divePitch;
    rig.torso.rotation.x = stroke + Math.sin(elapsed * 2.4) * 0.04;
    rig.torso.rotation.y = Math.sin(phase) * 0.14 * moveIntensity;

    const armReach = moveIntensity > 0.1 ? 1.15 : 0.45;
    rig.leftArm.rotation.set(-0.85 + Math.sin(phase) * armReach, 0, 0);
    rig.rightArm.rotation.set(-0.85 + Math.sin(phase + Math.PI) * armReach, 0, 0);
    rig.leftElbow.rotation.x = -0.45 - Math.max(0, Math.cos(phase)) * 0.45;
    rig.rightElbow.rotation.x = -0.45 - Math.max(0, Math.cos(phase + Math.PI)) * 0.45;

    const kick = Math.sin(phase * 1.6 + elapsed * 3.0) * (0.28 + moveIntensity * 0.25);
    rig.leftLeg.rotation.set(0.25 + kick, 0, -0.06);
    rig.rightLeg.rotation.set(0.25 - kick, 0, 0.06);
    rig.leftKnee.rotation.x = 0.22 + Math.max(0, -kick) * 0.4;
    rig.rightKnee.rotation.x = 0.22 + Math.max(0, kick) * 0.4;
    rig.leftAnkle.rotation.x = 0.35;
    rig.rightAnkle.rotation.x = 0.35;
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
    dt = 0.016
  ): void {
    const thighL = isRakshasa ? 0.48 : rig === this.ramRig ? 0.445 : 0.43;
    const shinL = isRakshasa ? 0.40 : rig === this.ramRig ? 0.405 : 0.37;
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

    // Velocity-based Motion-Matching stance height (handles stealth crouch cleanly via IK too)
    const crouchDrop = !isRakshasa && rig === this.ramRig ? Math.max(0, 0.93 - baseHipY) : 0;

    if (!isGrounded) {
      // Natural airborne leap posture resolved via 2-bone IK
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
      // Stance-Locked Gait Trajectory & Analytical Two-Bone Leg IK (Zero Foot Sliding):
      // For each leg phase p in [0, 2*PI):
      //   p in [0, PI):   STANCE -> planted sole tracks z = halfStep * (1 - 2*u), y = 0 (strict -v match!)
      //   p in [PI, 2PI): SWING  -> lifted foot arcs  z = -halfStep * cos(PI*u), y = liftH * sin(PI*u)^0.85
      const halfStepBase = sprint ? 0.58 : isRakshasa ? 0.44 : 0.44;
      const halfStep = halfStepBase * THREE.MathUtils.clamp(moveIntensity, 0.15, 1.0);
      const liftH = (sprint ? 0.28 : 0.19) * THREE.MathUtils.clamp(moveIntensity, 0.2, 1.0);

      evalFootTargetInto(phase, halfStep, liftH, _footL);
      evalFootTargetInto(phase + Math.PI, halfStep, liftH, _footR);

      // Compute minimum vertical hip height so stance leg(s) reach yLift == 0 without hyperextension
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

      // Exact stance sole ground-locking + natural swing toe-off/heel-strike articulation
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

      // Motion-Matched Torso counter-twist & lateral weight transfer roll
      tTorsoRotY = Math.sin(phase) * (sprint ? 0.11 : 0.068) * moveIntensity;
      tTorsoRotX = (sprint ? 0.12 : 0.04) * moveIntensity + impactDip * 0.9;
      tTorsoRotZ = Math.cos(phase) * (sprint ? 0.032 : 0.018) * moveIntensity;
    } else {
      // Idle / Stealth Static Stance resolved via IK (handles crouch without foot sink!)
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

    if (!isRakshasa && rig === this.ramRig) {
      const lam = isGrounded ? 20 : 12;
      this.ramPose.leftHip = THREE.MathUtils.damp(this.ramPose.leftHip, tLeftHip, lam, dt);
      this.ramPose.rightHip = THREE.MathUtils.damp(this.ramPose.rightHip, tRightHip, lam, dt);
      this.ramPose.leftKnee = THREE.MathUtils.damp(this.ramPose.leftKnee, tLeftKnee, lam, dt);
      this.ramPose.rightKnee = THREE.MathUtils.damp(this.ramPose.rightKnee, tRightKnee, lam, dt);
      this.ramPose.leftAnkle = THREE.MathUtils.damp(this.ramPose.leftAnkle, tLeftAnkle, lam, dt);
      this.ramPose.rightAnkle = THREE.MathUtils.damp(this.ramPose.rightAnkle, tRightAnkle, lam, dt);
      this.ramPose.leftArm = THREE.MathUtils.damp(this.ramPose.leftArm, tLeftArm, lam, dt);
      this.ramPose.rightArm = THREE.MathUtils.damp(this.ramPose.rightArm, tRightArm, lam, dt);
      this.ramPose.leftElbow = THREE.MathUtils.damp(this.ramPose.leftElbow, tLeftElbow, lam, dt);
      this.ramPose.rightElbow = THREE.MathUtils.damp(this.ramPose.rightElbow, tRightElbow, lam, dt);
      this.ramPose.hipY = THREE.MathUtils.damp(this.ramPose.hipY, tHipY, lam, dt);
      this.ramPose.torsoRotX = THREE.MathUtils.damp(this.ramPose.torsoRotX, tTorsoRotX, lam, dt);
      this.ramPose.torsoRotY = THREE.MathUtils.damp(this.ramPose.torsoRotY, tTorsoRotY, lam, dt);
      this.ramPose.torsoRotZ = THREE.MathUtils.damp(this.ramPose.torsoRotZ, tTorsoRotZ, lam, dt);

      rig.leftLeg.rotation.x = this.ramPose.leftHip;
      rig.rightLeg.rotation.x = this.ramPose.rightHip;
      rig.leftKnee.rotation.x = this.ramPose.leftKnee;
      rig.rightKnee.rotation.x = this.ramPose.rightKnee;
      rig.leftAnkle.rotation.x = this.ramPose.leftAnkle;
      rig.rightAnkle.rotation.x = this.ramPose.rightAnkle;
      rig.leftArm.rotation.set(this.ramPose.leftArm, 0, 0);
      rig.rightArm.rotation.set(this.ramPose.rightArm, 0, 0);
      rig.leftElbow.rotation.x = this.ramPose.leftElbow;
      rig.rightElbow.rotation.x = this.ramPose.rightElbow;

      rig.leftLeg.position.y = this.ramPose.hipY;
      rig.rightLeg.position.y = this.ramPose.hipY;
      rig.torso.position.y = this.ramPose.hipY;
      rig.torso.rotation.x = this.ramPose.torsoRotX;
      rig.torso.rotation.y = this.ramPose.torsoRotY;
      rig.torso.rotation.z = this.ramPose.torsoRotZ;
    } else {
      rig.leftLeg.rotation.x = tLeftHip;
      rig.rightLeg.rotation.x = tRightHip;
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
      rig.torso.rotation.x = tTorsoRotX;
      rig.torso.rotation.y = tTorsoRotY;
      rig.torso.rotation.z = tTorsoRotZ;
    }
  }

  private stepSimulation(dt: number, elapsed: number): void {
    this.simFrameCounter++;
    // 0. Animate authentic torch flame tongues
    if (this.torchFlamesOuter && this.torchFlamesCore && this.torchFlameAnchors.length > 0) {
      for (let i = 0; i < this.torchFlameAnchors.length; i++) {
        const anchor = this.torchFlameAnchors[i];
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
      this.torchFlamesOuter.instanceMatrix.needsUpdate = true;
      this.torchFlamesCore.instanceMatrix.needsUpdate = true;
    }

    // 1. Camera look rotation (unrestricted vertical pitch) & scroll/pinch zoom
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
      -0.85,
      1.28
    );
    this.input.cameraDeltaX = 0;
    this.input.cameraDeltaY = 0;

    if (Math.abs(this.input.zoomDelta) > 0.001) {
      if (this.mountedChariotIndex !== null || this.mountedAnimalIndex !== null) {
        this.camDistanceChariot = THREE.MathUtils.clamp(
          this.camDistanceChariot + this.input.zoomDelta,
          4.6,
          22.0
        );
      } else {
        this.camDistanceFoot = THREE.MathUtils.clamp(
          this.camDistanceFoot + this.input.zoomDelta,
          2.8,
          18.0
        );
      }
      this.input.zoomDelta = 0;
    }

    // Keep SkyDome & Starfield centered smoothly relative to player across 2.5 km world & step seamless day-night cycle
    const dayCycleDurationSec = 140;
    this.dayTime = (this.dayTime + dt / dayCycleDurationSec) % 1.0;
    if (this.skyDome) {
      this.skyDome.position.set(this.playerX, 0, this.playerZ);
    }
    if (this.starPoints) {
      this.starPoints.position.set(this.playerX, 0, this.playerZ);
    }
    if (this.starUniforms) {
      this.starUniforms.uTime.value = elapsed;
    }
    if (this.fireflyPoints && this.fireflyBase.length > 0) {
      const ffPos = this.fireflyPoints.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < this.fireflyBase.length; i++) {
        const fb = this.fireflyBase[i];
        ffPos.setXYZ(
          i,
          fb.bx + Math.sin(elapsed * fb.speed + fb.phase) * fb.ampX,
          fb.by + Math.sin(elapsed * (fb.speed * 1.4) + fb.phase * 1.7) * fb.ampY,
          fb.bz + Math.cos(elapsed * (fb.speed * 0.9) + fb.phase * 0.8) * fb.ampZ
        );
      }
      ffPos.needsUpdate = true;
      if (this.fireflyUniforms) {
        this.fireflyUniforms.uTime.value = elapsed;
      }
    }

    // Animate all Mountable Sacred Elephants & Royal Ashvas (idle breath & active stride gait)
    for (let i = 0; i < this.animals.length; i++) {
      const a = this.animals[i];
      const moving = Math.abs(a.speed) > 0.35;
      if (a.horseRig) {
        const spdNorm = THREE.MathUtils.clamp(Math.abs(a.speed) / 16, 0, 1);
        this.animateRoyalHorseRig(a.horseRig, a.gaitPhase, spdNorm, elapsed, i * 1.7);
      } else if (a.elephantRig) {
        const er = a.elephantRig;
        er.trunkPivot.rotation.x = Math.sin(elapsed * 1.4 + i * 1.9) * 0.16;
        for (let ei = 0; ei < er.earPivots.length; ei++) {
          const side = ei % 2 === 0 ? -1 : 1;
          er.earPivots[ei].rotation.y = side * (0.12 + Math.sin(elapsed * 2.1 + i + ei) * 0.08);
        }
        for (let li = 0; li < er.legs.length; li++) {
          const ph = a.gaitPhase + (li % 2) * Math.PI + (li >= 2 ? 0.6 : 0);
          er.legs[li].rotation.x = moving ? -Math.sin(ph) * 0.34 : 0;
        }
      }
    }

    // Keep all idle & parked chariot horses alive with distance-LOD idle breathing, ear flicks & tail swishes
    const pxIdle = this.playerX;
    const pzIdle = this.playerZ;
    for (let i = 0; i < this.chariots.length; i++) {
      if (i === this.mountedChariotIndex) continue;
      const ch = this.chariots[i];
      const dSq = (ch.x - pxIdle) * (ch.x - pxIdle) + (ch.z - pzIdle) * (ch.z - pzIdle);
      if (dSq > 8100) continue;
      if (dSq > 2500 && ((i + this.simFrameCounter) & 3) !== 0) continue;
      for (let sIdx = 0; sIdx < ch.rig.steeds.length; sIdx++) {
        this.animateRoyalHorseRig(
          ch.rig.steeds[sIdx],
          ch.gaitPhase + sIdx * 0.45,
          0,
          elapsed,
          i * 3.1 + sIdx * 1.4
        );
      }
    }

    // Active Aquatic Life Animation (20-ft Deep Sarayu River + Saturated Surya-Kund Stepwell)
    this.stepAquaticEcosystem(dt, elapsed);

    // Gentle river water & normal ripple animation + volcanic bombs/smoke + Demon Village atmosphere shift
    this.textures.water.offset.y -= dt * 0.35;
    this.textures.waterNormal.offset.y -= dt * 0.42;
    this.textures.waterNormal.offset.x += dt * 0.08;
    this.stepVolcanicAtmosphere(dt);
    this.updateAtmosphericMood();

    // 2. Explicit Interact (Sit / Rise on Simhasana Throne OR Mount / Dismount Ratha / Ashva / Elephant)
    if (this.input.interactPressed) {
      this.input.interactPressed = false;
      if (this.seatedOnThrone) {
        this.seatedOnThrone = false;
        this.playerZ = THRONE_POS.z + 1.65;
        this.playerY = this.surfaceHeightAt(this.playerX, this.playerZ, 0.9);
        this.restoreRamStandingClothes();
        soundEngine.playMountChariot();
        this.emitHud();
      } else if (this.mountedChariotIndex !== null) {
        const wasStealth = this.stealthActive;
        const ch = this.chariots[this.mountedChariotIndex];
        ch.speed = 0;
        this.autoDriveActive = false;
        if (ch.rig.leftReinMesh && ch.rig.leftBridleHook && ch.rig.leftRailHook) {
          updateDynamicReinMesh(ch.rig.leftReinMesh, ch.rig.leftBridleHook, ch.rig.leftRailHook, 0.2);
        }
        if (ch.rig.rightReinMesh && ch.rig.rightBridleHook && ch.rig.rightRailHook) {
          updateDynamicReinMesh(ch.rig.rightReinMesh, ch.rig.rightBridleHook, ch.rig.rightRailHook, 0.2);
        }
        this.mountedChariotIndex = null;
        this.restoreRamStandingClothes();
        this.setStealthMode(wasStealth);
        this.cameraManualHold = 0;
        this.camChariotLockTimer = 0;
        const sinChY = Math.sin(ch.yaw);
        const cosChY = Math.cos(ch.yaw);
        let chosenX = ch.x + cosChY * 2.85;
        let chosenZ = ch.z - sinChY * 2.85;
        if (isInRiverWater(chosenX, chosenZ)) {
          const altX = ch.x - cosChY * 2.85;
          const altZ = ch.z + sinChY * 2.85;
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
        this.ramRig.root.rotation.order = 'YXZ';
        this.ramRig.root.rotation.set(0, this.playerYaw, 0);
        soundEngine.playMountChariot();
        this.emitHud();
      } else if (this.mountedAnimalIndex !== null) {
        const wasStealth = this.stealthActive;
        const an = this.animals[this.mountedAnimalIndex];
        an.speed = 0;
        this.autoDriveActive = false;
        if (an.horseRig?.leftReinMesh && an.horseRig.rightReinMesh && an.horseRig.leftPommelHook && an.horseRig.rightPommelHook) {
          an.horseRig.group.updateMatrixWorld(true);
          an.horseRig.leftBitAnchor.getWorldPosition(_v1);
          an.horseRig.group.worldToLocal(_v1);
          updateDynamicReinMesh(an.horseRig.leftReinMesh, _v1, an.horseRig.leftPommelHook, 0.18);
          an.horseRig.rightBitAnchor.getWorldPosition(_v2);
          an.horseRig.group.worldToLocal(_v2);
          updateDynamicReinMesh(an.horseRig.rightReinMesh, _v2, an.horseRig.rightPommelHook, 0.18);
        }
        this.mountedAnimalIndex = null;
        this.restoreRamStandingClothes();
        this.setStealthMode(wasStealth);
        this.cameraManualHold = 0;
        this.camChariotLockTimer = 0;
        const offDist = an.kind === 'ELEPHANT' ? 2.25 : 1.55;
        const safePos = this.resolveStaticColliders(
          an.x + Math.cos(an.yaw) * offDist,
          an.z - Math.sin(an.yaw) * offDist,
          0.58,
          an.y
        );
        this.playerX = safePos.x;
        this.playerZ = safePos.z;
        this.playerY = this.surfaceHeightAt(this.playerX, this.playerZ, an.y);
        this.ramRig.root.rotation.order = 'YXZ';
        this.ramRig.root.rotation.set(0, this.playerYaw, 0);
        soundEngine.playMountChariot();
        this.emitHud();
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
        if (nearMount?.kind === 'RATHA') {
          const wasStealth = this.stealthActive;
          this.mountedChariotIndex = nearMount.index;
          this.autoDriveActive = false;
          this.isRamSwimming = false;
          this.setStealthMode(wasStealth);
          this.cameraManualHold = 0;
          this.camChariotLockTimer = 0.7;
          soundEngine.playMountChariot();
          this.emitHud();
        } else if (nearMount) {
          const wasStealth = this.stealthActive;
          this.mountedAnimalIndex = nearMount.index;
          this.autoDriveActive = false;
          this.isRamSwimming = false;
          this.setStealthMode(wasStealth);
          this.cameraManualHold = 0;
          this.camChariotLockTimer = 0.7;
          soundEngine.playMountChariot();
          this.emitHud();
        }
      }
    }

    // 2b. Universal Stealth Mode toggle & Paved-Path Auto-Drive toggle (Ratha, Ashva & Sacred Elephant)
    if (this.input.stealthTogglePressed) {
      this.input.stealthTogglePressed = false;
      this.setStealthMode(!this.stealthActive);
      this.emitHud();
    }

    if (this.input.autoDriveTogglePressed) {
      this.input.autoDriveTogglePressed = false;
      if (this.mountedChariotIndex !== null || this.mountedAnimalIndex !== null) {
        this.autoDriveActive = !this.autoDriveActive;
        this.chariotAutoWaypoints = [];
        this.chariotAutoWpIdx = 0;
        this.chariotAutoGoalKey = '';
        soundEngine.playMountChariot();
        this.emitHud();
      }
    }

    // 3. Movement: Seated on Throne | Mounted Ratha | Mounted Ashva/Elephant | Swimming | On-Foot
    const mx = this.input.moveX;
    const my = this.input.moveY;
    const mag = Math.min(1, Math.hypot(mx, my));

    const prevYaw = this.playerYaw;
    const prevX = this.playerX;
    const prevZ = this.playerZ;
    const isDrawingBow = this.input.fireHeld || this.bowDrawHoldTimer > 0;

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
        this.applyThroneSittingPose(this.ramRig, isDrawingBow, elapsed);
      }
    } else if (this.mountedChariotIndex !== null) {
      this.input.jumpPressed = false;
      this.isRamSwimming = false;
      const ch = this.chariots[this.mountedChariotIndex];
      let steerInput = 0;

      if (this.autoDriveActive) {
        const activeMission = MISSIONS[this.missionIdx];
        const goalX =
          activeMission && activeMission.id !== 'mission_sabha' ? activeMission.waypoint.x : 0;
        const goalZ =
          activeMission && activeMission.id !== 'mission_sabha' ? activeMission.waypoint.z : -56;
        const goalKey = `${goalX.toFixed(0)}:${goalZ.toFixed(0)}`;
        if (this.chariotAutoWaypoints.length === 0 || this.chariotAutoGoalKey !== goalKey) {
          this.chariotAutoWaypoints = buildAutoDriveRoute(ch.x, ch.z, ch.yaw, goalX, goalZ);
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
        this.chariotAutoWaypoints = [];
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

      const chariotSpdNorm = THREE.MathUtils.clamp(Math.abs(ch.speed) / 28, 0, 1);
      for (let sIdx = 0; sIdx < ch.rig.steeds.length; sIdx++) {
        this.animateRoyalHorseRig(
          ch.rig.steeds[sIdx],
          ch.gaitPhase + sIdx * 0.45,
          chariotSpdNorm,
          elapsed,
          (this.mountedChariotIndex ?? 0) * 3.1 + sIdx * 1.4
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

      // Sync seated Lord Ram cleanly onto Ratha throne cushion & pitch plane
      const dLocalZ = -0.72;
      const dLocalY = 0.62;
      const sinP = Math.sin(ch.pitch);
      const cosP = Math.cos(ch.pitch);
      const tiltedZ = -dLocalY * sinP + dLocalZ * cosP;
      const tiltedY = dLocalY * cosP + dLocalZ * sinP;
      this.playerX = ch.x + Math.sin(ch.yaw) * tiltedZ;
      this.playerZ = ch.z + Math.cos(ch.yaw) * tiltedZ;
      this.playerY = ch.y + tiltedY;
      this.playerVelY = 0;
      this.grounded = true;
      this.playerYaw = ch.yaw;
      this.ramRig.root.position.set(this.playerX, this.playerY, this.playerZ);
      this.ramRig.root.rotation.order = 'YXZ';
      this.ramRig.root.rotation.y = this.playerYaw;
      this.ramRig.root.rotation.x = -ch.pitch;
      this.ramRig.contactShadow.visible = false;
      this.applyChariotSittingPose(
        this.ramRig,
        steerInput,
        isDrawingBow,
        elapsed
      );
    } else if (this.mountedAnimalIndex !== null) {
      this.input.jumpPressed = false;
      this.isRamSwimming = false;
      const an = this.animals[this.mountedAnimalIndex];
      const isEle = an.kind === 'ELEPHANT';
      const anRadius = isEle ? 1.55 : 0.95;
      const maxSpeed = isEle ? (this.input.sprint ? 16 : 9.5) : (this.input.sprint ? 36 : 16);

      if (this.autoDriveActive) {
        const activeMission = MISSIONS[this.missionIdx];
        const goalX =
          activeMission && activeMission.id !== 'mission_sabha' ? activeMission.waypoint.x : 0;
        const goalZ =
          activeMission && activeMission.id !== 'mission_sabha' ? activeMission.waypoint.z : -56;
        const goalKey = `${goalX.toFixed(0)}:${goalZ.toFixed(0)}`;
        if (this.chariotAutoWaypoints.length === 0 || this.chariotAutoGoalKey !== goalKey) {
          this.chariotAutoWaypoints = buildAutoDriveRoute(an.x, an.z, an.yaw, goalX, goalZ);
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
        this.chariotAutoWaypoints = [];
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
      const animalStride = isEle ? 2.6 : 2.25;
      an.gaitPhase += (movedDist / animalStride) * Math.PI * 2;

      const anObj = an.horseRig ? an.horseRig.group : an.elephantRig!.group;
      anObj.position.set(an.x, an.y, an.z);
      anObj.rotation.y = an.yaw;

      const seatY = an.elephantRig
        ? an.elephantRig.seatHeight
        : an.horseRig
        ? an.horseRig.seatHeight
        : 0.88;
      const seatZ = isEle ? 0.18 : -0.02;
      this.playerX = an.x + Math.sin(an.yaw) * seatZ;
      this.playerZ = an.z + Math.cos(an.yaw) * seatZ;
      this.playerY = an.y + seatY;
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
        elapsed
      );
    } else {
      this.ramRig.contactShadow.visible = true;
      this.restoreRamStandingClothes();
      this.ramRig.root.rotation.order = 'YXZ';
      this.ramRig.root.rotation.x = 0;

      // Determine swimming state in Sarayu River / Surya-Kund Stepwell
      const preGroundY = this.surfaceHeightAt(this.playerX, this.playerZ);
      const waterSurf = waterSurfaceAt(this.playerX, this.playerZ);
      const waterDepth = waterSurf !== null ? waterSurf - preGroundY : 0;
      const swimming = waterSurf !== null && waterDepth > 0.95;
      this.isRamSwimming = swimming;

      // Camera-relative movement direction
      _forward.set(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
      _right.set(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));

      _v1.set(0, 0, 0)
        .addScaledVector(_forward, my)
        .addScaledVector(_right, mx);

      let resolvedDist = 0;
      if (mag > 0.08 && _v1.lengthSq() > 0.001) {
        _v1.normalize();
        const moveSpeed = swimming
          ? this.input.sprint
            ? 8.8
            : 5.8
          : this.stealthActive
          ? 6.0
          : this.input.sprint
          ? 14.5
          : 9.4;
        const nextX = this.playerX + _v1.x * moveSpeed * mag * dt;
        const nextZ = this.playerZ + _v1.z * moveSpeed * mag * dt;
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

        const targetYaw = Math.atan2(_v1.x, _v1.z);
        // Shortest-angle yaw wrap
        let diff = targetYaw - this.playerYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.playerYaw += diff * Math.min(1, 12 * dt);

        // Drive walkPhase strictly from actual resolved ground/water displacement matched to stance-locked strideLength
        const strideLength = swimming
          ? 2.25
          : this.stealthActive
          ? 1.52
          : !this.stealthActive && this.input.sprint && resolvedDist / Math.max(0.001, dt) > 10
          ? 2.32
          : 1.76;
        this.walkPhase += (resolvedDist / strideLength) * Math.PI * 2;
      }
      this.lastResolvedMoveSpeed = resolvedDist / Math.max(0.001, dt);
      const effectiveMoveIntensity = THREE.MathUtils.clamp(this.lastResolvedMoveSpeed / 4.5, 0, 1);

      const groundY = this.surfaceHeightAt(this.playerX, this.playerZ);
      const postWaterSurf = waterSurfaceAt(this.playerX, this.playerZ);
      const postWaterDepth = postWaterSurf !== null ? postWaterSurf - groundY : 0;
      const activeSwim = postWaterSurf !== null && postWaterDepth > 0.95;
      this.isRamSwimming = activeSwim;

      if (activeSwim && postWaterSurf !== null) {
        // Full 3D Swimming: Archimedes buoyancy at surface + downward camera-pitch diving + Space surface boost / bank vault
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
          // Gentle buoyant rise back toward water surface when not actively diving
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
        this.applySwimmingPose(this.ramRig, this.walkPhase, effectiveMoveIntensity, elapsed, divePitch);
      } else {
        // Smooth gravity drop across balconies/ledges > 0.55m instead of single-frame snap teleport
        if (this.input.jumpPressed && this.grounded) {
          this.playerVelY = 9.2;
          this.grounded = false;
          soundEngine.playMountChariot();
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
          dt
        );
        if (this.stealthActive && this.grounded) {
          this.ramRig.torso.rotation.x += 0.22;
        }
      }
    }

    // Track horizontal velocity & turn rate for physics-based hair & cape simulation
    const safeDt = Math.max(0.001, dt);
    this.playerHorizSpeed = Math.hypot(this.playerX - prevX, this.playerZ - prevZ) / safeDt;
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

    // 4. Sharnga Dhanush Bow & Sudarshan Chakra (10s Cooldown Charge)
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.bowDrawHoldTimer = Math.max(0, this.bowDrawHoldTimer - dt);
    this.chakraCooldown = Math.max(0, this.chakraCooldown - dt);
    this.prana = Math.min(this.maxPrana, this.prana + dt * 5.5);

    if (this.input.fireHeld) {
      this.bowDrawHoldTimer = 0.42;
      if (this.fireCooldown <= 0) {
        this.fireCooldown = 0.28;
        this.fireArrow(false);
        if (this.stealthActive) {
          this.setStealthMode(false);
        }
      }
    }

    // Toggle Sharnga Dhanush between Hand-Drawn and Back-Slung
    const showDrawnBow = this.input.fireHeld || this.bowDrawHoldTimer > 0;
    if (this.ramRig.bowGroup) this.ramRig.bowGroup.visible = showDrawnBow;
    if (this.ramRig.backBowGroup) this.ramRig.backBowGroup.visible = !showDrawnBow;

    if (this.input.astraPressed) {
      this.input.astraPressed = false;
      if (this.chakraCooldown <= 0) {
        this.chakraCooldown = this.chakraMaxCooldown;
        this.fireArrow(true);
        if (this.stealthActive) {
          this.setStealthMode(false);
        }
      }
    }

    // 5. Projectiles Update & Continuous Segment Collision Detection (CCD)
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      const ax = p.x;
      const ay = p.y;
      const az = p.z;
      const bx = ax + p.vx * dt;
      const by = ay + p.vy * dt;
      const bz = az + p.vz * dt;

      let bestT = 2.0;
      let hitEnemy: EnemyEntity | null = null;
      let hitEnvironment = false;

      // A. Continuous Ray-Segment vs Enemy Bounding Capsules
      const segDx = bx - ax;
      const segDy = by - ay;
      const segDz = bz - az;
      const segLenSq = segDx * segDx + segDy * segDy + segDz * segDz;

      for (let eIdx = 0; eIdx < this.enemies.length; eIdx++) {
        const e = this.enemies[eIdx];
        if (!e.alive) continue;
        const scale = e.isCommander ? 1.38 : 1.06;
        const capR = 0.68 * scale;
        const minY = e.y + 0.1;
        const maxY = e.y + 2.1 * scale;

        // Closest t along segment to enemy XZ column
        const xzSq = segDx * segDx + segDz * segDz;
        let t = 1.0;
        if (xzSq > 1e-7) {
          t = THREE.MathUtils.clamp(
            ((e.x - ax) * segDx + (e.z - az) * segDz) / xzSq,
            0,
            1
          );
        }
        const px = ax + segDx * t;
        const py = ay + segDy * t;
        const pz = az + segDz * t;
        const dEx = px - e.x;
        const dEz = pz - e.z;
        if (dEx * dEx + dEz * dEz <= capR * capR && py >= minY - 0.25 && py <= maxY + 0.25) {
          if (t < bestT) {
            bestT = t;
            hitEnemy = e;
            hitEnvironment = false;
          }
        }
      }

      // B & C. Continuous Ray-Segment vs Spatial-Hashed Static OBBs & Cylinders
      const grid = this.colliderGrid;
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

      // D. Swept Terrain Heightfield Check
      for (let s = 1; s <= 4; s++) {
        const ts = s / 4;
        if (ts >= bestT) break;
        const sx = ax + segDx * ts;
        const sy = ay + segDy * ts;
        const sz = az + segDz * ts;
        if (sy <= groundHeightAt(sx, sz)) {
          bestT = ts;
          hitEnemy = null;
          hitEnvironment = true;
          break;
        }
      }

      if (bestT <= 1.0) {
        const hitX = ax + segDx * bestT;
        const hitY = Math.max(groundHeightAt(hitX, az + segDz * bestT) + 0.08, ay + segDy * bestT);
        const hitZ = az + segDz * bestT;
        p.x = hitX;
        p.y = hitY;
        p.z = hitZ;
        p.mesh.position.set(hitX, hitY, hitZ);

        const dmgMult = p.stealthAmbush ? 2.0 : 1.0;

        if (hitEnemy) {
          if (p.isChakra) {
            this.spawnBlast(hitX, hitY, hitZ, 0xff5a12);
            for (let eIdx = 0; eIdx < this.enemies.length; eIdx++) {
              const other = this.enemies[eIdx];
              if (!other.alive) continue;
              const odx = other.x - hitX;
              const odz = other.z - hitZ;
              if (odx * odx + odz * odz < 100.0) {
                this.damageEnemy(other, Math.round(95 * dmgMult));
              }
            }
          } else {
            this.damageEnemy(hitEnemy, Math.round(32 * dmgMult));
            this.spawnBlast(hitX, hitY, hitZ, p.stealthAmbush ? 0x58a6ff : 0xf6c343);
          }
          if (p.stealthAmbush) this.karma += 15;
        } else if (hitEnvironment) {
          if (p.isChakra) {
            this.spawnBlast(hitX, hitY, hitZ, 0xff5a12);
            for (let eIdx = 0; eIdx < this.enemies.length; eIdx++) {
              const other = this.enemies[eIdx];
              if (!other.alive) continue;
              const odx = other.x - hitX;
              const odz = other.z - hitZ;
              if (odx * odx + odz * odz < 100.0) {
                this.damageEnemy(other, Math.round(85 * dmgMult));
              }
            }
          } else {
            this.spawnBlast(hitX, hitY, hitZ, 0xe8c47a);
          }
        }

        this.poolManager.release(p.isChakra ? 'chakra' : 'arrow', p.mesh);
        swapRemoveAt(this.projectiles, i);
        continue;
      }

      p.x = bx;
      p.y = by;
      p.z = bz;
      p.mesh.position.set(p.x, p.y, p.z);
      if (p.spinPivot) {
        p.spinPivot.rotation.y += dt * 26;
        this.combatLight.color.setHex(0xff6b1c);
        this.combatLight.position.set(p.x, p.y + 0.4, p.z);
        this.combatLight.intensity = 6.5;
      }

      if (p.life <= 0) {
        if (p.isChakra) {
          this.spawnBlast(p.x, Math.max(p.y, groundHeightAt(p.x, p.z) + 0.5), p.z, 0xff5a12);
          for (let eIdx = 0; eIdx < this.enemies.length; eIdx++) {
            const other = this.enemies[eIdx];
            if (!other.alive) continue;
            const odx = other.x - p.x;
            const odz = other.z - p.z;
            if (odx * odx + odz * odz < 100.0) {
              this.damageEnemy(other, p.stealthAmbush ? 160 : 85);
            }
          }
        }
        this.poolManager.release(p.isChakra ? 'chakra' : 'arrow', p.mesh);
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

    // Compact defeated enemies (rigs already returned to Demon Pool in damageEnemy)
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!this.enemies[i].alive) {
        swapRemoveAt(this.enemies, i);
      }
    }

    // 7. Five-Variant Demon AI, Unique Abilities, Enemy Projectiles & Ground Hazards
    //    Absolute Boundary Enforcement: Demons spawn & patrol ONLY inside the 5 km Demon Badlands (x >= DEMON_ZONE_MIN_X)
    this.spawnTimer += dt;
    const activeAlive = this.enemies.length;
    if (
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

    let spottedByAny = false;
    const detectConeDist = this.mountedChariotIndex !== null ? 8.0 : 6.0;

    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = this.playerX - e.x;
      const dz = this.playerZ - e.z;
      const dist = Math.hypot(dx, dz);
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

      const groundY = groundHeightAt(e.x, e.z);

      if (!canDetectPlayer || dist >= 48) {
        // Stealth patrol / calm lookout
        e.abilityState = 'IDLE';
        if (this.stealthActive && !canDetectPlayer) {
          e.yaw += Math.sin(elapsed * 0.65 + e.walkPhase) * 0.25 * dt;
        }
        if (e.variant === 'SHADOW_GHOST') {
          e.y = groundY + 0.35 + Math.sin(elapsed * 2.8 + e.walkPhase) * 0.16;
          if (e.rig.customParts) e.rig.customParts.rotation.y += dt * 1.4;
          if (e.rig.ghostOverlayMat) e.rig.ghostOverlayMat.opacity = 0.68;
        } else if (e.variant === 'BOAR_DEMON' || e.variant === 'RABBIT_DEMON') {
          e.y = groundY;
          e.rig.torso.rotation.x = 0;
        } else {
          e.y = groundY;
          this.applyArticulatedLocomotion(e.rig, e.walkPhase, 0, false, true, false, true, 0.96, elapsed, dt);
        }
        continue;
      }

      // Unique Combat AI per Demon Variant
      if (e.variant === 'BOAR_DEMON') {
        // ANIMAL 1: BOAR DEMON — Bull-rush charge telegraph -> high-speed tusk stampede
        if (e.abilityState === 'IDLE') {
          e.yaw = Math.atan2(dx, dz);
          if (dist < 16 && e.abilityCooldown <= 0) {
            e.abilityState = 'WINDUP';
            e.abilityTimer = 0.65;
            e.chargeDirX = dx / Math.max(0.01, dist);
            e.chargeDirZ = dz / Math.max(0.01, dist);
            e.rig.torso.rotation.x = 0.28; // lower tusks for bull charge
          } else if (dist > 2.2) {
            const nx = e.x + (dx / dist) * 4.4 * dt;
            const nz = e.z + (dz / dist) * 4.4 * dt;
            const res = this.moveSweptWithStaticCCD(e.x, e.z, nx, nz, er, groundY, true);
            const movedDist = Math.hypot(res.x - e.x, res.z - e.z);
            e.x = res.x;
            e.z = res.z;
            e.walkPhase += (movedDist / 1.45) * Math.PI * 2;
          } else if (e.attackCooldown <= 0) {
            e.attackCooldown = 1.25;
            this.inflictDamageToPlayer(this.mountedChariotIndex !== null ? 5 : 10, 0);
          }
        } else if (e.abilityState === 'WINDUP') {
          e.abilityTimer -= dt;
          e.rig.torso.rotation.x = 0.34 + Math.sin(elapsed * 28) * 0.05;
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
          e.rig.torso.rotation.x = 0.22;
          if (Math.hypot(this.playerX - e.x, this.playerZ - e.z) < 2.25 && e.attackCooldown <= 0) {
            e.attackCooldown = 0.9;
            this.inflictDamageToPlayer(this.mountedChariotIndex !== null ? 7 : 15, 0);
            this.spawnBlast(this.playerX, this.playerY + 1, this.playerZ, 0xff5a12);
            e.abilityState = 'IDLE';
            e.abilityCooldown = 3.2;
          } else if (e.abilityTimer <= 0) {
            e.abilityState = 'IDLE';
            e.abilityCooldown = 3.0;
            e.rig.torso.rotation.x = 0;
          }
        }
        e.y = groundHeightAt(e.x, e.z);
        // 4-legged gallop limb animation
        e.rig.leftLeg.rotation.x = Math.sin(e.walkPhase) * 0.55;
        e.rig.rightLeg.rotation.x = Math.sin(e.walkPhase + 0.5) * 0.55;
        e.rig.leftArm.rotation.x = -Math.sin(e.walkPhase) * 0.55;
        e.rig.rightArm.rotation.x = -Math.sin(e.walkPhase + 0.5) * 0.55;
      } else if (e.variant === 'RABBIT_DEMON') {
        // ANIMAL 2: DEMON HARE — Evasive zigzag weave & parabolic vault slam with radial thorn burst
        e.yaw = Math.atan2(dx, dz);
        if (e.abilityState === 'IDLE') {
          if (dist < 14 && e.abilityCooldown <= 0) {
            e.abilityState = 'ACTIVE';
            e.velY = 8.4;
            e.abilityTimer = 0.05;
            e.chargeDirX = dx / Math.max(0.01, dist);
            e.chargeDirZ = dz / Math.max(0.01, dist);
            e.strafeSign *= -1;
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
            this.applyArticulatedLocomotion(e.rig, e.walkPhase, THREE.MathUtils.clamp(movedDist / Math.max(0.001, dt) / 3.5, 0, 1), true, hopOffset < 0.08, false, true, 0.88, elapsed, dt);
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
          this.applyArticulatedLocomotion(e.rig, e.walkPhase, 1.0, true, false, false, true, 0.88, elapsed, dt);
          const landY = groundHeightAt(e.x, e.z);
          if (e.y <= landY) {
            e.y = landY;
            e.velY = 0;
            e.abilityState = 'IDLE';
            e.abilityCooldown = 3.1;
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
      } else if (e.variant === 'SHADOW_GHOST') {
        // SHADOW GHOST — Translucent hover + phase-blink flank teleport + draining Soul-Wisp projectile
        e.yaw = Math.atan2(dx, dz);
        if (e.rig.customParts) e.rig.customParts.rotation.y += dt * 2.4;
        if (e.abilityState === 'IDLE') {
          if (e.rig.ghostOverlayMat) e.rig.ghostOverlayMat.opacity = 0.72;
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
          e.y = groundHeightAt(e.x, e.z) + 0.35 + Math.sin(elapsed * 3.1 + e.walkPhase) * 0.18;
          e.rig.leftArm.rotation.x = -0.45 + Math.sin(elapsed * 2.5) * 0.18;
          e.rig.rightArm.rotation.x = -0.45 + Math.cos(elapsed * 2.5) * 0.18;
        } else {
          // Fade out -> blink flank behind player (strictly constrained to Demon Badlands x >= DEMON_ZONE_MIN_X)
          e.abilityTimer -= dt;
          if (e.rig.ghostOverlayMat) {
            e.rig.ghostOverlayMat.opacity = THREE.MathUtils.clamp(e.abilityTimer / 0.65, 0.12, 0.72);
          }
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
      } else if (e.variant === 'SORCERER_HUMAN') {
        // HUMAN 2: CURSED SORCERER — Kites at range, fires 3-orb curse spread & places delayed ground curse sigil
        e.yaw = Math.atan2(dx, dz);
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
            this.applyArticulatedLocomotion(e.rig, e.walkPhase, THREE.MathUtils.clamp(movedDist / Math.max(0.001, dt) / 3.2, 0, 1), false, true, false, true, 0.96, elapsed, dt);
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
            this.applyArticulatedLocomotion(e.rig, e.walkPhase, THREE.MathUtils.clamp(movedDist / Math.max(0.001, dt) / 3.2, 0, 1), false, true, false, true, 0.96, elapsed, dt);
          } else {
            this.applyArticulatedLocomotion(e.rig, e.walkPhase, 0, false, true, false, true, 0.96, elapsed, dt);
          }
          if (dist < 28 && e.abilityCooldown <= 0) {
            e.abilityState = 'WINDUP';
            e.abilityTimer = 0.72;
          }
        } else {
          e.abilityTimer -= dt;
          e.rig.rightArm.rotation.x = -1.65;
          e.rig.rightElbow.rotation.x = -0.25;
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
      } else {
        // HUMAN 1: BRUTE_HUMAN (incl. Boss Viradha) — Slow advance + Gada Club Ground-Slam Shockwave
        e.yaw = Math.atan2(dx, dz);
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
            this.applyArticulatedLocomotion(e.rig, e.walkPhase, THREE.MathUtils.clamp(movedDist / Math.max(0.001, dt) / 3.2, 0, 1), false, true, false, true, 0.96, elapsed, dt);
          } else {
            this.applyArticulatedLocomotion(e.rig, e.walkPhase, 0, false, true, false, true, 0.96, elapsed, dt);
            if (e.attackCooldown <= 0) {
              e.attackCooldown = 1.4;
              this.inflictDamageToPlayer(this.mountedChariotIndex !== null ? 6 : e.isCommander ? 16 : 10, 0);
            }
          }
        } else {
          // Overhead Gada slam windup -> Shockwave Ring
          e.abilityTimer -= dt;
          e.rig.rightArm.rotation.x = -2.15;
          e.rig.rightElbow.rotation.x = -0.3;
          if (e.abilityTimer <= 0) {
            this.spawnGroundHazard('GADA_WAVE', e.x, e.z, e.isCommander ? 7.5 : 5.8, e.isCommander ? 16 : 11, 0.6);
            this.spawnBlast(e.x, e.y + 0.5, e.z, 0xff5a12);
            soundEngine.playAstraBlast();
            e.abilityState = 'IDLE';
            e.abilityCooldown = 3.8;
          }
        }
        e.y = groundHeightAt(e.x, e.z);
      }
    }
    this.stealthSpotted = this.stealthActive && spottedByAny;

    // 7b. Update Enemy Projectiles & Ground Hazards
    this.stepEnemyProjectilesAndHazards(dt);

    // 8. Traditionally Attired NPCs & 60-Second Sabha Throne Ascension Seating Routine
    if (this.ascensionActive && !this.ascensionCompleted) {
      this.ascensionElapsed += dt;
    }

    let allCouncilSeated = true;
    const citPx = this.playerX;
    const citPz = this.playerZ;
    for (let ci = 0; ci < this.citizens.length; ci++) {
      const c = this.citizens[ci];
      if (this.ascensionActive && c.courtSeat) {
        if (c.seated) {
          // Hold clean seated posture right atop the assigned Sabha cushion (top = sabhaBaseY + 0.95m)
          c.x = c.courtSeat.x;
          c.y = c.courtSeat.y;
          c.z = c.courtSeat.z;
          c.yaw = c.courtSeat.faceYaw;
          c.rig.contactShadow.visible = false;
          c.rig.torso.position.y = 0.56;
          c.rig.leftLeg.position.y = 0.56;
          c.rig.rightLeg.position.y = 0.56;
          c.rig.leftLeg.rotation.x = -1.42;
          c.rig.rightLeg.rotation.x = -1.42;
          c.rig.leftKnee.rotation.x = 1.32;
          c.rig.rightKnee.rotation.x = 1.32;
          c.rig.leftArm.rotation.x = -0.35;
          c.rig.rightArm.rotation.x = -0.35;
          c.rig.leftElbow.rotation.x = -0.55;
          c.rig.rightElbow.rotation.x = -0.55;
          if (c.rig.centerPleat) {
            c.rig.centerPleat.rotation.x = -1.25;
          }
          continue;
        }

        allCouncilSeated = false;
        c.rig.contactShadow.visible = true;
        c.rig.torso.rotation.x = 0;
        const sdx = c.courtSeat.x - c.x;
        const sdz = c.courtSeat.z - c.z;
        const dist = Math.hypot(sdx, sdz);

        if (dist <= 0.65 || this.ascensionElapsed >= 56.0) {
          c.x = c.courtSeat.x;
          c.y = c.courtSeat.y;
          c.z = c.courtSeat.z;
          c.yaw = c.courtSeat.faceYaw;
          c.seated = true;
          c.navQueue = [];
          continue;
        }

        // Follow pre-computed obstacle-free Navigation Mesh waypoints strictly without collider bypass
        let tgtX = c.courtSeat.x;
        let tgtZ = c.courtSeat.z;
        if (!c.navQueue || c.navQueue.length === 0) {
          c.navQueue = findPalaceNavPath(
            c.x,
            c.y,
            c.z,
            c.courtSeat.x,
            c.courtSeat.y,
            c.courtSeat.z,
            false
          );
        }
        while (c.navQueue.length > 0 && Math.hypot(c.navQueue[0].x - c.x, c.navQueue[0].z - c.z) < 1.15) {
          c.navQueue.shift();
        }
        if (c.navQueue.length > 0) {
          tgtX = c.navQueue[0].x;
          tgtZ = c.navQueue[0].z;
        }
        const wdx = tgtX - c.x;
        const wdz = tgtZ - c.z;
        const wDist = Math.max(0.01, Math.hypot(wdx, wdz));

        const timeLeft = Math.max(4.0, 26.0 - this.ascensionElapsed);
        const speed = THREE.MathUtils.clamp(Math.max(5.5, dist / timeLeft), 5.5, 14.0);
        const dirX = wdx / wDist;
        const dirZ = wdz / wDist;
        c.yaw = Math.atan2(dirX, dirZ);
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
        c.y = this.surfaceHeightAt(c.x, c.z, c.y);
        c.walkPhase += (movedDist / 2.2) * Math.PI * 2;
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
          dt
        );
      } else {
        // Strict Baked Navigation Mesh Patrol + Distance-LOD Kinematics + Voluntary Water Entry
        const citDistSq = (c.x - citPx) * (c.x - citPx) + (c.z - citPz) * (c.z - citPz);
        if (citDistSq > 11025) {
          // Far beyond crisp shadow/fog draw band (>105m): skip offscreen citizen ticks
          continue;
        }
        c.patrolTimer -= dt;
        if (!c.navQueue || c.navQueue.length === 0 || c.patrolTimer <= 0) {
          const wantWater = c.canSwim && !c.isSwimming && Math.random() < 0.72;
          c.patrolTimer = c.canSwim ? 7.0 + Math.random() * 4.0 : 5.0 + Math.random() * 4.0;
          c.navQueue = pickNavMeshPatrolTarget(
            c.x,
            c.y,
            c.z,
            c.homeX,
            c.homeZ,
            c.canSwim,
            wantWater
          );
        }

        const wp = c.navQueue[0];
        if (wp) {
          const wpdx = wp.x - c.x;
          const wpdz = wp.z - c.z;
          if (wpdx * wpdx + wpdz * wpdz < 0.7225) {
            c.navQueue.shift();
            c.patrolTimer = Math.min(c.patrolTimer, 0.2);
          }
        }

        const tgtX = c.navQueue[0]?.x ?? c.homeX;
        const tgtZ = c.navQueue[0]?.z ?? c.homeZ;
        const pdx = tgtX - c.x;
        const pdz = tgtZ - c.z;
        const pDist = Math.max(0.01, Math.hypot(pdx, pdz));
        const pDirX = pdx / pDist;
        const pDirZ = pdz / pDist;
        c.yaw = Math.atan2(pDirX, pDirZ);

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
            c.navQueue = [];
            c.patrolTimer = 0;
          }
          c.x = res.x;
          c.z = res.z;
        } else {
          c.navQueue = [];
          c.patrolTimer = 0;
        }

        const cGroundY = this.surfaceHeightAt(c.x, c.z, c.y);
        const cWaterSurf = c.canSwim ? waterSurfaceAt(c.x, c.z) : null;
        const updateRigKinematics = citDistSq <= 3025 || ((ci + this.simFrameCounter) & 3) === 0;
        if (cWaterSurf !== null && cWaterSurf - cGroundY > 0.95) {
          c.isSwimming = true;
          const swimTargetY = cWaterSurf - 1.15 + Math.sin(elapsed * 2.2 + c.walkPhase) * 0.04;
          c.y = THREE.MathUtils.damp(c.y, Math.max(cGroundY + 0.1, swimTargetY), 6.0, dt);
          c.walkPhase += Math.max(dt * 3.0, (movedDist / 1.8) * Math.PI * 2);
          if (updateRigKinematics) {
            this.applySwimmingPose(c.rig, c.walkPhase, 0.85, elapsed);
          }
        } else {
          c.isSwimming = false;
          c.rig.torso.rotation.x = 0;
          c.y = cGroundY;
          c.walkPhase += (movedDist / 1.68) * Math.PI * 2;
          if (updateRigKinematics) {
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
              dt
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
      const dLocalZ = -0.72;
      const dLocalY = 0.62;
      const sinP = Math.sin(ch.pitch);
      const cosP = Math.cos(ch.pitch);
      const tiltedZ = -dLocalY * sinP + dLocalZ * cosP;
      const tiltedY = dLocalY * cosP + dLocalZ * sinP;
      this.playerX = ch.x + Math.sin(ch.yaw) * tiltedZ;
      this.playerZ = ch.z + Math.cos(ch.yaw) * tiltedZ;
      this.playerY = ch.y + tiltedY;
      this.ramRig.root.rotation.order = 'YXZ';
      this.ramRig.root.rotation.x = -ch.pitch;
    } else if (this.mountedAnimalIndex !== null) {
      const an = this.animals[this.mountedAnimalIndex];
      const seatY = an.elephantRig
        ? an.elephantRig.seatHeight
        : an.horseRig
        ? an.horseRig.seatHeight
        : 0.88;
      const seatZ = an.kind === 'ELEPHANT' ? 0.18 : -0.02;
      this.playerX = an.x + Math.sin(an.yaw) * seatZ;
      this.playerZ = an.z + Math.cos(an.yaw) * seatZ;
      this.playerY = an.y + seatY;
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

    // Attach Reins Dynamically from Bridle Bits into Lord Ram's Hands on BOTH Chariots and Mounted Royal Horses
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

        if (!isDrawingBow && this.ramRig.leftHandAnchor && this.ramRig.rightHandAnchor) {
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

    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.rig.root.position.set(e.x, e.y, e.z);
      e.rig.root.rotation.y = e.yaw;
    }
    for (const c of this.citizens) {
      c.rig.root.position.set(c.x, c.y, c.z);
      c.rig.root.rotation.y = c.yaw;
    }

    // 9. Update Mission Beacon & Dynamic Night Street Lamps / Torches Pool
    const activeMission = MISSIONS[this.missionIdx];
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

    this.combatLight.intensity = THREE.MathUtils.damp(
      this.combatLight.intensity,
      0,
      9.0,
      dt
    );
    this.updateDynamicHeroLighting(this.camYaw);
    this.updateNightLampsPool(elapsed);

    // 10. Smooth Third-Person Camera Damping + Unrestricted Vertical Orbit, Zoom & Indoor Ceiling Bounds
    let lookTargetX = this.playerX;
    let lookTargetY = this.playerY + 1.65;
    let lookTargetZ = this.playerZ;

    if (this.mountedChariotIndex !== null) {
      const ch = this.chariots[this.mountedChariotIndex];
      lookTargetX = ch.x + Math.sin(ch.yaw) * 1.1;
      lookTargetY = ch.y + 1.8;
      lookTargetZ = ch.z + Math.cos(ch.yaw) * 1.1;

      if (this.cameraManualHold <= 0) {
        const targetBehindYaw = ch.yaw + Math.PI;
        let diff = targetBehindYaw - this.camYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const alignLambda = this.camChariotLockTimer > 0 ? 11.5 : 6.8;
        this.camYaw += diff * (1 - Math.exp(-alignLambda * dt));
      }
    } else if (this.mountedAnimalIndex !== null) {
      const an = this.animals[this.mountedAnimalIndex];
      lookTargetX = an.x + Math.sin(an.yaw) * 0.5;
      lookTargetY = an.y + (an.kind === 'ELEPHANT' ? 3.2 : 1.9);
      lookTargetZ = an.z + Math.cos(an.yaw) * 0.5;

      if (this.cameraManualHold <= 0 && Math.abs(an.speed) > 0.6) {
        const targetBehindYaw = an.yaw + Math.PI;
        let diff = targetBehindYaw - this.camYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.camYaw += diff * (1 - Math.exp(-4.5 * dt));
      }
    } else if (!this.seatedOnThrone && mag > 0.12 && this.cameraManualHold <= 0) {
      const targetBehindYaw = this.playerYaw + Math.PI;
      let diff = targetBehindYaw - this.camYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const forwardWeight = my >= -0.35 ? 1.0 : 0.25;
      const trackLambda = (1.8 + 1.8 * Math.max(0, my)) * mag * forwardWeight;
      this.camYaw += diff * (1 - Math.exp(-trackLambda * dt));
    }

    const isMounted = this.mountedChariotIndex !== null || this.mountedAnimalIndex !== null;
    const camDist = isMounted ? this.camDistanceChariot : this.camDistanceFoot;
    const horizDist = camDist * Math.cos(this.camPitch);
    const vertHeight = 1.65 + camDist * Math.sin(this.camPitch);

    const desiredCamX = this.playerX + Math.sin(this.camYaw) * horizDist;
    const desiredCamZ = this.playerZ + Math.cos(this.camYaw) * horizDist;
    let desiredCamY = this.playerY + vertHeight;

    // Floor Clearance & Wall Clipping along LookTarget -> DesiredCamera
    const minGroundClearance = 0.45;
    for (let s = 1; s <= 4; s++) {
      const t = s / 4;
      const sx = lookTargetX + (desiredCamX - lookTargetX) * t;
      const sz = lookTargetZ + (desiredCamZ - lookTargetZ) * t;
      const sy = this.surfaceHeightAt(sx, sz, this.playerY) + minGroundClearance;
      if (desiredCamY < sy) desiredCamY = sy;
    }
    this.clipCameraAgainstStaticColliders(
      lookTargetX,
      lookTargetY,
      lookTargetZ,
      desiredCamX,
      desiredCamY,
      desiredCamZ
    );

    _camDesired.set(_camClipResult.x, _camClipResult.y, _camClipResult.z);
    _camTarget.set(lookTargetX, lookTargetY, lookTargetZ);

    const dampAlpha = 1 - Math.exp(-10 * dt);
    this.camSmoothPos.lerp(_camDesired, dampAlpha);
    this.camSmoothLook.lerp(_camTarget, dampAlpha);
    const camFloor = this.surfaceHeightAt(this.camSmoothPos.x, this.camSmoothPos.z, this.playerY) + 0.42;
    if (this.camSmoothPos.y < camFloor) {
      this.camSmoothPos.y = camFloor;
    }
    const postCeil = this.indoorCeilingLimitAt(this.playerX, this.playerY, this.playerZ);
    if (postCeil !== null && this.camSmoothPos.y > postCeil) {
      this.camSmoothPos.y = Math.max(camFloor, postCeil);
    }

    this.updateRoofOcclusion(this.camSmoothPos.x, this.camSmoothPos.y, this.camSmoothPos.z);
    this.camera.position.copy(this.camSmoothPos);
    this.camera.lookAt(this.camSmoothLook);

    // Update Underwater Post-Processing Volume based on exact camera submergence below Sarayu / Stepwell surface
    this.updateUnderwaterPostProcessing(elapsed);
  }

  private inflictDamageToPlayer(hpDmg: number, pranaDrain: number): void {
    this.hp = Math.max(0, this.hp - hpDmg);
    if (pranaDrain > 0) {
      this.prana = Math.max(0, this.prana - pranaDrain);
    }
    soundEngine.playHit();
    if (this.hp <= 0) {
      this.clearInputs();
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
    if (this.mode === 'PLAYING' && this.playerX < DEMON_ZONE_MIN_X - 750) {
      return;
    }
    if (this.volcanicBombMesh && this.volcanoCraters.length > 0) {
      for (let i = 0; i < this.volcanicBombs.length; i++) {
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

    if (this.volcanicSmokeMesh) {
      for (let i = 0; i < this.volcanicSmokePuffs.length; i++) {
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
    // Skip updates when far inside Demon Badlands well beyond horizon fog of Sarayu River (x=128) & Stepwell (x=-128)
    if (this.playerX > 850) {
      return;
    }
    // 1. 5 Dynamically Emerging Giant Turtles swimming down & surfacing
    for (let i = 0; i < this.riverTurtles.length; i++) {
      const t = this.riverTurtles[i];
      t.z += (i % 2 === 0 ? 1 : -1) * 1.15 * dt;
      if (t.z > 165) t.z = -165;
      if (t.z < -165) t.z = 165;

      const wave = Math.sin(elapsed * 0.55 + t.phase); // +1 = emerged at surface, -1 = diving deep
      const y = THREE.MathUtils.lerp(RIVER_SURFACE_Y - 2.9, RIVER_SURFACE_Y - 0.06, (wave + 1) * 0.5);
      const rc = riverCenterX(t.z);
      t.root.position.set(rc + t.xOff, y, t.z);
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
      c.root.position.set(
        riverCenterX(c.z) + c.xOff,
        RIVER_SURFACE_Y - 0.16 + Math.sin(elapsed * 1.4 + c.phase) * 0.05,
        c.z
      );
      c.root.rotation.y = c.speed >= 0 ? 0 : Math.PI;
      c.tailPivot.rotation.y = Math.sin(elapsed * 4.5 + c.phase) * 0.32;
    }

    // 3. Bioluminescent Jellyfish pulsing gently in the 20-ft deep river column
    for (let i = 0; i < this.riverJellyfish.length; i++) {
      const jf = this.riverJellyfish[i];
      const pulse = Math.sin(elapsed * 2.6 + jf.phase);
      jf.root.position.set(
        riverCenterX(jf.z) + jf.xOff + Math.sin(elapsed * 0.8 + jf.phase) * 0.65,
        jf.baseY + pulse * 0.38,
        jf.z
      );
      jf.bell.scale.set(1 - pulse * 0.12, 1 + pulse * 0.15, 1 - pulse * 0.12);
    }

    // 4. River Dolphins swimming & executing clear surface leaps
    for (let i = 0; i < this.riverDolphins.length; i++) {
      const d = this.riverDolphins[i];
      d.z += 5.4 * dt;
      if (d.z > 160) d.z = -160;
      const leapCycle = (elapsed * 0.72 + d.phase) % (Math.PI * 2);
      const isLeaping = leapCycle < Math.PI;
      const y = isLeaping
        ? RIVER_SURFACE_Y + Math.sin(leapCycle) * 1.95 - 0.15
        : RIVER_SURFACE_Y - 1.5 - Math.sin(leapCycle - Math.PI) * 1.1;
      const pitch = isLeaping
        ? -Math.cos(leapCycle) * 0.65
        : Math.cos(leapCycle - Math.PI) * 0.32;
      d.root.position.set(riverCenterX(d.z) + d.xOff, y, d.z);
      d.root.rotation.set(pitch, 0, 0);
      d.tailPivot.rotation.x = Math.sin(elapsed * 9.0 + d.phase) * 0.38;
    }

    // 5. Pelagic Sharks patrolling deep water
    for (let i = 0; i < this.riverSharks.length; i++) {
      const s = this.riverSharks[i];
      s.z += s.speed * dt;
      if (s.z > 168) s.z = -168;
      if (s.z < -168) s.z = 168;
      s.root.position.set(
        riverCenterX(s.z) + s.xOff + Math.sin(elapsed * 0.9 + s.phase) * 1.2,
        s.baseY,
        s.z
      );
      s.root.rotation.y = s.speed >= 0 ? 0 : Math.PI;
      s.tailPivot.rotation.y = Math.sin(elapsed * 6.2 + s.phase) * 0.35;
    }

    // 6. 240 Dense Schooling Fish in the 20-ft River
    if (this.riverFishMesh && this.riverFishAgents.length > 0) {
      for (let i = 0; i < this.riverFishAgents.length; i++) {
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

    // 7. Surya-Kund Stepwell Koi Minnows & Small Pond Terrapins
    if (this.stepwellKoiMesh && this.stepwellKoiAgents.length > 0) {
      for (let i = 0; i < this.stepwellKoiAgents.length; i++) {
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
      st.root.position.set(sx, -0.56 + Math.sin(elapsed * 1.4 + st.phase) * 0.04, sz);
      st.root.rotation.y = Math.atan2(-Math.sin(st.angle), Math.cos(st.angle));
      st.headGroup.rotation.x = Math.sin(elapsed * 2.5 + st.phase) * 0.12;
      for (let f = 0; f < st.flippers.length; f++) {
        st.flippers[f].rotation.z = (f % 2 === 0 ? 1 : -1) * Math.sin(elapsed * 4.2 + st.phase + f) * 0.25;
      }
    }
  }

  private updateNightLampsPool(elapsed: number): void {
    // At night, designated Street Lamps & Torches illuminate the dark streets/palace halls via 8 pooled warm PointLights
    const nightGlow = THREE.MathUtils.smoothstep(this.nightFactor, 0.12, 0.72);
    if (this.lampBulbMat) {
      this.lampBulbMat.emissiveIntensity = THREE.MathUtils.lerp(0.35, 3.2, nightGlow);
    }
    const maxLamps = this.nightLampLights.length;
    if (nightGlow <= 0.01 || this.torchFlameAnchors.length === 0 || maxLamps === 0) {
      for (let i = 0; i < maxLamps; i++) {
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

      if (bestCount < maxLamps) {
        let pos = bestCount;
        while (pos > 0 && _topLampDistSq[pos - 1] > distSq) {
          _topLampDistSq[pos] = _topLampDistSq[pos - 1];
          _topLampIndices[pos] = _topLampIndices[pos - 1];
          pos--;
        }
        _topLampDistSq[pos] = distSq;
        _topLampIndices[pos] = i;
        bestCount++;
      } else if (distSq < _topLampDistSq[maxLamps - 1]) {
        let pos = maxLamps - 1;
        while (pos > 0 && _topLampDistSq[pos - 1] > distSq) {
          _topLampDistSq[pos] = _topLampDistSq[pos - 1];
          _topLampIndices[pos] = _topLampIndices[pos - 1];
          pos--;
        }
        _topLampDistSq[pos] = distSq;
        _topLampIndices[pos] = i;
      }
    }

    for (let i = 0; i < maxLamps; i++) {
      const light = this.nightLampLights[i];
      if (i >= bestCount) {
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
        this.torchShadowLight.position.set(anchor.x, anchor.y + 0.45, anchor.z);
        this.torchShadowLight.target.position.set(anchor.x, anchor.y - 4.0, anchor.z + 0.25);
        this.torchShadowLight.intensity = 16.0 * nightGlow * flicker * distFade;
        this.torchShadowLight.castShadow = !this.isSoftwareGl;
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

    if (this.underwaterPass) {
      this.underwaterPass.uniforms.uSubmerged.value = this.cameraSubmerged;
      this.underwaterPass.uniforms.uDepthFactor.value = this.cameraSubDepthFactor;
      this.underwaterPass.uniforms.uTime.value = elapsed;
      this.underwaterPass.uniforms.uDaylight.value = this.daylightFactor;
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
      const fog = this.scene.fog as THREE.FogExp2 | null;
      const bg = this.scene.background as THREE.Color | null;
      _tmpUnderCol.copy(_colUnderNight).lerp(_colUnderDay, this.daylightFactor);
      if (bg) bg.lerp(_tmpUnderCol, this.cameraSubmerged);
      if (fog) {
        fog.color.lerp(_tmpUnderCol, this.cameraSubmerged);
        fog.density = THREE.MathUtils.lerp(fog.density, 0.072, this.cameraSubmerged);
      }
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
        this.playerX + _sunDir.x * 560,
        _sunDir.y * 560,
        this.playerZ + _sunDir.z * 560
      );
      this.sunDisc.visible = sunElev > -0.1;
      const sunMat = this.sunDisc.material as THREE.MeshBasicMaterial;
      sunMat.color.copy(_colKeyDay).lerp(_colKeySunset, twilight);
    }

    if (this.moonGroup) {
      this.moonGroup.position.set(
        this.playerX + _moonDir.x * 520,
        _moonDir.y * 520,
        this.playerZ + _moonDir.z * 520
      );
      this.moonGroup.visible = _moonDir.y > -0.12;
      if (this.moonHaloSprite) {
        (this.moonHaloSprite.material as THREE.SpriteMaterial).opacity =
          0.35 + 0.55 * moonStrength;
      }
    }

    if (this.starUniforms) {
      this.starUniforms.uOpacity.value = THREE.MathUtils.smoothstep(this.nightFactor, 0.18, 0.78);
    }
    if (this.fireflyUniforms) {
      this.fireflyUniforms.uOpacity.value = THREE.MathUtils.smoothstep(this.nightFactor, 0.2, 0.72);
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

    _tmpMist.copy(_colMist).lerp(_colSunset, twilight * 0.65).lerp(_colNightMist, this.nightFactor).lerp(_colAsh, ashT);
    const bg = this.scene.background as THREE.Color;
    if (bg) bg.copy(_tmpMist);

    const fog = this.scene.fog as THREE.FogExp2 | null;
    if (fog) {
      fog.color.copy(_tmpMist);
      fog.density = THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(0.0044, 0.0032, this.nightFactor),
        0.0112,
        ashT
      );
    }

    // Strictly scale daytime IBL at night while keeping moon/star/lamp/bounce GI physical
    this.scene.environmentIntensity = THREE.MathUtils.lerp(1.15, 0.08, this.nightFactor);

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
    this.bounceLight.intensity = THREE.MathUtils.lerp(0.54, 0.1, this.nightFactor);

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
    this.giLightProbe.intensity = THREE.MathUtils.lerp(0.72, 0.24, this.nightFactor);

    this.hemiLight.color
      .copy(_colHemiDay)
      .lerp(_colHemiNight, this.nightFactor)
      .lerp(_colHemiAsh, ashT);
    this.hemiLight.groundColor
      .copy(_tmpBounce)
      .lerp(_colGroundNight, this.nightFactor * 0.65);
    this.hemiLight.intensity =
      THREE.MathUtils.lerp(0.78, 0.14, this.nightFactor) * THREE.MathUtils.lerp(1.0, 0.72, ashT);

    this.rimLight.color.setHex(0xc8dcf8).lerp(_colKeyMoon, this.nightFactor);
    this.rimLight.intensity = THREE.MathUtils.lerp(0.9, 0.16, this.nightFactor);

    if (sunStrength >= moonStrength) {
      this.keyLight.position.set(
        this.playerX + _sunDir.x * 72,
        this.playerY + Math.max(8, _sunDir.y * 72),
        this.playerZ + _sunDir.z * 72
      );
      this.keyLight.target.position.set(this.playerX, this.playerY, this.playerZ);
      this.keyLight.color.copy(_colKeyDay).lerp(_colKeySunset, twilight * 0.78).lerp(_colKeyAsh, ashT);
      this.keyLight.intensity = THREE.MathUtils.lerp(2.25, 1.38, ashT) * sunStrength;
    } else {
      this.keyLight.position.set(
        this.playerX + _moonDir.x * 72,
        this.playerY + Math.max(8, _moonDir.y * 72),
        this.playerZ + _moonDir.z * 72
      );
      this.keyLight.target.position.set(this.playerX, this.playerY, this.playerZ);
      this.keyLight.color.copy(_colKeyMoon).lerp(_colKeyAsh, ashT * 0.5);
      this.keyLight.intensity = 0.56 * moonStrength;
    }
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

    const blips: RadarBlip[] = [];
    for (let i = 0; i < this.chariots.length; i++) {
      const c = this.chariots[i];
      blips.push({ id: c.id, kind: 'RATHA', x: c.x, z: c.z });
    }
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.alive) {
        blips.push({
          id: e.id,
          kind: e.isCommander ? 'COMMANDER' : 'ENEMY',
          x: e.x,
          z: e.z,
        });
      }
    }
    if (activeMission) {
      blips.push({
        id: activeMission.id,
        kind: 'WAYPOINT',
        x: activeMission.waypoint.x,
        z: activeMission.waypoint.z,
      });
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

    let promptHint: string | null = null;
    if (this.seatedOnThrone) {
      promptHint = 'Seated on the Royal Simhasana — E or Move to Rise · Drag to Orbit View';
    } else if (mountKind !== 'NONE') {
      const mLabel =
        mountKind === 'ELEPHANT'
          ? 'Sacred Elephant'
          : mountKind === 'HORSE'
          ? 'Royal Ashva'
          : 'Royal Ratha';
      if (this.autoDriveActive) {
        promptHint = `${mLabel} Auto-Drive on Paved Road — V: Manual · Shift: Gallop · E: Dismount`;
      } else {
        promptHint = this.stealthActive
          ? this.stealthSpotted
            ? 'Spotted in Stealth! Break line of sight · E to dismount'
            : `Stealth ${mLabel} — C: Reveal · V: Auto-Drive · E: Dismount`
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
      promptHint = `${nearMount.label} nearby — Press E or tap Mount`;
    }

    this.callbacks.onHudUpdate({
      hp: Math.round(this.hp),
      maxHp: this.maxHp,
      prana: Math.round(this.prana),
      maxPrana: this.maxPrana,
      karma: this.karma,
      wantedLevel: this.wantedLevel,
      inChariot: mountKind === 'RATHA',
      nearChariot: nearMount?.kind === 'RATHA',
      mountKind,
      nearMountLabel: nearMount ? nearMount.label : null,
      nearThrone,
      onThrone: this.seatedOnThrone,
      autoDriveActive: this.autoDriveActive,
      chariotSpeedKmh: mountSpeedKmh,
      stealthActive: this.stealthActive,
      stealthSpotted: this.stealthSpotted,
      chakraCooldown: Number(this.chakraCooldown.toFixed(1)),
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
      ascensionElapsed: Number(this.ascensionElapsed.toFixed(1)),
      courtSeatedCount: councilSeated,
      courtTotalCount: councilTotal,
      promptHint,
      blips,
      webglError: this.webglError,
    });
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
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
      const dt = Math.min(0.05, this.clock.getDelta());
      const elapsed = this.clock.elapsedTime;

      if (this.mode === 'PLAYING') {
        this.stepSimulation(dt, elapsed);
        this.hudEmitAccum += dt;
        if (this.hudEmitAccum >= 0.08) {
          this.hudEmitAccum = 0;
          this.emitHud();
        }
      } else if (this.mode === 'TITLE') {
        // Gentle scenic orbit around Lord Ram at Ayodhya Plaza with ambient breeze hair physics & background day-night/volcanic eruptions
        this.stepVolcanicAtmosphere(dt);
        this.updateAtmosphericMood();
        this.updateNightLampsPool(elapsed);
        const orbitYaw = elapsed * 0.16;
        this.playerHorizSpeed = 0;
        this.playerTurnRate = 0;
        this.updateHairAndCapePhysics(dt, elapsed);
        this.updateDynamicHeroLighting(orbitYaw);
        _v2.set(
          this.playerX + Math.sin(orbitYaw) * 7.8,
          this.playerY + 3.4,
          this.playerZ + Math.cos(orbitYaw) * 7.8
        );
        this.camera.position.copy(_v2);
        this.camera.lookAt(this.playerX, this.playerY + 1.65, this.playerZ);
        this.updateUnderwaterPostProcessing(elapsed);
      }

      // Incremental micro-budgeted background preloading of standby rigs (zero frame drops)
      this.poolManager.stepPrewarm(this.isSoftwareGl ? 0.6 : 1.5);

      if (this.composer && this.cameraSubmerged > 0.004) {
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
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const nativePixelRatio = this.isSoftwareGl
      ? 1
      : Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(nativePixelRatio);
    this.renderer.setSize(width, height);
    this.composer?.setPixelRatio(nativePixelRatio);
    this.composer?.setSize(width, height);
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    this.poolManager.dispose();
    this.stealthMaterialCache.clear();
    this.composer?.dispose();
    this.textures.dispose();
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
