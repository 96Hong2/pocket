import { CAPTURE_DATA_URI, mockImagesSeeded, seedMockImages } from '../support/deviceMock';
import { forceAdNoFill, logsNamed, readLogs } from '../support/aitMock';
import { E2E_API_URL } from '../support/env';
import { expect, test } from '../support/fixtures';

/**
 * 출시 직전에 손본 자리들의 경계.
 *
 * 한 바퀴가 도는 것은 `specs/` 가 지킨다. 여기서 보는 것은 그 바퀴가 어긋나는 자리다.
 * 목록이 딱 상한일 때, 서버가 막을 때, 광고가 안 붙을 때, 응답이 아주 늦을 때,
 * 화면이 가장 좁을 때.
 */

/** 화면이 한 번에 보여 주는 최대 줄 수. 정본은 `features/imports/MerchantRuleList.tsx` 다. */
const VISIBLE_LIMIT = 20;

const MERCHANT_RULES = `${E2E_API_URL}/api/v1/merchant-rules`;

/**
 * 실패 응답 한 벌.
 *
 * 앱과 API 는 출처가 달라 브라우저가 응답에 CORS 헤더를 요구한다. 없으면 앱이
 * 상태 코드가 아니라 네트워크 실패로 읽어 다른 문구가 뜬다.
 */
const SERVER_DOWN = {
  status: 500,
  contentType: 'application/json',
  headers: { 'access-control-allow-origin': '*' },
  body: '{}',
};

// ── 기억한 분류 ─────────────────────────────────────────

test('딱 스무 줄이면 자르지도 검색칸을 내지도 않는다', async ({ categories, prep }) => {
  const food = (await prep.categoryIds()).get('식비')!;
  for (let index = 0; index < VISIBLE_LIMIT; index += 1) {
    await prep.addMerchantRule(`가게${String(index).padStart(2, '0')}`, food);
  }

  await categories.open();
  await categories.waitReady();

  // 상한과 같은 수는 넘친 것이 아니다. 여기서 하나 어긋나면 스무 번째 줄이 조용히 사라진다.
  await expect(categories.rules.rows).toHaveCount(VISIBLE_LIMIT);
  await expect(categories.rules.moreNotice).toHaveCount(0);
  await expect(categories.rules.search).toHaveCount(0);
});

test('스물한 줄부터 자르고, 감춘 수를 정확히 말한다', async ({ categories, prep }) => {
  const food = (await prep.categoryIds()).get('식비')!;
  for (let index = 0; index < VISIBLE_LIMIT + 1; index += 1) {
    await prep.addMerchantRule(`가게${String(index).padStart(2, '0')}`, food);
  }

  await categories.open();
  await categories.waitReady();

  await expect(categories.rules.rows).toHaveCount(VISIBLE_LIMIT);
  await expect(categories.rules.moreNotice).toContainText('1개');
});

test('검색과 걸러 보기를 함께 걸어도 서로 지우지 않는다', async ({ categories, prep }) => {
  const ids = await prep.categoryIds();
  const food = ids.get('식비')!;
  // 앱이 스스로 기억한 줄. 실제 저장 경로를 타야 이쪽으로 생긴다.
  await prep.learnMerchantRule('올리브영', food);
  for (let index = 0; index < VISIBLE_LIMIT; index += 1) {
    await prep.addMerchantRule(`손으로${String(index).padStart(2, '0')}`, food);
  }

  await categories.open();
  await categories.waitReady();

  // 스물한 줄이 되어 검색칸이 열린다.
  await expect(categories.rules.search).toBeVisible();
  await expect(categories.rules.filter('내가 걸어둔 것')).toHaveText(
    `내가 걸어둔 것 ${VISIBLE_LIMIT}`,
  );

  await categories.rules.filter('내가 걸어둔 것').click();
  await categories.rules.search.fill('올리브영');
  // 손으로 건 것만 보는 중이니 앱이 기억한 줄은 검색해도 안 나온다.
  await expect(categories.rules.rows).toHaveCount(0);
  await expect(categories.rules.noMatch).toBeVisible();

  await categories.rules.filter('전체').click();
  // 걸러 보기를 풀면 같은 검색어로 그 줄이 돌아온다.
  await expect(categories.rules.rows).toHaveCount(1);
  await expect(categories.rules.mineBadge('올리브영')).toHaveCount(0);
});

test('감춰진 줄을 검색으로 찾아 그 자리에서 지운다', async ({ categories, prep }) => {
  const food = (await prep.categoryIds()).get('식비')!;
  for (let index = 0; index < VISIBLE_LIMIT + 3; index += 1) {
    await prep.addMerchantRule(`가게${String(index).padStart(2, '0')}`, food);
  }

  await categories.open();
  await categories.waitReady();
  await categories.rules.search.fill('가게22');
  await expect(categories.rules.rows).toHaveCount(1);

  await categories.rules.remove('가게22');

  // 하나 지웠으니 감춘 수도 하나 줄어야 한다. 검색어는 그대로 남는다.
  await categories.rules.search.fill('');
  await expect(categories.rules.moreNotice).toContainText('2개');
});

test.describe('규칙을 못 걸 때', () => {
  test.use({ consoleErrorAllowList: [/Failed to load resource[\s\S]*500/] });

  test('서버가 막으면 시트를 닫지 않고 이유를 말한다', async ({ categories, page }) => {
    await page.route(MERCHANT_RULES, (route) =>
      route.request().method() === 'POST' ? route.fulfill(SERVER_DOWN) : route.continue(),
    );

    await categories.open();
    await categories.waitReady();
    await categories.rules.addButton.click();
    await categories.rules.sheet.waitOpen();
    await categories.rules.sheet.merchantField.fill('스타벅스');
    await categories.rules.sheet.pickCategory('카페·간식');
    await categories.rules.sheet.saveButton.click();

    // 닫아 버리면 적어 둔 상호와 고른 분류가 함께 사라진다.
    await expect(categories.rules.sheet.dialog).toBeVisible();
    await expect(categories.rules.sheet.dialog.getByRole('alert')).toBeVisible();
  });
});

test('상호만 적고 분류를 안 고르면 걸 수 없다', async ({ categories }) => {
  await categories.open();
  await categories.waitReady();
  await categories.rules.addButton.click();
  await categories.rules.sheet.waitOpen();

  await expect(categories.rules.sheet.saveButton).toBeDisabled();
  await categories.rules.sheet.merchantField.fill('스타벅스');
  // 분류 없는 규칙은 붙일 곳이 없다. 서버까지 갔다 오지 않고 여기서 막는다.
  await expect(categories.rules.sheet.saveButton).toBeDisabled();

  await categories.rules.sheet.pickCategory('카페·간식');
  await expect(categories.rules.sheet.saveButton).toBeEnabled();
});

test('공백만 적으면 걸 수 없다', async ({ categories }) => {
  await categories.open();
  await categories.waitReady();
  await categories.rules.addButton.click();
  await categories.rules.sheet.waitOpen();

  await categories.rules.sheet.merchantField.fill('   ');
  await categories.rules.sheet.pickCategory('식비');
  await expect(categories.rules.sheet.saveButton).toBeDisabled();
});

test('이체 분류에는 규칙을 걸 수 없다', async ({ categories }) => {
  await categories.open();
  await categories.waitReady();
  await categories.rules.addButton.click();
  await categories.rules.sheet.waitOpen();

  // 이체는 분류가 하나뿐이라 기억할 것이 없다. 고를 자리에 아예 없어야 한다.
  const picker = categories.rules.sheet.dialog.getByRole('group', { name: '걸어 둘 분류' });
  await expect(picker.getByRole('button', { name: /이체$/ })).toHaveCount(0);
  await expect(picker.getByRole('button', { name: /식비$/ })).toBeVisible();
});

// ── 배너 ────────────────────────────────────────────────

test('채울 광고가 없으면 네 자리 모두 빈 칸을 남기지 않는다', async ({
  appShell,
  home,
  page,
  settings,
}) => {
  await page.addInitScript(forceAdNoFill);

  await home.open();
  await home.waitReady();
  await expect(home.ads.slot).not.toBeVisible();
  expect(await home.ads.slot.boundingBox(), '접힌 광고 자리가 아직 크기를 차지한다').toBeNull();

  for (const tab of ['리포트', '관리'] as const) {
    await appShell.goToTab(tab);
    const slot = page.getByTestId('ad-slot');
    await expect(slot).not.toBeVisible();
    expect(await slot.boundingBox(), `${tab} 의 접힌 광고 자리가 크기를 차지한다`).toBeNull();
  }

  await settings.open();
  await settings.waitReady();
  await expect(settings.adSlot).not.toBeVisible();
});

test('배너를 못 붙여도 그 화면의 할 일은 그대로 된다', async ({ home, page, recordSheet }) => {
  await page.addInitScript(forceAdNoFill);

  await home.open();
  await home.waitReady();

  // 광고가 기록을 막으면 안 된다. 이 앱에서 광고는 곁들이는 것이다.
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.methodTab('키패드')).toBeVisible();
});

// ── 읽는 동안 ───────────────────────────────────────────

test.describe('응답이 아주 늦을 때', () => {
  test('스무 초를 넘기면 오래 걸린다고 말하고 막대를 멈추지 않는다', async ({
    home,
    page,
    recordSheet,
  }) => {
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`${E2E_API_URL}/api/v1/imports/capture`, async (route) => {
      if (route.request().method() === 'POST') await held;
      await route.continue();
    });
    await seedMockImages(CAPTURE_DATA_URI)(page);

    await home.open();
    await home.waitReady();
    expect(await mockImagesSeeded(page)).toBe(true);

    await home.recordButton.click();
    await recordSheet.methodTab('캡처').click();
    await recordSheet.capture.pickButton.click();
    await expect(recordSheet.capture.analyzing).toBeVisible();

    /*
      실측 12초를 기준으로 막대가 찬다. 그보다 늦어지는 일이 실제로 있고(글자가 많은 캡처),
      그때 아무 말도 없으면 멈춘 줄 알고 나간다. 시계를 앞으로 돌려 그 자리를 본다.
    */
    await page.clock.install();
    await page.clock.fastForward(21_000);

    await expect(recordSheet.capture.progressLabel).toHaveText('조금 더 걸리고 있어요');
    // 늦어져도 막대는 끝까지 차지 않는다. 다 찬 채로 기다리게 하지 않는다.
    expect(await recordSheet.capture.progressRatio()).toBeLessThan(1);

    release();
    await expect(recordSheet.capture.readLine).toBeVisible();
  });
});

// ── 환불 ────────────────────────────────────────────────

test('캡처로 들어온 환불도 그 자리에서 수입으로 바꾼다', async ({ home, page, recordSheet }) => {
  await seedMockImages(CAPTURE_DATA_URI)(page);
  await home.open();
  await home.waitReady();
  expect(await mockImagesSeeded(page)).toBe(true);

  await home.recordButton.click();
  await recordSheet.methodTab('캡처').click();
  await recordSheet.capture.pickButton.click();
  await expect(recordSheet.capture.readLine).toBeVisible();

  /*
    스텁 캡처의 마지막 줄이 카드 캐시백이다. 실기기에서 여덟 건이 통째로 안 들어갔던
    바로 그 모양이라, 예시에 넣어 두고 여기서 지킨다.
  */
  const refund = recordSheet.capture.row('MY 카드 캐시백');
  await expect(refund).toBeVisible();
  await expect(recordSheet.capture.checkbox('MY 카드 캐시백')).toBeDisabled();

  await refund.getByRole('button', { name: '수입으로 바꾸기' }).click();

  await expect(recordSheet.capture.checkbox('MY 카드 캐시백')).toBeChecked();
  await recordSheet.capture.save();
  await expect(recordSheet.capture.savedTitle).toBeVisible();
});

// ── 좁은 화면 ───────────────────────────────────────────

test.describe('가장 좁은 화면', () => {
  // iPhone SE 1세대 폭. 우리가 감당하기로 한 하한이다.
  test.use({ viewport: { width: 320, height: 568 } });

  test('날짜 칸도 홈 추가 카드도 화면을 가로로 밀지 않는다', async ({
    home,
    page,
    prep,
    recordSheet,
  }) => {
    await prep.addTransaction({ amount: 12000 });

    await home.open();
    await home.waitReady();
    // 첫 기록이 있으니 홈 추가 카드가 떠 있다. 버튼 둘이 붙은 줄이라 가장 먼저 넘친다.
    await expect(home.addToHome.card).toBeVisible();
    await expectNoSideScroll(page, '홈');

    await home.recordButton.click();
    await recordSheet.methodTab('줄글').click();
    await recordSheet.nl.analyze('점심 12000');
    await recordSheet.nl.openEdit('점심');

    const overflow = await recordSheet.nl.form.dayField.evaluate((element) => {
      const parent = element.parentElement;
      return parent == null
        ? 0
        : element.getBoundingClientRect().right - parent.getBoundingClientRect().right;
    });
    expect(overflow, '좁은 화면에서 날짜 칸이 폼 밖으로 나갔다').toBeLessThanOrEqual(1);
    await expectNoSideScroll(page, '검토 화면');
  });

  test('기억한 분류 목록도 넘치지 않는다', async ({ categories, page, prep }) => {
    const food = (await prep.categoryIds()).get('식비')!;
    await prep.addMerchantRule('아주아주긴상호이름을가진동네카페와빵집', food);

    await categories.open();
    await categories.waitReady();
    await expect(categories.rules.rows).toHaveCount(1);
    await expectNoSideScroll(page, '카테고리 관리');
  });
});

async function expectNoSideScroll(
  page: import('@playwright/test').Page,
  where: string,
): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${where} 이 가로로 밀린다`).toBeLessThanOrEqual(0);
}

// ── 로그 ────────────────────────────────────────────────

test('처음 연 사람과 다시 온 사람을 가른다', async ({ home, page }) => {
  await home.open();
  await home.waitReady();

  const first = (await logsNamed(page, 'app_open')).at(-1);
  expect(first?.params.is_first_open, '처음 열었는데 첫 실행이 아니라고 한다').toBe(true);
  expect(first?.params.open_bucket).toBe('1');

  // 같은 기기에서 다시 연다. 저장소가 살아 있어야 두 번째로 세어진다.
  await page.reload();
  await home.waitReady();

  const second = (await logsNamed(page, 'app_open')).at(-1);
  expect(second?.params.is_first_open, '다시 열었는데 또 첫 실행이라고 한다').toBe(false);
  expect(second?.params.open_bucket).toBe('2');
  expect(second?.params.days_since_first_open).toBe(0);
});

test.describe('저장이 막혔을 때', () => {
  test.use({ consoleErrorAllowList: [/Failed to load resource[\s\S]*500/] });

  test('저장이 실패하면 성공으로 적지 않는다', async ({ home, page, recordSheet }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.methodTab('줄글').click();
    await recordSheet.nl.analyze('점심 12000');

    // 검토까지 마친 뒤 저장만 막는다. 버튼을 누른 것과 저장된 것은 다르다.
    await page.route(`${E2E_API_URL}/api/v1/imports/*/commit`, (route) =>
      route.request().method() === 'POST' ? route.fulfill(SERVER_DOWN) : route.continue(),
    );
    await recordSheet.nl.saveButton.click();

    await expect(recordSheet.nl.notice).toBeVisible();
    const saved = (await logsNamed(page, 'save_result')).at(-1);
    expect(saved?.params.result, 'DB 에 안 들어갔는데 성공으로 적혔다').toBe('failed');
    expect(saved?.params.created_count).toBeUndefined();
  });

  test('로그에는 적은 문장도 금액도 실리지 않는다', async ({ home, page, recordSheet }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.methodTab('줄글').click();
    await recordSheet.nl.analyze('스타벅스 라떼 4500');

    await page.route(`${E2E_API_URL}/api/v1/imports/*/commit`, (route) =>
      route.request().method() === 'POST' ? route.fulfill(SERVER_DOWN) : route.continue(),
    );
    await recordSheet.nl.saveButton.click();
    await expect(recordSheet.nl.notice).toBeVisible();

    // 실패 경로가 오히려 위험하다. 오류를 남기려다 입력을 함께 싣기 쉽다.
    const dump = JSON.stringify(await readLogs(page));
    for (const secret of ['스타벅스', '라떼', '4500']) {
      expect(dump, `로그에 입력이 새어 나갔다: ${secret}`).not.toContain(secret);
    }
  });
});
