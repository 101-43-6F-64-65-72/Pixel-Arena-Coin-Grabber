"use client";

import { useState, useEffect, useRef } from "react";
import GameCanvas from "@/components/GameCanvas";
import GameOver from "@/components/GameOver";
import SkillBar from "@/components/SkillBar";
import { SKILL_CATALOG } from "@/lib/skills";

/**
 * Lobby & Match Arena Component (Enhanced with Character Skills & Gacha).
 *
 * Manages UI for all match lifecycle phases:
 *   1. WAITING   → Practice Arena + Start Game button (host only) + Player List
 *   2. COUNTDOWN → 3..2..1 Countdown overlay on arena + status indicators
 *   3. PLAYING   → 5-Min Authoritative Match Timer + live coin grabbing + character skills & gacha
 *   4. FINISHED  → Game Over results view with winner highlight & final scores
 */

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

  // ── Character Skills State ──────────────────────────────────────────────────
  const [equippedSkills, setEquippedSkills] = useState({
    primary: SKILL_CATALOG.hyper_dash,   // Default Slot 1: Hyper Dash [SPACE]
    secondary: SKILL_CATALOG.frost_emp,  // Default Slot 2: Frost Nova [Q]
  });

  const [skillCooldowns, setSkillCooldowns] = useState({});
  const [activeSkillEffects, setActiveSkillEffects] = useState({});

  // Cooldown & Active duration tick timer (every 100ms)
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

      setActiveSkillEffects((prev) => {
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

  const handleEquipSkill = (slot, skill) => {
    setEquippedSkills((prev) => ({
      ...prev,
      [slot]: skill,
    }));
  };

  const handleSkillCooldownUpdate = (skillId, cooldownSecs) => {
    setSkillCooldowns((prev) => ({
      ...prev,
      [skillId]: cooldownSecs,
    }));
  };

  const handleActiveSkillUpdate = (skillId, durationSecs) => {
    setActiveSkillEffects((prev) => ({
      ...prev,
      [skillId]: durationSecs,
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

  // Live Sorted Leaderboard (Descending by score, then joined_at)
  const sortedPlayers = [...players].sort((a, b) => {
    const diff = (b.score ?? 0) - (a.score ?? 0);
    if (diff !== 0) return diff;
    return new Date(a.joined_at) - new Date(b.joined_at);
  });

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
            Pixel Arena: Battle Royale
          </h1>
          <p className="text-zinc-400 text-xs font-mono mt-0.5">
            Move (<kbd className="px-1 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-zinc-300">WASD</kbd>) • Skills (<kbd className="px-1 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-sky-400">SPACE</kbd>, <kbd className="px-1 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-purple-400">Q</kbd>) • Gacha Orbs (🎁)
          </p>
        </div>

        {/* Room Code Badge */}
        <div className="flex items-center gap-3 bg-zinc-900/90 px-4 py-2 rounded-xl border border-zinc-800 shadow-lg">
          <span className="text-zinc-500 text-xs font-mono uppercase tracking-wider">
            Room Code:
          </span>
          <span className="text-2xl font-bold text-orange-400 font-mono tracking-widest">
            {room?.code ?? "———"}
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl w-full mx-auto flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Game Canvas Arena & Skill Bar (Spans 3 columns on large screens) */}
        <div className="lg:col-span-3 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 flex flex-col shadow-2xl">
          {/* Match HUD */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 mb-3 border-b border-zinc-800/80">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  phase === "playing"
                    ? "bg-emerald-500 animate-pulse"
                    : phase === "countdown"
                    ? "bg-yellow-400 animate-ping"
                    : "bg-zinc-500"
                }`}
              />
              <span className="text-xs font-mono text-zinc-200 tracking-wider uppercase font-semibold">
                {phase === "countdown"
                  ? `STARTING IN ${countdown}...`
                  : phase === "playing"
                  ? "5-MIN BATTLE ROYALE"
                  : "LOBBY (WAITING FOR HOST)"}
              </span>
            </div>

            {/* Live Match Timer & Score HUD */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Match Timer Badge */}
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
              <div className="flex items-center gap-1.5 bg-yellow-950/60 border border-yellow-700/70 px-3 py-1.5 rounded-lg shadow-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-xs font-mono text-yellow-300">
                  Coins: <strong className="text-yellow-100 font-bold">{activeCoinCount}</strong>
                </span>
              </div>

              {/* Player Score badge */}
              <div className="flex items-center gap-1.5 bg-orange-950/60 border border-orange-700/70 px-3 py-1.5 rounded-lg shadow-sm">
                <span className="text-xs font-mono text-orange-300">
                  Your Score: <strong className="text-orange-100 font-bold">{currentPlayer?.score ?? 0} pts</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Canvas Container */}
          <div className="w-full flex items-center justify-center rounded-xl overflow-hidden bg-zinc-950/90 border border-zinc-800/80 p-1 shadow-inner">
            <GameCanvas
              roomId={room?.id}
              currentPlayerId={currentPlayerId}
              players={players}
              coins={coins}
              matchPhase={phase}
              countdownSeconds={countdown}
              isCollectiblesActive={isCollectiblesActive}
              equippedSkills={equippedSkills}
              onEquipSkill={handleEquipSkill}
              skillCooldowns={skillCooldowns}
              onSkillCooldownUpdate={handleSkillCooldownUpdate}
              activeSkillEffects={activeSkillEffects}
              onActiveSkillUpdate={handleActiveSkillUpdate}
            />
          </div>

          {/* Active Skills & Gacha Dock */}
          <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-zinc-800/80">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider font-semibold">
                ACTIVE SKILLS:
              </span>
            </div>

            <SkillBar
              equippedSkills={equippedSkills}
              skillCooldowns={skillCooldowns}
              activeSkillEffects={activeSkillEffects}
              playerScore={currentPlayer?.score ?? 0}
              onEquipSkill={handleEquipSkill}
              disabled={phase !== "playing"}
            />
          </div>
        </div>

        {/* Sidebar: Live Leaderboard & Controls */}
        <div className="flex flex-col gap-4">
          {/* Live Leaderboard Card */}
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-4 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900">
              <span className="text-zinc-300 text-xs font-mono tracking-widest uppercase font-bold flex items-center gap-1.5">
                🏆 LIVE LEADERBOARD
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
            {/* Start Match Button — Enabled for host in 'waiting' phase */}
            {isHost && phase === "waiting" && (
              <button
                id="btn-start-game"
                onClick={onStartMatch}
                disabled={isStartingMatch}
                className="w-full py-4 bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-zinc-950 font-bold font-mono text-base rounded-xl transition-all duration-150 shadow-lg shadow-orange-500/30 disabled:opacity-50 cursor-pointer"
              >
                {isStartingMatch ? "Starting Battle…" : "START 5-MIN BATTLE (300s)"}
              </button>
            )}

            {phase === "waiting" && !isHost && (
              <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl text-center">
                <p className="text-xs font-mono text-zinc-400">
                  Waiting for host to start match…
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
