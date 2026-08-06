// =============================================================================
// Blueprint Recovery — Edge Function: validate-coordinator
//
// Validates the coordinator password server-side against the
// COORDINATOR_PASSWORD environment variable.
// Returns a session token on success; password is NEVER exposed to client JS.
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { password } = await req.json()
    const expectedPassword = Deno.env.get('COORDINATOR_PASSWORD') || 'kenrich@202'

    if (password && password.trim() === expectedPassword.trim()) {
      // Return authorization token
      const sessionToken = `coord_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      return new Response(
        JSON.stringify({ success: true, token: sessionToken }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: false, error: 'INVALID_COORDINATOR_KEY' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
