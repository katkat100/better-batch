// Browser-side alert helpers for finished cook timers.
// All entry points are no-ops on the server / in environments without the API,
// so callers can invoke them unconditionally.

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  return audioCtx;
}

function beep(ctx: AudioContext, when: number, freq: number, durSec: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(0.25, when + 0.02);
  gain.gain.linearRampToValueAtTime(0, when + durSec);
  osc.connect(gain).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + durSec + 0.05);
}

export function playFinishChime(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  beep(ctx, t, 880, 0.18);
  beep(ctx, t + 0.30, 880, 0.18);
  beep(ctx, t + 0.60, 1175, 0.32);
}

export function vibrateFinish(): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate([200, 100, 200, 100, 400]);
  }
}

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

export function fireNotification(timerLabel: string, stepIndex: number, tag: string): Notification | null {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return null;
  const body = stepIndex >= 0 ? `Step ${stepIndex + 1}` : 'Manual timer';
  return new Notification(`Timer done: ${timerLabel}`, { body, tag });
}

let originalTitle: string | null = null;
let flashIntervalId: ReturnType<typeof setInterval> | null = null;
let flashCount = 0;

/**
 * Start a flashing-title effect. The title alternates between the alert text
 * and the original page title every second until `stopTitleFlash` is called.
 * Safe to call repeatedly; updates the count display.
 */
export function startTitleFlash(finishedCount: number): void {
  if (typeof document === 'undefined') return;
  if (originalTitle === null) originalTitle = document.title;
  flashCount = finishedCount;
  if (flashIntervalId) return;
  let toggled = false;
  flashIntervalId = setInterval(() => {
    if (typeof document === 'undefined') return;
    document.title = toggled
      ? (originalTitle ?? '')
      : `🔔 (${flashCount}) Timer done · ${originalTitle ?? ''}`;
    toggled = !toggled;
  }, 1000);
}

export function updateTitleFlashCount(finishedCount: number): void {
  flashCount = finishedCount;
}

export function stopTitleFlash(): void {
  if (flashIntervalId) {
    clearInterval(flashIntervalId);
    flashIntervalId = null;
  }
  if (typeof document !== 'undefined' && originalTitle !== null) {
    document.title = originalTitle;
  }
  originalTitle = null;
}
