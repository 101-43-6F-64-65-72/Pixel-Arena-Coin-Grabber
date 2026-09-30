# Pixel Arena: Coin Grabber

## Short Description
A lightweight 2D top-down multiplayer browser game for 2–4 players. Players enter the same arena, move around, and compete to collect randomly placed coins within a time limit.

## Purpose of the Project
This project is intended for a short practical training session with beginner-level developers. It is built to run smoothly on school laptops with varied specifications. The implementation is deliberately kept simple, readable, and lightweight, making it easy to explain and understand.

## Technology Stack
- Next.js (App Router)
- JavaScript
- Tailwind CSS
- Supabase (PostgreSQL, Realtime, Presence, Broadcast)
- Git & GitHub
- Vercel

## Basic Development Requirements
- Node.js (v18+)
- npm or pnpm
- Git

## Local Development Setup
1. Clone the repository.
2. Run `npm install` to install dependencies.
3. Copy `.env.example` to `.env.local` and fill in your Supabase credentials.
4. Run `npm run dev` to start the local development server.
5. Open `http://localhost:3000` in your browser.

## Environment Variable Requirements
The project requires the following environment variables in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Planned Multiplayer Architecture
The game uses a hybrid approach for multiplayer synchronization:
- **Supabase Presence:** Detects players joining or leaving a room.
- **Supabase Broadcast:** Synchronizes high-frequency data like player movement and realtime gameplay events without overwhelming the database.
- **PostgreSQL Database:** Stores authoritative game state, such as rooms, players, coins, scores, and match status.

## Development Status
**Implemented:**
- Project foundation and Next.js structure
- Core technical documentation

**Planned / Not Implemented:**
- Gameplay loop (Player movement, coin collection)
- UI and Canvas rendering
- Supabase integration and multiplayer sync
- Match timer and leaderboard
