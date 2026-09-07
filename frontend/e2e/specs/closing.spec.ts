import { ROUTES } from '../../src/app/router/routes';
import { CLOSING_ENTRY_WINDOW_DAYS } from '../../src/shared/lib/closingSeen';
import { findForbiddenWords } from '../../src/shared/lib/forbiddenWords';
import {
  formatCurrency,
  formatMonthLabel,
  shiftMonth,
  toLedgerDate,
} from '../../src/shared/lib/format';
import type { PrepApi } from '../support/api';
import { expect, test } from '../support/fixtures';

/**
 * 월간 결산 한 바퀴.
 *
 * 여기서 지키는 것 둘이다. **근거가 있는 것만 말한다**(없으면 억지 칭찬도 억지 조언도
 * 하지 않는다), 그리고 **카드 순서가 흔들리지 않는다**(잘한 것을 먼저 보여주지 않으면
 * 그 뒤 문장을 아무도 안 읽는다).
 *
 * 판정은 서버가 하고 문장은 화면이 만든다. 그래서 숫자는 서버가 준 값이 그대로 찍히는지,
 * 문장은 탓하는 말이 섞이지 않았는지를 본다.
 */

/** 가계부 시간대(KST) 기준 오늘. 러너가 UTC 면 `new Date().getDate()` 와 하루 어긋난다. */
const TODAY = toLedgerDate(new Date());
const THIS_MONTH = TODAY.slice(0, 7);
const LAST_MONTH = shiftMonth(THIS_MONTH, -1);
const TWO_MONTHS_AGO = shiftMonth(THIS_MONTH, -2);

const BUDGET = 400_000;
const FOOD_BEFORE = 300_000;
const FOOD_AFTER = 240_000;
const CAFE_BEFORE = 47_300;
const CAFE_AFTER = 90_000;

/** 어느 달에 돌려도 있는 날. 월말 며칟날은 달마다 있고 없고가 갈린다. */
function day(month: string, dayOfMonth: string): string {
  return `${month}-${dayOfMonth}`;
}

/**
 * 잘한 것도 살펴볼 변화도 다 나오는 지난달을 만든다.
 *
 * 예산 안에서 마쳤고(40만 중 33만), 식비는 줄었고, 카페는 늘었고, 안 쓴 날이 하루 있다.
 */
async function seedRichMonth(prep: PrepApi): Promise<void> {
  const food = await prep.categoryIdByName('식비');
  const cafe = await prep.categoryIdByName('카페·간식');

  await prep.setBudget(BUDGET, LAST_MONTH);
  await prep.addTransaction({
    amount: FOOD_BEFORE,
    on: day(TWO_MONTHS_AGO, '05'),
    categoryId: food,
  });
  await prep.addTransaction({
    amount: CAFE_BEFORE,
    on: day(TWO_MONTHS_AGO, '06'),
    categoryId: cafe,
  });
  await prep.addTransaction({ amount: FOOD_AFTER, on: day(LAST_MONTH, '05'), categoryId: food });
  await prep.addTransaction({ amount: CAFE_AFTER, on: day(LAST_MONTH, '06'), categoryId: cafe });

  const noSpend = await prep.saveNoSpend(day(LAST_MONTH, '02'));
  expect(noSpend.status, '안 쓴 날을 심지 못했다').toBe(201);
}

test('끝난 달에 기록이 있을 때만 결산 입구가 생긴다', async ({ prep, report }) => {
  await seedRichMonth(prep);

  await report.open();
  await report.waitReady();
  // 아직 지나는 중인 달은 결산할 수 없다. 마지막 날 저녁에 쓴 돈이 아직 안 적혔다.
  await expect(report.closing.card).toHaveCount(0);

  await report.goPreviousMonth();
  await report.waitReady();
  await expect(report.closing.card).toBeVisible();
  await expect(report.closing.card).toContainText(formatMonthLabel(LAST_MONTH));
});

test('기록이 없는 달에는 결산 입구가 없다', async ({ report }) => {
  await report.open();
  await report.waitReady();
  await report.goPreviousMonth();
  await report.waitReady();

  // 돌아볼 것이 없는 달에 결산을 열어 주면 빈 카드 넉 장이 넘어간다.
  await expect(report.emptyNotice).toBeVisible();
  await expect(report.closing.card).toHaveCount(0);
});

test('카드 넉 장이 잘한 것부터 정해진 순서로 넘어간다', async ({ prep, report }) => {
  await seedRichMonth(prep);

  await report.open({ month: LAST_MONTH });
  await report.waitReady();
  await report.closing.open();

  await expect(report.closing.dots).toHaveCount(4);
  await expect(report.closing.currentDot).toHaveCount(1);

  await expect(report.closing.title).toHaveText('잘한 것');
  // 예산 안에서 마친 것 · 식비를 줄인 것 · 안 쓴 날. 셋 다 근거가 있다.
  await expect(report.closing.highlights).toHaveCount(3);
  // 남긴 돈은 서버가 센 값이다. 화면이 예산에서 지출을 빼서 만들지 않는다.
  await expect(report.closing.highlights.first()).toContainText(
    formatCurrency(BUDGET - FOOD_AFTER - CAFE_AFTER),
  );
  await expect(report.closing.highlights.nth(1)).toContainText(
    formatCurrency(FOOD_BEFORE - FOOD_AFTER),
  );

  await report.closing.nextButton.click();
  await expect(report.closing.title).toHaveText('돈 흐름');
  await expect(report.closing.flow).toContainText(formatCurrency(FOOD_AFTER + CAFE_AFTER));

  await report.closing.nextButton.click();
  await expect(report.closing.title).toHaveText('살펴볼 변화');
  await expect(report.closing.change).toContainText(formatCurrency(CAFE_AFTER - CAFE_BEFORE));
  // 늘어난 것을 잘못으로 읽지 않게 못 박아 둔 한 줄.
  await expect(report.closing.change).toContainText('나쁜 게 아니라');

  await report.closing.nextButton.click();
  await expect(report.closing.title).toHaveText('다음 달 하나만');
  // 지난달 47,300원을 1,000원 단위로 올린 값. 이번 달 금액에서 깎으면 늘어난 자리를 굳힌다.
  await expect(report.closing.next).toContainText(formatCurrency(48_000));
  // 여기서 예산을 대신 정해 주지 않는다. 가는 길만 열어 둔다.
  await expect(report.closing.budgetLink).toBeVisible();

  // 마지막 장에는 다음이 없다. 넉 장이 정말 끝이라는 뜻이다.
  await expect(report.closing.nextButton).toHaveCount(0);
  await report.closing.doneButton.click();
  await expect(report.closing.overlay).toHaveCount(0);
});

test('잘한 것을 찾지 못하면 억지로 칭찬하지 않는다', async ({ prep, report }) => {
  // 예산도, 줄어든 분류도, 안 쓴 날도 없다. 지난달 지출 한 건뿐이다.
  await prep.addTransaction({ amount: 12_000, on: day(LAST_MONTH, '05') });

  await report.open({ month: LAST_MONTH });
  await report.waitReady();
  await report.closing.open();

  await expect(report.closing.highlights).toHaveCount(0);
  await expect(report.closing.overlay).toContainText(
    `${Number(LAST_MONTH.slice(5, 7))}월은 기록한 것만으로도 충분해요`,
  );

  await report.closing.nextButton.click();
  await report.closing.nextButton.click();
  // 견줄 지난달이 없으면 변화도 지어내지 않는다.
  await expect(report.closing.change).toContainText('크게 달라진 분류는 없어요');

  await report.closing.nextButton.click();
  await expect(report.closing.next).toContainText('지금처럼 하면 돼요');
  // 권할 것이 없으면 갈 곳도 만들지 않는다.
  await expect(report.closing.budgetLink).toHaveCount(0);
});

test('결산 어느 카드에도 탓하는 말과 광고가 없다', async ({ prep, report }) => {
  await seedRichMonth(prep);

  await report.open({ month: LAST_MONTH });
  await report.waitReady();
  await report.closing.open();

  // 배너는 홈 한 곳뿐이다. 한 달을 돌아보는 자리에 광고가 끼면 결산이 광고의 구실이 된다.
  await expect(report.closing.adSlot).toHaveCount(0);

  // 한 장만 보면 나머지 석 장의 문구는 아무도 안 본다. 넉 장을 끝까지 넘기며 훑는다.
  const cards = await report.closing.readAllCards();
  expect(cards, '카드 넉 장을 다 읽지 못했다').toHaveLength(4);
  for (const text of cards) {
    expect(findForbiddenWords(text), text).toEqual([]);
  }
});

test('✕ 와 시스템 뒤로가기 둘 다 결산을 닫는다', async ({ appShell, prep, report }) => {
  await seedRichMonth(prep);

  await report.open({ month: LAST_MONTH });
  await report.waitReady();

  await report.closing.open();
  await report.closing.closeButton.click();
  await expect(report.closing.overlay).toHaveCount(0);

  await report.closing.open();
  await appShell.pressBack();
  await expect(report.closing.overlay).toHaveCount(0);
  // 닫히기만 하고 화면을 떠나지 않는다. 결산을 닫았더니 앱이 꺼지면 안 된다.
  expect(appShell.pathname).toBe(ROUTES.report);
});

test('주소로 들어오면 그 달 결산이 열린 채로 시작한다', async ({ prep, report }) => {
  // 홈의 결산 카드가 붙여 주는 주소다. 눌러서 오는 길은 아래 홈 검사가 본다.
  await seedRichMonth(prep);

  await report.open({ month: LAST_MONTH, closing: true });
  await report.waitReady();

  await expect(report.closing.overlay).toBeVisible();
  await expect(report.closing.title).toHaveText('잘한 것');
  // 결산만 열리고 뒤 화면은 다른 달이면 닫았을 때 엉뚱한 달에 서 있게 된다.
  await expect(report.headlineLabel).toContainText(formatMonthLabel(LAST_MONTH));
});

test('홈의 결산 카드는 달 초에만 뜨고, 한 번 열어 보면 사라진다', async ({
  appShell,
  home,
  prep,
  report,
}) => {
  await seedRichMonth(prep);

  await home.open();
  await home.waitReady();

  if (Number(TODAY.slice(8, 10)) > CLOSING_ENTRY_WINDOW_DAYS) {
    // 달 초 며칠이 지나면 지난달 이야기를 홈에서 걷는다. 오늘 기록하러 온 자리다.
    await expect(home.closing.link).toHaveCount(0);
    return;
  }

  await expect(home.closing.link).toBeVisible();
  await home.closing.link.click();

  await expect(report.closing.overlay).toBeVisible();
  await expect(report.closing.title).toHaveText('잘한 것');
  await report.closing.closeButton.click();

  await appShell.goToTab('홈');
  await home.waitReady();
  // 한 번 열어 봤으면 사라진다. 같은 카드가 매일 뜨면 알림이 아니라 잔소리가 된다.
  await expect(home.closing.link).toHaveCount(0);
});
