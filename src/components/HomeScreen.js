"use client";

import { GameButton, GamePanel } from "@/components/GameUIComponents";

/**
 * HomeScreen — entry point for Pixel Arena: Coin Grabber.
 * Polished with custom game asset UI buttons and panels.
 */
export default function HomeScreen({ onCreateRoom, onJoinRoom }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 px-4 relative overflow-hidden">
      {/* Background Ambience Grid */}
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(circle at 50% 50%, rgba(245, 158, 11, 0.15) 0%, transparent 60%),
            linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
          `,
          backgroundSize: "100% 100%, 32px 32px, 32px 32px",
        }}
      />

      <div className="relative z-10 w-full max-w-md flex flex-col items-center">
        {/* Title Header with Game Trophy Emblem */}
        <div className="mb-8 text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-b from-amber-400 to-amber-600 border-2 border-amber-300 flex items-center justify-center shadow-lg shadow-amber-950/80 mb-4 animate-bounce">
            <span className="text-3xl">⚔️</span>
          </div>

          <p className="text-amber-400 text-xs font-mono tracking-[0.3em] uppercase mb-1 drop-shadow">
            Multiplayer Arena
          </p>
          <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-tight font-mono drop-shadow-md">
            PIXEL ARENA
          </h1>
          <p className="text-orange-400 font-mono text-base tracking-widest font-bold mt-1">
            COIN GRABBER & COMBAT
          </p>
        </div>

        {/* Main Actions Panel */}
        <GamePanel className="w-full">
          <div className="flex flex-col gap-4">
            <GameButton
              id="btn-create-room"
              onClick={onCreateRoom}
              variant="orange"
              size="lg"
              icon="👑"
              className="w-full text-base"
            >
              Create Room
            </GameButton>

            <GameButton
              id="btn-join-room"
              onClick={onJoinRoom}
              variant="blue"
              size="lg"
              icon="🚪"
              className="w-full text-base"
            >
              Join Room
            </GameButton>
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-800 text-center">
            <p className="text-zinc-500 text-xs font-mono">
              2–4 players · Realtime Battle · Infinite Coins · Sci-Fi Runner
            </p>
          </div>
        </GamePanel>
      </div>
    </div>
  );
}

