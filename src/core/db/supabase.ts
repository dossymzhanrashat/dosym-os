import { createClient } from '@supabase/supabase-js';

// Public values only. The publishable key is meant for browsers: Row Level Security on every table
// (supabase/migrations) limits it to the signed-in user's own rows. The secret/service key and the
// VAPID private key live only in Supabase secrets — never in this repo.
export const SUPABASE_URL = 'https://bxqqqxwcepoidqizyfhq.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ju-cdaQVUy-UqSZt__rDwA_nKw3yEvv';
/** VAPID public key (application server key) for Web Push subscriptions. */
export const VAPID_PUBLIC_KEY = 'BIFje4uSvtk-UbSeWJ2dh8adQuViqKHtBIQG3OvBecOSroWyHEvJGpHEFnWEYlktNPNFCqe5m7KKV-WI6DpjNvA';

// Email + password login (sign-ups are switched off in Supabase; the one account was made in the
// dashboard). The session is kept in this browser's storage and refreshed automatically, so each
// device stays signed in until "Sign out".
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // no login links
  },
});
