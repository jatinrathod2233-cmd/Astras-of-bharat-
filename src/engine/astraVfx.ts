import * as THREE from 'three';
import { AstraId, QualityTier } from '../types/world';
import { ObjectPoolManager } from './ObjectPoolManager';
import { ASTRA_CONFIG } from './astraConfig';
import { groundHeightAt } from './worldData';

const _vTmp1 = new THREE.Vector3();
const _vTmp2 = new THREE.Vector3();

function createRadialGlowTexture(innerHex: string, midHex: string, outerHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, innerHex);
  grad.addColorStop(0.35, midHex);
  grad.addColorStop(0.75, outerHex);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createLotusBillboardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 256);

  const cx = 128;
  const cy = 128;
  const halo = ctx.createRadialGradient(cx, cy, 8, cx, cy, 122);
  halo.addColorStop(0, 'rgba(255,248,215,0.95)');
  halo.addColorStop(0.32, 'rgba(255,175,70,0.75)');
  halo.addColorStop(0.65, 'rgba(255,95,162,0.38)');
  halo.addColorStop(1, 'rgba(180,107,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, 256, 256);

  // Outer & inner lotus petals
  for (let ring = 0; ring < 2; ring++) {
    const count = ring === 0 ? 12 : 8;
    const len = ring === 0 ? 96 : 64;
    const wid = ring === 0 ? 22 : 16;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + ring * 0.26;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.quadraticCurveTo(wid, -len * 0.55, 0, -len);
      ctx.quadraticCurveTo(-wid, -len * 0.55, 0, -14);
      ctx.closePath();
      ctx.fillStyle = ring === 0 ? 'rgba(255,95,162,0.72)' : 'rgba(255,214,122,0.88)';
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#FFD27A';
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.beginPath();
  ctx.arc(cx, cy, 20, 0, Math.PI * 2);
  ctx.fillStyle = '#FFF5D0';
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSpiderCraterTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const cx = 128;
  const cy = 128;

  const base = ctx.createRadialGradient(cx, cy, 4, cx, cy, 124);
  base.addColorStop(0, 'rgba(18,12,10,0.96)');
  base.addColorStop(0.55, 'rgba(34,24,18,0.88)');
  base.addColorStop(0.84, 'rgba(58,42,26,0.52)');
  base.addColorStop(1, 'rgba(30,22,16,0)');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);

  // Spider-web fracture rings + radiating fissures with ember glow core
  ctx.strokeStyle = 'rgba(255,140,42,0.48)';
  ctx.lineWidth = 2.2;
  for (let i = 0; i < 14; i++) {
    let a = (i / 14) * Math.PI * 2 + (i % 3) * 0.08;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let s = 1; s <= 5; s++) {
      const r = (s / 5) * 116;
      a += Math.sin(i * 3.1 + s * 1.9) * 0.14;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255,190,95,0.28)';
  ctx.lineWidth = 1.4;
  [30, 58, 86].forEach((r) => {
    ctx.beginPath();
    for (let s = 0; s <= 18; s++) {
      const a = (s / 18) * Math.PI * 2;
      const rr = r + Math.sin(s * 2.7 + r) * 5;
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface BrahmastraLotusRig {
  group: THREE.Group;
  coreMesh: THREE.Mesh;
  swirlGroup: THREE.Group;
  petalRings: THREE.Group[];
  lotusSprite?: THREE.Sprite;
  rayGroup: THREE.Group;
}

/**
 * Procedural Golden Lotus Brahmastra 3D Weapon Model:
 * - Ornate diamond-engraved golden shaft & faceted arrow tip
 * - 3 concentric tiers of curved golden-bordered glowing magenta-pink/violet lotus petals
 * - Breathing white-gold core + cosmic aura rays & swirls
 * - Adapts cleanly across HIGH / MEDIUM / LOW tiers
 */
export function createBrahmastraLotusModel(
  tier: QualityTier,
  lotusSpriteTex?: THREE.Texture
): BrahmastraLotusRig {
  const group = new THREE.Group();

  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xffd27a,
    emissive: 0xff9a2e,
    emissiveIntensity: 0.9,
    metalness: 0.92,
    roughness: 0.18,
  });
  const petalGlowMat = new THREE.MeshStandardMaterial({
    color: 0xff5fa2,
    emissive: 0xd946ef,
    emissiveIntensity: 1.85,
    roughness: 0.25,
    metalness: 0.25,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
  });
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xfff7d6,
    transparent: true,
    opacity: 0.98,
  });

  // Ornate golden arrow shaft + diamond facets + tip
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.022, 1.05, tier === 'LOW' ? 6 : 10),
    goldMat
  );
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = 0.05;
  group.add(shaft);

  const head = new THREE.Mesh(
    new THREE.ConeGeometry(0.055, 0.22, tier === 'LOW' ? 4 : 6),
    goldMat
  );
  head.rotation.x = Math.PI / 2;
  head.position.z = 0.66;
  group.add(head);

  const coreMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.088, tier === 'LOW' ? 8 : 14, tier === 'LOW' ? 8 : 12),
    coreMat
  );
  coreMesh.position.z = 0.18;
  group.add(coreMesh);

  const rayGroup = new THREE.Group();
  rayGroup.position.z = 0.18;
  group.add(rayGroup);

  const swirlGroup = new THREE.Group();
  swirlGroup.position.z = 0.14;
  group.add(swirlGroup);

  const petalRings: THREE.Group[] = [];
  let lotusSprite: THREE.Sprite | undefined;

  if (tier === 'LOW' && lotusSpriteTex) {
    const spMat = new THREE.SpriteMaterial({
      map: lotusSpriteTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    lotusSprite = new THREE.Sprite(spMat);
    lotusSprite.position.z = 0.18;
    lotusSprite.scale.set(0.62, 0.62, 1);
    group.add(lotusSprite);
  } else {
    // Diamond collar rings
    for (let d = 0; d < 4; d++) {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.024, 0), goldMat);
      const a = (d / 4) * Math.PI * 2;
      gem.position.set(Math.cos(a) * 0.032, Math.sin(a) * 0.032, 0.34);
      group.add(gem);
    }

    // Pointed curved lotus petal geometry
    const petalShape = new THREE.Shape();
    petalShape.moveTo(0, 0);
    petalShape.quadraticCurveTo(0.048, 0.09, 0, 0.22);
    petalShape.quadraticCurveTo(-0.048, 0.09, 0, 0);
    const petalGeo = new THREE.ShapeGeometry(petalShape, tier === 'HIGH' ? 5 : 3);
    const rimGeo = new THREE.EdgesGeometry(petalGeo);
    const rimLineMat = new THREE.LineBasicMaterial({ color: 0xffd27a });

    const ringSpecs =
      tier === 'HIGH'
        ? [
            { count: 8, scale: 0.72, tilt: 0.55, zOff: 0.24 },
            { count: 8, scale: 1.0, tilt: 0.88, zOff: 0.17 },
            { count: 6, scale: 1.24, tilt: 1.18, zOff: 0.10 },
          ]
        : [
            { count: 6, scale: 0.85, tilt: 0.68, zOff: 0.21 },
            { count: 6, scale: 1.12, tilt: 1.05, zOff: 0.13 },
          ];

    for (let r = 0; r < ringSpecs.length; r++) {
      const spec = ringSpecs[r];
      const ringGrp = new THREE.Group();
      ringGrp.position.z = spec.zOff;
      for (let i = 0; i < spec.count; i++) {
        const a = (i / spec.count) * Math.PI * 2 + r * 0.31;
        const pPivot = new THREE.Group();
        pPivot.rotation.z = a;

        const petal = new THREE.Mesh(petalGeo, petalGlowMat);
        petal.scale.setScalar(spec.scale);
        petal.rotation.x = -spec.tilt;
        pPivot.add(petal);

        const edge = new THREE.LineSegments(rimGeo, rimLineMat);
        edge.scale.setScalar(spec.scale * 1.02);
        edge.rotation.x = -spec.tilt;
        pPivot.add(edge);

        ringGrp.add(pPivot);
      }
      group.add(ringGrp);
      petalRings.push(ringGrp);
    }

    // Cosmic aura swirls around shaft
    const swirlMat = new THREE.MeshBasicMaterial({
      color: 0xff7a1a,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const swirlRing = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.008, 6, 20), swirlMat);
    swirlRing.rotation.x = 0.65;
    swirlGroup.add(swirlRing);

    const swirlRing2 = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.007, 6, 20),
      new THREE.MeshBasicMaterial({
        color: 0xb46bff,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    swirlRing2.rotation.y = 0.85;
    swirlGroup.add(swirlRing2);
  }

  // Outward golden sun rays
  const rayCount = tier === 'HIGH' ? 8 : 4;
  const rayMat = new THREE.MeshBasicMaterial({
    color: 0xfff3c4,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const rayGeo = new THREE.ConeGeometry(0.012, 0.34, 4);
  for (let i = 0; i < rayCount; i++) {
    const a = (i / rayCount) * Math.PI * 2;
    const ray = new THREE.Mesh(rayGeo, rayMat);
    ray.position.set(Math.cos(a) * 0.16, Math.sin(a) * 0.16, 0);
    ray.rotation.z = a - Math.PI / 2;
    rayGroup.add(ray);
  }

  return { group, coreMesh, swirlGroup, petalRings, lotusSprite, rayGroup };
}

interface ScorchDecal {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

interface WaterWaveEffect {
  group: THREE.Group;
  dome: THREE.Mesh;
  ring: THREE.Mesh;
  life: number;
  maxLife: number;
  maxRadius: number;
}

export interface TornadoZone {
  x: number;
  y: number;
  z: number;
  group: THREE.Group;
  coneInner: THREE.Mesh;
  coneOuter: THREE.Mesh;
  life: number;
  maxLife: number;
  radius: number;
  liftHeight: number;
  dps: number;
  tickAccum: number;
}

interface LightningBoltEffect {
  group: THREE.Group;
  life: number;
  maxLife: number;
}

interface CraterEffect {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  age: number;
  holdDuration: number;
  fadeDuration: number;
  maxDepth: number;
}

interface SparkParticle {
  sprite: THREE.Sprite;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  baseScale: number;
  gravity: number;
  drag: number;
}

interface EarthChunk {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  rz: number;
  life: number;
  maxLife: number;
}

interface NagaBindVisual {
  group: THREE.Group;
  targetEnemyId: string;
  life: number;
}

interface BeamEffect {
  mesh: THREE.Mesh;
  core: THREE.Mesh;
  life: number;
  maxLife: number;
}

export class AstraVfxManager {
  private scene: THREE.Scene;
  private poolManager: ObjectPoolManager;

  public astraFlashLight: THREE.PointLight;
  private flashDecaySpeed = 12.0;

  private emberTex: THREE.CanvasTexture;
  private smokeTex: THREE.CanvasTexture;
  private mistTex: THREE.CanvasTexture;
  private lotusTex: THREE.CanvasTexture;
  private craterTex: THREE.CanvasTexture;

  // Objective Vertical Light Beam
  private objectiveBeamGroup: THREE.Group;
  private objectiveBeamMat: THREE.MeshBasicMaterial;
  private objectiveRingMat: THREE.MeshBasicMaterial;

  // Storm Cyclone Canopy for Brahmastra summon (caster or enemy)
  private cycloneCanopy: THREE.Mesh;
  private cycloneUniforms: {
    uTime: { value: number };
    uIntensity: { value: number };
    uBoltFlash: { value: number };
  };
  private cycloneStrength = 0;
  private cycloneTargetStrength = 0;
  private cycloneFlash = 0;

  // Handheld Brahmastra Lotus rig (mounted cleanly inside Ram's hand / bow during summon)
  public handLotusRig: BrahmastraLotusRig;

  // Active pooled visual lists
  private scorches: ScorchDecal[] = [];
  private waterWaves: WaterWaveEffect[] = [];
  public tornados: TornadoZone[] = [];
  private lightningBolts: LightningBoltEffect[] = [];
  private craters: CraterEffect[] = [];
  private sparks: SparkParticle[] = [];
  private chunks: EarthChunk[] = [];
  private nagaBinds: NagaBindVisual[] = [];
  private beams: BeamEffect[] = [];

  constructor(scene: THREE.Scene, poolManager: ObjectPoolManager) {
    this.scene = scene;
    this.poolManager = poolManager;

    this.emberTex = createRadialGlowTexture('rgba(255,250,210,1)', 'rgba(255,140,32,0.85)', 'rgba(255,60,10,0.2)');
    this.smokeTex = createRadialGlowTexture('rgba(32,26,24,0.78)', 'rgba(22,18,18,0.52)', 'rgba(14,12,12,0)');
    this.mistTex = createRadialGlowTexture('rgba(205,248,255,0.9)', 'rgba(56,189,248,0.5)', 'rgba(14,116,144,0)');
    this.lotusTex = createLotusBillboardTexture();
    this.craterTex = createSpiderCraterTexture();

    // Single reusable dynamic flash light (turned off immediately after flashes; disabled on LOW)
    this.astraFlashLight = new THREE.PointLight(0xffd27a, 0, 52, 1.4);
    this.scene.add(this.astraFlashLight);

    // Objective light beacon
    this.objectiveBeamGroup = new THREE.Group();
    this.objectiveBeamMat = new THREE.MeshBasicMaterial({
      color: 0xffc84d,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beamCol = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 1.6, 85, 12, 1, true),
      this.objectiveBeamMat
    );
    beamCol.position.y = 42.5;
    this.objectiveBeamGroup.add(beamCol);

    this.objectiveRingMat = new THREE.MeshBasicMaterial({
      color: 0xffe082,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ringMesh = new THREE.Mesh(new THREE.RingGeometry(1.5, 2.25, 24), this.objectiveRingMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.18;
    this.objectiveBeamGroup.add(ringMesh);
    this.objectiveBeamGroup.visible = false;
    this.scene.add(this.objectiveBeamGroup);

    // Procedural Swirling Cyclone Sky Cloud Shader (no circular cutout hole; thick organic swirling dark storm clouds)
    this.cycloneUniforms = {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uBoltFlash: { value: 0 },
    };
    const cycloneMat = new THREE.ShaderMaterial({
      uniforms: this.cycloneUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uIntensity;
        uniform float uBoltFlash;
        varying vec2 vUv;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
            mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.52;
          for (int i = 0; i < 4; i++) {
            v += a * noise(p);
            p *= 2.03;
            a *= 0.5;
          }
          return v;
        }
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float r = length(p);
          if (r > 1.0) discard;
          float ang = atan(p.y, p.x);
          // Organic spiral twist without punching a clear empty circle in the middle
          float swirl = ang + uTime * 1.15 - r * 3.2;
          vec2 sp = vec2(cos(swirl), sin(swirl)) * (r * 3.2);
          float cloudA = fbm(sp + vec2(uTime * 0.15, -uTime * 0.12));
          float cloudB = fbm(sp * 1.8 - vec2(uTime * 0.25));
          float density = smoothstep(0.18, 0.85, cloudA * 0.65 + cloudB * 0.45);
          float radialEdge = smoothstep(1.0, 0.52, r);
          // Subtle luminous eye spiral at the very heart + crackling cloud lightning veins
          float coreSheen = exp(-r * 3.8) * (0.45 + uBoltFlash * 1.3);
          vec3 darkCloud = vec3(0.04, 0.03, 0.09);
          vec3 purpleEdge = vec3(0.24, 0.12, 0.42);
          vec3 lightningTint = vec3(0.76, 0.86, 1.0) * (uBoltFlash * 1.6 * cloudB);
          vec3 col = mix(darkCloud, purpleEdge, cloudB * 0.7) + vec3(0.55, 0.36, 0.85) * coreSheen + lightningTint;
          float alpha = clamp(density * radialEdge * uIntensity * 0.94, 0.0, 0.96);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    this.cycloneCanopy = new THREE.Mesh(new THREE.PlaneGeometry(360, 360), cycloneMat);
    this.cycloneCanopy.rotation.x = Math.PI / 2;
    this.cycloneCanopy.position.set(0, 74, 0);
    this.cycloneCanopy.visible = false;
    this.scene.add(this.cycloneCanopy);

    // Handheld Brahmastra Lotus model for Ram's summoning sequence
    this.handLotusRig = createBrahmastraLotusModel('HIGH', this.lotusTex);
    this.handLotusRig.group.visible = false;
    this.scene.add(this.handLotusRig.group);

    this.registerPools();
  }

  private registerPools(): void {
    const pm = this.poolManager;

    // 1. Fire / Water / Wind / Serpent / Brahmastra Projectile Arrow Models
    const buildAstraArrow = (astraId: AstraId): THREE.Group => {
      const cfg = ASTRA_CONFIG[astraId];
      const g = new THREE.Group();
      const shaftMat = pm.registerSharedMaterial(
        new THREE.MeshBasicMaterial({ color: cfg.primaryHex })
      );
      const coreMat = pm.registerSharedMaterial(
        new THREE.MeshBasicMaterial({ color: cfg.secondaryHex })
      );
      const shaft = new THREE.Mesh(
        pm.registerSharedGeometry(new THREE.CylinderGeometry(0.024, 0.018, 1.18, 8)),
        shaftMat
      );
      shaft.rotation.x = Math.PI / 2;
      g.add(shaft);

      const tip = new THREE.Mesh(
        pm.registerSharedGeometry(new THREE.ConeGeometry(0.068, 0.24, 6)),
        coreMat
      );
      tip.rotation.x = Math.PI / 2;
      tip.position.z = 0.66;
      g.add(tip);

      if (astraId === 'NAGASTRA') {
        // Double glowing emerald coils wrapped around arrow shaft
        const coil = new THREE.Mesh(
          pm.registerSharedGeometry(new THREE.TorusKnotGeometry(0.09, 0.016, 20, 6, 2, 3)),
          shaftMat
        );
        coil.position.z = 0.15;
        g.add(coil);
      } else {
        const halo = new THREE.Mesh(
          pm.registerSharedGeometry(new THREE.TorusGeometry(0.11, 0.018, 6, 14)),
          coreMat
        );
        halo.position.z = 0.45;
        g.add(halo);
      }

      g.visible = false;
      pm.poolRoot.add(g);
      return g;
    };

    const arrowIds: AstraId[] = ['AGNEYASTRA', 'VARUNASTRA', 'VAYAVYASTRA', 'NAGASTRA', 'BRAHMASTRA'];
    arrowIds.forEach((id) => {
      pm.registerPool<THREE.Group>({
        key: `astra_arrow_${id}`,
        prewarmCount: id === 'BRAHMASTRA' ? 2 : 4,
        maxSize: 16,
        factory: () =>
          id === 'BRAHMASTRA'
            ? (() => {
                const rig = createBrahmastraLotusModel('MEDIUM', this.lotusTex);
                rig.group.scale.setScalar(1.35);
                rig.group.visible = false;
                pm.poolRoot.add(rig.group);
                return rig.group;
              })()
            : buildAstraArrow(id),
        onAcquire: (g) => {
          g.visible = true;
        },
        onRelease: (g) => {
          g.visible = false;
        },
        onDispose: (g) => pm.disposeObject3DResources(g),
      });
    });

    // 2. Pooled Scorch Mark Disc
    const scorchGeo = pm.registerSharedGeometry(new THREE.CircleGeometry(1, 24));
    pm.registerPool<THREE.Mesh>({
      key: 'astra_scorch',
      prewarmCount: 4,
      maxSize: 14,
      factory: () => {
        const mat = new THREE.MeshBasicMaterial({
          map: this.craterTex,
          color: 0xff6b1a,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
        });
        const m = new THREE.Mesh(scorchGeo, mat);
        m.rotation.x = -Math.PI / 2;
        m.visible = false;
        pm.poolRoot.add(m);
        return m;
      },
      onAcquire: (m) => {
        m.visible = true;
      },
      onRelease: (m) => {
        m.visible = false;
      },
      onDispose: (m) => pm.disposeObject3DResources(m),
    });

    // 3. Pooled Water Wave Dome + Ring
    const waveDomeGeo = pm.registerSharedGeometry(new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5));
    const waveRingGeo = pm.registerSharedGeometry(new THREE.TorusGeometry(1, 0.08, 8, 28));
    pm.registerPool<THREE.Group>({
      key: 'astra_water_wave',
      prewarmCount: 3,
      maxSize: 10,
      factory: () => {
        const grp = new THREE.Group();
        const dome = new THREE.Mesh(
          waveDomeGeo,
          new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.52,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        const ring = new THREE.Mesh(
          waveRingGeo,
          new THREE.MeshBasicMaterial({
            color: 0xe0f7ff,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        ring.rotation.x = Math.PI / 2;
        grp.add(dome, ring);
        grp.userData.dome = dome;
        grp.userData.ring = ring;
        grp.visible = false;
        pm.poolRoot.add(grp);
        return grp;
      },
      onAcquire: (g) => {
        g.visible = true;
      },
      onRelease: (g) => {
        g.visible = false;
      },
      onDispose: (g) => pm.disposeObject3DResources(g),
    });

    // 4. Pooled Spinning Whirlwind Tornado
    const coneOutGeo = pm.registerSharedGeometry(new THREE.CylinderGeometry(3.4, 0.55, 7.6, 16, 4, true));
    const coneInGeo = pm.registerSharedGeometry(new THREE.CylinderGeometry(1.9, 0.35, 7.2, 12, 4, true));
    pm.registerPool<THREE.Group>({
      key: 'astra_tornado',
      prewarmCount: 2,
      maxSize: 6,
      factory: () => {
        const grp = new THREE.Group();
        const outer = new THREE.Mesh(
          coneOutGeo,
          new THREE.MeshBasicMaterial({
            color: 0x7bffb8,
            transparent: true,
            opacity: 0.36,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        outer.position.y = 3.8;
        const inner = new THREE.Mesh(
          coneInGeo,
          new THREE.MeshBasicMaterial({
            color: 0xeafff4,
            transparent: true,
            opacity: 0.44,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        inner.position.y = 3.6;
        grp.add(outer, inner);
        grp.userData.outer = outer;
        grp.userData.inner = inner;
        grp.visible = false;
        pm.poolRoot.add(grp);
        return grp;
      },
      onAcquire: (g) => {
        g.scale.setScalar(1);
        g.visible = true;
      },
      onRelease: (g) => {
        g.visible = false;
      },
      onDispose: (g) => pm.disposeObject3DResources(g),
    });

    // 5. Pooled Homing Glowing Serpent Projectile + Serpent Bind Coils
    const snakeSegGeo = pm.registerSharedGeometry(new THREE.SphereGeometry(0.11, 8, 6));
    const snakeHeadGeo = pm.registerSharedGeometry(new THREE.ConeGeometry(0.15, 0.38, 6));
    const snakeMat = pm.registerSharedMaterial(
      new THREE.MeshBasicMaterial({
        color: 0x4ade80,
        transparent: true,
        opacity: 0.94,
      })
    );
    pm.registerPool<THREE.Group>({
      key: 'astra_serpent',
      prewarmCount: 8,
      maxSize: 24,
      factory: () => {
        const grp = new THREE.Group();
        const head = new THREE.Mesh(snakeHeadGeo, snakeMat);
        head.rotation.x = Math.PI / 2;
        head.position.z = 0.25;
        grp.add(head);
        const segs: THREE.Mesh[] = [];
        for (let s = 0; s < 5; s++) {
          const seg = new THREE.Mesh(snakeSegGeo, snakeMat);
          seg.scale.setScalar(1 - s * 0.14);
          seg.position.z = -s * 0.24;
          grp.add(seg);
          segs.push(seg);
        }
        grp.userData.segs = segs;
        grp.visible = false;
        pm.poolRoot.add(grp);
        return grp;
      },
      onAcquire: (g) => {
        g.visible = true;
      },
      onRelease: (g) => {
        g.visible = false;
      },
      onDispose: (g) => pm.disposeObject3DResources(g),
    });

    const bindTorusGeo = pm.registerSharedGeometry(new THREE.TorusGeometry(0.62, 0.055, 6, 18));
    pm.registerPool<THREE.Group>({
      key: 'astra_bind_coils',
      prewarmCount: 6,
      maxSize: 18,
      factory: () => {
        const grp = new THREE.Group();
        for (let k = 0; k < 3; k++) {
          const ring = new THREE.Mesh(bindTorusGeo, snakeMat);
          ring.rotation.x = Math.PI / 2 + (k - 1) * 0.22;
          ring.position.y = 0.45 + k * 0.45;
          grp.add(ring);
        }
        grp.visible = false;
        pm.poolRoot.add(grp);
        return grp;
      },
      onAcquire: (g) => {
        g.visible = true;
      },
      onRelease: (g) => {
        g.visible = false;
      },
      onDispose: (g) => pm.disposeObject3DResources(g),
    });

    // 6. Pooled Brahmastra Animated Concave Spider-Web Crater
    const craterGeo = new THREE.CircleGeometry(1, 28, 0, Math.PI * 2);
    // Add radial ring vertices by creating a PlaneGrid remapped to a disc with concave sink
    const craterDiscGeo = new THREE.RingGeometry(0.01, 1.0, 28, 6);
    craterDiscGeo.rotateX(-Math.PI / 2);
    const cPos = craterDiscGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < cPos.count; i++) {
      const px = cPos.getX(i);
      const pz = cPos.getZ(i);
      const r = Math.min(1, Math.hypot(px, pz));
      // Raised rim lip at r ~ 0.85, sunken bowl in center
      const depth = r < 0.78 ? -(1 - (r / 0.78) * (r / 0.78)) : Math.sin(((r - 0.78) / 0.22) * Math.PI) * 0.22;
      cPos.setY(i, depth);
    }
    craterDiscGeo.computeVertexNormals();
    pm.registerSharedGeometry(craterGeo);
    pm.registerSharedGeometry(craterDiscGeo);

    pm.registerPool<THREE.Mesh>({
      key: 'astra_crater',
      prewarmCount: 2,
      maxSize: 4,
      factory: () => {
        const mat = new THREE.MeshBasicMaterial({
          map: this.craterTex,
          transparent: true,
          opacity: 0.95,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(craterDiscGeo, mat);
        mesh.visible = false;
        pm.poolRoot.add(mesh);
        return mesh;
      },
      onAcquire: (m) => {
        m.visible = true;
      },
      onRelease: (m) => {
        m.visible = false;
      },
      onDispose: (m) => pm.disposeObject3DResources(m),
    });

    // 7. Pooled Earth Chunks
    const chunkGeo = pm.registerSharedGeometry(new THREE.DodecahedronGeometry(0.22, 0));
    const chunkMat = pm.registerSharedMaterial(
      new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.92 })
    );
    pm.registerPool<THREE.Mesh>({
      key: 'astra_chunk',
      prewarmCount: 16,
      maxSize: 40,
      factory: () => {
        const m = new THREE.Mesh(chunkGeo, chunkMat);
        m.visible = false;
        pm.poolRoot.add(m);
        return m;
      },
      onAcquire: (m) => {
        m.visible = true;
      },
      onRelease: (m) => {
        m.visible = false;
      },
      onDispose: (m) => pm.disposeObject3DResources(m),
    });

    // 8. Pooled Glowing Particle Sprite (Sparks, Embers, Smoke, Blue Mist)
    pm.registerPool<THREE.Sprite>({
      key: 'astra_sprite',
      prewarmCount: 40,
      maxSize: 120,
      factory: () => {
        const sp = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: this.emberTex,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        sp.visible = false;
        pm.poolRoot.add(sp);
        return sp;
      },
      onAcquire: (sp) => {
        sp.visible = true;
      },
      onRelease: (sp) => {
        sp.visible = false;
      },
      onDispose: (sp) => sp.material.dispose(),
    });

    // 9. Pooled Brahmastra Sky Beam Cylinder
    const beamOuterGeo = pm.registerSharedGeometry(new THREE.CylinderGeometry(2.1, 2.5, 1, 16, 1, true));
    const beamCoreGeo = pm.registerSharedGeometry(new THREE.CylinderGeometry(0.75, 0.95, 1, 12, 1, true));
    pm.registerPool<THREE.Mesh>({
      key: 'astra_beam',
      prewarmCount: 2,
      maxSize: 4,
      factory: () => {
        const outer = new THREE.Mesh(
          beamOuterGeo,
          new THREE.MeshBasicMaterial({
            color: 0xffb347,
            transparent: true,
            opacity: 0.72,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        const core = new THREE.Mesh(
          beamCoreGeo,
          new THREE.MeshBasicMaterial({
            color: 0xfff8dc,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        outer.add(core);
        outer.userData.core = core;
        outer.visible = false;
        pm.poolRoot.add(outer);
        return outer;
      },
      onAcquire: (m) => {
        m.visible = true;
      },
      onRelease: (m) => {
        m.visible = false;
      },
      onDispose: (m) => pm.disposeObject3DResources(m),
    });

    // 10. Pooled Jagged Branching Lightning Bolt
    const boltMat = pm.registerSharedMaterial(
      new THREE.MeshBasicMaterial({
        color: 0xe6f6ff,
        transparent: true,
        opacity: 0.96,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const boltSegGeo = pm.registerSharedGeometry(new THREE.CylinderGeometry(0.14, 0.18, 1.0, 6));
    pm.registerPool<THREE.Group>({
      key: 'astra_lightning',
      prewarmCount: 4,
      maxSize: 10,
      factory: () => {
        const g = new THREE.Group();
        const segs: THREE.Mesh[] = [];
        for (let i = 0; i < 12; i++) {
          const isBranch = i >= 8;
          const m = new THREE.Mesh(boltSegGeo, boltMat);
          if (isBranch) m.scale.set(0.45, 1, 0.45);
          g.add(m);
          segs.push(m);
        }
        g.userData.segs = segs;
        g.visible = false;
        pm.poolRoot.add(g);
        return g;
      },
      onAcquire: (g) => {
        g.visible = true;
      },
      onRelease: (g) => {
        g.visible = false;
      },
      onDispose: (g) => pm.disposeObject3DResources(g),
    });
  }

  public setObjectiveBeacon(visible: boolean, x: number, y: number, z: number, colorHex: number): void {
    this.objectiveBeamGroup.visible = visible;
    if (visible) {
      this.objectiveBeamGroup.position.set(x, y, z);
      this.objectiveBeamMat.color.setHex(colorHex);
      this.objectiveRingMat.color.setHex(colorHex);
    }
  }

  public setStormCyclone(targetIntensity: number, centerX: number, centerZ: number, flashPulse = 0): void {
    this.cycloneTargetStrength = targetIntensity;
    this.cycloneCanopy.position.set(centerX, 74, centerZ);
    if (flashPulse > this.cycloneFlash) {
      this.cycloneFlash = flashPulse;
    }
  }

  public triggerFlashLight(x: number, y: number, z: number, colorHex: number, intensity: number, tier: QualityTier): void {
    if (tier === 'LOW') {
      this.astraFlashLight.intensity = 0;
      return;
    }
    this.astraFlashLight.color.setHex(colorHex);
    this.astraFlashLight.position.set(x, y, z);
    this.astraFlashLight.intensity = intensity;
  }

  public spawnSpriteBurst(
    x: number,
    y: number,
    z: number,
    count: number,
    kind: 'EMBER' | 'SMOKE' | 'MIST' | 'GOLD' | 'WIND',
    speedMin: number,
    speedMax: number,
    baseScale: number,
    lifeSec: number,
    particleScale: number
  ): void {
    const scaled = Math.max(2, Math.round(count * particleScale));
    for (let i = 0; i < scaled; i++) {
      const sp = this.poolManager.acquire<THREE.Sprite>('astra_sprite');
      const mat = sp.material;
      if (kind === 'SMOKE') {
        mat.map = this.smokeTex;
        mat.blending = THREE.NormalBlending;
        mat.color.setHex(0x2d2624);
        mat.opacity = 0.72;
      } else if (kind === 'MIST') {
        mat.map = this.mistTex;
        mat.blending = THREE.AdditiveBlending;
        mat.color.setHex(0x6be0ff);
        mat.opacity = 0.85;
      } else if (kind === 'GOLD') {
        mat.map = this.emberTex;
        mat.blending = THREE.AdditiveBlending;
        mat.color.setHex(i % 3 === 0 ? 0xff70b8 : 0xffe484);
        mat.opacity = 0.95;
      } else if (kind === 'WIND') {
        mat.map = this.mistTex;
        mat.blending = THREE.AdditiveBlending;
        mat.color.setHex(0x8effbf);
        mat.opacity = 0.8;
      } else {
        mat.map = this.emberTex;
        mat.blending = THREE.AdditiveBlending;
        mat.color.setHex(i % 2 === 0 ? 0xff7b1c : 0xffd24d);
        mat.opacity = 0.92;
      }
      mat.needsUpdate = true;

      const ang = Math.random() * Math.PI * 2;
      const elev = (Math.random() - 0.15) * Math.PI * 0.65;
      const spd = speedMin + Math.random() * (speedMax - speedMin);
      sp.position.set(x, y, z);
      sp.scale.setScalar(baseScale);

      this.sparks.push({
        sprite: sp,
        x,
        y,
        z,
        vx: Math.cos(ang) * Math.cos(elev) * spd,
        vy: Math.abs(Math.sin(elev)) * spd + (kind === 'SMOKE' ? 1.8 : 0.8),
        vz: Math.sin(ang) * Math.cos(elev) * spd,
        life: lifeSec * (0.7 + Math.random() * 0.6),
        maxLife: lifeSec,
        baseScale,
        gravity: kind === 'SMOKE' ? -0.4 : kind === 'MIST' ? 2.5 : 8.5,
        drag: kind === 'SMOKE' ? 1.8 : 2.6,
      });
    }
  }

  public spawnFireScorch(x: number, y: number, z: number, radius: number, particleScale: number, tier: QualityTier): void {
    const m = this.poolManager.acquire<THREE.Mesh>('astra_scorch');
    m.position.set(x, y + 0.06, z);
    m.scale.setScalar(radius);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.88;
    this.scorches.push({ mesh: m, life: 6.0, maxLife: 6.0 });
    this.spawnSpriteBurst(x, y + 0.5, z, 22, 'EMBER', 3.5, 11.5, 0.95, 0.85, particleScale);
    this.triggerFlashLight(x, y + 1.5, z, 0xff6b1a, 14, tier);
  }

  public spawnWaterWave(x: number, y: number, z: number, maxRadius: number, particleScale: number, tier: QualityTier): void {
    const grp = this.poolManager.acquire<THREE.Group>('astra_water_wave');
    grp.position.set(x, y + 0.12, z);
    grp.scale.setScalar(0.5);
    this.waterWaves.push({
      group: grp,
      dome: grp.userData.dome as THREE.Mesh,
      ring: grp.userData.ring as THREE.Mesh,
      life: 0.72,
      maxLife: 0.72,
      maxRadius,
    });
    this.spawnSpriteBurst(x, y + 0.6, z, 24, 'MIST', 4.5, 12.0, 1.1, 0.9, particleScale);
    this.triggerFlashLight(x, y + 1.5, z, 0x38bdf8, 12, tier);
  }

  public spawnTornado(
    x: number,
    y: number,
    z: number,
    radius: number,
    liftHeight: number,
    dps: number,
    durationSec: number,
    particleScale: number
  ): void {
    const grp = this.poolManager.acquire<THREE.Group>('astra_tornado');
    grp.position.set(x, y, z);
    this.tornados.push({
      x,
      y,
      z,
      group: grp,
      coneInner: grp.userData.inner as THREE.Mesh,
      coneOuter: grp.userData.outer as THREE.Mesh,
      life: durationSec,
      maxLife: durationSec,
      radius,
      liftHeight,
      dps,
      tickAccum: 0,
    });
    this.spawnSpriteBurst(x, y + 1.0, z, 18, 'WIND', 3.0, 9.0, 1.05, 1.2, particleScale);
  }

  public spawnNagaBind(enemyId: string, x: number, y: number, z: number, durationSec: number): void {
    const grp = this.poolManager.acquire<THREE.Group>('astra_bind_coils');
    grp.position.set(x, y, z);
    this.nagaBinds.push({ group: grp, targetEnemyId: enemyId, life: durationSec });
  }

  public spawnLightningBolt(startX: number, startY: number, startZ: number, endX: number, endY: number, endZ: number): void {
    const grp = this.poolManager.acquire<THREE.Group>('astra_lightning');
    const segs = grp.userData.segs as THREE.Mesh[];
    const mainCount = 8;

    let prevX = startX;
    let prevY = startY;
    let prevZ = startZ;

    for (let i = 0; i < mainCount; i++) {
      const t = (i + 1) / mainCount;
      const jitter = i === mainCount - 1 ? 0 : 2.8 * Math.sin(t * Math.PI);
      const nx = THREE.MathUtils.lerp(startX, endX, t) + (Math.random() - 0.5) * jitter;
      const ny = THREE.MathUtils.lerp(startY, endY, t);
      const nz = THREE.MathUtils.lerp(startZ, endZ, t) + (Math.random() - 0.5) * jitter;

      const mesh = segs[i];
      _vTmp1.set(prevX, prevY, prevZ);
      _vTmp2.set(nx, ny, nz);
      const len = _vTmp1.distanceTo(_vTmp2);
      mesh.position.copy(_vTmp1).lerp(_vTmp2, 0.5);
      mesh.scale.set(1.25 - t * 0.45, Math.max(0.2, len), 1.25 - t * 0.45);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        _vTmp2.sub(_vTmp1).normalize()
      );

      // Forked side branches off middle joints
      if (i >= 2 && i <= 5) {
        const bIdx = 8 + (i - 2);
        const branch = segs[bIdx];
        if (branch) {
          _vTmp1.set(nx, ny, nz);
          _vTmp2.set(
            nx + (Math.random() - 0.5) * 9.0,
            ny - 4.5 - Math.random() * 4.0,
            nz + (Math.random() - 0.5) * 9.0
          );
          const bLen = _vTmp1.distanceTo(_vTmp2);
          branch.position.copy(_vTmp1).lerp(_vTmp2, 0.5);
          branch.scale.set(0.45, Math.max(0.2, bLen), 0.45);
          branch.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            _vTmp2.sub(_vTmp1).normalize()
          );
        }
      }
      prevX = nx;
      prevY = ny;
      prevZ = nz;
    }

    this.lightningBolts.push({ group: grp, life: 0.28, maxLife: 0.28 });
  }

  public spawnBrahmastraBeamAndCrater(
    fromX: number,
    fromY: number,
    fromZ: number,
    toX: number,
    toY: number,
    toZ: number,
    craterRadius: number,
    craterDepth: number,
    craterDuration: number,
    particleScale: number,
    tier: QualityTier
  ): void {
    // 1. Massive golden-white beam between Ram & impact
    const beam = this.poolManager.acquire<THREE.Mesh>('astra_beam');
    const core = beam.userData.core as THREE.Mesh;
    _vTmp1.set(fromX, fromY, fromZ);
    _vTmp2.set(toX, toY, toZ);
    const len = Math.max(4, _vTmp1.distanceTo(_vTmp2));
    beam.position.copy(_vTmp1).lerp(_vTmp2, 0.5);
    beam.scale.set(1, len, 1);
    beam.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      _vTmp2.sub(_vTmp1).normalize()
    );
    (beam.material as THREE.MeshBasicMaterial).opacity = 0.85;
    (core.material as THREE.MeshBasicMaterial).opacity = 1.0;
    this.beams.push({ mesh: beam, core, life: 0.65, maxLife: 0.65 });

    // 2. Vertical celestial lightning pillar at impact
    this.spawnLightningBolt(toX, toY + 46, toZ, toX, toY, toZ);

    // 3. Spider-web cracked animated crater
    const gY = groundHeightAt(toX, toZ);
    const crater = this.poolManager.acquire<THREE.Mesh>('astra_crater');
    crater.position.set(toX, gY + 0.08, toZ);
    crater.scale.set(craterRadius, craterDepth, craterRadius);
    (crater.material as THREE.MeshBasicMaterial).opacity = 0.95;
    this.craters.push({
      mesh: crater,
      x: toX,
      y: gY + 0.08,
      z: toZ,
      age: 0,
      holdDuration: craterDuration,
      fadeDuration: 1.5,
      maxDepth: craterDepth,
    });

    // 4. Flying earth chunks + blinding gold sparks + heavy dark ash smoke haze
    const chunkCount = Math.max(4, Math.round(14 * particleScale));
    for (let i = 0; i < chunkCount; i++) {
      const ch = this.poolManager.acquire<THREE.Mesh>('astra_chunk');
      const ang = Math.random() * Math.PI * 2;
      const spd = 4 + Math.random() * 11;
      ch.position.set(toX, gY + 0.35, toZ);
      ch.scale.setScalar(0.75 + Math.random() * 1.1);
      this.chunks.push({
        mesh: ch,
        x: toX,
        y: gY + 0.35,
        z: toZ,
        vx: Math.cos(ang) * spd,
        vy: 8 + Math.random() * 11,
        vz: Math.sin(ang) * spd,
        rx: (Math.random() - 0.5) * 9,
        rz: (Math.random() - 0.5) * 9,
        life: 1.4,
        maxLife: 1.4,
      });
    }

    this.spawnSpriteBurst(toX, toY + 0.8, toZ, 34, 'GOLD', 5, 19, 1.5, 1.1, particleScale);
    this.spawnSpriteBurst(toX, gY + 1.2, toZ, 26, 'SMOKE', 2.5, 9.5, 5.2, 4.2, particleScale);
    this.triggerFlashLight(toX, toY + 2.5, toZ, 0xffe484, 24, tier);
  }

  public update(
    dt: number,
    elapsed: number,
    particleScale: number,
    resolveEnemyPos?: (id: string) => { x: number; y: number; z: number } | null
  ): void {
    // 0. Objective beacon pulse
    if (this.objectiveBeamGroup.visible) {
      this.objectiveBeamGroup.rotation.y = elapsed * 0.9;
      this.objectiveBeamMat.opacity = 0.22 + Math.sin(elapsed * 3.0) * 0.08;
    }

    // 1. Flash light rapid decay
    if (this.astraFlashLight.intensity > 0.01) {
      this.astraFlashLight.intensity = THREE.MathUtils.damp(
        this.astraFlashLight.intensity,
        0,
        this.flashDecaySpeed,
        dt
      );
      if (this.astraFlashLight.intensity <= 0.02) this.astraFlashLight.intensity = 0;
    }

    // 2. Cyclone canopy smooth fade + lightning pulse
    this.cycloneStrength = THREE.MathUtils.damp(this.cycloneStrength, this.cycloneTargetStrength, 3.8, dt);
    this.cycloneFlash = Math.max(0, this.cycloneFlash - dt * 3.2);
    this.cycloneCanopy.visible = this.cycloneStrength > 0.01;
    if (this.cycloneCanopy.visible) {
      this.cycloneUniforms.uTime.value = elapsed;
      this.cycloneUniforms.uIntensity.value = this.cycloneStrength;
      this.cycloneUniforms.uBoltFlash.value = this.cycloneFlash;
    }

    // 3. Handheld Lotus rig idle breathing shimmer when visible
    if (this.handLotusRig.group.visible) {
      const pulse = 1.0 + Math.sin(elapsed * 8.5) * 0.14;
      this.handLotusRig.coreMesh.scale.setScalar(pulse);
      this.handLotusRig.swirlGroup.rotation.z += dt * 4.5;
      this.handLotusRig.rayGroup.rotation.z -= dt * 2.2;
      if (this.handLotusRig.lotusSprite) {
        this.handLotusRig.lotusSprite.scale.setScalar(0.62 * pulse);
      }
    }

    // 4. Fire Scorch Decals
    for (let i = this.scorches.length - 1; i >= 0; i--) {
      const sc = this.scorches[i];
      sc.life -= dt;
      (sc.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.88 * (sc.life / sc.maxLife));
      if (sc.life <= 0) {
        this.poolManager.release('astra_scorch', sc.mesh);
        this.scorches[i] = this.scorches[this.scorches.length - 1];
        this.scorches.pop();
      }
    }

    // 5. Water Wave Domes
    for (let i = this.waterWaves.length - 1; i >= 0; i--) {
      const ww = this.waterWaves[i];
      ww.life -= dt;
      const p = Math.min(1, 1 - ww.life / ww.maxLife);
      const rad = THREE.MathUtils.lerp(0.8, ww.maxRadius, p);
      ww.group.scale.set(rad, THREE.MathUtils.lerp(1.8, 0.55, p), rad);
      (ww.dome.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.52 * (1 - p));
      (ww.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.88 * (1 - p));
      if (ww.life <= 0) {
        this.poolManager.release('astra_water_wave', ww.group);
        this.waterWaves[i] = this.waterWaves[this.waterWaves.length - 1];
        this.waterWaves.pop();
      }
    }

    // 6. Vayavyastra Spinning Tornados
    for (let i = this.tornados.length - 1; i >= 0; i--) {
      const tn = this.tornados[i];
      tn.life -= dt;
      tn.coneOuter.rotation.y += dt * 9.5;
      tn.coneInner.rotation.y -= dt * 13.5;
      const fade = Math.min(1, tn.life / 0.5);
      (tn.coneOuter.material as THREE.MeshBasicMaterial).opacity = 0.36 * fade;
      (tn.coneInner.material as THREE.MeshBasicMaterial).opacity = 0.44 * fade;
      if (Math.random() < dt * 8 * particleScale) {
        this.spawnSpriteBurst(
          tn.x + (Math.random() - 0.5) * 3.5,
          tn.y + 0.6,
          tn.z + (Math.random() - 0.5) * 3.5,
          1,
          'WIND',
          2.0,
          4.5,
          0.75,
          0.6,
          1
        );
      }
      if (tn.life <= 0) {
        this.poolManager.release('astra_tornado', tn.group);
        this.tornados[i] = this.tornados[this.tornados.length - 1];
        this.tornados.pop();
      }
    }

    // 7. Lightning Bolts
    for (let i = this.lightningBolts.length - 1; i >= 0; i--) {
      const lb = this.lightningBolts[i];
      lb.life -= dt;
      if (lb.life <= 0) {
        this.poolManager.release('astra_lightning', lb.group);
        this.lightningBolts[i] = this.lightningBolts[this.lightningBolts.length - 1];
        this.lightningBolts.pop();
      }
    }

    // 8. Beams
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const bm = this.beams[i];
      bm.life -= dt;
      const alpha = Math.max(0, bm.life / bm.maxLife);
      (bm.mesh.material as THREE.MeshBasicMaterial).opacity = 0.72 * alpha;
      (bm.core.material as THREE.MeshBasicMaterial).opacity = 0.95 * alpha;
      if (bm.life <= 0) {
        this.poolManager.release('astra_beam', bm.mesh);
        this.beams[i] = this.beams[this.beams.length - 1];
        this.beams.pop();
      }
    }

    // 9. Animated Spider-Web Craters (stays ~5s then smoothly fills back flat)
    for (let i = this.craters.length - 1; i >= 0; i--) {
      const cr = this.craters[i];
      cr.age += dt;
      if (cr.age > cr.holdDuration) {
        const tFill = Math.min(1, (cr.age - cr.holdDuration) / cr.fadeDuration);
        const depthNow = cr.maxDepth * (1 - tFill);
        cr.mesh.scale.y = Math.max(0.02, depthNow);
        (cr.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - tFill);
        if (tFill >= 1) {
          this.poolManager.release('astra_crater', cr.mesh);
          this.craters[i] = this.craters[this.craters.length - 1];
          this.craters.pop();
          continue;
        }
      }
    }

    // 10. Earth Chunks
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const ch = this.chunks[i];
      ch.life -= dt;
      ch.vy -= 22 * dt;
      ch.x += ch.vx * dt;
      ch.y += ch.vy * dt;
      ch.z += ch.vz * dt;
      ch.mesh.position.set(ch.x, ch.y, ch.z);
      ch.mesh.rotation.x += ch.rx * dt;
      ch.mesh.rotation.z += ch.rz * dt;
      if (ch.life <= 0 || ch.y < groundHeightAt(ch.x, ch.z) - 0.5) {
        this.poolManager.release('astra_chunk', ch.mesh);
        this.chunks[i] = this.chunks[this.chunks.length - 1];
        this.chunks.pop();
      }
    }

    // 11. Pooled Particle Sprites
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i];
      sp.life -= dt;
      sp.vx *= Math.exp(-sp.drag * dt);
      sp.vz *= Math.exp(-sp.drag * dt);
      sp.vy -= sp.gravity * dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.z += sp.vz * dt;
      sp.sprite.position.set(sp.x, sp.y, sp.z);
      const frac = Math.max(0, sp.life / sp.maxLife);
      sp.sprite.material.opacity = frac;
      sp.sprite.scale.setScalar(sp.baseScale * (sp.gravity < 0 ? 1.8 - frac * 0.8 : 0.4 + frac * 0.6));
      if (sp.life <= 0) {
        this.poolManager.release('astra_sprite', sp.sprite);
        this.sparks[i] = this.sparks[this.sparks.length - 1];
        this.sparks.pop();
      }
    }

    // 12. Naga Bind Coils on Bound Enemies
    for (let i = this.nagaBinds.length - 1; i >= 0; i--) {
      const nb = this.nagaBinds[i];
      nb.life -= dt;
      nb.group.rotation.y += dt * 4.5;
      if (resolveEnemyPos) {
        const pos = resolveEnemyPos(nb.targetEnemyId);
        if (pos) {
          nb.group.position.set(pos.x, pos.y, pos.z);
        } else {
          nb.life = 0;
        }
      }
      if (nb.life <= 0) {
        this.poolManager.release('astra_bind_coils', nb.group);
        this.nagaBinds[i] = this.nagaBinds[this.nagaBinds.length - 1];
        this.nagaBinds.pop();
      }
    }
  }

  public dispose(): void {
    this.emberTex.dispose();
    this.smokeTex.dispose();
    this.mistTex.dispose();
    this.lotusTex.dispose();
    this.craterTex.dispose();
  }
}
