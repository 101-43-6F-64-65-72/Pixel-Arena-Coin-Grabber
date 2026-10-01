"use client";

import { useState, useEffect } from "react";
import GameCanvas from "@/components/GameCanvas";
import GameOver from "@/components/GameOver";
import { GameButton, GamePanel } from "@/components/GameUIComponents";
import { getPlayerPalette } from "@/lib/arena";

const MAX_PLAYERS = 4;

export default function Lobby({
  room,
  players = [],
  coins = [],
  currentPlayerId,
  onLeave,
  isLeaving,
  onStartMatch,
  isStartingMatch,
  matchState, // { phase, countdownSeconds, matchSecondsRemaining, isCollectiblesActive }
}) {
  const isHost = room?.host_id === currentPlayerId;
  const playerCount = players?.length ?? 0;
  const activeCoinCount = coins?.filter((c) => c.active)?.length ?? 0;
  const currentPlayer = players?.find((p) => p.id === currentPlayerId);

  const phase = matchState?.phase || "waiting";
  const countdown = matchState?.countdownSeconds ?? 3;
  const matchRemaining = matchState?.matchSecondsRemaining ?? 300;
  const isCollectiblesActive = matchState?.isCollectiblesActive ?? false;

  // ── Skill Cooldown State ──────────────────────────────────────────────────
  const [skillCooldowns, setSkillCooldowns] = useState({
    dash: 0,
    shield: 0,
    shockwave: 0,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setSkillCooldowns((prev) => {
        let hasChanges = false;
        const next = { ...prev };
        for (const [key, val] of Object.entries(next)) {
          if (val > 0) {
            next[key] = Math.max(0, val - 0.1);
            hasChanges = true;
          }
        }
        return hasChanges ? next : prev;
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const handleSkillCooldownUpdate = (skillKey, cooldownSecs) => {
    setSkillCooldowns((prev) => ({
      ...prev,
      [skillKey]: cooldownSecs,
    }));
  };

  // ── Render Game Over Screen ─────────────────────────────────────────────────
  if (phase === "finished") {
    return (
      <GameOver
        players={players}
        currentPlayerId={currentPlayerId}
        onLeave={onLeave}
        isLeaving={isLeaving}
      />
    );
  }

  // Format MM:SS for 5-minute match timer
  const minutes = Math.floor(matchRemaining / 60);
  const seconds = matchRemaining % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  // Live Sorted Leaderboard (Descending by score, then kills, then joined_at)
  const sortedPlayers = [...players].sort((a, b) => {
    const diff = (b.score ?? 0) - (a.score ?? 0);
    if (diff !== 0) return diff;
    const kDiff = (b.kills ?? 0) - (a.kills ?? 0);
    if (kDiff !== 0) return kDiff;
    return new Date(a.joined_at) - new Date(b.joined_at);
  });

  const myPalette = getPlayerPalette(currentPlayer?.color_key || "orange");
  const myHp = currentPlayer?.hp ?? 100;
  const myHpPercent = Math.max(0, Math.min(100, myHp));

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col p-3 md:p-6 relative overflow-hidden">
      {/* Background Ambience */}
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(circle at 50% 30%, rgba(245, 158, 11, 0.15) 0%, transparent 70%),
            linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)
          `,
          backgroundSize: "100% 100%, 32px 32px, 32px 32px",
        }}
      />

      {/* Header */}
      <header className="relative z-10 max-w-7xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-zinc-800/80 mb-4">
        <div>
          <h1 className="text-2xl font-bold font-mono tracking-tight text-white flex items-center gap-2">
            <span
              className={`w-3.5 h-3.5 rounded-full ${
                phase === "playing"
                  ? "bg-emerald-500 animate-pulse shadow-emerald-500/50 shadow-md"
                  : phase === "countdown"
                  ? "bg-yellow-400 animate-ping"
                  : "bg-orange-500 animate-pulse"
              }`}
            />
            RoyalWar: Sci-Fi Arena
          </h1>
          <p className="text-zinc-400 text-xs font-mono mt-0.5">
            Move (<kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-amber-300">WASD / ARROWS</kbd>) • Attack (<kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-rose-400">CLICK / SPACE</kbd>) • Skills (<kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-sky-400">Q</kbd>, <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-amber-400">E</kbd>, <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-rose-400">R</kbd>)
          </p>
        </div>

        {/* Room Code & Player Color Identity Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-zinc-900/90 px-3.5 py-2 rounded-xl border border-zinc-700/70 shadow-lg">
            <span className={`w-3.5 h-3.5 rounded-full ${myPalette.dot}`} />
            <span className={`text-xs font-bold font-mono uppercase ${myPalette.text}`}>
              {myPalette.name}
            </span>
          </div>

          <div className="flex items-center gap-2.5 bg-zinc-900/90 px-4 py-2 rounded-xl border border-amber-600/50 shadow-lg">
            <span className="text-zinc-400 text-xs font-mono uppercase tracking-wider">
              Room:
            </span>
            <span className="text-xl font-bold text-amber-400 font-mono tracking-widest">
              {room?.code ?? "———"}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 max-w-7xl w-full mx-auto flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Game Canvas Arena & Combat Dock */}
        <div className="lg:col-span-3 bg-zinc-900/90 border-2 border-amber-950/80 rounded-3xl p-4 flex flex-col shadow-2xl backdrop-blur-md">
          {/* Match Status & Health Bar HUD */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 mb-3 border-b border-zinc-800/80">
            {/* Player Health Bar */}
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-mono text-amber-400 uppercase font-bold">HP:</span>
              <div className="w-36 sm:w-48 h-5 bg-zinc-950 rounded-xl overflow-hidden border-2 border-zinc-700 relative flex items-center justify-center shadow-inner">
                <div
                  className={`absolute left-0 top-0 bottom-0 transition-all duration-200 ${
                    myHpPercent > 50
                      ? "bg-gradient-to-r from-emerald-600 to-green-500"
                      : myHpPercent > 25
                      ? "bg-gradient-to-r from-yellow-600 to-amber-500"
                      : "bg-gradient-to-r from-red-700 to-red-500"
                  }`}
                  style={{ width: `${myHpPercent}%` }}
                />
                <span className="relative z-10 text-[11px] font-mono font-bold text-white drop-shadow">
                  {myHp} / 100
                </span>
              </div>
            </div>

            {/* Match Timer & Score & K/D Badges */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Timer Badge */}
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 font-mono ${
                  phase === "playing"
                    ? matchRemaining <= 15
                      ? "bg-red-950/90 border-red-500 text-red-300 animate-pulse shadow-red-900/50 shadow-md"
                      : "bg-emerald-950/70 border-emerald-600/80 text-emerald-300 shadow-emerald-900/30 shadow-md"
                    : "bg-zinc-900 border-zinc-700 text-zinc-400"
                }`}
              >
                <span className="text-xs uppercase text-zinc-400 font-semibold">TIME:</span>
                <strong className="text-base font-bold tracking-wider">
                  {phase === "playing" ? formattedTime : "05:00"}
                </strong>
              </div>

              {/* Coins remaining badge */}
              <div className="flex items-center gap-1.5 bg-yellow-950/60 border-2 border-yellow-600/70 px-3 py-1.5 rounded-xl shadow-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-xs font-mono text-yellow-300">
                  Coins: <strong className="text-yellow-100 font-bold">{activeCoinCount}</strong>
                </span>
              </div>

              {/* Player Score & K/D */}
              <div className="flex items-center gap-2 bg-zinc-800/90 border-2 border-zinc-700 px-3 py-1.5 rounded-xl shadow-sm font-mono text-xs">
                <span className="text-yellow-400 font-bold">{currentPlayer?.score ?? 0} pts</span>
                <span className="text-zinc-500">•</span>
                <span className="text-emerald-400 font-semibold">{currentPlayer?.kills ?? 0} K</span>
                <span className="text-zinc-500">•</span>
                <span className="text-red-400 font-semibold">{currentPlayer?.deaths ?? 0} D</span>
              </div>
            </div>
          </div>

          {/* Interactive Canvas Viewport Container */}
          <div className="w-full flex items-center justify-center rounded-2xl overflow-hidden bg-zinc-950/95 border-2 border-zinc-800 p-1 shadow-inner">
            <GameCanvas
              roomId={room?.id}
              currentPlayerId={currentPlayerId}
              players={players}
              coins={coins}
              matchPhase={phase}
              countdownSeconds={countdown}
              isCollectiblesActive={isCollectiblesActive}
              skillCooldowns={skillCooldowns}
              onSkillCooldownUpdate={handleSkillCooldownUpdate}
            />
          </div>

          {/* Three Server-Validated Skills Dock */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-800/80">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-amber-400 uppercase tracking-wider font-bold">
                COMBAT SKILLS:
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Basic Attack Button */}
              <div className="flex flex-col items-center">
                <button
                  disabled={phase !== "playing" || !currentPlayer?.alive}
                  title="Melee Attack (Click / Space): Deal 20 DMG to nearest enemy in 90px range"
                  className="relative w-16 h-16 rounded-2xl border-2 border-rose-400 bg-gradient-to-b from-rose-500 via-red-600 to-red-800 text-white font-mono flex flex-col items-center justify-center shadow-lg shadow-red-950/80 transition-all active:translate-y-1 disabled:opacity-40 cursor-pointer overflow-hidden"
                >
                  <span className="absolute top-1 left-2 right-2 h-1/3 bg-white/25 rounded-t-xl pointer-events-none" />
                  <span className="text-lg relative z-10">⚔️</span>
                  <span className="text-[10px] font-bold uppercase relative z-10 leading-none">ATTACK</span>
                  <span className="text-[8px] text-rose-200 font-bold relative z-10">[SPACE]</span>
                </button>
              </div>

              {/* Skill 1: Dash */}
              <div className="flex flex-col items-center relative">
                <button
                  disabled={phase !== "playing" || !currentPlayer?.alive || skillCooldowns.dash > 0}
                  title="Hyper Dash [Q]: Quick 190px burst in movement direction (4s CD)"
                  className="relative w-16 h-16 rounded-2xl border-2 border-sky-300 bg-gradient-to-b from-sky-400 via-blue-500 to-blue-700 text-white font-mono flex flex-col items-center justify-center shadow-lg shadow-blue-950/80 transition-all active:translate-y-1 disabled:opacity-40 cursor-pointer overflow-hidden"
                >
                  <span className="absolute top-1 left-2 right-2 h-1/3 bg-white/25 rounded-t-xl pointer-events-none" />
                  {skillCooldowns.dash > 0 && (
                    <div className="absolute inset-0 bg-black/85 flex items-center justify-center z-20">
                      <span className="text-xs font-bold text-amber-300">{skillCooldowns.dash.toFixed(1)}s</span>
                    </div>
                  )}
                  <span className="text-lg relative z-10">⚡</span>
                  <span className="text-[10px] font-bold uppercase relative z-10 leading-none">DASH</span>
                  <span className="text-[8px] text-sky-200 font-bold relative z-10">[Q]</span>
                </button>
              </div>

              {/* Skill 2: Shield */}
              <div className="flex flex-col items-center relative">
                <button
                  disabled={phase !== "playing" || !currentPlayer?.alive || skillCooldowns.shield > 0}
                  title="Aegis Shield [E]: 2.0s barrier blocking all attacks & shockwaves (8s CD)"
                  className="relative w-16 h-16 rounded-2xl border-2 border-amber-300 bg-gradient-to-b from-amber-400 via-orange-500 to-orange-700 text-amber-950 font-mono flex flex-col items-center justify-center shadow-lg shadow-amber-950/80 transition-all active:translate-y-1 disabled:opacity-40 cursor-pointer overflow-hidden"
                >
                  <span className="absolute top-1 left-2 right-2 h-1/3 bg-white/25 rounded-t-xl pointer-events-none" />
                  {skillCooldowns.shield > 0 && (
                    <div className="absolute inset-0 bg-black/85 flex items-center justify-center z-20">
                      <span className="text-xs font-bold text-amber-300">{skillCooldowns.shield.toFixed(1)}s</span>
                    </div>
                  )}
                  <span className="text-lg relative z-10">🛡️</span>
                  <span className="text-[10px] font-bold uppercase relative z-10 leading-none">SHIELD</span>
                  <span className="text-[8px] text-amber-900 font-bold relative z-10">[E]</span>
                </button>
              </div>

              {/* Skill 3: Shockwave */}
              <div className="flex flex-col items-center relative">
                <button
                  disabled={phase !== "playing" || !currentPlayer?.alive || skillCooldowns.shockwave > 0}
                  title="Shockwave [R]: Area explosion hitting all enemies in 170px for 25 DMG (7s CD)"
                  className="relative w-16 h-16 rounded-2xl border-2 border-emerald-300 bg-gradient-to-b from-emerald-400 via-green-500 to-green-700 text-emerald-950 font-mono flex flex-col items-center justify-center shadow-lg shadow-emerald-950/80 transition-all active:translate-y-1 disabled:opacity-40 cursor-pointer overflow-hidden"
                >
                  <span className="absolute top-1 left-2 right-2 h-1/3 bg-white/25 rounded-t-xl pointer-events-none" />
                  {skillCooldowns.shockwave > 0 && (
                    <div className="absolute inset-0 bg-black/85 flex items-center justify-center z-20">
                      <span className="text-xs font-bold text-amber-300">{skillCooldowns.shockwave.toFixed(1)}s</span>
                    </div>
                  )}
                  <span className="text-lg relative z-10">💥</span>
                  <span className="text-[10px] font-bold uppercase relative z-10 leading-none">BURST</span>
                  <span className="text-[8px] text-emerald-900 font-bold relative z-10">[R]</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar: Live Leaderboard & Controls */}
        <div className="flex flex-col gap-4">
          {/* Live Leaderboard Card */}
          <div className="bg-zinc-900/90 border-2 border-amber-950/80 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-md">
            <div className="px-4 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900">
              <span className="text-amber-400 text-xs font-mono tracking-widest uppercase font-bold flex items-center gap-1.5">
                🏆 ARENA LEADERBOARD
              </span>
              <span className="text-zinc-400 text-xs font-mono">
                <span className="text-white font-bold">{playerCount}</span>
                <span className="text-zinc-500"> / {MAX_PLAYERS}</span>
              </span>
            </div>

            <ul className="divide-y divide-zinc-800/80">
              {sortedPlayers && sortedPlayers.length > 0 ? (
                sortedPlayers.map((player, index) => {
                  const isRoomHost = player.id === room?.host_id;
                  const isMe = player.id === currentPlayerId;
                  const isLeader = index === 0 && (player.score ?? 0) > 0;
                  const pPalette = getPlayerPalette(player.color_key || "orange");

                  return (
                    <li
                      key={player.id}
                      className={`px-4 py-3.5 flex items-center gap-3 transition-colors ${
                        isLeader ? "bg-amber-950/30" : "hover:bg-zinc-800/30"
                      }`}
                    >
                      {/* Rank Icon */}
                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-mono font-bold shrink-0 shadow-sm ${
                          index === 0
                            ? "bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950"
                            : index === 1
                            ? "bg-zinc-400 text-zinc-950"
                            : index === 2
                            ? "bg-amber-800 text-white"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {index === 0 ? "👑" : index + 1}
                      </span>

                      {/* Deterministic Color Dot */}
                      <span className={`w-3 h-3 rounded-full shrink-0 ${pPalette.dot}`} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-semibold truncate ${isMe ? "text-amber-300 font-bold" : "text-zinc-200"}`}>
                            {player.nickname}
                          </span>
                          {isMe && (
                            <span className="text-amber-400 text-xs font-mono shrink-0 font-medium">(you)</span>
                          )}
                          {isRoomHost && (
                            <span className="text-amber-300 text-[10px] font-mono font-bold tracking-wide bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-700/80 shrink-0">
                              HOST
                            </span>
                          )}
                        </div>

                        {/* HP & K/D Status */}
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] font-mono text-zinc-400">
                          <span className={player.alive ? "text-emerald-400" : "text-red-400 font-bold"}>
                            {player.alive ? `${player.hp ?? 100} HP` : "DEAD"}
                          </span>
                          <span>•</span>
                          <span>{player.kills ?? 0}K / {player.deaths ?? 0}D</span>
                        </div>
                      </div>

                      {/* Score Badge */}
                      <div className="bg-zinc-950 px-2.5 py-1 rounded-xl border border-zinc-700 flex items-center gap-1 shadow-inner">
                        <span className="text-sm font-bold font-mono text-yellow-400">
                          {player.score ?? 0}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400 uppercase">pts</span>
                      </div>
                    </li>
                  );
                })
              ) : (
                <li className="px-4 py-6 text-center text-zinc-500 text-sm font-mono">
                  Waiting for players…
                </li>
              )}
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3 pt-1">
            {/* Start Match Button */}
            {isHost && phase === "waiting" && (
              <GameButton
                id="btn-start-game"
                onClick={onStartMatch}
                disabled={isStartingMatch}
                variant="orange"
                size="lg"
                className="w-full"
              >
                {isStartingMatch ? "Starting Battle…" : "START ARENA BATTLE"}
              </GameButton>
            )}

            {phase === "waiting" && !isHost && (
              <div className="p-4 bg-zinc-900/80 border-2 border-zinc-800 rounded-2xl text-center">
                <p className="text-xs font-mono text-zinc-400">
                  Waiting for host to start arena battle…
                </p>
              </div>
            )}

            {/* Leave Room Button */}
            <GameButton
              id="btn-leave-room"
              onClick={onLeave}
              disabled={isLeaving}
              variant="dark"
              size="md"
              className="w-full"
            >
              {isLeaving ? "Leaving…" : "Leave Room"}
            </GameButton>
          </div>
        </div>
      </main>
    </div>
  );
}

