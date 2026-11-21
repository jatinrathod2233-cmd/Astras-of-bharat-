import React from 'react';
import { Flame, Navigation, ArrowUp, Zap, Crosshair, EyeOff, Eye, Compass, Crown } from 'lucide-react';
import { MountKind } from '../types/world';

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
  onFireStart: () => void;
  onFireEnd: () => void;
  onAstra: () => void;
  onJump: () => void;
  onToggleSprint: () => void;
  onInteract: () => void;
  onToggleStealth: () => void;
  onToggleAutoDrive: () => void;
}

export const TouchActionPad: React.FC<TouchActionPadProps> = ({
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
  onFireStart,
  onFireEnd,
  onAstra,
  onJump,
  onToggleSprint,
  onInteract,
  onToggleStealth,
  onToggleAutoDrive,
}) => {
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

  return (
    <div
      className="fixed bottom-3 left-3 z-20 flex flex-col gap-1.5 select-none pointer-events-auto"
      style={{ touchAction: 'none' }}
    >
      {/* Contextual Simhasana Throne Sit / Rise Trigger */}
      {showThroneBtn && (
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            onInteract();
          }}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-amber-300/85 bg-[#D99B26]/90 px-2.5 py-1.5 text-[10px] font-semibold text-[#101319] active:scale-95 transition-transform whitespace-nowrap cursor-pointer"
        >
          <Crown className="h-3 w-3" aria-hidden="true" />
          <span>{onThrone ? 'Rise from Throne (E)' : 'Sit on Throne (E)'}</span>
        </button>
      )}

      {/* Contextual Mount / Exit Button (Ratha, Ashva, Sacred Elephant) */}
      {!onThrone && showMountBtn && (
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            onInteract();
          }}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-amber-300/80 bg-[#D99B26]/85 px-2.5 py-1.5 text-[10px] font-semibold text-[#101319] active:scale-95 transition-transform whitespace-nowrap cursor-pointer"
        >
          <Navigation className="h-3 w-3" aria-hidden="true" />
          <span>
            {isMounted ? `Dismount ${mountedName} (E)` : `Mount ${nearMountLabel} (E)`}
          </span>
        </button>
      )}

      {/* Paved-Path Auto-Drive Toggle when mounted on ANY Ratha, Horse, or Elephant */}
      {isMounted && (
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            onToggleAutoDrive();
          }}
          className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] font-semibold active:scale-95 transition-colors whitespace-nowrap cursor-pointer ${
            autoDriveActive
              ? 'border-emerald-300/85 bg-emerald-600/75 text-[#F7F1E3]'
              : 'border-amber-200/35 bg-[#12161F]/70 text-[#EFE9DC]'
          }`}
        >
          <Compass className="h-3 w-3 text-amber-300" aria-hidden="true" />
          <span>{autoDriveActive ? 'Auto-Drive On (V)' : 'Auto-Drive (V)'}</span>
        </button>
      )}

      {/* Compact Action Grid */}
      <div className="grid grid-cols-2 gap-1.5">
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
          className="flex h-10 min-w-[54px] flex-col items-center justify-center gap-0.5 rounded-md border border-amber-300/45 bg-[#12161F]/55 px-2 text-[#F5EEDF] active:bg-amber-500/30 cursor-pointer"
        >
          <Crosshair className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
          <span className="text-[9px] font-semibold">Bow</span>
        </button>

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
          className={`relative overflow-hidden flex h-10 min-w-[54px] flex-col items-center justify-center gap-0.5 rounded-md border px-2 transition-colors ${
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

        {mountKind !== 'RATHA' && !onThrone && (
          <>
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                onJump();
              }}
              className="flex h-9 min-w-[54px] flex-col items-center justify-center gap-0.5 rounded-md border border-amber-200/20 bg-[#12161F]/55 px-2 text-[#EFE9DC] active:bg-amber-500/20 cursor-pointer"
            >
              <ArrowUp className="h-3 w-3 text-amber-200" aria-hidden="true" />
              <span className="text-[9px] font-medium">Jump</span>
            </button>

            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                onToggleSprint();
              }}
              className={`flex h-9 min-w-[54px] flex-col items-center justify-center gap-0.5 rounded-md border px-2 cursor-pointer ${
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
          </>
        )}

        {/* Universal Stealth Toggle (Available on foot AND in Ratha) */}
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            onToggleStealth();
          }}
          className={`col-span-2 flex h-8 items-center justify-center gap-1.5 rounded-md border px-2 cursor-pointer transition-colors ${
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
    </div>
  );
};
