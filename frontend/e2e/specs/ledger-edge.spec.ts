import { ROUTES } from '../../src/app/router/routes';
import { LEDGER_PAGE_SIZE } from '../../src/features/transactions/ledgerView';
import {
  formatCurrency,
  formatMonthLabel,
  formatSignedCurrency,
  toLedgerDate,
} from '../../src/shared/lib/format';
import { lastMonth, thisMonth } from '../support/api';
import { expect, test } from '../support/fixtures';

/**
 * 달력·장부·홈·앱 껍데기의 경계.
 *
 * 여기 모인 것은 "규칙대로면 이래야 하는데 아무도 화면으로 본 적 없는" 자리다.
 * 빈 달, 이체만 있는 날, 지출이 음수가 되는 달, 딱 한 페이지, 저장이 조용히 생략되는 경우.
 *
 * 기대값은 전부 규칙에서 계산한다. 화면에 찍힌 값을 옮겨 적으면 제품이 틀렸을 때도 초록이 된다.
 */

const TODAY = toLedgerDate(new Date());

// ── 달력이 말하는 숫자 ──────────────────────────────────

test('기록이 없는 지난달로 옮기면 합계가 전부 0이고 고른 날이 1일로 옮겨간다', async ({
  prep,
  calendar,
}) => {
  await prep.addTransaction({ amount: 12_000, merchant: '스타벅스' });

  await calendar.open();
  await calendar.waitReady();

  const previous = lastMonth();
  await calendar.goToMonth(formatMonthLabel(previous));

  await expect(calendar.totals.expense).toHaveText(formatCurrency(0));
  await expect(calendar.totals.income).toHaveText(formatCurrency(0));
  await expect(calendar.totals.delta).toHaveText(formatSignedCurrency(0));

  // 고른 날이 그 달 밖에 남으면, 지난달을 보면서 이번 달 목록을 읽는 화면이 된다.
  await expect(calendar.grid.selected).toHaveAttribute(
    'aria-label',
    calendar.grid.cellName(`${previous}-01`),
  );
  await expect(calendar.list.emptyDay).toBeVisible();
  await expect(calendar.list.row('스타벅스')).toHaveCount(0);

  await calendar.goToMonth(formatMonthLabel(thisMonth()));

  await expect(calendar.grid.selected).toHaveAttribute(
    'aria-label',
    calendar.grid.cellName(TODAY, { expense: 12_000 }),
  );
  await expect(calendar.totals.expense).toHaveText(formatCurrency(12_000));
  await expect(calendar.list.row('스타벅스')).toBeVisible();
});

test('이체만 있는 날은 달력 칸이 기록 없음인데 목록에는 그 한 줄이 있다', async ({
  prep,
  calendar,
}) => {
  await prep.addTransaction({ amount: 200_000, merchant: '적금 자동이체', type: 'transfer' });

  await calendar.open();
  await calendar.waitReady();

  // 이체는 집계에서 통째로 빠져 그 날이 응답에 실리지 않는다.
  await expect(calendar.grid.cell(calendar.grid.cellName(TODAY))).toBeVisible();
  await expect(calendar.totals.expense).toHaveText(formatCurrency(0));
  await expect(calendar.totals.income).toHaveText(formatCurrency(0));
  await expect(calendar.list.dayTotal).toHaveText(formatCurrency(0));

  // 목록은 다른 조회를 본다. 여기서는 남아 있어야 기록이 사라진 것처럼 보이지 않는다.
  await expect(calendar.list.row('적금 자동이체')).toBeVisible();
  await expect(calendar.list.chip('이체')).toBeVisible();
  await expect(calendar.list.emptyDay).toHaveCount(0);
});

test('환불만 있는 달은 지출이 음수로, 차액이 플러스로 뜬다', async ({ prep, calendar }) => {
  await prep.addTransaction({ amount: 3_000, merchant: '이마트 반품', type: 'refund' });

  await calendar.open();
  await calendar.waitReady();

  // 0 으로 붙이면 환불이 없던 일이 된다.
  await expect(calendar.totals.expense).toHaveText(formatCurrency(-3_000));
  await expect(calendar.totals.delta).toHaveText(formatSignedCurrency(3_000));

  await expect(
    calendar.grid.cell(calendar.grid.cellName(TODAY, { expense: -3_000 })),
  ).toBeVisible();
  await expect(calendar.list.dayTotal).toHaveText(formatCurrency(-3_000));
  await expect(calendar.list.chip('환불')).toBeVisible();
});

// ── 페이지 경계 ─────────────────────────────────────────

test('정확히 한 페이지 분량이면 더 보기가 없고 건수도 이상 없이 적힌다', async ({
  prep,
  calendar,
}) => {
  await prep.addSeries(LEDGER_PAGE_SIZE, { amount: 1_000, prefix: '줄' });
  const oldest = `줄${String(LEDGER_PAGE_SIZE).padStart(2, '0')}`;

  await calendar.open();
  await calendar.waitReady();

  // 서버가 한 건 더 떠 보고 커서를 준다. 딱 맞는 자리에서 커서를 주면 빈 페이지를 부르는 버튼이 남는다.
  await expect(calendar.list.row('줄01')).toBeVisible();
  await expect(calendar.list.row(oldest)).toBeVisible();
  await expect(calendar.list.moreButton).toHaveCount(0);
  await expect(calendar.list.dayTotal).toHaveText(formatCurrency(1_000 * LEDGER_PAGE_SIZE));

  // 검색 결과도 같은 경계를 지난다. 여기서 틀리면 안내가 '30건 이상' 이라고 거짓말한다.
  await calendar.search.find('줄');
  await expect(calendar.search.resultCount).toHaveText(`검색 결과 ${LEDGER_PAGE_SIZE}건`);
  await expect(calendar.list.moreButton).toHaveCount(0);
  await expect(calendar.list.row(oldest)).toBeVisible();
});

// ── 검색 ────────────────────────────────────────────────

test('검색어에 %를 넣으면 전부 걸리지 않고 아무것도 안 나온다', async ({ prep, calendar }) => {
  await prep.addTransaction({ amount: 12_000, merchant: '스타벅스', minutesAgo: 1 });
  await prep.addTransaction({ amount: 3_000, merchant: '이마트', minutesAgo: 2 });

  await calendar.open();
  await calendar.waitReady();

  // % 를 글자로 바꾸지 않으면 한 글자로 남의 기록까지 전부 훑는 조회가 된다.
  await calendar.search.find('%');
  await expect(calendar.search.noResult).toBeVisible();
  await expect(calendar.list.row('스타벅스')).toHaveCount(0);
  await expect(calendar.list.row('이마트')).toHaveCount(0);

  // 위가 통한 이유가 '검색이 죽어서' 는 아니라는 대조군이다.
  await calendar.search.find('마트');
  await expect(calendar.search.resultCount).toHaveText('검색 결과 1건');
  await expect(calendar.list.row('이마트')).toBeVisible();
  await expect(calendar.list.row('스타벅스')).toHaveCount(0);
});

// ── 수정 시트 ───────────────────────────────────────────

test('금액을 비우면 완료가 잠겨 상호만 반쪽 저장되는 일이 없다', async ({ prep, calendar }) => {
  await prep.addTransaction({ amount: 12_000, merchant: '스타벅스' });

  await calendar.open();
  await calendar.waitReady();

  await calendar.list.pick('스타벅스');
  await calendar.edit.waitOpen();
  await calendar.edit.amount.fill('');

  // 금액만 조용히 빠진 채 나머지가 저장되면 장부 합계가 사용자가 믿는 값과 달라진다.
  await calendar.edit.merchant.fill('스타벅스 강남');
  await expect(calendar.edit.doneButton).toBeDisabled();
  await expect(calendar.edit.amountHint).toBeVisible();

  await calendar.edit.amount.fill('0');
  await expect(calendar.edit.doneButton).toBeDisabled();

  // 되채우면 잠금이 풀리고 상호와 금액이 함께 저장된다.
  await calendar.edit.amount.fill('9000');
  await expect(calendar.edit.doneButton).toBeEnabled();
  await calendar.edit.done();

  await expect(calendar.list.row('스타벅스 강남')).toBeVisible();
  await expect(calendar.totals.expense).toHaveText(formatCurrency(9_000));
  await expect(calendar.list.dayTotal).toHaveText(formatCurrency(9_000));
});

test('예산 제외를 켠 뒤 금액을 고쳐도 남은 예산은 안 움직이고, 제외를 끄면 그때 반영된다', async ({
  prep,
  calendar,
  home,
}) => {
  await prep.setBudget(300_000);
  await prep.addTransaction({ amount: 50_000, merchant: '노트북거치대' });

  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('노트북거치대');
  await calendar.edit.waitOpen();
  await calendar.edit.excludeToggle.click();
  await calendar.edit.done();

  await home.open();
  await home.waitReady();
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(300_000));

  // 켠 다음에 고치는 것과 한 번에 보내는 것이 같은 결과여야 한다.
  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('노트북거치대');
  await calendar.edit.waitOpen();
  await calendar.edit.amount.fill('80000');
  await calendar.edit.done();

  await expect(calendar.totals.expense).toHaveText(formatCurrency(80_000));
  await expect(calendar.list.chip('예산 제외')).toBeVisible();

  await home.open();
  await home.waitReady();
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(300_000));

  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('노트북거치대');
  await calendar.edit.waitOpen();
  await calendar.edit.excludeToggle.click();
  await calendar.edit.done();

  await expect(calendar.list.chip('예산 제외')).toHaveCount(0);
  await expect(calendar.totals.expense).toHaveText(formatCurrency(80_000));

  await home.open();
  await home.waitReady();
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(220_000));
});

test('수정 시트에서 지우면 달력 칸의 금액까지 사라지고 홈의 남은 예산도 되돌아온다', async ({
  prep,
  calendar,
  home,
}) => {
  await prep.setBudget(300_000);
  await prep.addTransaction({ amount: 50_000, merchant: '노트북거치대' });

  await calendar.open();
  await calendar.waitReady();
  await expect(
    calendar.grid.cell(calendar.grid.cellName(TODAY, { expense: 50_000 })),
  ).toBeVisible();

  await calendar.list.pick('노트북거치대');
  await calendar.edit.waitOpen();
  await calendar.edit.remove();

  // 삭제 응답에는 쓸 값이 없어 무효화만으로 화면을 맞춘다. 달력 칸은 별도 조회라 잘 빠뜨린다.
  await expect(calendar.grid.cell(calendar.grid.cellName(TODAY))).toBeVisible();
  await expect(calendar.list.dayTotal).toHaveText(formatCurrency(0));
  await expect(calendar.totals.expense).toHaveText(formatCurrency(0));
  await expect(calendar.list.emptyDay).toBeVisible();

  await home.open();
  await home.waitReady();
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(300_000));
});

// ── 홈 ──────────────────────────────────────────────────

test('예산을 딱 맞춰 쓰면 100%에서 색이 그대로고, 1원만 넘겨도 남은 예산이 음수가 된다', async ({
  prep,
  home,
}) => {
  await prep.setBudget(100_000);
  await prep.addTransaction({ amount: 100_000, merchant: '월세보탬' });

  await home.open();
  await home.waitReady();

  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(0));
  await expect(home.hero.spendPercent).toHaveText('100% 썼어요');
  expect(await home.hero.gaugePercent()).toBe(100);
  const onBudgetColor = await home.hero.gaugeFillColor();

  await prep.addTransaction({ amount: 1, merchant: '자판기', minutesAgo: 1 });
  await home.open();
  await home.waitReady();

  // 색이 갈리는 경계는 초과 하나뿐이다. 막대는 100 에서 멈추고 넘긴 것은 남은 예산이 말한다.
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(-1));
  expect(await home.hero.gaugePercent()).toBe(100);
  expect(await home.hero.gaugeFillColor()).not.toBe(onBudgetColor);
});

// ── 앱 껍데기 ───────────────────────────────────────────

test('달력에서 시스템 뒤로가기를 누르면 수정 시트가 먼저 닫히고, 한 번 더 눌러야 홈으로 간다', async ({
  prep,
  calendar,
  appShell,
}) => {
  await prep.addTransaction({ amount: 12_000, merchant: '스타벅스' });

  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('스타벅스');
  await calendar.edit.waitOpen();

  // 뒤로가기를 구독하는 순간 플랫폼 기본 동작이 막힌다. 순서가 뒤집히면 시트가 열린 채 화면만 빠진다.
  await appShell.pressBack();
  await calendar.edit.waitClosed();
  expect(appShell.pathname).toBe(ROUTES.calendar);
  await expect(calendar.list.row('스타벅스')).toBeVisible();

  await appShell.pressBack();
  await expect.poll(() => appShell.pathname).toBe(ROUTES.home);
  await appShell.expectTabsVisible();
});
