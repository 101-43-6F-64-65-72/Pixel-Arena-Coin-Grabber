"use client";

import { GameButton } from "@/components/GameUIComponents";
import { getPlayerPalette } from "@/lib/arena";

/**
 * GameOver — match result screen.
 *
 * Design: clean result panel, not a modal/card SaaS dialog.
 * Number-primary score display. Clear winner callout.
 * No decorative backgrounds, no gradient panels.
 */
export default function GameOver({
  players = [],
  currentPlayerId,
  onLeave,
  isLeaving,
}) {
  const sortedPlayers = [...players].sort((a, b) => {
    const sd = (b.score ?? 0) - (a.score ?? 0);
    if (sd !== 0) return sd;
    return new Date(a.joined_at) - new Date(b.joined_at);
  });

  const highestScore = sortedPlayers[0]?.score ?? 0;
  const winner = sortedPlayers[0];
  const isMyWin = winner?.id === currentPlayerId && highestScore > 0;

  return (
    <div className="min-h-screen bg-[#0d0d0f] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-xs state-in">
        {/* Result header */}
        <div className="mb-5">
          <p className="text-[10px] font-mono tracking-[0.25em] text-[#4a4a55] uppercase mb-1">
            Match Complete
          </p>
          <h1
            className="text-3xl font-mono font-bold leading-none"
            style={{ color: isMyWin ? "#f5a623" : "#e8e8ea" }}
          >
            {isMyWin ? "Victory" : "Defeat"}
          </h1>
          {winner && highestScore > 0 && (
            <p className="text-[11px] font-mono text-[#7a7a85] mt-1">
              {isMyWin
                ? "You topped the board."
                : `${winner.nickname} topped the board.`}
            </p>
          )}
          <div className="w-8 h-[2px] bg-[#f5a623] mt-3" />
        </div>

        {/* Final standings */}
        <div className="bg-[#16161a] border border-[#2e2e35] mb-4">
          <div className="px-4 py-2 border-b border-[#2e2e35]">
            <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-[#4a4a55]">
              Final Standings
            </span>
          </div>
          <ul>
            {sortedPlayers.map((player, index) => {
              const isMe = player.id === currentPlayerId;
              const isWinner = (player.score ?? 0) === highestScore && highestScore > 0;
              const palette = getPlayerPalette(player.color_key || "orange");

              return (
                <li
                  key={player.id}
                  className={`flex items-center gap-3 px-4 py-3 border-b border-[#2e2e35] last:border-0 ${
                    isWinner ? "bg-[#1c1c14]" : ""
                  }`}
                >
                  {/* Rank */}
                  <span
                    className="w-4 text-xs font-mono font-bold shrink-0"
                    style={{
                      color:
                        index === 0 ? "#f5a623"
                        : index === 1 ? "#a0a0a8"
                        : index === 2 ? "#c07e30"
                        : "#2e2e35",
                    }}
                  >
                    {index + 1}
                  </span>

                  {/* Color dot */}
                  <span
                    className="w-2 h-2 shrink-0"
                    style={{ background: palette.body }}
                  />

                  {/* Name */}
                  <span
                    className={`flex-1 text-xs font-mono font-semibold truncate ${
                      isMe ? "text-[#f5a623]" : "text-[#e8e8ea]"
                    }`}
                  >
                    {player.nickname}
                    {isMe && (
                      <span className="text-[#4a4a55] font-normal ml-1 text-[10px]">
                        you
                      </span>
                    )}
                  </span>

                  {/* Score */}
                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-sm font-mono font-bold text-[#e8e8ea] tabular-nums leading-none">
                      {player.score ?? 0}
                    </span>
                    <span className="text-[9px] font-mono text-[#4a4a55]">pts</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <GameButton
          onClick={onLeave}
          disabled={isLeaving}
          variant="primary"
          size="lg"
          className="w-full justify-center"
        >
          {isLeaving ? "Leaving…" : "Back to Menu"}
        </GameButton>
      </div>
    </div>
  );
}
