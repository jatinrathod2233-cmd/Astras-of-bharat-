import * as THREE from 'three';
import { DemonVariant, NpcRole } from '../types/world';
import { ProceduralTextures } from './textures';
import {
  BoxCollider,
  CircleCollider,
  getPalaceStairHole,
  groundHeightAt,
  MountainCaveSpec,
  MountainGardenSpec,
  PALACE_STAIRS,
  PALACE_STORIES,
  RIVER_SURFACE_Y,
} from './worldData';

export interface HairStrandChain {
  segments: THREE.Group[];
  restPitch: number;
  restRoll: number;
  stiffness: number;
  damping: number;
  windPhase: number;
  pitchAngle: number;
  pitchVel: number;
  rollAngle: number;
  rollVel: number;
}

export interface CharacterRig {
  root: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftKnee: THREE.Group;
  rightKnee: THREE.Group;
  leftAnkle: THREE.Group;
  rightAnkle: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftElbow: THREE.Group;
  rightElbow: THREE.Group;
  torso: THREE.Group;
  headGroup?: THREE.Group;
  bowGroup?: THREE.Group;
  backBowGroup?: THREE.Group;
  leftHandAnchor?: THREE.Object3D;
  rightHandAnchor?: THREE.Object3D;
  centerPleat?: THREE.Mesh;
  waistWrap?: THREE.Mesh;
  hairStrands?: HairStrandChain[];
  capePivot?: THREE.Group;
  tailSegments?: THREE.Group[];
  meleeWeaponGroup?: THREE.Group;
  heroAuraMesh?: THREE.Mesh;
  ghostOverlayMat?: THREE.MeshStandardMaterial;
  customParts?: THREE.Group;
  contactShadow: THREE.Mesh;
}

export interface ChariotRig {
  root: THREE.Group;
  leftWheel: THREE.Group;
  rightWheel: THREE.Group;
  horseLegs: THREE.Group[];
  horseKnees: THREE.Group[];
  steeds: RoyalHorseRig[];
  leftReinMesh?: THREE.Mesh;
  rightReinMesh?: THREE.Mesh;
  leftBridleHook?: THREE.Vector3;
  rightBridleHook?: THREE.Vector3;
  leftRailHook?: THREE.Vector3;
  rightRailHook?: THREE.Vector3;
  contactShadow: THREE.Mesh;
}

export interface RoyalHorseRig {
  group: THREE.Group;
  legs: THREE.Group[];
  knees: THREE.Group[];
  headPivot: THREE.Group;
  tailGroup: THREE.Group;
  tailPlumes: THREE.Mesh[];
  tailChains: Array<[THREE.Group, THREE.Group, THREE.Group]>;
  maneChains: Array<[THREE.Group, THREE.Group]>;
  forelockChain: [THREE.Group, THREE.Group];
  ears: THREE.Mesh[];
  leftBitAnchor: THREE.Object3D;
  rightBitAnchor: THREE.Object3D;
  leftReinMesh?: THREE.Mesh;
  rightReinMesh?: THREE.Mesh;
  leftPommelHook?: THREE.Vector3;
  rightPommelHook?: THREE.Vector3;
  seatHeight: number;
}

export interface ElephantRig {
  group: THREE.Group;
  legs: THREE.Group[];
  trunkPivot: THREE.Group;
  earPivots: THREE.Group[];
  seatHeight: number;
}

export interface RoofOccluder {
  obj: THREE.Object3D;
  roofY: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function createContactShadowMesh(
  shadowTex: THREE.Texture,
  radiusX: number,
  radiusZ: number
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(radiusX * 2, radiusZ * 2);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.56,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.012;
  return mesh;
}

function createSculptedHeadMesh(
  skinMat: THREE.Material,
  isFierce: boolean
): THREE.Group {
  const headGroup = new THREE.Group();

  // Lathe-sculpted cranium + lower face
  const profile = isFierce
    ? [
        new THREE.Vector2(0.0, -0.22),
        new THREE.Vector2(0.14, -0.2),
        new THREE.Vector2(0.21, -0.08),
        new THREE.Vector2(0.24, 0.06),
        new THREE.Vector2(0.22, 0.2),
        new THREE.Vector2(0.12, 0.27),
        new THREE.Vector2(0.0, 0.29),
      ]
    : [
        new THREE.Vector2(0.0, -0.155),
        new THREE.Vector2(0.065, -0.145),
        new THREE.Vector2(0.118, -0.065),
        new THREE.Vector2(0.142, 0.025),
        new THREE.Vector2(0.136, 0.115),
        new THREE.Vector2(0.088, 0.172),
        new THREE.Vector2(0.0, 0.188),
      ];
  const headGeo = new THREE.LatheGeometry(profile, 10);
  if (!isFierce) {
    headGeo.scale(0.9, 1.0, 1.08);
  } else {
    headGeo.scale(0.95, 1.0, 1.08);
  }
  const skull = new THREE.Mesh(headGeo, skinMat);
  skull.castShadow = true;
  skull.receiveShadow = true;
  headGroup.add(skull);

  if (!isFierce) {
    // Chiseled Sharp Jawline & Mandible (crisp angular gonions tapering cleanly to sculpted chin)
    const jawShape = new THREE.Shape();
    jawShape.moveTo(-0.098, 0.014);
    jawShape.lineTo(-0.096, -0.064);
    jawShape.lineTo(-0.036, -0.144);
    jawShape.lineTo(0.036, -0.144);
    jawShape.lineTo(0.096, -0.064);
    jawShape.lineTo(0.098, 0.014);
    jawShape.closePath();

    const jawGeo = new THREE.ExtrudeGeometry(jawShape, {
      depth: 0.138,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.008,
      bevelSegments: 2,
    });
    const mandible = new THREE.Mesh(jawGeo, skinMat);
    mandible.position.set(0, -0.018, 0.008);
    mandible.rotation.x = 0.09;
    mandible.castShadow = true;
    mandible.receiveShadow = true;
    headGroup.add(mandible);

    // Sculpted Jaw Ridge Planes & Chin Prominence
    const chin = new THREE.Mesh(
      new THREE.BoxGeometry(0.058, 0.04, 0.056),
      skinMat
    );
    chin.position.set(0, -0.138, 0.134);
    chin.castShadow = true;
    chin.receiveShadow = true;
    headGroup.add(chin);

    // Refined Supraorbital Brow Ridge & Zygomatic Cheekbones
    const browRidge = new THREE.Mesh(
      new THREE.BoxGeometry(0.162, 0.022, 0.048),
      skinMat
    );
    browRidge.position.set(0, 0.052, 0.126);
    browRidge.castShadow = true;
    headGroup.add(browRidge);

    [-1, 1].forEach((side) => {
      const cheek = new THREE.Mesh(
        new THREE.BoxGeometry(0.052, 0.036, 0.056),
        skinMat
      );
      cheek.position.set(side * 0.083, -0.014, 0.116);
      cheek.rotation.y = side * 0.32;
      cheek.rotation.z = -side * 0.2;
      cheek.castShadow = true;
      cheek.receiveShadow = true;
      headGroup.add(cheek);
    });

    // Straight Noble Nasal Bridge + Tip + Nostril Alae
    const noseBridge = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.068, 0.032),
      skinMat
    );
    noseBridge.position.set(0, 0.013, 0.149);
    noseBridge.rotation.x = -0.22;
    noseBridge.castShadow = true;
    headGroup.add(noseBridge);

    const noseTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.017, 6, 5),
      skinMat
    );
    noseTip.scale.set(0.92, 0.8, 1.15);
    noseTip.position.set(0, -0.022, 0.161);
    noseTip.castShadow = true;
    headGroup.add(noseTip);

    [-1, 1].forEach((side) => {
      const nostril = new THREE.Mesh(
        new THREE.SphereGeometry(0.01, 5, 4),
        skinMat
      );
      nostril.position.set(side * 0.013, -0.028, 0.15);
      headGroup.add(nostril);
    });
  } else {
    // Fierce Rakshasa Nose
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.052, 0.11, 6),
      skinMat
    );
    nose.rotation.x = Math.PI * 0.34;
    nose.position.set(0, -0.008, 0.23);
    headGroup.add(nose);
  }

  // Sculpted Outer Ears
  [-1, 1].forEach((side) => {
    const ear = new THREE.Mesh(
      new THREE.BoxGeometry(
        isFierce ? 0.048 : 0.028,
        isFierce ? 0.14 : 0.075,
        isFierce ? 0.072 : 0.046
      ),
      skinMat
    );
    ear.position.set(side * (isFierce ? 0.202 : 0.134), 0.004, -0.01);
    ear.rotation.y = side * 0.22;
    if (isFierce) ear.rotation.z = -side * 0.35;
    headGroup.add(ear);
  });

  return headGroup;
}

function createSculptedTorsoGeometry(broadness: number): THREE.LatheGeometry {
  // Athletic V-tapered ribcage, tight waist, and heroic upper chest
  const pts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.175, 0.02),
    new THREE.Vector2(0.162, 0.16), // athletic waist
    new THREE.Vector2(0.215 * broadness, 0.35), // serratus / lower ribs
    new THREE.Vector2(0.275 * broadness, 0.54), // broad lats / chest
    new THREE.Vector2(0.215 * broadness, 0.65), // trapezius slope
    new THREE.Vector2(0.095, 0.69), // base of neck
    new THREE.Vector2(0.0, 0.69),
  ];
  const geo = new THREE.LatheGeometry(pts, 10);
  geo.scale(1.16, 1.0, 0.74);
  return geo;
}

function createDetailedHand(
  isLeft: boolean,
  skinMat: THREE.Material
): THREE.Group {
  const handGroup = new THREE.Group();
  const sideSign = isLeft ? -1 : 1;

  // Sculpted Metacarpal Palm
  const palm = new THREE.Mesh(
    new THREE.BoxGeometry(0.076, 0.088, 0.028),
    skinMat
  );
  palm.position.set(0, -0.042, 0);
  palm.castShadow = true;
  handGroup.add(palm);

  // Opposable Thumb (2 articulated segments on inner/anterior edge)
  const thumbGroup = new THREE.Group();
  thumbGroup.position.set(-sideSign * 0.036, -0.032, 0.014);
  thumbGroup.rotation.z = -sideSign * 0.52;
  thumbGroup.rotation.x = 0.45;
  const thumbProx = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.011, 0.024, 2, 5),
    skinMat
  );
  thumbProx.position.y = -0.018;
  thumbGroup.add(thumbProx);
  const thumbDist = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.0095, 0.02, 2, 5),
    skinMat
  );
  thumbDist.position.set(0, -0.042, 0.008);
  thumbDist.rotation.x = 0.48;
  thumbGroup.add(thumbDist);
  handGroup.add(thumbGroup);

  // 4 Defined Individual Fingers (Index, Middle, Ring, Pinky)
  const fingerSpecs = [
    { x: -sideSign * 0.027, len1: 0.036, len2: 0.028, r: 0.009 }, // Index
    { x: -sideSign * 0.009, len1: 0.041, len2: 0.031, r: 0.0092 }, // Middle
    { x: sideSign * 0.01, len1: 0.037, len2: 0.028, r: 0.0088 }, // Ring
    { x: sideSign * 0.028, len1: 0.028, len2: 0.022, r: 0.0078 }, // Pinky
  ];
  const baseCurl = isLeft ? 0.78 : 0.42;

  fingerSpecs.forEach((f) => {
    const fPivot = new THREE.Group();
    fPivot.position.set(f.x, -0.084, 0.002);
    fPivot.rotation.x = baseCurl;

    const phalanx1 = new THREE.Mesh(
      new THREE.CapsuleGeometry(f.r, f.len1 * 0.65, 2, 5),
      skinMat
    );
    phalanx1.position.y = -f.len1 * 0.5;
    phalanx1.castShadow = true;
    fPivot.add(phalanx1);

    const phalanx2 = new THREE.Mesh(
      new THREE.CapsuleGeometry(f.r * 0.85, f.len2 * 0.65, 2, 5),
      skinMat
    );
    phalanx2.position.set(0, -f.len1 - f.len2 * 0.38, 0.009);
    phalanx2.rotation.x = baseCurl * 0.85;
    fPivot.add(phalanx2);

    handGroup.add(fPivot);
  });

  return handGroup;
}

function createDetailedFoot(
  isLeft: boolean,
  skinMat: THREE.Material,
  leatherMat: THREE.Material,
  goldMat: THREE.Material
): THREE.Group {
  const footGroup = new THREE.Group();
  const sideSign = isLeft ? -1 : 1;

  // Open Warrior Sandal Sole (keeps forefoot & all 5 toes fully exposed)
  const sole = new THREE.Mesh(
    new THREE.BoxGeometry(0.105, 0.02, 0.255),
    leatherMat
  );
  sole.position.set(0, -0.01, 0.055);
  sole.castShadow = true;
  footGroup.add(sole);

  // Midfoot Instep Strap
  const strap = new THREE.Mesh(
    new THREE.BoxGeometry(0.108, 0.048, 0.042),
    goldMat
  );
  strap.position.set(0, 0.018, 0.025);
  footGroup.add(strap);

  // Sculpted Heel & Arch
  const heel = new THREE.Mesh(
    new THREE.BoxGeometry(0.086, 0.056, 0.095),
    skinMat
  );
  heel.position.set(0, 0.028, -0.015);
  heel.castShadow = true;
  footGroup.add(heel);

  const forefoot = new THREE.Mesh(
    new THREE.BoxGeometry(0.094, 0.042, 0.11),
    skinMat
  );
  forefoot.position.set(0, 0.021, 0.068);
  forefoot.castShadow = true;
  footGroup.add(forefoot);

  // 5 Defined Individual Toes (Hallux Big Toe medially -> Pinky Toe laterally)
  const toeSpecs = [
    { offsetMedial: -0.032, z: 0.132, len: 0.042, r: 0.0135 }, // Hallux (big toe)
    { offsetMedial: -0.012, z: 0.134, len: 0.04, r: 0.0102 },  // 2nd toe
    { offsetMedial: 0.007, z: 0.131, len: 0.036, r: 0.0095 },  // 3rd toe
    { offsetMedial: 0.024, z: 0.125, len: 0.031, r: 0.0088 },  // 4th toe
    { offsetMedial: 0.039, z: 0.118, len: 0.024, r: 0.0078 },  // Little toe
  ];

  toeSpecs.forEach((t) => {
    const toe = new THREE.Mesh(
      new THREE.CapsuleGeometry(t.r, t.len * 0.55, 4, 8),
      skinMat
    );
    toe.rotation.x = Math.PI / 2;
    // Medial is +x for left leg (xOffset < 0) and -x for right leg (xOffset > 0)
    toe.position.set(-sideSign * t.offsetMedial, 0.014, t.z);
    toe.castShadow = true;
    footGroup.add(toe);
  });

  return footGroup;
}

function createRamAnatomicalHeadGeometry(
  stacks = 12,
  slices = 12
): THREE.BufferGeometry {
  // Canonical adult cranial-facial head (~0.23m tall, 0.156m wide, 0.196m deep)
  // Vertical range y in [-0.116, +0.116], facial plane faces +Z
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const smoothstep = (edge0: number, edge1: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  };
  const gauss = (d: number, sigma: number) => Math.exp(-(d * d) / (2 * sigma * sigma));

  for (let i = 0; i <= stacks; i++) {
    const v = i / stacks; // 0 = chin/neck base, 1 = cranial crown
    const phi = v * Math.PI; // 0 (bottom) .. PI (top)
    const yNorm = -Math.cos(phi); // -1 (chin bottom) .. +1 (skull apex)
    const ringSin = Math.sin(phi);

    // Base cranial-facial elliptical widths at this height
    let rx = 0.077 * ringSin;
    let rz = 0.097 * ringSin;

    // Upper cranium fullness & smooth parietal temple taper
    const craniumWeight = smoothstep(-0.05, 0.65, yNorm);
    const faceLowerWeight = smoothstep(0.05, -0.78, yNorm);
    rx *= 1.0 + 0.04 * craniumWeight - 0.2 * faceLowerWeight;
    rz *= 1.0 + 0.02 * craniumWeight - 0.14 * faceLowerWeight;

    // Slight backward shift of cranial center vs lower face
    const zCenterOffset = 0.006 * smoothstep(0.0, -0.7, yNorm) - 0.01 * smoothstep(0.15, 0.85, yNorm);
    const y = yNorm * 0.116;

    for (let j = 0; j <= slices; j++) {
      const u = j / slices;
      // theta = 0 is dead-center front (+Z), +/-PI is back (-Z)
      const theta = (u - 0.5) * Math.PI * 2;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);
      const absT = Math.abs(theta);

      let px = rx * sinT;
      let pz = rz * cosT + zCenterOffset;
      let py = y;

      // Sculpted anterior facial anatomy (theta near 0)
      const frontMask = smoothstep(1.45, 0.35, absT);
      if (frontMask > 0.001) {
        // 1. Noble upright forehead plane & smooth frontal transition (zero shading crease)
        const foreheadPlane = gauss(yNorm - 0.45, 0.25) * gauss(absT, 0.65);
        pz += 0.0038 * foreheadPlane;

        // 2. Smooth Supraorbital Brow Ridge & Glabella
        const browArchY = 0.24 - 0.018 * smoothstep(0.14, 0.54, absT);
        const browRidge = gauss(yNorm - browArchY, 0.095) * gauss(absT, 0.56);
        pz += 0.0046 * browRidge;

        // 3. Recessed eye orbital sockets so prominent eyes sit naturally inside bone
        const eyeCenterTheta = 0.355;
        const eyeDistT = absT - eyeCenterTheta;
        const eyeSocket =
          gauss(yNorm - 0.105, 0.088) *
          gauss(eyeDistT, 0.175) *
          smoothstep(0.06, 0.22, absT);
        pz -= 0.0108 * eyeSocket;

        // 4. Sculpted sharp aquiline nose (bridge, tip, alae, philtrum)
        const noseBridgeMask =
          smoothstep(0.28, -0.18, yNorm) *
          smoothstep(-0.24, -0.05, yNorm) *
          gauss(absT, 0.105);
        const noseProfileHeight = smoothstep(0.26, -0.16, yNorm);
        const noseBridgeProj = (0.0075 + 0.0175 * noseProfileHeight) * noseBridgeMask;
        const noseTipDome = gauss(yNorm + 0.175, 0.055) * gauss(absT, 0.105);
        const noseWingFlare =
          gauss(yNorm + 0.205, 0.045) *
          gauss(absT - 0.125, 0.058) *
          smoothstep(0.02, 0.08, absT);
        pz += noseBridgeProj + 0.0095 * noseTipDome + 0.005 * noseWingFlare;
        py -= 0.0025 * noseTipDome;

        // Subtle philtrum concavity above upper lip
        const philtrum = gauss(yNorm + 0.32, 0.05) * gauss(absT, 0.045);
        pz -= 0.0028 * philtrum;

        // 5. Refined zygomatic cheekbones + hollowing below malar bone
        const cheekBone = gauss(yNorm + 0.075, 0.105) * gauss(absT - 0.56, 0.21);
        const subMalarHollow = gauss(yNorm + 0.3, 0.12) * gauss(absT - 0.52, 0.22);
        pz += 0.0075 * cheekBone - 0.0038 * subMalarHollow;
        px += Math.sign(sinT) * (0.0045 * cheekBone - 0.0028 * subMalarHollow);

        // 6. Calm, subtle mouth muzzle projection & mentalis chin prominence
        const mouthMuzzle = gauss(yNorm + 0.45, 0.13) * gauss(absT, 0.34);
        const chinProminence = gauss(yNorm + 0.72, 0.115) * gauss(absT, 0.24);
        const labiomentalFold = gauss(yNorm + 0.585, 0.045) * gauss(absT, 0.2);
        pz += 0.0068 * mouthMuzzle + 0.0115 * chinProminence - 0.0032 * labiomentalFold;
        py -= 0.004 * chinProminence;
      }

      // 7. Crisp mandibular jawline (gonion corner at |theta| ~ 1.15 tapering to clean sharp chin)
      const jawCorner = gauss(yNorm + 0.46, 0.16) * gauss(absT - 1.14, 0.26);
      px += Math.sign(sinT) * 0.0048 * jawCorner;
      pz += 0.0028 * jawCorner;

      // Clean submental undercut behind jaw bottom
      const underChin = smoothstep(-0.72, -0.96, yNorm) * smoothstep(0.1, 1.3, absT);
      py += 0.006 * underChin;

      // Occipital skull back curve
      const occiput = gauss(yNorm - 0.15, 0.32) * smoothstep(1.9, 2.95, absT);
      pz -= 0.007 * occiput;

      positions.push(px, py, pz);
      uvs.push(u, v);
    }
  }

  const rowLen = slices + 1;
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * rowLen + j;
      const b = a + 1;
      const c = (i + 1) * rowLen + j;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createRamAnatomicalTorsoGeometry(
  stacks = 12,
  slices = 10
): THREE.BufferGeometry {
  // Lean, royal classical archer/prince torso from pelvis crest (y=0.0) to upper neck (y=0.695)
  // Lean proportions: hips ±0.132m, waist ±0.118m, chest ±0.156m, clavicle ±0.164m, neck ±0.049m
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const smoothstep = (e0: number, e1: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const gauss = (d: number, sigma: number) => Math.exp(-(d * d) / (2 * sigma * sigma));

  const profileSamples: Array<[number, number, number, number]> = [
    // [y, rx, rz, zOffset]
    [0.0, 0.0, 0.0, 0.0],
    [0.015, 0.132, 0.095, -0.004], // lower pelvis base
    [0.10, 0.128, 0.09, 0.0], // iliac crest
    [0.19, 0.118, 0.084, 0.003], // slender royal waist
    [0.31, 0.138, 0.095, 0.005], // lower ribcage
    [0.44, 0.156, 0.105, 0.006], // lean chest
    [0.525, 0.163, 0.1, 0.003], // upper chest / acromion line
    [0.565, 0.114, 0.08, -0.002], // graceful shoulder-neck slope
    [0.59, 0.053, 0.055, -0.005], // base of neck
    [0.64, 0.048, 0.051, -0.004], // slender neck
    [0.68, 0.05, 0.053, -0.002], // upper neck junction into skull
    [0.695, 0.0, 0.0, 0.0],
  ];

  const sampleProfile = (y: number) => {
    for (let k = 0; k < profileSamples.length - 1; k++) {
      const a = profileSamples[k];
      const b = profileSamples[k + 1];
      if (y >= a[0] && y <= b[0]) {
        const t = (y - a[0]) / Math.max(0.0001, b[0] - a[0]);
        const s = t * t * (3 - 2 * t);
        return {
          rx: a[1] + (b[1] - a[1]) * s,
          rz: a[2] + (b[2] - a[2]) * s,
          zOff: a[3] + (b[3] - a[3]) * s,
        };
      }
    }
    return { rx: 0, rz: 0, zOff: 0 };
  };

  for (let i = 0; i <= stacks; i++) {
    const v = i / stacks;
    const y = v * 0.695;
    const { rx, rz, zOff } = sampleProfile(y);

    for (let j = 0; j <= slices; j++) {
      const u = j / slices;
      const theta = (u - 0.5) * Math.PI * 2; // 0 = front (+Z), +/-PI = back (-Z)
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);
      const absT = Math.abs(theta);

      let px = rx * sinT;
      let pz = rz * cosT + zOff;
      const py = y;

      if (rx > 0.01) {
        // Defined Royal Warrior Pectoral Contour & Lower Pectoral Shelf
        const pecSide = gauss(absT - 0.44, 0.31) * smoothstep(0.035, 0.13, absT);
        const pecVert = gauss(y - 0.455, 0.056) * smoothstep(0.365, 0.415, y);
        const pecLowerShelf =
          gauss(y - 0.392, 0.018) *
          smoothstep(0.06, 0.16, absT) *
          smoothstep(0.88, 0.62, absT);
        pz += 0.0145 * pecSide * pecVert + 0.0045 * pecLowerShelf;

        // Crisp Sternal Cleft & Suprasternal Notch
        const sternalCleft = gauss(absT, 0.075) * gauss(y - 0.46, 0.062);
        const sternalNotch = gauss(absT, 0.105) * gauss(y - 0.562, 0.021);
        pz -= 0.0062 * sternalCleft + 0.0068 * sternalNotch;

        // Sculpted Clavicle Collarbones
        const clavY = 0.548 - 0.016 * smoothstep(0.14, 0.96, absT);
        const clavicleRidge =
          gauss(y - clavY, 0.013) *
          smoothstep(0.07, 0.24, absT) *
          smoothstep(1.18, 0.86, absT);
        pz += 0.0068 * clavicleRidge;

        // Defined Serratus Anterior Rib Serrations along lateral flanks
        const serratusZone =
          smoothstep(0.72, 0.92, absT) *
          smoothstep(1.42, 1.18, absT) *
          smoothstep(0.24, 0.28, y) *
          smoothstep(0.39, 0.35, y);
        const ribWave = Math.max(0, Math.sin(((y - 0.24) / 0.14) * Math.PI * 3));
        px += Math.sign(sinT) * 0.0038 * serratusZone * ribWave;
        pz += 0.0022 * serratusZone * ribWave;

        // Defined Classical 3-Tier Rectus Abdominis + Crisp Linea Alba
        const abMask =
          smoothstep(0.045, 0.14, absT) *
          smoothstep(0.49, 0.32, absT) *
          smoothstep(0.11, 0.155, y) *
          smoothstep(0.395, 0.34, y);
        const abWave = Math.max(0, Math.sin(((y - 0.13) / 0.24) * Math.PI * 3));
        const lineaAlba =
          gauss(absT, 0.062) * smoothstep(0.095, 0.38, y) * smoothstep(0.42, 0.35, y);
        pz += 0.0058 * abMask * abWave - 0.0046 * lineaAlba;

        // Defined Iliac Crest / Oblique V-Cut Taper
        const obliqueV =
          gauss(y - (0.115 + 0.125 * smoothstep(0.28, 0.95, absT)), 0.036) *
          smoothstep(0.26, 0.62, absT) *
          smoothstep(1.36, 0.95, absT);
        pz += 0.0048 * obliqueV;
        px += Math.sign(sinT) * 0.0036 * obliqueV;

        // Defined Back Anatomy: Trapezius, Scapulae & Spinal Furrow
        const backMask = smoothstep(1.62, 2.32, absT);
        if (backMask > 0.001) {
          const spineDist = Math.abs(Math.PI - absT);
          const spinalFurrow =
            gauss(spineDist, 0.105) * smoothstep(0.08, 0.2, y) * smoothstep(0.62, 0.52, y);
          const erectorRidge =
            gauss(spineDist - 0.25, 0.14) *
            smoothstep(0.06, 0.18, y) *
            smoothstep(0.45, 0.3, y);
          const scapula =
            gauss(spineDist - 0.56, 0.22) *
            gauss(y - 0.455, 0.066);
          pz += 0.0092 * spinalFurrow;
          pz -= (0.0062 * erectorRidge + 0.0078 * scapula) * backMask;
        }

        // Defined Sternocleidomastoid Neck Contours
        const neckMask = smoothstep(0.56, 0.6, y) * smoothstep(0.69, 0.66, y);
        if (neckMask > 0.001) {
          const scmTheta = 0.21 + 0.62 * smoothstep(0.57, 0.67, y);
          const scm = gauss(absT - scmTheta, 0.13) * neckMask;
          pz += 0.0042 * scm;
          px += Math.sign(sinT) * 0.0022 * scm;
        }
      }

      positions.push(px, py, pz);
      uvs.push(u, v);
    }
  }

  const rowLen = slices + 1;
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * rowLen + j;
      const b = a + 1;
      const c = (i + 1) * rowLen + j;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createRamAnatomicalLimbGeometry(
  length: number,
  samples: Array<[number, number, number, number, number]>, // [t 0..1 top->bot, rx, rz, xOff, zOff]
  stacks = 6,
  slices = 7
): THREE.BufferGeometry {
  // Builds a continuous lofted anatomical limb from y=0 (top joint) down to y=-length (distal joint)
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const lerpSample = (t: number) => {
    for (let k = 0; k < samples.length - 1; k++) {
      const a = samples[k];
      const b = samples[k + 1];
      if (t >= a[0] && t <= b[0]) {
        const lt = (t - a[0]) / Math.max(0.0001, b[0] - a[0]);
        const s = lt * lt * (3 - 2 * lt);
        return {
          rx: a[1] + (b[1] - a[1]) * s,
          rz: a[2] + (b[2] - a[2]) * s,
          xOff: a[3] + (b[3] - a[3]) * s,
          zOff: a[4] + (b[4] - a[4]) * s,
        };
      }
    }
    const last = samples[samples.length - 1];
    return { rx: last[1], rz: last[2], xOff: last[3], zOff: last[4] };
  };

  for (let i = 0; i <= stacks; i++) {
    const v = i / stacks;
    const y = -v * length;
    const { rx, rz, xOff, zOff } = lerpSample(v);
    for (let j = 0; j <= slices; j++) {
      const u = j / slices;
      const theta = u * Math.PI * 2;
      const px = xOff + rx * Math.cos(theta);
      const pz = zOff + rz * Math.sin(theta);
      positions.push(px, y, pz);
      uvs.push(u, v);
    }
  }

  const rowLen = slices + 1;
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * rowLen + j;
      const b = a + 1;
      const c = (i + 1) * rowLen + j;
      const d = c + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createRamDetailedHand(
  isLeft: boolean,
  skinMat: THREE.Material
): THREE.Group {
  const handGroup = new THREE.Group();
  const sideSign = isLeft ? -1 : 1;

  // Anatomically proportional metacarpal palm (~6.6cm wide x 8.2cm long x 2.3cm thick)
  const palmGeo = createRamAnatomicalLimbGeometry(
    0.082,
    [
      [0.0, 0.028, 0.013, 0, 0],
      [0.2, 0.032, 0.014, 0, 0],
      [0.65, 0.034, 0.013, 0, 0.002],
      [0.95, 0.032, 0.011, 0, 0.001],
      [1.0, 0.0, 0.0, 0, 0],
    ],
    4,
    6
  );
  const palm = new THREE.Mesh(palmGeo, skinMat);
  palm.castShadow = true;
  handGroup.add(palm);

  // Opposable Thumb (2 articulated phalanges on inner/anterior edge)
  const thumbGroup = new THREE.Group();
  thumbGroup.position.set(-sideSign * 0.029, -0.028, 0.011);
  thumbGroup.rotation.z = -sideSign * 0.5;
  thumbGroup.rotation.x = 0.42;
  const thumbProx = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.0086, 0.021, 5, 8),
    skinMat
  );
  thumbProx.position.y = -0.016;
  thumbGroup.add(thumbProx);
  const thumbDist = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.0074, 0.017, 5, 8),
    skinMat
  );
  thumbDist.position.set(0, -0.037, 0.007);
  thumbDist.rotation.x = 0.45;
  thumbGroup.add(thumbDist);
  handGroup.add(thumbGroup);

  // 4 Refined Tapered Fingers (Index, Middle, Ring, Pinky)
  const fingerSpecs = [
    { x: -sideSign * 0.023, len1: 0.034, len2: 0.026, r: 0.0072 },
    { x: -sideSign * 0.008, len1: 0.039, len2: 0.029, r: 0.0075 },
    { x: sideSign * 0.008, len1: 0.035, len2: 0.026, r: 0.007 },
    { x: sideSign * 0.023, len1: 0.026, len2: 0.02, r: 0.0062 },
  ];
  const baseCurl = isLeft ? 0.76 : 0.36;

  fingerSpecs.forEach((f) => {
    const fPivot = new THREE.Group();
    fPivot.position.set(f.x, -0.079, 0.001);
    fPivot.rotation.x = baseCurl;

    const phalanx1 = new THREE.Mesh(
      new THREE.CapsuleGeometry(f.r, f.len1 * 0.65, 5, 8),
      skinMat
    );
    phalanx1.position.y = -f.len1 * 0.5;
    phalanx1.castShadow = true;
    fPivot.add(phalanx1);

    const phalanx2 = new THREE.Mesh(
      new THREE.CapsuleGeometry(f.r * 0.84, f.len2 * 0.65, 5, 8),
      skinMat
    );
    phalanx2.position.set(0, -f.len1 - f.len2 * 0.36, 0.008);
    phalanx2.rotation.x = baseCurl * 0.82;
    fPivot.add(phalanx2);

    handGroup.add(fPivot);
  });

  return handGroup;
}

function createRamDetailedFoot(
  isLeft: boolean,
  skinMat: THREE.Material,
  leatherMat: THREE.Material,
  goldMat: THREE.Material
): THREE.Group {
  const footGroup = new THREE.Group();
  const sideSign = isLeft ? -1 : 1;

  // Proportional open classical Paduka/sandal sole (0.092m wide x 0.24m long)
  const soleShape = new THREE.Shape();
  soleShape.moveTo(-0.036, -0.055);
  soleShape.quadraticCurveTo(0, -0.072, 0.036, -0.055);
  soleShape.quadraticCurveTo(0.046, 0.04, 0.044, 0.13);
  soleShape.quadraticCurveTo(0.034, 0.175, 0, 0.178);
  soleShape.quadraticCurveTo(-0.034, 0.175, -0.044, 0.13);
  soleShape.quadraticCurveTo(-0.046, 0.04, -0.036, -0.055);

  const soleGeo = new THREE.ExtrudeGeometry(soleShape, {
    depth: 0.015,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 2,
  });
  soleGeo.rotateX(Math.PI / 2);
  const sole = new THREE.Mesh(soleGeo, leatherMat);
  sole.position.set(0, -0.003, 0);
  sole.castShadow = true;
  footGroup.add(sole);

  // Midfoot Instep Gold Strap
  const strap = new THREE.Mesh(
    new THREE.TorusGeometry(0.042, 0.008, 8, 16, Math.PI),
    goldMat
  );
  strap.position.set(0, 0.014, 0.025);
  footGroup.add(strap);

  // Anatomically Contoured Foot Arch & Forefoot
  const heel = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.033, 0.042, 6, 10),
    skinMat
  );
  heel.rotation.x = Math.PI / 2;
  heel.scale.set(0.95, 0.85, 1.0);
  heel.position.set(0, 0.024, -0.012);
  heel.castShadow = true;
  footGroup.add(heel);

  const forefoot = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.038, 0.068, 6, 12),
    skinMat
  );
  forefoot.rotation.x = Math.PI / 2;
  forefoot.scale.set(1.04, 0.62, 1.0);
  forefoot.position.set(0, 0.018, 0.065);
  forefoot.castShadow = true;
  footGroup.add(forefoot);

  // 5 Defined Individual Toes (Hallux medially -> Pinky toe laterally)
  const toeSpecs = [
    { offsetMedial: -0.027, z: 0.125, len: 0.038, r: 0.011 }, // Hallux (big toe)
    { offsetMedial: -0.01, z: 0.127, len: 0.036, r: 0.0085 },
    { offsetMedial: 0.006, z: 0.124, len: 0.032, r: 0.0078 },
    { offsetMedial: 0.02, z: 0.119, len: 0.027, r: 0.0072 },
    { offsetMedial: 0.033, z: 0.112, len: 0.021, r: 0.0065 },
  ];

  toeSpecs.forEach((t) => {
    const toe = new THREE.Mesh(
      new THREE.CapsuleGeometry(t.r, t.len * 0.52, 4, 8),
      skinMat
    );
    toe.rotation.x = Math.PI / 2;
    toe.position.set(-sideSign * t.offsetMedial, 0.012, t.z);
    toe.castShadow = true;
    footGroup.add(toe);
  });

  return footGroup;
}

interface LifelikeSkinOptions {
  colorHex: number;
  sheenHex: number;
  sssRgb: [number, number, number];
  roughness: number;
  normalScale?: number;
  cacheTag: string;
}

function createLifelikeHumanSkinMaterial(
  textures: ProceduralTextures,
  opts: LifelikeSkinOptions
): THREE.MeshPhysicalMaterial {
  const nScale = opts.normalScale ?? 0.14;
  const mat = new THREE.MeshPhysicalMaterial({
    map: textures.humanSkin,
    normalMap: textures.humanSkinNormal,
    normalScale: new THREE.Vector2(nScale, nScale),
    color: opts.colorHex,
    roughness: opts.roughness,
    metalness: 0.0,
    ior: 1.4,
    specularIntensity: 0.4,
    clearcoat: 0.05,
    clearcoatRoughness: 0.56,
    sheen: 0.24,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(opts.sheenHex),
    flatShading: false,
  });
  mat.userData.lifelikeSkin = true;
  mat.userData.preserveNormalMap = true;
  const [sr, sg, sb] = opts.sssRgb;
  mat.customProgramCacheKey = () => `lifelike-human-skin-${opts.cacheTag}-v1`;
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
      vec3 skinViewDir = normalize(vViewPosition);
      vec3 skinN = normalize(vNormal);
      float skinNdotV = max(0.0, dot(skinViewDir, skinN));
      float skinRim = pow(1.0 - skinNdotV, 3.6);
      float skinScatterBand = smoothstep(0.05, 0.72, 1.0 - skinNdotV) * (0.45 + 0.55 * skinRim);
      gl_FragColor.rgb += vec3(${sr.toFixed(3)}, ${sg.toFixed(3)}, ${sb.toFixed(3)}) * skinScatterBand;
      #include <dithering_fragment>
      `
    );
  };
  return mat;
}

export function createLordRamModel(
  textures: ProceduralTextures,
  options?: { highResSkin?: boolean }
): CharacterRig {
  const highResSkin = Boolean(options?.highResSkin);
  const root = new THREE.Group();

  // Grounded realistic PBR Shyam Varna (rich dark-blue) skin with silky sheen & soft sky grazing rim lighting
  const skinMat = new THREE.MeshPhysicalMaterial({
    map: textures.royalSkin,
    normalMap: textures.royalSkinNormal,
    normalScale: new THREE.Vector2(0.16, 0.16),
    color: 0xffffff,
    roughness: 0.44,
    metalness: 0.02,
    clearcoat: 0.08,
    clearcoatRoughness: 0.52,
    sheen: 0.34,
    sheenRoughness: 0.52,
    sheenColor: new THREE.Color(0x6c9cff),
  });
  skinMat.customProgramCacheKey = () => 'lord-ram-skin-v1';
  skinMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
      vec3 rimViewDir = normalize(vViewPosition);
      float rimFactor = pow(1.0 - max(0.0, dot(rimViewDir, normalize(vNormal))), 4.8);
      gl_FragColor.rgb += vec3(0.05, 0.09, 0.16) * rimFactor;
      #include <dithering_fragment>
      `
    );
  };

  const dhotiMat = new THREE.MeshPhysicalMaterial({
    map: textures.silkGold,
    normalMap: textures.silkNormal,
    normalScale: new THREE.Vector2(0.65, 0.65),
    roughnessMap: textures.silkRoughness,
    roughness: 0.72,
    metalness: 0.12,
    ior: 1.48,
    specularIntensity: 0.45,
    sheen: 0.68,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color(0xffe18a),
  });
  const goldMat = new THREE.MeshPhysicalMaterial({
    map: textures.armorMetal,
    normalMap: textures.armorNormal,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughnessMap: textures.armorRoughness,
    metalnessMap: textures.armorMetalness,
    color: 0xe6b84c,
    roughness: 0.32,
    metalness: 0.94,
    ior: 1.62,
    specularIntensity: 1.0,
    anisotropy: 0.65,
    clearcoat: 0.24,
  });
  const leatherMat = new THREE.MeshPhysicalMaterial({
    map: textures.bark,
    normalMap: textures.barkNormal,
    color: 0x5c3822,
    roughness: 0.76,
    metalness: 0.04,
    ior: 1.5,
    specularIntensity: 0.45,
  });
  const rubyMat = new THREE.MeshPhysicalMaterial({
    color: 0xd61c3a,
    emissive: 0x450610,
    emissiveIntensity: 0.25,
    roughness: 0.1,
    metalness: 0.12,
    ior: 1.77,
    specularIntensity: 1.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  });
  const emeraldMat = new THREE.MeshPhysicalMaterial({
    color: 0x1b7a4e,
    roughness: 0.12,
    metalness: 0.12,
    ior: 1.58,
    specularIntensity: 1.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  });
  const hairMat = new THREE.MeshPhysicalMaterial({
    color: 0x11131a,
    roughness: 0.42,
    metalness: 0.08,
    sheen: 0.35,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0x637399),
  });
  const sashMat = new THREE.MeshPhysicalMaterial({
    map: textures.silkGold,
    normalMap: textures.silkNormal,
    roughnessMap: textures.silkRoughness,
    color: 0xb83524,
    roughness: 0.68,
    metalness: 0.08,
    ior: 1.48,
    sheen: 0.6,
    sheenColor: new THREE.Color(0xffaa66),
  });
  const eyeWhiteMat = new THREE.MeshPhysicalMaterial({
    color: 0xf5f2eb,
    roughness: 0.12,
    ior: 1.38,
    clearcoat: 0.95,
  });
  const irisMat = new THREE.MeshPhysicalMaterial({
    color: 0x4b2f19,
    roughness: 0.1,
    ior: 1.4,
    clearcoat: 1.0,
  });
  const limbalMat = new THREE.MeshStandardMaterial({
    color: 0x1c1410,
    roughness: 0.35,
  });
  const pupilMat = new THREE.MeshPhysicalMaterial({
    color: 0x050508,
    roughness: 0.05,
    metalness: 0.0,
    ior: 1.52,
    specularIntensity: 1.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
  });
  const catchlightMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.85,
    roughness: 0.04,
    ior: 1.52,
    clearcoat: 1.0,
  });
  const lipMat = new THREE.MeshPhysicalMaterial({
    color: 0x4b3c60,
    roughness: 0.42,
    sheen: 0.22,
    sheenColor: new THREE.Color(0x7c86b8),
  });
  const cavityDarkMat = new THREE.MeshStandardMaterial({
    color: 0x181c2c,
    roughness: 0.85,
  });
  const tilakWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xf7f3e8,
    emissive: 0xede6d5,
    emissiveIntensity: 0.14,
    roughness: 0.45,
  });
  const pearlMat = new THREE.MeshPhysicalMaterial({
    color: 0xf7f1e1,
    roughness: 0.18,
    metalness: 0.08,
    clearcoat: 0.9,
  });
  const petalWhiteMat = new THREE.MeshPhysicalMaterial({
    color: 0xfbf8ee,
    roughness: 0.46,
    sheen: 0.45,
    sheenColor: new THREE.Color(0xfff4d4),
  });
  const lotusPinkMat = new THREE.MeshPhysicalMaterial({
    color: 0xe6849c,
    roughness: 0.44,
    sheen: 0.5,
    sheenColor: new THREE.Color(0xffc6d6),
  });
  const marigoldMat = new THREE.MeshStandardMaterial({
    color: 0xf09c24,
    roughness: 0.55,
  });
  const leafGreenMat = new THREE.MeshStandardMaterial({
    color: 0x2c6b2f,
    roughness: 0.62,
  });

  const createFlowerRosette = (scale: number, isLotus: boolean) => {
    const fg = new THREE.Group();
    const petalMat = isLotus ? lotusPinkMat : petalWhiteMat;
    const petalCount = isLotus ? 6 : 5;
    for (let p = 0; p < petalCount; p++) {
      const a = (p / petalCount) * Math.PI * 2;
      const petal = new THREE.Mesh(
        new THREE.SphereGeometry(0.011 * scale, 8, 6),
        petalMat
      );
      petal.scale.set(0.82, 0.45, 1.35);
      petal.position.set(
        Math.sin(a) * 0.011 * scale,
        0.002 * scale,
        Math.cos(a) * 0.011 * scale
      );
      petal.rotation.y = a;
      petal.rotation.x = -0.3;
      fg.add(petal);
    }
    const center = new THREE.Mesh(
      new THREE.SphereGeometry(0.006 * scale, 8, 6),
      marigoldMat
    );
    center.position.y = 0.005 * scale;
    fg.add(center);

    [-1, 1].forEach((ls) => {
      const leaf = new THREE.Mesh(
        new THREE.ConeGeometry(0.007 * scale, 0.024 * scale, 5),
        leafGreenMat
      );
      leaf.rotation.z = ls * 1.15;
      leaf.rotation.x = 0.4;
      leaf.position.set(ls * 0.016 * scale, -0.002 * scale, -0.003 * scale);
      fg.add(leaf);
    });
    return fg;
  };

  const contactShadow = createContactShadowMesh(textures.contactShadow, 0.72, 0.72);
  root.add(contactShadow);

  // Lean Royal Legs with True Hierarchical Hip -> Knee -> Ankle Articulation & Socket Caps
  const makeLeg = (xOffset: number, isLeft: boolean) => {
    const legPivot = new THREE.Group();
    legPivot.position.set(xOffset, 0.93, 0);

    // Seamless Hip Joint Socket Ball inside Pelvis/Dhoti (eliminates hip detachment at any angle)
    const hipSocket = new THREE.Mesh(
      new THREE.SphereGeometry(0.086, 16, 12),
      dhotiMat
    );
    hipSocket.scale.set(0.95, 1.0, 1.0);
    hipSocket.castShadow = true;
    legPivot.add(hipSocket);

    // Upper Thigh in Royal Pitambara Dhoti Wrap (0 -> -0.31m)
    const thighDhotiGeo = createRamAnatomicalLimbGeometry(
      0.31,
      [
        [0.0, 0.084, 0.09, 0, 0],
        [0.35, 0.081, 0.087, 0, 0.003],
        [0.85, 0.074, 0.08, 0, 0.002],
        [1.0, 0.0, 0.0, 0, 0],
      ],
      16,
      20
    );
    const upperThigh = new THREE.Mesh(thighDhotiGeo, dhotiMat);
    upperThigh.castShadow = true;
    upperThigh.receiveShadow = true;
    legPivot.add(upperThigh);

    // Exposed Lean Lower Thigh with Defined Quadriceps Contour above Knee
    const lowerThighGeo = createRamAnatomicalLimbGeometry(
      0.185,
      [
        [0.0, 0.064, 0.07, 0, 0.002],
        [0.45, 0.062, 0.068, 0, 0.005], // sculpted rectus femoris
        [0.74, 0.056, 0.061, - (isLeft ? -1 : 1) * 0.003, 0.005], // vastus medialis teardrop
        [0.92, 0.049, 0.054, 0, 0.004],
        [1.0, 0.046, 0.05, 0, 0.002],
      ],
      highResSkin ? 14 : 14,
      highResSkin ? 20 : 20
    );
    const lowerThigh = new THREE.Mesh(lowerThighGeo, skinMat);
    lowerThigh.position.y = -0.27;
    lowerThigh.castShadow = true;
    lowerThigh.receiveShadow = true;
    legPivot.add(lowerThigh);

    // Nested Knee Pivot at exact anatomical hinge center (y = -0.445m)
    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -0.445, 0);
    legPivot.add(kneePivot);

    // Sculpted Spherical Patella Joint Cap centered at knee hinge (prevents cracking/detachment on bend)
    const kneeCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.048, 16, 12),
      skinMat
    );
    kneeCap.scale.set(0.96, 1.04, 1.08);
    kneeCap.position.set(0, 0, 0.003);
    kneeCap.castShadow = true;
    kneeCap.receiveShadow = true;
    kneePivot.add(kneeCap);

    // Sculpted Calf & Tibia attached cleanly inside Knee Cap (+0.015m down to -0.405m)
    const shinGeo = createRamAnatomicalLimbGeometry(
      0.42,
      [
        [0.0, 0.045, 0.049, 0, 0.001], // inside knee joint ball
        [0.14, 0.047, 0.052, 0, -0.003], // proximal shin
        [0.34, 0.055, 0.064, 0, -0.011], // defined gastrocnemius calf peak
        [0.64, 0.04, 0.047, 0, -0.006], // Achilles taper
        [0.9, 0.032, 0.038, 0, -0.002], // above ankle
        [1.0, 0.031, 0.036, 0, 0], // ankle center
      ],
      20,
      22
    );
    const shin = new THREE.Mesh(shinGeo, skinMat);
    shin.position.y = 0.015;
    shin.castShadow = true;
    shin.receiveShadow = true;
    kneePivot.add(shin);

    // Ornate Golden Nupura Anklet with Beaded Rim right above ankle hinge
    const anklet = new THREE.Mesh(
      new THREE.TorusGeometry(0.037, 0.0076, 8, 20),
      goldMat
    );
    anklet.rotation.x = Math.PI / 2;
    anklet.position.y = -0.385;
    kneePivot.add(anklet);
    for (let b = 0; b < 6; b++) {
      const ba = (b / 6) * Math.PI * 2;
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.0052, 6, 6), goldMat);
      bell.position.set(Math.sin(ba) * 0.04, -0.391, Math.cos(ba) * 0.04);
      kneePivot.add(bell);
    }

    // Nested Ankle Pivot (y = -0.405m below knee -> total -0.85m from hip)
    const anklePivot = new THREE.Group();
    anklePivot.position.set(0, -0.405, 0);
    kneePivot.add(anklePivot);

    // Seamless Ankle Malleolus Cap
    const ankleBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 12, 10),
      skinMat
    );
    ankleBall.scale.set(0.95, 1.0, 1.08);
    anklePivot.add(ankleBall);

    // Proportional Foot with Open Sandal & 5 Visible Toes (sole bottom at y = 0.000m flush)
    const foot = createRamDetailedFoot(isLeft, skinMat, leatherMat, goldMat);
    foot.position.set(0, -0.069, 0);
    anklePivot.add(foot);

    return { legPivot, kneePivot, anklePivot };
  };

  const leftLegRig = makeLeg(-0.092, true);
  const rightLegRig = makeLeg(0.092, false);
  const leftLeg = leftLegRig.legPivot;
  const rightLeg = rightLegRig.legPivot;
  const leftKnee = leftLegRig.kneePivot;
  const rightKnee = rightLegRig.kneePivot;
  const leftAnkle = leftLegRig.anklePivot;
  const rightAnkle = rightLegRig.anklePivot;
  root.add(leftLeg, rightLeg);

  // Lean Royal Prince Torso (pelvis pivot y = 0.93m)
  const torso = new THREE.Group();
  torso.position.y = 0.93;
  root.add(torso);

  // Sculpted Royal Pitambara Dhoti Pelvis Wrap & Hinged Folded Center Pleat
  const waistWrap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.132, 0.156, 0.24, 22),
    dhotiMat
  );
  waistWrap.position.y = -0.025;
  waistWrap.scale.set(1.04, 1.0, 0.78);
  waistWrap.castShadow = true;
  waistWrap.receiveShadow = true;
  torso.add(waistWrap);

  const centerPleatGeo = new THREE.CylinderGeometry(0.05, 0.064, 0.46, 10);
  centerPleatGeo.translate(0, -0.22, 0.008);
  const centerPleat = new THREE.Mesh(centerPleatGeo, dhotiMat);
  centerPleat.scale.set(1.12, 1.0, 0.34);
  centerPleat.position.set(0, 0.02, 0.098);
  centerPleat.rotation.x = -0.045;
  centerPleat.castShadow = true;
  torso.add(centerPleat);

  // Ornate Crimson-Gold Kamarbandh Waist Sash, Solar-Lotus Buckle & Draped Mekhala Gold Hip Festoons
  const kamarbandh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.128, 0.136, 0.084, 22),
    sashMat
  );
  kamarbandh.position.y = 0.105;
  kamarbandh.scale.set(1.04, 1.0, 0.78);
  torso.add(kamarbandh);

  const goldBeltRimTop = new THREE.Mesh(
    new THREE.TorusGeometry(0.132, 0.0065, 8, 28),
    goldMat
  );
  goldBeltRimTop.rotation.x = Math.PI / 2;
  goldBeltRimTop.scale.set(1.02, 0.78, 1.0);
  goldBeltRimTop.position.y = 0.145;
  torso.add(goldBeltRimTop);

  const goldBeltRimBot = new THREE.Mesh(
    new THREE.TorusGeometry(0.14, 0.0075, 8, 28),
    goldMat
  );
  goldBeltRimBot.rotation.x = Math.PI / 2;
  goldBeltRimBot.scale.set(1.02, 0.78, 1.0);
  goldBeltRimBot.position.y = 0.068;
  torso.add(goldBeltRimBot);

  const beltBuckle = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.036, 0),
    goldMat
  );
  beltBuckle.position.set(0, 0.105, 0.114);
  beltBuckle.scale.set(1.25, 1.0, 0.45);
  torso.add(beltBuckle);

  const beltRuby = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.016, 0),
    rubyMat
  );
  beltRuby.position.set(0, 0.105, 0.128);
  beltRuby.scale.set(1.0, 1.0, 0.45);
  torso.add(beltRuby);

  // Ornate Draped Golden Hip Swags (Mekhala)
  [-1, 1].forEach((side) => {
    const swagCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.03, 0.08, 0.112),
      new THREE.Vector3(side * 0.115, 0.01, 0.088),
      new THREE.Vector3(side * 0.142, 0.048, -0.02),
      new THREE.Vector3(side * 0.09, 0.062, -0.095),
    ]);
    const swagMesh = new THREE.Mesh(
      new THREE.TubeGeometry(swagCurve, 18, 0.006, 6, false),
      goldMat
    );
    torso.add(swagMesh);

    const sidePendant = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.013, 0),
      emeraldMat
    );
    sidePendant.position.set(side * 0.115, 0.004, 0.088);
    torso.add(sidePendant);
  });

  // Continuous Defined Anatomical Torso & Neck Mesh
  const torsoMesh = new THREE.Mesh(
    highResSkin
      ? createRamAnatomicalTorsoGeometry(20, 22)
      : createRamAnatomicalTorsoGeometry(),
    skinMat
  );
  torsoMesh.position.y = 0.095;
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  torso.add(torsoMesh);

  // Ornate Multi-Layered Royal Haras (Kanthi Choker + Crescent Chandra-Hara + Vaijayanti Garland + Yajnopavita)
  const collar1 = new THREE.Mesh(
    new THREE.TorusGeometry(0.084, 0.012, 8, 26),
    goldMat
  );
  collar1.rotation.x = Math.PI / 2.25;
  collar1.position.set(0, 0.618, 0.021);
  collar1.castShadow = true;
  torso.add(collar1);

  for (let i = -3; i <= 3; i++) {
    const a = i * 0.24;
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(i === 0 ? 0.012 : 0.0075, 8, 8),
      i === 0 ? rubyMat : pearlMat
    );
    bead.position.set(Math.sin(a) * 0.088, 0.606 - Math.abs(i) * 0.002, Math.cos(a) * 0.088 + 0.015);
    torso.add(bead);
  }

  // Sculpted Mid-Chest Crescent Chandra-Hara with 7 Dangling Golden/Ruby Pendants
  const chandraCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.11, 0.59, -0.01),
    new THREE.Vector3(-0.088, 0.535, 0.082),
    new THREE.Vector3(0, 0.502, 0.112),
    new THREE.Vector3(0.088, 0.535, 0.082),
    new THREE.Vector3(0.11, 0.59, -0.01),
  ]);
  const chandraHara = new THREE.Mesh(
    new THREE.TubeGeometry(chandraCurve, 24, 0.0095, 8, false),
    goldMat
  );
  chandraHara.castShadow = true;
  torso.add(chandraHara);

  for (let p = 0; p < 7; p++) {
    const t = 0.22 + (p / 6) * 0.56;
    const pt = chandraCurve.getPoint(t);
    const isCenter = p === 3;
    const drop = new THREE.Mesh(
      new THREE.ConeGeometry(isCenter ? 0.014 : 0.0085, isCenter ? 0.032 : 0.022, 6),
      isCenter ? rubyMat : p % 2 === 0 ? goldMat : emeraldMat
    );
    drop.rotation.x = Math.PI;
    drop.position.set(pt.x, pt.y - 0.014, pt.z + 0.006);
    torso.add(drop);
  }

  // Long Ornate Vaijayanti Royal Chest Garland draping over upper sternum
  const vaijayantiCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.125, 0.595, -0.045),
    new THREE.Vector3(-0.105, 0.48, 0.086),
    new THREE.Vector3(0, 0.422, 0.115),
    new THREE.Vector3(0.105, 0.48, 0.086),
    new THREE.Vector3(0.125, 0.595, -0.045),
  ]);
  const vaijayanti = new THREE.Mesh(
    new THREE.TubeGeometry(vaijayantiCurve, 26, 0.007, 7, false),
    goldMat
  );
  torso.add(vaijayanti);

  const chestMedallion = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.022, 0),
    goldMat
  );
  chestMedallion.scale.set(1.1, 1.15, 0.45);
  chestMedallion.position.set(0, 0.418, 0.118);
  torso.add(chestMedallion);

  const chestEmerald = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.012, 0),
    emeraldMat
  );
  chestEmerald.scale.set(1.0, 1.0, 0.5);
  chestEmerald.position.set(0, 0.418, 0.127);
  torso.add(chestEmerald);

  // Refined Triple-Strand Yajnopavita Sacred Thread hugging actual torso contours + Brahma Granthi Knot
  const yajnopavitaPoints = [
    new THREE.Vector3(-0.074, 0.578, 0.044), // left clavicle top
    new THREE.Vector3(-0.045, 0.515, 0.098), // upper left pec
    new THREE.Vector3(0.015, 0.428, 0.112),  // center sternum
    new THREE.Vector3(0.082, 0.315, 0.094),  // lower right ribcage
    new THREE.Vector3(0.128, 0.215, 0.036),  // right flank
    new THREE.Vector3(0.116, 0.228, -0.056), // right lower back
    new THREE.Vector3(0.042, 0.355, -0.096), // mid spine / erector
    new THREE.Vector3(-0.036, 0.495, -0.094), // left scapula
    new THREE.Vector3(-0.082, 0.584, -0.026), // back of left shoulder
  ];
  const yajnopavitaCurve = new THREE.CatmullRomCurve3(yajnopavitaPoints, true);
  [-0.0032, 0, 0.0032].forEach((strandOffset, sIdx) => {
    const strandPts = yajnopavitaPoints.map(
      (pt) => new THREE.Vector3(pt.x + strandOffset * 0.65, pt.y + strandOffset, pt.z)
    );
    const strandCurve = new THREE.CatmullRomCurve3(strandPts, true);
    const strandMesh = new THREE.Mesh(
      new THREE.TubeGeometry(strandCurve, 44, sIdx === 1 ? 0.0028 : 0.0021, 6, true),
      tilakWhiteMat
    );
    torso.add(strandMesh);
  });

  const granthiPt = yajnopavitaCurve.getPoint(0.08);
  const brahmaGranthi = new THREE.Mesh(
    new THREE.SphereGeometry(0.0068, 8, 8),
    tilakWhiteMat
  );
  brahmaGranthi.scale.set(1.2, 0.9, 0.8);
  brahmaGranthi.position.set(granthiPt.x, granthiPt.y, granthiPt.z + 0.002);
  torso.add(brahmaGranthi);

  // Flowing Angavastram Royal Sash Draped from Left Shoulder with Dynamic Pivot
  const capePivot = new THREE.Group();
  capePivot.position.set(-0.118, 0.605, -0.096);
  const drapeShape = new THREE.Shape();
  drapeShape.moveTo(-0.088, 0.015);
  drapeShape.lineTo(0.096, 0.015);
  drapeShape.quadraticCurveTo(0.135, -0.38, 0.088, -0.84);
  drapeShape.lineTo(-0.115, -0.84);
  drapeShape.quadraticCurveTo(-0.145, -0.4, -0.088, 0.015);
  const drapeGeo = new THREE.ExtrudeGeometry(drapeShape, {
    depth: 0.014,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.005,
    bevelSegments: 2,
  });
  const cape = new THREE.Mesh(drapeGeo, sashMat);
  cape.rotation.x = 0.12;
  cape.rotation.z = -0.1;
  cape.castShadow = true;
  cape.receiveShadow = true;
  capePivot.add(cape);
  torso.add(capePivot);

  // Proportional Leather & Gold Quiver with Feathered Arrows
  const quiverGroup = new THREE.Group();
  quiverGroup.position.set(0.105, 0.44, -0.148);
  quiverGroup.rotation.z = -0.34;
  const quiverTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.032, 0.41, 12),
    leatherMat
  );
  quiverTube.castShadow = true;
  quiverGroup.add(quiverTube);
  const quiverRim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.046, 0.046, 0.034, 12),
    goldMat
  );
  quiverRim.position.y = 0.19;
  quiverGroup.add(quiverRim);
  for (let a = 0; a < 6; a++) {
    const fletch = new THREE.Mesh(
      new THREE.ConeGeometry(0.012, 0.075, 4),
      a % 2 === 0 ? rubyMat : goldMat
    );
    fletch.position.set(((a % 3) - 1) * 0.014, 0.235, (Math.floor(a / 3) - 0.5) * 0.016);
    quiverGroup.add(fletch);
  }
  torso.add(quiverGroup);

  // Regal Anatomically Sculpted Head (head center y = 0.775 -> world 1.705m, skull apex = 1.821m)
  const headGroup = new THREE.Group();
  headGroup.position.y = 0.775;
  torso.add(headGroup);

  const headMesh = new THREE.Mesh(
    highResSkin
      ? createRamAnatomicalHeadGeometry(22, 24)
      : createRamAnatomicalHeadGeometry(),
    skinMat
  );
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  headGroup.add(headMesh);

  // Prominent, Calm Lotus-Shaped Eyes (Kamala-Nayana) Seated Inside Orbital Sockets
  [-1, 1].forEach((side) => {
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(side * 0.0315, 0.013, 0.0805);
    eyeGroup.rotation.y = side * 0.16;

    const sclera = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, 16, 12),
      eyeWhiteMat
    );
    sclera.scale.set(1.12, 0.76, 0.72);
    eyeGroup.add(sclera);

    const iris = new THREE.Mesh(
      new THREE.SphereGeometry(0.0074, 14, 12),
      irisMat
    );
    iris.scale.set(1.0, 1.0, 0.48);
    iris.position.set(0, 0, 0.0086);
    eyeGroup.add(iris);

    // Subtle Limbal Ring framing the Iris
    const limbalRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.0071, 0.0007, 6, 18),
      limbalMat
    );
    limbalRing.position.set(0, 0, 0.0104);
    eyeGroup.add(limbalRing);

    // Distinct Visible Jet-Black Pupil
    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.004, 12, 10),
      pupilMat
    );
    pupil.scale.set(1.0, 1.0, 0.45);
    pupil.position.set(0, 0, 0.0108);
    eyeGroup.add(pupil);

    // Delicate Specular Corneal Catchlight for Lifelike Serene Gaze
    const catchlight = new THREE.Mesh(
      new THREE.SphereGeometry(0.0014, 6, 6),
      catchlightMat
    );
    catchlight.position.set(0.0022, 0.0024, 0.0124);
    eyeGroup.add(catchlight);

    // Gracefully Curved Lotus Upper Eyelid + Subtle Dark Lash Line (TubeGeometry)
    const upperLidCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-side * 0.015, -0.0015, 0.0045),
      new THREE.Vector3(-side * 0.006, 0.0072, 0.0102),
      new THREE.Vector3(side * 0.005, 0.0068, 0.0098),
      new THREE.Vector3(side * 0.0155, -0.0005, 0.0038),
    ]);
    const upperLid = new THREE.Mesh(
      new THREE.TubeGeometry(upperLidCurve, 14, 0.0024, 6, false),
      skinMat
    );
    upperLid.castShadow = false;
    eyeGroup.add(upperLid);

    const upperLash = new THREE.Mesh(
      new THREE.TubeGeometry(upperLidCurve, 14, 0.0012, 5, false),
      hairMat
    );
    upperLash.position.set(0, -0.001, 0.001);
    eyeGroup.add(upperLash);

    // Gentle Lower Eyelid Rim
    const lowerLidCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-side * 0.0145, -0.002, 0.0045),
      new THREE.Vector3(0, -0.0068, 0.0096),
      new THREE.Vector3(side * 0.015, -0.0015, 0.0038),
    ]);
    const lowerLid = new THREE.Mesh(
      new THREE.TubeGeometry(lowerLidCurve, 12, 0.0018, 6, false),
      skinMat
    );
    eyeGroup.add(lowerLid);

    headGroup.add(eyeGroup);

    // Serene Arched Tapered Eyebrow following Supraorbital Bone
    const browCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.012, 0.0305, 0.0885),
      new THREE.Vector3(side * 0.028, 0.036, 0.087),
      new THREE.Vector3(side * 0.045, 0.0345, 0.079),
      new THREE.Vector3(side * 0.058, 0.028, 0.067),
    ]);
    const brow = new THREE.Mesh(
      new THREE.TubeGeometry(browCurve, 14, 0.0028, 6, false),
      hairMat
    );
    headGroup.add(brow);

    // Subtle Shaded Nostril Opening tucked cleanly beneath Nasal Alae
    const nostrilHole = new THREE.Mesh(
      new THREE.SphereGeometry(0.0032, 8, 6),
      cavityDarkMat
    );
    nostrilHole.scale.set(1.0, 0.55, 1.3);
    nostrilHole.position.set(side * 0.0068, -0.025, 0.0985);
    headGroup.add(nostrilHole);

    // Anatomically Carved Auricle Ear + Royal Golden Kundala Earring
    const earShape = new THREE.Shape();
    earShape.moveTo(0, 0.028);
    earShape.quadraticCurveTo(0.017, 0.028, 0.018, 0.005);
    earShape.quadraticCurveTo(0.016, -0.02, 0.006, -0.03);
    earShape.quadraticCurveTo(-0.004, -0.032, -0.004, -0.015);
    earShape.lineTo(-0.004, 0.02);
    earShape.closePath();

    const earGeo = new THREE.ExtrudeGeometry(earShape, {
      depth: 0.009,
      bevelEnabled: true,
      bevelThickness: 0.003,
      bevelSize: 0.0025,
      bevelSegments: 2,
    });
    const ear = new THREE.Mesh(earGeo, skinMat);
    ear.position.set(side * 0.075, -0.004, -0.004);
    ear.rotation.y = side > 0 ? Math.PI * 0.42 : -Math.PI * 0.42;
    if (side < 0) ear.scale.x = -1;
    ear.castShadow = true;
    headGroup.add(ear);

    const earring = new THREE.Mesh(
      new THREE.TorusGeometry(0.016, 0.0044, 8, 18),
      goldMat
    );
    earring.position.set(side * 0.083, -0.038, -0.008);
    earring.rotation.y = Math.PI / 2;
    headGroup.add(earring);

    const earringDrop = new THREE.Mesh(
      new THREE.SphereGeometry(0.0065, 8, 8),
      pearlMat
    );
    earringDrop.position.set(side * 0.083, -0.056, -0.008);
    headGroup.add(earringDrop);

    const earringRuby = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.0055, 0),
      rubyMat
    );
    earringRuby.position.set(side * 0.083, -0.048, -0.008);
    headGroup.add(earringRuby);

    // Temple Side Locks + Delicate Floral Ear Tuck Blossom
    const sideLock = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.007, 0.095, 8),
      hairMat
    );
    sideLock.position.set(side * 0.071, -0.015, -0.034);
    sideLock.rotation.z = side * 0.14;
    headGroup.add(sideLock);

    const templeFlower = createFlowerRosette(0.92, true);
    templeFlower.position.set(side * 0.078, 0.025, -0.022);
    templeFlower.rotation.z = -side * Math.PI * 0.45;
    templeFlower.rotation.x = 0.25;
    headGroup.add(templeFlower);
  });

  // Serene Sculpted Lips (Cupid's Bow Upper Lip + Calm Lower Lip + Soft Smile Seam)
  const upperLipCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.022, -0.049, 0.079),
    new THREE.Vector3(-0.009, -0.0475, 0.089),
    new THREE.Vector3(0, -0.049, 0.091),
    new THREE.Vector3(0.009, -0.0475, 0.089),
    new THREE.Vector3(0.022, -0.049, 0.079),
  ]);
  const upperLip = new THREE.Mesh(
    new THREE.TubeGeometry(upperLipCurve, 16, 0.0034, 6, false),
    lipMat
  );
  headGroup.add(upperLip);

  const lowerLipCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.019, -0.0505, 0.079),
    new THREE.Vector3(-0.008, -0.0565, 0.0875),
    new THREE.Vector3(0, -0.057, 0.0888),
    new THREE.Vector3(0.008, -0.0565, 0.0875),
    new THREE.Vector3(0.019, -0.0505, 0.079),
  ]);
  const lowerLip = new THREE.Mesh(
    new THREE.TubeGeometry(lowerLipCurve, 16, 0.004, 6, false),
    lipMat
  );
  headGroup.add(lowerLip);

  const lipSeamCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.0225, -0.0495, 0.078),
    new THREE.Vector3(0, -0.0525, 0.0892),
    new THREE.Vector3(0.0225, -0.0495, 0.078),
  ]);
  const lipSeam = new THREE.Mesh(
    new THREE.TubeGeometry(lipSeamCurve, 14, 0.001, 5, false),
    cavityDarkMat
  );
  headGroup.add(lipSeam);

  // Clean spotless Shyam Varna forehead with delicate radiant white Vaishnava U-tilak (ZERO dark marks)
  const tilakGroup = new THREE.Group();
  tilakGroup.position.set(0, 0.054, 0.086);

  [-1, 1].forEach((side) => {
    const tilakSideCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.019, 0.001),
      new THREE.Vector3(side * 0.0044, -0.013, 0.001),
      new THREE.Vector3(side * 0.0054, 0.004, -0.002),
      new THREE.Vector3(side * 0.0066, 0.021, -0.007),
    ]);
    const pillar = new THREE.Mesh(
      new THREE.TubeGeometry(tilakSideCurve, 10, 0.0017, 5, false),
      tilakWhiteMat
    );
    pillar.castShadow = false;
    tilakGroup.add(pillar);
  });
  headGroup.add(tilakGroup);

  // Proportional Fitted Hair Cap & 5 Physics-Driven Long Flowing Hair Strands
  // Positioned cleanly behind the forehead hairline so zero Z-fighting or shadow artifacts occur
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.084, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.54),
    hairMat
  );
  hairCap.scale.set(0.92, 1.05, 0.94);
  hairCap.position.set(0, 0.026, -0.024);
  hairCap.castShadow = false;
  hairCap.receiveShadow = true;
  headGroup.add(hairCap);

  const hairStrands: HairStrandChain[] = [];
  const createHairCascade = (
    anchorX: number,
    anchorY: number,
    anchorZ: number,
    segLengths: number[],
    baseRadius: number,
    widthScale: number,
    restPitch: number,
    restRoll: number,
    stiffness: number,
    damping: number,
    windPhase: number
  ) => {
    const segments: THREE.Group[] = [];
    let parentObj: THREE.Object3D = headGroup;

    segLengths.forEach((segLen, idx) => {
      const segPivot = new THREE.Group();
      if (idx === 0) {
        segPivot.position.set(anchorX, anchorY, anchorZ);
        segPivot.rotation.x = restPitch;
        segPivot.rotation.z = restRoll;
      } else {
        segPivot.position.set(0, -segLengths[idx - 1] * 0.9, 0);
      }

      const rTop = baseRadius * (1 - idx * 0.16);
      const rBot =
        idx === segLengths.length - 1
          ? Math.max(0.008, baseRadius * 0.22)
          : baseRadius * (1 - (idx + 1) * 0.16);

      const lockGeo = new THREE.CylinderGeometry(rTop, rBot, segLen, 10);
      lockGeo.translate(0, -segLen * 0.5, 0);
      lockGeo.scale(widthScale, 1.0, 0.52);
      const lockMesh = new THREE.Mesh(lockGeo, hairMat);
      lockMesh.castShadow = true;
      lockMesh.receiveShadow = true;
      segPivot.add(lockMesh);

      parentObj.add(segPivot);
      segments.push(segPivot);
      parentObj = segPivot;
    });

    hairStrands.push({
      segments,
      restPitch,
      restRoll,
      stiffness,
      damping,
      windPhase,
      pitchAngle: restPitch,
      pitchVel: 0,
      rollAngle: restRoll,
      rollVel: 0,
    });
  };

  // Center & Twin Outer Back Cascades + Shoulder Framing Locks sized cleanly to anatomical cranium
  createHairCascade(0, 0.005, -0.088, [0.14, 0.14, 0.13, 0.12], 0.045, 1.55, 0.24, 0, 56, 7.2, 0.0);
  createHairCascade(-0.048, 0.0, -0.078, [0.13, 0.13, 0.12, 0.11], 0.036, 1.35, 0.22, -0.1, 52, 6.8, 1.1);
  createHairCascade(0.048, 0.0, -0.078, [0.13, 0.13, 0.12, 0.11], 0.036, 1.35, 0.22, 0.1, 52, 6.8, 2.2);
  createHairCascade(-0.074, -0.01, -0.045, [0.11, 0.11, 0.1], 0.024, 1.15, 0.16, -0.22, 64, 7.5, 0.6);
  createHairCascade(0.074, -0.01, -0.045, [0.11, 0.11, 0.1], 0.024, 1.15, 0.16, 0.22, 64, 7.5, 1.7);

  // Lush Floral Hair Adornment (Veni Jasmine & Sacred Lotus Garland Wreath)
  const veniArchCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.078, 0.032, -0.025),
    new THREE.Vector3(-0.068, 0.042, -0.075),
    new THREE.Vector3(0, 0.048, -0.098),
    new THREE.Vector3(0.068, 0.042, -0.075),
    new THREE.Vector3(0.078, 0.032, -0.025),
  ]);
  const veniVine = new THREE.Mesh(
    new THREE.TubeGeometry(veniArchCurve, 18, 0.006, 6, false),
    leafGreenMat
  );
  headGroup.add(veniVine);

  for (let f = 0; f < 9; f++) {
    const t = f / 8;
    const pt = veniArchCurve.getPoint(t);
    const isLotus = f === 2 || f === 4 || f === 6;
    const blossom = createFlowerRosette(isLotus ? 1.15 : 0.95, isLotus);
    blossom.position.copy(pt);
    blossom.lookAt(pt.x * 2, pt.y + 0.03, pt.z * 2 - 0.04);
    blossom.rotateX(Math.PI / 2);
    headGroup.add(blossom);
  }

  // Woven Floral Accents on Physics-Simulated Back Hair Cascades
  [0, 1, 2].forEach((strandIdx) => {
    const seg = hairStrands[strandIdx]?.segments[0];
    if (seg) {
      const accentFlower = createFlowerRosette(0.85, strandIdx === 0);
      accentFlower.position.set(0, -0.085, -0.018);
      accentFlower.rotation.x = -Math.PI / 2;
      seg.add(accentFlower);
    }
  });

  // Magnificent Multi-Tiered Golden Kireeta Mukut Crown with Prominent Central Gemstone
  const crownBand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.088, 0.096, 0.066, 8),
    goldMat
  );
  crownBand.scale.set(0.92, 1.0, 1.08);
  crownBand.position.set(0, 0.096, -0.006);
  crownBand.castShadow = false;
  headGroup.add(crownBand);

  const crownPearlRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.092, 0.006, 5, 10),
    pearlMat
  );
  crownPearlRim.rotation.x = Math.PI / 2;
  crownPearlRim.scale.set(0.93, 1.08, 1.0);
  crownPearlRim.position.set(0, 0.068, -0.006);
  headGroup.add(crownPearlRim);

  // Ornate Frontal Arch Crest Framing the Prominent Central Crown Gemstone
  const frontBezelHalo = new THREE.Mesh(
    new THREE.TorusGeometry(0.032, 0.0065, 5, 8),
    goldMat
  );
  frontBezelHalo.position.set(0, 0.11, 0.096);
  headGroup.add(frontBezelHalo);

  const centralCrownGem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.026, 0),
    rubyMat
  );
  centralCrownGem.scale.set(1.0, 1.28, 0.72);
  centralCrownGem.position.set(0, 0.11, 0.102);
  headGroup.add(centralCrownGem);

  const centerProngTip = new THREE.Mesh(
    new THREE.ConeGeometry(0.022, 0.062, 6),
    goldMat
  );
  centerProngTip.position.set(0, 0.162, 0.09);
  headGroup.add(centerProngTip);

  for (let j = 1; j < 8; j++) {
    const a = (j / 8) * Math.PI * 2;
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.011, 0),
      j % 2 === 0 ? rubyMat : emeraldMat
    );
    gem.position.set(Math.sin(a) * 0.086, 0.096, Math.cos(a) * 0.1 - 0.006);
    headGroup.add(gem);

    const petalProng = new THREE.Mesh(
      new THREE.ConeGeometry(0.017, 0.048, 5),
      goldMat
    );
    petalProng.position.set(Math.sin(a) * 0.081, 0.136, Math.cos(a) * 0.092 - 0.006);
    petalProng.rotation.y = a;
    headGroup.add(petalProng);
  }

  const crownTier2 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.084, 0.104, 8),
    goldMat
  );
  crownTier2.scale.set(0.92, 1.0, 1.08);
  crownTier2.position.set(0, 0.172, -0.006);
  crownTier2.castShadow = true;
  headGroup.add(crownTier2);

  const crownMidBand = new THREE.Mesh(
    new THREE.TorusGeometry(0.068, 0.0065, 5, 10),
    goldMat
  );
  crownMidBand.rotation.x = Math.PI / 2;
  crownMidBand.scale.set(0.92, 1.08, 1.0);
  crownMidBand.position.set(0, 0.195, -0.006);
  headGroup.add(crownMidBand);

  const crownTier3 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.058, 0.056, 8),
    goldMat
  );
  crownTier3.scale.set(0.92, 1.0, 1.08);
  crownTier3.position.set(0, 0.244, -0.006);
  headGroup.add(crownTier3);

  const crownFinial = new THREE.Mesh(
    new THREE.ConeGeometry(0.034, 0.132, 7),
    goldMat
  );
  crownFinial.position.set(0, 0.32, -0.006);
  crownFinial.castShadow = true;
  headGroup.add(crownFinial);

  const crownTopJewel = new THREE.Mesh(
    new THREE.SphereGeometry(0.014, 6, 5),
    pearlMat
  );
  crownTopJewel.position.set(0, 0.39, -0.006);
  headGroup.add(crownTopJewel);

  // Lean Royal Proportioned Arms with True Shoulder + Elbow Pivots & Socket Joint Caps
  const makeArm = (xOffset: number, isLeft: boolean) => {
    const armPivot = new THREE.Group();
    armPivot.position.set(xOffset, 0.525, 0);
    const sideSign = isLeft ? -1 : 1;

    // Seamless Shoulder Joint Cap seated inside Torso Socket (prevents shoulder detachment)
    const shoulderBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.043, 14, 12),
      skinMat
    );
    shoulderBall.scale.set(0.96, 1.06, 1.0);
    shoulderBall.position.set(-sideSign * 0.006, -0.006, 0);
    shoulderBall.castShadow = true;
    armPivot.add(shoulderBall);

    // Defined Royal Deltoid -> Bicep/Tricep -> Elbow Geometry (0 -> -0.285m)
    const upperArmGeo = createRamAnatomicalLimbGeometry(
      0.285,
      [
        [0.0, 0.04, 0.044, sideSign * -0.004, 0], // acromion cap
        [0.16, 0.046, 0.05, sideSign * 0.004, 0.001], // sculpted rounded deltoid
        [0.36, 0.039, 0.045, 0, 0.002], // deltoid insertion notch
        [0.6, 0.042, 0.048, 0, 0.003], // defined bicep / tricep peak
        [0.88, 0.034, 0.038, 0, 0], // distal taper
        [1.0, 0.032, 0.034, 0, -0.001], // elbow condyles
      ],
      highResSkin ? 12 : 6,
      highResSkin ? 16 : 7
    );
    const upperArm = new THREE.Mesh(upperArmGeo, skinMat);
    upperArm.castShadow = true;
    upperArm.receiveShadow = true;
    armPivot.add(upperArm);

    // Ornate Golden Keyura Armlet with Flame-Leaf Crest & Ruby Inlay
    const keyura = new THREE.Mesh(
      new THREE.TorusGeometry(0.045, 0.0082, 5, 10),
      goldMat
    );
    keyura.rotation.x = Math.PI / 2;
    keyura.position.y = -0.11;
    armPivot.add(keyura);

    const keyuraCrest = new THREE.Mesh(
      new THREE.ConeGeometry(0.017, 0.038, 5),
      goldMat
    );
    keyuraCrest.position.set(sideSign * 0.046, -0.095, 0.008);
    keyuraCrest.rotation.z = -sideSign * 0.18;
    armPivot.add(keyuraCrest);

    const keyuraGem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.008, 0),
      rubyMat
    );
    keyuraGem.position.set(sideSign * 0.051, -0.11, 0.008);
    armPivot.add(keyuraGem);

    // Nested Elbow Pivot at exact anatomical hinge center (y = -0.278m)
    const elbowPivot = new THREE.Group();
    elbowPivot.position.set(0, -0.278, 0);
    armPivot.add(elbowPivot);

    // Seamless Spherical Elbow Joint Cap (zero detachment on flexion)
    const elbowCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.033, highResSkin ? 12 : 6, highResSkin ? 10 : 5),
      skinMat
    );
    elbowCap.scale.set(0.95, 1.0, 1.02);
    elbowCap.castShadow = true;
    elbowPivot.add(elbowCap);

    // Defined Forearm tapering gracefully to Slender Wrist (+0.01m -> -0.258m)
    const forearmGeo = createRamAnatomicalLimbGeometry(
      0.268,
      [
        [0.0, 0.032, 0.034, 0, 0], // inside elbow ball
        [0.24, 0.038, 0.043, 0, 0.003], // sculpted brachioradialis forearm
        [0.58, 0.03, 0.033, 0, 0.002],
        [0.88, 0.023, 0.026, 0, 0],
        [1.0, 0.022, 0.024, 0, 0], // wrist
      ],
      highResSkin ? 12 : 6,
      highResSkin ? 16 : 7
    );
    const forearm = new THREE.Mesh(forearmGeo, skinMat);
    forearm.position.y = 0.01;
    forearm.castShadow = true;
    forearm.receiveShadow = true;
    elbowPivot.add(forearm);

    // Engraved Dual-Rimmed Golden Kankana Wrist Bracer with Ruby Stud
    const bracer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.029, 0.025, 0.068, 8),
      goldMat
    );
    bracer.position.y = -0.215;
    elbowPivot.add(bracer);

    [-0.184, -0.246].forEach((ry) => {
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.028, 0.0042, 5, 8),
        goldMat
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.y = ry;
      elbowPivot.add(rim);
    });

    const bracerRuby = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.007, 0),
      rubyMat
    );
    bracerRuby.position.set(sideSign * 0.027, -0.215, 0.008);
    elbowPivot.add(bracerRuby);

    // Articulated Proportional 5-Fingered Hand (at y = -0.258m below elbow)
    const hand = createRamDetailedHand(isLeft, skinMat);
    hand.position.y = -0.258;
    elbowPivot.add(hand);

    const handAnchor = new THREE.Object3D();
    handAnchor.position.set(isLeft ? 0.008 : -0.008, -0.282, 0.028);
    elbowPivot.add(handAnchor);

    return { armPivot, elbowPivot, handAnchor };
  };

  const leftArmRig = makeArm(-0.178, true);
  const rightArmRig = makeArm(0.178, false);
  const leftArm = leftArmRig.armPivot;
  const rightArm = rightArmRig.armPivot;
  const leftElbow = leftArmRig.elbowPivot;
  const rightElbow = rightArmRig.elbowPivot;
  const leftHandAnchor = leftArmRig.handAnchor;
  const rightHandAnchor = rightArmRig.handAnchor;
  torso.add(leftArm, rightArm);

  // Proportionately Scaled Sharnga Dhanush Bow Builder (~1.16m span matched to hero body)
  const buildSharngaBow = (includeArrow: boolean): THREE.Group => {
    const bow = new THREE.Group();
    const bowCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.58, -0.15),
      new THREE.Vector3(0, 0.45, -0.04),
      new THREE.Vector3(0, 0.3, 0.11),
      new THREE.Vector3(0, 0.1, 0.15),
      new THREE.Vector3(0, 0, 0.17),
      new THREE.Vector3(0, -0.1, 0.15),
      new THREE.Vector3(0, -0.3, 0.11),
      new THREE.Vector3(0, -0.45, -0.04),
      new THREE.Vector3(0, -0.58, -0.15),
    ]);
    const bowLimb = new THREE.Mesh(
      new THREE.TubeGeometry(bowCurve, 16, 0.015, 6, false),
      goldMat
    );
    bowLimb.castShadow = true;
    bow.add(bowLimb);

    const gripWrap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.15, 12),
      leatherMat
    );
    gripWrap.position.set(0, 0, 0.165);
    bow.add(gripWrap);

    [-0.088, 0.088].forEach((cy) => {
      const collar = new THREE.Mesh(
        new THREE.TorusGeometry(0.021, 0.006, 8, 14),
        goldMat
      );
      collar.rotation.x = Math.PI / 2;
      collar.position.set(0, cy, 0.152);
      bow.add(collar);

      const inlay = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.0085, 0),
        emeraldMat
      );
      inlay.position.set(0, cy * 2.1, 0.142);
      bow.add(inlay);
    });

    [-1, 1].forEach((endSign) => {
      const koti = new THREE.Mesh(
        new THREE.ConeGeometry(0.016, 0.06, 8),
        goldMat
      );
      koti.position.set(0, endSign * 0.59, -0.17);
      koti.rotation.x = endSign * -0.95;
      bow.add(koti);

      const tipGem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.009, 0),
        rubyMat
      );
      tipGem.position.set(0, endSign * 0.605, -0.19);
      bow.add(tipGem);
    });

    const stringGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.58, -0.15),
      new THREE.Vector3(0, 0.01, -0.15),
      new THREE.Vector3(0, -0.58, -0.15),
    ]);
    const bowString = new THREE.Line(
      stringGeo,
      new THREE.LineBasicMaterial({ color: 0xf4e7c8 })
    );
    bow.add(bowString);

    if (includeArrow) {
      const arrowGroup = new THREE.Group();
      arrowGroup.position.set(0.018, 0.022, 0.095);
      const arrowShaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, 0.68, 8),
        goldMat
      );
      arrowShaft.rotation.x = Math.PI / 2;
      arrowShaft.position.z = 0.06;
      arrowShaft.castShadow = true;
      arrowGroup.add(arrowShaft);

      const arrowTip = new THREE.Mesh(
        new THREE.ConeGeometry(0.016, 0.065, 6),
        goldMat
      );
      arrowTip.rotation.x = Math.PI / 2;
      arrowTip.position.z = 0.42;
      arrowGroup.add(arrowTip);

      const headCollar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.009, 0.009, 0.016, 8),
        rubyMat
      );
      headCollar.rotation.x = Math.PI / 2;
      headCollar.position.z = 0.38;
      arrowGroup.add(headCollar);

      for (let v = 0; v < 3; v++) {
        const va = (v / 3) * Math.PI * 2;
        const vane = new THREE.Mesh(
          new THREE.BoxGeometry(0.002, 0.02, 0.09),
          v === 0 ? tilakWhiteMat : sashMat
        );
        vane.position.set(Math.sin(va) * 0.011, Math.cos(va) * 0.011, -0.24);
        vane.rotation.z = -va;
        arrowGroup.add(vane);
      }
      bow.add(arrowGroup);
    }
    return bow;
  };

  // Hand-held Sharnga Dhanush (visible ONLY while drawing/firing an arrow)
  const bowGroup = buildSharngaBow(true);
  bowGroup.position.set(0, -0.292, 0.05);
  bowGroup.visible = false;
  leftElbow.add(bowGroup);

  // Back-slung Sharnga Dhanush (remains slung diagonally across Ram's back beside Quiver otherwise)
  const backBowGroup = buildSharngaBow(false);
  backBowGroup.position.set(-0.02, 0.42, -0.145);
  backBowGroup.rotation.z = 0.56;
  backBowGroup.rotation.y = 0.14;
  backBowGroup.visible = true;
  torso.add(backBowGroup);

  return {
    root,
    leftLeg,
    rightLeg,
    leftKnee,
    rightKnee,
    leftAnkle,
    rightAnkle,
    leftArm,
    rightArm,
    leftElbow,
    rightElbow,
    torso,
    headGroup,
    bowGroup,
    backBowGroup,
    leftHandAnchor,
    rightHandAnchor,
    centerPleat,
    waistWrap,
    hairStrands,
    capePivot,
    contactShadow,
  };
}

export function createRakshasaModel(
  textures: ProceduralTextures,
  isCommander: boolean
): CharacterRig {
  const root = new THREE.Group();
  const scale = isCommander ? 1.44 : 1.12;

  const skinMat = new THREE.MeshPhysicalMaterial({
    normalMap: textures.royalSkinNormal,
    normalScale: new THREE.Vector2(0.24, 0.24),
    color: isCommander ? 0x5d1d26 : 0x3b2c3f,
    roughness: 0.52,
    metalness: 0.1,
    sheen: 0.22,
    sheenColor: new THREE.Color(0x88424c),
  });
  const armorMat = new THREE.MeshPhysicalMaterial({
    map: textures.armorMetal,
    normalMap: textures.armorNormal,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: textures.armorRoughness,
    metalnessMap: textures.armorMetalness,
    color: isCommander ? 0xd09835 : 0x6e6568,
    roughness: 0.30,
    metalness: 0.86,
    ior: 1.6,
  });
  const skirtMat = new THREE.MeshStandardMaterial({
    map: textures.silkGold,
    normalMap: textures.silkNormal,
    color: isCommander ? 0x8f1d1d : 0x452630,
    roughness: 0.72,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xff6224,
    emissive: 0xff3c00,
    emissiveIntensity: 1.6,
    roughness: 0.15,
  });
  const tuskMat = new THREE.MeshStandardMaterial({
    color: 0xf4ead2,
    roughness: 0.3,
  });

  const contactShadow = createContactShadowMesh(
    textures.contactShadow,
    0.92 * scale,
    0.92 * scale
  );
  root.add(contactShadow);

  // Seamless Lofted Articulated Legs (zero joint kinks or detachment)
  const makeLeg = (xOffset: number) => {
    const legPivot = new THREE.Group();
    legPivot.position.set(xOffset, 0.96, 0);

    const hipBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.155, 12, 10),
      skirtMat
    );
    legPivot.add(hipBall);

    const thighGeo = createRamAnatomicalLimbGeometry(
      0.49,
      [
        [0.0, 0.155, 0.155, 0, 0],
        [0.4, 0.158, 0.162, 0, 0.008],
        [0.85, 0.132, 0.136, 0, 0.004],
        [1.0, 0.118, 0.122, 0, 0],
      ],
      14,
      16
    );
    const thigh = new THREE.Mesh(thighGeo, skirtMat);
    thigh.castShadow = true;
    legPivot.add(thigh);

    // Nested Knee Pivot (y = -0.48m)
    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -0.48, 0);
    legPivot.add(kneePivot);

    const kneeBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.125, 12, 10),
      armorMat
    );
    kneePivot.add(kneeBall);

    const shinGeo = createRamAnatomicalLimbGeometry(
      0.42,
      [
        [0.0, 0.118, 0.122, 0, 0],
        [0.32, 0.132, 0.142, 0, -0.012],
        [0.75, 0.105, 0.112, 0, -0.004],
        [1.0, 0.094, 0.098, 0, 0],
      ],
      14,
      16
    );
    const shin = new THREE.Mesh(shinGeo, armorMat);
    shin.position.y = 0.015;
    shin.castShadow = true;
    kneePivot.add(shin);

    // Nested Ankle Pivot (y = -0.40m below knee -> total -0.88m)
    const anklePivot = new THREE.Group();
    anklePivot.position.set(0, -0.4, 0);
    kneePivot.add(anklePivot);

    const ankleBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.096, 10, 8),
      armorMat
    );
    anklePivot.add(ankleBall);

    const boot = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.1, 0.32),
      armorMat
    );
    boot.position.set(0, -0.03, 0.05);
    anklePivot.add(boot);

    return { legPivot, kneePivot, anklePivot };
  };

  const leftLegRig = makeLeg(-0.2);
  const rightLegRig = makeLeg(0.2);
  const leftLeg = leftLegRig.legPivot;
  const rightLeg = rightLegRig.legPivot;
  const leftKnee = leftLegRig.kneePivot;
  const rightKnee = rightLegRig.kneePivot;
  const leftAnkle = leftLegRig.anklePivot;
  const rightAnkle = rightLegRig.anklePivot;
  root.add(leftLeg, rightLeg);

  const torso = new THREE.Group();
  torso.position.y = 0.96;
  root.add(torso);

  const waist = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.36, 0.42, 16),
    skirtMat
  );
  waist.position.y = 0.06;
  torso.add(waist);

  const chest = new THREE.Mesh(createSculptedTorsoGeometry(1.18), armorMat);
  chest.position.y = 0.24;
  chest.castShadow = true;
  torso.add(chest);

  // Sturdy Neck Bridge connecting Chest to Head (zero neck gap)
  const neckBridge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.115, 0.145, 0.22, 14),
    skinMat
  );
  neckBridge.position.y = 0.92;
  torso.add(neckBridge);

  // Spiked Shoulder Pauldrons seated cleanly over Shoulder Sockets
  [-1, 1].forEach((side) => {
    const pauldron = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
      armorMat
    );
    pauldron.position.set(side * 0.35, 0.82, 0);
    pauldron.rotation.z = -side * 0.36;
    pauldron.castShadow = true;
    torso.add(pauldron);

    const spike = new THREE.Mesh(
      new THREE.ConeGeometry(0.052, 0.24, 8),
      armorMat
    );
    spike.position.set(side * 0.44, 0.95, 0);
    spike.rotation.z = -side * 0.52;
    torso.add(spike);
  });

  const beltArmour = new THREE.Mesh(
    new THREE.TorusGeometry(0.29, 0.042, 8, 18),
    armorMat
  );
  beltArmour.userData._lodDetail = true;
  beltArmour.rotation.x = Math.PI / 2;
  beltArmour.scale.set(1.12, 0.85, 1.0);
  beltArmour.position.y = 0.22;
  torso.add(beltArmour);

  // Sculpted Fierce Rakshasa Head seated firmly on Neck Bridge
  const headGroup = createSculptedHeadMesh(skinMat, true);
  headGroup.position.y = 1.08;
  torso.add(headGroup);

  const rakScleraMat = new THREE.MeshStandardMaterial({ color: 0x361414, roughness: 0.25 });
  const rakBrassMat = new THREE.MeshStandardMaterial({
    map: textures.armorMetal,
    color: 0xdca542,
    roughness: 0.32,
    metalness: 0.88,
  });

  [-1, 1].forEach((side) => {
    const sclera = new THREE.Mesh(
      new THREE.SphereGeometry(0.041, 8, 8),
      rakScleraMat
    );
    sclera.scale.set(1.22, 0.78, 0.65);
    sclera.position.set(side * 0.085, 0.045, 0.204);
    headGroup.add(sclera);

    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.029, 8, 8),
      eyeMat
    );
    eye.scale.set(1.1, 0.82, 0.7);
    eye.position.set(side * 0.085, 0.045, 0.214);
    headGroup.add(eye);

    const brow = new THREE.Mesh(
      new THREE.BoxGeometry(0.095, 0.032, 0.05),
      skinMat
    );
    brow.position.set(side * 0.085, 0.086, 0.21);
    brow.rotation.z = side * 0.30;
    headGroup.add(brow);

    const fang = new THREE.Mesh(
      new THREE.ConeGeometry(0.024, 0.105, 7),
      tuskMat
    );
    fang.position.set(side * 0.068, -0.1, 0.205);
    fang.rotation.x = 0.22;
    headGroup.add(fang);

    const tuskRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.023, 0.005, 5, 10),
      rakBrassMat
    );
    tuskRing.userData._lodDetail = true;
    tuskRing.rotation.x = Math.PI / 2;
    tuskRing.position.set(side * 0.068, -0.102, 0.206);
    headGroup.add(tuskRing);

    const horn = new THREE.Mesh(
      new THREE.ConeGeometry(0.064, 0.42, 10),
      armorMat
    );
    horn.position.set(side * 0.2, 0.26, -0.02);
    horn.rotation.z = -side * 0.48;
    horn.rotation.x = 0.18;
    headGroup.add(horn);
  });

  const jawBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.03, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x220c10, roughness: 0.6 })
  );
  jawBar.position.set(0, -0.115, 0.195);
  headGroup.add(jawBar);

  if (isCommander) {
    const helm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.23, 0.22, 12),
      armorMat
    );
    helm.position.y = 0.24;
    headGroup.add(helm);
  }

  // Articulated Arms with Seamless Lofted Sockets (seated inside torso shoulders)
  const makeArm = (xOffset: number) => {
    const arm = new THREE.Group();
    arm.position.set(xOffset, 0.78, 0);

    const shoulderBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 10),
      skinMat
    );
    arm.add(shoulderBall);

    const upperArmGeo = createRamAnatomicalLimbGeometry(
      0.34,
      [
        [0.0, 0.115, 0.118, 0, 0],
        [0.38, 0.122, 0.126, 0, 0.006],
        [0.85, 0.1, 0.104, 0, 0],
        [1.0, 0.094, 0.096, 0, 0],
      ],
      12,
      14
    );
    const upper = new THREE.Mesh(upperArmGeo, skinMat);
    upper.castShadow = true;
    arm.add(upper);

    const elbowPivot = new THREE.Group();
    elbowPivot.position.set(0, -0.33, 0);
    arm.add(elbowPivot);

    const elbowBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.098, 12, 10),
      skinMat
    );
    elbowPivot.add(elbowBall);

    const forearmGeo = createRamAnatomicalLimbGeometry(
      0.33,
      [
        [0.0, 0.096, 0.098, 0, 0],
        [0.3, 0.108, 0.112, 0, 0.005],
        [0.85, 0.086, 0.088, 0, 0],
        [1.0, 0.078, 0.08, 0, 0],
      ],
      12,
      14
    );
    const gauntlet = new THREE.Mesh(forearmGeo, armorMat);
    gauntlet.position.y = 0.01;
    gauntlet.castShadow = true;
    elbowPivot.add(gauntlet);

    const fist = new THREE.Mesh(
      new THREE.SphereGeometry(0.082, 10, 8),
      armorMat
    );
    fist.position.set(0, -0.32, 0.02);
    elbowPivot.add(fist);

    return { arm, elbowPivot };
  };

  const leftArmRig = makeArm(-0.34);
  const rightArmRig = makeArm(0.34);
  const leftArm = leftArmRig.arm;
  const rightArm = rightArmRig.arm;
  const leftElbow = leftArmRig.elbowPivot;
  const rightElbow = rightArmRig.elbowPivot;
  torso.add(leftArm, rightArm);

  // Cohesive Fluted Gada Mace OR Connected Golden Commander Trishul (Zero Detached Parts)
  if (isCommander) {
    const tridentGroup = new THREE.Group();
    tridentGroup.position.set(0, -0.32, 0.03);
    tridentGroup.rotation.x = Math.PI * 0.44;

    const pommel = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.068, 0),
      armorMat
    );
    pommel.position.y = -0.34;
    tridentGroup.add(pommel);

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.044, 1.38, 10),
      armorMat
    );
    shaft.position.y = 0.34;
    shaft.castShadow = true;
    tridentGroup.add(shaft);

    // Ornate Lotus Ferrule Collar physically anchoring crossbar & prongs to shaft top
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.062, 0.13, 12),
      armorMat
    );
    collar.position.y = 1.03;
    tridentGroup.add(collar);

    const emberCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.072, 0),
      eyeMat
    );
    emberCore.position.y = 1.06;
    tridentGroup.add(emberCore);

    // Curved Crescent Crossbar Bridge seamlessly linking both outer prongs into the collar
    const crossbarCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.22, 1.24, 0),
      new THREE.Vector3(-0.17, 1.09, 0),
      new THREE.Vector3(0, 1.04, 0),
      new THREE.Vector3(0.17, 1.09, 0),
      new THREE.Vector3(0.22, 1.24, 0),
    ]);
    const crossbar = new THREE.Mesh(
      new THREE.TubeGeometry(crossbarCurve, 24, 0.032, 8, false),
      armorMat
    );
    crossbar.castShadow = true;
    tridentGroup.add(crossbar);

    // Central Spear Blade seated squarely into Collar
    const centerProng = new THREE.Mesh(
      new THREE.ConeGeometry(0.056, 0.48, 8),
      eyeMat
    );
    centerProng.position.set(0, 1.31, 0);
    tridentGroup.add(centerProng);

    // Twin Outer Prongs seated squarely into Crossbar sockets
    [-0.22, 0.22].forEach((px, idx) => {
      const socket = new THREE.Mesh(
        new THREE.SphereGeometry(0.044, 8, 8),
        armorMat
      );
      socket.position.set(px, 1.24, 0);
      tridentGroup.add(socket);

      const outerProng = new THREE.Mesh(
        new THREE.ConeGeometry(0.042, 0.34, 8),
        eyeMat
      );
      outerProng.position.set(px + (idx === 0 ? -0.02 : 0.02), 1.39, 0);
      outerProng.rotation.z = idx === 0 ? 0.14 : -0.14;
      tridentGroup.add(outerProng);
    });

    rightElbow.add(tridentGroup);
  } else {
    const maceGroup = new THREE.Group();
    maceGroup.position.set(0, -0.32, 0.03);
    maceGroup.rotation.x = Math.PI * 0.44;

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.042, 0.95, 8),
      armorMat
    );
    shaft.position.y = 0.26;
    shaft.castShadow = true;
    maceGroup.add(shaft);

    const maceHead = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.21, 0),
      armorMat
    );
    maceHead.position.y = 0.82;
    maceGroup.add(maceHead);

    rightElbow.add(maceGroup);
  }

  root.scale.setScalar(scale);

  return {
    root,
    leftLeg,
    rightLeg,
    leftKnee,
    rightKnee,
    leftAnkle,
    rightAnkle,
    leftArm,
    rightArm,
    leftElbow,
    rightElbow,
    torso,
    headGroup,
    contactShadow,
  };
}

export function createCitizenModel(
  textures: ProceduralTextures,
  clothColor: number,
  role: NpcRole = 'CITIZEN'
): CharacterRig {
  const root = new THREE.Group();
  const skinMat = new THREE.MeshPhysicalMaterial({
    normalMap: textures.royalSkinNormal,
    normalScale: new THREE.Vector2(0.18, 0.18),
    color: 0xb9855a,
    roughness: 0.50,
    metalness: 0.02,
    sheen: 0.24,
    sheenRoughness: 0.60,
    sheenColor: new THREE.Color(0xe6b488),
  });

  // Role-specific dhoti & angavastram palette (ALL wear traditional dhoti, padukas & janeu)
  const dhotiColor =
    role === 'MINISTER'
      ? 0xf4ecd6
      : role === 'COMMANDER'
      ? 0xeee1c4
      : role === 'SPY'
      ? 0xd6d2c6
      : role === 'SERVANT'
      ? 0xe8ddc2
      : role === 'GROOM'
      ? 0xe0d2b4
      : role === 'SOLDIER'
      ? 0xf0e3c6
      : 0xf2ead7;

  const dhotiMat = new THREE.MeshPhysicalMaterial({
    map: textures.silkGold,
    normalMap: textures.silkNormal,
    roughnessMap: textures.silkRoughness,
    color: dhotiColor,
    roughness: 0.78,
    ior: 1.46,
    sheen: 0.48,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(0xfff0cc),
  });
  const borderMat = new THREE.MeshPhysicalMaterial({
    map: textures.silkGold,
    normalMap: textures.silkNormal,
    roughnessMap: textures.silkRoughness,
    color:
      role === 'MINISTER'
        ? 0xb52b27
        : role === 'COMMANDER'
        ? 0xd98a1e
        : role === 'SPY'
        ? 0x2f3b52
        : role === 'SERVANT'
        ? 0xa35a2a
        : role === 'GROOM'
        ? 0x4f6840
        : role === 'SOLDIER'
        ? 0xc44324
        : clothColor,
    roughness: 0.74,
    ior: 1.46,
    sheen: 0.5,
  });
  const woodPadukaMat = new THREE.MeshPhysicalMaterial({
    map: textures.bark,
    normalMap: textures.barkNormal,
    color: 0x6f4321,
    roughness: 0.76,
    ior: 1.5,
  });
  const janeuWhiteMat = new THREE.MeshPhysicalMaterial({
    color: 0xfbf9f2,
    emissive: 0xf2ebd8,
    emissiveIntensity: 0.08,
    roughness: 0.45,
    sheen: 0.35,
  });
  const goldTrimMat = new THREE.MeshPhysicalMaterial({
    map: textures.armorMetal,
    normalMap: textures.armorNormal,
    roughnessMap: textures.armorRoughness,
    metalnessMap: textures.armorMetalness,
    color: 0xe6b544,
    roughness: 0.32,
    metalness: 0.90,
    ior: 1.6,
    specularIntensity: 0.95,
    clearcoat: 0.2,
  });
  const eyeMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a1512,
    roughness: 0.08,
    clearcoat: 1.0,
    ior: 1.42,
  });
  const scleraWhiteMat = new THREE.MeshPhysicalMaterial({
    color: 0xf5f0e6,
    roughness: 0.14,
    clearcoat: 0.9,
  });
  const lipToneMat = new THREE.MeshStandardMaterial({
    color: 0x8f5644,
    roughness: 0.48,
  });

  const contactShadow = createContactShadowMesh(textures.contactShadow, 0.62, 0.62);
  root.add(contactShadow);

  // Seamless Lofted Articulated Legs clad in pleated Dhoti + carved wooden Padukas
  const makeLeg = (xOffset: number) => {
    const leg = new THREE.Group();
    leg.position.set(xOffset, 0.85, 0);

    const hipBall = new THREE.Mesh(new THREE.SphereGeometry(0.104, 10, 8), dhotiMat);
    leg.add(hipBall);

    const thighGeo = createRamAnatomicalLimbGeometry(
      0.44,
      [
        [0.0, 0.104, 0.106, 0, 0],
        [0.45, 0.102, 0.105, 0, 0.004],
        [0.88, 0.09, 0.094, 0, 0.002],
        [1.0, 0.082, 0.086, 0, 0],
      ],
      12,
      14
    );
    const thigh = new THREE.Mesh(thighGeo, dhotiMat);
    thigh.castShadow = true;
    leg.add(thigh);

    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -0.43, 0);
    leg.add(kneePivot);

    const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(0.084, 10, 8), dhotiMat);
    kneePivot.add(kneeBall);

    // Dhoti wrap tapers cleanly down shin to gold/colored ankle border
    const shinGeo = createRamAnatomicalLimbGeometry(
      0.34,
      [
        [0.0, 0.082, 0.086, 0, 0],
        [0.36, 0.086, 0.092, 0, -0.006],
        [0.86, 0.068, 0.072, 0, -0.002],
        [1.0, 0.062, 0.066, 0, 0],
      ],
      12,
      14
    );
    const shin = new THREE.Mesh(shinGeo, dhotiMat);
    shin.position.y = 0.01;
    shin.castShadow = true;
    kneePivot.add(shin);

    // Dhoti Hem Band just above bare ankle
    const dhotiHem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.069, 0.055, 12),
      borderMat
    );
    dhotiHem.position.y = -0.32;
    kneePivot.add(dhotiHem);

    const anklePivot = new THREE.Group();
    anklePivot.position.set(0, -0.37, 0);
    kneePivot.add(anklePivot);

    const ankleBall = new THREE.Mesh(new THREE.SphereGeometry(0.054, 8, 8), skinMat);
    anklePivot.add(ankleBall);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.094, 0.044, 0.2), skinMat);
    foot.position.set(0, -0.016, 0.04);
    anklePivot.add(foot);

    // Traditional Wooden Padukas (Khadaun): Elevated teakwood sole, twin arch cleats & toe-knob
    const padukaSole = new THREE.Mesh(
      new THREE.BoxGeometry(0.108, 0.022, 0.235),
      woodPadukaMat
    );
    padukaSole.position.set(0, -0.044, 0.042);
    padukaSole.castShadow = true;
    anklePivot.add(padukaSole);

    const frontCleat = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.022, 0.044),
      woodPadukaMat
    );
    frontCleat.position.set(0, -0.064, 0.11);
    anklePivot.add(frontCleat);

    const heelCleat = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.022, 0.05),
      woodPadukaMat
    );
    heelCleat.position.set(0, -0.064, -0.036);
    anklePivot.add(heelCleat);

    const toeKnobStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.011, 0.034, 8),
      woodPadukaMat
    );
    toeKnobStem.position.set(0, -0.018, 0.115);
    anklePivot.add(toeKnobStem);

    const toeKnobCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.017, 8, 8),
      woodPadukaMat
    );
    toeKnobCap.position.set(0, 0.002, 0.115);
    anklePivot.add(toeKnobCap);

    return { leg, kneePivot, anklePivot };
  };

  const leftLegRig = makeLeg(-0.12);
  const rightLegRig = makeLeg(0.12);
  const leftLeg = leftLegRig.leg;
  const rightLeg = rightLegRig.leg;
  const leftKnee = leftLegRig.kneePivot;
  const rightKnee = rightLegRig.kneePivot;
  const leftAnkle = leftLegRig.anklePivot;
  const rightAnkle = rightLegRig.anklePivot;
  root.add(leftLeg, rightLeg);

  const torso = new THREE.Group();
  torso.position.y = 0.86;
  root.add(torso);

  // Bare traditional upper torso so the sacred Janeu & Uttariya Angavastram are clearly visible
  const body = new THREE.Mesh(createSculptedTorsoGeometry(0.85), skinMat);
  body.position.y = 0.02;
  body.castShadow = true;
  torso.add(body);

  // Traditional Waist Dhoti Wrap + Decorative Border Belt + Front Kachcha Pleat
  const waistWrap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.198, 0.228, 0.24, 16),
    dhotiMat
  );
  waistWrap.scale.set(1.16, 1.0, 0.82);
  waistWrap.position.y = 0.03;
  torso.add(waistWrap);

  const waistBand = new THREE.Mesh(
    new THREE.TorusGeometry(0.205, 0.024, 8, 22),
    borderMat
  );
  waistBand.rotation.x = Math.PI / 2;
  waistBand.scale.set(1.14, 0.82, 1.0);
  waistBand.position.y = 0.135;
  torso.add(waistBand);

  const centerPleat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.11, 0.48, 8),
    borderMat
  );
  centerPleat.scale.set(1.0, 1.0, 0.32);
  centerPleat.position.set(0, -0.14, 0.17);
  centerPleat.rotation.x = -0.05;
  torso.add(centerPleat);

  // Prominent Sacred White Janeu (Triple-Strand Yajnopavita diagonally from Left Shoulder to Right Hip + Brahma Granthi Knot)
  const buildJaneuCurve = (offset: number) =>
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.14 + offset * 0.4, 0.65, -0.05),
      new THREE.Vector3(-0.12 + offset * 0.4, 0.62, 0.12),
      new THREE.Vector3(-0.02 + offset * 0.4, 0.42, 0.208),
      new THREE.Vector3(0.11 + offset * 0.4, 0.25, 0.17),
      new THREE.Vector3(0.2 + offset * 0.3, 0.14, 0.04),
      new THREE.Vector3(0.13 + offset * 0.3, 0.2, -0.155),
      new THREE.Vector3(-0.02 + offset * 0.3, 0.43, -0.175),
      new THREE.Vector3(-0.14 + offset * 0.4, 0.65, -0.05),
    ]);

  [-0.011, 0, 0.011].forEach((strandOffset) => {
    const strand = new THREE.Mesh(
      new THREE.TubeGeometry(buildJaneuCurve(strandOffset), 34, 0.0055, 6, true),
      janeuWhiteMat
    );
    strand.userData._lodDetail = true;
    torso.add(strand);
  });

  // Brahma Granthi Sacred Knot resting over upper left chest
  const janeuKnot = new THREE.Mesh(
    new THREE.SphereGeometry(0.015, 8, 8),
    janeuWhiteMat
  );
  janeuKnot.userData._lodDetail = true;
  janeuKnot.position.set(-0.095, 0.56, 0.16);
  torso.add(janeuKnot);

  // Light Angavastram Shoulder Shawl Draped Over Right Shoulder (leaving Janeu on left-to-right diagonal clear!)
  if (role !== 'SERVANT') {
    const uttariyaCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.18, 0.36, 0.15),
      new THREE.Vector3(0.17, 0.66, 0.06),
      new THREE.Vector3(0.16, 0.66, -0.1),
      new THREE.Vector3(0.14, 0.32, -0.16),
    ]);
    const uttariya = new THREE.Mesh(
      new THREE.TubeGeometry(uttariyaCurve, 20, 0.042, 8, false),
      borderMat
    );
    uttariya.scale.set(1.25, 1.0, 0.55);
    torso.add(uttariya);
  }

  if (role === 'SOLDIER' || role === 'COMMANDER') {
    const chestPlate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.188, 0.165, 0.26, 14, 1, false, -Math.PI * 0.42, Math.PI * 0.84),
      goldTrimMat
    );
    chestPlate.position.set(0, 0.45, 0.055);
    chestPlate.castShadow = true;
    torso.add(chestPlate);

    [-0.19, 0.19].forEach((sx) => {
      const shoulderCap = new THREE.Mesh(
        new THREE.SphereGeometry(0.082, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
        goldTrimMat
      );
      shoulderCap.userData._lodDetail = true;
      shoulderCap.position.set(sx, 0.58, 0.01);
      shoulderCap.rotation.z = sx > 0 ? -0.35 : 0.35;
      torso.add(shoulderCap);
    });
  }

  // Sturdy Neck Bridge & Cleanly Seated Head
  const neckBridge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.066, 0.082, 0.14, 12),
    skinMat
  );
  neckBridge.position.y = 0.69;
  torso.add(neckBridge);

  const head = createSculptedHeadMesh(skinMat, false);
  head.position.y = 0.79;
  head.scale.setScalar(0.84);
  torso.add(head);

  // Traditional forehead Tilak, Realistic Sclera+Iris Eyes, Brows & Lips
  const tilak = new THREE.Mesh(
    new THREE.BoxGeometry(0.014, 0.042, 0.012),
    role === 'MINISTER' || role === 'COMMANDER' ? goldTrimMat : janeuWhiteMat
  );
  tilak.userData._lodDetail = true;
  tilak.position.set(0, 0.072, 0.145);
  head.add(tilak);

  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.012, 0.014), lipToneMat);
  mouth.userData._lodDetail = true;
  mouth.position.set(0, -0.052, 0.138);
  head.add(mouth);

  [-1, 1].forEach((side) => {
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.020, 8, 8), scleraWhiteMat);
    sclera.scale.set(1.18, 0.78, 0.72);
    sclera.position.set(side * 0.045, 0.02, 0.128);
    head.add(sclera);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 8, 8), eyeMat);
    eye.position.set(side * 0.045, 0.02, 0.137);
    head.add(eye);

    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.008, 0.012), eyeMat);
    brow.userData._lodDetail = true;
    brow.position.set(side * 0.045, 0.042, 0.136);
    brow.rotation.z = -side * 0.08;
    head.add(brow);
  });

  // Traditional Headgear per Role (Pagdi turban with gold fold, Royal Crown band, Spy Cowl, or Topknot)
  if (role === 'SPY') {
    const cowl = new THREE.Mesh(
      new THREE.SphereGeometry(0.155, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
      borderMat
    );
    cowl.position.set(0, 0.055, -0.02);
    cowl.rotation.x = -0.15;
    head.add(cowl);
  } else if (role === 'SERVANT' || role === 'GROOM') {
    const hairBun = new THREE.Mesh(
      new THREE.SphereGeometry(0.068, 10, 8),
      eyeMat
    );
    hairBun.position.set(0, 0.155, -0.04);
    head.add(hairBun);
  } else {
    const turban = new THREE.Mesh(
      new THREE.TorusGeometry(0.125, 0.058, 10, 20),
      borderMat
    );
    turban.rotation.x = Math.PI / 2;
    turban.position.set(0, 0.125, -0.01);
    head.add(turban);

    const turbanSash = new THREE.Mesh(
      new THREE.TorusGeometry(0.128, 0.018, 6, 18),
      goldTrimMat
    );
    turbanSash.userData._lodDetail = true;
    turbanSash.rotation.x = Math.PI / 2 - 0.12;
    turbanSash.position.set(0, 0.128, -0.008);
    head.add(turbanSash);

    const turbanCrown = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      borderMat
    );
    turbanCrown.position.set(0, 0.11, -0.01);
    head.add(turbanCrown);

    if (role === 'MINISTER' || role === 'COMMANDER') {
      const crest = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.036, 0),
        goldTrimMat
      );
      crest.userData._lodDetail = true;
      crest.position.set(0, 0.16, 0.125);
      head.add(crest);
    }
  }

  // Seamless Lofted Citizen Arms (bare arms with wrist bangles)
  const makeArm = (xOffset: number) => {
    const arm = new THREE.Group();
    arm.position.set(xOffset, 0.56, 0);

    const shoulderBall = new THREE.Mesh(new THREE.SphereGeometry(0.064, 10, 8), skinMat);
    arm.add(shoulderBall);

    const upperGeo = createRamAnatomicalLimbGeometry(
      0.28,
      [
        [0.0, 0.062, 0.064, 0, 0],
        [0.45, 0.06, 0.064, 0, 0.003],
        [0.88, 0.052, 0.054, 0, 0],
        [1.0, 0.048, 0.05, 0, 0],
      ],
      10,
      12
    );
    const upperArm = new THREE.Mesh(upperGeo, skinMat);
    upperArm.castShadow = true;
    arm.add(upperArm);

    const elbowPivot = new THREE.Group();
    elbowPivot.position.set(0, -0.27, 0);
    arm.add(elbowPivot);

    const elbowBall = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), skinMat);
    elbowPivot.add(elbowBall);

    const forearmGeo = createRamAnatomicalLimbGeometry(
      0.26,
      [
        [0.0, 0.05, 0.052, 0, 0],
        [0.32, 0.054, 0.056, 0, 0.002],
        [0.85, 0.04, 0.042, 0, 0],
        [1.0, 0.036, 0.038, 0, 0],
      ],
      10,
      12
    );
    const forearm = new THREE.Mesh(forearmGeo, skinMat);
    forearm.position.y = 0.01;
    forearm.castShadow = true;
    elbowPivot.add(forearm);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), skinMat);
    hand.position.y = -0.26;
    elbowPivot.add(hand);

    return { arm, elbowPivot };
  };

  const leftArmRig = makeArm(-0.215);
  const rightArmRig = makeArm(0.215);
  const leftArm = leftArmRig.arm;
  const rightArm = rightArmRig.arm;
  const leftElbow = leftArmRig.elbowPivot;
  const rightElbow = rightArmRig.elbowPivot;
  torso.add(leftArm, rightArm);

  // Role-specific handheld prop
  if (role === 'MINISTER') {
    const scroll = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.24, 8),
      janeuWhiteMat
    );
    scroll.rotation.x = Math.PI / 2;
    scroll.position.set(0, -0.26, 0.04);
    rightElbow.add(scroll);
  } else if (role === 'COMMANDER' || role === 'SOLDIER') {
    const bhalaShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.02, 1.55, 8),
      woodPadukaMat
    );
    bhalaShaft.position.set(0, -0.1, 0.05);
    rightElbow.add(bhalaShaft);
    const bhalaHead = new THREE.Mesh(
      new THREE.ConeGeometry(0.045, 0.22, 6),
      goldTrimMat
    );
    bhalaHead.position.set(0, 0.72, 0.05);
    rightElbow.add(bhalaHead);
  } else if (role === 'SERVANT') {
    const pot = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xb55d35, roughness: 0.7 })
    );
    pot.position.set(0, -0.26, 0.05);
    rightElbow.add(pot);
  } else if (role === 'GROOM') {
    const coil = new THREE.Mesh(
      new THREE.TorusGeometry(0.09, 0.015, 6, 12),
      woodPadukaMat
    );
    coil.position.set(0, -0.26, 0.04);
    rightElbow.add(coil);
  }

  return {
    root,
    leftLeg,
    rightLeg,
    leftKnee,
    rightKnee,
    leftAnkle,
    rightAnkle,
    leftArm,
    rightArm,
    leftElbow,
    rightElbow,
    torso,
    headGroup: head,
    centerPleat,
    waistWrap,
    contactShadow,
  };
}

function createReinTubeMesh(mat: THREE.Material): THREE.Mesh {
  const segs = 16;
  const radSegs = 6;
  const vertCount = (segs + 1) * (radSegs + 1);
  const pos = new Float32Array(vertCount * 3);
  const norm = new Float32Array(vertCount * 3);
  const indices: number[] = [];
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radSegs; j++) {
      const a = i * (radSegs + 1) + j;
      const b = (i + 1) * (radSegs + 1) + j;
      const c = (i + 1) * (radSegs + 1) + (j + 1);
      const d = i * (radSegs + 1) + (j + 1);
      indices.push(a, b, d, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  geo.setIndex(indices);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.frustumCulled = false;
  return m;
}

/**
 * Shared high-fidelity Royal War Horse / Ashva generator used identically by both Chariot steeds and Ashva-Shala stables.
 */
export function createRoyalHorseUnit(
  coatMat: THREE.Material,
  maneMat: THREE.Material,
  caparisonMat: THREE.Material,
  goldMat: THREE.Material,
  gemMat: THREE.Material,
  isDraft = false
): RoyalHorseRig {
  const group = new THREE.Group();
  const legs: THREE.Group[] = [];
  const knees: THREE.Group[] = [];
  const tailPlumes: THREE.Mesh[] = [];
  const tailChains: Array<[THREE.Group, THREE.Group, THREE.Group]> = [];
  const maneChains: Array<[THREE.Group, THREE.Group]> = [];
  const ears: THREE.Mesh[] = [];

  const hoofMat = new THREE.MeshPhysicalMaterial({ color: 0x1b1a1e, roughness: 0.44, metalness: 0.14, ior: 1.52, clearcoat: 0.35 });
  const darkDetailMat = new THREE.MeshPhysicalMaterial({ color: 0x151418, roughness: 0.42, ior: 1.5 });
  const scleraMat = new THREE.MeshPhysicalMaterial({ color: 0xf9f8f3, roughness: 0.12, ior: 1.4, clearcoat: 1.0 });
  const irisMat = new THREE.MeshPhysicalMaterial({ color: 0x2c1b10, roughness: 0.08, ior: 1.42, clearcoat: 1.0 });
  const eyeSpecMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.85,
    roughness: 0.04,
    ior: 1.52,
    clearcoat: 1.0,
  });
  const innerEarMat = new THREE.MeshPhysicalMaterial({ color: 0xd9a79c, roughness: 0.7, sheen: 0.35 });

  // Muscular barrel torso & contoured haunches / chest
  const barrel = new THREE.Mesh(new THREE.CapsuleGeometry(0.39, 1.05, 8, 16), coatMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 1.24, 0.02);
  barrel.scale.set(0.92, 1.04, 1.0);
  barrel.castShadow = true;
  group.add(barrel);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.41, 14, 12), coatMat);
  chest.scale.set(0.92, 1.06, 1.08);
  chest.position.set(0, 1.26, 0.56);
  chest.castShadow = true;
  group.add(chest);

  const croup = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), coatMat);
  croup.scale.set(0.94, 1.05, 1.08);
  croup.position.set(0, 1.24, -0.54);
  croup.castShadow = true;
  group.add(croup);

  // Ornate Crimson-Gold Silk Caparison / Saddle Blanket & Surcingle Strap
  const blanket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.425, 0.435, 0.76, 16, 1, false, -Math.PI * 0.65, Math.PI * 1.3),
    caparisonMat
  );
  blanket.rotation.x = Math.PI / 2;
  blanket.rotation.z = Math.PI;
  blanket.position.set(0, 1.27, -0.02);
  blanket.castShadow = true;
  group.add(blanket);

  const goldTrimBand = new THREE.Mesh(
    new THREE.TorusGeometry(0.428, 0.024, 6, 20),
    goldMat
  );
  goldTrimBand.userData._lodDetail = true;
  goldTrimBand.position.set(0, 1.26, 0.24);
  group.add(goldTrimBand);

  if (!isDraft) {
    // Contoured Royal Riding Saddle Cushion flush atop the caparison (top = 1.70m)
    const saddleSeat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.56), caparisonMat);
    saddleSeat.position.set(0, 1.66, -0.02);
    saddleSeat.castShadow = true;
    group.add(saddleSeat);
    const saddleCantle = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.1), goldMat);
    saddleCantle.position.set(0, 1.72, -0.26);
    group.add(saddleCantle);
    const saddlePommel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.11, 0.1), goldMat);
    saddlePommel.position.set(0, 1.72, 0.23);
    group.add(saddlePommel);
  }

  // Golden Pectoral Chest Harness & Jeweled Medallion
  const chestCollar = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.042, 8, 20), goldMat);
  chestCollar.rotation.x = Math.PI * 0.34;
  chestCollar.position.set(0, 1.36, 0.74);
  group.add(chestCollar);

  const chestGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.068, 0), gemMat);
  chestGem.userData._lodDetail = true;
  chestGem.position.set(0, 1.18, 0.96);
  group.add(chestGem);

  if (isDraft) {
    const yokeRing = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 12), goldMat);
    yokeRing.position.set(0, 1.48, 0.72);
    group.add(yokeRing);
  }

  // Arched Neck, Sculpted Head, Detailed Eyes, Nostrils, Pointed Ears, Articulated 7x2 Mane & 2-Link Forelock
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.29, 0.78, 12), coatMat);
  neck.rotation.x = 0.52;
  neck.position.set(0, 1.66, 0.84);
  neck.castShadow = true;
  group.add(neck);

  // Articulated 7-Tuft Dual-Link Physics-Driven Flowing Mane along dorsal crest (root -> flowing tip)
  const maneBaseGeo = new THREE.CylinderGeometry(0.048, 0.068, 0.16, 7);
  maneBaseGeo.translate(0, -0.075, 0);
  const maneTipGeo = new THREE.ConeGeometry(0.056, 0.19, 7);
  maneTipGeo.rotateX(Math.PI);
  maneTipGeo.translate(0, -0.09, 0);

  for (let m = 0; m < 7; m++) {
    const t = m / 6;
    const sideSign = m % 2 === 0 ? -1 : 1;
    const sizeScale = 1.04 - t * 0.22;

    const rootPivot = new THREE.Group();
    rootPivot.position.set(sideSign * 0.036, 1.52 + t * 0.5, 0.58 + t * 0.41);
    rootPivot.rotation.set(-0.34, 0, sideSign * 0.24);
    group.add(rootPivot);

    const rootMesh = new THREE.Mesh(maneBaseGeo, maneMat);
    rootMesh.scale.set(sizeScale, 1.0, sizeScale);
    rootMesh.castShadow = true;
    rootPivot.add(rootMesh);

    const tipPivot = new THREE.Group();
    tipPivot.position.set(0, -0.14, 0);
    tipPivot.rotation.set(-0.14, 0, sideSign * 0.08);
    rootPivot.add(tipPivot);

    const tipMesh = new THREE.Mesh(maneTipGeo, maneMat);
    tipMesh.scale.set(sizeScale, 1.0, sizeScale);
    tipMesh.castShadow = true;
    tipPivot.add(tipMesh);

    maneChains.push([rootPivot, tipPivot]);
  }

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.98, 1.06);
  headPivot.rotation.x = 0.56;
  group.add(headPivot);

  const cranium = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.34), coatMat);
  cranium.position.set(0, 0.02, 0.08);
  cranium.castShadow = true;
  headPivot.add(cranium);

  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.135, 0.34, 12), coatMat);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, -0.02, 0.34);
  muzzle.castShadow = true;
  headPivot.add(muzzle);

  // Articulated 2-Link Physics-Driven Forelock between ears
  const forelockBaseGeo = new THREE.CylinderGeometry(0.042, 0.056, 0.13, 7);
  forelockBaseGeo.translate(0, -0.06, 0);
  const forelockTipGeo = new THREE.ConeGeometry(0.046, 0.15, 7);
  forelockTipGeo.rotateX(Math.PI);
  forelockTipGeo.translate(0, -0.072, 0);

  const forelockRoot = new THREE.Group();
  forelockRoot.position.set(0, 0.15, 0.16);
  forelockRoot.rotation.set(-0.55, 0, 0);
  headPivot.add(forelockRoot);
  forelockRoot.add(new THREE.Mesh(forelockBaseGeo, maneMat));

  const forelockTip = new THREE.Group();
  forelockTip.position.set(0, -0.115, 0);
  forelockTip.rotation.set(-0.18, 0, 0);
  forelockRoot.add(forelockTip);
  forelockTip.add(new THREE.Mesh(forelockTipGeo, maneMat));
  const forelockChain: [THREE.Group, THREE.Group] = [forelockRoot, forelockTip];

  // Sculpted Eyes (Sclera + Iris + Specular Catchlight), Flared Nostrils, Ears & Golden Bridle Bit Rings
  const leftBitAnchor = new THREE.Object3D();
  const rightBitAnchor = new THREE.Object3D();
  [-1, 1].forEach((side) => {
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(side * 0.118, 0.06, 0.16);
    eyeGroup.rotation.y = side * 0.35;

    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), scleraMat);
    sclera.scale.set(0.65, 0.9, 1.15);
    eyeGroup.add(sclera);

    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), irisMat);
    iris.position.set(side * 0.012, 0, 0.01);
    eyeGroup.add(iris);

    const catchlight = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 6), eyeSpecMat);
    catchlight.position.set(side * 0.026, 0.01, 0.018);
    eyeGroup.add(catchlight);

    headPivot.add(eyeGroup);

    // Flared Nostrils
    const nostrilRim = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.009, 6, 10), coatMat);
    nostrilRim.userData._lodDetail = true;
    nostrilRim.rotation.y = side * 0.65;
    nostrilRim.position.set(side * 0.068, -0.015, 0.47);
    headPivot.add(nostrilRim);

    const nostrilHole = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), darkDetailMat);
    nostrilHole.position.set(side * 0.064, -0.015, 0.468);
    headPivot.add(nostrilHole);

    // Pointed Animated Ears
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.044, 0.16, 7), coatMat);
    ear.position.set(side * 0.095, 0.18, -0.02);
    ear.rotation.z = -side * 0.22;
    ear.rotation.x = 0.25;
    headPivot.add(ear);
    ears.push(ear);

    const innerEar = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.11, 6), innerEarMat);
    innerEar.position.set(0, -0.01, 0.018);
    ear.add(innerEar);

    // Golden Bridle Cheek Strap & Bit Ring
    const cheekStrap = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.016, 0.26), goldMat);
    cheekStrap.position.set(side * 0.118, 0.02, 0.25);
    cheekStrap.rotation.x = 0.14;
    headPivot.add(cheekStrap);

    const bitRing = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.0075, 6, 12), goldMat);
    bitRing.rotation.y = Math.PI / 2;
    bitRing.position.set(side * 0.114, -0.02, 0.36);
    headPivot.add(bitRing);

    if (side < 0) {
      leftBitAnchor.position.set(-0.116, -0.02, 0.36);
      headPivot.add(leftBitAnchor);
    } else {
      rightBitAnchor.position.set(0.116, -0.02, 0.36);
      headPivot.add(rightBitAnchor);
    }
  });

  // Ornate Golden Bridle, Headstall, Noseband & Crown Jewel
  const browband = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.016, 6, 16), goldMat);
  browband.userData._lodDetail = true;
  browband.rotation.x = Math.PI / 2;
  browband.position.set(0, 0.09, 0.15);
  headPivot.add(browband);

  const noseband = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.015, 6, 16), goldMat);
  noseband.userData._lodDetail = true;
  noseband.position.set(0, -0.01, 0.36);
  headPivot.add(noseband);

  const crestCrown = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.14, 8), goldMat);
  crestCrown.userData._lodDetail = true;
  crestCrown.position.set(0, 0.18, 0.12);
  headPivot.add(crestCrown);

  const crestGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.028, 0), gemMat);
  crestGem.userData._lodDetail = true;
  crestGem.position.set(0, 0.13, 0.2);
  headPivot.add(crestGem);

  // Securely Docked 5-Plume Flowing Bushy Tail (anchored directly inside the croup via muscular tail dock + golden crupper)
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 1.4, -0.84);
  group.add(tailGroup);

  const tailDock = new THREE.Mesh(new THREE.CapsuleGeometry(0.088, 0.2, 8, 12), coatMat);
  tailDock.rotation.x = -0.45;
  tailDock.position.set(0, -0.04, -0.04);
  tailDock.castShadow = true;
  tailGroup.add(tailDock);

  const goldCrupper = new THREE.Mesh(new THREE.TorusGeometry(0.102, 0.02, 6, 14), goldMat);
  goldCrupper.userData._lodDetail = true;
  goldCrupper.rotation.x = 0.45;
  goldCrupper.position.set(0, -0.01, -0.01);
  tailGroup.add(goldCrupper);

  // Shared geometries for articulated 3-link physics-driven 5-strand horse tail
  const tailSeg0Geo = new THREE.CylinderGeometry(0.068, 0.056, 0.24, 8);
  tailSeg0Geo.translate(0, -0.11, 0);
  const tailSeg1Geo = new THREE.CylinderGeometry(0.054, 0.036, 0.26, 8);
  tailSeg1Geo.translate(0, -0.12, 0);
  const tailSeg2Geo = new THREE.ConeGeometry(0.036, 0.28, 7);
  tailSeg2Geo.rotateX(Math.PI);
  tailSeg2Geo.translate(0, -0.13, 0);

  for (let p = 0; p < 5; p++) {
    const spread = p - 2;
    const scaleBias = 1.0 - Math.abs(spread) * 0.08;

    const seg0Pivot = new THREE.Group();
    seg0Pivot.position.set(spread * 0.022, -0.025, -0.055);
    seg0Pivot.rotation.set(-0.32 - Math.abs(spread) * 0.04, 0, spread * 0.075);
    tailGroup.add(seg0Pivot);

    const mesh0 = new THREE.Mesh(tailSeg0Geo, maneMat);
    mesh0.scale.set(scaleBias, 1.0, scaleBias);
    mesh0.castShadow = true;
    seg0Pivot.add(mesh0);
    tailPlumes.push(mesh0);

    const seg1Pivot = new THREE.Group();
    seg1Pivot.position.set(0, -0.21, 0);
    seg1Pivot.rotation.x = 0.14;
    seg0Pivot.add(seg1Pivot);

    const mesh1 = new THREE.Mesh(tailSeg1Geo, maneMat);
    mesh1.scale.set(scaleBias, 1.0, scaleBias);
    mesh1.castShadow = true;
    seg1Pivot.add(mesh1);
    tailPlumes.push(mesh1);

    const seg2Pivot = new THREE.Group();
    seg2Pivot.position.set(0, -0.23, 0);
    seg2Pivot.rotation.x = 0.12;
    seg1Pivot.add(seg2Pivot);

    const mesh2 = new THREE.Mesh(tailSeg2Geo, maneMat);
    mesh2.scale.set(scaleBias, 0.95 + (p % 2) * 0.2, scaleBias);
    mesh2.castShadow = true;
    seg2Pivot.add(mesh2);
    tailPlumes.push(mesh2);

    tailChains.push([seg0Pivot, seg1Pivot, seg2Pivot]);
  }

  // 4 Articulated Legs with Upper Thigh/Shoulder, Knee Joint, Fetlock, Golden Anklet & Dark Hoof
  const legSpecs = [
    { x: -0.2, z: 0.56 },
    { x: 0.2, z: 0.56 },
    { x: -0.2, z: -0.56 },
    { x: 0.2, z: -0.56 },
  ];
  legSpecs.forEach((ls) => {
    const legRoot = new THREE.Group();
    legRoot.position.set(ls.x, 1.05, ls.z);
    group.add(legRoot);

    const upperLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.072, 0.54, 10), coatMat);
    upperLeg.position.y = -0.26;
    upperLeg.castShadow = true;
    legRoot.add(upperLeg);

    const kneePivot = new THREE.Group();
    kneePivot.position.y = -0.52;
    legRoot.add(kneePivot);

    const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(0.068, 8, 8), coatMat);
    kneePivot.add(kneeBall);

    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.048, 0.45, 10), coatMat);
    cannon.position.y = -0.23;
    cannon.castShadow = true;
    kneePivot.add(cannon);

    const anklet = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.015, 6, 12), goldMat);
    anklet.userData._lodDetail = true;
    anklet.rotation.x = Math.PI / 2;
    anklet.position.y = -0.41;
    kneePivot.add(anklet);

    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.068, 0.1, 10), hoofMat);
    hoof.position.y = -0.48;
    hoof.castShadow = true;
    kneePivot.add(hoof);

    legs.push(legRoot);
    knees.push(kneePivot);
  });

  // Dynamic Reins attached from bridle bits to rider's hands (or draped to saddle pommel when unmounted)
  let leftReinMesh: THREE.Mesh | undefined;
  let rightReinMesh: THREE.Mesh | undefined;
  let leftPommelHook: THREE.Vector3 | undefined;
  let rightPommelHook: THREE.Vector3 | undefined;
  if (!isDraft) {
    leftReinMesh = createReinTubeMesh(goldMat);
    rightReinMesh = createReinTubeMesh(goldMat);
    leftPommelHook = new THREE.Vector3(-0.18, 1.72, 0.25);
    rightPommelHook = new THREE.Vector3(0.18, 1.72, 0.25);
    group.updateMatrixWorld(true);
    const lBit = new THREE.Vector3();
    const rBit = new THREE.Vector3();
    leftBitAnchor.getWorldPosition(lBit);
    rightBitAnchor.getWorldPosition(rBit);
    updateDynamicReinMesh(leftReinMesh, lBit, leftPommelHook, 0.18);
    updateDynamicReinMesh(rightReinMesh, rBit, rightPommelHook, 0.18);
    group.add(leftReinMesh, rightReinMesh);
  }

  return {
    group,
    legs,
    knees,
    headPivot,
    tailGroup,
    tailPlumes,
    tailChains,
    maneChains,
    forelockChain,
    ears,
    leftBitAnchor,
    rightBitAnchor,
    leftReinMesh,
    rightReinMesh,
    leftPommelHook,
    rightPommelHook,
    seatHeight: 0.88,
  };
}

export function createRathaChariotModel(
  textures: ProceduralTextures
): ChariotRig {
  const root = new THREE.Group();

  const goldMat = new THREE.MeshPhysicalMaterial({
    map: textures.armorMetal,
    normalMap: textures.armorNormal,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: textures.armorRoughness,
    metalnessMap: textures.armorMetalness,
    color: 0xf0be4a,
    roughness: 0.30,
    metalness: 0.92,
    ior: 1.62,
    specularIntensity: 1.0,
    anisotropy: 0.55,
    clearcoat: 0.24,
  });
  const teakMat = new THREE.MeshPhysicalMaterial({
    map: textures.bark,
    normalMap: textures.barkNormal,
    color: 0x7b4722,
    roughness: 0.7,
    metalness: 0.06,
    ior: 1.52,
    specularIntensity: 0.42,
  });
  const canopyMat = new THREE.MeshPhysicalMaterial({
    map: textures.silkGold,
    normalMap: textures.silkNormal,
    roughnessMap: textures.silkRoughness,
    color: 0xc94026,
    roughness: 0.74,
    metalness: 0.08,
    ior: 1.48,
    sheen: 0.62,
    sheenRoughness: 0.48,
    sheenColor: new THREE.Color(0xffb894),
  });

  const contactShadow = createContactShadowMesh(textures.contactShadow, 2.3, 3.6);
  root.add(contactShadow);

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.3, 2.7),
    teakMat
  );
  deck.position.set(0, 1.0, -0.6);
  deck.castShadow = true;
  deck.receiveShadow = true;
  root.add(deck);

  const railMat = goldMat.clone();
  railMat.side = THREE.DoubleSide;

  const frontRail = new THREE.Mesh(
    new THREE.CylinderGeometry(
      1.2,
      1.2,
      0.92,
      24,
      1,
      true,
      -Math.PI * 0.52,
      Math.PI * 1.04
    ),
    railMat
  );
  frontRail.position.set(0, 1.56, 0.22);
  frontRail.castShadow = true;
  frontRail.frustumCulled = false;
  root.add(frontRail);

  // Thick solid golden top rim along front railing arc so rail edge is always clearly visible during turns
  const frontTopRim = new THREE.Mesh(
    new THREE.TorusGeometry(1.2, 0.056, 10, 28, Math.PI * 1.04),
    goldMat
  );
  frontTopRim.rotation.x = Math.PI / 2;
  frontTopRim.rotation.z = Math.PI * 0.02;
  frontTopRim.position.set(0, 2.02, 0.22);
  frontTopRim.castShadow = true;
  frontTopRim.frustumCulled = false;
  root.add(frontTopRim);

  // Front vertical gilded balusters + twin side guard rails linking back to rear pillars
  for (let b = 0; b <= 6; b++) {
    const ba = -Math.PI * 0.48 + (b / 6) * Math.PI * 0.96;
    const baluster = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.042, 0.94, 8),
      goldMat
    );
    baluster.userData._lodDetail = true;
    baluster.position.set(Math.sin(ba) * 1.2, 1.56, 0.22 + Math.cos(ba) * 1.2);
    root.add(baluster);
  }
  [-1.14, 1.14].forEach((sx) => {
    const sideRail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 1.98, 8),
      goldMat
    );
    sideRail.rotation.x = Math.PI / 2;
    sideRail.position.set(sx, 1.98, -0.76);
    root.add(sideRail);
  });

  const pillarCoords = [
    [-1.05, -1.75],
    [1.05, -1.75],
    [-1.05, 0.32],
    [1.05, 0.32],
  ];
  pillarCoords.forEach(([px, pz]) => {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.095, 2.15, 10),
      goldMat
    );
    pillar.position.set(px, 2.12, pz);
    pillar.castShadow = true;
    root.add(pillar);
  });

  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.75, 1.05, 8), canopyMat);
  roof.position.set(0, 3.62, -0.72);
  roof.castShadow = true;
  root.add(roof);

  const kalasha = new THREE.Mesh(
    new THREE.ConeGeometry(0.24, 0.6, 12),
    goldMat
  );
  kalasha.userData._lodDetail = true;
  kalasha.position.set(0, 4.35, -0.72);
  root.add(kalasha);

  // Royal Seated Throne Bench & Cushion with clean back clearance so clothing never clips outside
  const seatBench = new THREE.Mesh(
    new THREE.BoxGeometry(1.18, 0.24, 0.72),
    teakMat
  );
  seatBench.position.set(0, 1.24, -0.84);
  seatBench.castShadow = true;
  root.add(seatBench);

  const seatCushion = new THREE.Mesh(
    new THREE.BoxGeometry(1.06, 0.14, 0.64),
    canopyMat
  );
  seatCushion.position.set(0, 1.38, -0.82);
  root.add(seatCushion);

  const backrest = new THREE.Mesh(
    new THREE.BoxGeometry(1.16, 0.62, 0.12),
    goldMat
  );
  backrest.position.set(0, 1.68, -1.18);
  backrest.rotation.x = -0.06;
  backrest.castShadow = true;
  root.add(backrest);

  const makeWheel = (xPos: number) => {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(xPos, 0.995, -0.6);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.095, 12, 28),
      goldMat
    );
    rim.rotation.y = Math.PI / 2;
    rim.castShadow = true;
    wheelGroup.add(rim);

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 0.26, 12),
      goldMat
    );
    hub.rotation.z = Math.PI / 2;
    wheelGroup.add(hub);

    for (let i = 0; i < 8; i++) {
      const spoke = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.032, 1.72, 6),
        teakMat
      );
      spoke.rotation.x = (i * Math.PI) / 8;
      wheelGroup.add(spoke);
    }
    return wheelGroup;
  };

  const leftWheel = makeWheel(-1.32);
  const rightWheel = makeWheel(1.32);
  root.add(leftWheel, rightWheel);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, 3.3, 10),
    goldMat
  );
  pole.rotation.x = Math.PI / 2;
  pole.position.set(0, 1.05, 1.95);
  root.add(pole);

  // Twin Sculpted Royal White War Steeds with Detailed Facial Features, Flowing Manes, Bushy Tails & Ornate Harnesses
  const horseLegs: THREE.Group[] = [];
  const horseKnees: THREE.Group[] = [];
  const steeds: RoyalHorseRig[] = [];
  const horseCoatMat = new THREE.MeshPhysicalMaterial({
    color: 0xf8f5ed,
    roughness: 0.36,
    metalness: 0.04,
    clearcoat: 0.22,
    clearcoatRoughness: 0.45,
    sheen: 0.42,
    sheenRoughness: 0.48,
    sheenColor: new THREE.Color(0xffffff),
  });
  const whiteManeMat = new THREE.MeshPhysicalMaterial({
    color: 0xf2eee3,
    roughness: 0.46,
    sheen: 0.85,
    sheenRoughness: 0.35,
    sheenColor: new THREE.Color(0xfff7e6),
  });
  const horseGemMat = new THREE.MeshPhysicalMaterial({
    color: 0xd1263c,
    roughness: 0.15,
    clearcoat: 1.0,
  });

  // Wooden Yoke Bar linking horses cleanly to the central Ratha pole
  const yokeBar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 1.95, 10),
    goldMat
  );
  yokeBar.rotation.z = Math.PI / 2;
  yokeBar.position.set(0, 1.48, 3.28);
  root.add(yokeBar);

  [-0.8, 0.8].forEach((xOffset) => {
    const steed = createRoyalHorseUnit(
      horseCoatMat,
      whiteManeMat,
      canopyMat,
      goldMat,
      horseGemMat,
      true
    );
    steed.group.position.set(xOffset, 0, 2.75);
    steeds.push(steed);
    horseLegs.push(...steed.legs);
    horseKnees.push(...steed.knees);
    root.add(steed.group);
  });

  // Dynamic Zero-GC Rein Meshes extending from Twin Steeds' Bridles to Ram's Hands (or Front Rail Hooks)
  const leftBridleHook = new THREE.Vector3(-0.91, 1.77, 4.11);
  const rightBridleHook = new THREE.Vector3(0.91, 1.77, 4.11);
  const leftRailHook = new THREE.Vector3(-0.34, 2.02, 1.35);
  const rightRailHook = new THREE.Vector3(0.34, 2.02, 1.35);

  const leftReinMesh = createReinTubeMesh(goldMat);
  const rightReinMesh = createReinTubeMesh(goldMat);
  updateDynamicReinMesh(leftReinMesh, leftBridleHook, leftRailHook);
  updateDynamicReinMesh(rightReinMesh, rightBridleHook, rightRailHook);
  root.add(leftReinMesh, rightReinMesh);

  return {
    root,
    leftWheel,
    rightWheel,
    horseLegs,
    horseKnees,
    steeds,
    leftReinMesh,
    rightReinMesh,
    leftBridleHook,
    rightBridleHook,
    leftRailHook,
    rightRailHook,
    contactShadow,
  };
}

const _reinP0 = new THREE.Vector3();
const _reinP1 = new THREE.Vector3();
const _reinP2 = new THREE.Vector3();
const _reinP3 = new THREE.Vector3();
const _reinPt = new THREE.Vector3();
const _reinNext = new THREE.Vector3();
const _reinTan = new THREE.Vector3();
const _reinSide = new THREE.Vector3();
const _reinUp = new THREE.Vector3();
const _reinWorldUp = new THREE.Vector3(0, 1, 0);

/**
 * Updates a 16-segment cylindrical rein mesh in-place with natural catenary sag (zero GC).
 */
export function updateDynamicReinMesh(
  mesh: THREE.Mesh,
  startLocal: THREE.Vector3,
  endLocal: THREE.Vector3,
  sag = 0.24
): void {
  const segs = 16;
  const radSegs = 6;
  const radius = 0.015;
  const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const normAttr = mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;
  const pArr = posAttr.array as Float32Array;
  const nArr = normAttr.array as Float32Array;

  _reinP0.copy(startLocal);
  _reinP3.copy(endLocal);
  _reinP1.lerpVectors(_reinP0, _reinP3, 0.34);
  _reinP1.y -= sag;
  _reinP2.lerpVectors(_reinP0, _reinP3, 0.68);
  _reinP2.y -= sag * 0.85;

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const it = 1 - t;
    const a = it * it * it;
    const b = 3 * it * it * t;
    const c = 3 * it * t * t;
    const d = t * t * t;
    _reinPt.set(
      a * _reinP0.x + b * _reinP1.x + c * _reinP2.x + d * _reinP3.x,
      a * _reinP0.y + b * _reinP1.y + c * _reinP2.y + d * _reinP3.y,
      a * _reinP0.z + b * _reinP1.z + c * _reinP2.z + d * _reinP3.z
    );

    const t2 = i === segs ? t - 0.04 : Math.min(1, t + 0.04);
    const it2 = 1 - t2;
    const a2 = it2 * it2 * it2;
    const b2 = 3 * it2 * it2 * t2;
    const c2 = 3 * it2 * t2 * t2;
    const d2 = t2 * t2 * t2;
    _reinNext.set(
      a2 * _reinP0.x + b2 * _reinP1.x + c2 * _reinP2.x + d2 * _reinP3.x,
      a2 * _reinP0.y + b2 * _reinP1.y + c2 * _reinP2.y + d2 * _reinP3.y,
      a2 * _reinP0.z + b2 * _reinP1.z + c2 * _reinP2.z + d2 * _reinP3.z
    );

    if (i === segs) {
      _reinTan.subVectors(_reinPt, _reinNext);
    } else {
      _reinTan.subVectors(_reinNext, _reinPt);
    }
    if (_reinTan.lengthSq() < 1e-6) _reinTan.set(0, 0, -1);
    _reinTan.normalize();

    _reinSide.crossVectors(_reinTan, _reinWorldUp);
    if (_reinSide.lengthSq() < 1e-5) _reinSide.set(1, 0, 0);
    _reinSide.normalize();
    _reinUp.crossVectors(_reinSide, _reinTan).normalize();

    for (let j = 0; j <= radSegs; j++) {
      const ang = (j / radSegs) * Math.PI * 2;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const nx = _reinSide.x * ca + _reinUp.x * sa;
      const ny = _reinSide.y * ca + _reinUp.y * sa;
      const nz = _reinSide.z * ca + _reinUp.z * sa;
      const vIdx = (i * (radSegs + 1) + j) * 3;
      pArr[vIdx] = _reinPt.x + nx * radius;
      pArr[vIdx + 1] = _reinPt.y + ny * radius;
      pArr[vIdx + 2] = _reinPt.z + nz * radius;
      nArr[vIdx] = nx;
      nArr[vIdx + 1] = ny;
      nArr[vIdx + 2] = nz;
    }
  }

  posAttr.needsUpdate = true;
  normAttr.needsUpdate = true;
  mesh.geometry.computeBoundingSphere();
}

export function createTempleModel(
  textures: ProceduralTextures,
  x: number,
  z: number,
  scale: number,
  rotY: number
): { group: THREE.Group; collider: BoxCollider } {
  const group = new THREE.Group();
  const baseY = Math.max(RIVER_SURFACE_Y + 0.35, groundHeightAt(x, z));
  group.position.set(x, baseY, z);
  group.rotation.y = rotY;
  group.scale.setScalar(scale);

  const stoneMat = new THREE.MeshPhysicalMaterial({
    map: textures.sandstone,
    normalMap: textures.sandstoneNormal,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughnessMap: textures.sandstoneRoughness,
    aoMap: textures.sandstoneAO,
    aoMapIntensity: 0.75,
    color: 0xe4bf8e,
    roughness: 0.84,
    metalness: 0.05,
    ior: 1.54,
    specularIntensity: 0.42,
  });
  const trimMat = new THREE.MeshPhysicalMaterial({
    map: textures.sandstone,
    normalMap: textures.sandstoneNormal,
    roughnessMap: textures.sandstoneRoughness,
    aoMap: textures.sandstoneAO,
    aoMapIntensity: 0.72,
    color: 0x9f6635,
    roughness: 0.74,
    metalness: 0.16,
    ior: 1.54,
    specularIntensity: 0.5,
  });
  const goldMat = new THREE.MeshPhysicalMaterial({
    map: textures.armorMetal,
    normalMap: textures.armorNormal,
    roughnessMap: textures.armorRoughness,
    metalnessMap: textures.armorMetalness,
    color: 0xf4c24e,
    roughness: 0.28,
    metalness: 0.94,
    ior: 1.62,
    specularIntensity: 1.0,
    anisotropy: 0.5,
    clearcoat: 0.25,
  });
  const sanctumGlowMat = new THREE.MeshPhysicalMaterial({
    color: 0xffc15e,
    emissive: 0xff8c1a,
    emissiveIntensity: 1.25,
    roughness: 0.28,
    ior: 1.5,
  });

  const plinth1 = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.95, 12.6), stoneMat);
  plinth1.position.y = 0.47;
  plinth1.castShadow = true;
  plinth1.receiveShadow = true;
  group.add(plinth1);

  const plinth2 = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.85, 10.5), trimMat);
  plinth2.position.y = 1.35;
  plinth2.castShadow = true;
  plinth2.receiveShadow = true;
  group.add(plinth2);

  const core = new THREE.Mesh(new THREE.BoxGeometry(7.4, 5.5, 7.4), stoneMat);
  core.position.y = 4.45;
  core.castShadow = true;
  core.receiveShadow = true;
  group.add(core);

  // Carved sandstone cornice molding & wall pilasters for temple relief depth
  const corniceBand = new THREE.Mesh(new THREE.BoxGeometry(7.9, 0.36, 7.9), trimMat);
  corniceBand.userData._lodDetail = true;
  corniceBand.position.y = 7.08;
  group.add(corniceBand);

  const doorway = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 3.4, 0.45),
    sanctumGlowMat
  );
  doorway.position.set(0, 3.4, 3.68);
  group.add(doorway);

  [
    [-4.4, 4.4],
    [4.4, 4.4],
    [-4.4, -4.4],
    [4.4, -4.4],
  ].forEach(([px, pz]) => {
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.48, 5.7, 12),
      trimMat
    );
    col.position.set(px, 4.55, pz);
    col.castShadow = true;
    group.add(col);

    const basePlinth = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.34, 1.08), stoneMat);
    basePlinth.userData._lodDetail = true;
    basePlinth.position.set(px, 1.88, pz);
    group.add(basePlinth);
  });

  const tiers = [
    { w: 7.9, h: 1.5, y: 7.9 },
    { w: 5.9, h: 1.6, y: 9.45 },
    { w: 4.1, h: 1.7, y: 11.1 },
    { w: 2.4, h: 1.5, y: 12.7 },
  ];
  tiers.forEach((t, idx) => {
    const tier = new THREE.Mesh(
      new THREE.BoxGeometry(t.w, t.h, t.w),
      idx % 2 === 0 ? stoneMat : trimMat
    );
    tier.position.y = t.y;
    tier.castShadow = true;
    group.add(tier);
  });

  const amalaka = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.35, 0.58, 18),
    goldMat
  );
  amalaka.position.y = 13.75;
  group.add(amalaka);

  const kalasha = new THREE.Mesh(
    new THREE.ConeGeometry(0.58, 1.55, 14),
    goldMat
  );
  kalasha.position.y = 14.8;
  kalasha.castShadow = true;
  group.add(kalasha);

  return {
    group,
    collider: {
      x,
      z,
      halfW: 6.3 * scale,
      halfD: 6.3 * scale,
      height: 15.5 * scale,
      rotY,
      baseY: group.position.y,
    },
  };
}

export function createPavilionModel(
  textures: ProceduralTextures,
  x: number,
  z: number,
  scale: number,
  rotY: number
): { group: THREE.Group; collider: BoxCollider } {
  const group = new THREE.Group();
  const baseY = Math.max(RIVER_SURFACE_Y + 0.35, groundHeightAt(x, z));
  group.position.set(x, baseY, z);
  group.rotation.y = rotY;
  group.scale.setScalar(scale);

  const wallMat = new THREE.MeshStandardMaterial({
    map: textures.sandstone,
    normalMap: textures.sandstoneNormal,
    aoMap: textures.sandstoneAO,
    aoMapIntensity: 0.68,
    color: 0xdfb988,
    roughness: 0.78,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    map: textures.silkGold,
    normalMap: textures.silkNormal,
    color: 0xa6462b,
    roughness: 0.65,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    map: textures.bark,
    normalMap: textures.barkNormal,
    color: 0x6a4326,
    roughness: 0.76,
  });

  const base = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.75, 7.2), wallMat);
  base.position.y = 0.37;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const body = new THREE.Mesh(new THREE.BoxGeometry(8.1, 3.65, 6.1), wallMat);
  body.position.y = 2.52;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  [-3.8, -1.3, 1.3, 3.8].forEach((cx) => {
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.23, 3.55, 10),
      woodMat
    );
    col.position.set(cx, 2.48, 3.35);
    col.castShadow = true;
    group.add(col);
  });

  const roof = new THREE.Mesh(new THREE.ConeGeometry(6.7, 2.4, 4), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 5.5;
  roof.castShadow = true;
  group.add(roof);

  return {
    group,
    collider: {
      x,
      z,
      halfW: 4.65 * scale,
      halfD: 3.65 * scale,
      height: 6.7 * scale,
      rotY,
      baseY: group.position.y,
    },
  };
}

export function createMahadevStatueModel(
  textures: ProceduralTextures,
  x = 0,
  z = 0
): { group: THREE.Group; radius: number; height: number; waterUniforms: { uTime: { value: number } } } {
  const group = new THREE.Group();
  const baseY = Math.max(RIVER_SURFACE_Y + 0.35, groundHeightAt(x, z));
  group.position.set(x, baseY, z);

  const waterUniforms = { uTime: { value: 0 } };

  // Clean Stone, Basalt, Bronze & Photorealistic Continuous Fluid-Simulation Water Materials
  const sandstoneMat = new THREE.MeshPhysicalMaterial({
    map: textures.sandstone,
    normalMap: textures.sandstoneNormal,
    roughnessMap: textures.sandstoneRoughness,
    color: 0xd9b382,
    roughness: 0.86,
    ior: 1.54,
    specularIntensity: 0.42,
  });
  const basaltMat = new THREE.MeshPhysicalMaterial({
    map: textures.darkBasalt,
    normalMap: textures.darkBasaltNormal,
    normalScale: new THREE.Vector2(0.8, 0.8),
    color: 0x16181f,
    roughness: 0.22,
    metalness: 0.18,
    ior: 1.62,
    specularIntensity: 0.9,
    clearcoat: 0.72,
    clearcoatRoughness: 0.18,
  });

  // Photorealistic GLSL Wet-Film & Dripping Rivulet Basalt Material for the Shivling & Yoni-Peetham
  const wetLingamBasaltMat = basaltMat.clone();
  wetLingamBasaltMat.roughness = 0.14;
  wetLingamBasaltMat.clearcoat = 1.0;
  wetLingamBasaltMat.clearcoatRoughness = 0.05;
  wetLingamBasaltMat.customProgramCacheKey = () => 'shivling-wet-fluid-v1';
  wetLingamBasaltMat.onBeforeCompile = (shader) => {
    shader.uniforms.uFluidTime = waterUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vFluidObjPos;
        varying vec3 vFluidObjNorm;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vFluidObjPos = position;
        vFluidObjNorm = normal;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFluidTime;
        varying vec3 vFluidObjPos;
        varying vec3 vFluidObjNorm;
        float shivHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float shivNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(shivHash(i), shivHash(i + vec2(1.0, 0.0)), f.x),
            mix(shivHash(i + vec2(0.0, 1.0)), shivHash(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float sAng = atan(vFluidObjPos.z, vFluidObjPos.x);
        float flowY = vFluidObjPos.y + uFluidTime * 1.45;
        float meander = sin(vFluidObjPos.y * 2.4 + uFluidTime * 0.9 + sAng * 2.0) * 0.22;
        float rivuletWave = sin((sAng + meander) * 14.0 + shivNoise(vec2(sAng * 3.0, flowY * 0.7)) * 2.2);
        float rivuletMask = smoothstep(0.28, 0.92, rivuletWave);
        float dropBead = smoothstep(0.68, 0.98, sin(vFluidObjPos.y * 7.5 + uFluidTime * 3.6 + sAng * 5.0));
        float sheetRipple = shivNoise(vec2(sAng * 6.0, vFluidObjPos.y * 4.5 + uFluidTime * 2.1));
        float wetMask = clamp(0.42 + rivuletMask * 0.45 + dropBead * 0.35 + sheetRipple * 0.25, 0.0, 1.0);
        roughnessFactor = mix(roughnessFactor, 0.025, wetMask);`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float sAngE = atan(vFluidObjPos.z, vFluidObjPos.x);
        float meanderE = sin(vFluidObjPos.y * 2.4 + uFluidTime * 0.9 + sAngE * 2.0) * 0.22;
        float rivE = smoothstep(0.45, 0.96, sin((sAngE + meanderE) * 14.0));
        float beadE = smoothstep(0.74, 0.995, sin(vFluidObjPos.y * 7.5 + uFluidTime * 3.6 + sAngE * 5.0));
        float causticE = shivNoise(vec2(sAngE * 8.0, vFluidObjPos.y * 5.5 + uFluidTime * 2.4));
        float streakGlow = (rivE * (0.28 + 0.72 * causticE) + beadE * 0.85) * (0.35 + 0.65 * (1.0 - abs(vFluidObjNorm.y)));
        diffuseColor.rgb *= mix(1.0, 0.68, clamp(rivE * 0.7 + 0.25, 0.0, 0.85));
        totalEmissiveRadiance += vec3(0.32, 0.74, 0.98) * (streakGlow * 0.24);`
      );
  };

  const vibhutiWhiteMat = new THREE.MeshPhysicalMaterial({
    color: 0xf7f5ef,
    emissive: 0xf2eee2,
    emissiveIntensity: 0.12,
    roughness: 0.45,
    ior: 1.48,
  });
  const nandiStoneMat = new THREE.MeshPhysicalMaterial({
    map: textures.sandstone,
    roughnessMap: textures.sandstoneRoughness,
    color: 0x9aa4b0,
    roughness: 0.54,
    metalness: 0.12,
    ior: 1.56,
    clearcoat: 0.3,
  });
  const tortoiseBronzeMat = new THREE.MeshPhysicalMaterial({
    map: textures.armorMetal,
    roughnessMap: textures.armorRoughness,
    color: 0x7d6034,
    roughness: 0.44,
    metalness: 0.68,
    ior: 1.6,
  });
  const goldMat = new THREE.MeshPhysicalMaterial({
    map: textures.armorMetal,
    normalMap: textures.armorNormal,
    roughnessMap: textures.armorRoughness,
    color: 0xf2c249,
    roughness: 0.32,
    metalness: 0.9,
    ior: 1.62,
    specularIntensity: 1.0,
    anisotropy: 0.5,
  });
  const serpentMat = new THREE.MeshPhysicalMaterial({
    color: 0x1e2b24,
    roughness: 0.32,
    metalness: 0.32,
    ior: 1.55,
    clearcoat: 0.65,
  });
  const serpentBellyMat = new THREE.MeshPhysicalMaterial({
    color: 0xb69c5e,
    roughness: 0.5,
    ior: 1.48,
  });
  const serpentEyeMat = new THREE.MeshPhysicalMaterial({
    color: 0xffc857,
    emissive: 0xff6a1a,
    emissiveIntensity: 1.6,
    roughness: 0.12,
    ior: 1.52,
    clearcoat: 0.9,
  });

  // Animated Continuous Pouring & Rippling Abhishekam Water Stream Shader
  const waterStreamMat = new THREE.MeshPhysicalMaterial({
    color: 0x8ae0ff,
    emissive: 0x2292cc,
    emissiveIntensity: 0.42,
    roughness: 0.04,
    metalness: 0.08,
    ior: 1.333,
    reflectivity: 0.96,
    specularIntensity: 1.0,
    transparent: true,
    opacity: 0.84,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
  });
  waterStreamMat.customProgramCacheKey = () => 'shivling-abhishekam-stream-v1';
  waterStreamMat.onBeforeCompile = (shader) => {
    shader.uniforms.uFluidTime = waterUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFluidTime;
        varying vec2 vStreamUv;
        varying vec3 vStreamObjNorm;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vStreamUv = uv;
        vStreamObjNorm = normal;
        float fluidWobble = sin(position.y * 8.5 + uFluidTime * 9.5 + position.x * 6.0) * 0.008;
        transformed += normal * fluidWobble;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFluidTime;
        varying vec2 vStreamUv;
        varying vec3 vStreamObjNorm;`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float isPool = step(0.75, abs(vStreamObjNorm.y));
        float dropStreak = sin(vStreamUv.y * 28.0 + uFluidTime * 11.5 + sin(vStreamUv.x * 18.0 + uFluidTime * 2.5));
        float helicalFoam = cos(vStreamUv.x * 22.0 - vStreamUv.y * 16.0 - uFluidTime * 9.0);
        float flowBand = smoothstep(-0.2, 0.92, dropStreak * 0.65 + helicalFoam * 0.35);
        float poolRad = length(vStreamUv - vec2(0.5)) * 24.0;
        float poolRing = 0.5 + 0.5 * sin(poolRad - uFluidTime * 7.2);
        float waterHighlight = mix(flowBand, pow(poolRing, 2.5), isPool);
        totalEmissiveRadiance += vec3(0.45, 0.86, 1.0) * (waterHighlight * 0.38);
        diffuseColor.a = clamp(opacity * mix(0.72 + 0.28 * flowBand, 0.78 + 0.22 * poolRing, isPool), 0.38, 0.94);`
      );
  };

  // Translucent Waterfall Veil Wrapping Shivling Dome & Shaft with Dripping Beads
  const waterVeilMat = new THREE.MeshPhysicalMaterial({
    color: 0xa2ebff,
    emissive: 0x35a8e0,
    emissiveIntensity: 0.36,
    roughness: 0.03,
    metalness: 0.05,
    ior: 1.333,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    side: THREE.FrontSide,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
  });
  waterVeilMat.customProgramCacheKey = () => 'shivling-water-veil-v1';
  waterVeilMat.onBeforeCompile = (shader) => {
    shader.uniforms.uFluidTime = waterUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFluidTime;
        varying vec3 vVeilPos;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vVeilPos = position;
        float vAng = atan(position.z, position.x);
        float wave = sin(position.y * 7.0 + uFluidTime * 6.5 + vAng * 6.0) * 0.012;
        transformed += normal * wave;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFluidTime;
        varying vec3 vVeilPos;`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float angV = atan(vVeilPos.z, vVeilPos.x);
        float sway = sin(vVeilPos.y * 2.8 + uFluidTime * 1.1 + angV * 2.0) * 0.24;
        float riv = smoothstep(0.15, 0.92, sin((angV + sway) * 14.0));
        float drip = smoothstep(0.62, 0.98, sin(vVeilPos.y * 9.0 + uFluidTime * 4.4 + angV * 4.0));
        float streamIntensity = clamp(riv * 0.65 + drip * 0.85, 0.0, 1.0);
        diffuseColor.a = streamIntensity * 0.56;
        if (diffuseColor.a < 0.04) discard;
        totalEmissiveRadiance += vec3(0.45, 0.86, 1.0) * (streamIntensity * 0.34);`
      );
  };

  // 1. Stepped Carved Stone Sanctuary Apron (y = 0 .. 1.15m, clean geometry with zero petals/flowers)
  const dais1 = new THREE.Mesh(
    new THREE.CylinderGeometry(5.1, 5.45, 0.55, 24),
    sandstoneMat
  );
  dais1.position.y = 0.275;
  dais1.castShadow = true;
  dais1.receiveShadow = true;
  group.add(dais1);

  const dais2 = new THREE.Mesh(
    new THREE.CylinderGeometry(3.45, 3.8, 0.6, 24),
    basaltMat
  );
  dais2.position.y = 0.85;
  dais2.castShadow = true;
  dais2.receiveShadow = true;
  group.add(dais2);

  // 2. Prominent Black Basalt Yoni-Peetham & Extended Pranali Spout + Towering Wet Black Basalt Shivling
  const peethLower = new THREE.Mesh(
    new THREE.CylinderGeometry(2.15, 2.48, 0.72, 28),
    wetLingamBasaltMat
  );
  peethLower.position.y = 1.51;
  peethLower.castShadow = true;
  peethLower.receiveShadow = true;
  group.add(peethLower);

  const peethRim = new THREE.Mesh(
    new THREE.TorusGeometry(2.18, 0.24, 12, 32),
    wetLingamBasaltMat
  );
  peethRim.rotation.x = Math.PI / 2;
  peethRim.position.y = 1.98;
  peethRim.castShadow = true;
  group.add(peethRim);

  // Rippling sacred water film collected inside the Yoni-Peetham channel
  const peethWaterPool = new THREE.Mesh(
    new THREE.CylinderGeometry(1.96, 1.96, 0.04, 28),
    waterStreamMat
  );
  peethWaterPool.position.y = 1.96;
  group.add(peethWaterPool);

  // Extended Pranali Channel Spout projecting to +X into a Stone Water Basin
  const pranaliChannel = new THREE.Mesh(
    new THREE.BoxGeometry(2.35, 0.34, 0.78),
    wetLingamBasaltMat
  );
  pranaliChannel.position.set(2.45, 1.9, 0);
  pranaliChannel.castShadow = true;
  group.add(pranaliChannel);

  const shivlingGroup = new THREE.Group();
  shivlingGroup.position.set(0, 1.95, 0);
  group.add(shivlingGroup);

  const lingamShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(1.12, 1.24, 3.15, 32),
    wetLingamBasaltMat
  );
  lingamShaft.position.y = 1.57;
  lingamShaft.castShadow = true;
  lingamShaft.receiveShadow = true;
  shivlingGroup.add(lingamShaft);

  const lingamDome = new THREE.Mesh(
    new THREE.SphereGeometry(1.12, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.55),
    wetLingamBasaltMat
  );
  lingamDome.position.y = 3.12;
  lingamDome.castShadow = true;
  lingamDome.receiveShadow = true;
  shivlingGroup.add(lingamDome);

  // Continuous Flowing & Dripping Abhishekam Water Veil Over Shivling Dome & Shaft
  const waterVeilShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(1.145, 1.265, 3.16, 32, 8, true),
    waterVeilMat
  );
  waterVeilShaft.position.y = 1.57;
  shivlingGroup.add(waterVeilShaft);

  const waterVeilDome = new THREE.Mesh(
    new THREE.SphereGeometry(1.145, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
    waterVeilMat
  );
  waterVeilDome.position.y = 3.12;
  shivlingGroup.add(waterVeilDome);

  // Crown Splash Halo where the Jalpatra stream strikes the Shivling apex
  const domeSplashCrown = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.055, 8, 20),
    waterStreamMat
  );
  domeSplashCrown.rotation.x = Math.PI / 2;
  domeSplashCrown.position.set(0, 4.24, 0.1);
  shivlingGroup.add(domeSplashCrown);

  // Clean Sacred White Tripundra Markings on Front of Black Basalt Shivling
  [-0.28, 0, 0.28].forEach((ty) => {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.052, 8, 32, Math.PI * 0.56),
      vibhutiWhiteMat
    );
    band.rotation.x = Math.PI / 2;
    band.rotation.z = -(Math.PI * 0.5 - Math.PI * 0.28);
    band.position.y = 2.35 + ty;
    shivlingGroup.add(band);
  });

  // 3. Vasuki Nag Coiling Around Shivling Shaft with Flared Cobra Hood Sheltering Overhead
  const serpentPoints: THREE.Vector3[] = [];
  const coilSamples = 64;
  for (let i = 0; i <= coilSamples; i++) {
    const t = i / coilSamples;
    const ang = t * Math.PI * 2 * 2.2 - 0.6;
    const r = THREE.MathUtils.lerp(1.42, 1.28, t);
    const sy = THREE.MathUtils.lerp(2.35, 5.45, t);
    serpentPoints.push(
      new THREE.Vector3(Math.cos(ang) * r, sy, Math.sin(ang) * r)
    );
  }
  // Arch cleanly up behind and bend forward over the Shivling dome
  serpentPoints.push(
    new THREE.Vector3(0, 6.25, -1.25),
    new THREE.Vector3(0, 6.95, -0.78),
    new THREE.Vector3(0, 6.82, -0.05)
  );
  const serpentCurve = new THREE.CatmullRomCurve3(serpentPoints);
  const serpentBody = new THREE.Mesh(
    new THREE.TubeGeometry(serpentCurve, 96, 0.22, 12, false),
    serpentMat
  );
  serpentBody.castShadow = true;
  group.add(serpentBody);

  // Flared Five-Ridged King Cobra Hood Directly Sheltering the Shivling Dome
  const cobraHeadGroup = new THREE.Group();
  cobraHeadGroup.position.set(0, 6.82, -0.05);
  cobraHeadGroup.rotation.x = 0.22;
  group.add(cobraHeadGroup);

  const cobraHood = new THREE.Mesh(
    new THREE.SphereGeometry(0.92, 18, 14),
    serpentMat
  );
  cobraHood.scale.set(1.26, 1.28, 0.3);
  cobraHood.position.set(0, 0.08, -0.18);
  cobraHood.castShadow = true;
  cobraHeadGroup.add(cobraHood);

  const cobraHoodBelly = new THREE.Mesh(
    new THREE.SphereGeometry(0.74, 16, 12),
    serpentBellyMat
  );
  cobraHoodBelly.scale.set(1.12, 1.16, 0.24);
  cobraHoodBelly.position.set(0, 0.05, -0.06);
  cobraHeadGroup.add(cobraHoodBelly);

  const cobraSnout = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.85, 10),
    serpentMat
  );
  cobraSnout.rotation.x = Math.PI * 0.56;
  cobraSnout.position.set(0, 0.26, 0.34);
  cobraHeadGroup.add(cobraSnout);

  [-1, 1].forEach((side) => {
    const sEye = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 8, 8),
      serpentEyeMat
    );
    sEye.position.set(side * 0.2, 0.35, 0.26);
    cobraHeadGroup.add(sEye);

    const fang = new THREE.Mesh(
      new THREE.ConeGeometry(0.032, 0.16, 6),
      vibhutiWhiteMat
    );
    fang.rotation.x = Math.PI;
    fang.position.set(side * 0.12, 0.14, 0.58);
    cobraHeadGroup.add(fang);
  });

  // 4. Overhead Golden Kalasha Stand & Long Continuous Water Stream (Abhishekam + Long Pranali Waterfall)
  [-2.1, 2.1].forEach((px) => {
    const archPillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.12, 7.2, 10),
      goldMat
    );
    archPillar.position.set(px, 4.7, -0.8);
    archPillar.castShadow = true;
    group.add(archPillar);
  });

  const archCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2.1, 8.2, -0.8),
    new THREE.Vector3(-1.3, 8.95, -0.4),
    new THREE.Vector3(0, 9.25, 0),
    new THREE.Vector3(1.3, 8.95, -0.4),
    new THREE.Vector3(2.1, 8.2, -0.8),
  ]);
  const archBeam = new THREE.Mesh(
    new THREE.TubeGeometry(archCurve, 28, 0.085, 8, false),
    goldMat
  );
  group.add(archBeam);

  // Suspended Golden Jalpatra Kalasha Vessel Pouring Water From High Above
  const jalpatra = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 16, 12),
    goldMat
  );
  jalpatra.scale.set(1.0, 1.18, 1.0);
  jalpatra.position.set(0, 8.5, 0);
  group.add(jalpatra);

  const kalashaSpout = new THREE.Mesh(
    new THREE.ConeGeometry(0.11, 0.34, 10),
    goldMat
  );
  kalashaSpout.rotation.x = Math.PI;
  kalashaSpout.position.set(0, 7.9, 0);
  group.add(kalashaSpout);

  // Tall Continuous Overhead Stream Falling Onto the Shivling Dome (y = 7.75 -> 6.18m)
  const overheadStream = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.1, 1.75, 14),
    waterStreamMat
  );
  overheadStream.position.set(0, 6.95, 0.12);
  group.add(overheadStream);

  // Long Cascading Water Stream Flowing Along Extended Pranali Channel & Pouring Down Into Stone Basin
  const longWaterCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.15, 2.08, 0),
    new THREE.Vector3(2.3, 2.05, 0),
    new THREE.Vector3(3.52, 1.98, 0),
    new THREE.Vector3(3.98, 1.45, 0),
    new THREE.Vector3(4.24, 0.85, 0),
    new THREE.Vector3(4.32, 0.56, 0),
  ]);
  const longWaterStream = new THREE.Mesh(
    new THREE.TubeGeometry(longWaterCurve, 32, 0.13, 10, false),
    waterStreamMat
  );
  group.add(longWaterStream);

  // Carved Stone Water Catch Basin Beneath the Long Stream
  const basinRim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.82, 0.92, 0.44, 18),
    basaltMat
  );
  basinRim.position.set(4.32, 0.52, 0);
  group.add(basinRim);

  const basinWater = new THREE.Mesh(
    new THREE.CylinderGeometry(0.68, 0.68, 0.08, 18),
    waterStreamMat
  );
  basinWater.position.set(4.32, 0.72, 0);
  group.add(basinWater);

  // 5. Nandi Maharaj (Sculpted Sacred Bull Kneeling Reverently Facing the Shivling at +Z -> -Z)
  const nandiGroup = new THREE.Group();
  nandiGroup.position.set(0, 0.55, 3.65);
  nandiGroup.rotation.y = Math.PI; // facing -Z directly toward the Shivling
  group.add(nandiGroup);

  const nandiPedestal = new THREE.Mesh(
    new THREE.BoxGeometry(1.55, 0.24, 2.15),
    basaltMat
  );
  nandiPedestal.position.y = 0.12;
  nandiPedestal.castShadow = true;
  nandiGroup.add(nandiPedestal);

  const nandiBody = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.42, 0.96, 8, 14),
    nandiStoneMat
  );
  nandiBody.rotation.x = Math.PI / 2;
  nandiBody.position.set(0, 0.64, 0);
  nandiBody.castShadow = true;
  nandiGroup.add(nandiBody);

  // Sacred Shoulder Hump (Kakud)
  const nandiHump = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 10),
    nandiStoneMat
  );
  nandiHump.scale.set(0.85, 1.15, 1.0);
  nandiHump.position.set(0, 1.04, 0.34);
  nandiGroup.add(nandiHump);

  const nandiNeck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.32, 0.56, 12),
    nandiStoneMat
  );
  nandiNeck.position.set(0, 0.96, 0.58);
  nandiNeck.rotation.x = 0.48;
  nandiGroup.add(nandiNeck);

  // Carved Stone Bell Collar (zero floral garlands)
  const nandiBellCollar = new THREE.Mesh(
    new THREE.TorusGeometry(0.27, 0.04, 8, 18),
    goldMat
  );
  nandiBellCollar.position.set(0, 0.85, 0.52);
  nandiBellCollar.rotation.x = 0.48 + Math.PI / 2;
  nandiGroup.add(nandiBellCollar);

  const nandiHead = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.3, 0.52),
    nandiStoneMat
  );
  nandiHead.position.set(0, 1.16, 0.86);
  nandiHead.rotation.x = 0.26;
  nandiHead.castShadow = true;
  nandiGroup.add(nandiHead);

  [-1, 1].forEach((side) => {
    const horn = new THREE.Mesh(
      new THREE.ConeGeometry(0.055, 0.38, 8),
      nandiStoneMat
    );
    horn.position.set(side * 0.16, 1.38, 0.76);
    horn.rotation.z = -side * 0.48;
    horn.rotation.x = 0.35;
    nandiGroup.add(horn);

    const nEye = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 8, 8),
      basaltMat
    );
    nEye.position.set(side * 0.16, 1.2, 0.92);
    nandiGroup.add(nEye);

    // Folded Kneeling Fore & Hind Legs
    const legFore = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.09, 0.38, 6, 8),
      nandiStoneMat
    );
    legFore.rotation.x = Math.PI / 2;
    legFore.position.set(side * 0.28, 0.32, 0.48);
    nandiGroup.add(legFore);

    const legHind = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.1, 0.4, 6, 8),
      nandiStoneMat
    );
    legHind.rotation.x = Math.PI / 2;
    legHind.position.set(side * 0.3, 0.32, -0.45);
    nandiGroup.add(legHind);
  });

  // 6. Sculpted Tortoise (Kurma) Centered on Approach Before the Shivling
  const kurmaGroup = new THREE.Group();
  kurmaGroup.position.set(0, 0.55, 2.38);
  kurmaGroup.rotation.y = Math.PI; // facing -Z toward Shivling
  group.add(kurmaGroup);

  const kurmaShell = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    tortoiseBronzeMat
  );
  kurmaShell.scale.set(0.95, 0.68, 1.18);
  kurmaShell.position.y = 0.12;
  kurmaShell.castShadow = true;
  kurmaGroup.add(kurmaShell);

  const kurmaRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.4, 0.045, 8, 20),
    tortoiseBronzeMat
  );
  kurmaRim.rotation.x = Math.PI / 2;
  kurmaRim.scale.set(0.96, 1.18, 1.0);
  kurmaRim.position.y = 0.14;
  kurmaGroup.add(kurmaRim);

  const kurmaHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 8),
    tortoiseBronzeMat
  );
  kurmaHead.scale.set(0.85, 0.85, 1.35);
  kurmaHead.position.set(0, 0.18, 0.52);
  kurmaGroup.add(kurmaHead);

  [
    [-0.32, 0.26],
    [0.32, 0.26],
    [-0.3, -0.26],
    [0.3, -0.26],
  ].forEach(([kx, kz]) => {
    const kLeg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.08, 0.16, 8),
      tortoiseBronzeMat
    );
    kLeg.position.set(kx, 0.08, kz);
    kurmaGroup.add(kLeg);
  });

  // 7. Monumental Golden Trident (Trishul) & Damru Planted Beside the Shivling
  const trishulGroup = new THREE.Group();
  trishulGroup.position.set(-2.55, 1.15, 0.75);
  trishulGroup.rotation.z = 0.04;
  group.add(trishulGroup);

  const tShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.095, 0.115, 6.8, 12),
    goldMat
  );
  tShaft.position.y = 3.4;
  tShaft.castShadow = true;
  trishulGroup.add(tShaft);

  const tCrossCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.62, 7.25, 0),
    new THREE.Vector3(-0.44, 6.72, 0),
    new THREE.Vector3(0, 6.58, 0),
    new THREE.Vector3(0.44, 6.72, 0),
    new THREE.Vector3(0.62, 7.25, 0),
  ]);
  const tCross = new THREE.Mesh(
    new THREE.TubeGeometry(tCrossCurve, 24, 0.075, 8, false),
    goldMat
  );
  trishulGroup.add(tCross);

  const tCenterBlade = new THREE.Mesh(
    new THREE.ConeGeometry(0.145, 1.35, 8),
    goldMat
  );
  tCenterBlade.position.y = 7.35;
  trishulGroup.add(tCenterBlade);

  [-0.62, 0.62].forEach((px, i) => {
    const tProng = new THREE.Mesh(
      new THREE.ConeGeometry(0.105, 1.05, 8),
      goldMat
    );
    tProng.position.set(px + (i === 0 ? -0.06 : 0.06), 7.68, 0);
    tProng.rotation.z = i === 0 ? 0.14 : -0.14;
    trishulGroup.add(tProng);
  });

  // Tied Sacred Hourglass Damru Drum
  const damruTop = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 0.34, 12),
    goldMat
  );
  damruTop.position.set(0.28, 5.8, 0);
  damruTop.rotation.x = Math.PI;
  damruTop.rotation.z = 0.25;
  trishulGroup.add(damruTop);
  const damruBot = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 0.34, 12),
    goldMat
  );
  damruBot.position.set(0.22, 5.46, 0);
  damruBot.rotation.z = 0.25;
  trishulGroup.add(damruBot);

  return {
    group,
    radius: 5.5,
    height: 9.8,
    waterUniforms,
  };
}

/**
 * Five Distinct Demon Variants for the Demon Village (strictly no tigers/predators):
 * - BOAR_DEMON: Razor-tusked infernal boar (Animal Variant 1)
 * - RABBIT_DEMON: Horned cursed demon hare (Animal Variant 2)
 * - BRUTE_HUMAN: Molten-veined armored war-club warrior (Human Variant 1)
 * - SORCERER_HUMAN: Hooded curse-staff necromancer (Human Variant 2)
 * - SHADOW_GHOST: Floating translucent smoke wraith (Shadow Ghost Variant)
 */
export function createDemonModel(
  textures: ProceduralTextures,
  variant: DemonVariant,
  isBoss = false
): CharacterRig {
  const root = new THREE.Group();
  const s = isBoss ? 1.42 : 1.14;

  const darkBasaltMat = new THREE.MeshStandardMaterial({
    map: textures.darkBasalt,
    normalMap: textures.darkBasaltNormal,
    color: 0x262228,
    roughness: 0.72,
    metalness: 0.14,
  });
  const charredArmorMat = new THREE.MeshPhysicalMaterial({
    map: textures.armorMetal,
    normalMap: textures.armorNormal,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughnessMap: textures.armorRoughness,
    metalnessMap: textures.armorMetalness,
    color: isBoss ? 0x611e18 : 0x3b353c,
    roughness: 0.38,
    metalness: 0.86,
    ior: 1.6,
  });
  const ivoryBoneMat = new THREE.MeshPhysicalMaterial({
    color: 0xe6dcc4,
    roughness: 0.4,
    ior: 1.54,
    clearcoat: 0.2,
  });

  const makeEmptyLimb = (y = 0) => {
    const g = new THREE.Group();
    g.position.y = y;
    return g;
  };

  if (variant === 'BOAR_DEMON') {
    const boarHideMat = new THREE.MeshPhysicalMaterial({
      map: textures.bark,
      normalMap: textures.barkNormal,
      color: 0x2a1b1d,
      roughness: 0.84,
      sheen: 0.25,
    });
    const redEyeMat = new THREE.MeshPhysicalMaterial({
      color: 0xff3b18,
      emissive: 0xff2a0a,
      emissiveIntensity: 2.2,
      roughness: 0.14,
      ior: 1.52,
      clearcoat: 0.9,
    });
    const contactShadow = createContactShadowMesh(textures.contactShadow, 1.05 * s, 1.35 * s);
    root.add(contactShadow);

    const torso = new THREE.Group();
    torso.position.y = 0.88;
    root.add(torso);

    const barrelBody = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.46, 0.92, 8, 16),
      boarHideMat
    );
    barrelBody.rotation.x = Math.PI / 2;
    barrelBody.position.set(0, 0.08, -0.05);
    barrelBody.castShadow = true;
    torso.add(barrelBody);

    // Jagged dorsal spine bristles
    for (let i = 0; i < 6; i++) {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 0.28 - i * 0.02, 5),
        charredArmorMat
      );
      spike.position.set(0, 0.54 - i * 0.015, 0.36 - i * 0.22);
      spike.rotation.x = -0.35;
      torso.add(spike);
    }

    // Iron shoulder collar harness
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.055, 8, 18),
      charredArmorMat
    );
    collar.position.set(0, 0.14, 0.46);
    collar.rotation.x = 0.22;
    torso.add(collar);

    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.18, 0.68);
    torso.add(headGroup);

    const skull = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 12, 10),
      boarHideMat
    );
    skull.scale.set(0.95, 0.92, 1.15);
    skull.castShadow = true;
    headGroup.add(skull);

    const snout = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.22, 0.42, 10),
      boarHideMat
    );
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, -0.04, 0.36);
    headGroup.add(snout);

    const snoutDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.145, 0.145, 0.05, 12),
      new THREE.MeshStandardMaterial({ color: 0x4f2428, roughness: 0.55 })
    );
    snoutDisc.rotation.x = Math.PI / 2;
    snoutDisc.position.set(0, -0.04, 0.56);
    headGroup.add(snoutDisc);

    // Twin upturned Razor Tusks & Burning Eyes
    [-1, 1].forEach((side) => {
      const tuskCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.12, -0.08, 0.26),
        new THREE.Vector3(side * 0.21, 0.0, 0.42),
        new THREE.Vector3(side * 0.18, 0.22, 0.46),
      ]);
      const tusk = new THREE.Mesh(
        new THREE.TubeGeometry(tuskCurve, 12, 0.036, 7, false),
        ivoryBoneMat
      );
      tusk.castShadow = true;
      headGroup.add(tusk);

      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 8), redEyeMat);
      eye.position.set(side * 0.17, 0.09, 0.24);
      headGroup.add(eye);

      const tuskRing = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.011, 6, 12), charredArmorMat);
      tuskRing.userData._lodDetail = true;
      tuskRing.position.set(side * 0.20, 0.06, 0.42);
      tuskRing.rotation.x = Math.PI / 2;
      headGroup.add(tuskRing);

      const flankArmor = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.34, 0.62), charredArmorMat);
      flankArmor.userData._lodDetail = true;
      flankArmor.position.set(side * 0.44, 0.12, 0.0);
      torso.add(flankArmor);

      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 5), boarHideMat);
      ear.position.set(side * 0.23, 0.25, -0.04);
      ear.rotation.z = -side * 0.65;
      headGroup.add(ear);
    });

    // Articulated Hind Legs + Fore Legs (mapped to leftLeg/rightLeg & leftArm/rightArm)
    const makeHoofLeg = (x: number, y: number, z: number) => {
      const hip = new THREE.Group();
      hip.position.set(x, y, z);
      const upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.085, 0.44, 8),
        boarHideMat
      );
      upper.position.y = -0.22;
      hip.add(upper);
      const knee = new THREE.Group();
      knee.position.y = -0.43;
      hip.add(knee);
      const lower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.065, 0.38, 8),
        boarHideMat
      );
      lower.position.y = -0.19;
      knee.add(lower);
      const hoof = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.09, 0.08, 8),
        charredArmorMat
      );
      hoof.position.y = -0.4;
      knee.add(hoof);
      const ankle = makeEmptyLimb(-0.4);
      knee.add(ankle);
      return { hip, knee, ankle };
    };

    const legL = makeHoofLeg(-0.3, 0.82, -0.46);
    const legR = makeHoofLeg(0.3, 0.82, -0.46);
    const armL = makeHoofLeg(-0.32, -0.06, 0.42);
    const armR = makeHoofLeg(0.32, -0.06, 0.42);
    root.add(legL.hip, legR.hip);
    torso.add(armL.hip, armR.hip);
    root.scale.setScalar(s);

    return {
      root,
      leftLeg: legL.hip,
      rightLeg: legR.hip,
      leftKnee: legL.knee,
      rightKnee: legR.knee,
      leftAnkle: legL.ankle,
      rightAnkle: legR.ankle,
      leftArm: armL.hip,
      rightArm: armR.hip,
      leftElbow: armL.knee,
      rightElbow: armR.knee,
      torso,
      headGroup,
      contactShadow,
    };
  }

  if (variant === 'RABBIT_DEMON') {
    const hareFurMat = new THREE.MeshStandardMaterial({
      color: 0x4b4252,
      roughness: 0.78,
      metalness: 0.05,
    });
    const hareInnerEarMat = new THREE.MeshStandardMaterial({
      color: 0x733245,
      roughness: 0.65,
    });
    const amberEyeMat = new THREE.MeshPhysicalMaterial({
      color: 0xffb326,
      emissive: 0xff9d12,
      emissiveIntensity: 2.0,
      roughness: 0.14,
      ior: 1.52,
      clearcoat: 0.9,
    });
    const contactShadow = createContactShadowMesh(textures.contactShadow, 0.8 * s, 0.85 * s);
    root.add(contactShadow);

    const torso = new THREE.Group();
    torso.position.y = 0.88;
    root.add(torso);

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.24, 0.46, 8, 12),
      hareFurMat
    );
    body.position.y = 0.34;
    body.castShadow = true;
    torso.add(body);

    const tatteredSash = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.3, 0.24, 12),
      charredArmorMat
    );
    tatteredSash.position.y = 0.06;
    torso.add(tatteredSash);

    // Fluffy Demon Hare Cotton-Spike Tail
    const puffTail = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.14, 0),
      hareFurMat
    );
    puffTail.position.set(0, 0.14, -0.28);
    torso.add(puffTail);

    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.72, 0.06);
    torso.add(headGroup);

    const skull = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 12, 10),
      hareFurMat
    );
    skull.scale.set(0.92, 0.96, 1.18);
    skull.castShadow = true;
    headGroup.add(skull);

    // Hare Muzzle & Prominent Bucked Fangs (Strictly Leporid, zero feline traits)
    const muzzle = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 10, 8),
      hareFurMat
    );
    muzzle.position.set(0, -0.04, 0.18);
    headGroup.add(muzzle);

    const nose = new THREE.Mesh(
      new THREE.SphereGeometry(0.036, 8, 8),
      hareInnerEarMat
    );
    nose.position.set(0, -0.01, 0.28);
    headGroup.add(nose);

    [-0.025, 0.025].forEach((tx) => {
      const buckTooth = new THREE.Mesh(
        new THREE.BoxGeometry(0.032, 0.075, 0.024),
        ivoryBoneMat
      );
      buckTooth.position.set(tx, -0.1, 0.25);
      headGroup.add(buckTooth);
    });

    // Curved Obsidian Forehead Horn
    const horn = new THREE.Mesh(
      new THREE.ConeGeometry(0.042, 0.24, 6),
      darkBasaltMat
    );
    horn.position.set(0, 0.22, 0.12);
    horn.rotation.x = 0.35;
    headGroup.add(horn);

    // Towering Jagged Twin Rabbit Ears + Glowing Amber Eyes
    [-1, 1].forEach((side) => {
      const earGroup = new THREE.Group();
      earGroup.position.set(side * 0.095, 0.16, -0.02);
      earGroup.rotation.z = -side * 0.18;
      earGroup.rotation.x = -0.12;

      const earOuter = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.052, 0.48, 6, 10),
        hareFurMat
      );
      earOuter.scale.set(1.0, 1.0, 0.42);
      earOuter.position.y = 0.26;
      earOuter.castShadow = true;
      earGroup.add(earOuter);

      const earInner = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.032, 0.38, 6, 8),
        hareInnerEarMat
      );
      earInner.scale.set(1.0, 1.0, 0.28);
      earInner.position.set(0, 0.24, 0.022);
      earGroup.add(earInner);
      headGroup.add(earGroup);

      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 8, 8),
        amberEyeMat
      );
      eye.position.set(side * 0.11, 0.04, 0.16);
      headGroup.add(eye);
    });

    // Long Digitigrade Hind Legs built for High Vaulting Hops
    const makeHindLeg = (x: number) => {
      const hip = new THREE.Group();
      hip.position.set(x, 0.88, 0);
      const thigh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.115, 0.32, 6, 10),
        hareFurMat
      );
      thigh.position.set(0, -0.22, 0.04);
      thigh.rotation.x = -0.25;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.set(0, -0.44, 0.06);
      hip.add(knee);
      const shin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.055, 0.36, 8),
        hareFurMat
      );
      shin.position.set(0, -0.18, -0.04);
      knee.add(shin);
      const ankle = new THREE.Group();
      ankle.position.set(0, -0.36, -0.04);
      knee.add(ankle);
      const longFoot = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.08, 0.34),
        hareFurMat
      );
      longFoot.position.set(0, -0.04, 0.12);
      ankle.add(longFoot);
      return { hip, knee, ankle };
    };

    const makeForeArm = (x: number) => {
      const arm = new THREE.Group();
      arm.position.set(x, 0.54, 0.06);
      const up = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.28, 8), hareFurMat);
      up.position.y = -0.14;
      arm.add(up);
      const elbow = new THREE.Group();
      elbow.position.y = -0.28;
      arm.add(elbow);
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.26, 8), hareFurMat);
      fore.position.y = -0.13;
      elbow.add(fore);
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 5), ivoryBoneMat);
      claw.position.set(0, -0.27, 0.04);
      claw.rotation.x = Math.PI * 0.7;
      elbow.add(claw);
      return { arm, elbow };
    };

    const legL = makeHindLeg(-0.18);
    const legR = makeHindLeg(0.18);
    const armL = makeForeArm(-0.26);
    const armR = makeForeArm(0.26);
    root.add(legL.hip, legR.hip);
    torso.add(armL.arm, armR.arm);
    root.scale.setScalar(s);

    return {
      root,
      leftLeg: legL.hip,
      rightLeg: legR.hip,
      leftKnee: legL.knee,
      rightKnee: legR.knee,
      leftAnkle: legL.ankle,
      rightAnkle: legR.ankle,
      leftArm: armL.arm,
      rightArm: armR.arm,
      leftElbow: armL.elbow,
      rightElbow: armR.elbow,
      torso,
      headGroup,
      contactShadow,
    };
  }

  if (variant === 'SHADOW_GHOST') {
    const ghostShroudMat = new THREE.MeshStandardMaterial({
      color: 0x10131e,
      emissive: 0x263f78,
      emissiveIntensity: 0.72,
      roughness: 0.4,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
    });
    const wispGlowMat = new THREE.MeshPhysicalMaterial({
      color: 0x56f0ff,
      emissive: 0x32d6ff,
      emissiveIntensity: 1.9,
      roughness: 0.16,
      ior: 1.45,
      transparent: true,
      opacity: 0.85,
    });
    const contactShadow = createContactShadowMesh(textures.contactShadow, 0.78 * s, 0.78 * s);
    contactShadow.material = (contactShadow.material as THREE.MeshBasicMaterial).clone();
    (contactShadow.material as THREE.MeshBasicMaterial).opacity = 0.28;
    root.add(contactShadow);

    const torso = new THREE.Group();
    torso.position.y = 1.05;
    root.add(torso);

    // Legless Shredded Translucent Obsidian Wraith Cloak & Floating Tendrils
    const cloakCone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.56, 1.35, 14, 1, true),
      ghostShroudMat
    );
    cloakCone.position.y = -0.02;
    torso.add(cloakCone);

    const chestCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.24, 1),
      wispGlowMat
    );
    chestCore.position.set(0, 0.34, 0.04);
    torso.add(chestCore);

    // Spectral rib-spires & jagged obsidian shoulder mantles
    [-0.30, 0.30].forEach((sx) => {
      const wraithPauldron = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 5), darkBasaltMat);
      wraithPauldron.userData._lodDetail = true;
      wraithPauldron.position.set(sx, 0.62, 0);
      wraithPauldron.rotation.z = sx > 0 ? -0.65 : 0.65;
      torso.add(wraithPauldron);
    });
    for (let r = 0; r < 3; r++) {
      const ribBand = new THREE.Mesh(new THREE.TorusGeometry(0.22 - r * 0.02, 0.018, 5, 12), ivoryBoneMat);
      ribBand.userData._lodDetail = true;
      ribBand.rotation.x = Math.PI / 2;
      ribBand.position.set(0, 0.44 - r * 0.12, 0.02);
      torso.add(ribBand);
    }

    for (let t = 0; t < 6; t++) {
      const a = (t / 6) * Math.PI * 2;
      const tailWisp = new THREE.Mesh(
        new THREE.ConeGeometry(0.11, 0.65, 5),
        ghostShroudMat
      );
      tailWisp.position.set(Math.cos(a) * 0.34, -0.75, Math.sin(a) * 0.34);
      tailWisp.rotation.x = Math.PI;
      torso.add(tailWisp);
    }

    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.82, 0.02);
    torso.add(headGroup);

    const hood = new THREE.Mesh(
      new THREE.ConeGeometry(0.25, 0.44, 10),
      ghostShroudMat
    );
    hood.position.y = 0.08;
    headGroup.add(hood);

    const maskSkull = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 10, 8),
      ivoryBoneMat
    );
    maskSkull.scale.set(0.85, 1.15, 0.92);
    maskSkull.position.set(0, -0.02, 0.06);
    headGroup.add(maskSkull);

    [-1, 1].forEach((side) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), wispGlowMat);
      eye.position.set(side * 0.06, 0.0, 0.17);
      headGroup.add(eye);

      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.28, 5), darkBasaltMat);
      horn.position.set(side * 0.14, 0.2, 0.02);
      horn.rotation.z = -side * 0.42;
      headGroup.add(horn);
    });

    const customParts = new THREE.Group();
    for (let w = 0; w < 3; w++) {
      const a = (w / 3) * Math.PI * 2;
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), wispGlowMat);
      orb.position.set(Math.cos(a) * 0.68, 0.36, Math.sin(a) * 0.68);
      customParts.add(orb);
    }
    torso.add(customParts);

    // Spectral Clawed Arms
    const makeWraithArm = (x: number) => {
      const arm = new THREE.Group();
      arm.position.set(x, 0.56, 0);
      const sleeve = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.12, 0.42, 8),
        ghostShroudMat
      );
      sleeve.position.y = -0.21;
      arm.add(sleeve);
      const elbow = new THREE.Group();
      elbow.position.y = -0.42;
      arm.add(elbow);
      const claw = new THREE.Mesh(
        new THREE.ConeGeometry(0.07, 0.36, 5),
        wispGlowMat
      );
      claw.rotation.x = Math.PI;
      claw.position.y = -0.18;
      elbow.add(claw);
      return { arm, elbow };
    };
    const armL = makeWraithArm(-0.28);
    const armR = makeWraithArm(0.28);
    torso.add(armL.arm, armR.arm);

    const legL = makeEmptyLimb(0.8);
    const legR = makeEmptyLimb(0.8);
    const kneeL = makeEmptyLimb(0);
    const kneeR = makeEmptyLimb(0);
    const ankleL = makeEmptyLimb(0);
    const ankleR = makeEmptyLimb(0);
    root.add(legL, legR);
    root.scale.setScalar(s);

    return {
      root,
      leftLeg: legL,
      rightLeg: legR,
      leftKnee: kneeL,
      rightKnee: kneeR,
      leftAnkle: ankleL,
      rightAnkle: ankleR,
      leftArm: armL.arm,
      rightArm: armR.arm,
      leftElbow: armL.elbow,
      rightElbow: armR.elbow,
      torso,
      headGroup,
      ghostOverlayMat: ghostShroudMat,
      customParts,
      contactShadow,
    };
  }

  // Human Demon Variants: BRUTE_HUMAN (Molten Juggernaut) & SORCERER_HUMAN (Cursed Tantrik)
  const isSorcerer = variant === 'SORCERER_HUMAN';
  const skinMat = new THREE.MeshStandardMaterial({
    color: isSorcerer ? 0x3b384c : 0x4f1c20,
    roughness: 0.58,
    metalness: 0.1,
  });
  const robeMat = new THREE.MeshPhysicalMaterial({
    map: textures.silkGold,
    normalMap: textures.silkNormal,
    roughnessMap: textures.silkRoughness,
    color: isSorcerer ? 0x26152b : 0x361414,
    roughness: 0.78,
    sheen: 0.42,
    ior: 1.46,
  });
  const glowMat = new THREE.MeshPhysicalMaterial({
    color: isSorcerer ? 0x52ff9b : 0xff6218,
    emissive: isSorcerer ? 0x36e67a : 0xff4508,
    emissiveIntensity: 2.1,
    roughness: 0.18,
    ior: 1.52,
    clearcoat: 0.7,
  });

  const contactShadow = createContactShadowMesh(textures.contactShadow, 0.9 * s, 0.9 * s);
  root.add(contactShadow);

  const makeHumanLeg = (xOffset: number) => {
    const legPivot = new THREE.Group();
    legPivot.position.set(xOffset, 0.94, 0);
    const thigh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.145, 0.115, 0.48, 10),
      robeMat
    );
    thigh.position.y = -0.24;
    thigh.castShadow = true;
    legPivot.add(thigh);

    const kneePivot = new THREE.Group();
    kneePivot.position.y = -0.47;
    legPivot.add(kneePivot);

    const shin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.085, 0.44, 10),
      isSorcerer ? robeMat : charredArmorMat
    );
    shin.position.y = -0.22;
    shin.castShadow = true;
    kneePivot.add(shin);

    const anklePivot = new THREE.Group();
    anklePivot.position.y = -0.44;
    kneePivot.add(anklePivot);

    const boot = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.1, 0.28),
      darkBasaltMat
    );
    boot.position.set(0, -0.02, 0.05);
    anklePivot.add(boot);

    return { legPivot, kneePivot, anklePivot };
  };

  const legL = makeHumanLeg(-0.18);
  const legR = makeHumanLeg(0.18);
  root.add(legL.legPivot, legR.legPivot);

  const torso = new THREE.Group();
  torso.position.y = 0.94;
  root.add(torso);

  const chest = new THREE.Mesh(
    new THREE.CylinderGeometry(
      isSorcerer ? 0.24 : 0.34,
      isSorcerer ? 0.2 : 0.24,
      0.7,
      12
    ),
    isSorcerer ? robeMat : skinMat
  );
  chest.position.y = 0.38;
  chest.castShadow = true;
  torso.add(chest);

  // Tattered Skirt Coat
  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, isSorcerer ? 0.42 : 0.34, 0.52, 12, 1, true),
    robeMat
  );
  skirt.material.side = THREE.DoubleSide;
  skirt.position.y = -0.14;
  torso.add(skirt);

  if (!isSorcerer) {
    // Spiked Pauldrons, Molten Chest Fissure Veins & Skull-Buckled War Belt for Brute
    [-0.36, 0.36].forEach((px) => {
      const pauldron = new THREE.Mesh(
        new THREE.SphereGeometry(0.185, 10, 8),
        charredArmorMat
      );
      pauldron.position.set(px, 0.65, 0);
      torso.add(pauldron);
      const spk = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 5), ivoryBoneMat);
      spk.userData._lodDetail = true;
      spk.position.set(px * 1.2, 0.80, 0);
      spk.rotation.z = px > 0 ? -0.45 : 0.45;
      torso.add(spk);
    });
    const magmaScar = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.13, 0),
      glowMat
    );
    magmaScar.userData._lodDetail = true;
    magmaScar.position.set(0, 0.42, 0.28);
    torso.add(magmaScar);

    [-1, 1].forEach((vx) => {
      const magmaVein = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.26, 0.03), glowMat);
      magmaVein.userData._lodDetail = true;
      magmaVein.position.set(vx * 0.13, 0.46, 0.25);
      magmaVein.rotation.z = vx * 0.48;
      torso.add(magmaVein);
    });

    const warBelt = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.045, 7, 16), charredArmorMat);
    warBelt.userData._lodDetail = true;
    warBelt.rotation.x = Math.PI / 2;
    warBelt.position.set(0, 0.06, 0);
    torso.add(warBelt);
  } else {
    // Skeletal Bone Necklace & Cursed Shoulder Mantle for Sorcerer
    for (let b = -2; b <= 2; b++) {
      const boneBead = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 7, 7),
        ivoryBoneMat
      );
      boneBead.userData._lodDetail = true;
      boneBead.position.set(b * 0.08, 0.62 - Math.abs(b) * 0.02, 0.22);
      torso.add(boneBead);
    }
    const ritualCollar = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.042, 6, 14), charredArmorMat);
    ritualCollar.userData._lodDetail = true;
    ritualCollar.rotation.x = Math.PI / 2;
    ritualCollar.position.set(0, 0.66, 0);
    torso.add(ritualCollar);
  }

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.86, 0);
  torso.add(headGroup);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 12, 10),
    skinMat
  );
  head.scale.set(0.95, 1.12, 1.0);
  head.castShadow = true;
  headGroup.add(head);

  if (isSorcerer) {
    const cowl = new THREE.Mesh(
      new THREE.ConeGeometry(0.24, 0.46, 10),
      robeMat
    );
    cowl.position.set(0, 0.14, -0.04);
    cowl.rotation.x = -0.22;
    headGroup.add(cowl);
  } else {
    const helm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.21, 0.16, 12),
      charredArmorMat
    );
    helm.position.y = 0.09;
    headGroup.add(helm);
  }

  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8), glowMat);
    eye.position.set(side * 0.075, 0.02, 0.17);
    headGroup.add(eye);

    const horn = new THREE.Mesh(
      new THREE.ConeGeometry(0.048, isSorcerer ? 0.24 : 0.34, 6),
      ivoryBoneMat
    );
    horn.position.set(side * 0.15, 0.18, 0.02);
    horn.rotation.z = -side * 0.5;
    horn.rotation.x = 0.22;
    headGroup.add(horn);
  });

  const makeHumanArm = (x: number) => {
    const arm = new THREE.Group();
    arm.position.set(x, 0.62, 0);
    const upper = new THREE.Mesh(
      new THREE.CylinderGeometry(isSorcerer ? 0.075 : 0.11, isSorcerer ? 0.065 : 0.095, 0.34, 10),
      skinMat
    );
    upper.position.y = -0.17;
    upper.castShadow = true;
    arm.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -0.34;
    arm.add(elbow);

    const fore = new THREE.Mesh(
      new THREE.CylinderGeometry(isSorcerer ? 0.065 : 0.095, isSorcerer ? 0.05 : 0.075, 0.32, 10),
      isSorcerer ? robeMat : charredArmorMat
    );
    fore.position.y = -0.16;
    elbow.add(fore);
    return { arm, elbow };
  };

  const armL = makeHumanArm(isSorcerer ? -0.28 : -0.38);
  const armR = makeHumanArm(isSorcerer ? 0.28 : 0.38);
  torso.add(armL.arm, armR.arm);

  if (isSorcerer) {
    // Horned Bone Necromancer Staff + Floating Curse Orb attached to Right Elbow
    const staff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.028, 1.95, 8),
      darkBasaltMat
    );
    staff.position.set(0, -0.32, 0.22);
    staff.rotation.x = Math.PI / 2;
    armR.elbow.add(staff);

    const curseOrb = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.14, 1),
      glowMat
    );
    curseOrb.position.set(0, -0.32, 1.24);
    armR.elbow.add(curseOrb);
  } else {
    // Massive Spiked Infernal Gada War-Club & Iron Buckler
    const clubShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.036, 0.85, 8),
      charredArmorMat
    );
    clubShaft.position.set(0, -0.32, 0.28);
    clubShaft.rotation.x = Math.PI / 2;
    armR.elbow.add(clubShaft);

    const clubHead = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.24, 0),
      charredArmorMat
    );
    clubHead.position.set(0, -0.32, 0.72);
    armR.elbow.add(clubHead);

    const shield = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.07, 10),
      charredArmorMat
    );
    shield.rotation.z = Math.PI / 2;
    shield.position.set(-0.08, -0.22, 0.08);
    armL.elbow.add(shield);
  }

  root.scale.setScalar(s);
  return {
    root,
    leftLeg: legL.legPivot,
    rightLeg: legR.legPivot,
    leftKnee: legL.kneePivot,
    rightKnee: legR.kneePivot,
    leftAnkle: legL.anklePivot,
    rightAnkle: legR.anklePivot,
    leftArm: armL.arm,
    rightArm: armR.arm,
    leftElbow: armL.elbow,
    rightElbow: armR.elbow,
    torso,
    headGroup,
    contactShadow,
  };
}

export function createDemonStructureModel(
  textures: ProceduralTextures,
  x: number,
  z: number,
  scale: number,
  rotY: number,
  kind: 'CITADEL' | 'TOWER' | 'HUT'
): { group: THREE.Group; collider: BoxCollider } {
  const group = new THREE.Group();
  group.position.set(x, groundHeightAt(x, z), z);
  group.rotation.y = rotY;
  group.scale.setScalar(scale);

  const obsidianMat = new THREE.MeshStandardMaterial({
    map: textures.darkBasalt,
    normalMap: textures.darkBasaltNormal,
    color: 0x1e1b22,
    roughness: 0.74,
    metalness: 0.2,
  });
  const charredWoodMat = new THREE.MeshStandardMaterial({
    map: textures.bark,
    normalMap: textures.barkNormal,
    color: 0x261a18,
    roughness: 0.88,
  });
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0xff5a18,
    emissive: 0xff3200,
    emissiveIntensity: 1.5,
    roughness: 0.3,
  });
  const boneMat = new THREE.MeshStandardMaterial({
    color: 0xd9cfb8,
    roughness: 0.55,
  });

  if (kind === 'CITADEL') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(12.5, 1.3, 12.5), obsidianMat);
    base.position.y = 0.65;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const keep = new THREE.Mesh(new THREE.BoxGeometry(8.2, 6.4, 8.2), obsidianMat);
    keep.position.y = 4.4;
    keep.castShadow = true;
    group.add(keep);

    const gateGlow = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.6, 0.5), emberMat);
    gateGlow.position.set(0, 3.1, 4.1);
    group.add(gateGlow);

    // Jagged Horned Roof & Corner Spires
    const mainSpire = new THREE.Mesh(new THREE.ConeGeometry(5.6, 5.8, 4), obsidianMat);
    mainSpire.rotation.y = Math.PI / 4;
    mainSpire.position.y = 10.4;
    mainSpire.castShadow = true;
    group.add(mainSpire);

    [
      [-4.6, 4.6],
      [4.6, 4.6],
      [-4.6, -4.6],
      [4.6, -4.6],
    ].forEach(([cx, cz]) => {
      const tuskPillar = new THREE.Mesh(new THREE.ConeGeometry(0.55, 6.2, 6), charredWoodMat);
      tuskPillar.position.set(cx, 4.4, cz);
      group.add(tuskPillar);
      const skullCap = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), boneMat);
      skullCap.position.set(cx, 7.6, cz);
      group.add(skullCap);
    });

    return {
      group,
      collider: {
        x,
        z,
        halfW: 6.35 * scale,
        halfD: 6.35 * scale,
        height: 13.5 * scale,
        rotY,
        baseY: group.position.y,
      },
    };
  }

  if (kind === 'TOWER') {
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.9, 1.1, 8), obsidianMat);
    plinth.position.y = 0.55;
    plinth.receiveShadow = true;
    group.add(plinth);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.8, 7.5, 8), obsidianMat);
    shaft.position.y = 4.8;
    shaft.castShadow = true;
    group.add(shaft);

    const brazierRing = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.2, 6, 12), emberMat);
    brazierRing.rotation.x = Math.PI / 2;
    brazierRing.position.y = 8.4;
    group.add(brazierRing);

    const spire = new THREE.Mesh(new THREE.ConeGeometry(2.9, 3.8, 6), charredWoodMat);
    spire.position.y = 10.4;
    spire.castShadow = true;
    group.add(spire);

    return {
      group,
      collider: {
        x,
        z,
        halfW: 3.95 * scale,
        halfD: 3.95 * scale,
        height: 12.2 * scale,
        rotY,
        baseY: group.position.y,
      },
    };
  }

  // HUT
  const slab = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.7, 5.8), obsidianMat);
  slab.position.y = 0.35;
  slab.receiveShadow = true;
  group.add(slab);

  const walls = new THREE.Mesh(new THREE.BoxGeometry(5.8, 3.1, 4.9), charredWoodMat);
  walls.position.y = 2.25;
  walls.castShadow = true;
  group.add(walls);

  const hearthGlow = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.1, 0.35), emberMat);
  hearthGlow.position.set(0, 1.75, 2.48);
  group.add(hearthGlow);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.8, 2.7, 4), obsidianMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 5.1;
  roof.castShadow = true;
  group.add(roof);

  // Twin Horns Mounted Over Hut Entrance
  [-0.95, 0.95].forEach((hx) => {
    const h = new THREE.Mesh(new THREE.ConeGeometry(0.14, 1.25, 6), boneMat);
    h.position.set(hx, 3.8, 2.6);
    h.rotation.z = hx > 0 ? -0.45 : 0.45;
    h.rotation.x = 0.3;
    group.add(h);
  });

  return {
    group,
    collider: {
      x,
      z,
      halfW: 3.4 * scale,
      halfD: 2.9 * scale,
      height: 6.5 * scale,
      rotY,
      baseY: group.position.y,
    },
  };
}

export function createVolcanoModel(
  x: number,
  z: number,
  radius: number,
  height: number,
  textures?: ProceduralTextures
): { group: THREE.Group; craterTopY: number } {
  const group = new THREE.Group();
  const baseY = groundHeightAt(x, z);
  group.position.set(x, baseY - 0.6, z);

  const rockMat = new THREE.MeshStandardMaterial({
    map: textures?.rockCliff ?? null,
    normalMap: textures?.rockCliffNormal ?? null,
    normalScale: new THREE.Vector2(1.15, 1.15),
    vertexColors: true,
    color: 0x2b242c,
    roughness: 0.9,
    metalness: 0.1,
  });
  const strataMat = new THREE.MeshStandardMaterial({
    map: textures?.darkBasalt ?? null,
    normalMap: textures?.darkBasaltNormal ?? null,
    color: 0x261f28,
    roughness: 0.88,
    metalness: 0.08,
  });
  const magmaMat = new THREE.MeshPhysicalMaterial({
    color: 0xff5216,
    emissive: 0xff3b08,
    emissiveIntensity: 2.35,
    roughness: 0.34,
    ior: 1.55,
  });

  const coneGeo = new THREE.CylinderGeometry(
    radius * 0.23,
    radius,
    height,
    12,
    6,
    false
  );
  const pos = coneGeo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const hNorm = (vy + height * 0.5) / height; // 0..1 bottom to summit
    const ang = Math.atan2(vz, vx);
    const rib =
      Math.sin(ang * 7 + hNorm * 3.1) * 0.072 +
      Math.cos(ang * 13 - hNorm * 5.2) * 0.042 +
      Math.sin(hNorm * 22) * 0.025;
    const flare = hNorm < 0.25 ? 1 + (0.25 - hNorm) * 0.42 : 1;
    const jag = (1 + rib) * flare;
    pos.setX(i, vx * jag);
    pos.setZ(i, vz * jag);

    const ao = THREE.MathUtils.clamp(0.48 + hNorm * 0.48 + rib * 1.4, 0.35, 1.05);
    const glowHeat = Math.max(0, hNorm - 0.78) * 1.8;
    cols[i * 3] = Math.min(1.1, ao + glowHeat * 0.45);
    cols[i * 3 + 1] = ao + glowHeat * 0.08;
    cols[i * 3 + 2] = ao;
  }
  coneGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  coneGeo.computeVertexNormals();

  const cone = new THREE.Mesh(coneGeo, rockMat);
  cone.position.y = height * 0.5;
  cone.castShadow = false;
  cone.receiveShadow = true;
  group.add(cone);

  // Stepped Basalt Buttress Shelves around Lower Skirt
  for (let b = 0; b < 8; b++) {
    const ba = (b / 8) * Math.PI * 2 + 0.25;
    const buttress = new THREE.Mesh(
      new THREE.DodecahedronGeometry(radius * 0.24, 1),
      strataMat
    );
    buttress.scale.set(1.2, 0.85, 1.5);
    buttress.position.set(
      Math.cos(ba) * radius * 0.78,
      height * 0.14,
      Math.sin(ba) * radius * 0.78
    );
    buttress.rotation.y = ba;
    group.add(buttress);
  }

  const craterRim = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.24, radius * 0.048, 6, 12),
    strataMat
  );
  craterRim.rotation.x = Math.PI / 2;
  craterRim.position.y = height;
  group.add(craterRim);

  for (let sp = 0; sp < 6; sp++) {
    const sa = (sp / 6) * Math.PI * 2 + 0.3;
    const spire = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 0.06, height * 0.14, 5),
      strataMat
    );
    spire.position.set(
      Math.cos(sa) * radius * 0.24,
      height + height * 0.04,
      Math.sin(sa) * radius * 0.24
    );
    spire.rotation.z = -Math.cos(sa) * 0.18;
    spire.rotation.x = Math.sin(sa) * 0.18;
    group.add(spire);
  }

  const lavaPool = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.22, 12),
    magmaMat
  );
  lavaPool.rotation.x = -Math.PI / 2;
  lavaPool.position.y = height - 0.15;
  group.add(lavaPool);

  // Glowing Lava Fissure Streams Flowing Down Slope
  for (let s = 0; s < 5; s++) {
    const a = (s / 5) * Math.PI * 2 + 0.4;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a) * radius * 0.22, height - 0.1, Math.sin(a) * radius * 0.22),
      new THREE.Vector3(Math.cos(a + 0.12) * radius * 0.45, height * 0.62, Math.sin(a + 0.12) * radius * 0.45),
      new THREE.Vector3(Math.cos(a - 0.08) * radius * 0.76, height * 0.22, Math.sin(a - 0.08) * radius * 0.76),
    ]);
    const lavaStream = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 22, radius * 0.024, 7, false),
      magmaMat
    );
    group.add(lavaStream);
  }

  return { group, craterTopY: baseY - 0.6 + height };
}

export function createBlackMountainModel(
  x: number,
  z: number,
  radius: number,
  height: number,
  seed: number,
  textures?: ProceduralTextures
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, groundHeightAt(x, z) - 0.8, z);

  const obsidianMat = new THREE.MeshStandardMaterial({
    map: textures?.rockCliff ?? textures?.darkBasalt ?? null,
    normalMap: textures?.rockCliffNormal ?? textures?.darkBasaltNormal ?? null,
    normalScale: new THREE.Vector2(1.05, 1.05),
    vertexColors: true,
    color: 0x26232b,
    roughness: 0.92,
    metalness: 0.06,
  });

  const peakCount = 3;
  for (let p = 0; p < peakCount; p++) {
    const pr = radius * (p === 0 ? 1.0 : 0.68);
    const ph = height * (p === 0 ? 1.0 : 0.72 + ((seed + p) % 3) * 0.1);
    const peakGeo = new THREE.ConeGeometry(pr, ph, 8, 4);
    const pPos = peakGeo.attributes.position;
    const pCols = new Float32Array(pPos.count * 3);
    for (let vi = 0; vi < pPos.count; vi++) {
      const vx = pPos.getX(vi);
      const vy = pPos.getY(vi);
      const vz = pPos.getZ(vi);
      const hNorm = (vy + ph * 0.5) / ph;
      const ang = Math.atan2(vz, vx);
      const ridge =
        Math.sin(ang * 5 + seed + p + hNorm * 2.4) * 0.14 +
        Math.cos(ang * 9 - hNorm * 3.8 + seed) * 0.08;
      const radialDisp = 1 + ridge * (1 - hNorm * 0.45);
      pPos.setX(vi, vx * radialDisp);
      pPos.setZ(vi, vz * radialDisp);
      const ao = THREE.MathUtils.clamp(0.45 + hNorm * 0.52 + ridge * 0.9, 0.32, 1.05);
      pCols[vi * 3] = ao;
      pCols[vi * 3 + 1] = ao;
      pCols[vi * 3 + 2] = ao;
    }
    peakGeo.setAttribute('color', new THREE.BufferAttribute(pCols, 3));
    peakGeo.computeVertexNormals();

    const peak = new THREE.Mesh(peakGeo, obsidianMat);
    const ox = p === 0 ? 0 : Math.cos(seed + p * 2.1) * radius * 0.52;
    const oz = p === 0 ? 0 : Math.sin(seed + p * 2.1) * radius * 0.52;
    peak.position.set(ox, ph * 0.5, oz);
    peak.rotation.y = seed + p * 1.1;
    group.add(peak);
  }
  return group;
}

export function createSkeletonDebrisCluster(
  x: number,
  z: number,
  seed: number
): THREE.Group {
  const group = new THREE.Group();
  const gy = groundHeightAt(x, z);
  group.position.set(x, gy + 0.06, z);
  group.rotation.y = seed * 1.7;

  const boneMat = new THREE.MeshStandardMaterial({
    color: 0xd9d0bd,
    roughness: 0.66,
  });

  // Cranium + Jaw
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), boneMat);
  skull.scale.set(0.88, 0.95, 1.08);
  skull.position.set(0.32, 0.16, 0.25);
  skull.rotation.set(0.22, 0.4, -0.35);
  group.add(skull);

  // Curved Ribcage Arcs
  for (let r = 0; r < 4; r++) {
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(0.26 - r * 0.02, 0.026, 5, 12, Math.PI * 1.25),
      boneMat
    );
    rib.position.set(-0.2, 0.08, -0.35 + r * 0.16);
    rib.rotation.x = Math.PI * 0.32;
    group.add(rib);
  }

  // Scattered Femur & Shin Bones
  for (let b = 0; b < 3; b++) {
    const bone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, 0.72, 6),
      boneMat
    );
    bone.rotation.z = Math.PI / 2;
    bone.rotation.y = seed + b * 0.95;
    bone.position.set((b - 1) * 0.45, 0.03, (b % 2) * 0.42);
    group.add(bone);
  }

  return group;
}

export function createWheelDebris(
  textures: ProceduralTextures,
  x: number,
  z: number,
  seed: number
): THREE.Group {
  const group = new THREE.Group();
  const gy = groundHeightAt(x, z);
  group.position.set(x, gy + 0.06, z);
  group.rotation.set(0.18 + (seed % 3) * 0.08, seed * 2.1, -0.95);

  const charredWoodMat = new THREE.MeshStandardMaterial({
    map: textures.bark,
    normalMap: textures.barkNormal,
    color: 0x332219,
    roughness: 0.88,
  });
  const rustedIronMat = new THREE.MeshStandardMaterial({
    map: textures.armorMetal,
    normalMap: textures.armorNormal,
    color: 0x453b38,
    roughness: 0.56,
    metalness: 0.65,
  });

  // Shattered 3/4 Arc Wheel Rim
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.88, 0.085, 8, 20, Math.PI * 1.48),
    rustedIronMat
  );
  rim.rotation.y = Math.PI / 2;
  group.add(rim);

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.2, 0.34, 10),
    charredWoodMat
  );
  hub.rotation.z = Math.PI / 2;
  group.add(hub);

  const axleStub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.065, 0.08, 1.35, 7),
    charredWoodMat
  );
  axleStub.rotation.z = Math.PI / 2;
  axleStub.position.x = -0.52;
  group.add(axleStub);

  for (let i = 0; i < 5; i++) {
    const a = (i / 6) * Math.PI * 1.45;
    const spoke = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.034, i === 2 ? 0.45 : 0.85, 6),
      charredWoodMat
    );
    spoke.position.set(0, Math.sin(a) * 0.42, Math.cos(a) * 0.42);
    spoke.rotation.x = Math.PI / 2 - a;
    group.add(spoke);
  }

  return group;
}

export interface SabhaSeatDef {
  role: 'MINISTER' | 'COMMANDER' | 'SPY';
  x: number;
  y: number;
  z: number;
  faceYaw: number;
}

/**
 * Radiant Golden Suryadev Solar Crest Emblem celebrating Lord Ram's Suryavanshi lineage.
 */
function createSuryadevEmblemMesh(goldMat: THREE.Material, rubyMat: THREE.Material): THREE.Group {
  const sun = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.24, 32), goldMat);
  disc.rotation.x = Math.PI / 2;
  sun.add(disc);

  const haloRing = new THREE.Mesh(new THREE.TorusGeometry(1.88, 0.14, 12, 36), goldMat);
  sun.add(haloRing);

  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.08, 10, 28), rubyMat);
  innerRing.position.z = 0.12;
  sun.add(innerRing);

  // Sculpted Suryadev Face Medallion Relief
  const visage = new THREE.Mesh(new THREE.SphereGeometry(0.74, 20, 14), goldMat);
  visage.scale.set(1.0, 1.08, 0.35);
  visage.position.z = 0.1;
  sun.add(visage);

  const tilakGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), rubyMat);
  tilakGem.position.set(0, 0.24, 0.34);
  sun.add(tilakGem);

  [-1, 1].forEach((side) => {
    const sunEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), rubyMat);
    sunEye.position.set(side * 0.24, 0.06, 0.32);
    sun.add(sunEye);
  });

  // 24 Alternating Flame & Lance Solar Rays
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * Math.PI * 2;
    const isMajor = i % 2 === 0;
    const rayLen = isMajor ? 1.48 : 0.96;
    const ray = new THREE.Mesh(
      new THREE.ConeGeometry(isMajor ? 0.22 : 0.14, rayLen, 6),
      goldMat
    );
    const rDist = 1.92 + rayLen * 0.45;
    ray.position.set(Math.cos(ang) * rDist, Math.sin(ang) * rDist, 0);
    ray.rotation.z = ang - Math.PI / 2;
    sun.add(ray);
  }

  return sun;
}

/**
 * Colossal Walkable Seven-Story Royal Palace of Lord Ram with integrated Rajya Sabha Assembly Hall,
 * Simhasana Throne, 16 Minister/Commander/Spy Seats, Pillars Adorned with Mythological Artwork,
 * Royal Crimson-Gold Curtains, Standing Brass Oil Lamps & Fire Torches on EVERY Floor, and
 * Gold-Detailed Walkable Staircases connecting Floors 1 -> 7.
 */
/**
 * Creates a single continuous UV-mapped red-carpet floor plane (PlaneGeometry or single-hole ShapeGeometry).
 * Upward FrontSide orientation prevents undersides from occluding ceilings while keeping upper floors solid on stairs.
 */
function createContinuousCarpetFloorGeometry(
  width: number,
  depth: number,
  hole?: { minX: number; maxX: number; minZ: number; maxZ: number },
  uvTileMeters = 5.4
): THREE.BufferGeometry {
  const hw = width * 0.5;
  const hd = depth * 0.5;
  let geo: THREE.BufferGeometry;

  if (!hole) {
    geo = new THREE.PlaneGeometry(width, depth, 1, 1);
    geo.rotateX(-Math.PI / 2);
  } else {
    // Shape sits in XY; rotateX(-PI/2) transforms shape (x, y) -> world (x, 0, -y)
    const shape = new THREE.Shape();
    shape.moveTo(-hw, -hd);
    shape.lineTo(hw, -hd);
    shape.lineTo(hw, hd);
    shape.lineTo(-hw, hd);
    shape.closePath();

    const holeMinY = -hole.maxZ;
    const holeMaxY = -hole.minZ;
    const holePath = new THREE.Path();
    holePath.moveTo(hole.minX, holeMinY);
    holePath.lineTo(hole.minX, holeMaxY);
    holePath.lineTo(hole.maxX, holeMaxY);
    holePath.lineTo(hole.maxX, holeMinY);
    holePath.closePath();
    shape.holes.push(holePath);

    geo = new THREE.ShapeGeometry(shape, 1);
    geo.rotateX(-Math.PI / 2);
  }

  // Enforce crisp proportional world-scale UV coordinates without tiling distortion or seams
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const pz = pos.getZ(i);
    uv.setXY(i, (px + hw) / uvTileMeters, (pz + hd) / uvTileMeters);
  }
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeTangents();
  return geo;
}

/**
 * Creates a single continuous downward-facing (-Y FrontSide) UV-mapped ceiling plane
 * with an optional stairwell hole so upper rooms remain completely invisible below while keeping ceilings crisp inside.
 */
function createContinuousCeilingGeometry(
  width: number,
  depth: number,
  hole?: { minX: number; maxX: number; minZ: number; maxZ: number },
  uvTileMeters = 5.4
): THREE.BufferGeometry {
  const hw = width * 0.5;
  const hd = depth * 0.5;
  let geo: THREE.BufferGeometry;

  if (!hole) {
    geo = new THREE.PlaneGeometry(width, depth, 1, 1);
    geo.rotateX(Math.PI / 2);
  } else {
    // Shape in XY; rotateX(+PI/2) transforms shape (x, y) -> world (x, 0, y)
    const shape = new THREE.Shape();
    shape.moveTo(-hw, -hd);
    shape.lineTo(hw, -hd);
    shape.lineTo(hw, hd);
    shape.lineTo(-hw, hd);
    shape.closePath();

    const holePath = new THREE.Path();
    holePath.moveTo(hole.minX, hole.minZ);
    holePath.lineTo(hole.maxX, hole.minZ);
    holePath.lineTo(hole.maxX, hole.maxZ);
    holePath.lineTo(hole.minX, hole.maxZ);
    holePath.closePath();
    shape.holes.push(holePath);

    geo = new THREE.ShapeGeometry(shape, 1);
    geo.rotateX(Math.PI / 2);
  }

  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const pz = pos.getZ(i);
    uv.setXY(i, (px + hw) / uvTileMeters, (pz + hd) / uvTileMeters);
  }
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeTangents();
  return geo;
}

export function createSevenStoryPalaceAndSabhaModel(
  textures: ProceduralTextures,
  sabhaX: number,
  sabhaZ: number,
  palaceX: number,
  palaceZ: number,
  throneX: number,
  throneZ: number
): {
  group: THREE.Group;
  boxColliders: BoxCollider[];
  circleColliders: CircleCollider[];
  seatPositions: SabhaSeatDef[];
  palaceTorchAnchors: Array<{ x: number; y: number; z: number; phase: number }>;
  roofOccluders: RoofOccluder[];
  palaceStoryGroups: THREE.Group[];
  palaceTopRoofGroup: THREE.Group;
} {
  const group = new THREE.Group();
  const boxColliders: BoxCollider[] = [];
  const circleColliders: CircleCollider[] = [];
  const seatPositions: SabhaSeatDef[] = [];
  const palaceTorchAnchors: Array<{ x: number; y: number; z: number; phase: number }> = [];
  const roofOccluders: RoofOccluder[] = [];

  const stoneMat = new THREE.MeshPhysicalMaterial({
    map: textures.sandstone,
    normalMap: textures.sandstoneNormal,
    normalScale: new THREE.Vector2(0.88, 0.88),
    roughnessMap: textures.sandstoneRoughness,
    aoMap: textures.sandstoneAO,
    aoMapIntensity: 0.72,
    color: 0xe6c38f,
    roughness: 0.84,
    metalness: 0.05,
    ior: 1.54,
    specularIntensity: 0.44,
  });
  const trimMat = new THREE.MeshPhysicalMaterial({
    map: textures.sandstone,
    normalMap: textures.sandstoneNormal,
    roughnessMap: textures.sandstoneRoughness,
    aoMap: textures.sandstoneAO,
    aoMapIntensity: 0.72,
    color: 0x9c5e31,
    roughness: 0.74,
    metalness: 0.15,
    ior: 1.54,
    specularIntensity: 0.48,
  });
  const redCarpetMat = new THREE.MeshPhysicalMaterial({
    map: textures.redCarpet,
    normalMap: textures.redCarpetNormal,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: textures.redCarpetRoughness,
    roughness: 0.82,
    metalness: 0.05,
    ior: 1.48,
    sheen: 0.72,
    sheenRoughness: 0.65,
    sheenColor: new THREE.Color(0xff9b7a),
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mythArtMat = new THREE.MeshPhysicalMaterial({
    map: textures.mythologyArt,
    normalMap: textures.mythologyArtNormal,
    normalScale: new THREE.Vector2(0.92, 0.92),
    roughness: 0.56,
    metalness: 0.16,
    ior: 1.54,
    clearcoat: 0.18,
  });
  const goldMat = new THREE.MeshPhysicalMaterial({
    map: textures.armorMetal,
    normalMap: textures.armorNormal,
    roughnessMap: textures.armorRoughness,
    metalnessMap: textures.armorMetalness,
    color: 0xf4c552,
    roughness: 0.28,
    metalness: 0.94,
    ior: 1.62,
    specularIntensity: 1.0,
    anisotropy: 0.52,
    clearcoat: 0.25,
  });
  const crimsonMat = new THREE.MeshPhysicalMaterial({
    map: textures.silkGold,
    normalMap: textures.silkNormal,
    roughnessMap: textures.silkRoughness,
    color: 0xa61f24,
    roughness: 0.74,
    ior: 1.48,
    sheen: 0.62,
    sheenColor: new THREE.Color(0xff9a82),
  });
  const rubyMat = new THREE.MeshPhysicalMaterial({
    color: 0xff4518,
    emissive: 0xcc2200,
    emissiveIntensity: 0.85,
    roughness: 0.14,
    ior: 1.77,
    clearcoat: 1.0,
  });
  const lampGlowMat = new THREE.MeshPhysicalMaterial({
    color: 0xffdf72,
    emissive: 0xffae38,
    emissiveIntensity: 1.8,
    roughness: 0.18,
    ior: 1.5,
    clearcoat: 0.6,
  });
  const epigraphMat = new THREE.MeshPhysicalMaterial({
    map: textures.royalEpigraph,
    normalMap: textures.royalEpigraphNormal,
    normalScale: new THREE.Vector2(0.92, 0.92),
    roughness: 0.64,
    metalness: 0.12,
    ior: 1.54,
  });

  // ===========================================================================
  // PART A: WALKABLE SEVEN-STORY PALACE CORE (Sapta-Bhumi Prasada at palaceX, palaceZ)
  // ===========================================================================
  const baseY = groundHeightAt(palaceX, palaceZ);
  const palaceGroup = new THREE.Group();
  palaceGroup.position.set(palaceX, baseY, palaceZ);
  group.add(palaceGroup);

  const palaceStoryGroups: THREE.Group[] = [];

  // Smooth Grand Walkway Bridge connecting Sabha North (-87) directly onto Story 1 South Portal (-98)
  // Recessed support base + single continuous UV-mapped red-carpet plane at y = 0.42m
  const linkUnder = new THREE.Mesh(new THREE.BoxGeometry(14.1, 0.34, 13.1), trimMat);
  linkUnder.position.set(0, 0.19, 19.5);
  palaceGroup.add(linkUnder);

  const linkPlane = new THREE.Mesh(
    createContinuousCarpetFloorGeometry(14.5, 13.5, undefined, 5.2),
    redCarpetMat
  );
  linkPlane.position.set(0, 0.42, 19.5);
  linkPlane.receiveShadow = true;
  palaceGroup.add(linkPlane);

  [-7.05, 7.05].forEach((rx) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.95, 13.5), trimMat);
    rail.position.set(rx, 0.88, 19.5);
    palaceGroup.add(rail);
    const goldRail = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.1, 13.5), goldMat);
    goldRail.position.set(rx, 1.4, 19.5);
    palaceGroup.add(goldRail);
    boxColliders.push({
      x: palaceX + rx,
      z: palaceZ + 19.5,
      halfW: 0.25,
      halfD: 6.75,
      height: 1.5,
      baseY,
    });
  });

  // Coffered Downward Ceiling Material (-Y FrontSide so interior ceilings stay crisp above without exterior occlusion)
  const ceilingMat = new THREE.MeshPhysicalMaterial({
    map: textures.sandstone,
    normalMap: textures.sandstoneNormal,
    roughnessMap: textures.sandstoneRoughness,
    color: 0xd9a76a,
    roughness: 0.8,
    metalness: 0.12,
    ior: 1.54,
    side: THREE.FrontSide,
  });

  // Build All 7 Walkable Luxury Stories:
  PALACE_STORIES.forEach((st, idx) => {
    const storyGroup = new THREE.Group();
    palaceGroup.add(storyGroup);
    palaceStoryGroups.push(storyGroup);

    const y0 = st.floorY;
    const hw = st.w * 0.5;
    const hd = st.d * 0.5;

    // 1. Single Continuous UV-Mapped Red Carpet Floor Plane (upward FrontSide)
    const arrivingStair = idx > 0 ? PALACE_STAIRS[idx - 1] : null;
    const stairHole = getPalaceStairHole(idx) ?? undefined;

    const floorPlane = new THREE.Mesh(
      createContinuousCarpetFloorGeometry(st.w, st.d, stairHole, 5.4),
      redCarpetMat
    );
    floorPlane.position.set(0, y0 + 0.006, 0);
    floorPlane.receiveShadow = true;
    storyGroup.add(floorPlane);

    // Stairwell Opening Parapet Balustrades on upper landings (East, West, South closed; North top landing open)
    if (stairHole && arrivingStair) {
      const holeW = stairHole.maxX - stairHole.minX;
      const holeD = stairHole.maxZ - stairHole.minZ;
      const holeMidX = (stairHole.minX + stairHole.maxX) * 0.5;
      const holeMidZ = (stairHole.minZ + stairHole.maxZ) * 0.5;
      const addHoleGuard = (gx: number, gz: number, gw: number, gd: number) => {
        const gm = new THREE.Mesh(new THREE.BoxGeometry(gw, 0.96, gd), goldMat);
        gm.position.set(gx, y0 + 0.48, gz);
        storyGroup.add(gm);
        boxColliders.push({
          x: palaceX + gx,
          z: palaceZ + gz,
          halfW: gw * 0.5 + 0.04,
          halfD: gd * 0.5 + 0.04,
          height: 1.45,
          baseY: baseY + y0,
        });
      };
      addHoleGuard(stairHole.minX - 0.14, holeMidZ, 0.24, holeD);
      addHoleGuard(stairHole.maxX + 0.14, holeMidZ, 0.24, holeD);
      addHoleGuard(holeMidX, stairHole.maxZ + 0.14, holeW + 0.36, 0.24);
    }

    // Downward-facing (-Y FrontSide) Coffered Interior Ceiling Slab with outgoing stair hole
    const outgoingStairHole = idx < 6 ? (getPalaceStairHole(idx + 1) ?? undefined) : undefined;
    const ceilingSlab = new THREE.Mesh(
      createContinuousCeilingGeometry(st.w, st.d, outgoingStairHole, 5.4),
      ceilingMat
    );
    ceilingSlab.position.set(0, y0 + st.clearHeight - 0.16, 0);
    storyGroup.add(ceilingSlab);

    // Stepped Exterior Terrace Coping recessed cleanly below upper carpet plane (no z-fighting)
    if (idx < PALACE_STORIES.length - 1) {
      const nextSt = PALACE_STORIES[idx + 1];
      const terraceRing = new THREE.Mesh(
        createContinuousCarpetFloorGeometry(
          st.w + 0.5,
          st.d + 0.5,
          {
            minX: -nextSt.w * 0.5,
            maxX: nextSt.w * 0.5,
            minZ: -nextSt.d * 0.5,
            maxZ: nextSt.d * 0.5,
          },
          5.0
        ),
        trimMat
      );
      terraceRing.position.set(0, y0 + st.clearHeight - 0.045, 0);
      storyGroup.add(terraceRing);
    }

    // Thin Perimeter Stone Fascia Rim
    const rimH = 0.34;
    const rimMat = idx % 2 === 0 ? stoneMat : trimMat;
    const addRimBeam = (rx: number, rz: number, rw: number, rd: number, ry: number, mat = rimMat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(rw, rimH, rd), mat);
      m.position.set(rx, ry, rz);
      m.castShadow = true;
      storyGroup.add(m);
    };
    addRimBeam(0, -hd - 0.15, st.w + 0.6, 0.36, y0 - rimH * 0.5);
    addRimBeam(0, hd + 0.15, st.w + 0.6, 0.36, y0 - rimH * 0.5);
    addRimBeam(-hw - 0.15, 0, 0.36, st.d + 0.6, y0 - rimH * 0.5);
    addRimBeam(hw + 0.15, 0, 0.36, st.d + 0.6, y0 - rimH * 0.5);

    // Hollow 4-Edge Upper Cornice Ring around story roof rim
    const corniceMat = idx % 2 === 0 ? trimMat : goldMat;
    const corniceY = y0 + st.clearHeight - 0.18;
    addRimBeam(0, -hd - 0.22, st.w + 1.0, 0.56, corniceY, corniceMat);
    addRimBeam(0, hd + 0.22, st.w + 1.0, 0.56, corniceY, corniceMat);
    addRimBeam(-hw - 0.22, 0, 0.56, st.d + 1.0, corniceY, corniceMat);
    addRimBeam(hw + 0.22, 0, 0.56, st.d + 1.0, corniceY, corniceMat);

    // 2. Structural Exterior Walls on All 4 Sides (Open Jharokha Windows + Open Balcony Portals)
    const wallT = 0.46;
    const sillH = 0.96;
    const lintelH = 0.92;
    const windowVoidH = Math.max(1.5, st.clearHeight - sillH - lintelH);

    const addSolidWallBox = (
      lx: number,
      lz: number,
      w: number,
      d: number,
      h: number,
      yOff: number,
      colliderH: number,
      mat: THREE.Material = stoneMat
    ) => {
      if (w <= 0.12 || d <= 0.12) return;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(lx, y0 + yOff + h * 0.5, lz);
      m.castShadow = true;
      m.receiveShadow = true;
      storyGroup.add(m);
      if (colliderH > 0) {
        boxColliders.push({
          x: palaceX + lx,
          z: palaceZ + lz,
          halfW: w * 0.5 + 0.05,
          halfD: d * 0.5 + 0.05,
          height: colliderH,
          baseY: baseY + y0,
        });
      }
    };

    // Helper that builds one architectural facade wall along X or Z with:
    // - Central open portal/balcony opening (width = openW)
    // - Symmetrical solid structural corner/mid piers + open carved Jharokha window bays
    const buildFacadeWithWindows = (
      axis: 'X' | 'Z',
      fixedCoord: number,
      totalSpan: number,
      openPortalW: number
    ) => {
      const wingSpan = totalSpan * 0.5 - openPortalW * 0.5;
      // Portal header arch beam above doorway/balcony
      if (axis === 'X') {
        addSolidWallBox(0, fixedCoord, openPortalW + 0.3, wallT, lintelH, st.clearHeight - lintelH, 0, trimMat);
      } else {
        addSolidWallBox(fixedCoord, 0, wallT, openPortalW + 0.3, lintelH, st.clearHeight - lintelH, 0, trimMat);
      }

      [-1, 1].forEach((side) => {
        const outerEdge = totalSpan * 0.5;
        const innerEdge = openPortalW * 0.5;
        if (wingSpan < 2.2) {
          // Compact story wall: solid full-height pier flank
          const mid = side * ((outerEdge + innerEdge) * 0.5);
          if (axis === 'X') {
            addSolidWallBox(mid, fixedCoord, wingSpan, wallT, st.clearHeight, 0, st.clearHeight, stoneMat);
          } else {
            addSolidWallBox(fixedCoord, mid, wallT, wingSpan, st.clearHeight, 0, st.clearHeight, stoneMat);
          }
          return;
        }

        // Split wing cleanly into: Inner Jamb Pier + Open Jharokha Window(s) + Outer Corner Pier
        const cornerPierW = Math.min(2.1, wingSpan * 0.28);
        const portalJambW = Math.min(1.4, wingSpan * 0.22);
        const windowSpan = wingSpan - cornerPierW - portalJambW;

        const cCenter = side * (outerEdge - cornerPierW * 0.5);
        const jCenter = side * (innerEdge + portalJambW * 0.5);
        const wCenter = side * (innerEdge + portalJambW + windowSpan * 0.5);

        if (axis === 'X') {
          addSolidWallBox(cCenter, fixedCoord, cornerPierW, wallT, st.clearHeight, 0, st.clearHeight, stoneMat);
          addSolidWallBox(jCenter, fixedCoord, portalJambW, wallT, st.clearHeight, 0, st.clearHeight, trimMat);
          // Open Window Sill Wall with full-height solid wall collider so view stays open while characters never clip out
          addSolidWallBox(wCenter, fixedCoord, windowSpan, wallT, sillH, 0, st.clearHeight, stoneMat);
          // Golden Window Sill Coping & Overhead Carved Lintel
          addSolidWallBox(wCenter, fixedCoord, windowSpan + 0.1, wallT + 0.08, 0.1, sillH, 0, goldMat);
          addSolidWallBox(wCenter, fixedCoord, windowSpan, wallT, lintelH, st.clearHeight - lintelH, 0, trimMat);
          // Graceful central golden window mullion dividing wide open bay into twin arches
          if (windowSpan >= 3.2) {
            addSolidWallBox(wCenter, fixedCoord, 0.26, wallT * 0.72, windowVoidH, sillH, windowVoidH, goldMat);
          }
        } else {
          addSolidWallBox(fixedCoord, cCenter, wallT, cornerPierW, st.clearHeight, 0, st.clearHeight, stoneMat);
          addSolidWallBox(fixedCoord, jCenter, wallT, portalJambW, st.clearHeight, 0, st.clearHeight, trimMat);
          addSolidWallBox(fixedCoord, wCenter, wallT, windowSpan, sillH, 0, st.clearHeight, stoneMat);
          addSolidWallBox(fixedCoord, wCenter, wallT + 0.08, windowSpan + 0.1, 0.1, sillH, 0, goldMat);
          addSolidWallBox(fixedCoord, wCenter, wallT, windowSpan, lintelH, st.clearHeight - lintelH, 0, trimMat);
          if (windowSpan >= 3.2) {
            addSolidWallBox(fixedCoord, wCenter, wallT * 0.72, 0.26, windowVoidH, sillH, windowVoidH, goldMat);
          }
        }
      });
    };

    // Helper for Enclosed Palace Balcony Alcoves with Full-Height Solid Walls, Ceiling & Solid BoxColliders
    const addCantileveredBalcony = (
      side: 'NORTH' | 'SOUTH' | 'WEST' | 'EAST',
      spanW: number,
      depthProj: number
    ) => {
      const bx = side === 'WEST' ? -hw - depthProj * 0.5 : side === 'EAST' ? hw + depthProj * 0.5 : 0;
      const bz = side === 'NORTH' ? -hd - depthProj * 0.5 : side === 'SOUTH' ? hd + depthProj * 0.5 : 0;
      const w = side === 'NORTH' || side === 'SOUTH' ? spanW : depthProj;
      const d = side === 'NORTH' || side === 'SOUTH' ? depthProj : spanW;

      const deckBase = new THREE.Mesh(new THREE.BoxGeometry(w - 0.12, 0.24, d - 0.12), trimMat);
      deckBase.position.set(bx, y0 - 0.19, bz);
      storyGroup.add(deckBase);

      const balcPlane = new THREE.Mesh(
        createContinuousCarpetFloorGeometry(w, d, undefined, 4.5),
        redCarpetMat
      );
      balcPlane.position.set(bx, y0 + 0.006, bz);
      balcPlane.receiveShadow = true;
      storyGroup.add(balcPlane);

      // Overhead coffered interior ceiling + protective roof slab enclosing the balcony from above
      const balcCeiling = new THREE.Mesh(
        createContinuousCeilingGeometry(w, d, undefined, 4.5),
        ceilingMat
      );
      balcCeiling.position.set(bx, y0 + st.clearHeight - 0.16, bz);
      storyGroup.add(balcCeiling);

      const balcRoof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.24, 0.28, d + 0.24), trimMat);
      balcRoof.position.set(bx, y0 + st.clearHeight, bz);
      balcRoof.castShadow = true;
      storyGroup.add(balcRoof);

      // Full-height solid enclosing walls + golden trim dado/cornice + full-height BoxColliders on all 3 outer sides
      const bWallT = 0.42;
      const wallH = st.clearHeight;
      const addEnclosedWall = (rx: number, rz: number, rw: number, rd: number) => {
        const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(rw, wallH, rd), stoneMat);
        wallMesh.position.set(rx, y0 + wallH * 0.5, rz);
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        storyGroup.add(wallMesh);

        const dadoBand = new THREE.Mesh(new THREE.BoxGeometry(rw + 0.08, 0.12, rd + 0.08), goldMat);
        dadoBand.position.set(rx, y0 + 0.96, rz);
        storyGroup.add(dadoBand);

        const corniceBand = new THREE.Mesh(new THREE.BoxGeometry(rw + 0.1, 0.22, rd + 0.1), trimMat);
        corniceBand.position.set(rx, y0 + wallH - 0.11, rz);
        storyGroup.add(corniceBand);

        boxColliders.push({
          x: palaceX + rx,
          z: palaceZ + rz,
          halfW: rw * 0.5 + 0.06,
          halfD: rd * 0.5 + 0.06,
          height: wallH + 0.45,
          baseY: baseY + y0,
        });
      };

      if (side === 'NORTH') {
        addEnclosedWall(0, -hd - depthProj + bWallT * 0.5, spanW, bWallT);
        addEnclosedWall(-spanW * 0.5 + bWallT * 0.5, bz, bWallT, depthProj);
        addEnclosedWall(spanW * 0.5 - bWallT * 0.5, bz, bWallT, depthProj);
      } else if (side === 'SOUTH') {
        addEnclosedWall(0, hd + depthProj - bWallT * 0.5, spanW, bWallT);
        addEnclosedWall(-spanW * 0.5 + bWallT * 0.5, bz, bWallT, depthProj);
        addEnclosedWall(spanW * 0.5 - bWallT * 0.5, bz, bWallT, depthProj);
      } else if (side === 'WEST') {
        addEnclosedWall(-hw - depthProj + bWallT * 0.5, 0, bWallT, spanW);
        addEnclosedWall(bx, -spanW * 0.5 + bWallT * 0.5, depthProj, bWallT);
        addEnclosedWall(bx, spanW * 0.5 - bWallT * 0.5, depthProj, bWallT);
      } else {
        addEnclosedWall(hw + depthProj - bWallT * 0.5, 0, bWallT, spanW);
        addEnclosedWall(bx, -spanW * 0.5 + bWallT * 0.5, depthProj, bWallT);
        addEnclosedWall(bx, spanW * 0.5 - bWallT * 0.5, depthProj, bWallT);
      }
    };

    const frontBalcW = Math.min(6.4, st.w * 0.36);
    const sideBalcW = Math.min(4.8, st.d * 0.28);

    // Construct All 4 Structural Walls + Open Balconies + Open Windows
    buildFacadeWithWindows('X', hd - 0.24, st.w, idx === 0 ? 7.4 : frontBalcW);
    buildFacadeWithWindows('X', -hd + 0.24, st.w, frontBalcW);
    buildFacadeWithWindows('Z', -hw + 0.24, st.d, idx <= 3 ? sideBalcW : 0);
    buildFacadeWithWindows('Z', hw - 0.24, st.d, idx <= 3 ? sideBalcW : 0);

    addCantileveredBalcony('NORTH', frontBalcW, 2.1);
    if (idx > 0) {
      addCantileveredBalcony('SOUTH', frontBalcW, 2.1);
    }
    if (idx <= 3) {
      addCantileveredBalcony('WEST', sideBalcW, 1.6);
      addCantileveredBalcony('EAST', sideBalcW, 1.6);
    }

    // 3. Interior Colonnade Pillars Adorned with Mythological Artwork + Gold Capitals & Plinths
    const xCols = idx < 4 ? [-hw + 1.4, -hw * 0.36, hw * 0.36, hw - 1.4] : [-hw + 1.3, hw - 1.3];
    const zRows = idx < 4 ? [-hd + 1.4, -hd * 0.34, hd * 0.34, hd - 1.4] : [-hd + 1.3, hd - 1.3];
    const pillarSpots: Array<[number, number]> = [];
    const outgoingStair = idx < PALACE_STAIRS.length ? PALACE_STAIRS[idx] : null;
    xCols.forEach((px, xi) => {
      zRows.forEach((pz, zi) => {
        const isPerimeter = xi === 0 || xi === xCols.length - 1 || zi === 0 || zi === zRows.length - 1;
        if (!isPerimeter) return;
        // Keep central North/South/East/West balcony portal aisles strictly unobstructed
        if (Math.abs(px) < 1.9 && Math.abs(pz) > hd - 2.4) return;
        if (Math.abs(pz) < 1.9 && Math.abs(px) > hw - 2.4) return;
        if (
          arrivingStair &&
          Math.abs(px - (arrivingStair.xCenter - palaceX)) < 3.1 &&
          pz >= arrivingStair.zEnd - palaceZ - 2.4 &&
          pz <= arrivingStair.zStart - palaceZ + 2.4
        ) {
          return;
        }
        if (
          outgoingStair &&
          Math.abs(px - (outgoingStair.xCenter - palaceX)) < 3.1 &&
          pz >= outgoingStair.zEnd - palaceZ - 2.4 &&
          pz <= outgoingStair.zStart - palaceZ + 2.4
        ) {
          return;
        }
        pillarSpots.push([px, pz]);
      });
    });

    pillarSpots.forEach(([px, pz], pIdx) => {
      const pBase = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.38, 0.88), trimMat);
      pBase.position.set(px, y0 + 0.19, pz);
      storyGroup.add(pBase);

      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.38, st.clearHeight - 0.72, 14),
        mythArtMat
      );
      col.position.set(px, y0 + st.clearHeight * 0.5, pz);
      col.castShadow = true;
      storyGroup.add(col);

      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 8, 16), goldMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.set(px, y0 + st.clearHeight * 0.78, pz);
      storyGroup.add(collar);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.34, 0.95), goldMat);
      cap.position.set(px, y0 + st.clearHeight - 0.34, pz);
      storyGroup.add(cap);

      circleColliders.push({
        x: palaceX + px,
        z: palaceZ + pz,
        radius: 0.48,
        height: st.clearHeight,
        baseY: baseY + y0,
      });

      if (pIdx % 2 === 0 || idx >= 5) {
        const isFrontTorch = pz > 0;
        const offsetIn = isFrontTorch ? -0.68 : 0.68;
        const tx = px + (px > 0 ? -0.42 : 0.42);
        const tz = pz + offsetIn;

        const torchPedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.45, 8), trimMat);
        torchPedestal.position.set(tx, y0 + 0.72, tz);
        storyGroup.add(torchPedestal);

        const brazier = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.12, 0.22, 8), goldMat);
        brazier.position.set(tx, y0 + 1.52, tz);
        storyGroup.add(brazier);

        palaceTorchAnchors.push({
          x: palaceX + tx,
          y: baseY + y0 + 1.62,
          z: palaceZ + tz,
          phase: idx * 2.1 + pIdx * 1.13,
        });
      } else {
        const lx = px + (px > 0 ? -0.52 : 0.52);
        const lz = pz + (pz > 0 ? -0.52 : 0.52);
        const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.18, 1.28, 8), goldMat);
        lampStem.position.set(lx, y0 + 0.64, lz);
        storyGroup.add(lampStem);

        const lampBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.14, 0.12, 10), goldMat);
        lampBowl.position.set(lx, y0 + 1.24, lz);
        storyGroup.add(lampBowl);

        const lampFlame = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 6), lampGlowMat);
        lampFlame.position.set(lx, y0 + 1.42, lz);
        storyGroup.add(lampFlame);
      }
    });

    // 4. Open Carved Sandstone & Gold Jharokha Archway Frames on Portal Openings (Zero Curtains)
    const archH = st.clearHeight - 0.92;
    const makeOpenJharokhaFrame = (cx: number, cz: number, spanW: number, rotY: number) => {
      const jg = new THREE.Group();
      jg.position.set(cx, y0, cz);
      jg.rotation.y = rotY;

      const lintelTrim = new THREE.Mesh(new THREE.BoxGeometry(spanW, 0.24, 0.2), goldMat);
      lintelTrim.position.y = archH + 0.12;
      jg.add(lintelTrim);

      [-1, 1].forEach((s) => {
        const pilaster = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, archH, 10), goldMat);
        pilaster.position.set(s * (spanW * 0.48), archH * 0.5, 0);
        jg.add(pilaster);
      });

      storyGroup.add(jg);
    };

    const southEdgeZ = hd - 0.36;
    const northEdgeZ = -hd + 0.36;
    makeOpenJharokhaFrame(0, southEdgeZ, idx === 0 ? 7.2 : frontBalcW, 0);
    makeOpenJharokhaFrame(0, northEdgeZ, frontBalcW, Math.PI);
    if (idx <= 3) {
      makeOpenJharokhaFrame(-hw + 0.36, 0, sideBalcW, Math.PI / 2);
      makeOpenJharokhaFrame(hw - 0.36, 0, sideBalcW, -Math.PI / 2);
    }

    // Corner Golden Finial Chhatri Spires on every story
    [
      [-hw + 0.4, hd - 0.4],
      [hw - 0.4, hd - 0.4],
      [-hw + 0.4, -hd + 0.4],
      [hw - 0.4, -hd + 0.4],
    ].forEach(([cx, cz]) => {
      const finial = new THREE.Mesh(new THREE.ConeGeometry(0.56 - idx * 0.04, 1.65, 8), goldMat);
      finial.position.set(cx, y0 + st.clearHeight + 0.85, cz);
      storyGroup.add(finial);
    });
  });

  // 5. Ergonomic 24-Step Gold-Detailed Walkable Staircases + Smooth Continuous Ramp Colliders
  PALACE_STAIRS.forEach((st, stIdx) => {
    const stairHost = palaceStoryGroups[stIdx] ?? palaceGroup;
    const lx = st.xCenter - palaceX;
    const zS = st.zStart - palaceZ;
    const zE = st.zEnd - palaceZ;
    const stepCount = 24;
    const runLen = zS - zE;
    const rise = st.yEnd - st.yStart;
    const stepDepth = runLen / stepCount + 0.06;
    const stepRise = rise / stepCount;

    for (let s = 0; s < stepCount; s++) {
      const frac = (s + 0.5) / stepCount;
      const sy = st.yStart + frac * rise;
      const sz = zS - frac * runLen;

      const tread = new THREE.Mesh(
        new THREE.BoxGeometry(st.halfW * 2, stepRise + 0.14, stepDepth),
        stoneMat
      );
      tread.position.set(lx, sy - (stepRise + 0.14) * 0.5, sz);
      tread.receiveShadow = true;
      stairHost.add(tread);

      const nosing = new THREE.Mesh(
        new THREE.BoxGeometry(st.halfW * 2 + 0.06, 0.05, 0.075),
        goldMat
      );
      nosing.position.set(lx, sy + 0.012, sz + stepDepth * 0.44);
      stairHost.add(nosing);

      if (s % 4 === 0) {
        [-st.halfW, st.halfW].forEach((sideX) => {
          const baluster = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.066, 0.92, 6), goldMat);
          baluster.position.set(lx + sideX, sy + 0.46, sz);
          stairHost.add(baluster);
        });
      }
    }

    // Continuous smooth sloped stair ramp collider (lets players/NPCs glide smoothly up/down while blocking under-stair clipping)
    boxColliders.push({
      x: st.xCenter,
      z: (st.zStart + st.zEnd) * 0.5,
      halfW: st.halfW,
      halfD: runLen * 0.5 + 0.12,
      height: rise + 0.4,
      baseY: baseY + st.yStart,
      isStairRamp: true,
      stairZStart: st.zStart,
      stairZEnd: st.zEnd,
      stairYStart: baseY + st.yStart,
      stairYEnd: baseY + st.yEnd,
    });

    const flightLen = Math.hypot(runLen, rise);
    const pitchAngle = Math.atan2(rise, runLen);
    [-st.halfW, st.halfW].forEach((sideX) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.1, flightLen + 0.25), goldMat);
      rail.position.set(lx + sideX, (st.yStart + st.yEnd) * 0.5 + 0.94, (zS + zE) * 0.5);
      rail.rotation.x = pitchAngle;
      stairHost.add(rail);
    });

    // Solid stair-carriage side walls placed flush outside handrail width so travelers never snag inside stair corridors
    [-st.halfW - 0.22, st.halfW + 0.22].forEach((sideX) => {
      boxColliders.push({
        x: st.xCenter + sideX,
        z: (st.zStart + st.zEnd) * 0.5,
        halfW: 0.16,
        halfD: runLen * 0.5 + 0.28,
        height: rise + 1.55,
        baseY: baseY + st.yStart,
      });
    });
  });

  // Grand Story-7 Roof Dome, Golden Amalaka & Kalasha Crest Spire (registered as dynamic RoofOccluder)
  const topStory = PALACE_STORIES[PALACE_STORIES.length - 1];
  const crownY = topStory.floorY + topStory.clearHeight;
  const topRoofGroup = new THREE.Group();
  palaceGroup.add(topRoofGroup);

  const topRoof = new THREE.Mesh(
    new THREE.BoxGeometry(topStory.w + 0.6, 0.48, topStory.d + 0.6),
    trimMat
  );
  topRoof.position.y = crownY + 0.24;
  topRoofGroup.add(topRoof);

  const amalaka = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.9, 1.15, 20), goldMat);
  amalaka.position.y = crownY + 1.0;
  topRoofGroup.add(amalaka);

  const sikharaSpire = new THREE.Mesh(new THREE.ConeGeometry(1.4, 4.0, 16), goldMat);
  sikharaSpire.position.y = crownY + 3.5;
  sikharaSpire.castShadow = true;
  topRoofGroup.add(sikharaSpire);

  roofOccluders.push({
    obj: topRoofGroup,
    roofY: baseY + crownY,
    minX: palaceX - topStory.w * 0.55,
    maxX: palaceX + topStory.w * 0.55,
    minZ: palaceZ - topStory.d * 0.55,
    maxZ: palaceZ + topStory.d * 0.55,
  });

  // Monumental Suryadev Lineage Emblems mounted prominently on Story 2 South Cornice & Story 7 Crest
  const suryaMain = createSuryadevEmblemMesh(goldMat, rubyMat);
  suryaMain.scale.setScalar(1.3);
  suryaMain.position.set(0, 8.6, 12.6);
  palaceStoryGroups[1].add(suryaMain);

  const suryaCrown = createSuryadevEmblemMesh(goldMat, rubyMat);
  suryaCrown.scale.setScalar(0.85);
  suryaCrown.position.set(0, crownY + 1.6, topStory.d * 0.5 + 0.55);
  topRoofGroup.add(suryaCrown);

  // Carved Epigraphic Inscription Tablets (Stelae) flanking Story-1 South Portal
  [-6.8, 6.8].forEach((ex) => {
    const steleBase = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.85, 1.1), trimMat);
    steleBase.position.set(ex, 0.42, 14.8);
    palaceGroup.add(steleBase);

    const tablet = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.3, 0.42), epigraphMat);
    tablet.position.set(ex, 2.5, 14.8);
    tablet.castShadow = true;
    palaceGroup.add(tablet);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.32, 0.55), goldMat);
    frame.position.set(ex, 4.28, 14.8);
    palaceGroup.add(frame);

    boxColliders.push({
      x: palaceX + ex,
      z: palaceZ + 14.8,
      halfW: 1.45,
      halfD: 0.6,
      height: 4.5,
      baseY,
    });
  });

  // ===========================================================================
  // PART B: OPEN-AIR RAJYA SABHA ASSEMBLY HALL + SIMHASANA THRONE + 16 SEATS
  // ===========================================================================
  const sabhaBaseY = Math.max(RIVER_SURFACE_Y + 0.35, groundHeightAt(sabhaX, sabhaZ));
  const sabhaGroup = new THREE.Group();
  sabhaGroup.position.set(sabhaX, sabhaBaseY, sabhaZ);
  group.add(sabhaGroup);

  // Recessed Plinth Skirt + Single Continuous UV-Mapped Red Carpet Floor Plane (zero overlapping slabs)
  const sabhaPlinth = new THREE.Mesh(new THREE.BoxGeometry(27.6, 0.36, 21.6), trimMat);
  sabhaPlinth.position.set(0, 0.18, 0);
  sabhaGroup.add(sabhaPlinth);

  const sabhaCarpetPlane = new THREE.Mesh(
    createContinuousCarpetFloorGeometry(28.4, 22.4, undefined, 5.4),
    redCarpetMat
  );
  sabhaCarpetPlane.position.set(0, 0.42, 0);
  sabhaCarpetPlane.receiveShadow = true;
  sabhaGroup.add(sabhaCarpetPlane);

  // Broad Ceremonial Stair Steps on South Front (+Z) so Ram walks smoothly onto Sabha
  for (let s = 0; s < 3; s++) {
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(16, 0.14, 1.2),
      s % 2 === 0 ? trimMat : stoneMat
    );
    step.position.set(0, 0.07 + s * 0.13, 12.6 - s * 0.9);
    step.receiveShadow = true;
    sabhaGroup.add(step);
  }

  // Structural Corner Wing Walls + Window Bays + Parapet Balustrades on All 4 Sabha Sides
  const addSabhaWall = (lx: number, lz: number, w: number, d: number, h: number, yOff = 0.42, ch = h) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stoneMat);
    m.position.set(lx, yOff + h * 0.5, lz);
    m.castShadow = true;
    sabhaGroup.add(m);
    if (ch > 0) {
      boxColliders.push({
        x: sabhaX + lx,
        z: sabhaZ + lz,
        halfW: w * 0.5 + 0.05,
        halfD: d * 0.5 + 0.05,
        height: ch,
        baseY: sabhaBaseY + yOff,
      });
    }
  };
  // Solid Corner Pier Walls (North piers lock flush against +-7.05m link bridge rails; East/West feature open window bays + full wall colliders)
  [
    [-10.45, -10.7, 6.7, 0.52],
    [10.45, -10.7, 6.7, 0.52],
    [-11.2, 10.7, 5.2, 0.52],
    [11.2, 10.7, 5.2, 0.52],
  ].forEach(([wx, wz, ww, wd]) => addSabhaWall(wx, wz, ww, wd, 7.0));
  [-13.7, 13.7].forEach((wx) => {
    addSabhaWall(wx, -8.2, 0.52, 5.2, 7.0);
    addSabhaWall(wx, 8.2, 0.52, 5.2, 7.0);
    // Low sandstone perimeter window dado + full-height solid wall boundary beneath open side arches
    addSabhaWall(wx, 0, 0.52, 11.2, 1.0, 0.42, 7.0);
  });

  // 12 Sculpted Colonnade Pillars supporting Coffered Sabha Roof (registered as CircleColliders)
  const pillarCoords: Array<[number, number]> = [
    [-12.2, -9.2], [-12.2, -3.0], [-12.2, 3.2], [-12.2, 9.2],
    [12.2, -9.2], [12.2, -3.0], [12.2, 3.2], [12.2, 9.2],
    [-6.6, 9.2], [6.6, 9.2],
    [-6.6, -9.2], [6.6, -9.2],
  ];
  pillarCoords.forEach(([px, pz]) => {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.56, 6.8, 12), stoneMat);
    col.position.set(px, 3.82, pz);
    col.castShadow = true;
    sabhaGroup.add(col);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.5, 1.35), goldMat);
    cap.position.set(px, 7.25, pz);
    sabhaGroup.add(cap);

    circleColliders.push({
      x: sabhaX + px,
      z: sabhaZ + pz,
      radius: 0.65,
      height: 7.5,
      baseY: sabhaBaseY,
    });
  });

  // Ornate Coffered Roof Canopy over Sabha + Downward (-Y FrontSide) Interior Ceiling
  const sabhaRoofGroup = new THREE.Group();
  sabhaGroup.add(sabhaRoofGroup);

  const sabhaCeiling = new THREE.Mesh(
    createContinuousCeilingGeometry(27.5, 21.5, undefined, 5.4),
    ceilingMat
  );
  sabhaCeiling.position.set(0, 7.45, 0);
  sabhaRoofGroup.add(sabhaCeiling);

  const sabhaRoof = new THREE.Mesh(new THREE.BoxGeometry(27.5, 0.72, 21.5), trimMat);
  sabhaRoof.position.set(0, 7.82, 0);
  sabhaRoof.castShadow = true;
  sabhaRoofGroup.add(sabhaRoof);

  const sabhaRoofRim = new THREE.Mesh(new THREE.BoxGeometry(28.4, 0.35, 22.4), goldMat);
  sabhaRoofRim.position.set(0, 8.28, 0);
  sabhaRoofGroup.add(sabhaRoofRim);

  roofOccluders.push({
    obj: sabhaRoofGroup,
    roofY: sabhaBaseY + 7.45,
    minX: sabhaX - 14.4,
    maxX: sabhaX + 14.4,
    minZ: sabhaZ - 11.4,
    maxZ: sabhaZ + 11.4,
  });

  // Elevated Golden Simhasana Throne at (throneX, throneZ)
  const tx = throneX - sabhaX;
  const tz = throneZ - sabhaZ;
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 0.46, 16), trimMat);
  dais.position.set(tx, 0.65, tz);
  dais.receiveShadow = true;
  sabhaGroup.add(dais);

  const throneSeat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 1.5), crimsonMat);
  throneSeat.position.set(tx, 1.15, tz);
  throneSeat.castShadow = true;
  sabhaGroup.add(throneSeat);

  const throneBack = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.4, 0.32), goldMat);
  throneBack.position.set(tx, 2.35, tz - 0.65);
  throneBack.castShadow = true;
  sabhaGroup.add(throneBack);

  const throneSun = createSuryadevEmblemMesh(goldMat, rubyMat);
  throneSun.scale.setScalar(0.45);
  throneSun.position.set(tx, 3.15, tz - 0.45);
  sabhaGroup.add(throneSun);

  [-0.98, 0.98].forEach((ax) => {
    const armrest = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.55, 1.45), goldMat);
    armrest.position.set(tx + ax, 1.45, tz);
    sabhaGroup.add(armrest);
  });

  const chhatra = new THREE.Mesh(new THREE.ConeGeometry(1.75, 0.72, 16), crimsonMat);
  chhatra.position.set(tx, 4.45, tz);
  sabhaGroup.add(chhatra);

  boxColliders.push({
    x: throneX,
    z: throneZ - 0.75,
    halfW: 1.25,
    halfD: 0.45,
    height: 3.8,
    rotY: 0,
    baseY: sabhaBaseY,
  });

  // Flanking Epigraphic Inscription Stelae inside Sabha Entrance (with solid BoxColliders)
  [-9.5, 9.5].forEach((ex) => {
    const pillarTablet = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.4, 0.35), epigraphMat);
    pillarTablet.position.set(ex, 1.75, 9.2);
    sabhaGroup.add(pillarTablet);
    boxColliders.push({
      x: sabhaX + ex,
      z: sabhaZ + 9.2,
      halfW: 1.0,
      halfD: 0.25,
      height: 2.8,
      baseY: sabhaBaseY,
    });
  });

  // 16 Cushioned Sabha Seats for 6 Ministers, 6 Commanders & 4 Spies
  const addSeat = (
    lx: number,
    lz: number,
    role: 'MINISTER' | 'COMMANDER' | 'SPY',
    cushionColor: number
  ) => {
    const seatMat = new THREE.MeshStandardMaterial({ color: cushionColor, roughness: 0.65 });
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.42, 12), stoneMat);
    pedestal.position.set(lx, 0.62, lz);
    sabhaGroup.add(pedestal);

    const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.14, 12), seatMat);
    cushion.position.set(lx, 0.88, lz);
    sabhaGroup.add(cushion);

    const wx = sabhaX + lx;
    const wz = sabhaZ + lz;
    const faceYaw = Math.atan2(throneX - wx, throneZ - wz);
    seatPositions.push({
      role,
      x: wx,
      y: sabhaBaseY + 0.42,
      z: wz,
      faceYaw,
    });
  };

  [
    [-4.6, -4.8], [-4.6, -1.8], [-4.6, 1.2],
    [4.6, -4.8], [4.6, -1.8], [4.6, 1.2],
  ].forEach(([sx, sz]) => addSeat(sx, sz, 'MINISTER', 0xa61f24));

  [
    [-8.6, -4.8], [-8.6, -1.8], [-8.6, 1.2],
    [8.6, -4.8], [8.6, -1.8], [8.6, 1.2],
  ].forEach(([sx, sz]) => addSeat(sx, sz, 'COMMANDER', 0xc97b1c));

  [
    [-8.6, 5.2], [-4.6, 5.2],
    [4.6, 5.2], [8.6, 5.2],
  ].forEach(([sx, sz]) => addSeat(sx, sz, 'SPY', 0x2f3b52));

  return {
    group,
    boxColliders,
    circleColliders,
    seatPositions,
    palaceTorchAnchors,
    roofOccluders,
    palaceStoryGroups,
    palaceTopRoofGroup: topRoofGroup,
  };
}

/**
 * Functional Servant Quarters Courtyard Wing (Sevaka-Avasa) with sleeping cots, terracotta water vessels & lamps.
 * Features a single continuous UV-mapped red-carpet floor plane over a recessed plinth, structural perimeter
 * & open doorway jamb colliders (so interiors are enterable without clipping), and occludable downward ceilings.
 */
export function createServantQuartersModel(
  textures: ProceduralTextures,
  x: number,
  z: number
): { group: THREE.Group; colliders: BoxCollider[]; roofOccluders: RoofOccluder[] } {
  const group = new THREE.Group();
  const baseY = Math.max(RIVER_SURFACE_Y + 0.35, groundHeightAt(x, z));
  group.position.set(x, baseY, z);
  const colliders: BoxCollider[] = [];
  const roofOccluders: RoofOccluder[] = [];

  const wallMat = new THREE.MeshPhysicalMaterial({
    map: textures.sandstone,
    normalMap: textures.sandstoneNormal,
    roughnessMap: textures.sandstoneRoughness,
    color: 0xd8b282,
    roughness: 0.88,
    ior: 1.54,
  });
  const trimMat = new THREE.MeshPhysicalMaterial({
    map: textures.sandstone,
    normalMap: textures.sandstoneNormal,
    roughnessMap: textures.sandstoneRoughness,
    color: 0x9c5e31,
    roughness: 0.8,
    ior: 1.54,
  });
  const redCarpetMat = new THREE.MeshPhysicalMaterial({
    map: textures.redCarpet,
    normalMap: textures.redCarpetNormal,
    normalScale: new THREE.Vector2(0.88, 0.88),
    roughnessMap: textures.redCarpetRoughness,
    roughness: 0.82,
    metalness: 0.05,
    ior: 1.48,
    sheen: 0.72,
    sheenColor: new THREE.Color(0xff9b7a),
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const ceilingMat = new THREE.MeshPhysicalMaterial({
    map: textures.sandstone,
    normalMap: textures.sandstoneNormal,
    roughnessMap: textures.sandstoneRoughness,
    color: 0xd9a76a,
    roughness: 0.8,
    metalness: 0.1,
    ior: 1.54,
    side: THREE.FrontSide,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    map: textures.silkGold,
    normalMap: textures.silkNormal,
    color: 0x994228,
    roughness: 0.68,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    map: textures.bark,
    normalMap: textures.barkNormal,
    color: 0x6b4322,
    roughness: 0.82,
  });
  const clayMat = new THREE.MeshStandardMaterial({ color: 0xb45c34, roughness: 0.72 });
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffc857,
    emissive: 0xff8018,
    emissiveIntensity: 1.2,
  });

  // Recessed Plinth Base + Elevated Continuous UV-Mapped Red-Carpet Plane (zero z-fighting)
  const subPlinth = new THREE.Mesh(new THREE.BoxGeometry(13.1, 0.34, 21.6), trimMat);
  subPlinth.position.y = 0.17;
  subPlinth.receiveShadow = true;
  group.add(subPlinth);

  const floorCarpet = new THREE.Mesh(
    createContinuousCarpetFloorGeometry(13.5, 22.0, undefined, 4.8),
    redCarpetMat
  );
  floorCarpet.position.set(0, 0.40, 0);
  floorCarpet.receiveShadow = true;
  group.add(floorCarpet);

  // Courtyard Perimeter Dado Walls on all sides with wide West entry opening
  const perimeterWall = (lx: number, lz: number, w: number, d: number, h: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), trimMat);
    m.position.set(lx, 0.35 + h * 0.5, lz);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    colliders.push({
      x: x + lx,
      z: z + lz,
      halfW: w * 0.5 + 0.08,
      halfD: d * 0.5 + 0.08,
      height: h + 0.4,
      baseY,
    });
  };
  perimeterWall(-6.5, -7.2, 0.45, 7.2, 1.15);
  perimeterWall(-6.5, 7.2, 0.45, 7.2, 1.15);
  perimeterWall(0, -10.75, 13.4, 0.45, 1.15);
  perimeterWall(0, 10.75, 13.4, 0.45, 1.15);
  perimeterWall(6.5, 0, 0.45, 21.5, 1.25);

  // Two Flanking Quarter Buildings with Exact Wall + Open Doorway Jamb Colliders (walkable inside!)
  [-7.2, 7.2].forEach((qz) => {
    // East rear wall + Collider
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(0.45, 3.8, 6.2), wallMat);
    backWall.position.set(6.0, 2.25, qz);
    backWall.castShadow = true;
    group.add(backWall);
    colliders.push({
      x: x + 6.0,
      z: z + qz,
      halfW: 0.28,
      halfD: 3.15,
      height: 4.1,
      baseY,
    });

    // North & South side walls with central open window cutout + solid colliders
    [-2.88, 2.88].forEach((dz) => {
      const sill = new THREE.Mesh(new THREE.BoxGeometry(8.5, 1.0, 0.44), wallMat);
      sill.position.set(2.0, 0.85, qz + dz);
      group.add(sill);
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.9, 0.44), wallMat);
      lintel.position.set(2.0, 3.7, qz + dz);
      group.add(lintel);
      [-3.1, 0, 3.1].forEach((wx) => {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.9, 0.44), wallMat);
        pier.position.set(2.0 + wx, 2.3, qz + dz);
        pier.castShadow = true;
        group.add(pier);
      });
      colliders.push({
        x: x + 2.0,
        z: z + qz + dz,
        halfW: 4.3,
        halfD: 0.28,
        height: 4.1,
        baseY,
      });
    });

    // West front facade with open walk-in doorway + flanking window jamb colliders
    [-2.05, 2.05].forEach((fz) => {
      const fSill = new THREE.Mesh(new THREE.BoxGeometry(0.44, 1.05, 2.1), wallMat);
      fSill.position.set(-2.05, 0.87, qz + fz);
      group.add(fSill);
      const fLintel = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.9, 2.1), wallMat);
      fLintel.position.set(-2.05, 3.7, qz + fz);
      group.add(fLintel);
      const fPier = new THREE.Mesh(new THREE.BoxGeometry(0.44, 1.85, 0.65), wallMat);
      fPier.position.set(-2.05, 2.32, qz + Math.sign(fz) * 2.75);
      group.add(fPier);

      colliders.push({
        x: x - 2.05,
        z: z + qz + fz,
        halfW: 0.28,
        halfD: 1.05,
        height: 4.1,
        baseY,
      });
    });
    const doorHeader = new THREE.Mesh(new THREE.BoxGeometry(0.48, 1.15, 2.0), trimMat);
    doorHeader.position.set(-2.05, 3.58, qz);
    group.add(doorHeader);

    // Side timber doorway jamb posts leaving doorway clear for walking inside
    [-0.98, 0.98].forEach((jOff) => {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.65, 0.16), woodMat);
      jamb.position.set(-2.05, 1.68, qz + jOff);
      group.add(jamb);
    });

    // Interior Sleeping Cot inside each Quarter Wing + Collider
    const innerCot = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.34, 1.25), woodMat);
    innerCot.position.set(2.4, 0.52, qz + 0.9);
    innerCot.castShadow = true;
    group.add(innerCot);
    colliders.push({
      x: x + 2.4,
      z: z + qz + 0.9,
      halfW: 1.12,
      halfD: 0.66,
      height: 0.9,
      baseY,
    });

    const roofGroup = new THREE.Group();
    roofGroup.position.set(2.0, 4.35, qz);
    group.add(roofGroup);

    const roomCeiling = new THREE.Mesh(
      createContinuousCeilingGeometry(9.4, 7.0, undefined, 4.5),
      ceilingMat
    );
    roomCeiling.position.set(0, -0.285, 0);
    roofGroup.add(roomCeiling);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.55, 7.0), roofMat);
    roof.castShadow = true;
    roofGroup.add(roof);

    roofOccluders.push({
      obj: roofGroup,
      roofY: baseY + 4.06,
      minX: x - 2.7,
      maxX: x + 6.7,
      minZ: z + qz - 3.5,
      maxZ: z + qz + 3.5,
    });
  });

  // Veranda Posts, Woven Cots, Terracotta Matkas & Oil Lamps with solid colliders
  [-4.2, -1.4, 1.4, 4.2].forEach((pz) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 3.4, 8), woodMat);
    post.position.set(-4.6, 2.05, pz);
    post.castShadow = true;
    group.add(post);
    colliders.push({
      x: x - 4.6,
      z: z + pz,
      halfW: 0.28,
      halfD: 0.28,
      height: 3.6,
      baseY,
    });
  });

  [-3.2, 0.0, 3.2].forEach((vz) => {
    const cot = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.32, 1.15), woodMat);
    cot.position.set(-2.8, 0.5, vz);
    cot.castShadow = true;
    group.add(cot);
    colliders.push({
      x: x - 2.8,
      z: z + vz,
      halfW: 1.08,
      halfD: 0.62,
      height: 0.9,
      baseY,
    });

    const pot = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), clayMat);
    pot.position.set(-0.8, 0.62, vz + 0.55);
    group.add(pot);

    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), lampMat);
    lamp.position.set(-4.2, 0.52, vz);
    group.add(lamp);
  });

  return { group, colliders, roofOccluders };
}

/**
 * Reusable Articulated Sacred Royal Elephant Rig with four hip-pivoted legs, swinging trunk, flapping ears,
 * and royal velvet howdah seat cushion so elephants can be mounted and ridden across Ayodhya's paved roads.
 */
export function createRoyalElephantUnit(
  textures: ProceduralTextures,
  jhoolColorHex = 0xb82928
): ElephantRig {
  const ele = new THREE.Group();
  const eleSkinMat = new THREE.MeshPhysicalMaterial({
    normalMap: textures.barkNormal,
    normalScale: new THREE.Vector2(0.28, 0.28),
    color: 0x5c5b63,
    roughness: 0.82,
    ior: 1.46,
  });
  const tuskMat = new THREE.MeshPhysicalMaterial({ color: 0xf6eed8, roughness: 0.28, ior: 1.54, clearcoat: 0.35 });
  const jhoolMat = new THREE.MeshPhysicalMaterial({
    map: textures.velvetCurtain,
    normalMap: textures.velvetCurtainNormal,
    roughnessMap: textures.silkRoughness,
    color: jhoolColorHex,
    roughness: 0.72,
    sheen: 0.68,
    ior: 1.48,
  });
  const goldMat = new THREE.MeshPhysicalMaterial({
    map: textures.armorMetal,
    normalMap: textures.armorNormal,
    roughnessMap: textures.armorRoughness,
    metalnessMap: textures.armorMetalness,
    color: 0xf2c14b,
    roughness: 0.30,
    metalness: 0.92,
    ior: 1.62,
    anisotropy: 0.45,
  });

  // Barrel Body & Royal Embroidered Jhool Caparison + Crimson Seat Pad
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.18, 1.75, 10, 16), eleSkinMat);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 2.25, 0);
  body.castShadow = true;
  ele.add(body);

  const jhool = new THREE.Mesh(
    new THREE.CylinderGeometry(1.24, 1.24, 1.65, 16, 1, true, -Math.PI * 0.72, Math.PI * 1.44),
    jhoolMat
  );
  jhool.rotation.z = Math.PI / 2;
  jhool.rotation.y = Math.PI / 2;
  jhool.position.set(0, 2.38, 0);
  ele.add(jhool);

  const seatCushion = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.22, 1.28), jhoolMat);
  seatCushion.position.set(0, 3.48, -0.05);
  ele.add(seatCushion);

  const seatRail = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.045, 6, 16), goldMat);
  seatRail.rotation.x = Math.PI / 2;
  seatRail.position.set(0, 3.6, -0.05);
  ele.add(seatRail);

  // Four Hip-Pivoted Sturdy Pillar Legs + Golden Ankle Bells
  const legs: THREE.Group[] = [];
  [
    [-0.65, 0.85],
    [0.65, 0.85],
    [-0.65, -0.85],
    [0.65, -0.85],
  ].forEach(([lx, lz]) => {
    const legPivot = new THREE.Group();
    legPivot.position.set(lx, 1.72, lz);

    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.28, 1.72, 12), eleSkinMat);
    leg.position.set(0, -0.86, 0);
    leg.castShadow = true;
    legPivot.add(leg);

    const bell = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 6, 14), goldMat);
    bell.rotation.x = Math.PI / 2;
    bell.position.set(0, -1.5, 0);
    legPivot.add(bell);

    ele.add(legPivot);
    legs.push(legPivot);
  });

  // Head Dome, Crown Ornament, Golden Kumbha-Patta Crest & Broad Ears
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.92, 16, 14), eleSkinMat);
  head.position.set(0, 2.65, 1.65);
  head.castShadow = true;
  ele.add(head);

  const headCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.56, 0.32, 12), goldMat);
  headCrown.position.set(0, 3.45, 1.65);
  ele.add(headCrown);

  const foreheadPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.16, 0.55, 8), goldMat);
  foreheadPlate.userData._lodDetail = true;
  foreheadPlate.position.set(0, 2.86, 2.48);
  foreheadPlate.rotation.x = -0.32;
  ele.add(foreheadPlate);

  const eleEyeMat = new THREE.MeshPhysicalMaterial({ color: 0x261a10, roughness: 0.1, clearcoat: 1.0 });

  const earPivots: THREE.Group[] = [];
  [-1, 1].forEach((side) => {
    const eleEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eleEyeMat);
    eleEye.position.set(side * 0.52, 2.72, 2.34);
    ele.add(eleEye);

    const earPivot = new THREE.Group();
    earPivot.position.set(side * 0.82, 2.75, 1.4);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.68, 12, 10), eleSkinMat);
    ear.scale.set(0.18, 1.15, 0.92);
    ear.position.set(side * 0.22, -0.1, -0.15);
    earPivot.add(ear);
    ele.add(earPivot);
    earPivots.push(earPivot);

    const tuskCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.36, 2.18, 2.25),
      new THREE.Vector3(side * 0.44, 1.92, 2.85),
      new THREE.Vector3(side * 0.42, 2.15, 3.35),
    ]);
    const tusk = new THREE.Mesh(new THREE.TubeGeometry(tuskCurve, 14, 0.085, 8, false), tuskMat);
    ele.add(tusk);

    const tuskBand = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.02, 6, 12), goldMat);
    tuskBand.userData._lodDetail = true;
    tuskBand.position.set(side * 0.44, 1.94, 2.84);
    ele.add(tuskBand);
  });

  // Articulated S-Curved Trunk
  const trunkPivot = new THREE.Group();
  trunkPivot.position.set(0, 2.35, 2.42);
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, -0.58, 0.34),
    new THREE.Vector3(0, -1.18, 0.2),
    new THREE.Vector3(0, -1.36, 0.48),
  ]);
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(trunkCurve, 18, 0.16, 10, false), eleSkinMat);
  trunk.castShadow = true;
  trunkPivot.add(trunk);
  ele.add(trunkPivot);

  return { group: ele, legs, trunkPivot, earPivots, seatHeight: 2.79 };
}

/**
 * Hathi-Shala: Grand Elephant Stable Pavilion housing 3 Mountable & Articulated Sacred Royal Elephants.
 * Enclosed on Back/East/West structural walls with open arched ventilation windows, continuous carpet floor plane,
 * full wall/pillar/divider/trough colliders, and roofOccluder with downward ceiling.
 */
export function createElephantStableModel(
  textures: ProceduralTextures,
  x: number,
  z: number
): {
  group: THREE.Group;
  colliders: BoxCollider[];
  elephantEntities: Array<{ rig: ElephantRig; x: number; y: number; z: number; yaw: number }>;
  roofOccluders: RoofOccluder[];
} {
  const group = new THREE.Group();
  const baseY = Math.max(RIVER_SURFACE_Y + 0.35, groundHeightAt(x, z));
  group.position.set(x, baseY, z);
  const colliders: BoxCollider[] = [];
  const elephantEntities: Array<{ rig: ElephantRig; x: number; y: number; z: number; yaw: number }> = [];
  const roofOccluders: RoofOccluder[] = [];

  const stoneMat = new THREE.MeshPhysicalMaterial({
    map: textures.sandstone,
    normalMap: textures.sandstoneNormal,
    roughnessMap: textures.sandstoneRoughness,
    color: 0xdab482,
    roughness: 0.86,
    ior: 1.54,
  });
  const woodMat = new THREE.MeshPhysicalMaterial({
    map: textures.bark,
    normalMap: textures.barkNormal,
    color: 0x623b1e,
    roughness: 0.78,
    ior: 1.5,
  });
  const redCarpetMat = new THREE.MeshPhysicalMaterial({
    map: textures.redCarpet,
    normalMap: textures.redCarpetNormal,
    normalScale: new THREE.Vector2(0.88, 0.88),
    roughnessMap: textures.redCarpetRoughness,
    roughness: 0.82,
    metalness: 0.05,
    ior: 1.48,
    sheen: 0.72,
    sheenColor: new THREE.Color(0xff9b7a),
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const ceilingMat = new THREE.MeshPhysicalMaterial({
    map: textures.sandstone,
    normalMap: textures.sandstoneNormal,
    roughnessMap: textures.sandstoneRoughness,
    color: 0xd9a76a,
    roughness: 0.8,
    metalness: 0.1,
    ior: 1.54,
    side: THREE.FrontSide,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    map: textures.silkGold,
    color: 0x8d3a22,
    roughness: 0.65,
  });
  const hayMat = new THREE.MeshStandardMaterial({ color: 0xc9a349, roughness: 0.92 });

  // Recessed Plinth + Elevated Continuous UV-Mapped Red Carpet Plane (zero z-fighting)
  const subFloor = new THREE.Mesh(new THREE.BoxGeometry(21.6, 0.28, 13.6), stoneMat);
  subFloor.position.y = 0.14;
  subFloor.receiveShadow = true;
  group.add(subFloor);

  const stableCarpet = new THREE.Mesh(
    createContinuousCarpetFloorGeometry(22.0, 14.0, undefined, 4.8),
    redCarpetMat
  );
  stableCarpet.position.set(0, 0.35, 0);
  stableCarpet.receiveShadow = true;
  group.add(stableCarpet);

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(21.6, 5.2, 0.65), stoneMat);
  backWall.position.set(0, 2.75, -6.5);
  backWall.castShadow = true;
  group.add(backWall);

  colliders.push({
    x,
    z: z - 6.5,
    halfW: 10.85,
    halfD: 0.45,
    height: 5.5,
    baseY,
  });

  // Solid East & West Structural Walls with Open Arched Ventilation Windows
  [-10.55, 10.55].forEach((wx) => {
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.15, 12.6), stoneMat);
    sill.position.set(wx, 0.88, -0.3);
    sill.castShadow = true;
    group.add(sill);

    const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.05, 12.6), stoneMat);
    lintel.position.set(wx, 4.82, -0.3);
    group.add(lintel);

    [-5.2, -0.3, 4.6].forEach((wz) => {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.9, 2.1), stoneMat);
      pier.position.set(wx, 2.85, wz);
      pier.castShadow = true;
      group.add(pier);
    });

    colliders.push({
      x: x + wx,
      z: z - 0.3,
      halfW: 0.42,
      halfD: 6.3,
      height: 5.5,
      baseY,
    });
  });

  const roofGroup = new THREE.Group();
  roofGroup.position.set(0, 5.65, 0);
  group.add(roofGroup);

  const stableCeiling = new THREE.Mesh(
    createContinuousCeilingGeometry(22.8, 14.8, undefined, 5.0),
    ceilingMat
  );
  stableCeiling.position.set(0, -0.335, 0);
  roofGroup.add(stableCeiling);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(22.8, 0.65, 14.8), roofMat);
  roof.castShadow = true;
  roofGroup.add(roof);

  roofOccluders.push({
    obj: roofGroup,
    roofY: baseY + 5.31,
    minX: x - 11.4,
    maxX: x + 11.4,
    minZ: z - 7.4,
    maxZ: z + 7.4,
  });

  // Pillars & Timber Stall Dividers with Solid Mesh Colliders
  [-10.4, -3.5, 3.5, 10.4].forEach((px) => {
    [-6.2, 6.2].forEach((pz) => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 5.3, 10), woodMat);
      col.position.set(px, 2.8, pz);
      col.castShadow = true;
      group.add(col);
      colliders.push({
        x: x + px,
        z: z + pz,
        halfW: 0.42,
        halfD: 0.42,
        height: 5.4,
        baseY,
      });
    });
    if (Math.abs(px) < 9) {
      const div = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.7, 9.2), woodMat);
      div.position.set(px, 1.0, -1.2);
      group.add(div);
      colliders.push({
        x: x + px,
        z: z - 1.2,
        halfW: 0.25,
        halfD: 4.65,
        height: 2.0,
        baseY,
      });
    }
  });

  // 3 Mountable Royal Elephants placed dynamically in world space + feeding troughs beside stalls
  const jhoolColors = [0xb82928, 0xa85f14, 0x265c4b];
  [-7.0, 0, 7.0].forEach((ex, bayIdx) => {
    const eleRig = createRoyalElephantUnit(textures, jhoolColors[bayIdx % jhoolColors.length]);
    elephantEntities.push({
      rig: eleRig,
      x: x + ex,
      y: baseY + 0.35,
      z: z - 0.8,
      yaw: 0,
    });

    const trough = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.55, 0.85), stoneMat);
    trough.position.set(ex - 2.1, 0.55, -4.4);
    group.add(trough);

    const hay = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), hayMat);
    hay.scale.set(1.25, 0.65, 1.0);
    hay.position.set(ex - 2.1, 0.85, -4.4);
    group.add(hay);

    colliders.push({
      x: x + ex - 2.1,
      z: z - 4.4,
      halfW: 0.95,
      halfD: 0.55,
      height: 1.25,
      baseY,
    });
  });

  return { group, colliders, elephantEntities, roofOccluders };
}

/**
 * Ashva-Shala: Royal Horse Stable housing 4 Mountable High-Fidelity Royal Steeds mirroring the Chariot horses.
 * Enclosed on Back/East/West structural walls with open arched windows, full-footprint continuous carpet floor,
 * full wall/post/divider/trough colliders, and roofOccluder with downward ceiling.
 */
export function createHorseStableModel(
  textures: ProceduralTextures,
  x: number,
  z: number
): {
  group: THREE.Group;
  colliders: BoxCollider[];
  horseEntities: Array<{ rig: RoyalHorseRig; x: number; y: number; z: number; yaw: number }>;
  roofOccluders: RoofOccluder[];
} {
  const group = new THREE.Group();
  const baseY = Math.max(RIVER_SURFACE_Y + 0.35, groundHeightAt(x, z));
  group.position.set(x, baseY, z);
  const colliders: BoxCollider[] = [];
  const horseEntities: Array<{ rig: RoyalHorseRig; x: number; y: number; z: number; yaw: number }> = [];
  const roofOccluders: RoofOccluder[] = [];

  const wallMat = new THREE.MeshPhysicalMaterial({
    map: textures.sandstone,
    normalMap: textures.sandstoneNormal,
    roughnessMap: textures.sandstoneRoughness,
    color: 0xd6b07e,
    roughness: 0.86,
    ior: 1.54,
  });
  const woodMat = new THREE.MeshPhysicalMaterial({
    map: textures.bark,
    normalMap: textures.barkNormal,
    color: 0x673e20,
    roughness: 0.78,
    ior: 1.5,
  });
  const redCarpetMat = new THREE.MeshPhysicalMaterial({
    map: textures.redCarpet,
    normalMap: textures.redCarpetNormal,
    normalScale: new THREE.Vector2(0.88, 0.88),
    roughnessMap: textures.redCarpetRoughness,
    roughness: 0.82,
    metalness: 0.05,
    ior: 1.48,
    sheen: 0.72,
    sheenColor: new THREE.Color(0xff9b7a),
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const ceilingMat = new THREE.MeshPhysicalMaterial({
    map: textures.sandstone,
    normalMap: textures.sandstoneNormal,
    roughnessMap: textures.sandstoneRoughness,
    color: 0xd9a76a,
    roughness: 0.8,
    metalness: 0.1,
    ior: 1.54,
    side: THREE.FrontSide,
  });
  const roofMat = new THREE.MeshPhysicalMaterial({
    map: textures.silkGold,
    roughnessMap: textures.silkRoughness,
    color: 0xa14429,
    roughness: 0.75,
    ior: 1.48,
  });
  const hayMat = new THREE.MeshStandardMaterial({ color: 0xd1ab4e, roughness: 0.9 });
  const goldMat = new THREE.MeshPhysicalMaterial({
    map: textures.armorMetal,
    normalMap: textures.armorNormal,
    roughnessMap: textures.armorRoughness,
    color: 0xf4c552,
    roughness: 0.32,
    metalness: 0.92,
    ior: 1.62,
    specularIntensity: 1.0,
    anisotropy: 0.5,
  });
  const caparisonMat = new THREE.MeshPhysicalMaterial({
    map: textures.velvetCurtain,
    normalMap: textures.velvetCurtainNormal,
    roughnessMap: textures.silkRoughness,
    roughness: 0.72,
    sheen: 0.68,
    ior: 1.48,
  });
  const gemMat = new THREE.MeshPhysicalMaterial({
    color: 0xd1263c,
    roughness: 0.1,
    ior: 1.77,
    specularIntensity: 1.0,
    clearcoat: 1.0,
  });

  // Recessed Sub-Plinth + Elevated Continuous UV-Mapped Red Carpet Plane (zero z-fighting)
  const subFloor = new THREE.Mesh(new THREE.BoxGeometry(23.6, 0.26, 11.6), wallMat);
  subFloor.position.y = 0.13;
  subFloor.receiveShadow = true;
  group.add(subFloor);

  const stableCarpet = new THREE.Mesh(
    createContinuousCarpetFloorGeometry(24.0, 12.0, undefined, 4.8),
    redCarpetMat
  );
  stableCarpet.position.set(0, 0.34, 0);
  stableCarpet.receiveShadow = true;
  group.add(stableCarpet);

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(23.5, 4.1, 0.55), wallMat);
  backWall.position.set(0, 2.2, -5.6);
  group.add(backWall);

  colliders.push({
    x,
    z: z - 5.6,
    halfW: 11.85,
    halfD: 0.45,
    height: 4.4,
    baseY,
  });

  // Solid East & West Side Walls with Open Arched Windows
  [-11.6, 11.6].forEach((wx) => {
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 10.8), wallMat);
    sill.position.set(wx, 0.78, -0.2);
    group.add(sill);

    const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 10.8), wallMat);
    lintel.position.set(wx, 3.82, -0.2);
    group.add(lintel);

    [-4.6, -0.2, 4.2].forEach((wz) => {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.25, 1.7), wallMat);
      pier.position.set(wx, 2.35, wz);
      pier.castShadow = true;
      group.add(pier);
    });

    colliders.push({
      x: x + wx,
      z: z - 0.2,
      halfW: 0.4,
      halfD: 5.45,
      height: 4.4,
      baseY,
    });
  });

  const roofGroup = new THREE.Group();
  roofGroup.position.set(0, 4.4, 0);
  group.add(roofGroup);

  const horseCeiling = new THREE.Mesh(
    createContinuousCeilingGeometry(24.8, 12.8, undefined, 5.0),
    ceilingMat
  );
  horseCeiling.position.set(0, -0.26, 0);
  roofGroup.add(horseCeiling);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(24.8, 0.5, 12.8), roofMat);
  roof.castShadow = true;
  roofGroup.add(roof);

  roofOccluders.push({
    obj: roofGroup,
    roofY: baseY + 4.14,
    minX: x - 12.4,
    maxX: x + 12.4,
    minZ: z - 6.4,
    maxZ: z + 6.4,
  });

  const coatPalette = [
    { coat: 0xf8f5ed, mane: 0xf2eee3 }, // Royal White Ashva
    { coat: 0xd9b37c, mane: 0xf2e4c9 }, // Palomino Gold
    { coat: 0x7c4a2a, mane: 0x2a1b12 }, // Dark Bay Warhorse
    { coat: 0xf5f1e6, mane: 0xebe6d9 }, // Snow-White Ashva
  ];

  [-8.6, -2.9, 2.9, 8.6].forEach((hx, idx) => {
    const pal = coatPalette[idx % coatPalette.length];
    const coatMat = new THREE.MeshPhysicalMaterial({
      color: pal.coat,
      roughness: 0.36,
      metalness: 0.04,
      clearcoat: 0.22,
      clearcoatRoughness: 0.45,
      sheen: 0.42,
      sheenRoughness: 0.48,
      sheenColor: new THREE.Color(0xffffff),
    });
    const maneMat = new THREE.MeshPhysicalMaterial({
      color: pal.mane,
      roughness: 0.46,
      sheen: 0.85,
      sheenRoughness: 0.35,
      sheenColor: new THREE.Color(0xfff5e0),
    });

    const steed = createRoyalHorseUnit(coatMat, maneMat, caparisonMat, goldMat, gemMat, false);
    horseEntities.push({
      rig: steed,
      x: x + hx,
      y: baseY + 0.34,
      z: z - 0.6,
      yaw: 0,
    });

    // Timber stall divider & rear feeding trough with colliders
    if (idx < 3) {
      const div = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.35, 6.4), woodMat);
      div.position.set(hx + 2.85, 0.92, -1.2);
      group.add(div);
      colliders.push({
        x: x + hx + 2.85,
        z: z - 1.2,
        halfW: 0.18,
        halfD: 3.25,
        height: 1.65,
        baseY,
      });
    }

    const trough = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.42, 0.72), woodMat);
    trough.position.set(hx - 1.45, 0.48, -4.1);
    group.add(trough);

    const hay = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 0.52), hayMat);
    hay.position.set(hx - 1.45, 0.74, -4.1);
    group.add(hay);

    colliders.push({
      x: x + hx - 1.45,
      z: z - 4.1,
      halfW: 0.78,
      halfD: 0.45,
      height: 1.1,
      baseY,
    });
  });

  [-11.5, -5.8, 0, 5.8, 11.5].forEach((px) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 4.2, 8), woodMat);
    post.position.set(px, 2.2, 5.4);
    group.add(post);
    colliders.push({
      x: x + px,
      z: z + 5.4,
      halfW: 0.34,
      halfD: 0.34,
      height: 4.3,
      baseY,
    });
  });

  return { group, colliders, horseEntities, roofOccluders };
}

/**
 * Astra-Shala Training Grounds furnished with Akhada sparring pit & racks of authentic 3D Gadas, Bhalas & Shields.
 * Enclosed by perimeter dwarf walls on all sides with wide open cardinal entryways & solid wall/post/rack colliders.
 */
export function createTrainingGroundsModel(
  textures: ProceduralTextures,
  x: number,
  z: number
): { group: THREE.Group; colliders: BoxCollider[] } {
  const group = new THREE.Group();
  const baseY = Math.max(RIVER_SURFACE_Y + 0.35, groundHeightAt(x, z));
  group.position.set(x, baseY, z);
  const colliders: BoxCollider[] = [];

  const stoneMat = new THREE.MeshStandardMaterial({
    map: textures.sandstone,
    normalMap: textures.sandstoneNormal,
    color: 0xd4ad7a,
    roughness: 0.82,
  });
  const sandMat = new THREE.MeshStandardMaterial({ color: 0xc48b58, roughness: 0.94 });
  const woodMat = new THREE.MeshStandardMaterial({
    map: textures.bark,
    normalMap: textures.barkNormal,
    color: 0x6b4120,
    roughness: 0.78,
  });
  const bronzeMat = new THREE.MeshStandardMaterial({
    map: textures.armorMetal,
    normalMap: textures.armorNormal,
    color: 0xe3b142,
    roughness: 0.25,
    metalness: 0.88,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    map: textures.armorMetal,
    color: 0xc2cbd4,
    roughness: 0.22,
    metalness: 0.9,
  });
  const shieldRimMat = new THREE.MeshStandardMaterial({
    color: 0x7c221d,
    roughness: 0.55,
    metalness: 0.35,
  });

  // Akhada Earth Sparring Arena & Solid Perimeter Dwarf Walls with Cardinal Arch Openings
  const arena = new THREE.Mesh(new THREE.BoxGeometry(15, 0.12, 15), sandMat);
  arena.position.y = 0.06;
  arena.receiveShadow = true;
  group.add(arena);

  const addPerimeterWall = (wx: number, wz: number, w: number, d: number) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 1.15, d), stoneMat);
    wall.position.set(wx, 0.575, wz);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
    colliders.push({
      x: x + wx,
      z: z + wz,
      halfW: w * 0.5 + 0.08,
      halfD: d * 0.5 + 0.08,
      height: 1.4,
      baseY,
    });
  };
  [-6.2, 6.2].forEach((seg) => {
    addPerimeterWall(seg, -10.4, 8.4, 0.52);
    addPerimeterWall(seg, 10.4, 8.4, 0.52);
    addPerimeterWall(-10.4, seg, 0.52, 8.4);
    addPerimeterWall(10.4, seg, 0.52, 8.4);
  });

  // Corner Training Posts & Combat Dummies (Malkhamb) with colliders
  [-6.2, 6.2].forEach((px) => {
    [-6.2, 6.2].forEach((pz) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.4, 10), woodMat);
      post.position.set(px, 1.2, pz);
      post.castShadow = true;
      group.add(post);
      colliders.push({
        x: x + px,
        z: z + pz,
        halfW: 0.32,
        halfD: 0.32,
        height: 2.5,
        baseY,
      });
    });
  });

  // Helper to build a detailed Weapon Rack holding Gadas, Bhalas & Shields
  const addWeaponRack = (rx: number, rz: number, rotY: number) => {
    const rack = new THREE.Group();
    rack.position.set(rx, 0, rz);
    rack.rotation.y = rotY;
    group.add(rack);

    const basePlinth = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.22, 1.15), stoneMat);
    basePlinth.position.y = 0.11;
    rack.add(basePlinth);

    [-2.2, 2.2].forEach((ux) => {
      const upright = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.35, 8), woodMat);
      upright.position.set(ux, 1.28, 0);
      rack.add(upright);
    });
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.14, 0.18), woodMat);
    crossbar.position.set(0, 1.85, 0);
    rack.add(crossbar);

    // 2 Detailed Golden/Bronze Gadas (Maces)
    [-1.7, -1.0].forEach((gx) => {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 1.55, 10), bronzeMat);
      shaft.position.set(gx, 1.18, 0.16);
      rack.add(shaft);

      const maceHead = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), bronzeMat);
      maceHead.scale.set(1.0, 1.22, 1.0);
      maceHead.position.set(gx, 0.48, 0.16);
      rack.add(maceHead);

      const crownKnob = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 8), bronzeMat);
      crownKnob.position.set(gx, 2.02, 0.16);
      rack.add(crownKnob);
    });

    // 3 Detailed Long Bhalas (Spears) with Leaf Steel Blades
    [-0.2, 0.25, 0.7].forEach((bx) => {
      const spearShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 2.45, 8), woodMat);
      spearShaft.position.set(bx, 1.45, 0.18);
      rack.add(spearShaft);

      const spearBlade = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.36, 4), steelMat);
      spearBlade.scale.set(1.2, 1.0, 0.35);
      spearBlade.position.set(bx, 2.82, 0.18);
      rack.add(spearBlade);
    });

    // 2 Domed Circular Dhalas (Shields) with Brass Umbo Boss
    [1.35, 1.95].forEach((sx, si) => {
      const shield = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), shieldRimMat);
      shield.rotation.x = Math.PI * 0.46;
      shield.position.set(sx, 1.28 + si * 0.1, 0.28);
      rack.add(shield);

      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), bronzeMat);
      boss.position.set(sx, 1.28 + si * 0.1, 0.44);
      rack.add(boss);

      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.025, 8, 18), bronzeMat);
      rim.position.set(sx, 1.28 + si * 0.1, 0.22);
      rack.add(rim);
    });

    const isRotated = Math.abs(Math.sin(rotY)) > 0.7;
    colliders.push({
      x: x + rx,
      z: z + rz,
      halfW: isRotated ? 0.65 : 2.65,
      halfD: isRotated ? 2.65 : 0.65,
      height: 2.8,
      baseY,
    });
  };

  addWeaponRack(0, -9.2, 0);
  addWeaponRack(-9.2, 0, Math.PI / 2);
  addWeaponRack(9.2, 0, -Math.PI / 2);

  return { group, colliders };
}

/**
 * Monumental Vapi / Surya-Kund Stepwell descending smoothly into carved courtyard pit (-6.0m)
 * with geometric terraced flights, 4 corner chhatris, and shimmering sacred bathing water.
 */
export function createMonumentalStepwellModel(
  textures: ProceduralTextures,
  x: number,
  z: number
): { group: THREE.Group; colliders: BoxCollider[] } {
  const group = new THREE.Group();
  // Anchored cleanly at y = 0 courtyard plane
  group.position.set(x, 0, z);
  const colliders: BoxCollider[] = [];

  const stoneMat = new THREE.MeshPhysicalMaterial({
    map: textures.sandstone,
    normalMap: textures.sandstoneNormal,
    roughnessMap: textures.sandstoneRoughness,
    aoMap: textures.sandstoneAO,
    aoMapIntensity: 0.72,
    color: 0xdfb985,
    roughness: 0.84,
    ior: 1.54,
    specularIntensity: 0.44,
  });
  const trimMat = new THREE.MeshPhysicalMaterial({
    map: textures.sandstone,
    normalMap: textures.sandstoneNormal,
    roughnessMap: textures.sandstoneRoughness,
    aoMap: textures.sandstoneAO,
    aoMapIntensity: 0.72,
    color: 0xa26635,
    roughness: 0.74,
    ior: 1.54,
    specularIntensity: 0.48,
  });
  const goldMat = new THREE.MeshPhysicalMaterial({
    map: textures.armorMetal,
    normalMap: textures.armorNormal,
    roughnessMap: textures.armorRoughness,
    metalnessMap: textures.armorMetalness,
    color: 0xefc04b,
    roughness: 0.30,
    metalness: 0.92,
    ior: 1.62,
  });
  const waterMat = new THREE.MeshPhysicalMaterial({
    map: textures.water,
    normalMap: textures.waterNormal,
    normalScale: new THREE.Vector2(1.0, 1.0),
    color: 0x2fa8c2,
    roughness: 0.05,
    metalness: 0.08,
    ior: 1.333,
    reflectivity: 0.96,
    specularIntensity: 1.0,
    transparent: true,
    opacity: 0.74,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  waterMat.customProgramCacheKey = () => 'stepwell-water-v1';
  waterMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
      float fresSW = pow(1.0 - max(0.0, dot(normalize(vViewPosition), normalize(vNormal))), 3.2);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.56, 0.84, 0.96), fresSW * 0.48);
      gl_FragColor.a = clamp(gl_FragColor.a + fresSW * 0.16, 0.65, 0.94);
      #include <dithering_fragment>
      `
    );
  };
  const lotusPadMat = new THREE.MeshStandardMaterial({ color: 0x2f7d3a, roughness: 0.65 });
  const lotusPetalMat = new THREE.MeshStandardMaterial({ color: 0xf47da4, roughness: 0.48 });

  // 5 Concentric Descending Terraced Stone Galleries (y = -1.1m down to -5.5m, visible under clear water)
  const tierDepths = [1.1, 2.2, 3.3, 4.4, 5.5];
  tierDepths.forEach((depth, idx) => {
    const outerHalf = 9.0 - idx * 1.1;
    const bandWidth = 1.15;
    const ty = -depth;

    const ledges: Array<[number, number, number, number]> = [
      [0, -(outerHalf - bandWidth * 0.5), outerHalf * 2, bandWidth],
      [0, outerHalf - bandWidth * 0.5, outerHalf * 2, bandWidth],
      [-(outerHalf - bandWidth * 0.5), 0, bandWidth, outerHalf * 2 - bandWidth * 2],
      [outerHalf - bandWidth * 0.5, 0, bandWidth, outerHalf * 2 - bandWidth * 2],
    ];
    ledges.forEach(([lx, lz, w, d]) => {
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.38, d),
        idx % 2 === 0 ? stoneMat : trimMat
      );
      slab.position.set(lx, ty, lz);
      slab.receiveShadow = true;
      group.add(slab);
    });

    [-1, 1].forEach((sideSign) => {
      for (let s = 0; s < 4; s++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.26, 0.72), stoneMat);
        const dir = idx % 2 === 0 ? 1 : -1;
        step.position.set(dir * (-2.4 + s * 1.6), ty + 0.22 + s * 0.22, sideSign * (outerHalf - 0.55));
        group.add(step);
      }
    });
  });

  // Walkable Grand East Entry Staircase Flight leading straight down into Saturated Bathing Water
  for (let s = 0; s < 14; s++) {
    const frac = s / 13;
    const stepX = 8.9 - frac * 5.2;
    const stepY = -0.25 - frac * 4.55;
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.45, 5.2), stoneMat);
    step.position.set(stepX, stepY, 0);
    step.receiveShadow = true;
    group.add(step);
  }

  // Deep Stepwell Pool Floor + Full-Basin Saturated Sacred Water (brimming up to y = -0.52m)
  const poolFloor = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.3, 7.6), trimMat);
  poolFloor.position.set(0, -6.05, 0);
  group.add(poolFloor);

  const poolWater = new THREE.Mesh(new THREE.PlaneGeometry(17.6, 17.6), waterMat);
  poolWater.rotation.x = -Math.PI / 2;
  poolWater.position.set(0, -0.52, 0);
  group.add(poolWater);

  // Floating Sacred Lotus Pads & Pink Blossoms across the saturated Stepwell basin
  [
    [-4.2, -3.5], [2.4, -4.8], [-2.1, 4.4], [4.0, 3.8], [-5.2, 0.8], [0.6, -2.1], [-1.4, -5.6],
  ].forEach(([lx, lz], i) => {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.04, 14), lotusPadMat);
    pad.position.set(lx, -0.5, lz);
    group.add(pad);

    if (i % 2 === 0) {
      const bloom = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.24, 7), lotusPetalMat);
      bloom.rotation.x = Math.PI;
      bloom.position.set(lx, -0.38, lz);
      group.add(bloom);
    }
  });

  // Outer Perimeter Sandstone Parapet Balustrades (North, South, West closed; East entry open!)
  const walls: Array<{ lx: number; lz: number; w: number; d: number }> = [
    { lx: 0, lz: -9.6, w: 20.0, d: 0.75 },
    { lx: 0, lz: 9.6, w: 20.0, d: 0.75 },
    { lx: -9.6, lz: 0, w: 0.75, d: 19.2 },
    { lx: 9.6, lz: -6.5, w: 0.75, d: 6.2 },
    { lx: 9.6, lz: 6.5, w: 0.75, d: 6.2 },
  ];
  walls.forEach((wl) => {
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(wl.w, 1.05, wl.d), trimMat);
    parapet.position.set(wl.lx, 0.52, wl.lz);
    parapet.castShadow = true;
    group.add(parapet);

    colliders.push({
      x: x + wl.lx,
      z: z + wl.lz,
      halfW: wl.w * 0.5,
      halfD: wl.d * 0.5,
      height: 1.6,
      baseY: 0,
    });
  });

  // 4 Corner Carved Chhatri Pavilions framing the Stepwell Rim
  [
    [-9.2, -9.2],
    [9.2, -9.2],
    [-9.2, 9.2],
    [9.2, 9.2],
  ].forEach(([cx, cz]) => {
    [-0.95, 0.95].forEach((px) => {
      [-0.95, 0.95].forEach((pz) => {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 3.2, 8), stoneMat);
        col.position.set(cx + px, 1.6, cz + pz);
        group.add(col);
      });
    });
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.45, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
      trimMat
    );
    dome.position.set(cx, 3.2, cz);
    group.add(dome);
    const kalash = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.75, 8), goldMat);
    kalash.position.set(cx, 4.95, cz);
    group.add(kalash);
  });

  return { group, colliders };
}

/**
 * Dynamic Emerging Giant Turtle Model (for the 5 Sarayu River Giant Turtles + Stepwell Terrapins).
 */
export function createGiantTurtleModel(scale = 1.0): {
  root: THREE.Group;
  flippers: THREE.Group[];
  headGroup: THREE.Group;
} {
  const root = new THREE.Group();
  root.scale.setScalar(scale);
  const flippers: THREE.Group[] = [];

  const shellMat = new THREE.MeshStandardMaterial({ color: 0x3b4928, roughness: 0.62 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x736339, roughness: 0.68 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x4b5c34, roughness: 0.72 });
  const eyeMat = new THREE.MeshPhysicalMaterial({
    color: 0xf5d664,
    emissive: 0xd4a928,
    emissiveIntensity: 0.55,
    roughness: 0.08,
    ior: 1.44,
    clearcoat: 1.0,
  });

  const carapace = new THREE.Mesh(
    new THREE.SphereGeometry(0.95, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.54),
    shellMat
  );
  carapace.scale.set(0.92, 0.58, 1.24);
  carapace.position.y = -0.04;
  root.add(carapace);

  const shellRim = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.12, 8, 22), rimMat);
  shellRim.rotation.x = Math.PI / 2;
  shellRim.scale.set(0.94, 1.26, 0.6);
  shellRim.position.y = -0.02;
  root.add(shellRim);

  // Dorsal Scute Ridges
  [-0.36, 0, 0.36].forEach((sz, i) => {
    const ridge = new THREE.Mesh(new THREE.DodecahedronGeometry(0.26 - Math.abs(i - 1) * 0.04, 0), rimMat);
    ridge.scale.set(1.2, 0.45, 1.2);
    ridge.position.set(0, 0.42 - Math.abs(i - 1) * 0.08, sz);
    root.add(ridge);
  });

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.06, 1.18);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.52, 8), skinMat);
  neck.rotation.x = Math.PI * 0.42;
  headGroup.add(neck);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skinMat);
  skull.scale.set(0.92, 0.82, 1.25);
  skull.position.set(0, 0.08, 0.28);
  headGroup.add(skull);
  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), eyeMat);
    eye.position.set(side * 0.14, 0.13, 0.38);
    headGroup.add(eye);
  });
  root.add(headGroup);

  [
    [-0.78, 0.58, 1],
    [0.78, 0.58, -1],
    [-0.74, -0.58, 1],
    [0.74, -0.58, -1],
  ].forEach(([fx, fz, sideSign], i) => {
    const fp = new THREE.Group();
    fp.position.set(fx, -0.05, fz);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(i < 2 ? 0.78 : 0.56, 0.09, 0.34), skinMat);
    blade.position.x = -sideSign * 0.34;
    blade.rotation.y = sideSign * 0.25;
    fp.add(blade);
    root.add(fp);
    flippers.push(fp);
  });

  return { root, flippers, headGroup };
}

/**
 * Sarayu River Marsh Crocodile Model (Gharial/Mugger Silhouette with Tail Pivot).
 */
export function createCrocodileModel(): { root: THREE.Group; tailPivot: THREE.Group } {
  const root = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x364a2a, roughness: 0.78 });
  const scuteMat = new THREE.MeshStandardMaterial({ color: 0x24311b, roughness: 0.82 });
  const eyeMat = new THREE.MeshPhysicalMaterial({
    color: 0xeed45b,
    emissive: 0xc29e20,
    emissiveIntensity: 0.5,
    roughness: 0.08,
    ior: 1.44,
    clearcoat: 1.0,
  });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.45, 6, 10), bodyMat);
  torso.rotation.x = Math.PI / 2;
  torso.scale.set(1.18, 1.0, 0.65);
  root.add(torso);

  for (let i = 0; i < 6; i++) {
    const scute = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.14, 4), scuteMat);
    scute.position.set(0, 0.22, -0.55 + i * 0.24);
    root.add(scute);
  }

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.52), bodyMat);
  head.position.set(0, 0.04, 1.08);
  root.add(head);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.78), bodyMat);
  snout.position.set(0, 0.01, 1.62);
  root.add(snout);

  [-1, 1].forEach((s) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), eyeMat);
    eye.position.set(s * 0.15, 0.15, 1.18);
    root.add(eye);
  });

  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0, -0.85);
  const tailSeg = new THREE.Mesh(new THREE.ConeGeometry(0.24, 1.85, 6), scuteMat);
  tailSeg.rotation.x = -Math.PI / 2;
  tailSeg.scale.set(0.65, 1.0, 0.85);
  tailSeg.position.z = -0.9;
  tailPivot.add(tailSeg);
  root.add(tailPivot);

  return { root, tailPivot };
}

/**
 * Translucent Luminous Jellyfish Model for the Deep 20-ft Sarayu River.
 */
export function createJellyfishModel(tintHex: number): { root: THREE.Group; bell: THREE.Mesh } {
  const root = new THREE.Group();
  const bellMat = new THREE.MeshPhysicalMaterial({
    color: tintHex,
    emissive: tintHex,
    emissiveIntensity: 0.42,
    transparent: true,
    opacity: 0.68,
    roughness: 0.16,
    ior: 1.38,
    clearcoat: 0.9,
  });
  const tentacleMat = new THREE.MeshPhysicalMaterial({
    color: tintHex,
    emissive: tintHex,
    emissiveIntensity: 0.55,
    roughness: 0.22,
    ior: 1.38,
    transparent: true,
    opacity: 0.72,
  });

  const bell = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
    bellMat
  );
  root.add(bell);

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const tentacle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.008, 0.88, 5), tentacleMat);
    tentacle.position.set(Math.cos(a) * 0.18, -0.44, Math.sin(a) * 0.18);
    root.add(tentacle);
  }
  return { root, bell };
}

/**
 * Fresh/Coastal River Dolphin Model (Leaping & Swimming smoothly in 20-ft River).
 */
export function createDolphinModel(): { root: THREE.Group; tailPivot: THREE.Group } {
  const root = new THREE.Group();
  const skinMat = new THREE.MeshPhysicalMaterial({
    color: 0x5c89a6,
    roughness: 0.22,
    clearcoat: 0.85,
  });
  const bellyMat = new THREE.MeshStandardMaterial({ color: 0xcfe2ec, roughness: 0.35 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 1.15, 8, 14), skinMat);
  body.rotation.x = Math.PI / 2;
  root.add(body);

  const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.95, 6, 10), bellyMat);
  belly.rotation.x = Math.PI / 2;
  belly.position.y = -0.08;
  root.add(belly);

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.42, 8), skinMat);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, -0.03, 0.85);
  root.add(beak);

  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.36, 5), skinMat);
  dorsal.rotation.x = -0.45;
  dorsal.position.set(0, 0.3, -0.06);
  root.add(dorsal);

  [-1, 1].forEach((s) => {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.18), skinMat);
    fin.position.set(s * 0.28, -0.1, 0.18);
    fin.rotation.y = s * -0.4;
    fin.rotation.z = s * -0.25;
    root.add(fin);
  });

  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0, -0.68);
  const fluke = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.05, 0.24), skinMat);
  fluke.position.z = -0.18;
  tailPivot.add(fluke);
  root.add(tailPivot);

  return { root, tailPivot };
}

/**
 * Pelagic River Shark Model patrolling deep mid-water of the 20-ft Sarayu Channel.
 */
export function createSharkModel(): { root: THREE.Group; tailPivot: THREE.Group } {
  const root = new THREE.Group();
  const topMat = new THREE.MeshStandardMaterial({ color: 0x3b4c5c, roughness: 0.36, metalness: 0.12 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: 0xd8dfe6, roughness: 0.45 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.55, 8, 12), topMat);
  body.rotation.x = Math.PI / 2;
  root.add(body);

  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.31, 0.72, 10), topMat);
  snout.rotation.x = Math.PI / 2;
  snout.position.z = 1.08;
  root.add(snout);

  const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 1.25, 6, 10), bellyMat);
  belly.rotation.x = Math.PI / 2;
  belly.position.y = -0.11;
  root.add(belly);

  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.58, 5), topMat);
  dorsal.rotation.x = -0.35;
  dorsal.position.set(0, 0.48, 0.05);
  root.add(dorsal);

  [-1, 1].forEach((s) => {
    const pec = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.26), topMat);
    pec.position.set(s * 0.42, -0.14, 0.32);
    pec.rotation.y = s * -0.45;
    pec.rotation.z = s * -0.2;
    root.add(pec);
  });

  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0, -0.92);
  const caudalUpper = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.78, 5), topMat);
  caudalUpper.rotation.x = -0.75;
  caudalUpper.position.set(0, 0.24, -0.25);
  tailPivot.add(caudalUpper);
  const caudalLower = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.48, 5), topMat);
  caudalLower.rotation.x = Math.PI + 0.65;
  caudalLower.position.set(0, -0.16, -0.18);
  tailPivot.add(caudalLower);
  root.add(tailPivot);

  return { root, tailPivot };
}

/**
 * Simple streamlined fish geometry for high-density InstancedMesh schools & Stepwell koi.
 */
export function createFishSchoolGeometry(): THREE.BufferGeometry {
  const body = new THREE.ConeGeometry(0.08, 0.34, 6);
  body.rotateX(Math.PI / 2);
  body.scale(0.62, 1.0, 1.2);
  return body;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HERO DEITIES: LORD HANUMAN (Hyper-Muscular Vanara + Tail + Vajra Gada),
// LAKSHMAN (Serpent-Crest Royal Archer) & BHARAT (Dharma Sovereign Guardian)
// ═══════════════════════════════════════════════════════════════════════════════

function createHanumanTorsoGeometry(
  stacks = 20,
  slices = 22
): THREE.BufferGeometry {
  // Powerful V-tapered divine hero torso from pelvis crest (y=0.0) to upper neck (y=0.71)
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const smoothstep = (e0: number, e1: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const gauss = (d: number, sigma: number) => Math.exp(-(d * d) / (2 * sigma * sigma));

  const profileSamples: Array<[number, number, number, number]> = [
    [0.0, 0.0, 0.0, 0.0],
    [0.02, 0.145, 0.105, -0.004],
    [0.11, 0.14, 0.1, 0.0],
    [0.2, 0.132, 0.098, 0.004], // tight athletic waist
    [0.33, 0.168, 0.122, 0.008], // sweeping lats & ribcage
    [0.46, 0.212, 0.142, 0.012], // massive barrel chest
    [0.545, 0.228, 0.136, 0.006], // broad upper shoulders / traps
    [0.59, 0.148, 0.105, -0.002], // thick trapezius slope
    [0.625, 0.072, 0.072, -0.006], // muscular bull neck base
    [0.68, 0.066, 0.066, -0.004],
    [0.71, 0.0, 0.0, 0.0],
  ];

  const sampleProfile = (y: number) => {
    for (let k = 0; k < profileSamples.length - 1; k++) {
      const a = profileSamples[k];
      const b = profileSamples[k + 1];
      if (y >= a[0] && y <= b[0]) {
        const t = (y - a[0]) / Math.max(0.0001, b[0] - a[0]);
        const s = t * t * (3 - 2 * t);
        return {
          rx: a[1] + (b[1] - a[1]) * s,
          rz: a[2] + (b[2] - a[2]) * s,
          zOff: a[3] + (b[3] - a[3]) * s,
        };
      }
    }
    return { rx: 0, rz: 0, zOff: 0 };
  };

  for (let i = 0; i <= stacks; i++) {
    const v = i / stacks;
    const y = v * 0.71;
    const { rx, rz, zOff } = sampleProfile(y);

    for (let j = 0; j <= slices; j++) {
      const u = j / slices;
      const theta = (u - 0.5) * Math.PI * 2;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);
      const absT = Math.abs(theta);

      let px = rx * sinT;
      let pz = rz * cosT + zOff;
      const py = y;

      if (rx > 0.01) {
        // Massive Pectoral Plates & Deep Sternal Cleft
        const pecSide = gauss(absT - 0.45, 0.34) * smoothstep(0.04, 0.14, absT);
        const pecVert = gauss(y - 0.465, 0.065) * smoothstep(0.36, 0.42, y);
        pz += 0.028 * pecSide * pecVert;

        const sternalCleft = gauss(absT, 0.085) * gauss(y - 0.47, 0.075);
        pz -= 0.011 * sternalCleft;

        // Carved 6-pack Rectus Abdominis & Oblique V-taper
        const abMask =
          smoothstep(0.04, 0.14, absT) *
          smoothstep(0.54, 0.34, absT) *
          smoothstep(0.11, 0.16, y) *
          smoothstep(0.4, 0.34, y);
        const abWave = Math.max(0, Math.sin(((y - 0.13) / 0.25) * Math.PI * 3));
        const lineaAlba = gauss(absT, 0.07) * smoothstep(0.1, 0.38, y) * smoothstep(0.42, 0.35, y);
        pz += 0.012 * abMask * abWave - 0.008 * lineaAlba;

        // Heavy Latissimus Dorsi & Back Traps
        const backMask = smoothstep(1.55, 2.35, absT);
        if (backMask > 0.001) {
          const spineDist = Math.abs(Math.PI - absT);
          const spinalFurrow = gauss(spineDist, 0.12) * smoothstep(0.08, 0.22, y) * smoothstep(0.62, 0.52, y);
          const erectorRidge = gauss(spineDist - 0.32, 0.22) * smoothstep(0.16, 0.55, y);
          pz += 0.014 * spinalFurrow;
          pz -= 0.013 * erectorRidge * backMask;
        }
      }

      positions.push(px, py, pz);
      uvs.push(u, v);
    }
  }

  const rowLen = slices + 1;
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * rowLen + j;
      const b = a + 1;
      const c = (i + 1) * rowLen + j;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createVajraGadaMace(
  goldMat: THREE.Material,
  rubyMat: THREE.Material,
  emberMat: THREE.Material
): THREE.Group {
  const gada = new THREE.Group();

  // Heavy engraved golden shaft held from grip at y=0 extending down/forward
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.024, 0.018, 0.96, 7),
    goldMat
  );
  shaft.position.set(0, 0.18, 0);
  shaft.castShadow = true;
  gada.add(shaft);

  // Pommel spike
  const pommel = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 6), goldMat);
  pommel.rotation.x = Math.PI;
  pommel.position.set(0, -0.34, 0);
  gada.add(pommel);

  // Fluted lotus neck collar
  const neckCollar = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.012, 5, 10), rubyMat);
  neckCollar.rotation.x = Math.PI / 2;
  neckCollar.position.set(0, 0.62, 0);
  gada.add(neckCollar);

  // Massive fluted golden sphere head (sculpted Gada crown)
  const headSphere = new THREE.Mesh(new THREE.SphereGeometry(0.185, 8, 6), goldMat);
  headSphere.scale.set(1.0, 1.12, 1.0);
  headSphere.position.set(0, 0.82, 0);
  headSphere.castShadow = true;
  gada.add(headSphere);

  // Glowing core band & sunburst ribs around the Gada head
  const glowBand = new THREE.Mesh(new THREE.TorusGeometry(0.182, 0.018, 5, 12), emberMat);
  glowBand.rotation.x = Math.PI / 2;
  glowBand.position.set(0, 0.82, 0);
  gada.add(glowBand);

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.28, 5), goldMat);
    rib.position.set(Math.sin(a) * 0.17, 0.82, Math.cos(a) * 0.17);
    gada.add(rib);

    const stud = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), emberMat);
    stud.position.set(Math.sin(a) * 0.2, 0.82, Math.cos(a) * 0.2);
    gada.add(stud);
  }

  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.18, 7), goldMat);
  spire.position.set(0, 1.08, 0);
  spire.castShadow = true;
  gada.add(spire);

  return gada;
}

export function createHanumanModel(textures: ProceduralTextures): CharacterRig {
  const root = new THREE.Group();

  // Natural lifelike warm sun-bronzed human complexion with hemoglobin SSS & micro-pore detail
  const skinMat = createLifelikeHumanSkinMaterial(textures, {
    colorHex: 0xd69e74,
    sheenHex: 0xf4c7a3,
    sssRgb: [0.16, 0.056, 0.028],
    roughness: 0.41,
    normalScale: 0.14,
    cacheTag: 'hanuman',
  });
  const furTrimMat = new THREE.MeshPhysicalMaterial({
    color: 0x5c3c24,
    roughness: 0.72,
    sheen: 0.55,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(0x9a6d48),
  });
  const dhotiMat = new THREE.MeshPhysicalMaterial({
    map: textures.silkGold,
    normalMap: textures.silkNormal,
    roughnessMap: textures.silkRoughness,
    color: 0xe64a19,
    roughness: 0.62,
    metalness: 0.12,
    sheen: 0.75,
    sheenColor: new THREE.Color(0xffd268),
  });
  const dhotiGoldTrimMat = new THREE.MeshPhysicalMaterial({
    map: textures.silkGold,
    normalMap: textures.silkNormal,
    color: 0xf4be3d,
    roughness: 0.36,
    metalness: 0.62,
    sheen: 0.85,
    sheenColor: new THREE.Color(0xffe794),
  });
  const capeMat = new THREE.MeshPhysicalMaterial({
    map: textures.silkGold,
    normalMap: textures.silkNormal,
    color: 0xc92a18,
    roughness: 0.64,
    sheen: 0.8,
    sheenColor: new THREE.Color(0xffbd4a),
  });
  const goldMat = new THREE.MeshPhysicalMaterial({
    map: textures.armorMetal,
    normalMap: textures.armorNormal,
    roughnessMap: textures.armorRoughness,
    metalnessMap: textures.armorMetalness,
    color: 0xf2c249,
    roughness: 0.24,
    metalness: 0.94,
    clearcoat: 0.38,
  });
  const rubyMat = new THREE.MeshPhysicalMaterial({
    color: 0xe5243b,
    emissive: 0x6e0814,
    emissiveIntensity: 0.45,
    roughness: 0.1,
    clearcoat: 1.0,
  });
  const emeraldMat = new THREE.MeshPhysicalMaterial({
    color: 0x16a34a,
    emissive: 0x064e24,
    emissiveIntensity: 0.4,
    roughness: 0.12,
    clearcoat: 1.0,
  });
  const pearlMat = new THREE.MeshPhysicalMaterial({
    color: 0xfaf5eb,
    roughness: 0.18,
    metalness: 0.08,
    clearcoat: 0.85,
  });
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0xffaa2b,
    emissive: 0xff7700,
    emissiveIntensity: 2.2,
    roughness: 0.25,
  });
  const sindoorMat = new THREE.MeshStandardMaterial({
    color: 0xe63c14,
    emissive: 0x7a1a04,
    emissiveIntensity: 0.22,
    roughness: 0.52,
  });
  const hairMat = new THREE.MeshPhysicalMaterial({
    color: 0x1c1310,
    roughness: 0.45,
    metalness: 0.04,
    sheen: 0.34,
    sheenRoughness: 0.48,
    sheenColor: new THREE.Color(0x523626),
  });
  hairMat.userData.lifelikeSkin = true;
  const lipMat = new THREE.MeshPhysicalMaterial({
    color: 0x9c5949,
    roughness: 0.4,
    metalness: 0.0,
    ior: 1.4,
    sheen: 0.22,
    sheenColor: new THREE.Color(0xd28a77),
  });
  lipMat.userData.lifelikeSkin = true;
  const cavityDarkMat = new THREE.MeshStandardMaterial({
    color: 0x2e1713,
    roughness: 0.85,
  });
  const eyeWhiteMat = new THREE.MeshPhysicalMaterial({
    color: 0xf7f2ea,
    roughness: 0.12,
    ior: 1.38,
    clearcoat: 0.95,
  });
  eyeWhiteMat.userData.lifelikeSkin = true;
  const irisMat = new THREE.MeshPhysicalMaterial({
    color: 0x6b3a1c,
    roughness: 0.1,
    ior: 1.42,
    clearcoat: 1.0,
  });
  irisMat.userData.lifelikeSkin = true;
  const limbalMat = new THREE.MeshStandardMaterial({
    color: 0x21130b,
    roughness: 0.32,
  });
  limbalMat.userData.lifelikeSkin = true;
  const pupilMat = new THREE.MeshPhysicalMaterial({
    color: 0x080607,
    roughness: 0.05,
    ior: 1.52,
    clearcoat: 1.0,
  });
  pupilMat.userData.lifelikeSkin = true;
  const catchlightMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.85,
    roughness: 0.04,
    clearcoat: 1.0,
  });
  const leatherMat = new THREE.MeshStandardMaterial({
    map: textures.bark,
    color: 0x66361c,
    roughness: 0.78,
  });

  const contactShadow = createContactShadowMesh(textures.contactShadow, 0.92, 0.92);
  root.add(contactShadow);

  // Heavy Muscular Warrior Legs + Clip-Free Traditional Kachchha Dhoti Thigh Wraps
  const makeLeg = (xOffset: number, isLeft: boolean) => {
    const legPivot = new THREE.Group();
    legPivot.position.set(xOffset, 0.94, 0);
    const sideSign = isLeft ? -1 : 1;

    // Seamless dhoti hip ball nested inside pelvic wrap
    const hipBall = new THREE.Mesh(new THREE.SphereGeometry(0.104, 14, 12), dhotiMat);
    legPivot.add(hipBall);

    // Properly Fitted Kachchha Dhoti Upper-Thigh Wrap (strictly +0.015m clearance outside skin, cuffed at y = -0.31)
    const upperThighDhotiGeo = createRamAnatomicalLimbGeometry(
      0.31,
      [
        [0.0, 0.114, 0.12, 0, 0],
        [0.45, 0.112, 0.118, sideSign * 0.003, 0.004],
        [0.88, 0.102, 0.108, sideSign * 0.002, 0.003],
        [1.0, 0.097, 0.103, 0, 0.002],
      ],
      14,
      18
    );
    const upperThigh = new THREE.Mesh(upperThighDhotiGeo, dhotiMat);
    upperThigh.castShadow = true;
    upperThigh.receiveShadow = true;
    legPivot.add(upperThigh);

    // Woven Golden Jari Hem Cuff Framing the Thigh Dhoti Opening (zero mid-thigh pinch clipping)
    const thighCuff = new THREE.Mesh(
      new THREE.TorusGeometry(0.097, 0.011, 8, 18),
      dhotiGoldTrimMat
    );
    thighCuff.rotation.x = Math.PI / 2 + 0.08;
    thighCuff.rotation.y = sideSign * 0.06;
    thighCuff.scale.set(1.0, 1.06, 1.0);
    thighCuff.position.set(0, -0.305, 0.002);
    legPivot.add(thighCuff);

    // Exposed Muscular Lower Thigh emerging cleanly from inside Dhoti Cuff (-0.28 -> -0.445)
    const thighGeo = createRamAnatomicalLimbGeometry(
      0.185,
      [
        [0.0, 0.076, 0.082, 0, 0.002],
        [0.35, 0.082, 0.088, 0, 0.005],
        [0.72, 0.074, 0.08, -sideSign * 0.003, 0.004],
        [1.0, 0.06, 0.064, 0, 0],
      ],
      14,
      18
    );
    const thighMesh = new THREE.Mesh(thighGeo, skinMat);
    thighMesh.position.y = -0.265;
    thighMesh.castShadow = true;
    thighMesh.receiveShadow = true;
    legPivot.add(thighMesh);

    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -0.445, 0);
    legPivot.add(kneePivot);

    // Seamless Anatomical Patella Cap + Gold Knee Ornament Guard
    const kneeSkinCap = new THREE.Mesh(new THREE.SphereGeometry(0.059, 14, 12), skinMat);
    kneeSkinCap.scale.set(0.98, 1.02, 1.04);
    kneePivot.add(kneeSkinCap);

    const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), goldMat);
    kneeCap.scale.set(0.92, 0.78, 0.52);
    kneeCap.position.set(0, 0.004, 0.044);
    kneePivot.add(kneeCap);

    const shinGeo = createRamAnatomicalLimbGeometry(
      0.42,
      [
        [0.0, 0.058, 0.062, 0, 0],
        [0.32, 0.072, 0.082, 0, -0.012],
        [0.7, 0.048, 0.056, 0, -0.006],
        [1.0, 0.038, 0.042, 0, 0],
      ],
      16,
      20
    );
    const shin = new THREE.Mesh(shinGeo, skinMat);
    shin.position.y = 0.012;
    shin.castShadow = true;
    shin.receiveShadow = true;
    kneePivot.add(shin);

    const anklet = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.01, 6, 16), goldMat);
    anklet.rotation.x = Math.PI / 2;
    anklet.position.y = -0.38;
    kneePivot.add(anklet);

    const anklePivot = new THREE.Group();
    anklePivot.position.set(0, -0.405, 0);
    kneePivot.add(anklePivot);

    const ankleBall = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), skinMat);
    anklePivot.add(ankleBall);

    const foot = createRamDetailedFoot(isLeft, skinMat, leatherMat, goldMat);
    foot.scale.set(1.18, 1.1, 1.15);
    foot.position.set(0, -0.072, 0);
    anklePivot.add(foot);

    return { legPivot, kneePivot, anklePivot };
  };

  const leftLegRig = makeLeg(-0.118, true);
  const rightLegRig = makeLeg(0.118, false);
  const leftLeg = leftLegRig.legPivot;
  const rightLeg = rightLegRig.legPivot;
  const leftKnee = leftLegRig.kneePivot;
  const rightKnee = rightLegRig.kneePivot;
  const leftAnkle = leftLegRig.anklePivot;
  const rightAnkle = rightLegRig.anklePivot;
  root.add(leftLeg, rightLeg);

  // Massive V-Tapered Hero Torso
  const torso = new THREE.Group();
  torso.position.y = 0.94;
  root.add(torso);

  // Properly Draped Traditional Kachchha Dhoti Pelvis Wrap (completely encloses hips/pelvis with zero clipping)
  const waistWrap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.194, 0.28, 24),
    dhotiMat
  );
  waistWrap.position.y = -0.025;
  waistWrap.scale.set(1.18, 1.0, 0.88);
  waistWrap.castShadow = true;
  waistWrap.receiveShadow = true;
  torso.add(waistWrap);

  // Lower Dhoti Golden Jari Border Hem & Rear Kachchha Drape Folds
  const dhotiLowerRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.193, 0.011, 8, 26),
    dhotiGoldTrimMat
  );
  dhotiLowerRim.rotation.x = Math.PI / 2;
  dhotiLowerRim.scale.set(1.18, 0.88, 1.0);
  dhotiLowerRim.position.y = -0.158;
  torso.add(dhotiLowerRim);

  [-1, 1].forEach((side) => {
    const kachchhaSwag = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.04, 0.065, 0.152),
      new THREE.Vector3(side * 0.155, -0.015, 0.125),
      new THREE.Vector3(side * 0.218, -0.04, 0.0),
      new THREE.Vector3(side * 0.165, 0.015, -0.125),
      new THREE.Vector3(side * 0.035, 0.055, -0.155),
    ]);
    const swagMesh = new THREE.Mesh(
      new THREE.TubeGeometry(kachchhaSwag, 18, 0.018, 8, false),
      dhotiMat
    );
    swagMesh.castShadow = true;
    torso.add(swagMesh);

    const swagBorderCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.04, 0.05, 0.156),
      new THREE.Vector3(side * 0.158, -0.03, 0.128),
      new THREE.Vector3(side * 0.222, -0.055, 0.0),
      new THREE.Vector3(side * 0.168, 0.0, -0.128),
      new THREE.Vector3(side * 0.035, 0.042, -0.158),
    ]);
    const borderMesh = new THREE.Mesh(
      new THREE.TubeGeometry(swagBorderCurve, 18, 0.0065, 6, false),
      dhotiGoldTrimMat
    );
    torso.add(borderMesh);
  });

  // Multi-Fold Draped Front Dhoti Center Pleat Fan (strictly outside waistWrap at z = +0.162)
  const pleatFanShape = new THREE.Shape();
  pleatFanShape.moveTo(-0.062, 0.02);
  pleatFanShape.lineTo(0.062, 0.02);
  pleatFanShape.quadraticCurveTo(0.092, -0.22, 0.082, -0.45);
  pleatFanShape.lineTo(0.03, -0.475);
  pleatFanShape.lineTo(0, -0.455);
  pleatFanShape.lineTo(-0.03, -0.475);
  pleatFanShape.lineTo(-0.082, -0.45);
  pleatFanShape.quadraticCurveTo(-0.092, -0.22, -0.062, 0.02);
  const centerPleatGeo = new THREE.ExtrudeGeometry(pleatFanShape, {
    depth: 0.022,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 2,
  });
  const centerPleat = new THREE.Mesh(centerPleatGeo, dhotiMat);
  centerPleat.position.set(0, 0.048, 0.164);
  centerPleat.rotation.x = -0.095;
  centerPleat.castShadow = true;
  centerPleat.receiveShadow = true;
  centerPleat.userData.customPleatScale = true;

  // Vertical Woven Gold Jari Center Rib & Bottom Border on Front Dhoti Pleats
  const pleatGoldRib = new THREE.Mesh(
    new THREE.BoxGeometry(0.018, 0.45, 0.008),
    dhotiGoldTrimMat
  );
  pleatGoldRib.position.set(0, -0.215, 0.026);
  centerPleat.add(pleatGoldRib);

  const pleatHemTrim = new THREE.Mesh(
    new THREE.BoxGeometry(0.164, 0.022, 0.028),
    dhotiGoldTrimMat
  );
  pleatHemTrim.position.set(0, -0.448, 0.012);
  centerPleat.add(pleatHemTrim);

  torso.add(centerPleat);

  // Heavy Golden Kamarbandh Belt + Sun Medallion (snug around dhoti top)
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.162, 0.168, 0.102, 22), goldMat);
  belt.position.y = 0.106;
  belt.scale.set(1.18, 1.0, 0.88);
  torso.add(belt);

  [-0.048, 0.048].forEach((by) => {
    const beltRim = new THREE.Mesh(new THREE.TorusGeometry(0.166, 0.008, 7, 24), goldMat);
    beltRim.rotation.x = Math.PI / 2;
    beltRim.scale.set(1.18, 0.88, 1.0);
    beltRim.position.y = 0.106 + by;
    torso.add(beltRim);
  });

  const beltBuckle = new THREE.Mesh(new THREE.OctahedronGeometry(0.036, 0), goldMat);
  beltBuckle.scale.set(1.25, 1.0, 0.45);
  beltBuckle.position.set(0, 0.106, 0.148);
  torso.add(beltBuckle);

  const beltRuby = new THREE.Mesh(new THREE.OctahedronGeometry(0.02, 0), rubyMat);
  beltRuby.scale.set(1.0, 1.0, 0.55);
  beltRuby.position.set(0, 0.106, 0.162);
  torso.add(beltRuby);

  const torsoMesh = new THREE.Mesh(createHanumanTorsoGeometry(22, 24), skinMat);
  torsoMesh.position.y = 0.095;
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  torso.add(torsoMesh);

  // Golden Cross-Chest Kavacha Harness + Central Surya/Vajra Medallion (contoured outside chest/back)
  [-1, 1].forEach((s) => {
    const strapCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.185, 0.635, 0.01),
      new THREE.Vector3(s * 0.105, 0.562, 0.184),
      new THREE.Vector3(0, 0.485, 0.174),
      new THREE.Vector3(-s * 0.14, 0.33, 0.136),
      new THREE.Vector3(-s * 0.155, 0.27, -0.095),
      new THREE.Vector3(s * 0.025, 0.45, -0.154),
      new THREE.Vector3(s * 0.17, 0.618, -0.075),
    ]);
    const strap = new THREE.Mesh(new THREE.TubeGeometry(strapCurve, 18, 0.013, 6, false), goldMat);
    strap.castShadow = true;
    torso.add(strap);
  });

  const chestMedallion = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.022, 12), goldMat);
  chestMedallion.rotation.x = Math.PI / 2;
  chestMedallion.position.set(0, 0.485, 0.175);
  torso.add(chestMedallion);

  const chestCore = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), emberMat);
  chestCore.position.set(0, 0.485, 0.184);
  torso.add(chestCore);

  // Rudraksha & Golden Pearl Garland (draped cleanly over upper chest without sinking into pectorals)
  const malaCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.088, 0.67, 0.018),
    new THREE.Vector3(-0.082, 0.602, 0.156),
    new THREE.Vector3(0, 0.548, 0.184),
    new THREE.Vector3(0.082, 0.602, 0.156),
    new THREE.Vector3(0.088, 0.67, 0.018),
  ]);
  for (let b = 0; b < 17; b++) {
    const pt = malaCurve.getPoint(b / 16);
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(b === 8 ? 0.017 : 0.0105, 8, 8),
      b % 2 === 0 ? goldMat : leatherMat
    );
    bead.position.copy(pt);
    torso.add(bead);
  }

  // Rear Shoulder Fabric Clasp & Draped Back Mantle (shoulder fabric positioned strictly at the back)
  const rearShoulderYokeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.175, 0.618, -0.088),
    new THREE.Vector3(-0.1, 0.652, -0.142),
    new THREE.Vector3(0, 0.662, -0.156),
    new THREE.Vector3(0.1, 0.652, -0.142),
    new THREE.Vector3(0.175, 0.618, -0.088),
  ]);
  const rearShoulderYoke = new THREE.Mesh(
    new THREE.TubeGeometry(rearShoulderYokeCurve, 20, 0.022, 8, false),
    capeMat
  );
  rearShoulderYoke.castShadow = true;
  torso.add(rearShoulderYoke);

  [-1, 1].forEach((s) => {
    const claspDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.012, 10),
      goldMat
    );
    claspDisc.rotation.x = Math.PI / 2;
    claspDisc.rotation.z = s * 0.28;
    claspDisc.position.set(s * 0.148, 0.625, -0.132);
    torso.add(claspDisc);
  });

  const capePivot = new THREE.Group();
  capePivot.position.set(0, 0.642, -0.16);
  capePivot.userData.backMantle = true;
  const drapeShape = new THREE.Shape();
  drapeShape.moveTo(-0.142, 0.01);
  drapeShape.lineTo(0.142, 0.01);
  drapeShape.quadraticCurveTo(0.195, -0.26, 0.148, -0.53);
  drapeShape.quadraticCurveTo(0, -0.57, -0.148, -0.53);
  drapeShape.quadraticCurveTo(-0.195, -0.26, -0.142, 0.01);
  const drapeGeo = new THREE.ExtrudeGeometry(drapeShape, {
    depth: 0.014,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.005,
    bevelSegments: 2,
  });
  drapeGeo.translate(0, 0, -0.014);
  const cape = new THREE.Mesh(drapeGeo, capeMat);
  cape.rotation.x = 0.18;
  cape.castShadow = true;
  cape.receiveShadow = true;
  capePivot.add(cape);

  const capeGoldHem = new THREE.Mesh(
    new THREE.BoxGeometry(0.285, 0.018, 0.018),
    dhotiGoldTrimMat
  );
  capeGoldHem.position.set(0, -0.528, -0.007);
  cape.add(capeGoldHem);
  torso.add(capePivot);

  // Articulated 6-Segment Golden-Furred Vanara Tail (positioned cleanly behind his lower back -Z)
  const tailSegments: THREE.Group[] = [];
  let tailParent: THREE.Object3D = torso;
  const tailLengths = [0.22, 0.22, 0.22, 0.21, 0.2, 0.18];
  const tailRestPitches = [-1.15, -0.25, 0.42, 0.48, 0.4, 0.34];
  tailLengths.forEach((tLen, idx) => {
    const tp = new THREE.Group();
    if (idx === 0) {
      tp.position.set(0, 0.04, -0.162);
    } else {
      tp.position.set(0, tailLengths[idx - 1], 0);
    }
    tp.rotation.x = tailRestPitches[idx];
    const r0 = 0.026 * (1 - idx * 0.1);
    const r1 = 0.022 * (1 - idx * 0.1);
    const segGeo = new THREE.CylinderGeometry(r1, r0, tLen, 10);
    segGeo.translate(0, tLen * 0.5, 0);
    const segMesh = new THREE.Mesh(segGeo, furTrimMat);
    segMesh.castShadow = true;
    tp.add(segMesh);

    if (idx === tailLengths.length - 1) {
      const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), goldMat);
      tuft.scale.set(0.9, 1.4, 0.9);
      tuft.position.y = tLen + 0.02;
      tp.add(tuft);
    }
    tailParent.add(tp);
    tailSegments.push(tp);
    tailParent = tp;
  });

  // Subtle Divine Saffron Shoulder Halo Aura
  const heroAuraMesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.46, 0.012, 6, 16),
    emberMat
  );
  heroAuraMesh.position.set(0, 0.58, -0.185);
  torso.add(heroAuraMesh);

  // Lifelike Noble Cinematic Head + Sculpted Human Features + Sindoor Tilak + Ornate Traditional Golden Crown
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.805, 0.01);
  torso.add(headGroup);

  const cranium = new THREE.Mesh(createRamAnatomicalHeadGeometry(22, 24), skinMat);
  cranium.scale.set(1.1, 1.05, 1.07);
  cranium.castShadow = true;
  cranium.receiveShadow = true;
  headGroup.add(cranium);

  // Natural lifelike eyes seated cleanly inside orbital sockets + sculpted human eyelids & arched brows
  [-1, 1].forEach((side) => {
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(side * 0.0345, 0.014, 0.0855);
    eyeGroup.rotation.y = side * 0.15;

    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.0145, 14, 12), eyeWhiteMat);
    sclera.scale.set(1.12, 0.76, 0.72);
    eyeGroup.add(sclera);

    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0076, 12, 10), irisMat);
    iris.scale.set(1.0, 1.0, 0.48);
    iris.position.set(0, 0, 0.0088);
    eyeGroup.add(iris);

    const limbalRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.0073, 0.0007, 6, 16),
      limbalMat
    );
    limbalRing.position.set(0, 0, 0.0106);
    eyeGroup.add(limbalRing);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0041, 10, 8), pupilMat);
    pupil.scale.set(1.0, 1.0, 0.45);
    pupil.position.set(0, 0, 0.011);
    eyeGroup.add(pupil);

    const catchlight = new THREE.Mesh(
      new THREE.SphereGeometry(0.0014, 6, 6),
      catchlightMat
    );
    catchlight.position.set(0.0022, 0.0024, 0.0126);
    eyeGroup.add(catchlight);

    const upperLidCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-side * 0.015, -0.0015, 0.0045),
      new THREE.Vector3(-side * 0.006, 0.0072, 0.0104),
      new THREE.Vector3(side * 0.005, 0.0068, 0.01),
      new THREE.Vector3(side * 0.0155, -0.0005, 0.0038),
    ]);
    const upperLid = new THREE.Mesh(
      new THREE.TubeGeometry(upperLidCurve, 12, 0.0024, 6, false),
      skinMat
    );
    eyeGroup.add(upperLid);

    const lowerLidCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-side * 0.0145, -0.002, 0.0045),
      new THREE.Vector3(0, -0.0068, 0.0098),
      new THREE.Vector3(side * 0.015, -0.0015, 0.0038),
    ]);
    const lowerLid = new THREE.Mesh(
      new THREE.TubeGeometry(lowerLidCurve, 10, 0.0018, 6, false),
      skinMat
    );
    eyeGroup.add(lowerLid);

    headGroup.add(eyeGroup);

    // Expressive Arched Brow
    const browCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.014, 0.032, 0.095),
      new THREE.Vector3(side * 0.032, 0.037, 0.092),
      new THREE.Vector3(side * 0.05, 0.035, 0.083),
      new THREE.Vector3(side * 0.063, 0.028, 0.07),
    ]);
    const brow = new THREE.Mesh(new THREE.TubeGeometry(browCurve, 12, 0.0032, 6, false), hairMat);
    headGroup.add(brow);

    // Subtle Shaded Nostril Opening
    const nostrilHole = new THREE.Mesh(
      new THREE.SphereGeometry(0.0034, 8, 6),
      cavityDarkMat
    );
    nostrilHole.scale.set(1.0, 0.55, 1.3);
    nostrilHole.position.set(side * 0.0074, -0.026, 0.1045);
    headGroup.add(nostrilHole);

    // Sculpted Human Auricle Ear + Golden Kundala Ring
    const earShape = new THREE.Shape();
    earShape.moveTo(0, 0.028);
    earShape.quadraticCurveTo(0.017, 0.028, 0.018, 0.005);
    earShape.quadraticCurveTo(0.016, -0.02, 0.006, -0.03);
    earShape.quadraticCurveTo(-0.004, -0.032, -0.004, -0.015);
    earShape.lineTo(-0.004, 0.02);
    earShape.closePath();

    const earGeo = new THREE.ExtrudeGeometry(earShape, {
      depth: 0.009,
      bevelEnabled: true,
      bevelThickness: 0.003,
      bevelSize: 0.0025,
      bevelSegments: 2,
    });
    const ear = new THREE.Mesh(earGeo, skinMat);
    ear.position.set(side * 0.083, -0.004, -0.004);
    ear.rotation.y = side > 0 ? Math.PI * 0.42 : -Math.PI * 0.42;
    if (side < 0) ear.scale.x = -1;
    ear.castShadow = true;
    headGroup.add(ear);

    const kundala = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0055, 6, 12), goldMat);
    kundala.rotation.y = Math.PI / 2;
    kundala.position.set(side * 0.094, -0.042, -0.006);
    headGroup.add(kundala);

    // Natural Warrior Sideburns & Temple Locks
    const sideLock = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.008, 0.098, 10),
      hairMat
    );
    sideLock.position.set(side * 0.078, -0.018, -0.022);
    sideLock.rotation.z = side * 0.14;
    headGroup.add(sideLock);
  });

  // Sculpted Lifelike Lips
  const upperLipCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.024, -0.051, 0.084),
    new THREE.Vector3(-0.01, -0.049, 0.095),
    new THREE.Vector3(0, -0.051, 0.097),
    new THREE.Vector3(0.01, -0.049, 0.095),
    new THREE.Vector3(0.024, -0.051, 0.084),
  ]);
  headGroup.add(
    new THREE.Mesh(new THREE.TubeGeometry(upperLipCurve, 14, 0.0036, 6, false), lipMat)
  );
  const lowerLipCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.021, -0.053, 0.084),
    new THREE.Vector3(-0.009, -0.059, 0.093),
    new THREE.Vector3(0, -0.0595, 0.0945),
    new THREE.Vector3(0.009, -0.059, 0.093),
    new THREE.Vector3(0.021, -0.053, 0.084),
  ]);
  headGroup.add(
    new THREE.Mesh(new THREE.TubeGeometry(lowerLipCurve, 14, 0.0042, 6, false), lipMat)
  );
  const lipSeamCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.024, -0.052, 0.083),
    new THREE.Vector3(0, -0.0545, 0.095),
    new THREE.Vector3(0.024, -0.052, 0.083),
  ]);
  headGroup.add(
    new THREE.Mesh(new THREE.TubeGeometry(lipSeamCurve, 12, 0.0011, 5, false), cavityDarkMat)
  );

  // Subtle Well-Groomed Warrior Jawline Beard Framing the Chin
  const jawBeardCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.068, -0.024, 0.022),
    new THREE.Vector3(-0.044, -0.068, 0.06),
    new THREE.Vector3(0, -0.084, 0.082),
    new THREE.Vector3(0.044, -0.068, 0.06),
    new THREE.Vector3(0.068, -0.024, 0.022),
  ]);
  headGroup.add(
    new THREE.Mesh(new THREE.TubeGeometry(jawBeardCurve, 18, 0.0085, 6, false), hairMat)
  );

  // Saffron-Vermilion Sindoor Tilak
  const tilak = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.036, 0.011), sindoorMat);
  tilak.position.set(0, 0.05, 0.099);
  headGroup.add(tilak);

  // Natural Cranial Hair Cap & Flowing Warrior Locks behind Head
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.094, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.54),
    hairMat
  );
  hairCap.scale.set(0.95, 1.03, 0.98);
  hairCap.position.set(0, 0.026, -0.02);
  headGroup.add(hairCap);

  const mane = new THREE.Mesh(new THREE.SphereGeometry(0.086, 16, 14), hairMat);
  mane.scale.set(0.96, 1.08, 0.88);
  mane.position.set(0, -0.004, -0.046);
  headGroup.add(mane);

  // Ornate Traditional Golden Ratna-Mukut Crown (replaces conical hat with domed fluted temple Mukut)
  const crownGroup = new THREE.Group();
  crownGroup.position.set(0, 0.072, -0.008);
  crownGroup.scale.set(0.95, 1.0, 1.06);
  headGroup.add(crownGroup);

  // Sculpted Pearl-Studded Forehead Fillet Ring
  const crownPearlRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.088, 0.0068, 8, 24),
    pearlMat
  );
  crownPearlRim.rotation.x = Math.PI / 2;
  crownGroup.add(crownPearlRim);

  // Jeweled Base Diadem Collar
  const crownBaseBand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.086, 0.092, 0.048, 20),
    goldMat
  );
  crownBaseBand.position.y = 0.024;
  crownBaseBand.castShadow = true;
  crownGroup.add(crownBaseBand);

  const crownMidBand = new THREE.Mesh(
    new THREE.TorusGeometry(0.086, 0.0065, 8, 24),
    goldMat
  );
  crownMidBand.rotation.x = Math.PI / 2;
  crownMidBand.position.y = 0.048;
  crownGroup.add(crownMidBand);

  // Curved Lotus-Dome Temple Mukut Profile (LatheGeometry: stepped arched tiers -> scalloped dome -> Kalasha spire)
  const mukutProfile = [
    new THREE.Vector2(0.082, 0.048),
    new THREE.Vector2(0.086, 0.068),
    new THREE.Vector2(0.074, 0.082),
    new THREE.Vector2(0.076, 0.104),
    new THREE.Vector2(0.062, 0.122),
    new THREE.Vector2(0.056, 0.142),
    new THREE.Vector2(0.036, 0.158),
    new THREE.Vector2(0.016, 0.168),
    new THREE.Vector2(0.024, 0.18), // Amalaka neck & lotus bud base
    new THREE.Vector2(0.018, 0.198),
    new THREE.Vector2(0.005, 0.214),
    new THREE.Vector2(0.0, 0.218),
  ];
  const mukutDomeGeo = new THREE.LatheGeometry(mukutProfile, 24);
  mukutDomeGeo.computeVertexNormals();
  const mukutDome = new THREE.Mesh(mukutDomeGeo, goldMat);
  mukutDome.castShadow = true;
  crownGroup.add(mukutDome);

  // Scalloped Amalaka Jewel Ring & Top Pearl Kalasha Finial
  const amalakaRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.025, 0.0075, 8, 16),
    goldMat
  );
  amalakaRing.rotation.x = Math.PI / 2;
  amalakaRing.position.y = 0.172;
  crownGroup.add(amalakaRing);

  const crownTopPearl = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), pearlMat);
  crownTopPearl.position.y = 0.222;
  crownGroup.add(crownTopPearl);

  // 10 Sculpted Gold Lotus-Petal Crest Arches & Alternating Ruby/Emerald Cabochons Around Crown
  const crownPetalShape = new THREE.Shape();
  crownPetalShape.moveTo(-0.015, 0);
  crownPetalShape.quadraticCurveTo(-0.018, 0.032, 0, 0.052);
  crownPetalShape.quadraticCurveTo(0.018, 0.032, 0.015, 0);
  crownPetalShape.closePath();
  const crownPetalGeo = new THREE.ExtrudeGeometry(crownPetalShape, {
    depth: 0.006,
    bevelEnabled: true,
    bevelThickness: 0.002,
    bevelSize: 0.002,
    bevelSegments: 2,
  });

  for (let p = 0; p < 10; p++) {
    const a = (p / 10) * Math.PI * 2;
    const isFront = p === 0;
    const petal = new THREE.Mesh(crownPetalGeo, goldMat);
    petal.position.set(Math.sin(a) * 0.088, 0.044, Math.cos(a) * 0.088);
    petal.rotation.y = a;
    petal.rotation.x = -0.14;
    if (isFront) petal.scale.set(1.38, 1.35, 1.25);
    crownGroup.add(petal);

    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(isFront ? 0.016 : 0.0095, 0),
      isFront || p % 2 === 0 ? rubyMat : emeraldMat
    );
    gem.scale.set(1.0, 1.25, 0.65);
    gem.position.set(Math.sin(a) * 0.093, isFront ? 0.036 : 0.025, Math.cos(a) * 0.093);
    gem.rotation.y = a;
    crownGroup.add(gem);
  }

  // Ornate Frontal Prabhavali Halo Bezel Framing Central Crown Ruby
  const frontHaloBezel = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.0055, 8, 18), goldMat);
  frontHaloBezel.position.set(0, 0.036, 0.091);
  crownGroup.add(frontHaloBezel);

  // Massive Muscular Arms with Articulated Deltoid Shoulder Armor, Keyura Armlets & Kankana Bracers
  const makeArm = (xOffset: number, isLeft: boolean) => {
    const armPivot = new THREE.Group();
    armPivot.position.set(xOffset, 0.545, 0);
    const sideSign = isLeft ? -1 : 1;

    const shoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.068, 14, 12), skinMat);
    shoulderCap.position.set(-sideSign * 0.008, -0.006, 0);
    shoulderCap.castShadow = true;
    armPivot.add(shoulderCap);

    // Sculpted Golden Skanda-Kavacha Pauldron attached to armPivot so it articulates smoothly without torso clipping
    const pauldron = new THREE.Mesh(
      new THREE.SphereGeometry(0.076, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
      goldMat
    );
    pauldron.scale.set(1.02, 0.92, 1.05);
    pauldron.position.set(sideSign * 0.006, 0.012, 0);
    pauldron.rotation.z = -sideSign * 0.45;
    pauldron.castShadow = true;
    armPivot.add(pauldron);

    const pauldronGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.014, 0), rubyMat);
    pauldronGem.position.set(sideSign * 0.044, 0.046, 0.028);
    armPivot.add(pauldronGem);

    const upperArmGeo = createRamAnatomicalLimbGeometry(
      0.305,
      [
        [0.0, 0.058, 0.064, 0, 0],
        [0.18, 0.068, 0.074, sideSign * 0.006, 0.002], // massive deltoid
        [0.58, 0.064, 0.072, 0, 0.005], // bulging bicep peak
        [1.0, 0.044, 0.048, 0, 0],
      ],
      14,
      18
    );
    const upperArm = new THREE.Mesh(upperArmGeo, skinMat);
    upperArm.castShadow = true;
    upperArm.receiveShadow = true;
    armPivot.add(upperArm);

    const keyura = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.011, 6, 16), goldMat);
    keyura.rotation.x = Math.PI / 2;
    keyura.position.y = -0.12;
    armPivot.add(keyura);

    const elbowPivot = new THREE.Group();
    elbowPivot.position.set(0, -0.295, 0);
    armPivot.add(elbowPivot);

    const elbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.046, 14, 12), skinMat);
    elbowPivot.add(elbowCap);

    const forearmGeo = createRamAnatomicalLimbGeometry(
      0.278,
      [
        [0.0, 0.044, 0.048, 0, 0],
        [0.28, 0.056, 0.062, 0, 0.004], // thick powerhouse forearm
        [0.85, 0.036, 0.039, 0, 0],
        [1.0, 0.034, 0.036, 0, 0],
      ],
      14,
      18
    );
    const forearm = new THREE.Mesh(forearmGeo, skinMat);
    forearm.position.y = 0.01;
    forearm.castShadow = true;
    forearm.receiveShadow = true;
    elbowPivot.add(forearm);

    const bracer = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.038, 0.082, 12), goldMat);
    bracer.position.y = -0.22;
    elbowPivot.add(bracer);

    const hand = createRamDetailedHand(isLeft, skinMat);
    hand.scale.set(1.22, 1.15, 1.2);
    hand.position.y = -0.268;
    elbowPivot.add(hand);

    const handAnchor = new THREE.Object3D();
    handAnchor.position.set(isLeft ? 0.01 : -0.01, -0.295, 0.035);
    elbowPivot.add(handAnchor);

    return { armPivot, elbowPivot, handAnchor };
  };

  const leftArmRig = makeArm(-0.245, true);
  const rightArmRig = makeArm(0.245, false);
  torso.add(leftArmRig.armPivot, rightArmRig.armPivot);

  // Colossal Embossed Vajra Gada Mace gripped firmly in right hand
  const meleeWeaponGroup = createVajraGadaMace(goldMat, rubyMat, emberMat);
  meleeWeaponGroup.position.set(-0.01, -0.29, 0.04);
  meleeWeaponGroup.rotation.x = Math.PI * 0.44;
  rightArmRig.elbowPivot.add(meleeWeaponGroup);

  // Keep overall heroic stature imposing (1.24x human scale)
  root.scale.setScalar(1.24);

  return {
    root,
    leftLeg,
    rightLeg,
    leftKnee,
    rightKnee,
    leftAnkle,
    rightAnkle,
    leftArm: leftArmRig.armPivot,
    rightArm: rightArmRig.armPivot,
    leftElbow: leftArmRig.elbowPivot,
    rightElbow: rightArmRig.elbowPivot,
    torso,
    headGroup,
    leftHandAnchor: leftArmRig.handAnchor,
    rightHandAnchor: rightArmRig.handAnchor,
    centerPleat,
    waistWrap,
    capePivot,
    tailSegments,
    meleeWeaponGroup,
    heroAuraMesh,
    contactShadow,
  };
}

export function createLakshmanModel(textures: ProceduralTextures): CharacterRig {
  const rig = createLordRamModel(textures, { highResSkin: true });

  // Natural fair golden-wheat human complexion + lifelike rose-terracotta lips & espresso hair
  const fairSkinMat = createLifelikeHumanSkinMaterial(textures, {
    colorHex: 0xe6b68f,
    sheenHex: 0xf7d0b3,
    sssRgb: [0.16, 0.058, 0.034],
    roughness: 0.41,
    normalScale: 0.12,
    cacheTag: 'lakshman',
  });
  const naturalLipMat = new THREE.MeshPhysicalMaterial({
    color: 0xa66252,
    roughness: 0.4,
    metalness: 0.0,
    ior: 1.4,
    sheen: 0.2,
    sheenColor: new THREE.Color(0xd9907e),
    flatShading: false,
  });
  naturalLipMat.userData.lifelikeSkin = true;
  const naturalHairMat = new THREE.MeshPhysicalMaterial({
    color: 0x191311,
    roughness: 0.44,
    metalness: 0.04,
    sheen: 0.34,
    sheenRoughness: 0.48,
    sheenColor: new THREE.Color(0x4b3528),
    flatShading: false,
  });
  naturalHairMat.userData.lifelikeSkin = true;

  const silverGoldMat = new THREE.MeshPhysicalMaterial({
    map: textures.armorMetal,
    normalMap: textures.armorNormal,
    color: 0xdbe6f0,
    roughness: 0.24,
    metalness: 0.95,
    clearcoat: 0.42,
  });
  const emeraldSilkMat = new THREE.MeshPhysicalMaterial({
    map: textures.silkGold,
    normalMap: textures.silkNormal,
    color: 0x0f6e5c,
    roughness: 0.62,
    metalness: 0.14,
    sheen: 0.72,
    sheenColor: new THREE.Color(0xf6d88c),
  });

  // Replace Shyam-Varna skin/lips/hair with Lakshman's lifelike human complexion & emerald-silver silk
  rig.root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshPhysicalMaterial;
    if (!mat) return;
    if (mat.map === textures.royalSkin && mat.color.getHex() === 0xffffff) {
      m.material = fairSkinMat;
    } else if (mat.color && mat.color.getHex() === 0x4b3c60) {
      m.material = naturalLipMat;
    } else if (mat.color && mat.color.getHex() === 0x11131a) {
      m.material = naturalHairMat;
    } else if (mat.map === textures.silkGold && mat.color.getHex() === 0xb83524) {
      m.material = emeraldSilkMat;
    } else if (
      mat.color &&
      (mat.color.getHex() === 0xf5f2eb ||
        mat.color.getHex() === 0x4b2f19 ||
        mat.color.getHex() === 0x1c1410 ||
        mat.color.getHex() === 0x050508)
    ) {
      mat.userData.lifelikeSkin = true;
    }
  });

  // Add Seshanaga Five-Hooded Silver-Gold Serpent Crest onto Lakshman's crown
  if (rig.headGroup) {
    for (let s = -2; s <= 2; s++) {
      const hood = new THREE.Mesh(
        new THREE.ConeGeometry(0.018, 0.075, 6),
        silverGoldMat
      );
      hood.position.set(s * 0.024, 0.215 - Math.abs(s) * 0.012, 0.088 - Math.abs(s) * 0.01);
      hood.rotation.x = 0.25;
      hood.rotation.z = -s * 0.14;
      rig.headGroup.add(hood);
    }
  }

  // Add Gleaming Curved Celestial Khadga Sword in Lakshman's right hand
  const sword = new THREE.Group();
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.16, 8), silverGoldMat);
  sword.add(hilt);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.018, 0.025), silverGoldMat);
  guard.position.y = 0.08;
  sword.add(guard);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.72, 0.008), silverGoldMat);
  blade.position.y = 0.45;
  blade.castShadow = true;
  sword.add(blade);
  sword.position.set(-0.008, -0.28, 0.035);
  sword.rotation.x = Math.PI * 0.46;
  rig.rightElbow.add(sword);
  rig.meleeWeaponGroup = sword;

  rig.root.scale.setScalar(0.99);
  return rig;
}

export function createBharatModel(textures: ProceduralTextures): CharacterRig {
  const rig = createLordRamModel(textures, { highResSkin: true });

  // Natural warm medium olive-bronze / toasted-almond human complexion + lifelike lips & hair
  const bronzeSkinMat = createLifelikeHumanSkinMaterial(textures, {
    colorHex: 0xd19f74,
    sheenHex: 0xebc09a,
    sssRgb: [0.145, 0.05, 0.026],
    roughness: 0.43,
    normalScale: 0.13,
    cacheTag: 'bharat',
  });
  const naturalLipMat = new THREE.MeshPhysicalMaterial({
    color: 0x945546,
    roughness: 0.42,
    metalness: 0.0,
    ior: 1.4,
    sheen: 0.18,
    sheenColor: new THREE.Color(0xc98371),
    flatShading: false,
  });
  naturalLipMat.userData.lifelikeSkin = true;
  const naturalHairMat = new THREE.MeshPhysicalMaterial({
    color: 0x1b1411,
    roughness: 0.45,
    metalness: 0.04,
    sheen: 0.32,
    sheenRoughness: 0.48,
    sheenColor: new THREE.Color(0x4f382b),
    flatShading: false,
  });
  naturalHairMat.userData.lifelikeSkin = true;

  const jadeMat = new THREE.MeshPhysicalMaterial({
    map: textures.silkGold,
    normalMap: textures.silkNormal,
    color: 0x165e44,
    roughness: 0.58,
    metalness: 0.16,
    sheen: 0.7,
    sheenColor: new THREE.Color(0xffe082),
  });
  const burnishedGoldMat = new THREE.MeshPhysicalMaterial({
    map: textures.armorMetal,
    normalMap: textures.armorNormal,
    color: 0xebb944,
    roughness: 0.25,
    metalness: 0.94,
    clearcoat: 0.4,
  });

  rig.root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshPhysicalMaterial;
    if (!mat) return;
    if (mat.map === textures.royalSkin && mat.color.getHex() === 0xffffff) {
      m.material = bronzeSkinMat;
    } else if (mat.color && mat.color.getHex() === 0x4b3c60) {
      m.material = naturalLipMat;
    } else if (mat.color && mat.color.getHex() === 0x11131a) {
      m.material = naturalHairMat;
    } else if (mat.map === textures.silkGold && mat.color.getHex() === 0xb83524) {
      m.material = jadeMat;
    } else if (
      mat.color &&
      (mat.color.getHex() === 0xf5f2eb ||
        mat.color.getHex() === 0x4b2f19 ||
        mat.color.getHex() === 0x1c1410 ||
        mat.color.getHex() === 0x050508)
    ) {
      mat.userData.lifelikeSkin = true;
    }
  });

  // Royal Sculpted Breastplate & Shoulder Pauldrons for Bharat
  const breastplate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.168, 0.132, 0.34, 10),
    burnishedGoldMat
  );
  breastplate.scale.set(1.04, 1.0, 0.72);
  breastplate.position.set(0, 0.43, 0.008);
  breastplate.castShadow = true;
  rig.torso.add(breastplate);

  // Dharma-Chakra Halberd in Right Hand + Embossed Sun Shield on Left Forearm
  const halberd = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.45, 7), burnishedGoldMat);
  pole.position.y = 0.38;
  halberd.add(pole);
  const axeHead = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 6), burnishedGoldMat);
  axeHead.rotation.z = -Math.PI / 2;
  axeHead.position.set(0.08, 0.98, 0);
  halberd.add(axeHead);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.22, 6), burnishedGoldMat);
  tip.position.y = 1.18;
  halberd.add(tip);
  halberd.position.set(-0.008, -0.28, 0.035);
  halberd.rotation.x = Math.PI * 0.42;
  rig.rightElbow.add(halberd);
  rig.meleeWeaponGroup = halberd;

  const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.025, 10), burnishedGoldMat);
  shield.rotation.z = Math.PI / 2;
  shield.position.set(-0.06, -0.18, 0.02);
  shield.castShadow = true;
  rig.leftElbow.add(shield);

  rig.root.scale.setScalar(1.04);
  return rig;
}

export function createHeroModel(heroId: string, textures: ProceduralTextures): CharacterRig {
  const upper = (heroId || 'RAM').toUpperCase();
  if (upper === 'HANUMAN' || upper === 'ANGAD') {
    return createHanumanModel(textures);
  }
  if (upper === 'LAKSHMAN' || upper === 'SHATRUGHNA') {
    return createLakshmanModel(textures);
  }
  if (upper === 'BHARAT') {
    return createBharatModel(textures);
  }
  return createLordRamModel(textures);
}

// ═══════════════════════════════════════════════════════════════════════════════
// REFERENCE-TARGET HD WORLD LANDMARKS: COLOSSAL GOLDEN ARCHER STATUE & FLOATING
// CELESTIAL SANCTUARY ISLANDS WITH CASCADING WATERFALLS
// ═══════════════════════════════════════════════════════════════════════════════

export function createColossalGoldenArcherMonument(
  textures: ProceduralTextures
): THREE.Group {
  const root = new THREE.Group();

  const sandstoneMat = new THREE.MeshStandardMaterial({
    map: textures.sandstone,
    normalMap: textures.sandstoneNormal,
    color: 0xd8b27c,
    roughness: 0.78,
    metalness: 0.06,
  });
  const gildedBronzeMat = new THREE.MeshPhysicalMaterial({
    map: textures.armorMetal,
    normalMap: textures.armorNormal,
    roughnessMap: textures.armorRoughness,
    metalnessMap: textures.armorMetalness,
    color: 0xf4c450,
    roughness: 0.28,
    metalness: 0.88,
    clearcoat: 0.25,
  });

  // Grand tiered carved sandstone colonnade plinth (16m base -> 9m tall)
  const baseStep1 = new THREE.Mesh(new THREE.BoxGeometry(15.5, 2.2, 15.5), sandstoneMat);
  baseStep1.position.y = 1.1;
  baseStep1.castShadow = true;
  baseStep1.receiveShadow = true;
  root.add(baseStep1);

  const baseStep2 = new THREE.Mesh(new THREE.BoxGeometry(12.2, 2.4, 12.2), sandstoneMat);
  baseStep2.position.y = 3.4;
  baseStep2.castShadow = true;
  baseStep2.receiveShadow = true;
  root.add(baseStep2);

  // Carved perimeter pillars supporting the upper statue dais
  for (let i = -1; i <= 1; i += 2) {
    for (let j = -1; j <= 1; j += 2) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 4.6, 12), sandstoneMat);
      col.position.set(i * 4.6, 6.8, j * 4.6);
      col.castShadow = true;
      root.add(col);
    }
  }

  const statuePlinth = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 5.2, 1.8, 16), sandstoneMat);
  statuePlinth.position.y = 9.6;
  statuePlinth.castShadow = true;
  root.add(statuePlinth);

  // Colossal 24-meter Gilded Warrior Archer Hero Figure aiming toward the horizon
  const hero = createLordRamModel(textures);
  hero.root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = gildedBronzeMat;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  if (hero.contactShadow) hero.contactShadow.visible = false;
  if (hero.bowGroup) hero.bowGroup.visible = true;
  if (hero.backBowGroup) hero.backBowGroup.visible = false;
  // Heroic drawn-bow stance
  hero.leftArm.rotation.set(-1.32, 0, 0.14);
  hero.leftElbow.rotation.x = -0.22;
  hero.rightArm.rotation.set(-0.92, 0, -0.18);
  hero.rightElbow.rotation.x = -1.28;
  hero.leftLeg.rotation.set(-0.24, 0, -0.08);
  hero.rightLeg.rotation.set(0.22, 0, 0.08);
  hero.rightKnee.rotation.x = 0.22;

  hero.root.position.set(0, 10.5, 0);
  hero.root.scale.setScalar(11.5);
  root.add(hero.root);

  return root;
}

export function createFloatingCelestialIsland(
  textures: ProceduralTextures,
  scale = 1.0
): { group: THREE.Group; waterfallUniforms: { uTime: { value: number } } } {
  const group = new THREE.Group();

  const cliffMat = new THREE.MeshStandardMaterial({
    map: textures.rockCliff,
    normalMap: textures.rockCliffNormal,
    color: 0x69706a,
    roughness: 0.88,
    metalness: 0.06,
  });
  const mossCapMat = new THREE.MeshStandardMaterial({
    map: textures.foliage,
    color: 0x2f7036,
    roughness: 0.78,
  });
  const goldMat = new THREE.MeshPhysicalMaterial({
    map: textures.armorMetal,
    color: 0xf4c44e,
    roughness: 0.28,
    metalness: 0.9,
  });
  const sandstoneMat = new THREE.MeshStandardMaterial({
    map: textures.sandstone,
    normalMap: textures.sandstoneNormal,
    color: 0xe2bc84,
    roughness: 0.72,
  });

  // Inverted faceted rock spire underside
  const underside = new THREE.Mesh(new THREE.ConeGeometry(16 * scale, 28 * scale, 7), cliffMat);
  underside.rotation.x = Math.PI;
  underside.position.y = -14 * scale;
  group.add(underside);

  const subSpire1 = new THREE.Mesh(new THREE.ConeGeometry(7 * scale, 18 * scale, 6), cliffMat);
  subSpire1.rotation.x = Math.PI;
  subSpire1.position.set(8.5 * scale, -11 * scale, -4 * scale);
  group.add(subSpire1);

  const subSpire2 = new THREE.Mesh(new THREE.ConeGeometry(6 * scale, 15 * scale, 6), cliffMat);
  subSpire2.rotation.x = Math.PI;
  subSpire2.position.set(-7.5 * scale, -10 * scale, 5.5 * scale);
  group.add(subSpire2);

  // Verdant Top Meadow Crown
  const topDisc = new THREE.Mesh(new THREE.CylinderGeometry(16.5 * scale, 14.8 * scale, 2.8 * scale, 8), mossCapMat);
  topDisc.position.y = 0;
  group.add(topDisc);

  // Celestial Gilded Temple Citadel atop Floating Island
  const templeBase = new THREE.Mesh(new THREE.BoxGeometry(12 * scale, 3.6 * scale, 12 * scale), sandstoneMat);
  templeBase.position.y = 3.0 * scale;
  group.add(templeBase);

  // Carved 6-step ceremonial stairway on -Z edge connecting meadow (+1.4s) to temple terrace (+4.8s)
  const stairSteps = 6;
  const stairWidth = 4.0 * scale;
  const stairStartZ = -10.4 * scale;
  const stairEndZ = -6.0 * scale;
  const stepDepth = (stairEndZ - stairStartZ) / stairSteps;
  const meadowTopY = 1.4 * scale;
  const templeTopY = 4.8 * scale;
  const risePerStep = (templeTopY - meadowTopY) / stairSteps;
  for (let sIdx = 0; sIdx < stairSteps; sIdx++) {
    const stepTop = meadowTopY + risePerStep * (sIdx + 1);
    const stepH = stepTop - meadowTopY;
    const stepMesh = new THREE.Mesh(
      new THREE.BoxGeometry(stairWidth, stepH, stepDepth * 1.05),
      sandstoneMat
    );
    stepMesh.position.set(
      0,
      meadowTopY + stepH * 0.5,
      stairStartZ + stepDepth * (sIdx + 0.5)
    );
    group.add(stepMesh);
  }

  const centralShikhara = new THREE.Mesh(new THREE.ConeGeometry(4.4 * scale, 12.5 * scale, 8), goldMat);
  centralShikhara.position.y = 11.0 * scale;
  group.add(centralShikhara);

  const cornerOffsets = [
    [-4.4, -4.4],
    [4.4, -4.4],
    [-4.4, 4.4],
    [4.4, 4.4],
  ];
  cornerOffsets.forEach(([ox, oz]) => {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.1 * scale, 1.3 * scale, 5.5 * scale, 8), sandstoneMat);
    tower.position.set(ox * scale, 5.5 * scale, oz * scale);
    group.add(tower);

    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.45 * scale, 3.4 * scale, 8), goldMat);
    spire.position.set(ox * scale, 9.8 * scale, oz * scale);
    group.add(spire);
  });

  // Animated Glowing Celestial Waterfall plunging from the island edge
  const waterfallUniforms = { uTime: { value: 0 } };
  const wfMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: waterfallUniforms.uTime,
      tFoam: { value: textures.waterfallFoam },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D tFoam;
      varying vec2 vUv;
      void main() {
        float streak = texture2D(tFoam, vec2(vUv.x * 2.0, vUv.y * 3.5 + uTime * 1.4)).r;
        float edge = smoothstep(0.0, 0.2, vUv.x) * (1.0 - smoothstep(0.8, 1.0, vUv.x));
        float botFade = smoothstep(0.0, 0.25, vUv.y);
        vec3 col = mix(vec3(0.42, 0.80, 0.98), vec3(0.95, 0.99, 1.0), streak);
        float a = edge * botFade * (0.45 + 0.45 * streak);
        gl_FragColor = vec4(col, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const wfRibbon = new THREE.Mesh(new THREE.PlaneGeometry(4.2 * scale, 48 * scale), wfMat);
  wfRibbon.position.set(0, -24 * scale, 13.8 * scale);
  group.add(wfRibbon);

  return { group, waterfallUniforms };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCESSIBLE MOUNTAIN CAVES, TERRACED GARDENS & WILDLIFE ECOSYSTEM RIGS
// ═══════════════════════════════════════════════════════════════════════════════

export interface MountainCaveBuilt {
  group: THREE.Group;
  colliders: BoxCollider[];
}

/**
 * Open walk-in Mountain Cavern with hollow arched mouth (+Z), granite stone chamber,
 * glowing crystal formations, stalactites, sacred oil brazier, and perimeter wall colliders.
 */
export function createMountainCaveModel(
  textures: ProceduralTextures,
  spec: MountainCaveSpec
): MountainCaveBuilt {
  const group = new THREE.Group();
  group.position.set(spec.x, spec.y, spec.z);
  group.rotation.y = spec.yaw;

  const colliders: BoxCollider[] = [];

  const caveRockMat = new THREE.MeshStandardMaterial({
    map: textures.rockCliff,
    normalMap: textures.rockCliffNormal,
    color: 0x5c5752,
    roughness: 0.92,
    metalness: 0.04,
    flatShading: true,
  });
  const floorStoneMat = new THREE.MeshStandardMaterial({
    map: textures.sandstone,
    normalMap: textures.sandstoneNormal,
    color: 0x6f675d,
    roughness: 0.88,
    flatShading: true,
  });
  const crystalMat = new THREE.MeshPhysicalMaterial({
    color: spec.crystalHex,
    emissive: spec.crystalHex,
    emissiveIntensity: 1.35,
    roughness: 0.18,
    metalness: 0.15,
    flatShading: true,
  });
  const flameMat = new THREE.MeshStandardMaterial({
    color: 0xffb347,
    emissive: 0xff6b1a,
    emissiveIntensity: 2.1,
    roughness: 0.35,
  });

  // Walkable flat cavern floor
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.6, 0.3, 12), floorStoneMat);
  floor.position.set(0, -0.1, -1.2);
  floor.receiveShadow = true;
  group.add(floor);

  // Left & Right Boulder Walls forming hollow walk-in cavern
  const wallBoulders: Array<[number, number, number, number, number, number]> = [
    // Left wall boulders
    [-5.0, 2.2, 2.8, 2.2, 2.8, 2.6],
    [-5.4, 2.5, 0.2, 2.4, 3.2, 2.8],
    [-5.2, 2.6, -2.8, 2.5, 3.3, 2.9],
    [-4.3, 2.7, -5.4, 2.6, 3.4, 2.8],
    // Right wall boulders
    [5.0, 2.2, 2.8, 2.2, 2.8, 2.6],
    [5.4, 2.5, 0.2, 2.4, 3.2, 2.8],
    [5.2, 2.6, -2.8, 2.5, 3.3, 2.9],
    [4.3, 2.7, -5.4, 2.6, 3.4, 2.8],
    // Back cavern enclosure
    [0.0, 2.8, -6.9, 4.4, 3.5, 2.7],
    [-2.2, 2.5, -6.5, 2.6, 3.2, 2.4],
    [2.2, 2.5, -6.5, 2.6, 3.2, 2.4],
    // Vaulted cavern roof & front mouth arch lintel (leaving y=0..4.9 clear to walk right inside!)
    [-2.8, 5.4, 2.6, 2.6, 1.8, 2.2],
    [2.8, 5.4, 2.6, 2.6, 1.8, 2.2],
    [0.0, 6.2, 2.5, 3.8, 1.7, 2.4],
    [0.0, 6.4, -0.5, 5.2, 2.1, 3.4],
    [0.0, 6.1, -3.8, 5.0, 2.2, 3.2],
    [0.0, 5.4, -6.2, 4.6, 2.4, 2.6],
  ];

  wallBoulders.forEach(([bx, by, bz, sx, sy, sz], i) => {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.0, 1), caveRockMat);
    rock.position.set(bx, by, bz);
    rock.scale.set(sx, sy, sz);
    rock.rotation.set(i * 0.41, i * 0.77, i * 0.23);
    rock.castShadow = false;
    rock.receiveShadow = true;
    group.add(rock);
  });

  // Hanging ceiling stalactites
  const stalactites: Array<[number, number, number, number]> = [
    [-1.8, 4.8, 0.8, 1.2],
    [1.6, 4.9, 0.2, 1.1],
    [-0.4, 5.0, -2.4, 1.3],
    [2.1, 4.7, -3.2, 1.0],
    [-2.2, 4.7, -3.5, 1.15],
  ];
  stalactites.forEach(([sx, sy, sz, len]) => {
    const st = new THREE.Mesh(new THREE.ConeGeometry(0.24, len, 5), caveRockMat);
    st.rotation.x = Math.PI;
    st.position.set(sx, sy - len * 0.4, sz);
    group.add(st);
  });

  // Glowing Crystal Clusters along interior cavern walls
  const crystalSites: Array<[number, number, number, number]> = [
    [-3.6, 0.4, -1.6, 0.9],
    [3.6, 0.4, -2.2, 1.05],
    [-2.4, 0.5, -4.8, 1.2],
    [2.5, 0.5, -4.7, 1.1],
    [0.2, 0.6, -5.2, 1.35],
  ];
  crystalSites.forEach(([cx, cy, cz, sc], idx) => {
    for (let k = 0; k < 3; k++) {
      const spire = new THREE.Mesh(
        new THREE.ConeGeometry(0.22 * sc, (0.95 + k * 0.35) * sc, 5),
        crystalMat
      );
      spire.position.set(cx + (k - 1) * 0.28, cy + 0.45 * sc, cz + (k % 2) * 0.22);
      spire.rotation.set((k - 1) * 0.24, idx + k * 0.8, (k - 1) * 0.22);
      group.add(spire);
    }
  });

  // Sacred Stone Altar & Brazier Flame near back center
  const altar = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.92, 0.85, 8), floorStoneMat);
  altar.position.set(0, 0.42, -3.9);
  group.add(altar);
  const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), flameMat);
  flame.position.set(0, 1.05, -3.9);
  group.add(flame);

  // Register rotated world-space perimeter wall colliders so mouth (+Z) & interior chamber remain wide open
  const cosY = Math.cos(spec.yaw);
  const sinY = Math.sin(spec.yaw);
  const addLocalBoxCollider = (lx: number, lz: number, halfW: number, halfD: number, height: number) => {
    colliders.push({
      x: spec.x + lx * cosY + lz * sinY,
      z: spec.z - lx * sinY + lz * cosY,
      halfW,
      halfD,
      height,
      rotY: spec.yaw,
      baseY: spec.y,
    });
  };
  addLocalBoxCollider(-4.7, -1.2, 1.35, 5.2, 5.5); // Left cavern rock wall
  addLocalBoxCollider(4.7, -1.2, 1.35, 5.2, 5.5); // Right cavern rock wall
  addLocalBoxCollider(0, -6.3, 4.4, 1.4, 5.5); // Back cavern rock wall
  addLocalBoxCollider(0, -3.9, 0.85, 0.85, 1.15); // Interior stone altar

  return { group, colliders };
}

export interface MountainGardenBuilt {
  group: THREE.Group;
  colliders: CircleCollider[];
}

/**
 * Terraced Himalayan Plateau Garden with carved sandstone curb, sacred lotus pool,
 * benches, glowing lantern pillars, and vivid floral beds.
 */
export function createMountainGardenModel(
  textures: ProceduralTextures,
  spec: MountainGardenSpec
): MountainGardenBuilt {
  const group = new THREE.Group();
  group.position.set(spec.x, spec.y, spec.z);
  const colliders: CircleCollider[] = [];

  const stoneMat = new THREE.MeshStandardMaterial({
    map: textures.sandstone,
    normalMap: textures.sandstoneNormal,
    color: 0xd9b88c,
    roughness: 0.78,
    flatShading: true,
  });
  const poolWaterMat = new THREE.MeshPhysicalMaterial({
    map: textures.water,
    color: 0x3ec5d6,
    roughness: 0.14,
    metalness: 0.08,
    clearcoat: 0.75,
  });
  const lanternGlowMat = new THREE.MeshStandardMaterial({
    color: 0xffd770,
    emissive: 0xff9b28,
    emissiveIntensity: 1.9,
    roughness: 0.3,
  });
  const leafPadMat = new THREE.MeshStandardMaterial({
    color: 0x2c7838,
    roughness: 0.75,
    flatShading: true,
  });

  // Central Sacred Lotus Pool (radius 3.4m)
  const poolRim = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.34, 6, 16), stoneMat);
  poolRim.rotation.x = Math.PI / 2;
  poolRim.position.y = 0.24;
  group.add(poolRim);

  const poolWater = new THREE.Mesh(new THREE.CylinderGeometry(3.25, 3.25, 0.18, 16), poolWaterMat);
  poolWater.position.y = 0.22;
  group.add(poolWater);

  // Floating Lotus Blossoms & Pads
  const lotusColors = [0xff82b2, 0xffd1e3, 0xfff5d6, 0xff9466];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const r = 1.1 + (i % 2) * 1.1;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 7), leafPadMat);
    pad.position.set(Math.cos(a) * r, 0.32, Math.sin(a) * r);
    group.add(pad);

    const bloomMat = new THREE.MeshStandardMaterial({
      color: lotusColors[i % lotusColors.length],
      emissive: lotusColors[i % lotusColors.length],
      emissiveIntensity: 0.25,
      roughness: 0.5,
      flatShading: true,
    });
    const lotus = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), bloomMat);
    lotus.position.set(Math.cos(a) * r, 0.44, Math.sin(a) * r);
    group.add(lotus);
  }

  colliders.push({
    x: spec.x,
    z: spec.z,
    radius: 3.55,
    height: 1.0,
    baseY: spec.y,
  });

  // 4 Carved Sandstone Lantern Pillars & Benches + Colorful Flower Beds (leaving 4 wide entry paths!)
  const flowerColors = [0xff8c1a, 0xff4f7b, 0xffd23f, 0xd462ff];
  for (let q = 0; q < 4; q++) {
    const ang = (q / 4) * Math.PI * 2 + Math.PI * 0.25;
    const lanternR = Math.min(spec.radius - 3.5, 8.8);
    const lx = Math.cos(ang) * lanternR;
    const lz = Math.sin(ang) * lanternR;

    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 2.3, 6), stoneMat);
    pillar.position.set(lx, 1.15, lz);
    group.add(pillar);

    const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), lanternGlowMat);
    lamp.position.set(lx, 2.5, lz);
    group.add(lamp);

    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.42, 6), stoneMat);
    cap.position.set(lx, 2.86, lz);
    group.add(cap);

    colliders.push({
      x: spec.x + lx,
      z: spec.z + lz,
      radius: 0.45,
      height: 3.1,
      baseY: spec.y,
    });

    // Curved sandstone garden bench facing lotus pool
    const benchR = 5.4;
    const bx = Math.cos(ang) * benchR;
    const bz = Math.sin(ang) * benchR;
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.45, 0.72), stoneMat);
    bench.position.set(bx, 0.28, bz);
    bench.rotation.y = -ang + Math.PI * 0.5;
    group.add(bench);

    // Floral shrub mound beside each lantern
    const fColor = flowerColors[q % flowerColors.length];
    const bloomMat = new THREE.MeshStandardMaterial({
      color: fColor,
      roughness: 0.68,
      flatShading: true,
    });
    for (let f = -1; f <= 1; f++) {
      const fAng = ang + f * 0.19;
      const fRad = lanternR + 1.45;
      const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 0), leafPadMat);
      bush.scale.set(1.15, 0.72, 1.15);
      bush.position.set(Math.cos(fAng) * fRad, 0.34, Math.sin(fAng) * fRad);
      group.add(bush);

      const blossom = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), bloomMat);
      blossom.position.set(Math.cos(fAng) * fRad, 0.74, Math.sin(fAng) * fRad);
      group.add(blossom);
    }
  }

  return { group, colliders };
}

export type WildlifeSpecies = 'TIGER' | 'LION' | 'ELEPHANT' | 'DEER' | 'LEOPARD';

export interface WildlifeRig {
  group: THREE.Group;
  species: WildlifeSpecies;
  legs: THREE.Group[]; // [FL, FR, BL, BR]
  headPivot: THREE.Group;
  tailPivot: THREE.Group;
  earPivots?: THREE.Group[];
  trunkPivot?: THREE.Group;
}

function buildQuadrupedLegs(
  parent: THREE.Group,
  coatMat: THREE.Material,
  pawMat: THREE.Material,
  positions: Array<[number, number, number]>,
  topR: number,
  botR: number,
  legLen: number
): THREE.Group[] {
  const legs: THREE.Group[] = [];
  for (let i = 0; i < positions.length; i++) {
    const [lx, ly, lz] = positions[i];
    const pivot = new THREE.Group();
    pivot.position.set(lx, ly, lz);

    const upper = new THREE.Mesh(
      new THREE.CylinderGeometry(topR, botR, legLen, 7),
      coatMat
    );
    upper.position.y = -legLen * 0.5;
    upper.castShadow = true;
    pivot.add(upper);

    const paw = new THREE.Mesh(
      new THREE.BoxGeometry(botR * 2.1, botR * 1.1, botR * 2.4),
      pawMat
    );
    paw.position.set(0, -legLen + botR * 0.45, botR * 0.28);
    pivot.add(paw);

    parent.add(pivot);
    legs.push(pivot);
  }
  return legs;
}

/**
 * Stylized low-poly Bengal Tiger with burnt-amber fur, cream belly, dark stripes & curved ringed tail.
 */
export function createTigerModel(textures?: ProceduralTextures): WildlifeRig {
  const root = new THREE.Group();
  const furMat = new THREE.MeshStandardMaterial({
    map: textures?.bark ?? null,
    color: 0xd97320,
    roughness: 0.78,
    flatShading: true,
  });
  const creamMat = new THREE.MeshStandardMaterial({
    color: 0xf4e8d0,
    roughness: 0.82,
    flatShading: true,
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0x1a1514,
    roughness: 0.85,
    flatShading: true,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xffc436,
    emissive: 0x664008,
    emissiveIntensity: 0.5,
    roughness: 0.2,
  });

  // Body & chest
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.88, 6, 10), furMat);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0.76, 0);
  body.castShadow = true;
  root.add(body);

  const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.78, 5, 8), creamMat);
  belly.rotation.x = Math.PI / 2;
  belly.position.set(0, 0.62, 0.02);
  root.add(belly);

  // Dark tiger stripes along torso & shoulders
  [-0.36, -0.18, 0.0, 0.18, 0.36].forEach((sz, idx) => {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.315 - Math.abs(idx - 2) * 0.01, 0.028, 5, 10, Math.PI * 1.35),
      stripeMat
    );
    band.position.set(0, 0.77, sz);
    band.rotation.z = -Math.PI * 0.17;
    band.rotation.y = Math.PI * 0.5;
    // Align arch across spine
    band.rotation.set(0, 0, -Math.PI * 0.18);
    root.add(band);
  });

  // Legs resting cleanly at y=0
  const legs = buildQuadrupedLegs(
    root,
    furMat,
    creamMat,
    [
      [-0.19, 0.58, 0.42],
      [0.19, 0.58, 0.42],
      [-0.19, 0.58, -0.42],
      [0.19, 0.58, -0.42],
    ],
    0.105,
    0.072,
    0.58
  );

  // Head + muzzle + ears + eyes
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.92, 0.62);
  const cranium = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25, 1), furMat);
  cranium.scale.set(1.04, 0.92, 1.06);
  cranium.position.set(0, 0.05, 0.12);
  cranium.castShadow = true;
  headPivot.add(cranium);

  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.22), creamMat);
  muzzle.position.set(0, -0.02, 0.3);
  headPivot.add(muzzle);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.05), stripeMat);
  nose.position.set(0, 0.03, 0.41);
  headPivot.add(nose);

  [-1, 1].forEach((side) => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.11, 5), stripeMat);
    ear.position.set(side * 0.16, 0.24, 0.05);
    headPivot.add(ear);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 6), eyeMat);
    eye.position.set(side * 0.11, 0.09, 0.31);
    headPivot.add(eye);

    const ruff = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.14), creamMat);
    ruff.position.set(side * 0.21, 0.0, 0.14);
    headPivot.add(ruff);
  });
  root.add(headPivot);

  // Curved ringed tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.84, -0.58);
  const tailGeo = new THREE.CylinderGeometry(0.032, 0.048, 0.72, 6);
  tailGeo.rotateX(-0.95);
  tailGeo.translate(0, -0.22, -0.26);
  const tailMesh = new THREE.Mesh(tailGeo, furMat);
  tailPivot.add(tailMesh);
  const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.048, 6, 6), stripeMat);
  tailTip.position.set(0, -0.4, -0.52);
  tailPivot.add(tailTip);
  root.add(tailPivot);

  root.scale.setScalar(1.08);
  return { group: root, species: 'TIGER', legs, headPivot, tailPivot };
}

/**
 * Stylized low-poly Asiatic Lion with tawny-ochre body, voluminous dark chestnut mane, and tufted tail.
 */
export function createLionModel(textures?: ProceduralTextures): WildlifeRig {
  const root = new THREE.Group();
  const tawnyMat = new THREE.MeshStandardMaterial({
    map: textures?.bark ?? null,
    color: 0xd49a42,
    roughness: 0.78,
    flatShading: true,
  });
  const maneMat = new THREE.MeshStandardMaterial({
    color: 0x583115,
    roughness: 0.88,
    flatShading: true,
  });
  const bellyMat = new THREE.MeshStandardMaterial({
    color: 0xf0dfbd,
    roughness: 0.82,
    flatShading: true,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xffc948,
    emissive: 0x5c3806,
    emissiveIntensity: 0.45,
    roughness: 0.2,
  });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.84, 6, 10), tawnyMat);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0.78, 0);
  body.castShadow = true;
  root.add(body);

  const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.72, 5, 8), bellyMat);
  belly.rotation.x = Math.PI / 2;
  belly.position.set(0, 0.63, 0.02);
  root.add(belly);

  const legs = buildQuadrupedLegs(
    root,
    tawnyMat,
    bellyMat,
    [
      [-0.19, 0.6, 0.42],
      [0.19, 0.6, 0.42],
      [-0.19, 0.6, -0.4],
      [0.19, 0.6, -0.4],
    ],
    0.108,
    0.074,
    0.6
  );

  // Head with grand layered mane
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.94, 0.56);

  const maneRuff = new THREE.Mesh(new THREE.DodecahedronGeometry(0.38, 1), maneMat);
  maneRuff.scale.set(1.08, 1.12, 0.95);
  maneRuff.position.set(0, 0.04, 0.04);
  maneRuff.castShadow = true;
  headPivot.add(maneRuff);

  const chestMane = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.48, 7), maneMat);
  chestMane.rotation.x = Math.PI * 0.92;
  chestMane.position.set(0, -0.22, 0.04);
  headPivot.add(chestMane);

  const face = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 1), tawnyMat);
  face.position.set(0, 0.06, 0.22);
  headPivot.add(face);

  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.2), bellyMat);
  muzzle.position.set(0, -0.01, 0.36);
  headPivot.add(muzzle);

  [-1, 1].forEach((side) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), tawnyMat);
    ear.position.set(side * 0.16, 0.24, 0.16);
    headPivot.add(ear);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 6), eyeMat);
    eye.position.set(side * 0.095, 0.1, 0.37);
    headPivot.add(eye);
  });
  root.add(headPivot);

  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.85, -0.56);
  const tailGeo = new THREE.CylinderGeometry(0.026, 0.038, 0.68, 6);
  tailGeo.rotateX(-0.98);
  tailGeo.translate(0, -0.2, -0.24);
  tailPivot.add(new THREE.Mesh(tailGeo, tawnyMat));
  const tuft = new THREE.Mesh(new THREE.DodecahedronGeometry(0.075, 0), maneMat);
  tuft.position.set(0, -0.38, -0.49);
  tailPivot.add(tuft);
  root.add(tailPivot);

  root.scale.setScalar(1.12);
  return { group: root, species: 'LION', legs, headPivot, tailPivot };
}

/**
 * Natural wild mountain Elephant with slate-grey hide, ivory tusks, flapping ears & animated trunk (no saddle).
 */
export function createWildElephantModel(textures?: ProceduralTextures): WildlifeRig {
  const root = new THREE.Group();
  const hideMat = new THREE.MeshStandardMaterial({
    map: textures?.bark ?? null,
    color: 0x5c5d66,
    roughness: 0.86,
    flatShading: true,
  });
  const tuskMat = new THREE.MeshPhysicalMaterial({
    color: 0xf4ecd6,
    roughness: 0.32,
    clearcoat: 0.25,
    flatShading: true,
  });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.95, 1.45, 7, 12), hideMat);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 1.85, 0);
  body.castShadow = true;
  root.add(body);

  const legs = buildQuadrupedLegs(
    root,
    hideMat,
    hideMat,
    [
      [-0.54, 1.38, 0.7],
      [0.54, 1.38, 0.7],
      [-0.54, 1.38, -0.7],
      [0.54, 1.38, -0.7],
    ],
    0.25,
    0.22,
    1.38
  );

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 2.18, 1.32);

  const cranium = new THREE.Mesh(new THREE.DodecahedronGeometry(0.74, 1), hideMat);
  cranium.castShadow = true;
  headPivot.add(cranium);

  const earPivots: THREE.Group[] = [];
  [-1, 1].forEach((side) => {
    const earPivot = new THREE.Group();
    earPivot.position.set(side * 0.68, 0.08, -0.15);
    const ear = new THREE.Mesh(new THREE.DodecahedronGeometry(0.56, 0), hideMat);
    ear.scale.set(0.18, 1.1, 0.88);
    ear.position.set(side * 0.18, -0.08, -0.12);
    earPivot.add(ear);
    headPivot.add(earPivot);
    earPivots.push(earPivot);

    const tuskCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.28, -0.28, 0.45),
      new THREE.Vector3(side * 0.34, -0.46, 0.92),
      new THREE.Vector3(side * 0.32, -0.26, 1.34),
    ]);
    const tusk = new THREE.Mesh(new THREE.TubeGeometry(tuskCurve, 10, 0.068, 6, false), tuskMat);
    headPivot.add(tusk);
  });

  const trunkPivot = new THREE.Group();
  trunkPivot.position.set(0, -0.18, 0.62);
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, -0.48, 0.26),
    new THREE.Vector3(0, -0.98, 0.15),
    new THREE.Vector3(0, -1.12, 0.38),
  ]);
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(trunkCurve, 12, 0.13, 7, false), hideMat);
  trunkPivot.add(trunk);
  headPivot.add(trunkPivot);
  root.add(headPivot);

  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 1.9, -1.35);
  const tailMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.68, 5), hideMat);
  tailMesh.rotation.x = 0.25;
  tailMesh.position.set(0, -0.32, -0.08);
  tailPivot.add(tailMesh);
  root.add(tailPivot);

  return { group: root, species: 'ELEPHANT', legs, headPivot, tailPivot, earPivots, trunkPivot };
}

/**
 * Graceful Spotted Mountain Deer (Chital) with slender neck, fawn spots, white tail & optional stag antlers.
 */
export function createDeerModel(hasAntlers = true): WildlifeRig {
  const root = new THREE.Group();
  const coatMat = new THREE.MeshStandardMaterial({
    color: 0xb9743d,
    roughness: 0.76,
    flatShading: true,
  });
  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xf7f1e3,
    roughness: 0.82,
    flatShading: true,
  });
  const hoofMat = new THREE.MeshStandardMaterial({
    color: 0x261d17,
    roughness: 0.85,
  });
  const antlerMat = new THREE.MeshStandardMaterial({
    color: 0xe9dec8,
    roughness: 0.6,
    flatShading: true,
  });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.72, 6, 8), coatMat);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0.84, 0);
  body.castShadow = true;
  root.add(body);

  const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.62, 5, 7), whiteMat);
  belly.rotation.x = Math.PI / 2;
  belly.position.set(0, 0.72, 0.02);
  root.add(belly);

  // Signature pale fawn spots along back & flanks
  const spotOffsets: Array<[number, number, number]> = [
    [-0.17, 0.96, 0.2],
    [0.17, 0.95, 0.14],
    [-0.19, 0.92, -0.06],
    [0.18, 0.94, -0.14],
    [-0.15, 0.95, -0.26],
    [0.16, 0.93, 0.3],
  ];
  spotOffsets.forEach(([sx, sy, sz]) => {
    const spot = new THREE.Mesh(new THREE.SphereGeometry(0.036, 5, 5), whiteMat);
    spot.scale.set(0.5, 0.8, 1.1);
    spot.position.set(sx, sy, sz);
    root.add(spot);
  });

  const legs = buildQuadrupedLegs(
    root,
    coatMat,
    hoofMat,
    [
      [-0.13, 0.68, 0.33],
      [0.13, 0.68, 0.33],
      [-0.13, 0.68, -0.33],
      [0.13, 0.68, -0.33],
    ],
    0.056,
    0.036,
    0.68
  );

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.96, 0.42);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.125, 0.48, 7), coatMat);
  neck.position.set(0, 0.2, 0.08);
  neck.rotation.x = 0.34;
  headPivot.add(neck);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.16, 0.28), coatMat);
  head.position.set(0, 0.44, 0.22);
  headPivot.add(head);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.05), hoofMat);
  nose.position.set(0, 0.41, 0.37);
  headPivot.add(nose);

  [-1, 1].forEach((side) => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.14, 5), coatMat);
    ear.position.set(side * 0.11, 0.54, 0.12);
    ear.rotation.z = -side * 0.55;
    headPivot.add(ear);

    if (hasAntlers) {
      const mainBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.022, 0.36, 5), antlerMat);
      mainBeam.position.set(side * 0.09, 0.66, 0.14);
      mainBeam.rotation.z = -side * 0.32;
      mainBeam.rotation.x = -0.18;
      headPivot.add(mainBeam);

      const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.015, 0.18, 5), antlerMat);
      tine.position.set(side * 0.13, 0.72, 0.21);
      tine.rotation.x = 0.45;
      headPivot.add(tine);
    }
  });
  root.add(headPivot);

  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.92, -0.46);
  const tailMesh = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.22, 5), whiteMat);
  tailMesh.rotation.x = -Math.PI * 0.72;
  tailMesh.position.set(0, 0.04, -0.08);
  tailPivot.add(tailMesh);
  root.add(tailPivot);

  return { group: root, species: 'DEER', legs, headPivot, tailPivot };
}

/**
 * Lithe Mountain Leopard with tawny-gold coat, rosette spots across flanks/back, and long balancing tail.
 */
export function createLeopardModel(textures?: ProceduralTextures): WildlifeRig {
  const root = new THREE.Group();
  const goldMat = new THREE.MeshStandardMaterial({
    map: textures?.bark ?? null,
    color: 0xd9a845,
    roughness: 0.76,
    flatShading: true,
  });
  const bellyMat = new THREE.MeshStandardMaterial({
    color: 0xf5ebd4,
    roughness: 0.82,
    flatShading: true,
  });
  const spotMat = new THREE.MeshStandardMaterial({
    color: 0x261d17,
    roughness: 0.86,
    flatShading: true,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x7df56c,
    emissive: 0x2a6614,
    emissiveIntensity: 0.45,
    roughness: 0.2,
  });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.82, 6, 10), goldMat);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0.7, 0);
  body.castShadow = true;
  root.add(body);

  const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.72, 5, 8), bellyMat);
  belly.rotation.x = Math.PI / 2;
  belly.position.set(0, 0.58, 0.02);
  root.add(belly);

  // Rosette spot patches along back & flanks
  const rosetteSpots: Array<[number, number, number]> = [
    [-0.22, 0.78, 0.3],
    [0.22, 0.78, 0.26],
    [-0.24, 0.74, 0.08],
    [0.24, 0.74, 0.04],
    [-0.23, 0.77, -0.14],
    [0.23, 0.77, -0.18],
    [-0.2, 0.75, -0.34],
    [0.2, 0.75, -0.36],
    [0, 0.94, 0.18],
    [0, 0.94, -0.05],
    [0, 0.93, -0.28],
  ];
  rosetteSpots.forEach(([rx, ry, rz]) => {
    const sp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 5), spotMat);
    sp.scale.set(0.65, 0.75, 1.0);
    sp.position.set(rx, ry, rz);
    root.add(sp);
  });

  const legs = buildQuadrupedLegs(
    root,
    goldMat,
    bellyMat,
    [
      [-0.16, 0.54, 0.38],
      [0.16, 0.54, 0.38],
      [-0.16, 0.54, -0.38],
      [0.16, 0.54, -0.38],
    ],
    0.088,
    0.058,
    0.54
  );

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.82, 0.56);
  const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.21, 1), goldMat);
  head.scale.set(1.0, 0.92, 1.05);
  head.position.set(0, 0.04, 0.1);
  head.castShadow = true;
  headPivot.add(head);

  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.13, 0.18), bellyMat);
  muzzle.position.set(0, -0.02, 0.26);
  headPivot.add(muzzle);

  [-1, 1].forEach((side) => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.095, 5), goldMat);
    ear.position.set(side * 0.14, 0.2, 0.04);
    headPivot.add(ear);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 6), eyeMat);
    eye.position.set(side * 0.09, 0.08, 0.26);
    headPivot.add(eye);
  });
  root.add(headPivot);

  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.76, -0.52);
  const tailGeo = new THREE.CylinderGeometry(0.026, 0.038, 0.82, 6);
  tailGeo.rotateX(-0.92);
  tailGeo.translate(0, -0.24, -0.3);
  tailPivot.add(new THREE.Mesh(tailGeo, goldMat));
  const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), spotMat);
  tailTip.position.set(0, -0.45, -0.6);
  tailPivot.add(tailTip);
  root.add(tailPivot);

  return { group: root, species: 'LEOPARD', legs, headPivot, tailPivot };
}


