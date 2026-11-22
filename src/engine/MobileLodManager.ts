import * as THREE from 'three';
import { ProceduralTextures } from './textures';
import { groundHeightAt, RIVER_SURFACE_Y } from './worldData';

export type DynamicLodTier = 'FULL' | 'MEDIUM' | 'FAR' | 'CULLED';

/**
 * Shared proxy geometry & material cache for multi-tier THREE.LOD silhouettes.
 * Ensures far LOD proxies share GPU buffers and dispose cleanly without leaking.
 */
export class MobileLodAssetCache {
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  public readonly templeStoneMat: THREE.MeshPhysicalMaterial;
  public readonly templeTrimMat: THREE.MeshPhysicalMaterial;
  public readonly templeGoldMat: THREE.MeshPhysicalMaterial;
  public readonly pavilionWallMat: THREE.MeshStandardMaterial;
  public readonly pavilionRoofMat: THREE.MeshStandardMaterial;
  public readonly obsidianMat: THREE.MeshStandardMaterial;
  public readonly emberMat: THREE.MeshStandardMaterial;
  public readonly volcanoRockMat: THREE.MeshStandardMaterial;
  public readonly volcanoMagmaMat: THREE.MeshPhysicalMaterial;

  public readonly unitBoxGeo: THREE.BoxGeometry;
  public readonly pyramidFourGeo: THREE.ConeGeometry;
  public readonly octCylinderGeo: THREE.CylinderGeometry;
  public readonly coneSixGeo: THREE.ConeGeometry;
  public readonly discGeo: THREE.CircleGeometry;
  public readonly hexPeakGeo: THREE.ConeGeometry;

  constructor(textures: ProceduralTextures) {
    this.unitBoxGeo = this.trackGeo(new THREE.BoxGeometry(1, 1, 1));
    this.pyramidFourGeo = this.trackGeo(new THREE.ConeGeometry(0.71, 1, 4));
    this.octCylinderGeo = this.trackGeo(new THREE.CylinderGeometry(0.85, 1.0, 1, 8));
    this.coneSixGeo = this.trackGeo(new THREE.ConeGeometry(1.0, 1.0, 6));
    this.discGeo = this.trackGeo(new THREE.CircleGeometry(1, 16));
    this.hexPeakGeo = this.trackGeo(new THREE.ConeGeometry(1, 1, 7));

    this.templeStoneMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        map: textures.sandstone,
        color: 0xe4bf8e,
        roughness: 0.86,
        metalness: 0.05,
        ior: 1.54,
      })
    );
    this.templeTrimMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        map: textures.sandstone,
        color: 0x9f6635,
        roughness: 0.76,
        metalness: 0.14,
        ior: 1.54,
      })
    );
    this.templeGoldMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        map: textures.armorMetal,
        color: 0xf4c24e,
        roughness: 0.34,
        metalness: 0.9,
        ior: 1.62,
      })
    );
    this.pavilionWallMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.sandstone,
        color: 0xdfb988,
        roughness: 0.8,
      })
    );
    this.pavilionRoofMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.silkGold,
        color: 0xa6462b,
        roughness: 0.68,
      })
    );
    this.obsidianMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.darkBasalt,
        color: 0x1e1b22,
        roughness: 0.78,
        metalness: 0.18,
      })
    );
    this.emberMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xff5a18,
        emissive: 0xff3200,
        emissiveIntensity: 1.5,
        roughness: 0.32,
      })
    );
    this.volcanoRockMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1a151c,
        roughness: 0.92,
        metalness: 0.08,
      })
    );
    this.volcanoMagmaMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xff5216,
        emissive: 0xff3b08,
        emissiveIntensity: 2.2,
        roughness: 0.34,
      })
    );
  }

  public trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.geometries.push(geo);
    return geo;
  }

  public trackMat<T extends THREE.Material>(mat: T): T {
    this.materials.push(mat);
    return mat;
  }

  public dispose(): void {
    for (let i = 0; i < this.geometries.length; i++) {
      this.geometries[i].dispose();
    }
    this.geometries.length = 0;
    for (let i = 0; i < this.materials.length; i++) {
      this.materials[i].dispose();
    }
    this.materials.length = 0;
  }
}

/**
 * Wraps the full-detail Temple in a 2-level THREE.LOD:
 * - Level 0 (0..78m): 100% original multi-tier carved temple
 * - Level 1 (78m+): 3-draw-call shared sandstone/gold silhouette
 */
export function wrapTempleWithLod(
  fullGroup: THREE.Group,
  x: number,
  z: number,
  scale: number,
  rotY: number,
  cache: MobileLodAssetCache
): THREE.LOD {
  const lod = new THREE.LOD();
  const baseY = Math.max(RIVER_SURFACE_Y + 0.35, groundHeightAt(x, z));
  lod.position.set(x, baseY, z);
  lod.rotation.y = rotY;
  lod.scale.setScalar(scale);

  // Convert fullGroup to local identity inside LOD
  fullGroup.position.set(0, 0, 0);
  fullGroup.rotation.set(0, 0, 0);
  fullGroup.scale.setScalar(1);
  lod.addLevel(fullGroup, 0);

  const farGroup = new THREE.Group();
  const body = new THREE.Mesh(cache.unitBoxGeo, cache.templeStoneMat);
  body.scale.set(11.4, 7.2, 11.4);
  body.position.y = 3.6;
  farGroup.add(body);

  const shikhara = new THREE.Mesh(cache.pyramidFourGeo, cache.templeTrimMat);
  shikhara.scale.set(8.8, 6.8, 8.8);
  shikhara.rotation.y = Math.PI / 4;
  shikhara.position.y = 10.6;
  farGroup.add(shikhara);

  const finial = new THREE.Mesh(cache.coneSixGeo, cache.templeGoldMat);
  finial.scale.set(0.75, 1.8, 0.75);
  finial.position.y = 14.5;
  farGroup.add(finial);

  lod.addLevel(farGroup, 78);
  return lod;
}

/**
 * Wraps the full-detail Pavilion in a 2-level THREE.LOD (switch at 68m).
 */
export function wrapPavilionWithLod(
  fullGroup: THREE.Group,
  x: number,
  z: number,
  scale: number,
  rotY: number,
  cache: MobileLodAssetCache
): THREE.LOD {
  const lod = new THREE.LOD();
  const baseY = Math.max(RIVER_SURFACE_Y + 0.35, groundHeightAt(x, z));
  lod.position.set(x, baseY, z);
  lod.rotation.y = rotY;
  lod.scale.setScalar(scale);

  fullGroup.position.set(0, 0, 0);
  fullGroup.rotation.set(0, 0, 0);
  fullGroup.scale.setScalar(1);
  lod.addLevel(fullGroup, 0);

  const farGroup = new THREE.Group();
  const body = new THREE.Mesh(cache.unitBoxGeo, cache.pavilionWallMat);
  body.scale.set(8.8, 4.2, 6.8);
  body.position.y = 2.1;
  farGroup.add(body);

  const roof = new THREE.Mesh(cache.pyramidFourGeo, cache.pavilionRoofMat);
  roof.scale.set(9.4, 2.5, 7.6);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 5.4;
  farGroup.add(roof);

  lod.addLevel(farGroup, 68);
  return lod;
}

/**
 * Wraps Demon Citadels, Watchtowers & Huts in a 2-level THREE.LOD (switch at 82m).
 */
export function wrapDemonStructureWithLod(
  fullGroup: THREE.Group,
  x: number,
  z: number,
  scale: number,
  rotY: number,
  kind: 'CITADEL' | 'TOWER' | 'HUT',
  cache: MobileLodAssetCache
): THREE.LOD {
  const lod = new THREE.LOD();
  lod.position.set(x, groundHeightAt(x, z), z);
  lod.rotation.y = rotY;
  lod.scale.setScalar(scale);

  fullGroup.position.set(0, 0, 0);
  fullGroup.rotation.set(0, 0, 0);
  fullGroup.scale.setScalar(1);
  lod.addLevel(fullGroup, 0);

  const farGroup = new THREE.Group();
  if (kind === 'CITADEL') {
    const keep = new THREE.Mesh(cache.unitBoxGeo, cache.obsidianMat);
    keep.scale.set(10.5, 7.6, 10.5);
    keep.position.y = 3.8;
    farGroup.add(keep);

    const spire = new THREE.Mesh(cache.pyramidFourGeo, cache.obsidianMat);
    spire.scale.set(8.0, 5.8, 8.0);
    spire.rotation.y = Math.PI / 4;
    spire.position.y = 10.4;
    farGroup.add(spire);
  } else if (kind === 'TOWER') {
    const shaft = new THREE.Mesh(cache.octCylinderGeo, cache.obsidianMat);
    shaft.scale.set(3.2, 8.4, 3.2);
    shaft.position.y = 4.2;
    farGroup.add(shaft);

    const spire = new THREE.Mesh(cache.coneSixGeo, cache.emberMat);
    spire.scale.set(2.8, 3.8, 2.8);
    spire.position.y = 10.2;
    farGroup.add(spire);
  } else {
    const body = new THREE.Mesh(cache.unitBoxGeo, cache.obsidianMat);
    body.scale.set(6.2, 3.6, 5.2);
    body.position.y = 1.8;
    farGroup.add(body);

    const roof = new THREE.Mesh(cache.pyramidFourGeo, cache.obsidianMat);
    roof.scale.set(6.8, 2.7, 5.8);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 5.0;
    farGroup.add(roof);
  }

  lod.addLevel(farGroup, 82);
  return lod;
}

/**
 * Wraps the high-poly 48x28 Volcano mesh in a 2-level THREE.LOD (switch at 245m).
 * Cuts ~85% of vertex load on distant horizon volcanoes without altering closeup craters or lava flows.
 */
export function wrapVolcanoWithLod(
  fullGroup: THREE.Group,
  x: number,
  z: number,
  radius: number,
  height: number,
  cache: MobileLodAssetCache
): THREE.LOD {
  const lod = new THREE.LOD();
  const baseY = groundHeightAt(x, z);
  lod.position.set(x, baseY - 0.6, z);

  fullGroup.position.set(0, 0, 0);
  lod.addLevel(fullGroup, 0);

  const farGroup = new THREE.Group();
  const coarseConeGeo = cache.trackGeo(
    new THREE.CylinderGeometry(radius * 0.23, radius, height, 14, 3, false)
  );
  const coarseCone = new THREE.Mesh(coarseConeGeo, cache.volcanoRockMat);
  coarseCone.position.y = height * 0.5;
  farGroup.add(coarseCone);

  const caldera = new THREE.Mesh(cache.discGeo, cache.volcanoMagmaMat);
  caldera.rotation.x = -Math.PI / 2;
  caldera.scale.setScalar(radius * 0.22);
  caldera.position.y = height - 0.1;
  farGroup.add(caldera);

  lod.addLevel(farGroup, 245);
  return lod;
}

/**
 * Wraps multi-peak Obsidian Mountains in a 2-level THREE.LOD (switch at 240m).
 */
export function wrapBlackMountainWithLod(
  fullGroup: THREE.Group,
  x: number,
  z: number,
  radius: number,
  height: number,
  seed: number,
  cache: MobileLodAssetCache
): THREE.LOD {
  const lod = new THREE.LOD();
  lod.position.set(x, groundHeightAt(x, z) - 0.8, z);

  fullGroup.position.set(0, 0, 0);
  lod.addLevel(fullGroup, 0);

  const farPeak = new THREE.Mesh(cache.hexPeakGeo, cache.obsidianMat);
  farPeak.scale.set(radius, height, radius);
  farPeak.position.y = height * 0.5;
  farPeak.rotation.y = seed;
  lod.addLevel(farPeak, 240);
  return lod;
}

/**
 * Computes distance-based simulation / animation / shadow LOD tier using squared distance.
 */
export function computeEntityLodTier(
  distSq: number,
  fullDistSq = 1764,   // 42m
  medDistSq = 7225,    // 85m
  farDistSq = 15625    // 125m
): DynamicLodTier {
  if (distSq <= fullDistSq) return 'FULL';
  if (distSq <= medDistSq) return 'MEDIUM';
  if (distSq <= farDistSq) return 'FAR';
  return 'CULLED';
}
