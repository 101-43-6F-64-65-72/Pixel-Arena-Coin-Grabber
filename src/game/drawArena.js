import { WORLD_WIDTH, WORLD_HEIGHT, ARENA_PADDING } from "@/lib/arena";

/**
 * High-Definition Lightweight Arena Floor & Environment Renderer
 * Uses procedural 2D canvas vector geometry for high FPS performance.
 */
export function drawArena(ctx, camera, viewportWidth, viewportHeight, timestamp = 0) {
  ctx.save();

  // 1. Dark Outer Tech Void Background
  ctx.fillStyle = "#09090c";
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);

  // 2. Arena Playable Floor Bounds (World Space -> Screen Space)
  const floorScreen = camera.worldToScreen(ARENA_PADDING, ARENA_PADDING);
  const arenaW = WORLD_WIDTH - ARENA_PADDING * 2;
  const arenaH = WORLD_HEIGHT - ARENA_PADDING * 2;

  // Base floor fill - Deep dark metallic slate
  ctx.fillStyle = "#111116";
  ctx.fillRect(floorScreen.x, floorScreen.y, arenaW, arenaH);

  // 3. Procedural HD Checker & Carbon Weave Floor Tiles (100x100 Tile Blocks)
  const tileSize = 100;
  const startTileX = Math.floor(camera.x / tileSize) * tileSize;
  const endTileX = Math.ceil((camera.x + viewportWidth) / tileSize) * tileSize;
  const startTileY = Math.floor(camera.y / tileSize) * tileSize;
  const endTileY = Math.ceil((camera.y + viewportHeight) / tileSize) * tileSize;

  for (let tx = startTileX; tx <= endTileX; tx += tileSize) {
    if (tx < ARENA_PADDING || tx >= WORLD_WIDTH - ARENA_PADDING) continue;
    for (let ty = startTileY; ty <= endTileY; ty += tileSize) {
      if (ty < ARENA_PADDING || ty >= WORLD_HEIGHT - ARENA_PADDING) continue;

      const tileIndex = (tx / tileSize + ty / tileSize) % 2;
      const s = camera.worldToScreen(tx, ty);
      const drawW = Math.min(tileSize, WORLD_WIDTH - ARENA_PADDING - tx);
      const drawH = Math.min(tileSize, WORLD_HEIGHT - ARENA_PADDING - ty);

      // Alternating tile shading for depth
      if (tileIndex === 0) {
        ctx.fillStyle = "#15151b";
        ctx.fillRect(s.x, s.y, drawW, drawH);
      }

      // Subtle inner tile border
      ctx.strokeStyle = "rgba(255, 255, 255, 0.025)";
      ctx.lineWidth = 1;
      ctx.strokeRect(s.x + 1, s.y + 1, drawW - 2, drawH - 2);
    }
  }

  // 4. Fine 50px Grid Lines & Glowing Intersections
  const gridSize = 50;
  const startGridX = Math.floor(camera.x / gridSize) * gridSize;
  const endGridX = Math.ceil((camera.x + viewportWidth) / gridSize) * gridSize;
  const startGridY = Math.floor(camera.y / gridSize) * gridSize;
  const endGridY = Math.ceil((camera.y + viewportHeight) / gridSize) * gridSize;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
  ctx.lineWidth = 1;

  for (let gx = startGridX; gx <= endGridX; gx += gridSize) {
    if (gx < ARENA_PADDING || gx > WORLD_WIDTH - ARENA_PADDING) continue;
    const sx = camera.worldToScreen(gx, 0).x;
    const sy1 = Math.max(floorScreen.y, camera.worldToScreen(gx, ARENA_PADDING).y);
    const sy2 = Math.min(floorScreen.y + arenaH, camera.worldToScreen(gx, WORLD_HEIGHT - ARENA_PADDING).y);
    ctx.beginPath();
    ctx.moveTo(sx, sy1);
    ctx.lineTo(sx, sy2);
    ctx.stroke();
  }

  for (let gy = startGridY; gy <= endGridY; gy += gridSize) {
    if (gy < ARENA_PADDING || gy > WORLD_HEIGHT - ARENA_PADDING) continue;
    const sy = camera.worldToScreen(0, gy).y;
    const sx1 = Math.max(floorScreen.x, camera.worldToScreen(ARENA_PADDING, gy).x);
    const sx2 = Math.min(floorScreen.x + arenaW, camera.worldToScreen(WORLD_WIDTH - ARENA_PADDING, gy).x);
    ctx.beginPath();
    ctx.moveTo(sx1, sy);
    ctx.lineTo(sx2, sy);
    ctx.stroke();
  }

  // Glowing intersection dots (every 100px)
  const dotPulse = Math.sin(timestamp * 0.003) * 0.15;
  ctx.fillStyle = `rgba(245, 166, 35, ${0.2 + dotPulse})`;
  for (let gx = Math.floor(startGridX / 100) * 100; gx <= endGridX; gx += 100) {
    if (gx < ARENA_PADDING || gx > WORLD_WIDTH - ARENA_PADDING) continue;
    for (let gy = Math.floor(startGridY / 100) * 100; gy <= endGridY; gy += 100) {
      if (gy < ARENA_PADDING || gy > WORLD_HEIGHT - ARENA_PADDING) continue;
      const s = camera.worldToScreen(gx, gy);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 5. Environmental Tech Conduit Pillars (4 Corner Arena Obstacles / Conduits)
  const pillars = [
    { x: 600, y: 350, label: "CONDUIT-A", color: "#f5a623" },
    { x: 1400, y: 350, label: "CONDUIT-B", color: "#38bdf8" },
    { x: 600, y: 850, label: "CONDUIT-C", color: "#a855f7" },
    { x: 1400, y: 850, label: "CONDUIT-D", color: "#10b981" },
  ];

  for (const pil of pillars) {
    if (camera.isVisible(pil.x, pil.y, 120)) {
      const s = camera.worldToScreen(pil.x, pil.y);
      ctx.save();

      // Outer glowing base ring
      const basePulse = 32 + Math.sin(timestamp * 0.004 + pil.x) * 3;
      ctx.strokeStyle = pil.color;
      ctx.lineWidth = 2;
      ctx.shadowColor = pil.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(s.x, s.y, basePulse, 0, Math.PI * 2);
      ctx.stroke();

      // Inner metallic pillar body
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#1e1e24";
      ctx.strokeStyle = "#3f3f46";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Pillar LED core
      ctx.fillStyle = pil.color;
      ctx.shadowColor = pil.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
      ctx.fill();

      // Label text
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(pil.label, s.x, s.y + 36);

      ctx.restore();
    }
  }

  // 6. Center Tactical Battle Ring & Sector Decals (World Center = 1000, 600)
  if (camera.isVisible(1000, 600, 320)) {
    const centerScreen = camera.worldToScreen(1000, 600);
    ctx.save();

    // Center glowing ring
    ctx.strokeStyle = "rgba(245, 166, 35, 0.18)";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(centerScreen.x, centerScreen.y, 180, 0, Math.PI * 2);
    ctx.stroke();

    // Outer sector ring
    ctx.strokeStyle = "rgba(56, 189, 248, 0.14)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(centerScreen.x, centerScreen.y, 280, 0, Math.PI * 2);
    ctx.stroke();

    // Center crosshair
    ctx.strokeStyle = "rgba(245, 166, 35, 0.3)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(centerScreen.x - 18, centerScreen.y);
    ctx.lineTo(centerScreen.x + 18, centerScreen.y);
    ctx.moveTo(centerScreen.x, centerScreen.y - 18);
    ctx.lineTo(centerScreen.x, centerScreen.y + 18);
    ctx.stroke();

    ctx.restore();
  }

  // 7. Hazard Warning Stripes along Arena Borders
  const stripeW = 16;
  ctx.save();
  ctx.fillStyle = "rgba(245, 166, 35, 0.08)";
  // Top & Bottom hazard bands
  ctx.fillRect(floorScreen.x, floorScreen.y, arenaW, stripeW);
  ctx.fillRect(floorScreen.x, floorScreen.y + arenaH - stripeW, arenaW, stripeW);
  // Left & Right hazard bands
  ctx.fillRect(floorScreen.x, floorScreen.y, stripeW, arenaH);
  ctx.fillRect(floorScreen.x + arenaW - stripeW, floorScreen.y, stripeW, arenaH);
  ctx.restore();

  // 8. Arena Boundary Wall & Glow
  ctx.save();
  ctx.strokeStyle = "#52525b";
  ctx.lineWidth = 4;
  ctx.strokeRect(floorScreen.x, floorScreen.y, arenaW, arenaH);

  // Inner neon boundary line
  ctx.strokeStyle = "rgba(245, 166, 35, 0.4)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(floorScreen.x + 2, floorScreen.y + 2, arenaW - 4, arenaH - 4);
  ctx.restore();

  // 9. Subtle Ambient Vignette (Edges Darkening for Depth)
  const vignetteGradient = ctx.createRadialGradient(
    viewportWidth / 2,
    viewportHeight / 2,
    viewportWidth * 0.35,
    viewportWidth / 2,
    viewportHeight / 2,
    viewportWidth * 0.72
  );
  vignetteGradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignetteGradient.addColorStop(1, "rgba(0, 0, 0, 0.48)");

  ctx.fillStyle = vignetteGradient;
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);

  ctx.restore();
}
