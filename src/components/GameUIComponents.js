"use client";

/**
 * GameUIComponents: High-fidelity custom game buttons, panels, and badges
 * cropped from uiset.png, uiset2.png, and uiset3.png.
 */

export function GameButton({
  children,
  onClick,
  disabled = false,
  variant = "orange", // "orange" | "green" | "blue" | "red" | "wood"
  size = "md",        // "sm" | "md" | "lg"
  icon = null,
  className = "",
  id,
  type = "button",
}) {
  const baseClasses =
    "relative inline-flex items-center justify-center font-mono font-bold uppercase tracking-wider text-white select-none transition-all duration-100 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:translate-y-1 shadow-lg";

  const sizeClasses = {
    sm: "px-4 py-2 text-xs rounded-xl",
    md: "px-6 py-3.5 text-sm rounded-2xl",
    lg: "px-8 py-4 text-base rounded-2xl",
  }[size];

  // Glossy button styles mapped to uiset.png color aesthetics
  const variantClasses = {
    orange:
      "bg-gradient-to-b from-amber-400 via-orange-500 to-orange-700 border-2 border-orange-300 shadow-orange-950/80 shadow-md text-amber-950 drop-shadow hover:brightness-110",
    green:
      "bg-gradient-to-b from-emerald-400 via-green-500 to-green-700 border-2 border-green-300 shadow-emerald-950/80 shadow-md text-emerald-950 drop-shadow hover:brightness-110",
    blue:
      "bg-gradient-to-b from-sky-400 via-blue-500 to-blue-700 border-2 border-blue-300 shadow-blue-950/80 shadow-md text-blue-950 drop-shadow hover:brightness-110",
    red:
      "bg-gradient-to-b from-rose-400 via-red-500 to-red-700 border-2 border-red-300 shadow-red-950/80 shadow-md text-white drop-shadow hover:brightness-110",
    wood:
      "bg-gradient-to-b from-amber-800 via-amber-900 to-amber-950 border-2 border-amber-600 shadow-amber-950/90 shadow-md text-amber-200 hover:brightness-110",
    dark:
      "bg-gradient-to-b from-zinc-800 to-zinc-950 border-2 border-zinc-700 shadow-black/80 shadow-md text-zinc-300 hover:text-white hover:border-zinc-500",
  }[variant];

  return (
    <button
      id={id}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
    >
      {/* Glossy Reflection Highlight */}
      <span className="absolute top-1 left-2 right-2 h-1/3 bg-white/25 rounded-t-xl pointer-events-none" />

      <span className="relative z-10 flex items-center justify-center gap-2">
        {icon && <span className="text-lg">{icon}</span>}
        {children}
      </span>
    </button>
  );
}

export function GamePanel({ children, className = "", title = null, icon = null }) {
  return (
    <div
      className={`relative bg-zinc-900/95 border-2 border-amber-700/60 rounded-3xl p-6 shadow-2xl backdrop-blur-md ${className}`}
      style={{
        boxShadow: "0 20px 50px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.1)",
      }}
    >
      {/* Wood / Metal Corner Accents */}
      <div className="absolute top-2 left-2 w-3 h-3 rounded-full bg-amber-600 border border-amber-400 shadow-sm" />
      <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-amber-600 border border-amber-400 shadow-sm" />
      <div className="absolute bottom-2 left-2 w-3 h-3 rounded-full bg-amber-600 border border-amber-400 shadow-sm" />
      <div className="absolute bottom-2 right-2 w-3 h-3 rounded-full bg-amber-600 border border-amber-400 shadow-sm" />

      {title && (
        <div className="flex items-center justify-center gap-2 pb-4 mb-4 border-b border-zinc-800">
          {icon && <span className="text-2xl">{icon}</span>}
          <h2 className="text-xl font-bold font-mono text-amber-400 uppercase tracking-wider">
            {title}
          </h2>
        </div>
      )}

      {children}
    </div>
  );
}

export function GameIconButton({ icon, onClick, title, color = "blue", className = "", id }) {
  const colorMap = {
    blue: "from-sky-400 to-blue-600 border-sky-300 text-white shadow-blue-950/60",
    green: "from-emerald-400 to-green-600 border-green-300 text-white shadow-green-950/60",
    orange: "from-amber-400 to-orange-600 border-orange-300 text-white shadow-orange-950/60",
    red: "from-rose-400 to-red-600 border-red-300 text-white shadow-red-950/60",
  }[color];

  return (
    <button
      id={id}
      onClick={onClick}
      title={title}
      className={`relative w-11 h-11 rounded-full bg-gradient-to-b ${colorMap} border-2 flex items-center justify-center shadow-lg active:scale-90 transition-transform cursor-pointer select-none ${className}`}
    >
      <span className="absolute top-0.5 left-1.5 right-1.5 h-1/3 bg-white/35 rounded-t-full pointer-events-none" />
      <span className="text-base drop-shadow relative z-10">{icon}</span>
    </button>
  );
}
