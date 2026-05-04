import { describe, it, expect } from 'bun:test';
import { slugify, uniqueSlug } from '../../src/lib/server/domain/slug';

describe('slugify', () => {
  it('lowercases and dashes', () => {
    expect(slugify('Sourdough Loaf')).toBe('sourdough-loaf');
  });
  it('strips punctuation', () => {
    expect(slugify("Mom's 70% bread!")).toBe('moms-70-bread');
  });
  it('collapses whitespace and dashes', () => {
    expect(slugify('   a   b---c   ')).toBe('a-b-c');
  });
  it('returns "untitled" for empty input', () => {
    expect(slugify('   ')).toBe('untitled');
  });
});

describe('uniqueSlug', () => {
  it('returns base when not taken', () => {
    expect(uniqueSlug('foo', new Set())).toBe('foo');
  });
  it('appends -2 when taken', () => {
    expect(uniqueSlug('foo', new Set(['foo']))).toBe('foo-2');
  });
  it('keeps incrementing', () => {
    expect(uniqueSlug('foo', new Set(['foo', 'foo-2', 'foo-3']))).toBe('foo-4');
  });
});
