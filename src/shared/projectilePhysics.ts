export type ProjectileArchetypeId =
  | 'ARROW'
  | 'CHAKRA'
  | 'AGNEYASTRA'
  | 'VARUNASTRA'
  | 'VAYAVYASTRA'
  | 'NAGASTRA'
  | 'NAGASTRA_SERPENT'
  | 'BRAHMASTRA';

export interface ProjectilePhysicsProfile {
  archetype: ProjectileArchetypeId;
  label: string;
  speed: number;
  gravity: number;
  drag: number;
  maxLifeSec: number;
  cooldownSec: number;
  hitRadius: number;
  aoeRadius: number;
  directDamage: number;
  splashDamage: number;
  dotDamagePerSec: number;
  effectDurationSec: number;
  knockbackForce: number;
  liftHeight: number;
  splitCount: number;
  lateralCurveAccel: number;
  returnAfterSec: number;
  spinRadPerSec: number;
  homingTurnRate: number;
  slitherFreq: number;
  slitherAmp: number;
  heatPullRadius: number;
}

export interface ProjectileKinematicsState {
  archetype: ProjectileArchetypeId;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  elapsedSec: number;
  spinAngle: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface EnemyActorSnapshot {
  id: string;
  x: number;
  y: number;
  z: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  isCommander: boolean;
  customScale: number;
}

export interface AuthorizedHitDirective {
  enemyId: string;
  damage: number;
  isDirect: boolean;
  applyBurnDps: number;
  applyBindSec: number;
  applyBurnSec: number;
  extinguishFire: boolean;
  knockbackX: number;
  knockbackZ: number;
  liftHeight: number;
}

export interface ProjectileRegisterRequest {
  sessionId: string;
  clientShotId: string;
  archetype: ProjectileArchetypeId;
  origin: Vec3Like;
  direction: Vec3Like;
  casterPos: Vec3Like;
  stealthAmbush: boolean;
  clientTimestampMs: number;
  parentClientShotId?: string | null;
  homingTargetId?: string | null;
  enemies?: EnemyActorSnapshot[];
}

export interface ProjectileRegisterResponse {
  accepted: boolean;
  projectileId: string;
  clientShotId: string;
  archetype: ProjectileArchetypeId;
  deduplicated?: boolean;
  rejectionReason?: string;
  serverTimeMs: number;
  authoritativeSpeed: number;
}

export type ProjectileHitKind = 'ENEMY' | 'ENVIRONMENT' | 'EXPIRED';

export interface ProjectileImpactValidationRequest {
  sessionId: string;
  clientShotId: string;
  archetype: ProjectileArchetypeId;
  elapsedFlightSec: number;
  hitKind: ProjectileHitKind;
  reportedHitPos: Vec3Like;
  reportedEnemyId: string | null;
  casterPos: Vec3Like;
  homingTargetId?: string | null;
  enemies?: EnemyActorSnapshot[];
}

export interface ProjectileImpactValidationResponse {
  accepted: boolean;
  clientShotId: string;
  archetype: ProjectileArchetypeId;
  alreadyResolved?: boolean;
  rejectionReason?: string;
  trajectoryErrorM: number;
  maxAllowedErrorM: number;
  serverSimulatedPos: Vec3Like;
  serverHitPos: Vec3Like;
  authorizedHits: AuthorizedHitDirective[];
  totalAuthorizedDamage: number;
  karmaAwarded: number;
  allowSplitSerpents: boolean;
  serverTimeMs: number;
}

export const PROJECTILE_PHYSICS_REGISTRY: Record<
  ProjectileArchetypeId,
  ProjectilePhysicsProfile
> = {
  ARROW: {
    archetype: 'ARROW',
    label: 'Sharnga Arrow',
    speed: 48,
    gravity: 9.8,
    drag: 0.08,
    maxLifeSec: 1.65,
    cooldownSec: 0.22,
    hitRadius: 0.16,
    aoeRadius: 0,
    directDamage: 32,
    splashDamage: 0,
    dotDamagePerSec: 0,
    effectDurationSec: 0,
    knockbackForce: 0,
    liftHeight: 0,
    splitCount: 0,
    lateralCurveAccel: 0,
    returnAfterSec: 0,
    spinRadPerSec: 0,
    homingTurnRate: 0,
    slitherFreq: 0,
    slitherAmp: 0,
    heatPullRadius: 0,
  },
  CHAKRA: {
    archetype: 'CHAKRA',
    label: 'Sudarshan Chakra',
    speed: 34,
    gravity: 0.0,
    drag: 0.02,
    maxLifeSec: 1.75,
    cooldownSec: 8.5,
    hitRadius: 0.56,
    aoeRadius: 10.0,
    directDamage: 95,
    splashDamage: 85,
    dotDamagePerSec: 0,
    effectDurationSec: 0,
    knockbackForce: 6,
    liftHeight: 0,
    splitCount: 0,
    lateralCurveAccel: 11.5,
    returnAfterSec: 0.85,
    spinRadPerSec: 26.0,
    homingTurnRate: 5.5,
    slitherFreq: 0,
    slitherAmp: 0,
    heatPullRadius: 0,
  },
  AGNEYASTRA: {
    archetype: 'AGNEYASTRA',
    label: 'Agneyastra',
    speed: 46,
    gravity: 3.2,
    drag: 0.04,
    maxLifeSec: 1.45,
    cooldownSec: 3.8,
    hitRadius: 0.42,
    aoeRadius: 8.2,
    directDamage: 86,
    splashDamage: 74,
    dotDamagePerSec: 18,
    effectDurationSec: 4.0,
    knockbackForce: 5,
    liftHeight: 0,
    splitCount: 1,
    lateralCurveAccel: 0,
    returnAfterSec: 0,
    spinRadPerSec: 8.2,
    homingTurnRate: 0,
    slitherFreq: 0,
    slitherAmp: 0,
    heatPullRadius: 11.5,
  },
  VARUNASTRA: {
    archetype: 'VARUNASTRA',
    label: 'Varunastra',
    speed: 44,
    gravity: 4.6,
    drag: 0.14,
    maxLifeSec: 1.45,
    cooldownSec: 4.2,
    hitRadius: 0.46,
    aoeRadius: 9.0,
    directDamage: 54,
    splashDamage: 50,
    dotDamagePerSec: 0,
    effectDurationSec: 2.2,
    knockbackForce: 18,
    liftHeight: 0,
    splitCount: 1,
    lateralCurveAccel: 0,
    returnAfterSec: 0,
    spinRadPerSec: 4.5,
    homingTurnRate: 0,
    slitherFreq: 0,
    slitherAmp: 0,
    heatPullRadius: 0,
  },
  VAYAVYASTRA: {
    archetype: 'VAYAVYASTRA',
    label: 'Vayavyastra',
    speed: 52,
    gravity: 0.8,
    drag: 0.01,
    maxLifeSec: 1.45,
    cooldownSec: 5.1,
    hitRadius: 0.40,
    aoeRadius: 9.5,
    directDamage: 42,
    splashDamage: 24,
    dotDamagePerSec: 18,
    effectDurationSec: 3.4,
    knockbackForce: 0,
    liftHeight: 4.8,
    splitCount: 1,
    lateralCurveAccel: 0,
    returnAfterSec: 0,
    spinRadPerSec: 12.0,
    homingTurnRate: 0,
    slitherFreq: 4.0,
    slitherAmp: 0.55,
    heatPullRadius: 0,
  },
  NAGASTRA: {
    archetype: 'NAGASTRA',
    label: 'Nagastra',
    speed: 42,
    gravity: 2.8,
    drag: 0.05,
    maxLifeSec: 1.45,
    cooldownSec: 5.5,
    hitRadius: 0.34,
    aoeRadius: 14.0,
    directDamage: 38,
    splashDamage: 28,
    dotDamagePerSec: 14,
    effectDurationSec: 2.8,
    knockbackForce: 0,
    liftHeight: 0,
    splitCount: 4,
    lateralCurveAccel: 0,
    returnAfterSec: 0,
    spinRadPerSec: 3.0,
    homingTurnRate: 0,
    slitherFreq: 7.5,
    slitherAmp: 1.2,
    heatPullRadius: 0,
  },
  NAGASTRA_SERPENT: {
    archetype: 'NAGASTRA_SERPENT',
    label: 'Nagastra Cobra',
    speed: 24,
    gravity: 1.2,
    drag: 0.04,
    maxLifeSec: 1.9,
    cooldownSec: 0,
    hitRadius: 0.34,
    aoeRadius: 0,
    directDamage: 28,
    splashDamage: 28,
    dotDamagePerSec: 14,
    effectDurationSec: 2.8,
    knockbackForce: 0,
    liftHeight: 0,
    splitCount: 0,
    lateralCurveAccel: 0,
    returnAfterSec: 0,
    spinRadPerSec: 0,
    homingTurnRate: 9.0,
    slitherFreq: 11.5,
    slitherAmp: 2.4,
    heatPullRadius: 0,
  },
  BRAHMASTRA: {
    archetype: 'BRAHMASTRA',
    label: 'Brahmastra',
    speed: 64,
    gravity: 0.0,
    drag: 0.0,
    maxLifeSec: 1.8,
    cooldownSec: 24.0,
    hitRadius: 0.80,
    aoeRadius: 18.0,
    directDamage: 320,
    splashDamage: 240,
    dotDamagePerSec: 0,
    effectDurationSec: 5.0,
    knockbackForce: 28,
    liftHeight: 0,
    splitCount: 1,
    lateralCurveAccel: 0,
    returnAfterSec: 0,
    spinRadPerSec: 14.0,
    homingTurnRate: 0,
    slitherFreq: 0,
    slitherAmp: 0,
    heatPullRadius: 0,
  },
};

export function isValidProjectileArchetype(
  val: unknown
): val is ProjectileArchetypeId {
  return (
    typeof val === 'string' &&
    Object.prototype.hasOwnProperty.call(PROJECTILE_PHYSICS_REGISTRY, val)
  );
}

/**
 * Pure, allocation-free deterministic kinematics step shared identically
 * between client prediction and server trajectory validation.
 */
export function stepProjectileKinematics(
  state: ProjectileKinematicsState,
  dt: number,
  targetPos: Vec3Like | null,
  casterPos: Vec3Like | null
): void {
  if (dt <= 0) return;
  const profile = PROJECTILE_PHYSICS_REGISTRY[state.archetype];
  state.elapsedSec += dt;
  state.spinAngle += profile.spinRadPerSec * dt;

  // 1. Homing serpent steering
  if (state.archetype === 'NAGASTRA_SERPENT') {
    if (targetPos) {
      const tx = targetPos.x - state.x;
      const ty = targetPos.y + 1.1 - state.y;
      const tz = targetPos.z - state.z;
      const len = Math.max(0.1, Math.hypot(tx, ty, tz));
      const steer = 1 - Math.exp(-profile.homingTurnRate * dt);
      const desVx = (tx / len) * profile.speed;
      const desVy = (ty / len) * profile.speed;
      const desVz = (tz / len) * profile.speed;
      state.vx += (desVx - state.vx) * steer;
      state.vy += (desVy - state.vy) * steer;
      state.vz += (desVz - state.vz) * steer;
    } else {
      state.vy -= profile.gravity * dt;
    }
  } else {
    // 2. Vertical gravity drop
    state.vy -= profile.gravity * dt;
  }

  // 3. Sudarshan Chakra gyroscopic boomerang curve & orbital return
  if (state.archetype === 'CHAKRA') {
    const horizSpeed = Math.hypot(state.vx, state.vz);
    if (horizSpeed > 0.2) {
      const nx = state.vx / horizSpeed;
      const nz = state.vz / horizSpeed;
      if (state.elapsedSec < profile.returnAfterSec) {
        // Outbound crescent curve via right-hand perpendicular Magnus thrust
        const latX = -nz;
        const latZ = nx;
        state.vx += latX * profile.lateralCurveAccel * dt;
        state.vz += latZ * profile.lateralCurveAccel * dt;
      } else if (casterPos) {
        // Boomerang return arc toward caster height plane
        const rx = casterPos.x - state.x;
        const ry = casterPos.y + 1.45 - state.y;
        const rz = casterPos.z - state.z;
        const dist = Math.hypot(rx, ry, rz);
        if (dist > 1.2) {
          const steer = 1 - Math.exp(-profile.homingTurnRate * dt);
          state.vx += ((rx / dist) * profile.speed - state.vx) * steer;
          state.vy += ((ry / dist) * profile.speed - state.vy) * steer;
          state.vz += ((rz / dist) * profile.speed - state.vz) * steer;
        }
      }
    }
  }

  // 4. Serpentine / gale lateral wave weave
  if (profile.slitherAmp > 0 && profile.slitherFreq > 0) {
    const hSpd = Math.hypot(state.vx, state.vz);
    if (hSpd > 0.5) {
      const px = -state.vz / hSpd;
      const pz = state.vx / hSpd;
      const wave =
        Math.cos(state.elapsedSec * profile.slitherFreq) *
        profile.slitherAmp *
        dt;
      state.vx += px * wave * 6.0;
      state.vz += pz * wave * 6.0;
    }
  }

  // 5. Aerodynamic / hydro drag
  if (profile.drag > 0) {
    const damp = Math.exp(-profile.drag * dt);
    state.vx *= damp;
    state.vy *= damp;
    state.vz *= damp;
  }

  // 6. Semi-implicit Euler position integration
  state.x += state.vx * dt;
  state.y += state.vy * dt;
  state.z += state.vz * dt;
}

/**
 * Continuous ray-segment vs bounding capsule intersection test.
 * Returns normalized t in [0, 1] along segment A->B, or null if no hit.
 */
export function intersectSegmentCapsule(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  ex: number,
  ez: number,
  capRadius: number,
  minY: number,
  maxY: number
): number | null {
  const segDx = bx - ax;
  const segDy = by - ay;
  const segDz = bz - az;
  const xzSq = segDx * segDx + segDz * segDz;

  let t = 1.0;
  if (xzSq > 1e-7) {
    const rawT = ((ex - ax) * segDx + (ez - az) * segDz) / xzSq;
    t = rawT < 0 ? 0 : rawT > 1 ? 1 : rawT;
  }

  const px = ax + segDx * t;
  const py = ay + segDy * t;
  const pz = az + segDz * t;
  const dx = px - ex;
  const dz = pz - ez;

  if (
    dx * dx + dz * dz <= capRadius * capRadius &&
    py >= minY - 0.25 &&
    py <= maxY + 0.25
  ) {
    return t;
  }
  return null;
}

/**
 * Closest point on segment A->B to query point P, returning squared distance and clamped t.
 */
export function distanceSqPointToSegment(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number
): { distSq: number; t: number; cx: number; cy: number; cz: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const abLenSq = abx * abx + aby * aby + abz * abz;
  let t = 0;
  if (abLenSq > 1e-8) {
    const raw =
      ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / abLenSq;
    t = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  }
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  const cz = az + abz * t;
  const dx = px - cx;
  const dy = py - cy;
  const dz = pz - cz;
  return {
    distSq: dx * dx + dy * dy + dz * dz,
    t,
    cx,
    cy,
    cz,
  };
}

/**
 * Computes authoritative hit & AoE damage directives for a validated impact point.
 */
export function computeAuthoritativeHits(
  archetype: ProjectileArchetypeId,
  hitX: number,
  hitZ: number,
  directEnemyId: string | null,
  stealthAmbush: boolean,
  enemies: readonly EnemyActorSnapshot[]
): {
  hits: AuthorizedHitDirective[];
  totalDamage: number;
  karmaAwarded: number;
} {
  const profile = PROJECTILE_PHYSICS_REGISTRY[archetype];
  const stealthMult = stealthAmbush ? 2.0 : 1.0;
  const hits: AuthorizedHitDirective[] = [];
  let totalDamage = 0;

  if (profile.aoeRadius > 0) {
    const rSq = profile.aoeRadius * profile.aoeRadius;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.alive) continue;
      const dx = e.x - hitX;
      const dz = e.z - hitZ;
      const dSq = dx * dx + dz * dz;
      if (dSq > rSq) continue;

      const isDirect = directEnemyId !== null && e.id === directEnemyId;
      // Vayavyastra whirlwind handles radial damage via tornado DoT ticks unless direct hit
      if (archetype === 'VAYAVYASTRA' && !isDirect) continue;
      // Nagastra main impact deals direct hit damage then spawns split serpents
      if (archetype === 'NAGASTRA' && !isDirect) continue;

      const baseDmg = isDirect ? profile.directDamage : profile.splashDamage;
      const damage = Math.round(baseDmg * stealthMult);
      let knockbackX = 0;
      let knockbackZ = 0;
      if (
        (archetype === 'VARUNASTRA' || archetype === 'BRAHMASTRA') &&
        profile.knockbackForce > 0
      ) {
        const dist = Math.max(0.4, Math.sqrt(dSq));
        const pushFactor =
          archetype === 'VARUNASTRA'
            ? profile.knockbackForce * 0.42 * (1 - dist / (profile.aoeRadius + 1))
            : profile.knockbackForce * 0.48 * (1 - dist / (profile.aoeRadius + 2));
        knockbackX = (dx / dist) * pushFactor;
        knockbackZ = (dz / dist) * pushFactor;
      }

      hits.push({
        enemyId: e.id,
        damage,
        isDirect,
        applyBurnDps: archetype === 'AGNEYASTRA' ? profile.dotDamagePerSec : 0,
        applyBurnSec: archetype === 'AGNEYASTRA' ? profile.effectDurationSec : 0,
        applyBindSec: archetype === 'NAGASTRA' && isDirect ? profile.effectDurationSec : 0,
        extinguishFire: archetype === 'VARUNASTRA',
        knockbackX,
        knockbackZ,
        liftHeight: archetype === 'VAYAVYASTRA' ? profile.liftHeight : 0,
      });
      totalDamage += damage;
    }
  } else if (directEnemyId !== null) {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.alive || e.id !== directEnemyId) continue;
      const damage = Math.round(profile.directDamage * stealthMult);
      const isSerpent = archetype === 'NAGASTRA_SERPENT';
      hits.push({
        enemyId: e.id,
        damage,
        isDirect: true,
        applyBurnDps: isSerpent ? profile.dotDamagePerSec : 0,
        applyBurnSec: isSerpent ? profile.effectDurationSec : 0,
        applyBindSec: isSerpent ? profile.effectDurationSec : 0,
        extinguishFire: false,
        knockbackX: 0,
        knockbackZ: 0,
        liftHeight: 0,
      });
      totalDamage += damage;
      break;
    }
  }

  const karmaAwarded =
    stealthAmbush && directEnemyId !== null && archetype === 'ARROW' ? 15 : 0;

  return { hits, totalDamage, karmaAwarded };
}
