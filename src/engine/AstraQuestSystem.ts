import * as THREE from 'three';
import {
  AstraId,
  AstraQuestHudState,
  AstraStatusEntry,
  AstraUnlockPopup,
  BrahmaTrialStage,
  DemonVariant,
  EnemySummonWarning,
} from '../types/world';
import {
  ASTRA_CHALLENGE_LOCATIONS,
  ASTRA_CONFIG,
  ASTRA_ORDER,
  BRAHMASTRA_TRIAL_DIFFICULTY,
} from './astraConfig';
import { AstraVfxManager } from './astraVfx';
import { groundHeightAt } from './worldData';
import { soundEngine } from '../utils/audio';

const QUEST_STORAGE_KEY = 'astras_divine_quest_v1';

interface SavedQuestData {
  unlocked: Record<AstraId, boolean>;
  introSeen: boolean;
  selectedAstra: AstraId | null;
}

export interface QuestEngineBridge {
  getPlayerPos: () => { x: number; y: number; z: number; grounded: boolean; swimming: boolean };
  setPlayerVelY: (vy: number) => void;
  getNightFactor: () => number;
  advanceToNight: () => void;
  damagePlayer: (hpDmg: number, pranaDrain: number) => void;
  healPlayer: (amount: number) => void;
  spawnTrialEnemy: (
    x: number,
    z: number,
    isCommander: boolean,
    variant: DemonVariant,
    hpScale: number,
    questTag: string,
    customScale?: number
  ) => string;
  countAliveTaggedEnemies: (tagPrefix: string) => number;
  clearTaggedEnemies: (tagPrefix: string) => void;
  getTaggedEnemyInfo: (tag: string) => { id: string; x: number; y: number; z: number; hp: number; maxHp: number } | null;
  stunEnemyById: (id: string, sec: number) => void;
  getParticleScale: () => number;
  getQualityTier: () => 'HIGH' | 'MEDIUM' | 'LOW';
  triggerCameraShake: (amount: number) => void;
}

interface FireBowlProp {
  x: number;
  y: number;
  z: number;
  lit: boolean;
  flameMesh: THREE.Mesh;
  markerMesh: THREE.Mesh;
}

interface LavaGeyser {
  x: number;
  y: number;
  z: number;
  phaseOffset: number;
  ringMesh: THREE.Mesh;
  colMesh: THREE.Mesh;
  extinguishedTimer: number;
}

interface PearlSwitch {
  x: number;
  y: number;
  z: number;
  activated: boolean;
  pearlMesh: THREE.Mesh;
}

interface SkyPlatform {
  x: number;
  z: number;
  y: number;
  halfW: number;
  halfD: number;
}

interface WindUpdraft {
  x: number;
  y: number;
  z: number;
  topY: number;
  radius: number;
  ringGroup: THREE.Group;
}

interface BrahmaSealTarget {
  astraId: AstraId;
  x: number;
  y: number;
  z: number;
  hit: boolean;
  pillarGroup: THREE.Group;
  orbMesh: THREE.Mesh;
}

export class AstraQuestSystem {
  private scene: THREE.Scene;
  private vfx: AstraVfxManager;
  private bridge: QuestEngineBridge;

  public unlocked: Record<AstraId, boolean> = {
    AGNEYASTRA: false,
    VARUNASTRA: false,
    VAYAVYASTRA: false,
    NAGASTRA: false,
    BRAHMASTRA: false,
  };
  public introSeen = false;
  public selectedAstra: AstraId | null = null;
  public activeUnlockPopup: AstraUnlockPopup | null = null;
  private unlockPopupTimer = 0;

  // World Quest Props Root
  public rootGroup = new THREE.Group();

  // 1. Agneyastra Challenge State
  private fireBowls: FireBowlProp[] = [];
  private fireStep = 0;
  private lavaGeysers: LavaGeyser[] = [];
  private lavaDamageCooldown = 0;

  // 2. Varunastra Challenge State
  private pearls: PearlSwitch[] = [];
  private varunaDoorMesh!: THREE.Mesh;
  private varunaDoorOpen = false;
  private varunaPedestalPos = new THREE.Vector3();
  private varunaOrbMesh!: THREE.Mesh;
  public underwaterBreath: number | null = null;
  private drownTick = 0;

  // 3. Vayavyastra Challenge State
  private skyPlatforms: SkyPlatform[] = [];
  private windUpdrafts: WindUpdraft[] = [];
  private windTrialActive = false;
  private windTrialTimer = 0;
  private vayuPedestalPos = new THREE.Vector3();
  private vayuOrbMesh!: THREE.Mesh;

  // 4. Nagastra Challenge State
  private nagaGateMesh!: THREE.Mesh;
  private nagaDoorOpen = false;
  private chandraAltarPos = new THREE.Vector3();
  private nagaBossId: string | null = null;
  private nagaBossSpawned = false;

  // 5. Brahmastra 4-Stage Trial State
  private brahmaAltarPos = new THREE.Vector3();
  private brahmaAltarOrb!: THREE.Mesh;
  public brahmaTrialStage: BrahmaTrialStage = 0;
  private brahmaStage1Wave = 0;
  private brahmaSeals: BrahmaSealTarget[] = [];
  private brahmaSealOrderIdx = 0;
  private brahmaStage2Timer = 0;
  private brahmaBossId: string | null = null;
  private enemySummonActive = false;
  private enemySummonTimer = 0;
  private readonly enemySummonTotal = 5.0;
  private enemySummonInterruptDmg = 0;
  private enemySummonCooldown = 4.0;
  private enemySummonWarningRing!: THREE.Mesh;
  public darknessOverride = 0; // 0..1 for Stage 3 darkness gauntlet
  public noHealActive = false;

  private questHintOverride: string | null = null;
  private questHintTimer = 0;

  constructor(scene: THREE.Scene, vfx: AstraVfxManager, bridge: QuestEngineBridge) {
    this.scene = scene;
    this.vfx = vfx;
    this.bridge = bridge;
    this.loadProgress();
    this.scene.add(this.rootGroup);
    this.buildAllChallengeProps();
  }

  private loadProgress(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(QUEST_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SavedQuestData>;
      if (parsed.unlocked) {
        for (const id of ASTRA_ORDER) {
          this.unlocked[id] = Boolean(parsed.unlocked[id]);
        }
      }
      this.introSeen = Boolean(parsed.introSeen);
      if (parsed.selectedAstra && this.unlocked[parsed.selectedAstra]) {
        this.selectedAstra = parsed.selectedAstra;
      } else {
        this.selectedAstra = this.firstUnlockedAstra();
      }
    } catch {
      // Ignore corrupt storage
    }
  }

  public saveProgress(): void {
    if (typeof window === 'undefined') return;
    try {
      const payload: SavedQuestData = {
        unlocked: this.unlocked,
        introSeen: this.introSeen,
        selectedAstra: this.selectedAstra,
      };
      window.localStorage.setItem(QUEST_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota / restriction
    }
  }

  private firstUnlockedAstra(): AstraId | null {
    for (const id of ASTRA_ORDER) {
      if (this.unlocked[id]) return id;
    }
    return null;
  }

  public markIntroSeen(): void {
    this.introSeen = true;
    this.saveProgress();
  }

  public dismissUnlockPopup(): void {
    this.activeUnlockPopup = null;
  }

  public selectAstra(id: AstraId | null): boolean {
    if (id === null) {
      this.selectedAstra = null;
      this.saveProgress();
      return true;
    }
    if (!this.unlocked[id]) return false;
    this.selectedAstra = id;
    this.saveProgress();
    return true;
  }

  public getNextQuestAstraId(): AstraId | null {
    for (const id of ASTRA_ORDER) {
      if (!this.unlocked[id]) return id;
    }
    return null;
  }

  public areAllFirstFourUnlocked(): boolean {
    return (
      this.unlocked.AGNEYASTRA &&
      this.unlocked.VARUNASTRA &&
      this.unlocked.VAYAVYASTRA &&
      this.unlocked.NAGASTRA
    );
  }

  public getObjectiveTarget(): { astraId: AstraId | null; x: number; y: number; z: number; colorHex: number } | null {
    const nextId = this.getNextQuestAstraId();
    if (!nextId) return null;

    if (nextId === 'AGNEYASTRA') {
      const p = ASTRA_CHALLENGE_LOCATIONS.AGNEYASTRA_TEMPLE;
      return { astraId: nextId, x: p.x, y: groundHeightAt(p.x, p.z), z: p.z, colorHex: ASTRA_CONFIG.AGNEYASTRA.primaryHex };
    }
    if (nextId === 'VARUNASTRA') {
      const p = ASTRA_CHALLENGE_LOCATIONS.VARUNASTRA_SHRINE;
      return { astraId: nextId, x: p.x, y: -6.2, z: p.z, colorHex: ASTRA_CONFIG.VARUNASTRA.primaryHex };
    }
    if (nextId === 'VAYAVYASTRA') {
      if (this.windTrialActive) {
        return {
          astraId: nextId,
          x: this.vayuPedestalPos.x,
          y: this.vayuPedestalPos.y,
          z: this.vayuPedestalPos.z,
          colorHex: ASTRA_CONFIG.VAYAVYASTRA.primaryHex,
        };
      }
      const p = ASTRA_CHALLENGE_LOCATIONS.VAYAVYASTRA_SPIRE;
      return { astraId: nextId, x: p.x, y: groundHeightAt(p.x, p.z), z: p.z, colorHex: ASTRA_CONFIG.VAYAVYASTRA.primaryHex };
    }
    if (nextId === 'NAGASTRA') {
      const p = ASTRA_CHALLENGE_LOCATIONS.NAGASTRA_TEMPLE;
      return { astraId: nextId, x: p.x, y: groundHeightAt(p.x, p.z), z: p.z, colorHex: ASTRA_CONFIG.NAGASTRA.primaryHex };
    }
    return {
      astraId: 'BRAHMASTRA',
      x: this.brahmaAltarPos.x,
      y: this.brahmaAltarPos.y,
      z: this.brahmaAltarPos.z,
      colorHex: ASTRA_CONFIG.BRAHMASTRA.primaryHex,
    };
  }

  /** Walkable elevated sky platform support for Vayavyastra Spire. */
  public getExtraFloorHeightAt(x: number, z: number, refY: number): number | null {
    let best: number | null = null;
    for (let i = 0; i < this.skyPlatforms.length; i++) {
      const plat = this.skyPlatforms[i];
      if (
        Math.abs(x - plat.x) <= plat.halfW &&
        Math.abs(z - plat.z) <= plat.halfD &&
        plat.y <= refY + 1.4
      ) {
        if (best === null || plat.y > best) best = plat.y;
      }
    }
    return best;
  }

  private setTempHint(msg: string, duration = 3.2): void {
    this.questHintOverride = msg;
    this.questHintTimer = duration;
  }

  public getPromptHint(): string | null {
    if (this.questHintTimer > 0 && this.questHintOverride) {
      return this.questHintOverride;
    }
    const p = this.bridge.getPlayerPos();
    if (!this.unlocked.NAGASTRA) {
      if (Math.hypot(p.x - this.chandraAltarPos.x, p.z - this.chandraAltarPos.z) < 3.6 && this.bridge.getNightFactor() < 0.45) {
        return 'Chandra Moon-Dial — Press E to invoke Nightfall & open Serpent Temple';
      }
    }
    if (!this.unlocked.VARUNASTRA) {
      for (let i = 0; i < this.pearls.length; i++) {
        const pr = this.pearls[i];
        if (!pr.activated && Math.hypot(p.x - pr.x, p.z - pr.z) < 2.8 && Math.abs(p.y - pr.y) < 2.6) {
          return 'Glowing Pearl Switch — Press E or shoot to activate';
        }
      }
    }
    if (!this.unlocked.BRAHMASTRA && this.brahmaTrialStage === 0) {
      if (Math.hypot(p.x - this.brahmaAltarPos.x, p.z - this.brahmaAltarPos.z) < 3.8) {
        return this.areAllFirstFourUnlocked()
          ? 'Central Sanctum — Press E to begin the Brahmastra Final Trial'
          : 'Brahmastra Sanctum Sealed — Collect all 4 elemental Astras first';
      }
    }
    return null;
  }

  private unlockAstra(id: AstraId): void {
    if (this.unlocked[id]) return;
    this.unlocked[id] = true;
    this.selectedAstra = id;
    const cfg = ASTRA_CONFIG[id];
    this.activeUnlockPopup = {
      id,
      name: cfg.name,
      oneLineStory: cfg.oneLineStory,
    };
    this.unlockPopupTimer = 6.5;
    this.saveProgress();
    soundEngine.playAstraCollect();
    this.bridge.healPlayer(50);
  }

  private buildAllChallengeProps(): void {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5c4f45, roughness: 0.88 });
    const darkBasaltMat = new THREE.MeshStandardMaterial({ color: 0x262124, roughness: 0.82 });
    const goldTrimMat = new THREE.MeshStandardMaterial({ color: 0xe6b44c, metalness: 0.82, roughness: 0.25 });

    // =========================================================================
    // 1. AGNEYASTRA RUINED FIRE TEMPLE (near Demon Village & Volcanoes)
    // =========================================================================
    const agLoc = ASTRA_CHALLENGE_LOCATIONS.AGNEYASTRA_TEMPLE;
    const agBaseY = groundHeightAt(agLoc.x, agLoc.z);
    const agGroup = new THREE.Group();
    agGroup.position.set(agLoc.x, agBaseY, agLoc.z);
    this.rootGroup.add(agGroup);

    const agPlinth = new THREE.Mesh(new THREE.CylinderGeometry(12.5, 13.8, 0.7, 16), darkBasaltMat);
    agPlinth.position.y = 0.2;
    agPlinth.receiveShadow = true;
    agGroup.add(agPlinth);

    // Ruined charred temple pillars
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const h = 3.2 + (i % 3) * 1.1;
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.95, h, 0.95), stoneMat);
      pil.position.set(Math.cos(a) * 11.2, h * 0.5 + 0.4, Math.sin(a) * 11.2);
      pil.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.06;
      agGroup.add(pil);
    }

    // 4 Ordered Fire Bowls (1..4)
    const bowlOffsets = [
      { dx: -6.2, dz: -5.5 },
      { dx: 6.2, dz: -5.5 },
      { dx: 6.2, dz: 5.5 },
      { dx: -6.2, dz: 5.5 },
    ];
    bowlOffsets.forEach((off, idx) => {
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.78, 1.45, 10), darkBasaltMat);
      ped.position.set(off.dx, 0.9, off.dz);
      agGroup.add(ped);

      const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.45, 0.5, 10), goldTrimMat);
      basin.position.set(off.dx, 1.75, off.dz);
      agGroup.add(basin);

      const flameMesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.48, 1.25, 8),
        new THREE.MeshBasicMaterial({ color: 0xff6a12, transparent: true, opacity: 0.92 })
      );
      flameMesh.position.set(off.dx, 2.5, off.dz);
      flameMesh.visible = false;
      agGroup.add(flameMesh);

      const markerMesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.28, 0),
        new THREE.MeshBasicMaterial({ color: 0xffd24d })
      );
      markerMesh.position.set(off.dx, 3.05, off.dz);
      markerMesh.visible = idx === 0;
      agGroup.add(markerMesh);

      this.fireBowls.push({
        x: agLoc.x + off.dx,
        y: agBaseY + 2.0,
        z: agLoc.z + off.dz,
        lit: false,
        flameMesh,
        markerMesh,
      });
    });

    // 3 Periodic Lava Burst Geysers inside Fire Temple
    [
      { dx: 0, dz: -3.2, ph: 0 },
      { dx: -3.4, dz: 2.8, ph: 1.5 },
      { dx: 3.4, dz: 2.8, ph: 3.0 },
    ].forEach((g) => {
      const ringMesh = new THREE.Mesh(
        new THREE.RingGeometry(0.4, 2.0, 20),
        new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
      );
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.set(g.dx, 0.58, g.dz);
      agGroup.add(ringMesh);

      const colMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.75, 1.15, 6.5, 12),
        new THREE.MeshBasicMaterial({ color: 0xff7718, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending })
      );
      colMesh.position.set(g.dx, 3.6, g.dz);
      colMesh.visible = false;
      agGroup.add(colMesh);

      this.lavaGeysers.push({
        x: agLoc.x + g.dx,
        y: agBaseY + 0.55,
        z: agLoc.z + g.dz,
        phaseOffset: g.ph,
        ringMesh,
        colMesh,
        extinguishedTimer: 0,
      });
    });

    // =========================================================================
    // 2. VARUNASTRA UNDERWATER SHRINE (Deep 20-ft Sarayu River Basin)
    // =========================================================================
    const varLoc = ASTRA_CHALLENGE_LOCATIONS.VARUNASTRA_SHRINE;
    const varFloorY = groundHeightAt(varLoc.x, varLoc.z);
    const varGroup = new THREE.Group();
    varGroup.position.set(varLoc.x, varFloorY, varLoc.z);
    this.rootGroup.add(varGroup);

    const shrineBase = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.6, 8.5), stoneMat);
    shrineBase.position.y = 0.25;
    varGroup.add(shrineBase);

    // Open temple walls + inner sanctum frame
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.8, 0.65), stoneMat);
    backWall.position.set(0, 2.2, -3.5);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.65, 3.8, 7.2), stoneMat);
    leftWall.position.set(-3.4, 2.2, 0);
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.65, 3.8, 7.2), stoneMat);
    rightWall.position.set(3.4, 2.2, 0);
    const roofSlab = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.55, 8.2), stoneMat);
    roofSlab.position.set(0, 4.2, 0);
    varGroup.add(backWall, leftWall, rightWall, roofSlab);

    this.varunaDoorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(5.8, 3.5, 0.45),
      new THREE.MeshBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.72 })
    );
    this.varunaDoorMesh.position.set(0, 2.15, 2.8);
    varGroup.add(this.varunaDoorMesh);

    this.varunaPedestalPos.set(varLoc.x, varFloorY + 1.5, varLoc.z - 1.2);
    this.varunaOrbMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55, 1),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    this.varunaOrbMesh.position.set(0, 1.85, -1.2);
    varGroup.add(this.varunaOrbMesh);

    // 3 Underwater Pearl Switches outside/around shrine
    [
      { dx: -5.8, dy: 1.5, dz: 3.4 },
      { dx: 5.8, dy: 1.6, dz: 3.4 },
      { dx: 0, dy: 2.3, dz: 6.4 },
    ].forEach((pOff) => {
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, pOff.dy, 8), stoneMat);
      stand.position.set(pOff.dx, pOff.dy * 0.5, pOff.dz);
      varGroup.add(stand);

      const pearlMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0x7dd3fc })
      );
      pearlMesh.position.set(pOff.dx, pOff.dy + 0.45, pOff.dz);
      varGroup.add(pearlMesh);

      this.pearls.push({
        x: varLoc.x + pOff.dx,
        y: varFloorY + pOff.dy + 0.45,
        z: varLoc.z + pOff.dz,
        activated: false,
        pearlMesh,
      });
    });

    // =========================================================================
    // 3. VAYAVYASTRA CELESTIAL SKY PLATFORMS & WIND UPDRAFTS
    // =========================================================================
    const vyLoc = ASTRA_CHALLENGE_LOCATIONS.VAYAVYASTRA_SPIRE;
    const vyBaseY = groundHeightAt(vyLoc.x, vyLoc.z);
    const platSpecs = [
      { dx: 0, dz: 0, y: vyBaseY + 0.25, hw: 4.0, hd: 4.0 },
      { dx: -9.5, dz: -5.0, y: vyBaseY + 6.4, hw: 4.2, hd: 4.2 },
      { dx: -18.5, dz: 3.5, y: vyBaseY + 12.6, hw: 4.2, hd: 4.2 },
      { dx: -26.5, dz: -5.5, y: vyBaseY + 18.8, hw: 4.2, hd: 4.2 },
      { dx: -34.5, dz: 0.0, y: vyBaseY + 24.8, hw: 5.0, hd: 5.0 },
    ];
    platSpecs.forEach((ps, idx) => {
      const wx = vyLoc.x + ps.dx;
      const wz = vyLoc.z + ps.dz;
      this.skyPlatforms.push({ x: wx, z: wz, y: ps.y, halfW: ps.hw, halfD: ps.hd });

      const slab = new THREE.Mesh(
        new THREE.CylinderGeometry(ps.hw * 1.1, ps.hw * 0.85, 0.85, 8),
        idx === platSpecs.length - 1 ? goldTrimMat : stoneMat
      );
      slab.position.set(wx, ps.y - 0.42, wz);
      slab.receiveShadow = true;
      this.rootGroup.add(slab);

      // Updraft column launching from platform i -> i+1
      if (idx < platSpecs.length - 1) {
        const nextP = platSpecs[idx + 1];
        const ux = wx + (nextP.dx - ps.dx) * 0.34;
        const uz = wz + (nextP.dz - ps.dz) * 0.34;
        const ringGroup = new THREE.Group();
        ringGroup.position.set(ux, ps.y, uz);

        const col = new THREE.Mesh(
          new THREE.CylinderGeometry(2.2, 2.2, nextP.y - ps.y + 3.2, 12, 1, true),
          new THREE.MeshBasicMaterial({
            color: 0x6ee7b7,
            transparent: true,
            opacity: 0.24,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        col.position.y = (nextP.y - ps.y + 3.2) * 0.5;
        ringGroup.add(col);
        this.rootGroup.add(ringGroup);

        this.windUpdrafts.push({
          x: ux,
          y: ps.y,
          z: uz,
          topY: nextP.y + 1.8,
          radius: 2.75,
          ringGroup,
        });
      }
    });
    const lastPlat = platSpecs[platSpecs.length - 1];
    this.vayuPedestalPos.set(vyLoc.x + lastPlat.dx, lastPlat.y + 1.4, vyLoc.z + lastPlat.dz);
    this.vayuOrbMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.65, 1),
      new THREE.MeshBasicMaterial({ color: 0x6ee7b7 })
    );
    this.vayuOrbMesh.position.copy(this.vayuPedestalPos);
    this.rootGroup.add(this.vayuOrbMesh);

    // =========================================================================
    // 4. NAGASTRA NIGHT SERPENT TEMPLE + CHANDRA MOON-DIAL
    // =========================================================================
    const ngLoc = ASTRA_CHALLENGE_LOCATIONS.NAGASTRA_TEMPLE;
    const ngBaseY = groundHeightAt(ngLoc.x, ngLoc.z);
    const ngGroup = new THREE.Group();
    ngGroup.position.set(ngLoc.x, ngBaseY, ngLoc.z);
    this.rootGroup.add(ngGroup);

    const ngFloor = new THREE.Mesh(new THREE.CylinderGeometry(12, 13, 0.6, 12), darkBasaltMat);
    ngFloor.position.y = 0.2;
    ngGroup.add(ngFloor);

    // Serpent temple curved sanctuary walls with East-facing doorway
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      if (Math.cos(a) > 0.72) continue; // East entrance gap
      const wall = new THREE.Mesh(new THREE.BoxGeometry(2.6, 4.6, 1.2), darkBasaltMat);
      wall.position.set(Math.cos(a) * 10.5, 2.4, Math.sin(a) * 10.5);
      wall.rotation.y = -a + Math.PI / 2;
      ngGroup.add(wall);
    }

    this.nagaGateMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 4.5, 7.6),
      new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.65 })
    );
    this.nagaGateMesh.position.set(10.2, 2.3, 0);
    ngGroup.add(this.nagaGateMesh);

    // Chandra Moon-Dial outside east entrance
    this.chandraAltarPos.set(ngLoc.x + 14.5, groundHeightAt(ngLoc.x + 14.5, ngLoc.z), ngLoc.z);
    const dialPed = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 1.3, 10), stoneMat);
    dialPed.position.set(14.5, 0.7, 0);
    const moonOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xcbd5ff })
    );
    moonOrb.position.set(14.5, 1.75, 0);
    ngGroup.add(dialPed, moonOrb);

    // =========================================================================
    // 5. BRAHMASTRA 4-STAGE FINAL TRIAL SANCTUM (Central Mahadev Courtyard)
    // =========================================================================
    const brLoc = ASTRA_CHALLENGE_LOCATIONS.BRAHMASTRA_ALTAR;
    const brBaseY = groundHeightAt(brLoc.x, brLoc.z);
    this.brahmaAltarPos.set(brLoc.x, brBaseY, brLoc.z);

    const brPed = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 1.15, 12), goldTrimMat);
    brPed.position.set(brLoc.x, brBaseY + 0.58, brLoc.z);
    this.rootGroup.add(brPed);

    this.brahmaAltarOrb = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55, 1),
      new THREE.MeshBasicMaterial({ color: 0xffd27a })
    );
    this.brahmaAltarOrb.position.set(brLoc.x, brBaseY + 1.85, brLoc.z);
    this.rootGroup.add(this.brahmaAltarOrb);

    // Stage 2 Elemental Order Seal Targets
    const sealOrder: AstraId[] = ['AGNEYASTRA', 'VARUNASTRA', 'VAYAVYASTRA', 'NAGASTRA'];
    const sealOffsets = [
      { dx: -10, dz: 10 },
      { dx: 10, dz: 10 },
      { dx: 10, dz: -6 },
      { dx: -10, dz: -6 },
    ];
    sealOrder.forEach((aId, idx) => {
      const sx = brLoc.x + sealOffsets[idx].dx;
      const sz = brLoc.z + sealOffsets[idx].dz;
      const sy = groundHeightAt(sx, sz);
      const pillarGroup = new THREE.Group();
      pillarGroup.position.set(sx, sy, sz);

      const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 2.2, 8), darkBasaltMat);
      pil.position.y = 1.1;
      const orbMesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.65, 1),
        new THREE.MeshBasicMaterial({ color: ASTRA_CONFIG[aId].primaryHex })
      );
      orbMesh.position.y = 2.85;
      pillarGroup.add(pil, orbMesh);
      pillarGroup.visible = false;
      this.rootGroup.add(pillarGroup);

      this.brahmaSeals.push({
        astraId: aId,
        x: sx,
        y: sy + 2.85,
        z: sz,
        hit: false,
        pillarGroup,
        orbMesh,
      });
    });

    // Enemy Brahmastra Ground Warning Circle
    this.enemySummonWarningRing = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 11.2, 32),
      new THREE.MeshBasicMaterial({
        color: 0xff2222,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.enemySummonWarningRing.rotation.x = -Math.PI / 2;
    this.enemySummonWarningRing.visible = false;
    this.rootGroup.add(this.enemySummonWarningRing);
  }

  public handleInteract(): boolean {
    const p = this.bridge.getPlayerPos();

    // 1. Varunastra Underwater Pearls
    if (!this.unlocked.VARUNASTRA) {
      for (let i = 0; i < this.pearls.length; i++) {
        const pr = this.pearls[i];
        if (!pr.activated && Math.hypot(p.x - pr.x, p.z - pr.z) < 3.0 && Math.abs(p.y - pr.y) < 3.0) {
          this.activatePearl(i);
          return true;
        }
      }
    }

    // 2. Nagastra Chandra Moon-Dial
    if (!this.unlocked.NAGASTRA && Math.hypot(p.x - this.chandraAltarPos.x, p.z - this.chandraAltarPos.z) < 4.0) {
      this.bridge.advanceToNight();
      this.setTempHint('Nightfall descends — The Serpent Temple gate opens!', 3.6);
      soundEngine.playMissionChime();
      return true;
    }

    // 3. Brahmastra Final Trial Altar
    if (!this.unlocked.BRAHMASTRA && this.brahmaTrialStage === 0) {
      if (Math.hypot(p.x - this.brahmaAltarPos.x, p.z - this.brahmaAltarPos.z) < 4.2) {
        if (!this.areAllFirstFourUnlocked()) {
          this.setTempHint('Collect Agneyastra, Varunastra, Vayavyastra, and Nagastra first!', 3.5);
          return true;
        }
        this.startBrahmaTrialStage1();
        return true;
      }
    }

    return false;
  }

  private activatePearl(idx: number): void {
    const pr = this.pearls[idx];
    if (pr.activated) return;
    pr.activated = true;
    (pr.pearlMesh.material as THREE.MeshBasicMaterial).color.setHex(0x34d399);
    soundEngine.playMissionChime();
    const litCount = this.pearls.filter((x) => x.activated).length;
    if (litCount >= this.pearls.length) {
      this.varunaDoorOpen = true;
      this.varunaDoorMesh.visible = false;
      this.setTempHint('Sunken Shrine Door opened! Swim inside to claim Varunastra.', 4.5);
    } else {
      this.setTempHint(`Pearl ${litCount}/3 awakened!`, 2.5);
    }
  }

  public onPlayerArrowHitPoint(x: number, y: number, z: number, astraUsed: AstraId | null): boolean {
    // 1. Agneyastra Fire Bowls (any arrow works)
    if (!this.unlocked.AGNEYASTRA) {
      for (let i = 0; i < this.fireBowls.length; i++) {
        const fb = this.fireBowls[i];
        if (Math.hypot(x - fb.x, z - fb.z) < 2.2 && Math.abs(y - fb.y) < 2.4) {
          if (i === this.fireStep) {
            fb.lit = true;
            fb.flameMesh.visible = true;
            fb.markerMesh.visible = false;
            this.fireStep++;
            soundEngine.playMissionChime();
            if (this.fireStep < this.fireBowls.length) {
              this.fireBowls[this.fireStep].markerMesh.visible = true;
              this.setTempHint(`Fire Bowl ${this.fireStep}/4 lit!`, 2.2);
            } else {
              this.unlockAstra('AGNEYASTRA');
            }
          } else if (!fb.lit) {
            // Wrong sequence -> reset bowls
            this.fireStep = 0;
            this.fireBowls.forEach((b, bi) => {
              b.lit = false;
              b.flameMesh.visible = false;
              b.markerMesh.visible = bi === 0;
            });
            soundEngine.playHit();
            this.setTempHint('Wrong order! Follow the golden rune marker.', 2.8);
          }
          return true;
        }
      }
    }

    // 2. Varunastra Pearls can also be shot
    if (!this.unlocked.VARUNASTRA) {
      for (let i = 0; i < this.pearls.length; i++) {
        const pr = this.pearls[i];
        if (!pr.activated && Math.hypot(x - pr.x, z - pr.z) < 1.8 && Math.abs(y - pr.y) < 1.8) {
          this.activatePearl(i);
          return true;
        }
      }
    }

    // 3. Brahmastra Trial Stage 2 Elemental Order Puzzle
    if (this.brahmaTrialStage === 2) {
      for (let i = 0; i < this.brahmaSeals.length; i++) {
        const seal = this.brahmaSeals[i];
        if (Math.hypot(x - seal.x, z - seal.z) < 2.4 && Math.abs(y - seal.y) < 3.0) {
          const expected = this.brahmaSeals[this.brahmaSealOrderIdx];
          if (seal === expected && astraUsed === expected.astraId) {
            seal.hit = true;
            seal.pillarGroup.visible = false;
            this.brahmaSealOrderIdx++;
            soundEngine.playMissionChime();
            if (this.brahmaSealOrderIdx >= this.brahmaSeals.length) {
              this.startBrahmaTrialStage3();
            }
          } else {
            // Wrong order or wrong astra -> reset sequence + punishing backlash
            this.brahmaSealOrderIdx = 0;
            this.brahmaSeals.forEach((s) => {
              s.hit = false;
              s.pillarGroup.visible = true;
            });
            this.bridge.damagePlayer(Math.round(14 * BRAHMASTRA_TRIAL_DIFFICULTY), 0);
            this.setTempHint(
              `Wrong elemental seal! Strike ${ASTRA_CONFIG[this.brahmaSeals[0].astraId].name} first!`,
              3.0
            );
          }
          return true;
        }
      }
    }

    return false;
  }

  public onWaterWaveImpact(x: number, z: number, radius: number): void {
    // Extinguish lava bursts nearby for 5s
    for (let i = 0; i < this.lavaGeysers.length; i++) {
      const lg = this.lavaGeysers[i];
      if (Math.hypot(lg.x - x, lg.z - z) <= radius + 1.5) {
        lg.extinguishedTimer = 5.0;
        lg.colMesh.visible = false;
      }
    }
  }

  public onPlayerDamagedEnemy(enemyId: string, damage: number): void {
    if (this.brahmaTrialStage === 4 && this.enemySummonActive && enemyId === this.brahmaBossId) {
      this.enemySummonInterruptDmg += damage;
      if (this.enemySummonInterruptDmg >= 55) {
        // Interrupted enemy Brahmastra summon!
        this.enemySummonActive = false;
        this.enemySummonWarningRing.visible = false;
        this.enemySummonCooldown = 11.0;
        this.vfx.setStormCyclone(0, this.brahmaAltarPos.x, this.brahmaAltarPos.z, 0);
        this.bridge.stunEnemyById(enemyId, 3.2);
        soundEngine.playAstraCollect();
        this.setTempHint('Maha-Asura’s Brahmastra interrupted! Strike while stunned!', 3.2);
      }
    }
  }

  private startBrahmaTrialStage1(): void {
    this.brahmaTrialStage = 1;
    this.brahmaStage1Wave = 1;
    this.noHealActive = true;
    this.darknessOverride = 0;
    this.enemySummonActive = false;
    this.bridge.clearTaggedEnemies('brahma_trial_');
    this.spawnBrahmaWave(1);
    soundEngine.playMissionChime();
    this.setTempHint('Stage 1/4: No-Heal Demon Gauntlet!', 3.8);
  }

  private spawnBrahmaWave(wave: number): void {
    const cx = 0;
    const cz = 18;
    const count = wave === 1 ? 4 : 5;
    const variants: DemonVariant[] = ['BRUTE_HUMAN', 'SORCERER_HUMAN', 'BOAR_DEMON', 'SHADOW_GHOST'];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      this.bridge.spawnTrialEnemy(
        cx + Math.cos(a) * 14,
        cz + Math.sin(a) * 14,
        wave === 2 && i === 0,
        variants[i % variants.length],
        1.45 * BRAHMASTRA_TRIAL_DIFFICULTY,
        `brahma_trial_s1_${i}`
      );
    }
  }

  private startBrahmaTrialStage2(): void {
    this.brahmaTrialStage = 2;
    this.noHealActive = false;
    this.brahmaSealOrderIdx = 0;
    this.brahmaStage2Timer = Math.max(16, Math.round(32 / BRAHMASTRA_TRIAL_DIFFICULTY));
    this.brahmaSeals.forEach((s) => {
      s.hit = false;
      s.pillarGroup.visible = true;
    });
    soundEngine.playMissionChime();
    this.setTempHint('Stage 2/4: Shoot Fire -> Water -> Wind -> Serpent Seals in order!', 4.5);
  }

  private startBrahmaTrialStage3(): void {
    this.brahmaTrialStage = 3;
    this.darknessOverride = 1.0;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.5;
      this.bridge.spawnTrialEnemy(
        Math.cos(a) * 16,
        18 + Math.sin(a) * 16,
        false,
        'SHADOW_GHOST',
        1.6 * BRAHMASTRA_TRIAL_DIFFICULTY,
        `brahma_trial_s3_${i}`
      );
    }
    soundEngine.playCycloneWind(2.0);
    this.setTempHint('Stage 3/4: Survive the Shadow Darkness & slay the Stalkers!', 4.0);
  }

  private startBrahmaTrialStage4(): void {
    this.brahmaTrialStage = 4;
    this.darknessOverride = 0.25;
    this.enemySummonActive = false;
    this.enemySummonCooldown = 5.0;
    this.brahmaBossId = this.bridge.spawnTrialEnemy(
      0,
      28,
      true,
      'BRUTE_HUMAN',
      3.8 * BRAHMASTRA_TRIAL_DIFFICULTY,
      'brahma_trial_boss',
      1.65
    );
    soundEngine.playThunderClap(0.8);
    this.setTempHint('Stage 4/4: Defeat Maha-Asura! Interrupt his Brahmastra summon!', 4.5);
  }

  public failBrahmaTrial(reason: string): void {
    if (this.brahmaTrialStage === 0) return;
    this.brahmaTrialStage = 0;
    this.noHealActive = false;
    this.darknessOverride = 0;
    this.enemySummonActive = false;
    this.enemySummonWarningRing.visible = false;
    this.brahmaSeals.forEach((s) => (s.pillarGroup.visible = false));
    this.bridge.clearTaggedEnemies('brahma_trial_');
    this.vfx.setStormCyclone(0, 0, 0, 0);
    this.setTempHint(`Trial Failed: ${reason} Return to Central Sanctum to retry.`, 4.5);
  }

  public update(dt: number, elapsed: number): void {
    if (this.questHintTimer > 0) this.questHintTimer = Math.max(0, this.questHintTimer - dt);
    if (this.unlockPopupTimer > 0) {
      this.unlockPopupTimer -= dt;
      if (this.unlockPopupTimer <= 0) this.activeUnlockPopup = null;
    }

    const p = this.bridge.getPlayerPos();

    // Update Active Objective Beacon
    const obj = this.getObjectiveTarget();
    if (obj) {
      this.vfx.setObjectiveBeacon(true, obj.x, obj.y, obj.z, obj.colorHex);
    } else {
      this.vfx.setObjectiveBeacon(false, 0, 0, 0, 0xffd27a);
    }

    // 1. Update Agneyastra Fire Temple Lava Bursts
    this.lavaDamageCooldown = Math.max(0, this.lavaDamageCooldown - dt);
    if (!this.unlocked.AGNEYASTRA) {
      for (let i = 0; i < this.lavaGeysers.length; i++) {
        const lg = this.lavaGeysers[i];
        if (lg.extinguishedTimer > 0) {
          lg.extinguishedTimer -= dt;
          lg.colMesh.visible = false;
          continue;
        }
        const cycle = (elapsed + lg.phaseOffset) % 4.5;
        const warning = cycle >= 2.2 && cycle < 3.4;
        const erupting = cycle >= 3.4;
        lg.ringMesh.visible = warning || erupting;
        lg.ringMesh.scale.setScalar(erupting ? 1.15 : 0.65 + ((cycle - 2.2) / 1.2) * 0.45);
        lg.colMesh.visible = erupting;
        if (erupting && this.lavaDamageCooldown <= 0 && Math.hypot(p.x - lg.x, p.z - lg.z) < 2.15 && Math.abs(p.y - lg.y) < 5.5) {
          this.lavaDamageCooldown = 0.85;
          this.bridge.damagePlayer(14, 0);
        }
      }
      for (let i = 0; i < this.fireBowls.length; i++) {
        if (this.fireBowls[i].markerMesh.visible) {
          this.fireBowls[i].markerMesh.rotation.y = elapsed * 2.6;
        }
      }
    }

    // 2. Update Varunastra Underwater Shrine & Breath Meter
    if (!this.unlocked.VARUNASTRA) {
      const distShrine = Math.hypot(
        p.x - ASTRA_CHALLENGE_LOCATIONS.VARUNASTRA_SHRINE.x,
        p.z - ASTRA_CHALLENGE_LOCATIONS.VARUNASTRA_SHRINE.z
      );
      const submergedDeep = p.swimming && p.y < -1.9 && distShrine < 34;
      if (submergedDeep || this.underwaterBreath !== null) {
        if (this.underwaterBreath === null) this.underwaterBreath = 100;
        if (p.swimming && p.y < -1.75) {
          this.underwaterBreath = Math.max(0, this.underwaterBreath - dt * 3.8);
          if (this.underwaterBreath <= 0) {
            this.drownTick += dt;
            if (this.drownTick >= 1.1) {
              this.drownTick = 0;
              this.bridge.damagePlayer(9, 0);
            }
          }
        } else {
          this.underwaterBreath = Math.min(100, this.underwaterBreath + dt * 28);
          if (this.underwaterBreath >= 99.5 && distShrine > 36) {
            this.underwaterBreath = null;
          }
        }
      }

      this.varunaOrbMesh.rotation.y = elapsed * 1.8;
      if (this.varunaDoorOpen && Math.hypot(p.x - this.varunaPedestalPos.x, p.z - this.varunaPedestalPos.z) < 2.6 && Math.abs(p.y - this.varunaPedestalPos.y) < 3.0) {
        this.underwaterBreath = null;
        this.varunaOrbMesh.visible = false;
        this.unlockAstra('VARUNASTRA');
      }
    } else {
      this.underwaterBreath = null;
    }

    // 3. Update Vayavyastra Sky Platforms & Wind Updrafts
    if (!this.unlocked.VAYAVYASTRA) {
      this.vayuOrbMesh.rotation.y = elapsed * 2.4;
      const startPlat = this.skyPlatforms[0];
      if (!this.windTrialActive && Math.hypot(p.x - startPlat.x, p.z - startPlat.z) < 3.6 && Math.abs(p.y - startPlat.y) < 2.5) {
        this.windTrialActive = true;
        this.windTrialTimer = 42.0;
        soundEngine.playCycloneWind(1.5);
        this.setTempHint('Celestial Wind Ascent started! Ride updrafts to the summit!', 3.2);
      }

      for (let i = 0; i < this.windUpdrafts.length; i++) {
        const wd = this.windUpdrafts[i];
        wd.ringGroup.rotation.y += dt * 4.0;
        if (Math.hypot(p.x - wd.x, p.z - wd.z) <= wd.radius && p.y >= wd.y - 1.5 && p.y <= wd.topY) {
          this.bridge.setPlayerVelY(14.5);
          if (!this.windTrialActive) {
            this.windTrialActive = true;
            this.windTrialTimer = 42.0;
          }
        }
      }

      if (this.windTrialActive) {
        this.windTrialTimer -= dt;
        if (Math.hypot(p.x - this.vayuPedestalPos.x, p.z - this.vayuPedestalPos.z) < 3.4 && Math.abs(p.y - this.vayuPedestalPos.y) < 3.5) {
          this.windTrialActive = false;
          this.vayuOrbMesh.visible = false;
          this.unlockAstra('VAYAVYASTRA');
        } else if (this.windTrialTimer <= 0) {
          this.windTrialActive = false;
          this.setTempHint('Sky Timer expired! Step onto the Wind Seal to retry.', 3.2);
        }
      }
    }

    // 4. Update Nagastra Night Temple & Takshaka Naga Guardian Boss
    if (!this.unlocked.NAGASTRA) {
      const isNight = this.bridge.getNightFactor() >= 0.45;
      this.nagaDoorOpen = isNight;
      this.nagaGateMesh.visible = !isNight;
      const ngLoc = ASTRA_CHALLENGE_LOCATIONS.NAGASTRA_TEMPLE;
      if (isNight && !this.nagaBossSpawned && Math.hypot(p.x - ngLoc.x, p.z - ngLoc.z) < 16) {
        this.nagaBossSpawned = true;
        this.nagaBossId = this.bridge.spawnTrialEnemy(
          ngLoc.x - 3.5,
          ngLoc.z,
          true,
          'SORCERER_HUMAN',
          2.6,
          'nagastra_takshaka',
          1.45
        );
        soundEngine.playThunderClap(0.6);
        this.setTempHint('Takshaka Naga Guardian awakens in the dark shrine!', 3.6);
      }
      if (this.nagaBossSpawned && this.nagaBossId) {
        const info = this.bridge.getTaggedEnemyInfo('nagastra_takshaka');
        if (!info) {
          this.unlockAstra('NAGASTRA');
        }
      }
    } else {
      this.nagaGateMesh.visible = false;
    }

    // 5. Update Brahmastra 4-Stage Trial
    this.brahmaAltarOrb.visible = !this.unlocked.BRAHMASTRA && this.brahmaTrialStage === 0;
    this.brahmaAltarOrb.rotation.y = elapsed * 1.9;
    if (this.brahmaTrialStage > 0) {
      // Leaving arena forfeits no-checkpoint trial
      if (Math.hypot(p.x, p.z - 18) > 58) {
        this.failBrahmaTrial('Left the Central Temple Trial.');
        return;
      }

      if (this.brahmaTrialStage === 1) {
        if (this.bridge.countAliveTaggedEnemies('brahma_trial_s1_') === 0) {
          if (this.brahmaStage1Wave === 1) {
            this.brahmaStage1Wave = 2;
            this.spawnBrahmaWave(2);
            this.setTempHint('Wave 2/2 incoming — No healing!', 3.0);
          } else {
            this.startBrahmaTrialStage2();
          }
        }
      } else if (this.brahmaTrialStage === 2) {
        this.brahmaStage2Timer -= dt;
        this.brahmaSeals.forEach((s) => {
          if (s.pillarGroup.visible) s.orbMesh.rotation.y = elapsed * 2.5;
        });
        if (this.brahmaStage2Timer <= 0) {
          this.failBrahmaTrial('Elemental seal timer expired!');
        }
      } else if (this.brahmaTrialStage === 3) {
        if (this.bridge.countAliveTaggedEnemies('brahma_trial_s3_') === 0) {
          this.startBrahmaTrialStage4();
        }
      } else if (this.brahmaTrialStage === 4) {
        const boss = this.bridge.getTaggedEnemyInfo('brahma_trial_boss');
        if (!boss) {
          this.brahmaTrialStage = 0;
          this.darknessOverride = 0;
          this.enemySummonActive = false;
          this.enemySummonWarningRing.visible = false;
          this.vfx.setStormCyclone(0, 0, 0, 0);
          this.unlockAstra('BRAHMASTRA');
        } else {
          if (!this.enemySummonActive && boss.hp < boss.maxHp * 0.72) {
            this.enemySummonCooldown -= dt;
            if (this.enemySummonCooldown <= 0) {
              this.enemySummonActive = true;
              this.enemySummonTimer = this.enemySummonTotal;
              this.enemySummonInterruptDmg = 0;
              this.enemySummonWarningRing.visible = true;
              this.enemySummonWarningRing.position.set(boss.x, boss.y + 0.14, boss.z);
              this.vfx.setStormCyclone(0.85, boss.x, boss.z, 0.5);
              soundEngine.playCycloneWind(3.5);
            }
          }
          if (this.enemySummonActive) {
            this.enemySummonTimer -= dt;
            this.enemySummonWarningRing.position.set(boss.x, boss.y + 0.14, boss.z);
            const pulse = 0.8 + Math.sin(elapsed * 14) * 0.2;
            this.enemySummonWarningRing.scale.setScalar(pulse);
            if (this.enemySummonTimer <= 0) {
              // Boss unleashed enemy Brahmastra blast!
              this.enemySummonActive = false;
              this.enemySummonWarningRing.visible = false;
              this.enemySummonCooldown = 12.0;
              this.vfx.setStormCyclone(0, boss.x, boss.z, 0);
              this.vfx.spawnBrahmastraBeamAndCrater(
                boss.x,
                boss.y + 38,
                boss.z,
                boss.x,
                boss.y,
                boss.z,
                2.6,
                1.1,
                4.0,
                this.bridge.getParticleScale(),
                this.bridge.getQualityTier()
              );
              soundEngine.playThunderClap(1.0);
              this.bridge.triggerCameraShake(0.95);
              if (Math.hypot(p.x - boss.x, p.z - boss.z) < 12.5) {
                this.bridge.damagePlayer(Math.round(38 * BRAHMASTRA_TRIAL_DIFFICULTY), 20);
              }
            }
          }
        }
      }
    }
  }

  public getEnemySummonWarning(): EnemySummonWarning | null {
    if (!this.enemySummonActive) return null;
    return {
      active: true,
      bossName: 'Maha-Asura Avatar',
      remainingSec: Math.max(0, Number(this.enemySummonTimer.toFixed(1))),
      totalSec: this.enemySummonTotal,
      interrupted: false,
    };
  }

  public buildHudState(): AstraQuestHudState {
    const p = this.bridge.getPlayerPos();
    const nextId = this.getNextQuestAstraId();
    const obj = this.getObjectiveTarget();
    const distM = obj ? Math.round(Math.hypot(obj.x - p.x, obj.z - p.z)) : 0;

    let objectiveTitle = 'All Five Divine Astras Mastered';
    let objectiveDetail = 'Dharma shines eternal across Ayodhya and the Demon Badlands.';
    let challengeSubProgress: string | null = null;
    let challengeTimerSec: number | null = null;

    if (nextId === 'AGNEYASTRA') {
      objectiveTitle = 'Trial of Fire: Agneyastra';
      objectiveDetail = 'Light the 4 ancient fire bowls in rune order near the Eastern Volcanoes.';
      challengeSubProgress = `Fire Bowls: ${this.fireStep}/4`;
    } else if (nextId === 'VARUNASTRA') {
      objectiveTitle = 'Trial of Waters: Varunastra';
      objectiveDetail = 'Dive into the deep Sarayu River & awaken 3 glowing pearls before breath runs out.';
      const lit = this.pearls.filter((x) => x.activated).length;
      challengeSubProgress = this.varunaDoorOpen ? 'Shrine Open — Enter' : `Pearls: ${lit}/3`;
    } else if (nextId === 'VAYAVYASTRA') {
      objectiveTitle = 'Trial of Winds: Vayavyastra';
      objectiveDetail = 'Ascend the Celestial Sky Platforms via wind updrafts before time runs out.';
      if (this.windTrialActive) {
        challengeTimerSec = Math.max(0, Math.ceil(this.windTrialTimer));
        challengeSubProgress = 'Reach Summit';
      }
    } else if (nextId === 'NAGASTRA') {
      objectiveTitle = 'Trial of Serpents: Nagastra';
      objectiveDetail = this.nagaDoorOpen
        ? 'Enter the Night Temple & vanquish Takshaka Naga Guardian.'
        : 'Serpent Temple opens only at night (or use Chandra Moon-Dial outside).';
      challengeSubProgress = this.nagaDoorOpen ? 'Gate Open' : 'Sealed by Day';
    } else if (nextId === 'BRAHMASTRA') {
      objectiveTitle = 'Final Trial: Brahmastra';
      if (this.brahmaTrialStage === 0) {
        objectiveDetail = 'Approach the Central Mahadev Sanctum (No checkpoints between stages).';
      } else if (this.brahmaTrialStage === 1) {
        objectiveDetail = 'Stage 1/4: Vanquish buffed Demon waves (Healing Disabled).';
        challengeSubProgress = `Wave ${this.brahmaStage1Wave}/2`;
      } else if (this.brahmaTrialStage === 2) {
        objectiveDetail = 'Stage 2/4: Strike Fire -> Water -> Wind -> Serpent seals in order!';
        challengeSubProgress = `Seals ${this.brahmaSealOrderIdx}/4`;
        challengeTimerSec = Math.max(0, Math.ceil(this.brahmaStage2Timer));
      } else if (this.brahmaTrialStage === 3) {
        objectiveDetail = 'Stage 3/4: Survive Shadow Darkness & defeat all Stalkers!';
        challengeSubProgress = 'Shadow Gauntlet';
      } else if (this.brahmaTrialStage === 4) {
        objectiveDetail = 'Stage 4/4: Defeat Maha-Asura & interrupt his Brahmastra summon!';
        challengeSubProgress = 'Final Boss';
      }
    }

    const astras: AstraStatusEntry[] = ASTRA_ORDER.map((id) => {
      const cfg = ASTRA_CONFIG[id];
      return {
        id,
        name: cfg.name,
        title: cfg.sanskritTitle,
        unlocked: this.unlocked[id],
        story: cfg.journalStory,
        hint: cfg.journalHint,
      };
    });

    return {
      astras,
      unlockedCount: astras.filter((a) => a.unlocked).length,
      activeAstraId: nextId,
      objectiveTitle,
      objectiveDetail,
      objectiveDistanceM: distM,
      challengeSubProgress,
      challengeTimerSec,
      underwaterBreath: this.underwaterBreath !== null ? Math.round(this.underwaterBreath) : null,
      brahmaTrialStage: this.brahmaTrialStage,
      allCompleted: nextId === null,
    };
  }
}
