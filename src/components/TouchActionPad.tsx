import React, { useCallback, useRef, useState } from 'react';
import {
  Flame,
  Navigation,
  ArrowUp,
  Zap,
  Crosshair,
  EyeOff,
  Eye,
  Compass,
  Crown,
  Sparkles,
} from 'lucide-react';
import { ASTRA_CONFIG } from '../engine/astraConfig';
import { AstraId, AstraStatusEntry, MountKind } from '../types/world';
import { soundEngine } from '../utils/audio';
import {
  computeControlPixelRect,
  CONTROL_META,
  ControlId,
  ControlLayoutMap,
} from '../utils/controlLayout';
import { AstraIconBadge } from './AstraIcons';
import {
  clampWheelCenter,
  DivyastraRadialWheel,
  getHoveredAstraFromPoint,
} from './DivyastraRadialWheel';

interface TouchActionPadProps {
  chakraCooldown: number;
  chakraMaxCooldown: number;
  mountKind: MountKind;
  nearMountLabel: string | null;
  nearThrone: boolean;
  onThrone: boolean;
  sprintActive: boolean;
  stealthActive: boolean;
  stealthSpotted: boolean;
  autoDriveActive: boolean;
  selectedAstra: AstraId | null;
  astras: AstraStatusEntry[];
  astraEnergy: number;
  astraCooldowns: Record<AstraId, number>;
  brahmastraAimReady: boolean;
  brahmastraSummoning: boolean;
  controlLayout: ControlLayoutMap;
  viewport: { w: number; h: number };
  onFireStart: () => void;
  onFireEnd: () => void;
  onAstra: () => void;
  onSelectAstra: (id: AstraId) => void;
  onShootAstra: () => void;
  onJump: () => void;
  onToggleSprint: () => void;
  onInteract: () => void;
  onToggleStealth: () => void;
  onToggleAutoDrive: () => void;
}

export const TouchActionPad: React.FC<TouchActionPadProps> = React.memo(
  ({
    chakraCooldown,
    chakraMaxCooldown,
    mountKind,
    nearMountLabel,
    nearThrone,
    onThrone,
    sprintActive,
    stealthActive,
    stealthSpotted,
    autoDriveActive,
    selectedAstra,
    astras,
    astraEnergy,
    astraCooldowns,
    brahmastraAimReady,
    brahmastraSummoning,
    controlLayout,
    viewport,
    onFireStart,
    onFireEnd,
    onAstra,
    onSelectAstra,
    onShootAstra,
    onJump,
    onToggleSprint,
    onInteract,
    onToggleStealth,
    onToggleAutoDrive,
  }) => {
    const [wheelOpen, setWheelOpen] = useState(false);
    const [wheelCenter, setWheelCenter] = useState<{ x: number; y: number }>({
      x: 140,
      y: 360,
    });
    const [hoveredAstra, setHoveredAstra] = useState<AstraId | null>(null);
    const hoveredRef = useRef<AstraId | null>(null);
    const wheelPointerIdRef = useRef<number | null>(null);

    const canChakra = chakraCooldown <= 0.05;
    const maxCd = Math.max(1, chakraMaxCooldown);
    const chargePct = Math.max(
      0,
      Math.min(100, Math.round((1 - chakraCooldown / maxCd) * 100))
    );
    const isMounted = mountKind !== 'NONE';
    const showMountBtn = isMounted || nearMountLabel !== null;
    const showThroneBtn = nearThrone || onThrone;
    const mountedName =
      mountKind === 'ELEPHANT'
        ? 'Elephant'
        : mountKind === 'HORSE'
        ? 'Ashva'
        : 'Ratha';

    const unlockedCount = astras.filter((a) => a.unlocked).length;
    const activeCfg = selectedAstra ? ASTRA_CONFIG[selectedAstra] : null;
    const activeCd = selectedAstra ? astraCooldowns[selectedAstra] ?? 0 : 0;
    const hasEnergy = activeCfg ? astraEnergy >= activeCfg.energyCost : false;
    const canShootAstra =
      !brahmastraSummoning &&
      Boolean(selectedAstra) &&
      (brahmastraAimReady || (activeCd <= 0.05 && hasEnergy));

    const getWrapperStyle = (id: ControlId): React.CSSProperties => {
      const meta = CONTROL_META[id];
      const rect = computeControlPixelRect(
        id,
        controlLayout[id],
        viewport.w,
        viewport.h
      );
      return {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${meta.baseWidth}px`,
        height: `${meta.baseHeight}px`,
        transform: `scale(${rect.scale})`,
        transformOrigin: 'top left',
        touchAction: 'none',
      };
    };

    const handleWheelDown = useCallback(
      (e: React.PointerEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        if (unlockedCount === 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        wheelPointerIdRef.current = e.pointerId;
        const offsetX = e.clientX > viewport.w * 0.5 ? -54 : 54;
        const offsetY = e.clientY < viewport.h * 0.35 ? 70 : -70;
        const clamped = clampWheelCenter(
          e.clientX + offsetX,
          e.clientY + offsetY
        );
        setWheelCenter(clamped);
        hoveredRef.current = selectedAstra;
        setHoveredAstra(selectedAstra);
        setWheelOpen(true);
      },
      [unlockedCount, selectedAstra, viewport.w, viewport.h]
    );

    const handleWheelMove = useCallback(
      (e: React.PointerEvent<HTMLButtonElement>) => {
        if (wheelPointerIdRef.current !== e.pointerId) return;
        e.stopPropagation();
        const next = getHoveredAstraFromPoint(
          wheelCenter.x,
          wheelCenter.y,
          e.clientX,
          e.clientY,
          astras
        );
        if (next !== hoveredRef.current) {
          hoveredRef.current = next;
          setHoveredAstra(next);
          if (next) {
            soundEngine.playWheelTick();
          }
        }
      },
      [wheelCenter, astras]
    );

    const handleWheelUp = useCallback(
      (e: React.PointerEvent<HTMLButtonElement>) => {
        if (wheelPointerIdRef.current !== e.pointerId) return;
        e.stopPropagation();
        wheelPointerIdRef.current = null;
        const picked = hoveredRef.current;
        hoveredRef.current = null;
        setHoveredAstra(null);
        setWheelOpen(false);
        if (picked) {
          onSelectAstra(picked);
        }
      },
      [onSelectAstra]
    );

    return (
      <>
        <DivyastraRadialWheel
          open={wheelOpen}
          centerX={wheelCenter.x}
          centerY={wheelCenter.y}
          hoveredAstra={hoveredAstra}
          selectedAstra={selectedAstra}
          astras={astras}
          astraEnergy={astraEnergy}
          cooldowns={astraCooldowns}
        />

        {/* Contextual Simhasana Throne Sit / Rise OR Mount / Dismount Trigger */}
        {(showThroneBtn || (!onThrone && showMountBtn)) && (
          <div
            style={getWrapperStyle('INTERACT')}
            className="fixed z-20 select-none pointer-events-auto"
          >
            {showThroneBtn ? (
              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onInteract();
                }}
                className="flex h-full w-full items-center justify-center gap-1 rounded-md border border-amber-300/85 bg-[#D99B26]/90 px-2 text-[9.5px] font-semibold text-[#101319] active:scale-95 transition-transform whitespace-nowrap cursor-pointer"
              >
                <Crown className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {onThrone ? 'Rise Throne (E)' : 'Sit Throne (E)'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onInteract();
                }}
                className="flex h-full w-full items-center justify-center gap-1 rounded-md border border-amber-300/80 bg-[#D99B26]/85 px-2 text-[9.5px] font-semibold text-[#101319] active:scale-95 transition-transform whitespace-nowrap cursor-pointer"
              >
                <Navigation className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {isMounted
                    ? `Exit ${mountedName} (E)`
                    : `Mount ${nearMountLabel} (E)`}
                </span>
              </button>
            )}
          </div>
        )}

        {/* Paved-Path Auto-Drive Toggle when mounted */}
        {isMounted && (
          <div
            style={getWrapperStyle('AUTO_DRIVE')}
            className="fixed z-20 select-none pointer-events-auto"
          >
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                onToggleAutoDrive();
              }}
              className={`flex h-full w-full items-center justify-center gap-1 rounded-md border px-2 text-[9.5px] font-semibold active:scale-95 transition-colors whitespace-nowrap cursor-pointer ${
                autoDriveActive
                  ? 'border-emerald-300/85 bg-emerald-600/75 text-[#F7F1E3]'
                  : 'border-amber-200/35 bg-[#12161F]/70 text-[#EFE9DC]'
              }`}
            >
              <Compass className="h-3 w-3 text-amber-300 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {autoDriveActive ? 'Auto-Drive On (V)' : 'Auto-Drive (V)'}
              </span>
            </button>
          </div>
        )}

        {/* Divyastra Wheel Hold Button */}
        <div
          style={getWrapperStyle('ASTRA_WHEEL')}
          className="fixed z-20 select-none pointer-events-auto"
        >
          <button
            type="button"
            disabled={unlockedCount === 0}
            onPointerDown={handleWheelDown}
            onPointerMove={handleWheelMove}
            onPointerUp={handleWheelUp}
            onPointerCancel={handleWheelUp}
            aria-label="Hold to open Divyastra Radial Wheel"
            className={`flex h-full w-full items-center justify-center gap-1 rounded-md border px-1.5 transition-colors ${
              unlockedCount > 0
                ? 'border-amber-300/60 bg-[#1B1626]/80 text-amber-200 active:bg-amber-500/25 cursor-pointer'
                : 'border-amber-200/15 bg-[#10131A]/55 text-[#7A7468] cursor-not-allowed'
            }`}
          >
            {selectedAstra ? (
              <AstraIconBadge id={selectedAstra} size={20} unlocked active />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-amber-300 shrink-0" aria-hidden="true" />
            )}
            <span className="text-[9px] font-semibold leading-none">
              {unlockedCount > 0 ? 'દિવ્યાસ્ત્ર' : 'Locked'}
            </span>
          </button>
        </div>

        {/* Dedicated Shoot Astra Button */}
        <div
          style={getWrapperStyle('SHOOT_ASTRA')}
          className="fixed z-20 select-none pointer-events-auto"
        >
          <button
            type="button"
            disabled={!canShootAstra}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (canShootAstra) onShootAstra();
            }}
            aria-label={
              activeCfg
                ? `Shoot ${activeCfg.name}`
                : 'No Divyastra equipped'
            }
            style={
              canShootAstra && activeCfg
                ? { borderColor: activeCfg.cssAccent }
                : undefined
            }
            className={`relative overflow-hidden flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-md border px-1 transition-colors ${
              brahmastraAimReady
                ? 'bg-amber-500/35 text-amber-100 cursor-pointer'
                : canShootAstra
                ? 'bg-[#1D1528]/80 text-[#F5EEDF] active:bg-amber-500/30 cursor-pointer'
                : 'border-amber-200/15 bg-[#10131A]/55 text-[#9B9384] cursor-not-allowed'
            }`}
          >
            <span className="text-[9px] font-bold tracking-tight">
              {brahmastraSummoning
                ? 'Summon...'
                : brahmastraAimReady
                ? 'Unleash!'
                : activeCd > 0.1
                ? `${Math.ceil(activeCd)}s`
                : 'Shoot (X)'}
            </span>
            <span className="text-[8px] text-[#C9C1B2] truncate max-w-[52px]">
              {activeCfg ? activeCfg.name.replace('astra', '') : 'None'}
            </span>
          </button>
        </div>

        {/* Bow / Fire Button */}
        <div
          style={getWrapperStyle('FIRE_BOW')}
          className="fixed z-20 select-none pointer-events-auto"
        >
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onFireStart();
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              onFireEnd();
            }}
            onPointerLeave={onFireEnd}
            onPointerCancel={onFireEnd}
            className="flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-md border border-amber-300/45 bg-[#12161F]/55 px-2 text-[#F5EEDF] active:bg-amber-500/30 cursor-pointer"
          >
            <Crosshair className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
            <span className="text-[9px] font-semibold">Bow</span>
          </button>
        </div>

        {/* Sudarshan Chakra Button */}
        <div
          style={getWrapperStyle('CHAKRA')}
          className="fixed z-20 select-none pointer-events-auto"
        >
          <button
            type="button"
            disabled={!canChakra}
            onPointerDown={(e) => {
              e.stopPropagation();
              onAstra();
            }}
            aria-label={
              canChakra
                ? 'Throw Sudarshan Chakra'
                : `Sudarshan Chakra recharging, ${Math.ceil(chakraCooldown)} seconds remaining`
            }
            className={`relative overflow-hidden flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-md border px-2 transition-colors ${
              canChakra
                ? 'border-orange-400/75 bg-[#2A1812]/65 text-[#F5EEDF] active:bg-orange-500/35 cursor-pointer'
                : 'border-amber-200/15 bg-[#10131A]/55 text-[#9B9384] cursor-not-allowed'
            }`}
          >
            <Flame
              className={`h-3.5 w-3.5 ${
                canChakra ? 'text-orange-400' : 'text-orange-400/45'
              }`}
              aria-hidden="true"
            />
            <span className="font-mono-tabular text-[9px] font-semibold">
              {canChakra ? 'Chakra' : `${Math.ceil(chakraCooldown)}s`}
            </span>
            <span
              className={`absolute bottom-0 left-0 h-0.5 transition-all duration-150 ${
                canChakra ? 'bg-orange-400' : 'bg-amber-400/70'
              }`}
              style={{ width: `${chargePct}%` }}
            />
          </button>
        </div>

        {/* Jump & Sprint Buttons (hidden while driving Ratha or seated on Throne) */}
        {mountKind !== 'RATHA' && !onThrone && (
          <>
            <div
              style={getWrapperStyle('JUMP')}
              className="fixed z-20 select-none pointer-events-auto"
            >
              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onJump();
                }}
                className="flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-md border border-amber-200/20 bg-[#12161F]/55 px-2 text-[#EFE9DC] active:bg-amber-500/20 cursor-pointer"
              >
                <ArrowUp className="h-3 w-3 text-amber-200" aria-hidden="true" />
                <span className="text-[9px] font-medium">Jump</span>
              </button>
            </div>

            <div
              style={getWrapperStyle('SPRINT')}
              className="fixed z-20 select-none pointer-events-auto"
            >
              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onToggleSprint();
                }}
                className={`flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-md border px-2 cursor-pointer ${
                  sprintActive
                    ? 'border-amber-400/80 bg-amber-500/30 text-amber-200'
                    : 'border-amber-200/20 bg-[#12161F]/55 text-[#EFE9DC]'
                }`}
              >
                <Zap className="h-3 w-3 text-amber-300" aria-hidden="true" />
                <span className="text-[9px] font-medium">
                  {sprintActive ? 'Run' : 'Sprint'}
                </span>
              </button>
            </div>
          </>
        )}

        {/* Universal Stealth Toggle */}
        <div
          style={getWrapperStyle('STEALTH')}
          className="fixed z-20 select-none pointer-events-auto"
        >
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onToggleStealth();
            }}
            className={`flex h-full w-full items-center justify-center gap-1.5 rounded-md border px-2 cursor-pointer transition-colors ${
              stealthActive
                ? stealthSpotted
                  ? 'border-rose-400/80 bg-rose-600/35 text-rose-200'
                  : 'border-sky-400/80 bg-sky-600/35 text-sky-200'
                : 'border-amber-200/20 bg-[#12161F]/55 text-[#EFE9DC]'
            }`}
          >
            {stealthActive && stealthSpotted ? (
              <Eye className="h-3 w-3 text-rose-300" aria-hidden="true" />
            ) : (
              <EyeOff className="h-3 w-3 text-sky-300" aria-hidden="true" />
            )}
            <span className="text-[9px] font-semibold">
              {stealthActive
                ? stealthSpotted
                  ? 'Spotted (C)'
                  : 'Stealth On (C)'
                : 'Stealth (C)'}
            </span>
          </button>
        </div>
      </>
    );
  }
);

