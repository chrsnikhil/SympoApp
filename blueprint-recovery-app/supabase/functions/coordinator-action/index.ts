// =============================================================================
// Blueprint Recovery — Edge Function: coordinator-action
//
// Gated coordinator operations (Reveal, Reset, Override).
// Authenticates request token or password, then executes database updates
// using SUPABASE_SERVICE_ROLE_KEY to bypass RLS policies.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, team_number, token, password } = await req.json()

    // Server-side password check fallback or token verification
    const expectedPassword = Deno.env.get('COORDINATOR_PASSWORD') || 'kenrich@202'
    const isValidAuth =
      (token && typeof token === 'string' && token.startsWith('coord_')) ||
      (password && password.trim() === expectedPassword.trim())

    if (!isValidAuth) {
      return new Response(
        JSON.stringify({ success: false, error: 'UNAUTHORIZED_COORDINATOR_ACTION' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!team_number) {
      return new Response(
        JSON.stringify({ success: false, error: 'team_number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase admin client with SERVICE ROLE KEY
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    )

    const nowIso = new Date().toISOString()
    let updatePayload = {}

    switch (action) {
      case 'reveal':
        updatePayload = {
          status: 'checkpoint_a_done',
          checkpoint_a_time: nowIso,
        }
        break

      case 'reset':
        updatePayload = {
          status: 'not_started',
          start_time: null,
          checkpoint_a_time: null,
          complete_time: null,
          wrong_attempts_b: 0,
        }
        break

      case 'override':
        updatePayload = {
          status: 'complete',
          complete_time: nowIso,
        }
        break

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Invalid action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    const { data, error } = await supabaseAdmin
      .from('teams')
      .update(updatePayload)
      .eq('team_number', team_number)
      .select()
      .single()

    if (error) {
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
