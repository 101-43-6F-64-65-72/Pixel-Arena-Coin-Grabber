-- ============================================================
-- Migration: Phase 12 — HD Lightweight Arena & Reliable Authoritative Damage
-- Project:   Pixel Arena: Coin Grabber / RoyalWar
-- Purpose:
--   1. Reliable combat distance validation with network latency buffers
--   2. Structured per-target combat result for Shockwave/Burst skill
--   3. Atomic HP damage & knockback state application
-- ============================================================

-- 1. Authoritative Melee Attack RPC (attack_player_safe)
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
    message        TEXT,
    new_target_x   NUMERIC,
    new_target_y   NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id        UUID;
    v_attacker       players%ROWTYPE;
    v_target         players%ROWTYPE;
    v_room           rooms%ROWTYPE;
    v_dist_sq        NUMERIC;
    v_max_range      NUMERIC := 110.0; -- 90px base range + 20px latency buffer
    v_damage         INTEGER := 20;    -- 20 HP base damage
    v_new_hp         INTEGER;
    v_shielded       BOOLEAN := false;
    v_killed         BOOLEAN := false;
    v_now            TIMESTAMPTZ := clock_timestamp();

    v_knockback_dist NUMERIC := 35.0;
    v_len            NUMERIC;
    v_ndx            NUMERIC := 0;
    v_ndy            NUMERIC := 0;
    v_new_target_x   NUMERIC;
    v_new_target_y   NUMERIC;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT false, NULL::UUID, p_target_id, 0, 0, false, false, false, 'Authentication required.'::TEXT, 0::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;

    -- Lock attacker player row
    SELECT * INTO v_attacker
    FROM players pl
    WHERE pl.user_id = v_user_id
    ORDER BY pl.joined_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::UUID, p_target_id, 0, 0, false, false, false, 'Attacker player not found.'::TEXT, 0::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;

    IF v_attacker.id = p_target_id THEN
        RETURN QUERY SELECT false, v_attacker.id, p_target_id, 0, v_attacker.hp, v_attacker.alive, false, false, 'Cannot attack yourself.'::TEXT, v_attacker.x, v_attacker.y;
        RETURN;
    END IF;

    -- Verify room match state
    SELECT * INTO v_room FROM rooms rm WHERE rm.id = v_attacker.room_id;
    IF v_room.status <> 'playing' THEN
        RETURN QUERY SELECT false, v_attacker.id, p_target_id, 0, 0, false, false, false, 'Match is not in playing state.'::TEXT, 0::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;

    IF v_room.started_at IS NOT NULL AND v_now < (v_room.started_at + interval '3 seconds') THEN
        RETURN QUERY SELECT false, v_attacker.id, p_target_id, 0, 0, false, false, false, 'Cannot attack during countdown.'::TEXT, 0::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;

    IF v_room.started_at IS NOT NULL AND v_now > (v_room.started_at + interval '303 seconds') THEN
        RETURN QUERY SELECT false, v_attacker.id, p_target_id, 0, 0, false, false, false, 'Match time has expired.'::TEXT, 0::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;

    IF NOT v_attacker.alive THEN
        RETURN QUERY SELECT false, v_attacker.id, p_target_id, 0, 0, false, false, false, 'Dead players cannot attack.'::TEXT, 0::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;

    IF v_attacker.attack_cooldown_until IS NOT NULL AND v_now < v_attacker.attack_cooldown_until THEN
        RETURN QUERY SELECT false, v_attacker.id, p_target_id, 0, 0, true, false, false, 'Attack is on cooldown.'::TEXT, 0::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;

    -- Lock target player row
    SELECT * INTO v_target
    FROM players pl
    WHERE pl.id = p_target_id AND pl.room_id = v_attacker.room_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, v_attacker.id, p_target_id, 0, 0, false, false, false, 'Target not found in room.'::TEXT, 0::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;

    IF NOT v_target.alive THEN
        RETURN QUERY SELECT false, v_attacker.id, p_target_id, 0, 0, false, false, false, 'Target is already dead.'::TEXT, v_target.x, v_target.y;
        RETURN;
    END IF;

    -- Authoritative distance check
    v_dist_sq := (v_attacker.x - v_target.x)^2 + (v_attacker.y - v_target.y)^2;
    IF v_dist_sq > (v_max_range * v_max_range) THEN
        RETURN QUERY SELECT false, v_attacker.id, p_target_id, 0, v_target.hp, true, false, false, 'Target out of attack range.'::TEXT, v_target.x, v_target.y;
        RETURN;
    END IF;

    -- Check target shield
    IF v_target.shield_until IS NOT NULL AND v_now < v_target.shield_until THEN
        v_shielded := true;
        v_damage := 0;
        v_new_hp := v_target.hp;
        v_new_target_x := v_target.x;
        v_new_target_y := v_target.y;
    ELSE
        v_new_hp := GREATEST(0, v_target.hp - v_damage);
        IF v_new_hp = 0 THEN
            v_killed := true;
        END IF;

        -- Knockback calculation
        v_len := sqrt(v_dist_sq);
        IF v_len > 0.001 THEN
            v_ndx := (v_target.x - v_attacker.x) / v_len;
            v_ndy := (v_target.y - v_attacker.y) / v_len;
        ELSE
            v_ndx := 1; v_ndy := 0;
        END IF;

        v_new_target_x := round(GREATEST(24.0, LEAST(1976.0, v_target.x + v_ndx * v_knockback_dist)), 1);
        v_new_target_y := round(GREATEST(24.0, LEAST(1176.0, v_target.y + v_ndy * v_knockback_dist)), 1);
    END IF;

    -- Apply combat update atomically
    IF v_killed THEN
        UPDATE players pl
        SET hp = 0,
            alive = false,
            deaths = pl.deaths + 1,
            respawn_at = v_now + interval '3 seconds',
            x = v_new_target_x,
            y = v_new_target_y,
            position_updated_at = v_now
        WHERE pl.id = v_target.id;

        UPDATE players pl
        SET kills = pl.kills + 1,
            attack_cooldown_until = v_now + interval '600 milliseconds'
        WHERE pl.id = v_attacker.id;
    ELSE
        IF NOT v_shielded THEN
            UPDATE players pl
            SET hp = v_new_hp,
                x = v_new_target_x,
                y = v_new_target_y,
                position_updated_at = v_now
            WHERE pl.id = v_target.id;
        END IF;

        UPDATE players pl
        SET attack_cooldown_until = v_now + interval '600 milliseconds'
        WHERE pl.id = v_attacker.id;
    END IF;

    RETURN QUERY
    SELECT true, v_attacker.id, v_target.id, v_damage, v_new_hp, (NOT v_killed), v_shielded, v_killed, 'Attack executed.'::TEXT, v_new_target_x, v_new_target_y;
    RETURN;
END;
$$;

-- 2. Authoritative Shockwave / Burst Skill RPC with Multi-Target Result (use_shockwave_safe)
CREATE OR REPLACE FUNCTION public.use_shockwave_safe()
RETURNS TABLE (
    success          BOOLEAN,
    caster_id        UUID,
    target_id        UUID,
    damage_dealt     INTEGER,
    target_hp        INTEGER,
    target_alive     BOOLEAN,
    is_shielded      BOOLEAN,
    is_kill          BOOLEAN,
    message          TEXT,
    new_target_x     NUMERIC,
    new_target_y     NUMERIC,
    cooldown_until   TIMESTAMPTZ
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
    v_radius        NUMERIC := 205.0; -- 170px base radius + 35px latency buffer
    v_rad_sq        NUMERIC := 205.0 * 205.0;
    v_dist_sq       NUMERIC;
    v_hits          INTEGER := 0;
    v_damage        INTEGER := 25;
    v_new_hp        INTEGER;
    v_kills         INTEGER := 0;
    v_cd_until      TIMESTAMPTZ;

    v_shielded      BOOLEAN;
    v_killed        BOOLEAN;
    v_knockback_dist NUMERIC := 40.0;
    v_len           NUMERIC;
    v_ndx           NUMERIC;
    v_ndy           NUMERIC;
    v_new_target_x  NUMERIC;
    v_new_target_y  NUMERIC;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, 0, 0, false, false, false, 'Authentication required.'::TEXT, 0::NUMERIC, 0::NUMERIC, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    SELECT * INTO v_caster
    FROM players pl
    WHERE pl.user_id = v_user_id
    ORDER BY pl.joined_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND OR NOT v_caster.alive THEN
        RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, 0, 0, false, false, false, 'Player not found or dead.'::TEXT, 0::NUMERIC, 0::NUMERIC, v_caster.shockwave_cooldown_until;
        RETURN;
    END IF;

    SELECT * INTO v_room FROM rooms rm WHERE rm.id = v_caster.room_id;
    IF v_room.status <> 'playing' THEN
        RETURN QUERY SELECT false, v_caster.id, NULL::UUID, 0, 0, false, false, false, 'Match is not active.'::TEXT, 0::NUMERIC, 0::NUMERIC, v_caster.shockwave_cooldown_until;
        RETURN;
    END IF;

    IF v_room.started_at IS NOT NULL AND v_now < (v_room.started_at + interval '3 seconds') THEN
        RETURN QUERY SELECT false, v_caster.id, NULL::UUID, 0, 0, false, false, false, 'Cannot use skills during countdown.'::TEXT, 0::NUMERIC, 0::NUMERIC, v_caster.shockwave_cooldown_until;
        RETURN;
    END IF;

    IF v_room.started_at IS NOT NULL AND v_now > (v_room.started_at + interval '303 seconds') THEN
        RETURN QUERY SELECT false, v_caster.id, NULL::UUID, 0, 0, false, false, false, 'Match time has expired.'::TEXT, 0::NUMERIC, 0::NUMERIC, v_caster.shockwave_cooldown_until;
        RETURN;
    END IF;

    IF v_caster.shockwave_cooldown_until IS NOT NULL AND v_now < v_caster.shockwave_cooldown_until THEN
        RETURN QUERY SELECT false, v_caster.id, NULL::UUID, 0, 0, false, false, false, 'Burst is on cooldown.'::TEXT, 0::NUMERIC, 0::NUMERIC, v_caster.shockwave_cooldown_until;
        RETURN;
    END IF;

    v_cd_until := v_now + interval '6 seconds';

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
            v_shielded := (v_enemy.shield_until IS NOT NULL AND v_now < v_enemy.shield_until);

            IF v_shielded THEN
                v_new_hp := v_enemy.hp;
                v_killed := false;
                v_new_target_x := v_enemy.x;
                v_new_target_y := v_enemy.y;
            ELSE
                v_new_hp := GREATEST(0, v_enemy.hp - v_damage);
                v_killed := (v_new_hp = 0);

                v_len := sqrt(v_dist_sq);
                IF v_len > 0.001 THEN
                    v_ndx := (v_enemy.x - v_caster.x) / v_len;
                    v_ndy := (v_enemy.y - v_caster.y) / v_len;
                ELSE
                    v_ndx := 1; v_ndy := 0;
                END IF;

                v_new_target_x := round(GREATEST(24.0, LEAST(1976.0, v_enemy.x + v_ndx * v_knockback_dist)), 1);
                v_new_target_y := round(GREATEST(24.0, LEAST(1176.0, v_enemy.y + v_ndy * v_knockback_dist)), 1);

                IF v_killed THEN
                    v_kills := v_kills + 1;
                    UPDATE players pl
                    SET hp = 0,
                        alive = false,
                        deaths = pl.deaths + 1,
                        respawn_at = v_now + interval '3 seconds',
                        x = v_new_target_x,
                        y = v_new_target_y,
                        position_updated_at = v_now
                    WHERE pl.id = v_enemy.id;
                ELSE
                    UPDATE players pl
                    SET hp = v_new_hp,
                        x = v_new_target_x,
                        y = v_new_target_y,
                        position_updated_at = v_now
                    WHERE pl.id = v_enemy.id;
                END IF;
            END IF;

            RETURN QUERY
            SELECT true, v_caster.id, v_enemy.id, (CASE WHEN v_shielded THEN 0 ELSE v_damage END), v_new_hp, (NOT v_killed), v_shielded, v_killed, 'Hit'::TEXT, v_new_target_x, v_new_target_y, v_cd_until;
        END IF;
    END LOOP;

    -- Update caster cooldown & kills
    UPDATE players pl
    SET kills = pl.kills + v_kills,
        shockwave_cooldown_until = v_cd_until
    WHERE pl.id = v_caster.id;

    -- If no enemies hit, return cast confirmation row
    IF v_hits = 0 THEN
        RETURN QUERY
        SELECT true, v_caster.id, NULL::UUID, 0, 0, true, false, false, 'Burst cast (0 hits).'::TEXT, v_caster.x, v_caster.y, v_cd_until;
    END IF;

    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.attack_player_safe(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.use_shockwave_safe() TO anon, authenticated;
