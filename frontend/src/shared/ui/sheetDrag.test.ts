import { describe, expect, it } from 'vitest';

import { canStartDrag, shouldDismiss, trackMove, beginTracking } from './sheetDrag';

/**
 * 🔴 **적던 것이 사라진 사고의 자리다**(2026-09-25 신고 두 번).
 *
 * 첫 판은 「이미 굴려 놓은 상자」(scrollTop > 0) 만 막았다. 폰에서 되올리는 손짓은 한 번으로
 * 안 끝나고 여러 번 튕기는데, 그 사이에 맨 위(0)에 닿는다. 닿은 다음 한 번이 「맨 위니까
 * 닫아도 된다」 로 읽혀 시트가 통째로 닫혔다. 같은 신고가 또 왔다.
 *
 * 그래서 기준을 **자리에서 성질로** 바꿨다. 굴러갈 것이 남아 있으면 본문에서는 안 끈다.
 * 그 시트를 닫는 자리는 손잡이 하나다. 굴러갈 것이 없는 짧은 시트는 그대로 끌린다.
 */

/** 시트 하나를 세운다. 크기를 주면 그만큼 굴러가는 상자가 된다. */
function buildSheet(options: {
  sheetScrollTop?: number;
  /** 시트 자체가 굴러가나. 안 주면 내용이 딱 맞아 안 굴러간다. */
  sheet?: { scrollHeight: number; clientHeight: number };
  inner?: { overflowY: string; scrollHeight: number; clientHeight: number; scrollTop?: number };
}): { sheet: HTMLElement; target: HTMLElement } {
  const sheet = document.createElement('div');
  sheet.style.overflowY = 'auto';
  Object.defineProperty(sheet, 'scrollTop', { value: options.sheetScrollTop ?? 0 });
  Object.defineProperty(sheet, 'scrollHeight', { value: options.sheet?.scrollHeight ?? 400 });
  Object.defineProperty(sheet, 'clientHeight', { value: options.sheet?.clientHeight ?? 400 });
  document.body.appendChild(sheet);

  if (options.inner == null) {
    const plain = document.createElement('div');
    sheet.appendChild(plain);
    return { sheet, target: plain };
  }

  const box = document.createElement('div');
  box.style.overflowY = options.inner.overflowY;
  Object.defineProperty(box, 'scrollHeight', { value: options.inner.scrollHeight });
  Object.defineProperty(box, 'clientHeight', { value: options.inner.clientHeight });
  Object.defineProperty(box, 'scrollTop', { value: options.inner.scrollTop ?? 0 });
  const leaf = document.createElement('div');
  box.appendChild(leaf);
  sheet.appendChild(box);
  return { sheet, target: leaf };
}

describe('canStartDrag', () => {
  it('굴러갈 것이 없는 짧은 시트는 본문을 잡아도 끌린다', () => {
    const { sheet, target } = buildSheet({});
    expect(canStartDrag(target, sheet)).toBe(true);
  });

  it('🔴 굴러가는 시트는 맨 위에 있어도 본문에서 안 끈다', () => {
    /*
      **맨 위(0)라는 것이 바로 사고를 낸 값이다.** 튕겨 올리는 손짓이 0에 닿은 다음
      한 번을 닫기로 읽었다. 굴러갈 것이 있으면 아래로 쓰는 손짓은 언제나 스크롤이다.
    */
    const { sheet, target } = buildSheet({ sheet: { scrollHeight: 1200, clientHeight: 600 } });
    expect(sheet.scrollTop).toBe(0);
    expect(canStartDrag(target, sheet)).toBe(false);
  });

  it('🔴 굴러가는 안쪽 상자 위에서도 맨 위에서 안 끈다', () => {
    const { sheet, target } = buildSheet({
      inner: { overflowY: 'auto', scrollHeight: 900, clientHeight: 244, scrollTop: 0 },
    });
    expect(canStartDrag(target, sheet)).toBe(false);
  });

  it('이미 굴려 놓은 안쪽 상자 위에서도 안 끈다', () => {
    const { sheet, target } = buildSheet({
      inner: { overflowY: 'auto', scrollHeight: 900, clientHeight: 244, scrollTop: 120 },
    });
    expect(canStartDrag(target, sheet)).toBe(false);
  });

  it('넘치기만 하고 숨긴 상자는 스크롤 상자가 아니다', () => {
    const { sheet, target } = buildSheet({
      inner: { overflowY: 'hidden', scrollHeight: 900, clientHeight: 244, scrollTop: 120 },
    });
    expect(canStartDrag(target, sheet)).toBe(true);
  });

  it('버튼 위에서 시작한 손짓은 누르려던 것이다', () => {
    const { sheet } = buildSheet({});
    const button = document.createElement('button');
    sheet.appendChild(button);
    expect(canStartDrag(button, sheet)).toBe(false);
  });

  it('손잡이는 무슨 일이 있어도 끌 수 있다', () => {
    const { sheet } = buildSheet({ sheet: { scrollHeight: 1200, clientHeight: 600 } });
    const handle = document.createElement('button');
    handle.setAttribute('data-sheet-handle', '');
    sheet.appendChild(handle);
    expect(canStartDrag(handle, sheet)).toBe(true);
  });
});

describe('trackMove', () => {
  it('위로 올린 손짓은 끌기가 아니다', () => {
    const tracker = beginTracking(1, 100, 400, 0, false);
    expect(trackMove(tracker, 100, 380)).toBe(null);
  });

  it('가로로 먼저 간 손짓도 끌기가 아니다', () => {
    const tracker = beginTracking(1, 100, 400, 0, false);
    expect(trackMove(tracker, 140, 410)).toBe(null);
  });
});

describe('shouldDismiss', () => {
  it('충분히 내렸으면 닫는다', () => {
    expect(shouldDismiss(120, 300)).toBe(true);
  });

  it('조금 내렸다 놓으면 안 닫는다', () => {
    expect(shouldDismiss(20, 400)).toBe(false);
  });
});
