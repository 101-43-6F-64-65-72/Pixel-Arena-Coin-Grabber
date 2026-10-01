"use client";

import { useState } from "react";

const MAX_NICKNAME = 30;
const CODE_DISPLAY_LENGTH = 6;

/**
 * JoinRoom form.
 *
 * Collects a nickname and room code, then calls onSubmit(nickname, code).
 * All validation and Supabase operations are handled by the parent page.
 */
export default function JoinRoom({ onSubmit, onBack, isLoading, error }) {
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    const trimmedNickname = nickname.trim();
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedNickname || !trimmedCode) return;
    onSubmit(trimmedNickname, trimmedCode);
  }

  const nicknameTooLong = nickname.length > MAX_NICKNAME;
  const isDisabled =
    isLoading ||
    nickname.trim().length === 0 ||
    code.trim().length === 0 ||
    nicknameTooLong;

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

        <h2 className="text-2xl font-bold text-white mb-1">Join Room</h2>
        <p className="text-zinc-500 text-sm mb-8">
          Enter your nickname and the room code.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {/* Nickname */}
          <div>
            <label htmlFor="join-nickname" className="block text-zinc-400 text-sm font-mono mb-2">
              Nickname
            </label>
            <input
              id="join-nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Your name (max 30 chars)"
              maxLength={MAX_NICKNAME + 1}
              disabled={isLoading}
              autoFocus
              className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 focus:border-orange-500 focus:outline-none text-white rounded-lg font-mono text-sm placeholder-zinc-600 transition-colors disabled:opacity-50"
            />
            {nicknameTooLong && (
              <p className="mt-1 text-red-400 text-xs font-mono">
                Nickname cannot exceed {MAX_NICKNAME} characters.
              </p>
            )}
          </div>

          {/* Room Code */}
          <div>
            <label htmlFor="room-code" className="block text-zinc-400 text-sm font-mono mb-2">
              Room Code
            </label>
            <input
              id="room-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={`e.g. A7K2P9`}
              maxLength={CODE_DISPLAY_LENGTH}
              disabled={isLoading}
              className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 focus:border-orange-500 focus:outline-none text-white rounded-lg font-mono text-lg tracking-[0.3em] placeholder-zinc-600 placeholder:tracking-normal placeholder:text-sm transition-colors disabled:opacity-50"
            />
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
            id="btn-submit-join"
            type="submit"
            disabled={isDisabled}
            className="w-full py-4 bg-orange-500 hover:bg-orange-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold text-base rounded-lg transition-colors duration-150"
          >
            {isLoading ? "Joining…" : "Join Room"}
          </button>
        </form>
      </div>
    </div>
  );
}
