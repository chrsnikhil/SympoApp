-- 007_spiderverse_variants_seed.sql
-- Drop old variant number constraint (max 7) and update to 10 variants with Spider-Verse Earth Sector Names

ALTER TABLE variants DROP CONSTRAINT IF EXISTS variants_variant_number_check;
ALTER TABLE variants ADD CONSTRAINT variants_variant_number_check CHECK (variant_number >= 1 AND variant_number <= 10);

-- Seed variants table with 10 Sector Variants & Spider-Verse Access Codes for 60 Teams
INSERT INTO variants (variant_number, color, sector_name, correct_location, correct_code) VALUES
  (1,  'Red',     'Earth-616',   'Inspection Point 1A',    'PETER-PARKER-616'),
  (2,  'Blue',    'Earth-928',   'Inspection Point 2B',    'SPIDER-MAN-2099'),
  (3,  'Green',   'Earth-138',   'Inspection Point 3C',    'SPIDER-PUNK-138'),
  (4,  'Yellow',  'Earth-1610',  'Inspection Point 4D',    'MILES-MORALES-1610'),
  (5,  'Orange',  'Earth-50101', 'Inspection Point 5E',    'SPIDER-INDIA-50101'),
  (6,  'Purple',  'Earth-22191', 'Inspection Point 6F',    'SPIDER-BYTE-22191'),
  (7,  'Black',   'Earth-90214', 'Inspection Point 7G',    'SPIDER-NOIR-1935'),
  (8,  'White',   'Earth-65',    'Inspection Point 8H',    'SPIDER-GWEN-65'),
  (9,  'Pink',    'Earth-14512', 'Inspection Point 9I',    'SP//DR-14512'),
  (10, 'Brown',   'Earth-8311',  'Inspection Point 10J',   'SPIDER-HAM-8311')
ON CONFLICT (variant_number) DO UPDATE SET
  color = EXCLUDED.color,
  sector_name = EXCLUDED.sector_name,
  correct_location = EXCLUDED.correct_location,
  correct_code = EXCLUDED.correct_code;

-- Flexible validation function that ignores hyphens, spaces, and casing
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
    -- Fallback default variant matching
    v_correct_value := CASE ((p_team_number - 1) % 10) + 1
      WHEN 1 THEN 'PETER-PARKER-616'
      WHEN 2 THEN 'SPIDER-MAN-2099'
      WHEN 3 THEN 'SPIDER-PUNK-138'
      WHEN 4 THEN 'MILES-MORALES-1610'
      WHEN 5 THEN 'SPIDER-INDIA-50101'
      WHEN 6 THEN 'SPIDER-BYTE-22191'
      WHEN 7 THEN 'SPIDER-NOIR-1935'
      WHEN 8 THEN 'SPIDER-GWEN-65'
      WHEN 9 THEN 'SP//DR-14512'
      ELSE 'SPIDER-HAM-8311'
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
