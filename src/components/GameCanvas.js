"use client";

import { useEffect, useRef } from "react";
import { drawPlayer } from "@/game/drawPlayer";

// ─── Constants ───────────────────────────────────────────────────────────────

const PLAYER_SIZE = 32;       // diameter in logical arena pixels
const PLAYER_SPEED = 200;     // logical pixels per second
const ARENA_PADDING = 24;     // gap between canvas edge and playable boundary
const ARENA_BG = "#1c1917";   // dark stone — arena floor
const ARENA_BORDER = "#78716c"; // muted stone border

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * GameCanvas renders a full-screen, responsive HTML5 Canvas containing:
 *   1. The arena background and boundary
 *   2. The local player
 *
 * Responsibilities in this phase:
 *   - Keyboard input (WASD + Arrow keys)
 *   - Frame-rate-independent movement via delta time
 *   - Arena boundary collision
 *   - requestAnimationFrame render loop
 *
 * React only manages the canvas element reference.
 * All frequently-changing game state lives in refs to avoid re-renders
 * every animation frame.
 */
export default function GameCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // ── Player state (in refs — NOT React state, so no re-render per frame) ──
    // Position is the center of the player in logical (canvas) coordinates.
    const player = {
      x: 0,
      y: 0,
    };

    // Keys currently held down
    const keys = {
      up: false,
      down: false,
      left: false,
      right: false,
    };

    // ── Canvas sizing ─────────────────────────────────────────────────────────
    // We track canvas logical dimensions here so the game loop always uses
    // the current size without reading the DOM repeatedly.
    let canvasW = 0;
    let canvasH = 0;

    function resizeCanvas() {
      const dpr = window.devicePixelRatio || 1;

      // The canvas fills its CSS container; read layout size from the element.
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;

      // Avoid redundant resizes
      if (canvas.width === cssW * dpr && canvas.height === cssH * dpr) return;

      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;

      ctx.scale(dpr, dpr);

      canvasW = cssW;
      canvasH = cssH;

      // Keep the player inside the arena after resize.
      clampPlayer();
    }

    // ── Arena ─────────────────────────────────────────────────────────────────
    // The playable area is the canvas minus the fixed padding on all sides.
    function arenaRect() {
      return {
        x: ARENA_PADDING,
        y: ARENA_PADDING,
        w: canvasW - ARENA_PADDING * 2,
        h: canvasH - ARENA_PADDING * 2,
      };
    }

    // Clamps the player center so the player body stays inside the arena.
    function clampPlayer() {
      const a = arenaRect();
      const r = PLAYER_SIZE / 2;
      player.x = Math.max(a.x + r, Math.min(a.x + a.w - r, player.x));
      player.y = Math.max(a.y + r, Math.min(a.y + a.h - r, player.y));
    }

    // Spawn the player at the center of the arena on first load.
    function spawnPlayer() {
      const a = arenaRect();
      player.x = a.x + a.w / 2;
      player.y = a.y + a.h / 2;
    }

    // ── Keyboard input ────────────────────────────────────────────────────────
    const MOVEMENT_KEYS = new Set([
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
      "w", "a", "s", "d",
      "W", "A", "S", "D",
    ]);

    function handleKeyDown(e) {
      // Prevent arrow-key page scrolling only while the game is active.
      if (MOVEMENT_KEYS.has(e.key)) e.preventDefault();

      switch (e.key) {
        case "ArrowUp":    case "w": case "W": keys.up    = true; break;
        case "ArrowDown":  case "s": case "S": keys.down  = true; break;
        case "ArrowLeft":  case "a": case "A": keys.left  = true; break;
        case "ArrowRight": case "d": case "D": keys.right = true; break;
      }
    }

    function handleKeyUp(e) {
      switch (e.key) {
        case "ArrowUp":    case "w": case "W": keys.up    = false; break;
        case "ArrowDown":  case "s": case "S": keys.down  = false; break;
        case "ArrowLeft":  case "a": case "A": keys.left  = false; break;
        case "ArrowRight": case "d": case "D": keys.right = false; break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup",   handleKeyUp);

    // ── Render loop ───────────────────────────────────────────────────────────
    let lastTime = null;
    let rafId = null;

    function tick(timestamp) {
      // Delta time in seconds, capped at 100 ms to avoid big jumps after tab
      // switching or slow frames.
      const dt = lastTime === null ? 0 : Math.min((timestamp - lastTime) / 1000, 0.1);
      lastTime = timestamp;

      // ── Movement with diagonal normalisation ──────────────────────────────
      let dx = 0;
      let dy = 0;
      if (keys.up)    dy -= 1;
      if (keys.down)  dy += 1;
      if (keys.left)  dx -= 1;
      if (keys.right) dx += 1;

      if (dx !== 0 && dy !== 0) {
        // Normalise to avoid ~1.41× speed diagonally.
        const inv = 1 / Math.SQRT2;
        dx *= inv;
        dy *= inv;
      }

      player.x += dx * PLAYER_SPEED * dt;
      player.y += dy * PLAYER_SPEED * dt;

      clampPlayer();

      // ── Draw ──────────────────────────────────────────────────────────────
      // 1. Clear
      ctx.clearRect(0, 0, canvasW, canvasH);

      const a = arenaRect();

      // 2. Arena background
      ctx.fillStyle = ARENA_BG;
      ctx.fillRect(a.x, a.y, a.w, a.h);

      // 3. Arena border
      ctx.strokeStyle = ARENA_BORDER;
      ctx.lineWidth = 3;
      ctx.strokeRect(a.x, a.y, a.w, a.h);

      // 4. Player
      drawPlayer(ctx, player.x, player.y, PLAYER_SIZE);

      rafId = requestAnimationFrame(tick);
    }

    // ── Resize handling ───────────────────────────────────────────────────────
    const resizeObserver = new ResizeObserver(() => {
      // ctx scale is reset each time we change canvas.width/height, so we
      // must not scale again here — resizeCanvas applies the DPR scale once.
      ctx.setTransform(1, 0, 0, 1, 0, 0); // reset before re-applying scale
      resizeCanvas();
    });

    resizeObserver.observe(canvas);

    // ── Init ──────────────────────────────────────────────────────────────────
    resizeCanvas();
    spawnPlayer();
    rafId = requestAnimationFrame(tick);

    // ── Cleanup on unmount ────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup",   handleKeyUp);
      resizeObserver.disconnect();
    };
  }, []); // runs once on mount

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full"
      aria-label="Game arena"
    />
  );
}
