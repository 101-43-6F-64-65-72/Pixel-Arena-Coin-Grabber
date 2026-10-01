"use client";

/**
 * GameOver component (Phase 6).
 *
 * Displays:
 *   - Match completed banner
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
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl p-6 flex flex-col items-center text-center">
        {/* Header Icon & Title */}
        <div className="w-14 h-14 rounded-full bg-yellow-950/60 border border-yellow-700/60 flex items-center justify-center mb-4 text-2xl">
          🏆
        </div>

        <h2 className="text-2xl font-bold font-mono text-white tracking-tight">
          Match Finished
        </h2>
        <p className="text-zinc-500 text-xs font-mono mt-1">
          Final Scores
        </p>

        {/* Leaderboard list */}
        <div className="w-full bg-zinc-950/80 border border-zinc-800/80 rounded-xl overflow-hidden my-6">
          <ul className="divide-y divide-zinc-800/60">
            {sortedPlayers.map((player, index) => {
              const isMe = player.id === currentPlayerId;
              const isWinner = (player.score ?? 0) === highestScore && highestScore > 0;

              return (
                <li
                  key={player.id}
                  className={`px-4 py-3 flex items-center justify-between gap-3 ${
                    isWinner ? "bg-yellow-950/20" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold ${
                        index === 0
                          ? "bg-yellow-500 text-zinc-950"
                          : index === 1
                          ? "bg-zinc-400 text-zinc-950"
                          : index === 2
                          ? "bg-amber-700 text-white"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {index + 1}
                    </span>

                    <span className={`text-sm font-medium truncate ${isMe ? "text-white font-bold" : "text-zinc-300"}`}>
                      {player.nickname}
                      {isMe && <span className="text-zinc-500 text-xs font-normal ml-1.5">(you)</span>}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isWinner && (
                      <span className="text-[10px] font-mono font-bold text-yellow-400 bg-yellow-950/80 px-2 py-0.5 rounded border border-yellow-800/60 uppercase tracking-wider">
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
        <button
          onClick={onLeave}
          disabled={isLeaving}
          className="w-full py-3.5 bg-zinc-800 hover:bg-zinc-700 text-white font-mono font-semibold text-sm rounded-xl border border-zinc-700 transition-colors disabled:opacity-50"
        >
          {isLeaving ? "Leaving…" : "Back to Home"}
        </button>
      </div>
    </div>
  );
}
