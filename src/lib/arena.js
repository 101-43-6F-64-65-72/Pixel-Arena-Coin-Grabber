/**
 * Arena, World, and Deterministic Player Color Palette Definitions
 */

export const WORLD_WIDTH = 2000;
export const WORLD_HEIGHT = 1200;
export const ARENA_PADDING = 24;

export const VIEWPORT_WIDTH = 960;
export const VIEWPORT_HEIGHT = 600;

export const BASE_PLAYER_SIZE = 36;
export const PLAYER_SPEED = 210; // pixels per second
export const COIN_RADIUS = 9;

/**
 * Authoritative Player Color Palette
 * Every client renders the exact same colors according to `players.color_key`
 */
export const PLAYER_PALETTES = {
  orange: {
    name: "Crimson Blaze",
    key: "orange",
    body: "#f97316",
    stroke: "#c2410c",
    glow: "rgba(249, 115, 22, 0.4)",
    badgeBg: "bg-orange-950/80",
    badgeBorder: "border-orange-600",
    text: "text-orange-400",
    dot: "bg-orange-500",
  },
  purple: {
    name: "Void Shadow",
    key: "purple",
    body: "#a855f7",
    stroke: "#7e22ce",
    glow: "rgba(168, 85, 247, 0.4)",
    badgeBg: "bg-purple-950/80",
    badgeBorder: "border-purple-600",
    text: "text-purple-400",
    dot: "bg-purple-500",
  },
  blue: {
    name: "Azure Frost",
    key: "blue",
    body: "#3b82f6",
    stroke: "#1d4ed8",
    glow: "rgba(59, 130, 246, 0.4)",
    badgeBg: "bg-blue-950/80",
    badgeBorder: "border-blue-600",
    text: "text-blue-400",
    dot: "bg-blue-500",
  },
  green: {
    name: "Emerald Viper",
    key: "green",
    body: "#10b981",
    stroke: "#047857",
    glow: "rgba(16, 185, 129, 0.4)",
    badgeBg: "bg-emerald-950/80",
    badgeBorder: "border-emerald-600",
    text: "text-emerald-400",
    dot: "bg-emerald-500",
  },
};

export function getPlayerPalette(colorKey) {
  return PLAYER_PALETTES[colorKey] || PLAYER_PALETTES.orange;
}
