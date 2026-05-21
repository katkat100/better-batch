import { describe, it, expect, beforeEach, mock } from 'bun:test';

// Module-level mocks. The Capacitor + LocalNotifications modules are mocked
// per-test to control isNativePlatform and observe schedule/cancel calls.
let isNative = false;
const scheduleCalls: Array<{ notifications: Array<{ id: number; title: string; body: string; schedule: { at: Date } }> }> = [];
const cancelCalls: Array<{ notifications: Array<{ id: number }> }> = [];

mock.module('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNative
  }
}));

mock.module('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    schedule: async (opts: typeof scheduleCalls[number]) => { scheduleCalls.push(opts); return { notifications: [] }; },
    cancel: async (opts: typeof cancelCalls[number]) => { cancelCalls.push(opts); }
  }
}));

import {
  scheduleTimerNotification,
  cancelTimerNotification,
  cancelAllTimerNotifications,
  _resetForTests
} from '../../../src/lib/ui/cook/cook-notifications';

beforeEach(() => {
  scheduleCalls.length = 0;
  cancelCalls.length = 0;
  isNative = false;
  _resetForTests();
});

describe('cook-notifications on web (isNativePlatform = false)', () => {
  it('scheduleTimerNotification is a no-op', async () => {
    await scheduleTimerNotification('t1', 5000, 'rest', 0);
    expect(scheduleCalls.length).toBe(0);
  });

  it('cancelTimerNotification is a no-op', async () => {
    await cancelTimerNotification('t1');
    expect(cancelCalls.length).toBe(0);
  });

  it('cancelAllTimerNotifications is a no-op', async () => {
    await cancelAllTimerNotifications();
    expect(cancelCalls.length).toBe(0);
  });
});

describe('cook-notifications on native (isNativePlatform = true)', () => {
  beforeEach(() => { isNative = true; });

  it('scheduleTimerNotification assigns a numeric id and calls LocalNotifications.schedule', async () => {
    await scheduleTimerNotification('uuid-a', 10000, 'rest', 2);
    expect(scheduleCalls.length).toBe(1);
    expect(scheduleCalls[0].notifications.length).toBe(1);
    const n = scheduleCalls[0].notifications[0];
    expect(typeof n.id).toBe('number');
    expect(n.title).toBe('Timer done');
    expect(n.body).toBe('Step 3 · rest');
    expect(n.schedule.at).toBeInstanceOf(Date);
  });

  it('uses "Manual timer" body when stepIndex is negative', async () => {
    await scheduleTimerNotification('uuid-m', 5000, 'sauce reduction', -1);
    expect(scheduleCalls[0].notifications[0].body).toBe('Manual timer · sauce reduction');
  });

  it('cancelTimerNotification looks up the numeric id and calls LocalNotifications.cancel', async () => {
    await scheduleTimerNotification('uuid-b', 1000, 'rest', 0);
    const numericId = scheduleCalls[0].notifications[0].id;
    await cancelTimerNotification('uuid-b');
    expect(cancelCalls.length).toBe(1);
    expect(cancelCalls[0].notifications).toEqual([{ id: numericId }]);
  });

  it('cancelTimerNotification is a no-op for unknown timer IDs', async () => {
    await cancelTimerNotification('never-scheduled');
    expect(cancelCalls.length).toBe(0);
  });

  it('cancelAllTimerNotifications cancels every scheduled timer in one batch', async () => {
    await scheduleTimerNotification('a', 1000, 'one', 0);
    await scheduleTimerNotification('b', 2000, 'two', 1);
    await cancelAllTimerNotifications();
    expect(cancelCalls.length).toBe(1);
    expect(cancelCalls[0].notifications.length).toBe(2);
  });

  it('scheduling the same timer ID twice reuses no state — second schedule allocates a new numeric id', async () => {
    await scheduleTimerNotification('a', 1000, 'one', 0);
    const firstId = scheduleCalls[0].notifications[0].id;
    await scheduleTimerNotification('a', 2000, 'two', 0);
    const secondId = scheduleCalls[1].notifications[0].id;
    expect(secondId).not.toBe(firstId);
    await cancelTimerNotification('a');
    expect(cancelCalls[0].notifications).toEqual([{ id: secondId }]);
  });
});
