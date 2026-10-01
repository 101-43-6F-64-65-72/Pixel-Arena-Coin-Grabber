import { getPlayerPalette } from "@/lib/arena";

/**
 * Draws a player on the canvas with deterministic color palette,
 * authoritative HP bar, shield aura, directional eyes, and defeated states.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x        - Center X in world coordinates
 * @param {number} y        - Center Y in world coordinates
 * @param {number} size     - Diameter of player
 * @param {Object} [options]
 */
export function drawPlayer(ctx, x, y, size = 36, options = {}) {
  const colorKey = options.colorKey || "orange";
  const palette = getPlayerPalette(colorKey);

  const nickname = options.nickname || "Player";
  const score = options.score ?? 0;
  const hp = options.hp ?? 100;
  const maxHp = options.maxHp ?? 100;
  const alive = options.alive ?? true;
  const isLeader = options.isLeader ?? false;
  const isShielded = options.isShielded ?? false;
  const respawnSecs = options.respawnSecs ?? 0;

  const r = Math.max(14, size / 2);

  // ── DEFEATED / DEAD GHOST STATE ─────────────────────────────────────────────
  if (!alive) {
    ctx.save();
    ctx.globalAlpha = 0.55;

    // Ghost Body
    ctx.fillStyle = "#64748b";
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Tombstone X Eyes
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    // Left X
    ctx.beginPath();
    ctx.moveTo(x - 7, y - 5); ctx.lineTo(x - 3, y - 1);
    ctx.moveTo(x - 3, y - 5); ctx.lineTo(x - 7, y - 1);
    // Right X
    ctx.moveTo(x + 3, y - 5); ctx.lineTo(x + 7, y - 1);
    ctx.moveTo(x + 7, y - 5); ctx.lineTo(x + 3, y - 1);
    ctx.stroke();

    // Respawn Countdown Text
    ctx.fillStyle = "#f87171";
    ctx.font = "bold 12px monospace, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`💀 RESPAWNING IN ${Math.max(1, Math.ceil(respawnSecs))}s`, x, y + r + 16);

    ctx.restore();
    return;
  }

  // ── ALIVE PLAYER RENDERING ──────────────────────────────────────────────────

  // 1. Drop Shadow
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.85, r * 0.95, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Shield Active Barrier
  if (isShielded) {
    ctx.save();
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#f59e0b";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "rgba(245, 158, 11, 0.18)";

    ctx.beginPath();
    ctx.arc(x, y, r + 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 3. Leader Glow Aura (if #1 leader and score > 0)
  if (isLeader && score > 0) {
    ctx.save();
    ctx.strokeStyle = "#facc15"; // Gold glow
    ctx.lineWidth = 3.5;
    ctx.shadowColor = "#eab308";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(x, y, r + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 4. Body (Authoritative Color)
  ctx.fillStyle = palette.body;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // 5. Body Outline
  ctx.strokeStyle = palette.stroke;
  ctx.lineWidth = Math.max(2.5, r * 0.09);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();

  // 6. Two Directional Eyes
  const eyeOffset = r * 0.32;
  const eyeRadius = Math.max(2.2, r * 0.16);
  const eyeY = y - r * 0.22;

  ctx.fillStyle = "#09090b";
  // Left eye
  ctx.beginPath();
  ctx.arc(x - eyeOffset, eyeY, eyeRadius, 0, Math.PI * 2);
  ctx.fill();
  // Right eye
  ctx.beginPath();
  ctx.arc(x + eyeOffset, eyeY, eyeRadius, 0, Math.PI * 2);
  ctx.fill();

  // 7. Leader Crown
  if (isLeader && score > 0) {
    ctx.save();
    ctx.fillStyle = "#facc15";
    ctx.strokeStyle = "#ca8a04";
    ctx.lineWidth = 1.5;
    const crownW = r * 0.8;
    const crownH = r * 0.45;
    const crownY = y - r - crownH - 12;

    ctx.beginPath();
    ctx.moveTo(x - crownW / 2, crownY + crownH);
    ctx.lineTo(x - crownW / 2, crownY);
    ctx.lineTo(x - crownW * 0.2, crownY + crownH * 0.4);
    ctx.lineTo(x, crownY - 2);
    ctx.lineTo(x + crownW * 0.2, crownY + crownH * 0.4);
    ctx.lineTo(x + crownW / 2, crownY);
    ctx.lineTo(x + crownW / 2, crownY + crownH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 8. Authoritative HP Bar
  const barW = Math.max(40, r * 1.6);
  const barH = 5;
  const barX = x - barW / 2;
  const barY = y - r - 8;
  const hpPercent = Math.max(0, Math.min(1, hp / maxHp));

  ctx.save();
  // Bar background
  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

  // Health fill gradient
  if (hpPercent > 0.5) {
    ctx.fillStyle = "#22c55e"; // Green
  } else if (hpPercent > 0.25) {
    ctx.fillStyle = "#eab308"; // Yellow
  } else {
    ctx.fillStyle = "#ef4444"; // Red
  }
  ctx.fillRect(barX, barY, barW * hpPercent, barH);
  ctx.restore();

  // 9. Nickname & Score Label
  if (nickname) {
    ctx.save();
    const fontSize = 11;
    ctx.font = `bold ${fontSize}px monospace, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    const label = `${nickname} (${score} pts)`;
    const textWidth = ctx.measureText(label).width;
    const labelH = fontSize + 4;
    const labelY = barY - 3;

    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(x - textWidth / 2 - 4, labelY - labelH, textWidth + 8, labelH);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, x, labelY - 2);
    ctx.restore();
  }
}
