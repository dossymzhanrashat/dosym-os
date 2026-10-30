import { createClient } from '@supabase/supabase-js';

// Public values only. The publishable key is meant for browsers: Row Level Security on every table
// (supabase/migrations) limits it to the signed-in user's own rows. The secret/service key and the
// VAPID private key live only in Supabase secrets — never in this repo.
export const SUPABASE_URL = 'https://bxqqqxwcepoidqizyfhq.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ju-cdaQVUy-UqSZt__rDwA_nKw3yEvv';
/** VAPID public key (application server key) for Web Push subscriptions. */
export const VAPID_PUBLIC_KEY = 'BIFje4uSvtk-UbSeWJ2dh8adQuViqKHtBIQG3OvBecOSroWyHEvJGpHEFnWEYlktNPNFCqe5m7KKV-WI6DpjNvA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Implicit flow: a login link works even when opened in a different browser than the one that
    // asked for it. The iPhone Home Screen app signs in with the emailed code instead (see Settings).
    flowType: 'implicit',
    detectSessionInUrl: true,
  },
});
