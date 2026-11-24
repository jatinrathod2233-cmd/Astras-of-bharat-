import * as THREE from 'three';
import { QualityTier } from '../types/world';

export type ShaderComplexityLevel = 'FULL' | 'BALANCED' | 'FAST';
export type TextureResolutionTier = 1024 | 512 | 256 | 128;
export type MemoryPressureLevel = 'NONE' | 'ELEVATED' | 'CRITICAL';

export type GpuClass =
  | 'SOFTWARE'
  | 'LOW_MOBILE'
  | 'MID_MOBILE'
  | 'FLAGSHIP_MOBILE'
  | 'INTEGRATED_DESKTOP'
  | 'DEDICATED_DESKTOP';

export interface HardwareEnvelope {
  isMobile: boolean;
  isVeryWeak: boolean;
  isHighEndDesktop: boolean;
  isSoftwareGl: boolean;
  cores: number;
  memoryGb: number | null;
  dpr: number;
  screenMinPx: number;
  gpuRenderer: string;
  gpuVendor: string;
  gpuClass: GpuClass;
  isWebGL2: boolean;
  maxTextureSize: number;
  maxRenderbufferSize: number;
  maxTextureImageUnits: number;
  maxFragmentUniformVectors: number;
  maxSamples: number;
  maxSafeTier: QualityTier;
  initialTier: QualityTier;
  vramBudgetMb: number;
  recommendedTextureSize: TextureResolutionTier;
  recommendedShaderLevel: ShaderComplexityLevel;
  heapWarningRatio: number;
  heapCriticalRatio: number;
}

export interface MemoryBudgetSnapshot {
  estimatedVramMb: number;
  vramBudgetMb: number;
  vramRatio: number;
  jsHeapUsedMb: number | null;
  jsHeapLimitMb: number | null;
  jsHeapRatio: number | null;
  pressure: MemoryPressureLevel;
}

interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number;
}

const SOFTWARE_GL_REGEX =
  /SwiftShader|llvmpipe|softpipe|Software|Basic Render|Microsoft Basic/i;

const DEDICATED_DESKTOP_GPU_REGEX =
  /NVIDIA|GeForce|RTX\s?\d|GTX\s?\d|Quadro|Radeon\s?(RX|Pro|VII|R9)|Arc\s?[AB]\d{3}|Apple\sM\d+\s?(Pro|Max|Ultra)/i;

const FLAGSHIP_MOBILE_GPU_REGEX =
  /Adreno\s?(?:\(TM\)\s?)?(?:7[3-9]\d|8\d\d)|Immortalis|Xclipse\s?9[2-9]\d|Apple\sA1[5-9]\b|Apple\sM\d/i;

const MID_MOBILE_GPU_REGEX =
  /Adreno\s?(?:\(TM\)\s?)?(?:6[2-5]\d|7[0-2]\d)|Mali-G(?:5[78]|6[8]|7[6-8])|Apple\sA1[2-4]\b|PowerVR\s?(?:GM|GT|Series9)/i;

const LOW_MOBILE_GPU_REGEX =
  /Adreno\s?(?:\(TM\)\s?)?(?:[2-5]\d\d|61\d)|Mali-(?:[GT]\d{2}|4\d\d)\b|PowerVR\s?(?:GE|GX|SGX)|VideoCore|Vivante|Tegra|Apple\sA(?:[4-9]|10|11)\b/i;

export function probeHardwareEnvelope(): HardwareEnvelope {
  const nav =
    typeof navigator !== 'undefined'
      ? (navigator as NavigatorWithMemory)
      : undefined;
  const ua = nav?.userAgent ?? '';
  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
      ua
    );
  const cores =
    typeof nav?.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0
      ? nav.hardwareConcurrency
      : isMobile
      ? 4
      : 8;
  const memoryGb =
    typeof nav?.deviceMemory === 'number' && nav.deviceMemory > 0
      ? nav.deviceMemory
      : null;
  const dpr =
    typeof window !== 'undefined'
      ? Math.max(1, window.devicePixelRatio || 1)
      : 1;
  const sw =
    typeof window !== 'undefined' && window.screen ? window.screen.width : 1280;
  const sh =
    typeof window !== 'undefined' && window.screen
      ? window.screen.height
      : 720;
  const screenMinPx = Math.min(sw, sh);

  let isWebGL2 = false;
  let gpuRenderer = 'Unknown GPU';
  let gpuVendor = 'Unknown Vendor';
  let maxTextureSize = 2048;
  let maxRenderbufferSize = 2048;
  let maxTextureImageUnits = 16;
  let maxFragmentUniformVectors = 256;
  let maxSamples = 0;
  let isSoftwareGl = false;

  try {
    const probeCanvas = document.createElement('canvas');
    probeCanvas.width = 2;
    probeCanvas.height = 2;
    const gl2 = probeCanvas.getContext('webgl2', {
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    }) as WebGL2RenderingContext | null;
    const gl =
      gl2 ??
      (probeCanvas.getContext('webgl') as WebGLRenderingContext | null);

    if (!gl) {
      isSoftwareGl = true;
    } else {
      isWebGL2 = Boolean(gl2);
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpuRenderer = String(
        gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ||
          'Unknown GPU'
      );
      gpuVendor = String(
        gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR) ||
          'Unknown Vendor'
      );
      maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 2048;
      maxRenderbufferSize =
        Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)) || 2048;
      maxTextureImageUnits =
        Number(gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)) || 16;
      maxFragmentUniformVectors =
        Number(gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)) || 256;
      if (gl2) {
        maxSamples = Number(gl2.getParameter(gl2.MAX_SAMPLES)) || 0;
      }

      isSoftwareGl = SOFTWARE_GL_REGEX.test(gpuRenderer) || !isWebGL2;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    probeCanvas.width = 0;
    probeCanvas.height = 0;
  } catch {
    isSoftwareGl = true;
  }

  let gpuClass: GpuClass;
  if (isSoftwareGl) {
    gpuClass = 'SOFTWARE';
  } else if (isMobile) {
    if (LOW_MOBILE_GPU_REGEX.test(gpuRenderer) || maxTextureSize < 4096) {
      gpuClass = 'LOW_MOBILE';
    } else if (FLAGSHIP_MOBILE_GPU_REGEX.test(gpuRenderer)) {
      gpuClass = 'FLAGSHIP_MOBILE';
    } else if (MID_MOBILE_GPU_REGEX.test(gpuRenderer)) {
      gpuClass = 'MID_MOBILE';
    } else {
      // Unknown mobile GPU string (common on iOS privacy masking or newer Android drivers):
      // classify via CPU cores + memory + DPR heuristics
      const flagshipScore =
        cores >= 8 &&
        (memoryGb === null ? dpr >= 2.6 : memoryGb >= 6) &&
        maxTextureSize >= 4096;
      const weakScore =
        cores <= 4 || (memoryGb !== null && memoryGb <= 3);
      gpuClass = flagshipScore
        ? 'FLAGSHIP_MOBILE'
        : weakScore
        ? 'LOW_MOBILE'
        : 'MID_MOBILE';
    }
  } else {
    if (DEDICATED_DESKTOP_GPU_REGEX.test(gpuRenderer)) {
      gpuClass = 'DEDICATED_DESKTOP';
    } else {
      gpuClass = 'INTEGRATED_DESKTOP';
    }
  }

  // Derive strict thermal/VRAM ceiling & initial tier
  let maxSafeTier: QualityTier = 'HIGH';
  let initialTier: QualityTier = 'MEDIUM';
  let vramBudgetMb = 200;
  let isVeryWeak = false;

  switch (gpuClass) {
    case 'SOFTWARE':
      maxSafeTier = 'LOW';
      initialTier = 'LOW';
      vramBudgetMb = 56;
      isVeryWeak = true;
      break;
    case 'LOW_MOBILE':
      maxSafeTier =
        (memoryGb !== null && memoryGb <= 3) || cores <= 4 ? 'LOW' : 'MEDIUM';
      initialTier = 'LOW';
      vramBudgetMb = memoryGb !== null && memoryGb <= 2 ? 68 : 96;
      isVeryWeak =
        (memoryGb !== null && memoryGb <= 2) ||
        cores <= 2 ||
        screenMinPx <= 340;
      break;
    case 'MID_MOBILE':
      maxSafeTier =
        cores >= 8 && (memoryGb === null || memoryGb >= 6) ? 'HIGH' : 'MEDIUM';
      initialTier = 'MEDIUM';
      vramBudgetMb = 152;
      break;
    case 'FLAGSHIP_MOBILE':
      maxSafeTier = 'HIGH';
      initialTier =
        memoryGb !== null && memoryGb <= 4 ? 'MEDIUM' : 'HIGH';
      vramBudgetMb = 224;
      break;
    case 'INTEGRATED_DESKTOP':
      maxSafeTier =
        cores <= 2 || (memoryGb !== null && memoryGb <= 2)
          ? 'LOW'
          : 'HIGH';
      initialTier =
        cores <= 2 || (memoryGb !== null && memoryGb <= 2)
          ? 'LOW'
          : cores <= 4 && memoryGb !== null && memoryGb <= 4
          ? 'MEDIUM'
          : 'HIGH';
      vramBudgetMb = 240;
      isVeryWeak = cores <= 2 || (memoryGb !== null && memoryGb <= 2);
      break;
    case 'DEDICATED_DESKTOP':
      maxSafeTier = 'HIGH';
      initialTier = 'HIGH';
      vramBudgetMb = 420;
      break;
  }

  // Enforce strict RAM safety bounds regardless of GPU class
  if (memoryGb !== null) {
    if (memoryGb <= 2) {
      maxSafeTier = 'LOW';
      initialTier = 'LOW';
      vramBudgetMb = Math.min(vramBudgetMb, 68);
      isVeryWeak = true;
    } else if (memoryGb <= 3) {
      if (maxSafeTier === 'HIGH') maxSafeTier = 'MEDIUM';
      if (initialTier === 'HIGH') initialTier = 'MEDIUM';
      vramBudgetMb = Math.min(vramBudgetMb, 108);
    } else if (memoryGb <= 4 && isMobile) {
      if (maxSafeTier === 'HIGH') maxSafeTier = 'MEDIUM';
      if (initialTier === 'HIGH') initialTier = 'MEDIUM';
      vramBudgetMb = Math.min(vramBudgetMb, 136);
    }
  }

  // Clamp texture unit / uniform constrained WebGL drivers
  if (maxTextureImageUnits < 16 || maxFragmentUniformVectors < 128) {
    maxSafeTier = 'LOW';
    initialTier = 'LOW';
    vramBudgetMb = Math.min(vramBudgetMb, 76);
  }

  const recommendedTextureSize: TextureResolutionTier =
    initialTier === 'HIGH' && vramBudgetMb >= 190
      ? 1024
      : initialTier === 'LOW' || vramBudgetMb <= 96
      ? 256
      : 512;

  const recommendedShaderLevel: ShaderComplexityLevel =
    initialTier === 'HIGH'
      ? 'FULL'
      : initialTier === 'MEDIUM'
      ? 'BALANCED'
      : 'FAST';

  const isHighEndDesktop =
    !isMobile &&
    !isSoftwareGl &&
    (gpuClass === 'DEDICATED_DESKTOP' ||
      (cores >= 6 && (memoryGb === null || memoryGb >= 8)));

  return {
    isMobile,
    isVeryWeak,
    isHighEndDesktop,
    isSoftwareGl,
    cores,
    memoryGb,
    dpr,
    screenMinPx,
    gpuRenderer,
    gpuVendor,
    gpuClass,
    isWebGL2,
    maxTextureSize,
    maxRenderbufferSize,
    maxTextureImageUnits,
    maxFragmentUniformVectors,
    maxSamples,
    maxSafeTier,
    initialTier,
    vramBudgetMb,
    recommendedTextureSize,
    recommendedShaderLevel,
    heapWarningRatio: 0.72,
    heapCriticalRatio: 0.86,
  };
}

/**
 * Estimates GPU VRAM footprint (bytes) of render targets currently allocated by the engine.
 */
export function estimateRenderTargetsBytes(
  renderer: THREE.WebGLRenderer,
  keyShadowSize: number,
  torchShadowSize: number,
  torchShadowEnabled: boolean,
  composerRt: THREE.WebGLRenderTarget | null,
  hasEnvProbe: boolean
): number {
  let bytes = 0;
  // Backbuffer color + depth/stencil
  const size = renderer.domElement;
  const bw = size.width || 1280;
  const bh = size.height || 720;
  bytes += bw * bh * 8; // RGBA8 + D24S8

  // Shadow maps (Depth32 / Depth24)
  if (renderer.shadowMap.enabled && keyShadowSize > 0) {
    bytes += keyShadowSize * keyShadowSize * 4;
  }
  if (renderer.shadowMap.enabled && torchShadowEnabled && torchShadowSize > 0) {
    bytes += torchShadowSize * torchShadowSize * 4;
  }

  // Composer render target (width * height * bytesPerPixel * MSAA samples)
  if (composerRt) {
    const bpp = composerRt.texture.type === THREE.HalfFloatType ? 8 : 4;
    const samples = Math.max(1, composerRt.samples || 1);
    bytes += composerRt.width * composerRt.height * bpp * samples;
  }

  // PMREM environment cube/atlas (~256x256x6xHalfFloat approx)
  if (hasEnvProbe) {
    bytes += 3.5 * 1024 * 1024;
  }

  return bytes;
}

/**
 * Zero-GC runtime memory & VRAM budget monitor.
 */
export class HardwareMonitor {
  private readonly envelope: HardwareEnvelope;
  private readonly snapshot: MemoryBudgetSnapshot;

  constructor(envelope: HardwareEnvelope) {
    this.envelope = envelope;
    this.snapshot = {
      estimatedVramMb: 0,
      vramBudgetMb: envelope.vramBudgetMb,
      vramRatio: 0,
      jsHeapUsedMb: null,
      jsHeapLimitMb: null,
      jsHeapRatio: null,
      pressure: 'NONE',
    };
  }

  public sampleMemoryPressure(estimatedVramBytes: number): MemoryBudgetSnapshot {
    const vramMb = estimatedVramBytes / (1024 * 1024);
    const vramRatio = vramMb / Math.max(32, this.envelope.vramBudgetMb);
    this.snapshot.estimatedVramMb = Math.round(vramMb * 10) / 10;
    this.snapshot.vramRatio = vramRatio;

    let heapRatio: number | null = null;
    const perf =
      typeof performance !== 'undefined'
        ? (performance as PerformanceWithMemory)
        : undefined;
    if (perf?.memory && perf.memory.jsHeapSizeLimit > 0) {
      const usedMb = perf.memory.usedJSHeapSize / (1024 * 1024);
      const limitMb = perf.memory.jsHeapSizeLimit / (1024 * 1024);
      heapRatio = usedMb / limitMb;
      this.snapshot.jsHeapUsedMb = Math.round(usedMb);
      this.snapshot.jsHeapLimitMb = Math.round(limitMb);
      this.snapshot.jsHeapRatio = heapRatio;
    }

    let pressure: MemoryPressureLevel = 'NONE';
    if (
      vramRatio >= 0.98 ||
      (heapRatio !== null && heapRatio >= this.envelope.heapCriticalRatio)
    ) {
      pressure = 'CRITICAL';
    } else if (
      vramRatio >= 0.84 ||
      (heapRatio !== null && heapRatio >= this.envelope.heapWarningRatio)
    ) {
      pressure = 'ELEVATED';
    }
    this.snapshot.pressure = pressure;
    return this.snapshot;
  }

  public getLastSnapshot(): MemoryBudgetSnapshot {
    return this.snapshot;
  }
}
