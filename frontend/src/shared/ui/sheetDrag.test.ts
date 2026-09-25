import { describe, expect, it } from 'vitest';

import { canStartDrag, shouldDismiss, trackMove, beginTracking } from './sheetDrag';

/**
 * 🔴 **적던 것이 사라진 사고의 자리다**(2026-09-25 신고).
 *
 * 기록 고치기 시트와 아이콘 격자는 **자기만 굴러가는 상자**라 시트의 `scrollTop` 이
 * 늘 0이다. 옛 규칙은 그 0을 「맨 위니까 닫아도 된다」 로 읽어서, 읽던 자리를 도로
 * 올리려고 아래로 쓸면 시트가 통째로 닫혔다.
 *
 * 고친 규칙은 **이미 굴려 놓은** 상자만 막는다. 전부 막으면 본문 전체가 스크롤 상자인
 * 시트에서 밀어 닫는 손짓이 통째로 죽는다.
 */

/** 시트 하나를 세운다. `scrolls` 를 주면 안쪽에 따로 굴러가는 상자를 하나 넣는다. */
function buildSheet(options: {
  sheetScrollTop?: number;
  inner?: { overflowY: string; scrollHeight: number; clientHeight: number; scrollTop?: number };
}): { sheet: HTMLElement; target: HTMLElement } {
  const sheet = document.createElement('div');
  Object.defineProperty(sheet, 'scrollTop', { value: options.sheetScrollTop ?? 0 });
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
  it('맨 위의 빈 자리에서는 끌 수 있다', () => {
    const { sheet, target } = buildSheet({});
    expect(canStartDrag(target, sheet)).toBe(true);
  });

  it('시트를 이미 내려 읽고 있으면 안 끈다', () => {
    const { sheet, target } = buildSheet({ sheetScrollTop: 40 });
    expect(canStartDrag(target, sheet)).toBe(false);
  });

  it('🔴 이미 굴려 놓은 안쪽 상자 위에서는 안 끈다', () => {
    const { sheet, target } = buildSheet({
      inner: { overflowY: 'auto', scrollHeight: 900, clientHeight: 244, scrollTop: 120 },
    });
    // 시트는 맨 위(0)인데도 안 끈다. 이 0 이 바로 사고를 낸 값이다.
    expect(sheet.scrollTop).toBe(0);
    expect(canStartDrag(target, sheet)).toBe(false);
  });

  it('안쪽 상자가 맨 위면 그대로 끌린다', () => {
    /*
      거기서는 위로 올릴 것이 없어 아래로 쓰는 손짓이 스크롤일 수가 없다. 이것까지 막으면
      본문 전체가 스크롤 상자인 시트에서 밀어 닫기가 통째로 죽는다.
    */
    const { sheet, target } = buildSheet({
      inner: { overflowY: 'auto', scrollHeight: 900, clientHeight: 244, scrollTop: 0 },
    });
    expect(canStartDrag(target, sheet)).toBe(true);
  });

  it('넘치기만 하고 숨긴 상자는 스크롤 상자가 아니다', () => {
    const { sheet, target } = buildSheet({
      inner: { overflowY: 'hidden', scrollHeight: 900, clientHeight: 244, scrollTop: 120 },
    });
    expect(canStartDrag(target, sheet)).toBe(true);
  });

  it('버튼 위에서 시작한 손짓은 누르려던 것이다', () => {
    const sheet = document.createElement('div');
    Object.defineProperty(sheet, 'scrollTop', { value: 0 });
    const button = document.createElement('button');
    sheet.appendChild(button);
    expect(canStartDrag(button, sheet)).toBe(false);
  });

  it('손잡이는 무슨 일이 있어도 끌 수 있다', () => {
    const { sheet } = buildSheet({ sheetScrollTop: 400 });
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
