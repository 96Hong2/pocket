import type { Page } from '@playwright/test';

import { RATING_AFTER_RECORDS } from '../../src/features/home/homeMode';
import { logsNamed, reviewsOpened } from '../support/aitMock';
import { expect, test } from '../support/fixtures';

/**
 * 토스 「추천 미니앱」 기준에 걸린 세 가지를 화면에서 못 박는다.
 *
 * 노출 가이드가 UX·실사용 지표·리뷰·성능 넷을 본다고 했고, 이 중 둘이 비어 있었다.
 *
 * 1. **광고 예고.** 「전면광고가 나오기 전, 명확한 광고 안내 표시가 있나요」 를 묻는다.
 *    전면 광고가 서는 자리는 결산 하나뿐이고 거기 예고 한 줄이 붙어 있다. 자산 진입과
 *    리포트 달 이동은 예고할 자리가 없어 광고를 아예 뺐다(`interstitial.spec.ts`).
 * 2. **리뷰.** 앱이 별점을 한 번도 안 물어서 리뷰가 두 개뿐이었다. SDK 에 별점 창이
 *    있는데 아무도 안 부르고 있었다.
 * 3. **분류를 제 말로 부르기.** 기본 분류를 못 고쳐서, 「식비」 를 「밥값」 이라 부르는
 *    사람은 기본 분류를 통째로 버리고 같은 것을 손으로 다시 만들어야 했다.
 *
 * 준비는 API 로 심고, 행동과 단언은 화면으로 한다.
 */

/**
 * 별점 카드가 설 수 있는 사람으로 만든다.
 *
 * 기록 수(`RATING_AFTER_RECORDS`)만으로는 모자라다. **예산 제안 카드가 앞자리를 잡고
 * 있으면** 별점은 뒤로 밀린다. 예산을 안 정한 사람에게는 그 카드가 먼저인 것이 맞아서,
 * 여기서는 예산을 정해 둔 사람으로 연다. 스무 번을 적은 사람이 예산을 안 정했다면
 * 그 사람에게 급한 것은 별점이 아니다.
 */
async function seedEnoughRecords(prep: {
  addSeries: (count: number, seed: { amount: number; prefix: string }) => Promise<void>;
  setBudget: (amount: number) => Promise<void>;
}): Promise<void> {
  await prep.setBudget(600_000);
  await prep.addSeries(RATING_AFTER_RECORDS, { amount: 4_500, prefix: '가게' });
}

/**
 * 한 번뿐인 안내들을 이미 닫아 둔 사람으로 연다.
 *
 * 홈에 **스스로 서는 카드는 한 번에 둘까지**다. 홈 화면 추가와 저녁 알림은 첫 기록
 * 직후와 다섯 번째에 뜨고 닫을 때까지 남으므로, 스무 번을 적은 사람은 그 둘을 이미
 * 지나왔다. 그 상태를 만들지 않으면 별점 카드가 뜰 자리 자체가 없다.
 *
 * 목 SDK 저장소는 접두사를 붙인 localStorage 다(`__ait_storage:`). 값은 「표」 이고
 * 이 카드들은 상황을 가르지 않아 빈 문자열이다(`shared/lib/cardDismiss.ts`).
 */
async function seedNoticesDismissed(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      for (const card of ['home-add', 'home-add-again', 'remind', 'remind-again']) {
        window.localStorage.setItem(`__ait_storage:card-dismissed-${card}`, '');
      }
    } catch {
      /* 저장소를 못 여는 문서에서는 이 앱이 돌지 않는다. */
    }
  });
}

test('스무 번 넘게 적은 사람에게 별점을 묻고, 누르면 토스 창이 열린다', async ({
  home,
  page,
  prep,
}) => {
  await seedEnoughRecords(prep);
  await seedNoticesDismissed(page);
  await home.open();
  await home.waitReady();

  await expect(home.rating.card).toBeVisible();
  await expect(home.rating.title).toBeVisible();
  // **공유보다 앞이다.** 공유는 다섯 번째부터 이미 서 있던 카드라 한 자리를 내준다.
  await expect(home.share.card).toHaveCount(0);

  // 누르기 전에는 창이 열린 적이 없다. 카드가 뜬 것만으로 열리면 안 된다.
  expect(await reviewsOpened(page), '묻지도 않고 창을 띄웠다').toBe(0);

  await home.rating.button.click();

  await expect.poll(async () => reviewsOpened(page)).toBe(1);
  const asked = await logsNamed(page, 'rating_asked');
  expect(asked.map((log) => log.params.result)).toEqual(['opened']);

  // 누르면 카드가 접힌다. 다시 물을 근거가 없다.
  await expect(home.rating.card).toHaveCount(0);
});

test('몇 번 안 적은 사람에게는 별점을 묻지 않는다', async ({ home, page, prep }) => {
  // 공유 권유는 뜨는 줄(5건)이지만 별점은 아직이다.
  await prep.setBudget(600_000);
  await prep.addSeries(5, { amount: 3_000, prefix: '가게' });
  await seedNoticesDismissed(page);
  await home.open();
  await home.waitReady();

  await expect(home.share.card).toBeVisible();
  await expect(home.rating.card).toHaveCount(0);
  expect(await logsNamed(page, 'rating_asked')).toEqual([]);
});

test('별점 카드를 닫으면 닫았다고 남고 다시 뜨지 않는다', async ({ home, page, prep }) => {
  await seedEnoughRecords(prep);
  await seedNoticesDismissed(page);
  await home.open();
  await home.waitReady();

  await home.rating.closeButton.click();
  await expect(home.rating.card).toHaveCount(0);
  // 별점이 비키면 그 자리에 공유가 다시 선다. 자리를 빌린 것이지 뺏은 것이 아니다.
  await expect(home.share.card).toBeVisible();

  const asked = await logsNamed(page, 'rating_asked');
  expect(asked.map((log) => log.params.result)).toEqual(['dismissed']);
  // 닫은 사람에게 창이 열릴 일은 없다.
  expect(await reviewsOpened(page)).toBe(0);

  await home.open();
  await home.waitReady();
  await expect(home.rating.card).toHaveCount(0);
});

test('기본 분류의 이름과 색을 바꾸면 기록 화면까지 그대로 따라간다', async ({
  categories,
  page,
  recordSheet,
  home,
}) => {
  await categories.open();
  await categories.waitReady();

  await categories.openEdit('식비');
  await expect(categories.sheet.scopeNote).toBeVisible();
  await categories.sheet.nameField.fill('밥값');
  await categories.sheet.colorCell('연두').click();
  await categories.sheet.saveButton.click();
  await categories.sheet.waitClosed();

  await expect(categories.basicRow('밥값')).toBeVisible();

  await test.step('무엇을 건드렸는지가 로그에 남는다', async () => {
    const changed = await logsNamed(page, 'category_changed');
    expect(changed).toHaveLength(1);
    expect(changed[0].params.action).toBe('updated');
    // 기본 분류를 고친 것인지가 이 값의 핵심이다. 잦으면 기본 이름이 잘못 지어진 것이다.
    expect(changed[0].params.scope).toBe('default');
    expect(changed[0].params.fields).toBe('name+color');
  });

  // 목록에서만 바뀌고 기록 시트는 옛 이름이면, 같은 사람이 자리마다 다른 말을 본다.
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.input.categoryChip('밥값')).toBeVisible();
  await expect(recordSheet.input.categoryChip('식비')).toHaveCount(0);
});

test('고른 색은 뗄 수 있다. 한 번 고르면 묶이지 않는다', async ({ categories }) => {
  await categories.open();
  await categories.waitReady();

  await categories.openEdit('교통');
  await categories.sheet.colorCell('하늘').click();
  await categories.sheet.saveButton.click();
  await categories.sheet.waitClosed();

  await categories.openEdit('교통');
  await expect(categories.sheet.colorCell('하늘')).toHaveAttribute('aria-pressed', 'true');

  await categories.sheet.clearColorButton.click();
  await categories.sheet.saveButton.click();
  await categories.sheet.waitClosed();

  await categories.openEdit('교통');
  await expect(categories.sheet.clearColorButton).toHaveAttribute('aria-pressed', 'true');
  await expect(categories.sheet.colorCell('하늘')).toHaveAttribute('aria-pressed', 'false');
});
