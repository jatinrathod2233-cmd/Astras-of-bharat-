import {
  PROJECTILE_PHYSICS_REGISTRY,
  computeAuthoritativeHits,
  distanceSqPointToSegment,
  intersectSegmentCapsule,
  isValidProjectileArchetype,
  stepProjectileKinematics,
} from '../shared/projectilePhysics.ts';
import type {
  EnemyActorSnapshot,
  ProjectileArchetypeId,
  ProjectileHitKind,
  ProjectileImpactValidationRequest,
  ProjectileImpactValidationResponse,
  ProjectileKinematicsState,
  ProjectileRegisterRequest,
  ProjectileRegisterResponse,
  Vec3Like,
} from '../shared/projectilePhysics.ts';

const ID_PATTERN = /^[a-zA-Z0-9_-]{4,64}$/;
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;
const MAX_SESSIONS = 400;
const SESSION_TTL_MS = 15 * 60 * 1000;
const MAX_PROJECTILES_PER_SESSION = 120;
const MAX_ENEMIES_PER_SYNC = 96;
const FIXED_SIM_DT = 1 / 60;

interface RegisteredProjectileRecord {
  projectileId: string;
  clientShotId: string;
  archetype: ProjectileArchetypeId;
  initialState: ProjectileKinematicsState;
  casterOrigin: Vec3Like;
  stealthAmbush: boolean;
  homingTargetId: string | null;
  parentClientShotId: string | null;
  splitChildrenCount: number;
  registeredAtMs: number;
  resolved: boolean;
  cachedResult: ProjectileImpactValidationResponse | null;
}

interface SessionCombatState {
  sessionId: string;
  lastActiveMs: number;
  lastShotByArchetypeMs: Partial<Record<ProjectileArchetypeId, number>>;
  lastCasterPos: Vec3Like;
  enemies: Map<string, EnemyActorSnapshot>;
  projectiles: Map<string, RegisteredProjectileRecord>;
  projectileOrder: string[];
  shotCounter: number;
}

function isFiniteCoord(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 5000;
}

function parseVec3(raw: unknown): Vec3Like | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!isFiniteCoord(obj.x) || !isFiniteCoord(obj.y) || !isFiniteCoord(obj.z)) {
    return null;
  }
  return { x: obj.x, y: obj.y, z: obj.z };
}

function sanitizeEnemies(raw: unknown): EnemyActorSnapshot[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const count = Math.min(raw.length, MAX_ENEMIES_PER_SYNC);
  const out: EnemyActorSnapshot[] = [];
  for (let i = 0; i < count; i++) {
    const item = raw[i];
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;
    if (typeof e.id !== 'string' || !ID_PATTERN.test(e.id)) continue;
    if (!isFiniteCoord(e.x) || !isFiniteCoord(e.y) || !isFiniteCoord(e.z)) {
      continue;
    }
    const maxHp =
      typeof e.maxHp === 'number' && Number.isFinite(e.maxHp)
        ? Math.max(1, Math.min(100000, e.maxHp))
        : 100;
    const hp =
      typeof e.hp === 'number' && Number.isFinite(e.hp)
        ? Math.max(0, Math.min(maxHp, e.hp))
        : maxHp;
    const customScale =
      typeof e.customScale === 'number' && Number.isFinite(e.customScale)
        ? Math.max(0.4, Math.min(4.0, e.customScale))
        : 1.0;
    out.push({
      id: e.id,
      x: e.x,
      y: e.y,
      z: e.z,
      hp,
      maxHp,
      alive: Boolean(e.alive),
      isCommander: Boolean(e.isCommander),
      customScale,
    });
  }
  return out;
}

export class ProjectileAuthorityService {
  private sessions: Map<string, SessionCombatState>;

  constructor() {
    this.sessions = new Map();
  }

  private pruneOldSessions(nowMs: number): void {
    if (this.sessions.size < MAX_SESSIONS) return;
    for (const [sid, session] of this.sessions.entries()) {
      if (nowMs - session.lastActiveMs > SESSION_TTL_MS) {
        this.sessions.delete(sid);
      }
    }
    if (this.sessions.size >= MAX_SESSIONS) {
      let oldestId: string | null = null;
      let oldestTime = Infinity;
      for (const [sid, session] of this.sessions.entries()) {
        if (session.lastActiveMs < oldestTime) {
          oldestTime = session.lastActiveMs;
          oldestId = sid;
        }
      }
      if (oldestId) this.sessions.delete(oldestId);
    }
  }

  private getOrCreateSession(sessionId: string, nowMs: number): SessionCombatState {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.lastActiveMs = nowMs;
      return existing;
    }
    this.pruneOldSessions(nowMs);
    const created: SessionCombatState = {
      sessionId,
      lastActiveMs: nowMs,
      lastShotByArchetypeMs: {},
      lastCasterPos: { x: 0, y: 0, z: 14 },
      enemies: new Map(),
      projectiles: new Map(),
      projectileOrder: [],
      shotCounter: 0,
    };
    this.sessions.set(sessionId, created);
    return created;
  }

  private mergeSessionEnemies(
    session: SessionCombatState,
    enemies: EnemyActorSnapshot[]
  ): void {
    if (enemies.length === 0) return;
    // Refresh authoritative actor snapshot cleanly without unbounded growth
    if (enemies.length >= 12) {
      session.enemies.clear();
    }
    for (let i = 0; i < enemies.length; i++) {
      session.enemies.set(enemies[i].id, enemies[i]);
    }
    if (session.enemies.size > MAX_ENEMIES_PER_SYNC * 2) {
      const keys = Array.from(session.enemies.keys());
      for (let i = 0; i < keys.length - MAX_ENEMIES_PER_SYNC; i++) {
        session.enemies.delete(keys[i]);
      }
    }
  }

  public syncActors(body: unknown): {
    ok: boolean;
    error?: string;
    enemyCount: number;
    serverTimeMs: number;
  } {
    const nowMs = Date.now();
    if (!body || typeof body !== 'object') {
      return { ok: false, error: 'INVALID_BODY', enemyCount: 0, serverTimeMs: nowMs };
    }
    const obj = body as Record<string, unknown>;
    if (typeof obj.sessionId !== 'string' || !SESSION_ID_PATTERN.test(obj.sessionId)) {
      return { ok: false, error: 'INVALID_SESSION_ID', enemyCount: 0, serverTimeMs: nowMs };
    }
    const casterPos = parseVec3(obj.casterPos);
    if (!casterPos) {
      return { ok: false, error: 'INVALID_CASTER_POS', enemyCount: 0, serverTimeMs: nowMs };
    }
    const enemies = sanitizeEnemies(obj.enemies);
    if (!enemies) {
      return { ok: false, error: 'INVALID_ENEMIES', enemyCount: 0, serverTimeMs: nowMs };
    }

    const session = this.getOrCreateSession(obj.sessionId, nowMs);
    session.lastCasterPos = casterPos;
    this.mergeSessionEnemies(session, enemies);

    return {
      ok: true,
      enemyCount: session.enemies.size,
      serverTimeMs: nowMs,
    };
  }

  public registerProjectile(body: unknown): {
    status: number;
    payload: ProjectileRegisterResponse;
  } {
    const nowMs = Date.now();
    const invalidFallback = (
      reason: string,
      status = 400
    ): { status: number; payload: ProjectileRegisterResponse } => ({
      status,
      payload: {
        accepted: false,
        projectileId: '',
        clientShotId: '',
        archetype: 'ARROW',
        rejectionReason: reason,
        serverTimeMs: nowMs,
        authoritativeSpeed: 0,
      },
    });

    if (!body || typeof body !== 'object') {
      return invalidFallback('INVALID_BODY');
    }
    const req = body as Partial<ProjectileRegisterRequest>;
    if (typeof req.sessionId !== 'string' || !SESSION_ID_PATTERN.test(req.sessionId)) {
      return invalidFallback('INVALID_SESSION_ID');
    }
    if (typeof req.clientShotId !== 'string' || !ID_PATTERN.test(req.clientShotId)) {
      return invalidFallback('INVALID_SHOT_ID');
    }
    if (!isValidProjectileArchetype(req.archetype)) {
      return invalidFallback('INVALID_ARCHETYPE');
    }

    const origin = parseVec3(req.origin);
    const dirRaw = parseVec3(req.direction);
    const casterPos = parseVec3(req.casterPos);
    if (!origin || !dirRaw || !casterPos) {
      return invalidFallback('INVALID_VECTOR');
    }

    const dirLen = Math.hypot(dirRaw.x, dirRaw.y, dirRaw.z);
    if (dirLen < 1e-4) {
      return invalidFallback('ZERO_DIRECTION');
    }
    const dirX = dirRaw.x / dirLen;
    const dirY = dirRaw.y / dirLen;
    const dirZ = dirRaw.z / dirLen;

    const enemies = sanitizeEnemies(req.enemies);
    if (!enemies) {
      return invalidFallback('INVALID_ENEMIES');
    }

    const session = this.getOrCreateSession(req.sessionId, nowMs);

    // Idempotent deduplication by clientShotId
    const existing = session.projectiles.get(req.clientShotId);
    if (existing) {
      return {
        status: 200,
        payload: {
          accepted: true,
          projectileId: existing.projectileId,
          clientShotId: existing.clientShotId,
          archetype: existing.archetype,
          deduplicated: true,
          serverTimeMs: nowMs,
          authoritativeSpeed: PROJECTILE_PHYSICS_REGISTRY[existing.archetype].speed,
        },
      };
    }

    const profile = PROJECTILE_PHYSICS_REGISTRY[req.archetype];

    // Enforce split serpent parent authorization & count budget
    let parentShotId: string | null = null;
    if (req.archetype === 'NAGASTRA_SERPENT') {
      if (
        typeof req.parentClientShotId === 'string' &&
        ID_PATTERN.test(req.parentClientShotId)
      ) {
        const parent = session.projectiles.get(req.parentClientShotId);
        if (parent && parent.archetype === 'NAGASTRA') {
          const maxSplits = PROJECTILE_PHYSICS_REGISTRY.NAGASTRA.splitCount;
          if (parent.splitChildrenCount >= maxSplits) {
            return {
              status: 429,
              payload: {
                accepted: false,
                projectileId: '',
                clientShotId: req.clientShotId,
                archetype: req.archetype,
                rejectionReason: 'SPLIT_QUOTA_EXCEEDED',
                serverTimeMs: nowMs,
                authoritativeSpeed: profile.speed,
              },
            };
          }
          parent.splitChildrenCount += 1;
          parentShotId = req.parentClientShotId;
        }
      }
      // Check spawn distance from caster OR parent position (if serpent spawned at impact)
      const spawnDistFromCaster = Math.hypot(
        origin.x - casterPos.x,
        origin.y - casterPos.y,
        origin.z - casterPos.z
      );
      if (!parentShotId && spawnDistFromCaster > 85) {
        return {
          status: 400,
          payload: {
            accepted: false,
            projectileId: '',
            clientShotId: req.clientShotId,
            archetype: req.archetype,
            rejectionReason: 'SERPENT_SPAWN_OUT_OF_RANGE',
            serverTimeMs: nowMs,
            authoritativeSpeed: profile.speed,
          },
        };
      }
    } else {
      // Standard projectile spawn must originate close to caster body/chariot
      const spawnDist = Math.hypot(
        origin.x - casterPos.x,
        origin.y - casterPos.y,
        origin.z - casterPos.z
      );
      if (spawnDist > 6.0) {
        return {
          status: 400,
          payload: {
            accepted: false,
            projectileId: '',
            clientShotId: req.clientShotId,
            archetype: req.archetype,
            rejectionReason: 'SPAWN_OFFSET_EXCEEDED',
            serverTimeMs: nowMs,
            authoritativeSpeed: profile.speed,
          },
        };
      }

      // Per-archetype server rate/cooldown enforcement (with 15% jitter tolerance)
      const lastShotMs = session.lastShotByArchetypeMs[req.archetype] ?? 0;
      const minCooldownMs = profile.cooldownSec * 850;
      if (lastShotMs > 0 && nowMs - lastShotMs < minCooldownMs) {
        return {
          status: 429,
          payload: {
            accepted: false,
            projectileId: '',
            clientShotId: req.clientShotId,
            archetype: req.archetype,
            rejectionReason: 'COOLDOWN_ACTIVE',
            serverTimeMs: nowMs,
            authoritativeSpeed: profile.speed,
          },
        };
      }
      session.lastShotByArchetypeMs[req.archetype] = nowMs;
    }

    session.lastCasterPos = casterPos;
    this.mergeSessionEnemies(session, enemies);

    session.shotCounter += 1;
    const projectileId = `srv_${session.sessionId.slice(0, 8)}_${session.shotCounter}`;
    const homingTargetId =
      typeof req.homingTargetId === 'string' && ID_PATTERN.test(req.homingTargetId)
        ? req.homingTargetId
        : null;

    // Split serpents start at 18 m/s planar burst speed with vy = 3.2 matching RamayanaWorldEngine
    const initVx =
      req.archetype === 'NAGASTRA_SERPENT' ? dirX * 18 : dirX * profile.speed;
    const initVy =
      req.archetype === 'NAGASTRA_SERPENT' ? 3.2 : dirY * profile.speed;
    const initVz =
      req.archetype === 'NAGASTRA_SERPENT' ? dirZ * 18 : dirZ * profile.speed;

    const record: RegisteredProjectileRecord = {
      projectileId,
      clientShotId: req.clientShotId,
      archetype: req.archetype,
      initialState: {
        archetype: req.archetype,
        x: origin.x,
        y: origin.y,
        z: origin.z,
        vx: initVx,
        vy: initVy,
        vz: initVz,
        elapsedSec: 0,
        spinAngle: 0,
      },
      casterOrigin: casterPos,
      stealthAmbush: Boolean(req.stealthAmbush),
      homingTargetId,
      parentClientShotId: parentShotId,
      splitChildrenCount: 0,
      registeredAtMs: nowMs,
      resolved: false,
      cachedResult: null,
    };

    session.projectiles.set(req.clientShotId, record);
    session.projectileOrder.push(req.clientShotId);
    while (session.projectileOrder.length > MAX_PROJECTILES_PER_SESSION) {
      const oldestShotId = session.projectileOrder.shift();
      if (oldestShotId) session.projectiles.delete(oldestShotId);
    }

    return {
      status: 200,
      payload: {
        accepted: true,
        projectileId,
        clientShotId: req.clientShotId,
        archetype: req.archetype,
        serverTimeMs: nowMs,
        authoritativeSpeed: profile.speed,
      },
    };
  }

  public validateImpact(body: unknown): {
    status: number;
    payload: ProjectileImpactValidationResponse;
  } {
    const nowMs = Date.now();
    const failResponse = (
      reason: string,
      clientShotId = '',
      archetype: ProjectileArchetypeId = 'ARROW',
      status = 400
    ): { status: number; payload: ProjectileImpactValidationResponse } => ({
      status,
      payload: {
        accepted: false,
        clientShotId,
        archetype,
        rejectionReason: reason,
        trajectoryErrorM: Infinity,
        maxAllowedErrorM: 0,
        serverSimulatedPos: { x: 0, y: 0, z: 0 },
        serverHitPos: { x: 0, y: 0, z: 0 },
        authorizedHits: [],
        totalAuthorizedDamage: 0,
        karmaAwarded: 0,
        allowSplitSerpents: false,
        serverTimeMs: nowMs,
      },
    });

    if (!body || typeof body !== 'object') {
      return failResponse('INVALID_BODY');
    }
    const req = body as Partial<ProjectileImpactValidationRequest>;
    if (typeof req.sessionId !== 'string' || !SESSION_ID_PATTERN.test(req.sessionId)) {
      return failResponse('INVALID_SESSION_ID');
    }
    if (typeof req.clientShotId !== 'string' || !ID_PATTERN.test(req.clientShotId)) {
      return failResponse('INVALID_SHOT_ID');
    }
    if (!isValidProjectileArchetype(req.archetype)) {
      return failResponse('INVALID_ARCHETYPE', req.clientShotId);
    }

    const reportedHitPos = parseVec3(req.reportedHitPos);
    const casterPos = parseVec3(req.casterPos);
    if (!reportedHitPos || !casterPos) {
      return failResponse('INVALID_VECTOR', req.clientShotId, req.archetype);
    }
    const hitKind: ProjectileHitKind =
      req.hitKind === 'ENEMY' ||
      req.hitKind === 'ENVIRONMENT' ||
      req.hitKind === 'EXPIRED'
        ? req.hitKind
        : 'ENVIRONMENT';

    if (
      typeof req.elapsedFlightSec !== 'number' ||
      !Number.isFinite(req.elapsedFlightSec) ||
      req.elapsedFlightSec < 0
    ) {
      return failResponse('INVALID_ELAPSED_TIME', req.clientShotId, req.archetype);
    }

    const enemies = sanitizeEnemies(req.enemies);
    if (!enemies) {
      return failResponse('INVALID_ENEMIES', req.clientShotId, req.archetype);
    }

    const session = this.sessions.get(req.sessionId);
    if (!session) {
      return failResponse(
        'SESSION_NOT_FOUND',
        req.clientShotId,
        req.archetype,
        404
      );
    }
    session.lastActiveMs = nowMs;

    const record = session.projectiles.get(req.clientShotId);
    if (!record) {
      return failResponse(
        'PROJECTILE_NOT_REGISTERED',
        req.clientShotId,
        req.archetype,
        404
      );
    }

    // Replay / double-impact guard
    if (record.resolved && record.cachedResult) {
      return {
        status: 200,
        payload: {
          ...record.cachedResult,
          alreadyResolved: true,
          serverTimeMs: nowMs,
        },
      };
    }

    if (record.archetype !== req.archetype) {
      return failResponse(
        'ARCHETYPE_MISMATCH',
        req.clientShotId,
        record.archetype,
        400
      );
    }

    this.mergeSessionEnemies(session, enemies);
    session.lastCasterPos = casterPos;
    const activeEnemies =
      enemies.length > 0 ? enemies : Array.from(session.enemies.values());

    const profile = PROJECTILE_PHYSICS_REGISTRY[record.archetype];
    const maxFlightWindow = profile.maxLifeSec + 0.35;
    const targetElapsed = Math.min(maxFlightWindow, Math.max(0, req.elapsedFlightSec));

    // Resolve homing target position for Nagastra split serpent
    const targetId =
      typeof req.homingTargetId === 'string' && ID_PATTERN.test(req.homingTargetId)
        ? req.homingTargetId
        : record.homingTargetId;
    let targetPos: Vec3Like | null = null;
    if (record.archetype === 'NAGASTRA_SERPENT' && targetId) {
      for (let i = 0; i < activeEnemies.length; i++) {
        if (activeEnemies[i].id === targetId && activeEnemies[i].alive) {
          targetPos = {
            x: activeEnemies[i].x,
            y: activeEnemies[i].y,
            z: activeEnemies[i].z,
          };
          break;
        }
      }
    }

    // Step authoritative deterministic trajectory across [0 .. targetElapsed + 0.14s]
    const simState: ProjectileKinematicsState = { ...record.initialState };
    const totalSimTime = Math.min(maxFlightWindow, targetElapsed + 0.14);
    const numSteps = Math.max(1, Math.ceil(totalSimTime / FIXED_SIM_DT));
    const stepDt = totalSimTime / numSteps;

    // Window around targetElapsed where impact point should align
    const windowStart = Math.max(0, targetElapsed - 0.16);
    let minErrorSq = Infinity;
    let closestServerPoint: Vec3Like = {
      x: simState.x,
      y: simState.y,
      z: simState.z,
    };
    let simAtTargetElapsed: Vec3Like = {
      x: simState.x,
      y: simState.y,
      z: simState.z,
    };
    let capturedAtTarget = false;

    let bestCapsuleT = 2.0;
    let capsuleHitEnemyId: string | null = null;
    let capsuleHitPoint: Vec3Like | null = null;

    for (let s = 0; s < numSteps; s++) {
      const prevX = simState.x;
      const prevY = simState.y;
      const prevZ = simState.z;

      stepProjectileKinematics(simState, stepDt, targetPos, casterPos);

      if (!capturedAtTarget && simState.elapsedSec >= targetElapsed) {
        simAtTargetElapsed = { x: simState.x, y: simState.y, z: simState.z };
        capturedAtTarget = true;
      }

      if (simState.elapsedSec >= windowStart - stepDt) {
        const segMatch = distanceSqPointToSegment(
          reportedHitPos.x,
          reportedHitPos.y,
          reportedHitPos.z,
          prevX,
          prevY,
          prevZ,
          simState.x,
          simState.y,
          simState.z
        );
        if (segMatch.distSq < minErrorSq) {
          minErrorSq = segMatch.distSq;
          closestServerPoint = {
            x: segMatch.cx,
            y: segMatch.cy,
            z: segMatch.cz,
          };
        }

        // Server-side swept capsule hit check across the impact window
        if (hitKind === 'ENEMY' && capsuleHitEnemyId === null) {
          for (let ei = 0; ei < activeEnemies.length; ei++) {
            const e = activeEnemies[ei];
            if (!e.alive) continue;
            const scale = (e.isCommander ? 1.38 : 1.06) * e.customScale;
            const capR = 0.68 * scale + profile.hitRadius;
            const minY = e.y + 0.1;
            const maxY = e.y + 2.1 * scale;
            const tHit = intersectSegmentCapsule(
              prevX,
              prevY,
              prevZ,
              simState.x,
              simState.y,
              simState.z,
              e.x,
              e.z,
              capR,
              minY,
              maxY
            );
            if (tHit !== null && tHit < bestCapsuleT) {
              bestCapsuleT = tHit;
              capsuleHitEnemyId = e.id;
              capsuleHitPoint = {
                x: prevX + (simState.x - prevX) * tHit,
                y: prevY + (simState.y - prevY) * tHit,
                z: prevZ + (simState.z - prevZ) * tHit,
              };
            }
          }
        }
      }
    }

    if (!capturedAtTarget) {
      simAtTargetElapsed = { x: simState.x, y: simState.y, z: simState.z };
    }

    const trajectoryErrorM = Math.sqrt(Math.max(0, minErrorSq));
    const maxAllowedErrorM =
      3.2 +
      profile.speed * 0.08 +
      (record.archetype === 'NAGASTRA_SERPENT'
        ? 5.0
        : record.archetype === 'CHAKRA'
        ? 3.8
        : 0);

    if (trajectoryErrorM > maxAllowedErrorM) {
      const rejected: ProjectileImpactValidationResponse = {
        accepted: false,
        clientShotId: record.clientShotId,
        archetype: record.archetype,
        rejectionReason: 'TRAJECTORY_MISMATCH',
        trajectoryErrorM: Number(trajectoryErrorM.toFixed(3)),
        maxAllowedErrorM: Number(maxAllowedErrorM.toFixed(3)),
        serverSimulatedPos: simAtTargetElapsed,
        serverHitPos: closestServerPoint,
        authorizedHits: [],
        totalAuthorizedDamage: 0,
        karmaAwarded: 0,
        allowSplitSerpents: false,
        serverTimeMs: nowMs,
      };
      record.resolved = true;
      record.cachedResult = rejected;
      return { status: 200, payload: rejected };
    }

    // Confirm or verify direct target enemy capsule if client reported a direct hit
    let verifiedDirectEnemyId: string | null = capsuleHitEnemyId;
    if (
      verifiedDirectEnemyId === null &&
      hitKind === 'ENEMY' &&
      typeof req.reportedEnemyId === 'string' &&
      ID_PATTERN.test(req.reportedEnemyId)
    ) {
      for (let ei = 0; ei < activeEnemies.length; ei++) {
        const e = activeEnemies[ei];
        if (!e.alive || e.id !== req.reportedEnemyId) continue;
        const scale = (e.isCommander ? 1.38 : 1.06) * e.customScale;
        const capR = 0.68 * scale + profile.hitRadius + 1.25;
        const dx = closestServerPoint.x - e.x;
        const dz = closestServerPoint.z - e.z;
        const inVertical =
          closestServerPoint.y >= e.y - 0.6 &&
          closestServerPoint.y <= e.y + 2.5 * scale;
        if (dx * dx + dz * dz <= capR * capR && inVertical) {
          verifiedDirectEnemyId = e.id;
        }
        break;
      }
    }

    const serverHitPos = capsuleHitPoint ?? closestServerPoint;
    const hitComputation = computeAuthoritativeHits(
      record.archetype,
      serverHitPos.x,
      serverHitPos.z,
      verifiedDirectEnemyId,
      record.stealthAmbush,
      activeEnemies
    );

    const result: ProjectileImpactValidationResponse = {
      accepted: true,
      clientShotId: record.clientShotId,
      archetype: record.archetype,
      trajectoryErrorM: Number(trajectoryErrorM.toFixed(3)),
      maxAllowedErrorM: Number(maxAllowedErrorM.toFixed(3)),
      serverSimulatedPos: simAtTargetElapsed,
      serverHitPos,
      authorizedHits: hitComputation.hits,
      totalAuthorizedDamage: hitComputation.totalDamage,
      karmaAwarded: hitComputation.karmaAwarded,
      allowSplitSerpents: record.archetype === 'NAGASTRA',
      serverTimeMs: nowMs,
    };

    record.resolved = true;
    record.cachedResult = result;
    return { status: 200, payload: result };
  }

  public getSessionStats(sessionId: string): {
    found: boolean;
    activeProjectiles: number;
    trackedEnemies: number;
    shotCounter: number;
  } {
    const s = this.sessions.get(sessionId);
    if (!s) {
      return { found: false, activeProjectiles: 0, trackedEnemies: 0, shotCounter: 0 };
    }
    let activeCount = 0;
    for (const p of s.projectiles.values()) {
      if (!p.resolved) activeCount += 1;
    }
    return {
      found: true,
      activeProjectiles: activeCount,
      trackedEnemies: s.enemies.size,
      shotCounter: s.shotCounter,
    };
  }
}
