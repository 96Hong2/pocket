import type { Locator, Page } from '@playwright/test';

/**
 * 가로로 구르는 요소를 찾는다. **한 벌만 둔다.**
 *
 * 화면 전체(`Page`)로도, 시트 하나(`Locator`)로도 부를 수 있다. 예전에는 spec 과 화면
 * 객체가 각자 사본을 들고 있었는데, 한쪽만 고치면 다른 쪽이 조용히 다른 답을 냈다.
 *
 * **잘라 낸 자리는 세지 않는다.** `overflow: hidden` 에 말줄임을 건 칸은 안쪽 폭이 늘
 * 더 크지만 손가락으로 밀 수 없다. 그것까지 세면 말줄임이 제대로 도는 순간 이 검사가
 * 빨개진다(실제로 분류 칩 이름을 제대로 자르자마자 그렇게 됐다).
 *
 * 일부러 가로로 굴리는 자리는 `[data-scroll-x]` 를 달아 빼 준다.
 */
const SCAN = (root: Element | null | void): string[] => {
  const nodes: Element[] = root
    ? [root, ...root.querySelectorAll('*')]
    : [...document.querySelectorAll('*')];

  return nodes
    .filter((node) => {
      const el = node as HTMLElement;
      // 1px 은 반올림이다. 넓이가 없는 것(숨긴 글)은 애초에 화면을 밀지 못한다.
      if (el.clientWidth <= 4 || el.scrollWidth <= el.clientWidth + 1) return false;
      if (el.closest('[data-scroll-x]')) return false;
      const overflowX = getComputedStyle(el).overflowX;
      return overflowX !== 'hidden' && overflowX !== 'clip';
    })
    .map((node) => {
      const el = node as HTMLElement;
      return `<${el.tagName} class="${el.className}"> ${el.clientWidth} < ${el.scrollWidth}`;
    });
};

/** 화면 전체에서. */
export function horizontalScrollers(page: Page): Promise<string[]> {
  return page.evaluate(SCAN, null);
}

/** 시트 하나 안에서. 그 시트가 원인인지 화면 다른 곳이 원인인지 가를 때 쓴다. */
export function horizontalScrollersIn(root: Locator): Promise<string[]> {
  return root.evaluate(SCAN);
}
