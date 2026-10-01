"use client";

/**
 * HomeScreen — entry point for Pixel Arena: Coin Grabber.
 *
 * Presents two actions: Create Room and Join Room.
 * No game logic runs here.
 */
export default function HomeScreen({ onCreateRoom, onJoinRoom }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 px-4">
      {/* Title */}
      <div className="mb-12 text-center">
        <p className="text-zinc-500 text-xs font-mono tracking-[0.3em] uppercase mb-3">
          Multiplayer Arena
        </p>
        <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight leading-tight">
          Pixel Arena
        </h1>
        <p className="text-orange-400 font-mono text-lg mt-1 tracking-widest">
          COIN GRABBER
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button
          id="btn-create-room"
          onClick={onCreateRoom}
          className="w-full py-4 bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-white font-semibold text-base rounded-lg transition-colors duration-150 tracking-wide"
        >
          Create Room
        </button>
        <button
          id="btn-join-room"
          onClick={onJoinRoom}
          className="w-full py-4 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-900 text-white font-semibold text-base rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors duration-150 tracking-wide"
        >
          Join Room
        </button>
      </div>

      <p className="mt-12 text-zinc-600 text-xs font-mono">2–4 players · 60 second match</p>
    </div>
  );
}
