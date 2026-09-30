# Changelog: Pixel Arena: Coin Grabber

## [Unreleased]
### Added
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
