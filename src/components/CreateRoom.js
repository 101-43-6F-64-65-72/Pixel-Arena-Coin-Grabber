"use client";

import { useState } from "react";

const MAX_NICKNAME = 30;

/**
 * CreateRoom form.
 *
 * Collects a nickname, then calls onSubmit(nickname).
 * All validation and Supabase operations are handled by the parent page.
 */
export default function CreateRoom({ onSubmit, onBack, isLoading, error }) {
  const [nickname, setNickname] = useState("");

  function handleSubmit(e) {
    e.preventDefault();

    const trimmed = nickname.trim();
    if (!trimmed) return; // button is disabled anyway, but guard here too
    onSubmit(trimmed);
  }

  const isDisabled = isLoading || nickname.trim().length === 0;
  const tooLong = nickname.length > MAX_NICKNAME;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <button
          onClick={onBack}
          className="mb-8 flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-sm font-mono transition-colors"
          disabled={isLoading}
        >
          ← Back
        </button>

        <h2 className="text-2xl font-bold text-white mb-1">Create Room</h2>
        <p className="text-zinc-500 text-sm mb-8">
          Enter your nickname to create a new room.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {/* Nickname */}
          <div>
            <label htmlFor="nickname" className="block text-zinc-400 text-sm font-mono mb-2">
              Nickname
            </label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Your name (max 30 chars)"
              maxLength={MAX_NICKNAME + 1} /* allow typing to show "too long" */
              disabled={isLoading}
              autoFocus
              className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 focus:border-orange-500 focus:outline-none text-white rounded-lg font-mono text-sm placeholder-zinc-600 transition-colors disabled:opacity-50"
            />
            {tooLong && (
              <p className="mt-1 text-red-400 text-xs font-mono">
                Nickname cannot exceed {MAX_NICKNAME} characters.
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <p
              role="alert"
              className="text-red-400 text-sm bg-red-950/30 border border-red-900 rounded-lg px-3 py-2 font-mono"
            >
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            id="btn-submit-create"
            type="submit"
            disabled={isDisabled || tooLong}
            className="w-full py-4 bg-orange-500 hover:bg-orange-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold text-base rounded-lg transition-colors duration-150"
          >
            {isLoading ? "Creating…" : "Create Room"}
          </button>
        </form>
      </div>
    </div>
  );
}
