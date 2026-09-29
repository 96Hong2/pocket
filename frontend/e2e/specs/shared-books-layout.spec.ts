import type { Locator, Page } from '@playwright/test';

import type { PrepApi } from '../support/api';
import { expect, test } from '../support/fixtures';

/**
 * 공유 홈이 한 화면에 어떻게 서는지 좌표로 잰다.
 *
 * 지키는 것:
 * - 토스 웹뷰(390x746)에서 멤버 둘, 이번 달 기록 여섯 건, 예산 없음이어도 정산 카드가
 *   내리지 않고 보인다. 탭바가 본문 위에 떠 있어 `toBeInViewport` 로는 가린 것을 못 본다.
 *   그래서 카드 아래 끝과 탭바 알약 윗변을 견준다.
 * - 맨 위 줄의 가계부 칩은 알약 왼쪽 끝이 아래 카드 왼쪽 끝에, 멤버 얼굴 오른쪽 끝이 카드
 *   오른쪽 끝에 선다. 칩과 얼굴은 같은 가운데 줄에 있다. 개인 홈과 리포트의 칩도 같은 자리다.
 */

/** 토스 앱 안 실제 웹뷰. 아이폰 390pt 폭에서 상태줄과 토스 머리줄을 뺀 높이다. */
const TOSS_WEBVIEW = { width: 390, height: 746 };
/**
 * 정산 카드와 탭바 알약 사이에 남아야 하는 틈. 붙어 있으면 가린 것처럼 읽힌다.
 *
 * 알약 윗변은 화면에서 잰 값을 쓴다. e2e 목 SDK 는 아래 안전영역을 34px 로 주어, 실기기
 * 캡처(바닥에서 20px 위)보다 알약이 34px 높게 선다. 판정이 실기기보다 엄한 쪽이다.
 */
const TABBAR_GAP = 8;

const TITLES = ['이마트', '스타벅스', '다이소', '올리브영', '김밥천국', '쿠팡'];

/** 멤버 둘에 이번 달 기록 여섯 건. 예산은 두지 않는다(「예산 정하기」 줄이 서는 더 긴 쪽). */
async function seedBusyBook(prep: PrepApi, partnerPrep: PrepApi): Promise<void> {
  const bookId = await prep.createBook({ name: '데이트통장', myName: '은홍' });
  await partnerPrep.joinBook(await prep.bookInviteCode(bookId), '준호');
  for (const [index, title] of TITLES.entries()) {
    await prep.addBookEntry(bookId, { amount: (index + 1) * 3_000, title, category: '장보기' });
  }
}

async function box(
  locator: Locator,
): Promise<{ x: number; y: number; right: number; bottom: number; mid: number }> {
  const found = await locator.boundingBox();
  if (found == null) throw new Error('상자를 화면에서 못 찾았다');
  return {
    x: found.x,
    y: found.y,
    right: found.x + found.width,
    bottom: found.y + found.height,
    mid: found.y + found.height / 2,
  };
}

/** 떠 있는 탭바의 알약. 바깥 `nav` 는 위아래 여백까지 품어 윗변이 알약보다 높다. */
function tabbarPill(page: Page): Locator {
  return page.getByRole('navigation', { name: '주요 화면' }).locator('.tabbar__inner');
}

test.describe('토스 웹뷰 한 화면(390x746)', () => {
  test.use({ viewport: TOSS_WEBVIEW });

  test('기록이 여섯 건이어도 정산 카드가 탭바에 안 가리고 보인다', async ({
    home,
    page,
    partner,
    prep,
  }) => {
    await seedBusyBook(prep, partner.prep);

    await home.open();
    await home.waitReady();
    await home.book.switchTo('데이트통장');
    await expect(home.book.moreButton).toHaveText('이번 달 6건 모두 보기');
    await expect(home.book.setBudgetButton).toBeVisible();
    // 한 번뿐인 카드가 서면 더 긴 화면이 된다. 이 측정은 그것들이 없는 보통 날이다.
    await expect(home.book.cards.alone).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: '들어왔어요' })).toHaveCount(0);
    await expect(home.book.settleCard).toBeVisible();

    const settle = await box(home.book.settleCard);
    const pill = await box(tabbarPill(page));
    test.info().annotations.push({
      type: '390x746',
      description: `정산 카드 아래 끝 ${settle.bottom}, 탭바 알약 윗변 ${pill.y}`,
    });
    expect(settle.bottom).toBeLessThanOrEqual(pill.y - TABBAR_GAP);
  });

  test('맨 위 줄: 칩은 카드 왼쪽 끝, 얼굴은 카드 오른쪽 끝, 둘은 같은 가운데 줄', async ({
    home,
    page,
    partner,
    prep,
    report,
  }) => {
    await seedBusyBook(prep, partner.prep);

    await home.open();
    await home.waitReady();
    const mineChip = await box(home.book.chip);

    await home.book.switchTo('데이트통장');
    const card = await box(home.book.recent.region.locator('.pk-card').first());
    const chip = await box(home.book.chip);
    const faces = await box(home.book.faces);
    const lastFace = await box(home.book.faces.locator('.book-faces__face').last());

    expect(Math.abs(chip.x - card.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(lastFace.right - card.right)).toBeLessThanOrEqual(1);
    expect(Math.abs(chip.mid - faces.mid)).toBeLessThanOrEqual(1);
    expect(Math.abs(chip.mid - lastFace.mid)).toBeLessThanOrEqual(1);
    // 누르는 자리는 손가락 하나만큼 남는다.
    expect(chip.bottom - chip.y).toBeGreaterThanOrEqual(44);

    // 개인 홈의 칩도 같은 자리에 선다.
    expect(Math.abs(mineChip.x - chip.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(mineChip.mid - chip.mid)).toBeLessThanOrEqual(1);

    // 리포트 머리의 칩도 음수 여백 없이 같은 왼쪽 끝에 선다.
    await report.open();
    await expect(report.book.chip).toBeVisible();
    const reportChip = await box(report.book.chip);
    expect(Math.abs(reportChip.x - card.x)).toBeLessThanOrEqual(1);
    await expect(page.getByRole('heading', { name: '리포트', level: 1 })).toBeVisible();
    const title = await box(page.getByRole('heading', { name: '리포트', level: 1 }));
    expect(Math.abs(reportChip.x - title.x)).toBeLessThanOrEqual(1);
  });
});

/** 폴드 겉화면. 다른 공유 가계부 검사(shared-books-record)와 같은 값을 쓴다. */
const FOLD_COVER = { width: 344, height: 882 };

test.describe('폴드 겉화면 폭(344x882)', () => {
  test.use({ viewport: FOLD_COVER });

  test('좁은 폭에서도 맨 위 줄이 카드 양끝에 맞고, 정산 카드가 탭바에 안 가린다', async ({
    home,
    page,
    partner,
    prep,
  }) => {
    await seedBusyBook(prep, partner.prep);

    await home.open();
    await home.waitReady();
    await home.book.switchTo('데이트통장');
    await expect(home.book.settleCard).toBeVisible();

    const card = await box(home.book.recent.region.locator('.pk-card').first());
    const chip = await box(home.book.chip);
    const lastFace = await box(home.book.faces.locator('.book-faces__face').last());
    expect(Math.abs(chip.x - card.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(lastFace.right - card.right)).toBeLessThanOrEqual(1);
    expect(Math.abs(chip.mid - lastFace.mid)).toBeLessThanOrEqual(1);

    // 좁은 폭은 글이 더 접혀 카드가 길어진다. 390 과 같은 기준으로 견준다.
    await expect(home.book.moreButton).toHaveText('이번 달 6건 모두 보기');
    await expect(home.book.setBudgetButton).toBeVisible();
    const settle = await box(home.book.settleCard);
    const pill = await box(tabbarPill(page));
    test.info().annotations.push({
      type: '344x882',
      description: `정산 카드 아래 끝 ${settle.bottom}, 탭바 알약 윗변 ${pill.y}`,
    });
    expect(settle.bottom).toBeLessThanOrEqual(pill.y - TABBAR_GAP);
  });
});
