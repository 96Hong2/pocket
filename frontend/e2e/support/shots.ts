import { expect, type Locator, type Page } from '@playwright/test';

/**
 * 바뀐 화면 사진. `POCKET_SHOT_DIR` 을 줄 때만 찍는다(경로는 레포에 안 박는다).
 *
 * 390 폭과 가장 좁은 344 폭 두 장을 `<이름>_<폭>.png` 로 두고, 찍은 뒤 폰 크기로 돌린다.
 */

const SHOT_DIR = process.env.POCKET_SHOT_DIR;
const WIDTHS = [
  [390, 844],
  [344, 882],
] as const;
const PHONE = { width: 412, height: 915 };

export async function shotBothWidths(
  page: Page,
  name: string,
  focus?: Locator,
  block: 'start' | 'center' = 'center',
): Promise<void> {
  if (SHOT_DIR == null || SHOT_DIR === '') return;
  for (const [width, height] of WIDTHS) {
    await page.setViewportSize({ width, height });
    // 폭이 바뀐 것을 화면이 받고 한 번 더 그린 뒤에 찍는다. 시트가 그 사이 자리를 다시 잡는다.
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    if (focus != null) {
      await focus.evaluate((el, at) => el.scrollIntoView({ block: at }), block);
    }
    await page.screenshot({ path: `${SHOT_DIR}/${name}_${width}.png`, animations: 'disabled' });
  }
  await page.setViewportSize(PHONE);
}
