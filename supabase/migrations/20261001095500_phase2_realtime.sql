-- Migration: Phase 2 Realtime — enable supabase_realtime publication for lobby tables
-- Project: Pixel Arena: Coin Grabber
-- Phase 2 Room/Lobby Foundation

-- Enable Supabase Realtime Postgres Changes for lobby-relevant tables.
-- players: required for lobby player list updates (join/leave events).
-- rooms:   required for room state changes (host transfer, status updates).
-- coins:   will be added in Phase 5 when coin synchronization is implemented.
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
