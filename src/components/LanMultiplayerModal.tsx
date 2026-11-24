import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Crown,
  Play,
  Radio,
  RefreshCw,
  ShieldCheck,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import {
  LanMultiplayerClient,
  LanSessionSnapshot,
} from '../engine/LanMultiplayerClient';
import {
  generateRoomCode,
  getHeroPreset,
  LAN_HERO_PRESETS,
  LAN_MAX_PLAYERS,
  LAN_MIN_PLAYERS,
  LanDiscoveredRoom,
  sanitizeLanName,
  sanitizeRoomCode,
} from '../shared/lanMultiplayer';

export interface LanLocalProfile {
  playerName: string;
  heroId: string;
}

interface LanMultiplayerModalProps {
  lanClient: LanMultiplayerClient;
  session: LanSessionSnapshot;
  profile: LanLocalProfile;
  onUpdateProfile: (next: LanLocalProfile) => void;
  onClose: () => void;
  onEnterMatch: () => void;
}

export const LanMultiplayerModal: React.FC<LanMultiplayerModalProps> = ({
  lanClient,
  session,
  profile,
  onUpdateProfile,
  onClose,
  onEnterMatch,
}) => {
  const [tab, setTab] = useState<'JOIN' | 'HOST'>('JOIN');
  const [playerName, setPlayerName] = useState(profile.playerName);
  const [heroId, setHeroId] = useState(profile.heroId);

  const [hostRoomName, setHostRoomName] = useState('Ayodhya Sabha');
  const [hostRoomCode, setHostRoomCode] = useState(() => generateRoomCode());

  const [joinHostIp, setJoinHostIp] = useState(
    () => session.networkInfo.suggestedHostIp || '192.168.43.1'
  );
  const [joinPort, setJoinPort] = useState(() =>
    String(session.networkInfo.port || 38472)
  );
  const [joinRoomCode, setJoinRoomCode] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState<string | undefined>(undefined);
  const [localValidationError, setLocalValidationError] = useState<string | null>(null);

  // Start LAN/UDP room discovery while modal is open
  useEffect(() => {
    lanClient.refreshNetworkInfo();
    lanClient.startDiscovery();
    return () => {
      lanClient.stopDiscovery();
    };
  }, [lanClient]);

  // Keep default suggested IP/port synced if user hasn't picked a discovered room yet
  useEffect(() => {
    if (!selectedRoomId && session.networkInfo.suggestedHostIp) {
      setJoinHostIp((prev) => prev || session.networkInfo.suggestedHostIp);
    }
    if (session.networkInfo.port) {
      setJoinPort((prev) => prev || String(session.networkInfo.port));
    }
  }, [session.networkInfo.port, session.networkInfo.suggestedHostIp, selectedRoomId]);

  const commitProfile = (nextName: string, nextHeroId: string) => {
    const cleanName = sanitizeLanName(nextName, 'Lord Ram');
    const cleanHero = getHeroPreset(nextHeroId).id;
    onUpdateProfile({ playerName: cleanName, heroId: cleanHero });
    return { cleanName, cleanHero };
  };

  const handleHostSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalValidationError(null);
    const { cleanName, cleanHero } = commitProfile(playerName, heroId);
    const cleanCode = sanitizeRoomCode(hostRoomCode) || generateRoomCode();
    setHostRoomCode(cleanCode);
    lanClient.hostRoom(hostRoomName, cleanName, cleanCode, cleanHero);
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalValidationError(null);
    const cleanCode = sanitizeRoomCode(joinRoomCode);
    if (cleanCode.length < 4) {
      setLocalValidationError('Enter the 4-digit Room PIN shown on the Host device.');
      return;
    }
    const { cleanName, cleanHero } = commitProfile(playerName, heroId);
    const parsedPort = Math.max(1, Math.min(65535, Number(joinPort) || session.networkInfo.port));
    lanClient.joinRoom(
      joinHostIp.trim() || session.networkInfo.suggestedHostIp,
      parsedPort,
      cleanCode,
      cleanName,
      cleanHero,
      selectedRoomId
    );
  };

  const handleSelectDiscovered = (room: LanDiscoveredRoom) => {
    setLocalValidationError(null);
    setSelectedRoomId(room.roomId);
    setJoinHostIp(room.hostIp);
    setJoinPort(String(room.port));
  };

  const localPlayer = session.players.find((p) => p.id === session.localPlayerId);
  const readyCount = session.players.filter((p) => p.ready).length;
  const activeError = localValidationError || session.error;

  const isNativeHotspot = session.transport === 'NATIVE_ANDROID_HOTSPOT';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1016]/88 p-3 sm:p-5">
      <div className="w-full max-w-[580px] max-h-[92vh] overflow-y-auto rounded-xl border border-amber-300/40 bg-[#0D1016] p-4 sm:p-5 space-y-4 text-[#F7F1E3]">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-amber-200/15 pb-3">
          <div className="space-y-0.5">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
              <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Offline Wi-Fi Hotspot Co-op · 2–6 Players</span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-semibold text-[#F7F1E3]">
              Local Sabha Multiplayer
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close LAN Multiplayer"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-amber-200/20 bg-[#141923] text-[#DFD7C8] hover:border-amber-300/60 cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Zero-Internet Hotspot Setup Guide & Local IP Strip */}
        <div className="rounded-lg border border-emerald-400/25 bg-[#101820] px-3.5 py-2.5 text-[11px] text-[#D7E0E8] space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Zero Internet Required · Private Local Network</span>
            </span>
            <span className="font-mono-tabular text-[10px] text-amber-200">
              Your IP: {session.networkInfo.primaryIp}:{session.networkInfo.port}
            </span>
          </div>
          <p className="text-[10.5px] leading-snug text-[#B8C4D0]">
            {isNativeHotspot
              ? '1. One player turns ON Android Wi-Fi Hotspot (mobile data OFF is fine) and Hosts a Room. 2. Up to 5 friends connect to that hotspot and Join via auto-discovery or Host IP + PIN.'
              : 'Ensure all players are on the same local Wi-Fi or Hotspot. Host creates a room and shares the 4-digit PIN (and IP if joining manually).'}
          </p>
        </div>

        {/* Error Banner */}
        {activeError && (
          <div
            role="alert"
            className="rounded-md border border-rose-400/50 bg-[#2A0E15] px-3 py-2 text-xs text-rose-200"
          >
            {activeError}
          </div>
        )}

        {!session.active ? (
          <>
            {/* Player Profile & Hero Role Selector */}
            <div className="rounded-lg border border-amber-200/15 bg-[#131720] p-3.5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-[#C9C1B2]">
                    Warrior Name
                  </span>
                  <input
                    type="text"
                    maxLength={18}
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    onBlur={() => commitProfile(playerName, heroId)}
                    placeholder="Lord Ram"
                    className="w-full rounded-md border border-amber-200/20 bg-[#0D1016] px-3 py-1.5 text-xs text-[#F7F1E3] focus:border-amber-300 focus:outline-none"
                  />
                </label>

                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-[#C9C1B2]">
                    Hero Identity
                  </span>
                  <div className="grid grid-cols-3 gap-1">
                    {LAN_HERO_PRESETS.map((preset) => {
                      const active = heroId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setHeroId(preset.id);
                            commitProfile(playerName, preset.id);
                          }}
                          className={`inline-flex items-center justify-center gap-1 rounded border px-1.5 py-1 text-[10px] font-medium cursor-pointer transition-colors ${
                            active
                              ? 'border-amber-300 bg-[#D99B26]/20 text-amber-200'
                              : 'border-amber-200/15 bg-[#0D1016] text-[#C9C1B2] hover:border-amber-200/40'
                          }`}
                        >
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: preset.accentHex }}
                          />
                          <span className="truncate">{preset.label.replace('Lord ', '')}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Join vs Host Switcher */}
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-amber-200/20 bg-[#131720] p-1">
              <button
                type="button"
                onClick={() => {
                  setLocalValidationError(null);
                  setTab('JOIN');
                }}
                className={`rounded-md py-2 text-xs font-semibold cursor-pointer transition-colors ${
                  tab === 'JOIN'
                    ? 'bg-[#D99B26] text-[#101319]'
                    : 'text-[#DFD7C8] hover:text-amber-200'
                }`}
              >
                Join Hotspot Room
              </button>
              <button
                type="button"
                onClick={() => {
                  setLocalValidationError(null);
                  setTab('HOST');
                }}
                className={`rounded-md py-2 text-xs font-semibold cursor-pointer transition-colors ${
                  tab === 'HOST'
                    ? 'bg-[#D99B26] text-[#101319]'
                    : 'text-[#DFD7C8] hover:text-amber-200'
                }`}
              >
                Host Hotspot Room
              </button>
            </div>

            {tab === 'JOIN' ? (
              <div className="space-y-3">
                {/* Auto-Discovered LAN Rooms */}
                <div className="rounded-lg border border-amber-200/15 bg-[#131720] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-200">
                      <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Nearby Hotspot Rooms</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        lanClient.refreshNetworkInfo();
                        lanClient.startDiscovery();
                      }}
                      className="inline-flex items-center gap-1 rounded border border-amber-200/20 bg-[#191F2C] px-2 py-1 text-[10px] text-[#DFD7C8] hover:border-amber-300/60 cursor-pointer"
                    >
                      <RefreshCw className="h-3 w-3" aria-hidden="true" />
                      <span>Scan</span>
                    </button>
                  </div>

                  {session.discoveredRooms.length === 0 ? (
                    <p className="rounded border border-dashed border-amber-200/15 bg-[#0D1016]/70 px-3 py-2.5 text-[11px] text-[#9B9384]">
                      Scanning local Wi-Fi for open rooms... If your phone hotspot hides
                      UDP broadcasts, enter the Host IP and PIN directly below.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                      {session.discoveredRooms.map((room) => {
                        const isSelected = selectedRoomId === room.roomId;
                        const isFull = room.playerCount >= room.maxPlayers;
                        return (
                          <button
                            key={room.roomId}
                            type="button"
                            disabled={isFull}
                            onClick={() => handleSelectDiscovered(room)}
                            className={`w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors ${
                              isFull
                                ? 'border-slate-700/50 bg-[#0F131B] opacity-55 cursor-not-allowed'
                                : isSelected
                                ? 'border-amber-300 bg-[#1E2433] cursor-pointer'
                                : 'border-amber-200/20 bg-[#0F131B] hover:border-amber-300/60 cursor-pointer'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-[#F7F1E3]">
                                {room.roomName}
                              </p>
                              <p className="truncate font-mono-tabular text-[10px] text-[#B5AD9E]">
                                Host: {room.hostName} · {room.hostIp}:{room.port}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="rounded border border-amber-200/25 bg-[#181E2B] px-2 py-0.5 font-mono-tabular text-[10px] text-amber-200">
                                {room.playerCount}/{room.maxPlayers}
                              </span>
                              <span className="text-[10px] font-semibold text-emerald-300">
                                {room.sessionStarted ? 'In Match' : 'Select'}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Manual IP + PIN Join Form */}
                <form
                  onSubmit={handleJoinSubmit}
                  className="rounded-lg border border-amber-200/15 bg-[#131720] p-3.5 space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <label className="block space-y-1 sm:col-span-1">
                      <span className="text-[11px] font-medium text-[#C9C1B2]">
                        Host IP Address
                      </span>
                      <input
                        type="text"
                        value={joinHostIp}
                        onChange={(e) => {
                          setSelectedRoomId(undefined);
                          setJoinHostIp(e.target.value);
                        }}
                        placeholder="192.168.43.1"
                        className="w-full rounded-md border border-amber-200/20 bg-[#0D1016] px-2.5 py-1.5 font-mono-tabular text-xs text-[#F7F1E3] focus:border-amber-300 focus:outline-none"
                      />
                    </label>

                    <label className="block space-y-1">
                      <span className="text-[11px] font-medium text-[#C9C1B2]">Port</span>
                      <input
                        type="number"
                        value={joinPort}
                        onChange={(e) => setJoinPort(e.target.value)}
                        className="w-full rounded-md border border-amber-200/20 bg-[#0D1016] px-2.5 py-1.5 font-mono-tabular text-xs text-[#F7F1E3] focus:border-amber-300 focus:outline-none"
                      />
                    </label>

                    <label className="block space-y-1">
                      <span className="text-[11px] font-medium text-amber-300">
                        4-Digit Room PIN
                      </span>
                      <input
                        type="text"
                        maxLength={6}
                        value={joinRoomCode}
                        onChange={(e) => setJoinRoomCode(sanitizeRoomCode(e.target.value))}
                        placeholder="e.g. 4821"
                        className="w-full rounded-md border border-amber-300/50 bg-[#0D1016] px-2.5 py-1.5 font-mono-tabular text-xs font-semibold tracking-widest text-amber-200 focus:border-amber-300 focus:outline-none"
                      />
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={session.connecting}
                    className="w-full rounded-md bg-[#D99B26] px-4 py-2.5 text-xs font-semibold text-[#101319] hover:bg-[#E8AE3B] disabled:opacity-50 cursor-pointer"
                  >
                    {session.connecting ? 'Connecting to Hotspot Room...' : 'Join Private Room'}
                  </button>
                </form>
              </div>
            ) : (
              /* Host Form */
              <form
                onSubmit={handleHostSubmit}
                className="rounded-lg border border-amber-200/15 bg-[#131720] p-3.5 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-[#C9C1B2]">
                      Room Name
                    </span>
                    <input
                      type="text"
                      maxLength={18}
                      value={hostRoomName}
                      onChange={(e) => setHostRoomName(e.target.value)}
                      placeholder="Ayodhya Sabha"
                      className="w-full rounded-md border border-amber-200/20 bg-[#0D1016] px-3 py-1.5 text-xs text-[#F7F1E3] focus:border-amber-300 focus:outline-none"
                    />
                  </label>

                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-[#C9C1B2]">
                      Private Room PIN
                    </span>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        maxLength={6}
                        value={hostRoomCode}
                        onChange={(e) => setHostRoomCode(sanitizeRoomCode(e.target.value))}
                        className="flex-1 rounded-md border border-amber-200/25 bg-[#0D1016] px-3 py-1.5 font-mono-tabular text-xs font-semibold tracking-widest text-amber-200 focus:border-amber-300 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setHostRoomCode(generateRoomCode())}
                        className="rounded-md border border-amber-200/20 bg-[#1B2130] px-2.5 py-1.5 text-[11px] text-[#DFD7C8] hover:border-amber-300/60 cursor-pointer"
                      >
                        New PIN
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={session.connecting}
                  className="w-full rounded-md bg-[#D99B26] px-4 py-2.5 text-xs font-semibold text-[#101319] hover:bg-[#E8AE3B] disabled:opacity-50 cursor-pointer"
                >
                  {session.connecting
                    ? 'Starting Local Host Server...'
                    : 'Create & Host Private Room (2–6 Players)'}
                </button>
              </form>
            )}
          </>
        ) : (
          /* Active Room Lobby / Live Session View */
          <div className="space-y-3.5">
            <div className="rounded-lg border border-amber-300/35 bg-[#131720] p-3.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-amber-300 font-semibold">
                    {session.sessionStarted ? 'Synchronized Match Active' : 'Waiting in Sabha Lobby'}
                  </p>
                  <h3 className="font-display text-lg font-semibold text-[#F7F1E3]">
                    {session.roomName}
                  </h3>
                </div>
                <div className="flex items-center gap-2 font-mono-tabular text-xs">
                  <span className="rounded border border-amber-300/45 bg-[#0D1016] px-2.5 py-1 text-amber-200 font-semibold">
                    PIN: {session.roomCode}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded border border-emerald-400/35 bg-[#0D1016] px-2.5 py-1 text-emerald-300">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {session.players.length}/{LAN_MAX_PLAYERS}
                    </span>
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-amber-200/10 pt-2 font-mono-tabular text-[11px] text-[#C9C1B2]">
                <span>
                  Host Address: {session.networkInfo.primaryIp}:{session.networkInfo.port}
                </span>
                <span>
                  Ping: {session.pingMs !== null ? `${session.pingMs} ms` : 'Measuring...'}
                </span>
              </div>
            </div>

            {/* 6-Slot Player Roster */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Array.from({ length: LAN_MAX_PLAYERS }).map((_, idx) => {
                const player = session.players[idx];
                if (!player) {
                  return (
                    <div
                      key={`empty-${idx}`}
                      className="flex items-center justify-between rounded-md border border-dashed border-amber-200/15 bg-[#0F131B]/70 px-3 py-2 text-[11px] text-[#7D766A]"
                    >
                      <span>Slot {idx + 1} · Open for Hotspot Join</span>
                      <span>2–6 Co-op</span>
                    </div>
                  );
                }

                const isSelf = player.id === session.localPlayerId;
                const hero = getHeroPreset(player.heroId);
                return (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 ${
                      isSelf
                        ? 'border-amber-300/60 bg-[#1B2130]'
                        : 'border-amber-200/20 bg-[#131720]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-3 w-3 rounded-full shrink-0 border border-white/30"
                        style={{ backgroundColor: player.accentHex || hero.accentHex }}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-[#F7F1E3] flex items-center gap-1">
                          <span className="truncate">{player.name}</span>
                          {isSelf && (
                            <span className="text-[10px] text-amber-300">(You)</span>
                          )}
                          {player.isHost && (
                            <Crown
                              className="h-3 w-3 text-amber-400 shrink-0"
                              aria-label="Room Host"
                            />
                          )}
                        </p>
                        <p className="text-[10px] text-[#A8A092]">{hero.label}</p>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold shrink-0 ${
                        player.ready || player.isHost
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/35'
                          : 'bg-amber-500/15 text-amber-200 border border-amber-300/30'
                      }`}
                    >
                      <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
                      <span>{player.isHost ? 'Host' : player.ready ? 'Ready' : 'Waiting'}</span>
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Co-op Status Note */}
            {session.players.length < LAN_MIN_PLAYERS && (
              <p className="text-[11px] text-amber-200/90 text-center">
                Share PIN <span className="font-mono-tabular font-bold">{session.roomCode}</span>{' '}
                with 1–5 friends on your Wi-Fi Hotspot (or launch immediately while others join
                mid-session).
              </p>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              {session.isHost ? (
                session.sessionStarted ? (
                  <button
                    type="button"
                    onClick={onEnterMatch}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[#D99B26] px-4 py-2.5 text-xs font-semibold text-[#101319] hover:bg-[#E8AE3B] cursor-pointer"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                    <span>Return to Synchronized World</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      lanClient.startMatch();
                      onEnterMatch();
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[#D99B26] px-4 py-2.5 text-xs font-semibold text-[#101319] hover:bg-[#E8AE3B] cursor-pointer"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                    <span>
                      Start Synchronized Match ({readyCount}/{session.players.length} Ready)
                    </span>
                  </button>
                )
              ) : session.sessionStarted ? (
                <button
                  type="button"
                  onClick={onEnterMatch}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[#D99B26] px-4 py-2.5 text-xs font-semibold text-[#101319] hover:bg-[#E8AE3B] cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  <span>Enter Synchronized World</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => lanClient.setReady(!localPlayer?.ready)}
                  className={`flex-1 rounded-md px-4 py-2.5 text-xs font-semibold cursor-pointer border ${
                    localPlayer?.ready
                      ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                      : 'border-amber-300 bg-[#D99B26] text-[#101319] hover:bg-[#E8AE3B]'
                  }`}
                >
                  {localPlayer?.ready ? 'Ready ✓ (Waiting for Host)' : 'Mark Ready'}
                </button>
              )}

              <button
                type="button"
                onClick={() => lanClient.leaveRoom()}
                className="rounded-md border border-rose-400/40 bg-[#221218] px-4 py-2.5 text-xs font-medium text-rose-200 hover:border-rose-400/75 cursor-pointer"
              >
                {session.isHost ? 'Close Room' : 'Leave Room'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
