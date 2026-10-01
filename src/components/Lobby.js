"use client";

import { useState, useEffect, useCallback } from "react";
import GameCanvas from "@/components/GameCanvas";
import GameOver from "@/components/GameOver";
import { GameButton } from "@/components/GameUIComponents";
import { HpBar } from "@/components/GameUIComponents";
import { getPlayerPalette } from "@/lib/arena";

const MAX_PLAYERS = 4;

// ── Leaderboard row ────────────────────────────────────────────────────────
function PlayerRow({ player, rank, isMe, isHost, isLeader, epochNow }) {
  const palette = getPlayerPalette(player.color_key || "orange");
  const alive = player.alive !== false;

  return (
    <li
      className={`flex items-center gap-2 px-3 py-2 border-b border-[#2e2e35] last:border-0 ${
        isMe ? "bg-[#1c1c14]" : "hover:bg-[#1c1c21]"
      } transition-colors`}
    >
      {/* Rank number */}
      <span
        className="w-4 text-[10px] font-mono font-bold shrink-0 tabular-nums"
        style={{
          color:
            rank === 1 ? "#f5a623"
            : rank === 2 ? "#a0a0a8"
            : rank === 3 ? "#c07e30"
            : "#2e2e35",
        }}
      >
        {rank}
      </span>

      {/* Color identity dot */}
      <span
        className="w-2 h-2 shrink-0"
        style={{ background: palette.body }}
      />

      {/* Name + badges */}
      <div className="flex-1 min-w-0">
        <span
          className={`text-xs font-mono font-semibold truncate block ${
            isMe ? "text-[#f5a623]" : "text-[#e8e8ea]"
          }`}
        >
          {player.nickname}
          {isMe && <span className="text-[#4a4a55] font-normal ml-1">you</span>}
          {isHost && (
            <span className="ml-1 text-[9px] font-bold text-[#7a7a85] uppercase tracking-wider">
              [host]
            </span>
          )}
        </span>
        <span
          className="text-[10px] font-mono"
          style={{ color: alive ? "#2ecc71" : "#e74c3c" }}
        >
          {alive ? `${player.hp ?? 100} HP` : "dead"} &nbsp;
          <span className="text-[#4a4a55]">
            {player.kills ?? 0}K / {player.deaths ?? 0}D
          </span>
        </span>
      </div>

      {/* Score — number-primary */}
      <span className="text-sm font-mono font-bold tabular-nums text-[#e8e8ea] shrink-0">
        {player.score ?? 0}
      </span>
    </li>
  );
}

export default function Lobby({
  room,
  players = [],
  coins = [],
  currentPlayerId,
  onLeave,
  isLeaving,
  onStartMatch,
  isStartingMatch,
  matchState,
}) {
  const isHost = room?.host_id === currentPlayerId;
  const playerCount = players?.length ?? 0;
  const activeCoinCount = coins?.filter((c) => c.active)?.length ?? 0;
  const currentPlayer = players?.find((p) => p.id === currentPlayerId);

  const phase = matchState?.phase || "waiting";
  const countdown = matchState?.countdownSeconds ?? 3;
  const matchRemaining = matchState?.matchSecondsRemaining ?? 300;
  const isCollectiblesActive = matchState?.isCollectiblesActive ?? false;

  // Skill cooldowns
  const [skillCooldowns, setSkillCooldowns] = useState({
    dash: 0,
    shield: 0,
    shockwave: 0,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setSkillCooldowns((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          if (next[k] > 0) {
            next[k] = Math.max(0, next[k] - 0.1);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const handleSkillCooldownUpdate = useCallback((skillKey, cooldownSecs) => {
    setSkillCooldowns((prev) => ({ ...prev, [skillKey]: cooldownSecs }));
  }, []);

  // Finished
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

  // Timer
  const minutes = Math.floor(matchRemaining / 60);
  const seconds = matchRemaining % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const isLowTime = phase === "playing" && matchRemaining <= 30;

  // Sorted leaderboard
  const sortedPlayers = [...players].sort((a, b) => {
    const sd = (b.score ?? 0) - (a.score ?? 0);
    if (sd !== 0) return sd;
    const kd = (b.kills ?? 0) - (a.kills ?? 0);
    if (kd !== 0) return kd;
    return new Date(a.joined_at) - new Date(b.joined_at);
  });

  const highestScore = sortedPlayers[0]?.score ?? 0;
  const myHp = currentPlayer?.hp ?? 100;
  const myPalette = getPlayerPalette(currentPlayer?.color_key || "orange");
  const epochNow = Date.now();

  // Core skill cooldown definitions for the HUD dock
  const coreCds = {
    dash: skillCooldowns.dash,
    shield: skillCooldowns.shield,
    shockwave: skillCooldowns.shockwave,
  };

  return (
    <div className="h-screen bg-[#0d0d0f] text-[#e8e8ea] flex flex-col overflow-hidden">

      {/* ── Top HUD bar ─────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-2 bg-[#16161a] border-b border-[#2e2e35] shrink-0">
        {/* Left: Player identity + HP */}
        <div className="flex items-center gap-3">
          {/* Color swatch */}
          <span
            className="w-2.5 h-8 shrink-0"
            style={{ background: myPalette.body }}
          />
          <div className="flex flex-col gap-1">
            <span className="text-xs font-mono font-bold text-[#e8e8ea] leading-none">
              {currentPlayer?.nickname ?? "—"}
            </span>
            <HpBar current={myHp} max={100} />
          </div>
        </div>

        {/* Center: Match clock */}
        <div className="flex flex-col items-center">
          <span
            className={`text-2xl font-mono font-bold tabular-nums leading-none ${
              isLowTime ? "text-[#e74c3c]" : "text-[#e8e8ea]"
            }`}
          >
            {phase === "playing" ? formattedTime : "05:00"}
          </span>
          <span className="text-[9px] font-mono text-[#4a4a55] uppercase tracking-wider mt-0.5">
            {phase === "waiting" ? "Waiting" : phase === "countdown" ? "Starting" : "Time"}
          </span>
        </div>

        {/* Right: Coins + Score + KD */}
        <div className="flex items-center gap-4">
          {/* Coins on map */}
          <div className="flex flex-col items-end">
            <span className="text-sm font-mono font-bold tabular-nums text-[#e8e8ea] leading-none">
              {activeCoinCount}
            </span>
            <span className="text-[9px] font-mono text-[#4a4a55] uppercase">coins</span>
          </div>
          {/* Score */}
          <div className="flex flex-col items-end">
            <span className="text-sm font-mono font-bold tabular-nums text-[#f5a623] leading-none">
              {currentPlayer?.score ?? 0}
            </span>
            <span className="text-[9px] font-mono text-[#4a4a55] uppercase">pts</span>
          </div>
          {/* K/D */}
          <div className="flex flex-col items-end">
            <span className="text-sm font-mono font-bold tabular-nums text-[#e8e8ea] leading-none">
              {currentPlayer?.kills ?? 0}
              <span className="text-[#4a4a55]"> / </span>
              {currentPlayer?.deaths ?? 0}
            </span>
            <span className="text-[9px] font-mono text-[#4a4a55] uppercase">K / D</span>
          </div>
          {/* Room code */}
          <div className="flex flex-col items-end ml-3 pl-3 border-l border-[#2e2e35]">
            <span className="text-base font-mono font-bold tracking-[0.15em] text-[#f5a623] leading-none">
              {room?.code ?? "———"}
            </span>
            <span className="text-[9px] font-mono text-[#4a4a55] uppercase">room</span>
          </div>
        </div>
      </header>

      {/* ── Main: Arena + HUD ─────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden min-h-0">

        {/* Arena Area (Canvas + Floating Leaderboard) */}
        <div className="flex-1 min-h-0 relative bg-[#0d0d0f] overflow-hidden">
          <GameCanvas
            roomId={room?.id}
            currentPlayerId={currentPlayerId}
            players={players}
            coins={coins}
            matchPhase={phase}
            countdownSeconds={countdown}
            isCollectiblesActive={isCollectiblesActive}
            skillCooldowns={coreCds}
            onSkillCooldownUpdate={handleSkillCooldownUpdate}
          />

          {/* Floating Leaderboard */}
          <div className="absolute top-4 right-4 w-48 flex flex-col border border-[#2e2e35] bg-[#16161a]/90 backdrop-blur-sm pointer-events-none z-10">
            <div className="px-3 py-2 border-b border-[#2e2e35] flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.15em] text-[#f5a623]">
                Rankings
              </span>
              <span className="text-[10px] font-mono text-[#4a4a55]">
                {playerCount}/{MAX_PLAYERS}
              </span>
            </div>
            <ul className="flex flex-col">
              {sortedPlayers.length > 0 ? (
                sortedPlayers.map((player, index) => (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    rank={index + 1}
                    isMe={player.id === currentPlayerId}
                    isHost={player.id === room?.host_id}
                    isLeader={index === 0 && highestScore > 0}
                    epochNow={epochNow}
                  />
                ))
              ) : (
                <li className="px-3 py-4 text-[11px] font-mono text-[#4a4a55]">
                  Waiting for players…
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* ── Bottom Bar (Ability Dock + Actions) ─────────────────────── */}
        <div className="shrink-0 flex items-center justify-between bg-[#16161a] border-t border-[#2e2e35] px-4 py-2">
          
          {/* Left: Abilities */}
          <div className="flex items-center gap-1">
            {[
              { id: "attack",    icon: "⚔️",  label: "ATTACK", hotkey: "SPACE", cd: 0,              maxCd: 1, color: "#e74c3c" },
              { id: "dash",      icon: "⚡",  label: "DASH",   hotkey: "Q",     cd: coreCds.dash,    maxCd: 4, color: "#3b82f6" },
              { id: "shield",    icon: "🛡️", label: "SHIELD", hotkey: "E",     cd: coreCds.shield,  maxCd: 8, color: "#f5a623" },
              { id: "shockwave", icon: "💥",  label: "BURST",  hotkey: "R",     cd: coreCds.shockwave, maxCd: 7, color: "#10b981" },
            ].map((s) => {
              const isOnCd = s.cd > 0;
              const cdPct = s.maxCd > 0 ? Math.max(0, Math.min(1, s.cd / s.maxCd)) : 0;
              const canUse = phase === "playing" && currentPlayer?.alive && !isOnCd;

              return (
                <div
                  key={s.id}
                  className="relative flex flex-col items-center justify-between w-16 h-16 p-1.5 border font-mono select-none"
                  style={{
                    clipPath: "polygon(6px 0%, 100% 0%, 100% 100%, 0% 100%, 0% 6px)",
                    background: isOnCd ? "#16161a" : "#1c1c21",
                    borderColor: isOnCd ? "#2e2e35" : "#46464f",
                    opacity: canUse || !isOnCd ? 1 : 0.5,
                  }}
                  title={`${s.label} [${s.hotkey}]`}
                >
                  {isOnCd && (
                    <div
                      className="absolute inset-0 bg-black/65 flex items-center justify-center cd-active"
                      style={{ zIndex: 10 }}
                    >
                      <span className="text-sm font-bold text-[#f5a623] tabular-nums">
                        {s.cd.toFixed(1)}
                      </span>
                    </div>
                  )}
                  {isOnCd && (
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#2e2e35]">
                      <div
                        className="h-full"
                        style={{ width: `${(1 - cdPct) * 100}%`, background: s.color }}
                      />
                    </div>
                  )}
                  <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: s.color }} />
                  <span className="text-[8px] font-bold self-end text-[#4a4a55] leading-none z-10">
                    [{s.hotkey}]
                  </span>
                  <span className="text-xl leading-none z-10" style={{ opacity: isOnCd ? 0.3 : 1 }}>
                    {s.icon}
                  </span>
                  <span
                    className="text-[8px] font-bold uppercase tracking-tight text-center w-full z-10 leading-none"
                    style={{ color: isOnCd ? "#4a4a55" : "#e8e8ea" }}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}

            <div className="w-px h-10 bg-[#2e2e35] mx-1" />

            <div className="ml-1 flex flex-col gap-1">
              <span className="text-[9px] font-mono text-[#4a4a55]">Move: WASD / Arrows</span>
              <span className="text-[9px] font-mono text-[#4a4a55]">Attack: Click / Space</span>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            {isHost && phase === "waiting" && (
              <GameButton
                id="btn-start-game"
                onClick={onStartMatch}
                disabled={isStartingMatch}
                variant="primary"
                size="md"
              >
                {isStartingMatch ? "Starting…" : "Start Battle"}
              </GameButton>
            )}
            {phase === "waiting" && !isHost && (
              <p className="text-[10px] font-mono text-[#4a4a55] leading-snug">
                Waiting for host...
              </p>
            )}
            <GameButton
              id="btn-leave-room"
              onClick={onLeave}
              disabled={isLeaving}
              variant="ghost"
              size="sm"
            >
              {isLeaving ? "Leaving…" : "Leave"}
            </GameButton>
          </div>

        </div>
      </main>
    </div>
  );
}
