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
  const d = img.data;

  const sample = (x: number, y: number) => {
    const wx = ((x % size) + size) % size;
    const wy = ((y % size) + size) % size;
    return heightData[wy * size + wx];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = sample(x - 1, y - 1);
      const t = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b = sample(x, y + 1);
      const br = sample(x + 1, y + 1);

      const dx = tr + 2 * r + br - (tl + 2 * l + bl);
      const dy = bl + 2 * b + br - (tl + 2 * t + tr);

      let nx = -dx * strength;
      let ny = -dy * strength;
      let nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const idx = (y * size + x) * 4;
      d[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      d[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      d[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      d[idx + 3] = 255;
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
  const d = img.data;
  const span = maxRough - minRough;
  for (let i = 0; i < size * size; i++) {
    const h = Math.max(0, Math.min(1, heightData[i]));
    const rVal = minRough + (invert ? 1 - h : h) * span;
    const byte = Math.max(0, Math.min(255, Math.round(rVal * 255)));
    const idx = i * 4;
    d[idx] = byte;
    d[idx + 1] = byte;
    d[idx + 2] = byte;
    d[idx + 3] = 255;
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
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
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
  // Enforce full hardware-supported anisotropic filtering + 1024px high-definition texel density on GPU
  const maxAniso = Math.max(1, renderer.capabilities.getMaxAnisotropy());
  const maxTexSize = renderer.capabilities.maxTextureSize || 2048;
  const S = !isSoftwareGl && maxTexSize >= 2048 ? 1024 : 512;
  const K = S / 256;

  // 1. Carved Sandstone + Normal
  const sandCanvas = document.createElement('canvas');
  sandCanvas.width = S;
  sandCanvas.height = S;
  const sctx = sandCanvas.getContext('2d')!;
  const sandImg = sctx.createImageData(S, S);
  const sandHeight = new Float32Array(S * S);

  for (let y = 0; y < S; y++) {
    const sy = y / K;
    const row = Math.floor(sy / 32);
    const localY = sy % 32;
    const xOffset = (row % 2) * 32;
    for (let x = 0; x < S; x++) {
      const sx = x / K;
      const shiftedX = (sx + xOffset) % 256;
      const col = Math.floor(shiftedX / 64);
      const localX = shiftedX % 64;
      const mortar = localY < 2.2 || localX < 2.2;
      const grain = fbm(sx * 0.08, sy * 0.08, 4);
      const blockVar = hash2d(row, col) * 0.16 - 0.08;
      const h = mortar ? 0.12 : 0.65 + grain * 0.35 + blockVar;
      sandHeight[y * S + x] = h;

      const base = mortar ? 105 : 196 + blockVar * 120 + (grain - 0.5) * 40;
      const idx = (y * S + x) * 4;
      sandImg.data[idx] = Math.min(255, Math.max(0, Math.round(base * 1.06)));
      sandImg.data[idx + 1] = Math.min(255, Math.max(0, Math.round(base * 0.82)));
      sandImg.data[idx + 2] = Math.min(255, Math.max(0, Math.round(base * 0.54)));
      sandImg.data[idx + 3] = 255;
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
  const aveHeight = new Float32Array(S * S);

  for (let y = 0; y < S; y++) {
    const sy = y / K;
    const borderBand = sy < 10 || sy > 246;
    for (let x = 0; x < S; x++) {
      const sx = x / K;
      const grain = fbm(sx * 0.06, sy * 0.06, 4);
      const fine = fbm(sx * 0.22 + 7, sy * 0.22 + 3, 2);
      aveHeight[y * S + x] = 0.55 + grain * 0.3 + fine * 0.12;

      const idx = (y * S + x) * 4;
      if (borderBand) {
        const bv = 168 + grain * 26;
        aveImg.data[idx] = Math.round(bv * 1.08);
        aveImg.data[idx + 1] = Math.round(bv * 0.86);
        aveImg.data[idx + 2] = Math.round(bv * 0.52);
      } else {
        const v = 128 + (grain - 0.5) * 32 + (fine - 0.5) * 14;
        aveImg.data[idx] = Math.round(v * 1.12);
        aveImg.data[idx + 1] = Math.round(v * 0.96);
        aveImg.data[idx + 2] = Math.round(v * 0.74);
      }
      aveImg.data[idx + 3] = 255;
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
  const grassHeight = new Float32Array(S * S);

  for (let y = 0; y < S; y++) {
    const sy = y / K;
    for (let x = 0; x < S; x++) {
      const sx = x / K;
      const n1 = fbm(sx * 0.06, sy * 0.06, 4);
      const blades = hash2d(x, y) * 0.22;
      const h = n1 * 0.75 + blades;
      grassHeight[y * S + x] = h;
      const idx = (y * S + x) * 4;
      grassImg.data[idx] = Math.round(62 + n1 * 48 + blades * 35);
      grassImg.data[idx + 1] = Math.round(88 + n1 * 62 + blades * 40);
      grassImg.data[idx + 2] = Math.round(42 + n1 * 28);
      grassImg.data[idx + 3] = 255;
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
  const waterHeight = new Float32Array(S * S);

  for (let y = 0; y < S; y++) {
    const sy = y / K;
    for (let x = 0; x < S; x++) {
      const sx = x / K;
      const w1 = Math.sin(sx * 0.14 + sy * 0.08) * 0.5 + 0.5;
      const w2 = fbm(sx * 0.09, sy * 0.15, 3);
      const h = w1 * 0.45 + w2 * 0.55;
      waterHeight[y * S + x] = h;
      const idx = (y * S + x) * 4;
      waterImg.data[idx] = Math.round(28 + h * 36);
      waterImg.data[idx + 1] = Math.round(98 + h * 58);
      waterImg.data[idx + 2] = Math.round(122 + h * 64);
      waterImg.data[idx + 3] = 255;
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
  const barkHeight = new Float32Array(S * S);

  for (let y = 0; y < S; y++) {
    const sy = y / K;
    for (let x = 0; x < S; x++) {
      const sx = x / K;
      const ridge = Math.sin(sx * 0.25 + fbm(sx * 0.06, sy * 0.03, 3) * 4.5) * 0.5 + 0.5;
      const fine = fbm(sx * 0.18, sy * 0.07, 4);
      const h = ridge * 0.68 + fine * 0.32;
      barkHeight[y * S + x] = h;
      const moss = smoothNoise(sx * 0.05 + 10, sy * 0.05) > 0.72 ? 1 : 0;
      const idx = (y * S + x) * 4;
      barkImg.data[idx] = Math.round(52 + h * 68 - moss * 14);
      barkImg.data[idx + 1] = Math.round(38 + h * 50 + moss * 22);
      barkImg.data[idx + 2] = Math.round(25 + h * 30 - moss * 8);
      barkImg.data[idx + 3] = 255;
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
  const silkHeight = new Float32Array(S * S);

  for (let y = 0; y < S; y++) {
    const sy = y / K;
    const border = sy > 256 - 28 || sy < 14;
    for (let x = 0; x < S; x++) {
      const sx = x / K;
      const weave = (Math.sin(sx * 1.1) * Math.cos(sy * 1.1)) * 0.5 + 0.5;
      const fold = Math.sin(sx * 0.12) * 0.5 + 0.5;
      const motif = border && (Math.floor(sx + sy) % 16 < 6 || Math.floor(sx - sy + 256) % 16 < 6);
      silkHeight[y * S + x] = weave * 0.3 + fold * 0.5 + (motif ? 0.25 : 0);

      const idx = (y * S + x) * 4;
      if (border) {
        silkImg.data[idx] = motif ? 248 : 196;
        silkImg.data[idx + 1] = motif ? 210 : 142;
        silkImg.data[idx + 2] = motif ? 92 : 44;
      } else {
        const lum = 0.85 + fold * 0.22 + weave * 0.08;
        silkImg.data[idx] = Math.min(255, Math.round(226 * lum));
        silkImg.data[idx + 1] = Math.min(255, Math.round(148 * lum));
        silkImg.data[idx + 2] = Math.min(255, Math.round(32 * lum));
      }
      silkImg.data[idx + 3] = 255;
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
  const armHeight = new Float32Array(S * S);

  for (let y = 0; y < S; y++) {
    const sy = y / K;
    for (let x = 0; x < S; x++) {
      const sx = x / K;
      const hammer = fbm(sx * 0.16, sy * 0.16, 3);
      const scalePattern = Math.sin(sx * 0.35) * Math.sin(sy * 0.35) * 0.35 + 0.5;
      const h = hammer * 0.6 + scalePattern * 0.4;
      armHeight[y * S + x] = h;
      const idx = (y * S + x) * 4;
      const v = 138 + h * 72;
      armImg.data[idx] = Math.min(255, Math.round(v * 1.12));
      armImg.data[idx + 1] = Math.min(255, Math.round(v * 0.96));
      armImg.data[idx + 2] = Math.min(255, Math.round(v * 0.68));
      armImg.data[idx + 3] = 255;
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
  const skinHeight = new Float32Array(S * S);

  for (let y = 0; y < S; y++) {
    const vNorm = y / S;
    const ny = Math.sin(vNorm * Math.PI * 2);
    for (let x = 0; x < S; x++) {
      const uNorm = x / S;
      const nx = Math.sin(uNorm * Math.PI * 2);
      const micro = 0.5 + 0.25 * Math.sin(nx * 4.0 + ny * 3.0) + 0.15 * Math.cos(nx * 7.0 - ny * 5.0);
      const tone = 0.96 + micro * 0.04;
      skinHeight[y * S + x] = 0.5 + micro * 0.04;
      const idx = (y * S + x) * 4;
      skinImg.data[idx] = Math.min(255, Math.round(42 * tone));
      skinImg.data[idx + 1] = Math.min(255, Math.round(78 * tone));
      skinImg.data[idx + 2] = Math.min(255, Math.round(142 * tone));
      skinImg.data[idx + 3] = 255;
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
  const basHeight = new Float32Array(S * S);

  for (let y = 0; y < S; y++) {
    const sy = y / K;
    for (let x = 0; x < S; x++) {
      const sx = x / K;
      const vein = Math.sin(sx * 0.05 + fbm(sx * 0.04, sy * 0.04, 3) * 5.2) * 0.5 + 0.5;
      const grain = fbm(sx * 0.14, sy * 0.14, 3);
      const h = vein * 0.45 + grain * 0.55;
      basHeight[y * S + x] = h;
      const idx = (y * S + x) * 4;
      const v = 26 + h * 34;
      basImg.data[idx] = Math.round(v * 0.96);
      basImg.data[idx + 1] = Math.round(v * 1.0);
      basImg.data[idx + 2] = Math.round(v * 1.12);
      basImg.data[idx + 3] = 255;
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
  for (let i = 0; i < S * S; i++) {
    const lum = (epiData[i * 4] + epiData[i * 4 + 1] + epiData[i * 4 + 2]) / (255 * 3);
    epiHeight[i] = lum;
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
    mythHeight[i] = (mythData[i * 4] + mythData[i * 4 + 1] + mythData[i * 4 + 2]) / (255 * 3);
  }
  const mythologyArt = configureColorTexture(mythCanvas, 2, 2, maxAniso);
  const mythologyArtNormal = buildNormalMapFromHeight(mythHeight, S, 3.4, 2, 2, maxAniso);

  // 13. Pleated Royal Crimson & Gold Brocade Silk Curtain + Normal Map
  const curtCanvas = document.createElement('canvas');
  curtCanvas.width = S;
  curtCanvas.height = S;
  const cctx = curtCanvas.getContext('2d')!;
  const curtImg = cctx.createImageData(S, S);
  const curtHeight = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    const sy = y / K;
    const goldHem = sy > 256 - 34 || sy < 20;
    for (let x = 0; x < S; x++) {
      const sx = x / K;
      const pleat = Math.sin((x / S) * Math.PI * 12) * 0.5 + 0.5;
      const weave = ((Math.floor(sx + sy) % 8 < 3 ? 0.08 : 0) + (goldHem ? 0.22 : 0));
      curtHeight[y * S + x] = pleat * 0.72 + weave;
      const idx = (y * S + x) * 4;
      const shade = 0.68 + pleat * 0.36;
      if (goldHem) {
        const zari = Math.floor(sx) % 16 < 7 ? 1.05 : 0.72;
        curtImg.data[idx] = Math.min(255, Math.round(240 * shade * zari));
        curtImg.data[idx + 1] = Math.min(255, Math.round(188 * shade * zari));
        curtImg.data[idx + 2] = Math.min(255, Math.round(62 * shade * zari));
      } else {
        const motif = Math.sin(sx * 0.22) * Math.cos(sy * 0.22) > 0.72;
        curtImg.data[idx] = Math.min(255, Math.round((motif ? 215 : 158) * shade));
        curtImg.data[idx + 1] = Math.min(255, Math.round((motif ? 156 : 24) * shade));
        curtImg.data[idx + 2] = Math.min(255, Math.round((motif ? 42 : 34) * shade));
      }
      curtImg.data[idx + 3] = 255;
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
  const carpHeight = new Float32Array(S * S);

  const halfS = S * 0.5;
  for (let y = 0; y < S; y++) {
    const sy = y / K;
    const dy = (y - halfS) / halfS;
    for (let x = 0; x < S; x++) {
      const sx = x / K;
      const dx = (x - halfS) / halfS;
      const dist = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const pile = fbm(sx * 0.22, sy * 0.22, 3);
      const warpWeft = (Math.sin(sx * 1.15) * Math.cos(sy * 1.15)) * 0.5 + 0.5;

      const edgeBand = sx < 14 || sx > 256 - 15 || sy < 14 || sy > 256 - 15;
      const innerBead =
        (Math.abs(sx - 20) < 2 || Math.abs(sx - (256 - 21)) < 2 || Math.abs(sy - 20) < 2 || Math.abs(sy - (256 - 21)) < 2) &&
        (Math.floor(sx + sy) % 8 < 4);
      const lotusPetal =
        dist > 0.16 &&
        dist < 0.44 &&
        Math.abs(Math.sin(ang * 8)) > 0.55 &&
        Math.abs(dist - 0.3) < 0.095;
      const centerBoss = dist < 0.12;
      const outerRing = Math.abs(dist - 0.56) < 0.025 || (Math.abs(dist - 0.66) < 0.03 && Math.sin(ang * 16) > 0.35);
      const isGoldMotif = edgeBand || innerBead || lotusPetal || centerBoss || outerRing;

      const motifH = isGoldMotif ? 0.24 : 0;
      carpHeight[y * S + x] = 0.48 + pile * 0.26 + warpWeft * 0.14 + motifH;

      const idx = (y * S + x) * 4;
      const fiberLum = 0.84 + pile * 0.22 + warpWeft * 0.09;
      if (isGoldMotif) {
        const deepRim = dist < 0.05 || (edgeBand && (sx < 5 || sx > 256 - 6 || sy < 5 || sy > 256 - 6));
        const gScale = deepRim ? 0.78 : 1.02;
        carpImg.data[idx] = Math.min(255, Math.round(234 * fiberLum * gScale));
        carpImg.data[idx + 1] = Math.min(255, Math.round(176 * fiberLum * gScale));
        carpImg.data[idx + 2] = Math.min(255, Math.round(58 * fiberLum * gScale));
      } else {
        const diamond = Math.sin((sx + sy) * 0.19) * Math.cos((sx - sy) * 0.19) > 0.72 ? 1.12 : 1.0;
        carpImg.data[idx] = Math.min(255, Math.round(158 * fiberLum * diamond));
        carpImg.data[idx + 1] = Math.min(255, Math.round(18 * fiberLum));
        carpImg.data[idx + 2] = Math.min(255, Math.round(26 * fiberLum));
      }
      carpImg.data[idx + 3] = 255;
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
