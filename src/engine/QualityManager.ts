import * as THREE from 'three';
import {
  HardwareBenchmarkSummary,
  QualityMode,
  QualityTier,
} from '../types/world';
import {
  applyBenchmarkToEnvelope,
  HardwareEnvelope,
  LaunchBenchmarkReport,
  loadCachedBenchmark,
  MemoryPressureLevel,
  probeHardwareEnvelope,
  ShaderComplexityLevel,
  TextureResolutionTier,
} from './HardwareProfiler';

const STORAGE_MODE_KEY = 'astras_quality_mode_v1';
const STORAGE_TIER_KEY = 'astras_quality_tier_v1';

export interface QualityProfile {
  tier: QualityTier;
  pixelRatioCap: number;
  keyShadowSize: number;
  shadowFrustumHalf: number;
  shadowType: THREE.ShadowMapType;
  shadowsEnabled: boolean;
  torchShadowSize: number;
  torchShadowEnabled: boolean;
  maxActiveNightLamps: number;
  composerSamples: number;
  composerHalfFloat: boolean;
  underwaterScale: number;
  postProcessScale: number;
  sharpnessFactor: number;
  edgeEnhanceIntensity: number;
  smoothFilterStrength: number;
  toneMapping: THREE.ToneMapping;
  particleScale: number;
  cameraFar: number;
  fogFarScale: number;
  textureSize: TextureResolutionTier;
  anisotropyCap: number;
  skipNonEssentialMipmaps: boolean;
  distanceCullScale: number;
  shaderLevel: ShaderComplexityLevel;
  allowEnvIbl: boolean;
  vramBudgetMb: number;
  bloomEnabled: boolean;
  motionBlurEnabled: boolean;
  cloudDetailEnabled: boolean;
  waterfallDetailEnabled: boolean;
  shaderSlopeBlendEnabled: boolean;
}

export interface DeviceCapabilityInfo {
  isMobile: boolean;
  isVeryWeak: boolean;
  isHighEndDesktop: boolean;
  cores: number;
  memoryGb: number | null;
  dpr: number;
  screenMinPx: number;
  initialTier: QualityTier;
}

const TIER_RANK: Record<QualityTier, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

export interface FrameScaleAdjustment {
  tierChanged: QualityTier | null;
  resolutionChanged: boolean;
}

const MIN_DYNAMIC_RES_SCALE = 1.0;

function quantizeResScale(_v: number): number {
  return 1.0;
}

function clampTierToCeiling(
  tier: QualityTier,
  ceiling: QualityTier
): QualityTier {
  return TIER_RANK[tier] > TIER_RANK[ceiling] ? ceiling : tier;
}

function isValidTier(v: unknown): v is QualityTier {
  return v === 'HIGH' || v === 'MEDIUM' || v === 'LOW';
}

function isValidMode(v: unknown): v is QualityMode {
  return v === 'AUTO' || v === 'HIGH' || v === 'MEDIUM' || v === 'LOW';
}

export function detectDeviceCapabilities(
  isSoftwareGl: boolean,
  envelope?: HardwareEnvelope
): DeviceCapabilityInfo {
  const env = envelope ?? probeHardwareEnvelope();
  return {
    isMobile: env.isMobile,
    isVeryWeak: isSoftwareGl ? true : env.isVeryWeak,
    isHighEndDesktop: isSoftwareGl ? false : env.isHighEndDesktop,
    cores: env.cores,
    memoryGb: env.memoryGb,
    dpr: env.dpr,
    screenMinPx: env.screenMinPx,
    initialTier: isSoftwareGl ? 'LOW' : env.initialTier,
  };
}

export function buildQualityProfile(
  tier: QualityTier,
  isSoftwareGl: boolean,
  isVeryWeak: boolean,
  capabilities?: DeviceCapabilityInfo,
  envelope?: HardwareEnvelope
): QualityProfile {
  const isMobile = capabilities?.isMobile ?? envelope?.isMobile ?? false;
  const isHighEndDesktop =
    capabilities?.isHighEndDesktop ?? envelope?.isHighEndDesktop ?? false;
  const vramBudgetMb = envelope?.vramBudgetMb ?? (isMobile ? 150 : 280);
  const maxTex = envelope?.maxTextureSize ?? 4096;

  const maxSamples = envelope?.maxSamples ?? 4;
  const msaaHigh = isSoftwareGl ? 0 : Math.min(4, maxSamples || 4);
  const msaaLow = isSoftwareGl ? 0 : Math.min(2, maxSamples || 2);

  if (tier === 'HIGH' && !isSoftwareGl) {
    const texSize: TextureResolutionTier =
      vramBudgetMb >= 380 && !isMobile && maxTex >= 4096
        ? 2048
        : vramBudgetMb < 140
        ? 512
        : 1024;
    const keyShadow = Math.min(maxTex, isMobile ? 2048 : 4096);
    return {
      tier: 'HIGH',
      pixelRatioCap: isMobile ? 2.5 : 3.0,
      keyShadowSize: keyShadow,
      shadowFrustumHalf: isMobile ? 26 : 32,
      shadowType: THREE.PCFShadowMap,
      shadowsEnabled: true,
      torchShadowSize: Math.min(maxTex, 1024),
      torchShadowEnabled: true,
      maxActiveNightLamps: isMobile ? 3 : 5,
      composerSamples: msaaHigh,
      composerHalfFloat: vramBudgetMb >= 220 && !isMobile,
      underwaterScale: 1.0,
      postProcessScale: 1.0,
      sharpnessFactor: 1.0,
      edgeEnhanceIntensity: 1.0,
      smoothFilterStrength: 0.0,
      toneMapping: THREE.ACESFilmicToneMapping,
      particleScale: isHighEndDesktop ? 1.1 : 0.9,
      cameraFar: 4500,
      fogFarScale: 0.0,
      textureSize: texSize,
      anisotropyCap: 16,
      skipNonEssentialMipmaps: false,
      distanceCullScale: isMobile ? 2.4 : 3.2,
      shaderLevel: 'FULL',
      allowEnvIbl: true,
      vramBudgetMb,
      bloomEnabled: false,
      motionBlurEnabled: false,
      cloudDetailEnabled: true,
      waterfallDetailEnabled: true,
      shaderSlopeBlendEnabled: true,
    };
  }

  if (tier === 'MEDIUM' && !isSoftwareGl) {
    const texSize: TextureResolutionTier = vramBudgetMb < 105 ? 512 : 1024;
    return {
      tier: 'MEDIUM',
      pixelRatioCap: 2.0,
      keyShadowSize: Math.min(maxTex, 2048),
      shadowFrustumHalf: 22,
      shadowType: THREE.PCFShadowMap,
      shadowsEnabled: true,
      torchShadowSize: 512,
      torchShadowEnabled: vramBudgetMb >= 120,
      maxActiveNightLamps: 2,
      composerSamples: msaaHigh,
      composerHalfFloat: false,
      underwaterScale: 1.0,
      postProcessScale: 1.0,
      sharpnessFactor: 1.0,
      edgeEnhanceIntensity: 1.0,
      smoothFilterStrength: 0.0,
      toneMapping: THREE.ACESFilmicToneMapping,
      particleScale: 0.55,
      cameraFar: 3800,
      fogFarScale: 0.0,
      textureSize: texSize,
      anisotropyCap: 16,
      skipNonEssentialMipmaps: false,
      distanceCullScale: 2.0,
      shaderLevel: 'BALANCED',
      allowEnvIbl: true,
      vramBudgetMb,
      bloomEnabled: false,
      motionBlurEnabled: false,
      cloudDetailEnabled: true,
      waterfallDetailEnabled: true,
      shaderSlopeBlendEnabled: true,
    };
  }

  const tightTex: TextureResolutionTier =
    vramBudgetMb <= 72 ? 256 : 512;

  return {
    tier: 'LOW',
    pixelRatioCap: 2.0,
    keyShadowSize: Math.min(maxTex, 1024),
    shadowFrustumHalf: 18,
    shadowType: THREE.PCFShadowMap,
    shadowsEnabled: !isSoftwareGl && (!isVeryWeak || vramBudgetMb >= 64),
    torchShadowSize: 0,
    torchShadowEnabled: false,
    maxActiveNightLamps: isVeryWeak || isSoftwareGl ? 0 : 1,
    composerSamples: msaaLow,
    composerHalfFloat: false,
    underwaterScale: 1.0,
    postProcessScale: 1.0,
    sharpnessFactor: 1.0,
    edgeEnhanceIntensity: 1.0,
    smoothFilterStrength: 0.0,
    toneMapping: THREE.ACESFilmicToneMapping,
    particleScale: 0.3,
    cameraFar: 3200,
    fogFarScale: 0.0,
    textureSize: tightTex,
    anisotropyCap: 16,
    skipNonEssentialMipmaps: vramBudgetMb < 80,
    distanceCullScale: 1.6,
    shaderLevel: 'FAST',
    allowEnvIbl: vramBudgetMb >= 70 && !isSoftwareGl,
    vramBudgetMb,
    bloomEnabled: false,
    motionBlurEnabled: false,
    cloudDetailEnabled: false,
    waterfallDetailEnabled: !isVeryWeak && !isSoftwareGl,
    shaderSlopeBlendEnabled: false,
  };
}

/**
 * Zero-GC rolling 60-frame performance, thermal-throttling & memory-envelope
 * controller with hysteresis and thermal backoff locking.
 */
export class QualityManager {
  public readonly envelope: HardwareEnvelope;
  public readonly capabilities: DeviceCapabilityInfo;
  private readonly isSoftwareGl: boolean;

  private mode: QualityMode = 'AUTO';
  private activeTier: QualityTier;
  private activeProfile: QualityProfile;

  // Fixed circular buffer for last 60 frame delta times (seconds)
  private readonly frameSamples = new Float64Array(60);
  private sampleCursor = 0;
  private sampleCount = 0;
  private sampleSum = 0;
  private averageFps = 60;

  // Thermal jitter / hitch tracking (zero allocations)
  private emaDt = 1 / 60;
  private thermalSpikeAccum = 0;
  private thermalSteppedDownCount = 0;
  private thermalLockTimer = 0;
  private memoryLockedUpgrades = false;

  private lowFpsAccum = 0;
  private highFpsAccum = 0;
  private cooldownTimer = 4.0; // Grace period right after boot / mode switch

  // Continuous closed-loop Dynamic Resolution Scaling (DRS) + Launch Benchmark Lock
  private targetFps = 60;
  private dynamicResScale = 1.0;
  private resCooldownTimer = 2.0;
  private resDownAccum = 0;
  private resUpAccum = 0;
  private benchmarkReport: LaunchBenchmarkReport | null = null;
  private readonly frameResult: FrameScaleAdjustment = {
    tierChanged: null,
    resolutionChanged: false,
  };

  constructor(envelopeOrSoftwareFlag: HardwareEnvelope | boolean) {
    if (typeof envelopeOrSoftwareFlag === 'boolean') {
      this.isSoftwareGl = envelopeOrSoftwareFlag;
      this.envelope = probeHardwareEnvelope();
    } else {
      this.envelope = envelopeOrSoftwareFlag;
      this.isSoftwareGl = envelopeOrSoftwareFlag.isSoftwareGl;
    }

    const cachedReport = loadCachedBenchmark(this.envelope);
    if (cachedReport) {
      this.benchmarkReport = cachedReport;
      applyBenchmarkToEnvelope(this.envelope, cachedReport);
      this.targetFps = cachedReport.targetFps;
      this.dynamicResScale = this.isSoftwareGl
        ? 1.0
        : quantizeResScale(cachedReport.recommendedResScale);
    } else {
      this.targetFps = this.isSoftwareGl ? 30 : 60;
    }

    this.capabilities = detectDeviceCapabilities(
      this.isSoftwareGl,
      this.envelope
    );

    let savedMode: QualityMode = 'AUTO';
    let savedTier: QualityTier | null = null;
    try {
      const m = localStorage.getItem(STORAGE_MODE_KEY);
      if (isValidMode(m)) savedMode = m;
      const t = localStorage.getItem(STORAGE_TIER_KEY);
      if (isValidTier(t)) savedTier = t;
    } catch {
      // Ignore storage access restrictions
    }

    this.mode = savedMode;
    if (savedMode !== 'AUTO') {
      this.activeTier = savedMode;
    } else if (savedTier) {
      this.activeTier = clampTierToCeiling(savedTier, this.envelope.maxSafeTier);
    } else {
      this.activeTier = this.capabilities.initialTier;
    }

    this.activeProfile = buildQualityProfile(
      this.activeTier,
      this.isSoftwareGl,
      this.capabilities.isVeryWeak,
      this.capabilities,
      this.envelope
    );
  }

  public getEnvelope(): HardwareEnvelope {
    return this.envelope;
  }

  public getMode(): QualityMode {
    return this.mode;
  }

  public getTier(): QualityTier {
    return this.activeTier;
  }

  public getProfile(): QualityProfile {
    return this.activeProfile;
  }

  public getFps(): number {
    return Math.round(this.averageFps);
  }

  public getTargetFps(): number {
    return this.targetFps;
  }

  public getDynamicResolutionScale(): number {
    return this.dynamicResScale;
  }

  public getBenchmarkSummary(): HardwareBenchmarkSummary | null {
    return this.benchmarkReport;
  }

  public isThermalLocked(): boolean {
    return this.thermalLockTimer > 0 || this.memoryLockedUpgrades;
  }

  /**
   * Locks the maximum sustainable rendering fidelity tier, target FPS,
   * and starting dynamic resolution scale from the automated CPU/GPU/RAM benchmark.
   */
  public applyBenchmarkLock(report: LaunchBenchmarkReport): boolean {
    this.benchmarkReport = report;
    applyBenchmarkToEnvelope(this.envelope, report);
    this.targetFps = report.targetFps;
    this.dynamicResScale = this.isSoftwareGl
      ? 1.0
      : quantizeResScale(report.recommendedResScale);

    const prevTier = this.activeTier;
    if (this.mode === 'AUTO') {
      this.applyTierInternal(report.lockedTier);
    } else {
      // Still clamp profile/VRAM bounds safely
      this.applyTierInternal(this.activeTier);
    }
    this.resetFrameMetrics(3.5);
    return prevTier !== this.activeTier;
  }

  public setMode(mode: QualityMode): QualityTier | null {
    this.mode = mode;
    this.thermalLockTimer = 0;
    this.memoryLockedUpgrades = false;
    this.dynamicResScale =
      mode === 'AUTO' && this.benchmarkReport
        ? quantizeResScale(this.benchmarkReport.recommendedResScale)
        : 1.0;
    try {
      localStorage.setItem(STORAGE_MODE_KEY, mode);
    } catch {
      // Ignore
    }

    const nextTier =
      mode === 'AUTO'
        ? clampTierToCeiling(this.activeTier, this.envelope.maxSafeTier)
        : mode;
    this.resetFrameMetrics(3.5);
    if (nextTier !== this.activeTier) {
      this.applyTierInternal(nextTier);
      return nextTier;
    }
    return null;
  }

  public resetFrameMetrics(graceCooldownSec = 3.0): void {
    this.sampleCursor = 0;
    this.sampleCount = 0;
    this.sampleSum = 0;
    this.emaDt = 1 / Math.max(30, this.targetFps);
    this.lowFpsAccum = 0;
    this.highFpsAccum = 0;
    this.resDownAccum = 0;
    this.resUpAccum = 0;
    this.thermalSpikeAccum = 0;
    this.cooldownTimer = Math.max(this.cooldownTimer, graceCooldownSec);
    this.resCooldownTimer = Math.max(this.resCooldownTimer, 1.5);
  }

  /**
   * Emergency GPU pressure relief triggered after a WebGL context loss so restored contexts
   * allocate lighter render targets, shadow maps, and pixel ratios instead of crash-looping.
   */
  public stepDownOnContextLoss(): boolean {
    this.memoryLockedUpgrades = true;
    this.thermalSteppedDownCount = Math.min(4, this.thermalSteppedDownCount + 1);
    this.thermalLockTimer = Math.max(this.thermalLockTimer, 45.0);
    if (this.activeTier === 'HIGH') {
      this.applyTierInternal('MEDIUM');
      this.resetFrameMetrics(8.0);
      return true;
    }
    if (this.activeTier === 'MEDIUM') {
      this.applyTierInternal('LOW');
      this.resetFrameMetrics(10.0);
      return true;
    }
    this.resetFrameMetrics(8.0);
    return false;
  }

  /**
   * Evaluates live VRAM / JS heap pressure from HardwareMonitor.
   * CRITICAL pressure immediately forces a protective tier step-down even before the 2.5s FPS window elapses.
   */
  public reportMemoryPressure(
    pressure: MemoryPressureLevel,
    allowAutoScale: boolean
  ): QualityTier | null {
    if (pressure === 'NONE') {
      this.memoryLockedUpgrades = false;
      return null;
    }

    this.memoryLockedUpgrades = true;
    this.highFpsAccum = 0;

    if (
      pressure === 'CRITICAL' &&
      allowAutoScale &&
      this.mode === 'AUTO' &&
      !this.isSoftwareGl
    ) {
      this.thermalSteppedDownCount = Math.min(4, this.thermalSteppedDownCount + 1);
      this.thermalLockTimer = Math.max(this.thermalLockTimer, 40.0);
      if (this.activeTier === 'HIGH') {
        this.applyTierInternal('MEDIUM');
        this.resetFrameMetrics(8.0);
        return 'MEDIUM';
      }
      if (this.activeTier === 'MEDIUM') {
        this.applyTierInternal('LOW');
        this.resetFrameMetrics(10.0);
        return 'LOW';
      }
    }
    return null;
  }

  private applyTierInternal(tier: QualityTier): void {
    this.activeTier = tier;
    this.activeProfile = buildQualityProfile(
      tier,
      this.isSoftwareGl,
      this.capabilities.isVeryWeak,
      this.capabilities,
      this.envelope
    );
    try {
      localStorage.setItem(STORAGE_TIER_KEY, tier);
    } catch {
      // Ignore
    }
  }

  private triggerThermalStepDown(): QualityTier | null {
    this.thermalSteppedDownCount = Math.min(4, this.thermalSteppedDownCount + 1);
    const lockDuration = Math.min(90, 22 * this.thermalSteppedDownCount);
    this.thermalLockTimer = Math.max(this.thermalLockTimer, lockDuration);

    if (this.activeTier === 'HIGH') {
      this.dynamicResScale = 1.0;
      this.applyTierInternal('MEDIUM');
      this.resetFrameMetrics(6.5);
      return 'MEDIUM';
    }
    if (this.activeTier === 'MEDIUM') {
      this.dynamicResScale = 1.0;
      this.applyTierInternal('LOW');
      this.resetFrameMetrics(6.5);
      return 'LOW';
    }
    this.lowFpsAccum = 0;
    this.thermalSpikeAccum = 0;
    return null;
  }

  /**
   * Zero-GC closed-loop frame-time monitor & Dynamic Resolution Scaling controller.
   * Dynamically scales render resolution first to lock frame rate before stepping down fidelity tiers.
   */
  public recordFrame(
    rawDtSec: number,
    allowAutoScale: boolean
  ): FrameScaleAdjustment {
    this.frameResult.tierChanged = null;
    this.frameResult.resolutionChanged = false;

    if (rawDtSec <= 0.0005 || rawDtSec > 0.45) {
      // Ignore tab-resume or pause spikes so one stall never triggers a downgrade
      return this.frameResult;
    }

    if (this.sampleCount < 60) {
      this.frameSamples[this.sampleCursor] = rawDtSec;
      this.sampleSum += rawDtSec;
      this.sampleCount++;
    } else {
      const oldest = this.frameSamples[this.sampleCursor];
      this.sampleSum += rawDtSec - oldest;
      this.frameSamples[this.sampleCursor] = rawDtSec;
    }
    this.sampleCursor = (this.sampleCursor + 1) % 60;

    if (this.sampleCount >= 8 && this.sampleSum > 0) {
      this.averageFps = this.sampleCount / this.sampleSum;
    }

    // Smooth exponential frame-time baseline to detect thermal throttling jitter
    const dtDelta = Math.abs(rawDtSec - this.emaDt);
    this.emaDt += (rawDtSec - this.emaDt) * 0.08;

    if (!allowAutoScale || this.isSoftwareGl) {
      return this.frameResult;
    }

    if (this.resCooldownTimer > 0) {
      this.resCooldownTimer = Math.max(0, this.resCooldownTimer - rawDtSec);
    }

    if (this.sampleCount >= 20 && this.sampleSum > 0) {
      const avgDtSec = this.sampleSum / this.sampleCount;
      const targetBudgetSec = 1.0 / Math.max(30, this.targetFps);

      // Continuous Dynamic Resolution Scaling operates even when user manually chooses a tier
      // to strictly prevent thermal throttling and hold locked FPS, while AUTO also steps tiers.
      if (avgDtSec > targetBudgetSec * 1.12 || dtDelta > 0.015) {
        this.resDownAccum += rawDtSec;
        this.resUpAccum = Math.max(0, this.resUpAccum - rawDtSec * 2.0);
        if (
          this.resDownAccum >= 0.75 &&
          this.resCooldownTimer <= 0 &&
          this.dynamicResScale > MIN_DYNAMIC_RES_SCALE
        ) {
          const dropStep = avgDtSec > targetBudgetSec * 1.35 ? 0.1 : 0.05;
          const nextRes = quantizeResScale(this.dynamicResScale - dropStep);
          if (nextRes < this.dynamicResScale) {
            this.dynamicResScale = nextRes;
            this.resDownAccum = 0;
            this.resCooldownTimer = 1.15;
            this.frameResult.resolutionChanged = true;
          }
        }
      } else if (
        avgDtSec < targetBudgetSec * 0.86 &&
        this.dynamicResScale < 1.0 &&
        this.thermalLockTimer <= 0 &&
        !this.memoryLockedUpgrades
      ) {
        this.resUpAccum += rawDtSec;
        this.resDownAccum = Math.max(0, this.resDownAccum - rawDtSec * 1.5);
        if (this.resUpAccum >= 5.0 && this.resCooldownTimer <= 0) {
          const nextRes = quantizeResScale(this.dynamicResScale + 0.05);
          if (nextRes > this.dynamicResScale) {
            this.dynamicResScale = nextRes;
            this.resUpAccum = 0;
            this.resCooldownTimer = 2.4;
            this.frameResult.resolutionChanged = true;
          }
        }
      } else {
        this.resDownAccum = Math.max(0, this.resDownAccum - rawDtSec * 0.5);
        this.resUpAccum = Math.max(0, this.resUpAccum - rawDtSec * 0.5);
      }
    }

    if (this.mode !== 'AUTO') {
      return this.frameResult;
    }

    if (this.thermalLockTimer > 0) {
      this.thermalLockTimer = Math.max(0, this.thermalLockTimer - rawDtSec);
    }

    if (this.cooldownTimer > 0) {
      this.cooldownTimer = Math.max(0, this.cooldownTimer - rawDtSec);
      return this.frameResult;
    }

    if (this.sampleCount < 30) {
      return this.frameResult;
    }

    // Detect thermal throttling signature: sustained severe frame-time spikes/jitter (>32ms or >14ms jitter)
    if (rawDtSec > 0.032 || dtDelta > 0.015) {
      this.thermalSpikeAccum += rawDtSec;
    } else {
      this.thermalSpikeAccum = Math.max(0, this.thermalSpikeAccum - rawDtSec * 0.5);
    }

    // Hysteresis deadband: < 45 FPS for 2.5s OR sustained thermal spikes for 3.2s steps down
    if (this.averageFps < 45.0 || this.thermalSpikeAccum >= 3.2) {
      this.lowFpsAccum += rawDtSec;
      this.highFpsAccum = Math.max(0, this.highFpsAccum - rawDtSec * 2.0);
      if (this.lowFpsAccum >= 2.5 || this.thermalSpikeAccum >= 3.2) {
        this.frameResult.tierChanged = this.triggerThermalStepDown();
        return this.frameResult;
      }
    } else if (
      this.averageFps > 58.0 &&
      this.dynamicResScale >= 0.95 &&
      this.thermalLockTimer <= 0 &&
      !this.memoryLockedUpgrades &&
      TIER_RANK[this.activeTier] < TIER_RANK[this.envelope.maxSafeTier]
    ) {
      this.highFpsAccum += rawDtSec;
      this.lowFpsAccum = Math.max(0, this.lowFpsAccum - rawDtSec * 2.0);
      if (this.highFpsAccum >= 9.5) {
        if (this.activeTier === 'LOW') {
          const next = clampTierToCeiling('MEDIUM', this.envelope.maxSafeTier);
          if (next !== this.activeTier) {
            this.applyTierInternal(next);
            this.resetFrameMetrics(8.5);
            this.frameResult.tierChanged = next;
            return this.frameResult;
          }
        }
        if (this.activeTier === 'MEDIUM') {
          const next = clampTierToCeiling('HIGH', this.envelope.maxSafeTier);
          if (next !== this.activeTier) {
            this.applyTierInternal(next);
            this.resetFrameMetrics(8.5);
            this.frameResult.tierChanged = next;
            return this.frameResult;
          }
        }
        this.highFpsAccum = 0;
      }
    } else {
      this.lowFpsAccum = Math.max(0, this.lowFpsAccum - rawDtSec * 0.75);
      this.highFpsAccum = Math.max(0, this.highFpsAccum - rawDtSec * 0.75);
    }

    return this.frameResult;
  }
}
