-- 009_shorten_access_codes.sql
-- Shorten all access codes to ≤16 characters to fit the input field maxLength

-- Update existing variant records with shorter codes
UPDATE variants SET correct_code = 'PARKER-616'   WHERE variant_number = 1;
UPDATE variants SET correct_code = 'SPIDER-2099'  WHERE variant_number = 2;
UPDATE variants SET correct_code = 'PUNK-138'     WHERE variant_number = 3;
UPDATE variants SET correct_code = 'MILES-1610'   WHERE variant_number = 4;
UPDATE variants SET correct_code = 'INDIA-50101'  WHERE variant_number = 5;
UPDATE variants SET correct_code = 'BYTE-22191'   WHERE variant_number = 6;
UPDATE variants SET correct_code = 'NOIR-90214'   WHERE variant_number = 7;
UPDATE variants SET correct_code = 'GWEN-65'      WHERE variant_number = 8;
UPDATE variants SET correct_code = 'SPDR-14512'   WHERE variant_number = 9;
UPDATE variants SET correct_code = 'HAM-8311'     WHERE variant_number = 10;

-- Recreate validate_checkpoint with updated fallback codes
CREATE OR REPLACE FUNCTION validate_checkpoint(
  p_team_number integer,
  p_checkpoint text,
  p_submitted_value text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_team record;
  v_correct_value text;
  v_is_correct boolean;
  v_clean_submitted text;
  v_clean_correct text;
BEGIN
  SELECT * INTO v_team FROM teams WHERE team_number = p_team_number;
  IF NOT FOUND THEN
    RETURN json_build_object('correct', false, 'error', 'Team not found');
  END IF;

  IF p_checkpoint <> 'B' THEN
    RETURN json_build_object('correct', false, 'error', 'Invalid checkpoint');
  END IF;

  IF v_team.status <> 'checkpoint_a_done' THEN
    RETURN json_build_object('correct', false, 'error', 'Checkpoint B requires location to be revealed first');
  END IF;

  SELECT correct_code INTO v_correct_value FROM variants WHERE variant_number = v_team.variant_number;
  IF NOT FOUND THEN
    -- Fallback with shortened codes (all ≤16 chars)
    v_correct_value := CASE ((p_team_number - 1) % 10) + 1
      WHEN 1 THEN 'PARKER-616'
      WHEN 2 THEN 'SPIDER-2099'
      WHEN 3 THEN 'PUNK-138'
      WHEN 4 THEN 'MILES-1610'
      WHEN 5 THEN 'INDIA-50101'
      WHEN 6 THEN 'BYTE-22191'
      WHEN 7 THEN 'NOIR-90214'
      WHEN 8 THEN 'GWEN-65'
      WHEN 9 THEN 'SPDR-14512'
      ELSE 'HAM-8311'
    END;
  END IF;

  v_clean_submitted := lower(regexp_replace(trim(p_submitted_value), '[\s\-_]', '', 'g'));
  v_clean_correct := lower(regexp_replace(trim(v_correct_value), '[\s\-_]', '', 'g'));

  v_is_correct := (v_clean_submitted = v_clean_correct);

  IF v_is_correct THEN
    UPDATE teams
    SET status = 'complete',
        complete_time = COALESCE(complete_time, now())
    WHERE team_number = p_team_number;
  ELSE
    UPDATE teams
    SET wrong_attempts_b = COALESCE(wrong_attempts_b, 0) + 1
    WHERE team_number = p_team_number;
  END IF;

  RETURN json_build_object('correct', v_is_correct);
END;
$$;

GRANT EXECUTE ON FUNCTION validate_checkpoint(integer, text, text) TO anon, authenticated;
