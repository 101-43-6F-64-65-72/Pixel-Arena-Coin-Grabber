"use client";

import GameCanvas from "@/components/GameCanvas";
import GameOver from "@/components/GameOver";

/**
 * Lobby & Match Arena Component (Phase 6).
 *
 * Manages UI for all match lifecycle phases:
 *   1. WAITING   → Practice Arena + Start Game button (host only) + Player List
 *   2. COUNTDOWN → 3..2..1 Countdown overlay on arena + status indicators
 *   3. PLAYING   → 60s Authoritative Match Timer + live coin grabbing & scores
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
  const matchRemaining = matchState?.matchSecondsRemaining ?? 60;
  const isCollectiblesActive = matchState?.isCollectiblesActive ?? false;

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

  // Format MM:SS for match timer
  const minutes = Math.floor(matchRemaining / 60);
  const seconds = matchRemaining % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col p-4 md:p-8">
      {/* Header */}
      <header className="max-w-6xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-zinc-800/80 mb-6">
        <div>
          <h1 className="text-xl font-bold font-mono tracking-tight text-white flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${
                phase === "playing"
                  ? "bg-emerald-500 animate-pulse"
                  : phase === "countdown"
                  ? "bg-yellow-400 animate-ping"
                  : "bg-orange-500 animate-pulse"
              }`}
            />
            Pixel Arena: Coin Grabber
          </h1>
          <p className="text-zinc-500 text-xs font-mono mt-0.5">
            Use <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-zinc-300">WASD</kbd> or <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-zinc-300">Arrow Keys</kbd> to move and collect coins
          </p>
        </div>

        {/* Room Code Badge */}
        <div className="flex items-center gap-3 bg-zinc-900 px-4 py-2 rounded-xl border border-zinc-800">
          <span className="text-zinc-500 text-xs font-mono uppercase tracking-wider">
            Room Code:
          </span>
          <span className="text-2xl font-bold text-orange-400 font-mono tracking-widest">
            {room?.code ?? "———"}
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl w-full mx-auto flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Game Canvas Arena (Spans 2 columns on large screens) */}
        <div className="lg:col-span-2 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 flex flex-col shadow-xl">
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
                  ? "MATCH IN PROGRESS"
                  : "WAITING IN LOBBY"}
              </span>
            </div>

            {/* Live Match Timer & Score HUD */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Match Timer Badge */}
              <div
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border font-mono ${
                  phase === "playing"
                    ? matchRemaining <= 10
                      ? "bg-red-950/80 border-red-600 text-red-300 animate-pulse shadow-red-900/40 shadow-sm"
                      : "bg-emerald-950/60 border-emerald-700/80 text-emerald-300 shadow-emerald-900/20 shadow-sm"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400"
                }`}
              >
                <span className="text-xs uppercase text-zinc-400 font-semibold">TIME:</span>
                <strong className="text-sm font-bold tracking-wider">
                  {phase === "playing" ? formattedTime : "01:00"}
                </strong>
              </div>

              {/* Coins remaining badge */}
              <div className="flex items-center gap-1.5 bg-yellow-950/50 border border-yellow-700/60 px-3 py-1 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-xs font-mono text-yellow-300">
                  Coins: <strong className="text-yellow-100 font-bold">{activeCoinCount}</strong>
                </span>
              </div>

              {/* Player Score badge */}
              <div className="flex items-center gap-1.5 bg-orange-950/50 border border-orange-700/60 px-3 py-1 rounded-lg">
                <span className="text-xs font-mono text-orange-300">
                  Score: <strong className="text-orange-100 font-bold">{currentPlayer?.score ?? 0}</strong>
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
            />
          </div>
        </div>

        {/* Sidebar: Players & Controls */}
        <div className="flex flex-col gap-4">
          {/* Player list card */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-4 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900">
              <span className="text-zinc-400 text-xs font-mono tracking-widest uppercase font-semibold">
                Players & Scores
              </span>
              <span className="text-zinc-400 text-xs font-mono">
                <span className="text-white font-bold">{playerCount}</span>
                <span className="text-zinc-600"> / {MAX_PLAYERS}</span>
              </span>
            </div>

            <ul className="divide-y divide-zinc-800/60">
              {players && players.length > 0 ? (
                players.map((player) => {
                  const isRoomHost = player.id === room?.host_id;
                  const isMe = player.id === currentPlayerId;
                  return (
                    <li
                      key={player.id}
                      className="px-4 py-3 flex items-center gap-3 hover:bg-zinc-800/30 transition-colors"
                    >
                      <span
                        className={`w-3 h-3 rounded-full shrink-0 shadow-sm ${
                          isRoomHost ? "bg-orange-400 shadow-orange-500/50" : "bg-blue-400 shadow-blue-500/50"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-semibold truncate ${isMe ? "text-white" : "text-zinc-300"}`}>
                            {player.nickname}
                          </span>
                          {isMe && (
                            <span className="text-orange-400/90 text-xs font-mono shrink-0 font-medium">(you)</span>
                          )}
                          {isRoomHost && (
                            <span className="text-orange-400 text-[10px] font-mono font-bold tracking-wide bg-orange-950/80 px-1.5 py-0.5 rounded border border-orange-800/80 shrink-0">
                              HOST
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Score Badge */}
                      <div className="bg-zinc-800 px-2.5 py-1 rounded-lg border border-zinc-700 flex items-center gap-1.5 shadow-sm">
                        <span className="text-[10px] font-mono text-zinc-400 font-semibold uppercase">PTS</span>
                        <span className="text-sm font-bold font-mono text-yellow-400">
                          {player.score ?? 0}
                        </span>
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
                className="w-full py-4 bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-zinc-950 font-bold font-mono text-base rounded-xl transition-all duration-150 shadow-lg shadow-orange-500/25 disabled:opacity-50 cursor-pointer"
              >
                {isStartingMatch ? "Starting Match…" : "START MATCH (60s)"}
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
              className="w-full py-3 bg-zinc-900 hover:bg-red-950/50 text-zinc-300 hover:text-red-300 border border-zinc-800 hover:border-red-800 font-mono font-medium text-sm rounded-xl transition-colors duration-150 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {isLeaving ? "Leaving…" : "Leave Room"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
