import * as THREE from 'three';
import { HardwareBenchmarkSummary, QualityTier } from '../types/world';

export type ShaderComplexityLevel = 'FULL' | 'BALANCED' | 'FAST';
export type TextureResolutionTier = 2048 | 1024 | 512 | 256 | 128;
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
  hardwareCeilingTier?: QualityTier;
  initialTier: QualityTier;
  vramBudgetMb: number;
  recommendedTextureSize: TextureResolutionTier;
  recommendedShaderLevel: ShaderComplexityLevel;
  heapWarningRatio: number;
  heapCriticalRatio: number;
  benchmarkReport?: LaunchBenchmarkReport;
}

export interface LaunchBenchmarkReport extends HardwareBenchmarkSummary {
  cpuOpsPerMs: number;
  gpuShaderMs: number;
  ramBandwidthScore: number;
  hardwareSignature: string;
  timestampMs: number;
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
    initialTier === 'HIGH' && vramBudgetMb >= 380 && !isMobile && maxTextureSize >= 4096
      ? 2048
      : initialTier === 'HIGH' && vramBudgetMb >= 180
      ? 1024
      : initialTier === 'LOW' || vramBudgetMb <= 96
      ? 512
      : 1024;

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
    hardwareCeilingTier: maxSafeTier,
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

const BENCHMARK_STORAGE_KEY = 'astras_hw_benchmark_v2';

function buildHardwareSignature(env: HardwareEnvelope): string {
  return `${env.gpuRenderer}|c${env.cores}|m${env.memoryGb ?? 'x'}|t${env.maxTextureSize}|s${env.maxSamples}|sw${env.isSoftwareGl ? 1 : 0}`;
}

function yieldBenchmarkFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (
      typeof requestAnimationFrame === 'function' &&
      typeof document !== 'undefined' &&
      !document.hidden
    ) {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function benchmarkCpuThroughput(cores: number): {
  cpuScore: number;
  opsPerMs: number;
} {
  // Calibrated ~6-10ms tight math/physics kernel (zero retained objects)
  const buf = new Float32Array(2048);
  for (let i = 0; i < buf.length; i++) {
    buf[i] = (i + 1) * 0.0017;
  }

  const iterations = 48;
  const start = performance.now();
  let sink = 0;
  for (let pass = 0; pass < iterations; pass++) {
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i];
      const s = Math.sin(v * 3.14159) * 0.72 + Math.cos(v * 1.618) * 0.28;
      buf[i] = v * 0.9991 + s * 0.0009;
      sink += buf[i];
    }
  }
  const elapsedMs = Math.max(0.4, performance.now() - start);
  // Prevent dead-code elimination
  if (sink === 1e30) console.log(sink);

  const totalOps = iterations * buf.length;
  const opsPerMs = totalOps / elapsedMs;
  // Normalize: ~6000 ops/ms = fast desktop/flagship mobile (~90 score), ~1800 = low-end (~30 score)
  const singleThreadNorm = Math.min(100, Math.max(12, (opsPerMs / 9500) * 100));
  const coreBonus = Math.min(100, Math.max(15, (cores / 8) * 90));
  const cpuScore = Math.round(singleThreadNorm * 0.72 + coreBonus * 0.28);

  return {
    cpuScore: Math.max(10, Math.min(100, cpuScore)),
    opsPerMs: Math.round(opsPerMs),
  };
}

function benchmarkRamProfile(env: HardwareEnvelope): {
  ramScore: number;
  bandwidthScore: number;
} {
  // Calibrated 1MB typed-array memory sweep (cleanly GC-eligible immediately after exit)
  const len = 262144; // 262,144 * 4 bytes = 1 MiB
  const a = new Float32Array(len);
  const b = new Float32Array(len);
  const t0 = performance.now();
  for (let i = 0; i < len; i += 4) {
    a[i] = i * 0.25;
    a[i + 1] = i * 0.5;
    a[i + 2] = i * 0.75;
    a[i + 3] = i * 1.0;
  }
  b.set(a);
  let checksum = 0;
  for (let i = 0; i < len; i += 16) {
    checksum += b[i];
  }
  const elapsedMs = Math.max(0.15, performance.now() - t0);
  if (checksum === -1e30) console.log(checksum);

  // Fast LPDDR5/DDR4 completes 1MiB copy+stride in ~0.4-1.6ms; slow/throttled devices take 4-10ms+
  const bandwidthScore = Math.round(
    Math.min(100, Math.max(18, (2.2 / elapsedMs) * 78))
  );

  let capacityScore = 70;
  if (env.memoryGb !== null) {
    if (env.memoryGb <= 2) capacityScore = 24;
    else if (env.memoryGb <= 3) capacityScore = 44;
    else if (env.memoryGb <= 4) capacityScore = 62;
    else if (env.memoryGb <= 6) capacityScore = 80;
    else capacityScore = 96;
  } else {
    const perf =
      typeof performance !== 'undefined'
        ? (performance as PerformanceWithMemory)
        : undefined;
    if (perf?.memory && perf.memory.jsHeapSizeLimit > 0) {
      const limitGb = perf.memory.jsHeapSizeLimit / (1024 * 1024 * 1024);
      capacityScore = Math.min(95, Math.max(35, Math.round(limitGb * 45)));
    } else if (env.isMobile) {
      capacityScore = env.cores >= 8 ? 72 : 52;
    } else {
      capacityScore = 86;
    }
  }

  const ramScore = Math.round(capacityScore * 0.65 + bandwidthScore * 0.35);
  return {
    ramScore: Math.max(10, Math.min(100, ramScore)),
    bandwidthScore,
  };
}

function benchmarkGpuThroughput(
  renderer: THREE.WebGLRenderer,
  env: HardwareEnvelope
): { gpuScore: number; gpuShaderMs: number } {
  if (env.isSoftwareGl) {
    return { gpuScore: 18, gpuShaderMs: 45 };
  }

  let rt: THREE.WebGLRenderTarget | null = null;
  let geo: THREE.PlaneGeometry | null = null;
  let mat: THREE.ShaderMaterial | null = null;
  const probeScene = new THREE.Scene();
  const probeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  try {
    const gl = renderer.getContext();
    if (!gl || gl.isContextLost()) {
      return { gpuScore: 28, gpuShaderMs: 28 };
    }

    const size = env.isMobile ? 256 : 320;
    rt = new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });

    geo = new THREE.PlaneGeometry(2, 2);
    mat = new THREE.ShaderMaterial({
      uniforms: {
        uPass: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uPass;
        varying vec2 vUv;
        void main() {
          vec3 n = normalize(vec3(sin(vUv.x * 18.0 + uPass), cos(vUv.y * 18.0 - uPass), 1.4));
          vec3 v = normalize(vec3(0.0, 0.0, 1.0));
          vec3 acc = vec3(0.0);
          for (int i = 0; i < 4; i++) {
            float fi = float(i) * 1.57 + uPass;
            vec3 l = normalize(vec3(cos(fi), sin(fi), 0.75));
            vec3 h = normalize(l + v);
            float ndl = max(0.0, dot(n, l));
            float spec = pow(max(0.0, dot(n, h)), 32.0);
            acc += vec3(0.95, 0.72, 0.35) * ndl + vec3(1.0) * spec * 0.45;
          }
          float fresnel = pow(1.0 - max(0.0, dot(n, v)), 3.0);
          gl_FragColor = vec4(acc * 0.28 + vec3(0.2, 0.5, 0.9) * fresnel, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geo, mat);
    probeScene.add(mesh);

    const prevRt = renderer.getRenderTarget();
    const pixelOut = new Uint8Array(4);

    // Warm-up shader compile pass (excluded from timing)
    renderer.setRenderTarget(rt);
    renderer.render(probeScene, probeCamera);
    renderer.readRenderTargetPixels(rt, 0, 0, 1, 1, pixelOut);

    const passes = 5;
    const t0 = performance.now();
    for (let p = 0; p < passes; p++) {
      mat.uniforms.uPass.value = p * 0.7;
      renderer.render(probeScene, probeCamera);
    }
    // 1x1 readback forces pipeline sync so timed result reflects actual GPU draw execution
    renderer.readRenderTargetPixels(rt, 0, 0, 1, 1, pixelOut);
    const gpuShaderMs = Math.max(0.4, performance.now() - t0);
    renderer.setRenderTarget(prevRt);

    // Score GPU execution latency: <= 4.5ms => ~95, 10ms => ~68, >= 22ms => ~30
    const drawScore = Math.min(100, Math.max(16, (6.2 / gpuShaderMs) * 72));
    const gpuCapFloor =
      env.gpuClass === 'DEDICATED_DESKTOP'
        ? 85
        : env.gpuClass === 'FLAGSHIP_MOBILE'
        ? 72
        : env.gpuClass === 'MID_MOBILE'
        ? 48
        : env.gpuClass === 'LOW_MOBILE'
        ? 25
        : 45;
    const gpuCapCeiling =
      env.gpuClass === 'LOW_MOBILE'
        ? 52
        : env.gpuClass === 'MID_MOBILE'
        ? 78
        : 100;
    const gpuScore = Math.round(
      Math.max(
        14,
        Math.min(gpuCapCeiling, drawScore * 0.7 + gpuCapFloor * 0.3)
      )
    );

    return {
      gpuScore,
      gpuShaderMs: Number(gpuShaderMs.toFixed(2)),
    };
  } catch {
    return { gpuScore: 26, gpuShaderMs: 30 };
  } finally {
    probeScene.clear();
    geo?.dispose();
    mat?.dispose();
    rt?.dispose();
  }
}

export function loadCachedBenchmark(
  env: HardwareEnvelope
): LaunchBenchmarkReport | null {
  try {
    const raw = localStorage.getItem(BENCHMARK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LaunchBenchmarkReport>;
    if (
      parsed &&
      parsed.completed &&
      parsed.hardwareSignature === buildHardwareSignature(env) &&
      typeof parsed.timestampMs === 'number' &&
      Date.now() - parsed.timestampMs < 7 * 24 * 60 * 60 * 1000 &&
      (parsed.lockedTier === 'HIGH' ||
        parsed.lockedTier === 'MEDIUM' ||
        parsed.lockedTier === 'LOW')
    ) {
      return parsed as LaunchBenchmarkReport;
    }
  } catch {
    // Ignore storage/parse errors
  }
  return null;
}

export function applyBenchmarkToEnvelope(
  env: HardwareEnvelope,
  report: LaunchBenchmarkReport
): void {
  env.benchmarkReport = report;
  env.maxSafeTier = report.lockedTier;
  env.initialTier = report.lockedTier;
  if (report.lockedTier === 'LOW') {
    env.recommendedTextureSize = env.vramBudgetMb <= 72 ? 256 : 512;
    env.recommendedShaderLevel = 'FAST';
  } else if (report.lockedTier === 'MEDIUM') {
    env.recommendedTextureSize = env.vramBudgetMb < 105 ? 512 : 1024;
    env.recommendedShaderLevel = 'BALANCED';
  } else {
    env.recommendedTextureSize =
      env.vramBudgetMb >= 380 && !env.isMobile && env.maxTextureSize >= 4096
        ? 2048
        : 1024;
    env.recommendedShaderLevel = 'FULL';
  }
}

/**
 * Automated launch benchmark strictly profiling CPU, RAM, and GPU throughput
 * to lock the highest rendering fidelity capable of sustaining the target FPS
 * without thermal or memory throttling.
 */
export async function runLaunchHardwareBenchmark(
  renderer: THREE.WebGLRenderer,
  env: HardwareEnvelope,
  onStage?: (label: string) => void
): Promise<LaunchBenchmarkReport> {
  const startTotal = performance.now();

  onStage?.('Benchmarking CPU compute throughput');
  await yieldBenchmarkFrame();
  const cpuRes = benchmarkCpuThroughput(env.cores);

  onStage?.('Benchmarking system RAM & bandwidth');
  await yieldBenchmarkFrame();
  const ramRes = benchmarkRamProfile(env);

  onStage?.('Benchmarking GPU shader & fill-rate');
  await yieldBenchmarkFrame();
  const gpuRes = benchmarkGpuThroughput(renderer, env);

  const compositeScore = Math.round(
    gpuRes.gpuScore * 0.48 + cpuRes.cpuScore * 0.34 + ramRes.ramScore * 0.18
  );
  const bottleneckScore = Math.min(
    gpuRes.gpuScore,
    cpuRes.cpuScore,
    ramRes.ramScore
  );

  // Strictly lock maximum rendering fidelity tier while keeping full native 1.0 resolution
  let lockedTier: QualityTier;
  const targetFps = env.isSoftwareGl ? 30 : 60;
  const recommendedResScale = 1.0;

  if (
    env.isSoftwareGl ||
    bottleneckScore < 28 ||
    compositeScore < 44 ||
    (env.memoryGb !== null && env.memoryGb <= 2)
  ) {
    lockedTier = 'LOW';
  } else if (
    bottleneckScore < 52 ||
    compositeScore < 70 ||
    (env.memoryGb !== null && env.memoryGb <= 4 && env.isMobile) ||
    env.gpuClass === 'LOW_MOBILE'
  ) {
    lockedTier = 'MEDIUM';
  } else {
    lockedTier = 'HIGH';
  }

  // Respect hard hardware ceiling derived from capability probe
  const ceilingTier = env.hardwareCeilingTier ?? env.maxSafeTier;
  if (
    ceilingTier === 'LOW' ||
    (ceilingTier === 'MEDIUM' && lockedTier === 'HIGH')
  ) {
    lockedTier = ceilingTier;
  }

  const durationMs = Math.max(1, Math.round(performance.now() - startTotal));
  const report: LaunchBenchmarkReport = {
    completed: true,
    cpuScore: cpuRes.cpuScore,
    gpuScore: gpuRes.gpuScore,
    ramScore: ramRes.ramScore,
    compositeScore,
    lockedTier,
    targetFps,
    recommendedResScale,
    gpuName: env.gpuRenderer,
    cores: env.cores,
    memoryGb: env.memoryGb,
    durationMs,
    cpuOpsPerMs: cpuRes.opsPerMs,
    gpuShaderMs: gpuRes.gpuShaderMs,
    ramBandwidthScore: ramRes.bandwidthScore,
    hardwareSignature: buildHardwareSignature(env),
    timestampMs: Date.now(),
  };

  applyBenchmarkToEnvelope(env, report);
  try {
    localStorage.setItem(BENCHMARK_STORAGE_KEY, JSON.stringify(report));
  } catch {
    // Ignore storage errors
  }

  return report;
}

