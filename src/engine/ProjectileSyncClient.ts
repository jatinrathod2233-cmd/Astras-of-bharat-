import type {
  EnemyActorSnapshot,
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
    onRejected?: RegisterRejectionCallback
  ): void {
    if (!this.isServerEnabled()) return;

    const body: ProjectileRegisterRequest = {
      sessionId: this.sessionId,
      clientShotId,
      archetype,
      origin: { x: origin.x, y: origin.y, z: origin.z },
      direction: { x: direction.x, y: direction.y, z: direction.z },
      casterPos: { x: casterPos.x, y: casterPos.y, z: casterPos.z },
      stealthAmbush,
      clientTimestampMs: Date.now(),
      parentClientShotId,
      homingTargetId,
      enemies: enemies.slice(),
    };

    const promise = this.postJson<ProjectileRegisterResponse>(
      '/api/projectiles/register',
      body
    ).then((res) => {
      this.inFlightRegistrations.delete(clientShotId);
      if (this.disposed || !res) return null;
      if (!res.accepted && onRejected) {
        onRejected(res);
      }
      return res;
    });

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
    onReconcile: ReconcileImpactCallback
  ): void {
    if (!this.isServerEnabled()) return;

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
      homingTargetId,
      enemies: enemies.slice(),
    };

    const pendingReg = this.inFlightRegistrations.get(clientShotId);
    const runValidation = async (): Promise<void> => {
      if (pendingReg) {
        const regRes = await pendingReg;
        if (regRes && !regRes.accepted) return;
      }
      if (this.disposed) return;

      const res = await this.postJson<ProjectileImpactValidationResponse>(
        '/api/projectiles/validate-impact',
        body
      );
      if (this.disposed || !res) return;
      onReconcile(res, optimisticHits);
    };

    void runValidation();
  }

  private async postJson<T>(url: string, body: unknown): Promise<T | null> {
    if (!this.isServerEnabled()) return null;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.status === 404 && !url.includes('validate-impact')) {
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
    this.snapshotBuffer.length = 0;
  }
}
