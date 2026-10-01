"use client";

import { GameButton, GamePanel } from "@/components/GameUIComponents";

/**
 * HomeScreen — Entry point for Pixel Arena.
 *
 * Design: flat dark panel, single amber accent, type-first hierarchy.
 * No emoji decorations, no gradient blobs, no bouncing icons.
 */
export default function HomeScreen({ onCreateRoom, onJoinRoom }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0d0d0f] px-4">
      {/* Subtle grid — functional texture, not decoration */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(#e8e8ea 1px, transparent 1px), linear-gradient(90deg, #e8e8ea 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative z-10 w-full max-w-xs flex flex-col gap-8">
        {/* Title block */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-mono tracking-[0.25em] text-[#4a4a55] uppercase">
            Multiplayer · Arena · 2–4 Players
          </span>
          <h1 className="text-4xl font-bold font-mono text-[#e8e8ea] leading-none tracking-tighter">
            PIXEL<br />ARENA
          </h1>
          <div className="w-10 h-[2px] bg-[#f5a623] mt-2" />
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <GameButton
            id="btn-create-room"
            onClick={onCreateRoom}
            variant="primary"
            size="lg"
            className="w-full justify-center"
          >
            Create Room
          </GameButton>

          <GameButton
            id="btn-join-room"
            onClick={onJoinRoom}
            variant="ghost"
            size="lg"
            className="w-full justify-center"
          >
            Join Room
          </GameButton>
        </div>

        {/* Footer info */}
        <p className="text-[10px] text-[#4a4a55] font-mono text-center leading-relaxed">
          Realtime · Competitive · Coin Grabber & Combat
        </p>
      </div>
    </div>
  );
}
