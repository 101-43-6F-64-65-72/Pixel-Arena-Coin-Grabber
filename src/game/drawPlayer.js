/**
 * Draws a player on the canvas with dynamic sizing, directional eyes,
 * and optional leader crown & nickname badge.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x        - Center X in logical arena coordinates
 * @param {number} y        - Center Y in logical arena coordinates
 * @param {number} size     - Diameter of the player in logical pixels
 * @param {Object} [options]
 * @param {string} [options.bodyColor="#f97316"]   - Fill color
 * @param {string} [options.strokeColor="#c2410c"] - Outline color
 * @param {string} [options.nickname=null]         - Nickname label
 * @param {number} [options.score=0]               - Current score
 * @param {boolean} [options.isLeader=false]       - Whether this player has the highest score
 */
export function drawPlayer(ctx, x, y, size = 32, options = {}) {
  const opts = typeof options === "string" ? { bodyColor: options } : options;
  const bodyColor = opts.bodyColor || "#f97316";
  const strokeColor = opts.strokeColor || "#c2410c";
  const nickname = opts.nickname || null;
  const score = opts.score ?? 0;
  const isLeader = opts.isLeader ?? false;

  const r = Math.max(12, size / 2);

  // 1. Drop Shadow
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.85, r * 0.95, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Leader Glow Aura (if #1 leader and score > 0)
  if (isLeader && score > 0) {
    ctx.save();
    ctx.strokeStyle = "#facc15"; // gold glow
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 3. Body
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // 4. Body Outline
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = Math.max(2, r * 0.08);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();

  // 5. Two Eye Dots (scale proportionally)
  const eyeOffset = r * 0.32;
  const eyeRadius = Math.max(2, r * 0.16);
  const eyeY = y - r * 0.22;

  ctx.fillStyle = "#18181b";
  // Left eye
  ctx.beginPath();
  ctx.arc(x - eyeOffset, eyeY, eyeRadius, 0, Math.PI * 2);
  ctx.fill();
  // Right eye
  ctx.beginPath();
  ctx.arc(x + eyeOffset, eyeY, eyeRadius, 0, Math.PI * 2);
  ctx.fill();

  // 6. Leader Crown (drawn right above top of avatar)
  if (isLeader && score > 0) {
    ctx.save();
    ctx.fillStyle = "#facc15";
    ctx.strokeStyle = "#ca8a04";
    ctx.lineWidth = 1.5;
    const crownW = r * 0.8;
    const crownH = r * 0.45;
    const crownY = y - r - crownH - 2;

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

  // 7. Nickname & Score Label
  if (nickname) {
    ctx.save();
    const fontSize = Math.max(10, Math.min(14, Math.round(r * 0.55)));
    ctx.font = `bold ${fontSize}px monospace, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    const label = `${nickname} (${score})`;
    const textWidth = ctx.measureText(label).width;
    const labelH = fontSize + 4;
    const labelY = isLeader && score > 0 ? y - r - r * 0.5 - 10 : y - r - 6;

    // Dark backdrop for high readability
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(x - textWidth / 2 - 4, labelY - labelH, textWidth + 8, labelH);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, x, labelY - 2);
    ctx.restore();
  }
}


