import type {
  EnemyActorSnapshot,
  HazardZoneTickRequest,
  HazardZoneTickResponse,
  PersistentZoneKind,
  ProjectileArchetypeId,
  ProjectileHitKind,
  ProjectileImpactValidationRequest,
  ProjectileImpactValidationResponse,
  ProjectileRegisterRequest,
  ProjectileRegisterResponse,
  Vec3Like,
} from '../shared/projectilePhysics';

export interface OptimisticDamageRecord {
  enemyId: string;
  damage: number;
  karmaAwarded: number;
  wasKilledByShot: boolean;
}

export type ReconcileImpactCallback = (
  result: ProjectileImpactValidationResponse,
  optimistic: OptimisticDamageRecord[]
) => void;

export type RegisterRejectionCallback = (
  res: ProjectileRegisterResponse
) => void;

export type ZoneTickReconcileCallback = (
  res: HazardZoneTickResponse,
  optimisticDamageByEnemy: Map<string, number>
) => void;

function generateSessionId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `ram_${time}_${rand}`;
}

export class ProjectileSyncClient {
  public readonly sessionId: string;
  private shotSeq = 0;
  private disposed = false;
  private serverReachable = true;
  private consecutiveFailures = 0;
  private lastActorSyncMs = 0;
  private readonly isOfflineNative: boolean;
  private readonly inFlightRegistrations = new Map<
    string,
    Promise<ProjectileRegisterResponse | null>
  >();
  private readonly inFlightImpacts = new Map<
    string,
    Promise<ProjectileImpactValidationResponse | null>
  >();
  private readonly snapshotBuffer: EnemyActorSnapshot[] = [];

  constructor() {
    this.sessionId = generateSessionId();
    const proto =
      typeof window !== 'undefined' ? window.location.protocol : 'http:';
    this.isOfflineNative = proto === 'capacitor:' || proto === 'file:';
    if (this.isOfflineNative) {
      this.serverReachable = false;
    }
  }

  public nextShotId(archetype: ProjectileArchetypeId): string {
    this.shotSeq += 1;
    const prefix = archetype.slice(0, 4).toLowerCase();
    return `${prefix}_${this.shotSeq}_${(Date.now() & 0xffff).toString(36)}`;
  }

  public isServerEnabled(): boolean {
    return !this.disposed && !this.isOfflineNative && this.serverReachable;
  }

  public buildNearbySnapshots(
    casterX: number,
    casterZ: number,
    enemies: ReadonlyArray<{
      id: string;
      x: number;
      y: number;
      z: number;
      hp: number;
      maxHp: number;
      alive: boolean;
      isCommander: boolean;
      customScale: number;
    }>,
    maxRange = 140
  ): EnemyActorSnapshot[] {
    this.snapshotBuffer.length = 0;
    const maxRangeSq = maxRange * maxRange;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.alive) continue;
      const dx = e.x - casterX;
      const dz = e.z - casterZ;
      if (dx * dx + dz * dz > maxRangeSq) continue;
      this.snapshotBuffer.push({
        id: e.id,
        x: e.x,
        y: e.y,
        z: e.z,
        hp: e.hp,
        maxHp: e.maxHp,
        alive: e.alive,
        isCommander: e.isCommander,
        customScale: e.customScale,
      });
      if (this.snapshotBuffer.length >= 64) break;
    }
    return this.snapshotBuffer;
  }

  public maybeSyncActors(
    casterPos: Vec3Like,
    enemies: ReadonlyArray<{
      id: string;
      x: number;
      y: number;
      z: number;
      hp: number;
      maxHp: number;
      alive: boolean;
      isCommander: boolean;
      customScale: number;
    }>
  ): void {
    if (!this.isServerEnabled()) return;
    const now = performance.now();
    if (now - this.lastActorSyncMs < 180) return;
    this.lastActorSyncMs = now;

    const nearby = this.buildNearbySnapshots(
      casterPos.x,
      casterPos.z,
      enemies,
      140
    );
    if (nearby.length === 0) return;

    const payload = {
      sessionId: this.sessionId,
      casterPos: { x: casterPos.x, y: casterPos.y, z: casterPos.z },
      enemies: nearby.slice(),
    };

    void this.postJson('/api/projectiles/sync-actors', payload);
  }

  public registerShot(
    clientShotId: string,
    archetype: ProjectileArchetypeId,
    origin: Vec3Like,
    direction: Vec3Like,
    casterPos: Vec3Like,
    stealthAmbush: boolean,
    enemies: EnemyActorSnapshot[],
    parentClientShotId: string | null = null,
    homingTargetId: string | null = null,
    onRejected?: RegisterRejectionCallback,
    casterVel?: Vec3Like
  ): void {
    if (!this.isServerEnabled()) return;

    const body: ProjectileRegisterRequest = {
      sessionId: this.sessionId,
      clientShotId,
      archetype,
      origin: { x: origin.x, y: origin.y, z: origin.z },
      direction: { x: direction.x, y: direction.y, z: direction.z },
      casterPos: { x: casterPos.x, y: casterPos.y, z: casterPos.z },
      casterVel: casterVel
        ? { x: casterVel.x, y: casterVel.y, z: casterVel.z }
        : undefined,
      stealthAmbush,
      clientTimestampMs: Date.now(),
      parentClientShotId,
      homingTargetId,
      enemies: enemies.slice(),
    };

    const parentPromise = parentClientShotId
      ? this.inFlightRegistrations.get(parentClientShotId)
      : undefined;

    const promise = (async (): Promise<ProjectileRegisterResponse | null> => {
      if (parentPromise) {
        const parentRes = await parentPromise;
        if (parentRes && !parentRes.accepted) return null;
      }
      if (this.disposed) return null;
      const res = await this.postJson<ProjectileRegisterResponse>(
        '/api/projectiles/register',
        body
      );
      this.inFlightRegistrations.delete(clientShotId);
      if (this.disposed || !res) return null;
      if (!res.accepted && onRejected) {
        onRejected(res);
      }
      return res;
    })();

    this.inFlightRegistrations.set(clientShotId, promise);
  }

  public validateImpact(
    clientShotId: string,
    archetype: ProjectileArchetypeId,
    elapsedFlightSec: number,
    hitKind: ProjectileHitKind,
    reportedHitPos: Vec3Like,
    reportedEnemyId: string | null,
    casterPos: Vec3Like,
    enemies: EnemyActorSnapshot[],
    homingTargetId: string | null,
    optimisticHits: OptimisticDamageRecord[],
    onReconcile: ReconcileImpactCallback,
    options?: {
      casterVel?: Vec3Like;
      strikeIndex?: number;
      isFinalImpact?: boolean;
    }
  ): void {
    if (!this.isServerEnabled()) return;

    const strikeIndex = options?.strikeIndex ?? 0;
    const isFinalImpact = options?.isFinalImpact ?? true;

    const body: ProjectileImpactValidationRequest = {
      sessionId: this.sessionId,
      clientShotId,
      archetype,
      elapsedFlightSec,
      hitKind,
      reportedHitPos: {
        x: reportedHitPos.x,
        y: reportedHitPos.y,
        z: reportedHitPos.z,
      },
      reportedEnemyId,
      casterPos: { x: casterPos.x, y: casterPos.y, z: casterPos.z },
      casterVel: options?.casterVel
        ? {
            x: options.casterVel.x,
            y: options.casterVel.y,
            z: options.casterVel.z,
          }
        : undefined,
      homingTargetId,
      strikeIndex,
      isFinalImpact,
      enemies: enemies.slice(),
    };

    const pendingReg = this.inFlightRegistrations.get(clientShotId);
    const prevStrike = this.inFlightImpacts.get(clientShotId);

    const runValidation = async (): Promise<
      ProjectileImpactValidationResponse | null
    > => {
      if (pendingReg) {
        const regRes = await pendingReg;
        if (regRes && !regRes.accepted) return null;
      }
      if (prevStrike) {
        await prevStrike;
      }
      if (this.disposed) return null;

      const res = await this.postJson<ProjectileImpactValidationResponse>(
        '/api/projectiles/validate-impact',
        body
      );
      if (isFinalImpact) {
        // Keep brief reference until any immediately queued zone ticks resolve
        setTimeout(() => {
          if (this.inFlightImpacts.get(clientShotId) === runPromise) {
            this.inFlightImpacts.delete(clientShotId);
          }
        }, 4000);
      }
      if (this.disposed || !res) return null;
      onReconcile(res, optimisticHits);
      return res;
    };

    const runPromise = runValidation();
    this.inFlightImpacts.set(clientShotId, runPromise);
  }

  public validateZoneTick(
    zoneShotId: string,
    zoneKind: Exclude<PersistentZoneKind, 'NONE'>,
    dtSec: number,
    enemies: EnemyActorSnapshot[],
    optimisticDamageByEnemy: Map<string, number>,
    onReconcile: ZoneTickReconcileCallback
  ): void {
    if (!this.isServerEnabled() || !zoneShotId) return;

    const pendingImpact = this.inFlightImpacts.get(zoneShotId);
    const payload: HazardZoneTickRequest = {
      sessionId: this.sessionId,
      zoneShotId,
      zoneKind,
      dtSec,
      enemies: enemies.slice(),
    };

    const run = async (): Promise<void> => {
      if (pendingImpact) {
        const impactRes = await pendingImpact;
        if (impactRes && !impactRes.accepted) return;
      }
      if (this.disposed) return;
      const res = await this.postJson<HazardZoneTickResponse>(
        '/api/projectiles/validate-zone-tick',
        payload
      );
      if (this.disposed || !res) return;
      onReconcile(res, optimisticDamageByEnemy);
    };

    void run();
  }

  private async postJson<T>(url: string, body: unknown): Promise<T | null> {
    if (!this.isServerEnabled()) return null;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (
        response.status === 404 &&
        !url.includes('validate-impact') &&
        !url.includes('validate-zone-tick')
      ) {
        this.consecutiveFailures += 1;
        if (this.consecutiveFailures >= 3) {
          this.serverReachable = false;
        }
        return null;
      }
      this.consecutiveFailures = 0;
      const data = (await response.json()) as T;
      return data;
    } catch {
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= 4) {
        this.serverReachable = false;
      }
      return null;
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.inFlightRegistrations.clear();
    this.inFlightImpacts.clear();
    this.snapshotBuffer.length = 0;
  }
}
