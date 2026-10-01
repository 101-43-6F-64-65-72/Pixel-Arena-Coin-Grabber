/**
 * Canvas Rendering for Active Skill Effects, Shockwaves, Auras, and Mystery Skill Orbs
 */

/**
 * Draw a glowing Mystery Skill Orb / Crate on the arena floor
 */
export function drawMysteryOrb(ctx, orb, timestamp) {
  if (!orb.active) return;

  const { x, y, pulseOffset = 0 } = orb;
  const pulse = Math.sin(timestamp * 0.005 + pulseOffset);
  const size = 18 + pulse * 2.5;

  ctx.save();
  ctx.translate(x, y);

  // Outer rotating neon halo
  ctx.rotate((timestamp * 0.002) % (Math.PI * 2));
  const gradient = ctx.createRadialGradient(0, 0, 4, 0, 0, size * 1.6);
  gradient.addColorStop(0, "rgba(236, 72, 153, 0.7)");
  gradient.addColorStop(0.5, "rgba(168, 85, 247, 0.4)");
  gradient.addColorStop(1, "rgba(59, 130, 246, 0)");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, size * 1.6, 0, Math.PI * 2);
  ctx.fill();

  // Diamond Crate Shape
  ctx.fillStyle = "#a855f7";
  ctx.strokeStyle = "#f472b6";
  ctx.lineWidth = 2.5;
  ctx.shadowColor = "#e879f9";
  ctx.shadowBlur = 12;

  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size, 0);
  ctx.lineTo(0, size);
  ctx.lineTo(-size, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Mystery '?' icon in center
  ctx.rotate(-(timestamp * 0.002) % (Math.PI * 2));
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 13px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🎁", 0, 0);

  ctx.restore();
}

/**
 * Draw active skill visual FX (Dash Trails, Frost Rings, Shields, Magnets, Smoke, Stun Cages)
 */
export function drawSkillEffects(ctx, effects = [], timestamp) {
  for (const fx of effects) {
    const elapsed = (timestamp - fx.startTime) / 1000;
    const progress = Math.min(1, elapsed / fx.duration);
    if (progress >= 1) continue;

    ctx.save();

    switch (fx.type) {
      case "frost_emp": {
        // Expanding cryogenic shockwave ring
        const currentRadius = fx.radius * Math.sin((progress * Math.PI) / 2);
        const alpha = Math.max(0, 1 - progress);

        ctx.strokeStyle = `rgba(103, 232, 249, ${alpha * 0.9})`;
        ctx.lineWidth = 4 * (1 - progress * 0.5);
        ctx.shadowColor = "#38bdf8";
        ctx.shadowBlur = 16;

        ctx.beginPath();
        ctx.arc(fx.x, fx.y, currentRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Secondary frost ripple
        if (progress > 0.15) {
          ctx.strokeStyle = `rgba(165, 243, 252, ${alpha * 0.5})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, currentRadius * 0.7, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }

      case "smoke_screen": {
        // Lingering tactical smoke clouds
        const alpha = Math.max(0, (1 - progress) * 0.75);
        ctx.fillStyle = `rgba(100, 116, 139, ${alpha})`;
        ctx.shadowColor = "#475569";
        ctx.shadowBlur = 20;

        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2 + fx.startTime * 0.001;
          const dist = fx.radius * 0.45 * (0.5 + progress * 0.5);
          const px = fx.x + Math.cos(angle) * dist;
          const py = fx.y + Math.sin(angle) * dist;
          const r = (fx.radius * 0.35) * (0.8 + Math.sin(i * 2 + progress * 4) * 0.2);

          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case "dash_trail": {
        // Trailing speed particles
        const alpha = Math.max(0, 1 - progress);
        ctx.fillStyle = fx.color || "rgba(56, 189, 248, 0.8)";
        ctx.shadowColor = fx.color || "#38bdf8";
        ctx.shadowBlur = 10;
        ctx.globalAlpha = alpha;

        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.radius * (1 - progress * 0.4), 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      default:
        break;
    }

    ctx.restore();
  }
}

/**
 * Draw active persistent character auras (Aegis Shield, Freeze Stun, Magnet Fields)
 */
export function drawPlayerStatusAura(ctx, player, status, timestamp) {
  const { x, y, size } = player;
  const radius = size / 2;

  ctx.save();

  // 1. Aegis Shield Bubble
  if (status.shieldActive) {
    const pulse = Math.sin(timestamp * 0.01) * 2;
    const shieldRadius = radius + 10 + pulse;

    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#f59e0b";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "rgba(245, 158, 11, 0.18)";

    ctx.beginPath();
    ctx.arc(x, y, shieldRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Geometric shield arcs
    ctx.strokeStyle = "rgba(254, 240, 138, 0.8)";
    ctx.lineWidth = 1.5;
    const arcAngle = (timestamp * 0.003) % (Math.PI * 2);
    ctx.beginPath();
    ctx.arc(x, y, shieldRadius - 3, arcAngle, arcAngle + 1.2);
    ctx.stroke();
  }

  // 2. Frozen / Stunned Ice Crystal Cage
  if (status.isFrozen) {
    ctx.strokeStyle = "#67e8f9";
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "#22d3ee";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "rgba(103, 232, 249, 0.35)";

    ctx.beginPath();
    ctx.arc(x, y, radius + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Ice crystals spikes
    ctx.fillStyle = "#e0f2fe";
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const spikeX = x + Math.cos(angle) * (radius + 9);
      const spikeY = y + Math.sin(angle) * (radius + 9);
      ctx.beginPath();
      ctx.arc(spikeX, spikeY, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Stun label
    ctx.fillStyle = "#67e8f9";
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "center";
    ctx.fillText("❄️ FROZEN", x, y - radius - 26);
  }

  // 3. Coin Magnet Gravitational Field
  if (status.magnetActive) {
    const magRadius = radius + 14 + Math.sin(timestamp * 0.008) * 4;
    ctx.strokeStyle = "rgba(234, 179, 8, 0.55)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 6]);
    ctx.lineDashOffset = -(timestamp * 0.02);
    ctx.shadowColor = "#eab308";
    ctx.shadowBlur = 8;

    ctx.beginPath();
    ctx.arc(x, y, magRadius, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 4. Hyper Dash Energy Glow
  if (status.dashActive) {
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#0284c7";
    ctx.shadowBlur = 18;

    ctx.beginPath();
    ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}
