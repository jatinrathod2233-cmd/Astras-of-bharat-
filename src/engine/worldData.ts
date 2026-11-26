import { DistrictId, MissionDef } from '../types/world';

export const RIVER_CENTER_X = 46;
export const RIVER_HALF_WIDTH = 14.5;
export const RIVER_SURFACE_Y = -0.62;
export const RIVER_TWENTY_FEET_DEPTH_M = 6.12; // 20 feet = 6.096 m -> channel bed at -6.75 m
export const BRIDGE_Z_LIST = [0, -56];
export const BRIDGE_HALF_WIDTH = 6.2;

// Exact 2.5 km (2,500 meters) open-world separation between Ayodhya (0,0) and Volcanic Demon Village (2500, 0)
export const AYODHYA_CENTER_X = 0;
export const AYODHYA_CENTER_Z = 0;
export const AYODHYA_SAFE_MAX_X = 420;
export const DEMON_ZONE_MIN_X = 2050;
export const DEMON_VILLAGE_CENTER_X = 2500;
export const DEMON_VILLAGE_CENTER_Z = 0;

export const WORLD_BOUNDS = {
  minX: -620,
  maxX: 3060,
  minZ: -1020,
  maxZ: 420,
};

// Spatial layout of Lord Ram's Seven-Story Royal Palace Complex (all strictly non-overlapping on West Ayodhya plains)
export const SABHA_HALL_POS = { x: 0, z: -76 };
export const THRONE_POS = { x: 0, z: -82 };
export const PALACE_CORE_POS = { x: 0, z: -112 };
export const SERVANT_QUARTERS_POS = { x: 26, z: -104 };
export const TRAINING_GROUND_POS = { x: -35, z: -75 };
export const HATHI_STABLE_POS = { x: -36, z: -108 };
export const ASHVA_STABLE_POS = { x: -14, z: -140 };
export const STEPWELL_POS = { x: -30, z: -28 };

export interface PalaceStorySpec {
  story: number; // 1..7
  floorY: number;
  clearHeight: number;
  w: number;
  d: number;
}

// Single source of truth for the walkable 7-story Palace & Gold-Detailed Staircase system
export const PALACE_STORIES: PalaceStorySpec[] = [
  { story: 1, floorY: 0.42, clearHeight: 5.0, w: 34.0, d: 28.0 },
  { story: 2, floorY: 5.42, clearHeight: 4.8, w: 29.0, d: 24.0 },
  { story: 3, floorY: 10.22, clearHeight: 4.6, w: 24.5, d: 20.5 },
  { story: 4, floorY: 14.82, clearHeight: 4.4, w: 20.5, d: 17.5 },
  { story: 5, floorY: 19.22, clearHeight: 4.2, w: 16.5, d: 14.5 },
  { story: 6, floorY: 23.42, clearHeight: 4.0, w: 12.8, d: 11.5 },
  { story: 7, floorY: 27.42, clearHeight: 4.0, w: 9.6, d: 9.0 },
];

export interface PalaceStairSpec {
  fromStory: number;
  toStory: number;
  xCenter: number; // world X center of stair flight
  halfW: number;
  zStart: number; // bottom landing world Z (higher Z, South)
  zEnd: number;   // top landing world Z (lower Z, North)
  yStart: number;
  yEnd: number;
}

export const PALACE_STAIRS: PalaceStairSpec[] = PALACE_STORIES.slice(0, 6).map((st, idx) => {
  const next = PALACE_STORIES[idx + 1];
  const sideSign = idx % 2 === 0 ? 1 : -1;
  // Place stair flight cleanly inside the front-flank gallery of the upper story so upper floor opening aligns
  const xCenter = PALACE_CORE_POS.x + sideSign * (next.w * 0.5 - 1.9);
  const zStart = PALACE_CORE_POS.z + (next.d * 0.5 - 0.6);
  const zEnd = PALACE_CORE_POS.z + (next.d * 0.5 - 6.8);
  return {
    fromStory: st.story,
    toStory: next.story,
    xCenter,
    halfW: 1.35,
    zStart,
    zEnd,
    yStart: st.floorY,
    yEnd: next.floorY,
  };
});

export interface BoxCollider {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  height: number;
  rotY?: number;
  baseY?: number;
  isStairStep?: boolean;
  isStairRamp?: boolean;
  stairZStart?: number;
  stairZEnd?: number;
  stairYStart?: number;
  stairYEnd?: number;
}

export interface CircleCollider {
  x: number;
  z: number;
  radius: number;
  height: number;
  baseY?: number;
}

export const MISSIONS: MissionDef[] = [
  {
    id: 'mission_sabha',
    title: 'Ascend the Royal Simhasana',
    giver: 'Rajguru Vasishtha',
    district: 'ROYAL_PALACE',
    description:
      'Enter the grand Rajya Sabha of the 7-story palace and ascend the throne to summon your ministers, commanders, and spies.',
    targetCount: 1,
    waypoint: { x: THRONE_POS.x, z: THRONE_POS.z },
    rewardKarma: 150,
  },
  {
    id: 'mission_frontier',
    title: 'Clear the Eastern Demon Vanguard',
    giver: 'Commander Sumantra',
    district: 'RAKSHASA_OUTPOST',
    description:
      'Ride east across the 2.5 km Royal Highway beyond the Sarayu frontier and defeat the Demon Vanguard.',
    targetCount: 4,
    waypoint: { x: 2220, z: 0 },
    rewardKarma: 250,
  },
  {
    id: 'mission_outpost',
    title: 'Break the Obsidian Bastion',
    giver: 'Ayodhya War Council',
    district: 'RAKSHASA_OUTPOST',
    description:
      'Push deeper into the ash wasteland and dismantle the cursed sorcerer and brute defenders.',
    targetCount: 5,
    waypoint: { x: 2370, z: 0 },
    rewardKarma: 300,
  },
  {
    id: 'mission_commander',
    title: 'Purge the 2.5 km Volcanic Demon Village',
    giver: 'Royal War Council',
    district: 'RAKSHASA_OUTPOST',
    description:
      'Confront Commander Viradha and purge all five demon clans inside the Volcanic Demon Village 2.5 km from Ayodhya.',
    targetCount: 6,
    waypoint: { x: DEMON_VILLAGE_CENTER_X, z: DEMON_VILLAGE_CENTER_Z },
    rewardKarma: 500,
  },
];

export const BRIDGE_HALF_SPAN = RIVER_HALF_WIDTH + 3.0; // 17.5m each side of river center

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Natural meandering Sarayu River centerline crossing cleanly beneath both bridges (z = 0 and z = -56).
 */
export function riverCenterX(z: number): number {
  return (
    RIVER_CENTER_X +
    Math.sin((z * Math.PI) / 56) * 6.8 +
    Math.sin((z * Math.PI) / 28) * 2.1
  );
}

export function riverHalfWidth(z: number): number {
  const bridgeFactor = BRIDGE_Z_LIST.reduce((acc, bz) => {
    const w = 1 - smoothstep(4.5, 16.0, Math.abs(z - bz));
    return Math.max(acc, w);
  }, 0);
  const naturalVariation =
    Math.sin(z * 0.065 + 0.7) * 2.2 + Math.cos(z * 0.032) * 1.4;
  return RIVER_HALF_WIDTH + naturalVariation * (1 - bridgeFactor * 0.92);
}

export function bridgeArchHeight(x: number): number {
  const dx = Math.abs(x - RIVER_CENTER_X);
  if (dx >= BRIDGE_HALF_SPAN) return 0;
  const t = 1 - dx / BRIDGE_HALF_SPAN;
  return 1.28 * (0.5 - 0.5 * Math.cos(t * Math.PI));
}

export function isOnBridge(x: number, z: number): boolean {
  if (Math.abs(x - RIVER_CENTER_X) > BRIDGE_HALF_SPAN) return false;
  return BRIDGE_Z_LIST.some((bz) => Math.abs(z - bz) <= BRIDGE_HALF_WIDTH);
}

export function isInRiverWater(x: number, z: number): boolean {
  if (z < -208) return false;
  if (isOnBridge(x, z)) return false;
  return Math.abs(x - riverCenterX(z)) < riverHalfWidth(z);
}

export function isInsideStepwellBasin(x: number, z: number): boolean {
  const dx = Math.abs(x - STEPWELL_POS.x);
  const dz = Math.abs(z - STEPWELL_POS.z);
  return Math.max(dx, dz) < 9.2;
}

export function waterSurfaceAt(x: number, z: number): number | null {
  if (isInRiverWater(x, z)) return RIVER_SURFACE_Y;
  if (isInsideStepwellBasin(x, z)) return -0.52;
  return null;
}

export function getPalaceStairHole(storyIdx: number): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} | null {
  if (storyIdx <= 0 || storyIdx > PALACE_STAIRS.length) return null;
  const arrivingStair = PALACE_STAIRS[storyIdx - 1];
  return {
    minX: arrivingStair.xCenter - PALACE_CORE_POS.x - arrivingStair.halfW - 0.22,
    maxX: arrivingStair.xCenter - PALACE_CORE_POS.x + arrivingStair.halfW + 0.22,
    minZ: arrivingStair.zEnd - PALACE_CORE_POS.z - 0.28,
    maxZ: arrivingStair.zStart - PALACE_CORE_POS.z + 0.28,
  };
}

/**
 * Returns palace story index (0..6) when point lies inside the enclosed room core
 * or enclosed balcony alcoves of that story (for roof occlusion & camera bounds).
 */
export function palaceStoryAt(x: number, y: number, z: number): number | null {
  const lx = x - PALACE_CORE_POS.x;
  const lz = z - PALACE_CORE_POS.z;
  for (let i = PALACE_STORIES.length - 1; i >= 0; i--) {
    const st = PALACE_STORIES[i];
    if (y < st.floorY - 0.45 || y > st.floorY + st.clearHeight + 0.15) continue;
    const hw = st.w * 0.5;
    const hd = st.d * 0.5;
    const insideCore = Math.abs(lx) <= hw && Math.abs(lz) <= hd;
    const balcSpan = Math.min(6.4, st.w * 0.36) * 0.5;
    const inNorthBalc = Math.abs(lx) <= balcSpan && lz <= -hd && lz >= -hd - 2.1;
    const inSouthBalc = i > 0 && Math.abs(lx) <= balcSpan && lz >= hd && lz <= hd + 2.1;
    const sideBalcSpan = Math.min(4.8, st.d * 0.28) * 0.5;
    const inSideBalc =
      i <= 3 &&
      Math.abs(lz) <= sideBalcSpan &&
      Math.abs(lx) >= hw &&
      Math.abs(lx) <= hw + 1.6;
    if (insideCore || inNorthBalc || inSouthBalc || inSideBalc) {
      return i;
    }
  }
  return null;
}

/**
 * Exact elevation of the walkable 7-story palace floors & gold-detailed staircases relative to entity refY.
 * Enforces strict step-height continuity so walking under/beside a flight never teleports vertically.
 */
export function palaceFloorHeightAt(x: number, z: number, refY: number): number | null {
  // 1. Check active Gold-Detailed Stair Flights matching entity vertical proximity
  let bestStairY: number | null = null;
  for (let i = 0; i < PALACE_STAIRS.length; i++) {
    const st = PALACE_STAIRS[i];
    if (
      Math.abs(x - st.xCenter) <= st.halfW + 0.32 &&
      z <= st.zStart + 0.85 &&
      z >= st.zEnd - 0.85
    ) {
      const t = Math.max(0, Math.min(1, (st.zStart - z) / (st.zStart - st.zEnd)));
      const stairY = st.yStart + (st.yEnd - st.yStart) * t;
      // Only snap to stair tread when entity is actually adjacent in elevation (no under-stair teleportation)
      if (
        refY >= st.yStart - 0.85 &&
        refY <= st.yEnd + 1.05 &&
        stairY <= refY + 1.15 &&
        stairY >= refY - 1.65
      ) {
        if (bestStairY === null || Math.abs(stairY - refY) < Math.abs(bestStairY - refY)) {
          bestStairY = stairY;
        }
      }
    }
  }
  if (bestStairY !== null) {
    return bestStairY;
  }

  // 2. Check highest reachable Palace Story floor slab OR enclosed cantilevered balcony deck <= refY + 0.95
  // Exclude upper stairwell opening hole so walking up stairs doesn't prematurely snap upward mid-flight
  let bestFloor: number | null = null;
  const lx = x - PALACE_CORE_POS.x;
  const lz = z - PALACE_CORE_POS.z;

  for (let i = 0; i < PALACE_STORIES.length; i++) {
    const story = PALACE_STORIES[i];
    if (story.floorY > refY + 0.95) continue;
    const hw = story.w * 0.5;
    const hd = story.d * 0.5;

    const hole = getPalaceStairHole(i);
    const inStairHole =
      hole !== null &&
      lx >= hole.minX &&
      lx <= hole.maxX &&
      lz >= hole.minZ &&
      lz <= hole.maxZ;

    const insideCore = Math.abs(lx) <= hw && Math.abs(lz) <= hd && !inStairHole;
    const balcSpan = Math.min(6.4, story.w * 0.36) * 0.5;
    const onNorthBalcony = Math.abs(lx) <= balcSpan - 0.2 && lz <= -hd && lz >= -hd - 1.9;
    const onSouthBalcony = i > 0 && Math.abs(lx) <= balcSpan - 0.2 && lz >= hd && lz <= hd + 1.9;
    const sideBalcSpan = Math.min(4.8, story.d * 0.28) * 0.5;
    const onEastWestBalcony =
      i <= 3 &&
      Math.abs(lz) <= sideBalcSpan - 0.2 &&
      Math.abs(lx) >= hw &&
      Math.abs(lx) <= hw + 1.42;

    if (insideCore || onNorthBalcony || onSouthBalcony || onEastWestBalcony) {
      bestFloor = story.floorY;
    }
  }

  // Smooth southern walkway bridge connecting Sabha Hall (z = -76) cleanly into 7-story Palace Story 1 (z = -98)
  if (
    Math.abs(x - PALACE_CORE_POS.x) <= 7.2 &&
    z <= SABHA_HALL_POS.z - 10.5 &&
    z >= PALACE_CORE_POS.z + 13.8 &&
    refY <= 1.85
  ) {
    bestFloor = Math.max(bestFloor ?? 0, 0.42);
  }

  return bestFloor;
}

export function groundHeightAt(x: number, z: number): number {
  // 0. Monumental Stepwell (Surya-Kund) deep terraced excavation at (-30, -28)
  const swDx = Math.abs(x - STEPWELL_POS.x);
  const swDz = Math.abs(z - STEPWELL_POS.z);
  const swMax = Math.max(swDx, swDz);
  // Stepwell inner cavity stays within swMax < 9.0m so rim walls & chhatri pavilions sit firmly at y >= 0
  if (swMax < 9.0) {
    if (swMax <= 3.8) return -6.0;
    const t = Math.max(0, Math.min(1, (9.0 - swMax) / (9.0 - 3.8)));
    return -6.0 * t;
  }

  const distFromCenter = Math.hypot(x, z);

  // Smooth circular sanctuary pad around the colossal Mahadev shrine at (0, 0)
  const centerSanctuaryMask = smoothstep(13.5, 24.0, distFromCenter);

  // Ayodhya Palace & Royal Precinct flatness (x in [-64..38], z in [-162..70])
  const palacePrecinctX = smoothstep(58, 78, Math.abs(x + 12));
  const palacePrecinctZ = smoothstep(122, 146, Math.abs(z + 52));
  const inPalaceComplexMask = Math.max(palacePrecinctX, palacePrecinctZ);

  // Main 2.5 km Royal Highway corridor flatness (z = 0, x from -180 to 2480)
  const ewRoadMask =
    x > -200 && x < 2480 ? smoothstep(8.5, 18.0, Math.abs(z)) : 1;
  const nsRoadMask =
    z > -200 && z < 200 ? smoothstep(8.5, 17.5, Math.abs(x)) : 1;
  const northBridgeRoadMask =
    x > -160 && x < 160 ? smoothstep(8.5, 17.5, Math.abs(z + 56)) : 1;

  // Smooth courtyard pads under buildings & Demon Village structures
  let buildingPadMask = 1;
  for (let i = 0; i < BUILDING_LOCATIONS.length; i++) {
    const b = BUILDING_LOCATIONS[i];
    const d = Math.hypot(x - b.x, z - b.z);
    if (d < 19) {
      buildingPadMask = Math.min(buildingPadMask, smoothstep(10.5, 18.5, d));
    }
  }
  for (let i = 0; i < DEMON_VILLAGE_STRUCTURES.length; i++) {
    const s = DEMON_VILLAGE_STRUCTURES[i];
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < 18) {
      buildingPadMask = Math.min(buildingPadMask, smoothstep(9.5, 17.5, d));
    }
  }

  // Volcanic basin flatness across the Demon Village clearing around (2500, 0)
  const demonPlazaDist = Math.hypot(
    x - DEMON_VILLAGE_CENTER_X,
    z - DEMON_VILLAGE_CENTER_Z
  );
  const demonPlazaMask = smoothstep(42, 74, demonPlazaDist);

  // Frontier outpost pads at (2220, 0) & (2370, 0)
  const frontierMask = Math.min(
    smoothstep(24, 42, Math.hypot(x - 2220, z)),
    smoothstep(24, 42, Math.hypot(x - 2370, z))
  );

  const roadFlatness = Math.min(
    centerSanctuaryMask,
    inPalaceComplexMask,
    ewRoadMask,
    nsRoadMask,
    northBridgeRoadMask,
    buildingPadMask,
    demonPlazaMask,
    frontierMask
  );

  // Rolling open plains + dramatic volcanic terrain ridges around x >= 2160
  const hillMask = smoothstep(34, 110, distFromCenter) * roadFlatness;
  const gentleWave =
    Math.sin(x * 0.036) * Math.cos(z * 0.036) * 2.15 +
    Math.sin((x + z) * 0.021) * 1.25 +
    Math.cos(x * 0.014 - z * 0.017) * 0.9;

  // High-fidelity volcanic ridge elevation in the 2.5 km Demon Badlands
  let volcanicLift = 0;
  if (x > 2160) {
    const ashBlend = smoothstep(2160, 2340, x) * roadFlatness;
    const ridgeNoise =
      Math.abs(Math.sin(x * 0.045 + z * 0.035)) * 4.2 +
      Math.cos(x * 0.08 - z * 0.06) * 1.6;
    volcanicLift += ridgeNoise * ashBlend;

    // Gradual volcanic apron rise around each volcano base so terrain seamlessly blends into volcano skirts
    for (let i = 0; i < DEMON_VOLCANOES.length; i++) {
      const v = DEMON_VOLCANOES[i];
      const dv = Math.hypot(x - v.x, z - v.z);
      if (dv < v.radius * 1.45) {
        const apron = 1 - smoothstep(v.radius * 0.65, v.radius * 1.45, dv);
        volcanicLift += apron * (v.height * 0.24);
      }
    }
  }

  // Colossal 7-Range Mountain Ecosystem behind the 7-story palace (z < -158)
  const mountainY = mountainHeightContributionAt(x, z);

  // Gentle organic elevation along dry riverbanks strictly ABOVE waterline (-0.62m)
  const rCenter = riverCenterX(z);
  const rHalfW = riverHalfWidth(z);
  const riverDist = Math.abs(x - rCenter);
  const riverNorthFade = smoothstep(-214, -186, z);
  const bankBerm =
    smoothstep(rHalfW + 0.6, rHalfW + 5.5, riverDist) *
    (1 - smoothstep(rHalfW + 5.5, rHalfW + 16.0, riverDist)) *
    (0.44 + 0.24 * Math.sin(z * 0.08 + x * 0.05)) *
    roadFlatness *
    riverNorthFade;

  const baseTerrainY = Math.max(-0.04, gentleWave * hillMask + bankBerm + volcanicLift + mountainY);

  // High-Fidelity Sarayu River Channel excavated strictly inside riverHalfWidth south of mountain headwaters (z >= -214)
  const bankMargin = rHalfW + 4.4;
  if (riverDist < bankMargin && z >= -214) {
    let minBridgeDz = Infinity;
    for (let i = 0; i < BRIDGE_Z_LIST.length; i++) {
      minBridgeDz = Math.min(minBridgeDz, Math.abs(z - BRIDGE_Z_LIST[i]));
    }

    if (
      minBridgeDz <= BRIDGE_HALF_WIDTH &&
      Math.abs(x - RIVER_CENTER_X) <= BRIDGE_HALF_SPAN
    ) {
      return bridgeArchHeight(x);
    }

    const bridgeSideBlend = smoothstep(
      BRIDGE_HALF_WIDTH,
      BRIDGE_HALF_WIDTH + 9.0,
      minBridgeDz
    );
    const approachFlat =
      Math.abs(x - RIVER_CENTER_X) <= BRIDGE_HALF_SPAN
        ? Math.max(0.0, baseTerrainY)
        : baseTerrainY;

    let channelProfileY: number;
    if (riverDist <= rHalfW) {
      // Smoothly slope from shallow water edge (-0.62m) down into deep 20-ft center trough (-6.75m)
      const u = riverDist / Math.max(1.0, rHalfW);
      const tRim = smoothstep(0.26, 1.0, u);
      channelProfileY = -6.75 * (1 - tRim) + (RIVER_SURFACE_Y - 0.02) * tRim;
    } else {
      // Dry bank rises cleanly from just above waterline (+0.08m above -0.62m) up into inland terrain
      const bankT = smoothstep(rHalfW, bankMargin, riverDist);
      const shoreFloorY = RIVER_SURFACE_Y + 0.14; // -0.48m at edge -> +0.02m+ inland
      channelProfileY =
        shoreFloorY * (1 - bankT) + Math.max(0.02, baseTerrainY) * bankT;
    }

    const riverBlend = approachFlat * (1 - bridgeSideBlend) + channelProfileY * bridgeSideBlend;
    return baseTerrainY * (1 - riverNorthFade) + riverBlend * riverNorthFade;
  }

  return baseTerrainY;
}

/**
 * Connected Paved-Path Road Graph for dynamic waypoint Auto-Drive across all mountable vehicles & animals.
 */
export interface PavedRoadSegment {
  id:
    | 'EW_HIGHWAY'
    | 'NS_AVENUE'
    | 'NORTH_BRIDGE'
    | 'STABLE_SPUR_ASHVA'
    | 'STABLE_SPUR_HATHI'
    | 'SERVANT_SPUR';
  axis: 'X' | 'Z';
  fixedCoord: number; // z for X-axis road, x for Z-axis road
  minSpan: number;
  maxSpan: number;
  halfWidth: number;
}

export const PAVED_ROADS: PavedRoadSegment[] = [
  { id: 'EW_HIGHWAY', axis: 'X', fixedCoord: 0, minSpan: -160, maxSpan: 2460, halfWidth: 4.4 },
  { id: 'NS_AVENUE', axis: 'Z', fixedCoord: 0, minSpan: -62, maxSpan: 124, halfWidth: 4.2 },
  { id: 'NORTH_BRIDGE', axis: 'X', fixedCoord: -56, minSpan: -140, maxSpan: 86, halfWidth: 4.2 },
  { id: 'STABLE_SPUR_ASHVA', axis: 'Z', fixedCoord: -14, minSpan: -130, maxSpan: -56, halfWidth: 3.6 },
  { id: 'STABLE_SPUR_HATHI', axis: 'Z', fixedCoord: -36, minSpan: -98, maxSpan: -56, halfWidth: 3.6 },
  { id: 'SERVANT_SPUR', axis: 'Z', fixedCoord: 18, minSpan: -104, maxSpan: -56, halfWidth: 3.4 },
];

export interface RoadGraphNode {
  id: string;
  x: number;
  z: number;
  neighbors: string[];
}

export const ROAD_GRAPH_NODES: RoadGraphNode[] = [
  { id: 'WEST_END', x: -156, z: 0, neighbors: ['RING_W'] },
  { id: 'RING_W', x: -16, z: 0, neighbors: ['WEST_END', 'RING_NW', 'RING_SW'] },
  { id: 'RING_NW', x: -11.2, z: -11.2, neighbors: ['RING_W', 'RING_N'] },
  { id: 'RING_N', x: 0, z: -15.5, neighbors: ['RING_NW', 'RING_NE', 'NORTH_JX'] },
  { id: 'RING_NE', x: 11.2, z: -10.8, neighbors: ['RING_N', 'RING_E'] },
  { id: 'RING_E', x: 16, z: 0, neighbors: ['RING_NE', 'RING_SE', 'BRIDGE_S'] },
  { id: 'RING_SE', x: 11.2, z: 11.2, neighbors: ['RING_E', 'RING_S'] },
  { id: 'RING_S', x: 0, z: 15.5, neighbors: ['RING_SW', 'RING_SE', 'SOUTH_END'] },
  { id: 'RING_SW', x: -11.2, z: 11.2, neighbors: ['RING_S', 'RING_W'] },
  { id: 'SOUTH_END', x: 0, z: 120, neighbors: ['RING_S'] },
  { id: 'BRIDGE_S', x: 46, z: 0, neighbors: ['RING_E', 'HIGHWAY_MID'] },
  { id: 'HIGHWAY_MID', x: 1200, z: 0, neighbors: ['BRIDGE_S', 'FRONTIER_2220'] },
  { id: 'FRONTIER_2220', x: 2220, z: 0, neighbors: ['HIGHWAY_MID', 'OUTPOST_2370'] },
  { id: 'OUTPOST_2370', x: 2370, z: 0, neighbors: ['FRONTIER_2220', 'DEMON_GATE'] },
  { id: 'DEMON_GATE', x: 2456, z: 0, neighbors: ['OUTPOST_2370'] },
  { id: 'NORTH_JX', x: 0, z: -56, neighbors: ['RING_N', 'ASHVA_JX', 'SERVANT_JX'] },
  { id: 'BRIDGE_N', x: 82, z: -56, neighbors: ['SERVANT_JX'] },
  { id: 'SERVANT_JX', x: 18, z: -56, neighbors: ['NORTH_JX', 'BRIDGE_N', 'SERVANT_END'] },
  { id: 'SERVANT_END', x: 18, z: -102, neighbors: ['SERVANT_JX'] },
  { id: 'ASHVA_JX', x: -14, z: -56, neighbors: ['NORTH_JX', 'HATHI_JX', 'ASHVA_END'] },
  { id: 'ASHVA_END', x: -14, z: -128, neighbors: ['ASHVA_JX'] },
  { id: 'HATHI_JX', x: -36, z: -56, neighbors: ['ASHVA_JX', 'WEST_N_END', 'HATHI_END'] },
  { id: 'HATHI_END', x: -36, z: -96, neighbors: ['HATHI_JX'] },
  { id: 'WEST_N_END', x: -136, z: -56, neighbors: ['HATHI_JX'] },
];

const _ROAD_NODE_MAP = new Map<string, RoadGraphNode>(
  ROAD_GRAPH_NODES.map((n) => [n.id, n])
);
const _ROAD_COUNT = ROAD_GRAPH_NODES.length;
const _ROAD_INDEX_MAP = new Map<string, number>(
  ROAD_GRAPH_NODES.map((n, idx) => [n.id, idx])
);
const _ROAD_NEIGHBOR_IDX: number[][] = ROAD_GRAPH_NODES.map((n) =>
  n.neighbors
    .map((id) => _ROAD_INDEX_MAP.get(id) ?? -1)
    .filter((idx) => idx >= 0)
);
const _roadDist = new Float64Array(_ROAD_COUNT);
const _roadPrev = new Int32Array(_ROAD_COUNT);
const _roadVisited = new Uint8Array(_ROAD_COUNT);
const _roadTrace = new Int32Array(_ROAD_COUNT);

const _snapOut = {
  seg: PAVED_ROADS[0],
  snappedX: 0,
  snappedZ: 0,
  dist: 0,
};

export function snapPointToNearestPavedRoad(
  x: number,
  z: number
): { seg: PavedRoadSegment; snappedX: number; snappedZ: number; dist: number } {
  let best = PAVED_ROADS[0];
  let bestDist = Infinity;
  let bestX = x;
  let bestZ = 0;

  for (let i = 0; i < PAVED_ROADS.length; i++) {
    const r = PAVED_ROADS[i];
    if (r.axis === 'X') {
      const cx = Math.max(r.minSpan, Math.min(r.maxSpan, x));
      let targetZ = r.fixedCoord;
      if (Math.abs(cx) < 16 && r.fixedCoord === 0) {
        targetZ = z >= 0 ? 15.2 : -15.2;
      }
      const d = Math.hypot(x - cx, z - targetZ);
      if (d < bestDist) {
        bestDist = d;
        best = r;
        bestX = cx;
        bestZ = targetZ;
      }
    } else {
      const cz = Math.max(r.minSpan, Math.min(r.maxSpan, z));
      let targetX = r.fixedCoord;
      if (Math.abs(cz) < 16 && r.fixedCoord === 0) {
        targetX = x >= 0 ? 15.2 : -15.2;
      }
      const d = Math.hypot(x - targetX, z - cz);
      if (d < bestDist) {
        bestDist = d;
        best = r;
        bestX = targetX;
        bestZ = cz;
      }
    }
  }

  _snapOut.seg = best;
  _snapOut.snappedX = bestX;
  _snapOut.snappedZ = bestZ;
  _snapOut.dist = bestDist;
  return _snapOut;
}

function nearestRoadNodeIdxAvoidingPlaza(x: number, z: number): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < _ROAD_COUNT; i++) {
    const n = ROAD_GRAPH_NODES[i];
    const d = Math.hypot(n.x - x, n.z - z);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Builds a deterministic, strictly contiguous sequence of paved-road waypoints from (x,z) toward (goalX,goalZ)
 * using zero-allocation typed-array Dijkstra scratch buffers so auto-drive transitions smoothly without frame spikes.
 */
export function buildAutoDriveRoute(
  x: number,
  z: number,
  headingYaw: number,
  goalX: number,
  goalZ: number,
  outRoute?: Array<{ x: number; z: number }>
): Array<{ x: number; z: number }> {
  const snap = snapPointToNearestPavedRoad(x, z);
  const startIdx = nearestRoadNodeIdxAvoidingPlaza(snap.snappedX, snap.snappedZ);
  const goalIdx = nearestRoadNodeIdxAvoidingPlaza(goalX, goalZ);

  for (let i = 0; i < _ROAD_COUNT; i++) {
    _roadDist[i] = i === startIdx ? 0 : Infinity;
    _roadPrev[i] = -1;
    _roadVisited[i] = 0;
  }

  for (let step = 0; step < _ROAD_COUNT; step++) {
    let currIdx = -1;
    let bestD = Infinity;
    for (let i = 0; i < _ROAD_COUNT; i++) {
      if (_roadVisited[i] === 0 && _roadDist[i] < bestD) {
        bestD = _roadDist[i];
        currIdx = i;
      }
    }
    if (currIdx === -1 || currIdx === goalIdx || bestD === Infinity) break;
    _roadVisited[currIdx] = 1;
    const curr = ROAD_GRAPH_NODES[currIdx];
    const neighbors = _ROAD_NEIGHBOR_IDX[currIdx];
    for (let k = 0; k < neighbors.length; k++) {
      const nid = neighbors[k];
      if (_roadVisited[nid] !== 0) continue;
      const nb = ROAD_GRAPH_NODES[nid];
      const alt = bestD + Math.hypot(nb.x - curr.x, nb.z - curr.z);
      if (alt < _roadDist[nid]) {
        _roadDist[nid] = alt;
        _roadPrev[nid] = currIdx;
      }
    }
  }

  let traceCount = 0;
  let trace = goalIdx;
  while (trace !== -1 && traceCount < _ROAD_COUNT) {
    _roadTrace[traceCount++] = trace;
    trace = _roadPrev[trace];
  }

  const route = outRoute ?? [];
  route.length = 0;

  let startTraceCursor = traceCount - 1;
  // If already positioned between chain[0] and chain[1], skip chain[0] so the chariot never turns 180 deg backward
  if (traceCount >= 2) {
    const first = ROAD_GRAPH_NODES[_roadTrace[traceCount - 1]];
    const second = ROAD_GRAPH_NODES[_roadTrace[traceCount - 2]];
    const segX = second.x - first.x;
    const segZ = second.z - first.z;
    const segLenSq = segX * segX + segZ * segZ;
    if (segLenSq > 1) {
      const tProj = ((x - first.x) * segX + (z - first.z) * segZ) / segLenSq;
      if (tProj > 0.02 && snap.dist <= snap.seg.halfWidth * 1.15) {
        startTraceCursor--;
      }
    }
  }

  // When off-road, prepend a smooth forward-biased merge onto the nearest paved road segment
  if (snap.dist > snap.seg.halfWidth * 0.65 && startTraceCursor >= 0) {
    const nextNode = ROAD_GRAPH_NODES[_roadTrace[startTraceCursor]];
    const fwdX = Math.sin(headingYaw);
    const fwdZ = Math.cos(headingYaw);
    const snapDot = (snap.snappedX - x) * fwdX + (snap.snappedZ - z) * fwdZ;
    const nextDot = (nextNode.x - x) * fwdX + (nextNode.z - z) * fwdZ;
    if (snapDot >= -1.0 || nextDot < 0) {
      route.push({ x: snap.snappedX, z: snap.snappedZ });
    }
  }

  for (let i = startTraceCursor; i >= 0; i--) {
    const pt = ROAD_GRAPH_NODES[_roadTrace[i]];
    const last = route.length > 0 ? route[route.length - 1] : null;
    if (!last || Math.hypot(pt.x - last.x, pt.z - last.z) > 1.8) {
      route.push({ x: pt.x, z: pt.z });
    }
  }
  const tail = route.length > 0 ? route[route.length - 1] : null;
  if (!tail || Math.hypot(goalX - tail.x, goalZ - tail.z) > 2.5) {
    route.push({ x: goalX, z: goalZ });
  }
  return route;
}

const _autoDriveStepOut = {
  wpIdx: 0,
  targetX: 0,
  targetZ: 0,
  distToGoal: 0,
};

/**
 * Zero-allocation pure-pursuit paved-road follower with strictly monotonic waypoint index advancement.
 */
export function stepAutoDriveRoute(
  x: number,
  z: number,
  route: Array<{ x: number; z: number }>,
  wpIdx: number,
  goalX: number,
  goalZ: number,
  lookaheadDist: number
): { wpIdx: number; targetX: number; targetZ: number; distToGoal: number } {
  const distToGoal = Math.hypot(goalX - x, goalZ - z);
  const snap = snapPointToNearestPavedRoad(x, z);
  if (route.length === 0) {
    _autoDriveStepOut.wpIdx = 0;
    _autoDriveStepOut.targetX = goalX;
    _autoDriveStepOut.targetZ = goalZ;
    _autoDriveStepOut.distToGoal = distToGoal;
    return _autoDriveStepOut;
  }

  let idx = Math.max(0, Math.min(wpIdx, route.length - 1));
  while (idx < route.length - 1) {
    const wp = route[idx];
    const next = route[idx + 1];
    const dWp = Math.hypot(wp.x - x, wp.z - z);
    if (dWp < 5.2) {
      idx++;
      continue;
    }
    const segX = next.x - wp.x;
    const segZ = next.z - wp.z;
    const segLenSq = segX * segX + segZ * segZ;
    if (segLenSq > 1e-4 && ((x - wp.x) * segX + (z - wp.z) * segZ) / segLenSq > 0.05 && dWp < 12.0) {
      idx++;
      continue;
    }
    break;
  }

  const target = route[idx];
  const prevX = idx > 0 ? route[idx - 1].x : x;
  const prevZ = idx > 0 ? route[idx - 1].z : z;
  const segDx = target.x - prevX;
  const segDz = target.z - prevZ;
  const segLen = Math.hypot(segDx, segDz);

  let pursueX = target.x;
  let pursueZ = target.z;
  if (segLen > 1.0) {
    const ux = segDx / segLen;
    const uz = segDz / segLen;
    const proj = Math.max(0, Math.min(segLen, (x - prevX) * ux + (z - prevZ) * uz));
    const ahead = Math.min(segLen, proj + lookaheadDist);
    pursueX = prevX + ux * ahead;
    pursueZ = prevZ + uz * ahead;

    if (ahead >= segLen - 0.5 && idx + 1 < route.length) {
      const next = route[idx + 1];
      const nDx = next.x - target.x;
      const nDz = next.z - target.z;
      const nLen = Math.hypot(nDx, nDz);
      if (nLen > 1.0) {
        const overflow = Math.min(nLen * 0.5, Math.max(0, proj + lookaheadDist - segLen));
        pursueX = target.x + (nDx / nLen) * overflow;
        pursueZ = target.z + (nDz / nLen) * overflow;
      }
    }
  }

  if (snap.dist < snap.seg.halfWidth * 1.4) {
    pursueX = pursueX * 0.82 + snap.snappedX * 0.18;
    pursueZ = pursueZ * 0.82 + snap.snappedZ * 0.18;
  }

  _autoDriveStepOut.wpIdx = idx;
  _autoDriveStepOut.targetX = pursueX;
  _autoDriveStepOut.targetZ = pursueZ;
  _autoDriveStepOut.distToGoal = distToGoal;
  return _autoDriveStepOut;
}

export function computeAutoDriveRoadTarget(
  x: number,
  z: number,
  goalX: number,
  goalZ: number
): { targetX: number; targetZ: number; seg: PavedRoadSegment; distToGoal: number } {
  const snap = snapPointToNearestPavedRoad(x, z);
  const route = buildAutoDriveRoute(x, z, 0, goalX, goalZ);
  const res = stepAutoDriveRoute(x, z, route, 0, goalX, goalZ, 9.5);
  return { targetX: res.targetX, targetZ: res.targetZ, seg: snap.seg, distToGoal: res.distToGoal };
}

/**
 * Baked Obstacle-Free Multi-Level Navigation Mesh spanning ALL of Ayodhya (Avenues, Plaza Ring, Stables,
 * Training Grounds, Servant Quarters, Stepwell & Riverbanks, Sabha Aisles, Palace Stories 1..7, Stairs & Balconies).
 */
export interface PalaceNavNode {
  id: string;
  x: number;
  y: number;
  z: number;
  neighbors: string[];
  waterOnly?: boolean;
}

export const PALACE_NAV_NODES: PalaceNavNode[] = (() => {
  const nodes: PalaceNavNode[] = [];
  const addNode = (id: string, x: number, y: number, z: number, waterOnly = false) => {
    nodes.push({ id, x, y, z, neighbors: [], waterOnly });
  };
  const link = (aId: string, bId: string) => {
    const a = nodes.find((n) => n.id === aId);
    const b = nodes.find((n) => n.id === bId);
    if (!a || !b) return;
    if (!a.neighbors.includes(bId)) a.neighbors.push(bId);
    if (!b.neighbors.includes(aId)) b.neighbors.push(aId);
  };

  // Mahadev Plaza Outer Walkable Ring (clears statue r=6.5m and Torana columns cleanly)
  addNode('PLAZA_N', 0, 0, -14.0);
  addNode('PLAZA_S', 0, 0, 14.0);
  addNode('PLAZA_W', -14.0, 0, 0);
  addNode('PLAZA_E', 14.0, 0, 0);
  addNode('PLAZA_NW', -11.5, 0, -11.5);
  addNode('PLAZA_NE', 11.5, 0, -11.5);
  addNode('PLAZA_SW', -11.5, 0, 11.5);
  addNode('PLAZA_SE', 11.5, 0, 11.5);

  link('PLAZA_N', 'PLAZA_NW');
  link('PLAZA_NW', 'PLAZA_W');
  link('PLAZA_W', 'PLAZA_SW');
  link('PLAZA_SW', 'PLAZA_S');
  link('PLAZA_S', 'PLAZA_SE');
  link('PLAZA_SE', 'PLAZA_E');
  link('PLAZA_E', 'PLAZA_NE');
  link('PLAZA_NE', 'PLAZA_N');

  // Bazaar & South Avenue
  addNode('SOUTH_TORANA', 0, 0, 26.0);
  addNode('BAZAAR_W1', -18.0, 0, 28.0);
  addNode('BAZAAR_E1', 18.0, 0, 28.0);
  addNode('BAZAAR_W2', -18.0, 0, -14.0);
  addNode('BAZAAR_E2', 22.5, 0, -14.0);
  addNode('TEMPLE_FORE', 22.5, 0, -28.0);
  addNode('AVE_S_MID', 0, 0, 44.0);

  link('PLAZA_S', 'SOUTH_TORANA');
  link('SOUTH_TORANA', 'BAZAAR_W1');
  link('SOUTH_TORANA', 'BAZAAR_E1');
  link('SOUTH_TORANA', 'AVE_S_MID');
  link('BAZAAR_W1', 'PLAZA_SW');
  link('BAZAAR_E1', 'PLAZA_SE');
  link('BAZAAR_W2', 'PLAZA_NW');
  link('BAZAAR_W2', 'PLAZA_W');
  link('BAZAAR_E2', 'PLAZA_E');
  link('BAZAAR_E2', 'TEMPLE_FORE');

  // North Avenue into Sabha Forecourt
  addNode('NAVE_S', 0, 0, -28.0);
  addNode('NAVE_NW', -9.0, 0, -32.0);
  addNode('NAVE_NE', 6.5, 0, -32.0);
  addNode('NAVE_MW', -11.5, 0, -46.0);
  addNode('NAVE_ME', 11.5, 0, -46.0);
  addNode('COURTYARD_FORE', 0, 0.0, -56.0);
  addNode('COURTYARD_W', -12.0, 0.0, -56.0);
  addNode('COURTYARD_E', 12.0, 0.0, -56.0);

  link('PLAZA_N', 'NAVE_S');
  link('NAVE_S', 'NAVE_NW');
  link('NAVE_S', 'NAVE_NE');
  link('NAVE_NW', 'BAZAAR_W2');
  link('NAVE_NE', 'NAVE_ME');
  link('NAVE_ME', 'TEMPLE_FORE');
  link('NAVE_NW', 'NAVE_MW');
  link('NAVE_S', 'COURTYARD_FORE');
  link('NAVE_MW', 'COURTYARD_W');
  link('NAVE_ME', 'COURTYARD_E');
  link('COURTYARD_W', 'COURTYARD_FORE');
  link('COURTYARD_FORE', 'COURTYARD_E');

  // Stepwell East Forecourt & Water Interior (waterOnly for swimmers)
  addNode('STEPWELL_EAST', -19.5, 0, -28.0);
  addNode('STEPWELL_STAIR_MID', -23.5, -1.8, -28.0, true);
  addNode('STEPWELL_POOL', -30.0, -5.8, -28.0, true);
  link('BAZAAR_W2', 'STEPWELL_EAST');
  link('NAVE_NW', 'STEPWELL_EAST');
  link('STEPWELL_EAST', 'STEPWELL_STAIR_MID');
  link('STEPWELL_STAIR_MID', 'STEPWELL_POOL');

  // Sarayu Riverbank Walkways & River Swim Channels (waterOnly for swimmers)
  addNode('BANK_NE', 24.5, 0, -56.0);
  addNode('BANK_N', 25.5, 0, -24.0);
  addNode('BANK_S', 26.0, 0, 22.0);
  addNode('BANK_FAR_S', 24.5, 0, 42.0);
  addNode('BANK_FAR_N', 25.5, 0, -84.0);
  addNode('SWIM_N', 38.0, -0.8, -24.0, true);
  addNode('SWIM_S', 39.0, -0.8, 22.0, true);
  addNode('SWIM_FAR_S', 38.0, -0.8, 42.0, true);
  addNode('SWIM_FAR_N', 38.5, -0.8, -84.0, true);

  link('COURTYARD_E', 'BANK_NE');
  link('BANK_NE', 'BANK_N');
  link('BANK_N', 'TEMPLE_FORE');
  link('BANK_N', 'BAZAAR_E2');
  link('BAZAAR_E2', 'BANK_S');
  link('BANK_S', 'BAZAAR_E1');
  link('BANK_S', 'BANK_FAR_S');
  link('BANK_N', 'SWIM_N');
  link('BANK_S', 'SWIM_S');
  link('BANK_FAR_S', 'SWIM_FAR_S');
  link('BANK_FAR_N', 'SWIM_FAR_N');
  link('SWIM_N', 'SWIM_FAR_N');
  link('SWIM_N', 'SWIM_S');
  link('SWIM_S', 'SWIM_FAR_S');

  // Training Grounds, Hathi-Shala, Ashva-Shala & Servant Quarters Corridors
  addNode('COURTYARD_WEST_AVE', -24.0, 0, -56.0);
  addNode('TRAINING_SE', -24.0, 0, -66.0);
  addNode('TRAINING_SW', -36.0, 0, -66.0);
  addNode('TRAINING_NE', -26.0, 0, -84.0);
  addNode('TRAINING_NW', -38.0, 0, -84.0);
  addNode('HATHI_GATE', -36.0, 0, -96.0);
  addNode('HATHI_BAY_W', -42.5, 0.35, -104.0);
  addNode('HATHI_BAY_C', -35.5, 0.35, -104.0);
  addNode('HATHI_BAY_E', -28.5, 0.35, -104.0);
  addNode('ASHVA_FORE', -21.0, 0, -64.0);
  addNode('ASHVA_MID', -21.0, 0, -96.0);
  addNode('ASHVA_SPUR', -21.0, 0, -131.5);
  addNode('ASHVA_GATE_W', -22.6, 0.34, -136.0);
  addNode('ASHVA_GATE_E', -16.9, 0.34, -136.0);

  addNode('SERVANT_FORE', 18.0, 0, -64.0);
  addNode('SERVANT_MID', 18.0, 0, -88.0);
  addNode('SERVANT_FORE_W', 18.0, 0, -104.0);
  addNode('SERVANT_YARD_C', 21.2, 0.40, -104.0);
  addNode('SERVANT_COURT_W', 13.5, 0, -88.0);

  link('COURTYARD_W', 'ASHVA_FORE');
  link('ASHVA_FORE', 'ASHVA_MID');
  link('ASHVA_MID', 'ASHVA_SPUR');
  link('COURTYARD_W', 'COURTYARD_WEST_AVE');
  link('COURTYARD_WEST_AVE', 'TRAINING_SE');
  link('COURTYARD_WEST_AVE', 'TRAINING_SW');
  link('TRAINING_SE', 'TRAINING_SW');
  link('TRAINING_SE', 'TRAINING_NE');
  link('TRAINING_SW', 'TRAINING_NW');
  link('TRAINING_NE', 'TRAINING_NW');
  link('TRAINING_NW', 'HATHI_GATE');
  link('TRAINING_NE', 'HATHI_GATE');
  link('HATHI_GATE', 'HATHI_BAY_W');
  link('HATHI_GATE', 'HATHI_BAY_C');
  link('HATHI_GATE', 'HATHI_BAY_E');
  link('ASHVA_SPUR', 'ASHVA_GATE_W');
  link('ASHVA_SPUR', 'ASHVA_GATE_E');
  link('COURTYARD_E', 'SERVANT_FORE');
  link('SERVANT_FORE', 'SERVANT_MID');
  link('SERVANT_MID', 'SERVANT_COURT_W');
  link('SERVANT_MID', 'SERVANT_FORE_W');
  link('SERVANT_FORE_W', 'SERVANT_YARD_C');
  link('SERVANT_MID', 'BANK_FAR_N');
  link('SERVANT_FORE', 'BANK_NE');

  // Sabha Forecourt Steps, Open Center, & Clean Seat Corridors (clears North bridge wings at +-7.05, stelae at +-9.5 & pillars)
  addNode('SABHA_STEPS', 0, 0.25, -63.5);
  addNode('SABHA_SOUTH', 0, 0.42, -67.0);
  addNode('SABHA_CENTER', 0, 0.42, -75.0);
  addNode('SABHA_DAIS_FRONT', 0, 0.42, -78.2);
  addNode('SABHA_AISLE_W_S', -6.6, 0.42, -69.5);
  addNode('SABHA_AISLE_W_M', -6.6, 0.42, -75.0);
  addNode('SABHA_AISLE_W_N', -4.8, 0.42, -81.2);
  addNode('SABHA_AISLE_E_S', 6.6, 0.42, -69.5);
  addNode('SABHA_AISLE_E_M', 6.6, 0.42, -75.0);
  addNode('SABHA_AISLE_E_N', 4.8, 0.42, -81.2);
  addNode('SABHA_CENTER_AISLE_S', -2.2, 0.42, -71.5);
  addNode('SABHA_CENTER_AISLE_E', 2.2, 0.42, -71.5);
  addNode('SABHA_OUTER_W', -10.5, 0.42, -74.5);
  addNode('SABHA_OUTER_E', 10.5, 0.42, -74.5);
  addNode('LINK_BRIDGE_W', -4.2, 0.42, -91.5);
  addNode('LINK_BRIDGE', 0, 0.42, -91.5);
  addNode('LINK_BRIDGE_E', 4.2, 0.42, -91.5);

  link('COURTYARD_FORE', 'SABHA_STEPS');
  link('COURTYARD_W', 'SABHA_STEPS');
  link('COURTYARD_E', 'SABHA_STEPS');
  link('SABHA_STEPS', 'SABHA_SOUTH');
  link('SABHA_SOUTH', 'SABHA_CENTER');
  link('SABHA_SOUTH', 'SABHA_CENTER_AISLE_S');
  link('SABHA_SOUTH', 'SABHA_CENTER_AISLE_E');
  link('SABHA_CENTER_AISLE_S', 'SABHA_CENTER');
  link('SABHA_CENTER_AISLE_E', 'SABHA_CENTER');
  link('SABHA_SOUTH', 'SABHA_AISLE_W_S');
  link('SABHA_SOUTH', 'SABHA_AISLE_E_S');
  link('SABHA_CENTER_AISLE_S', 'SABHA_AISLE_W_S');
  link('SABHA_CENTER_AISLE_E', 'SABHA_AISLE_E_S');
  link('SABHA_AISLE_W_S', 'SABHA_AISLE_W_M');
  link('SABHA_AISLE_W_M', 'SABHA_AISLE_W_N');
  link('SABHA_AISLE_E_S', 'SABHA_AISLE_E_M');
  link('SABHA_AISLE_E_M', 'SABHA_AISLE_E_N');
  link('SABHA_AISLE_W_M', 'SABHA_OUTER_W');
  link('SABHA_AISLE_E_M', 'SABHA_OUTER_E');
  link('SABHA_AISLE_W_M', 'SABHA_CENTER');
  link('SABHA_AISLE_E_M', 'SABHA_CENTER');
  link('SABHA_CENTER', 'SABHA_DAIS_FRONT');
  link('SABHA_DAIS_FRONT', 'SABHA_AISLE_W_N');
  link('SABHA_DAIS_FRONT', 'SABHA_AISLE_E_N');
  link('SABHA_AISLE_W_N', 'LINK_BRIDGE_W');
  link('SABHA_AISLE_E_N', 'LINK_BRIDGE_E');
  link('LINK_BRIDGE_W', 'LINK_BRIDGE');
  link('LINK_BRIDGE', 'LINK_BRIDGE_E');

  // 7-Story Palace Stories + Enclosed Balconies + Landing Corridors + Stair Flights
  PALACE_STORIES.forEach((st, idx) => {
    const story = st.story;
    const hw = st.w * 0.5;
    const hd = st.d * 0.5;
    const cId = `S${story}_CENTER`;
    const spId = `S${story}_SOUTH_PORTAL`;
    const nbId = `S${story}_NORTH_BALC`;

    addNode(cId, PALACE_CORE_POS.x, st.floorY, PALACE_CORE_POS.z);
    addNode(
      spId,
      PALACE_CORE_POS.x,
      st.floorY,
      PALACE_CORE_POS.z + hd + (idx > 0 ? 0.9 : -0.95)
    );
    addNode(nbId, PALACE_CORE_POS.x, st.floorY, PALACE_CORE_POS.z - hd - 0.9);
    link(cId, spId);
    link(cId, nbId);

    if (idx <= 3) {
      const wbId = `S${story}_WEST_BALC`;
      const ebId = `S${story}_EAST_BALC`;
      if (idx === 3) {
        addNode('S4_WEST_APPR', PALACE_CORE_POS.x - 6.35, st.floorY, PALACE_CORE_POS.z - 1.15);
        addNode(wbId, PALACE_CORE_POS.x - hw - 0.72, st.floorY, PALACE_CORE_POS.z - 0.9);
        link(cId, 'S4_WEST_APPR');
        link('S4_WEST_APPR', wbId);
      } else {
        addNode(wbId, PALACE_CORE_POS.x - hw - 0.72, st.floorY, PALACE_CORE_POS.z);
        link(cId, wbId);
      }
      addNode(ebId, PALACE_CORE_POS.x + hw + 0.72, st.floorY, PALACE_CORE_POS.z);
      link(cId, ebId);
    }

    if (idx === 0) {
      link('LINK_BRIDGE', spId);
      link('LINK_BRIDGE_W', spId);
      link('LINK_BRIDGE_E', spId);
    }
  });

  PALACE_STAIRS.forEach((st) => {
    const sideSign = st.xCenter >= PALACE_CORE_POS.x ? 1 : -1;
    const botId = `S${st.fromStory}_STAIR_BOT`;
    const botLandId = `S${st.fromStory}_STAIR_BOT_LAND`;
    const midId = `STAIR_${st.fromStory}_${st.toStory}_MID`;
    const topId = `S${st.toStory}_STAIR_TOP`;
    const topLandId = `S${st.toStory}_STAIR_TOP_LAND`;

    const insetX = st.xCenter - sideSign * 2.45;
    addNode(botLandId, insetX, st.yStart, st.zStart + 0.85);
    addNode(botId, st.xCenter, st.yStart, st.zStart + 0.6);
    addNode(
      midId,
      st.xCenter,
      (st.yStart + st.yEnd) * 0.5,
      (st.zStart + st.zEnd) * 0.5
    );
    addNode(topId, st.xCenter, st.yEnd, st.zEnd - 0.65);
    addNode(topLandId, insetX, st.yEnd, st.zEnd - 1.25);

    link(`S${st.fromStory}_CENTER`, botLandId);
    link(botLandId, botId);
    link(botId, midId);
    link(midId, topId);
    link(topId, topLandId);
    link(topLandId, `S${st.toStory}_CENTER`);
  });

  return nodes;
})();

const _PALACE_NAV_MAP = new Map<string, PalaceNavNode>(
  PALACE_NAV_NODES.map((n) => [n.id, n])
);
const _NAV_COUNT = PALACE_NAV_NODES.length;
const _PALACE_NAV_INDEX_MAP = new Map<string, number>(
  PALACE_NAV_NODES.map((n, idx) => [n.id, idx])
);
const _PALACE_NEIGHBOR_IDX: number[][] = PALACE_NAV_NODES.map((n) =>
  n.neighbors
    .map((id) => _PALACE_NAV_INDEX_MAP.get(id) ?? -1)
    .filter((idx) => idx >= 0)
);
const _navDist = new Float64Array(_NAV_COUNT);
const _navPrev = new Int32Array(_NAV_COUNT);
const _navVisited = new Uint8Array(_NAV_COUNT);
const _navTrace = new Int32Array(_NAV_COUNT);
const _patrolCandIdx = new Int32Array(16);
const _patrolCandScore = new Float64Array(16);

function pushReusableNavWaypoint(
  target: Array<{ x: number; y: number; z: number }>,
  cursor: number,
  x: number,
  y: number,
  z: number
): number {
  const slot = target[cursor];
  if (slot) {
    slot.x = x;
    slot.y = y;
    slot.z = z;
  } else {
    target.push({ x, y, z });
  }
  return cursor + 1;
}

/**
 * Zero-allocation multi-level Dijkstra pathfinder across Ayodhya Plaza, Courtyards, Sabha & 7-Story Palace.
 * Pass `outPath` (optional) to reuse waypoint objects cleanly across NPC updates with zero GC churn.
 */
export function findPalaceNavPath(
  sx: number,
  sy: number,
  sz: number,
  gx: number,
  gy: number,
  gz: number,
  allowWater = false,
  outPath?: Array<{ x: number; y: number; z: number }>
): Array<{ x: number; y: number; z: number }> {
  let startIdx = 0;
  let bestSD = Infinity;
  let goalIdx = 0;
  let bestGD = Infinity;

  for (let i = 0; i < _NAV_COUNT; i++) {
    const n = PALACE_NAV_NODES[i];
    if (n.waterOnly && !allowWater) continue;
    const ds = Math.hypot(n.x - sx, n.z - sz) + Math.abs(n.y - sy) * 3.5;
    if (ds < bestSD) {
      bestSD = ds;
      startIdx = i;
    }
    const dg = Math.hypot(n.x - gx, n.z - gz) + Math.abs(n.y - gy) * 3.5;
    if (dg < bestGD) {
      bestGD = dg;
      goalIdx = i;
    }
  }

  for (let i = 0; i < _NAV_COUNT; i++) {
    const n = PALACE_NAV_NODES[i];
    const blocked = Boolean(n.waterOnly && !allowWater && i !== startIdx && i !== goalIdx);
    _navDist[i] = i === startIdx ? 0 : Infinity;
    _navPrev[i] = -1;
    _navVisited[i] = blocked ? 1 : 0;
  }

  for (let step = 0; step < _NAV_COUNT; step++) {
    let currIdx = -1;
    let bestD = Infinity;
    for (let i = 0; i < _NAV_COUNT; i++) {
      if (_navVisited[i] === 0 && _navDist[i] < bestD) {
        bestD = _navDist[i];
        currIdx = i;
      }
    }
    if (currIdx === -1 || currIdx === goalIdx || bestD === Infinity) break;
    _navVisited[currIdx] = 1;
    const curr = PALACE_NAV_NODES[currIdx];
    const neighbors = _PALACE_NEIGHBOR_IDX[currIdx];
    for (let k = 0; k < neighbors.length; k++) {
      const nid = neighbors[k];
      if (_navVisited[nid] !== 0) continue;
      const nb = PALACE_NAV_NODES[nid];
      const stepCost = Math.hypot(nb.x - curr.x, nb.z - curr.z) + Math.abs(nb.y - curr.y) * 1.4;
      const alt = bestD + stepCost;
      if (alt < _navDist[nid]) {
        _navDist[nid] = alt;
        _navPrev[nid] = currIdx;
      }
    }
  }

  let traceCount = 0;
  let trace = goalIdx;
  while (trace !== -1 && traceCount < _NAV_COUNT) {
    _navTrace[traceCount++] = trace;
    trace = _navPrev[trace];
  }

  const path = outPath ?? [];
  let writeIdx = 0;
  for (let i = traceCount - 1; i >= 0; i--) {
    const node = PALACE_NAV_NODES[_navTrace[i]];
    writeIdx = pushReusableNavWaypoint(path, writeIdx, node.x, node.y, node.z);
  }
  writeIdx = pushReusableNavWaypoint(path, writeIdx, gx, gy, gz);
  path.length = writeIdx;
  return path;
}

/**
 * Zero-allocation patrol target selector for Ayodhya NPCs & swimmers.
 */
export function pickNavMeshPatrolTarget(
  x: number,
  y: number,
  z: number,
  homeX: number,
  homeZ: number,
  allowWater: boolean,
  wantWater: boolean,
  outPath?: Array<{ x: number; y: number; z: number }>
): Array<{ x: number; y: number; z: number }> {
  let nearestIdx = 0;
  let bestD = Infinity;
  for (let i = 0; i < _NAV_COUNT; i++) {
    const n = PALACE_NAV_NODES[i];
    if (n.waterOnly && !allowWater) continue;
    const d = Math.hypot(n.x - x, n.z - z) + Math.abs(n.y - y) * 3.0;
    if (d < bestD) {
      bestD = d;
      nearestIdx = i;
    }
  }

  const neighborIds = _PALACE_NEIGHBOR_IDX[nearestIdx];
  let candCount = 0;
  for (let i = 0; i < neighborIds.length && candCount < 16; i++) {
    const nid = neighborIds[i];
    const nb = PALACE_NAV_NODES[nid];
    if (nb.waterOnly && !allowWater) continue;
    const waterPenalty = wantWater && !nb.waterOnly ? 10000 : 0;
    const score = waterPenalty + Math.hypot(nb.x - homeX, nb.z - homeZ);

    let pos = candCount;
    while (pos > 0 && _patrolCandScore[pos - 1] > score) {
      _patrolCandScore[pos] = _patrolCandScore[pos - 1];
      _patrolCandIdx[pos] = _patrolCandIdx[pos - 1];
      pos--;
    }
    _patrolCandScore[pos] = score;
    _patrolCandIdx[pos] = nid;
    candCount++;
  }

  const path = outPath ?? [];
  if (candCount === 0) {
    path.length = pushReusableNavWaypoint(path, 0, homeX, 0, homeZ);
    return path;
  }

  const poolCount = wantWater ? 1 : Math.min(candCount, 3);
  const chosen = PALACE_NAV_NODES[_patrolCandIdx[Math.floor(Math.random() * poolCount)]];
  path.length = pushReusableNavWaypoint(path, 0, chosen.x, chosen.y, chosen.z);
  return path;
}

export function getDistrictName(x: number, z: number): {
  id: DistrictId;
  label: string;
} {
  if (x >= DEMON_ZONE_MIN_X) {
    return {
      id: 'RAKSHASA_OUTPOST',
      label: x >= 2400 ? 'Volcanic Demon Village (2.5 km)' : 'Ash Frontier Wasteland',
    };
  }
  if (z < -172 && x > -610 && x < 610) {
    let bestRange = MOUNTAIN_RANGES[0];
    let bestDist = Infinity;
    for (let i = 0; i < MOUNTAIN_RANGES.length; i++) {
      const r = MOUNTAIN_RANGES[i];
      const d = Math.hypot(x - r.centerX, z - r.centerZ);
      if (d < bestDist) {
        bestDist = d;
        bestRange = r;
      }
    }
    return {
      id: 'PANCHAVATI_GROVE',
      label: `Range ${bestRange.index}: ${bestRange.name}`,
    };
  }
  const rc = riverCenterX(z);
  const rw = riverHalfWidth(z);
  if (x > rc + rw + 12) {
    return { id: 'SARAYU_GHAT', label: 'Royal 2.5 km Highway' };
  }
  if (Math.abs(x - rc) <= rw + 8) {
    return { id: 'SARAYU_GHAT', label: 'Sarayu River (20 ft Channel)' };
  }
  if (z <= -62 && x >= -48 && x <= 38) {
    return { id: 'ROYAL_PALACE', label: '7-Story Royal Palace & Sabha' };
  }
  if (Math.hypot(x - STEPWELL_POS.x, z - STEPWELL_POS.z) < 14) {
    return { id: 'ROYAL_PALACE', label: 'Sacred Surya-Kund Stepwell' };
  }
  if (x < -44 && z < -18) {
    return { id: 'PANCHAVATI_GROVE', label: 'Panchavati Sacred Grove' };
  }
  if (z > 18) {
    return { id: 'BAZAAR_CHOWK', label: 'Ayodhya Bazaar Chowk' };
  }
  return { id: 'ROYAL_PALACE', label: 'Mahadev Sacred Courtyard' };
}

export const BUILDING_LOCATIONS = [
  // Western Panchavati Temple Shrine (well clear of Palace Stables & Stepwell)
  { type: 'TEMPLE' as const, x: -64, z: -46, scale: 1.05, rot: Math.PI / 4 },
  // Relocated Shrine on flat playable ground directly between Mahadev Shivaling Plaza & Sarayu Bridge
  { type: 'TEMPLE' as const, x: 13.8, z: -18.0, scale: 0.85, rot: 0 },
  // Bazaar Pavilions & City Mansions
  { type: 'PAVILION' as const, x: -22, z: 22, scale: 1.1, rot: 0 },
  { type: 'PAVILION' as const, x: 22, z: 22, scale: 1.1, rot: Math.PI },
  { type: 'PAVILION' as const, x: -24, z: 46, scale: 1.0, rot: Math.PI / 2 },
  { type: 'PAVILION' as const, x: 22, z: 46, scale: 1.0, rot: -Math.PI / 2 },
  { type: 'PAVILION' as const, x: -62, z: 18, scale: 1.0, rot: Math.PI / 2 },
];

// Volcanic Demon Village Structures placed strictly 2,500 meters (2.5 km) east of Ayodhya
export const DEMON_VILLAGE_STRUCTURES = [
  { kind: 'CITADEL' as const, x: 2522, z: -24, scale: 1.32, rot: -Math.PI * 0.45 },
  { kind: 'TOWER' as const, x: 2448, z: 14, scale: 1.18, rot: -Math.PI / 2 },
  { kind: 'TOWER' as const, x: 2452, z: -18, scale: 1.15, rot: -Math.PI / 2 },
  { kind: 'TOWER' as const, x: 2214, z: -18, scale: 1.12, rot: -Math.PI / 2 },
  { kind: 'TOWER' as const, x: 2214, z: 18, scale: 1.12, rot: -Math.PI / 2 },
  { kind: 'HUT' as const, x: 2482, z: 46, scale: 1.1, rot: Math.PI * 0.15 },
  { kind: 'HUT' as const, x: 2508, z: 44, scale: 1.15, rot: -Math.PI * 0.25 },
  { kind: 'HUT' as const, x: 2538, z: 14, scale: 1.12, rot: -Math.PI * 0.6 },
  { kind: 'HUT' as const, x: 2492, z: -48, scale: 1.08, rot: Math.PI * 0.3 },
  { kind: 'TOWER' as const, x: 2546, z: -38, scale: 1.22, rot: -Math.PI * 0.7 },
  { kind: 'HUT' as const, x: 2478, z: 72, scale: 1.05, rot: Math.PI * 0.4 },
  { kind: 'HUT' as const, x: 2362, z: -18, scale: 1.12, rot: -Math.PI * 0.35 },
];

// High-Fidelity Volcanic Cones flanking the 2.5 km Demon Village
export const DEMON_VOLCANOES = [
  { x: 2612, z: -60, radius: 44, height: 56 },
  { x: 2628, z: 70, radius: 48, height: 62 },
  { x: 2566, z: -108, radius: 36, height: 44 },
];

export const RATHA_SPAWNS = [
  { x: 10, z: 10, yaw: Math.PI * 0.5 },
  { x: -12, z: 10, yaw: 0 },
  { x: 24, z: -4, yaw: Math.PI * 0.5 },
  { x: 72, z: 2, yaw: Math.PI * 0.5 },
  { x: 2140, z: 2, yaw: Math.PI * 0.5 },
];

export const COURTYARD_ASHVA_SPAWNS = [
  { x: -15, z: -6, yaw: Math.PI * 0.5, coat: 0xf8f5ed, mane: 0xf2eee3 },
  { x: 18, z: -46, yaw: -Math.PI * 0.5, coat: 0xd9b37c, mane: 0xf2e4c9 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COLOSSAL 7-RANGE MOUNTAIN ECOSYSTEM BEHIND THE 7-STORY PALACE
// Seven distinct, interconnected mountain ranges with climbable switchback trails,
// terraced sacred gardens, alpine streams, and accessible walk-in caves.
// ═══════════════════════════════════════════════════════════════════════════════

export interface MountainLobeSpec {
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  height: number;
  rotY: number;
  sharpness: number;
}

export interface MountainRangeSpec {
  index: number; // 1..7
  name: string;
  centerX: number;
  centerZ: number;
  peakHeight: number;
  lobes: MountainLobeSpec[];
}

export const MOUNTAIN_RANGES: MountainRangeSpec[] = [
  {
    index: 1,
    name: 'Giri-Vana Foothills',
    centerX: -158,
    centerZ: -268,
    peakHeight: 132,
    lobes: [
      { cx: -158, cz: -268, rx: 122, rz: 94, height: 132, rotY: 0.25, sharpness: 1.32 },
      { cx: -88, cz: -242, rx: 92, rz: 76, height: 86, rotY: -0.3, sharpness: 1.22 },
      { cx: -225, cz: -315, rx: 112, rz: 92, height: 124, rotY: 0.45, sharpness: 1.25 },
    ],
  },
  {
    index: 2,
    name: 'Surabhi-Kunj Crest',
    centerX: 198,
    centerZ: -282,
    peakHeight: 146,
    lobes: [
      { cx: 198, cz: -282, rx: 126, rz: 96, height: 146, rotY: -0.28, sharpness: 1.34 },
      { cx: 126, cz: -248, rx: 92, rz: 74, height: 94, rotY: 0.35, sharpness: 1.22 },
      { cx: 255, cz: -342, rx: 118, rz: 98, height: 142, rotY: -0.4, sharpness: 1.28 },
    ],
  },
  {
    index: 3,
    name: 'Meru-Mandara Spire',
    centerX: 6,
    centerZ: -408,
    peakHeight: 236,
    lobes: [
      { cx: 6, cz: -408, rx: 154, rz: 122, height: 236, rotY: 0.12, sharpness: 1.42 },
      { cx: -68, cz: -366, rx: 114, rz: 96, height: 162, rotY: 0.55, sharpness: 1.28 },
      { cx: 76, cz: -372, rx: 114, rz: 96, height: 168, rotY: -0.52, sharpness: 1.28 },
      { cx: -12, cz: -492, rx: 126, rz: 108, height: 192, rotY: 0.08, sharpness: 1.24 },
    ],
  },
  {
    index: 4,
    name: 'Nilagiri Western Massif',
    centerX: -318,
    centerZ: -495,
    peakHeight: 272,
    lobes: [
      { cx: -318, cz: -495, rx: 158, rz: 132, height: 272, rotY: -0.32, sharpness: 1.4 },
      { cx: -245, cz: -415, rx: 122, rz: 102, height: 184, rotY: 0.4, sharpness: 1.25 },
      { cx: -415, cz: -455, rx: 138, rz: 124, height: 224, rotY: 0.18, sharpness: 1.32 },
      { cx: -178, cz: -435, rx: 115, rz: 96, height: 168, rotY: -0.25, sharpness: 1.22 },
    ],
  },
  {
    index: 5,
    name: 'Kailasha-Sikhara Highs',
    centerX: -225,
    centerZ: -788,
    peakHeight: 338,
    lobes: [
      { cx: -225, cz: -788, rx: 175, rz: 148, height: 338, rotY: 0.22, sharpness: 1.45 },
      { cx: -355, cz: -718, rx: 148, rz: 132, height: 274, rotY: -0.38, sharpness: 1.36 },
      { cx: -275, cz: -615, rx: 138, rz: 118, height: 226, rotY: 0.14, sharpness: 1.24 },
      { cx: -115, cz: -725, rx: 132, rz: 112, height: 244, rotY: 0.42, sharpness: 1.24 },
    ],
  },
  {
    index: 6,
    name: 'Gandhamadana Grand Crest',
    centerX: 26,
    centerZ: -795,
    peakHeight: 376,
    lobes: [
      { cx: 26, cz: -795, rx: 188, rz: 156, height: 376, rotY: -0.15, sharpness: 1.48 },
      { cx: 14, cz: -628, rx: 142, rz: 122, height: 246, rotY: 0.24, sharpness: 1.26 },
      { cx: -52, cz: -885, rx: 164, rz: 134, height: 352, rotY: 0.32, sharpness: 1.44 },
      { cx: 122, cz: -845, rx: 152, rz: 132, height: 318, rotY: -0.45, sharpness: 1.38 },
    ],
  },
  {
    index: 7,
    name: 'Suryodaya Eastern Bastion',
    centerX: 335,
    centerZ: -565,
    peakHeight: 296,
    lobes: [
      { cx: 335, cz: -565, rx: 166, rz: 148, height: 296, rotY: 0.36, sharpness: 1.42 },
      { cx: 285, cz: -708, rx: 154, rz: 132, height: 268, rotY: -0.28, sharpness: 1.35 },
      { cx: 418, cz: -485, rx: 142, rz: 126, height: 232, rotY: 0.18, sharpness: 1.34 },
      { cx: 175, cz: -468, rx: 124, rz: 106, height: 194, rotY: -0.35, sharpness: 1.24 },
    ],
  },
];

// Flattened lobe array with precomputed trig for O(1) hot-path evaluation
const _FLAT_LOBES = MOUNTAIN_RANGES.flatMap((r) =>
  r.lobes.map((l) => ({
    ...l,
    cosR: Math.cos(l.rotY),
    sinR: Math.sin(l.rotY),
    invRxSq: 1 / (l.rx * l.rx),
    invRzSq: 1 / (l.rz * l.rz),
    maxR: Math.max(l.rx, l.rz) * 1.18,
  }))
);

export interface TrailWaypoint {
  x: number;
  z: number;
  y: number;
}

export interface MountainTrailSpec {
  id: string;
  name: string;
  halfWidth: number;
  points: TrailWaypoint[];
}

export const MOUNTAIN_TRAILS: MountainTrailSpec[] = [
  {
    id: 'TRAIL_CENTRAL_MERU',
    name: 'Meru-Mandara Pilgrim Switchback',
    halfWidth: 4.0,
    points: [
      { x: -2, z: -156, y: 0.2 },
      { x: 4, z: -182, y: 5.5 },
      { x: -26, z: -214, y: 18.0 },
      { x: 34, z: -248, y: 36.0 },
      { x: -22, z: -282, y: 60.0 },
      { x: -18, z: -325, y: 86.0 }, // Deva-Udyan Garden Terrace
      { x: 38, z: -352, y: 118.0 },
      { x: -34, z: -378, y: 152.0 },
      { x: 24, z: -396, y: 188.0 },
      { x: 6, z: -408, y: 226.0 }, // Meru-Mandara Summit
    ],
  },
  {
    id: 'TRAIL_WEST_R1_R4_R5',
    name: 'Western Giri-Vana to Kailasha Trail',
    halfWidth: 3.9,
    points: [
      { x: -26, z: -214, y: 18.0 },
      { x: -66, z: -220, y: 32.0 },
      { x: -95, z: -240, y: 52.0 }, // Vana-Vatika Garden Terrace
      { x: -124, z: -230, y: 66.0 }, // Near Rishi Guha Cave 1
      { x: -166, z: -252, y: 98.0 },
      { x: -158, z: -268, y: 126.0 }, // Range 1 Peak Overlook
      { x: -208, z: -325, y: 108.0 }, // Range 1 -> Range 4 Pass
      { x: -248, z: -396, y: 132.0 }, // Near Gaja-Mandira Cave 4
      { x: -292, z: -445, y: 174.0 },
      { x: -348, z: -482, y: 214.0 },
      { x: -318, z: -495, y: 264.0 }, // Range 4 Nilagiri Crest
      { x: -275, z: -595, y: 204.0 }, // Range 4 -> Range 5 Pass
      { x: -238, z: -622, y: 180.0 }, // Near Chita-Shila Cave 5
      { x: -205, z: -695, y: 216.0 }, // Hima-Padma Alpine Garden
      { x: -258, z: -745, y: 274.0 },
      { x: -225, z: -788, y: 330.0 }, // Range 5 Kailasha Peak
    ],
  },
  {
    id: 'TRAIL_EAST_R2_R7',
    name: 'Eastern Surabhi to Suryodaya Trail',
    halfWidth: 3.9,
    points: [
      { x: 4, z: -182, y: 5.5 },
      { x: 46, z: -198, y: 12.0 }, // Sarayu Headwater Crossing
      { x: 96, z: -218, y: 28.0 },
      { x: 135, z: -245, y: 56.0 }, // Pushpa-Vatika Garden Terrace
      { x: 168, z: -244, y: 74.0 }, // Near Simha-Dvara Cave 2
      { x: 214, z: -268, y: 108.0 },
      { x: 198, z: -282, y: 140.0 }, // Range 2 Summit
      { x: 242, z: -345, y: 118.0 }, // Range 2 -> Range 7 Pass
      { x: 252, z: -404, y: 126.0 }, // Near Mriga-Vana Cave 7
      { x: 285, z: -495, y: 158.0 }, // Surya-Kanti Garden Terrace
      { x: 348, z: -535, y: 224.0 },
      { x: 335, z: -565, y: 288.0 }, // Range 7 Suryodaya Peak
      { x: 262, z: -642, y: 234.0 },
      { x: 165, z: -705, y: 214.0 }, // Connects toward Range 6
    ],
  },
  {
    id: 'TRAIL_HIGH_GANDHAMADANA',
    name: 'Gandhamadana Grand Spine (R3 -> R6)',
    halfWidth: 4.0,
    points: [
      { x: 6, z: -408, y: 226.0 },
      { x: -12, z: -482, y: 186.0 },
      { x: 18, z: -545, y: 168.0 }, // Alpine Stream Crossing
      { x: 42, z: -645, y: 224.0 }, // Sanjeevani Herbal Garden
      { x: 60, z: -686, y: 246.0 }, // Near Gupt-Nidhi Crystal Cave 6
      { x: -18, z: -735, y: 294.0 },
      { x: 26, z: -795, y: 368.0 }, // Gandhamadana Grand Crest
    ],
  },
  {
    id: 'TRAIL_SADDLE_R1_R3',
    name: 'Vana-Deva Saddle Link',
    halfWidth: 3.6,
    points: [
      { x: -95, z: -240, y: 52.0 },
      { x: -68, z: -298, y: 72.0 },
      { x: -18, z: -325, y: 86.0 },
    ],
  },
  {
    id: 'TRAIL_SADDLE_R2_R3',
    name: 'Pushpa-Meru Saddle Link',
    halfWidth: 3.6,
    points: [
      { x: 135, z: -245, y: 56.0 },
      { x: 86, z: -305, y: 88.0 },
      { x: 38, z: -352, y: 118.0 },
    ],
  },
  {
    id: 'TRAIL_SADDLE_R5_R6_R7',
    name: 'Northern Trans-Himalayan Pass',
    halfWidth: 3.7,
    points: [
      { x: -205, z: -695, y: 216.0 },
      { x: -115, z: -715, y: 218.0 },
      { x: -45, z: -732, y: 254.0 },
      { x: -18, z: -735, y: 294.0 },
      { x: 60, z: -686, y: 246.0 },
      { x: 110, z: -696, y: 232.0 },
      { x: 165, z: -705, y: 214.0 },
    ],
  },
];

interface FlatTrailSegment {
  x0: number;
  z0: number;
  y0: number;
  x1: number;
  z1: number;
  y1: number;
  dx: number;
  dz: number;
  lenSq: number;
  halfWidth: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const _TRAIL_SEGMENTS: FlatTrailSegment[] = [];
for (const tr of MOUNTAIN_TRAILS) {
  for (let i = 0; i < tr.points.length - 1; i++) {
    const a = tr.points[i];
    const b = tr.points[i + 1];
    const pad = tr.halfWidth + 9.0;
    _TRAIL_SEGMENTS.push({
      x0: a.x,
      z0: a.z,
      y0: a.y,
      x1: b.x,
      z1: b.z,
      y1: b.y,
      dx: b.x - a.x,
      dz: b.z - a.z,
      lenSq: Math.max(1e-4, (b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z)),
      halfWidth: tr.halfWidth,
      minX: Math.min(a.x, b.x) - pad,
      maxX: Math.max(a.x, b.x) + pad,
      minZ: Math.min(a.z, b.z) - pad,
      maxZ: Math.max(a.z, b.z) + pad,
    });
  }
}

export interface MountainGardenSpec {
  id: string;
  name: string;
  rangeIndex: number;
  x: number;
  z: number;
  y: number;
  radius: number;
}

export const MOUNTAIN_GARDENS: MountainGardenSpec[] = [
  { id: 'GARDEN_R1', name: 'Vana-Vatika Grove', rangeIndex: 1, x: -95, z: -240, y: 52.0, radius: 14.5 },
  { id: 'GARDEN_R2', name: 'Pushpa-Vatika Terrace', rangeIndex: 2, x: 135, z: -245, y: 56.0, radius: 14.5 },
  { id: 'GARDEN_R3', name: 'Deva-Udyan Hanging Garden', rangeIndex: 3, x: -18, z: -325, y: 86.0, radius: 16.5 },
  { id: 'GARDEN_R7', name: 'Surya-Kanti Vatika', rangeIndex: 7, x: 285, z: -495, y: 158.0, radius: 15.5 },
  { id: 'GARDEN_R5', name: 'Hima-Padma Sanctuary', rangeIndex: 5, x: -205, z: -695, y: 216.0, radius: 16.5 },
  { id: 'GARDEN_R6', name: 'Sanjeevani Herbal Terrace', rangeIndex: 6, x: 42, z: -645, y: 224.0, radius: 16.5 },
];

export interface MountainCaveSpec {
  id: string;
  name: string;
  rangeIndex: number;
  x: number;
  z: number;
  y: number;
  yaw: number; // Direction mouth (+Z local) faces outward toward the trail
  crystalHex: number;
  radius: number;
}

export const MOUNTAIN_CAVES: MountainCaveSpec[] = [
  { id: 'CAVE_R1', name: 'Rishi Guha', rangeIndex: 1, x: -128, z: -222, y: 66.0, yaw: 0.45, crystalHex: 0xffd27a, radius: 9.2 },
  { id: 'CAVE_R2', name: 'Simha-Dvara Guha', rangeIndex: 2, x: 176, z: -238, y: 74.0, yaw: -0.48, crystalHex: 0xffa64d, radius: 9.2 },
  { id: 'CAVE_R3', name: 'Vyaghra Guha', rangeIndex: 3, x: 46, z: -342, y: 118.0, yaw: -0.45, crystalHex: 0xff8a3c, radius: 9.5 },
  { id: 'CAVE_R4', name: 'Gaja-Mandira Guha', rangeIndex: 4, x: -256, z: -390, y: 132.0, yaw: 0.58, crystalHex: 0x72f2c8, radius: 9.8 },
  { id: 'CAVE_R5', name: 'Chita-Shila Guha', rangeIndex: 5, x: -244, z: -614, y: 180.0, yaw: 0.25, crystalHex: 0x7bc8ff, radius: 9.5 },
  { id: 'CAVE_R6', name: 'Gupt-Nidhi Crystal Cave', rangeIndex: 6, x: 68, z: -680, y: 246.0, yaw: -0.52, crystalHex: 0xd08aff, radius: 10.2 },
  { id: 'CAVE_R7', name: 'Mriga-Vana Grotto', rangeIndex: 7, x: 258, z: -396, y: 126.0, yaw: -0.48, crystalHex: 0x8effa8, radius: 9.4 },
];

export interface MountainStreamSpec {
  id: string;
  name: string;
  halfWidth: number;
  points: TrailWaypoint[];
}

export const MOUNTAIN_STREAMS: MountainStreamSpec[] = [
  {
    id: 'STREAM_CENTRAL_SARAYU_HEAD',
    name: 'Meru-Sarayu Glacial Headwater',
    halfWidth: 3.4,
    points: [
      { x: 18, z: -618, y: 220.0 },
      { x: 16, z: -545, y: 166.8 },
      { x: 26, z: -455, y: 148.0 },
      { x: 20, z: -368, y: 124.0 },
      { x: 10, z: -292, y: 66.0 },
      { x: 34, z: -248, y: 34.8 },
      { x: 46, z: -198, y: 10.8 },
      { x: 46, z: -178, y: 0.4 },
    ],
  },
  {
    id: 'STREAM_WEST_CASCADE',
    name: 'Nilagiri Emerald Brook',
    halfWidth: 2.8,
    points: [
      { x: -288, z: -472, y: 212.0 },
      { x: -232, z: -386, y: 128.0 },
      { x: -165, z: -312, y: 94.0 },
      { x: -102, z: -242, y: 50.8 },
      { x: -72, z: -192, y: 14.0 },
      { x: -58, z: -168, y: 0.4 },
    ],
  },
  {
    id: 'STREAM_EAST_SPRING',
    name: 'Suryodaya Crystal Stream',
    halfWidth: 2.8,
    points: [
      { x: 278, z: -500, y: 156.8 },
      { x: 228, z: -412, y: 126.0 },
      { x: 178, z: -328, y: 106.0 },
      { x: 130, z: -245, y: 54.8 },
      { x: 86, z: -206, y: 20.0 },
      { x: 52, z: -182, y: 2.0 },
    ],
  },
  {
    id: 'STREAM_NORTH_ALPINE',
    name: 'Kailasha Snowmelt Creek',
    halfWidth: 2.6,
    points: [
      { x: -198, z: -700, y: 214.8 },
      { x: -135, z: -648, y: 176.0 },
      { x: -76, z: -578, y: 158.0 },
      { x: -12, z: -540, y: 164.0 },
      { x: 16, z: -545, y: 166.8 },
    ],
  },
];

const _STREAM_SEGMENTS: FlatTrailSegment[] = [];
for (const st of MOUNTAIN_STREAMS) {
  for (let i = 0; i < st.points.length - 1; i++) {
    const a = st.points[i];
    const b = st.points[i + 1];
    const pad = st.halfWidth + 4.5;
    _STREAM_SEGMENTS.push({
      x0: a.x,
      z0: a.z,
      y0: a.y,
      x1: b.x,
      z1: b.z,
      y1: b.y,
      dx: b.x - a.x,
      dz: b.z - a.z,
      lenSq: Math.max(1e-4, (b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z)),
      halfWidth: st.halfWidth,
      minX: Math.min(a.x, b.x) - pad,
      maxX: Math.max(a.x, b.x) + pad,
      minZ: Math.min(a.z, b.z) - pad,
      maxZ: Math.max(a.z, b.z) + pad,
    });
  }
}

function smoothMax(a: number, b: number, k = 22): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

export function mountainTrailProximity(
  x: number,
  z: number
): { dist: number; trailY: number; halfWidth: number } {
  let bestDist = Infinity;
  let bestY = 0;
  let bestHw = 3.8;
  let weightedY = 0;
  let weightSum = 0;

  for (let i = 0; i < _TRAIL_SEGMENTS.length; i++) {
    const s = _TRAIL_SEGMENTS[i];
    if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
    const t = Math.max(0, Math.min(1, ((x - s.x0) * s.dx + (z - s.z0) * s.dz) / s.lenSq));
    const px = s.x0 + s.dx * t;
    const pz = s.z0 + s.dz * t;
    const d = Math.hypot(x - px, z - pz);
    const py = s.y0 + (s.y1 - s.y0) * t;
    if (d < bestDist) {
      bestDist = d;
      bestY = py;
      bestHw = s.halfWidth;
    }
    const outer = s.halfWidth + 7.5;
    if (d < outer) {
      const w = 1 - smoothstep(s.halfWidth * 0.65, outer, d);
      weightedY += py * w;
      weightSum += w;
    }
  }

  return {
    dist: bestDist,
    trailY: weightSum > 0.001 ? weightedY / weightSum : bestY,
    halfWidth: bestHw,
  };
}

export function mountainStreamProximity(
  x: number,
  z: number
): { dist: number; streamY: number; halfWidth: number } {
  let bestDist = Infinity;
  let bestY = 0;
  let bestHw = 3.0;
  for (let i = 0; i < _STREAM_SEGMENTS.length; i++) {
    const s = _STREAM_SEGMENTS[i];
    if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
    const t = Math.max(0, Math.min(1, ((x - s.x0) * s.dx + (z - s.z0) * s.dz) / s.lenSq));
    const px = s.x0 + s.dx * t;
    const pz = s.z0 + s.dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < bestDist) {
      bestDist = d;
      bestY = s.y0 + (s.y1 - s.y0) * t;
      bestHw = s.halfWidth;
    }
  }
  return { dist: bestDist, streamY: bestY, halfWidth: bestHw };
}

export function mountainGardenProximity(
  x: number,
  z: number
): { dist: number; garden: MountainGardenSpec | null } {
  let bestDist = Infinity;
  let best: MountainGardenSpec | null = null;
  for (let i = 0; i < MOUNTAIN_GARDENS.length; i++) {
    const g = MOUNTAIN_GARDENS[i];
    const d = Math.hypot(x - g.x, z - g.z);
    if (d < bestDist) {
      bestDist = d;
      best = g;
    }
  }
  return { dist: bestDist, garden: best };
}

export function mountainCaveProximity(
  x: number,
  z: number
): { dist: number; cave: MountainCaveSpec | null } {
  let bestDist = Infinity;
  let best: MountainCaveSpec | null = null;
  for (let i = 0; i < MOUNTAIN_CAVES.length; i++) {
    const c = MOUNTAIN_CAVES[i];
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return { dist: bestDist, cave: best };
}

function mountainHeightContributionAt(x: number, z: number): number {
  // Zero mountain contribution south of palace stable boundary (z >= -156)
  if (z >= -156 || x < -650 || x > 650) return 0;

  const entryFade = smoothstep(-156, -196, z);
  const sideFade = (1 - smoothstep(460, 620, Math.abs(x)));
  const envMask = entryFade * sideFade;
  if (envMask <= 0.0001) return 0;

  let mtnH = 0;
  for (let i = 0; i < _FLAT_LOBES.length; i++) {
    const l = _FLAT_LOBES[i];
    const dx = x - l.cx;
    const dz = z - l.cz;
    if (Math.abs(dx) > l.maxR || Math.abs(dz) > l.maxR) continue;
    const ux = dx * l.cosR - dz * l.sinR;
    const uz = dx * l.sinR + dz * l.cosR;
    const q = ux * ux * l.invRxSq + uz * uz * l.invRzSq;
    if (q >= 1.35) continue;
    const t = 1 - q / 1.35;
    const dome = l.height * Math.pow(t, l.sharpness);
    const crag =
      (Math.sin(ux * 0.055 + uz * 0.042) * 0.55 + Math.cos(ux * 0.095 - uz * 0.078) * 0.45) *
      9.5 *
      t;
    const lobeVal = Math.max(0, dome + crag);
    mtnH = smoothMax(mtnH, lobeVal, 20);
  }

  let h = mtnH * envMask;

  // Blend structured climbable trails cleanly into mountain slopes
  const tr = mountainTrailProximity(x, z);
  if (tr.dist < tr.halfWidth + 8.5) {
    const w = 1 - smoothstep(tr.halfWidth * 0.92, tr.halfWidth + 8.5, tr.dist);
    h = h * (1 - w) + tr.trailY * w;
  }

  // Blend terraced mountain gardens flat onto their shoulder pads
  for (let i = 0; i < MOUNTAIN_GARDENS.length; i++) {
    const g = MOUNTAIN_GARDENS[i];
    const d = Math.hypot(x - g.x, z - g.z);
    if (d < g.radius + 9.0) {
      const gw = 1 - smoothstep(g.radius * 0.85, g.radius + 9.0, d);
      h = h * (1 - gw) + g.y * gw;
    }
  }

  // Carve flat walkable cave entrance & interior cavern floor pads
  for (let i = 0; i < MOUNTAIN_CAVES.length; i++) {
    const c = MOUNTAIN_CAVES[i];
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < c.radius + 6.5) {
      const cw = 1 - smoothstep(c.radius * 0.8, c.radius + 6.5, d);
      h = h * (1 - cw) + c.y * cw;
    }
  }

  // Gently carve shallow rocky stream channels along flowing alpine brooks
  const st = mountainStreamProximity(x, z);
  if (st.dist < st.halfWidth + 2.8) {
    const sw = 1 - smoothstep(st.halfWidth * 0.5, st.halfWidth + 2.8, st.dist);
    const bedDepth = st.dist < st.halfWidth * 0.65 ? 0.65 : 0.3;
    h = Math.max(0.02, h * (1 - sw * 0.72) + (st.streamY - bedDepth) * (sw * 0.72));
  }

  return h;
}
