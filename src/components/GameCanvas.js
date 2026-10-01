"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { WORLD_WIDTH, WORLD_HEIGHT, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, ARENA_PADDING, BASE_PLAYER_SIZE, PLAYER_SPEED, COIN_RADIUS, getPlayerPalette } from "@/lib/arena";
import { Camera } from "@/game/camera";
import { drawPlayer } from "@/game/drawPlayer";
import { drawCoin } from "@/game/drawCoin";
import { drawCombatEffects } from "@/game/drawCombat";
import { collectCoin } from "@/lib/coins";
import { updatePlayerPosition } from "@/lib/movement";
import { attackPlayer, useDash, useShield, useShockwave, respawnPlayer } from "@/lib/combat";
import { getGameImage } from "@/game/spriteManager";

const BROADCAST_THROTTLE_MS = 40; // ~25 Hz peer position broadcast
const DB_AUTH_SYNC_MS = 250;      // ~4 Hz authoritative database position sync

export default function GameCanvas({
  roomId,
  currentPlayerId,
  players = [],
  coins = [],
  matchPhase = "waiting",
  countdownSeconds = 3,
  isCollectiblesActive = false,
  skillCooldowns = {},
  onSkillCooldownUpdate,
}) {
  const canvasRef = useRef(null);

  // Props in refs for RAF loop
  const playersRef = useRef(players);
  useEffect(() => { playersRef.current = players; }, [players]);

  const coinsRef = useRef(coins);
  useEffect(() => { coinsRef.current = coins; }, [coins]);

  const roomIdRef = useRef(roomId);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);

  const currentPlayerIdRef = useRef(currentPlayerId);
  useEffect(() => { currentPlayerIdRef.current = currentPlayerId; }, [currentPlayerId]);

  const matchPhaseRef = useRef(matchPhase);
  useEffect(() => { matchPhaseRef.current = matchPhase; }, [matchPhase]);

  const countdownSecondsRef = useRef(countdownSeconds);
  useEffect(() => { countdownSecondsRef.current = countdownSeconds; }, [countdownSeconds]);

  const isCollectiblesActiveRef = useRef(isCollectiblesActive);
  useEffect(() => { isCollectiblesActiveRef.current = isCollectiblesActive; }, [isCollectiblesActive]);

  // Camera & Remote players
  const cameraRef = useRef(new Camera(VIEWPORT_WIDTH, VIEWPORT_HEIGHT));
  const remotePlayersRef = useRef({});
  const visualEffectsRef = useRef([]);

  // Persistent Local Player State (prevents any state reset on re-render)
  const localPlayerStateRef = useRef({
    x: 1000,
    y: 600,
    facingLeft: false,
    isMoving: false,
    animFrame: 0,
    animTimer: 0,
  });

  // Preload sprites on mount
  useEffect(() => {
    getGameImage("/uiset4.png");
    getGameImage("/uiset.png");
    getGameImage("/uiset2.png");
    getGameImage("/uiset3.png");
  }, []);

  // Sync initial player position once players array is loaded
  const hasInitializedPosRef = useRef(false);
  useEffect(() => {
    if (!hasInitializedPosRef.current && currentPlayerId && players && players.length > 0) {
      const myObj = players.find((p) => p.id === currentPlayerId);
      if (myObj && typeof myObj.x === "number" && myObj.x > 0) {
        localPlayerStateRef.current.x = Number(myObj.x);
        localPlayerStateRef.current.y = Number(myObj.y);
        cameraRef.current.snapTo(Number(myObj.x), Number(myObj.y));
        hasInitializedPosRef.current = true;
      }
    }
  }, [players, currentPlayerId]);

  // In-flight locks
  const pendingCoinsRef = useRef(new Set());
  const isAttackingRef = useRef(false);
  const isDashingRef = useRef(false);
  const isShieldingRef = useRef(false);
  const isShockwavingRef = useRef(false);
  const isRespawningRef = useRef(false);

  // Realtime Broadcast channel
  const channelRef = useRef(null);
  const lastBroadcastTimeRef = useRef(0);
  const lastSentPosRef = useRef({ x: -999, y: -999 });
  const lastDbSyncTimeRef = useRef(0);

  // Notification Toast
  const [combatNotification, setCombatNotification] = useState(null);
  const showToast = (msg) => {
    setCombatNotification(msg);
    setTimeout(() => {
      setCombatNotification((curr) => (curr === msg ? null : curr));
    }, 2500);
  };

  const lastMoveDirRef = useRef({ dx: 1, dy: 0 });

  // ── 1. Setup Supabase Realtime Broadcast Channel ────────────────────────────
  useEffect(() => {
    if (!roomId || !currentPlayerId) return;

    const channelName = `room:${roomId}`;
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    channelRef.current = channel;

    // Movement broadcast
    channel.on("broadcast", { event: "move" }, (event) => {
      const payload = event?.payload;
      if (!payload || payload.type !== "move") return;

      const senderId = payload.playerId;
      if (!senderId || senderId === currentPlayerIdRef.current) return;

      const { x, y, timestamp, isShielded, hp, alive, colorKey, isMoving, facingLeft, animFrame } = payload;
      const remotes = remotePlayersRef.current;
      const existing = remotes[senderId];

      if (!existing) {
        remotes[senderId] = {
          x: typeof x === "number" ? x : 1000,
          y: typeof y === "number" ? y : 600,
          targetX: typeof x === "number" ? x : 1000,
          targetY: typeof y === "number" ? y : 600,
          lastUpdated: timestamp || Date.now(),
          isShielded: !!isShielded,
          hp: typeof hp === "number" ? hp : 100,
          alive: alive !== false,
          colorKey: colorKey || "orange",
          isMoving: !!isMoving,
          facingLeft: !!facingLeft,
          animFrame: animFrame || 0,
        };
      } else {
        if (timestamp && existing.lastUpdated && timestamp < existing.lastUpdated) return;
        existing.targetX = typeof x === "number" ? x : existing.targetX;
        existing.targetY = typeof y === "number" ? y : existing.targetY;
        if (typeof isShielded === "boolean") existing.isShielded = isShielded;
        if (typeof hp === "number") existing.hp = hp;
        if (typeof alive === "boolean") existing.alive = alive;
        if (typeof isMoving === "boolean") existing.isMoving = isMoving;
        if (typeof facingLeft === "boolean") existing.facingLeft = facingLeft;
        if (typeof animFrame === "number") existing.animFrame = animFrame;
        if (colorKey) existing.colorKey = colorKey;
        if (timestamp) existing.lastUpdated = timestamp;
      }
    });

    // Combat FX broadcast
    channel.on("broadcast", { event: "combat_fx" }, (event) => {
      const payload = event?.payload;
      if (!payload) return;

      visualEffectsRef.current.push({
        id: `fx-${Date.now()}-${Math.random()}`,
        type: payload.type,
        x: Number(payload.x),
        y: Number(payload.y),
        radius: payload.radius || 36,
        angle: payload.angle || 0,
        damage: payload.damage || 0,
        isBlocked: !!payload.isBlocked,
        isKill: !!payload.isKill,
        color: payload.color || "#ef4444",
        startTime: performance.now(),
        duration: payload.duration || 0.6,
      });
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log(`[GameCanvas] Broadcast channel subscribed: ${channelName}`);
      }
    });

    return () => {
      if (channel) supabase.removeChannel(channel);
      channelRef.current = null;
      remotePlayersRef.current = {};
      pendingCoinsRef.current.clear();
    };
  }, [roomId, currentPlayerId]);

  // ── 2. Combat Action Handlers ───────────────────────────────────────────────
  const handlePerformAttack = useCallback(async () => {
    if (matchPhaseRef.current !== "playing" || isAttackingRef.current) return;

    const myId = currentPlayerIdRef.current;
    const myPlayer = playersRef.current?.find((p) => p.id === myId);
    if (!myPlayer || !myPlayer.alive) return;

    const pState = localPlayerStateRef.current;
    const myX = pState.x;
    const myY = pState.y;

    const remotes = remotePlayersRef.current;
    let closestEnemyId = null;
    let closestDistSq = 90 * 90;

    for (const [remoteId, remoteData] of Object.entries(remotes)) {
      const rObj = playersRef.current?.find((p) => p.id === remoteId);
      if (!rObj || !rObj.alive) continue;

      const distSq = (myX - remoteData.x) ** 2 + (myY - remoteData.y) ** 2;
      if (distSq <= closestDistSq) {
        closestDistSq = distSq;
        closestEnemyId = remoteId;
      }
    }

    if (!closestEnemyId) {
      const dir = lastMoveDirRef.current;
      const angle = Math.atan2(dir.dy, dir.dx);
      visualEffectsRef.current.push({
        id: `slash-${Date.now()}`,
        type: "melee_slash",
        x: myX + dir.dx * 28,
        y: myY + dir.dy * 28,
        radius: 36,
        angle,
        color: "#f87171",
        startTime: performance.now(),
        duration: 0.35,
      });
      return;
    }

    isAttackingRef.current = true;
    try {
      await updatePlayerPosition(myX, myY);
      const res = await attackPlayer(closestEnemyId);

      if (res && res.success) {
        const targetData = remotes[closestEnemyId] || { x: myX, y: myY };
        const angle = Math.atan2(targetData.y - myY, targetData.x - myX);

        visualEffectsRef.current.push({
          id: `slash-${Date.now()}`,
          type: "melee_slash",
          x: (myX + targetData.x) / 2,
          y: (myY + targetData.y) / 2,
          radius: 40,
          angle,
          color: res.is_shielded ? "#fbbf24" : "#ef4444",
          startTime: performance.now(),
          duration: 0.35,
        });

        visualEffectsRef.current.push({
          id: `dmg-${Date.now()}`,
          type: "damage_text",
          x: targetData.x,
          y: targetData.y - 20,
          damage: res.damage_dealt,
          isBlocked: res.is_shielded,
          isKill: res.is_kill,
          startTime: performance.now(),
          duration: 0.9,
        });

        if (channelRef.current) {
          channelRef.current.send({
            type: "broadcast",
            event: "combat_fx",
            payload: {
              type: "damage_text",
              x: targetData.x,
              y: targetData.y - 20,
              damage: res.damage_dealt,
              isBlocked: res.is_shielded,
              isKill: res.is_kill,
            },
          });
        }

        if (res.is_shielded) {
          showToast("🛡️ Enemy Shielded! Attack Blocked.");
        } else if (res.is_kill) {
          showToast("💀 ENEMY DEFEATED! (+1 Kill)");
        }
      }
    } finally {
      setTimeout(() => { isAttackingRef.current = false; }, 400);
    }
  }, []);

  const handlePerformDash = useCallback(async () => {
    if (matchPhaseRef.current !== "playing" || isDashingRef.current) return;
    const myId = currentPlayerIdRef.current;
    const myPlayer = playersRef.current?.find((p) => p.id === myId);
    if (!myPlayer || !myPlayer.alive) return;

    const dir = lastMoveDirRef.current;
    isDashingRef.current = true;

    try {
      const res = await useDash(dir.dx, dir.dy);
      if (res && res.success) {
        if (onSkillCooldownUpdate) onSkillCooldownUpdate("dash", 4);

        // Instantly advance local player position smoothly
        const pState = localPlayerStateRef.current;
        pState.x = Number(res.new_x);
        pState.y = Number(res.new_y);

        showToast("⚡ DASH!");
      }
    } finally {
      setTimeout(() => { isDashingRef.current = false; }, 600);
    }
  }, [onSkillCooldownUpdate]);

  const handlePerformShield = useCallback(async () => {
    if (matchPhaseRef.current !== "playing" || isShieldingRef.current) return;
    const myId = currentPlayerIdRef.current;
    const myPlayer = playersRef.current?.find((p) => p.id === myId);
    if (!myPlayer || !myPlayer.alive) return;

    isShieldingRef.current = true;
    try {
      const res = await useShield();
      if (res && res.success) {
        if (onSkillCooldownUpdate) onSkillCooldownUpdate("shield", 8);
        showToast("🛡️ AEGIS SHIELD (2s)");
      }
    } finally {
      setTimeout(() => { isShieldingRef.current = false; }, 600);
    }
  }, [onSkillCooldownUpdate]);

  const handlePerformShockwave = useCallback(async () => {
    if (matchPhaseRef.current !== "playing" || isShockwavingRef.current) return;
    const myId = currentPlayerIdRef.current;
    const myPlayer = playersRef.current?.find((p) => p.id === myId);
    if (!myPlayer || !myPlayer.alive) return;

    isShockwavingRef.current = true;
    try {
      const res = await useShockwave();
      if (res && res.success) {
        if (onSkillCooldownUpdate) onSkillCooldownUpdate("shockwave", 7);

        const pState = localPlayerStateRef.current;
        const now = performance.now();
        visualEffectsRef.current.push({
          id: `shock-${now}`,
          type: "shockwave",
          x: pState.x,
          y: pState.y,
          radius: 170,
          startTime: now,
          duration: 0.65,
        });

        if (channelRef.current) {
          channelRef.current.send({
            type: "broadcast",
            event: "combat_fx",
            payload: {
              type: "shockwave",
              x: pState.x,
              y: pState.y,
              radius: 170,
            },
          });
        }

        showToast(`💥 SHOCKWAVE! Hit ${res.hits_count} Enemies`);
      }
    } finally {
      setTimeout(() => { isShockwavingRef.current = false; }, 600);
    }
  }, [onSkillCooldownUpdate]);

  // ── 3. Main Game Engine & Smooth Canvas Loop ────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const camera = cameraRef.current;
    const pState = localPlayerStateRef.current;

    const keys = {
      up: false,
      down: false,
      left: false,
      right: false,
    };

    function clampPlayer() {
      const r = BASE_PLAYER_SIZE / 2;
      const minX = ARENA_PADDING + r;
      const maxX = WORLD_WIDTH - ARENA_PADDING - r;
      const minY = ARENA_PADDING + r;
      const maxY = WORLD_HEIGHT - ARENA_PADDING - r;

      pState.x = Math.max(minX, Math.min(maxX, pState.x));
      pState.y = Math.max(minY, Math.min(maxY, pState.y));
    }

    // Initialize position once from database
    const myId = currentPlayerIdRef.current;
    const myData = playersRef.current?.find((p) => p.id === myId);
    if (myData && typeof myData.x === "number" && myData.x > 0) {
      pState.x = Number(myData.x);
      pState.y = Number(myData.y);
      clampPlayer();
      camera.snapTo(pState.x, pState.y);
    }

    const MOVEMENT_KEYS = new Set([
      "arrowup", "arrowdown", "arrowleft", "arrowright",
      "w", "a", "s", "d", "i", "j", "k", "l",
    ]);

    function isMovementKey(e) {
      const keyLower = (e.key || "").toLowerCase();
      const code = e.code || "";
      return (
        MOVEMENT_KEYS.has(keyLower) ||
        code === "KeyW" || code === "KeyA" || code === "KeyS" || code === "KeyD" ||
        code === "ArrowUp" || code === "ArrowDown" || code === "ArrowLeft" || code === "ArrowRight"
      );
    }

    function handleKeyDown(e) {
      if (isMovementKey(e) || e.code === "Space" || e.key === " ") {
        e.preventDefault();
      }

      const curMe = playersRef.current?.find((p) => p.id === currentPlayerIdRef.current);
      if (curMe && !curMe.alive) return;

      const k = (e.key || "").toLowerCase();
      const c = e.code || "";

      if (k === "arrowup" || k === "w" || c === "KeyW" || c === "ArrowUp") keys.up = true;
      if (k === "arrowdown" || k === "s" || c === "KeyS" || c === "ArrowDown") keys.down = true;
      if (k === "arrowleft" || k === "a" || c === "KeyA" || c === "ArrowLeft") keys.left = true;
      if (k === "arrowright" || k === "d" || c === "KeyD" || c === "ArrowRight") keys.right = true;

      // Hotkeys: Q (Dash), E (Shield), R (Shockwave), Space/F (Attack)
      if (c === "KeyQ" || k === "q") {
        handlePerformDash();
      } else if (c === "KeyE" || k === "e") {
        handlePerformShield();
      } else if (c === "KeyR" || k === "r") {
        handlePerformShockwave();
      } else if (c === "Space" || k === " " || c === "KeyF" || k === "f") {
        handlePerformAttack();
      }
    }

    function handleKeyUp(e) {
      const k = (e.key || "").toLowerCase();
      const c = e.code || "";

      if (k === "arrowup" || k === "w" || c === "KeyW" || c === "ArrowUp") keys.up = false;
      if (k === "arrowdown" || k === "s" || c === "KeyS" || c === "ArrowDown") keys.down = false;
      if (k === "arrowleft" || k === "a" || c === "KeyA" || c === "ArrowLeft") keys.left = false;
      if (k === "arrowright" || k === "d" || c === "KeyD" || c === "ArrowRight") keys.right = false;
    }

    function handleCanvasClick() {
      if (canvas) canvas.focus();
      handlePerformAttack();
    }

    function handleBlur() {
      keys.up = keys.down = keys.left = keys.right = false;
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    canvas.addEventListener("click", handleCanvasClick);

    // ── Render Loop ───────────────────────────────────────────────────────────
    let lastTime = null;
    let rafId = null;

    function tick(timestamp) {
      const dt = lastTime === null ? 0 : Math.min((timestamp - lastTime) / 1000, 0.05);
      lastTime = timestamp;

      const currentPhase = matchPhaseRef.current;
      const currentPlayers = playersRef.current || [];
      const currentMyId = currentPlayerIdRef.current;
      const myPlayerObj = currentPlayers.find((p) => p.id === currentMyId);
      const isAlive = myPlayerObj?.alive !== false;
      const canMove = (currentPhase === "playing" || currentPhase === "waiting") && isAlive;

      // Handle Respawn Trigger if dead
      if (!isAlive && myPlayerObj?.respawn_at && !isRespawningRef.current) {
        const respawnTime = new Date(myPlayerObj.respawn_at).getTime();
        if (Date.now() >= respawnTime) {
          isRespawningRef.current = true;
          respawnPlayer().then((res) => {
            if (res && res.success) {
              pState.x = Number(res.new_x);
              pState.y = Number(res.new_y);
              camera.snapTo(pState.x, pState.y);
              showToast("✨ RESPAWNED (Spawn Shield 1.5s)");
            }
          }).finally(() => {
            setTimeout(() => { isRespawningRef.current = false; }, 1000);
          });
        }
      }

      // 1. Move Local Player smoothly with frame delta time (in waiting lobby or match)
      if (canMove) {
        let dx = 0;
        let dy = 0;
        if (keys.up)    dy -= 1;
        if (keys.down)  dy += 1;
        if (keys.left)  dx -= 1;
        if (keys.right) dx += 1;

        if (dx !== 0 && dy !== 0) {
          const inv = 1 / Math.SQRT2;
          dx *= inv;
          dy *= inv;
        }

        const isMoving = dx !== 0 || dy !== 0;
        pState.isMoving = isMoving;

        if (isMoving) {
          lastMoveDirRef.current = { dx, dy };
          if (dx < -0.01) pState.facingLeft = true;
          if (dx > 0.01) pState.facingLeft = false;

          pState.x += dx * PLAYER_SPEED * dt;
          pState.y += dy * PLAYER_SPEED * dt;
          clampPlayer();

          // Advance animation frame timer (8-frame sci-fi robot run cycle)
          pState.animTimer += dt;
          if (pState.animTimer >= 0.075) {
            pState.animTimer = 0;
            pState.animFrame = (pState.animFrame + 1) % 8;
          }
        } else {
          pState.animFrame = 0;
        }
      } else {
        keys.up = keys.down = keys.left = keys.right = false;
        pState.isMoving = false;
      }

      // Camera smooth follow using exponential smoothing
      camera.follow(pState.x, pState.y, 1 - Math.exp(-12 * dt));

      const epochNow = Date.now();
      const currentChannel = channelRef.current;
      const isShielded = myPlayerObj?.shield_until && new Date(myPlayerObj.shield_until).getTime() > epochNow;

      // 2. Broadcast Position & Animation to Peers (~25 Hz)
      if (currentChannel && currentMyId && epochNow - lastBroadcastTimeRef.current >= BROADCAST_THROTTLE_MS) {
        const distMoved =
          Math.abs(pState.x - lastSentPosRef.current.x) +
          Math.abs(pState.y - lastSentPosRef.current.y);

        if (distMoved > 0.02 || isShielded || pState.isMoving) {
          currentChannel.send({
            type: "broadcast",
            event: "move",
            payload: {
              type: "move",
              playerId: currentMyId,
              x: Math.round(pState.x * 10) / 10,
              y: Math.round(pState.y * 10) / 10,
              isShielded: !!isShielded,
              hp: myPlayerObj?.hp ?? 100,
              alive: isAlive,
              colorKey: myPlayerObj?.color_key || "orange",
              isMoving: pState.isMoving,
              facingLeft: pState.facingLeft,
              animFrame: pState.animFrame,
              timestamp: epochNow,
            },
          });
          lastBroadcastTimeRef.current = epochNow;
          lastSentPosRef.current = { x: pState.x, y: pState.y };
        }
      }

      // 3. Authoritative Database Position Sync (~4 Hz)
      if (currentMyId && epochNow - lastDbSyncTimeRef.current >= DB_AUTH_SYNC_MS && canMove) {
        lastDbSyncTimeRef.current = epochNow;
        updatePlayerPosition(pState.x, pState.y);
      }

      // 4. Coin Collection Check
      if (isCollectiblesActiveRef.current && currentPhase === "playing" && isAlive) {
        const activeCoins = coinsRef.current || [];
        const pendingSet = pendingCoinsRef.current;
        const collectionRadius = BASE_PLAYER_SIZE / 2 + COIN_RADIUS;

        for (let i = 0; i < activeCoins.length; i++) {
          const coin = activeCoins[i];
          if (!coin || !coin.active) continue;
          if (pendingSet.has(coin.id)) continue;

          const distance = Math.hypot(pState.x - Number(coin.x), pState.y - Number(coin.y));
          if (distance <= collectionRadius) {
            pendingSet.add(coin.id);
            coin.active = false;

            updatePlayerPosition(pState.x, pState.y)
              .then(() => collectCoin(coin.id, currentMyId))
              .then((result) => {
                if (!result || !result.success) {
                  coin.active = true;
                }
              })
              .catch(() => {
                coin.active = true;
              })
              .finally(() => {
                pendingSet.delete(coin.id);
              });
          }
        }
      }

      // ── 5. RENDER CANVAS (Camera-Relative) ───────────────────────────────────
      ctx.clearRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

      // Arena Floor
      const floorScreen = camera.worldToScreen(ARENA_PADDING, ARENA_PADDING);
      const arenaW = WORLD_WIDTH - ARENA_PADDING * 2;
      const arenaH = WORLD_HEIGHT - ARENA_PADDING * 2;

      ctx.fillStyle = "#18181b"; // Dark tactical arena floor
      ctx.fillRect(floorScreen.x, floorScreen.y, arenaW, arenaH);

      // Retro Floor Grid
      ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
      ctx.lineWidth = 1;
      const gridSize = 50;

      const startGridX = Math.floor(camera.x / gridSize) * gridSize;
      const endGridX = Math.ceil((camera.x + VIEWPORT_WIDTH) / gridSize) * gridSize;
      for (let gx = startGridX; gx <= endGridX; gx += gridSize) {
        if (gx < ARENA_PADDING || gx > WORLD_WIDTH - ARENA_PADDING) continue;
        const s = camera.worldToScreen(gx, ARENA_PADDING);
        ctx.beginPath();
        ctx.moveTo(s.x, camera.worldToScreen(gx, ARENA_PADDING).y);
        ctx.lineTo(s.x, camera.worldToScreen(gx, WORLD_HEIGHT - ARENA_PADDING).y);
        ctx.stroke();
      }

      const startGridY = Math.floor(camera.y / gridSize) * gridSize;
      const endGridY = Math.ceil((camera.y + VIEWPORT_HEIGHT) / gridSize) * gridSize;
      for (let gy = startGridY; gy <= endGridY; gy += gridSize) {
        if (gy < ARENA_PADDING || gy > WORLD_HEIGHT - ARENA_PADDING) continue;
        const s = camera.worldToScreen(ARENA_PADDING, gy);
        ctx.beginPath();
        ctx.moveTo(camera.worldToScreen(ARENA_PADDING, gy).x, s.y);
        ctx.lineTo(camera.worldToScreen(WORLD_WIDTH - ARENA_PADDING, gy).x, s.y);
        ctx.stroke();
      }

      // Arena Outer Border
      ctx.strokeStyle = "#52525b";
      ctx.lineWidth = 4;
      ctx.strokeRect(floorScreen.x, floorScreen.y, arenaW, arenaH);

      // 6. Draw Active Coins (Camera-relative)
      const activeCoins = coinsRef.current || [];
      for (let i = 0; i < activeCoins.length; i++) {
        const coin = activeCoins[i];
        if (coin && coin.active && camera.isVisible(Number(coin.x), Number(coin.y), 20)) {
          const s = camera.worldToScreen(Number(coin.x), Number(coin.y));
          drawCoin(ctx, s.x, s.y, COIN_RADIUS);
        }
      }

      // 7. Draw Combat Effects (Camera-relative)
      const screenFx = visualEffectsRef.current.map((fx) => {
        const s = camera.worldToScreen(fx.x, fx.y);
        return { ...fx, x: s.x, y: s.y };
      });
      drawCombatEffects(ctx, screenFx, timestamp);
      visualEffectsRef.current = visualEffectsRef.current.filter(
        (fx) => (timestamp - fx.startTime) / 1000 < fx.duration
      );

      // 8. Find Leader
      const highestScore = currentPlayers.reduce((max, p) => Math.max(max, p.score ?? 0), 0);

      // 9. Draw Remote Players (Delta-time interpolated, Authoritative color & HP)
      const remotes = remotePlayersRef.current;
      const remoteSmoothing = 1 - Math.exp(-18 * dt);
      for (const [remoteId, remoteData] of Object.entries(remotes)) {
        remoteData.x += (remoteData.targetX - remoteData.x) * remoteSmoothing;
        remoteData.y += (remoteData.targetY - remoteData.y) * remoteSmoothing;

        if (camera.isVisible(remoteData.x, remoteData.y, 50)) {
          const s = camera.worldToScreen(remoteData.x, remoteData.y);
          const remoteObj = currentPlayers.find((p) => p.id === remoteId);
          const rScore = remoteObj?.score ?? 0;
          const rHp = remoteObj?.hp ?? remoteData.hp ?? 100;
          const rAlive = remoteObj ? remoteObj.alive : remoteData.alive;
          const rColorKey = remoteObj?.color_key || remoteData.colorKey || "purple";
          const rShielded = remoteObj?.shield_until && new Date(remoteObj.shield_until).getTime() > epochNow;

          let rRespawnSecs = 0;
          if (!rAlive && remoteObj?.respawn_at) {
            rRespawnSecs = Math.max(0, (new Date(remoteObj.respawn_at).getTime() - epochNow) / 1000);
          }

          drawPlayer(ctx, s.x, s.y, BASE_PLAYER_SIZE, {
            colorKey: rColorKey,
            nickname: remoteObj?.nickname || "Player",
            score: rScore,
            hp: rHp,
            maxHp: 100,
            alive: rAlive,
            isLeader: rScore === highestScore && highestScore > 0,
            isShielded: !!rShielded,
            respawnSecs: rRespawnSecs,
            isMoving: remoteData.isMoving,
            facingLeft: remoteData.facingLeft,
            animFrame: remoteData.animFrame,
          });
        }
      }

      // 10. Draw Local Player (Sci-Fi Robot Sprite from uiset4.png)
      const myScreen = camera.worldToScreen(pState.x, pState.y);
      const myScore = myPlayerObj?.score ?? 0;
      const myHp = myPlayerObj?.hp ?? 100;
      const myColorKey = myPlayerObj?.color_key || "orange";
      let myRespawnSecs = 0;
      if (!isAlive && myPlayerObj?.respawn_at) {
        myRespawnSecs = Math.max(0, (new Date(myPlayerObj.respawn_at).getTime() - epochNow) / 1000);
      }

      drawPlayer(ctx, myScreen.x, myScreen.y, BASE_PLAYER_SIZE, {
        colorKey: myColorKey,
        nickname: `${myPlayerObj?.nickname || "You"} (You)`,
        score: myScore,
        hp: myHp,
        maxHp: 100,
        alive: isAlive,
        isLeader: myScore === highestScore && highestScore > 0,
        isShielded: !!isShielded,
        respawnSecs: myRespawnSecs,
        isMoving: pState.isMoving,
        facingLeft: pState.facingLeft,
        animFrame: pState.animFrame,
      });

      // 11. Minimap Radar (Bottom-Right)
      const miniW = 160;
      const miniH = 96;
      const miniX = VIEWPORT_WIDTH - miniW - 14;
      const miniY = VIEWPORT_HEIGHT - miniH - 14;

      ctx.save();
      ctx.fillStyle = "rgba(9, 9, 11, 0.85)";
      ctx.fillRect(miniX, miniY, miniW, miniH);
      ctx.strokeStyle = "#3f3f46";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(miniX, miniY, miniW, miniH);

      const scaleX = miniW / WORLD_WIDTH;
      const scaleY = miniH / WORLD_HEIGHT;

      // Viewport box
      ctx.strokeStyle = "rgba(250, 204, 21, 0.55)";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        miniX + camera.x * scaleX,
        miniY + camera.y * scaleY,
        VIEWPORT_WIDTH * scaleX,
        VIEWPORT_HEIGHT * scaleY
      );

      // Minimap coins
      ctx.fillStyle = "#eab308";
      for (const coin of activeCoins) {
        if (coin.active) {
          ctx.fillRect(miniX + coin.x * scaleX - 1, miniY + coin.y * scaleY - 1, 2, 2);
        }
      }

      // Minimap remote players
      for (const [rId, rData] of Object.entries(remotes)) {
        const rObj = currentPlayers.find((p) => p.id === rId);
        const palette = getPlayerPalette(rObj?.color_key || "purple");
        ctx.fillStyle = palette.body;
        ctx.beginPath();
        ctx.arc(miniX + rData.x * scaleX, miniY + rData.y * scaleY, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Minimap local player
      const myPal = getPlayerPalette(myColorKey);
      ctx.fillStyle = myPal.body;
      ctx.beginPath();
      ctx.arc(miniX + pState.x * scaleX, miniY + pState.y * scaleY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();

      // 12. Waiting Phase Overlay
      if (currentPhase === "waiting") {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
        ctx.font = "bold 20px monospace, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#e4e4e7";
        ctx.fillText("WAITING FOR HOST TO START ARENA BATTLE", VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2);
        ctx.restore();
      }

      // 13. Countdown Overlay
      if (currentPhase === "countdown") {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
        ctx.font = "bold 96px monospace, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#facc15";
        const count = countdownSecondsRef.current;
        ctx.fillText(count > 0 ? String(count) : "GO!", VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2);
        ctx.restore();
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      canvas.removeEventListener("click", handleCanvasClick);
    };
  }, [handlePerformAttack, handlePerformDash, handlePerformShield, handlePerformShockwave]);

  return (
    <div className="relative w-full h-full flex items-center justify-center p-2 bg-zinc-950">
      <canvas
        ref={canvasRef}
        width={VIEWPORT_WIDTH}
        height={VIEWPORT_HEIGHT}
        className="w-full h-auto max-w-[960px] aspect-[960/600] object-contain rounded-xl outline-none shadow-2xl border border-zinc-800/80 bg-zinc-900 cursor-crosshair"
        tabIndex={0}
        aria-label="RoyalWar Arena Viewport"
      />

      {/* In-Arena Toast */}
      {combatNotification && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 px-5 py-2 bg-zinc-950/95 border border-orange-500/80 rounded-full text-orange-300 font-mono font-bold text-xs shadow-2xl animate-in fade-in zoom-in-95 duration-150">
          {combatNotification}
        </div>
      )}
    </div>
  );
}
