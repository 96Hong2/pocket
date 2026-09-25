import { mkdirSync } from 'node:fs';

import { expect, test } from '../support/fixtures';

/**
 * 홍보 이미지에 넣을 **실제 앱 화면**을 찍는다.
 *
 * `POCKET_SHOT_OUT` 을 주지 않으면 건너뛴다. 평소에 돌 이유가 없고, CI 에서 자동으로
 * 돌면 없는 폴더에 쓰다가 애먼 곳이 빨개진다.
 *
 * **진짜 화면을 쓰는 이유가 있다.** 그려서 만든 목업은 실제와 조금씩 어긋나는데,
 * 홍보 이미지를 보고 들어온 사람이 그 차이를 바로 알아챈다.
 */

const OUT = process.env.POCKET_SHOT_OUT;

test.describe('홍보용 화면', () => {
  test.skip(OUT == null, 'POCKET_SHOT_OUT 을 주면 그 폴더에 화면을 남긴다');

  test.beforeAll(() => {
    if (OUT != null) mkdirSync(OUT, { recursive: true });
  });

  /*
    devtools 목 SDK 가 오른쪽 아래에 띄우는 「AIT」 배지를 감춘다.
    찍은 그림을 그대로 홍보에 쓰는데, 개발용 표식이 들어가면 못 쓴다.
  */
  test.beforeEach(async ({ page }) => {
    await page.addStyleTag({
      content:
        '[class*="devtools"],[id*="devtools"],[data-testid*="devtools"]{display:none!important}',
    });
  });

  test('엑셀로 내보내기 시트', async ({ page, prep, settings }) => {
    await prep.addTransaction({ amount: 12_000, daysAgo: 0, merchant: '김밥천국' });
    await prep.addTransaction({ amount: 4_500, daysAgo: 1, merchant: '스타벅스' });

    await settings.open();
    await settings.waitReady();
    await settings.ledgerExport.openButton.click();
    await expect(settings.ledgerExport.sheet).toBeVisible();

    await page.screenshot({ path: `${OUT}/shot-export.png` });
  });

  test('카테고리 관리', async ({ page, prep, categories }) => {
    // 빈 화면은 홍보에 못 쓴다. 내가 만든 분류가 있어야 「내 식대로」 가 보인다.
    await prep.addCategory('데이트', '13_heart');
    await prep.addCategory('반려동물', '16_paw');

    await categories.open();
    await page.waitForTimeout(600);

    await page.screenshot({ path: `${OUT}/shot-categories.png` });
  });

  test('태그', async ({ page, tags }) => {
    await tags.open();
    // 빈 화면을 찍으면 무엇에 쓰는지 안 보인다. 실제로 쓸 법한 것을 몇 개 만든다.
    await tags.create('지출', '데이트');
    await tags.create('지출', '출장');
    await tags.create('지출', '선물');
    await page.waitForTimeout(600);

    await page.screenshot({ path: `${OUT}/shot-tags.png` });
  });

  test('반복 지출', async ({ page, recurring }) => {
    await recurring.open();
    // 목록이 화면을 채워야 홍보 이미지에서 빈 곳이 안 생긴다.
    await recurring.create({ name: '넷플릭스', amount: 17_000, day: 5 });
    await recurring.create({ name: '헬스장', amount: 89_000, day: 10 });
    await recurring.create({ name: '통신비', amount: 43_500, day: 25 });
    await recurring.create({ name: '보험료', amount: 112_000, day: 15 });
    await recurring.create({ name: '관리비', amount: 165_000, day: 20 });
    await recurring.create({ name: '유튜브 프리미엄', amount: 14_900, day: 8 });
    await page.waitForTimeout(600);

    await page.screenshot({ path: `${OUT}/shot-recurring.png` });
  });
});
