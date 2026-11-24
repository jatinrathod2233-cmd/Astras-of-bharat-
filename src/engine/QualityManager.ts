import * as THREE from 'three';
import { QualityMode, QualityTier } from '../types/world';
import {
  HardwareEnvelope,
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
  const maxGpuSamples = envelope?.maxSamples ?? 4;
  const maxTex = envelope?.maxTextureSize ?? 4096;

  if (tier === 'HIGH' && !isSoftwareGl) {
    const texSize: TextureResolutionTier =
      vramBudgetMb < 165 || maxTex < 2048 ? 512 : 1024;
    const keyShadow = Math.min(
      maxTex,
      isMobile ? (vramBudgetMb < 170 ? 1024 : 2048) : vramBudgetMb < 260 ? 2048 : 4096
    );
    return {
      tier: 'HIGH',
      pixelRatioCap: isMobile ? 2.0 : 2.5,
      keyShadowSize: keyShadow,
      shadowFrustumHalf: isMobile ? 22 : 26,
      shadowType: THREE.PCFSoftShadowMap,
      shadowsEnabled: true,
      torchShadowSize: vramBudgetMb < 170 ? 512 : 1024,
      torchShadowEnabled: true,
      maxActiveNightLamps: isMobile ? 4 : 6,
      composerSamples: Math.min(4, maxGpuSamples),
      composerHalfFloat: vramBudgetMb >= 140,
      underwaterScale: 1.0,
      toneMapping: THREE.ACESFilmicToneMapping,
      particleScale: isHighEndDesktop ? 1.25 : 1.0,
      cameraFar: isMobile ? 850 : 1050,
      fogFarScale: isMobile ? 1.0 : 1.15,
      textureSize: texSize,
      anisotropyCap: isMobile ? 6 : 16,
      skipNonEssentialMipmaps: vramBudgetMb < 160,
      distanceCullScale: isMobile ? 1.0 : 1.25,
      shaderLevel: 'FULL',
      allowEnvIbl: true,
      vramBudgetMb,
    };
  }

  if (tier === 'MEDIUM' && !isSoftwareGl) {
    const texSize: TextureResolutionTier = vramBudgetMb < 105 ? 256 : 512;
    return {
      tier: 'MEDIUM',
      pixelRatioCap: 1.5,
      keyShadowSize: Math.min(maxTex, 1024),
      shadowFrustumHalf: 18,
      shadowType: THREE.PCFShadowMap,
      shadowsEnabled: true,
      torchShadowSize: 512,
      torchShadowEnabled: vramBudgetMb >= 110,
      maxActiveNightLamps: 2,
      composerSamples: 0,
      composerHalfFloat: false,
      underwaterScale: 0.72,
      toneMapping: THREE.ACESFilmicToneMapping,
      particleScale: 0.6,
      cameraFar: 620,
      fogFarScale: 0.85,
      textureSize: texSize,
      anisotropyCap: 2,
      skipNonEssentialMipmaps: true,
      distanceCullScale: 0.82,
      shaderLevel: 'BALANCED',
      allowEnvIbl: true,
      vramBudgetMb,
    };
  }

  const tightTex: TextureResolutionTier =
    vramBudgetMb <= 72 ? 128 : 256;

  return {
    tier: 'LOW',
    pixelRatioCap: isVeryWeak && !isSoftwareGl ? 0.75 : 1.0,
    keyShadowSize: Math.min(maxTex, 512),
    shadowFrustumHalf: 15,
    shadowType: THREE.BasicShadowMap,
    shadowsEnabled: !isSoftwareGl && (!isVeryWeak || vramBudgetMb >= 64),
    torchShadowSize: 0,
    torchShadowEnabled: false,
    maxActiveNightLamps: isVeryWeak || isSoftwareGl ? 0 : 1,
    composerSamples: 0,
    composerHalfFloat: false,
    underwaterScale: 0.5,
    toneMapping: THREE.LinearToneMapping,
    particleScale: 0.3,
    cameraFar: 420,
    fogFarScale: 0.66,
    textureSize: tightTex,
    anisotropyCap: 1,
    skipNonEssentialMipmaps: true,
    distanceCullScale: 0.65,
    shaderLevel: 'FAST',
    allowEnvIbl: vramBudgetMb >= 70 && !isSoftwareGl,
    vramBudgetMb,
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

  constructor(envelopeOrSoftwareFlag: HardwareEnvelope | boolean) {
    if (typeof envelopeOrSoftwareFlag === 'boolean') {
      this.isSoftwareGl = envelopeOrSoftwareFlag;
      this.envelope = probeHardwareEnvelope();
    } else {
      this.envelope = envelopeOrSoftwareFlag;
      this.isSoftwareGl = envelopeOrSoftwareFlag.isSoftwareGl;
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

  public isThermalLocked(): boolean {
    return this.thermalLockTimer > 0 || this.memoryLockedUpgrades;
  }

  public setMode(mode: QualityMode): QualityTier | null {
    this.mode = mode;
    this.thermalLockTimer = 0;
    this.memoryLockedUpgrades = false;
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
    this.emaDt = 1 / 60;
    this.lowFpsAccum = 0;
    this.highFpsAccum = 0;
    this.thermalSpikeAccum = 0;
    this.cooldownTimer = Math.max(this.cooldownTimer, graceCooldownSec);
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
      this.applyTierInternal('MEDIUM');
      this.resetFrameMetrics(6.5);
      return 'MEDIUM';
    }
    if (this.activeTier === 'MEDIUM') {
      this.applyTierInternal('LOW');
      this.resetFrameMetrics(6.5);
      return 'LOW';
    }
    this.lowFpsAccum = 0;
    this.thermalSpikeAccum = 0;
    return null;
  }

  /**
   * Records current frame duration (in real seconds, unclamped except > 0.0005) and returns a new
   * QualityTier if dynamic resolution/thermal/FPS scaling triggered a step up or down.
   */
  public recordFrame(
    rawDtSec: number,
    allowAutoScale: boolean
  ): QualityTier | null {
    if (rawDtSec <= 0.0005 || rawDtSec > 0.45) {
      // Ignore tab-resume or pause spikes so one stall never triggers a downgrade
      return null;
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

    if (!allowAutoScale || this.mode !== 'AUTO' || this.isSoftwareGl) {
      return null;
    }

    if (this.thermalLockTimer > 0) {
      this.thermalLockTimer = Math.max(0, this.thermalLockTimer - rawDtSec);
    }

    if (this.cooldownTimer > 0) {
      this.cooldownTimer = Math.max(0, this.cooldownTimer - rawDtSec);
      return null;
    }

    if (this.sampleCount < 30) {
      return null;
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
        return this.triggerThermalStepDown();
      }
    } else if (
      this.averageFps > 58.0 &&
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
            return next;
          }
        }
        if (this.activeTier === 'MEDIUM') {
          const next = clampTierToCeiling('HIGH', this.envelope.maxSafeTier);
          if (next !== this.activeTier) {
            this.applyTierInternal(next);
            this.resetFrameMetrics(8.5);
            return next;
          }
        }
        this.highFpsAccum = 0;
      }
    } else {
      this.lowFpsAccum = Math.max(0, this.lowFpsAccum - rawDtSec * 0.75);
      this.highFpsAccum = Math.max(0, this.highFpsAccum - rawDtSec * 0.75);
    }

    return null;
  }
}
