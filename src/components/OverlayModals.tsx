import React from 'react';
import { CheckCircle2, Play, RotateCcw } from 'lucide-react';
import { PlayMode, QualityMode, WorldHudSnapshot } from '../types/world';

interface OverlayModalsProps {
  mode: PlayMode;
  hud: WorldHudSnapshot;
  showPerfStats: boolean;
  onStartGame: () => void;
  onResume: () => void;
  onRevive: () => void;
  onRestart: () => void;
  onChangeQualityMode: (mode: QualityMode) => void;
  onTogglePerfStats: () => void;
}

const QUALITY_OPTIONS: ReadonlyArray<{ mode: QualityMode; label: string }> = [
  { mode: 'AUTO', label: 'Auto' },
  { mode: 'HIGH', label: 'High' },
  { mode: 'MEDIUM', label: 'Medium' },
  { mode: 'LOW', label: 'Low' },
];

export const OverlayModals: React.FC<OverlayModalsProps> = React.memo(({
  mode,
  hud,
  showPerfStats,
  onStartGame,
  onResume,
  onRevive,
  onRestart,
  onChangeQualityMode,
  onTogglePerfStats,
}) => {
  if (mode === 'PLAYING') return null;

  if (mode === 'TITLE') {
    const pct = hud.assetsReady
      ? 100
      : Math.min(99, Math.max(0, Math.round(hud.assetProgress)));

    return (
      <div className="fixed inset-0 z-30 pointer-events-none select-none">
        {/* Central Start Button */}
        <div className="fixed inset-0 flex items-center justify-center p-6 pointer-events-none">
          <button
            type="button"
            disabled={!hud.assetsReady}
            onClick={onStartGame}
            aria-label="Start Game"
            className={`pointer-events-auto inline-flex min-w-[200px] items-center justify-center gap-2.5 rounded-lg border px-9 py-4 font-display text-base font-semibold tracking-wider transition-all duration-200 ${
              hud.assetsReady
                ? 'border-amber-200/80 bg-[#D99B26] text-[#101319] opacity-100 hover:bg-[#E8AE3B] cursor-pointer shadow-lg'
                : 'border-amber-200/20 bg-[#D99B26]/65 text-[#101319]/75 opacity-40 cursor-not-allowed'
            }`}
          >
            <Play className="h-5 w-5 fill-current" aria-hidden="true" />
            <span>Start</span>
          </button>
        </div>

        {/* Bottom-Docked Loading Bar */}
        <div className="fixed inset-x-0 bottom-6 flex justify-center px-6 pointer-events-none">
          <div className="w-full max-w-[520px] rounded-lg border border-amber-300/30 bg-[#0D1016]/85 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between text-xs text-[#EFE9DC]">
              <span className="inline-flex items-center gap-1.5 font-medium">
                {hud.assetsReady && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                )}
                <span className={hud.assetsReady ? 'text-emerald-300 font-semibold' : 'text-[#DFD7C8]'}>
                  {hud.assetsReady
                    ? 'Loading 100% Successful'
                    : hud.assetStage || 'Initializing realm...'}
                </span>
              </span>
              <span
                className={`font-mono-tabular font-semibold ${
                  hud.assetsReady ? 'text-emerald-300' : 'text-amber-300'
                }`}
              >
                {pct}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#1C2230] border border-amber-200/20">
              <div
                className={`h-full transition-[width] duration-150 ease-out ${
                  hud.assetsReady ? 'bg-emerald-400' : 'bg-[#D99B26]'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'PAUSED') {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#0D1016]/75 p-6">
        <div className="w-full max-w-[420px] rounded-xl border border-amber-300/35 bg-[#0D1016]/95 p-7 space-y-5">
          <div className="space-y-1">
            <p className="text-xs text-amber-300">{hud.districtName}</p>
            <h2 className="font-display text-2xl font-semibold text-[#F7F1E3]">
              Game Paused
            </h2>
          </div>

          <div className="space-y-2 rounded-md border border-amber-200/15 bg-[#131720] p-4 text-xs text-[#C9C1B2]">
            <p className="font-mono-tabular">
              Karma: {hud.karma} · Progress: {hud.completedMissions}/
              {hud.totalMissions}
            </p>
          </div>

          {/* Graphics Quality Selector */}
          <div className="space-y-2.5 rounded-md border border-amber-200/15 bg-[#131720] p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#EFE9DC]">Graphics Quality</span>
              <span className="font-mono-tabular text-amber-300">
                {hud.qualityMode === 'AUTO'
                  ? `Auto (${hud.qualityTier})`
                  : hud.qualityTier}
                {' · '}
                {hud.fps} FPS
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {QUALITY_OPTIONS.map((opt) => {
                const selected = hud.qualityMode === opt.mode;
                return (
                  <button
                    key={opt.mode}
                    type="button"
                    onClick={() => onChangeQualityMode(opt.mode)}
                    className={`rounded px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer border ${
                      selected
                        ? 'border-amber-300 bg-[#D99B26] text-[#101319] font-semibold'
                        : 'border-amber-200/20 bg-[#181D28] text-[#DFD7C8] hover:border-amber-300/50'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-[#C9C1B2]">Show FPS &amp; Tier HUD</span>
              <button
                type="button"
                onClick={onTogglePerfStats}
                className={`rounded border px-2.5 py-1 text-[11px] font-medium cursor-pointer transition-colors ${
                  showPerfStats
                    ? 'border-amber-300/70 bg-amber-400/20 text-amber-200'
                    : 'border-amber-200/20 bg-[#181D28] text-[#C9C1B2] hover:border-amber-300/50'
                }`}
              >
                {showPerfStats ? 'On' : 'Off'}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onResume}
              className="w-full rounded-md bg-[#D99B26] px-5 py-2.5 text-sm font-semibold text-[#101319] hover:bg-[#E8AE3B] cursor-pointer"
            >
              Resume
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="w-full rounded-md border border-amber-200/25 bg-[#141822] px-5 py-2.5 text-sm font-medium text-[#EFE9DC] hover:border-amber-300/60 cursor-pointer"
            >
              Restart World
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'DEFEATED') {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#0D1016]/80 p-6">
        <div className="w-full max-w-[440px] rounded-xl border border-rose-400/40 bg-[#0D1016]/95 p-7 space-y-5">
          <div className="space-y-1">
            <p className="text-xs text-rose-300">Fallen in Battle</p>
            <h2 className="font-display text-2xl font-semibold text-[#F7F1E3]">
              Return to the Palace Courtyard
            </h2>
            <p className="text-sm text-[#C9C1B2]">
              The sages of Ayodhya restore your vitality so you may continue
              defending the realm.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onRevive}
              className="w-full rounded-md bg-[#D99B26] px-5 py-2.5 text-sm font-semibold text-[#101319] hover:bg-[#E8AE3B] cursor-pointer"
            >
              Revive at Palace
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="w-full rounded-md border border-amber-200/25 bg-[#141822] px-5 py-2.5 text-sm font-medium text-[#EFE9DC] hover:border-amber-300/60 cursor-pointer"
            >
              Restart World
            </button>
          </div>
        </div>
      </div>
    );
  }

  // VICTORY
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#0D1016]/75 p-6">
      <div className="w-full max-w-[480px] rounded-xl border border-amber-300/50 bg-[#0D1016]/95 p-7 space-y-5">
        <div className="space-y-1">
          <p className="text-xs text-emerald-300">All Realms Secured</p>
          <h2 className="font-display text-3xl font-semibold text-[#F7F1E3]">
            Victory of Dharma in Ayodhya
          </h2>
          <p className="text-sm leading-relaxed text-[#C9C1B2]">
            Commander Viradha’s vanguard has been shattered across the Sarayu
            and Panchavati. Peace returns to the golden avenues of Ayodhya.
          </p>
        </div>

        <div className="rounded-md border border-amber-200/15 bg-[#131720] p-4 font-mono-tabular text-xs text-amber-200">
          Final Karma: {hud.karma} · Missions Cleared: {hud.completedMissions}/
          {hud.totalMissions}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onResume}
            className="flex-1 rounded-md bg-[#D99B26] px-5 py-2.5 text-sm font-semibold text-[#101319] hover:bg-[#E8AE3B] cursor-pointer"
          >
            Continue Free Roam
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-amber-200/25 bg-[#141822] px-5 py-2.5 text-sm font-medium text-[#EFE9DC] hover:border-amber-300/60 cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>Play Again</span>
          </button>
        </div>
      </div>
    </div>
  );
});
