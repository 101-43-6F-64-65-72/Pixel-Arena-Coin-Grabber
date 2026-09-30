# Agent Instructions for Pixel Arena: Coin Grabber

This file contains rules and guidelines for AI coding agents working on this project.

## Core Rules
- **Read Documentation First**: Always read `README.md`, `GAME_DESIGN.md`, `ARCHITECTURE.md`, `TODO.md`, and `CHANGELOG.md` before making any code changes.
- **Sequential Development**: Work on exactly one development phase at a time as outlined in `TODO.md`. Do not silently expand the project scope.
- **Scope Containment**: Do not modify unrelated files.
- **Dependencies**: Do not introduce new dependencies (libraries, packages) without explicit justification and approval.
- **Security**: 
  - Never expose secrets.
  - Keep Supabase credentials in environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
  - Never put service-role credentials in client code.
- **Testing**: Test multiplayer behavior using at least two browser sessions before marking a feature as complete. Do not claim successful functionality that was not actually tested.
- **Resource Management**: Always clean up Supabase Realtime listeners when leaving a room or unmounting components to prevent memory leaks and unexpected behavior.
- **Reporting**:
  - Report changed files clearly after implementation.
  - Report errors and unresolved issues honestly; do not hide them.
- **Approval**: The Product Owner has final approval over significant architectural or feature decisions. Do not proceed to the next development phase without explicit approval.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
