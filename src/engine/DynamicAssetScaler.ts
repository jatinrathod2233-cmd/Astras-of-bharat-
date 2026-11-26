import * as THREE from 'three';
import {
  estimateRenderTargetsBytes,
  HardwareEnvelope,
  HardwareMonitor,
  MemoryBudgetSnapshot,
  ShaderComplexityLevel,
  TextureResolutionTier,
} from './HardwareProfiler';
import { ObjectPoolManager } from './ObjectPoolManager';
import { QualityManager, QualityProfile } from './QualityManager';
import { downscaleCanvasTextureInPlace, ProceduralTextures } from './textures';
import { AstraVfxManager } from './astraVfx';

interface OriginalMaterialProps {
  normalMap: THREE.Texture | null;
  roughnessMap: THREE.Texture | null;
  metalnessMap: THREE.Texture | null;
  aoMap: THREE.Texture | null;
  aoMapIntensity: number;
  bumpMap: THREE.Texture | null;
  bumpScale: number;
  clearcoat: number;
  sheen: number;
  anisotropy: number;
  envMapIntensity: number;
}

interface StandaloneTextureEntry {
  tex: THREE.CanvasTexture;
  essential: boolean;
  defaultMipmapped: boolean;
}

const SHADER_RANK: Record<ShaderComplexityLevel, number> = {
  FAST: 0,
  BALANCED: 1,
  FULL: 2,
};

function stepDownTextureTier(
  cur: TextureResolutionTier
): TextureResolutionTier {
  if (cur > 512) return 512;
  if (cur > 256) return 256;
  return 128;
}

function stepDownShaderLevel(
  cur: ShaderComplexityLevel
): ShaderComplexityLevel {
  if (cur === 'FULL') return 'BALANCED';
  return 'FAST';
}

/**
 * Dynamic, non-disruptive live asset scaler and strict memory-budget enforcer.
 * - Downscales GPU textures in-place across micro-budgeted frames (zero freezes, zero asset reload).
 * - Simplifies PBR shaders (normal/roughness/metalness maps, clearcoat, sheen, anisotropy, IBL)
 *   incrementally within a strict per-frame recompile budget.
 * - Trims standby object pools & tightens render targets before VRAM/heap exhaustion can crash WebGL.
 */
export class DynamicAssetScaler {
  public readonly envelope: HardwareEnvelope;
  public readonly monitor: HardwareMonitor;

  private readonly materialSet = new Set<THREE.Material>();
  private readonly materialList: THREE.Material[] = [];
  private readonly originals = new WeakMap<THREE.Material, OriginalMaterialProps>();
  private readonly appliedLevels = new WeakMap<THREE.Material, ShaderComplexityLevel>();
  private readonly pendingMatIndices: number[] = [];
  private pendingMatCursor = 0;

  private readonly standaloneTextures: StandaloneTextureEntry[] = [];

  private targetTextureRes: TextureResolutionTier;
  private targetShaderLevel: ShaderComplexityLevel;
  private dropSecondaryMips: boolean;
  private texturesPendingDownscale = false;

  private memoryCheckAccum = 0;
  private emergencyVramRelief = false;
  private emergencyEnvStripped = false;
  private emergencyShadowsDisabled = false;
  private emergencyPixelScale = 1.0;

  private disposed = false;

  constructor(envelope: HardwareEnvelope, initialProfile: QualityProfile) {
    this.envelope = envelope;
    this.monitor = new HardwareMonitor(envelope);
    this.targetTextureRes = initialProfile.textureSize;
    this.targetShaderLevel = initialProfile.shaderLevel;
    this.dropSecondaryMips = initialProfile.skipNonEssentialMipmaps;
  }

  public getTargetTextureRes(): TextureResolutionTier {
    return this.targetTextureRes;
  }

  public getTargetShaderLevel(): ShaderComplexityLevel {
    return this.targetShaderLevel;
  }

  public getPixelScaleOverride(): number {
    return this.emergencyPixelScale;
  }

  public isEnvStripped(): boolean {
    return this.emergencyEnvStripped;
  }

  public areShadowsDisabledByEmergency(): boolean {
    return this.emergencyShadowsDisabled;
  }

  public getLastMemorySnapshot(): MemoryBudgetSnapshot {
    return this.monitor.getLastSnapshot();
  }

  public registerStandaloneTexture(
    tex: THREE.CanvasTexture,
    essential = false
  ): void {
    if (this.disposed) return;
    for (let i = 0; i < this.standaloneTextures.length; i++) {
      if (this.standaloneTextures[i].tex === tex) return;
    }
    this.standaloneTextures.push({
      tex,
      essential,
      defaultMipmapped: tex.generateMipmaps,
    });
  }

  /**
   * Registers all meshes/materials under `root`. When `applyImmediately` is true (used at boot
   * before initial `compileAsync`), materials on constrained hardware are simplified upfront so heavy
   * shaders are never compiled only to be torn down immediately after.
   */
  public registerObjectTree(
    root: THREE.Object3D,
    applyImmediately = false
  ): void {
    if (this.disposed) return;
    root.traverse((obj) => {
      const matRef = (obj as THREE.Mesh | THREE.Points | THREE.Sprite)
        .material;
      if (!matRef) return;
      if (Array.isArray(matRef)) {
        for (let i = 0; i < matRef.length; i++) {
          this.registerSingleMaterial(matRef[i], applyImmediately);
        }
      } else {
        this.registerSingleMaterial(matRef, applyImmediately);
      }
    });
  }

  private registerSingleMaterial(
    mat: THREE.Material,
    applyImmediately: boolean
  ): void {
    if (!mat || this.materialSet.has(mat)) return;
    const std = mat as THREE.MeshPhysicalMaterial;
    if (!std.isMeshStandardMaterial && !std.isMeshPhysicalMaterial) {
      return;
    }

    this.materialSet.add(mat);
    const idx = this.materialList.length;
    this.materialList.push(mat);

    this.originals.set(mat, {
      normalMap: std.normalMap ?? null,
      roughnessMap: std.roughnessMap ?? null,
      metalnessMap: std.metalnessMap ?? null,
      aoMap: std.aoMap ?? null,
      aoMapIntensity:
        typeof std.aoMapIntensity === 'number' ? std.aoMapIntensity : 1.0,
      bumpMap: std.bumpMap ?? null,
      bumpScale: typeof std.bumpScale === 'number' ? std.bumpScale : 0,
      clearcoat: typeof std.clearcoat === 'number' ? std.clearcoat : 0,
      sheen: typeof std.sheen === 'number' ? std.sheen : 0,
      anisotropy: typeof std.anisotropy === 'number' ? std.anisotropy : 0,
      envMapIntensity:
        typeof std.envMapIntensity === 'number' ? std.envMapIntensity : 1.0,
    });
    this.appliedLevels.set(mat, 'FULL');

    if (this.targetShaderLevel !== 'FULL') {
      if (applyImmediately) {
        this.applyShaderLevelToMaterial(mat, this.targetShaderLevel);
      } else {
        this.pendingMatIndices.push(idx);
      }
    }
  }

  /**
   * Updates target shader & texture budgets when QualityProfile changes.
   * Note: in AUTO / pressure-capped operation, texture size never scales UP once downscaled to protect RAM.
   */
  public syncWithProfile(
    profile: QualityProfile,
    allowShaderUpgrade: boolean
  ): void {
    if (this.disposed) return;

    if (profile.textureSize < this.targetTextureRes) {
      this.targetTextureRes = profile.textureSize;
      this.texturesPendingDownscale = true;
    }
    if (profile.skipNonEssentialMipmaps && !this.dropSecondaryMips) {
      this.dropSecondaryMips = true;
      this.texturesPendingDownscale = true;
    }

    const desiredShader =
      this.emergencyVramRelief
        ? 'FAST'
        : allowShaderUpgrade ||
          SHADER_RANK[profile.shaderLevel] < SHADER_RANK[this.targetShaderLevel]
        ? profile.shaderLevel
        : this.targetShaderLevel;

    this.setShaderLevelTarget(desiredShader);
  }

  public setShaderLevelTarget(level: ShaderComplexityLevel): void {
    if (this.disposed || level === this.targetShaderLevel) return;
    this.targetShaderLevel = level;
    this.pendingMatIndices.length = 0;
    this.pendingMatCursor = 0;
    for (let i = 0; i < this.materialList.length; i++) {
      const m = this.materialList[i];
      if (this.appliedLevels.get(m) !== level) {
        this.pendingMatIndices.push(i);
      }
    }
  }

  public requestTextureDownscale(
    targetSize: TextureResolutionTier,
    dropSecondaryMips = true
  ): void {
    if (targetSize < this.targetTextureRes) {
      this.targetTextureRes = targetSize;
      this.texturesPendingDownscale = true;
    }
    if (dropSecondaryMips && !this.dropSecondaryMips) {
      this.dropSecondaryMips = true;
      this.texturesPendingDownscale = true;
    }
  }

  private applyShaderLevelToMaterial(
    mat: THREE.Material,
    level: ShaderComplexityLevel
  ): boolean {
    if (this.appliedLevels.get(mat) === level) return false;
    const orig = this.originals.get(mat);
    if (!orig) {
      this.appliedLevels.set(mat, level);
      return false;
    }

    const std = mat as THREE.MeshPhysicalMaterial;
    const prevHasNormal = Boolean(std.normalMap);
    const prevHasRough = Boolean(std.roughnessMap);
    const prevHasMetal = Boolean(std.metalnessMap);
    const prevHasAo = Boolean(std.aoMap);
    const prevHasBump = Boolean(std.bumpMap);
    const prevHasClearcoat =
      typeof std.clearcoat === 'number' && std.clearcoat > 0;
    const prevHasSheen = typeof std.sheen === 'number' && std.sheen > 0;
    const prevHasAniso =
      typeof std.anisotropy === 'number' && std.anisotropy > 0;

    if (level === 'FULL') {
      std.normalMap = orig.normalMap;
      std.roughnessMap = orig.roughnessMap;
      std.metalnessMap = orig.metalnessMap;
      std.aoMap = orig.aoMap;
      std.aoMapIntensity = orig.aoMapIntensity;
      std.bumpMap = orig.bumpMap;
      std.bumpScale = orig.bumpScale;
      if (std.isMeshPhysicalMaterial) {
        std.clearcoat = orig.clearcoat;
        std.sheen = orig.sheen;
        std.anisotropy = orig.anisotropy;
      }
      std.envMapIntensity = orig.envMapIntensity;
    } else if (level === 'BALANCED') {
      std.normalMap = orig.normalMap;
      std.roughnessMap = null;
      std.metalnessMap = null;
      std.aoMap = null;
      std.bumpMap = null;
      if (std.isMeshPhysicalMaterial) {
        std.clearcoat = 0;
        std.sheen = 0;
        std.anisotropy = orig.anisotropy;
      }
      std.envMapIntensity = Math.max(0.45, orig.envMapIntensity * 0.85);
    } else {
      // FAST: strip tangent-space normal/roughness/metalness/ao/bump lookups & physical lobes
      std.normalMap = null;
      std.roughnessMap = null;
      std.metalnessMap = null;
      std.aoMap = null;
      std.bumpMap = null;
      if (std.isMeshPhysicalMaterial) {
        std.clearcoat = 0;
        std.sheen = 0;
        std.anisotropy = 0;
      }
      std.envMapIntensity = Math.max(0.25, orig.envMapIntensity * 0.42);
    }

    this.appliedLevels.set(mat, level);

    const nextHasNormal = Boolean(std.normalMap);
    const nextHasRough = Boolean(std.roughnessMap);
    const nextHasMetal = Boolean(std.metalnessMap);
    const nextHasAo = Boolean(std.aoMap);
    const nextHasBump = Boolean(std.bumpMap);
    const nextHasClearcoat =
      typeof std.clearcoat === 'number' && std.clearcoat > 0;
    const nextHasSheen = typeof std.sheen === 'number' && std.sheen > 0;
    const nextHasAniso =
      typeof std.anisotropy === 'number' && std.anisotropy > 0;

    const definesChanged =
      prevHasNormal !== nextHasNormal ||
      prevHasRough !== nextHasRough ||
      prevHasMetal !== nextHasMetal ||
      prevHasAo !== nextHasAo ||
      prevHasBump !== nextHasBump ||
      prevHasClearcoat !== nextHasClearcoat ||
      prevHasSheen !== nextHasSheen ||
      prevHasAniso !== nextHasAniso;

    if (definesChanged) {
      std.needsUpdate = true;
    }
    return definesChanged;
  }

  private getStandaloneTextureBytes(): number {
    let bytes = 0;
    for (let i = 0; i < this.standaloneTextures.length; i++) {
      const t = this.standaloneTextures[i].tex;
      const img = t.image as HTMLCanvasElement | undefined;
      if (img && img.width > 0 && img.height > 0) {
        bytes += img.width * img.height * 4 * (t.generateMipmaps ? 1.3333 : 1);
      }
    }
    return Math.round(bytes);
  }

  private downscaleStandaloneTextures(): void {
    for (let i = 0; i < this.standaloneTextures.length; i++) {
      const e = this.standaloneTextures[i];
      const wantMip =
        e.defaultMipmapped && (e.essential || !this.dropSecondaryMips);
      downscaleCanvasTextureInPlace(e.tex, this.targetTextureRes, wantMip);
    }
  }

  /**
   * Executes incremental per-frame downscale/shader steps (<= budgetMs) and periodic
   * hardware VRAM/heap budget enforcement without freezing or interrupting active gameplay.
   */
  public stepFrame(
    rawDt: number,
    params: {
      allowAutoScale: boolean;
      renderer: THREE.WebGLRenderer;
      qualityManager: QualityManager;
      textures: ProceduralTextures | null;
      poolManager: ObjectPoolManager;
      astraVfx: AstraVfxManager | null;
      keyShadowSize: number;
      torchShadowSize: number;
      torchShadowEnabled: boolean;
      composerRt: THREE.WebGLRenderTarget | null;
      hasEnvProbe: boolean;
      onProfileNeedsApply: () => void;
      onEmergencyEnvironmentStrip: () => void;
    },
    budgetMs = 2.0
  ): void {
    if (this.disposed) return;

    const frameStart = performance.now();

    // 1. Flush queued texture downscales within frame budget
    if (this.texturesPendingDownscale && params.textures) {
      const done = params.textures.downscaleStep(
        this.targetTextureRes,
        this.dropSecondaryMips,
        Math.max(0.8, budgetMs * 0.65)
      );
      if (done) {
        this.downscaleStandaloneTextures();
        this.texturesPendingDownscale = false;
      }
    }

    // 2. Flush queued material shader simplifications (capped to <= 4 recompiles / frame)
    if (this.pendingMatCursor < this.pendingMatIndices.length) {
      let recompilesThisFrame = 0;
      while (this.pendingMatCursor < this.pendingMatIndices.length) {
        const matIdx = this.pendingMatIndices[this.pendingMatCursor++];
        const mat = this.materialList[matIdx];
        if (mat && this.applyShaderLevelToMaterial(mat, this.targetShaderLevel)) {
          recompilesThisFrame++;
        }
        if (
          recompilesThisFrame >= 4 ||
          performance.now() - frameStart >= budgetMs
        ) {
          break;
        }
      }
      if (this.pendingMatCursor >= this.pendingMatIndices.length) {
        this.pendingMatIndices.length = 0;
        this.pendingMatCursor = 0;
      }
    }

    // 3. Periodic real-time memory & VRAM budget evaluation (~every 0.45s)
    this.memoryCheckAccum += rawDt;
    if (this.memoryCheckAccum < 0.45) return;
    this.memoryCheckAccum = 0;

    const texBytes = params.textures
      ? params.textures.getEstimatedVramBytes()
      : 0;
    const vfxBytes = params.astraVfx
      ? params.astraVfx.getEstimatedVramBytes()
      : 0;
    const standaloneBytes = this.getStandaloneTextureBytes();
    const rtBytes = estimateRenderTargetsBytes(
      params.renderer,
      params.keyShadowSize,
      params.torchShadowSize,
      params.torchShadowEnabled,
      params.composerRt,
      params.hasEnvProbe
    );

    const snap = this.monitor.sampleMemoryPressure(
      texBytes + vfxBytes + standaloneBytes + rtBytes
    );

    const steppedTier = params.qualityManager.reportMemoryPressure(
      snap.pressure,
      params.allowAutoScale
    );

    if (snap.vramRatio >= 0.88 || snap.pressure !== 'NONE') {
      // Trim excess pooled objects cleanly without affecting live scene entities
      params.poolManager.trimIdlePools(
        snap.pressure === 'CRITICAL' ? 0 : 0.35
      );
    }

    if (snap.pressure === 'CRITICAL' || snap.vramRatio >= 0.96) {
      // Aggressive in-place asset scaling to guarantee zero OOM / context crash
      const nextTex = stepDownTextureTier(this.targetTextureRes);
      if (nextTex < this.targetTextureRes || !this.dropSecondaryMips) {
        this.requestTextureDownscale(nextTex, true);
      }

      const nextShader = stepDownShaderLevel(this.targetShaderLevel);
      if (nextShader !== this.targetShaderLevel) {
        this.setShaderLevelTarget(nextShader);
        params.astraVfx?.setShaderQuality(nextShader);
      }

      if (snap.vramRatio >= 1.02) {
        this.emergencyVramRelief = true;
        // Never downscale render resolution below full native clarity
        this.emergencyPixelScale = 1.0;
        if (!this.emergencyEnvStripped) {
          this.emergencyEnvStripped = true;
          params.onEmergencyEnvironmentStrip();
        }
        if (snap.vramRatio >= 1.15) {
          this.emergencyShadowsDisabled = true;
        }
      }

      if (steppedTier !== null || snap.vramRatio >= 1.02) {
        params.onProfileNeedsApply();
      }
    } else if (steppedTier !== null) {
      params.onProfileNeedsApply();
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.materialSet.clear();
    this.materialList.length = 0;
    this.pendingMatIndices.length = 0;
    this.standaloneTextures.length = 0;
  }
}
