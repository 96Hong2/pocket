import { describe, expect, it } from 'vitest';

import {
  SCROLL_SETTLE_MS,
  beginTracking,
  canStartDrag,
  shouldDismiss,
  trackMove,
} from './sheetDrag';

/**
 * 🔴 **적던 것이 사라진 사고의 자리다**(2026-09-25 신고 두 번).
 *
 * 첫 판은 「이미 굴려 놓은 상자」(scrollTop > 0) 만 막았다. 폰에서 되올리는 손짓은 한 번으로
 * 안 끝나고 여러 번 튕기는데, 그 사이에 맨 위(0)에 닿는다. 닿은 다음 한 번이 「맨 위니까
 * 닫아도 된다」 로 읽혀 시트가 통째로 닫혔다. 같은 신고가 또 왔다.
 *
 * 한때 「굴러갈 수 있으면 본문에서는 아예 안 끈다」 로 넓혔다가 되돌렸다. `overflow-y: auto`
 * 가 박힌 시트 전체가 걸려들어 iPhone 14 크기에서 시트 일곱이 밀어 닫기를 잃었다.
 * 기록 시트 키패드까지 죽었고 기기 크기에 따라 됐다 안 됐다 했다(PR #84 리뷰가 재서 잡았다).
 *
 * 지금 규칙은 **방금 굴린 참인지**를 함께 본다. 굴리기가 가라앉은 뒤에 새로 시작한 손짓만
 * 닫기로 읽는다. 관성 스크롤이 내는 `scroll` 이 그동안 계속 그 시각을 밀어 준다.
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
  it('맨 위의 빈 자리에서는 끌 수 있다', () => {
    const { sheet, target } = buildSheet({});
    expect(canStartDrag(target, sheet)).toBe(true);
  });

  it('굴러가는 시트라도 맨 위에서 가만히 있으면 끌린다', () => {
    /*
      🔴 여기를 막았다가 되돌렸다. `.pk-sheet` 는 전부 `overflow-y: auto` 라, 굴러갈 수
      있다는 것만으로 막으면 내용이 긴 시트의 밀어 닫기가 통째로 죽는다. 기록 시트
      키패드(iPhone 14 에서 762px)가 그렇게 죽었다.
    */
    const { sheet, target } = buildSheet({ sheet: { scrollHeight: 1200, clientHeight: 600 } });
    expect(canStartDrag(target, sheet)).toBe(true);
  });

  it('시트를 이미 내려 읽고 있으면 안 끈다', () => {
    const { sheet, target } = buildSheet({
      sheetScrollTop: 40,
      sheet: { scrollHeight: 1200, clientHeight: 600 },
    });
    expect(canStartDrag(target, sheet)).toBe(false);
  });

  it('🔴 맨 위에 닿았어도 방금 굴린 참이면 안 끈다', () => {
    /*
      **신고된 장면이 정확히 이것이다.** 튕겨 올리는 손짓이 0에 닿고, 그다음 한 번이
      「맨 위니까 닫아도 된다」 로 읽혔다. 사람은 같은 손짓을 이어서 하고 있을 뿐이다.
    */
    const { sheet, target } = buildSheet({ sheet: { scrollHeight: 1200, clientHeight: 600 } });
    expect(sheet.scrollTop).toBe(0);
    expect(canStartDrag(target, sheet, SCROLL_SETTLE_MS - 1)).toBe(false);
  });

  it('굴리기가 가라앉은 뒤에는 그대로 닫힌다', () => {
    const { sheet, target } = buildSheet({ sheet: { scrollHeight: 1200, clientHeight: 600 } });
    expect(canStartDrag(target, sheet, SCROLL_SETTLE_MS + 1)).toBe(true);
  });

  it('🔴 이미 굴려 놓은 안쪽 상자 위에서는 안 끈다', () => {
    // 그 상자는 자기만 굴러서 시트의 스크롤 자리가 늘 0이다. 이 0 이 사고를 낸 값이다.
    const { sheet, target } = buildSheet({
      inner: { overflowY: 'auto', scrollHeight: 900, clientHeight: 244, scrollTop: 120 },
    });
    expect(sheet.scrollTop).toBe(0);
    expect(canStartDrag(target, sheet)).toBe(false);
  });

  it('안쪽 상자가 맨 위면 가만히 있을 때 끌린다', () => {
    const { sheet, target } = buildSheet({
      inner: { overflowY: 'auto', scrollHeight: 900, clientHeight: 244, scrollTop: 0 },
    });
    expect(canStartDrag(target, sheet)).toBe(true);
    // 방금 굴렸으면 같은 자리라도 안 끈다.
    expect(canStartDrag(target, sheet, 50)).toBe(false);
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

  it('🔴 덮는 창에서 올라온 손짓은 시트가 안 받는다', () => {
    /*
      **2026-09-25 밤 신고의 자리다.** 분류 만들기 창은 `createPortal` 로 `body` 에 붙지만
      리액트 안에서는 여전히 시트의 자식이라, 합성 이벤트가 리액트 나무를 타고 시트까지
      올라온다. 화면에서는 창이 시트를 덮고 있는데 시트가 닫혔다. 둘 다 사라졌다.
    */
    const { sheet } = buildSheet({});
    const overlay = document.createElement('div');
    const inside = document.createElement('span');
    overlay.appendChild(inside);
    document.body.appendChild(overlay);
    expect(sheet.contains(inside)).toBe(false);
    expect(canStartDrag(inside, sheet)).toBe(false);
  });

  it('덮는 창 안의 손잡이도 시트를 끌지 못한다', () => {
    // 창이 제 손잡이를 갖게 되더라도, 그것이 여는 것은 제 창이지 뒤의 시트가 아니다.
    const { sheet } = buildSheet({});
    const overlay = document.createElement('div');
    const handle = document.createElement('button');
    handle.setAttribute('data-sheet-handle', '');
    overlay.appendChild(handle);
    document.body.appendChild(overlay);
    expect(canStartDrag(handle, sheet)).toBe(false);
  });

  it('손잡이는 무슨 일이 있어도 끌 수 있다', () => {
    const { sheet } = buildSheet({
      sheetScrollTop: 400,
      sheet: { scrollHeight: 1200, clientHeight: 600 },
    });
    const handle = document.createElement('button');
    handle.setAttribute('data-sheet-handle', '');
    sheet.appendChild(handle);
    expect(canStartDrag(handle, sheet, 0)).toBe(true);
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
