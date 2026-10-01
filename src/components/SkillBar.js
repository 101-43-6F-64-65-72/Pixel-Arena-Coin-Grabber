"use client";

import { useState } from "react";
import { SKILL_CATALOG, GACHA_COST, rollGachaSkill } from "@/lib/skills";

/**
 * SkillBar & Gacha Component:
 * Displays active skill slots, cooldowns, hotkeys, and the Skill Gacha Roller.
 */
export default function SkillBar({
  equippedSkills = { primary: null, secondary: null },
  skillCooldowns = {}, // { [skillId]: remainingSeconds }
  activeSkillEffects = {}, // { [skillId]: remainingDuration }
  playerScore = 0,
  onActivateSkill,
  onEquipSkill,
  onSpendCoinsForGacha,
  disabled = false,
}) {
  const [isGachaOpen, setIsGachaOpen] = useState(false);
  const [isRolling, setIsRolling] = useState(false);
  const [rolledSkill, setRolledSkill] = useState(null);
  const [selectedSlotToReplace, setSelectedSlotToReplace] = useState("primary");

  const canAffordGacha = playerScore >= GACHA_COST;

  const handleStartRoll = () => {
    if (!canAffordGacha || isRolling) return;

    // Deduct coins if callback provided
    if (onSpendCoinsForGacha) {
      const success = onSpendCoinsForGacha(GACHA_COST);
      if (!success) return;
    }

    setIsRolling(true);
    setRolledSkill(null);

    // Roll animation delay
    let rollCount = 0;
    const skillsList = Object.values(SKILL_CATALOG);
    const interval = setInterval(() => {
      rollCount++;
      const tempSkill = skillsList[Math.floor(Math.random() * skillsList.length)];
      setRolledSkill(tempSkill);

      if (rollCount > 14) {
        clearInterval(interval);
        const finalSkill = rollGachaSkill(equippedSkills.primary?.id);
        setRolledSkill(finalSkill);
        setIsRolling(false);
      }
    }, 90);
  };

  const handleEquipRolled = (slot) => {
    if (!rolledSkill) return;
    onEquipSkill(slot, rolledSkill);
    setRolledSkill(null);
    setIsGachaOpen(false);
  };

  const renderSlot = (slotKey, skill, defaultKey) => {
    if (!skill) {
      return (
        <button
          onClick={() => setIsGachaOpen(true)}
          disabled={disabled}
          className="group relative flex flex-col items-center justify-center w-20 h-20 bg-zinc-900/90 hover:bg-zinc-800/80 border-2 border-dashed border-zinc-700 hover:border-orange-500/80 rounded-2xl transition-all cursor-pointer shadow-lg active:scale-95 disabled:opacity-40"
        >
          <span className="text-xl group-hover:scale-110 transition-transform">➕</span>
          <span className="text-[10px] font-mono text-zinc-400 mt-1 uppercase">Empty</span>
          <span className="text-[9px] font-mono text-zinc-500 font-bold">[{defaultKey}]</span>
        </button>
      );
    }

    const cdRemaining = skillCooldowns[skill.id] || 0;
    const isOnCd = cdRemaining > 0;
    const activeRemaining = activeSkillEffects[skill.id] || 0;
    const isActive = activeRemaining > 0;

    return (
      <button
        onClick={() => onActivateSkill(skill.id)}
        disabled={disabled || isOnCd}
        title={`${skill.name} (${skill.keyDisplay}): ${skill.description}`}
        className={`group relative flex flex-col items-center justify-between p-2 w-20 h-20 rounded-2xl border-2 transition-all cursor-pointer shadow-xl select-none ${
          isActive
            ? "border-emerald-400 bg-emerald-950/80 shadow-emerald-500/40 shadow-lg scale-105"
            : isOnCd
            ? "border-zinc-800 bg-zinc-900/70 opacity-60 cursor-not-allowed"
            : `${skill.tier.border} ${skill.tier.bg} hover:scale-105 active:scale-95 hover:shadow-orange-500/20`
        }`}
      >
        {/* Active Glow Ring */}
        {isActive && (
          <span className="absolute inset-0 rounded-2xl border-2 border-emerald-400 animate-ping opacity-50" />
        )}

        {/* Cooldown Overlay */}
        {isOnCd && (
          <div className="absolute inset-0 rounded-2xl bg-black/75 flex flex-col items-center justify-center z-10">
            <span className="text-sm font-bold font-mono text-white">
              {cdRemaining.toFixed(1)}s
            </span>
          </div>
        )}

        {/* Skill Icon & Keybadge */}
        <div className="w-full flex items-center justify-between">
          <span className="text-2xl drop-shadow">{skill.icon}</span>
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-900/90 text-zinc-300 border border-zinc-700">
            {skill.keyDisplay}
          </span>
        </div>

        {/* Skill Name */}
        <div className="w-full text-center truncate">
          <span className="text-[11px] font-bold font-mono text-white tracking-tight truncate block">
            {skill.name}
          </span>
          <span className="text-[8px] font-mono uppercase text-zinc-400">
            {skill.tier.name}
          </span>
        </div>
      </button>
    );
  };

  return (
    <>
      {/* HUD Bottom Skill Dock */}
      <div className="flex items-center gap-3 bg-zinc-950/90 p-2.5 rounded-2xl border border-zinc-800/90 shadow-2xl backdrop-blur-md">
        {/* Slot 1: Primary Skill */}
        <div className="flex flex-col items-center">
          {renderSlot("primary", equippedSkills.primary, "SPACE")}
          <span className="text-[9px] font-mono text-zinc-400 mt-1 uppercase tracking-wider font-semibold">
            SLOT 1
          </span>
        </div>

        {/* Slot 2: Secondary Skill */}
        <div className="flex flex-col items-center">
          {renderSlot("secondary", equippedSkills.secondary, "Q")}
          <span className="text-[9px] font-mono text-zinc-400 mt-1 uppercase tracking-wider font-semibold">
            SLOT 2
          </span>
        </div>

        {/* Gacha Roller Launcher Button */}
        <div className="h-16 w-px bg-zinc-800/80 mx-1" />

        <button
          id="btn-open-gacha"
          onClick={() => setIsGachaOpen(true)}
          disabled={disabled}
          className="flex flex-col items-center justify-center px-4 h-20 bg-gradient-to-br from-amber-600/90 to-orange-700 hover:from-amber-500 hover:to-orange-600 active:scale-95 text-white font-mono rounded-2xl border-2 border-amber-400/80 transition-all shadow-lg shadow-amber-950/50 cursor-pointer disabled:opacity-50"
        >
          <span className="text-2xl animate-bounce">🎰</span>
          <span className="text-xs font-bold uppercase tracking-wider mt-0.5">
            SKILL GACHA
          </span>
          <span className="text-[9px] text-amber-200 font-semibold">
            Cost: {GACHA_COST} Coins
          </span>
        </button>
      </div>

      {/* ─── SKILL GACHA MODAL ──────────────────────────────────────────────── */}
      {isGachaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="max-w-md w-full bg-zinc-900 border-2 border-amber-500/80 rounded-3xl p-6 shadow-2xl relative flex flex-col items-center text-center">
            {/* Close Button */}
            <button
              onClick={() => {
                if (!isRolling) setIsGachaOpen(false);
              }}
              disabled={isRolling}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white text-xl p-2 rounded-full hover:bg-zinc-800 cursor-pointer transition-colors"
            >
              ✕
            </button>

            {/* Header */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-3xl">🎰</span>
              <h2 className="text-2xl font-bold font-mono text-amber-400 tracking-tight">
                LUCKY SKILL GACHA
              </h2>
            </div>
            <p className="text-xs font-mono text-zinc-400 mb-6">
              Spin to unlock game-changing battle skills! (Cost: {GACHA_COST} pts)
            </p>

            {/* Gacha Reel Display */}
            <div className="w-full h-44 bg-zinc-950 border-2 border-zinc-800 rounded-2xl flex flex-col items-center justify-center p-4 relative overflow-hidden shadow-inner mb-6">
              {rolledSkill ? (
                <div className={`flex flex-col items-center animate-in zoom-in-90 duration-300 ${rolledSkill.tier.color}`}>
                  <span className="text-5xl mb-2 drop-shadow-md">{rolledSkill.icon}</span>
                  <strong className="text-lg font-bold font-mono text-white tracking-wide">
                    {rolledSkill.name}
                  </strong>
                  <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${rolledSkill.tier.border} ${rolledSkill.tier.bg} text-white mt-1`}>
                    {rolledSkill.tier.name}
                  </span>
                  <p className="text-xs font-mono text-zinc-300 mt-2 max-w-xs text-center">
                    {rolledSkill.description}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center text-zinc-500 font-mono">
                  <span className="text-4xl mb-2 opacity-60">❓</span>
                  <span className="text-sm font-semibold">Press Spin to Reveal Skill</span>
                  <span className="text-[11px] text-zinc-600 mt-1">
                    Common (60%) • Rare (35%) • Legendary (10%)
                  </span>
                </div>
              )}
            </div>

            {/* Equip Choice or Spin Button */}
            {rolledSkill && !isRolling ? (
              <div className="w-full space-y-3">
                <span className="text-xs font-mono text-zinc-300 block">
                  Equip <strong>{rolledSkill.name}</strong> to:
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleEquipRolled("primary")}
                    className="py-3 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-bold font-mono text-xs rounded-xl transition-all shadow-md cursor-pointer"
                  >
                    SLOT 1 [SPACE]
                  </button>
                  <button
                    onClick={() => handleEquipRolled("secondary")}
                    className="py-3 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-bold font-mono text-xs rounded-xl transition-all shadow-md cursor-pointer"
                  >
                    SLOT 2 [Q]
                  </button>
                </div>
                <button
                  onClick={handleStartRoll}
                  disabled={!canAffordGacha}
                  className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-40"
                >
                  Roll Again ({GACHA_COST} pts)
                </button>
              </div>
            ) : (
              <button
                onClick={handleStartRoll}
                disabled={!canAffordGacha || isRolling}
                className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 active:from-amber-600 active:to-orange-600 text-zinc-950 font-bold font-mono text-base rounded-2xl transition-all shadow-xl shadow-amber-500/25 disabled:opacity-40 cursor-pointer"
              >
                {isRolling ? "Rolling..." : `SPIN GACHA (${GACHA_COST} COINS)`}
              </button>
            )}

            {/* Coin Balance Warning */}
            <div className="mt-4 text-xs font-mono text-zinc-400 flex items-center gap-1.5">
              <span>Your Coins:</span>
              <strong className={`font-bold ${canAffordGacha ? "text-yellow-400" : "text-red-400"}`}>
                {playerScore} pts
              </strong>
              {!canAffordGacha && (
                <span className="text-red-400 text-[11px]">(Need {GACHA_COST} pts)</span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
