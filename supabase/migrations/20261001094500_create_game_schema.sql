-- Migration: Create initial game schema (rooms, players, coins) with RLS
-- Project: Pixel Arena: Coin Grabber
-- Phase 1 Database Foundation

-- 1. Create rooms table
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'waiting',
    host_id UUID NULL,
    started_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_rooms_status CHECK (status IN ('waiting', 'playing', 'finished')),
    CONSTRAINT chk_rooms_code_not_empty CHECK (char_length(trim(code)) > 0)
);

-- 2. Create players table
CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    nickname TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_players_nickname CHECK (char_length(trim(nickname)) > 0 AND char_length(nickname) <= 30),
    CONSTRAINT chk_players_score CHECK (score >= 0)
);

-- 3. Add foreign key for rooms.host_id referencing players(id)
-- Handled carefully with ON DELETE SET NULL and DEFERRABLE INITIALLY DEFERRED
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_rooms_host'
    ) THEN
        ALTER TABLE rooms
        ADD CONSTRAINT fk_rooms_host
        FOREIGN KEY (host_id)
        REFERENCES players(id)
        ON DELETE SET NULL
        DEFERRABLE INITIALLY DEFERRED;
    END IF;
END $$;

-- 4. Create coins table
CREATE TABLE IF NOT EXISTS coins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    x NUMERIC NOT NULL,
    y NUMERIC NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT chk_coins_coords CHECK (x >= 0 AND y >= 0)
);

-- 5. Create Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id);
CREATE INDEX IF NOT EXISTS idx_coins_room_id ON coins(room_id);
CREATE INDEX IF NOT EXISTS idx_coins_room_active ON coins(room_id, active);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE coins ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies (Principle of Least Privilege)

-- Rooms Policies
CREATE POLICY "allow_read_rooms"
    ON rooms
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "allow_insert_waiting_rooms"
    ON rooms
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (status = 'waiting');

-- Players Policies
CREATE POLICY "allow_read_players"
    ON players
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "allow_insert_players"
    ON players
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (score = 0);

-- Coins Policies
CREATE POLICY "allow_read_coins"
    ON coins
    FOR SELECT
    TO anon, authenticated
    USING (true);
