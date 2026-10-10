import { describe, expect, it } from 'vitest';

import {
  currentPercents,
  movePercent,
  pairRatioText,
  percentOf,
  percentSum,
  percentsReady,
  samePercents,
  snapPercent,
} from './sharePercents';

const TWO = ['a', 'b'];
const THREE = ['a', 'b', 'c'];

describe('회비 비율', () => {
  it('둘이면 한 사람을 옮기면 다른 사람이 100 에서 뺀 값으로 따라온다', () => {
    expect(movePercent(TWO, null, 'a', 60)).toEqual({ a: 60, b: 40 });
    expect(movePercent(TWO, { a: 60, b: 40 }, 'b', 100)).toEqual({ a: 0, b: 100 });
    expect(movePercent(TWO, { a: 60, b: 40 }, 'a', 0)).toEqual({ a: 0, b: 100 });
  });

  it('셋 이상이면 그 사람만 바뀌고, 똑같이에서 시작하면 나머지는 10 단위로 맞춘 몫이다', () => {
    expect(movePercent(THREE, null, 'a', 40)).toEqual({ a: 40, b: 30, c: 30 });
    expect(movePercent(THREE, { a: 40, b: 30, c: 30 }, 'b', 20)).toEqual({ a: 40, b: 20, c: 30 });
  });

  it('합이 100 이어야 저장된다. 똑같이는 늘 된다', () => {
    expect(percentsReady(THREE, null)).toBe(true);
    expect(percentsReady(THREE, { a: 40, b: 30, c: 30 })).toBe(true);
    expect(percentsReady(THREE, { a: 40, b: 20, c: 30 })).toBe(false);
    expect(percentSum({ a: 40, b: 20, c: 30 })).toBe(90);
    // 멤버 하나가 빠진 비율은 저장할 수 없다.
    expect(percentsReady(THREE, { a: 50, b: 50 })).toBe(false);
  });

  it('막대는 0~100 의 10 단위로만 선다', () => {
    expect(snapPercent(33)).toBe(30);
    expect(snapPercent(35)).toBe(40);
    expect(snapPercent(-10)).toBe(0);
    expect(snapPercent(130)).toBe(100);
    expect(snapPercent(Number.NaN)).toBe(0);
  });

  it('똑같이일 때 막대 값은 인원수대로 나눈 몫이다', () => {
    expect(percentOf(TWO, null, 'a')).toBe(50);
    expect(percentOf(THREE, null, 'a')).toBeCloseTo(33.33, 1);
    expect(percentOf(TWO, { a: 70, b: 30 }, 'b')).toBe(30);
  });

  it('저장된 비율이 지금 멤버와 안 맞으면 똑같이로 본다', () => {
    expect(currentPercents(TWO, { a: 60, b: 40 })).toEqual({ a: 60, b: 40 });
    expect(currentPercents(THREE, { a: 60, b: 40 })).toBeNull();
    expect(currentPercents(TWO, null)).toBeNull();
  });

  it('둘일 때만 줄에 「6:4」 를 적는다', () => {
    expect(pairRatioText(TWO, { a: 60, b: 40 })).toBe('6:4');
    expect(pairRatioText(TWO, { a: 100, b: 0 })).toBe('10:0');
    expect(pairRatioText(TWO, null)).toBeNull();
    expect(pairRatioText(THREE, { a: 40, b: 30, c: 30 })).toBeNull();
  });

  it('바뀐 것이 없으면 같은 비율로 본다', () => {
    expect(samePercents(null, null)).toBe(true);
    expect(samePercents({ a: 60, b: 40 }, { b: 40, a: 60 })).toBe(true);
    expect(samePercents({ a: 60, b: 40 }, null)).toBe(false);
    expect(samePercents({ a: 60, b: 40 }, { a: 50, b: 50 })).toBe(false);
  });
});
