"use client";

import { useState, useEffect } from "react";
import GameCanvas from "@/components/GameCanvas";
import GameOver from "@/components/GameOver";
import { getPlayerPalette } from "@/lib/arena";
import { useDash, useShield, useShockwave } from "@/lib/combat";

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
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col p-3 md:p-6">
      {/* Header */}
      <header className="max-w-7xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-zinc-800/80 mb-4">
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
            RoyalWar: Battle Arena
          </h1>
          <p className="text-zinc-400 text-xs font-mono mt-0.5">
            Move (<kbd className="px-1 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-zinc-300">WASD</kbd>) • Attack (<kbd className="px-1 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-red-400">CLICK / SPACE</kbd>) • Skills (<kbd className="px-1 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-sky-400">Q</kbd>, <kbd className="px-1 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-amber-400">E</kbd>, <kbd className="px-1 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-rose-400">R</kbd>)
          </p>
        </div>

        {/* Room Code & Player Color Identity Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-zinc-900/90 px-3.5 py-2 rounded-xl border border-zinc-800 shadow-lg">
            <span className={`w-3.5 h-3.5 rounded-full ${myPalette.dot}`} />
            <span className={`text-xs font-bold font-mono uppercase ${myPalette.text}`}>
              {myPalette.name}
            </span>
          </div>

          <div className="flex items-center gap-2.5 bg-zinc-900/90 px-4 py-2 rounded-xl border border-zinc-800 shadow-lg">
            <span className="text-zinc-500 text-xs font-mono uppercase tracking-wider">
              Room:
            </span>
            <span className="text-xl font-bold text-orange-400 font-mono tracking-widest">
              {room?.code ?? "———"}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl w-full mx-auto flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Game Canvas Arena & Combat Dock (Spans 3 columns on large screens) */}
        <div className="lg:col-span-3 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 flex flex-col shadow-2xl">
          {/* Match Status & Health Bar HUD */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 mb-3 border-b border-zinc-800/80">
            {/* Player Health Bar */}
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-mono text-zinc-400 uppercase font-semibold">HP:</span>
              <div className="w-36 sm:w-48 h-5 bg-zinc-950 rounded-lg overflow-hidden border border-zinc-700 relative flex items-center justify-center shadow-inner">
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono ${
                  phase === "playing"
                    ? matchRemaining <= 15
                      ? "bg-red-950/90 border-red-600 text-red-300 animate-pulse shadow-red-900/50 shadow-md"
                      : "bg-emerald-950/70 border-emerald-700/80 text-emerald-300 shadow-emerald-900/30 shadow-md"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400"
                }`}
              >
                <span className="text-xs uppercase text-zinc-400 font-semibold">TIME:</span>
                <strong className="text-base font-bold tracking-wider">
                  {phase === "playing" ? formattedTime : "05:00"}
                </strong>
              </div>

              {/* Coins remaining badge */}
              <div className="flex items-center gap-1.5 bg-yellow-950/60 border border-yellow-700/70 px-2.5 py-1.5 rounded-lg shadow-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-xs font-mono text-yellow-300">
                  Coins: <strong className="text-yellow-100 font-bold">{activeCoinCount}</strong>
                </span>
              </div>

              {/* Player Score & K/D */}
              <div className="flex items-center gap-2 bg-zinc-800/90 border border-zinc-700 px-3 py-1.5 rounded-lg shadow-sm font-mono text-xs">
                <span className="text-yellow-400 font-bold">{currentPlayer?.score ?? 0} pts</span>
                <span className="text-zinc-500">•</span>
                <span className="text-emerald-400 font-semibold">{currentPlayer?.kills ?? 0} K</span>
                <span className="text-zinc-500">•</span>
                <span className="text-red-400 font-semibold">{currentPlayer?.deaths ?? 0} D</span>
              </div>
            </div>
          </div>

          {/* Interactive Canvas Viewport Container */}
          <div className="w-full flex items-center justify-center rounded-xl overflow-hidden bg-zinc-950/90 border border-zinc-800/80 p-1 shadow-inner">
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
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider font-semibold">
                COMBAT SKILLS:
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Basic Attack Button */}
              <div className="flex flex-col items-center">
                <button
                  disabled={phase !== "playing" || !currentPlayer?.alive}
                  title="Melee Attack (Click / Space / F): Deal 20 DMG to nearest enemy in 90px range"
                  className="w-16 h-16 rounded-xl border-2 border-red-500/80 bg-red-950/60 hover:bg-red-900/80 text-white font-mono flex flex-col items-center justify-center shadow-lg transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
                >
                  <span className="text-xl">⚔️</span>
                  <span className="text-[10px] font-bold mt-0.5 uppercase">ATTACK</span>
                  <span className="text-[8px] text-zinc-400 font-bold">[SPACE]</span>
                </button>
              </div>

              {/* Skill 1: Dash */}
              <div className="flex flex-col items-center relative">
                <button
                  disabled={phase !== "playing" || !currentPlayer?.alive || skillCooldowns.dash > 0}
                  title="Hyper Dash [Q]: Quick 190px burst in movement direction (4s CD)"
                  className={`w-16 h-16 rounded-xl border-2 border-sky-400/80 bg-sky-950/70 hover:bg-sky-900/80 text-white font-mono flex flex-col items-center justify-center shadow-lg transition-all active:scale-95 disabled:opacity-40 cursor-pointer ${
                    skillCooldowns.dash > 0 ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                >
                  {skillCooldowns.dash > 0 && (
                    <div className="absolute inset-0 rounded-xl bg-black/80 flex items-center justify-center z-10">
                      <span className="text-xs font-bold text-white">{skillCooldowns.dash.toFixed(1)}s</span>
                    </div>
                  )}
                  <span className="text-xl">⚡</span>
                  <span className="text-[10px] font-bold mt-0.5 uppercase">DASH</span>
                  <span className="text-[8px] text-zinc-400 font-bold">[Q]</span>
                </button>
              </div>

              {/* Skill 2: Shield */}
              <div className="flex flex-col items-center relative">
                <button
                  disabled={phase !== "playing" || !currentPlayer?.alive || skillCooldowns.shield > 0}
                  title="Aegis Shield [E]: 2.0s barrier blocking all attacks & shockwaves (8s CD)"
                  className={`w-16 h-16 rounded-xl border-2 border-amber-400/80 bg-amber-950/70 hover:bg-amber-900/80 text-white font-mono flex flex-col items-center justify-center shadow-lg transition-all active:scale-95 disabled:opacity-40 cursor-pointer ${
                    skillCooldowns.shield > 0 ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                >
                  {skillCooldowns.shield > 0 && (
                    <div className="absolute inset-0 rounded-xl bg-black/80 flex items-center justify-center z-10">
                      <span className="text-xs font-bold text-white">{skillCooldowns.shield.toFixed(1)}s</span>
                    </div>
                  )}
                  <span className="text-xl">🛡️</span>
                  <span className="text-[10px] font-bold mt-0.5 uppercase">SHIELD</span>
                  <span className="text-[8px] text-zinc-400 font-bold">[E]</span>
                </button>
              </div>

              {/* Skill 3: Shockwave */}
              <div className="flex flex-col items-center relative">
                <button
                  disabled={phase !== "playing" || !currentPlayer?.alive || skillCooldowns.shockwave > 0}
                  title="Shockwave [R]: Area explosion hitting all enemies in 170px for 25 DMG (7s CD)"
                  className={`w-16 h-16 rounded-xl border-2 border-rose-500/80 bg-rose-950/70 hover:bg-rose-900/80 text-white font-mono flex flex-col items-center justify-center shadow-lg transition-all active:scale-95 disabled:opacity-40 cursor-pointer ${
                    skillCooldowns.shockwave > 0 ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                >
                  {skillCooldowns.shockwave > 0 && (
                    <div className="absolute inset-0 rounded-xl bg-black/80 flex items-center justify-center z-10">
                      <span className="text-xs font-bold text-white">{skillCooldowns.shockwave.toFixed(1)}s</span>
                    </div>
                  )}
                  <span className="text-xl">💥</span>
                  <span className="text-[10px] font-bold mt-0.5 uppercase">BURST</span>
                  <span className="text-[8px] text-zinc-400 font-bold">[R]</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar: Live Leaderboard & Controls */}
        <div className="flex flex-col gap-4">
          {/* Live Leaderboard Card */}
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-4 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900">
              <span className="text-zinc-300 text-xs font-mono tracking-widest uppercase font-bold flex items-center gap-1.5">
                🏆 ARENA LEADERBOARD
              </span>
              <span className="text-zinc-400 text-xs font-mono">
                <span className="text-white font-bold">{playerCount}</span>
                <span className="text-zinc-600"> / {MAX_PLAYERS}</span>
              </span>
            </div>

            <ul className="divide-y divide-zinc-800/60">
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
                        isLeader ? "bg-yellow-950/20" : "hover:bg-zinc-800/30"
                      }`}
                    >
                      {/* Rank Icon */}
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                          index === 0
                            ? "bg-yellow-500 text-zinc-950 shadow-yellow-500/50 shadow-sm"
                            : index === 1
                            ? "bg-zinc-400 text-zinc-950"
                            : index === 2
                            ? "bg-amber-700 text-white"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {index === 0 ? "👑" : index + 1}
                      </span>

                      {/* Deterministic Color Dot */}
                      <span className={`w-3 h-3 rounded-full shrink-0 ${pPalette.dot}`} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-semibold truncate ${isMe ? "text-white font-bold" : "text-zinc-300"}`}>
                            {player.nickname}
                          </span>
                          {isMe && (
                            <span className="text-orange-400 text-xs font-mono shrink-0 font-medium">(you)</span>
                          )}
                          {isRoomHost && (
                            <span className="text-orange-400 text-[10px] font-mono font-bold tracking-wide bg-orange-950/80 px-1.5 py-0.5 rounded border border-orange-800/80 shrink-0">
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
                      <div className="bg-zinc-800/90 px-2.5 py-1 rounded-lg border border-zinc-700 flex items-center gap-1 shadow-sm">
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
              <button
                id="btn-start-game"
                onClick={onStartMatch}
                disabled={isStartingMatch}
                className="w-full py-4 bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-zinc-950 font-bold font-mono text-base rounded-xl transition-all duration-150 shadow-lg shadow-orange-500/30 disabled:opacity-50 cursor-pointer"
              >
                {isStartingMatch ? "Starting Battle…" : "START ARENA BATTLE (5 MINS)"}
              </button>
            )}

            {phase === "waiting" && !isHost && (
              <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl text-center">
                <p className="text-xs font-mono text-zinc-400">
                  Waiting for host to start arena match…
                </p>
              </div>
            )}

            {/* Leave Room Button */}
            <button
              id="btn-leave-room"
              onClick={onLeave}
              disabled={isLeaving}
              className="w-full py-3.5 bg-zinc-900 hover:bg-red-950/50 text-zinc-300 hover:text-red-300 border border-zinc-800 hover:border-red-800 font-mono font-medium text-sm rounded-xl transition-colors duration-150 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {isLeaving ? "Leaving…" : "Leave Room"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
