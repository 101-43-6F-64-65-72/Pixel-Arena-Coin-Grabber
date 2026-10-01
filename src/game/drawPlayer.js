/**
 * Draws a player on the canvas using simple geometric shapes.
 * The character is a top-down view: a rounded body with two small eye dots
 * and an optional nickname label above the player.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x        - Center X of the player in canvas coordinates
 * @param {number} y        - Center Y of the player in canvas coordinates
 * @param {number} size     - Width/height of the player (used as diameter)
 * @param {Object|string} [options] - Color configuration object or string body color
 * @param {string} [options.bodyColor="#f97316"]   - Fill color for body
 * @param {string} [options.strokeColor="#c2410c"] - Stroke color for body outline
 * @param {string} [options.nickname=null]         - Optional nickname label above player
 */
export function drawPlayer(ctx, x, y, size, options = {}) {
  const opts = typeof options === "string" ? { bodyColor: options } : options;
  const bodyColor = opts.bodyColor || "#f97316";
  const strokeColor = opts.strokeColor || "#c2410c";
  const nickname = opts.nickname || null;

  const r = size / 2;

  // Shadow — subtle, so the player reads clearly against the arena floor
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.8, r * 0.85, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Body — colored filled circle
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Body outline
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();

  // Two eye dots
  const eyeOffset = r * 0.3;
  const eyeRadius = r * 0.15;
  const eyeY = y - r * 0.25;

  ctx.fillStyle = "#1c1917";
  // Left eye
  ctx.beginPath();
  ctx.arc(x - eyeOffset, eyeY, eyeRadius, 0, Math.PI * 2);
  ctx.fill();
  // Right eye
  ctx.beginPath();
  ctx.arc(x + eyeOffset, eyeY, eyeRadius, 0, Math.PI * 2);
  ctx.fill();

  // Nickname label above head
  if (nickname) {
    ctx.save();
    ctx.font = "bold 11px monospace, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    // Text shadow / backdrop for high legibility
    ctx.fillStyle = "#000000";
    ctx.globalAlpha = 0.6;
    const textWidth = ctx.measureText(nickname).width;
    ctx.fillRect(x - textWidth / 2 - 4, y - r - 18, textWidth + 8, 14);

    ctx.globalAlpha = 1.0;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(nickname, x, y - r - 5);
    ctx.restore();
  }
}

