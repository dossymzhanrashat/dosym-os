// send-reminders: sends due rows of `reminders` as Web Push to every saved push subscription
// (SPEC.md › Calendar, planner and notifications › Notification rules).
//
// Called two ways:
//  - by pg_cron every 5 minutes with header `x-cron-secret` → all users;
//  - by a signed-in browser ("Send test notification") with its own login token → that user only.
// Deploy with --no-verify-jwt, because the cron call carries a shared secret instead of a login.
//
// Secrets (Supabase → Edge Functions → Secrets, never in git): VAPID_KEYS (JWK pair JSON), CRON_SECRET.

import { createClient } from 'jsr:@supabase/supabase-js@2.118.0';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';

const ALMATY_OFFSET_MIN = 300; // Kazakhstan: one zone, UTC+5, no daylight saving (since March 2024)
const STALE_AFTER_MS = 2 * 60 * 60 * 1000; // older unsent reminders (e.g. project was paused) are dropped
const SITE = 'https://dossymzhanrashat.github.io/dosym-os/';

interface ReminderRow {
  user_id: string;
  id: string;
  planner_item_id: string | null;
  fire_at: string;
  title: string;
  body: string;
  url: string;
  alarm: boolean;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Quiet hours 22:30–06:30 Asia/Almaty: only alarm reminders are sent inside them. */
function inQuietHours(at: Date): boolean {
  const t = new Date(at.getTime() + ALMATY_OFFSET_MIN * 60_000);
  const min = t.getUTCHours() * 60 + t.getUTCMinutes();
  return min >= 22 * 60 + 30 || min < 6 * 60 + 30;
}

/** Service-role key: the legacy variable, or the first of the newer secret keys. */
function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
  const first = Object.values(keys)[0];
  if (!first) throw new Error('No service key in the Edge Function environment');
  return first;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });

let appServer: webpush.ApplicationServer | null = null;
async function server(): Promise<webpush.ApplicationServer> {
  if (!appServer) {
    const vapidKeys = await webpush.importVapidKeys(JSON.parse(Deno.env.get('VAPID_KEYS')!));
    // The VAPID "subject" tells push services who to contact; the site URL is enough.
    appServer = await webpush.ApplicationServer.new({ contactInformation: SITE, vapidKeys });
  }
  return appServer;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Who may trigger a run: the cron job (all users) or a signed-in user (only their rows).
  let onlyUser: string | null = null;
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    const { data, error } = token ? await admin.auth.getUser(token) : { data: null, error: true };
    if (error || !data?.user) return json(401, { error: 'unauthorized' });
    onlyUser = data.user.id;
  }

  const now = new Date();
  let query = admin
    .from('reminders')
    .select('user_id, id, planner_item_id, fire_at, title, body, url, alarm')
    .is('sent_at', null)
    .lte('fire_at', now.toISOString())
    .order('fire_at')
    .limit(500);
  if (onlyUser) query = query.eq('user_id', onlyUser);
  const { data: due, error: dueError } = await query;
  if (dueError) return json(500, { error: dueError.message });
  if (!due?.length) return json(200, { sent: 0, skipped: 0 });

  const userIds = [...new Set(due.map((r) => r.user_id))];
  const { data: subs, error: subError } = await admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', userIds);
  if (subError) return json(500, { error: subError.message });

  const as = await server();
  const gone = new Set<string>();
  let sent = 0;
  let skipped = 0;

  for (const r of due as ReminderRow[]) {
    const fireAt = new Date(r.fire_at);
    // Too old, or a non-alarm inside quiet hours: mark handled without sending.
    if (now.getTime() - fireAt.getTime() > STALE_AFTER_MS || (!r.alarm && inQuietHours(now))) {
      skipped++;
    } else {
      const payload = JSON.stringify({ title: r.title, body: r.body, url: r.url, tag: r.id, alarm: r.alarm });
      for (const s of (subs ?? []) as SubscriptionRow[]) {
        if (s.user_id !== r.user_id || gone.has(s.id)) continue;
        try {
          await as
            .subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
            .pushTextMessage(payload, { urgency: r.alarm ? webpush.Urgency.High : webpush.Urgency.Normal, ttl: 3600 });
          sent++;
        } catch (e) {
          const status = e instanceof webpush.PushMessageError ? e.response.status : 0;
          // 404/410: the browser dropped this subscription — forget it.
          if (status === 404 || status === 410) gone.add(s.id);
          else console.error('push failed', status, String(e));
        }
      }
    }
    await admin
      .from('reminders')
      .update({ sent_at: now.toISOString() })
      .eq('user_id', r.user_id)
      .eq('id', r.id);
  }

  if (gone.size) await admin.from('push_subscriptions').delete().in('id', [...gone]);
  return json(200, { sent, skipped, removedSubscriptions: gone.size });
});
