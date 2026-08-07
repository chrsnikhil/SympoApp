// =============================================================================
// Blueprint Recovery — Edge Function: validate-checkpoint (REFERENCE ONLY)
//
// NOTE: This is a REFERENCE IMPLEMENTATION. The active version is the Postgres
// RPC function (validate_checkpoint) in 003_reveal_flow.sql.
//
// As of v3 (Reveal Flow), only Checkpoint B is supported.
// Checkpoint A has been replaced by a coordinator-confirmed reveal system.
//
// DEPLOYMENT: Deploy to Supabase via CLI or Dashboard:
//   CLI:       supabase functions deploy validate-checkpoint
//   Dashboard: Edge Functions → Create → paste this code → Deploy
//
// To switch from RPC to Edge Function in production, change the frontend from:
//   supabase.rpc('validate_checkpoint', {...})
// to:
//   supabase.functions.invoke('validate-checkpoint', { body: {...} })
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { team_number, checkpoint, submitted_value } = await req.json()

    // Only checkpoint B is supported — checkpoint A has been replaced by
    // coordinator-confirmed reveal flow
    if (checkpoint !== 'B') {
      return new Response(
        JSON.stringify({ correct: false, error: 'Only checkpoint B is supported' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with SERVICE ROLE KEY (server-side only, bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    // Get team's assigned variant number and status
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('variant_number, status')
      .eq('team_number', team_number)
      .single()

    if (teamError || !team) {
      return new Response(
        JSON.stringify({ correct: false, error: 'Team not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Checkpoint B requires location_revealed status
    if (team.status !== 'location_revealed') {
      return new Response(
        JSON.stringify({ correct: false, error: 'Checkpoint B requires location to be revealed first' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get correct code for this variant (only service role can read variants table)
    const { data: variant, error: variantError } = await supabase
      .from('variants')
      .select('correct_code')
      .eq('variant_number', team.variant_number)
      .single()

    if (variantError || !variant) {
      return new Response(
        JSON.stringify({ correct: false, error: 'Variant not found' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Case-insensitive, trimmed comparison
    const isCorrect = submitted_value.trim().toLowerCase() === variant.correct_code.trim().toLowerCase()

    if (isCorrect) {
      await supabase
        .from('teams')
        .update({ status: 'complete', complete_time: new Date().toISOString() })
        .eq('team_number', team_number)
    } else {
      // Increment wrong attempts counter
      const { data: current } = await supabase
        .from('teams')
        .select('wrong_attempts_b')
        .eq('team_number', team_number)
        .single()

      await supabase
        .from('teams')
        .update({ wrong_attempts_b: (current.wrong_attempts_b || 0) + 1 })
        .eq('team_number', team_number)
    }

    return new Response(
      JSON.stringify({ correct: isCorrect }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ correct: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
