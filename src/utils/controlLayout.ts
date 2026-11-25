export type ControlId =
  | 'JOYSTICK'
  | 'FIRE_BOW'
  | 'CHAKRA'
  | 'ASTRA_WHEEL'
  | 'SHOOT_ASTRA'
  | 'JUMP'
  | 'SPRINT'
  | 'STEALTH'
  | 'INTERACT'
  | 'AUTO_DRIVE'
  | 'HERO_SPECIAL'
  | 'FLY_TOGGLE';

export interface ControlPlacement {
  /** Normalized center X coordinate (0..1 of viewport width) */
  nx: number;
  /** Normalized center Y coordinate (0..1 of viewport height) */
  ny: number;
  /** Uniform scale multiplier (0.65..1.85) */
  scale: number;
}

export type ControlLayoutMap = Record<ControlId, ControlPlacement>;

export interface ControlMeta {
  id: ControlId;
  label: string;
  shortLabel: string;
  baseWidth: number;
  baseHeight: number;
  isCircle: boolean;
  minScale: number;
  maxScale: number;
}

export interface ControlPixelRect {
  id: ControlId;
  cx: number;
  cy: number;
  w: number;
  h: number;
  left: number;
  top: number;
  scale: number;
}

export const CONTROL_ORDER: readonly ControlId[] = [
  'JOYSTICK',
  'FIRE_BOW',
  'CHAKRA',
  'ASTRA_WHEEL',
  'SHOOT_ASTRA',
  'JUMP',
  'SPRINT',
  'STEALTH',
  'INTERACT',
  'AUTO_DRIVE',
  'HERO_SPECIAL',
  'FLY_TOGGLE',
] as const;

export const CONTROL_META: Record<ControlId, ControlMeta> = {
  JOYSTICK: {
    id: 'JOYSTICK',
    label: 'Movement Joystick',
    shortLabel: 'Joystick',
    baseWidth: 88,
    baseHeight: 88,
    isCircle: true,
    minScale: 0.65,
    maxScale: 1.85,
  },
  FIRE_BOW: {
    id: 'FIRE_BOW',
    label: 'Bow (Fire)',
    shortLabel: 'Bow',
    baseWidth: 56,
    baseHeight: 40,
    isCircle: false,
    minScale: 0.7,
    maxScale: 1.85,
  },
  CHAKRA: {
    id: 'CHAKRA',
    label: 'Sudarshan Chakra',
    shortLabel: 'Chakra',
    baseWidth: 56,
    baseHeight: 40,
    isCircle: false,
    minScale: 0.7,
    maxScale: 1.85,
  },
  ASTRA_WHEEL: {
    id: 'ASTRA_WHEEL',
    label: 'Divyastra Wheel',
    shortLabel: 'Wheel',
    baseWidth: 58,
    baseHeight: 40,
    isCircle: false,
    minScale: 0.7,
    maxScale: 1.85,
  },
  SHOOT_ASTRA: {
    id: 'SHOOT_ASTRA',
    label: 'Shoot Astra (X)',
    shortLabel: 'Shoot (X)',
    baseWidth: 58,
    baseHeight: 40,
    isCircle: false,
    minScale: 0.7,
    maxScale: 1.85,
  },
  JUMP: {
    id: 'JUMP',
    label: 'Jump',
    shortLabel: 'Jump',
    baseWidth: 56,
    baseHeight: 36,
    isCircle: false,
    minScale: 0.7,
    maxScale: 1.85,
  },
  SPRINT: {
    id: 'SPRINT',
    label: 'Sprint Toggle',
    shortLabel: 'Sprint',
    baseWidth: 56,
    baseHeight: 36,
    isCircle: false,
    minScale: 0.7,
    maxScale: 1.85,
  },
  STEALTH: {
    id: 'STEALTH',
    label: 'Stealth Toggle (C)',
    shortLabel: 'Stealth',
    baseWidth: 118,
    baseHeight: 32,
    isCircle: false,
    minScale: 0.7,
    maxScale: 1.75,
  },
  INTERACT: {
    id: 'INTERACT',
    label: 'Mount / Throne (E)',
    shortLabel: 'Interact',
    baseWidth: 118,
    baseHeight: 30,
    isCircle: false,
    minScale: 0.7,
    maxScale: 1.7,
  },
  AUTO_DRIVE: {
    id: 'AUTO_DRIVE',
    label: 'Auto-Drive (V)',
    shortLabel: 'Auto-Drive',
    baseWidth: 118,
    baseHeight: 30,
    isCircle: false,
    minScale: 0.7,
    maxScale: 1.7,
  },
  HERO_SPECIAL: {
    id: 'HERO_SPECIAL',
    label: 'Hero Power (B)',
    shortLabel: 'Power',
    baseWidth: 62,
    baseHeight: 40,
    isCircle: false,
    minScale: 0.7,
    maxScale: 1.85,
  },
  FLY_TOGGLE: {
    id: 'FLY_TOGGLE',
    label: 'Hanuman Flight (U)',
    shortLabel: 'Fly',
    baseWidth: 62,
    baseHeight: 36,
    isCircle: false,
    minScale: 0.7,
    maxScale: 1.85,
  },
};

const STORAGE_KEY = 'astras_control_layout_landscape_v1';
const SAFE_EDGE_PX = 8;
const MIN_GAP_PX = 4;

export function clampScale(id: ControlId, rawScale: number): number {
  const meta = CONTROL_META[id];
  if (!Number.isFinite(rawScale)) return 1.0;
  return Math.round(Math.max(meta.minScale, Math.min(meta.maxScale, rawScale)) * 20) / 20;
}

export function getViewportDimensions(container?: HTMLElement | null): { w: number; h: number } {
  if (container && container.clientWidth > 0 && container.clientHeight > 0) {
    return {
      w: Math.max(480, Math.round(container.clientWidth)),
      h: Math.max(280, Math.round(container.clientHeight)),
    };
  }
  if (typeof window === 'undefined') return { w: 844, h: 390 };
  const rawW = window.innerWidth || 844;
  const rawH = window.innerHeight || 390;
  return {
    w: Math.max(480, rawW),
    h: Math.max(280, rawH),
  };
}

export function clampControlPlacement(
  id: ControlId,
  placement: ControlPlacement,
  vw: number,
  vh: number
): ControlPlacement {
  const meta = CONTROL_META[id];
  const scale = clampScale(id, placement.scale);
  // Ensure even scaled controls fit inside tight viewports
  const maxFitW = Math.max(0.5, (vw - SAFE_EDGE_PX * 2) / meta.baseWidth);
  const maxFitH = Math.max(0.5, (vh - SAFE_EDGE_PX * 2) / meta.baseHeight);
  const safeScale = Math.min(scale, maxFitW, maxFitH);

  const halfW = (meta.baseWidth * safeScale) * 0.5;
  const halfH = (meta.baseHeight * safeScale) * 0.5;

  const minCx = halfW + SAFE_EDGE_PX;
  const maxCx = Math.max(minCx, vw - halfW - SAFE_EDGE_PX);
  const minCy = halfH + SAFE_EDGE_PX;
  const maxCy = Math.max(minCy, vh - halfH - SAFE_EDGE_PX);

  const rawCx = (Number.isFinite(placement.nx) ? placement.nx : 0.5) * vw;
  const rawCy = (Number.isFinite(placement.ny) ? placement.ny : 0.5) * vh;

  const clampedCx = Math.max(minCx, Math.min(maxCx, rawCx));
  const clampedCy = Math.max(minCy, Math.min(maxCy, rawCy));

  return {
    nx: clampedCx / vw,
    ny: clampedCy / vh,
    scale: Math.round(safeScale * 100) / 100,
  };
}

export function computeControlPixelRect(
  id: ControlId,
  placement: ControlPlacement,
  vw: number,
  vh: number
): ControlPixelRect {
  const clamped = clampControlPlacement(id, placement, vw, vh);
  const meta = CONTROL_META[id];
  const w = meta.baseWidth * clamped.scale;
  const h = meta.baseHeight * clamped.scale;
  const cx = clamped.nx * vw;
  const cy = clamped.ny * vh;
  return {
    id,
    cx,
    cy,
    w,
    h,
    left: Math.round(cx - w * 0.5),
    top: Math.round(cy - h * 0.5),
    scale: clamped.scale,
  };
}

/**
 * Generates ergonomic landscape-mode defaults for horizontally held phones & tablets:
 * - Bottom-left thumb zone: Movement Joystick, Stealth toggle, and contextual Mount/Throne button
 * - Bottom-right thumb zone: 2-column combat & movement cluster with Auto-Drive tucked beside it
 * Keeps a wide center viewport and top HUD corridor completely unobstructed for aiming & camera look.
 */
export function getDefaultControlLayout(
  vw: number,
  vh: number
): ControlLayoutMap {
  const padScale = vh < 380 ? 0.88 : vh < 440 ? 0.94 : 1.0;
  const utilityScale = vh < 380 ? 0.82 : vh < 440 ? 0.88 : 0.94;
  const joyScale = vh < 380 ? 0.96 : vh < 440 ? 1.04 : 1.1;
  const sideMargin = vw >= 720 ? 18 : 12;
  const bottomMargin = vh < 410 ? 12 : 18;
  const rowGap = 6;

  const toPlacement = (
    id: ControlId,
    cx: number,
    cy: number,
    scale = padScale
  ): ControlPlacement =>
    clampControlPlacement(id, { nx: cx / vw, ny: cy / vh, scale }, vw, vh);

  // Left Thumb Zone: Joystick bottom-left, Stealth & Interact cleanly beside it along the lower-left edge
  const joyRadius = 44 * joyScale;
  const joyCx = sideMargin + joyRadius;
  const joyCy = vh - bottomMargin - joyRadius;
  const joyRight = joyCx + joyRadius;

  const stealthHalfW = 59 * utilityScale;
  const stealthHalfH = 16 * utilityScale;
  const interactHalfH = 15 * utilityScale;
  const leftUtilCenterX = joyRight + 10 + stealthHalfW;
  const stealthCy = vh - bottomMargin - stealthHalfH;
  const interactCy = stealthCy - stealthHalfH - rowGap - interactHalfH;

  // Right Thumb Zone: 2-column action pad anchored bottom-right + Auto-Drive beside Jump
  const colWidth = 58 * padScale;
  const colGap = 6 * padScale;
  const col2X = vw - sideMargin - colWidth * 0.5;
  const col1X = col2X - colWidth - colGap;

  const jumpHalfH = 18 * padScale;
  const bowHalfH = 20 * padScale;
  const wheelHalfH = 20 * padScale;
  const autoHalfW = 59 * utilityScale;
  const autoHalfH = 15 * utilityScale;

  const jumpSprintY = vh - bottomMargin - jumpHalfH;
  const bowChakraY = jumpSprintY - jumpHalfH - rowGap - bowHalfH;
  const wheelShootY = bowChakraY - bowHalfH - rowGap - wheelHalfH;
  const autoDriveX = col1X - colWidth * 0.5 - 10 - autoHalfW;
  const autoDriveY = vh - bottomMargin - autoHalfH;
  const heroSpecialHalfW = 31 * padScale;
  const heroSpecialX = col1X - colWidth * 0.5 - colGap - heroSpecialHalfW;
  const heroSpecialY = bowChakraY;
  const flyToggleY = wheelShootY;

  return resolveControlOverlaps(
    {
      JOYSTICK: toPlacement('JOYSTICK', joyCx, joyCy, joyScale),
      STEALTH: toPlacement('STEALTH', leftUtilCenterX, stealthCy, utilityScale),
      INTERACT: toPlacement('INTERACT', leftUtilCenterX, interactCy, utilityScale),
      JUMP: toPlacement('JUMP', col1X, jumpSprintY, padScale),
      SPRINT: toPlacement('SPRINT', col2X, jumpSprintY, padScale),
      FIRE_BOW: toPlacement('FIRE_BOW', col1X, bowChakraY, padScale),
      CHAKRA: toPlacement('CHAKRA', col2X, bowChakraY, padScale),
      ASTRA_WHEEL: toPlacement('ASTRA_WHEEL', col1X, wheelShootY, padScale),
      SHOOT_ASTRA: toPlacement('SHOOT_ASTRA', col2X, wheelShootY, padScale),
      AUTO_DRIVE: toPlacement('AUTO_DRIVE', autoDriveX, autoDriveY, utilityScale),
      HERO_SPECIAL: toPlacement('HERO_SPECIAL', heroSpecialX, heroSpecialY, padScale),
      FLY_TOGGLE: toPlacement('FLY_TOGGLE', heroSpecialX, flyToggleY, padScale),
    },
    null,
    vw,
    vh
  );
}

/**
 * Resolves overlapping control boxes gently while keeping every control
 * strictly confined inside the visible screen. If `pinnedId` is provided,
 * non-pinned controls yield first so the player's dragged button stays put.
 */
export function resolveControlOverlaps(
  layout: ControlLayoutMap,
  pinnedId: ControlId | null,
  vw: number,
  vh: number
): ControlLayoutMap {
  const next: ControlLayoutMap = { ...layout };
  const rects = new Map<ControlId, ControlPixelRect>();
  for (const id of CONTROL_ORDER) {
    next[id] = clampControlPlacement(id, next[id], vw, vh);
    rects.set(id, computeControlPixelRect(id, next[id], vw, vh));
  }

  // Up to 8 lightweight relaxation passes across 10 fixed controls
  for (let pass = 0; pass < 8; pass++) {
    let anyMoved = false;
    for (let i = 0; i < CONTROL_ORDER.length; i++) {
      const idA = CONTROL_ORDER[i];
      const a = rects.get(idA)!;
      for (let j = i + 1; j < CONTROL_ORDER.length; j++) {
        const idB = CONTROL_ORDER[j];
        const b = rects.get(idB)!;

        const overlapX = (a.w + b.w) * 0.5 + MIN_GAP_PX - Math.abs(a.cx - b.cx);
        const overlapY = (a.h + b.h) * 0.5 + MIN_GAP_PX - Math.abs(a.cy - b.cy);
        if (overlapX <= 0 || overlapY <= 0) continue;

        anyMoved = true;
        // Push along axis of least penetration
        let pushAx = 0;
        let pushAy = 0;
        if (overlapX < overlapY) {
          const sign = a.cx <= b.cx ? -1 : 1;
          pushAx = sign * overlapX;
        } else {
          const sign = a.cy <= b.cy ? -1 : 1;
          pushAy = sign * overlapY;
        }

        if (pinnedId === idA) {
          b.cx -= pushAx;
          b.cy -= pushAy;
        } else if (pinnedId === idB) {
          a.cx += pushAx;
          a.cy += pushAy;
        } else {
          a.cx += pushAx * 0.5;
          a.cy += pushAy * 0.5;
          b.cx -= pushAx * 0.5;
          b.cy -= pushAy * 0.5;
        }

        const clampedA = clampControlPlacement(
          idA,
          { nx: a.cx / vw, ny: a.cy / vh, scale: a.scale },
          vw,
          vh
        );
        const clampedB = clampControlPlacement(
          idB,
          { nx: b.cx / vw, ny: b.cy / vh, scale: b.scale },
          vw,
          vh
        );
        next[idA] = clampedA;
        next[idB] = clampedB;
        rects.set(idA, computeControlPixelRect(idA, clampedA, vw, vh));
        rects.set(idB, computeControlPixelRect(idB, clampedB, vw, vh));
      }
    }
    if (!anyMoved) break;
  }

  return next;
}

export function loadControlLayout(vw: number, vh: number): ControlLayoutMap {
  const defaults = getDefaultControlLayout(vw, vh);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Record<ControlId, Partial<ControlPlacement>>>;
    if (!parsed || typeof parsed !== 'object') return defaults;

    const merged: ControlLayoutMap = { ...defaults };
    for (const id of CONTROL_ORDER) {
      const entry = parsed[id];
      if (
        entry &&
        typeof entry.nx === 'number' &&
        typeof entry.ny === 'number' &&
        typeof entry.scale === 'number'
      ) {
        merged[id] = clampControlPlacement(
          id,
          { nx: entry.nx, ny: entry.ny, scale: entry.scale },
          vw,
          vh
        );
      }
    }
    return resolveControlOverlaps(merged, null, vw, vh);
  } catch {
    return defaults;
  }
}

export function saveControlLayout(layout: ControlLayoutMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Ignore storage quota or private-mode restrictions
  }
}

export function clearSavedControlLayout(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}
