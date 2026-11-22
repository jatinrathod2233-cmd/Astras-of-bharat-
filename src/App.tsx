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
  assetsReady: false,
  assetProgress: 0,
  assetStage: 'Initializing realm...',
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
    try {
      const bridge = (
        window as unknown as { AndroidBridge?: { setGameMode?: (m: string) => void } }
      ).AndroidBridge;
      bridge?.setGameMode?.(mode);
    } catch {
      // Ignore outside native Android WebView
    }
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
    (window as unknown as { __ramayanaEngine?: RamayanaWorldEngine }).__ramayanaEngine = engine;

    return () => {
      (window as unknown as { __ramayanaEngine?: RamayanaWorldEngine }).__ramayanaEngine = undefined;
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

  // Camera drag orbit & two-finger pinch zoom on the 3D canvas (zero-allocation pointer handling)
  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (modeRef.current !== 'PLAYING') return;
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
      const it = activePointersRef.current.values();
      const p0 = it.next().value!;
      const p1 = it.next().value!;
      pinchDistRef.current = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      lookPointerRef.current.id = null;
    }
  }, []);

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const ptr = activePointersRef.current.get(e.pointerId);
    if (!ptr) return;
    ptr.x = e.clientX;
    ptr.y = e.clientY;

    if (activePointersRef.current.size === 2 && engineRef.current) {
      const it = activePointersRef.current.values();
      const p0 = it.next().value!;
      const p1 = it.next().value!;
      const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
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
  }, []);

  const handleCanvasPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (lookPointerRef.current.id === e.pointerId) {
      lookPointerRef.current.id = null;
    }
    if (activePointersRef.current.size < 2) {
      pinchDistRef.current = null;
    }
    if (activePointersRef.current.size === 1) {
      const first = activePointersRef.current.entries().next().value;
      if (first) {
        lookPointerRef.current = { id: first[0], lastX: first[1].x, lastY: first[1].y };
      }
    }
  }, []);

  const handleCanvasWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (modeRef.current !== 'PLAYING' || !engineRef.current) return;
    engineRef.current.input.zoomDelta += e.deltaY * 0.01;
  }, []);

  const handleJoystickMove = useCallback(
    (x: number, y: number) => {
      joyMoveRef.current.x = x;
      joyMoveRef.current.y = y;
      syncCombinedMovement();
    },
    [syncCombinedMovement]
  );

  const handleToggleSprint = useCallback(() => {
    setTouchSprint((prev) => {
      const next = !prev;
      if (engineRef.current) {
        engineRef.current.input.sprint = next;
      }
      return next;
    });
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted(soundEngine.toggleMute());
  }, []);

  const handleZoomIn = useCallback(() => {
    if (modeRef.current === 'PLAYING' && engineRef.current) {
      engineRef.current.input.zoomDelta -= 1.4;
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (modeRef.current === 'PLAYING' && engineRef.current) {
      engineRef.current.input.zoomDelta += 1.4;
    }
  }, []);

  const handlePause = useCallback(() => engineRef.current?.setMode('PAUSED'), []);
  const handleFireStart = useCallback(() => {
    if (engineRef.current) engineRef.current.input.fireHeld = true;
  }, []);
  const handleFireEnd = useCallback(() => {
    if (engineRef.current) engineRef.current.input.fireHeld = false;
  }, []);
  const handleAstra = useCallback(() => {
    if (engineRef.current) engineRef.current.input.astraPressed = true;
  }, []);
  const handleJump = useCallback(() => {
    if (engineRef.current) engineRef.current.input.jumpPressed = true;
  }, []);
  const handleInteract = useCallback(() => {
    if (engineRef.current) engineRef.current.input.interactPressed = true;
  }, []);
  const handleToggleStealth = useCallback(() => {
    if (engineRef.current) engineRef.current.input.stealthTogglePressed = true;
  }, []);
  const handleToggleAutoDrive = useCallback(() => {
    if (engineRef.current) engineRef.current.input.autoDriveTogglePressed = true;
  }, []);

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
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onPause={handlePause}
          onJoystickMove={handleJoystickMove}
          onFireStart={handleFireStart}
          onFireEnd={handleFireEnd}
          onAstra={handleAstra}
          onJump={handleJump}
          onToggleSprint={handleToggleSprint}
          onInteract={handleInteract}
          onToggleStealth={handleToggleStealth}
          onToggleAutoDrive={handleToggleAutoDrive}
        />
      )}

      {/* Title / Pause / Defeat / Victory Overlay */}
      <OverlayModals
        mode={mode}
        hud={hud}
        onStartGame={() => {
          if (!hud.assetsReady) return;
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
