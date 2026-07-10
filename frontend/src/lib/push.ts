// Lightweight browser (desktop) notifications, driven by the app's Socket.IO
// notifications. Preference is stored in localStorage. This is foreground web
// push; true background push (tab closed) would need a service worker + VAPID.

const KEY = 'desktopNotifications';

export function supportsPush(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function isPushOn(): boolean {
  return localStorage.getItem(KEY) === 'true';
}

function canShow(): boolean {
  return supportsPush() && isPushOn() && Notification.permission === 'granted';
}

/** Requests permission and turns the preference on. Returns whether it's active. */
export async function enablePush(): Promise<boolean> {
  if (!supportsPush()) return false;
  let permission = Notification.permission;
  if (permission !== 'granted') permission = await Notification.requestPermission();
  const ok = permission === 'granted';
  localStorage.setItem(KEY, ok ? 'true' : 'false');
  return ok;
}

export function disablePush(): void {
  localStorage.setItem(KEY, 'false');
}

export function showPush(title: string, body?: string): void {
  if (!canShow()) return;
  try {
    new Notification(title, { body });
  } catch {
    // Ignore — some browsers restrict construction outside a user gesture.
  }
}
