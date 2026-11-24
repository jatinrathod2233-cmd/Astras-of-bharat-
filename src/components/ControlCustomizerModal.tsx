import React, { useCallback, useRef, useState } from 'react';
import {
  ArrowUp,
  Check,
  Compass,
  Crosshair,
  Crown,
  EyeOff,
  Flame,
  Minus,
  Move,
  Plus,
  RotateCcw,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  clampControlPlacement,
  clampScale,
  clearSavedControlLayout,
  computeControlPixelRect,
  CONTROL_META,
  CONTROL_ORDER,
  ControlId,
  ControlLayoutMap,
  getDefaultControlLayout,
  resolveControlOverlaps,
  saveControlLayout,
} from '../utils/controlLayout';

interface ControlCustomizerModalProps {
  layout: ControlLayoutMap;
  viewport: { w: number; h: number };
  onChangeLayout: (next: ControlLayoutMap) => void;
  onClose: () => void;
}

type DragMode =
  | {
      kind: 'MOVE';
      id: ControlId;
      pointerId: number;
      offsetX: number;
      offsetY: number;
    }
  | {
      kind: 'RESIZE';
      id: ControlId;
      pointerId: number;
      cx: number;
      cy: number;
      baseHalfDiag: number;
    };

export const ControlCustomizerModal: React.FC<ControlCustomizerModalProps> = React.memo(
  ({ layout, viewport, onChangeLayout, onClose }) => {
    const [selectedId, setSelectedId] = useState<ControlId>('FIRE_BOW');
    const [activeDragId, setActiveDragId] = useState<ControlId | null>(null);
    const dragRef = useRef<DragMode | null>(null);
    const layoutRef = useRef<ControlLayoutMap>(layout);
    layoutRef.current = layout;

    const vw = viewport.w;
    const vh = viewport.h;

    const selectedMeta = CONTROL_META[selectedId];
    const selectedPlacement = layout[selectedId];
    const selectedRect = computeControlPixelRect(
      selectedId,
      selectedPlacement,
      vw,
      vh
    );

    // Dock the compact inspector opposite the selected control so it never obscures editing
    const dockBottom = selectedRect.cy < vh * 0.48;

    const commitAndSave = useCallback(
      (candidate: ControlLayoutMap, pinnedId: ControlId | null) => {
        const resolved = resolveControlOverlaps(candidate, pinnedId, vw, vh);
        onChangeLayout(resolved);
        saveControlLayout(resolved);
      },
      [vw, vh, onChangeLayout]
    );

    const handleControlPointerDown = (
      id: ControlId,
      e: React.PointerEvent<HTMLDivElement>
    ) => {
      e.stopPropagation();
      setSelectedId(id);
      const rect = computeControlPixelRect(id, layoutRef.current[id], vw, vh);
      dragRef.current = {
        kind: 'MOVE',
        id,
        pointerId: e.pointerId,
        offsetX: e.clientX - rect.cx,
        offsetY: e.clientY - rect.cy,
      };
      setActiveDragId(id);
      e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handleResizePointerDown = (
      id: ControlId,
      e: React.PointerEvent<HTMLButtonElement>
    ) => {
      e.stopPropagation();
      setSelectedId(id);
      const meta = CONTROL_META[id];
      const rect = computeControlPixelRect(id, layoutRef.current[id], vw, vh);
      const baseHalfDiag = Math.max(
        18,
        Math.hypot(meta.baseWidth * 0.5, meta.baseHeight * 0.5)
      );
      dragRef.current = {
        kind: 'RESIZE',
        id,
        pointerId: e.pointerId,
        cx: rect.cx,
        cy: rect.cy,
        baseHalfDiag,
      };
      setActiveDragId(id);
      e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      e.stopPropagation();

      const curr = layoutRef.current[drag.id];
      if (drag.kind === 'MOVE') {
        const targetCx = e.clientX - drag.offsetX;
        const targetCy = e.clientY - drag.offsetY;
        const clamped = clampControlPlacement(
          drag.id,
          { nx: targetCx / vw, ny: targetCy / vh, scale: curr.scale },
          vw,
          vh
        );
        onChangeLayout({
          ...layoutRef.current,
          [drag.id]: clamped,
        });
      } else {
        const dist = Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy);
        const rawScale = dist / drag.baseHalfDiag;
        const nextScale = clampScale(drag.id, rawScale);
        const clamped = clampControlPlacement(
          drag.id,
          { nx: curr.nx, ny: curr.ny, scale: nextScale },
          vw,
          vh
        );
        onChangeLayout({
          ...layoutRef.current,
          [drag.id]: clamped,
        });
      }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      e.stopPropagation();
      dragRef.current = null;
      setActiveDragId(null);
      commitAndSave(layoutRef.current, drag.id);
    };

    const handleAdjustScale = (nextRawScale: number) => {
      const curr = layoutRef.current[selectedId];
      const nextScale = clampScale(selectedId, nextRawScale);
      const clamped = clampControlPlacement(
        selectedId,
        { nx: curr.nx, ny: curr.ny, scale: nextScale },
        vw,
        vh
      );
      commitAndSave(
        {
          ...layoutRef.current,
          [selectedId]: clamped,
        },
        selectedId
      );
    };

    const handleResetSelected = () => {
      const defaults = getDefaultControlLayout(vw, vh);
      commitAndSave(
        {
          ...layoutRef.current,
          [selectedId]: defaults[selectedId],
        },
        selectedId
      );
    };

    const handleResetAllDefaults = () => {
      clearSavedControlLayout();
      const defaults = getDefaultControlLayout(vw, vh);
      const resolved = resolveControlOverlaps(defaults, null, vw, vh);
      onChangeLayout(resolved);
    };

    const renderPreviewInner = (id: ControlId, rectScale: number) => {
      switch (id) {
        case 'JOYSTICK': {
          const knobPx = Math.round(36 * rectScale);
          return (
            <div className="relative h-full w-full rounded-full border border-amber-300/60 bg-[#0D1016]/70">
              <span className="pointer-events-none absolute top-1.5 left-1/2 -translate-x-1/2 h-1 w-0.5 bg-amber-300/45" />
              <span className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 h-1 w-0.5 bg-amber-300/45" />
              <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 h-0.5 w-1 bg-amber-300/45" />
              <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-0.5 w-1 bg-amber-300/45" />
              <div
                style={{ width: `${knobPx}px`, height: `${knobPx}px` }}
                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-200 bg-[#D99B26]/85"
              />
            </div>
          );
        }
        case 'FIRE_BOW':
          return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-md border border-amber-300/60 bg-[#12161F]/80 text-[#F5EEDF]">
              <Crosshair className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
              <span className="text-[9px] font-semibold">Bow</span>
            </div>
          );
        case 'CHAKRA':
          return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-md border border-orange-400/75 bg-[#2A1812]/80 text-[#F5EEDF]">
              <Flame className="h-3.5 w-3.5 text-orange-400" aria-hidden="true" />
              <span className="text-[9px] font-semibold">Chakra</span>
            </div>
          );
        case 'ASTRA_WHEEL':
          return (
            <div className="flex h-full w-full items-center justify-center gap-1 rounded-md border border-amber-300/60 bg-[#1B1626]/85 px-1 text-amber-200">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
              <span className="text-[9px] font-semibold leading-none">દિવ્યાસ્ત્ર</span>
            </div>
          );
        case 'SHOOT_ASTRA':
          return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-md border border-amber-300/60 bg-[#1D1528]/85 text-[#F5EEDF]">
              <span className="text-[9px] font-bold tracking-tight">Shoot (X)</span>
              <span className="text-[8px] text-[#C9C1B2]">Astra</span>
            </div>
          );
        case 'JUMP':
          return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-md border border-amber-200/40 bg-[#12161F]/80 text-[#EFE9DC]">
              <ArrowUp className="h-3 w-3 text-amber-200" aria-hidden="true" />
              <span className="text-[9px] font-medium">Jump</span>
            </div>
          );
        case 'SPRINT':
          return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-md border border-amber-200/40 bg-[#12161F]/80 text-[#EFE9DC]">
              <Zap className="h-3 w-3 text-amber-300" aria-hidden="true" />
              <span className="text-[9px] font-medium">Sprint</span>
            </div>
          );
        case 'STEALTH':
          return (
            <div className="flex h-full w-full items-center justify-center gap-1.5 rounded-md border border-amber-200/40 bg-[#12161F]/80 text-[#EFE9DC]">
              <EyeOff className="h-3 w-3 text-sky-300" aria-hidden="true" />
              <span className="text-[9px] font-semibold">Stealth (C)</span>
            </div>
          );
        case 'INTERACT':
          return (
            <div className="flex h-full w-full items-center justify-center gap-1 rounded-md border border-amber-300/80 bg-[#D99B26]/85 px-2 text-[9.5px] font-semibold text-[#101319]">
              <Crown className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">Mount / Throne (E)</span>
            </div>
          );
        case 'AUTO_DRIVE':
          return (
            <div className="flex h-full w-full items-center justify-center gap-1 rounded-md border border-amber-200/45 bg-[#12161F]/80 px-2 text-[9.5px] font-semibold text-[#EFE9DC]">
              <Compass className="h-3 w-3 text-amber-300 shrink-0" aria-hidden="true" />
              <span className="truncate">Auto-Drive (V)</span>
            </div>
          );
      }
    };

    const pct = Math.round(selectedRect.scale * 100);

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Customize Touch Controls"
        style={{ touchAction: 'none' }}
        className="fixed inset-0 z-50 bg-[#0A0D13]/82 select-none overflow-hidden"
      >
        {/* Subtle static HUD safe-zone guides so players avoid covering radar/HP bars */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed top-3 left-3 h-[80px] w-[80px] rounded-full border border-dashed border-amber-200/20 flex items-center justify-center text-[9px] text-amber-200/35"
        >
          Minimap
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none fixed top-3 right-3 h-[56px] w-[132px] rounded-md border border-dashed border-amber-200/20 flex items-center justify-center text-[9px] text-amber-200/35"
        >
          HP / Menu
        </div>

        {/* Interactive Draggable & Resizable Controls */}
        {CONTROL_ORDER.map((id) => {
          const meta = CONTROL_META[id];
          const rect = computeControlPixelRect(id, layout[id], vw, vh);
          const isSelected = selectedId === id;
          const isDragging = activeDragId === id;

          const style: React.CSSProperties =
            id === 'JOYSTICK'
              ? {
                  left: `${rect.left}px`,
                  top: `${rect.top}px`,
                  width: `${Math.round(rect.w)}px`,
                  height: `${Math.round(rect.h)}px`,
                  touchAction: 'none',
                }
              : {
                  left: `${rect.left}px`,
                  top: `${rect.top}px`,
                  width: `${meta.baseWidth}px`,
                  height: `${meta.baseHeight}px`,
                  transform: `scale(${rect.scale})`,
                  transformOrigin: 'top left',
                  touchAction: 'none',
                };

          return (
            <div
              key={id}
              style={style}
              onPointerDown={(e) => handleControlPointerDown(id, e)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onLostPointerCapture={handlePointerUp}
              aria-label={`Drag to reposition ${meta.label}`}
              className={`fixed cursor-grab active:cursor-grabbing ${
                isSelected ? 'z-30' : 'z-20'
              }`}
            >
              {renderPreviewInner(id, rect.scale)}

              {/* Selection / Drag Outline */}
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute -inset-1 ${
                  meta.isCircle ? 'rounded-full' : 'rounded-lg'
                } border-2 ${
                  isDragging
                    ? 'border-emerald-300'
                    : isSelected
                    ? 'border-amber-300 border-dashed'
                    : 'border-amber-200/20 border-dashed'
                }`}
              />

              {/* Selected Control Floating Tag + Corner Resize Drag Handle */}
              {isSelected && (
                <>
                  <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-[#101319]/95 border border-amber-300/60 px-1.5 py-0.5 text-[9px] font-semibold text-amber-200">
                    {meta.shortLabel} · {Math.round(rect.scale * 100)}%
                  </span>
                  <button
                    type="button"
                    aria-label={`Drag to resize ${meta.label}`}
                    onPointerDown={(e) => handleResizePointerDown(id, e)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onLostPointerCapture={handlePointerUp}
                    style={{
                      transform:
                        id === 'JOYSTICK'
                          ? undefined
                          : `scale(${1 / rect.scale})`,
                    }}
                    className="absolute -bottom-2.5 -right-2.5 flex h-5 w-5 items-center justify-center rounded-full border border-amber-100 bg-[#D99B26] text-[#101319] shadow cursor-nwse-resize"
                  >
                    <Move className="h-2.5 w-2.5" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          );
        })}

        {/* Floating Compact Inspector Bar (Automatically docks opposite the active control) */}
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-40 w-[min(94vw,520px)] rounded-xl border border-amber-300/45 bg-[#0D1016]/95 px-3.5 py-2.5 shadow-xl space-y-2 ${
            dockBottom ? 'bottom-3' : 'top-3'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-300 shrink-0">
                Control Editor
              </span>
              <select
                aria-label="Select control to customize"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value as ControlId)}
                className="rounded border border-amber-200/25 bg-[#151A24] px-2 py-1 text-xs font-medium text-[#F7F1E3] outline-none focus:border-amber-300"
              >
                {CONTROL_ORDER.map((id) => (
                  <option key={id} value={id}>
                    {CONTROL_META[id].label}
                  </option>
                ))}
              </select>
            </div>

            <span className="text-[10px] text-[#B9B0A0]">
              Drag buttons anywhere · Auto-saved
            </span>
          </div>

          {/* Individual Size Slider Row */}
          <div className="flex items-center gap-2 rounded-md border border-amber-200/15 bg-[#131720] px-2.5 py-1.5">
            <span className="text-[11px] font-medium text-[#DFD7C8] shrink-0">
              Size
            </span>
            <button
              type="button"
              aria-label={`Decrease size of ${selectedMeta.label}`}
              onClick={() => handleAdjustScale(selectedRect.scale - 0.05)}
              className="flex h-6 w-6 items-center justify-center rounded border border-amber-200/25 bg-[#1A202C] text-amber-200 hover:border-amber-300 cursor-pointer shrink-0"
            >
              <Minus className="h-3 w-3" aria-hidden="true" />
            </button>
            <input
              type="range"
              aria-label={`Size slider for ${selectedMeta.label}`}
              min={selectedMeta.minScale}
              max={selectedMeta.maxScale}
              step={0.05}
              value={selectedRect.scale}
              onChange={(e) => handleAdjustScale(Number(e.target.value))}
              className="flex-1 accent-[#D99B26] cursor-pointer"
            />
            <button
              type="button"
              aria-label={`Increase size of ${selectedMeta.label}`}
              onClick={() => handleAdjustScale(selectedRect.scale + 0.05)}
              className="flex h-6 w-6 items-center justify-center rounded border border-amber-200/25 bg-[#1A202C] text-amber-200 hover:border-amber-300 cursor-pointer shrink-0"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
            </button>
            <span className="font-mono-tabular w-10 text-right text-xs font-semibold text-amber-300 shrink-0">
              {pct}%
            </span>
          </div>

          {/* Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleResetSelected}
                className="rounded-md border border-amber-200/25 bg-[#151A24] px-2.5 py-1.5 text-[11px] font-medium text-[#DFD7C8] hover:border-amber-300/60 cursor-pointer"
              >
                Reset Item
              </button>
              <button
                type="button"
                onClick={handleResetAllDefaults}
                className="inline-flex items-center gap-1 rounded-md border border-rose-300/35 bg-[#241319] px-2.5 py-1.5 text-[11px] font-medium text-rose-200 hover:border-rose-300/70 cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                <span>Reset to Default</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#D99B26] px-4 py-1.5 text-xs font-semibold text-[#101319] hover:bg-[#E8AE3B] cursor-pointer"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Save &amp; Done</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
);
