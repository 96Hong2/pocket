import { expect, test } from '../support/fixtures';
import { horizontalScrollers } from '../support/overflow';

import type { Page } from '@playwright/test';

/**
 * 펴는 폰에서의 배치.
 *
 * 갤럭시 폴드·아이폰 듀오는 펼치면 폭이 배로 뛴다. 그 폭을 그대로 다 쓰면 「기록하기」
 * 한 버튼이 화면을 가로지르고 키패드 숫자 사이가 손가락 두 뼘으로 벌어진다.
 * 화면이 커진 만큼 쓰기 어려워지는 것이라, 폭을 기둥 하나로 묶어 가운데 세운다.
 *
 * **자리마다 값을 박지 않는다.** 기둥 폭(`--app-column`)을 여기 다시 적으면 디자인을
 * 손볼 때마다 이 파일이 깨진다. 재는 것은 셋뿐이다.
 *   1. 화면보다 좁은가 (다 안 쓰는가)
 *   2. 좌우가 같은가 (가운데인가)
 *   3. 화면에 못 박힌 것(시트·탭바)도 같은 폭인가
 *
 * 마지막 시험이 반대쪽을 지킨다. **보통 폰에서는 이 규칙이 아예 안 걸려야 한다.**
 * 문턱을 잘못 내리면 쓰던 사람의 화면이 하루아침에 좁아진다.
 */

/** 펼친 갤럭시 폴드 안쪽 화면. 아이폰 듀오도 이 근방으로 알려져 있다. */
const FOLD_OPEN = { width: 690, height: 829 };
/** 가장 흔한 폰. 이 폭에서는 기둥이 걸리지 않아야 한다. */
const PHONE = { width: 390, height: 844 };

interface Box {
  left: number;
  right: number;
  width: number;
  viewport: number;
}

/** 요소가 화면 안에서 어디에 서 있나. 좌우 여백을 함께 준다. */
async function boxOf(page: Page, selector: string): Promise<Box | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el == null) return null;
    const rect = el.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      right: Math.round(window.innerWidth - rect.right),
      width: Math.round(rect.width),
      viewport: window.innerWidth,
    };
  }, selector);
}

/** 화면을 다 쓰지 않고 가운데 서 있다. */
function expectCentered(box: Box | null): void {
  expect(box).not.toBeNull();
  const seen = box!;
  expect(seen.width).toBeLessThan(seen.viewport);
  expect(seen.left).toBeGreaterThan(0);
  // 반올림으로 1px 이 갈릴 수 있다. 그보다 크게 벌어지면 가운데가 아니다.
  expect(Math.abs(seen.left - seen.right)).toBeLessThanOrEqual(1);
}

test('펼친 폭에서 본문과 탭바가 한 기둥으로 가운데 선다', async ({ page, home }) => {
  await page.setViewportSize(FOLD_OPEN);
  await home.open();
  await home.waitReady();

  const content = await boxOf(page, '.shell__content');
  expectCentered(content);

  // 탭바는 화면에 못 박혀 있어 본문 기둥을 못 물려받는다. 따로 묶어 뒀다.
  const tabbar = await boxOf(page, '.tabbar__inner');
  expectCentered(tabbar);
  expect(tabbar!.width).toBeLessThan(content!.width);

  expect(await horizontalScrollers(page)).toEqual([]);
});

test('펼친 폭에서 기록 시트도 본문과 같은 기둥에 선다', async ({ page, home, recordSheet }) => {
  await page.setViewportSize(FOLD_OPEN);
  await home.open();
  await home.waitReady();

  const content = await boxOf(page, '.shell__content');

  await home.recordButton.click();
  await recordSheet.waitOpen();

  // 시트는 포털로 body 에 붙는다. 여기가 어긋나면 본문만 가운데 서고 시트만 화면 끝까지 퍼진다.
  const sheet = await boxOf(page, '.pk-sheet');
  expectCentered(sheet);
  expect(sheet!.width).toBe(content!.width);
});

test('보통 폰 폭에서는 기둥이 걸리지 않고 화면을 그대로 쓴다', async ({
  page,
  home,
  recordSheet,
}) => {
  await page.setViewportSize(PHONE);
  await home.open();
  await home.waitReady();

  // 문턱(600px)을 잘못 내리면 쓰던 사람의 화면이 갑자기 좁아진다. 그것을 여기서 잡는다.
  const content = await boxOf(page, '.shell__content');
  expect(content!.width).toBe(PHONE.width);
  expect(content!.left).toBe(0);

  await home.recordButton.click();
  await recordSheet.waitOpen();
  const sheet = await boxOf(page, '.pk-sheet');
  expect(sheet!.width).toBe(PHONE.width);
});
