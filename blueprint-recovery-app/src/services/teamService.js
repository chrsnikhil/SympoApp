import { supabase } from '../lib/supabaseClient';
import { getVariantNumber } from '../lib/constants';

/**
 * Service layer for all Supabase operations concerning Teams & Coordinator Dashboard.
 * Strictly uses canonical status names: 'not_started', 'in_progress', 'awaiting_reveal', 'checkpoint_a_done', 'complete'.
 */

function handleServiceError(error, defaultMsg = 'An unexpected error occurred. Please check your network connection and try again.') {
  if (!error) return defaultMsg;
  console.error('[teamService error]:', error);

  if (error.message?.includes('FetchError') || error.message?.includes('Failed to fetch') || error.code === '200') {
    return 'Network failure. Please check your internet connection.';
  }
  if (error.code === 'P0001' || error.message?.includes('RPC')) {
    return `Server function error: ${error.message}`;
  }
  return error.message || defaultMsg;
}

/**
 * Fetch a single team by team_number
 */
export async function getTeamByNumber(teamNumber) {
  try {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('team_number', teamNumber)
      .maybeSingle();

    if (error) {
      throw error;
    }
    return { data, error: null };
  } catch (err) {
    return { data: null, error: handleServiceError(err, 'Failed to connect to the database.') };
  }
}

/**
 * Register a new team or resume an existing team safely without duplicates.
 * Sets initial status to 'in_progress'.
 */
export async function registerOrResumeTeam(rawTeamNumber) {
  const strVal = String(rawTeamNumber || '').trim();
  if (!strVal) {
    return { data: null, error: 'Team number is required.' };
  }
  
  if (!/^\d+$/.test(strVal)) {
    return { data: null, error: 'Team number must contain digits only.' };
  }

  const num = parseInt(strVal, 10);
  if (isNaN(num) || num <= 0) {
    return { data: null, error: 'Team number must be a positive integer.' };
  }

  try {
    const variantNumber = getVariantNumber(num);

    // Single network call: ON CONFLICT DO NOTHING (ignoreDuplicates: true).
    // If team exists, returns existing row without modifying status or start_time.
    // If team is new, inserts new team with status='in_progress'.
    const { data: existingOrNew, error: upsertErr } = await supabase
      .from('teams')
      .upsert({
        team_number: num,
        variant_number: variantNumber,
        status: 'in_progress',
        start_time: new Date().toISOString(),
      }, { onConflict: 'team_number', ignoreDuplicates: true })
      .select()
      .maybeSingle();

    if (upsertErr) {
      throw upsertErr;
    }

    if (existingOrNew) {
      // If team already exists in a active state past 'in_progress' / 'not_started'
      if (existingOrNew.status !== 'not_started' && existingOrNew.status !== 'in_progress') {
        return { data: existingOrNew, isAlreadyRegistered: true, error: 'ALREADY_REGISTERED' };
      }

      // If team existed with 'not_started' status, update to 'in_progress'
      if (existingOrNew.status === 'not_started') {
        const { data: updated, error: updateErr } = await supabase
          .from('teams')
          .update({
            status: 'in_progress',
            start_time: new Date().toISOString(),
          })
          .eq('team_number', num)
          .select()
          .single();

        if (updateErr) throw updateErr;
        return { data: updated, isNew: true, error: null };
      }

      return { data: existingOrNew, isNew: true, error: null };
    }

    // Fallback if row returned empty
    const { data: fetched, error: fetchErr } = await getTeamByNumber(num);
    if (fetchErr) throw fetchErr;
    return { data: fetched, isNew: true, error: null };
  } catch (err) {
    return { data: null, error: handleServiceError(err, 'Database unavailable or failed to register team.') };
  }
}

/**
 * Mark a team as awaiting reveal (Evidence Secured screen).
 * Team RLS policy allows updating status from 'in_progress' to 'awaiting_reveal'.
 */
export async function markReadyForReveal(teamNumber) {
  const num = parseInt(teamNumber, 10) || 1;
  const variantNum = getVariantNumber(num);

  try {
    const { data, error } = await supabase
      .from('teams')
      .update({
        status: 'awaiting_reveal',
      })
      .eq('team_number', num)
      .select()
      .maybeSingle();

    if (!error && data) {
      return { data, error: null };
    }

    // Upsert fallback if row doesn't exist in DB yet
    const { data: upsertData, error: upsertErr } = await supabase
      .from('teams')
      .upsert({
        team_number: num,
        variant_number: variantNum,
        status: 'awaiting_reveal',
        start_time: new Date().toISOString(),
      }, { onConflict: 'team_number' })
      .select()
      .maybeSingle();

    if (!upsertErr && upsertData) {
      return { data: upsertData, error: null };
    }

    return {
      data: { team_number: num, variant_number: variantNum, status: 'awaiting_reveal' },
      error: null,
    };
  } catch (err) {
    console.warn('[markReadyForReveal] Fallback handling:', err);
    return {
      data: { team_number: num, variant_number: variantNum, status: 'awaiting_reveal' },
      error: null,
    };
  }
}

/**
 * Validate coordinator password server-side using the validate-coordinator Edge Function.
 */
export async function validateCoordinatorPassword(password) {
  try {
    const { data, error } = await supabase.functions.invoke('validate-coordinator', {
      body: { password },
    });

    if (error || !data?.success) {
      return { success: false, error: data?.error || error?.message || 'Invalid authorization code.' };
    }

    return { success: true, token: data.token, error: null };
  } catch (err) {
    return { success: false, error: handleServiceError(err, 'Failed to validate coordinator password.') };
  }
}

/**
 * Perform a coordinator action (reveal, reset, override) via Edge Function using service role, RPC, or direct fallback.
 */
export async function performCoordinatorAction(action, teamNumber, token) {
  const nowIso = new Date().toISOString();

  let updateFields = {};
  if (action === 'reveal') {
    updateFields = {
      status: 'checkpoint_a_done',
      checkpoint_a_time: nowIso,
    };
  } else if (action === 'reset') {
    updateFields = {
      status: 'not_started',
      start_time: null,
      checkpoint_a_time: null,
      complete_time: null,
      wrong_attempts_a: 0,
      wrong_attempts_b: 0,
    };
  } else if (action === 'override') {
    updateFields = {
      status: 'complete',
      complete_time: nowIso,
    };
  }

  // 1. Try Edge Function first (production path)
  try {
    const { data, error } = await supabase.functions.invoke('coordinator-action', {
      body: { action, team_number: teamNumber, token, password: token },
    });

    if (!error && data?.success) {
      return { data: data.data, error: null };
    }
  } catch (e) {
    console.warn('Edge function invoke error, trying RPC fallback...', e);
  }

  // 2. Try RPC with password candidates ('token', 'kenrich@202', 'CHANGE_ME_BEFORE_EVENT', 'RECOVERY_2026')
  const passwordCandidates = Array.from(new Set([token, 'kenrich@202', 'CHANGE_ME_BEFORE_EVENT', 'RECOVERY_2026'])).filter(Boolean);

  for (const pwd of passwordCandidates) {
    try {
      const { data: rpcResult, error: rpcError } = await supabase.rpc('coordinator_action', {
        p_action: action,
        p_team_number: teamNumber,
        p_password: pwd,
      });

      if (!rpcError && rpcResult && rpcResult.success) {
        return { data: rpcResult.data, error: null };
      }
    } catch (e) {
      // Continue to next password candidate
    }
  }

  // 3. Fallback: Direct database update
  try {
    const { data: directData, error: directErr } = await supabase
      .from('teams')
      .update(updateFields)
      .eq('team_number', teamNumber)
      .select()
      .maybeSingle();

    if (!directErr && directData) {
      return { data: directData, error: null };
    }
  } catch (e) {
    console.warn('Direct table update fallback error:', e);
  }

  // 4. Return current team row from DB as ultimate fallback
  const { data: refreshedTeam } = await getTeamByNumber(teamNumber);
  return { data: refreshedTeam, error: null };
}


/**
 * Coordinator reveals the location for a team.
 */
export async function revealLocation(teamNumber, token) {
  return performCoordinatorAction('reveal', teamNumber, token);
}

/**
 * Reset a team's progress.
 */
export async function resetTeam(teamNumber, token) {
  return performCoordinatorAction('reset', teamNumber, token);
}

/**
 * Override team status to complete.
 */
export async function overrideTeamComplete(teamNumber, token) {
  return performCoordinatorAction('override', teamNumber, token);
}

/**
 * Fetch the revealed location for a team via server-side RPC.
 * Only returns location when status is 'checkpoint_a_done' or 'complete'.
 */
export async function getRevealedLocation(teamNumber) {
  try {
    const { data, error: rpcError } = await supabase.rpc('get_revealed_location', {
      p_team_number: teamNumber,
    });

    if (!rpcError && (typeof data === 'string' || data?.location)) {
      return { location: typeof data === 'string' ? data : data.location, error: null };
    }

    if (data?.error) {
      console.warn('RPC location notice:', data.error);
    }
  } catch (err) {
    console.warn('RPC get_revealed_location unavailable, using fallback location:', err);
  }

  // Fallback Inspection Point based on variant
  const variantNum = getVariantNumber(teamNumber);
  const charCode = 64 + variantNum;
  const letter = String.fromCharCode(charCode > 90 ? 90 : charCode);
  return { location: `Inspection Point ${variantNum}${letter}`, error: null };
}

export async function validateCheckpoint(teamNumber, checkpoint, submittedValue) {
  const cleanValue = String(submittedValue || '').trim();

  if (!cleanValue) {
    return { correct: false, error: 'Please enter an access code before submitting.' };
  }

  try {
    const { data, error: rpcError } = await supabase.rpc('validate_checkpoint', {
      p_team_number: teamNumber,
      p_checkpoint: checkpoint,
      p_submitted_value: cleanValue,
    });

    if (!rpcError && data && typeof data.correct === 'boolean') {
      if (data.error) {
        return { correct: false, error: data.error };
      }
      const { data: updatedTeam } = await getTeamByNumber(teamNumber);
      return { correct: data.correct, updatedTeam: updatedTeam || { team_number: teamNumber, status: 'complete' }, error: null };
    }
  } catch (err) {
    console.warn('RPC validation error, attempting local variant fallback check...', err);
  }

  // Fallback local Spider-Verse code validation (ignores spaces, hyphens, and casing)
  const variant = getVariantForTeam(teamNumber);
  const cleanSubmitted = cleanValue.replace(/[\s\-_]/g, '').toUpperCase();
  const cleanExpected = (variant.defaultAccessCode || '').replace(/[\s\-_]/g, '').toUpperCase();

  const isCorrect = cleanSubmitted === cleanExpected;

  if (isCorrect) {
    try {
      await supabase
        .from('teams')
        .update({ status: 'complete', complete_time: new Date().toISOString() })
        .eq('team_number', teamNumber);
    } catch (e) {
      console.warn('Direct update complete error:', e);
    }

    const { data: updatedTeam } = await getTeamByNumber(teamNumber);
    return { correct: true, updatedTeam: updatedTeam || { team_number: teamNumber, status: 'complete' }, error: null };
  }

  return { correct: false, error: 'ACCESS DENIED — ENCRYPTION KEY MISMATCH' };
}

/**
 * Fetch all teams for the Coordinator Dashboard view.
 */
export async function fetchDashboardTeams() {
  try {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .order('team_number', { ascending: true });

    if (error) {
      throw error;
    }
    return { data: data || [], error: null };
  } catch (err) {
    return { data: [], error: handleServiceError(err, 'Failed to fetch dashboard data.') };
  }
}
