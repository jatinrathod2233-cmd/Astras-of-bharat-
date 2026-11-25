import React from 'react';
import { Lock } from 'lucide-react';
import { ASTRA_CONFIG, ASTRA_ORDER } from '../engine/astraConfig';
import { AstraId, AstraStatusEntry } from '../types/world';
import { AstraGlyphSvg } from './AstraIcons';

const WHEEL_SIZE = 236;
const HALF = WHEEL_SIZE / 2;
const INNER_R = 40;
const OUTER_R = 108;
const ICON_R = 74;
const DEAD_ZONE_R = 24;

function polarToCartesian(cx: number, cy: number, r: number, angleRad: number): [number, number] {
  return [cx + r * Math.cos(angleRad), cy + r * Math.sin(angleRad)];
}

function createSlicePath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number
): string {
  const [x1, y1] = polarToCartesian(cx, cy, outerR, startAngle);
  const [x2, y2] = polarToCartesian(cx, cy, outerR, endAngle);
  const [x3, y3] = polarToCartesian(cx, cy, innerR, endAngle);
  const [x4, y4] = polarToCartesian(cx, cy, innerR, startAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `L ${x3.toFixed(2)} ${y3.toFixed(2)}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
    'Z',
  ].join(' ');
}

/**
 * Clamp wheel center inside viewport so all 5 slices remain visible on small mobile screens.
 */
export function clampWheelCenter(
  rawX: number,
  rawY: number,
  viewportW?: number,
  viewportH?: number
): { x: number; y: number } {
  const margin = HALF + 10;
  const vw = viewportW ?? (typeof window !== 'undefined' ? window.innerWidth : 390);
  const vh = viewportH ?? (typeof window !== 'undefined' ? window.innerHeight : 844);
  return {
    x: Math.max(margin, Math.min(vw - margin, rawX)),
    y: Math.max(margin, Math.min(vh - margin, rawY)),
  };
}

/**
 * Compute hovered Astra slice from wheel center & pointer screen coordinate.
 * Returns null if inside deadzone or hovering a locked Astra.
 */
export function getHoveredAstraFromPoint(
  centerX: number,
  centerY: number,
  pointerX: number,
  pointerY: number,
  astras: AstraStatusEntry[]
): AstraId | null {
  const dx = pointerX - centerX;
  const dy = pointerY - centerY;
  if (dx * dx + dy * dy < DEAD_ZONE_R * DEAD_ZONE_R) return null;

  // Slice 0 starts at top (-90 deg) minus half-slice so slice 0 is centered directly at 12 o'clock
  const sliceCount = ASTRA_ORDER.length;
  const step = (Math.PI * 2) / sliceCount;
  let angle = Math.atan2(dy, dx) + Math.PI / 2 + step / 2;
  while (angle < 0) angle += Math.PI * 2;
  while (angle >= Math.PI * 2) angle -= Math.PI * 2;

  const idx = Math.floor(angle / step) % sliceCount;
  const id = ASTRA_ORDER[idx];
  const entry = astras.find((a) => a.id === id);
  return entry?.unlocked ? id : null;
}

interface DivyastraRadialWheelProps {
  open: boolean;
  centerX: number;
  centerY: number;
  hoveredAstra: AstraId | null;
  selectedAstra: AstraId | null;
  astras: AstraStatusEntry[];
  astraEnergy: number;
  cooldowns: Record<AstraId, number>;
}

export const DivyastraRadialWheel: React.FC<DivyastraRadialWheelProps> = React.memo(
  ({
    open,
    centerX,
    centerY,
    hoveredAstra,
    selectedAstra,
    astras,
    astraEnergy,
    cooldowns,
  }) => {
    if (!open) return null;

    const sliceCount = ASTRA_ORDER.length;
    const step = (Math.PI * 2) / sliceCount;
    const gap = 0.045;
    const activePreviewId = hoveredAstra ?? selectedAstra;
    const activeCfg = activePreviewId ? ASTRA_CONFIG[activePreviewId] : null;
    const activeCd = activePreviewId ? Math.ceil(cooldowns[activePreviewId] ?? 0) : 0;

    return (
      <div
        role="dialog"
        aria-label="Divyastra Radial Wheel"
        style={{
          left: centerX - HALF,
          top: centerY - HALF,
          width: WHEEL_SIZE,
          height: WHEEL_SIZE,
        }}
        className="absolute z-40 pointer-events-none select-none"
      >
        <svg width={WHEEL_SIZE} height={WHEEL_SIZE} viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`}>
          {/* Outer Dark Backing Ring */}
          <circle
            cx={HALF}
            cy={HALF}
            r={OUTER_R + 4}
            fill="rgba(10, 13, 20, 0.86)"
            stroke="rgba(251, 191, 36, 0.35)"
            strokeWidth="1.5"
          />

          {ASTRA_ORDER.map((id, idx) => {
            const entry = astras.find((a) => a.id === id);
            const unlocked = Boolean(entry?.unlocked);
            const cfg = ASTRA_CONFIG[id];
            const isHovered = hoveredAstra === id;
            const isEquipped = selectedAstra === id;
            const cd = cooldowns[id] ?? 0;
            const lowEnergy = astraEnergy < cfg.energyCost;

            const midAngle = -Math.PI / 2 + idx * step;
            const startAngle = midAngle - step / 2 + gap;
            const endAngle = midAngle + step / 2 - gap;
            const d = createSlicePath(
              HALF,
              HALF,
              INNER_R,
              isHovered ? OUTER_R + 3 : OUTER_R,
              startAngle,
              endAngle
            );

            return (
              <g key={id}>
                <path
                  d={d}
                  fill={
                    !unlocked
                      ? 'rgba(20, 24, 34, 0.88)'
                      : isHovered
                      ? `${cfg.cssAccent}44`
                      : isEquipped
                      ? `${cfg.cssAccent}28`
                      : 'rgba(22, 28, 40, 0.9)'
                  }
                  stroke={
                    !unlocked
                      ? 'rgba(100, 116, 139, 0.28)'
                      : isHovered
                      ? cfg.cssAccent
                      : isEquipped
                      ? '#FDE68A'
                      : 'rgba(251, 191, 36, 0.28)'
                  }
                  strokeWidth={isHovered ? 2.2 : isEquipped ? 1.8 : 1.1}
                />

                {/* Cooldown or Energy Dim Ring Text inside slice outer edge */}
                {unlocked && (cd > 0.1 || lowEnergy) && (
                  <text
                    x={HALF + (OUTER_R - 12) * Math.cos(midAngle)}
                    y={HALF + (OUTER_R - 12) * Math.sin(midAngle) + 3}
                    textAnchor="middle"
                    fill={cd > 0.1 ? '#FBBF24' : '#FCA5A5'}
                    fontSize="8.5"
                    fontWeight="700"
                  >
                    {cd > 0.1 ? `${Math.ceil(cd)}s` : `${cfg.energyCost}E`}
                  </text>
                )}
              </g>
            );
          })}

          {/* Inner Hub Circle */}
          <circle
            cx={HALF}
            cy={HALF}
            r={INNER_R - 3}
            fill="rgba(13, 16, 22, 0.96)"
            stroke={activeCfg ? activeCfg.cssAccent : 'rgba(251, 191, 36, 0.45)'}
            strokeWidth="1.6"
          />
        </svg>

        {/* Crisp HTML/SVG Slice Icons Positioned Around Ring */}
        {ASTRA_ORDER.map((id, idx) => {
          const entry = astras.find((a) => a.id === id);
          const unlocked = Boolean(entry?.unlocked);
          const stepAngle = -Math.PI / 2 + idx * step;
          const ix = HALF + ICON_R * Math.cos(stepAngle);
          const iy = HALF + ICON_R * Math.sin(stepAngle);

          return (
            <div
              key={id}
              style={{ left: ix - 16, top: iy - 16, width: 32, height: 32 }}
              className={`absolute flex items-center justify-center ${
                unlocked ? 'opacity-100' : 'opacity-35 grayscale'
              }`}
            >
              <AstraGlyphSvg id={id} size={28} />
              {!unlocked && (
                <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-slate-500/60 bg-[#0D1016]">
                  <Lock className="h-2.5 w-2.5 text-slate-300" aria-hidden="true" />
                </span>
              )}
            </div>
          );
        })}

        {/* Center Hub Label */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex w-[68px] flex-col items-center justify-center text-center leading-tight">
            {activeCfg ? (
              <>
                <span
                  style={{ color: activeCfg.cssAccent }}
                  className="text-[9.5px] font-bold tracking-tight"
                >
                  {activeCfg.name}
                </span>
                <span className="mt-0.5 text-[8px] text-[#C9C1B2]">
                  {activeCd > 0 ? `${activeCd}s CD` : `${activeCfg.energyCost} Energy`}
                </span>
              </>
            ) : (
              <>
                <span className="text-[10px] font-semibold text-amber-300">દિવ્યાસ્ત્ર</span>
                <span className="mt-0.5 text-[8px] text-[#C9C1B2]">Drag to Pick</span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
);
