import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const idMap = new Map<string, number>();
let nextNumericId = 1;

// Bump the suffix (v1 → v2 → ...) any time we change channel attributes.
// Android keeps channel settings locked once created, so a new id is the
// only way to push a new importance/visibility/sound config to installed users.
const CHANNEL_ID = 'cook-timers-v1';
let channelEnsured = false;

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

function buildBody(label: string, stepIndex: number): string {
  return stepIndex >= 0 ? `Step ${stepIndex + 1} · ${label}` : `Manual timer · ${label}`;
}

async function ensureChannel(): Promise<void> {
  if (channelEnsured) return;
  if (!isNative()) return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Cook Timers',
      description: 'Alerts when cook timers finish',
      importance: 5,           // MAX — heads-up banner + sound
      visibility: 1,           // PUBLIC — show full content on lock screen
      vibration: true
    });
    channelEnsured = true;
  } catch (err) {
    console.error('[cook-notifications] createChannel failed', err);
  }
}

export async function scheduleTimerNotification(
  timerId: string,
  ms: number,
  label: string,
  stepIndex: number
): Promise<void> {
  if (!isNative()) return;
  await ensureChannel();
  const numericId = nextNumericId++;
  idMap.set(timerId, numericId);
  const at = new Date(Date.now() + ms);
  try {
    const result = await LocalNotifications.schedule({
      notifications: [{
        id: numericId,
        title: 'Timer done',
        body: buildBody(label, stepIndex),
        channelId: CHANNEL_ID,
        schedule: { at }
      }]
    });
    console.log('[cook-notifications] scheduled', { timerId, numericId, ms, at: at.toISOString(), result });
  } catch (err) {
    console.error('[cook-notifications] schedule failed', { timerId, numericId, ms, at: at.toISOString(), err });
  }
}

export async function cancelTimerNotification(timerId: string): Promise<void> {
  if (!isNative()) return;
  const numericId = idMap.get(timerId);
  if (numericId === undefined) return;
  idMap.delete(timerId);
  try {
    await LocalNotifications.cancel({ notifications: [{ id: numericId }] });
  } catch (err) {
    console.error('[cook-notifications] cancel failed', { timerId, numericId, err });
  }
}

export async function cancelAllTimerNotifications(): Promise<void> {
  if (!isNative()) return;
  if (idMap.size === 0) return;
  const ids = [...idMap.values()].map(id => ({ id }));
  idMap.clear();
  try {
    await LocalNotifications.cancel({ notifications: ids });
  } catch (err) {
    console.error('[cook-notifications] cancelAll failed', { ids, err });
  }
}

export function _resetForTests(): void {
  idMap.clear();
  nextNumericId = 1;
  channelEnsured = false;
}
