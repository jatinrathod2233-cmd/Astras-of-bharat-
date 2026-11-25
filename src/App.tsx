import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ControlCustomizerModal } from './components/ControlCustomizerModal';
import {
  clampWheelCenter,
  getHoveredAstraFromPoint,
} from './components/DivyastraRadialWheel';
import { GameHUD } from './components/GameHUD';
import { HeroSwitcherModal } from './components/HeroSwitcherModal';
import {
  LanLocalProfile,
  LanMultiplayerModal,
} from './components/LanMultiplayerModal';
import { OverlayModals } from './components/OverlayModals';
import {
  ASTRA_CONFIG,
  ASTRA_MAX_ENERGY,
  ASTRA_ORDER,
} from './engine/astraConfig';
import { HERO_PROFILES, normalizeHeroId } from './engine/heroProfiles';
import {
  LanMultiplayerClient,
  LanSessionSnapshot,
} from './engine/LanMultiplayerClient';
import { RamayanaWorldEngine } from './engine/RamayanaWorldEngine';
import {
  AstraId,
  PlayableHeroId,
  PlayMode,
  QualityMode,
  WorldHudSnapshot,
} from './types/world';
import { soundEngine } from './utils/audio';
import {
  ControlLayoutMap,
  getViewportDimensions,
  loadControlLayout,
} from './utils/controlLayout';

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
  nearMountFull: false,
  mountedSeatIndex: null,
  mountedPartnerName: null,
  mountedOccupantCount: 0,
  canSwitchSeat: false,
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
  qualityMode: 'AUTO',
  qualityTier: 'HIGH',
  fps: 60,
  targetFps: 60,
  resolutionScale: 1,
  hardwareBenchmark: null,
  selectedAstra: null,
  astraEnergy: ASTRA_MAX_ENERGY,
  maxAstraEnergy: ASTRA_MAX_ENERGY,
  astraCooldowns: {
    AGNEYASTRA: 0,
    VARUNASTRA: 0,
    VAYAVYASTRA: 0,
    NAGASTRA: 0,
    BRAHMASTRA: 0,
  },
  brahmastraAimReady: false,
  brahmastraSummoning: false,
  brahmaFlashAlpha: 0,
  brahmaFadeAlpha: 0,
  astraQuest: {
    astras: ASTRA_ORDER.map((id) => ({
      id,
      name: ASTRA_CONFIG[id].name,
      title: ASTRA_CONFIG[id].sanskritTitle,
      unlocked: false,
      story: ASTRA_CONFIG[id].journalStory,
      hint: ASTRA_CONFIG[id].journalHint,
    })),
    unlockedCount: 0,
    activeAstraId: null,
    objectiveTitle: 'Seek Agneyastra',
    objectiveDetail: 'Light the 4 fire bowls at the Ruined Fire Temple near the volcanoes.',
    objectiveDistanceM: 2562,
    challengeSubProgress: null,
    challengeTimerSec: null,
    underwaterBreath: null,
    brahmaTrialStage: 0,
    allCompleted: false,
  },
  astraUnlockPopup: null,
  enemySummonWarning: null,
  showStoryIntro: false,
  activeHeroId: 'RAM',
  isFlying: false,
  heroAbilityCooldown: 0,
  heroAbilityMaxCooldown: HERO_PROFILES.RAM.specialCooldownSec,
};

const SHOW_FPS_STORAGE_KEY = 'astras_show_fps_v1';
const LAN_PROFILE_STORAGE_KEY = 'astras_lan_profile_v1';

function loadLanProfile(): LanLocalProfile {
  try {
    const raw = localStorage.getItem(LAN_PROFILE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LanLocalProfile>;
      if (parsed.playerName && parsed.heroId) {
        return {
          playerName: parsed.playerName,
          heroId: parsed.heroId,
        };
      }
    }
  } catch {
    // Ignore storage errors
  }
  return { playerName: 'Lord Ram', heroId: 'RAM' };
}

function tryLockLandscapeOrientation(): void {
  try {
    const orientation = window.screen?.orientation as
      | (ScreenOrientation & { lock?: (orientation: string) => Promise<void> })
      | undefined;
    if (orientation && typeof orientation.lock === 'function') {
      void orientation.lock('landscape').catch(() => {
        // Ignore on desktop browsers or non-fullscreen contexts that disallow orientation.lock
      });
    }
  } catch {
    // Ignore unsupported Screen Orientation API
  }
}

export default function App() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RamayanaWorldEngine | null>(null);
  const lanClientRef = useRef<LanMultiplayerClient | null>(null);
  if (!lanClientRef.current) {
    lanClientRef.current = new LanMultiplayerClient();
  }

  const [mode, setMode] = useState<PlayMode>('TITLE');
  const [hud, setHud] = useState<WorldHudSnapshot>(INITIAL_HUD);
  const [lanSession, setLanSession] = useState<LanSessionSnapshot>(() =>
    lanClientRef.current!.getSnapshot()
  );
  const [lanProfile, setLanProfile] = useState<LanLocalProfile>(() => loadLanProfile());
  const lanProfileRef = useRef<LanLocalProfile>(lanProfile);
  lanProfileRef.current = lanProfile;
  const [lanModalOpen, setLanModalOpen] = useState(false);
  const lanModalOpenRef = useRef(false);
  lanModalOpenRef.current = lanModalOpen;
  const [heroSwitcherOpen, setHeroSwitcherOpen] = useState(false);
  const heroSwitcherOpenRef = useRef(false);
  heroSwitcherOpenRef.current = heroSwitcherOpen;
  const [muted, setMuted] = useState<boolean>(() => soundEngine.isMuted());
  const [touchSprint, setTouchSprint] = useState(false);
  const [viewport, setViewport] = useState<{ w: number; h: number }>(() =>
    getViewportDimensions()
  );
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const [controlLayout, setControlLayout] = useState<ControlLayoutMap>(() => {
    const vp = getViewportDimensions();
    return loadControlLayout(vp.w, vp.h);
  });
  const [customizingControls, setCustomizingControls] = useState(false);
  const customizingControlsRef = useRef(false);
  customizingControlsRef.current = customizingControls;
  const [showPerfStats, setShowPerfStats] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SHOW_FPS_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  // Desktop Q-Wheel state
  const [desktopWheelOpen, setDesktopWheelOpen] = useState(false);
  const [desktopWheelCenter, setDesktopWheelCenter] = useState<{ x: number; y: number }>({
    x: 420,
    y: 320,
  });
  const [desktopHoveredAstra, setDesktopHoveredAstra] = useState<AstraId | null>(null);
  const desktopWheelOpenRef = useRef(false);
  const desktopWheelCenterRef = useRef<{ x: number; y: number }>({ x: 420, y: 320 });
  const desktopHoveredRef = useRef<AstraId | null>(null);
  const lastMouseRef = useRef<{ x: number; y: number } | null>(null);
  const hudRef = useRef<WorldHudSnapshot>(INITIAL_HUD);
  hudRef.current = hud;

  // Separate refs for keyboard vs virtual joystick so they blend cleanly
  const modeRef = useRef<PlayMode>('TITLE');
  modeRef.current = mode;
  const keyMoveRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const joyMoveRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const keysDownRef = useRef<Record<string, boolean>>({});
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
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
    desktopWheelOpenRef.current = false;
    desktopHoveredRef.current = null;
    setDesktopWheelOpen(false);
    setDesktopHoveredAstra(null);
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
    } else {
      setLanModalOpen(false);
    }
    if (mode !== 'PAUSED') {
      setCustomizingControls(false);
    }
  }, [mode, resetAllInputs]);

  // Keep custom control bounds synced to the full-screen landscape stage across device sizes
  useEffect(() => {
    tryLockLandscapeOrientation();
    const syncViewport = () => {
      const nextVp = getViewportDimensions(stageRef.current);
      setViewport(nextVp);
      setControlLayout(loadControlLayout(nextVp.w, nextVp.h));
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    window.addEventListener('orientationchange', syncViewport);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && stageRef.current) {
      ro = new ResizeObserver(() => {
        const nextVp = getViewportDimensions(stageRef.current);
        setViewport(nextVp);
        setControlLayout(loadControlLayout(nextVp.w, nextVp.h));
      });
      ro.observe(stageRef.current);
    }
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('orientationchange', syncViewport);
    };
  }, []);

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

  // Subscribe to offline Wi-Fi Hotspot LAN client state
  useEffect(() => {
    const client = lanClientRef.current;
    if (!client) return;
    const unsub = client.subscribe((snap) => setLanSession(snap));
    return () => {
      unsub();
      client.dispose();
    };
  }, []);

  // Initialize Three.js Open World once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new RamayanaWorldEngine(container, {
      onHudUpdate: (snapshot) => setHud(snapshot),
      onModeChange: (nextMode) => setMode(nextMode),
    });
    engineRef.current = engine;
    if (lanClientRef.current) {
      engine.setMultiplayerClient(
        lanClientRef.current,
        lanProfileRef.current.playerName,
        lanProfileRef.current.heroId
      );
    }
    (window as unknown as { __ramayanaEngine?: RamayanaWorldEngine }).__ramayanaEngine = engine;

    return () => {
      (window as unknown as { __ramayanaEngine?: RamayanaWorldEngine }).__ramayanaEngine = undefined;
      engine.setMultiplayerClient(null);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Keep engine's local multiplayer identity synced when profile changes
  useEffect(() => {
    try {
      localStorage.setItem(LAN_PROFILE_STORAGE_KEY, JSON.stringify(lanProfile));
    } catch {
      // Ignore storage errors
    }
    if (engineRef.current && lanClientRef.current) {
      engineRef.current.setMultiplayerClient(
        lanClientRef.current,
        lanProfile.playerName,
        lanProfile.heroId
      );
    }
  }, [lanProfile]);

  // Prevent browser pinch-zoom or rubber-band scrolling on mobile touchscreens
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;
    const preventWheel = (e: WheelEvent) => {
      e.preventDefault();
    };
    const preventTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1 || modeRef.current === 'PLAYING') {
        e.preventDefault();
      }
    };
    container.addEventListener('wheel', preventWheel, { passive: false });
    container.addEventListener('touchmove', preventTouchMove, { passive: false });
    return () => {
      container.removeEventListener('wheel', preventWheel);
      container.removeEventListener('touchmove', preventTouchMove);
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
        if (heroSwitcherOpenRef.current) {
          setHeroSwitcherOpen(false);
          return;
        }
        if (lanModalOpenRef.current) {
          setLanModalOpen(false);
          return;
        }
        if (customizingControlsRef.current) {
          setCustomizingControls(false);
          return;
        }
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

      if (e.code === 'KeyH' && !e.repeat && hudRef.current.assetsReady) {
        setHeroSwitcherOpen((prev) => !prev);
        return;
      }

      if (modeRef.current !== 'PLAYING' || heroSwitcherOpenRef.current) return;

      keysDownRef.current[e.code] = true;
      recomputeKeyVector();

      if (e.code === 'Space') {
        engine.input.jumpPressed = true;
      } else if (e.code === 'KeyF') {
        engine.input.fireHeld = true;
      } else if (e.code === 'KeyR') {
        engine.input.astraPressed = true;
      } else if (e.code === 'KeyX') {
        engine.input.shootAstraPressed = true;
      } else if (e.code === 'KeyQ' && !e.repeat) {
        const snapshot = hudRef.current;
        if (snapshot.astraQuest.unlockedCount > 0) {
          const vp = viewportRef.current;
          const bounds = stageRef.current?.getBoundingClientRect();
          const anchor = lastMouseRef.current
            ? {
                x: bounds ? lastMouseRef.current.x - bounds.left : lastMouseRef.current.x,
                y: bounds ? lastMouseRef.current.y - bounds.top : lastMouseRef.current.y,
              }
            : {
                x: vp.w * 0.5,
                y: vp.h * 0.5,
              };
          const clamped = clampWheelCenter(anchor.x, anchor.y, vp.w, vp.h);
          desktopWheelCenterRef.current = clamped;
          desktopWheelOpenRef.current = true;
          desktopHoveredRef.current = snapshot.selectedAstra;
          setDesktopWheelCenter(clamped);
          setDesktopHoveredAstra(snapshot.selectedAstra);
          setDesktopWheelOpen(true);
        }
      } else if (
        e.code === 'Digit1' ||
        e.code === 'Digit2' ||
        e.code === 'Digit3' ||
        e.code === 'Digit4' ||
        e.code === 'Digit5'
      ) {
        const idx = Number(e.code.replace('Digit', '')) - 1;
        const candidateId = ASTRA_ORDER[idx];
        const entry = hudRef.current.astraQuest.astras.find((a) => a.id === candidateId);
        if (entry?.unlocked) {
          engine.selectAstra(candidateId);
        }
      } else if (e.code === 'KeyE') {
        engine.input.interactPressed = true;
      } else if (e.code === 'KeyG' && !e.repeat) {
        engine.input.switchSeatPressed = true;
      } else if (e.code === 'KeyV') {
        engine.input.autoDriveTogglePressed = true;
      } else if (e.code === 'KeyC') {
        engine.input.stealthTogglePressed = true;
      } else if (e.code === 'KeyB' && !e.repeat) {
        engine.input.heroSpecialPressed = true;
      } else if (e.code === 'KeyU' && !e.repeat) {
        engine.input.flyTogglePressed = true;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysDownRef.current[e.code] = false;
      recomputeKeyVector();
      if (e.code === 'KeyF' && engineRef.current) {
        engineRef.current.input.fireHeld = false;
      } else if (e.code === 'KeyQ' && desktopWheelOpenRef.current) {
        const picked = desktopHoveredRef.current;
        desktopWheelOpenRef.current = false;
        desktopHoveredRef.current = null;
        setDesktopWheelOpen(false);
        setDesktopHoveredAstra(null);
        if (picked && engineRef.current) {
          engineRef.current.selectAstra(picked);
        }
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      if (!desktopWheelOpenRef.current) return;
      const bounds = stageRef.current?.getBoundingClientRect();
      const localX = bounds ? e.clientX - bounds.left : e.clientX;
      const localY = bounds ? e.clientY - bounds.top : e.clientY;
      const next = getHoveredAstraFromPoint(
        desktopWheelCenterRef.current.x,
        desktopWheelCenterRef.current.y,
        localX,
        localY,
        hudRef.current.astraQuest.astras
      );
      if (next !== desktopHoveredRef.current) {
        desktopHoveredRef.current = next;
        setDesktopHoveredAstra(next);
        if (next) {
          soundEngine.playWheelTick();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [syncCombinedMovement, touchSprint]);

  // First-person look drag on the 3D canvas (zero-allocation pointer handling; zoom/perspective switching disabled)
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
    } else {
      lookPointerRef.current.id = null;
    }
  }, []);

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const ptr = activePointersRef.current.get(e.pointerId);
    if (!ptr) return;
    ptr.x = e.clientX;
    ptr.y = e.clientY;

    if (activePointersRef.current.size !== 1 || lookPointerRef.current.id !== e.pointerId) return;
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
    if (activePointersRef.current.size === 1) {
      const first = activePointersRef.current.entries().next().value;
      if (first) {
        lookPointerRef.current = { id: first[0], lastX: first[1].x, lastY: first[1].y };
      }
    }
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
  const handleSelectAstra = useCallback((id: AstraId) => {
    engineRef.current?.selectAstra(id);
  }, []);
  const handleShootAstra = useCallback(() => {
    if (engineRef.current) engineRef.current.input.shootAstraPressed = true;
  }, []);
  const handleDismissStoryIntro = useCallback(() => {
    engineRef.current?.dismissStoryIntro();
  }, []);
  const handleDismissUnlockPopup = useCallback(() => {
    engineRef.current?.dismissUnlockPopup();
  }, []);
  const handleJump = useCallback(() => {
    if (engineRef.current) engineRef.current.input.jumpPressed = true;
  }, []);
  const handleInteract = useCallback(() => {
    if (engineRef.current) engineRef.current.input.interactPressed = true;
  }, []);
  const handleSwitchSeat = useCallback(() => {
    if (engineRef.current) engineRef.current.input.switchSeatPressed = true;
  }, []);
  const handleToggleStealth = useCallback(() => {
    if (engineRef.current) engineRef.current.input.stealthTogglePressed = true;
  }, []);
  const handleToggleAutoDrive = useCallback(() => {
    if (engineRef.current) engineRef.current.input.autoDriveTogglePressed = true;
  }, []);
  const handleHeroSpecial = useCallback(() => {
    if (engineRef.current) engineRef.current.input.heroSpecialPressed = true;
  }, []);
  const handleToggleFly = useCallback(() => {
    if (engineRef.current) engineRef.current.input.flyTogglePressed = true;
  }, []);
  const handleSelectHero = useCallback((heroId: PlayableHeroId) => {
    const normalized = normalizeHeroId(heroId);
    engineRef.current?.setActiveHero(normalized);
    setLanProfile((prev) => ({
      ...prev,
      heroId: normalized,
    }));
    setHeroSwitcherOpen(false);
  }, []);

  const handleStartGame = useCallback(() => {
    if (!engineRef.current) return;
    tryLockLandscapeOrientation();
    resetAllInputs();
    soundEngine.playMissionChime();
    engineRef.current.setMode('PLAYING');
  }, [resetAllInputs]);

  const handleResume = useCallback(() => {
    resetAllInputs();
    engineRef.current?.setMode('PLAYING');
  }, [resetAllInputs]);

  const handleRevive = useCallback(() => {
    resetAllInputs();
    engineRef.current?.reviveAtPalace();
  }, [resetAllInputs]);

  const handleRestart = useCallback(() => {
    resetAllInputs();
    engineRef.current?.resetWorldEntities();
    engineRef.current?.setMode('PLAYING');
  }, [resetAllInputs]);

  const handleChangeQualityMode = useCallback((nextQuality: QualityMode) => {
    engineRef.current?.setQualityMode(nextQuality);
  }, []);

  const handleRerunBenchmark = useCallback(() => {
    void engineRef.current?.rerunHardwareBenchmark();
  }, []);

  const handleTogglePerfStats = useCallback(() => {
    setShowPerfStats((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SHOW_FPS_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-[#07090D] select-none">
      <div
        ref={stageRef}
        className="relative h-full w-full overflow-hidden bg-[#0D1016] select-none"
      >
        {/* Dedicated Three.js WebGL Mount Container */}
        <div
          ref={mountRef}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerUp}
          style={{ touchAction: 'none' }}
          className="absolute inset-0 z-0 h-full w-full"
        />

        {/* Active Open-World HUD & Touchscreen Controls */}
        {mode === 'PLAYING' && (
          <GameHUD
            hud={hud}
            muted={muted}
            sprintActive={touchSprint}
            showPerfStats={showPerfStats}
            lanSession={lanSession}
            desktopWheelOpen={desktopWheelOpen}
            desktopWheelCenter={desktopWheelCenter}
            desktopHoveredAstra={desktopHoveredAstra}
            controlLayout={controlLayout}
            viewport={viewport}
            stageRef={stageRef}
            onToggleMute={handleToggleMute}
            onPause={handlePause}
            onJoystickMove={handleJoystickMove}
            onFireStart={handleFireStart}
            onFireEnd={handleFireEnd}
            onAstra={handleAstra}
            onSelectAstra={handleSelectAstra}
            onShootAstra={handleShootAstra}
            onOpenHeroSwitcher={() => setHeroSwitcherOpen(true)}
            onHeroSpecial={handleHeroSpecial}
            onToggleFly={handleToggleFly}
            onJump={handleJump}
            onToggleSprint={handleToggleSprint}
            onInteract={handleInteract}
            onSwitchSeat={handleSwitchSeat}
            onToggleStealth={handleToggleStealth}
            onToggleAutoDrive={handleToggleAutoDrive}
          />
        )}

        {/* Title / Pause / Story / Unlock / Defeat / Victory Overlay */}
        <OverlayModals
          mode={mode}
          hud={hud}
          showPerfStats={showPerfStats}
          lanSession={lanSession}
          onStartGame={handleStartGame}
          onResume={handleResume}
          onRevive={handleRevive}
          onRestart={handleRestart}
          onChangeQualityMode={handleChangeQualityMode}
          onRerunBenchmark={handleRerunBenchmark}
          onTogglePerfStats={handleTogglePerfStats}
          onOpenControlCustomizer={() => setCustomizingControls(true)}
          onOpenLanMultiplayer={() => setLanModalOpen(true)}
          onOpenHeroSwitcher={() => setHeroSwitcherOpen(true)}
          onDismissStoryIntro={handleDismissStoryIntro}
          onDismissUnlockPopup={handleDismissUnlockPopup}
        />

        {/* Dynamic Playable Deity Hero Switcher Modal */}
        {heroSwitcherOpen && (
          <HeroSwitcherModal
            activeHeroId={hud.activeHeroId}
            onSelectHero={handleSelectHero}
            onClose={() => setHeroSwitcherOpen(false)}
          />
        )}

        {/* Interactive Touch Control Layout & Size Editor */}
        {mode === 'PAUSED' && customizingControls && (
          <ControlCustomizerModal
            layout={controlLayout}
            viewport={viewport}
            onChangeLayout={setControlLayout}
            onClose={() => setCustomizingControls(false)}
          />
        )}

        {/* Offline Wi-Fi Hotspot LAN Multiplayer Modal (2–6 Players) */}
        {lanModalOpen && lanClientRef.current && (
          <LanMultiplayerModal
            lanClient={lanClientRef.current}
            session={lanSession}
            profile={lanProfile}
            onUpdateProfile={setLanProfile}
            onClose={() => setLanModalOpen(false)}
            onEnterMatch={() => {
              setLanModalOpen(false);
              handleStartGame();
            }}
          />
        )}
      </div>
    </div>
  );
}
