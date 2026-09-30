import GameCanvas from "@/components/GameCanvas";

export default function Home() {
  return (
    // Full-viewport container — the canvas expands to fill it.
    <div className="w-full h-full flex flex-col bg-black">
      {/* Minimal header — placeholder for HUD in later phases */}
      <header className="shrink-0 px-4 py-2 bg-zinc-900 border-b border-zinc-800">
        <span className="text-zinc-400 text-sm font-mono tracking-widest uppercase">
          Pixel Arena · Coin Grabber
        </span>
      </header>

      {/* Canvas fills remaining height */}
      <main className="flex-1 relative">
        <GameCanvas />
      </main>
    </div>
  );
}
