import React from 'react';
import {
  CheckCircle2,
  Crown,
  Shield,
  Sparkles,
  Swords,
  Wind,
  X,
} from 'lucide-react';
import { HERO_PROFILES, PLAYABLE_HERO_ORDER } from '../engine/heroProfiles';
import { PlayableHeroId } from '../types/world';

interface HeroSwitcherModalProps {
  activeHeroId: PlayableHeroId;
  onSelectHero: (heroId: PlayableHeroId) => void;
  onClose: () => void;
}

function renderHeroGlyph(heroId: PlayableHeroId, accentHex: string) {
  switch (heroId) {
    case 'HANUMAN':
      return <Wind className="h-5 w-5" style={{ color: accentHex }} aria-hidden="true" />;
    case 'RAM':
      return <Crown className="h-5 w-5" style={{ color: accentHex }} aria-hidden="true" />;
    case 'LAKSHMAN':
      return <Swords className="h-5 w-5" style={{ color: accentHex }} aria-hidden="true" />;
    case 'BHARAT':
      return <Shield className="h-5 w-5" style={{ color: accentHex }} aria-hidden="true" />;
  }
}

export const HeroSwitcherModal: React.FC<HeroSwitcherModalProps> = React.memo(
  ({ activeHeroId, onSelectHero, onClose }) => {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Dynamic Deity Hero Selection"
        className="absolute inset-0 z-50 flex items-center justify-center bg-[#090B10]/85 p-3 sm:p-5 select-none"
      >
        <div className="w-full max-w-[780px] max-h-[92vh] overflow-y-auto rounded-xl border border-amber-300/45 bg-[#0D1016]/95 p-4 sm:p-5 space-y-4 shadow-2xl">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-amber-200/15 pb-3">
            <div className="space-y-0.5 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                Divine Avatar Roster · Instant Swap (H)
              </p>
              <h2 className="font-display text-xl sm:text-2xl font-semibold text-[#F7F1E3]">
                Choose Playable Deity
              </h2>
              <p className="text-xs text-[#B9B0A0]">
                Switch seamlessly mid-adventure — position, quest progress, and vehicles remain preserved.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close character selection"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-amber-200/25 bg-[#151A24] text-[#DFD7C8] hover:border-amber-300 hover:text-amber-200 cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* 4-Hero Selection Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PLAYABLE_HERO_ORDER.map((heroId) => {
              const profile = HERO_PROFILES[heroId];
              const isSelected = activeHeroId === heroId;

              return (
                <div
                  key={heroId}
                  style={{
                    borderColor: isSelected ? profile.accentHex : 'rgba(252, 211, 77, 0.18)',
                    backgroundColor: isSelected ? '#141925' : '#11151F',
                  }}
                  className="flex flex-col justify-between rounded-lg border p-3.5 space-y-2.5 transition-colors"
                >
                  <div className="space-y-2">
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          style={{
                            backgroundColor: profile.badgeBgHex,
                            borderColor: `${profile.accentHex}66`,
                          }}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
                        >
                          {renderHeroGlyph(heroId, profile.accentHex)}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-display text-base font-semibold text-[#F7F1E3] truncate">
                            {profile.name}
                          </h3>
                          <p className="text-[11px] text-[#B9B0A0] truncate">
                            {profile.sanskritTitle}
                          </p>
                        </div>
                      </div>

                      {isSelected && (
                        <span
                          style={{ color: profile.accentHex }}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold shrink-0 whitespace-nowrap"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Active</span>
                        </span>
                      )}
                    </div>

                    {/* Clean Inline Spec Metadata (zero pill clutter) */}
                    <p className="font-mono-tabular text-[11px] text-[#DFD7C8]">
                      HP {profile.maxHp}
                      {' · '}
                      {profile.canFly ? 'Aerial Flight (U)' : 'Ground Combat'}
                      {' · '}
                      CD {profile.specialCooldownSec.toFixed(1)}s
                    </p>

                    {/* Weapon & Signature Ability */}
                    <div className="text-xs text-[#C9C1B2] space-y-1">
                      <p className="truncate">
                        <span className="text-[#9B9384]">Arms:</span>{' '}
                        <span className="text-[#F7F1E3]">{profile.weaponLabel}</span>
                      </p>
                      <p className="leading-snug text-[11.5px]">
                        <span
                          style={{ color: profile.accentHex }}
                          className="inline-flex items-center gap-1 font-semibold mr-1"
                        >
                          <Sparkles className="h-3 w-3 inline" aria-hidden="true" />
                          {profile.specialName}:
                        </span>
                        {profile.specialDescription}
                      </p>
                    </div>
                  </div>

                  {/* Tabular-Nums Combat Ratings + Action */}
                  <div className="space-y-2.5 pt-1 border-t border-amber-200/10">
                    <div className="grid grid-cols-3 gap-2 font-mono-tabular text-[10.5px] text-[#DFD7C8]">
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-[#9B9384]">PWR</span>
                          <span>{profile.powerRating}</span>
                        </div>
                        <div className="h-1 w-full rounded-sm bg-[#1A202C] overflow-hidden">
                          <div
                            className="h-full"
                            style={{
                              width: `${profile.powerRating}%`,
                              backgroundColor: profile.accentHex,
                            }}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-[#9B9384]">SPD</span>
                          <span>{profile.speedRating}</span>
                        </div>
                        <div className="h-1 w-full rounded-sm bg-[#1A202C] overflow-hidden">
                          <div
                            className="h-full bg-sky-400"
                            style={{ width: `${profile.speedRating}%` }}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-[#9B9384]">DEF</span>
                          <span>{profile.defenseRating}</span>
                        </div>
                        <div className="h-1 w-full rounded-sm bg-[#1A202C] overflow-hidden">
                          <div
                            className="h-full bg-emerald-400"
                            style={{ width: `${profile.defenseRating}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectHero(heroId)}
                      style={
                        isSelected
                          ? { borderColor: profile.accentHex, color: profile.accentHex }
                          : { backgroundColor: profile.accentHex }
                      }
                      className={`w-full rounded-md py-1.5 px-3 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        isSelected
                          ? 'border bg-[#192030]'
                          : 'text-[#101319] hover:brightness-110'
                      }`}
                    >
                      {isSelected ? `Playing as ${profile.name}` : `Switch to ${profile.name}`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }
);
