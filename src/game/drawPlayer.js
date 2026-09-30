/**
 * Draws the local player on the canvas using simple geometric shapes.
 * The character is a top-down view: a rounded body with two small eye dots
 * indicating which direction the player is facing.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x   - Center X of the player in canvas coordinates
 * @param {number} y   - Center Y of the player in canvas coordinates
 * @param {number} size - Width/height of the player (used as diameter)
 */
export function drawPlayer(ctx, x, y, size) {
  const r = size / 2;

  // Shadow — subtle, so the player reads clearly against the arena floor
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.8, r * 0.85, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Body — bright orange, visually distinct from the dark arena
  ctx.fillStyle = "#f97316";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Body outline
  ctx.strokeStyle = "#c2410c";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();

  // Two eye dots — always face upward for this phase (direction rendering
  // will be extended in a later phase when needed for multiplayer).
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
}
