/**
 * Draws a coin on the canvas.
 * Golden circular collectible with a shiny rim and inner sparkle.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x       - Center X coordinate in logical canvas space
 * @param {number} y       - Center Y coordinate in logical canvas space
 * @param {number} [radius=8] - Radius of the coin in logical pixels
 */
export function drawCoin(ctx, x, y, radius = 8) {
  ctx.save();

  // Subtle shadow
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.ellipse(x, y + radius * 0.9, radius * 0.9, radius * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1.0;

  // Outer gold rim
  ctx.fillStyle = "#eab308"; // Tailwind yellow-500
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#a16207"; // Tailwind yellow-700
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Inner bright gold face
  ctx.fillStyle = "#facc15"; // Tailwind yellow-400
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.7, 0, Math.PI * 2);
  ctx.fill();

  // Inner star / sparkle dot
  ctx.fillStyle = "#fef08a"; // Tailwind yellow-200
  ctx.beginPath();
  ctx.arc(x - radius * 0.25, y - radius * 0.25, radius * 0.25, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
