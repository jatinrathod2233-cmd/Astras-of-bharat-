import * as THREE from 'three';

export interface ProceduralTextures {
  sandstone: THREE.CanvasTexture;
  sandstoneNormal: THREE.CanvasTexture;
  sandstoneRoughness: THREE.CanvasTexture;
  avenueStone: THREE.CanvasTexture;
  avenueNormal: THREE.CanvasTexture;
  avenueRoughness: THREE.CanvasTexture;
  grassEarth: THREE.CanvasTexture;
  grassNormal: THREE.CanvasTexture;
  grassRoughness: THREE.CanvasTexture;
  water: THREE.CanvasTexture;
  waterNormal: THREE.CanvasTexture;
  bark: THREE.CanvasTexture;
  barkNormal: THREE.CanvasTexture;
  foliage: THREE.CanvasTexture;
  foliageNormal: THREE.CanvasTexture;
  silkGold: THREE.CanvasTexture;
  silkNormal: THREE.CanvasTexture;
  silkRoughness: THREE.CanvasTexture;
  armorMetal: THREE.CanvasTexture;
  armorNormal: THREE.CanvasTexture;
  armorRoughness: THREE.CanvasTexture;
  royalSkin: THREE.CanvasTexture;
  royalSkinNormal: THREE.CanvasTexture;
  darkBasalt: THREE.CanvasTexture;
  darkBasaltNormal: THREE.CanvasTexture;
  royalEpigraph: THREE.CanvasTexture;
  royalEpigraphNormal: THREE.CanvasTexture;
  mythologyArt: THREE.CanvasTexture;
  mythologyArtNormal: THREE.CanvasTexture;
  velvetCurtain: THREE.CanvasTexture;
  velvetCurtainNormal: THREE.CanvasTexture;
  redCarpet: THREE.CanvasTexture;
  redCarpetNormal: THREE.CanvasTexture;
  redCarpetRoughness: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

function configureColorTexture(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  anisotropy: number,
  clamp = false
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  tex.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

const _u32Test = new Uint32Array([0x04030201]);
const IS_LITTLE_ENDIAN = new Uint8Array(_u32Test.buffer)[0] === 0x01;

function packRGBA(r: number, g: number, b: number, a: number): number {
  return IS_LITTLE_ENDIAN
    ? ((a << 24) | (b << 16) | (g << 8) | r) >>> 0
    : ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

function clampByte(v: number): number {
  return v <= 0 ? 0 : v >= 255 ? 255 : v | 0;
}

function buildNormalMapFromHeight(
  heightData: Float32Array,
  size: number,
  strength: number,
  repeatX: number,
  repeatY: number,
  anisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const d32 = new Uint32Array(img.data.buffer);
  const mask = size - 1;
  const isPow2 = (size & mask) === 0;

  for (let y = 0; y < size; y++) {
    const yPrev = (isPow2 ? (y - 1) & mask : (y - 1 + size) % size) * size;
    const yCurr = y * size;
    const yNext = (isPow2 ? (y + 1) & mask : (y + 1) % size) * size;

    for (let x = 0; x < size; x++) {
      const xPrev = isPow2 ? (x - 1) & mask : (x - 1 + size) % size;
      const xNext = isPow2 ? (x + 1) & mask : (x + 1) % size;

      const tl = heightData[yPrev + xPrev];
      const t = heightData[yPrev + x];
      const tr = heightData[yPrev + xNext];
      const l = heightData[yCurr + xPrev];
      const r = heightData[yCurr + xNext];
      const bl = heightData[yNext + xPrev];
      const b = heightData[yNext + x];
      const br = heightData[yNext + xNext];

      const dx = tr + 2 * r + br - (tl + 2 * l + bl);
      const dy = bl + 2 * b + br - (tl + 2 * t + tr);

      const nx = -dx * strength;
      const ny = -dy * strength;
      const invLen = 1 / Math.sqrt(nx * nx + ny * ny + 1.0);

      const rb = ((nx * invLen * 0.5 + 0.5) * 255 + 0.5) | 0;
      const gb = ((ny * invLen * 0.5 + 0.5) * 255 + 0.5) | 0;
      const bb = ((invLen * 0.5 + 0.5) * 255 + 0.5) | 0;
      d32[yCurr + x] = packRGBA(
        rb <= 0 ? 0 : rb >= 255 ? 255 : rb,
        gb <= 0 ? 0 : gb >= 255 ? 255 : gb,
        bb <= 0 ? 0 : bb >= 255 ? 255 : bb,
        255
      );
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  // Data maps must stay in linear NoColorSpace; trilinear mipmapping + full anisotropy prevents shimmering & blur
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function buildRoughnessMapFromHeight(
  heightData: Float32Array,
  size: number,
  minRough: number,
  maxRough: number,
  invert: boolean,
  repeatX: number,
  repeatY: number,
  anisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const d32 = new Uint32Array(img.data.buffer);
  const span = maxRough - minRough;
  const total = size * size;
  for (let i = 0; i < total; i++) {
    let h = heightData[i];
    if (h < 0) h = 0;
    else if (h > 1) h = 1;
    const rVal = minRough + (invert ? 1 - h : h) * span;
    const b = clampByte((rVal * 255 + 0.5) | 0);
    d32[i] = packRGBA(b, b, b, 255);
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  // Roughness is a linear data channel (NoColorSpace) with trilinear mipmaps & max anisotropy
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function hash2d(x: number, y: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) * 2.3283064365386963e-10;
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2d(ix, iy);
  const b = hash2d(ix + 1, iy);
  const c = hash2d(ix, iy + 1);
  const d = hash2d(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, octaves = 4): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += amp * smoothNoise(x * freq, y * freq);
    freq *= 2.02;
    amp *= 0.5;
  }
  return val;
}

export function createProceduralTextures(
  renderer: THREE.WebGLRenderer,
  isSoftwareGl = false
): ProceduralTextures {
  // Enforce full hardware-supported anisotropic filtering + 1024px crisp texel density on desktop GPU (512px on constrained mobile/software)
  const maxAniso = Math.max(1, renderer.capabilities.getMaxAnisotropy());
  const maxTexSize = renderer.capabilities.maxTextureSize || 2048;
  const isConstrainedMobile =
    typeof navigator !== 'undefined' &&
    (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || maxTexSize < 4096);
  const S = !isSoftwareGl && maxTexSize >= 2048 && !isConstrainedMobile ? 1024 : 512;
  const K = S / 256;
  const invK = 1 / K;

  // 1. Carved Sandstone + Normal
  const sandCanvas = document.createElement('canvas');
  sandCanvas.width = S;
  sandCanvas.height = S;
  const sctx = sandCanvas.getContext('2d')!;
  const sandImg = sctx.createImageData(S, S);
  const sandD32 = new Uint32Array(sandImg.data.buffer);
  const sandHeight = new Float32Array(S * S);

  for (let y = 0; y < S; y++) {
    const sy = y * invK;
    const row = (sy * 0.03125) | 0;
    const localY = sy - row * 32;
    const xOffset = (row & 1) * 32;
    const rowOff = y * S;
    const mortarY = localY < 2.2;
    for (let x = 0; x < S; x++) {
      const sx = x * invK;
      const shiftedX = (sx + xOffset) % 256;
      const col = (shiftedX * 0.015625) | 0;
      const localX = shiftedX - col * 64;
      const mortar = mortarY || localX < 2.2;
      const grain = fbm(sx * 0.08, sy * 0.08, 4);
      const blockVar = hash2d(row, col) * 0.16 - 0.08;
      const h = mortar ? 0.12 : 0.65 + grain * 0.35 + blockVar;
      sandHeight[rowOff + x] = h;

      const base = mortar ? 105 : 196 + blockVar * 120 + (grain - 0.5) * 40;
      sandD32[rowOff + x] = packRGBA(
        clampByte((base * 1.06 + 0.5) | 0),
        clampByte((base * 0.82 + 0.5) | 0),
        clampByte((base * 0.54 + 0.5) | 0),
        255
      );
    }
  }
  sctx.putImageData(sandImg, 0, 0);
  const sandstone = configureColorTexture(sandCanvas, 2.5, 2.5, maxAniso);
  const sandstoneNormal = buildNormalMapFromHeight(sandHeight, S, 3.0, 2.5, 2.5, maxAniso);
  const sandstoneRoughness = buildRoughnessMapFromHeight(sandHeight, S, 0.72, 1.0, true, 2.5, 2.5, maxAniso);

  // 2. Organic Dressed Sandstone Pathway (Zero rigid grid-tile seams) + Normal
  const aveCanvas = document.createElement('canvas');
  aveCanvas.width = S;
  aveCanvas.height = S;
  const actx = aveCanvas.getContext('2d')!;
  const aveImg = actx.createImageData(S, S);
  const aveD32 = new Uint32Array(aveImg.data.buffer);
  const aveHeight = new Float32Array(S * S);

  for (let y = 0; y < S; y++) {
    const sy = y * invK;
    const borderBand = sy < 10 || sy > 246;
    const rowOff = y * S;
    for (let x = 0; x < S; x++) {
      const sx = x * invK;
      const grain = fbm(sx * 0.06, sy * 0.06, 4);
      const fine = fbm(sx * 0.22 + 7, sy * 0.22 + 3, 2);
      aveHeight[rowOff + x] = 0.55 + grain * 0.3 + fine * 0.12;

      if (borderBand) {
        const bv = 168 + grain * 26;
        aveD32[rowOff + x] = packRGBA(
          clampByte((bv * 1.08 + 0.5) | 0),
          clampByte((bv * 0.86 + 0.5) | 0),
          clampByte((bv * 0.52 + 0.5) | 0),
          255
        );
      } else {
        const v = 128 + (grain - 0.5) * 32 + (fine - 0.5) * 14;
        aveD32[rowOff + x] = packRGBA(
          clampByte((v * 1.12 + 0.5) | 0),
          clampByte((v * 0.96 + 0.5) | 0),
          clampByte((v * 0.74 + 0.5) | 0),
          255
        );
      }
    }
  }
  actx.putImageData(aveImg, 0, 0);
  const avenueStone = configureColorTexture(aveCanvas, 24, 24, maxAniso);
  const avenueNormal = buildNormalMapFromHeight(aveHeight, S, 1.85, 24, 24, maxAniso);
  const avenueRoughness = buildRoughnessMapFromHeight(aveHeight, S, 0.74, 1.0, true, 24, 24, maxAniso);

  // 3. Lush Grass & Earth + Normal
  const grassCanvas = document.createElement('canvas');
  grassCanvas.width = S;
  grassCanvas.height = S;
  const gctx = grassCanvas.getContext('2d')!;
  const grassImg = gctx.createImageData(S, S);
  const grassD32 = new Uint32Array(grassImg.data.buffer);
  const grassHeight = new Float32Array(S * S);

  for (let y = 0; y < S; y++) {
    const sy = y * invK;
    const rowOff = y * S;
    for (let x = 0; x < S; x++) {
      const sx = x * invK;
      const n1 = fbm(sx * 0.06, sy * 0.06, 4);
      const blades = hash2d(x, y) * 0.22;
      grassHeight[rowOff + x] = n1 * 0.75 + blades;
      grassD32[rowOff + x] = packRGBA(
        clampByte((62 + n1 * 48 + blades * 35 + 0.5) | 0),
        clampByte((88 + n1 * 62 + blades * 40 + 0.5) | 0),
        clampByte((42 + n1 * 28 + 0.5) | 0),
        255
      );
    }
  }
  gctx.putImageData(grassImg, 0, 0);
  const grassEarth = configureColorTexture(grassCanvas, 72, 72, maxAniso);
  const grassNormal = buildNormalMapFromHeight(grassHeight, S, 2.2, 72, 72, maxAniso);
  const grassRoughness = buildRoughnessMapFromHeight(grassHeight, S, 0.78, 1.0, true, 72, 72, maxAniso);

  // 4. Sarayu Water + Rippled Normal
  const waterCanvas = document.createElement('canvas');
  waterCanvas.width = S;
  waterCanvas.height = S;
  const wctx = waterCanvas.getContext('2d')!;
  const waterImg = wctx.createImageData(S, S);
  const waterD32 = new Uint32Array(waterImg.data.buffer);
  const waterHeight = new Float32Array(S * S);

  for (let y = 0; y < S; y++) {
    const sy = y * invK;
    const rowOff = y * S;
    for (let x = 0; x < S; x++) {
      const sx = x * invK;
      const w1 = Math.sin(sx * 0.14 + sy * 0.08) * 0.5 + 0.5;
      const w2 = fbm(sx * 0.09, sy * 0.15, 3);
      const h = w1 * 0.45 + w2 * 0.55;
      waterHeight[rowOff + x] = h;
      waterD32[rowOff + x] = packRGBA(
        (28 + h * 36 + 0.5) | 0,
        (98 + h * 58 + 0.5) | 0,
        (122 + h * 64 + 0.5) | 0,
        255
      );
    }
  }
  wctx.putImageData(waterImg, 0, 0);
  const water = configureColorTexture(waterCanvas, 4, 18, maxAniso);
  const waterNormal = buildNormalMapFromHeight(waterHeight, S, 2.5, 4, 18, maxAniso);

  // 5. Tree Bark PBR (Furrowed Banyan/Ashoka Bark) + Normal
  const barkCanvas = document.createElement('canvas');
  barkCanvas.width = S;
  barkCanvas.height = S;
  const bctx = barkCanvas.getContext('2d')!;
  const barkImg = bctx.createImageData(S, S);
  const barkD32 = new Uint32Array(barkImg.data.buffer);
  const barkHeight = new Float32Array(S * S);

  for (let y = 0; y < S; y++) {
    const sy = y * invK;
    const rowOff = y * S;
    for (let x = 0; x < S; x++) {
      const sx = x * invK;
      const ridge = Math.sin(sx * 0.25 + fbm(sx * 0.06, sy * 0.03, 3) * 4.5) * 0.5 + 0.5;
      const fine = fbm(sx * 0.18, sy * 0.07, 4);
      const h = ridge * 0.68 + fine * 0.32;
      barkHeight[rowOff + x] = h;
      const moss = smoothNoise(sx * 0.05 + 10, sy * 0.05) > 0.72 ? 1 : 0;
      barkD32[rowOff + x] = packRGBA(
        clampByte((52 + h * 68 - moss * 14 + 0.5) | 0),
        clampByte((38 + h * 50 + moss * 22 + 0.5) | 0),
        clampByte((25 + h * 30 - moss * 8 + 0.5) | 0),
        255
      );
    }
  }
  bctx.putImageData(barkImg, 0, 0);
  const bark = configureColorTexture(barkCanvas, 2, 3, maxAniso);
  const barkNormal = buildNormalMapFromHeight(barkHeight, S, 3.8, 2, 3, maxAniso);

  // 6. Realistic Layered Foliage Texture (Overlapping Ashoka/Banyan Leaves + Alpha)
  const folCanvas = document.createElement('canvas');
  folCanvas.width = S;
  folCanvas.height = S;
  const fctx = folCanvas.getContext('2d')!;
  fctx.clearRect(0, 0, S, S);
  fctx.save();
  fctx.scale(K, K);

  const folHeight = new Float32Array(S * S);
  for (let i = 0; i < 165; i++) {
    const cx = hash2d(i, 3.1) * 256;
    const cy = hash2d(i, 7.7) * 256;
    const distFromCenter = Math.hypot(cx - 128, cy - 128);
    if (distFromCenter > 256 * 0.43) continue;

    const angle = hash2d(i, 12.3) * Math.PI * 2;
    const len = 18 + hash2d(i, 19.1) * 20;
    const wid = len * 0.42;
    const shade = hash2d(i, 23.9);

    fctx.save();
    fctx.translate(cx, cy);
    fctx.rotate(angle);

    const grad = fctx.createLinearGradient(-len, 0, len, 0);
    if (shade > 0.65) {
      grad.addColorStop(0, '#2a5621');
      grad.addColorStop(0.6, '#4f8a36');
      grad.addColorStop(1, '#7ab84c');
    } else if (shade > 0.3) {
      grad.addColorStop(0, '#1f441a');
      grad.addColorStop(0.65, '#3b712a');
      grad.addColorStop(1, '#5d9b3b');
    } else {
      grad.addColorStop(0, '#173413');
      grad.addColorStop(0.7, '#2d5b22');
      grad.addColorStop(1, '#447c2d');
    }

    fctx.fillStyle = grad;
    fctx.beginPath();
    fctx.moveTo(-len * 0.85, 0);
    fctx.quadraticCurveTo(0, -wid, len * 0.85, 0);
    fctx.quadraticCurveTo(0, wid, -len * 0.85, 0);
    fctx.fill();

    // Central leaf vein
    fctx.strokeStyle = 'rgba(170, 212, 110, 0.45)';
    fctx.lineWidth = 1.1;
    fctx.beginPath();
    fctx.moveTo(-len * 0.72, 0);
    fctx.lineTo(len * 0.72, 0);
    fctx.stroke();

    fctx.restore();
  }
  fctx.restore();
  const fData = fctx.getImageData(0, 0, S, S).data;
  for (let i = 0; i < S * S; i++) {
    folHeight[i] = fData[i * 4 + 3] > 20 ? fData[i * 4 + 1] / 255 : 0;
  }
  const foliage = configureColorTexture(folCanvas, 1, 1, maxAniso, true);
  const foliageNormal = buildNormalMapFromHeight(folHeight, S, 2.0, 1, 1, maxAniso);

  // 7. Heroic Silk Brocade (Saffron Pitambara with Gold Zari Weave)
  const silkCanvas = document.createElement('canvas');
  silkCanvas.width = S;
  silkCanvas.height = S;
  const slCtx = silkCanvas.getContext('2d')!;
  const silkImg = slCtx.createImageData(S, S);
  const silkD32 = new Uint32Array(silkImg.data.buffer);
  const silkHeight = new Float32Array(S * S);

  for (let y = 0; y < S; y++) {
    const sy = y * invK;
    const border = sy > 256 - 28 || sy < 14;
    const cosSy = Math.cos(sy * 1.1);
    const rowOff = y * S;
    for (let x = 0; x < S; x++) {
      const sx = x * invK;
      const weave = (Math.sin(sx * 1.1) * cosSy) * 0.5 + 0.5;
      const fold = Math.sin(sx * 0.12) * 0.5 + 0.5;
      const motif = border && (((sx + sy) | 0) % 16 < 6 || (((sx - sy + 256) | 0) % 16 < 6));
      silkHeight[rowOff + x] = weave * 0.3 + fold * 0.5 + (motif ? 0.25 : 0);

      if (border) {
        silkD32[rowOff + x] = packRGBA(motif ? 248 : 196, motif ? 210 : 142, motif ? 92 : 44, 255);
      } else {
        const lum = 0.85 + fold * 0.22 + weave * 0.08;
        silkD32[rowOff + x] = packRGBA(
          clampByte((226 * lum + 0.5) | 0),
          clampByte((148 * lum + 0.5) | 0),
          clampByte((32 * lum + 0.5) | 0),
          255
        );
      }
    }
  }
  slCtx.putImageData(silkImg, 0, 0);
  const silkGold = configureColorTexture(silkCanvas, 2, 2, maxAniso);
  const silkNormal = buildNormalMapFromHeight(silkHeight, S, 1.9, 2, 2, maxAniso);
  const silkRoughness = buildRoughnessMapFromHeight(silkHeight, S, 0.68, 1.0, true, 2, 2, maxAniso);

  // 8. Hammered Armor & Gold Filigree Texture
  const armCanvas = document.createElement('canvas');
  armCanvas.width = S;
  armCanvas.height = S;
  const arCtx = armCanvas.getContext('2d')!;
  const armImg = arCtx.createImageData(S, S);
  const armD32 = new Uint32Array(armImg.data.buffer);
  const armHeight = new Float32Array(S * S);

  for (let y = 0; y < S; y++) {
    const sy = y * invK;
    const sinSy = Math.sin(sy * 0.35);
    const rowOff = y * S;
    for (let x = 0; x < S; x++) {
      const sx = x * invK;
      const hammer = fbm(sx * 0.16, sy * 0.16, 3);
      const scalePattern = Math.sin(sx * 0.35) * sinSy * 0.35 + 0.5;
      const h = hammer * 0.6 + scalePattern * 0.4;
      armHeight[rowOff + x] = h;
      const v = 138 + h * 72;
      armD32[rowOff + x] = packRGBA(
        clampByte((v * 1.12 + 0.5) | 0),
        clampByte((v * 0.96 + 0.5) | 0),
        clampByte((v * 0.68 + 0.5) | 0),
        255
      );
    }
  }
  arCtx.putImageData(armImg, 0, 0);
  const armorMetal = configureColorTexture(armCanvas, 2, 2, maxAniso);
  const armorNormal = buildNormalMapFromHeight(armHeight, S, 3.0, 2, 2, maxAniso);
  const armorRoughness = buildRoughnessMapFromHeight(armHeight, S, 0.64, 1.0, true, 2, 2, maxAniso);

  // 9. Seamless Silky Shyam Varna Dark-Blue Skin Texture + Smooth Normal Map
  const skinCanvas = document.createElement('canvas');
  skinCanvas.width = S;
  skinCanvas.height = S;
  const skCtx = skinCanvas.getContext('2d')!;
  const skinImg = skCtx.createImageData(S, S);
  const skinD32 = new Uint32Array(skinImg.data.buffer);
  const skinHeight = new Float32Array(S * S);
  const twoPiOverS = (Math.PI * 2) / S;

  for (let y = 0; y < S; y++) {
    const ny = Math.sin(y * twoPiOverS);
    const rowOff = y * S;
    for (let x = 0; x < S; x++) {
      const nx = Math.sin(x * twoPiOverS);
      const micro = 0.5 + 0.25 * Math.sin(nx * 4.0 + ny * 3.0) + 0.15 * Math.cos(nx * 7.0 - ny * 5.0);
      const tone = 0.96 + micro * 0.04;
      skinHeight[rowOff + x] = 0.5 + micro * 0.04;
      skinD32[rowOff + x] = packRGBA(
        clampByte((42 * tone + 0.5) | 0),
        clampByte((78 * tone + 0.5) | 0),
        clampByte((142 * tone + 0.5) | 0),
        255
      );
    }
  }
  skCtx.putImageData(skinImg, 0, 0);
  const royalSkin = configureColorTexture(skinCanvas, 1, 1, maxAniso);
  const royalSkinNormal = buildNormalMapFromHeight(skinHeight, S, 0.28, 1, 1, maxAniso);

  // 10. Carved Polished Black Basalt Stone (for Lord Mahadev Shivling Base & River Boulders)
  const basCanvas = document.createElement('canvas');
  basCanvas.width = S;
  basCanvas.height = S;
  const baCtx = basCanvas.getContext('2d')!;
  const basImg = baCtx.createImageData(S, S);
  const basD32 = new Uint32Array(basImg.data.buffer);
  const basHeight = new Float32Array(S * S);

  for (let y = 0; y < S; y++) {
    const sy = y * invK;
    const rowOff = y * S;
    for (let x = 0; x < S; x++) {
      const sx = x * invK;
      const vein = Math.sin(sx * 0.05 + fbm(sx * 0.04, sy * 0.04, 3) * 5.2) * 0.5 + 0.5;
      const grain = fbm(sx * 0.14, sy * 0.14, 3);
      const h = vein * 0.45 + grain * 0.55;
      basHeight[rowOff + x] = h;
      const v = 26 + h * 34;
      basD32[rowOff + x] = packRGBA(
        (v * 0.96 + 0.5) | 0,
        (v + 0.5) | 0,
        (v * 1.12 + 0.5) | 0,
        255
      );
    }
  }
  baCtx.putImageData(basImg, 0, 0);
  const darkBasalt = configureColorTexture(basCanvas, 2, 2, maxAniso);
  const darkBasaltNormal = buildNormalMapFromHeight(basHeight, S, 1.9, 2, 2, maxAniso);

  // 11. Carved Epigraphic Inscription Tablet (Brahmi/Devanagari Royal Lineage Relief)
  const epiCanvas = document.createElement('canvas');
  epiCanvas.width = S;
  epiCanvas.height = S;
  const ectx = epiCanvas.getContext('2d')!;
  ectx.save();
  ectx.scale(K, K);
  ectx.fillStyle = '#c99c68';
  ectx.fillRect(0, 0, 256, 256);
  // Carved stepped sandstone frame border
  ectx.strokeStyle = '#754924';
  ectx.lineWidth = 10;
  ectx.strokeRect(8, 8, 256 - 16, 256 - 16);
  ectx.strokeStyle = '#ebc068';
  ectx.lineWidth = 3;
  ectx.strokeRect(18, 18, 256 - 36, 256 - 36);
  // Central engraved Suryadev emblem header
  ectx.fillStyle = '#e7b249';
  ectx.beginPath();
  ectx.arc(128, 46, 15, 0, Math.PI * 2);
  ectx.fill();
  ectx.strokeStyle = '#5e3415';
  ectx.lineWidth = 2.2;
  for (let r = 0; r < 12; r++) {
    const a = (r / 12) * Math.PI * 2;
    ectx.beginPath();
    ectx.moveTo(128 + Math.cos(a) * 17, 46 + Math.sin(a) * 17);
    ectx.lineTo(128 + Math.cos(a) * 25, 46 + Math.sin(a) * 25);
    ectx.stroke();
  }
  // 6 rows of deeply incised Sanskrit/Brahmi epigraphic glyphs
  for (let row = 0; row < 6; row++) {
    const ry = 86 + row * 25;
    ectx.strokeStyle = '#4e2c14';
    ectx.lineWidth = 2.4;
    ectx.beginPath();
    ectx.moveTo(32, ry - 7);
    ectx.lineTo(256 - 32, ry - 7);
    ectx.stroke();
    for (let col = 0; col < 11; col++) {
      const gx = 36 + col * 18;
      const glyphSeed = hash2d(row * 13 + col, 4.7);
      ectx.strokeStyle = col % 4 === 0 ? '#9c6821' : '#3d210f';
      ectx.lineWidth = 2.2;
      ectx.beginPath();
      ectx.moveTo(gx, ry - 7);
      ectx.lineTo(gx, ry + 7);
      if (glyphSeed > 0.35) {
        ectx.moveTo(gx - 5, ry - 1);
        ectx.quadraticCurveTo(gx + 3, ry + 8, gx + 7, ry - 2);
      } else {
        ectx.arc(gx + 3, ry + 1, 4.5, 0, Math.PI * 1.5);
      }
      if (glyphSeed > 0.7) {
        ectx.moveTo(gx + 6, ry - 7);
        ectx.lineTo(gx + 6, ry + 8);
      }
      ectx.stroke();
    }
  }
  ectx.restore();
  const epiData = ectx.getImageData(0, 0, S, S).data;
  const epiHeight = new Float32Array(S * S);
  const inv765 = 1 / 765;
  for (let i = 0; i < S * S; i++) {
    const o = i << 2;
    epiHeight[i] = (epiData[o] + epiData[o + 1] + epiData[o + 2]) * inv765;
  }
  const royalEpigraph = configureColorTexture(epiCanvas, 1, 1, maxAniso, true);
  const royalEpigraphNormal = buildNormalMapFromHeight(epiHeight, S, 3.6, 1, 1, maxAniso);

  // 12. Carved Hindu Mythological Pillar Artwork & Normal Relief (Lotus Chakras, Suryadev Rays, Kalasha & Makara Borders)
  const mythCanvas = document.createElement('canvas');
  mythCanvas.width = S;
  mythCanvas.height = S;
  const mctx = mythCanvas.getContext('2d')!;
  mctx.save();
  mctx.scale(K, K);
  mctx.fillStyle = '#cfa06b';
  mctx.fillRect(0, 0, 256, 256);
  // Lapis & terracotta inlaid horizontal frieze bands
  mctx.fillStyle = '#243c64';
  mctx.fillRect(0, 0, 256, 24);
  mctx.fillRect(0, 256 - 24, 256, 24);
  mctx.fillStyle = '#8e2920';
  mctx.fillRect(0, 24, 256, 12);
  mctx.fillRect(0, 256 - 36, 256, 12);
  // Gold leaf scalloped petal arches & carved pillar relief panels
  for (let row = 0; row < 2; row++) {
    const cy = 78 + row * 100;
    for (let col = 0; col < 2; col++) {
      const cx = 64 + col * 128;
      mctx.strokeStyle = '#6c401d';
      mctx.lineWidth = 4;
      mctx.strokeRect(cx - 48, cy - 42, 96, 84);
      mctx.strokeStyle = '#f2c652';
      mctx.lineWidth = 2;
      mctx.strokeRect(cx - 42, cy - 36, 84, 72);
      for (let p = 0; p < 8; p++) {
        const a = (p / 8) * Math.PI * 2;
        mctx.save();
        mctx.translate(cx, cy);
        mctx.rotate(a);
        mctx.fillStyle = p % 2 === 0 ? '#e8b444' : '#b83c24';
        mctx.beginPath();
        mctx.moveTo(0, -8);
        mctx.quadraticCurveTo(10, -20, 0, -32);
        mctx.quadraticCurveTo(-10, -20, 0, -8);
        mctx.fill();
        mctx.restore();
      }
      mctx.fillStyle = '#fbd465';
      mctx.beginPath();
      mctx.arc(cx, cy, 11, 0, Math.PI * 2);
      mctx.fill();
      mctx.strokeStyle = '#733e13';
      mctx.lineWidth = 2;
      mctx.stroke();
    }
  }
  for (let bx = 12; bx < 256; bx += 24) {
    mctx.fillStyle = '#f0be4a';
    mctx.beginPath();
    mctx.arc(bx, 12, 5.5, 0, Math.PI * 2);
    mctx.arc(bx, 256 - 12, 5.5, 0, Math.PI * 2);
    mctx.fill();
  }
  mctx.restore();
  const mythData = mctx.getImageData(0, 0, S, S).data;
  const mythHeight = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const o = i << 2;
    mythHeight[i] = (mythData[o] + mythData[o + 1] + mythData[o + 2]) * inv765;
  }
  const mythologyArt = configureColorTexture(mythCanvas, 2, 2, maxAniso);
  const mythologyArtNormal = buildNormalMapFromHeight(mythHeight, S, 3.4, 2, 2, maxAniso);

  // 13. Pleated Royal Crimson & Gold Brocade Silk Curtain + Normal Map
  const curtCanvas = document.createElement('canvas');
  curtCanvas.width = S;
  curtCanvas.height = S;
  const cctx = curtCanvas.getContext('2d')!;
  const curtImg = cctx.createImageData(S, S);
  const curtD32 = new Uint32Array(curtImg.data.buffer);
  const curtHeight = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    const sy = y * invK;
    const goldHem = sy > 256 - 34 || sy < 20;
    const cosSy = Math.cos(sy * 0.22);
    const rowOff = y * S;
    for (let x = 0; x < S; x++) {
      const sx = x * invK;
      const pleat = Math.sin((x / S) * Math.PI * 12) * 0.5 + 0.5;
      const weave = (((sx + sy) | 0) % 8 < 3 ? 0.08 : 0) + (goldHem ? 0.22 : 0);
      curtHeight[rowOff + x] = pleat * 0.72 + weave;
      const shade = 0.68 + pleat * 0.36;
      if (goldHem) {
        const zari = (sx | 0) % 16 < 7 ? 1.05 : 0.72;
        const f = shade * zari;
        curtD32[rowOff + x] = packRGBA(
          clampByte((240 * f + 0.5) | 0),
          clampByte((188 * f + 0.5) | 0),
          clampByte((62 * f + 0.5) | 0),
          255
        );
      } else {
        const motif = Math.sin(sx * 0.22) * cosSy > 0.72;
        curtD32[rowOff + x] = packRGBA(
          clampByte(((motif ? 215 : 158) * shade + 0.5) | 0),
          clampByte(((motif ? 156 : 24) * shade + 0.5) | 0),
          clampByte(((motif ? 42 : 34) * shade + 0.5) | 0),
          255
        );
      }
    }
  }
  cctx.putImageData(curtImg, 0, 0);
  const velvetCurtain = configureColorTexture(curtCanvas, 1, 1, maxAniso);
  const velvetCurtainNormal = buildNormalMapFromHeight(curtHeight, S, 2.8, 1, 1, maxAniso);

  // 13b. High-Quality Woven Royal Red Carpet + Gold Mandala Relief Normal Map
  const carpCanvas = document.createElement('canvas');
  carpCanvas.width = S;
  carpCanvas.height = S;
  const rpCtx = carpCanvas.getContext('2d')!;
  const carpImg = rpCtx.createImageData(S, S);
  const carpD32 = new Uint32Array(carpImg.data.buffer);
  const carpHeight = new Float32Array(S * S);

  const halfS = S * 0.5;
  const invHalfS = 1 / halfS;
  for (let y = 0; y < S; y++) {
    const sy = y * invK;
    const dy = (y - halfS) * invHalfS;
    const dySq = dy * dy;
    const cosSy = Math.cos(sy * 1.15);
    const edgeY = sy < 14 || sy > 256 - 15;
    const beadYBand = Math.abs(sy - 20) < 2 || Math.abs(sy - (256 - 21)) < 2;
    const deepY = sy < 5 || sy > 256 - 6;
    const rowOff = y * S;
    for (let x = 0; x < S; x++) {
      const sx = x * invK;
      const dx = (x - halfS) * invHalfS;
      const dist = Math.sqrt(dx * dx + dySq);
      const ang = Math.atan2(dy, dx);
      const pile = fbm(sx * 0.22, sy * 0.22, 3);
      const warpWeft = (Math.sin(sx * 1.15) * cosSy) * 0.5 + 0.5;

      const edgeBand = edgeY || sx < 14 || sx > 256 - 15;
      const innerBead =
        (beadYBand || Math.abs(sx - 20) < 2 || Math.abs(sx - (256 - 21)) < 2) &&
        (((sx + sy) | 0) % 8 < 4);
      const lotusPetal =
        dist > 0.16 &&
        dist < 0.44 &&
        Math.abs(Math.sin(ang * 8)) > 0.55 &&
        Math.abs(dist - 0.3) < 0.095;
      const centerBoss = dist < 0.12;
      const outerRing = Math.abs(dist - 0.56) < 0.025 || (Math.abs(dist - 0.66) < 0.03 && Math.sin(ang * 16) > 0.35);
      const isGoldMotif = edgeBand || innerBead || lotusPetal || centerBoss || outerRing;

      carpHeight[rowOff + x] = 0.48 + pile * 0.26 + warpWeft * 0.14 + (isGoldMotif ? 0.24 : 0);

      const fiberLum = 0.84 + pile * 0.22 + warpWeft * 0.09;
      if (isGoldMotif) {
        const deepRim = dist < 0.05 || (edgeBand && (deepY || sx < 5 || sx > 256 - 6));
        const gf = fiberLum * (deepRim ? 0.78 : 1.02);
        carpD32[rowOff + x] = packRGBA(
          clampByte((234 * gf + 0.5) | 0),
          clampByte((176 * gf + 0.5) | 0),
          clampByte((58 * gf + 0.5) | 0),
          255
        );
      } else {
        const diamond = Math.sin((sx + sy) * 0.19) * Math.cos((sx - sy) * 0.19) > 0.72 ? 1.12 : 1.0;
        carpD32[rowOff + x] = packRGBA(
          clampByte((158 * fiberLum * diamond + 0.5) | 0),
          clampByte((18 * fiberLum + 0.5) | 0),
          clampByte((26 * fiberLum + 0.5) | 0),
          255
        );
      }
    }
  }
  rpCtx.putImageData(carpImg, 0, 0);
  const redCarpet = configureColorTexture(carpCanvas, 1, 1, maxAniso);
  const redCarpetNormal = buildNormalMapFromHeight(carpHeight, S, 2.4, 1, 1, maxAniso);
  const redCarpetRoughness = buildRoughnessMapFromHeight(carpHeight, S, 0.66, 1.0, true, 1, 1, maxAniso);

  // 14. Contact Shadow Radial Texture
  const shadCanvas = document.createElement('canvas');
  shadCanvas.width = 256;
  shadCanvas.height = 256;
  const shctx = shadCanvas.getContext('2d')!;
  const grad = shctx.createRadialGradient(128, 128, 16, 128, 128, 120);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.56)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.24)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  shctx.fillStyle = grad;
  shctx.fillRect(0, 0, 256, 256);
  const contactShadow = configureColorTexture(shadCanvas, 1, 1, maxAniso, true);

  const allTex = [
    sandstone,
    sandstoneNormal,
    sandstoneRoughness,
    avenueStone,
    avenueNormal,
    avenueRoughness,
    grassEarth,
    grassNormal,
    grassRoughness,
    water,
    waterNormal,
    bark,
    barkNormal,
    foliage,
    foliageNormal,
    silkGold,
    silkNormal,
    silkRoughness,
    armorMetal,
    armorNormal,
    armorRoughness,
    royalSkin,
    royalSkinNormal,
    darkBasalt,
    darkBasaltNormal,
    royalEpigraph,
    royalEpigraphNormal,
    mythologyArt,
    mythologyArtNormal,
    velvetCurtain,
    velvetCurtainNormal,
    redCarpet,
    redCarpetNormal,
    redCarpetRoughness,
    contactShadow,
  ];

  return {
    sandstone,
    sandstoneNormal,
    sandstoneRoughness,
    avenueStone,
    avenueNormal,
    avenueRoughness,
    grassEarth,
    grassNormal,
    grassRoughness,
    water,
    waterNormal,
    bark,
    barkNormal,
    foliage,
    foliageNormal,
    silkGold,
    silkNormal,
    silkRoughness,
    armorMetal,
    armorNormal,
    armorRoughness,
    royalSkin,
    royalSkinNormal,
    darkBasalt,
    darkBasaltNormal,
    royalEpigraph,
    royalEpigraphNormal,
    mythologyArt,
    mythologyArtNormal,
    velvetCurtain,
    velvetCurtainNormal,
    redCarpet,
    redCarpetNormal,
    redCarpetRoughness,
    contactShadow,
    dispose: () => {
      allTex.forEach((t) => t.dispose());
    },
  };
}
