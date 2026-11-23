import React from 'react';
import { Lock } from 'lucide-react';
import { ASTRA_CONFIG } from '../engine/astraConfig';
import { AstraId } from '../types/world';

interface AstraGlyphProps {
  id: AstraId;
  size?: number;
}

export const AstraGlyphSvg: React.FC<AstraGlyphProps> = React.memo(({ id, size = 24 }) => {
  switch (id) {
    case 'AGNEYASTRA':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path
            d="M16 3C18.5 8 23.5 11.2 23.5 17.4C23.5 22.8 20.1 26.8 16 28.5C11.9 26.8 8.5 22.8 8.5 17.4C8.5 13.6 10.6 10.7 12.2 9.1C12.1 11.6 13.4 13.1 14.5 13.6C14.1 9.6 14.9 5.9 16 3Z"
            fill="#FF7A1A"
            stroke="#FFD24D"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M16 12.5C17.8 15.2 19.6 17.4 19.6 20.4C19.6 23.2 18 25.4 16 26.4C14 25.4 12.4 23.2 12.4 20.4C12.4 17.6 14.2 15.2 16 12.5Z"
            fill="#FFE28A"
          />
          <path d="M16 2.2L17.9 7.8H14.1L16 2.2Z" fill="#FFF3C4" />
        </svg>
      );

    case 'VARUNASTRA':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          {/* Trident Shaft & Prongs */}
          <path
            d="M16 4V22M16 4L13.5 7.5M16 4L18.5 7.5M10.2 8.5C10.2 13.5 12.6 15.8 16 15.8C19.4 15.8 21.8 13.5 21.8 8.5"
            stroke="#BAE6FD"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Surging Wave Crest */}
          <path
            d="M5.5 23.5C8.2 20.5 11.4 20.5 14 23.2C16.2 25.4 19.2 25.2 21.5 22.8C23.2 21 25 21.2 26.5 23.5C24.1 26.9 20.2 28.4 16 28.4C11.8 28.4 7.9 26.9 5.5 23.5Z"
            fill="#38BDF8"
            stroke="#E0F7FF"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      );

    case 'VAYAVYASTRA':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          {/* Swirling Cyclone Vortex */}
          <path
            d="M6.5 10.5H23.5C25.5 10.5 26.8 9 26.8 7.4C26.8 5.7 25.4 4.5 23.6 4.5C22.1 4.5 20.9 5.5 20.6 6.8"
            stroke="#A7F3D0"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M5 16H21.2C23.5 16 25.2 17.6 25.2 19.6C25.2 21.6 23.5 23.2 21.3 23.2C19.7 23.2 18.4 22.2 18 20.8"
            stroke="#6EE7B7"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M9 21.5H15.5C17.2 21.5 18.4 22.8 18.4 24.4C18.4 26 17.1 27.3 15.3 27.3C14 27.3 13 26.5 12.6 25.4"
            stroke="#34D399"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path d="M25.5 12.5L29 14.5L25.5 16.5" stroke="#EAFFF4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case 'NAGASTRA':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          {/* Coiled Emerald Serpent */}
          <path
            d="M8.5 24.5C8.5 21.5 11.8 20.2 16 20.2C20.2 20.2 23.5 21.5 23.5 24.2C23.5 26.6 20.1 27.8 16 27.8C12 27.8 9.2 26.7 8.5 24.5Z"
            fill="#16A34A"
            stroke="#86EFAC"
            strokeWidth="1.2"
          />
          <path
            d="M16 20.5C12.5 19.6 11.2 16.8 12.8 14.2C14.1 12.1 13.5 9.2 16 6.2C18.5 9.2 17.9 12.1 19.2 14.2C20.8 16.8 19.5 19.6 16 20.5Z"
            fill="#4ADE80"
            stroke="#DCFCE7"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {/* Twin Fangs & Eyes */}
          <path d="M16 6.2L14.5 3.4M16 6.2L17.5 3.4" stroke="#FDE047" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="14.6" cy="10.2" r="0.9" fill="#0B2E17" />
          <circle cx="17.4" cy="10.2" r="0.9" fill="#0B2E17" />
        </svg>
      );

    case 'BRAHMASTRA':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          {/* Radiant Magenta-Gold Outer Lotus Petals */}
          <path
            d="M16 3.5C18.5 7.5 20.5 11.2 16 15.8C11.5 11.2 13.5 7.5 16 3.5Z"
            fill="#FBBF24"
            stroke="#FFFBEB"
            strokeWidth="1.1"
          />
          <path
            d="M6.2 9.5C10.5 10.5 13.4 12.8 15 17C10.4 17 7.6 14.2 6.2 9.5Z"
            fill="#FF5FA2"
            stroke="#FDE68A"
            strokeWidth="1"
          />
          <path
            d="M25.8 9.5C21.5 10.5 18.6 12.8 17 17C21.6 17 24.4 14.2 25.8 9.5Z"
            fill="#FF5FA2"
            stroke="#FDE68A"
            strokeWidth="1"
          />
          <path
            d="M4.5 19.5C8.5 17.5 12.4 17.8 15 21C10.8 23.2 7.2 22.6 4.5 19.5Z"
            fill="#F59E0B"
            stroke="#FDE68A"
            strokeWidth="1"
          />
          <path
            d="M27.5 19.5C23.5 17.5 19.6 17.8 17 21C21.2 23.2 24.8 22.6 27.5 19.5Z"
            fill="#F59E0B"
            stroke="#FDE68A"
            strokeWidth="1"
          />
          {/* Sun Core & Base */}
          <circle cx="16" cy="18.2" r="4.2" fill="#FFF7CC" stroke="#FBBF24" strokeWidth="1.4" />
          <path d="M10.5 25.5H21.5L19.2 28.2H12.8L10.5 25.5Z" fill="#FBBF24" stroke="#FEF08A" strokeWidth="1" />
        </svg>
      );
  }
});

interface AstraIconBadgeProps {
  id: AstraId;
  size?: number;
  unlocked?: boolean;
  active?: boolean;
  className?: string;
}

export const AstraIconBadge: React.FC<AstraIconBadgeProps> = React.memo(
  ({ id, size = 32, unlocked = true, active = false, className = '' }) => {
    const cfg = ASTRA_CONFIG[id];
    const glyphSize = Math.round(size * 0.68);

    return (
      <div
        style={{
          width: size,
          height: size,
          borderColor: active
            ? cfg.cssAccent
            : unlocked
            ? 'rgba(251, 191, 36, 0.35)'
            : 'rgba(148, 163, 184, 0.2)',
          boxShadow: active ? `0 0 10px ${cfg.cssAccent}66` : undefined,
        }}
        className={`relative inline-flex shrink-0 items-center justify-center rounded-full border-2 bg-[#12161F] transition-colors ${
          unlocked ? 'opacity-100' : 'opacity-40 grayscale'
        } ${className}`}
        title={unlocked ? cfg.name : `${cfg.name} (Locked)`}
      >
        <AstraGlyphSvg id={id} size={glyphSize} />
        {!unlocked && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-slate-500/60 bg-[#0D1016]">
            <Lock className="h-2 w-2 text-slate-300" aria-hidden="true" />
          </span>
        )}
      </div>
    );
  }
);
