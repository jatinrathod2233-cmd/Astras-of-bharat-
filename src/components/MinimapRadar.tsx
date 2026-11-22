import React from 'react';
import { RadarBlip } from '../types/world';
import { RIVER_CENTER_X } from '../engine/worldData';

interface MinimapRadarProps {
  playerX: number;
  playerZ: number;
  playerYaw: number;
  blips: RadarBlip[];
}

export const MinimapRadar: React.FC<MinimapRadarProps> = React.memo(
  ({ playerX, playerZ, playerYaw, blips }) => {
    const radarSize = 80;
    const center = radarSize / 2;
    const scale = 0.43; // maps ~90m radius into compact 80px radar circle
    const maxR = center - 5;
    const cos = Math.cos(-playerYaw);
    const sin = Math.sin(-playerYaw);

    const project = (wx: number, wz: number): [number, number] => {
      const dx = wx - playerX;
      const dz = wz - playerZ;
      const rx = dx * cos - dz * sin;
      const rz = dx * sin + dz * cos;
      let sx = center + rx * scale;
      let sy = center + rz * scale;
      const ox = sx - center;
      const oy = sy - center;
      const dSq = ox * ox + oy * oy;
      if (dSq > maxR * maxR) {
        const inv = maxR / Math.sqrt(dSq);
        sx = center + ox * inv;
        sy = center + oy * inv;
      }
      return [sx, sy];
    };

    const [rtX, rtY] = project(RIVER_CENTER_X, playerZ - 90);
    const [rbX, rbY] = project(RIVER_CENTER_X, playerZ + 90);

    return (
      <div
        aria-label="Open world radar minimap"
        className="relative h-[80px] w-[80px] shrink-0 overflow-hidden rounded-full border border-amber-300/35 bg-[#0D1016]/55"
      >
        <svg viewBox={`0 0 ${radarSize} ${radarSize}`} className="h-full w-full">
          {/* Range rings */}
          <circle
            cx={center}
            cy={center}
            r={center - 13}
            fill="none"
            stroke="rgba(239,233,220,0.1)"
          />
          <circle
            cx={center}
            cy={center}
            r={center - 25}
            fill="none"
            stroke="rgba(239,233,220,0.08)"
          />

          {/* Sarayu River Indicator */}
          <line
            x1={rtX}
            y1={rtY}
            x2={rbX}
            y2={rbY}
            stroke="rgba(64,164,196,0.38)"
            strokeWidth="4.5"
          />

          {/* Radar Blips */}
          {blips.map((b) => {
            const [px, py] = project(b.x, b.z);
            if (b.kind === 'WAYPOINT') {
              return (
                <g key={b.id}>
                  <circle
                    cx={px}
                    cy={py}
                    r={4.2}
                    fill="none"
                    stroke="#F6C343"
                    strokeWidth="1.5"
                  />
                  <circle cx={px} cy={py} r={1.6} fill="#F6C343" />
                </g>
              );
            }
            if (b.kind === 'RATHA') {
              return (
                <rect
                  key={b.id}
                  x={px - 2}
                  y={py - 2}
                  width={4}
                  height={4}
                  fill="#E8AE3B"
                />
              );
            }
            return (
              <circle
                key={b.id}
                cx={px}
                cy={py}
                r={b.kind === 'COMMANDER' ? 3 : 2}
                fill={b.kind === 'COMMANDER' ? '#FF4D2E' : '#E05A47'}
              />
            );
          })}

          {/* Lord Ram center triangle */}
          <polygon
            points={`${center},${center - 4.5} ${center - 3.5},${center + 3.5} ${
              center + 3.5
            },${center + 3.5}`}
            fill="#63B3ED"
            stroke="#F7F1E3"
            strokeWidth="0.9"
          />
        </svg>
      </div>
    );
  }
);
