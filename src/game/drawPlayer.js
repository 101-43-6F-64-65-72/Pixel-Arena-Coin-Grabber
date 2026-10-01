import { getPlayerPalette } from "@/lib/arena";
import { getGameImage, CHARACTER_SPRITE_FRAMES } from "@/game/spriteManager";

/**
 * Draws player character with animated sci-fi runner sprite (uiset4.png),
 * directional flipping, authoritative color glow, HP bar, and crown.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x          - Center X in screen coordinates
 * @param {number} y          - Center Y in screen coordinates
 * @param {number} size       - Base player size
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
  const isMoving = options.isMoving ?? false;
  const facingLeft = options.facingLeft ?? false;
  const animFrame = options.animFrame ?? 0;

  const r = Math.max(16, size / 2);

  // ── DEFEATED / GHOST STATE ──────────────────────────────────────────────────
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
    ctx.beginPath();
    ctx.moveTo(x - 7, y - 5); ctx.lineTo(x - 3, y - 1);
    ctx.moveTo(x - 3, y - 5); ctx.lineTo(x - 7, y - 1);
    ctx.moveTo(x + 3, y - 5); ctx.lineTo(x + 7, y - 1);
    ctx.moveTo(x + 7, y - 5); ctx.lineTo(x + 3, y - 1);
    ctx.stroke();

    // Respawn Countdown Text
    ctx.fillStyle = "#f87171";
    ctx.font = "bold 12px monospace, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`💀 RESPAWNING IN ${Math.max(1, Math.ceil(respawnSecs))}s`, x, y + r + 18);

    ctx.restore();
    return;
  }

  // ── ALIVE CHARACTER RENDERING ───────────────────────────────────────────────

  // 1. Drop Shadow
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.ellipse(x, y + r * 1.05, r * 1.05, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Shield Active Barrier
  if (isShielded) {
    ctx.save();
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 3.5;
    ctx.shadowColor = "#f59e0b";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "rgba(245, 158, 11, 0.2)";

    ctx.beginPath();
    ctx.arc(x, y, r + 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 3. Authoritative Color Glow Aura
  ctx.save();
  ctx.strokeStyle = palette.body;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = palette.body;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(x, y, r + 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 4. Leader Glow Aura (if #1 leader and score > 0)
  if (isLeader && score > 0) {
    ctx.save();
    ctx.strokeStyle = "#facc15"; // Gold glow
    ctx.lineWidth = 3.5;
    ctx.shadowColor = "#eab308";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(x, y, r + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 5. Draw Sci-Fi Character Sprite (uiset4.png)
  const spriteImg = getGameImage("/uiset4.png");
  if (spriteImg && spriteImg.complete && spriteImg.naturalWidth > 0) {
    ctx.save();
    ctx.translate(x, y);

    // Flip if facing left
    if (facingLeft) {
      ctx.scale(-1, 1);
    }

    const frameIdx = isMoving ? animFrame % CHARACTER_SPRITE_FRAMES.length : 0;
    const frame = CHARACTER_SPRITE_FRAMES[frameIdx];

    const targetH = r * 2.5;
    const targetW = targetH * (frame.sw / frame.sh);

    ctx.drawImage(
      spriteImg,
      frame.sx, frame.sy, frame.sw, frame.sh,
      -targetW / 2, -targetH / 2 - 2, targetW, targetH
    );

    ctx.restore();
  } else {
    // High-definition fallback while image loads
    ctx.save();
    ctx.fillStyle = palette.body;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = palette.stroke;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  // 6. Leader Crown
  if (isLeader && score > 0) {
    ctx.save();
    ctx.fillStyle = "#facc15";
    ctx.strokeStyle = "#ca8a04";
    ctx.lineWidth = 1.5;
    const crownW = r * 0.9;
    const crownH = r * 0.5;
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

  // 7. Authoritative HP Bar (Glossy Wood/Game Style)
  const barW = Math.max(44, r * 1.8);
  const barH = 6;
  const barX = x - barW / 2;
  const barY = y - r - 12;
  const hpPercent = Math.max(0, Math.min(1, hp / maxHp));

  ctx.save();
  // Bar background & border
  ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
  ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 1;
  ctx.strokeRect(barX - 1, barY - 1, barW + 2, barH + 2);

  // Health fill
  if (hpPercent > 0.5) {
    ctx.fillStyle = "#22c55e"; // Green
  } else if (hpPercent > 0.25) {
    ctx.fillStyle = "#eab308"; // Yellow
  } else {
    ctx.fillStyle = "#ef4444"; // Red
  }
  ctx.fillRect(barX, barY, barW * hpPercent, barH);
  ctx.restore();

  // 8. Nickname & Score Label
  if (nickname) {
    ctx.save();
    const fontSize = 11;
    ctx.font = `bold ${fontSize}px monospace, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    const label = `${nickname} (${score} pts)`;
    const textWidth = ctx.measureText(label).width;
    const labelH = fontSize + 4;
    const labelY = barY - 4;

    ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    ctx.fillRect(x - textWidth / 2 - 4, labelY - labelH, textWidth + 8, labelH);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, x, labelY - 2);
    ctx.restore();
  }
}
