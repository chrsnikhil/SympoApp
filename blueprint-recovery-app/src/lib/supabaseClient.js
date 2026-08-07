/**
 * Supabase Client
 * 
 * Initializes the Supabase JS client for use throughout the app.
 * Uses the public anon key (scoped by RLS policies).
 * 
 * Environment variables (Backend Schema Section 5):
 * - VITE_SUPABASE_URL: Supabase project URL (public, safe to expose)
 * - VITE_SUPABASE_ANON_KEY: Anon/publishable key (public, scoped by RLS)
 * 
 * IMPORTANT: SUPABASE_SERVICE_ROLE_KEY is NEVER used here.
 * It is only used in Edge Functions (server-side).
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Supabase environment variables. ' +
    'Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env.local'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
