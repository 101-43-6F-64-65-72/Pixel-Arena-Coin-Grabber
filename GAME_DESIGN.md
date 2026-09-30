# Game Design: Pixel Arena: Coin Grabber

## Game Concept
Pixel Arena: Coin Grabber is a fast-paced, 2D top-down multiplayer arcade game. Players compete in a single shared arena to collect coins that spawn randomly. The player with the highest score when the timer runs out wins the match.

## Target Audience
The game is targeted at SMK (Vocational High School) students. It is designed to be accessible on school laptops with varied specifications, focusing on fun, competitive gameplay over complex graphics. 

## Core Gameplay Loop
1. Join/Create a room.
2. Wait for players (2-4 players).
3. The match starts with a countdown timer.
4. Players move around the arena to collect randomly spawned coins.
5. Collecting a coin increases the player's score.
6. When the timer reaches zero, the match ends.
7. The leaderboard is displayed showing the winner.

## Player Experience
- **Main Menu**: Simple interface to either Create a new room or Join an existing room via a code.
- **Create Room**: Generates a unique room code.
- **Join Room**: Requires entering a valid room code.
- **Lobby**: Displays players currently in the room before the game starts.
- **Arena**: A 2D top-down view where players control their avatars.
- **Coin Collection**: Players collide with coins to collect them, instantly updating the score.
- **Score**: Displayed in the HUD for all players.
- **Timer**: A shared countdown timer displayed in the HUD.
- **Game Over / Leaderboard**: Displays the final rankings and allows players to return to the lobby or main menu.

## MVP Definition
The Minimum Viable Product (MVP) is complete ONLY when two separate browser sessions can:
- Enter the same room.
- See each other moving in realtime.
- Collect the same coins without duplicate scoring.
- Synchronize scores correctly.
- Finish the timed match.
- Display the same end-game result.

## Optional Features (Post-MVP)
- Character customization/colors.
- Different coin values or power-ups.
- Obstacles in the arena.
- Sound effects and background music.

## Non-Goals
- Complex combat or weapon systems.
- Advanced graphics or 3D rendering.
- Complex user authentication or accounts.
- AI-controlled bots.
- Persistent player progression across multiple sessions.
