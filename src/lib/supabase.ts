import { createClient, type SupabaseClient } from '@supabase/supabase-js';

declare global {
  interface Window {
    __HANABI_CONFIG__?: { supabaseUrl?: string; supabaseAnonKey?: string };
  }
}

/**
 * Credentials resolve in this order:
 *  1. window.__HANABI_CONFIG__ — injected by the gateway at request time, so a
 *     deployment can enable cloud sync without rebuilding the bundle.
 *  2. VITE_* env vars — used by the Vite dev server via .env.local.
 */
const runtime = typeof window === 'undefined' ? undefined : window.__HANABI_CONFIG__;

export const supabaseUrl = runtime?.supabaseUrl || (import.meta.env.VITE_SUPABASE_URL as string | undefined);
export const supabaseAnonKey = runtime?.supabaseAnonKey || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

/**
 * Demo-mode first: the app works fully with local persistence.
 * When Supabase credentials are present and the client initializes,
 * auth and library data sync to the cloud instead.
 */
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export const isCloudEnabled = supabase !== null;
