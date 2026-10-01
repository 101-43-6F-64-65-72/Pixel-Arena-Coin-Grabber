# Changelog: Pixel Arena: Coin Grabber

## [Unreleased]
### Added
- Phase 10: Deterministic Player Color Identity with `players.color_key` (`orange`, `purple`, `blue`, `green`) assigned atomically during `create_room_safe` and `join_room_safe` with advisory lock serialization.
- Phase 10: 2000x1200 Large World and 2D smooth camera tracking (`src/game/camera.js`) with viewport culling, boundary clamping, and mini-radar map.
- Phase 10: Authoritative Basic Attack (`attack_player_safe` RPC) dealing 20 HP melee damage within 90px range with shield absorption and kill/death tracking.
- Phase 10: Three Server-Validated Skills: ⚡ Dash (`use_dash_safe`), 🛡️ Shield (`use_shield_safe`), 💥 Shockwave (`use_shockwave_safe`) with server-enforced cooldowns and radii.
- Phase 10: Authoritative HP, Death & Respawn System (`respawn_player_safe` RPC) with 3s respawn countdown, ghost avatar state, and 1.5s spawn shield.
- Phase 10: Continuous / Infinite Coin replenishment with instant location recycling within world bounds.
- Phase 10: Combat Visual FX (`src/game/drawCombat.js`): melee slashes, floating damage numbers, shockwave expansion rings, and hit notifications.
- Phase 10: Upgraded Arena HUD in `Lobby.js`: live health bar, Kills/Deaths counters, skill cooldown buttons, and color-coded leaderboard.
- Phase 10: Migration file `supabase/migrations/20261001150000_phase10_combat_skills_world.sql`.
- Phase 11: Character Active Skills System (`src/lib/skills.js`) with 5 unique skills: ⚡ Hyper Dash, ❄️ Frost Nova (Disrupt/Stun), 🧲 Coin Vortex (Magnet), 🛡️ Aegis Shield (Invincibility), and 💨 Smoke Bomb (Disrupt/Slow).
- Phase 11: Skill Gacha System (`src/components/SkillBar.js`) allowing players to spin the Gacha Wheel (Cost: 2 Coins) with animated reels, rarity tiers (Common 🔹, Rare 🟣, Legendary 🌟), and slot customization (Slot 1 [SPACE], Slot 2 [Q]).
- Phase 11: In-Arena Mystery Skill Orbs (🎁) with radiant particle rotation and automatic random skill drops upon collection.
- Phase 11: Interactive Skill Dock HUD with dynamic cooldown countdowns, active glowing aura rings, and mobile touch support.
- Phase 11: Realtime multiplayer skill synchronization broadcasting shockwaves, dash trails, frozen ice cages, and shield barriers across peer browsers via Supabase Realtime Broadcast.
- Phase 10: Worms Zone / Agar.io dynamic player scaling — players expand in radius and diameter based on collected score (`diameter = 32 + sqrt(score)*4.2`).
- Phase 10: Authoritative PvP combat and player eating — larger players can eliminate smaller players on contact via `eliminate_player_safe` RPC, stealing 50% score and respawning victim.
- Phase 10: Arena expansion to 1200x750 high-resolution logical coordinates with fixed aspect ratio and retro neon grid floor.
- Phase 10: High-density coin system with 45 active coins and continuous automatic coin respawn throughout the match.
- Phase 10: Match timer extended to 5 minutes (300s match time + 3s countdown = 303s authoritative cycle).
- Phase 10: Live Realtime In-Game Leaderboard with dynamic ranks, golden crown (#1 👑), silver (#2 🥈), bronze (#3 🥉) badges, and real-time score updates.
- Phase 10: Directional eyes, glowing leader aura, floating score tag, and crown accessory rendered dynamically in `drawPlayer.js`.
- Phase 10: Resilient guest account fallback in `auth.js` if Supabase Anonymous Auth is disabled in project dashboard.
- Phase 10: Migration file `supabase/migrations/20261001140000_pvp_growth_expanded_arena.sql`.
- Phase 9: Strict phase-based input locking across waiting, countdown, playing, and finished states in `GameCanvas.js`.
- Phase 9: Optimistic coin collection rollback restoring active coin visibility when server rejects collection.
- Phase 9: Server position preservation on player reconnect/refresh preventing sudden snap to canvas center.
- Phase 9: Authoritative final score reconciliation re-fetching room player scores upon match finish.
- Phase 9: Polish countdown overlay (large glowing typography) and subtle waiting-in-lobby arena watermarks.
- Phase 9: Window blur / tab focus safety resetting active movement keys to prevent stuck keys across tab switches.
- Phase 8: Authoritative player position tracking on `players` (`x`, `y`, `position_updated_at`) with non-negative constraints.
- Phase 8: Server-side movement validation RPC `update_player_position_safe(x, y)` validating delta displacement against `PLAYER_SPEED` (200 px/s) + burst jitter buffer.
- Phase 8: Server-side distance validation in `collect_coin_safe(coin_id)` preventing distant or arbitrary coin collection.
- Phase 8: Authoritative movement sync helper (`src/lib/movement.js`) with client prediction and automatic reconciliation on server rejection.
- Phase 8: Dual-transport movement architecture: Realtime Broadcast (~20 Hz) for smooth peer visual interpolation + throttled database sync (~3.3 Hz) for authoritative gameplay verification.
- Phase 8: Migration file `supabase/migrations/20261001130000_phase8_authoritative_gameplay.sql`.
- Phase 7: Supabase Anonymous Authentication integration (`src/lib/auth.js`) for automatic session creation and verified player identity.
- Phase 7: `players.user_id` column referencing `auth.users(id)` and partial unique index (`idx_players_room_user`) preventing duplicate room entries.
- Phase 7: Hardened `create_room_safe(nickname)` RPC binding host player to `auth.uid()`.
- Phase 7: Hardened `join_room_safe(code, nickname)` RPC enforcing `auth.uid()` identity assignment with idempotent reconnect.
- Phase 7: Hardened `leave_room_safe(player_id)` verifying caller owns the targeted player row via `auth.uid()`.
- Phase 7: Hardened `start_match_safe(room_id)` verifying host ownership via `auth.uid()`.
- Phase 7: Hardened `collect_coin_safe(coin_id)` deriving player identity authoritatively from `auth.uid()`.
- Phase 7: Hardened `finish_match_safe(room_id)` verifying room membership via `auth.uid()`.
- Phase 7: Migration file `supabase/migrations/20261001120000_phase7_auth_identity.sql`.
- Phase 6: PostgreSQL RPC `start_match_safe(room_id, player_id)` for host-authorized atomic transition from waiting to playing with authoritative `started_at` timestamp.
- Phase 6: PostgreSQL RPC `finish_match_safe(room_id)` for server-side verified transition to finished once match duration (63s) elapses.
- Phase 6: Lifecycle enforcement in `collect_coin_safe` rejecting coin collection during pre-match countdown (first 3s) or after match expiration.
- Phase 6: Match lifecycle state calculation engine (`src/lib/match.js`) providing deterministic countdown and 60-second match timer synchronization.
- Phase 6: Interactive 3-2-1 countdown overlay and live match timer HUD in `GameCanvas.js` and `Lobby.js`.
- Phase 6: Dedicated `GameOver.js` results view displaying final player scores, winner badges, and tie support.
- Phase 6: Migration file `supabase/migrations/20261001113000_phase6_match_lifecycle.sql`.
- Phase 5: PostgreSQL RPC `ensure_room_coins(room_id, count)` for idempotent room coin initialization with bounds validation.
- Phase 5: PostgreSQL RPC `collect_coin_safe(coin_id, player_id)` for atomic coin deactivation, room validation, row locking (`FOR UPDATE`), and score increment.
- Phase 5: Supabase Realtime publication enabled on `coins` table with `REPLICA IDENTITY FULL`.
- Phase 5: Client coin operations library (`src/lib/coins.js`) for fetching, ensuring, and collecting coins.
- Phase 5: Canvas coin rendering (`src/game/drawCoin.js`) with distinctive golden visual design.
- Phase 5: Local collision detection with in-flight pending locks to prevent frame-spamming collection requests.
- Phase 5: Live HUD displaying active coins and real-time player scores.
- Phase 5: Migration file `supabase/migrations/20261001110000_phase5_coins_collection.sql`.
- Phase 4: Realtime player movement synchronization using Supabase Realtime Broadcast channel (`room:<roomId>`).
- Phase 4: Position update throttling (~20 Hz / 50ms interval) for local movement broadcasts.
- Phase 4: Target position linear interpolation (`renderX += (targetX - renderX) * 0.2`) for smooth remote player movement without snapping/jitter.
- Phase 4: Distinct color assignment and nickname label rendering for remote players in `drawPlayer.js`.
- Phase 4: Player disconnect/leave cleanup pruning stale remote player instances from the canvas.
- Phase 2.1: `join_room_safe(code, nickname)` PostgreSQL RPC — atomic join with advisory lock, capacity guard (max 4), and status validation.
- Phase 2.1: `leave_room_safe(player_id)` PostgreSQL RPC (SECURITY DEFINER) — secure player deletion, host transfer, and empty-room cleanup.
- Phase 2.1: Migration `supabase/migrations/20261001102800_phase2_1_hardening.sql`.
- Database: Created `rooms`, `players`, and `coins` tables with foreign keys and CASCADE delete behavior.
- Database: Added data constraints (`chk_rooms_status`, `chk_players_nickname`, `chk_players_score`, `chk_coins_coords`).
- Database: Enabled Row Level Security (RLS) on `rooms`, `players`, and `coins` with least-privilege policies.
- Database: Created performance indexes on room code, player room IDs, and coin room IDs/active status.
- Database: Added migration file `supabase/migrations/20261001094500_create_game_schema.sql`.
- Phase 3: Granular Realtime state synchronization — zero re-fetch per event (INSERT appends, DELETE filters, UPDATE patches).
- Phase 3: Multi-table subscription binding (`players` + `rooms`) for live host-transfer and room status tracking.
- Phase 3: Post-subscription reconciliation fetch to eliminate initial join race window.
- Phase 3: Home screen with Create Room / Join Room navigation (`src/components/HomeScreen.js`).
- Phase 3: Create Room form with nickname validation (`src/components/CreateRoom.js`).
- Phase 3: Join Room form with nickname and room-code validation (`src/components/JoinRoom.js`).
- Phase 3: Lobby UI with player list, host indicator, player count, and Leave Room (`src/components/Lobby.js`).
- Phase 3: Room operations library — createRoom, joinRoom, getRoomWithPlayers, leaveRoom (`src/lib/rooms.js`).
- Phase 3: Session management using sessionStorage (`src/lib/session.js`).
- Phase 3: Lobby page at `/lobby/[roomId]` with Supabase Realtime Postgres Changes subscription (`src/app/lobby/[roomId]/page.js`).
- Phase 3: RLS UPDATE policy on `rooms` (waiting rooms only) and DELETE policy on `players`.
- Phase 3: Supabase Realtime publication enabled for `players` and `rooms` tables.
- Phase 2: HTML5 Canvas arena rendering with dark pixel-art aesthetic.
- Phase 2: Local player entity (orange circle avatar) with Canvas drawing helper (`src/game/drawPlayer.js`).
- Phase 2: Keyboard input for WASD and Arrow keys (`src/components/GameCanvas.js`).
- Phase 2: Frame-rate-independent movement via delta time.
- Phase 2: Diagonal movement with speed normalisation (no faster than cardinal directions).
- Phase 2: Arena boundary collision — player body cannot leave the arena.
- Phase 2: Responsive Canvas sizing with `ResizeObserver` and `devicePixelRatio` handling.
- Phase 2: Keyboard listener cleanup on component unmount to prevent memory leaks.
- Phase 2: Minimal game shell page (`src/app/page.js`) replacing the Next.js boilerplate.

## [0.1.0] — 2026-09-30
### Added
- Initial Next.js (App Router) project foundation using Tailwind CSS.

### Changed
- None

### Fixed
- None
