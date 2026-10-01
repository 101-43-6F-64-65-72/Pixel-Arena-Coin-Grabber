"use client";

import { useState } from "react";
import { GameButton } from "@/components/GameUIComponents";

const MAX_NICKNAME = 30;
const CODE_DISPLAY_LENGTH = 6;

/**
 * JoinRoom — flat game-style form.
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0d0d0f] px-4">
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(#e8e8ea 1px, transparent 1px), linear-gradient(90deg, #e8e8ea 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative z-10 w-full max-w-xs">
        <button
          onClick={onBack}
          disabled={isLoading}
          className="mb-6 text-[11px] font-mono text-[#4a4a55] hover:text-[#f5a623] transition-colors cursor-pointer uppercase tracking-wider"
        >
          ← Back
        </button>

        <div className="bg-[#1c1c21] border border-[#2e2e35] p-6">
          <div className="mb-5 pb-3 border-b border-[#2e2e35]">
            <h1 className="text-sm font-mono font-bold uppercase tracking-[0.15em] text-[#f5a623]">
              Join Room
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <div>
              <label
                htmlFor="join-nickname"
                className="block text-[10px] font-mono font-bold uppercase tracking-wider text-[#7a7a85] mb-1.5"
              >
                Nickname
              </label>
              <input
                id="join-nickname"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="e.g. NeoRunner"
                maxLength={MAX_NICKNAME + 1}
                disabled={isLoading}
                autoFocus
                className="w-full px-3 py-2.5 bg-[#16161a] border border-[#2e2e35] focus:border-[#f5a623] focus:outline-none text-[#e8e8ea] font-mono text-sm placeholder-[#4a4a55] transition-colors disabled:opacity-40"
              />
              {nicknameTooLong && (
                <p className="mt-1 text-[#e74c3c] text-[10px] font-mono">
                  Max {MAX_NICKNAME} characters.
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="room-code"
                className="block text-[10px] font-mono font-bold uppercase tracking-wider text-[#7a7a85] mb-1.5"
              >
                Room Code
              </label>
              <input
                id="room-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="A7K2P9"
                maxLength={CODE_DISPLAY_LENGTH}
                disabled={isLoading}
                className="w-full px-3 py-2.5 bg-[#16161a] border border-[#2e2e35] focus:border-[#f5a623] focus:outline-none text-[#e8e8ea] font-mono text-xl tracking-[0.35em] uppercase placeholder-[#4a4a55] placeholder:tracking-normal placeholder:text-sm transition-colors disabled:opacity-40 text-center font-bold"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="text-[#e74c3c] text-[11px] font-mono bg-[#1a0a0a] border border-[#3d1010] px-3 py-2"
              >
                {error}
              </p>
            )}

            <GameButton
              id="btn-submit-join"
              type="submit"
              disabled={isDisabled}
              variant="primary"
              size="lg"
              className="w-full justify-center mt-1"
            >
              {isLoading ? "Joining…" : "Join Room"}
            </GameButton>
          </form>
        </div>
      </div>
    </div>
  );
}
