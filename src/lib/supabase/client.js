import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
      'Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env.local.'
  );
}

/**
 * Singleton Supabase client for browser/client-side use.
 *
 * Import this wherever you need Supabase access:
 *   import { supabase } from '@/lib/supabase/client';
 *
 * Do NOT import this in Server Components or server-side code.
 * Do NOT create additional Supabase clients elsewhere — reuse this singleton.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
