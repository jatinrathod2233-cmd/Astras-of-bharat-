import React from 'react';
import { RadarBlip } from '../types/world';
import { RIVER_CENTER_X } from '../engine/worldData';

interface MinimapRadarProps {
  playerX: number;
  playerZ: number;
  playerYaw: number;
  blips: RadarBlip[];
}

export const MinimapRadar: React.FC<MinimapRadarProps> = ({
  playerX,
  playerZ,
  playerYaw,
  blips,
}) => {
  const radarSize = 80;
  const center = radarSize / 2;
  const scale = 0.43; // maps ~90m radius into compact 80px radar circle

  const toRadar = (wx: number, wz: number) => {
    const dx = wx - playerX;
    const dz = wz - playerZ;
    // Rotate world delta by -playerYaw so top of radar aligns with camera look
    const cos = Math.cos(-playerYaw);
    const sin = Math.sin(-playerYaw);
    const rx = dx * cos - dz * sin;
    const rz = dx * sin + dz * cos;

    let sx = center + rx * scale;
    let sy = center + rz * scale;
    const dist = Math.hypot(sx - center, sy - center);
    const maxR = center - 5;
    if (dist > maxR) {
      sx = center + ((sx - center) / dist) * maxR;
      sy = center + ((sy - center) / dist) * maxR;
    }
    return { x: sx, y: sy, clamped: dist > maxR };
  };

  // Approximate Sarayu River line endpoints on radar
  const riverTop = toRadar(RIVER_CENTER_X, playerZ - 90);
  const riverBot = toRadar(RIVER_CENTER_X, playerZ + 90);

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
          x1={riverTop.x}
          y1={riverTop.y}
          x2={riverBot.x}
          y2={riverBot.y}
          stroke="rgba(64,164,196,0.38)"
          strokeWidth="4.5"
        />

        {/* Radar Blips */}
        {blips.map((b) => {
          const p = toRadar(b.x, b.z);
          if (b.kind === 'WAYPOINT') {
            return (
              <g key={b.id}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={4.2}
                  fill="none"
                  stroke="#F6C343"
                  strokeWidth="1.5"
                />
                <circle cx={p.x} cy={p.y} r={1.6} fill="#F6C343" />
              </g>
            );
          }
          if (b.kind === 'RATHA') {
            return (
              <rect
                key={b.id}
                x={p.x - 2}
                y={p.y - 2}
                width={4}
                height={4}
                fill="#E8AE3B"
              />
            );
          }
          return (
            <circle
              key={b.id}
              cx={p.x}
              cy={p.y}
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
};
