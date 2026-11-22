import { BoxCollider, CircleCollider } from './worldData';

const DEFAULT_CELL_SIZE = 16;
const LARGE_SPAN_THRESHOLD = 48;
const KEY_BIAS = 2048;
const KEY_STRIDE = 4096;

/**
 * Zero-allocation 2D XZ spatial hash grid for static OBBs and cylinder colliders.
 * Uses pre-allocated Int32Array result buffers and a monotonic stamp table so
 * every point/radius, camera-clip, and swept projectile query runs in O(1) local cells
 * with zero per-frame heap churn or GC pressure.
 */
export class StaticColliderSpatialGrid {
  private readonly invCell: number;
  private readonly boxBuckets = new Map<number, Int32Array>();
  private readonly circleBuckets = new Map<number, Int32Array>();
  private readonly globalBoxes: Int32Array;
  private readonly globalCircles: Int32Array;
  private boxStamp: Int32Array;
  private circleStamp: Int32Array;
  private stamp = 1;

  public readonly boxes: readonly BoxCollider[];
  public readonly circles: readonly CircleCollider[];
  public outBoxes: Int32Array;
  public outBoxesLength = 0;
  public outCircles: Int32Array;
  public outCirclesLength = 0;

  constructor(
    boxes: readonly BoxCollider[],
    circles: readonly CircleCollider[],
    cellSize = DEFAULT_CELL_SIZE
  ) {
    this.boxes = boxes;
    this.circles = circles;
    this.invCell = 1 / cellSize;

    this.boxStamp = new Int32Array(boxes.length);
    this.circleStamp = new Int32Array(circles.length);
    this.outBoxes = new Int32Array(boxes.length);
    this.outCircles = new Int32Array(circles.length);

    const tmpBoxMap = new Map<number, number[]>();
    const tmpCircleMap = new Map<number, number[]>();
    const largeB: number[] = [];
    const largeC: number[] = [];

    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const r = b.rotY ?? 0;
      const absC = r === 0 ? 1 : Math.abs(Math.cos(r));
      const absS = r === 0 ? 0 : Math.abs(Math.sin(r));
      const hw = b.halfW * absC + b.halfD * absS;
      const hd = b.halfW * absS + b.halfD * absC;

      if (hw > LARGE_SPAN_THRESHOLD || hd > LARGE_SPAN_THRESHOLD) {
        largeB.push(i);
        continue;
      }

      const minCx = Math.floor((b.x - hw) * this.invCell);
      const maxCx = Math.floor((b.x + hw) * this.invCell);
      const minCz = Math.floor((b.z - hd) * this.invCell);
      const maxCz = Math.floor((b.z + hd) * this.invCell);

      for (let cx = minCx; cx <= maxCx; cx++) {
        const xKeyBase = (cx + KEY_BIAS) * KEY_STRIDE;
        for (let cz = minCz; cz <= maxCz; cz++) {
          const key = xKeyBase + (cz + KEY_BIAS);
          let arr = tmpBoxMap.get(key);
          if (!arr) {
            arr = [];
            tmpBoxMap.set(key, arr);
          }
          arr.push(i);
        }
      }
    }

    for (let i = 0; i < circles.length; i++) {
      const c = circles[i];
      if (c.radius > LARGE_SPAN_THRESHOLD) {
        largeC.push(i);
        continue;
      }

      const minCx = Math.floor((c.x - c.radius) * this.invCell);
      const maxCx = Math.floor((c.x + c.radius) * this.invCell);
      const minCz = Math.floor((c.z - c.radius) * this.invCell);
      const maxCz = Math.floor((c.z + c.radius) * this.invCell);

      for (let cx = minCx; cx <= maxCx; cx++) {
        const xKeyBase = (cx + KEY_BIAS) * KEY_STRIDE;
        for (let cz = minCz; cz <= maxCz; cz++) {
          const key = xKeyBase + (cz + KEY_BIAS);
          let arr = tmpCircleMap.get(key);
          if (!arr) {
            arr = [];
            tmpCircleMap.set(key, arr);
          }
          arr.push(i);
        }
      }
    }

    this.globalBoxes = Int32Array.from(largeB);
    this.globalCircles = Int32Array.from(largeC);

    tmpBoxMap.forEach((arr, key) => {
      this.boxBuckets.set(key, Int32Array.from(arr));
    });
    tmpCircleMap.forEach((arr, key) => {
      this.circleBuckets.set(key, Int32Array.from(arr));
    });
  }

  /**
   * Populates `outBoxes` (length `outBoxesLength`) and `outCircles` (length `outCirclesLength`)
   * with deduplicated collider indices overlapping the given world XZ AABB.
   */
  public queryAABB(minX: number, maxX: number, minZ: number, maxZ: number): void {
    this.stamp++;
    if (this.stamp >= 0x7ffffff0) {
      this.boxStamp.fill(0);
      this.circleStamp.fill(0);
      this.stamp = 1;
    }
    const stamp = this.stamp;
    const inv = this.invCell;
    const minCx = Math.floor(minX * inv);
    const maxCx = Math.floor(maxX * inv);
    const minCz = Math.floor(minZ * inv);
    const maxCz = Math.floor(maxZ * inv);

    let bLen = 0;
    const outB = this.outBoxes;
    const bStamp = this.boxStamp;
    const gb = this.globalBoxes;
    for (let i = 0; i < gb.length; i++) {
      const idx = gb[i];
      bStamp[idx] = stamp;
      outB[bLen++] = idx;
    }

    let cLen = 0;
    const outC = this.outCircles;
    const cStamp = this.circleStamp;
    const gc = this.globalCircles;
    for (let i = 0; i < gc.length; i++) {
      const idx = gc[i];
      cStamp[idx] = stamp;
      outC[cLen++] = idx;
    }

    for (let cx = minCx; cx <= maxCx; cx++) {
      const xKeyBase = (cx + KEY_BIAS) * KEY_STRIDE;
      for (let cz = minCz; cz <= maxCz; cz++) {
        const key = xKeyBase + (cz + KEY_BIAS);

        const bBucket = this.boxBuckets.get(key);
        if (bBucket !== undefined) {
          for (let i = 0; i < bBucket.length; i++) {
            const idx = bBucket[i];
            if (bStamp[idx] !== stamp) {
              bStamp[idx] = stamp;
              outB[bLen++] = idx;
            }
          }
        }

        const cBucket = this.circleBuckets.get(key);
        if (cBucket !== undefined) {
          for (let i = 0; i < cBucket.length; i++) {
            const idx = cBucket[i];
            if (cStamp[idx] !== stamp) {
              cStamp[idx] = stamp;
              outC[cLen++] = idx;
            }
          }
        }
      }
    }

    this.outBoxesLength = bLen;
    this.outCirclesLength = cLen;
  }
}
