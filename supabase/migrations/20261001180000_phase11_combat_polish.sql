-- ============================================================
-- Migration: Phase 11 — Combat Feel & PvP Polish
-- Project:   Pixel Arena: Coin Grabber
-- Purpose:
--   1. Adds authoritative Knockback to attack_player_safe
--   2. Returns new target coordinates so clients can snap
-- ============================================================

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
    v_user_id      UUID;
    v_attacker     players%ROWTYPE;
    v_target       players%ROWTYPE;
    v_room         rooms%ROWTYPE;
    v_dist_sq      NUMERIC;
    v_max_range    NUMERIC := 90.0;
    v_damage       INTEGER := 20;
    v_new_hp       INTEGER;
    v_shielded     BOOLEAN := false;
    v_killed       BOOLEAN := false;
    v_now          TIMESTAMPTZ := clock_timestamp();

    v_knockback_dist NUMERIC := 35.0;
    v_len          NUMERIC;
    v_ndx          NUMERIC := 0;
    v_ndy          NUMERIC := 0;
    v_new_target_x NUMERIC;
    v_new_target_y NUMERIC;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT false, NULL::UUID, p_target_id, 0, 0, false, false, false, 'Authentication required.'::TEXT, 0::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;

    SELECT * INTO v_attacker FROM players pl WHERE pl.user_id = v_user_id ORDER BY pl.joined_at DESC LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::UUID, p_target_id, 0, 0, false, false, false, 'Attacker player not found.'::TEXT, 0::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;

    IF v_attacker.id = p_target_id THEN
        RETURN QUERY SELECT false, v_attacker.id, p_target_id, 0, v_attacker.hp, v_attacker.alive, false, false, 'Cannot attack yourself.'::TEXT, 0::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;

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

    SELECT * INTO v_target FROM players pl WHERE pl.id = p_target_id AND pl.room_id = v_attacker.room_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, v_attacker.id, p_target_id, 0, 0, false, false, false, 'Target not found in room.'::TEXT, 0::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;

    IF NOT v_target.alive THEN
        RETURN QUERY SELECT false, v_attacker.id, p_target_id, 0, 0, false, false, false, 'Target is already dead.'::TEXT, 0::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;

    v_dist_sq := (v_attacker.x - v_target.x)^2 + (v_attacker.y - v_target.y)^2;
    IF v_dist_sq > (v_max_range * v_max_range) THEN
        RETURN QUERY SELECT false, v_attacker.id, p_target_id, 0, v_target.hp, true, false, false, 'Target out of attack range.'::TEXT, 0::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;

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

        -- Knockback calc
        v_len := sqrt(v_dist_sq);
        IF v_len > 0.001 THEN
            v_ndx := (v_target.x - v_attacker.x) / v_len;
            v_ndy := (v_target.y - v_attacker.y) / v_len;
        ELSE
            v_ndx := 1; v_ndy := 0;
        END IF;

        -- Apply bounds to knockback
        v_new_target_x := round(GREATEST(24.0, LEAST(1976.0, v_target.x + v_ndx * v_knockback_dist)), 1);
        v_new_target_y := round(GREATEST(24.0, LEAST(1176.0, v_target.y + v_ndy * v_knockback_dist)), 1);
    END IF;

    -- Apply combat update
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

GRANT EXECUTE ON FUNCTION public.attack_player_safe(UUID) TO anon, authenticated;
