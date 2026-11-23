import React, { useEffect, useRef } from 'react';
import { RadarBlip } from '../types/world';
import { RIVER_CENTER_X } from '../engine/worldData';

interface MinimapRadarProps {
  playerX: number;
  playerZ: number;
  playerYaw: number;
  blips: RadarBlip[];
}

const RADAR_SIZE = 80;
const CENTER = RADAR_SIZE / 2;
const SCALE = 0.43; // maps ~90m radius into compact 80px radar circle
const MAX_R = CENTER - 5;
const MIN_DRAW_INTERVAL_MS = 75; // ~13 FPS radar redraw cap

export const MinimapRadar: React.FC<MinimapRadarProps> = React.memo(
  ({ playerX, playerZ, playerYaw, blips }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const lastDrawTsRef = useRef<number>(0);

    useEffect(() => {
      const now = performance.now();
      if (now - lastDrawTsRef.current < MIN_DRAW_INTERVAL_MS) return;
      lastDrawTsRef.current = now;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, RADAR_SIZE, RADAR_SIZE);

      // Range rings
      ctx.strokeStyle = 'rgba(239,233,220,0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, CENTER - 13, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(239,233,220,0.08)';
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, CENTER - 25, 0, Math.PI * 2);
      ctx.stroke();

      const cos = Math.cos(-playerYaw);
      const sin = Math.sin(-playerYaw);

      const project = (wx: number, wz: number): [number, number] => {
        const dx = wx - playerX;
        const dz = wz - playerZ;
        const rx = dx * cos - dz * sin;
        const rz = dx * sin + dz * cos;
        let sx = CENTER + rx * SCALE;
        let sy = CENTER + rz * SCALE;
        const ox = sx - CENTER;
        const oy = sy - CENTER;
        const dSq = ox * ox + oy * oy;
        if (dSq > MAX_R * MAX_R) {
          const inv = MAX_R / Math.sqrt(dSq);
          sx = CENTER + ox * inv;
          sy = CENTER + oy * inv;
        }
        return [sx, sy];
      };

      // Sarayu River indicator
      const [rtX, rtY] = project(RIVER_CENTER_X, playerZ - 90);
      const [rbX, rbY] = project(RIVER_CENTER_X, playerZ + 90);
      ctx.strokeStyle = 'rgba(64,164,196,0.38)';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(rtX, rtY);
      ctx.lineTo(rbX, rbY);
      ctx.stroke();

      // Radar Blips
      for (let i = 0; i < blips.length; i++) {
        const b = blips[i];
        const [px, py] = project(b.x, b.z);
        if (b.kind === 'WAYPOINT') {
          ctx.strokeStyle = '#F6C343';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(px, py, 4.2, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#F6C343';
          ctx.beginPath();
          ctx.arc(px, py, 1.6, 0, Math.PI * 2);
          ctx.fill();
        } else if (b.kind === 'RATHA') {
          ctx.fillStyle = '#E8AE3B';
          ctx.fillRect(px - 2, py - 2, 4, 4);
        } else {
          ctx.fillStyle = b.kind === 'COMMANDER' ? '#FF4D2E' : '#E05A47';
          ctx.beginPath();
          ctx.arc(px, py, b.kind === 'COMMANDER' ? 3 : 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Lord Ram center triangle
      ctx.fillStyle = '#63B3ED';
      ctx.strokeStyle = '#F7F1E3';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(CENTER, CENTER - 4.5);
      ctx.lineTo(CENTER - 3.5, CENTER + 3.5);
      ctx.lineTo(CENTER + 3.5, CENTER + 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }, [playerX, playerZ, playerYaw, blips]);

    return (
      <div
        aria-label="Open world radar minimap"
        className="relative h-[80px] w-[80px] shrink-0 overflow-hidden rounded-full border border-amber-300/35 bg-[#0D1016]/55"
      >
        <canvas
          ref={canvasRef}
          width={RADAR_SIZE}
          height={RADAR_SIZE}
          className="block h-full w-full"
        />
      </div>
    );
  }
);
