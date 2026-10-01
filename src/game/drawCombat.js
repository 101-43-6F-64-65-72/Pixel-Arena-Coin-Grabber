/**
 * High-Definition Combat Visual Effects & Floating Text Renderer
 * Supports Damage Numbers, Miss Alerts, Score Pickup Texts (+1, +2, +3), and Heal Texts (+25 HP).
 */

export function drawCombatEffects(ctx, effects = [], timestamp) {
  for (const fx of effects) {
    const elapsed = (timestamp - fx.startTime) / 1000;
    const progress = Math.min(1, elapsed / fx.duration);
    if (progress >= 1) continue;

    ctx.save();

    switch (fx.type) {
      case "melee_slash": {
        // Melee Attack Slash Arc
        const alpha = Math.max(0, 1 - progress);
        ctx.strokeStyle = fx.color || "#f87171";
        ctx.lineWidth = 4 * (1 - progress * 0.5);
        ctx.shadowColor = fx.color || "#ef4444";
        ctx.shadowBlur = 14;

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
        // 1. High-Brightness Starburst Impact Flash over Target Position
        if (progress < 0.25 && fx.targetY) {
          const flashProgress = progress / 0.25;
          ctx.save();
          ctx.beginPath();
          ctx.arc(fx.x, fx.targetY, 12 + flashProgress * 22, 0, Math.PI * 2);
          ctx.fillStyle = fx.isBlocked
            ? `rgba(251, 191, 36, ${0.85 * (1 - flashProgress)})`
            : `rgba(255, 255, 255, ${0.9 * (1 - flashProgress)})`;
          ctx.shadowColor = fx.isBlocked ? "#f59e0b" : "#ffffff";
          ctx.shadowBlur = 14;
          ctx.fill();
          ctx.restore();
        }

        // 2. Floating Damage Indicator
        const alpha = Math.max(0, 1 - progress);
        const floatY = fx.y - progress * 38;
        const scale = progress < 0.15 ? 0.7 + (progress / 0.15) * 0.4 : 1.1 - (progress - 0.15) * 0.12;

        ctx.save();
        ctx.translate(fx.x, floatY);
        ctx.scale(scale, scale);
        ctx.globalAlpha = alpha;

        const fontSize = fx.isKill ? 18 : 16;
        ctx.font = `bold ${fontSize}px monospace, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        let text = "";
        let fillCol = "#f87171";
        let shadowCol = "#ef4444";

        if (fx.isMiss) {
          text = "MISS";
          fillCol = "#94a3b8";
          shadowCol = "#64748b";
        } else if (fx.isBlocked) {
          text = "🛡️ BLOCKED";
          fillCol = "#fbbf24";
          shadowCol = "#f59e0b";
        } else if (fx.isKill) {
          text = `💀 -${fx.damage} (KILL)`;
          fillCol = "#ef4444";
          shadowCol = "#dc2626";
        } else {
          text = `-${fx.damage}`;
          fillCol = "#f87171";
          shadowCol = "#ef4444";
        }

        ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
        ctx.lineWidth = 4;
        ctx.strokeText(text, 0, 0);

        ctx.fillStyle = fillCol;
        ctx.shadowColor = shadowCol;
        ctx.shadowBlur = 10;
        ctx.fillText(text, 0, 0);

        ctx.restore();
        break;
      }

      case "pickup_text": {
        // Floating Score (+1, +2, +3) or Heal (+25 HP) Indicator
        const alpha = Math.max(0, 1 - progress);
        const floatY = fx.y - progress * 32;
        const scale = progress < 0.15 ? 0.8 + (progress / 0.15) * 0.35 : 1.05 - (progress - 0.15) * 0.08;

        ctx.save();
        ctx.translate(fx.x, floatY);
        ctx.scale(scale, scale);
        ctx.globalAlpha = alpha;

        ctx.font = "bold 15px monospace, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const text = fx.text || "+1";
        const fillCol = fx.color || "#4ade80";
        const shadowCol = fx.glowColor || "#22c55e";

        ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
        ctx.lineWidth = 3.5;
        ctx.strokeText(text, 0, 0);

        ctx.fillStyle = fillCol;
        ctx.shadowColor = shadowCol;
        ctx.shadowBlur = 12;
        ctx.fillText(text, 0, 0);

        ctx.restore();
        break;
      }

      case "shockwave": {
        const currentRadius = fx.radius * Math.sin((progress * Math.PI) / 2);
        const alpha = Math.max(0, 1 - progress);

        ctx.strokeStyle = `rgba(239, 68, 68, ${alpha * 0.95})`;
        ctx.lineWidth = 5 * (1 - progress * 0.6);
        ctx.shadowColor = "#dc2626";
        ctx.shadowBlur = 18;

        ctx.beginPath();
        ctx.arc(fx.x, fx.y, currentRadius, 0, Math.PI * 2);
        ctx.stroke();

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
