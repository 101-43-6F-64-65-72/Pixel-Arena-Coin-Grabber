"use client";

import { useState } from "react";
import { SKILL_CATALOG, GACHA_COST, rollGachaSkill } from "@/lib/skills";
import { AbilityButton, GameButton } from "@/components/GameUIComponents";

/**
 * SkillBar — redesigned as a proper game ability dock.
 *
 * Design principles:
 *   - Ability slots look like HUD keys, not website buttons
 *   - Cooldown shown as bottom progress bar + time text, not "opacity:60"
 *   - Gacha trigger is compact, not a giant gradient button
 *   - No emoji as primary UI elements (label text only)
 *   - No rounded-2xl / glassmorphism on the dock
 */
export default function SkillBar({
  equippedSkills = { primary: null, secondary: null },
  skillCooldowns = {},
  activeSkillEffects = {},
  playerScore = 0,
  onActivateSkill,
  onEquipSkill,
  onSpendCoinsForGacha,
  disabled = false,
}) {
  const [isGachaOpen, setIsGachaOpen] = useState(false);
  const [isRolling, setIsRolling] = useState(false);
  const [rolledSkill, setRolledSkill] = useState(null);

  const canAffordGacha = playerScore >= GACHA_COST;

  const handleStartRoll = () => {
    if (!canAffordGacha || isRolling) return;
    if (onSpendCoinsForGacha) {
      const success = onSpendCoinsForGacha(GACHA_COST);
      if (!success) return;
    }
    setIsRolling(true);
    setRolledSkill(null);
    let rollCount = 0;
    const skillsList = Object.values(SKILL_CATALOG);
    const interval = setInterval(() => {
      rollCount++;
      setRolledSkill(skillsList[Math.floor(Math.random() * skillsList.length)]);
      if (rollCount > 14) {
        clearInterval(interval);
        setRolledSkill(rollGachaSkill(equippedSkills.primary?.id));
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

  const renderSlot = (slotKey, skill, hotkey, label) => {
    if (!skill) {
      return (
        <button
          onClick={() => setIsGachaOpen(true)}
          disabled={disabled}
          title={`${label}: Empty — click to roll a skill`}
          className="relative flex flex-col items-center justify-center w-14 h-14 border border-dashed border-[#2e2e35] bg-[#16161a] transition-colors hover:border-[#46464f] disabled:opacity-30 cursor-pointer"
          style={{ clipPath: "polygon(6px 0%, 100% 0%, 100% 100%, 0% 100%, 0% 6px)" }}
        >
          <span className="text-[8px] font-mono font-bold text-[#2e2e35] uppercase tracking-wider self-start pl-1.5 pt-0.5">
            {hotkey}
          </span>
          <span className="text-[10px] font-mono text-[#4a4a55] uppercase tracking-wider self-end pr-1.5 pb-0.5">
            Empty
          </span>
        </button>
      );
    }

    const cdRemaining = skillCooldowns[skill.id] || 0;
    const maxCd = skill.cooldown || 1;
    const isActive = (activeSkillEffects[skill.id] || 0) > 0;

    return (
      <AbilityButton
        id={`skill-${slotKey}`}
        label={skill.name}
        hotkey={skill.keyDisplay}
        disabled={disabled}
        cooldown={cdRemaining}
        maxCooldown={maxCd}
        active={isActive}
        onClick={() => onActivateSkill(skill.id)}
        accentColor={
          skill.tier?.name === "Legendary" ? "#f5c518"
          : skill.tier?.name === "Rare" ? "#8b5cf6"
          : "#f5a623"
        }
      />
    );
  };

  // ── Core skill slots (fixed: attack, dash, shield, shockwave) ─────────────
  const coreSkills = [
    {
      id: "attack",
      label: "ATK",
      hotkey: "SPC",
      cd: 0,
      maxCd: 1,
      accent: "#e74c3c",
      active: false,
      disabled: false,
    },
    {
      id: "dash",
      label: "DASH",
      hotkey: "Q",
      cd: skillCooldowns.dash || 0,
      maxCd: 4,
      accent: "#3b82f6",
      active: false,
      disabled: false,
    },
    {
      id: "shield",
      label: "SHLD",
      hotkey: "E",
      cd: skillCooldowns.shield || 0,
      maxCd: 8,
      accent: "#f5a623",
      active: false,
      disabled: false,
    },
    {
      id: "shockwave",
      label: "WAVE",
      hotkey: "R",
      cd: skillCooldowns.shockwave || 0,
      maxCd: 7,
      accent: "#10b981",
      active: false,
      disabled: false,
    },
  ];

  return (
    <>
      {/* ── Ability Dock ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 bg-[#16161a] border-t border-[#2e2e35] px-3 py-2">
        {/* Fixed combat skills */}
        <div className="flex items-center gap-1">
          {coreSkills.map((s) => (
            <AbilityButton
              key={s.id}
              id={`ability-${s.id}`}
              label={s.label}
              hotkey={s.hotkey}
              disabled={disabled || s.disabled}
              cooldown={s.cd}
              maxCooldown={s.maxCd}
              active={s.active}
              accentColor={s.accent}
              onClick={() => {
                /* no-op: hotkey in GameCanvas handles real dispatch */
              }}
            />
          ))}
        </div>

        {/* Separator */}
        <div className="w-px h-10 bg-[#2e2e35] mx-2" />

        {/* Gacha skill slots */}
        <div className="flex items-center gap-1">
          {renderSlot("primary", equippedSkills.primary, "1", "Slot 1")}
          {renderSlot("secondary", equippedSkills.secondary, "2", "Slot 2")}
        </div>

        {/* Separator */}
        <div className="w-px h-10 bg-[#2e2e35] mx-2" />

        {/* Gacha trigger */}
        <button
          id="btn-open-gacha"
          onClick={() => setIsGachaOpen(true)}
          disabled={disabled}
          className="flex flex-col items-center justify-center px-3 h-14 bg-[#1c1c21] border border-[#2e2e35] hover:border-[#f5a623] transition-colors disabled:opacity-30 cursor-pointer"
          style={{ clipPath: "polygon(6px 0%, 100% 0%, 100% 100%, 0% 100%, 0% 6px)" }}
        >
          <span className="text-[10px] font-mono font-bold text-[#f5a623] uppercase tracking-wider">
            GACHA
          </span>
          <span className="text-[9px] font-mono text-[#4a4a55]">
            {GACHA_COST} pts
          </span>
        </button>
      </div>

      {/* ── Gacha Modal ─────────────────────────────────────────────────── */}
      {isGachaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm bg-[#1c1c21] border border-[#2e2e35] relative">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#2e2e35]">
              <div>
                <h2 className="text-sm font-mono font-bold uppercase tracking-[0.15em] text-[#f5a623]">
                  Skill Gacha
                </h2>
                <p className="text-[10px] font-mono text-[#4a4a55] mt-0.5">
                  Cost: {GACHA_COST} pts — Balance:{" "}
                  <span
                    className="font-bold"
                    style={{ color: canAffordGacha ? "#f5a623" : "#e74c3c" }}
                  >
                    {playerScore}
                  </span>
                </p>
              </div>
              <button
                onClick={() => { if (!isRolling) setIsGachaOpen(false); }}
                disabled={isRolling}
                className="text-[#4a4a55] hover:text-[#e8e8ea] text-lg font-mono cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Reel display */}
            <div className="px-5 py-6 flex flex-col items-center min-h-[140px] justify-center border-b border-[#2e2e35] bg-[#16161a]">
              {rolledSkill ? (
                <div className="flex flex-col items-center gap-2 reel-in text-center">
                  <span className="text-3xl leading-none">{rolledSkill.icon}</span>
                  <div>
                    <strong className="block text-sm font-mono font-bold text-[#e8e8ea] tracking-wide">
                      {rolledSkill.name}
                    </strong>
                    <span
                      className="text-[9px] font-mono uppercase tracking-[0.15em] font-bold"
                      style={{
                        color:
                          rolledSkill.tier?.name === "Legendary" ? "#f5c518"
                          : rolledSkill.tier?.name === "Rare" ? "#8b5cf6"
                          : "#7a7a85",
                      }}
                    >
                      {rolledSkill.tier?.name}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-[#7a7a85] max-w-[200px] leading-snug">
                    {rolledSkill.description}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center text-[#4a4a55] font-mono gap-1">
                  <span className="text-2xl opacity-40">?</span>
                  <span className="text-[11px]">Press spin to reveal</span>
                  <span className="text-[9px] text-[#2e2e35]">Common 60% · Rare 35% · Legendary 10%</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-5 py-4 flex flex-col gap-2">
              {rolledSkill && !isRolling ? (
                <>
                  <p className="text-[10px] font-mono text-[#7a7a85] text-center mb-1">
                    Equip <strong className="text-[#e8e8ea]">{rolledSkill.name}</strong> to slot:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <GameButton
                      onClick={() => handleEquipRolled("primary")}
                      variant="ghost"
                      size="sm"
                      className="justify-center"
                    >
                      Slot 1 [1]
                    </GameButton>
                    <GameButton
                      onClick={() => handleEquipRolled("secondary")}
                      variant="ghost"
                      size="sm"
                      className="justify-center"
                    >
                      Slot 2 [2]
                    </GameButton>
                  </div>
                  <GameButton
                    onClick={handleStartRoll}
                    disabled={!canAffordGacha}
                    variant="dim"
                    size="sm"
                    className="justify-center w-full mt-1"
                  >
                    Roll Again ({GACHA_COST} pts)
                  </GameButton>
                </>
              ) : (
                <GameButton
                  onClick={handleStartRoll}
                  disabled={!canAffordGacha || isRolling}
                  variant="primary"
                  size="lg"
                  className="w-full justify-center"
                >
                  {isRolling ? "Rolling…" : `Spin (${GACHA_COST} pts)`}
                </GameButton>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
