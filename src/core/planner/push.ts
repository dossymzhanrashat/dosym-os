import { sb, VAPID_PUBLIC_KEY } from '../db/supabase';

/*
 * Web Push on this device (SPEC.md › Notification rules › Settings → Notifications).
 * On iPhone, push only works in the Home Screen app (iOS 16.4+), and permission must be asked
 * from a button tap — so enablePush() must be called straight from a click handler.
 */

export interface PushDevice {
  id: string;
  endpoint: string;
  device_label: string;
  created_at: string;
}

export function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export type PushSupport = 'ok' | 'install-first' | 'unsupported';
export function pushSupport(): PushSupport {
  const apis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIOS() && !isStandalone()) return 'install-first';
  return apis ? 'ok' : 'unsupported';
}

export function permission(): NotificationPermission | 'unsupported' {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

export function guessDeviceLabel(): string {
  const ua = navigator.userAgent;
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || isIOS() ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : 'Safari';
  return isStandalone() ? `${device} · Home Screen app` : `${device} · ${browser}`;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Ask permission, subscribe this browser and save the subscription. Call from a tap. */
export async function enablePush(label: string): Promise<void> {
  // First await must be the permission prompt, while the tap still counts as a user gesture.
  const result = await Notification.requestPermission();
  if (result !== 'granted') throw new Error('Notifications were not allowed. You can allow them in the phone or browser settings.');
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  const json = sub.toJSON();
  const { error } = await (await sb()).from('push_subscriptions').upsert(
    { endpoint: sub.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth, device_label: label.trim() || guessDeviceLabel() },
    { onConflict: 'endpoint' },
  );
  if (error) throw new Error(error.message);
}

export async function thisEndpoint(): Promise<string | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager?.getSubscription())?.endpoint ?? null;
}

export async function listDevices(): Promise<PushDevice[]> {
  const { data, error } = await (await sb()).from('push_subscriptions').select('id, endpoint, device_label, created_at').order('created_at');
  if (error) throw new Error(error.message);
  return data;
}

export async function removeDevice(device: PushDevice): Promise<void> {
  if (device.endpoint === (await thisEndpoint())) {
    const reg = await navigator.serviceWorker.getRegistration();
    await (await reg?.pushManager.getSubscription())?.unsubscribe();
  }
  const { error } = await (await sb()).from('push_subscriptions').delete().eq('id', device.id);
  if (error) throw new Error(error.message);
}

/** Queues a reminder due now and asks the function to send it straight away. */
export async function sendTestNotification(): Promise<{ sent: number }> {
  const { error } = await (await sb()).from('reminders').insert({
    id: `test:${Date.now()}`,
    fire_at: new Date().toISOString(),
    title: 'Dosym OS test',
    body: 'Reminders reach this device.',
    url: import.meta.env.BASE_URL + 'settings',
    alarm: true, // a test should arrive even inside quiet hours
  });
  if (error) throw new Error(error.message);
  const { data, error: fnError } = await (await sb()).functions.invoke<{ sent: number }>('send-reminders', { body: {} });
  if (fnError) throw new Error(fnError.message);
  return data ?? { sent: 0 };
}
