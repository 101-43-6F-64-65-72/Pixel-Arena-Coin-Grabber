# Roadmap: Pixel Arena: Coin Grabber

## Phase 1: Project setup, basic UI layout, and arena foundation.
- [x] Initialize Next.js App Router project with Tailwind CSS.
- [x] Create project documentation (`README.md`, `GAME_DESIGN.md`, `ARCHITECTURE.md`, `AGENTS.md`, `TODO.md`, `CHANGELOG.md`).
- [ ] Define folder structure (components, lib, etc.).
- [ ] Create basic empty UI layout for main menu and arena.

## Phase 2: Single-player movement.
- [x] Implement local HTML5 Canvas/DOM rendering for the arena.
- [x] Implement local player entity.
- [x] Implement keyboard controls for moving the local player.
- [x] Prevent player from moving outside the arena boundaries.

## Phase 3: Supabase integration and room management.
- [ ] Set up Supabase project and configuration variables.
- [ ] Create PostgreSQL tables (Rooms, Players).
- [ ] Implement Main Menu UI.
- [ ] Implement "Create Room" functionality.
- [ ] Implement "Join Room" functionality.
- [ ] Implement Lobby UI showing connected players (using Supabase Presence).

## Phase 4: Realtime multiplayer synchronization.
- [ ] Connect local player movement to Supabase Broadcast.
- [ ] Listen to Supabase Broadcast to update remote player positions in the arena.
- [ ] Ensure smooth movement and handle disconnects.

## Phase 5: Coin synchronization, scoring, timer, and leaderboard.
- [ ] Create PostgreSQL table (Coins, Scores).
- [ ] Implement server/database logic for coin spawning.
- [ ] Implement client-side collision detection with coins.
- [ ] Implement secure coin collection via PostgreSQL.
- [ ] Listen to database changes for coin despawns and score updates.
- [ ] Implement match timer.
- [ ] Implement Game Over state and Leaderboard display.

## Phase 6: UI polish, debugging, and testing.
- [ ] Polish UI (Main Menu, Lobby, HUD, Leaderboard).
- [ ] Perform comprehensive multiplayer testing with multiple browser sessions.
- [ ] Fix synchronization bugs or edge cases.

## Phase 7: Vercel deployment.
- [ ] Deploy project to Vercel.
- [ ] Configure environment variables in Vercel.
- [ ] Verify live functionality.
