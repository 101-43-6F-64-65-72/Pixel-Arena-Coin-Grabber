"use client";

import { GameButton, GamePanel } from "@/components/GameUIComponents";

/**
 * GameOver component.
 * Displays:
 *   - Match completed victory banner (styled like uiset3.png board)
 *   - Final scores for all players in the room
 *   - Winner highlight (with tie support)
 *   - Return to lobby / Leave room action
 */
export default function GameOver({
  players = [],
  currentPlayerId,
  onLeave,
  isLeaving,
}) {
  // Sort players by score descending (stable sort with joined_at for tie display)
  const sortedPlayers = [...players].sort((a, b) => {
    const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return new Date(a.joined_at) - new Date(b.joined_at);
  });

  const highestScore = sortedPlayers[0]?.score ?? 0;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Ambience Grid */}
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(circle at 50% 50%, rgba(245, 158, 11, 0.2) 0%, transparent 60%),
            linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
          `,
          backgroundSize: "100% 100%, 32px 32px, 32px 32px",
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        <GamePanel title="MATCH VICTORY" icon="🏆" className="text-center">
          <p className="text-amber-300 text-xs font-mono tracking-widest uppercase -mt-2 mb-6">
            FINAL ARENA STANDINGS
          </p>

          {/* Leaderboard list */}
          <div className="w-full bg-zinc-950/90 border-2 border-amber-900/60 rounded-2xl overflow-hidden mb-6 shadow-inner">
            <ul className="divide-y divide-zinc-800/80">
              {sortedPlayers.map((player, index) => {
                const isMe = player.id === currentPlayerId;
                const isWinner = (player.score ?? 0) === highestScore && highestScore > 0;

                return (
                  <li
                    key={player.id}
                    className={`px-4 py-3.5 flex items-center justify-between gap-3 ${
                      isWinner ? "bg-amber-950/30" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-mono font-bold shadow-md ${
                          index === 0
                            ? "bg-gradient-to-b from-amber-300 to-amber-600 text-amber-950 border border-amber-200"
                            : index === 1
                            ? "bg-zinc-400 text-zinc-950"
                            : index === 2
                            ? "bg-amber-800 text-white"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {index === 0 ? "👑" : index + 1}
                      </span>

                      <span className={`text-sm font-semibold truncate ${isMe ? "text-amber-300 font-bold" : "text-zinc-200"}`}>
                        {player.nickname}
                        {isMe && <span className="text-zinc-400 text-xs font-normal ml-1.5">(you)</span>}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isWinner && (
                        <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded-lg border border-amber-600/60 uppercase tracking-wider">
                          Winner
                        </span>
                      )}
                      <span className="text-base font-bold font-mono text-yellow-400">
                        {player.score ?? 0} <span className="text-xs text-zinc-500 font-normal">pts</span>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Action Button */}
          <GameButton
            onClick={onLeave}
            disabled={isLeaving}
            variant="orange"
            size="lg"
            className="w-full"
          >
            {isLeaving ? "Leaving…" : "Back to Main Menu"}
          </GameButton>
        </GamePanel>
      </div>
    </div>
  );
}

