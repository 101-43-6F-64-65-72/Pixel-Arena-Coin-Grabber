# Architecture: Pixel Arena: Coin Grabber

## Overall Architecture
The game follows a thin-client, serverless architecture using Next.js for the frontend and Supabase for backend services (Database and Realtime). It is designed to be lightweight, avoiding heavy game engines, and utilizing HTML5 Canvas/React for rendering.

## Responsibilities

### Next.js Responsibilities
- Serve the application routes and static assets.
- Provide the structural framework (App Router).
- Manage UI components and application configuration.

### Client Responsibilities
- Capture keyboard input for local player movement.
- Render the 2D arena and game entities via HTML5 Canvas or lightweight DOM elements.
- Manage local UI state and game loop/animations.
- Send and receive data via the Supabase Client.

### Supabase Responsibilities
- Provide Realtime channels for high-frequency multiplayer synchronization.
- Persist authoritative game state via PostgreSQL.
- Broadcast database changes to connected clients.

## Supabase Realtime Architecture

### Presence Strategy
- **Usage:** Detecting players currently present in a room, join/leave awareness, and lightweight presence information.
- **Why:** To show who is in the lobby and ensure we know if a player disconnects unexpectedly.

### Broadcast Strategy
- **Usage:** Frequently changing player position, player direction, and lightweight realtime gameplay events.
- **Why Player Position is NOT Stored in PostgreSQL:** Player positions change continuously (every frame or tick). Writing this to a PostgreSQL database continuously would cause immense load, latency, and unnecessary storage usage. Broadcast channels send transient data directly between clients with low latency.

### Database Strategy (PostgreSQL)
- **Usage:** Persistent or authoritative game state.
- **Entities:** Rooms, Players, Coins, Scores, Match status, Match timestamps.
- **Why:** Crucial game data that must be agreed upon by all players (like who collected a coin first or the final score) must be handled by an authoritative database to prevent conflicts and cheating.

### Database Changes
- **Usage:** Clients listen for changes to the database to receive updates on important state changes such as score changes, coin spawns/despawns, and room state changes.

## Network Data Flow

`Client -> Supabase Client -> Supabase Realtime / PostgreSQL`

- Local input is processed on the Client.
- The Client uses the Supabase Client to emit movement via Broadcast.
- The Client uses the Supabase Client to attempt coin collection via PostgreSQL.
- PostgreSQL updates the coin state and scores, then triggers a Database Change event back to the Clients.

## Planned Database Entities
1. **Rooms**: Stores room code, match state (waiting, playing, finished), and timer info.
2. **Players**: Stores player session info and score tied to a room.
3. **Coins**: Stores coin ID, position (x,y), value, room ID, and status (active, collected).

## Security Considerations
- Keep Supabase credentials (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) in environment variables.
- Never hard-code or expose the Supabase service-role key in the client.
- Rely on database constraints (if applicable later) to prevent duplicate coin collection.

## Performance Considerations
- Limit broadcast frequency for movement (e.g., using a fixed tick rate) rather than sending every frame.
- Keep the DOM/Canvas rendering simple.
- Clean up Realtime listeners when a player leaves a room or a component unmounts to prevent memory leaks.

## Realtime Risks
- Network latency may cause slight desynchronization in movement.
- Race conditions during coin collection are mitigated by relying on the PostgreSQL database as the single source of truth for successful collection.
