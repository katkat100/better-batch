import { describe, it, expect } from 'bun:test';
import {
  mapIndexThroughRemove,
  mapIndexThroughMove,
  checkedAfterRemove,
  checkedAfterMove
} from '../../../src/lib/ui/cook/layout/remap-cook-state';
import { moveItem } from '../../../src/lib/shared/array';

describe('mapIndexThroughRemove', () => {
  it('drops the removed index, shifts higher indices down', () => {
    expect(mapIndexThroughRemove(2, 2)).toBeNull();
    expect(mapIndexThroughRemove(3, 2)).toBe(2);
    expect(mapIndexThroughRemove(1, 2)).toBe(1);
    expect(mapIndexThroughRemove(-1, 2)).toBe(-1); // manual timer
  });
});

describe('mapIndexThroughMove', () => {
  // Verify against moveItem: element originally at index x ends up at mapIndexThroughMove(x,...).
  const verify = (from: number, to: number) => {
    const arr = ['a', 'b', 'c', 'd', 'e'];
    const moved = moveItem(arr, from, to);
    for (let x = 0; x < arr.length; x++) {
      expect(moved[mapIndexThroughMove(x, from, to)]).toBe(arr[x]);
    }
  };
  it('matches moveItem for forward and backward moves', () => {
    verify(1, 3);
    verify(3, 1);
    verify(0, 4);
  });
  it('leaves manual timer index (-1) untouched', () => {
    expect(mapIndexThroughMove(-1, 1, 3)).toBe(-1);
  });
});

describe('checkedAfterRemove / checkedAfterMove', () => {
  it('remaps a checked set through a remove', () => {
    expect([...checkedAfterRemove(new Set([0, 2, 3]), 2)].sort()).toEqual([0, 2]);
  });
  it('remaps a checked set through a move', () => {
    expect([...checkedAfterMove(new Set([1, 3]), 1, 3)].sort()).toEqual([2, 3]);
  });
});
