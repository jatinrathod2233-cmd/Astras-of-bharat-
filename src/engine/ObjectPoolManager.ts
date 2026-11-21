import * as THREE from 'three';

export interface PoolConfig<T> {
  key: string;
  factory: () => T;
  onAcquire?: (item: T) => void;
  onRelease?: (item: T) => void;
  onDispose?: (item: T) => void;
  prewarmCount?: number;
  maxSize?: number;
}

export interface PoolStats {
  key: string;
  active: number;
  pooled: number;
  totalTracked: number;
  prewarmTarget: number;
  maxSize: number;
  hits: number;
  misses: number;
  peakActive: number;
  disposedCount: number;
}

/**
 * O(1) swap-and-pop removal for order-independent active simulation arrays.
 * Eliminates Array.prototype.splice element shifting overhead inside hot loops.
 */
export function swapRemoveAt<T>(arr: T[], index: number): T {
  const last = arr.length - 1;
  const removed = arr[index];
  if (index !== last) {
    arr[index] = arr[last];
  }
  arr.pop();
  return removed;
}

/**
 * High-efficiency generic Object Pool with O(1) LIFO free-stack reuse,
 * double-release protection, hard standby capacity bounds, and leak-proof disposal.
 */
export class ObjectPool<T> {
  public readonly key: string;
  public readonly prewarmTarget: number;
  public readonly maxSize: number;

  private readonly factory: () => T;
  private readonly onAcquire?: (item: T) => void;
  private readonly onRelease?: (item: T) => void;
  private readonly onDispose?: (item: T) => void;

  private readonly freeStack: T[] = [];
  private readonly allTracked = new Set<T>();
  private readonly inPoolSet = new Set<T>();

  private activeCount = 0;
  private hits = 0;
  private misses = 0;
  private peakActive = 0;
  private disposedCount = 0;
  private disposed = false;

  constructor(config: PoolConfig<T>) {
    this.key = config.key;
    this.factory = config.factory;
    this.onAcquire = config.onAcquire;
    this.onRelease = config.onRelease;
    this.onDispose = config.onDispose;
    this.prewarmTarget = Math.max(0, Math.floor(config.prewarmCount ?? 0));
    this.maxSize = Math.max(
      this.prewarmTarget,
      Math.floor(config.maxSize ?? Math.max(16, this.prewarmTarget * 2))
    );
  }

  public needsPrewarm(): boolean {
    return !this.disposed && this.allTracked.size < this.prewarmTarget;
  }

  /**
   * Synchronously preloads standby instances up to `targetCount ?? this.prewarmTarget`.
   * Intended for lightweight pools or pre-compile initialization before the main loop starts.
   */
  public prewarmSync(targetCount = this.prewarmTarget): number {
    if (this.disposed) return 0;
    const goal = Math.min(this.maxSize, Math.max(0, Math.floor(targetCount)));
    let created = 0;
    while (this.allTracked.size < goal) {
      const item = this.factory();
      this.allTracked.add(item);
      this.onRelease?.(item);
      this.freeStack.push(item);
      this.inPoolSet.add(item);
      created++;
    }
    return created;
  }

  /**
   * Non-blocking single/small-batch prewarm step.
   * Returns `true` if more instances still need prewarming.
   */
  public prewarmStep(maxItems = 1): boolean {
    if (this.disposed) return false;
    const goal = Math.min(this.maxSize, this.prewarmTarget);
    let step = 0;
    while (this.allTracked.size < goal && step < maxItems) {
      const item = this.factory();
      this.allTracked.add(item);
      this.onRelease?.(item);
      this.freeStack.push(item);
      this.inPoolSet.add(item);
      step++;
    }
    return this.allTracked.size < goal;
  }

  /**
   * O(1) acquisition. Reuses a pre-allocated idle instance when available,
   * falling back seamlessly to `factory()` under burst demand.
   */
  public acquire(): T {
    if (this.disposed) {
      throw new Error(`Cannot acquire from disposed pool "${this.key}".`);
    }

    let item: T;
    if (this.freeStack.length > 0) {
      item = this.freeStack.pop()!;
      this.inPoolSet.delete(item);
      this.hits++;
    } else {
      item = this.factory();
      this.allTracked.add(item);
      this.misses++;
    }

    this.activeCount++;
    if (this.activeCount > this.peakActive) {
      this.peakActive = this.activeCount;
    }
    this.onAcquire?.(item);
    return item;
  }

  /**
   * O(1) release back into the free-stack.
   * Rejects duplicate releases cleanly and disposes excess instances above `maxSize`
   * so heap/VRAM usage stays strictly bounded.
   */
  public release(item: T): boolean {
    if (this.disposed || item === null || item === undefined) return false;
    if (!this.allTracked.has(item)) return false;
    if (this.inPoolSet.has(item)) return false;

    if (this.activeCount > 0) {
      this.activeCount--;
    }
    this.onRelease?.(item);

    if (this.freeStack.length < this.maxSize) {
      this.freeStack.push(item);
      this.inPoolSet.add(item);
    } else {
      this.allTracked.delete(item);
      this.onDispose?.(item);
      this.disposedCount++;
    }
    return true;
  }

  /**
   * Releases excess idle instances down to `keepCount` without touching active objects.
   */
  public trimIdle(keepCount = this.prewarmTarget): number {
    if (this.disposed) return 0;
    const target = Math.max(0, Math.floor(keepCount));
    let removed = 0;
    while (this.freeStack.length > target) {
      const item = this.freeStack.pop()!;
      this.inPoolSet.delete(item);
      this.allTracked.delete(item);
      this.onDispose?.(item);
      this.disposedCount++;
      removed++;
    }
    return removed;
  }

  /**
   * Disposes every tracked instance (both idle AND active) to guarantee zero memory leaks.
   */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.allTracked.forEach((item) => {
      if (!this.inPoolSet.has(item)) {
        this.onRelease?.(item);
      }
      this.onDispose?.(item);
      this.disposedCount++;
    });
    this.freeStack.length = 0;
    this.inPoolSet.clear();
    this.allTracked.clear();
    this.activeCount = 0;
  }

  public getStats(): PoolStats {
    return {
      key: this.key,
      active: this.activeCount,
      pooled: this.freeStack.length,
      totalTracked: this.allTracked.size,
      prewarmTarget: this.prewarmTarget,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      peakActive: this.peakActive,
      disposedCount: this.disposedCount,
    };
  }
}

/**
 * Centralized Object Pool Manager for Three.js scene objects and runtime gameplay entities.
 *
 * Key guarantees:
 * - Zero runtime scene.add/scene.remove churn: pooled Three.js nodes remain mounted under
 *   a dedicated scene root (`poolRoot`) and toggle `.visible` in O(1).
 * - Non-blocking frame-budgeted preloading (`stepPrewarm(budgetMs)`) eliminates frame drops
 *   and startup hitches while warming heavy composite rigs during idle frames.
 * - Shared geometry/material registry prevents premature disposal when trimming excess instances
 *   and guarantees complete WebGL resource cleanup on `dispose()`.
 */
export class ObjectPoolManager {
  public readonly poolRoot: THREE.Group;

  private readonly pools = new Map<string, ObjectPool<unknown>>();
  private readonly prewarmList: ObjectPool<unknown>[] = [];
  private readonly sharedGeometries = new Set<THREE.BufferGeometry>();
  private readonly sharedMaterials = new Set<THREE.Material>();

  private prewarmCursor = 0;
  private disposed = false;

  constructor(scene?: THREE.Scene) {
    this.poolRoot = new THREE.Group();
    this.poolRoot.name = '__ObjectPoolRoot';
    if (scene) {
      scene.add(this.poolRoot);
    }
  }

  public attachToScene(scene: THREE.Scene): void {
    if (this.disposed) return;
    if (this.poolRoot.parent !== scene) {
      scene.add(this.poolRoot);
    }
  }

  public registerSharedGeometry<G extends THREE.BufferGeometry>(geometry: G): G {
    if (!this.disposed) {
      this.sharedGeometries.add(geometry);
    }
    return geometry;
  }

  public registerSharedMaterial<M extends THREE.Material>(material: M): M {
    if (!this.disposed) {
      this.sharedMaterials.add(material);
    }
    return material;
  }

  public registerPool<T>(config: PoolConfig<T>): ObjectPool<T> {
    if (this.disposed) {
      throw new Error('Cannot register pool on a disposed ObjectPoolManager.');
    }
    const existing = this.pools.get(config.key);
    if (existing) {
      return existing as ObjectPool<T>;
    }
    const pool = new ObjectPool<T>(config);
    const erased = pool as unknown as ObjectPool<unknown>;
    this.pools.set(config.key, erased);
    if (pool.prewarmTarget > 0) {
      this.prewarmList.push(erased);
    }
    return pool;
  }

  public getPool<T>(key: string): ObjectPool<T> | undefined {
    return this.pools.get(key) as ObjectPool<T> | undefined;
  }

  public acquire<T>(key: string): T {
    const pool = this.pools.get(key);
    if (!pool) {
      throw new Error(`ObjectPoolManager: unknown pool "${key}".`);
    }
    return (pool as ObjectPool<T>).acquire();
  }

  public release<T>(key: string, item: T): boolean {
    if (this.disposed) return false;
    const pool = this.pools.get(key);
    if (!pool) return false;
    return (pool as ObjectPool<T>).release(item);
  }

  public prewarmPool(key: string, targetCount?: number): number {
    if (this.disposed) return 0;
    const pool = this.pools.get(key);
    if (!pool) return 0;
    return pool.prewarmSync(targetCount);
  }

  /**
   * Synchronously preloads specific keys (e.g., tiny lightweight projectiles/VFX
   * needed before initial shader compilation).
   */
  public prewarmSyncKeys(keys: readonly string[], overrideCount?: number): number {
    if (this.disposed) return 0;
    let total = 0;
    for (let i = 0; i < keys.length; i++) {
      const pool = this.pools.get(keys[i]);
      if (pool) {
        total += pool.prewarmSync(overrideCount);
      }
    }
    return total;
  }

  /**
   * Incremental, micro-budgeted background preloader executed inside the game loop.
   * Ensures standby heavy rigs (demons, props, VFX) warm silently within `budgetMs` per frame
   * with zero stuttering or frame drops. Returns `true` when all prewarm targets are met.
   */
  public stepPrewarm(budgetMs = 1.6): boolean {
    if (this.disposed || this.prewarmCursor >= this.prewarmList.length) {
      return true;
    }

    const start = performance.now();
    while (this.prewarmCursor < this.prewarmList.length) {
      const pool = this.prewarmList[this.prewarmCursor];
      if (!pool.needsPrewarm()) {
        this.prewarmCursor++;
        continue;
      }

      pool.prewarmStep(1);

      if (!pool.needsPrewarm()) {
        this.prewarmCursor++;
      }

      if (performance.now() - start >= budgetMs) {
        return false;
      }
    }

    return true;
  }

  /**
   * Disposes geometries & materials inside an Object3D subtree while strictly preserving
   * any shared template resources registered via `registerSharedGeometry` / `registerSharedMaterial`.
   */
  public disposeObject3DResources(root: THREE.Object3D): void {
    root.removeFromParent();
    root.traverse((obj) => {
      const renderObj = obj as THREE.Mesh | THREE.Points | THREE.Line;
      if (renderObj.geometry && !this.sharedGeometries.has(renderObj.geometry)) {
        renderObj.geometry.dispose();
      }
      const mat = (obj as THREE.Mesh).material;
      if (mat) {
        if (Array.isArray(mat)) {
          for (let i = 0; i < mat.length; i++) {
            const m = mat[i];
            if (m && !this.sharedMaterials.has(m)) {
              m.dispose();
            }
          }
        } else if (!this.sharedMaterials.has(mat)) {
          mat.dispose();
        }
      }
    });
  }

  public getStats(key: string): PoolStats | undefined {
    return this.pools.get(key)?.getStats();
  }

  public getAllStats(): PoolStats[] {
    const out: PoolStats[] = [];
    this.pools.forEach((pool) => out.push(pool.getStats()));
    return out;
  }

  /**
   * Releases and disposes every pool and shared GPU asset cleanly (zero leaks).
   */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.pools.forEach((pool) => pool.dispose());
    this.pools.clear();
    this.prewarmList.length = 0;

    this.sharedGeometries.forEach((geo) => geo.dispose());
    this.sharedGeometries.clear();

    this.sharedMaterials.forEach((mat) => mat.dispose());
    this.sharedMaterials.clear();

    this.poolRoot.clear();
    this.poolRoot.removeFromParent();
  }
}
