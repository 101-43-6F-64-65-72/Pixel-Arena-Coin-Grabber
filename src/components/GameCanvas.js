"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { drawPlayer } from "@/game/drawPlayer";
import { drawCoin } from "@/game/drawCoin";
import { collectCoin } from "@/lib/coins";
import { updatePlayerPosition } from "@/lib/movement";
import { eliminatePlayer } from "@/lib/match";
import { SKILL_CATALOG, generateMysteryOrbs, rollGachaSkill } from "@/lib/skills";
import { drawMysteryOrb, drawSkillEffects, drawPlayerStatusAura } from "@/game/drawSkillEffects";

// ─── Constants ───────────────────────────────────────────────────────────────

const LOGICAL_WIDTH = 1200;   // Expanded arena width in pixels
const LOGICAL_HEIGHT = 750;   // Expanded arena height in pixels
const ARENA_PADDING = 24;     // Gap between canvas edge and playable boundary
const BASE_PLAYER_SIZE = 32;  // Base diameter in logical arena pixels
const PLAYER_SPEED = 210;     // Logical pixels per second
const COIN_RADIUS = 8;        // Logical pixels

const BROADCAST_THROTTLE_MS = 45;  // ~22 Hz low-latency peer visual broadcast
const DB_AUTH_SYNC_MS = 300;       // ~3.3 Hz authoritative database position sync

// Color palette for remote players
const REMOTE_PLAYER_COLORS = [
  { body: "#3b82f6", stroke: "#1d4ed8" }, // Blue
  { body: "#10b981", stroke: "#047857" }, // Emerald
  { body: "#a855f7", stroke: "#7e22ce" }, // Purple
  { body: "#ec4899", stroke: "#be185d" }, // Pink
  { body: "#eab308", stroke: "#ca8a04" }, // Yellow
];

/**
 * Calculates dynamic player diameter based on current score (Worms Zone / Agar.io growth)
 */
function getPlayerDiameter(score = 0) {
  return Math.min(88, BASE_PLAYER_SIZE + Math.sqrt(Math.max(0, score)) * 4.2);
}

/**
 * GameCanvas Component with:
 *   1. 1200x750 Expanded Arena & Responsive scaling
 *   2. Worms Zone / Agar.io dynamic growth scale
 *   3. Authoritative PvP Combat (Player Eating Mechanics)
 *   4. Active Character Skills (Hyper Dash, Frost Nova, Coin Magnet, Aegis Shield, Smoke Bomb)
 *   5. Arena Mystery Skill Orbs (🎁) for free gacha drops
 *   6. Status effects (Frozen stun, Shield invulnerability, Magnet vacuum)
 */
export default function GameCanvas({
  roomId,
  currentPlayerId,
  players = [],
  coins = [],
  matchPhase = "waiting", // "waiting" | "countdown" | "playing" | "finished"
  countdownSeconds = 3,
  isCollectiblesActive = false,
  equippedSkills = { primary: SKILL_CATALOG.hyper_dash, secondary: SKILL_CATALOG.frost_emp },
  onEquipSkill,
  skillCooldowns = {},
  onSkillCooldownUpdate,
  activeSkillEffects = {},
  onActiveSkillUpdate,
}) {
  const canvasRef = useRef(null);

  // Keep latest props in refs to avoid stale closures inside animation loops
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

  const equippedSkillsRef = useRef(equippedSkills);
  useEffect(() => { equippedSkillsRef.current = equippedSkills; }, [equippedSkills]);

  const skillCooldownsRef = useRef(skillCooldowns);
  useEffect(() => { skillCooldownsRef.current = skillCooldowns; }, [skillCooldowns]);

  // Remote player state: { [playerId]: { x, y, targetX, targetY, lastUpdated, shieldActive, isFrozen, dashActive, magnetActive } }
  const remotePlayersRef = useRef({});

  // Visual Effects list: [ { id, type, x, y, radius, startTime, duration, color } ]
  const visualEffectsRef = useRef([]);

  // Mystery Skill Orbs on Arena floor (🎁)
  const mysteryOrbsRef = useRef(generateMysteryOrbs(5));

  // Local active status timers
  const localStatusRef = useRef({
    isFrozen: false,
    frozenUntil: 0,
    shieldActive: false,
    shieldUntil: 0,
    dashActive: false,
    dashUntil: 0,
    magnetActive: false,
    magnetUntil: 0,
    slowActive: false,
    slowUntil: 0,
  });

  // In-flight coin collection and elimination locks
  const pendingCoinsRef = useRef(new Set());
  const pendingEliminationsRef = useRef(new Set());

  // Realtime Broadcast channel ref
  const channelRef = useRef(null);

  // Throttling state for position broadcasts
  const lastBroadcastTimeRef = useRef(0);
  const lastSentPosRef = useRef({ x: -999, y: -999 });

  // Throttling state for authoritative database position updates
  const lastDbSyncTimeRef = useRef(0);

  // Last trail spawn time
  const lastTrailTimeRef = useRef(0);

  // Notification Banner (e.g. "🎁 Mystery Orb: Obtained Aegis Shield!")
  const [skillNotification, setSkillNotification] = useState(null);

  const showNotification = (text) => {
    setSkillNotification(text);
    setTimeout(() => {
      setSkillNotification((curr) => (curr === text ? null : curr));
    }, 2800);
  };

  // ── 1. Setup Supabase Realtime Broadcast Channel ────────────────────────────
  useEffect(() => {
    if (!roomId || !currentPlayerId) return;

    const channelName = `room:${roomId}`;
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false },
      },
    });

    channelRef.current = channel;

    // Movement broadcast
    channel.on("broadcast", { event: "move" }, (event) => {
      const payload = event?.payload;
      if (!payload || payload.type !== "move") return;

      const senderId = payload.playerId;
      if (!senderId || senderId === currentPlayerIdRef.current) return;

      const { x, y, timestamp, status } = payload;
      const currentRemotes = remotePlayersRef.current;
      const existing = currentRemotes[senderId];

      if (!existing) {
        currentRemotes[senderId] = {
          x: typeof x === "number" ? x : LOGICAL_WIDTH / 2,
          y: typeof y === "number" ? y : LOGICAL_HEIGHT / 2,
          targetX: typeof x === "number" ? x : LOGICAL_WIDTH / 2,
          targetY: typeof y === "number" ? y : LOGICAL_HEIGHT / 2,
          lastUpdated: timestamp || Date.now(),
          status: status || {},
        };
      } else {
        if (timestamp && existing.lastUpdated && timestamp < existing.lastUpdated) {
          return;
        }
        existing.targetX = typeof x === "number" ? x : existing.targetX;
        existing.targetY = typeof y === "number" ? y : existing.targetY;
        if (status) existing.status = status;
        if (timestamp) existing.lastUpdated = timestamp;
      }
    });

    // Skill Cast visual FX broadcast
    channel.on("broadcast", { event: "skill_cast" }, (event) => {
      const payload = event?.payload;
      if (!payload) return;

      const { skillId, x, y, timestamp } = payload;
      const skill = SKILL_CATALOG[skillId];
      if (!skill) return;

      visualEffectsRef.current.push({
        id: `fx-${Date.now()}-${Math.random()}`,
        type: skillId,
        x: Number(x),
        y: Number(y),
        radius: skill.radius || 200,
        startTime: timestamp || performance.now(),
        duration: skill.duration || 1.0,
        color: skill.themeColor,
      });
    });

    // Player Status Effect (Stun / Slow) broadcast
    channel.on("broadcast", { event: "status_effect" }, (event) => {
      const payload = event?.payload;
      if (!payload) return;

      const { targetId, effect, duration } = payload;
      if (targetId === currentPlayerIdRef.current) {
        const now = performance.now();
        // Check if local player is shielded
        if (localStatusRef.current.shieldActive) {
          console.log("[Status Effect] Blocked by Aegis Shield!");
          return;
        }

        if (effect === "frozen") {
          localStatusRef.current.isFrozen = true;
          localStatusRef.current.frozenUntil = now + duration * 1000;
          showNotification("❄️ YOU ARE FROZEN!");
        } else if (effect === "slowed") {
          localStatusRef.current.slowActive = true;
          localStatusRef.current.slowUntil = now + duration * 1000;
        }
      }
    });

    // Mystery Orb Collected broadcast
    channel.on("broadcast", { event: "orb_collected" }, (event) => {
      const payload = event?.payload;
      if (!payload) return;
      const { orbId } = payload;
      const targetOrb = mysteryOrbsRef.current.find((o) => o.id === orbId);
      if (targetOrb) {
        targetOrb.active = false;
        targetOrb.respawnAt = Date.now() + 14000;
      }
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log(`[GameCanvas] Broadcast channel subscribed: ${channelName}`);
      }
    });

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
      channelRef.current = null;
      remotePlayersRef.current = {};
      pendingCoinsRef.current.clear();
      pendingEliminationsRef.current.clear();
    };
  }, [roomId, currentPlayerId]);

  // ── 2. Skill Activation Trigger Helper ──────────────────────────────────────
  const triggerSkill = (skill) => {
    if (!skill || matchPhaseRef.current !== "playing") return;

    // Check cooldown
    const cdRemaining = skillCooldownsRef.current[skill.id] || 0;
    if (cdRemaining > 0) return;

    // Check if player is frozen
    if (localStatusRef.current.isFrozen) return;

    const now = performance.now();
    const currentMyId = currentPlayerIdRef.current;
    const currentChannel = channelRef.current;

    // Apply Cooldown
    if (onSkillCooldownUpdate) {
      onSkillCooldownUpdate(skill.id, skill.cooldown);
    }

    // Set Active duration
    if (onActiveSkillUpdate) {
      onActiveSkillUpdate(skill.id, skill.duration);
    }

    // 1. Hyper Dash
    if (skill.id === "hyper_dash") {
      localStatusRef.current.dashActive = true;
      localStatusRef.current.dashUntil = now + skill.duration * 1000;
    }

    // 2. Frost Nova (Freeze Shockwave)
    if (skill.id === "frost_emp") {
      const myPlayer = playersRef.current?.find((p) => p.id === currentMyId);
      const px = myPlayer?.x || LOGICAL_WIDTH / 2;
      const py = myPlayer?.y || LOGICAL_HEIGHT / 2;

      // Add local visual shockwave
      visualEffectsRef.current.push({
        id: `fx-${now}`,
        type: "frost_emp",
        x: px,
        y: py,
        radius: skill.radius,
        startTime: now,
        duration: skill.duration,
        color: skill.themeColor,
      });

      // Broadcast visual effect to peers
      if (currentChannel) {
        currentChannel.send({
          type: "broadcast",
          event: "skill_cast",
          payload: { skillId: "frost_emp", x: px, y: py, timestamp: now },
        });
      }

      // Check hits against remote players
      const remotes = remotePlayersRef.current;
      for (const [remoteId, remoteData] of Object.entries(remotes)) {
        const dist = Math.hypot(px - remoteData.x, py - remoteData.y);
        if (dist <= skill.radius) {
          // Stun remote player
          if (currentChannel) {
            currentChannel.send({
              type: "broadcast",
              event: "status_effect",
              payload: {
                targetId: remoteId,
                effect: "frozen",
                duration: skill.stunDuration,
                casterId: currentMyId,
              },
            });
          }
        }
      }
    }

    // 3. Coin Magnet
    if (skill.id === "coin_magnet") {
      localStatusRef.current.magnetActive = true;
      localStatusRef.current.magnetUntil = now + skill.duration * 1000;
    }

    // 4. Aegis Shield
    if (skill.id === "aegis_shield") {
      localStatusRef.current.shieldActive = true;
      localStatusRef.current.shieldUntil = now + skill.duration * 1000;
    }

    // 5. Smoke Bomb
    if (skill.id === "smoke_screen") {
      const myPlayer = playersRef.current?.find((p) => p.id === currentMyId);
      const px = myPlayer?.x || LOGICAL_WIDTH / 2;
      const py = myPlayer?.y || LOGICAL_HEIGHT / 2;

      visualEffectsRef.current.push({
        id: `fx-${now}`,
        type: "smoke_screen",
        x: px,
        y: py,
        radius: skill.radius,
        startTime: now,
        duration: skill.duration,
        color: skill.themeColor,
      });

      if (currentChannel) {
        currentChannel.send({
          type: "broadcast",
          event: "skill_cast",
          payload: { skillId: "smoke_screen", x: px, y: py, timestamp: now },
        });

        // Slow remote players in smoke radius
        const remotes = remotePlayersRef.current;
        for (const [remoteId, remoteData] of Object.entries(remotes)) {
          const dist = Math.hypot(px - remoteData.x, py - remoteData.y);
          if (dist <= skill.radius) {
            currentChannel.send({
              type: "broadcast",
              event: "status_effect",
              payload: {
                targetId: remoteId,
                effect: "slowed",
                duration: skill.duration,
                casterId: currentMyId,
              },
            });
          }
        }
      }
    }
  };

  // ── 3. Main Game Engine & Canvas Loop ───────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    // Local player position (in logical canvas coordinates 1200x750)
    const player = {
      x: LOGICAL_WIDTH / 2,
      y: LOGICAL_HEIGHT / 2,
    };

    // Keys currently held down
    const keys = {
      up: false,
      down: false,
      left: false,
      right: false,
    };

    function clampPlayer(pSize = BASE_PLAYER_SIZE) {
      const r = pSize / 2;
      const minX = ARENA_PADDING + r;
      const maxX = LOGICAL_WIDTH - ARENA_PADDING - r;
      const minY = ARENA_PADDING + r;
      const maxY = LOGICAL_HEIGHT - ARENA_PADDING - r;

      player.x = Math.max(minX, Math.min(maxX, player.x));
      player.y = Math.max(minY, Math.min(maxY, player.y));
    }

    // Initialize spawn position (preserving server position if available)
    const myId = currentPlayerIdRef.current;
    const myData = playersRef.current?.find((p) => p.id === myId);
    if (myData && typeof myData.x === "number" && myData.x > 0 && typeof myData.y === "number" && myData.y > 0) {
      player.x = Number(myData.x);
      player.y = Number(myData.y);
      clampPlayer(getPlayerDiameter(myData.score));
    } else {
      player.x = LOGICAL_WIDTH / 2;
      player.y = LOGICAL_HEIGHT / 2;
    }
    updatePlayerPosition(player.x, player.y).catch(() => {});

    // Input handlers
    const MOVEMENT_KEYS = new Set([
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
      "w", "a", "s", "d",
      "W", "A", "S", "D",
    ]);

    function handleKeyDown(e) {
      if (MOVEMENT_KEYS.has(e.key) || e.code === "Space") {
        e.preventDefault();
      }

      if (matchPhaseRef.current !== "playing") {
        keys.up = keys.down = keys.left = keys.right = false;
        return;
      }

      // Movement
      switch (e.key) {
        case "ArrowUp":    case "w": case "W": keys.up    = true; break;
        case "ArrowDown":  case "s": case "S": keys.down  = true; break;
        case "ArrowLeft":  case "a": case "A": keys.left  = true; break;
        case "ArrowRight": case "d": case "D": keys.right = true; break;
      }

      // Skill Hotkeys: Space (Primary), Q (Secondary), E/F/R
      if (e.code === "Space" || e.key === "1") {
        triggerSkill(equippedSkillsRef.current.primary);
      } else if (e.code === "KeyQ" || e.key === "2") {
        triggerSkill(equippedSkillsRef.current.secondary);
      } else if (e.code === "KeyE") {
        triggerSkill(SKILL_CATALOG.coin_magnet);
      } else if (e.code === "KeyF") {
        triggerSkill(SKILL_CATALOG.aegis_shield);
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

    function handleBlur() {
      keys.up = keys.down = keys.left = keys.right = false;
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup",   handleKeyUp);
    window.addEventListener("blur",    handleBlur);

    // ── Render Loop ───────────────────────────────────────────────────────────
    let lastTime = null;
    let rafId = null;

    function tick(timestamp) {
      const dt = lastTime === null ? 0 : Math.min((timestamp - lastTime) / 1000, 0.1);
      lastTime = timestamp;

      const currentPhase = matchPhaseRef.current;
      const currentPlayers = playersRef.current || [];
      const currentMyId = currentPlayerIdRef.current;
      const myPlayerObj = currentPlayers.find((p) => p.id === currentMyId);
      const myScore = myPlayerObj?.score ?? 0;
      const myDiameter = getPlayerDiameter(myScore);
      const myRadius = myDiameter / 2;

      const nowTime = performance.now();
      const status = localStatusRef.current;

      // Update status effect expiration timers
      if (status.isFrozen && nowTime >= status.frozenUntil) status.isFrozen = false;
      if (status.shieldActive && nowTime >= status.shieldUntil) status.shieldActive = false;
      if (status.dashActive && nowTime >= status.dashUntil) status.dashActive = false;
      if (status.magnetActive && nowTime >= status.magnetUntil) status.magnetActive = false;
      if (status.slowActive && nowTime >= status.slowUntil) status.slowActive = false;

      // Calculate effective movement speed
      let effectiveSpeed = PLAYER_SPEED;
      if (status.dashActive) effectiveSpeed *= SKILL_CATALOG.hyper_dash.speedMultiplier;
      if (status.slowActive) effectiveSpeed *= 0.4;
      if (status.isFrozen) effectiveSpeed = 0; // Stunned

      // 1. Move Local Player (Active only in playing phase)
      if (currentPhase === "playing" && !status.isFrozen) {
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

        if (dx !== 0 || dy !== 0) {
          player.x += dx * effectiveSpeed * dt;
          player.y += dy * effectiveSpeed * dt;
          clampPlayer(myDiameter);

          // Dash trail particles
          if (status.dashActive && timestamp - lastTrailTimeRef.current > 40) {
            visualEffectsRef.current.push({
              id: `trail-${timestamp}`,
              type: "dash_trail",
              x: player.x,
              y: player.y,
              radius: myRadius * 0.8,
              startTime: timestamp,
              duration: 0.35,
              color: "#38bdf8",
            });
            lastTrailTimeRef.current = timestamp;
          }
        }
      } else if (status.isFrozen || currentPhase !== "playing") {
        keys.up = keys.down = keys.left = keys.right = false;
      }

      const epochNow = Date.now();
      const currentChannel = channelRef.current;

      // 2. Broadcast Local Position & Active Status
      if (currentChannel && currentMyId && epochNow - lastBroadcastTimeRef.current >= BROADCAST_THROTTLE_MS) {
        const distMoved =
          Math.abs(player.x - lastSentPosRef.current.x) +
          Math.abs(player.y - lastSentPosRef.current.y);

        if (distMoved > 0.05 || status.shieldActive || status.isFrozen || status.dashActive) {
          currentChannel.send({
            type: "broadcast",
            event: "move",
            payload: {
              type: "move",
              playerId: currentMyId,
              x: Math.round(player.x * 10) / 10,
              y: Math.round(player.y * 10) / 10,
              timestamp: epochNow,
              status: {
                shieldActive: status.shieldActive,
                isFrozen: status.isFrozen,
                dashActive: status.dashActive,
                magnetActive: status.magnetActive,
              },
            },
          });
          lastBroadcastTimeRef.current = epochNow;
          lastSentPosRef.current = { x: player.x, y: player.y };
        }
      }

      // 3. Authoritative Database Position Sync (Throttled ~3.3 Hz, only during playing)
      if (currentMyId && epochNow - lastDbSyncTimeRef.current >= DB_AUTH_SYNC_MS && currentPhase === "playing") {
        lastDbSyncTimeRef.current = epochNow;
        updatePlayerPosition(player.x, player.y).then((res) => {
          if (res && !res.success && res.reason === "movement_exceeded") {
            player.x = Number(res.x);
            player.y = Number(res.y);
            clampPlayer(myDiameter);
          }
        });
      }

      // 4. Coin Magnet Field Logic: Pull coins toward local player
      const activeCoins = coinsRef.current || [];
      if (status.magnetActive && currentPhase === "playing") {
        const magRadius = SKILL_CATALOG.coin_magnet.radius;
        const pullSpeed = SKILL_CATALOG.coin_magnet.pullSpeed;

        for (let i = 0; i < activeCoins.length; i++) {
          const coin = activeCoins[i];
          if (!coin || !coin.active) continue;

          const cx = Number(coin.x);
          const cy = Number(coin.y);
          const dist = Math.hypot(player.x - cx, player.y - cy);

          if (dist > 0 && dist <= magRadius) {
            const pullDx = (player.x - cx) / dist;
            const pullDy = (player.y - cy) / dist;
            coin.x = cx + pullDx * pullSpeed * dt;
            coin.y = cy + pullDy * pullSpeed * dt;
          }
        }
      }

      // 5. Collision Detection with Active Coins
      if (isCollectiblesActiveRef.current && currentPhase === "playing") {
        const pendingSet = pendingCoinsRef.current;
        const currentCollectionRadius = myRadius + COIN_RADIUS;

        for (let i = 0; i < activeCoins.length; i++) {
          const coin = activeCoins[i];
          if (!coin || !coin.active) continue;
          if (pendingSet.has(coin.id)) continue;

          const distance = Math.hypot(player.x - Number(coin.x), player.y - Number(coin.y));

          if (distance <= currentCollectionRadius) {
            pendingSet.add(coin.id);
            coin.active = false; // Optimistic hide locally

            updatePlayerPosition(player.x, player.y)
              .then(() => collectCoin(coin.id, currentMyId))
              .then((result) => {
                if (!result || !result.success) {
                  coin.active = true; // Rollback
                }
              })
              .catch((err) => {
                console.error("[GameCanvas] Coin collection error:", err);
                coin.active = true; // Rollback
              })
              .finally(() => {
                pendingSet.delete(coin.id);
              });
          }
        }
      }

      // 6. Mystery Skill Orbs (🎁) Collision & Auto-Respawn
      const orbs = mysteryOrbsRef.current;
      for (const orb of orbs) {
        if (!orb.active && orb.respawnAt && epochNow >= orb.respawnAt) {
          orb.active = true;
          orb.x = Math.round(60 + Math.random() * 1080);
          orb.y = Math.round(60 + Math.random() * 630);
        }

        if (orb.active && currentPhase === "playing") {
          const dist = Math.hypot(player.x - orb.x, player.y - orb.y);
          if (dist <= myRadius + 18) {
            orb.active = false;
            orb.respawnAt = epochNow + 14000;

            // Broadcast orb pickup to peers
            if (currentChannel) {
              currentChannel.send({
                type: "broadcast",
                event: "orb_collected",
                payload: { orbId: orb.id },
              });
            }

            // Roll Mystery Skill
            const rolled = rollGachaSkill(equippedSkillsRef.current.primary?.id);
            if (onEquipSkill) {
              onEquipSkill("secondary", rolled);
            }
            showNotification(`🎁 Mystery Orb: Obtained ${rolled.name}!`);
          }
        }
      }

      // 7. PvP Combat: Player Eating Mechanics
      if (currentPhase === "playing") {
        const remotes = remotePlayersRef.current;
        const elimSet = pendingEliminationsRef.current;

        for (const [remoteId, remoteData] of Object.entries(remotes)) {
          if (elimSet.has(remoteId)) continue;

          // If remote player is shielded, they cannot be eaten
          if (remoteData.status?.shieldActive) continue;

          const remoteObj = currentPlayers.find((p) => p.id === remoteId);
          if (!remoteObj) continue;

          const remoteScore = remoteObj.score ?? 0;
          const remoteDiameter = getPlayerDiameter(remoteScore);
          const remoteRadius = remoteDiameter / 2;

          const distanceBetween = Math.hypot(player.x - remoteData.x, player.y - remoteData.y);

          // If local player is larger and collides with smaller player
          if (myScore > remoteScore && distanceBetween <= myRadius + remoteRadius * 0.7) {
            elimSet.add(remoteId);

            eliminatePlayer(remoteId)
              .then((res) => {
                if (res && res.success) {
                  showNotification(`⚔️ Eaten ${remoteObj.nickname}! (+${res.stolen_pts} pts)`);
                }
              })
              .finally(() => {
                setTimeout(() => elimSet.delete(remoteId), 1500);
              });
          }
        }
      }

      // 8. Clean canvas frame buffer (1200x750)
      ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

      const arenaW = LOGICAL_WIDTH - ARENA_PADDING * 2;
      const arenaH = LOGICAL_HEIGHT - ARENA_PADDING * 2;

      // Arena Floor
      ctx.fillStyle = "#18181b"; // zinc-900
      ctx.fillRect(ARENA_PADDING, ARENA_PADDING, arenaW, arenaH);

      // Arena Retro Pixel Grid
      ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let gx = ARENA_PADDING + gridSize; gx < ARENA_PADDING + arenaW; gx += gridSize) {
        ctx.beginPath();
        ctx.moveTo(gx, ARENA_PADDING);
        ctx.lineTo(gx, ARENA_PADDING + arenaH);
        ctx.stroke();
      }
      for (let gy = ARENA_PADDING + gridSize; gy < ARENA_PADDING + arenaH; gy += gridSize) {
        ctx.beginPath();
        ctx.moveTo(ARENA_PADDING, gy);
        ctx.lineTo(ARENA_PADDING + arenaW, gy);
        ctx.stroke();
      }

      // Arena Outer Border
      ctx.strokeStyle = "#52525b"; // zinc-600
      ctx.lineWidth = 4;
      ctx.strokeRect(ARENA_PADDING, ARENA_PADDING, arenaW, arenaH);

      // Corner accent markers
      ctx.fillStyle = "#f97316";
      const markerSize = 8;
      ctx.fillRect(ARENA_PADDING - 2, ARENA_PADDING - 2, markerSize, markerSize);
      ctx.fillRect(ARENA_PADDING + arenaW - markerSize + 2, ARENA_PADDING - 2, markerSize, markerSize);
      ctx.fillRect(ARENA_PADDING - 2, ARENA_PADDING + arenaH - markerSize + 2, markerSize, markerSize);
      ctx.fillRect(ARENA_PADDING + arenaW - markerSize + 2, ARENA_PADDING + arenaH - markerSize + 2, markerSize, markerSize);

      // 9. Draw Active Coins (Gold Collectibles)
      for (let i = 0; i < activeCoins.length; i++) {
        const coin = activeCoins[i];
        if (coin && coin.active) {
          drawCoin(ctx, Number(coin.x), Number(coin.y), COIN_RADIUS);
        }
      }

      // 10. Draw Mystery Skill Orbs (🎁)
      for (const orb of mysteryOrbsRef.current) {
        drawMysteryOrb(ctx, orb, timestamp);
      }

      // 11. Draw Active Visual FX (Shockwaves, Dash Trails, Smoke Clouds)
      drawSkillEffects(ctx, visualEffectsRef.current, timestamp);
      // Clean expired FX
      visualEffectsRef.current = visualEffectsRef.current.filter(
        (fx) => (timestamp - fx.startTime) / 1000 < fx.duration
      );

      // 12. Find Leader
      const highestScore = currentPlayers.reduce((max, p) => Math.max(max, p.score ?? 0), 0);
      const remotePlayerIds = currentPlayers
        .map((p) => p.id)
        .filter((id) => id !== currentMyId);

      // 13. Draw Remote Players
      const remotes = remotePlayersRef.current;
      for (const [remoteId, remoteData] of Object.entries(remotes)) {
        remoteData.x += (remoteData.targetX - remoteData.x) * 0.25;
        remoteData.y += (remoteData.targetY - remoteData.y) * 0.25;

        const colorIndex = Math.max(0, remotePlayerIds.indexOf(remoteId)) % REMOTE_PLAYER_COLORS.length;
        const color = REMOTE_PLAYER_COLORS[colorIndex];
        const remoteObj = currentPlayers.find((p) => p.id === remoteId);
        const remoteScore = remoteObj?.score ?? 0;
        const remoteSize = getPlayerDiameter(remoteScore);
        const isLeader = remoteScore === highestScore && highestScore > 0;

        drawPlayer(ctx, remoteData.x, remoteData.y, remoteSize, {
          bodyColor: color.body,
          strokeColor: color.stroke,
          nickname: remoteObj?.nickname || "Player",
          score: remoteScore,
          isLeader,
        });

        // Draw Remote Player Status Aura (Shield, Stun, Magnet)
        drawPlayerStatusAura(
          ctx,
          { x: remoteData.x, y: remoteData.y, size: remoteSize },
          remoteData.status || {},
          timestamp
        );
      }

      // 14. Draw Local Player
      const isMyLeader = myScore === highestScore && highestScore > 0;
      drawPlayer(ctx, player.x, player.y, myDiameter, {
        bodyColor: "#f97316",
        strokeColor: "#c2410c",
        nickname: `${myPlayerObj?.nickname || "You"} (You)`,
        score: myScore,
        isLeader: isMyLeader,
      });

      // Draw Local Player Status Aura
      drawPlayerStatusAura(
        ctx,
        { x: player.x, y: player.y, size: myDiameter },
        status,
        timestamp
      );

      // 15. Waiting Phase Overlay
      if (currentPhase === "waiting") {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx.fillRect(ARENA_PADDING, ARENA_PADDING, arenaW, arenaH);

        ctx.font = "bold 20px monospace, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#e4e4e7";
        ctx.shadowColor = "#000000";
        ctx.shadowBlur = 10;
        ctx.fillText("WAITING FOR HOST TO START MATCH (5 MINS)", LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2);
        ctx.restore();
      }

      // 16. Countdown Visual Overlay
      if (currentPhase === "countdown") {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(ARENA_PADDING, ARENA_PADDING, arenaW, arenaH);

        ctx.font = "bold 96px monospace, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#facc15";
        ctx.shadowColor = "#000000";
        ctx.shadowBlur = 24;

        const count = countdownSecondsRef.current;
        const text = count > 0 ? String(count) : "GO!";
        ctx.fillText(text, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2);

        ctx.font = "bold 22px monospace, sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.shadowBlur = 6;
        ctx.fillText("GET READY — BATTLE ROYALE", LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 - 80);
        ctx.restore();
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup",   handleKeyUp);
      window.removeEventListener("blur",    handleBlur);
    };
  }, []);

  return (
    <div className="relative w-full h-full flex items-center justify-center p-2 bg-zinc-950">
      <canvas
        ref={canvasRef}
        width={LOGICAL_WIDTH}
        height={LOGICAL_HEIGHT}
        className="w-full h-auto max-w-[1200px] aspect-[1200/750] object-contain rounded-xl outline-none shadow-2xl border border-zinc-800/80 bg-zinc-900"
        tabIndex={0}
        aria-label="Expanded Game arena"
      />

      {/* Dynamic In-Arena Notification Toast */}
      {skillNotification && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-30 px-5 py-2.5 bg-zinc-950/90 border-2 border-amber-400 rounded-full text-amber-300 font-mono font-bold text-xs shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          {skillNotification}
        </div>
      )}
    </div>
  );
}
