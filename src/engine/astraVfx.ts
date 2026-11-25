import * as THREE from 'three';
import { AstraId, QualityTier } from '../types/world';
import { ShaderComplexityLevel } from './HardwareProfiler';
import { ObjectPoolManager } from './ObjectPoolManager';
import { ASTRA_CONFIG } from './astraConfig';
import { groundHeightAt } from './worldData';

const _vTmp1 = new THREE.Vector3();
const _vTmp2 = new THREE.Vector3();
const _vUp = new THREE.Vector3(0, 1, 0);

export interface EnemyDissolveUniforms {
  uDissolve: { value: number };
  uHeatGlow: { value: number };
  uDissolveTime: { value: number };
}

/**
 * Installs a shared GPU-driven 2-second incineration-into-ash PBR shader patch onto all
 * standard/physical materials of a pooled enemy rig once at pool creation time.
 * Uses a uniform branch (uDissolve > 0.001) so intact enemies incur zero noise ALU cost,
 * and shares a single customProgramCacheKey across all demon rigs (zero runtime recompiles).
 */
export function installEnemyAshDissolution(root: THREE.Object3D): EnemyDissolveUniforms {
  const existing = root.userData._dissolveUniforms as EnemyDissolveUniforms | undefined;
  if (existing) return existing;

  const uniforms: EnemyDissolveUniforms = {
    uDissolve: { value: 0 },
    uHeatGlow: { value: 0 },
    uDissolveTime: { value: 0 },
  };
  root.userData._dissolveUniforms = uniforms;

  const patchedMats = new Set<THREE.Material>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (let i = 0; i < mats.length; i++) {
      const mat = mats[i] as THREE.MeshStandardMaterial;
      if (!mat || !mat.isMeshStandardMaterial || patchedMats.has(mat)) continue;
      patchedMats.add(mat);
      mat.customProgramCacheKey = () => 'demon-ash-dissolve-v1';
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uDissolve = uniforms.uDissolve;
        shader.uniforms.uHeatGlow = uniforms.uHeatGlow;
        shader.uniforms.uDissolveTime = uniforms.uDissolveTime;

        shader.vertexShader =
          `
          uniform float uDissolve;
          uniform float uDissolveTime;
          varying vec3 vDissolveLocalPos;
          ` +
          shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            vDissolveLocalPos = position;
            if (uDissolve > 0.001) {
              float crumble = smoothstep(0.10, 1.0, uDissolve);
              float flutter = sin(position.x * 11.0 + uDissolveTime * 9.5) * cos(position.z * 11.0 - uDissolveTime * 8.0);
              transformed.y += crumble * (0.30 + max(0.0, position.y) * 0.18) + crumble * flutter * 0.045;
              transformed.xz *= (1.0 - crumble * 0.26);
            }
            `
          );

        shader.fragmentShader =
          `
          uniform float uDissolve;
          uniform float uHeatGlow;
          uniform float uDissolveTime;
          varying vec3 vDissolveLocalPos;

          float agniHash3(vec3 p) {
            p = fract(p * 0.3183099 + 0.1);
            p *= 17.0;
            return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
          }
          float agniNoise3(vec3 x) {
            vec3 i = floor(x);
            vec3 f = fract(x);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(mix(agniHash3(i + vec3(0.0,0.0,0.0)), agniHash3(i + vec3(1.0,0.0,0.0)), f.x),
                  mix(agniHash3(i + vec3(0.0,1.0,0.0)), agniHash3(i + vec3(1.0,1.0,0.0)), f.x), f.y),
              mix(mix(agniHash3(i + vec3(0.0,0.0,1.0)), agniHash3(i + vec3(1.0,0.0,1.0)), f.x),
                  mix(agniHash3(i + vec3(0.0,1.0,1.0)), agniHash3(i + vec3(1.0,1.0,1.0)), f.x), f.y),
              f.z
            );
          }
          float agniFbm3(vec3 p) {
            return 0.62 * agniNoise3(p) + 0.38 * agniNoise3(p * 2.13 + vec3(4.2, 1.7, 3.1));
          }
          ` +
          shader.fragmentShader
            .replace(
              '#include <color_fragment>',
              `
              #include <color_fragment>
              float agniEdgeMask = 0.0;
              if (uDissolve > 0.001 || uHeatGlow > 0.001) {
                vec3 ashCoord = vDissolveLocalPos * 4.5 + vec3(0.0, -uDissolveTime * 0.45, 0.0);
                float n3 = agniFbm3(ashCoord);
                float heightBias = clamp((vDissolveLocalPos.y + 0.55) * 0.14, -0.08, 0.22);
                float burnField = clamp(n3 * 0.78 + heightBias, 0.02, 0.99);

                if (uDissolve > 0.001) {
                  float thresh = uDissolve * 1.06;
                  if (burnField < thresh) {
                    discard;
                  }
                  float distToEdge = burnField - thresh;
                  float charZone = 1.0 - smoothstep(0.0, 0.30, distToEdge);
                  float emberZone = 1.0 - smoothstep(0.0, 0.115, distToEdge);
                  float ashRim = 1.0 - smoothstep(0.0, 0.032, distToEdge);
                  vec3 sootCol = vec3(0.032, 0.025, 0.022);
                  vec3 ashCol = vec3(0.36, 0.34, 0.32);
                  diffuseColor.rgb = mix(diffuseColor.rgb, sootCol, charZone * 0.94);
                  diffuseColor.rgb = mix(diffuseColor.rgb, ashCol, ashRim * 0.88);
                  agniEdgeMask = max(emberZone, uHeatGlow * n3 * 0.42);
                } else {
                  agniEdgeMask = uHeatGlow * smoothstep(0.36, 0.84, n3) * 0.72;
                }
              }
              `
            )
            .replace(
              '#include <emissivemap_fragment>',
              `
              #include <emissivemap_fragment>
              if (agniEdgeMask > 0.001) {
                float flicker = 0.82 + 0.18 * sin(uDissolveTime * 19.0 + vDissolveLocalPos.y * 14.0);
                vec3 crimsonFire = vec3(1.25, 0.20, 0.02);
                vec3 solarGold = vec3(3.4, 1.95, 0.48);
                totalEmissiveRadiance += mix(crimsonFire, solarGold, clamp(agniEdgeMask * 1.35, 0.0, 1.0)) * agniEdgeMask * flicker * 1.75;
              }
              `
            );
      };
    }
  });

  return uniforms;
}

function createAgniMandalaMaterial(
  isField: boolean,
  initialShaderQuality = 1.0
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1.0 },
      uIsField: { value: isField ? 1.0 : 0.0 },
      uShaderQuality: { value: initialShaderQuality },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      uniform float uIsField;
      uniform float uShaderQuality;
      varying vec2 vUv;

      float mHash(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
      }
      float mNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mHash(i), mHash(i + vec2(1.0, 0.0)), u.x),
          mix(mHash(i + vec2(0.0, 1.0)), mHash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      float mFbm(vec2 p) {
        float n0 = mNoise(p);
        if (uShaderQuality < 0.75) {
          return n0;
        }
        return 0.62 * n0 + 0.38 * mNoise(p * 2.05 + vec2(uTime * 0.4, -uTime * 0.3));
      }

      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        if (r > 1.0) discard;

        float ang = atan(p.y, p.x);
        float heatWarp = (mFbm(vec2(ang * 2.5, r * 5.0 - uTime * 3.4)) - 0.5) * 0.075;
        float rw = max(0.0, r + heatWarp);

        // Sacred concentric chakra rings
        float ring1 = exp(-pow((rw - 0.88) * 32.0, 2.0));
        float ring2 = exp(-pow((rw - 0.67) * 38.0, 2.0));
        float ring3 = exp(-pow((rw - 0.45) * 42.0, 2.0));
        float ring4 = exp(-pow((rw - 0.25) * 46.0, 2.0));

        // Counter-rotating sacred Sri-Agni hexagram triangles (3-fold star geometry)
        float rotA = ang + uTime * 1.45;
        float rotB = ang - uTime * 1.15;
        float triA = smoothstep(0.075, 0.0, abs(rw * cos(mod(rotA, 2.0943951) - 1.0471975) - 0.29));
        float triB = smoothstep(0.075, 0.0, abs(rw * cos(mod(rotB + 1.0471975, 2.0943951) - 1.0471975) - 0.29));
        float shatkon = max(triA, triB) * smoothstep(0.14, 0.20, rw) * smoothstep(0.68, 0.52, rw);

        // 8-fold glowing lotus petals + 16-fold outer solar spikes
        float petal8 = pow(max(0.0, cos(ang * 8.0 - uTime * 2.4)), 4.0) * smoothstep(0.38, 0.48, rw) * smoothstep(0.70, 0.58, rw);
        float ray16 = pow(max(0.0, cos(ang * 16.0 + uTime * 3.1)), 6.0) * smoothstep(0.64, 0.74, rw) * smoothstep(0.97, 0.82, rw);

        // Swirling radial solar heat plasma & corona flare
        float plasma = mFbm(vec2(ang * 3.0 + r * 3.5, r * 6.5 - uTime * 4.2));
        float solarCore = exp(-r * 6.4) * (1.25 + 0.35 * sin(uTime * 14.0));
        float radialCorona = (ring1 * 1.15 + ring2 * 0.95 + ring3 * 0.90 + ring4 * 1.05 + shatkon * 1.15 + petal8 * 0.85 + ray16 * 0.95);
        float heatHaze = smoothstep(0.98, 0.18, r) * plasma * (0.42 + uIsField * 0.22);

        float energy = (solarCore + radialCorona * (0.72 + plasma * 0.55) + heatHaze) * smoothstep(1.0, 0.78, r);
        vec3 deepCrimson = vec3(0.95, 0.16, 0.02);
        vec3 saffronFlame = vec3(1.55, 0.56, 0.07);
        vec3 whiteGold = vec3(2.8, 2.25, 1.15);

        vec3 col = mix(deepCrimson, saffronFlame, clamp(energy * 0.85, 0.0, 1.0));
        col = mix(col, whiteGold, clamp(solarCore * 0.95 + max(shatkon, ring1 * 0.65) * 0.45, 0.0, 1.0));

        float alpha = clamp(energy * uIntensity, 0.0, 0.98);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(col * uIntensity, alpha);
      }
    `,
  });
}

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
  foamRing: THREE.Mesh;
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
  windRibbon: THREE.Mesh;
  life: number;
  maxLife: number;
  radius: number;
  liftHeight: number;
  dps: number;
  tickAccum: number;
  zoneShotId?: string;
  syncAccum: number;
  optimisticDmg: Map<string, number>;
}

export interface AgniMandalaZone {
  x: number;
  y: number;
  z: number;
  group: THREE.Group;
  groundDisc: THREE.Mesh;
  haloDisc: THREE.Mesh;
  heatRim: THREE.Mesh;
  groundMat: THREE.ShaderMaterial;
  haloMat: THREE.ShaderMaterial;
  rimMat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  radius: number;
  pullRadius: number;
  dps: number;
  zoneShotId?: string;
  syncAccum: number;
  optimisticDmg: Map<string, number>;
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
  halo: THREE.Mesh;
  life: number;
  maxLife: number;
}

export class AstraVfxManager {
  private scene: THREE.Scene;
  private poolManager: ObjectPoolManager;

  public astraFlashLight: THREE.PointLight;
  private flashDecaySpeed = 12.0;
  private agniHeatHoldTimer = 0;

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
  private cycloneMat: THREE.ShaderMaterial;
  private cycloneUniforms: {
    uTime: { value: number };
    uIntensity: { value: number };
    uBoltFlash: { value: number };
    uShaderQuality: { value: number };
  };
  private cycloneStrength = 0;
  private cycloneTargetStrength = 0;
  private cycloneFlash = 0;
  private shaderQualityFactor = 1.0;

  // Handheld Brahmastra Lotus rig (mounted cleanly inside Ram's hand / bow during summon)
  public handLotusRig: BrahmastraLotusRig;

  // Active pooled visual lists
  private scorches: ScorchDecal[] = [];
  private waterWaves: WaterWaveEffect[] = [];
  public tornados: TornadoZone[] = [];
  public agniMandalas: AgniMandalaZone[] = [];
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
      uShaderQuality: { value: 1.0 },
    };
    this.cycloneMat = new THREE.ShaderMaterial({
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
        uniform float uShaderQuality;
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
          int maxOct = uShaderQuality >= 0.75 ? 4 : (uShaderQuality >= 0.25 ? 2 : 1);
          for (int i = 0; i < 4; i++) {
            if (i >= maxOct) break;
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
          float cloudB = uShaderQuality < 0.25 ? cloudA : fbm(sp * 1.8 - vec2(uTime * 0.25));
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
    this.cycloneCanopy = new THREE.Mesh(new THREE.PlaneGeometry(360, 360), this.cycloneMat);
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
    const agniCoreGeo = pm.registerSharedGeometry(new THREE.SphereGeometry(0.14, 12, 10));
    const agniMandalaMainGeo = pm.registerSharedGeometry(new THREE.PlaneGeometry(2.35, 2.35));
    const agniMandalaInnerGeo = pm.registerSharedGeometry(new THREE.PlaneGeometry(1.5, 1.5));
    const agniMandalaSideGeo = pm.registerSharedGeometry(new THREE.PlaneGeometry(1.75, 1.75));
    const agniCoreMat = pm.registerSharedMaterial(
      new THREE.MeshBasicMaterial({
        color: 0xfff3c4,
        transparent: true,
        opacity: 0.96,
      })
    );

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

      if (astraId === 'AGNEYASTRA') {
        const coreSphere = new THREE.Mesh(agniCoreGeo, agniCoreMat);
        coreSphere.position.z = 0.24;
        g.add(coreSphere);

        const mandalaMatMain = createAgniMandalaMaterial(false, this.shaderQualityFactor);
        const mandalaMatInner = createAgniMandalaMaterial(false, this.shaderQualityFactor);
        const mandalaMain = new THREE.Mesh(agniMandalaMainGeo, mandalaMatMain);
        mandalaMain.position.z = 0.22;
        const mandalaInner = new THREE.Mesh(agniMandalaInnerGeo, mandalaMatInner);
        mandalaInner.position.z = -0.14;
        const mandalaSide = new THREE.Mesh(agniMandalaSideGeo, mandalaMatInner);
        mandalaSide.rotation.y = Math.PI / 2;
        mandalaSide.position.z = 0.16;

        g.add(mandalaMain, mandalaInner, mandalaSide);
        g.userData.mandalaMain = mandalaMain;
        g.userData.mandalaInner = mandalaInner;
        g.userData.mandalaSide = mandalaSide;
        g.userData.mandalaMats = [mandalaMatMain, mandalaMatInner];
      } else if (astraId === 'NAGASTRA') {
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

    // 2. Pooled Scorch Mark Disc & Agneyastra Fiery Circular Mandala Vortex Field
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

    const mandalaFieldGroundGeo = pm.registerSharedGeometry(new THREE.PlaneGeometry(2.0, 2.0));
    const mandalaFieldHaloGeo = pm.registerSharedGeometry(new THREE.PlaneGeometry(1.48, 1.48));
    const mandalaHeatRimGeo = pm.registerSharedGeometry(
      new THREE.CylinderGeometry(0.86, 0.98, 0.95, 24, 1, true)
    );
    pm.registerPool<THREE.Group>({
      key: 'astra_agni_mandala',
      prewarmCount: 3,
      maxSize: 8,
      factory: () => {
        const grp = new THREE.Group();
        const groundMat = createAgniMandalaMaterial(true, this.shaderQualityFactor);
        const haloMat = createAgniMandalaMaterial(true, this.shaderQualityFactor);
        const rimMat = new THREE.MeshBasicMaterial({
          color: 0xff7b1c,
          transparent: true,
          opacity: 0.34,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        });

        const groundDisc = new THREE.Mesh(mandalaFieldGroundGeo, groundMat);
        groundDisc.rotation.x = -Math.PI / 2;
        groundDisc.position.y = 0.14;

        const haloDisc = new THREE.Mesh(mandalaFieldHaloGeo, haloMat);
        haloDisc.rotation.x = -Math.PI / 2;
        haloDisc.position.y = 0.42;

        const heatRim = new THREE.Mesh(mandalaHeatRimGeo, rimMat);
        heatRim.position.y = 0.48;

        grp.add(groundDisc, haloDisc, heatRim);
        grp.userData.groundDisc = groundDisc;
        grp.userData.haloDisc = haloDisc;
        grp.userData.heatRim = heatRim;
        grp.userData.groundMat = groundMat;
        grp.userData.haloMat = haloMat;
        grp.userData.rimMat = rimMat;
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

    // 3. Pooled Water Wave Dome + Double Caustic Crest Rings
    const waveDomeGeo = pm.registerSharedGeometry(new THREE.SphereGeometry(1, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5));
    const waveRingGeo = pm.registerSharedGeometry(new THREE.TorusGeometry(1, 0.085, 8, 28));
    const waveFoamGeo = pm.registerSharedGeometry(new THREE.TorusGeometry(0.84, 0.048, 6, 28));
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
            opacity: 0.56,
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
            opacity: 0.90,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        ring.rotation.x = Math.PI / 2;
        const foamRing = new THREE.Mesh(
          waveFoamGeo,
          new THREE.MeshBasicMaterial({
            color: 0x7dd3fc,
            transparent: true,
            opacity: 0.78,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        foamRing.rotation.x = Math.PI / 2;
        foamRing.position.y = 0.14;
        grp.add(dome, ring, foamRing);
        grp.userData.dome = dome;
        grp.userData.ring = ring;
        grp.userData.foamRing = foamRing;
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

    // 4. Pooled Spinning Whirlwind Tornado + Helical Wind Ribbon
    const coneOutGeo = pm.registerSharedGeometry(new THREE.CylinderGeometry(3.4, 0.55, 7.6, 16, 4, true));
    const coneInGeo = pm.registerSharedGeometry(new THREE.CylinderGeometry(1.9, 0.35, 7.2, 12, 4, true));
    const windRibbonGeo = pm.registerSharedGeometry(new THREE.TorusKnotGeometry(1.45, 0.085, 28, 6, 1, 3));
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
            opacity: 0.38,
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
            opacity: 0.48,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        inner.position.y = 3.6;
        const windRibbon = new THREE.Mesh(
          windRibbonGeo,
          new THREE.MeshBasicMaterial({
            color: 0xb8ffe0,
            transparent: true,
            opacity: 0.52,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        windRibbon.rotation.x = Math.PI / 2;
        windRibbon.scale.set(1.15, 1.15, 2.2);
        windRibbon.position.y = 3.5;
        grp.add(outer, inner, windRibbon);
        grp.userData.outer = outer;
        grp.userData.inner = inner;
        grp.userData.windRibbon = windRibbon;
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

    // 9. Pooled Brahmastra Sky Beam Cylinder + Cosmic Magenta-Gold Outer Halo
    const beamOuterGeo = pm.registerSharedGeometry(new THREE.CylinderGeometry(2.1, 2.5, 1, 16, 1, true));
    const beamCoreGeo = pm.registerSharedGeometry(new THREE.CylinderGeometry(0.75, 0.95, 1, 12, 1, true));
    const beamHaloGeo = pm.registerSharedGeometry(new THREE.CylinderGeometry(3.3, 4.1, 1, 16, 1, true));
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
            opacity: 0.78,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        const core = new THREE.Mesh(
          beamCoreGeo,
          new THREE.MeshBasicMaterial({
            color: 0xfffce8,
            transparent: true,
            opacity: 0.98,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        const halo = new THREE.Mesh(
          beamHaloGeo,
          new THREE.MeshBasicMaterial({
            color: 0xe879f9,
            transparent: true,
            opacity: 0.34,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        outer.add(core, halo);
        outer.userData.core = core;
        outer.userData.halo = halo;
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

    // 10. Pooled Jagged Branching Lightning Bolt with Outer Plasma Sheath
    const boltMat = pm.registerSharedMaterial(
      new THREE.MeshBasicMaterial({
        color: 0xf4fbff,
        transparent: true,
        opacity: 0.98,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const boltGlowMat = pm.registerSharedMaterial(
      new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.48,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const boltSegGeo = pm.registerSharedGeometry(new THREE.CylinderGeometry(0.14, 0.18, 1.0, 6));
    const boltGlowGeo = pm.registerSharedGeometry(new THREE.CylinderGeometry(0.32, 0.40, 1.0, 6));
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
          const sheath = new THREE.Mesh(boltGlowGeo, boltGlowMat);
          m.add(sheath);
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

  public updateAgniHeatLight(
    x: number,
    y: number,
    z: number,
    elapsed: number,
    intensityBase: number,
    tier: QualityTier
  ): void {
    if (tier === 'LOW') {
      this.astraFlashLight.intensity = 0;
      return;
    }
    this.agniHeatHoldTimer = 0.08;
    const flicker = 0.88 + 0.14 * Math.sin(elapsed * 24.0) + 0.06 * Math.cos(elapsed * 37.0);
    this.astraFlashLight.color.setHex(0xff7218);
    this.astraFlashLight.position.set(x, y + 0.8, z);
    this.astraFlashLight.intensity = intensityBase * flicker;
  }

  public spawnSpriteBurst(
    x: number,
    y: number,
    z: number,
    count: number,
    kind: 'EMBER' | 'SMOKE' | 'MIST' | 'GOLD' | 'WIND' | 'ASH',
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
      } else if (kind === 'ASH') {
        mat.map = i % 3 === 0 ? this.emberTex : this.smokeTex;
        mat.blending = i % 3 === 0 ? THREE.AdditiveBlending : THREE.NormalBlending;
        mat.color.setHex(i % 3 === 0 ? 0xff7b24 : 0x524946);
        mat.opacity = i % 3 === 0 ? 0.88 : 0.72;
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
        vy: Math.abs(Math.sin(elev)) * spd + (kind === 'SMOKE' || kind === 'ASH' ? 1.9 : 0.8),
        vz: Math.sin(ang) * Math.cos(elev) * spd,
        life: lifeSec * (0.7 + Math.random() * 0.6),
        maxLife: lifeSec,
        baseScale,
        gravity: kind === 'SMOKE' ? -0.4 : kind === 'ASH' ? -1.85 : kind === 'MIST' ? 2.5 : 8.5,
        drag: kind === 'SMOKE' ? 1.8 : kind === 'ASH' ? 1.5 : 2.6,
      });
    }
  }

  public spawnAshIncinerationBurst(
    x: number,
    y: number,
    z: number,
    scale: number,
    particleScale: number
  ): void {
    this.spawnSpriteBurst(
      x + (Math.random() - 0.5) * 0.55 * scale,
      y + 0.4 + Math.random() * 1.1 * scale,
      z + (Math.random() - 0.5) * 0.55 * scale,
      3,
      'ASH',
      0.35,
      1.6,
      0.46 * scale,
      0.85,
      particleScale
    );
  }

  public spawnFireScorch(x: number, y: number, z: number, radius: number, particleScale: number, tier: QualityTier): void {
    const m = this.poolManager.acquire<THREE.Mesh>('astra_scorch');
    m.position.set(x, y + 0.06, z);
    m.scale.setScalar(radius);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.88;
    this.scorches.push({ mesh: m, life: 6.0, maxLife: 6.0 });
    this.spawnSpriteBurst(x, y + 0.5, z, 22, 'EMBER', 3.5, 11.5, 0.95, 0.85, particleScale);
    this.triggerFlashLight(x, y + 1.5, z, 0xff6b1a, 16, tier);
  }

  public spawnAgniMandalaField(
    x: number,
    y: number,
    z: number,
    radius: number,
    durationSec: number,
    dps: number,
    particleScale: number,
    tier: QualityTier,
    zoneShotId?: string
  ): void {
    const grp = this.poolManager.acquire<THREE.Group>('astra_agni_mandala');
    grp.position.set(x, y, z);
    grp.scale.setScalar(0.25);

    const groundDisc = grp.userData.groundDisc as THREE.Mesh;
    const haloDisc = grp.userData.haloDisc as THREE.Mesh;
    const heatRim = grp.userData.heatRim as THREE.Mesh;
    const groundMat = grp.userData.groundMat as THREE.ShaderMaterial;
    const haloMat = grp.userData.haloMat as THREE.ShaderMaterial;
    const rimMat = grp.userData.rimMat as THREE.MeshBasicMaterial;

    groundMat.uniforms.uIntensity.value = 1.25;
    haloMat.uniforms.uIntensity.value = 0.95;
    rimMat.opacity = 0.34;

    this.agniMandalas.push({
      x,
      y,
      z,
      group: grp,
      groundDisc,
      haloDisc,
      heatRim,
      groundMat,
      haloMat,
      rimMat,
      life: durationSec,
      maxLife: durationSec,
      radius,
      pullRadius: radius * 1.28,
      dps,
      zoneShotId,
      syncAccum: 0,
      optimisticDmg: new Map(),
    });
    this.spawnFireScorch(x, y, z, radius * 0.92, particleScale, tier);
    this.updateAgniHeatLight(x, y + 1.2, z, 0, 22, tier);
  }

  public spawnWaterWave(x: number, y: number, z: number, maxRadius: number, particleScale: number, tier: QualityTier): void {
    const grp = this.poolManager.acquire<THREE.Group>('astra_water_wave');
    grp.position.set(x, y + 0.12, z);
    grp.scale.setScalar(0.5);
    this.waterWaves.push({
      group: grp,
      dome: grp.userData.dome as THREE.Mesh,
      ring: grp.userData.ring as THREE.Mesh,
      foamRing: grp.userData.foamRing as THREE.Mesh,
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
    particleScale: number,
    zoneShotId?: string
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
      windRibbon: grp.userData.windRibbon as THREE.Mesh,
      life: durationSec,
      maxLife: durationSec,
      radius,
      liftHeight,
      dps,
      tickAccum: 0,
      zoneShotId,
      syncAccum: 0,
      optimisticDmg: new Map(),
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
        _vUp,
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
            _vUp,
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
    const halo = beam.userData.halo as THREE.Mesh;
    _vTmp1.set(fromX, fromY, fromZ);
    _vTmp2.set(toX, toY, toZ);
    const len = Math.max(4, _vTmp1.distanceTo(_vTmp2));
    beam.position.copy(_vTmp1).lerp(_vTmp2, 0.5);
    beam.scale.set(1, len, 1);
    beam.quaternion.setFromUnitVectors(
      _vUp,
      _vTmp2.sub(_vTmp1).normalize()
    );
    (beam.material as THREE.MeshBasicMaterial).opacity = 0.85;
    (core.material as THREE.MeshBasicMaterial).opacity = 1.0;
    (halo.material as THREE.MeshBasicMaterial).opacity = 0.36;
    this.beams.push({ mesh: beam, core, halo, life: 0.65, maxLife: 0.65 });

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

    // 1. Flash light rapid decay (held smoothly when Agniastra projectile or mandala heat is active)
    this.agniHeatHoldTimer = Math.max(0, this.agniHeatHoldTimer - dt);
    if (this.agniHeatHoldTimer <= 0 && this.astraFlashLight.intensity > 0.01) {
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

    // 4. Fire Scorch Decals & Active Agneyastra Fiery Circular Mandala Vortex Fields
    for (let i = this.agniMandalas.length - 1; i >= 0; i--) {
      const am = this.agniMandalas[i];
      am.life -= dt;
      const age = am.maxLife - am.life;
      const openFrac = Math.min(1, age / 0.22);
      const easeOpen = 1 - (1 - openFrac) * (1 - openFrac);
      const fadeFrac = Math.min(1, Math.max(0, am.life / 0.6));
      const curRadius = am.radius * (0.28 + 0.72 * easeOpen);

      am.group.scale.set(curRadius, 0.75 + 0.35 * Math.sin(elapsed * 7.5 + i), curRadius);
      am.groundDisc.rotation.z += dt * 1.15;
      am.haloDisc.rotation.z -= dt * 1.65;
      am.haloDisc.position.y = 0.38 + Math.sin(elapsed * 6.0 + i) * 0.14;
      am.heatRim.rotation.y += dt * 2.4;

      am.groundMat.uniforms.uTime.value = elapsed;
      am.groundMat.uniforms.uIntensity.value = 1.28 * fadeFrac;
      am.groundMat.uniforms.uShaderQuality.value = this.shaderQualityFactor;
      am.haloMat.uniforms.uTime.value = elapsed + 1.4;
      am.haloMat.uniforms.uIntensity.value = 0.96 * fadeFrac;
      am.haloMat.uniforms.uShaderQuality.value = this.shaderQualityFactor;
      am.rimMat.opacity = 0.32 * fadeFrac;

      if (Math.random() < dt * 10 * particleScale) {
        const ang = Math.random() * Math.PI * 2;
        const rr = Math.random() * curRadius * 0.85;
        this.spawnSpriteBurst(
          am.x + Math.cos(ang) * rr,
          am.y + 0.35,
          am.z + Math.sin(ang) * rr,
          1,
          Math.random() < 0.35 ? 'ASH' : 'EMBER',
          1.2,
          4.2,
          0.62,
          0.72,
          1
        );
      }

      if (am.life <= 0) {
        this.poolManager.release('astra_agni_mandala', am.group);
        this.agniMandalas[i] = this.agniMandalas[this.agniMandalas.length - 1];
        this.agniMandalas.pop();
      }
    }

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
      ww.foamRing.rotation.z += dt * 4.5;
      (ww.dome.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.56 * (1 - p));
      (ww.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.90 * (1 - p));
      (ww.foamRing.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.78 * (1 - p));
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
      tn.windRibbon.rotation.z += dt * 11.0;
      const fade = Math.min(1, tn.life / 0.5);
      (tn.coneOuter.material as THREE.MeshBasicMaterial).opacity = 0.38 * fade;
      (tn.coneInner.material as THREE.MeshBasicMaterial).opacity = 0.48 * fade;
      (tn.windRibbon.material as THREE.MeshBasicMaterial).opacity = 0.52 * fade;
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
      (bm.mesh.material as THREE.MeshBasicMaterial).opacity = 0.78 * alpha;
      (bm.core.material as THREE.MeshBasicMaterial).opacity = 0.98 * alpha;
      (bm.halo.material as THREE.MeshBasicMaterial).opacity = 0.36 * alpha;
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

  public setShaderQuality(level: ShaderComplexityLevel): void {
    const q = level === 'FULL' ? 1.0 : level === 'BALANCED' ? 0.5 : 0.0;
    this.shaderQualityFactor = q;
    this.cycloneUniforms.uShaderQuality.value = q;
    for (let i = 0; i < this.agniMandalas.length; i++) {
      this.agniMandalas[i].groundMat.uniforms.uShaderQuality.value = q;
      this.agniMandalas[i].haloMat.uniforms.uShaderQuality.value = q;
    }
  }

  public getEstimatedVramBytes(): number {
    const list = [
      this.emberTex,
      this.smokeTex,
      this.mistTex,
      this.lotusTex,
      this.craterTex,
    ];
    let bytes = 0;
    for (let i = 0; i < list.length; i++) {
      const img = list[i].image as HTMLCanvasElement | undefined;
      if (img && img.width > 0 && img.height > 0) {
        bytes += img.width * img.height * 4;
      }
    }
    return bytes;
  }

  public reuploadGpuResources(): void {
    this.emberTex.needsUpdate = true;
    this.smokeTex.needsUpdate = true;
    this.mistTex.needsUpdate = true;
    this.lotusTex.needsUpdate = true;
    this.craterTex.needsUpdate = true;
    this.cycloneMat.needsUpdate = true;
    this.objectiveBeamMat.needsUpdate = true;
    this.objectiveRingMat.needsUpdate = true;
    for (let i = 0; i < this.agniMandalas.length; i++) {
      this.agniMandalas[i].groundMat.needsUpdate = true;
      this.agniMandalas[i].haloMat.needsUpdate = true;
      this.agniMandalas[i].rimMat.needsUpdate = true;
    }
    this.handLotusRig.group.traverse((obj) => {
      const m = (obj as THREE.Mesh).material;
      if (Array.isArray(m)) {
        for (const mat of m) mat.needsUpdate = true;
      } else if (m) {
        m.needsUpdate = true;
      }
    });
  }

  public dispose(): void {
    this.emberTex.dispose();
    this.smokeTex.dispose();
    this.mistTex.dispose();
    this.lotusTex.dispose();
    this.craterTex.dispose();
    this.cycloneMat.dispose();
    this.cycloneCanopy.geometry.dispose();
    this.objectiveBeamMat.dispose();
    this.objectiveRingMat.dispose();
    this.objectiveBeamGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        (obj as THREE.Mesh).geometry.dispose();
      }
    });
  }
}
