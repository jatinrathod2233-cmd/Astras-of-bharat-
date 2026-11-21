import React, { useRef, useState } from 'react';

interface TouchJoystickProps {
  onChange: (x: number, y: number) => void;
}

export const TouchJoystick: React.FC<TouchJoystickProps> = ({ onChange }) => {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const activePointerId = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [active, setActive] = useState(false);

  const maxRadius = 28;

  const updateFromClient = (clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    setKnobOffset({ x: dx, y: dy });
    // +1 moveY = forward (up on screen = negative dy)
    onChange(dx / maxRadius, -dy / maxRadius);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (activePointerId.current !== null) return;
    activePointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setActive(true);
    updateFromClient(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerId.current !== e.pointerId) return;
    e.stopPropagation();
    updateFromClient(e.clientX, e.clientY);
  };

  const resetStick = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerId.current !== e.pointerId) return;
    e.stopPropagation();
    activePointerId.current = null;
    setActive(false);
    setKnobOffset({ x: 0, y: 0 });
    onChange(0, 0);
  };

  return (
    <div className="fixed bottom-3 right-3 z-20 flex flex-col items-center select-none pointer-events-auto">
      <div
        ref={baseRef}
        role="application"
        aria-label="Movement virtual joystick"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={resetStick}
        onPointerCancel={resetStick}
        onLostPointerCapture={resetStick}
        style={{ touchAction: 'none' }}
        className={`relative h-[88px] w-[88px] rounded-full border transition-colors ${
          active
            ? 'border-amber-400/80 bg-[#0D1016]/65'
            : 'border-amber-300/35 bg-[#0D1016]/45'
        }`}
      >
        {/* Subtle cardinal guide ticks */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1.5 left-1/2 -translate-x-1/2 h-1 w-0.5 bg-amber-300/40"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 h-1 w-0.5 bg-amber-300/40"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 h-0.5 w-1 bg-amber-300/40"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-0.5 w-1 bg-amber-300/40"
        />

        {/* Draggable Thumb Knob */}
        <div
          aria-hidden="true"
          style={{
            transform: `translate(calc(-50% + ${knobOffset.x}px), calc(-50% + ${knobOffset.y}px))`,
          }}
          className={`pointer-events-none absolute left-1/2 top-1/2 h-9 w-9 rounded-full border shadow-sm ${
            active
              ? 'border-amber-200 bg-[#D99B26]/90'
              : 'border-amber-300/70 bg-[#B67E1C]/80'
          }`}
        />
      </div>
    </div>
  );
};
