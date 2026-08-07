/**
 * Supabase Client
 * 
 * Initializes the Supabase JS client for use throughout the app.
 * Uses the public anon key (scoped by RLS policies).
 * 
 * Environment variables:
 * - NEXT_PUBLIC_SUPABASE_URL: Supabase project URL (public, safe to expose)
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY: Anon/publishable key (public, scoped by RLS)
 * 
 * IMPORTANT: SUPABASE_SERVICE_ROLE_KEY is NEVER used here.
 * It is only used in Edge Functions (server-side).
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Supabase environment variables. ' +
    'Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env.local'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
