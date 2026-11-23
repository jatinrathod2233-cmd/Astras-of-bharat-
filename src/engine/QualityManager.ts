import * as THREE from 'three';
import { QualityMode, QualityTier } from '../types/world';

const STORAGE_MODE_KEY = 'astras_quality_mode_v1';
const STORAGE_TIER_KEY = 'astras_quality_tier_v1';

export interface QualityProfile {
  tier: QualityTier;
  pixelRatioCap: number;
  keyShadowSize: number;
  shadowFrustumHalf: number;
  shadowType: THREE.ShadowMapType;
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
  textureSize: 2048 | 1024 | 512 | 256;
  anisotropyCap: number;
  skipNonEssentialMipmaps: boolean;
  distanceCullScale: number;
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

function isValidTier(v: unknown): v is QualityTier {
  return v === 'HIGH' || v === 'MEDIUM' || v === 'LOW';
}

function isValidMode(v: unknown): v is QualityMode {
  return v === 'AUTO' || v === 'HIGH' || v === 'MEDIUM' || v === 'LOW';
}

export function detectDeviceCapabilities(isSoftwareGl: boolean): DeviceCapabilityInfo {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }) : undefined;
  const ua = nav?.userAgent ?? '';
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  const cores = typeof nav?.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0
    ? nav.hardwareConcurrency
    : isMobile ? 4 : 8;
  const memoryGb = typeof nav?.deviceMemory === 'number' && nav.deviceMemory > 0
    ? nav.deviceMemory
    : null;
  const dpr = typeof window !== 'undefined' ? Math.max(1, window.devicePixelRatio || 1) : 1;
  const sw = typeof window !== 'undefined' && window.screen ? window.screen.width : 1280;
  const sh = typeof window !== 'undefined' && window.screen ? window.screen.height : 720;
  const screenMinPx = Math.min(sw, sh);

  if (isSoftwareGl) {
    return {
      isMobile,
      isVeryWeak: true,
      isHighEndDesktop: false,
      cores,
      memoryGb,
      dpr,
      screenMinPx,
      initialTier: 'LOW',
    };
  }

  let initialTier: QualityTier = 'MEDIUM';
  let isVeryWeak = false;

  if (!isMobile) {
    // Desktops & laptops: high unless explicitly very low-spec (<= 2 cores or <= 2GB RAM)
    if (cores <= 2 || (memoryGb !== null && memoryGb <= 2)) {
      initialTier = 'LOW';
      isVeryWeak = true;
    } else if (cores <= 4 && memoryGb !== null && memoryGb <= 4) {
      initialTier = 'MEDIUM';
    } else {
      initialTier = 'HIGH';
    }
  } else {
    // Mobile classification:
    // Flagship mobile: >= 8 cores AND (mem >= 6 or unknown with high DPR >= 2.5 & >= 380px width)
    // Weak/unknown low-end mobile: <= 4 cores OR mem <= 3 OR unknown mem with <= 4 cores
    const lowMem = memoryGb !== null && memoryGb <= 3;
    const veryLowMem = memoryGb !== null && memoryGb <= 2;
    const flagshipMem = memoryGb !== null ? memoryGb >= 6 : dpr >= 2.6 && cores >= 8;

    if (veryLowMem || cores <= 2 || (cores <= 4 && (memoryGb === null || memoryGb <= 3))) {
      initialTier = 'LOW';
      isVeryWeak = veryLowMem || cores <= 2 || screenMinPx <= 340;
    } else if (cores >= 8 && flagshipMem && dpr >= 2.0) {
      initialTier = 'HIGH';
    } else if (lowMem) {
      initialTier = 'LOW';
    } else {
      initialTier = 'MEDIUM';
    }
  }

  const isHighEndDesktop =
    !isMobile &&
    cores >= 6 &&
    (memoryGb === null || memoryGb >= 8);

  return {
    isMobile,
    isVeryWeak,
    isHighEndDesktop,
    cores,
    memoryGb,
    dpr,
    screenMinPx,
    initialTier,
  };
}

export function buildQualityProfile(
  tier: QualityTier,
  isSoftwareGl: boolean,
  isVeryWeak: boolean,
  capabilities?: DeviceCapabilityInfo
): QualityProfile {
  const isMobile = capabilities?.isMobile ?? false;
  const isHighEndDesktop = capabilities?.isHighEndDesktop ?? false;

  if (tier === 'HIGH' && !isSoftwareGl) {
    return {
      tier: 'HIGH',
      pixelRatioCap: isMobile ? 2.0 : 2.5,
      keyShadowSize: isMobile ? 2048 : 4096,
      shadowFrustumHalf: isMobile ? 22 : 26,
      shadowType: THREE.PCFSoftShadowMap,
      torchShadowSize: 1024,
      torchShadowEnabled: true,
      maxActiveNightLamps: isMobile ? 4 : 6,
      composerSamples: 4,
      composerHalfFloat: true,
      underwaterScale: 1.0,
      toneMapping: THREE.ACESFilmicToneMapping,
      particleScale: isHighEndDesktop ? 1.25 : 1.0,
      cameraFar: isMobile ? 850 : 1050,
      fogFarScale: isMobile ? 1.0 : 1.15,
      textureSize: isHighEndDesktop ? 2048 : 1024,
      anisotropyCap: isMobile ? 6 : 16,
      skipNonEssentialMipmaps: false,
      distanceCullScale: isMobile ? 1.0 : 1.25,
    };
  }

  if (tier === 'MEDIUM' && !isSoftwareGl) {
    return {
      tier: 'MEDIUM',
      pixelRatioCap: 1.5,
      keyShadowSize: 1024,
      shadowFrustumHalf: 18,
      shadowType: THREE.PCFShadowMap,
      torchShadowSize: 512,
      torchShadowEnabled: true,
      maxActiveNightLamps: 2,
      composerSamples: 0,
      composerHalfFloat: false,
      underwaterScale: 0.72,
      toneMapping: THREE.ACESFilmicToneMapping,
      particleScale: 0.6,
      cameraFar: 620,
      fogFarScale: 0.85,
      textureSize: 512,
      anisotropyCap: 2,
      skipNonEssentialMipmaps: true,
      distanceCullScale: 0.82,
    };
  }

  return {
    tier: 'LOW',
    pixelRatioCap: isVeryWeak && !isSoftwareGl ? 0.75 : 1.0,
    keyShadowSize: 512,
    shadowFrustumHalf: 15,
    shadowType: THREE.BasicShadowMap,
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
    textureSize: 256,
    anisotropyCap: 1,
    skipNonEssentialMipmaps: true,
    distanceCullScale: 0.65,
  };
}

/**
 * Zero-GC rolling 60-frame performance tracker & hysteresis-guarded adaptive quality controller.
 */
export class QualityManager {
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

  private lowFpsAccum = 0;
  private highFpsAccum = 0;
  private cooldownTimer = 4.0; // Grace period right after boot / mode switch

  constructor(isSoftwareGl: boolean) {
    this.isSoftwareGl = isSoftwareGl;
    this.capabilities = detectDeviceCapabilities(isSoftwareGl);

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
      this.activeTier = savedTier;
    } else {
      this.activeTier = this.capabilities.initialTier;
    }

    this.activeProfile = buildQualityProfile(
      this.activeTier,
      this.isSoftwareGl,
      this.capabilities.isVeryWeak,
      this.capabilities
    );
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

  public setMode(mode: QualityMode): QualityTier | null {
    this.mode = mode;
    try {
      localStorage.setItem(STORAGE_MODE_KEY, mode);
    } catch {
      // Ignore
    }

    const nextTier = mode === 'AUTO' ? this.activeTier : mode;
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
    this.lowFpsAccum = 0;
    this.highFpsAccum = 0;
    this.cooldownTimer = Math.max(this.cooldownTimer, graceCooldownSec);
  }

  private applyTierInternal(tier: QualityTier): void {
    this.activeTier = tier;
    this.activeProfile = buildQualityProfile(
      tier,
      this.isSoftwareGl,
      this.capabilities.isVeryWeak,
      this.capabilities
    );
    try {
      localStorage.setItem(STORAGE_TIER_KEY, tier);
    } catch {
      // Ignore
    }
  }

  /**
   * Records current frame duration (in real seconds, unclamped except > 0.001) and returns a new
   * QualityTier if dynamic resolution/quality scaling triggered a step up or down.
   */
  public recordFrame(rawDtSec: number, allowAutoScale: boolean): QualityTier | null {
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

    if (!allowAutoScale || this.mode !== 'AUTO' || this.isSoftwareGl) {
      return null;
    }

    if (this.cooldownTimer > 0) {
      this.cooldownTimer = Math.max(0, this.cooldownTimer - rawDtSec);
      return null;
    }

    if (this.sampleCount < 30) {
      return null;
    }

    // Hysteresis deadband: < 45 FPS steps down after 2.5s; > 58 FPS steps up after 9.0s.
    // Inside [45, 58], decay timers smoothly so transient hitches don't accumulate indefinitely.
    if (this.averageFps < 45.0) {
      this.lowFpsAccum += rawDtSec;
      this.highFpsAccum = Math.max(0, this.highFpsAccum - rawDtSec * 2.0);
      if (this.lowFpsAccum >= 2.5) {
        if (this.activeTier === 'HIGH') {
          this.applyTierInternal('MEDIUM');
          this.resetFrameMetrics(6.0);
          return 'MEDIUM';
        }
        if (this.activeTier === 'MEDIUM') {
          this.applyTierInternal('LOW');
          this.resetFrameMetrics(6.0);
          return 'LOW';
        }
        this.lowFpsAccum = 0;
      }
    } else if (this.averageFps > 58.0) {
      this.highFpsAccum += rawDtSec;
      this.lowFpsAccum = Math.max(0, this.lowFpsAccum - rawDtSec * 2.0);
      if (this.highFpsAccum >= 9.0) {
        if (this.activeTier === 'LOW') {
          this.applyTierInternal('MEDIUM');
          this.resetFrameMetrics(8.5);
          return 'MEDIUM';
        }
        if (this.activeTier === 'MEDIUM') {
          this.applyTierInternal('HIGH');
          this.resetFrameMetrics(8.5);
          return 'HIGH';
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
