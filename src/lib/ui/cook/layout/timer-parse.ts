export interface TimerMatch {
  start: number;
  end: number;
  durationMs: number;
  label: string;
}

const COMPOUND = /\b(\d+)\s*(?:hours?|hrs?|h)\s+(\d+)\s*(?:minutes?|mins?|m)\b/gi;
const HOURS = /\b(\d+)\s*(?:hours?|hrs?|h)\b/gi;
const MINUTES = /\b(\d+)\s*(?:minutes?|mins?|m)\b/gi;
const SECONDS = /\b(\d+)\s*(?:seconds?|secs?|s)\b/gi;

interface RawMatch { start: number; end: number; durationMs: number; }

export function parseTimers(text: string): TimerMatch[] {
  const raws: RawMatch[] = [];

  for (const m of text.matchAll(COMPOUND)) {
    raws.push({
      start: m.index!,
      end: m.index! + m[0].length,
      durationMs: (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 60_000
    });
  }
  for (const m of text.matchAll(HOURS)) {
    raws.push({ start: m.index!, end: m.index! + m[0].length, durationMs: parseInt(m[1], 10) * 3_600_000 });
  }
  for (const m of text.matchAll(MINUTES)) {
    raws.push({ start: m.index!, end: m.index! + m[0].length, durationMs: parseInt(m[1], 10) * 60_000 });
  }
  for (const m of text.matchAll(SECONDS)) {
    raws.push({ start: m.index!, end: m.index! + m[0].length, durationMs: parseInt(m[1], 10) * 1000 });
  }

  // De-dupe overlapping matches: keep longest, then leftmost.
  raws.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const filtered: RawMatch[] = [];
  let lastEnd = -1;
  for (const r of raws) {
    if (r.start >= lastEnd) {
      filtered.push(r);
      lastEnd = r.end;
    }
  }

  // Skip matches preceded by ° (with optional digits/spaces)
  const cleaned = filtered.filter(r => {
    const before = text.slice(Math.max(0, r.start - 8), r.start);
    return !/°\s*\w*\s*$/.test(before);
  });

  // Add labels
  return cleaned.map(r => ({
    start: r.start,
    end: r.end,
    durationMs: r.durationMs,
    label: extractLabel(text, r.start)
  }));
}

function extractLabel(text: string, matchStart: number): string {
  const prefix = text.slice(0, matchStart);
  // Split on sentence boundaries and commas, take the last segment
  const segments = prefix.split(/[.!?:,]/);
  const lastSegment = segments[segments.length - 1] ?? '';
  const words = lastSegment.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'timer';
  return words.slice(-4).join(' ');
}
