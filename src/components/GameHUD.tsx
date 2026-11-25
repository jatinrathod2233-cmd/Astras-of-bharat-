import React from 'react';
import {
  AlertTriangle,
  Eye,
  EyeOff,
  Flame,
  Gauge,
  Pause,
  Sparkles,
  Star,
  Volume2,
  VolumeX,
  Waves,
  Wifi,
} from 'lucide-react';
import { ASTRA_CONFIG } from '../engine/astraConfig';
import type { LanSessionSnapshot } from '../engine/LanMultiplayerClient';
import { AstraId, WorldHudSnapshot } from '../types/world';
import { ControlLayoutMap } from '../utils/controlLayout';
import { AstraIconBadge } from './AstraIcons';
import { DivyastraRadialWheel } from './DivyastraRadialWheel';
import { MinimapRadar } from './MinimapRadar';
import { TouchActionPad } from './TouchActionPad';
import { TouchJoystick } from './TouchJoystick';

interface GameHUDProps {
  hud: WorldHudSnapshot;
  muted: boolean;
  sprintActive: boolean;
  showPerfStats: boolean;
  lanSession?: LanSessionSnapshot;
  desktopWheelOpen: boolean;
  desktopWheelCenter: { x: number; y: number };
  desktopHoveredAstra: AstraId | null;
  controlLayout: ControlLayoutMap;
  viewport: { w: number; h: number };
  stageRef?: React.RefObject<HTMLDivElement | null>;
  onToggleMute: () => void;
  onPause: () => void;
  onJoystickMove: (x: number, y: number) => void;
  onFireStart: () => void;
  onFireEnd: () => void;
  onAstra: () => void;
  onSelectAstra: (id: AstraId) => void;
  onShootAstra: () => void;
  onJump: () => void;
  onToggleSprint: () => void;
  onInteract: () => void;
  onSwitchSeat: () => void;
  onToggleStealth: () => void;
  onToggleAutoDrive: () => void;
}

const STAR_LEVELS = [1, 2, 3, 4, 5] as const;

export const GameHUD: React.FC<GameHUDProps> = React.memo(({
  hud,
  muted,
  sprintActive,
  showPerfStats,
  lanSession,
  desktopWheelOpen,
  desktopWheelCenter,
  desktopHoveredAstra,
  controlLayout,
  viewport,
  stageRef,
  onToggleMute,
  onPause,
  onJoystickMove,
  onFireStart,
  onFireEnd,
  onAstra,
  onSelectAstra,
  onShootAstra,
  onJump,
  onToggleSprint,
  onInteract,
  onSwitchSeat,
  onToggleStealth,
  onToggleAutoDrive,
}) => {
  const hpPct = Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100));
  const pranaPct = Math.max(0, Math.min(100, (hud.prana / hud.maxPrana) * 100));
  const astraEnergyPct = Math.max(
    0,
    Math.min(100, (hud.astraEnergy / Math.max(1, hud.maxAstraEnergy)) * 100)
  );

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

  const activeAstraCfg = hud.selectedAstra ? ASTRA_CONFIG[hud.selectedAstra] : null;
  const quest = hud.astraQuest;
  const breathPct =
    quest.underwaterBreath !== null
      ? Math.max(0, Math.min(100, quest.underwaterBreath))
      : null;

  const enemyWarn = hud.enemySummonWarning;
  const enemyWarnPct =
    enemyWarn && enemyWarn.active
      ? Math.max(0, Math.min(100, (enemyWarn.remainingSec / Math.max(0.1, enemyWarn.totalSec)) * 100))
      : 0;

  return (
    <>
      {/* Brahmastra Ritual Black-Fade & Lightning Flash Screen Overlays */}
      {hud.brahmaFadeAlpha > 0.01 && (
        <div
          aria-hidden="true"
          style={{ opacity: Math.min(1, hud.brahmaFadeAlpha) }}
          className="pointer-events-none absolute inset-0 z-30 bg-black"
        />
      )}
      {hud.brahmaFlashAlpha > 0.01 && (
        <div
          aria-hidden="true"
          style={{ opacity: Math.min(1, hud.brahmaFlashAlpha) }}
          className="pointer-events-none absolute inset-0 z-30 bg-[#FFF5CC]"
        />
      )}

      {/* Desktop Hold-Q Radial Wheel */}
      <DivyastraRadialWheel
        open={desktopWheelOpen}
        centerX={desktopWheelCenter.x}
        centerY={desktopWheelCenter.y}
        hoveredAstra={desktopHoveredAstra}
        selectedAstra={hud.selectedAstra}
        astras={quest.astras}
        astraEnergy={hud.astraEnergy}
        cooldowns={hud.astraCooldowns}
      />

      {/* Top Landscape HUD Bar — compact 3-zone horizontal layout leaving center & lower viewport open */}
      <div className="pointer-events-none absolute inset-x-2.5 top-2.5 z-20 flex items-start justify-between gap-2">
        {/* Top-Left Zone: Radar Minimap + Alert/HP/Prana/Karma/Astra Bars */}
        <div className="flex items-start gap-2 shrink-0">
          <MinimapRadar
            playerX={hud.playerX}
            playerZ={hud.playerZ}
            playerYaw={hud.playerYaw}
            blips={hud.blips}
          />

          <div className="w-[156px] sm:w-[186px] flex flex-col gap-1">
            {/* HP & Alert Stars */}
            <div className="rounded-md border border-amber-200/15 bg-[#0D1016]/60 px-2 py-1 space-y-0.5">
              <div className="flex items-center justify-between gap-1">
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
                <span className="font-mono-tabular text-[9px] text-[#EFE9DC]">
                  HP {hud.hp}/{hud.maxHp}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-sm bg-[#1A202C]/90">
                <div
                  className="h-full bg-[#2EA063] transition-all duration-150"
                  style={{ width: `${hpPct}%` }}
                />
              </div>
            </div>

            {/* Compact Horizontal Prana, Karma & Astra Energy Strip */}
            <div
              aria-label="Prana, Karma and Astra status bars"
              className="grid grid-cols-2 gap-1.5 rounded-md border border-amber-200/15 bg-[#0D1016]/55 px-2 py-1"
            >
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center justify-between font-mono-tabular text-[8.5px] text-[#EFE9DC]">
                  <span className="inline-flex items-center gap-0.5 font-medium text-amber-300">
                    <Flame className="h-2.5 w-2.5 text-amber-400 shrink-0" aria-hidden="true" />
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

              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center justify-between font-mono-tabular text-[8.5px] text-[#EFE9DC]">
                  <span className="inline-flex items-center gap-0.5 font-medium text-sky-300">
                    <Sparkles className="h-2.5 w-2.5 text-sky-400 shrink-0" aria-hidden="true" />
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

              {quest.unlockedCount > 0 && (
                <div className="col-span-2 space-y-0.5 pt-0.5 border-t border-amber-200/10">
                  <div className="flex items-center justify-between font-mono-tabular text-[8.5px] text-[#EFE9DC]">
                    <span
                      style={{ color: activeAstraCfg ? activeAstraCfg.cssAccent : '#FBBF24' }}
                      className="font-medium truncate"
                    >
                      {activeAstraCfg ? activeAstraCfg.name : 'Divyastra Energy'}
                    </span>
                    <span>{Math.round(hud.astraEnergy)}</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-sm bg-[#1A202C]/90">
                    <div
                      className="h-full transition-all duration-150"
                      style={{
                        width: `${astraEnergyPct}%`,
                        backgroundColor: activeAstraCfg ? activeAstraCfg.cssAccent : '#FBBF24',
                      }}
                    />
                  </div>
                </div>
              )}

              {hud.ascensionActive && (
                <div className="col-span-2 pt-0.5 border-t border-amber-200/15 flex items-center justify-between font-mono-tabular text-[8.5px] text-amber-200">
                  <span>Sabha Council</span>
                  <span>
                    {hud.courtSeatedCount}/{hud.courtTotalCount}{' '}
                    {hud.courtSeatedCount >= hud.courtTotalCount
                      ? 'Seated'
                      : `${Math.min(60, Math.ceil(hud.ascensionElapsed))}s`}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Top-Center Zone: Divine Astras Objective Card, 5-Astra Icons & Conditional Warnings */}
        <div className="flex-1 min-w-0 max-w-[420px] flex flex-col items-center gap-1">
          <div className="w-full rounded-md border border-amber-300/25 bg-[#0D1016]/68 px-2.5 py-1 space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0 text-[10px] font-semibold text-amber-200">
                <span className="truncate">{quest.objectiveTitle}</span>
                {quest.objectiveDistanceM > 0 && (
                  <span className="font-mono-tabular text-[#F7F1E3] shrink-0">
                    {quest.objectiveDistanceM}m
                  </span>
                )}
              </div>

              <div className="pointer-events-auto flex items-center gap-1 shrink-0">
                {quest.astras.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    disabled={!a.unlocked}
                    onClick={() => {
                      if (a.unlocked) onSelectAstra(a.id);
                    }}
                    aria-label={a.unlocked ? `Equip ${a.name}` : `${a.name} locked`}
                    className={a.unlocked ? 'cursor-pointer' : 'cursor-default'}
                  >
                    <AstraIconBadge
                      id={a.id}
                      size={19}
                      unlocked={a.unlocked}
                      active={hud.selectedAstra === a.id}
                    />
                  </button>
                ))}
              </div>
            </div>

            {quest.objectiveDetail && (
              <p className="text-[9px] leading-tight text-[#C9C1B2] line-clamp-1">
                {quest.objectiveDetail}
              </p>
            )}

            {(quest.challengeSubProgress || quest.challengeTimerSec !== null) && (
              <div className="flex items-center justify-between gap-2 font-mono-tabular text-[9px] text-amber-300">
                <span>{quest.challengeSubProgress ?? ''}</span>
                {quest.challengeTimerSec !== null && (
                  <span className={quest.challengeTimerSec <= 10 ? 'text-rose-300 font-bold' : ''}>
                    {Math.ceil(quest.challengeTimerSec)}s
                  </span>
                )}
              </div>
            )}
          </div>

          {(lanSession?.active || showPerfStats) && (
            <div className="flex flex-wrap items-center justify-center gap-1">
              {lanSession?.active && (
                <div className="inline-flex items-center gap-1 rounded border border-emerald-400/35 bg-[#0D1016]/75 px-2 py-0.5 font-mono-tabular text-[9px] text-emerald-200">
                  <Wifi className="h-2.5 w-2.5 text-emerald-400 shrink-0" aria-hidden="true" />
                  <span>
                    LAN {lanSession.players.length}/6
                    {lanSession.pingMs !== null ? ` · ${lanSession.pingMs}ms` : ''}
                  </span>
                </div>
              )}
              {showPerfStats && (
                <div className="rounded border border-amber-200/20 bg-[#0D1016]/70 px-1.5 py-0.5 font-mono-tabular text-[9px] text-amber-200">
                  {hud.fps}/{hud.targetFps} · {hud.qualityTier} · {Math.round(hud.resolutionScale * 100)}%
                </div>
              )}
            </div>
          )}

          {/* Enemy Brahmastra 5-Second Interrupt Warning Bar */}
          {enemyWarn && enemyWarn.active && (
            <div
              role="alert"
              className="w-full rounded-md border border-rose-400/80 bg-[#2A0B12]/90 px-2.5 py-1 space-y-0.5"
            >
              <div className="flex items-center justify-between gap-2 text-[9px] font-bold text-rose-200">
                <span className="inline-flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-rose-300 shrink-0" aria-hidden="true" />
                  <span>{enemyWarn.bossName}: Brahmastra!</span>
                </span>
                <span className="font-mono-tabular text-amber-200">
                  {enemyWarn.remainingSec.toFixed(1)}s
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-sm bg-[#1A080C]">
                <div
                  className="h-full bg-rose-400 transition-all duration-75"
                  style={{ width: `${enemyWarnPct}%` }}
                />
              </div>
              <p className="text-[8.5px] font-medium text-amber-200 text-center">
                Deal damage now to interrupt!
              </p>
            </div>
          )}
        </div>

        {/* Top-Right Zone: Audio/Pause + Mount Speed / Stealth Status */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="pointer-events-auto flex items-center gap-1">
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-amber-200/15 bg-[#0D1016]/60 text-[#EFE9DC] hover:border-amber-300/50 cursor-pointer"
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
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-amber-200/15 bg-[#0D1016]/60 text-[#EFE9DC] hover:border-amber-300/50 cursor-pointer"
            >
              <Pause className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
            </button>
          </div>

          <div className="pointer-events-auto flex flex-col items-end gap-1">
            {/* Mounted Speed & Seat Indicator */}
            {hud.mountKind !== 'NONE' && (
              <div
                role="status"
                aria-label="Mount speed indicator"
                className={`min-w-[136px] rounded-md border bg-[#0D1016]/68 px-2 py-1 space-y-0.5 ${
                  hud.stealthActive
                    ? hud.stealthSpotted
                      ? 'border-rose-400/65'
                      : 'border-sky-400/55'
                    : 'border-amber-300/35'
                }`}
              >
                <div className="flex items-center justify-between gap-2 font-mono-tabular text-[9px] text-amber-200">
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
                {lanSession?.active && hud.mountedSeatIndex !== null && (
                  <div className="pt-0.5 border-t border-amber-200/15 space-y-0.5">
                    <div className="flex items-center justify-between gap-1 text-[8.5px] font-medium text-emerald-200">
                      <span>
                        {hud.mountedSeatIndex === 0 ? 'Driver' : 'Passenger'} ·{' '}
                        {hud.mountedOccupantCount}/2
                      </span>
                      {hud.canSwitchSeat && (
                        <button
                          type="button"
                          onClick={onSwitchSeat}
                          className="rounded border border-amber-300/45 bg-amber-500/20 px-1 py-0.5 text-[8px] font-semibold text-amber-200 hover:bg-amber-500/35 cursor-pointer"
                        >
                          Swap (G)
                        </button>
                      )}
                    </div>
                    {hud.mountedPartnerName && (
                      <div className="truncate text-[8px] text-[#C9C1B2]">
                        With {hud.mountedPartnerName}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Compact On-Foot Stealth Indicator */}
            {hud.mountKind === 'NONE' && hud.stealthActive && (
              <div
                role="status"
                aria-label="Stealth state"
                className={`flex items-center justify-between gap-2 rounded-md border bg-[#0D1016]/68 px-2 py-0.5 text-[9px] font-medium ${
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
          </div>
        </div>
      </div>

      {/* Underwater Breath Bar for Varunastra Sunken Shrine Dive (centered cleanly between thumb clusters) */}
      {breathPct !== null && (
        <div className="pointer-events-none absolute bottom-[68px] left-1/2 -translate-x-1/2 z-20 w-[180px] rounded-md border border-sky-300/45 bg-[#0B1420]/85 px-2.5 py-1.5 space-y-1">
          <div className="flex items-center justify-between font-mono-tabular text-[9px] font-semibold text-sky-200">
            <span className="inline-flex items-center gap-1">
              <Waves className="h-3 w-3 text-sky-300" aria-hidden="true" />
              <span>Breath</span>
            </span>
            <span className={breathPct <= 25 ? 'text-rose-300' : 'text-sky-200'}>
              {Math.round(breathPct)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-sm bg-[#162233]">
            <div
              className={`h-full transition-all duration-100 ${
                breathPct <= 25 ? 'bg-rose-400' : 'bg-sky-400'
              }`}
              style={{ width: `${breathPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Contextual Prompt Pill — centered cleanly in the lower-center corridor between landscape thumb pads */}
      {hud.promptHint && (
        <div className="pointer-events-none absolute bottom-[26px] left-1/2 -translate-x-1/2 z-10 max-w-[44%]">
          <div className="truncate rounded border border-amber-300/35 bg-[#0D1016]/68 px-2.5 py-1 text-[10px] font-medium text-amber-200">
            {hud.promptHint}
          </div>
        </div>
      )}

      {/* WebGL Context Notice if triggered */}
      {hud.webglError && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 max-w-[80%] rounded-md border border-amber-300/50 bg-[#0D1016]/90 px-3 py-1.5 text-center text-xs text-amber-200">
          {hud.webglError}
        </div>
      )}

      {/* Landscape Touchscreen Action Pad */}
      <TouchActionPad
        chakraCooldown={hud.chakraCooldown}
        chakraMaxCooldown={hud.chakraMaxCooldown}
        mountKind={hud.mountKind}
        nearMountLabel={hud.nearMountLabel}
        nearMountFull={Boolean(hud.nearMountFull)}
        inMultiplayer={Boolean(lanSession?.active)}
        mountedSeatIndex={hud.mountedSeatIndex ?? null}
        canSwitchSeat={Boolean(hud.canSwitchSeat)}
        nearThrone={hud.nearThrone}
        onThrone={hud.onThrone}
        sprintActive={sprintActive}
        stealthActive={hud.stealthActive}
        stealthSpotted={hud.stealthSpotted}
        autoDriveActive={hud.autoDriveActive}
        selectedAstra={hud.selectedAstra}
        astras={quest.astras}
        astraEnergy={hud.astraEnergy}
        astraCooldowns={hud.astraCooldowns}
        brahmastraAimReady={hud.brahmastraAimReady}
        brahmastraSummoning={hud.brahmastraSummoning}
        controlLayout={controlLayout}
        viewport={viewport}
        stageRef={stageRef}
        onFireStart={onFireStart}
        onFireEnd={onFireEnd}
        onAstra={onAstra}
        onSelectAstra={onSelectAstra}
        onShootAstra={onShootAstra}
        onJump={onJump}
        onToggleSprint={onToggleSprint}
        onInteract={onInteract}
        onSwitchSeat={onSwitchSeat}
        onToggleStealth={onToggleStealth}
        onToggleAutoDrive={onToggleAutoDrive}
      />

      {/* Custom Virtual Movement Joystick */}
      <TouchJoystick
        onChange={onJoystickMove}
        placement={controlLayout.JOYSTICK}
        viewport={viewport}
      />
    </>
  );
});
