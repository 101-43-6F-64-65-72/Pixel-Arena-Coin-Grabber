-- Migration: Phase 10 — Combat, Skills, Stable Player Colors, Infinite Coins, Large World & Respawn
-- Project: Pixel Arena / RoyalWar

-- 1. Add authoritative combat, status, and color fields to players table
ALTER TABLE players
ADD COLUMN IF NOT EXISTS color_key TEXT NOT NULL DEFAULT 'orange' CHECK (color_key IN ('orange', 'purple', 'blue', 'green')),
ADD COLUMN IF NOT EXISTS hp INTEGER NOT NULL DEFAULT 100 CHECK (hp >= 0 AND hp <= 100),
ADD COLUMN IF NOT EXISTS max_hp INTEGER NOT NULL DEFAULT 100 CHECK (max_hp > 0),
ADD COLUMN IF NOT EXISTS alive BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS respawn_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS attack_cooldown_until TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS shield_until TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS dash_cooldown_until TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS shield_cooldown_until TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS shockwave_cooldown_until TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS kills INTEGER NOT NULL DEFAULT 0 CHECK (kills >= 0),
ADD COLUMN IF NOT EXISTS deaths INTEGER NOT NULL DEFAULT 0 CHECK (deaths >= 0);

-- 2. Hardened create_room_safe with deterministic host color ('orange') and world spawn (1000, 600)
CREATE OR REPLACE FUNCTION public.create_room_safe(
    p_nickname TEXT
)
RETURNS TABLE (
    room_id   UUID,
    room_code TEXT,
    player_id UUID,
    nickname  TEXT,
    user_id   UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id   UUID;
    v_code      TEXT;
    v_room      rooms%ROWTYPE;
    v_player    players%ROWTYPE;
    v_chars     TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    v_attempt   INTEGER;
    v_i         INTEGER;
BEGIN
    p_nickname := trim(p_nickname);
    IF char_length(p_nickname) = 0 THEN
        RAISE EXCEPTION 'Nickname is required.' USING ERRCODE = 'P0001';
    END IF;
    IF char_length(p_nickname) > 30 THEN
        RAISE EXCEPTION 'Nickname is too long (max 30 characters).' USING ERRCODE = 'P0001';
    END IF;

    v_user_id := auth.uid();

    FOR v_attempt IN 1..5 LOOP
        v_code := '';
        FOR v_i IN 1..6 LOOP
            v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::integer, 1);
        END LOOP;

        BEGIN
            INSERT INTO rooms (code, status)
            VALUES (v_code, 'waiting')
            RETURNING * INTO v_room;
            EXIT;
        EXCEPTION WHEN unique_violation THEN
            IF v_attempt = 5 THEN
                RAISE EXCEPTION 'Could not generate unique room code. Please try again.' USING ERRCODE = 'P0002';
            END IF;
        END;
    END LOOP;

    -- Host always gets 'orange' color and center-left spawn
    INSERT INTO players (room_id, nickname, score, user_id, color_key, hp, max_hp, alive, x, y, kills, deaths)
    VALUES (v_room.id, p_nickname, 0, v_user_id, 'orange', 100, 100, true, 400, 300, 0, 0)
    RETURNING * INTO v_player;

    UPDATE rooms r
    SET host_id = v_player.id
    WHERE r.id = v_room.id;

    RETURN QUERY
    SELECT v_room.id, v_room.code, v_player.id, v_player.nickname, v_player.user_id;
    RETURN;
END;
$$;

-- 3. Hardened join_room_safe with deterministic, race-safe color allocation
CREATE OR REPLACE FUNCTION public.join_room_safe(
    p_code     TEXT,
    p_nickname TEXT
)
RETURNS SETOF players
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id       UUID;
    v_room          rooms%ROWTYPE;
    v_count         INTEGER;
    v_player        players%ROWTYPE;
    v_lock_key      BIGINT;
    v_used_colors   TEXT[];
    v_chosen_color  TEXT := 'orange';
    v_col           TEXT;
    v_spawn_x       NUMERIC := 1000;
    v_spawn_y       NUMERIC := 600;
BEGIN
    p_code     := trim(upper(p_code));
    p_nickname := trim(p_nickname);
    v_user_id  := auth.uid();

    IF char_length(p_nickname) = 0 THEN
        RAISE EXCEPTION 'Nickname is required.' USING ERRCODE = 'P0001';
    END IF;
    IF char_length(p_nickname) > 30 THEN
        RAISE EXCEPTION 'Nickname is too long (max 30 characters).' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_room FROM rooms r WHERE r.code = p_code;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Room "%" not found. Check the code and try again.', p_code
            USING ERRCODE = 'P0002';
    END IF;

    IF v_room.status = 'playing' THEN
        RAISE EXCEPTION 'This room is already in a game. You cannot join now.'
            USING ERRCODE = 'P0003';
    END IF;
    IF v_room.status = 'finished' THEN
        RAISE EXCEPTION 'This game has already finished.'
            USING ERRCODE = 'P0003';
    END IF;

    -- Idempotent reconnect: return existing player record preserving color & score
    IF v_user_id IS NOT NULL THEN
        SELECT * INTO v_player FROM players p WHERE p.room_id = v_room.id AND p.user_id = v_user_id;
        IF FOUND THEN
            RETURN NEXT v_player;
            RETURN;
        END IF;
    END IF;

    -- Acquire advisory lock keyed to this room
    v_lock_key := ('x' || substr(replace(v_room.id::text, '-', ''), 1, 15))::bit(60)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_key);

    SELECT COUNT(*) INTO v_count FROM players p WHERE p.room_id = v_room.id;
    IF v_count >= 4 THEN
        RAISE EXCEPTION 'This room is full (4/4 players). Please find another room.'
            USING ERRCODE = 'P0004';
    END IF;

    -- Deterministic color selection: pick first unused from ['orange', 'purple', 'blue', 'green']
    SELECT array_agg(p.color_key) INTO v_used_colors
    FROM players p
    WHERE p.room_id = v_room.id;

    FOREACH v_col IN ARRAY ARRAY['orange', 'purple', 'blue', 'green'] LOOP
        IF v_used_colors IS NULL OR NOT (v_col = ANY(v_used_colors)) THEN
            v_chosen_color := v_col;
            EXIT;
        END IF;
    END LOOP;

    -- Deterministic initial spawn coordinates based on color
    IF v_chosen_color = 'orange' THEN
        v_spawn_x := 400;  v_spawn_y := 300;
    ELSIF v_chosen_color = 'purple' THEN
        v_spawn_x := 1600; v_spawn_y := 300;
    ELSIF v_chosen_color = 'blue' THEN
        v_spawn_x := 400;  v_spawn_y := 900;
    ELSE
        v_spawn_x := 1600; v_spawn_y := 900;
    END IF;

    INSERT INTO players (room_id, nickname, score, user_id, color_key, hp, max_hp, alive, x, y, kills, deaths)
    VALUES (v_room.id, p_nickname, 0, v_user_id, v_chosen_color, 100, 100, true, v_spawn_x, v_spawn_y, 0, 0)
    RETURNING * INTO v_player;

    RETURN NEXT v_player;
    RETURN;
END;
$$;

-- 4. Infinite / Continuous Coin Spawning across 2000x1200 World (Bounded active pool = 20)
CREATE OR REPLACE FUNCTION public.ensure_room_coins(
    p_room_id UUID,
    p_count   INTEGER DEFAULT 20
)
RETURNS SETOF coins
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room          rooms%ROWTYPE;
    v_active_count  INTEGER;
    v_needed        INTEGER;
    v_i             INTEGER;
    v_rand_x        NUMERIC;
    v_rand_y        NUMERIC;
    v_reusable_id   UUID;
BEGIN
    SELECT * INTO v_room FROM rooms WHERE id = p_room_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Room not found.' USING ERRCODE = 'P0002';
    END IF;

    SELECT COUNT(*) INTO v_active_count
    FROM coins
    WHERE room_id = p_room_id AND active = true;

    v_needed := p_count - v_active_count;

    IF v_needed > 0 THEN
        FOR v_i IN 1..v_needed LOOP
            v_rand_x := round((60 + random() * 1880)::numeric, 1);
            v_rand_y := round((60 + random() * 1080)::numeric, 1);

            -- Try to reuse an inactive coin row to keep table bounded
            SELECT c.id INTO v_reusable_id
            FROM coins c
            WHERE c.room_id = p_room_id AND c.active = false
            LIMIT 1;

            IF v_reusable_id IS NOT NULL THEN
                UPDATE coins
                SET x = v_rand_x, y = v_rand_y, active = true
                WHERE id = v_reusable_id;
            ELSE
                INSERT INTO coins (room_id, x, y, active)
                VALUES (p_room_id, v_rand_x, v_rand_y, true);
            END IF;
        END LOOP;
    END IF;

    RETURN QUERY
    SELECT * FROM coins
    WHERE room_id = p_room_id AND active = true;
END;
$$;

-- 5. Hardened collect_coin_safe with continuous instant coin replenishment
CREATE OR REPLACE FUNCTION public.collect_coin_safe(
    p_coin_id   UUID,
    p_player_id UUID DEFAULT NULL
)
RETURNS TABLE (
    success   BOOLEAN,
    coin_id   UUID,
    player_id UUID,
    room_id   UUID,
    new_score INTEGER,
    message   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id   UUID;
    v_coin      coins%ROWTYPE;
    v_player    players%ROWTYPE;
    v_room      rooms%ROWTYPE;
    v_score     INTEGER;
    v_dist_sq   NUMERIC;
    v_max_rad   NUMERIC;
    v_new_x     NUMERIC;
    v_new_y     NUMERIC;
BEGIN
    v_user_id := auth.uid();

    SELECT * INTO v_coin
    FROM coins c
    WHERE c.id = p_coin_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, p_coin_id, NULL::UUID, NULL::UUID, 0, 'Coin not found.'::TEXT;
        RETURN;
    END IF;

    IF NOT v_coin.active THEN
        RETURN QUERY SELECT false, p_coin_id, NULL::UUID, v_coin.room_id, 0, 'Coin already collected.'::TEXT;
        RETURN;
    END IF;

    IF v_user_id IS NOT NULL THEN
        SELECT * INTO v_player
        FROM players p
        WHERE p.room_id = v_coin.room_id AND p.user_id = v_user_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN QUERY SELECT false, p_coin_id, NULL::UUID, v_coin.room_id, 0, 'Unauthorized: Player not in this room.'::TEXT;
            RETURN;
        END IF;
    ELSIF p_player_id IS NOT NULL THEN
        SELECT * INTO v_player
        FROM players p
        WHERE p.id = p_player_id
        FOR UPDATE;

        IF NOT FOUND OR v_player.room_id <> v_coin.room_id THEN
            RETURN QUERY SELECT false, p_coin_id, p_player_id, v_coin.room_id, 0, 'Unauthorized: Player not in this room.'::TEXT;
            RETURN;
        END IF;
    ELSE
        RETURN QUERY SELECT false, p_coin_id, NULL::UUID, v_coin.room_id, 0, 'Unauthorized: Authentication required.'::TEXT;
        RETURN;
    END IF;

    -- Player must be alive to collect coins
    IF NOT v_player.alive THEN
        RETURN QUERY SELECT false, p_coin_id, v_player.id, v_coin.room_id, v_player.score, 'Dead players cannot collect coins.'::TEXT;
        RETURN;
    END IF;

    SELECT * INTO v_room FROM rooms r WHERE r.id = v_coin.room_id;
    IF v_room.status <> 'playing' THEN
        RETURN QUERY SELECT false, p_coin_id, v_player.id, v_coin.room_id, v_player.score, 'Game is not in playing state.'::TEXT;
        RETURN;
    END IF;

    IF v_room.started_at IS NOT NULL AND now() < (v_room.started_at + interval '3 seconds') THEN
        RETURN QUERY SELECT false, p_coin_id, v_player.id, v_coin.room_id, v_player.score, 'Cannot collect coins during countdown.'::TEXT;
        RETURN;
    END IF;

    IF v_room.started_at IS NOT NULL AND now() > (v_room.started_at + interval '303 seconds') THEN
        RETURN QUERY SELECT false, p_coin_id, v_player.id, v_coin.room_id, v_player.score, 'Match time has expired.'::TEXT;
        RETURN;
    END IF;

    -- Distance check (player radius 16 + coin radius 8 + 35px latency buffer = 59px)
    v_max_rad := 59.0;
    v_dist_sq := (v_player.x - v_coin.x)^2 + (v_player.y - v_coin.y)^2;

    IF v_dist_sq > (v_max_rad * v_max_rad) THEN
        RETURN QUERY SELECT false, p_coin_id, v_player.id, v_coin.room_id, v_player.score, 'Too far from coin to collect.'::TEXT;
        RETURN;
    END IF;

    -- Immediately recycle coin to a new random location inside the 2000x1200 world (min 150px away from collector)
    v_new_x := round((60 + random() * 1880)::numeric, 1);
    v_new_y := round((60 + random() * 1080)::numeric, 1);

    UPDATE coins c
    SET x = v_new_x, y = v_new_y, active = true
    WHERE c.id = p_coin_id;

    UPDATE players p
    SET score = score + 1
    WHERE p.id = v_player.id
    RETURNING score INTO v_score;

    RETURN QUERY
    SELECT true, p_coin_id, v_player.id, v_coin.room_id, v_score, 'Coin collected successfully.'::TEXT;
    RETURN;
END;
$$;

-- 6. Authoritative PvP Basic Attack RPC (attack_player_safe)
CREATE OR REPLACE FUNCTION public.attack_player_safe(
    p_target_id UUID
)
RETURNS TABLE (
    success        BOOLEAN,
    attacker_id    UUID,
    target_id      UUID,
    damage_dealt   INTEGER,
    target_hp      INTEGER,
    target_alive   BOOLEAN,
    is_shielded    BOOLEAN,
    is_kill        BOOLEAN,
    message        TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id      UUID;
    v_attacker     players%ROWTYPE;
    v_target       players%ROWTYPE;
    v_room         rooms%ROWTYPE;
    v_dist_sq      NUMERIC;
    v_max_range    NUMERIC := 90.0; -- 90px melee attack range
    v_damage       INTEGER := 20;   -- 20 HP base damage
    v_new_hp       INTEGER;
    v_shielded     BOOLEAN := false;
    v_killed       BOOLEAN := false;
    v_now          TIMESTAMPTZ := clock_timestamp();
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT false, NULL::UUID, p_target_id, 0, 0, false, false, false, 'Authentication required.'::TEXT;
        RETURN;
    END IF;

    -- 1. Identify attacker
    SELECT * INTO v_attacker
    FROM players pl
    WHERE pl.user_id = v_user_id
    ORDER BY pl.joined_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::UUID, p_target_id, 0, 0, false, false, false, 'Attacker player not found.'::TEXT;
        RETURN;
    END IF;

    IF v_attacker.id = p_target_id THEN
        RETURN QUERY SELECT false, v_attacker.id, p_target_id, 0, v_attacker.hp, v_attacker.alive, false, false, 'Cannot attack yourself.'::TEXT;
        RETURN;
    END IF;

    -- 2. Verify match state
    SELECT * INTO v_room FROM rooms rm WHERE rm.id = v_attacker.room_id;
    IF v_room.status <> 'playing' THEN
        RETURN QUERY SELECT false, v_attacker.id, p_target_id, 0, 0, false, false, false, 'Match is not in playing state.'::TEXT;
        RETURN;
    END IF;

    IF v_room.started_at IS NOT NULL AND v_now < (v_room.started_at + interval '3 seconds') THEN
        RETURN QUERY SELECT false, v_attacker.id, p_target_id, 0, 0, false, false, false, 'Cannot attack during countdown.'::TEXT;
        RETURN;
    END IF;

    IF v_room.started_at IS NOT NULL AND v_now > (v_room.started_at + interval '303 seconds') THEN
        RETURN QUERY SELECT false, v_attacker.id, p_target_id, 0, 0, false, false, false, 'Match time has expired.'::TEXT;
        RETURN;
    END IF;

    -- 3. Verify attacker is alive & cooldown
    IF NOT v_attacker.alive THEN
        RETURN QUERY SELECT false, v_attacker.id, p_target_id, 0, 0, false, false, false, 'Dead players cannot attack.'::TEXT;
        RETURN;
    END IF;

    IF v_attacker.attack_cooldown_until IS NOT NULL AND v_now < v_attacker.attack_cooldown_until THEN
        RETURN QUERY SELECT false, v_attacker.id, p_target_id, 0, 0, true, false, false, 'Attack is on cooldown.'::TEXT;
        RETURN;
    END IF;

    -- 4. Identify & lock target
    SELECT * INTO v_target
    FROM players pl
    WHERE pl.id = p_target_id AND pl.room_id = v_attacker.room_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, v_attacker.id, p_target_id, 0, 0, false, false, false, 'Target not found in room.'::TEXT;
        RETURN;
    END IF;

    IF NOT v_target.alive THEN
        RETURN QUERY SELECT false, v_attacker.id, p_target_id, 0, 0, false, false, false, 'Target is already dead.'::TEXT;
        RETURN;
    END IF;

    -- 5. Distance check (authoritative)
    v_dist_sq := (v_attacker.x - v_target.x)^2 + (v_attacker.y - v_target.y)^2;
    IF v_dist_sq > (v_max_range * v_max_range) THEN
        RETURN QUERY SELECT false, v_attacker.id, p_target_id, 0, v_target.hp, true, false, false, 'Target out of attack range.'::TEXT;
        RETURN;
    END IF;

    -- 6. Check target shield
    IF v_target.shield_until IS NOT NULL AND v_now < v_target.shield_until THEN
        v_shielded := true;
        v_damage := 0;
        v_new_hp := v_target.hp;
    ELSE
        v_new_hp := GREATEST(0, v_target.hp - v_damage);
        IF v_new_hp = 0 THEN
            v_killed := true;
        END IF;
    END IF;

    -- 7. Apply combat update
    IF v_killed THEN
        UPDATE players pl
        SET hp = 0,
            alive = false,
            deaths = pl.deaths + 1,
            respawn_at = v_now + interval '3 seconds'
        WHERE pl.id = v_target.id;

        UPDATE players pl
        SET kills = pl.kills + 1,
            attack_cooldown_until = v_now + interval '600 milliseconds'
        WHERE pl.id = v_attacker.id;
    ELSE
        IF NOT v_shielded THEN
            UPDATE players pl
            SET hp = v_new_hp
            WHERE pl.id = v_target.id;
        END IF;

        UPDATE players pl
        SET attack_cooldown_until = v_now + interval '600 milliseconds'
        WHERE pl.id = v_attacker.id;
    END IF;

    RETURN QUERY
    SELECT true, v_attacker.id, v_target.id, v_damage, v_new_hp, (NOT v_killed), v_shielded, v_killed, 'Attack executed.'::TEXT;
    RETURN;
END;
$$;

-- 7. Authoritative Skill 1: Dash (use_dash_safe)
CREATE OR REPLACE FUNCTION public.use_dash_safe(
    p_dx NUMERIC,
    p_dy NUMERIC
)
RETURNS TABLE (
    success         BOOLEAN,
    new_x           NUMERIC,
    new_y           NUMERIC,
    cooldown_until  TIMESTAMPTZ,
    message         TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id   UUID;
    v_player    players%ROWTYPE;
    v_room      rooms%ROWTYPE;
    v_len       NUMERIC;
    v_ndx       NUMERIC := 0;
    v_ndy       NUMERIC := 0;
    v_dist      NUMERIC := 190.0;
    v_dest_x    NUMERIC;
    v_dest_y    NUMERIC;
    v_now       TIMESTAMPTZ := clock_timestamp();
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT false, 0::NUMERIC, 0::NUMERIC, NULL::TIMESTAMPTZ, 'Authentication required.'::TEXT;
        RETURN;
    END IF;

    SELECT * INTO v_player
    FROM players pl
    WHERE pl.user_id = v_user_id
    ORDER BY pl.joined_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 0::NUMERIC, 0::NUMERIC, NULL::TIMESTAMPTZ, 'Player not found.'::TEXT;
        RETURN;
    END IF;

    IF NOT v_player.alive THEN
        RETURN QUERY SELECT false, v_player.x, v_player.y, NULL::TIMESTAMPTZ, 'Dead players cannot dash.'::TEXT;
        RETURN;
    END IF;

    SELECT * INTO v_room FROM rooms rm WHERE rm.id = v_player.room_id;
    IF v_room.status <> 'playing' THEN
        RETURN QUERY SELECT false, v_player.x, v_player.y, NULL::TIMESTAMPTZ, 'Match is not active.'::TEXT;
        RETURN;
    END IF;

    IF v_room.started_at IS NOT NULL AND v_now < (v_room.started_at + interval '3 seconds') THEN
        RETURN QUERY SELECT false, v_player.x, v_player.y, NULL::TIMESTAMPTZ, 'Cannot dash during countdown.'::TEXT;
        RETURN;
    END IF;

    IF v_player.dash_cooldown_until IS NOT NULL AND v_now < v_player.dash_cooldown_until THEN
        RETURN QUERY SELECT false, v_player.x, v_player.y, v_player.dash_cooldown_until, 'Dash is on cooldown.'::TEXT;
        RETURN;
    END IF;

    -- Normalize direction vector
    v_len := sqrt(p_dx * p_dx + p_dy * p_dy);
    IF v_len > 0.001 THEN
        v_ndx := p_dx / v_len;
        v_ndy := p_dy / v_len;
    ELSE
        v_ndx := 1;
        v_ndy := 0;
    END IF;

    -- Calculate and clamp world destination (2000x1200 world)
    v_dest_x := round(GREATEST(40.0, LEAST(1960.0, v_player.x + v_ndx * v_dist)), 1);
    v_dest_y := round(GREATEST(40.0, LEAST(1160.0, v_player.y + v_ndy * v_dist)), 1);

    UPDATE players pl
    SET x = v_dest_x,
        y = v_dest_y,
        position_updated_at = v_now,
        dash_cooldown_until = v_now + interval '4 seconds'
    WHERE pl.id = v_player.id;

    RETURN QUERY
    SELECT true, v_dest_x, v_dest_y, (v_now + interval '4 seconds'), 'Dash executed.'::TEXT;
    RETURN;
END;
$$;

-- 8. Authoritative Skill 2: Shield (use_shield_safe)
CREATE OR REPLACE FUNCTION public.use_shield_safe()
RETURNS TABLE (
    success         BOOLEAN,
    shield_until    TIMESTAMPTZ,
    cooldown_until  TIMESTAMPTZ,
    message         TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id   UUID;
    v_player    players%ROWTYPE;
    v_room      rooms%ROWTYPE;
    v_now       TIMESTAMPTZ := clock_timestamp();
    v_s_until   TIMESTAMPTZ;
    v_cd_until  TIMESTAMPTZ;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, 'Authentication required.'::TEXT;
        RETURN;
    END IF;

    SELECT * INTO v_player
    FROM players pl
    WHERE pl.user_id = v_user_id
    ORDER BY pl.joined_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND OR NOT v_player.alive THEN
        RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, 'Player not found or dead.'::TEXT;
        RETURN;
    END IF;

    SELECT * INTO v_room FROM rooms rm WHERE rm.id = v_player.room_id;
    IF v_room.status <> 'playing' THEN
        RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, 'Match is not active.'::TEXT;
        RETURN;
    END IF;

    IF v_player.shield_cooldown_until IS NOT NULL AND v_now < v_player.shield_cooldown_until THEN
        RETURN QUERY SELECT false, v_player.shield_until, v_player.shield_cooldown_until, 'Shield is on cooldown.'::TEXT;
        RETURN;
    END IF;

    v_s_until  := v_now + interval '2 seconds';
    v_cd_until := v_now + interval '8 seconds';

    UPDATE players pl
    SET shield_until = v_s_until,
        shield_cooldown_until = v_cd_until
    WHERE pl.id = v_player.id;

    RETURN QUERY
    SELECT true, v_s_until, v_cd_until, 'Shield activated.'::TEXT;
    RETURN;
END;
$$;

-- 9. Authoritative Skill 3: Shockwave (use_shockwave_safe)
CREATE OR REPLACE FUNCTION public.use_shockwave_safe()
RETURNS TABLE (
    success          BOOLEAN,
    hits_count       INTEGER,
    cooldown_until   TIMESTAMPTZ,
    message          TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id       UUID;
    v_caster        players%ROWTYPE;
    v_room          rooms%ROWTYPE;
    v_enemy         players%ROWTYPE;
    v_now           TIMESTAMPTZ := clock_timestamp();
    v_radius        NUMERIC := 170.0;
    v_rad_sq        NUMERIC := 170.0 * 170.0;
    v_dist_sq       NUMERIC;
    v_hits          INTEGER := 0;
    v_damage        INTEGER := 25;
    v_new_hp        INTEGER;
    v_kills         INTEGER := 0;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT false, 0, NULL::TIMESTAMPTZ, 'Authentication required.'::TEXT;
        RETURN;
    END IF;

    SELECT * INTO v_caster
    FROM players pl
    WHERE pl.user_id = v_user_id
    ORDER BY pl.joined_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND OR NOT v_caster.alive THEN
        RETURN QUERY SELECT false, 0, NULL::TIMESTAMPTZ, 'Player not found or dead.'::TEXT;
        RETURN;
    END IF;

    SELECT * INTO v_room FROM rooms rm WHERE rm.id = v_caster.room_id;
    IF v_room.status <> 'playing' THEN
        RETURN QUERY SELECT false, 0, NULL::TIMESTAMPTZ, 'Match is not active.'::TEXT;
        RETURN;
    END IF;

    IF v_room.started_at IS NOT NULL AND v_now < (v_room.started_at + interval '3 seconds') THEN
        RETURN QUERY SELECT false, 0, NULL::TIMESTAMPTZ, 'Cannot use skills during countdown.'::TEXT;
        RETURN;
    END IF;

    IF v_caster.shockwave_cooldown_until IS NOT NULL AND v_now < v_caster.shockwave_cooldown_until THEN
        RETURN QUERY SELECT false, 0, v_caster.shockwave_cooldown_until, 'Shockwave is on cooldown.'::TEXT;
        RETURN;
    END IF;

    -- Process enemies in room within radius
    FOR v_enemy IN
        SELECT * FROM players pl
        WHERE pl.room_id = v_caster.room_id
          AND pl.id <> v_caster.id
          AND pl.alive = true
        FOR UPDATE
    LOOP
        v_dist_sq := (v_enemy.x - v_caster.x)^2 + (v_enemy.y - v_caster.y)^2;
        IF v_dist_sq <= v_rad_sq THEN
            v_hits := v_hits + 1;

            -- Check if enemy is shielded
            IF v_enemy.shield_until IS NULL OR v_now >= v_enemy.shield_until THEN
                v_new_hp := GREATEST(0, v_enemy.hp - v_damage);
                IF v_new_hp = 0 THEN
                    v_kills := v_kills + 1;
                    UPDATE players pl
                    SET hp = 0,
                        alive = false,
                        deaths = pl.deaths + 1,
                        respawn_at = v_now + interval '3 seconds'
                    WHERE pl.id = v_enemy.id;
                ELSE
                    UPDATE players pl
                    SET hp = v_new_hp
                    WHERE pl.id = v_enemy.id;
                END IF;
            END IF;
        END IF;
    END LOOP;

    UPDATE players pl
    SET kills = pl.kills + v_kills,
        shockwave_cooldown_until = v_now + interval '7 seconds'
    WHERE pl.id = v_caster.id;

    RETURN QUERY
    SELECT true, v_hits, (v_now + interval '7 seconds'), ('Shockwave hit ' || v_hits || ' enemies.')::TEXT;
    RETURN;
END;
$$;

-- 10. Authoritative Respawn RPC (respawn_player_safe)
CREATE OR REPLACE FUNCTION public.respawn_player_safe()
RETURNS TABLE (
    success   BOOLEAN,
    new_x     NUMERIC,
    new_y     NUMERIC,
    hp        INTEGER,
    message   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id   UUID;
    v_player    players%ROWTYPE;
    v_room      rooms%ROWTYPE;
    v_now       TIMESTAMPTZ := clock_timestamp();
    v_spawn_x   NUMERIC := 1000;
    v_spawn_y   NUMERIC := 600;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT false, 0::NUMERIC, 0::NUMERIC, 0, 'Authentication required.'::TEXT;
        RETURN;
    END IF;

    SELECT * INTO v_player
    FROM players pl
    WHERE pl.user_id = v_user_id
    ORDER BY pl.joined_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 0::NUMERIC, 0::NUMERIC, 0, 'Player not found.'::TEXT;
        RETURN;
    END IF;

    IF v_player.alive THEN
        RETURN QUERY SELECT true, v_player.x, v_player.y, v_player.hp, 'Player is already alive.'::TEXT;
        RETURN;
    END IF;

    IF v_player.respawn_at IS NOT NULL AND v_now < v_player.respawn_at THEN
        RETURN QUERY SELECT false, v_player.x, v_player.y, 0, 'Respawn timer has not elapsed yet.'::TEXT;
        RETURN;
    END IF;

    -- Pick spawn point based on color
    IF v_player.color_key = 'orange' THEN
        v_spawn_x := 400;  v_spawn_y := 300;
    ELSIF v_player.color_key = 'purple' THEN
        v_spawn_x := 1600; v_spawn_y := 300;
    ELSIF v_player.color_key = 'blue' THEN
        v_spawn_x := 400;  v_spawn_y := 900;
    ELSE
        v_spawn_x := 1600; v_spawn_y := 900;
    END IF;

    UPDATE players pl
    SET hp = 100,
        alive = true,
        respawn_at = NULL,
        shield_until = v_now + interval '1.5 seconds', -- Brief spawn shield
        attack_cooldown_until = NULL,
        x = v_spawn_x,
        y = v_spawn_y,
        position_updated_at = v_now
    WHERE pl.id = v_player.id;

    RETURN QUERY
    SELECT true, v_spawn_x, v_spawn_y, 100, 'Player respawned successfully.'::TEXT;
    RETURN;
END;
$$;

-- 11. Update Position Validation for Large 2000x1200 World
CREATE OR REPLACE FUNCTION public.update_player_position_safe(
    p_x NUMERIC,
    p_y NUMERIC
)
RETURNS TABLE (
    success BOOLEAN,
    x       NUMERIC,
    y       NUMERIC,
    reason  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id       UUID;
    v_player        players%ROWTYPE;
    v_now           TIMESTAMPTZ;
    v_delta_t       NUMERIC;
    v_delta_dist_sq NUMERIC;
    v_max_dist      NUMERIC;
    v_clamped_x     NUMERIC;
    v_clamped_y     NUMERIC;
    v_player_speed  NUMERIC := 210.0;
    v_speed_mult    NUMERIC := 1.0;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT false, 0::NUMERIC, 0::NUMERIC, 'unauthenticated'::TEXT;
        RETURN;
    END IF;

    SELECT * INTO v_player
    FROM players p
    WHERE p.user_id = v_user_id
    ORDER BY p.joined_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 0::NUMERIC, 0::NUMERIC, 'player_not_found'::TEXT;
        RETURN;
    END IF;

    -- Dead players cannot move
    IF NOT v_player.alive THEN
        RETURN QUERY SELECT false, v_player.x, v_player.y, 'player_dead'::TEXT;
        RETURN;
    END IF;

    v_clamped_x := round(GREATEST(24.0, LEAST(1976.0, p_x)), 1);
    v_clamped_y := round(GREATEST(24.0, LEAST(1176.0, p_y)), 1);

    v_now := clock_timestamp();
    v_delta_t := EXTRACT(EPOCH FROM (v_now - v_player.position_updated_at));

    IF v_player.dash_cooldown_until IS NOT NULL AND v_now < (v_player.dash_cooldown_until - interval '2 seconds') THEN
        v_speed_mult := 2.5;
    END IF;

    IF v_delta_t > 0.05 AND v_delta_t < 10.0 THEN
        v_max_dist := (v_player_speed * v_speed_mult * v_delta_t) + 60.0;
        v_delta_dist_sq := (v_clamped_x - v_player.x)^2 + (v_clamped_y - v_player.y)^2;

        IF v_delta_dist_sq > (v_max_dist * v_max_dist) THEN
            RETURN QUERY SELECT false, v_player.x, v_player.y, 'movement_exceeded'::TEXT;
            RETURN;
        END IF;
    END IF;

    UPDATE players p
    SET x = v_clamped_x,
        y = v_clamped_y,
        position_updated_at = v_now
    WHERE p.id = v_player.id;

    RETURN QUERY SELECT true, v_clamped_x, v_clamped_y, 'ok'::TEXT;
    RETURN;
END;
$$;
