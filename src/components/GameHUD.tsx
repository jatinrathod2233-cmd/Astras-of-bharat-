import React from 'react';
import { Eye, EyeOff, Flame, Gauge, Pause, Sparkles, Star, Volume2, VolumeX, ZoomIn, ZoomOut } from 'lucide-react';
import { WorldHudSnapshot } from '../types/world';
import { MinimapRadar } from './MinimapRadar';
import { TouchActionPad } from './TouchActionPad';
import { TouchJoystick } from './TouchJoystick';

interface GameHUDProps {
  hud: WorldHudSnapshot;
  muted: boolean;
  sprintActive: boolean;
  showPerfStats: boolean;
  onToggleMute: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPause: () => void;
  onJoystickMove: (x: number, y: number) => void;
  onFireStart: () => void;
  onFireEnd: () => void;
  onAstra: () => void;
  onJump: () => void;
  onToggleSprint: () => void;
  onInteract: () => void;
  onToggleStealth: () => void;
  onToggleAutoDrive: () => void;
}

const STAR_LEVELS = [1, 2, 3, 4, 5] as const;

export const GameHUD: React.FC<GameHUDProps> = React.memo(({
  hud,
  muted,
  sprintActive,
  showPerfStats,
  onToggleMute,
  onZoomIn,
  onZoomOut,
  onPause,
  onJoystickMove,
  onFireStart,
  onFireEnd,
  onAstra,
  onJump,
  onToggleSprint,
  onInteract,
  onToggleStealth,
  onToggleAutoDrive,
}) => {
  const hpPct = Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100));
  const pranaPct = Math.max(0, Math.min(100, (hud.prana / hud.maxPrana) * 100));

  // Karma progresses across 500-point Dharma tiers so the bar always reflects growth
  const karmaTierSize = 500;
  const karmaTierValue =
    hud.karma === 0
      ? 0
      : hud.karma % karmaTierSize === 0
      ? karmaTierSize
      : hud.karma % karmaTierSize;
  const karmaPct = Math.max(0, Math.min(100, (karmaTierValue / karmaTierSize) * 100));

  // Max Ratha sprint speed is ~262 km/h (82 m/s * 3.2)
  const chariotSpeedPct = Math.max(
    0,
    Math.min(100, (hud.chariotSpeedKmh / 262) * 100)
  );

  return (
    <>
      {/* Top-Left: Minimal 80px Radar + Optional Compact FPS/Quality Readout */}
      <div className="fixed top-3 left-3 z-20 flex items-start gap-2 pointer-events-none">
        <MinimapRadar
          playerX={hud.playerX}
          playerZ={hud.playerZ}
          playerYaw={hud.playerYaw}
          blips={hud.blips}
        />
        {showPerfStats && (
          <div className="rounded border border-amber-200/20 bg-[#0D1016]/70 px-2 py-1 font-mono-tabular text-[10px] text-amber-200">
            {hud.fps} FPS · {hud.qualityTier}
          </div>
        )}
      </div>

      {/* Left Side: Minimal Compact Prana & Karma Bars */}
      <div
        aria-label="Prana and Karma status bars"
        className="fixed left-3 top-[100px] z-20 w-[108px] rounded-md border border-amber-200/15 bg-[#0D1016]/55 px-2 py-1.5 space-y-1 pointer-events-none"
      >
        {/* Prana Compact Bar */}
        <div className="space-y-0.5">
          <div className="flex items-center justify-between font-mono-tabular text-[9px] text-[#EFE9DC]">
            <span className="inline-flex items-center gap-0.5 font-medium text-amber-300">
              <Flame className="h-2.5 w-2.5 text-amber-400" aria-hidden="true" />
              <span>Prana</span>
            </span>
            <span>{hud.prana}</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-sm bg-[#1A202C]/90">
            <div
              className="h-full bg-[#D99B26] transition-all duration-150"
              style={{ width: `${pranaPct}%` }}
            />
          </div>
        </div>

        {/* Karma Compact Bar */}
        <div className="space-y-0.5">
          <div className="flex items-center justify-between font-mono-tabular text-[9px] text-[#EFE9DC]">
            <span className="inline-flex items-center gap-0.5 font-medium text-sky-300">
              <Sparkles className="h-2.5 w-2.5 text-sky-400" aria-hidden="true" />
              <span>Karma</span>
            </span>
            <span>{hud.karma}</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-sm bg-[#1A202C]/90">
            <div
              className="h-full bg-[#38BDF8] transition-all duration-150"
              style={{ width: `${karmaPct}%` }}
            />
          </div>
        </div>

        {/* Sabha Council Occupancy Counter (visible only during Throne Ascension) */}
        {hud.ascensionActive && (
          <div className="pt-0.5 border-t border-amber-200/15 flex items-center justify-between font-mono-tabular text-[9px] text-amber-200">
            <span>Sabha</span>
            <span>
              {hud.courtSeatedCount}/{hud.courtTotalCount}{' '}
              {hud.courtSeatedCount >= hud.courtTotalCount
                ? 'Seated'
                : `${Math.min(60, Math.ceil(hud.ascensionElapsed))}s`}
            </span>
          </div>
        )}
      </div>

      {/* Top-Right: Minimal Health, Alert Stars, Mounted Ratha Speed & Compact Icon Controls */}
      <div className="fixed top-3 right-3 z-20 flex flex-col items-end gap-1.5 pointer-events-auto">
        <div className="w-[132px] rounded-md border border-amber-200/15 bg-[#0D1016]/55 px-2.5 py-1.5 space-y-1">
          {/* Wanted / Rakshasa Alert Stars */}
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[9px] font-medium uppercase tracking-wider text-[#C9C1B2]">
              Alert
            </span>
            <div
              className="flex items-center gap-0.5"
              aria-label={`Alert level ${hud.wantedLevel} of 5`}
            >
              {STAR_LEVELS.map((star) => (
                <Star
                  key={star}
                  className={`h-2.5 w-2.5 ${
                    star <= hud.wantedLevel
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-[#4B463C]'
                  }`}
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>

          {/* HP Bar */}
          <div className="space-y-0.5">
            <div className="flex justify-between font-mono-tabular text-[9px] text-[#EFE9DC]">
              <span>HP</span>
              <span>
                {hud.hp}/{hud.maxHp}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-sm bg-[#1A202C]/90">
              <div
                className="h-full bg-[#2EA063] transition-all duration-150"
                style={{ width: `${hpPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Mounted Speed & Stealth Indicator — appears when riding Ratha, Ashva, or Gaja */}
        {hud.mountKind !== 'NONE' && (
          <div
            role="status"
            aria-label="Mount speed indicator"
            className={`w-[132px] rounded-md border bg-[#0D1016]/65 px-2.5 py-1 space-y-1 ${
              hud.stealthActive
                ? hud.stealthSpotted
                  ? 'border-rose-400/65'
                  : 'border-sky-400/55'
                : 'border-amber-300/35'
            }`}
          >
            <div className="flex items-center justify-between gap-1 font-mono-tabular text-[9px] text-amber-200">
              <span className="inline-flex items-center gap-1 font-medium">
                <Gauge className="h-2.5 w-2.5 text-amber-400" aria-hidden="true" />
                <span>
                  {hud.autoDriveActive
                    ? 'Auto-Drive'
                    : hud.stealthActive
                    ? hud.stealthSpotted
                      ? 'Spotted'
                      : 'Stealth'
                    : hud.mountKind === 'ELEPHANT'
                    ? 'Gaja'
                    : hud.mountKind === 'HORSE'
                    ? 'Ashva'
                    : 'Ratha'}
                </span>
              </span>
              <span className="font-semibold text-[#F7F1E3]">
                {hud.chariotSpeedKmh} km/h
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-sm bg-[#1A202C]/90">
              <div
                className={`h-full transition-all duration-100 ${
                  hud.stealthActive
                    ? hud.stealthSpotted
                      ? 'bg-rose-400'
                      : 'bg-sky-400'
                    : 'bg-amber-400'
                }`}
                style={{ width: `${chariotSpeedPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Compact On-Foot Stealth Indicator */}
        {hud.mountKind === 'NONE' && hud.stealthActive && (
          <div
            role="status"
            aria-label="Stealth state"
            className={`w-[132px] flex items-center justify-between rounded-md border bg-[#0D1016]/65 px-2.5 py-1 text-[9px] font-medium ${
              hud.stealthSpotted
                ? 'border-rose-400/65 text-rose-200'
                : 'border-sky-400/55 text-sky-200'
            }`}
          >
            <span className="inline-flex items-center gap-1">
              {hud.stealthSpotted ? (
                <Eye className="h-2.5 w-2.5 text-rose-300" aria-hidden="true" />
              ) : (
                <EyeOff className="h-2.5 w-2.5 text-sky-300" aria-hidden="true" />
              )}
              <span>{hud.stealthSpotted ? 'Spotted' : 'Hidden'}</span>
            </span>
            <span className="text-[#C9C1B2]">2x Bow</span>
          </div>
        )}

        {/* Compact Icon-Only Utility & Camera Zoom Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onZoomIn}
            aria-label="Zoom camera in"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-amber-200/15 bg-[#0D1016]/55 text-[#EFE9DC] hover:border-amber-300/50 cursor-pointer"
          >
            <ZoomIn className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onZoomOut}
            aria-label="Zoom camera out"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-amber-200/15 bg-[#0D1016]/55 text-[#EFE9DC] hover:border-amber-300/50 cursor-pointer"
          >
            <ZoomOut className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-amber-200/15 bg-[#0D1016]/55 text-[#EFE9DC] hover:border-amber-300/50 cursor-pointer"
          >
            {muted ? (
              <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Volume2 className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={onPause}
            aria-label="Pause game"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-amber-200/15 bg-[#0D1016]/55 text-[#EFE9DC] hover:border-amber-300/50 cursor-pointer"
          >
            <Pause className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Minimal Contextual Prompt */}
      {hud.promptHint && (
        <div className="pointer-events-none fixed bottom-3 left-1/2 -translate-x-1/2 z-10 hidden md:block">
          <div className="rounded border border-amber-300/35 bg-[#0D1016]/60 px-2.5 py-1 text-[10px] font-medium text-amber-200 whitespace-nowrap">
            {hud.promptHint}
          </div>
        </div>
      )}

      {/* WebGL Context Notice if triggered */}
      {hud.webglError && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-30 rounded-md border border-amber-300/50 bg-[#0D1016]/90 px-3 py-1.5 text-xs text-amber-200">
          {hud.webglError}
        </div>
      )}

      {/* Left-Side Touchscreen Action Pad */}
      <TouchActionPad
        chakraCooldown={hud.chakraCooldown}
        chakraMaxCooldown={hud.chakraMaxCooldown}
        mountKind={hud.mountKind}
        nearMountLabel={hud.nearMountLabel}
        nearThrone={hud.nearThrone}
        onThrone={hud.onThrone}
        sprintActive={sprintActive}
        stealthActive={hud.stealthActive}
        stealthSpotted={hud.stealthSpotted}
        autoDriveActive={hud.autoDriveActive}
        onFireStart={onFireStart}
        onFireEnd={onFireEnd}
        onAstra={onAstra}
        onJump={onJump}
        onToggleSprint={onToggleSprint}
        onInteract={onInteract}
        onToggleStealth={onToggleStealth}
        onToggleAutoDrive={onToggleAutoDrive}
      />

      {/* Right-Side Virtual Movement Joystick */}
      <TouchJoystick onChange={onJoystickMove} />
    </>
  );
});
