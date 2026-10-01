/**
 * Skills & Gacha System Configuration for Pixel Arena
 */

export const SKILL_TIERS = {
  COMMON: { name: "Common", color: "#38bdf8", border: "border-sky-400", bg: "bg-sky-950/70" },
  RARE: { name: "Rare", color: "#a855f7", border: "border-purple-400", bg: "bg-purple-950/70" },
  LEGENDARY: { name: "Legendary", color: "#f59e0b", border: "border-amber-400", bg: "bg-amber-950/70" },
};

export const SKILL_CATALOG = {
  hyper_dash: {
    id: "hyper_dash",
    name: "Hyper Dash",
    icon: "⚡",
    tier: SKILL_TIERS.COMMON,
    description: "+150% explosive speed boost with blazing energy trail.",
    cooldown: 7, // seconds
    duration: 2.2, // seconds
    speedMultiplier: 2.5,
    key: "Space",
    keyDisplay: "SPACE",
    themeColor: "#38bdf8",
    glowColor: "rgba(56, 189, 248, 0.6)",
  },
  frost_emp: {
    id: "frost_emp",
    name: "Frost Nova",
    icon: "❄️",
    tier: SKILL_TIERS.RARE,
    description: "Emits a freezing shockwave (220px) that stuns opponents for 1.8s.",
    cooldown: 11,
    duration: 0.8, // animation duration
    stunDuration: 1.8, // target stun duration
    radius: 220,
    key: "KeyQ",
    keyDisplay: "Q",
    themeColor: "#67e8f9",
    glowColor: "rgba(103, 232, 249, 0.7)",
  },
  coin_magnet: {
    id: "coin_magnet",
    name: "Coin Vortex",
    icon: "🧲",
    tier: SKILL_TIERS.RARE,
    description: "Pulls all arena coins within 260px directly to your character for 4s.",
    cooldown: 9,
    duration: 4.0,
    radius: 260,
    pullSpeed: 380,
    key: "KeyE",
    keyDisplay: "E",
    themeColor: "#eab308",
    glowColor: "rgba(234, 179, 8, 0.7)",
  },
  aegis_shield: {
    id: "aegis_shield",
    name: "Aegis Shield",
    icon: "🛡️",
    tier: SKILL_TIERS.LEGENDARY,
    description: "Golden invulnerability barrier for 3.5s. Immune to predators and stuns.",
    cooldown: 14,
    duration: 3.5,
    key: "KeyF",
    keyDisplay: "F",
    themeColor: "#f59e0b",
    glowColor: "rgba(245, 158, 11, 0.8)",
  },
  smoke_screen: {
    id: "smoke_screen",
    name: "Smoke Bomb",
    icon: "💨",
    tier: SKILL_TIERS.COMMON,
    description: "Drops a blinding smoke cloud (260px) slowing opponents by 60% for 4s.",
    cooldown: 10,
    duration: 4.0,
    radius: 260,
    slowMultiplier: 0.4,
    key: "KeyR",
    keyDisplay: "R",
    themeColor: "#94a3b8",
    glowColor: "rgba(148, 163, 184, 0.6)",
  },
};

export const GACHA_COST = 2; // Coins/score required to spin gacha

/**
 * Random Gacha Skill Roll with weighted probabilities
 */
export function rollGachaSkill(excludeSkillId = null) {
  const pool = [
    { id: "hyper_dash", weight: 35 },
    { id: "smoke_screen", weight: 25 },
    { id: "frost_emp", weight: 20 },
    { id: "coin_magnet", weight: 15 },
    { id: "aegis_shield", weight: 10 },
  ];

  // Filter out current skill if possible to ensure new roll
  const validPool = pool.filter((item) => item.id !== excludeSkillId);
  const selectedList = validPool.length > 0 ? validPool : pool;

  const totalWeight = selectedList.reduce((acc, item) => acc + item.weight, 0);
  let randomVal = Math.random() * totalWeight;

  for (const item of selectedList) {
    if (randomVal <= item.weight) {
      return SKILL_CATALOG[item.id];
    }
    randomVal -= item.weight;
  }

  return SKILL_CATALOG.hyper_dash;
}

/**
 * Generate initial Mystery Skill Orbs scattered across the 1200x750 arena
 */
export function generateMysteryOrbs(count = 5) {
  const orbs = [];
  for (let i = 0; i < count; i++) {
    orbs.push({
      id: `orb-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
      x: Math.round(60 + Math.random() * 1080),
      y: Math.round(60 + Math.random() * 630),
      active: true,
      respawnAt: 0,
      pulseOffset: Math.random() * Math.PI * 2,
    });
  }
  return orbs;
}
