"use client";

/**
 * GameUIComponents — Redesigned (UI Redesign Pass)
 *
 * Design principles:
 *   - No rounded-3xl cards
 *   - No gradient buttons
 *   - No decorative corner dots
 *   - No emoji icons as decoration
 *   - Shape language: flat panels, 2px borders, clipped corners on key elements
 *   - Single amber accent color
 */

// ── Arena Button ─────────────────────────────────────────────────────────────
export function GameButton({
  children,
  onClick,
  disabled = false,
  variant = "primary", // "primary" | "ghost" | "danger" | "dim"
  size = "md",         // "sm" | "md" | "lg"
  className = "",
  id,
  type = "button",
}) {
  const sizeClasses = {
    sm: "px-4 py-1.5 text-xs",
    md: "px-5 py-2.5 text-sm",
    lg: "px-6 py-3 text-sm",
  }[size];

  const variantClasses = {
    primary:
      "bg-[#f5a623] text-[#0d0d0f] border border-[#f5a623] hover:bg-[#e09616] active:bg-[#c07f10] font-bold",
    ghost:
      "bg-transparent text-[#a0a0a8] border border-[#2e2e35] hover:border-[#46464f] hover:text-[#e8e8ea] active:bg-[#1c1c21]",
    danger:
      "bg-[#c0392b] text-white border border-[#922b21] hover:bg-[#a93226] active:bg-[#922b21] font-bold",
    dim:
      "bg-[#1c1c21] text-[#7a7a85] border border-[#2e2e35] hover:text-[#e8e8ea] hover:border-[#46464f] active:bg-[#16161a]",
  }[variant];

  return (
    <button
      id={id}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`
        inline-flex items-center justify-center gap-2
        font-mono uppercase tracking-wider
        transition-colors duration-100
        disabled:opacity-30 disabled:cursor-not-allowed
        cursor-pointer select-none
        ${sizeClasses} ${variantClasses} ${className}
      `}
    >
      {children}
    </button>
  );
}

// ── Arena Panel — flat, no glass, no glows ────────────────────────────────
export function GamePanel({ children, className = "", title = null }) {
  return (
    <div
      className={`bg-[#1c1c21] border border-[#2e2e35] p-5 ${className}`}
    >
      {title && (
        <div className="pb-3 mb-4 border-b border-[#2e2e35]">
          <h2 className="text-[#f5a623] text-xs font-mono font-bold uppercase tracking-[0.15em]">
            {title}
          </h2>
        </div>
      )}
      {children}
    </div>
  );
}

// ── Ability Button — game HUD style ──────────────────────────────────────
// Used in the skill bar dock
export function AbilityButton({
  label,
  hotkey,
  disabled = false,
  cooldown = 0,        // remaining seconds
  maxCooldown = 1,     // total CD for progress bar
  active = false,      // skill is currently active
  onClick,
  id,
  accentColor = "#f5a623", // CSS color string
}) {
  const cdPercent = maxCooldown > 0 ? Math.max(0, Math.min(1, cooldown / maxCooldown)) : 0;
  const isOnCd = cooldown > 0;

  return (
    <button
      id={id}
      onClick={onClick}
      disabled={disabled || isOnCd}
      title={`${label} [${hotkey}]`}
      className={`
        relative flex flex-col items-center justify-between
        w-14 h-14 p-1.5
        border font-mono select-none cursor-pointer
        transition-colors duration-100
        disabled:cursor-not-allowed
        ${active
          ? "border-[#2ecc71] bg-[#0a2a16]"
          : isOnCd
          ? "border-[#2e2e35] bg-[#16161a] opacity-60"
          : "border-[#2e2e35] bg-[#1c1c21] hover:border-[#46464f] active:bg-[#16161a]"
        }
      `}
      style={{
        // Clipped top-left corner for HUD feel
        clipPath: "polygon(6px 0%, 100% 0%, 100% 100%, 0% 100%, 0% 6px)",
      }}
    >
      {/* Cooldown sweep overlay */}
      {isOnCd && (
        <div
          className="absolute inset-0 bg-black/70 flex items-end justify-center pb-1 cd-active"
          style={{ zIndex: 10 }}
        >
          <span className="text-[10px] font-bold text-[#f5a623] tabular-nums">
            {cooldown.toFixed(1)}
          </span>
        </div>
      )}

      {/* CD progress bar along bottom edge */}
      {isOnCd && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#2e2e35]">
          <div
            className="h-full transition-all duration-100"
            style={{
              width: `${(1 - cdPercent) * 100}%`,
              background: accentColor,
            }}
          />
        </div>
      )}

      {/* Active indicator strip */}
      {active && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#2ecc71]" />
      )}

      {/* Hotkey */}
      <span
        className="text-[8px] font-bold self-start leading-none"
        style={{ color: isOnCd ? "#4a4a55" : "#7a7a85" }}
      >
        {hotkey}
      </span>

      {/* Label */}
      <span
        className="text-[9px] font-bold uppercase tracking-tight leading-none self-end text-center w-full truncate"
        style={{ color: isOnCd ? "#4a4a55" : active ? "#2ecc71" : "#e8e8ea" }}
      >
        {label}
      </span>
    </button>
  );
}

// ── Compact HP Bar ────────────────────────────────────────────────────────
export function HpBar({ current, max = 100, className = "" }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const color =
    pct > 50 ? "var(--c-hp-hi)"
    : pct > 25 ? "var(--c-hp-mid)"
    : "var(--c-hp-low)";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="w-28 h-2 bg-[#16161a] border border-[#2e2e35] relative overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 transition-all duration-200"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[11px] font-mono tabular-nums" style={{ color }}>
        {current}
      </span>
    </div>
  );
}

// ── Stat Cell — number-primary display ───────────────────────────────────
export function StatCell({ label, value, accent = false, className = "" }) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <span
        className="text-base font-bold tabular-nums leading-none"
        style={{ color: accent ? "#f5a623" : "#e8e8ea" }}
      >
        {value}
      </span>
      <span className="text-[9px] uppercase tracking-wider text-[#4a4a55] mt-0.5">
        {label}
      </span>
    </div>
  );
}
