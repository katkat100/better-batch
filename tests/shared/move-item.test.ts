import { describe, it, expect } from 'bun:test';
import { moveItem } from '../../src/lib/shared/array';

describe('moveItem', () => {
  it('moves an element from one index to another', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 1, 2)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('moves to the end', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });

  it('moves to the start', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('returns same array (no-op) when from === to', () => {
    const arr = ['a', 'b'];
    expect(moveItem(arr, 1, 1)).toBe(arr);
  });

  it('returns same array on out-of-bounds indices', () => {
    const arr = ['a', 'b'];
    expect(moveItem(arr, -1, 0)).toBe(arr);
    expect(moveItem(arr, 0, -1)).toBe(arr);
    expect(moveItem(arr, 5, 0)).toBe(arr);
    expect(moveItem(arr, 0, 5)).toBe(arr);
  });

  it('does not mutate the input array', () => {
    const arr = ['a', 'b', 'c'];
    moveItem(arr, 0, 2);
    expect(arr).toEqual(['a', 'b', 'c']);
  });
});
