import { formatCurrency } from '../../../src/shared/lib/format';
import { adNoFillForced, forceAdNoFill } from '../../support/aitMock';
import { expect, test } from '../support/director';

/**
 * 광고 자리가 어떻게 동작하는지 한 영상에 담는다.
 *
 * 배너가 붙으면 홈 맨 아래에서 96px 규격대로 자리를 차지하고, 홈이 얼굴을 바꿔도 다시 붙지 않는다.
 * 채울 광고가 없으면 슬롯을 통째로 접어 빈 칸도 스켈레톤도 남기지 않는다.
 * 접힌 화면은 눈에 보이는 것이 없으므로 자막으로 무엇을 보고 있는지 말해 준다.
 */

/** 붙었을 때 슬롯이 차지해야 하는 높이. */
const AD_HEIGHT = 96;

const AMOUNT = 12_000;
const CATEGORY = '식비';
const BUDGET = 500_000;

/** 배너 요소에 찍어 두는 표식. 같은 표식이 남아 있으면 그 DOM 이 그대로 산 것이다. */
const BANNER_STAMP = 'ads-demo';

test('08 광고 자리는 붙으면 96px, 없으면 접힌다', async ({ page, home, recordSheet, demo }) => {
  await home.open();
  await home.waitReady();
  await demo.open('광고 자리', '배너가 붙으면 규격대로 자리를 잡고, 채울 광고가 없으면 접는다');

  await demo.step('홈 맨 아래, 오늘 목록 다음이 광고 자리다');
  await home.ads.slot.scrollIntoViewIfNeeded();
  await expect(home.ads.banner).toBeVisible();
  await expect(home.ads.slot).toBeInViewport();
  await demo.beat(2);

  await demo.step('높이 96px 규격 그대로다. 라벨도 테두리도 우리가 그리지 않는다');
  const filledBox = await home.ads.slot.boundingBox();
  expect(filledBox?.height, `광고 자리 높이가 ${filledBox?.height}px 다`).toBe(AD_HEIGHT);
  await demo.beat(2);

  await demo.step('홈 얼굴을 바꿔 본다. 먼저 12,000원을 기록한다');
  // 지금 붙어 있는 배너에 표식을 찍어 둔다. 뒤에 그대로 남아 있는지로 재부착을 가린다.
  await home.ads.stamp(BANNER_STAMP);
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(AMOUNT);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(AMOUNT));
  await recordSheet.input.pickCategory(CATEGORY);
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await demo.step('예산을 정하면 히어로가 남은 예산으로 바뀐다');
  await expect(home.budget.saveButton).toBeVisible();
  await home.budget.set(BUDGET);
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET - AMOUNT));

  await demo.step('히어로는 바뀌었는데 광고는 그 자리 그대로다');
  // 표식이 살아 있다 = 같은 DOM 이다 = 홈이 얼굴을 바꿔도 배너를 다시 붙이지 않았다.
  expect(await home.ads.stampValue(), '배너가 다시 붙었다').toBe(BANNER_STAMP);
  const afterBox = await home.ads.slot.boundingBox();
  expect(afterBox?.height, `광고 자리 높이가 ${afterBox?.height}px 로 바뀌었다`).toBe(AD_HEIGHT);
  await demo.beat(2);

  await demo.step('이번에는 채울 광고가 없는 상태로 다시 연다');
  // 목의 미채움 다이얼. 목은 이때 초기화부터 실패시키고 배너를 붙이지 않는다.
  await page.addInitScript(forceAdNoFill);
  await home.open();
  await home.waitReady();

  // 다이얼이 안 켜졌으면 미채움을 보고 있는 것이 아니다. 화면을 보기 전에 여기서 막는다.
  expect(await adNoFillForced(page), '목의 미채움 다이얼이 켜지지 않았다').toBe(true);

  await demo.step('미채움 다이얼을 켰다. 슬롯은 DOM 에 남아 있지만 화면에서는 사라진다');
  await expect(home.ads.slot).toHaveCount(1);
  await expect(home.ads.slot).not.toBeVisible();
  await expect(home.ads.banner).toBeHidden();
  expect(await home.ads.slot.boundingBox(), '접힌 광고 자리가 아직 크기를 차지한다').toBeNull();
  await demo.beat(2);

  await demo.step('오늘 목록 아래가 바로 화면 끝이다. 빈 칸도 스켈레톤도 없다');
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});
