import React from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { PlayMode, WorldHudSnapshot } from '../types/world';

interface OverlayModalsProps {
  mode: PlayMode;
  hud: WorldHudSnapshot;
  onStartGame: () => void;
  onResume: () => void;
  onRevive: () => void;
  onRestart: () => void;
}

export const OverlayModals: React.FC<OverlayModalsProps> = ({
  mode,
  hud,
  onStartGame,
  onResume,
  onRevive,
  onRestart,
}) => {
  if (mode === 'PLAYING') return null;

  if (mode === 'TITLE') {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#0D1016]/65 p-6">
        <div className="w-full max-w-[560px] rounded-xl border border-amber-300/35 bg-[#0D1016]/95 p-7 sm:p-8 space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wider text-amber-300">
              3D Open-World Action Adventure
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#F7F1E3]">
              Ayodhya Chronicles: Lord Ram
            </h1>
            <p className="text-sm sm:text-base leading-relaxed text-[#C9C1B2]">
              Explore Ayodhya’s seven-story Suryavanshi Palace, Sabha throne hall,
              sacred stepwell, stables, and training grounds, then ride two and a
              half kilometers east by Ratha across the Sarayu to the Volcanic
              Demon Village.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-amber-200/15 bg-[#131720] p-4 text-xs text-[#DFD7C8]">
            <div className="space-y-1">
              <p className="font-semibold text-amber-300">Touchscreen Controls</p>
              <p>Right Joystick: Move, Swim &amp; Steer</p>
              <p>Drag / Pinch: Free 360° Camera &amp; Zoom</p>
              <p>Left Buttons: Bow, Chakra, Stealth, Mount/Throne</p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-amber-300">Keyboard &amp; Mouse</p>
              <p>WASD / Arrows: Move, Swim &amp; Steer</p>
              <p>Mouse Drag / Wheel: Free Orbit &amp; Zoom</p>
              <p>F: Bow · Q: Chakra · E: Mount / Throne · V: Auto-Drive · C: Stealth</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onStartGame}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#D99B26] px-6 py-3.5 text-sm font-semibold text-[#101319] hover:bg-[#E8AE3B] transition-colors cursor-pointer"
          >
            <Play className="h-4 w-4 fill-current" aria-hidden="true" />
            <span>Start Game</span>
          </button>
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
};
