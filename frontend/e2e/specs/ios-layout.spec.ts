import type { Page } from '@playwright/test';

import { expect, test } from '../support/fixtures';

/**
 * iOS 웹뷰 폭에서 화면이 가로로 넘치지 않는지 본다.
 *
 * **다른 spec 과 브라우저가 다르다.** 이 파일만 `ios-layout` 프로젝트(WebKit · iPhone)로
 * 돈다. 미니앱은 iOS 에서 WKWebView 로 도는데, 날짜 칸처럼 **브라우저가 직접 그리는
 * 부품**은 Chromium 과 크기가 달라서 한쪽만 재면 넘치는 것을 못 본다.
 *
 * 실제로 그렇게 놓쳤다. 영수증 검토 화면의 `input[type=date]` 가 반칸에 안 들어가
 * 화면에 가로 스크롤이 생겼는데, Chromium 에서는 멀쩡히 들어갔다. 사용자가 실기기
 * 캡처로 신고하고 나서야 알았다 → [[함정과 교훈]].
 *
 * 자리를 하나씩 재지 않는다. **가로로 구르는 것이 있는지**만 본다. 자리마다 값을 박아
 * 두면 여백을 고칠 때마다 여기가 깨지고, 정작 새로 생긴 넘침은 못 잡는다.
 */

/** 가로로 구르는 요소의 목록. 비어 있어야 한다. */
async function horizontalScrollers(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('*')]
      .filter((el) => {
        // 1px 은 반올림이다. 넓이가 없는 것(숨긴 글)은 애초에 화면을 밀지 못한다.
        if (el.clientWidth <= 4 || el.scrollWidth <= el.clientWidth + 1) return false;
        // 표·코드처럼 일부러 가로로 굴리는 자리는 여기서 빼 준다. 지금은 없다.
        return !el.closest('[data-scroll-x]');
      })
      .map((el) => `<${el.tagName} class="${el.className}"> ${el.clientWidth} < ${el.scrollWidth}`),
  );
}

test('홈과 기록 시트가 가로로 넘치지 않는다', async ({ page, home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  expect(await horizontalScrollers(page)).toEqual([]);

  await home.recordButton.click();
  await recordSheet.waitOpen();
  expect(await horizontalScrollers(page)).toEqual([]);
});

test('사진에서 읽어 온 줄을 펼쳐도 가로로 넘치지 않는다', async ({ page, home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.methodTab('캡처').click();
  await recordSheet.capture.pick();
  await expect(recordSheet.capture.readLine).toBeVisible();

  // 날짜 칸이 여기 있다. 접어 둔 채로만 재면 그 칸을 한 번도 안 보고 지나간다.
  await recordSheet.capture.openEdit('스타벅스');
  expect(await horizontalScrollers(page)).toEqual([]);

  // 날짜 칸이 제 자리를 넘지 않는지도 눈금으로 확인한다.
  const fits = await page.evaluate(() => {
    const field = document.querySelector<HTMLElement>('.nl-form input[type=date]');
    if (field == null) return null;
    const box = field.getBoundingClientRect();
    const parent = field.parentElement!.getBoundingClientRect();
    return box.right <= parent.right + 0.5 && box.left >= parent.left - 0.5;
  });
  expect(fits).toBe(true);
});

test('기록을 고치는 시트도 가로로 넘치지 않는다', async ({ page, home, calendar, prep }) => {
  await prep.addTransaction({ amount: 9_900, merchant: '교보문고', daysAgo: 0 });
  await calendar.open();
  await calendar.waitReady();
  await calendar.list.row('교보문고').click();
  await calendar.edit.waitOpen();

  // 여기에도 날짜 칸이 있다. 검토 화면과 같은 공용 스타일을 쓴다.
  expect(await horizontalScrollers(page)).toEqual([]);
  await home.open();
});

test('카테고리 관리와 목표 시트도 가로로 넘치지 않는다', async ({ page, categories, goal }) => {
  await categories.open();
  await categories.waitReady();
  expect(await horizontalScrollers(page)).toEqual([]);

  // 아이콘 고르기까지 펼쳐 본다. 격자와 탭이 한 줄에 들어가야 한다.
  await categories.addButton.click();
  await categories.sheet.waitOpen();
  expect(await horizontalScrollers(page)).toEqual([]);
  await categories.sheet.pickIconSource('사진');
  expect(await horizontalScrollers(page)).toEqual([]);
  await categories.sheet.closeButton.click();

  // 목표 시트에도 날짜 칸이 있다.
  await goal.open();
  await goal.waitReady();
  expect(await horizontalScrollers(page)).toEqual([]);
});
