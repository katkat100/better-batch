import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const idMap = new Map<string, number>();
let nextNumericId = 1;

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

function buildBody(label: string, stepIndex: number): string {
  return stepIndex >= 0 ? `Step ${stepIndex + 1} · ${label}` : `Manual timer · ${label}`;
}

export async function scheduleTimerNotification(
  timerId: string,
  ms: number,
  label: string,
  stepIndex: number
): Promise<void> {
  if (!isNative()) return;
  const numericId = nextNumericId++;
  idMap.set(timerId, numericId);
  await LocalNotifications.schedule({
    notifications: [{
      id: numericId,
      title: 'Timer done',
      body: buildBody(label, stepIndex),
      schedule: { at: new Date(Date.now() + ms) }
    }]
  });
}

export async function cancelTimerNotification(timerId: string): Promise<void> {
  if (!isNative()) return;
  const numericId = idMap.get(timerId);
  if (numericId === undefined) return;
  idMap.delete(timerId);
  await LocalNotifications.cancel({ notifications: [{ id: numericId }] });
}

export async function cancelAllTimerNotifications(): Promise<void> {
  if (!isNative()) return;
  if (idMap.size === 0) return;
  const ids = [...idMap.values()].map(id => ({ id }));
  idMap.clear();
  await LocalNotifications.cancel({ notifications: ids });
}

export function _resetForTests(): void {
  idMap.clear();
  nextNumericId = 1;
}
