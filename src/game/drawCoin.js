/**
 * Draws collectibles on the canvas: Coin Variants (Type 1, Type 2, Type 3) & Heal Item.
 * High-Definition Lightweight Vector Rendering.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x          - Center X coordinate in logical canvas space
 * @param {number} y          - Center Y coordinate in logical canvas space
 * @param {number} [radius=9] - Base radius
 * @param {number} [timestamp=0] - Frame timestamp for subtle animations
 * @param {string} [coinType="coin_1"] - 'coin_1', 'coin_2', 'coin_3', or 'heal'
 */
export function drawCoin(ctx, x, y, radius = 9, timestamp = 0, coinType = "coin_1") {
  ctx.save();

  // 1. HEAL ITEM (+25 HP Energy Cross Orb)
  if (coinType === "heal") {
    const pulse = Math.sin(timestamp * 0.006 + x) * 2;
    const floatY = y + Math.sin(timestamp * 0.005 + y) * 2.5;
    const r = 12 + pulse * 0.5;

    // Ground Drop Shadow
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.ellipse(x, y + r * 1.1, r * 1.0, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1.0;

    // Radiant Green Pulsing Aura Ring
    ctx.strokeStyle = "rgba(34, 197, 94, 0.7)";
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "#10b981";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(x, floatY, r + 4 + pulse, 0, Math.PI * 2);
    ctx.stroke();

    // Orb Body - Emerald Energy Sphere
    const orbGrad = ctx.createRadialGradient(x - r * 0.3, floatY - r * 0.3, 2, x, floatY, r);
    orbGrad.addColorStop(0, "#86efac");
    orbGrad.addColorStop(0.5, "#22c55e");
    orbGrad.addColorStop(1, "#15803d");

    ctx.fillStyle = orbGrad;
    ctx.beginPath();
    ctx.arc(x, floatY, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // White Medical Cross Emblem in Center
    ctx.fillStyle = "#ffffff";
    const crossW = 4;
    const crossH = 12;
    ctx.fillRect(x - crossW / 2, floatY - crossH / 2, crossW, crossH);
    ctx.fillRect(x - crossH / 2, floatY - crossW / 2, crossH, crossW);

    ctx.restore();
    return;
  }

  // 2. COIN TYPE 3 (+3 Points — Rare Diamond-Gold Coin)
  if (coinType === "coin_3") {
    const pulse = Math.sin(timestamp * 0.006 + x) * 1.5;
    const floatY = y + Math.sin(timestamp * 0.004 + y) * 2;
    const r = 11 + pulse * 0.4;

    // Drop Shadow
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.ellipse(x, y + r * 1.1, r * 1.0, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1.0;

    // Purple/Amber Legendary Glow
    ctx.shadowColor = "#a855f7";
    ctx.shadowBlur = 12;

    // Diamond Outer Ring
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, floatY, r + 2, 0, Math.PI * 2);
    ctx.stroke();

    // Gold Face
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(x, floatY, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fef08a";
    ctx.beginPath();
    ctx.arc(x, floatY, r * 0.7, 0, Math.PI * 2);
    ctx.fill();

    // Number "+3" Text Badge
    ctx.fillStyle = "#78350f";
    ctx.font = "bold 10px monospace, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("+3", x, floatY + 0.5);

    ctx.restore();
    return;
  }

  // 3. COIN TYPE 2 (+2 Points — Uncommon Emerald-Gold Coin)
  if (coinType === "coin_2") {
    const pulse = Math.sin(timestamp * 0.005 + x) * 1.0;
    const floatY = y + Math.sin(timestamp * 0.004 + y) * 1.8;
    const r = 9.5 + pulse * 0.3;

    // Drop Shadow
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.ellipse(x, y + r * 1.05, r * 0.95, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1.0;

    // Emerald Glow
    ctx.shadowColor = "#10b981";
    ctx.shadowBlur = 8;

    ctx.fillStyle = "#10b981";
    ctx.beginPath();
    ctx.arc(x, floatY, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(x, floatY, r * 0.72, 0, Math.PI * 2);
    ctx.fill();

    // Number "+2" Text Badge
    ctx.fillStyle = "#065f46";
    ctx.font = "bold 9px monospace, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("+2", x, floatY + 0.5);

    ctx.restore();
    return;
  }

  // 4. COIN TYPE 1 (+1 Point — Common Bronze-Gold Coin)
  const pulse = Math.sin(timestamp * 0.004 + x) * 0.8;
  const floatY = y + Math.sin(timestamp * 0.004 + y) * 1.5;
  const r = 8 + pulse * 0.3;

  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.ellipse(x, y + r * 1.05, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1.0;
  ctx.shadowColor = "#eab308";
  ctx.shadowBlur = 6;

  ctx.fillStyle = "#eab308";
  ctx.beginPath();
  ctx.arc(x, floatY, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fef08a";
  ctx.beginPath();
  ctx.arc(x, floatY, r * 0.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#854d0e";
  ctx.font = "bold 9px monospace, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("+1", x, floatY + 0.5);

  ctx.restore();
}
