import * as THREE from 'three';

export interface OcclusionBoxBounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface CullableOptions {
  /** Override minimum distance where frustum culling can hide the object (default 0). */
  alwaysKeepWithinDist?: number;
  /** Disable fog-extinction culling for gigantic horizon silhouettes if needed. */
  skipFogCull?: boolean;
  /** Disable opaque AABB occlusion testing for this entry (e.g. terrain). */
  skipOccluderCull?: boolean;
  /** Optional dynamic callback invoked right when visible. */
  onVisible?: () => void;
}

interface InternalCullable {
  object: THREE.Object3D;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  cx: number;
  cy: number;
  cz: number;
  radius: number;
  alwaysKeepDistSq: number;
  skipFogCull: boolean;
  skipOccluderCull: boolean;
  onVisible?: () => void;
  lastVisible: boolean;
}

interface InternalOccluder {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  cx: number;
  cy: number;
  cz: number;
  radius: number;
  minDistSq: number;
}

export interface OcclusionStats {
  total: number;
  visible: number;
  frustumCulled: number;
  fogCulled: number;
  occluderCulled: number;
}

const MAX_ACTIVE_OCCLUDERS = 8;

/**
 * Zero-allocation conservative 3-stage visibility & occlusion culling system:
 * 1. Exponential Fog-Extinction Horizon Culling (hides objects past >99.4% atmospheric attenuation)
 * 2. Hierarchical Frustum Culling across static world chunks, LODs, temples, and instanced nature cells
 * 3. Convex Solid AABB Occluder Shadow-Cone Culling (tests 8 AABB corners against nearby opaque stone/mountain cores)
 */
export class OcclusionCullingManager {
  private readonly entries: InternalCullable[] = [];
  private readonly occluders: InternalOccluder[] = [];

  private readonly activeOccluderIdx = new Int32Array(MAX_ACTIVE_OCCLUDERS);
  private readonly activeOccluderDistSq = new Float64Array(MAX_ACTIVE_OCCLUDERS);
  private activeOccluderCount = 0;

  private readonly frustum = new THREE.Frustum();
  private readonly projScreenMatrix = new THREE.Matrix4();
  private readonly tmpBox = new THREE.Box3();
  private readonly tmpSphere = new THREE.Sphere();

  private statsVisible = 0;
  private statsFrustum = 0;
  private statsFog = 0;
  private statsOccluder = 0;

  public registerFromObject(
    object: THREE.Object3D,
    options: CullableOptions = {}
  ): void {
    object.updateWorldMatrix(true, true);
    this.tmpBox.setFromObject(object);
    if (this.tmpBox.isEmpty()) return;
    this.registerBounds(
      object,
      {
        minX: this.tmpBox.min.x,
        minY: this.tmpBox.min.y,
        minZ: this.tmpBox.min.z,
        maxX: this.tmpBox.max.x,
        maxY: this.tmpBox.max.y,
        maxZ: this.tmpBox.max.z,
      },
      options
    );
  }

  public registerBounds(
    object: THREE.Object3D,
    bounds: OcclusionBoxBounds,
    options: CullableOptions = {}
  ): void {
    const cx = (bounds.minX + bounds.maxX) * 0.5;
    const cy = (bounds.minY + bounds.maxY) * 0.5;
    const cz = (bounds.minZ + bounds.maxZ) * 0.5;
    const hx = (bounds.maxX - bounds.minX) * 0.5;
    const hy = (bounds.maxY - bounds.minY) * 0.5;
    const hz = (bounds.maxZ - bounds.minZ) * 0.5;
    const radius = Math.hypot(hx, hy, hz);
    const keepDist = options.alwaysKeepWithinDist ?? 0;

    this.entries.push({
      object,
      minX: bounds.minX,
      minY: bounds.minY,
      minZ: bounds.minZ,
      maxX: bounds.maxX,
      maxY: bounds.maxY,
      maxZ: bounds.maxZ,
      cx,
      cy,
      cz,
      radius,
      alwaysKeepDistSq: keepDist * keepDist,
      skipFogCull: Boolean(options.skipFogCull),
      skipOccluderCull: Boolean(options.skipOccluderCull),
      onVisible: options.onVisible,
      lastVisible: object.visible,
    });
  }

  public registerSolidOccluder(bounds: OcclusionBoxBounds): void {
    const cx = (bounds.minX + bounds.maxX) * 0.5;
    const cy = (bounds.minY + bounds.maxY) * 0.5;
    const cz = (bounds.minZ + bounds.maxZ) * 0.5;
    const radius = Math.hypot(
      (bounds.maxX - bounds.minX) * 0.5,
      (bounds.maxY - bounds.minY) * 0.5,
      (bounds.maxZ - bounds.minZ) * 0.5
    );
    if (radius < 1.5) return;
    this.occluders.push({
      minX: bounds.minX,
      minY: bounds.minY,
      minZ: bounds.minZ,
      maxX: bounds.maxX,
      maxY: bounds.maxY,
      maxZ: bounds.maxZ,
      cx,
      cy,
      cz,
      radius,
      minDistSq: 0,
    });
  }

  private selectActiveOccluders(camX: number, camY: number, camZ: number): void {
    this.activeOccluderCount = 0;
    const total = this.occluders.length;
    if (total === 0) return;

    const maxRangeSq = 280 * 280;
    for (let i = 0; i < total; i++) {
      const occ = this.occluders[i];
      // Do not cull using an occluder if the camera itself is inside or flush against it
      if (
        camX >= occ.minX - 1.2 &&
        camX <= occ.maxX + 1.2 &&
        camY >= occ.minY - 1.2 &&
        camY <= occ.maxY + 1.2 &&
        camZ >= occ.minZ - 1.2 &&
        camZ <= occ.maxZ + 1.2
      ) {
        continue;
      }

      const dx = occ.cx - camX;
      const dy = occ.cy - camY;
      const dz = occ.cz - camZ;
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq > maxRangeSq) continue;

      this.tmpSphere.center.set(occ.cx, occ.cy, occ.cz);
      this.tmpSphere.radius = occ.radius;
      if (!this.frustum.intersectsSphere(this.tmpSphere)) continue;

      if (this.activeOccluderCount < MAX_ACTIVE_OCCLUDERS) {
        let pos = this.activeOccluderCount;
        while (pos > 0 && this.activeOccluderDistSq[pos - 1] > dSq) {
          this.activeOccluderDistSq[pos] = this.activeOccluderDistSq[pos - 1];
          this.activeOccluderIdx[pos] = this.activeOccluderIdx[pos - 1];
          pos--;
        }
        this.activeOccluderDistSq[pos] = dSq;
        this.activeOccluderIdx[pos] = i;
        this.activeOccluderCount++;
      } else if (dSq < this.activeOccluderDistSq[MAX_ACTIVE_OCCLUDERS - 1]) {
        let pos = MAX_ACTIVE_OCCLUDERS - 1;
        while (pos > 0 && this.activeOccluderDistSq[pos - 1] > dSq) {
          this.activeOccluderDistSq[pos] = this.activeOccluderDistSq[pos - 1];
          this.activeOccluderIdx[pos] = this.activeOccluderIdx[pos - 1];
          pos--;
        }
        this.activeOccluderDistSq[pos] = dSq;
        this.activeOccluderIdx[pos] = i;
      }
    }
  }

  /**
   * Tests whether a ray segment C -> (tx, ty, tz) intersects solid box `occ` and exits strictly
   * before reaching the target point (tExit < 0.995).
   */
  private segmentExitsBoxBeforeTarget(
    cx: number,
    cy: number,
    cz: number,
    tx: number,
    ty: number,
    tz: number,
    occ: InternalOccluder
  ): boolean {
    const dx = tx - cx;
    const dy = ty - cy;
    const dz = tz - cz;

    let tMin = 0.0;
    let tMax = 0.995;

    if (Math.abs(dx) < 1e-8) {
      if (cx < occ.minX || cx > occ.maxX) return false;
    } else {
      const inv = 1.0 / dx;
      let t1 = (occ.minX - cx) * inv;
      let t2 = (occ.maxX - cx) * inv;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tMin) tMin = t1;
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return false;
    }

    if (Math.abs(dy) < 1e-8) {
      if (cy < occ.minY || cy > occ.maxY) return false;
    } else {
      const inv = 1.0 / dy;
      let t1 = (occ.minY - cy) * inv;
      let t2 = (occ.maxY - cy) * inv;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tMin) tMin = t1;
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return false;
    }

    if (Math.abs(dz) < 1e-8) {
      if (cz < occ.minZ || cz > occ.maxZ) return false;
    } else {
      const inv = 1.0 / dz;
      let t1 = (occ.minZ - cz) * inv;
      let t2 = (occ.maxZ - cz) * inv;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tMin) tMin = t1;
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return false;
    }

    return tMin <= tMax && tMax < 0.995;
  }

  private isEntryOccluded(
    camX: number,
    camY: number,
    camZ: number,
    e: InternalCullable
  ): boolean {
    for (let k = 0; k < this.activeOccluderCount; k++) {
      const occ = this.occluders[this.activeOccluderIdx[k]];
      // Reject occluder if candidate bounds overlap the occluder itself
      if (
        e.minX <= occ.maxX &&
        e.maxX >= occ.minX &&
        e.minY <= occ.maxY &&
        e.maxY >= occ.minY &&
        e.minZ <= occ.maxZ &&
        e.maxZ >= occ.minZ
      ) {
        continue;
      }

      // Fast-path: check center first before testing all 8 vertices of the AABB
      if (!this.segmentExitsBoxBeforeTarget(camX, camY, camZ, e.cx, e.cy, e.cz, occ)) {
        continue;
      }

      if (
        this.segmentExitsBoxBeforeTarget(camX, camY, camZ, e.minX, e.minY, e.minZ, occ) &&
        this.segmentExitsBoxBeforeTarget(camX, camY, camZ, e.maxX, e.minY, e.minZ, occ) &&
        this.segmentExitsBoxBeforeTarget(camX, camY, camZ, e.minX, e.maxY, e.minZ, occ) &&
        this.segmentExitsBoxBeforeTarget(camX, camY, camZ, e.maxX, e.maxY, e.minZ, occ) &&
        this.segmentExitsBoxBeforeTarget(camX, camY, camZ, e.minX, e.minY, e.maxZ, occ) &&
        this.segmentExitsBoxBeforeTarget(camX, camY, camZ, e.maxX, e.minY, e.maxZ, occ) &&
        this.segmentExitsBoxBeforeTarget(camX, camY, camZ, e.minX, e.maxY, e.maxZ, occ) &&
        this.segmentExitsBoxBeforeTarget(camX, camY, camZ, e.maxX, e.maxY, e.maxZ, occ)
      ) {
        return true;
      }
    }
    return false;
  }

  public update(camera: THREE.Camera, fogDensity: number): void {
    camera.updateMatrixWorld();
    this.projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    const camPos = camera.position;
    const camX = camPos.x;
    const camY = camPos.y;
    const camZ = camPos.z;

    // Conservative exponential fog extinction range: exp(-(d * fogDensity)^2) < 0.004 at d * density >= 2.35
    const safeFog = Math.max(0.0022, fogDensity);
    const fogCutoffBase = 2.4 / safeFog;

    this.selectActiveOccluders(camX, camY, camZ);

    let visCount = 0;
    let frustumCount = 0;
    let fogCount = 0;
    let occCount = 0;

    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      const dx = e.cx - camX;
      const dy = e.cy - camY;
      const dz = e.cz - camZ;
      const dSq = dx * dx + dy * dy + dz * dz;

      if (e.alwaysKeepDistSq > 0 && dSq <= e.alwaysKeepDistSq) {
        if (!e.lastVisible) {
          e.object.visible = true;
          e.lastVisible = true;
        }
        e.onVisible?.();
        visCount++;
        continue;
      }

      // 1. Atmospheric Fog-Extinction Horizon Culling
      if (!e.skipFogCull) {
        const maxDist = fogCutoffBase + e.radius;
        if (dSq > maxDist * maxDist) {
          if (e.lastVisible) {
            e.object.visible = false;
            e.lastVisible = false;
          }
          fogCount++;
          continue;
        }
      }

      // 2. Frustum Culling at Whole-Asset / Chunk Granularity
      this.tmpBox.min.set(e.minX, e.minY, e.minZ);
      this.tmpBox.max.set(e.maxX, e.maxY, e.maxZ);
      if (!this.frustum.intersectsBox(this.tmpBox)) {
        if (e.lastVisible) {
          e.object.visible = false;
          e.lastVisible = false;
        }
        frustumCount++;
        continue;
      }

      // 3. Conservative Solid AABB Occlusion Culling
      if (
        !e.skipOccluderCull &&
        this.activeOccluderCount > 0 &&
        dSq > (e.radius + 16) * (e.radius + 16) &&
        this.isEntryOccluded(camX, camY, camZ, e)
      ) {
        if (e.lastVisible) {
          e.object.visible = false;
          e.lastVisible = false;
        }
        occCount++;
        continue;
      }

      if (!e.lastVisible) {
        e.object.visible = true;
        e.lastVisible = true;
      }
      e.onVisible?.();
      visCount++;
    }

    this.statsVisible = visCount;
    this.statsFrustum = frustumCount;
    this.statsFog = fogCount;
    this.statsOccluder = occCount;
  }

  public getStats(): OcclusionStats {
    return {
      total: this.entries.length,
      visible: this.statsVisible,
      frustumCulled: this.statsFrustum,
      fogCulled: this.statsFog,
      occluderCulled: this.statsOccluder,
    };
  }

  public clear(): void {
    this.entries.length = 0;
    this.occluders.length = 0;
  }
}
