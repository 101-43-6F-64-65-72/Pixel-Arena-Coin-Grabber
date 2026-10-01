"use client";

import { useState } from "react";
import { GameButton, GamePanel } from "@/components/GameUIComponents";

const MAX_NICKNAME = 30;

/**
 * CreateRoom form.
 * Polished with custom game asset UI buttons and panels.
 */
export default function CreateRoom({ onSubmit, onBack, isLoading, error }) {
  const [nickname, setNickname] = useState("");

  function handleSubmit(e) {
    e.preventDefault();

    const trimmed = nickname.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }

  const isDisabled = isLoading || nickname.trim().length === 0;
  const tooLong = nickname.length > MAX_NICKNAME;

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

      <div className="relative z-10 w-full max-w-sm">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="mb-6 flex items-center gap-2 text-zinc-400 hover:text-amber-400 text-sm font-mono transition-colors cursor-pointer"
          disabled={isLoading}
        >
          ← Back to Main Menu
        </button>

        <GamePanel title="Create Room" icon="⚔️">
          <p className="text-zinc-400 text-xs font-mono text-center mb-6">
            Enter your nickname to host a new arena battle.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
            {/* Nickname Input */}
            <div>
              <label htmlFor="nickname" className="block text-amber-300 text-xs font-mono font-bold uppercase mb-2">
                Commander Nickname
              </label>
              <input
                id="nickname"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Your name (e.g. CyberKnight)"
                maxLength={MAX_NICKNAME + 1}
                disabled={isLoading}
                autoFocus
                className="w-full px-4 py-3 bg-zinc-950/80 border-2 border-amber-700/50 focus:border-amber-400 focus:outline-none text-white rounded-xl font-mono text-sm placeholder-zinc-600 transition-colors disabled:opacity-50 shadow-inner"
              />
              {tooLong && (
                <p className="mt-1 text-red-400 text-xs font-mono">
                  Nickname cannot exceed {MAX_NICKNAME} characters.
                </p>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <p
                role="alert"
                className="text-red-400 text-xs bg-red-950/40 border border-red-800/80 rounded-xl px-3 py-2 font-mono"
              >
                {error}
              </p>
            )}

            {/* Submit Button */}
            <GameButton
              id="btn-submit-create"
              type="submit"
              disabled={isDisabled || tooLong}
              variant="orange"
              size="lg"
              className="w-full mt-2"
            >
              {isLoading ? "Creating…" : "Create Arena"}
            </GameButton>
          </form>
        </GamePanel>
      </div>
    </div>
  );
}

