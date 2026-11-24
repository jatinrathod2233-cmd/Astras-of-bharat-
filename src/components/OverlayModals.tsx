import React, { useState } from 'react';
import { BookOpen, CheckCircle2, Lock, Play, RotateCcw, Settings, SlidersHorizontal, Wifi } from 'lucide-react';
import { ASTRA_CONFIG } from '../engine/astraConfig';
import type { LanSessionSnapshot } from '../engine/LanMultiplayerClient';
import { PlayMode, QualityMode, WorldHudSnapshot } from '../types/world';
import { AstraIconBadge } from './AstraIcons';

interface OverlayModalsProps {
  mode: PlayMode;
  hud: WorldHudSnapshot;
  showPerfStats: boolean;
  lanSession: LanSessionSnapshot;
  onStartGame: () => void;
  onResume: () => void;
  onRevive: () => void;
  onRestart: () => void;
  onChangeQualityMode: (mode: QualityMode) => void;
  onRerunBenchmark: () => void;
  onTogglePerfStats: () => void;
  onOpenControlCustomizer: () => void;
  onOpenLanMultiplayer: () => void;
  onDismissStoryIntro: () => void;
  onDismissUnlockPopup: () => void;
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
  lanSession,
  onStartGame,
  onResume,
  onRevive,
  onRestart,
  onChangeQualityMode,
  onRerunBenchmark,
  onTogglePerfStats,
  onOpenControlCustomizer,
  onOpenLanMultiplayer,
  onDismissStoryIntro,
  onDismissUnlockPopup,
}) => {
  const [pauseTab, setPauseTab] = useState<'SETTINGS' | 'JOURNAL'>('SETTINGS');

  if (mode === 'PLAYING') {
    if (hud.showStoryIntro) {
      return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0D1016]/80 p-5">
          <div className="w-full max-w-[460px] rounded-xl border border-amber-300/45 bg-[#0D1016]/95 p-6 space-y-4">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                Sage Vashistha’s Counsel
              </p>
              <h2 className="font-display text-2xl font-semibold text-[#F7F1E3]">
                The Five Divine Astras
              </h2>
            </div>

            <p className="text-sm leading-relaxed text-[#DFD7C8]">
              “O Prince Ram, the Rakshasa legions gather strength across the Sarayu
              and volcanic badlands. Four elemental Astras lie sealed in ancient
              shrines—Fire, Water, Wind, and Serpent. Gather all four to unlock the
              supreme trial of the Brahmastra at Ayodhya’s central sanctum.”
            </p>

            <div className="rounded-md border border-amber-200/15 bg-[#131720] px-3.5 py-2.5 text-xs text-[#C9C1B2] space-y-1">
              <p>
                <span className="text-amber-300 font-semibold">Touch:</span> Hold{' '}
                <span className="text-[#F7F1E3]">દિવ્યાસ્ત્ર</span> to pick an Astra, tap{' '}
                <span className="text-[#F7F1E3]">Shoot (X)</span> to unleash.
              </p>
              <p>
                <span className="text-amber-300 font-semibold">Keyboard:</span> Hold{' '}
                <span className="text-[#F7F1E3]">Q</span> (or press 1–5) to equip,{' '}
                <span className="text-[#F7F1E3]">X</span> to shoot,{' '}
                <span className="text-[#F7F1E3]">R</span> for Chakra.
              </p>
            </div>

            <button
              type="button"
              onClick={onDismissStoryIntro}
              className="w-full rounded-md bg-[#D99B26] px-5 py-2.5 text-sm font-semibold text-[#101319] hover:bg-[#E8AE3B] cursor-pointer"
            >
              Begin Sacred Quest
            </button>
          </div>
        </div>
      );
    }

    if (hud.astraUnlockPopup) {
      const popup = hud.astraUnlockPopup;
      const cfg = ASTRA_CONFIG[popup.id];
      return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0D1016]/75 p-5">
          <div
            style={{ borderColor: `${cfg.cssAccent}88` }}
            className="w-full max-w-[400px] rounded-xl border-2 bg-[#0D1016]/95 p-6 text-center space-y-4"
          >
            <div className="flex justify-center">
              <AstraIconBadge id={popup.id} size={58} unlocked active />
            </div>

            <div className="space-y-1">
              <p
                style={{ color: cfg.cssAccent }}
                className="text-[11px] font-semibold uppercase tracking-wider"
              >
                Divine Astra Earned · {cfg.sanskritTitle}
              </p>
              <h2 className="font-display text-2xl font-bold text-[#F7F1E3]">
                {popup.name}
              </h2>
            </div>

            <p className="text-xs leading-relaxed text-[#DFD7C8]">{popup.oneLineStory}</p>

            <button
              type="button"
              onClick={onDismissUnlockPopup}
              className="w-full rounded-md bg-[#D99B26] px-5 py-2.5 text-sm font-semibold text-[#101319] hover:bg-[#E8AE3B] cursor-pointer"
            >
              Wield {popup.name}
            </button>
          </div>
        </div>
      );
    }

    return null;
  }

  if (mode === 'TITLE') {
    const pct = hud.assetsReady
      ? 100
      : Math.min(99, Math.max(0, Math.round(hud.assetProgress)));

    return (
      <div className="fixed inset-0 z-30 pointer-events-none select-none">
        {/* Central Start Button & Offline LAN Co-op Entry */}
        <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 p-6 pointer-events-none">
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

          <button
            type="button"
            disabled={!hud.assetsReady}
            onClick={onOpenLanMultiplayer}
            aria-label="Offline Hotspot Co-op Multiplayer"
            className={`pointer-events-auto inline-flex min-w-[200px] items-center justify-center gap-2 rounded-lg border px-5 py-2.5 text-xs font-semibold tracking-wide transition-all duration-200 ${
              hud.assetsReady
                ? 'border-amber-300/65 bg-[#0D1016]/90 text-amber-200 opacity-100 hover:border-amber-300 hover:bg-[#171C27] cursor-pointer shadow-md'
                : 'border-amber-200/15 bg-[#0D1016]/55 text-amber-200/50 opacity-40 cursor-not-allowed'
            }`}
          >
            <Wifi className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
            <span>
              {lanSession.active
                ? `Hotspot Lobby (${lanSession.players.length}/6)`
                : 'Offline Hotspot Co-op (2–6)'}
            </span>
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
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#0D1016]/75 p-4 sm:p-6">
        <div className="w-full max-w-[480px] max-h-[90vh] overflow-y-auto rounded-xl border border-amber-300/35 bg-[#0D1016]/95 p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs text-amber-300">{hud.districtName}</p>
              <h2 className="font-display text-2xl font-semibold text-[#F7F1E3]">
                Game Paused
              </h2>
            </div>

            <div className="flex rounded-md border border-amber-200/20 bg-[#131720] p-0.5">
              <button
                type="button"
                onClick={() => setPauseTab('SETTINGS')}
                className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
                  pauseTab === 'SETTINGS'
                    ? 'bg-[#D99B26] text-[#101319] font-semibold'
                    : 'text-[#C9C1B2] hover:text-[#F7F1E3]'
                }`}
              >
                <Settings className="h-3 w-3" aria-hidden="true" />
                <span>Settings</span>
              </button>
              <button
                type="button"
                onClick={() => setPauseTab('JOURNAL')}
                className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
                  pauseTab === 'JOURNAL'
                    ? 'bg-[#D99B26] text-[#101319] font-semibold'
                    : 'text-[#C9C1B2] hover:text-[#F7F1E3]'
                }`}
              >
                <BookOpen className="h-3 w-3" aria-hidden="true" />
                <span>Journal ({hud.astraQuest.unlockedCount}/5)</span>
              </button>
            </div>
          </div>

          {pauseTab === 'SETTINGS' ? (
            <>
              <div className="space-y-1.5 rounded-md border border-amber-200/15 bg-[#131720] p-3.5 text-xs text-[#C9C1B2]">
                <p className="font-mono-tabular">
                  Karma: {hud.karma} · Astras: {hud.astraQuest.unlockedCount}/5 ·
                  Missions: {hud.completedMissions}/{hud.totalMissions}
                </p>
                <p className="text-[11px] text-[#9B9384]">
                  Q (Hold): Divyastra Wheel · X: Shoot Astra · R: Chakra · F: Bow · E:
                  Interact · C: Stealth · V: Auto-Drive
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
                    {hud.fps}/{hud.targetFps} FPS · {Math.round(hud.resolutionScale * 100)}%
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

                {hud.hardwareBenchmark && (
                  <div className="rounded border border-amber-200/15 bg-[#0F131B] px-3 py-2 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[#C9C1B2]">
                        Hardware Lock:{' '}
                        <span className="font-semibold text-emerald-300">
                          {hud.hardwareBenchmark.lockedTier} ({hud.hardwareBenchmark.targetFps} FPS)
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={onRerunBenchmark}
                        className="rounded border border-amber-200/25 bg-[#181D28] px-2 py-0.5 text-[10px] font-medium text-amber-200 hover:border-amber-300/60 cursor-pointer"
                      >
                        Re-Profile
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 font-mono-tabular text-[10px] text-[#DFD7C8]">
                      <span>CPU: {hud.hardwareBenchmark.cpuScore}/100</span>
                      <span>GPU: {hud.hardwareBenchmark.gpuScore}/100</span>
                      <span>RAM: {hud.hardwareBenchmark.ramScore}/100</span>
                    </div>
                  </div>
                )}

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

                <div className="pt-2 border-t border-amber-200/10 space-y-2">
                  <button
                    type="button"
                    onClick={onOpenControlCustomizer}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-amber-300/60 bg-[#1B2130] px-4 py-2 text-xs font-semibold tracking-wider text-amber-200 hover:border-amber-300 hover:bg-[#242B3E] cursor-pointer transition-colors"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
                    <span>CUSTOMIZE CONTROLS</span>
                  </button>

                  <button
                    type="button"
                    onClick={onOpenLanMultiplayer}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-emerald-400/45 bg-[#121C22] px-4 py-2 text-xs font-semibold tracking-wider text-emerald-200 hover:border-emerald-300 hover:bg-[#18262E] cursor-pointer transition-colors"
                  >
                    <Wifi className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                    <span>
                      {lanSession.active
                        ? `LAN HOTSPOT ROOM (${lanSession.players.length}/6)`
                        : 'OFFLINE WI-FI HOTSPOT (2–6)'}
                    </span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
              {hud.astraQuest.astras.map((entry) => {
                const cfg = ASTRA_CONFIG[entry.id];
                return (
                  <div
                    key={entry.id}
                    className="rounded-md border border-amber-200/15 bg-[#131720] p-3 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <AstraIconBadge
                          id={entry.id}
                          size={30}
                          unlocked={entry.unlocked}
                          active={entry.unlocked}
                        />
                        <div>
                          <p
                            style={{ color: entry.unlocked ? cfg.cssAccent : '#C9C1B2' }}
                            className="text-xs font-semibold"
                          >
                            {entry.name}
                          </p>
                          <p className="text-[10px] text-[#9B9384]">{entry.title}</p>
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold ${
                          entry.unlocked
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/35'
                            : 'bg-slate-800/80 text-slate-300 border border-slate-600/40'
                        }`}
                      >
                        {entry.unlocked ? (
                          <>
                            <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
                            <span>Collected</span>
                          </>
                        ) : (
                          <>
                            <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                            <span>Locked</span>
                          </>
                        )}
                      </span>
                    </div>

                    <p className="text-[11px] leading-relaxed text-[#DFD7C8]">
                      {entry.story}
                    </p>
                    {!entry.unlocked && (
                      <p className="text-[10.5px] leading-snug text-amber-200/85 border-t border-amber-200/10 pt-1">
                        Hint: {entry.hint}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

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
