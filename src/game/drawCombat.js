/**
 * Combat Visual Effects Rendering (Slashes, Damage Numbers, Shockwaves, Shield Spheres)
 */

export function drawCombatEffects(ctx, effects = [], timestamp) {
  for (const fx of effects) {
    const elapsed = (timestamp - fx.startTime) / 1000;
    const progress = Math.min(1, elapsed / fx.duration);
    if (progress >= 1) continue;

    ctx.save();

    switch (fx.type) {
      case "melee_slash": {
        // Attack slash swipe arc
        const alpha = Math.max(0, 1 - progress);
        ctx.strokeStyle = fx.color || "#f87171";
        ctx.lineWidth = 4 * (1 - progress * 0.5);
        ctx.shadowColor = fx.color || "#ef4444";
        ctx.shadowBlur = 12;

        const radius = fx.radius || 36;
        const angle = fx.angle || 0;
        ctx.beginPath();
        ctx.arc(
          fx.x,
          fx.y,
          radius,
          angle - Math.PI * 0.35 + progress * 0.4,
          angle + Math.PI * 0.35 + progress * 0.4
        );
        ctx.stroke();
        break;
      }

      case "damage_text": {
        // Impact flash on the target
        if (progress < 0.25 && fx.targetY) {
          const flashProgress = progress / 0.25;
          ctx.beginPath();
          ctx.arc(fx.x, fx.targetY, 15 + flashProgress * 20, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${0.8 * (1 - flashProgress)})`;
          ctx.shadowColor = "#ffffff";
          ctx.shadowBlur = 10;
          ctx.fill();
        }

        // Floating damage indicator
        const alpha = Math.max(0, 1 - progress);
        const floatY = fx.y - progress * 32;
        ctx.globalAlpha = alpha;
        ctx.font = "bold 14px monospace, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        if (fx.isBlocked) {
          ctx.fillStyle = "#fbbf24";
          ctx.shadowColor = "#f59e0b";
          ctx.shadowBlur = 8;
          ctx.fillText("🛡️ BLOCKED", fx.x, floatY);
        } else if (fx.isKill) {
          ctx.fillStyle = "#ef4444";
          ctx.shadowColor = "#dc2626";
          ctx.shadowBlur = 10;
          ctx.fillText(`💀 -${fx.damage} (KILL)`, fx.x, floatY);
        } else {
          ctx.fillStyle = "#f87171";
          ctx.shadowColor = "#ef4444";
          ctx.shadowBlur = 6;
          ctx.fillText(`-${fx.damage}`, fx.x, floatY);
        }
        break;
      }

      case "shockwave": {
        // Shockwave skill expanding ring
        const currentRadius = fx.radius * Math.sin((progress * Math.PI) / 2);
        const alpha = Math.max(0, 1 - progress);

        ctx.strokeStyle = `rgba(239, 68, 68, ${alpha * 0.95})`;
        ctx.lineWidth = 5 * (1 - progress * 0.6);
        ctx.shadowColor = "#dc2626";
        ctx.shadowBlur = 18;

        ctx.beginPath();
        ctx.arc(fx.x, fx.y, currentRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Secondary ripple
        if (progress > 0.15) {
          ctx.strokeStyle = `rgba(252, 165, 165, ${alpha * 0.6})`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, currentRadius * 0.65, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }

      case "dash_trail": {
        // Fast blur dash particles
        const alpha = Math.max(0, 1 - progress);
        ctx.fillStyle = fx.color || "rgba(56, 189, 248, 0.7)";
        ctx.shadowColor = fx.color || "#38bdf8";
        ctx.shadowBlur = 10;
        ctx.globalAlpha = alpha;

        ctx.beginPath();
        ctx.arc(fx.x, fx.y, (fx.radius || 18) * (1 - progress * 0.3), 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      default:
        break;
    }

    ctx.restore();
  }
}
