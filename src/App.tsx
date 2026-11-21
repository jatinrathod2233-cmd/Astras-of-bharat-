import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameHUD } from './components/GameHUD';
import { OverlayModals } from './components/OverlayModals';
import { RamayanaWorldEngine } from './engine/RamayanaWorldEngine';
import { PlayMode, WorldHudSnapshot } from './types/world';
import { soundEngine } from './utils/audio';

const INITIAL_HUD: WorldHudSnapshot = {
  hp: 100,
  maxHp: 100,
  prana: 100,
  maxPrana: 100,
  karma: 0,
  wantedLevel: 0,
  inChariot: false,
  nearChariot: false,
  mountKind: 'NONE',
  nearMountLabel: null,
  nearThrone: false,
  onThrone: false,
  chariotSpeedKmh: 0,
  stealthActive: false,
  stealthSpotted: false,
  chakraCooldown: 0,
  chakraMaxCooldown: 10,
  districtName: 'Mahadev Sacred Courtyard',
  playerX: 0,
  playerZ: 14,
  playerYaw: 0,
  missionTitle: 'Ascend the Royal Simhasana',
  missionProgress: 0,
  missionTarget: 1,
  completedMissions: 0,
  totalMissions: 4,
  demonVillageDistanceM: 2500,
  autoDriveActive: false,
  ascensionActive: false,
  ascensionElapsed: 0,
  courtSeatedCount: 0,
  courtTotalCount: 16,
  promptHint: null,
  blips: [],
  webglError: null,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RamayanaWorldEngine | null>(null);

  const [mode, setMode] = useState<PlayMode>('TITLE');
  const [hud, setHud] = useState<WorldHudSnapshot>(INITIAL_HUD);
  const [muted, setMuted] = useState<boolean>(() => soundEngine.isMuted());
  const [touchSprint, setTouchSprint] = useState(false);

  // Separate refs for keyboard vs virtual joystick so they blend cleanly
  const modeRef = useRef<PlayMode>('TITLE');
  modeRef.current = mode;
  const keyMoveRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const joyMoveRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const keysDownRef = useRef<Record<string, boolean>>({});
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchDistRef = useRef<number | null>(null);
  const lookPointerRef = useRef<{
    id: number | null;
    lastX: number;
    lastY: number;
  }>({ id: null, lastX: 0, lastY: 0 });

  const syncCombinedMovement = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (modeRef.current !== 'PLAYING') {
      engine.input.moveX = 0;
      engine.input.moveY = 0;
      return;
    }
    const j = joyMoveRef.current;
    const k = keyMoveRef.current;
    const activeJoy = Math.hypot(j.x, j.y) > 0.04;
    engine.input.moveX = activeJoy ? j.x : k.x;
    engine.input.moveY = activeJoy ? j.y : k.y;
  }, []);

  const resetAllInputs = useCallback(() => {
    keysDownRef.current = {};
    keyMoveRef.current = { x: 0, y: 0 };
    joyMoveRef.current = { x: 0, y: 0 };
    lookPointerRef.current = { id: null, lastX: 0, lastY: 0 };
    activePointersRef.current.clear();
    pinchDistRef.current = null;
    setTouchSprint(false);
    engineRef.current?.clearInputs();
  }, []);

  // Always wipe lingering movement/action inputs when leaving PLAYING state or losing window focus
  useEffect(() => {
    if (mode !== 'PLAYING') {
      resetAllInputs();
    }
  }, [mode, resetAllInputs]);

  useEffect(() => {
    const onBlur = () => resetAllInputs();
    const onVisibility = () => {
      if (document.hidden) resetAllInputs();
    };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [resetAllInputs]);

  // Initialize Three.js Open World once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new RamayanaWorldEngine(container, {
      onHudUpdate: (snapshot) => setHud(snapshot),
      onModeChange: (nextMode) => setMode(nextMode),
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Keyboard bindings
  useEffect(() => {
    const recomputeKeyVector = () => {
      if (modeRef.current !== 'PLAYING') {
        keyMoveRef.current = { x: 0, y: 0 };
        if (engineRef.current) engineRef.current.input.sprint = false;
        syncCombinedMovement();
        return;
      }
      const kd = keysDownRef.current;
      let kx = 0;
      let ky = 0;
      if (kd['KeyA'] || kd['ArrowLeft']) kx -= 1;
      if (kd['KeyD'] || kd['ArrowRight']) kx += 1;
      if (kd['KeyW'] || kd['ArrowUp']) ky += 1;
      if (kd['KeyS'] || kd['ArrowDown']) ky -= 1;
      keyMoveRef.current = { x: kx, y: ky };

      if (engineRef.current) {
        engineRef.current.input.sprint =
          Boolean(kd['ShiftLeft'] || kd['ShiftRight']) || touchSprint;
      }
      syncCombinedMovement();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine) return;

      if (e.code === 'Escape') {
        setMode((curr) => {
          const next =
            curr === 'PLAYING'
              ? 'PAUSED'
              : curr === 'PAUSED'
              ? 'PLAYING'
              : curr;
          engine.setMode(next);
          return next;
        });
        return;
      }

      if (modeRef.current !== 'PLAYING') return;

      keysDownRef.current[e.code] = true;
      recomputeKeyVector();

      if (e.code === 'Space') {
        engine.input.jumpPressed = true;
      } else if (e.code === 'KeyF') {
        engine.input.fireHeld = true;
      } else if (e.code === 'KeyQ') {
        engine.input.astraPressed = true;
      } else if (e.code === 'KeyE') {
        engine.input.interactPressed = true;
      } else if (e.code === 'KeyV') {
        engine.input.autoDriveTogglePressed = true;
      } else if (e.code === 'KeyC') {
        engine.input.stealthTogglePressed = true;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysDownRef.current[e.code] = false;
      recomputeKeyVector();
      if (e.code === 'KeyF' && engineRef.current) {
        engineRef.current.input.fireHeld = false;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [syncCombinedMovement, touchSprint]);

  // Camera drag orbit & two-finger pinch zoom on the 3D canvas
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== 'PLAYING') return;
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);

    if (activePointersRef.current.size === 1) {
      lookPointerRef.current = {
        id: e.pointerId,
        lastX: e.clientX,
        lastY: e.clientY,
      };
      pinchDistRef.current = null;
    } else if (activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      pinchDistRef.current = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      lookPointerRef.current.id = null;
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activePointersRef.current.has(e.pointerId)) return;
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 2 && engineRef.current) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (pinchDistRef.current !== null) {
        const dPinch = dist - pinchDistRef.current;
        engineRef.current.input.zoomDelta -= dPinch * 0.035;
      }
      pinchDistRef.current = dist;
      return;
    }

    if (lookPointerRef.current.id !== e.pointerId) return;
    const dx = e.clientX - lookPointerRef.current.lastX;
    const dy = e.clientY - lookPointerRef.current.lastY;
    lookPointerRef.current.lastX = e.clientX;
    lookPointerRef.current.lastY = e.clientY;
    if (engineRef.current) {
      engineRef.current.input.cameraDeltaX += dx;
      engineRef.current.input.cameraDeltaY += dy;
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (lookPointerRef.current.id === e.pointerId) {
      lookPointerRef.current.id = null;
    }
    if (activePointersRef.current.size < 2) {
      pinchDistRef.current = null;
    }
    if (activePointersRef.current.size === 1) {
      const [remainId, pt] = Array.from(activePointersRef.current.entries())[0];
      lookPointerRef.current = { id: remainId, lastX: pt.x, lastY: pt.y };
    }
  };

  const handleCanvasWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (mode !== 'PLAYING' || !engineRef.current) return;
    engineRef.current.input.zoomDelta += e.deltaY * 0.01;
  };

  const handleJoystickMove = (x: number, y: number) => {
    joyMoveRef.current = { x, y };
    syncCombinedMovement();
  };

  const handleToggleSprint = () => {
    setTouchSprint((prev) => {
      const next = !prev;
      if (engineRef.current) {
        engineRef.current.input.sprint = next;
      }
      return next;
    });
  };

  const handleToggleMute = () => {
    setMuted(soundEngine.toggleMute());
  };

  const handleZoomStep = (delta: number) => {
    if (mode === 'PLAYING' && engineRef.current) {
      engineRef.current.input.zoomDelta += delta;
    }
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0D1016] select-none">
      {/* Dedicated Three.js WebGL Mount Container */}
      <div
        ref={mountRef}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
        onWheel={handleCanvasWheel}
        style={{ touchAction: 'none' }}
        className="fixed inset-0 z-0 h-full w-full"
      />

      {/* Active Open-World HUD & Touchscreen Controls */}
      {mode === 'PLAYING' && (
        <GameHUD
          hud={hud}
          muted={muted}
          sprintActive={touchSprint}
          onToggleMute={handleToggleMute}
          onZoomIn={() => handleZoomStep(-1.4)}
          onZoomOut={() => handleZoomStep(1.4)}
          onPause={() => engineRef.current?.setMode('PAUSED')}
          onJoystickMove={handleJoystickMove}
          onFireStart={() => {
            if (engineRef.current) engineRef.current.input.fireHeld = true;
          }}
          onFireEnd={() => {
            if (engineRef.current) engineRef.current.input.fireHeld = false;
          }}
          onAstra={() => {
            if (engineRef.current) engineRef.current.input.astraPressed = true;
          }}
          onJump={() => {
            if (engineRef.current) engineRef.current.input.jumpPressed = true;
          }}
          onToggleSprint={handleToggleSprint}
          onInteract={() => {
            if (engineRef.current) engineRef.current.input.interactPressed = true;
          }}
          onToggleStealth={() => {
            if (engineRef.current) {
              engineRef.current.input.stealthTogglePressed = true;
            }
          }}
          onToggleAutoDrive={() => {
            if (engineRef.current) {
              engineRef.current.input.autoDriveTogglePressed = true;
            }
          }}
        />
      )}

      {/* Title / Pause / Defeat / Victory Overlay */}
      <OverlayModals
        mode={mode}
        hud={hud}
        onStartGame={() => {
          resetAllInputs();
          soundEngine.playMissionChime();
          engineRef.current?.setMode('PLAYING');
        }}
        onResume={() => {
          resetAllInputs();
          engineRef.current?.setMode('PLAYING');
        }}
        onRevive={() => {
          resetAllInputs();
          engineRef.current?.reviveAtPalace();
        }}
        onRestart={() => {
          resetAllInputs();
          engineRef.current?.resetWorldEntities();
          engineRef.current?.setMode('PLAYING');
        }}
      />
    </div>
  );
}
