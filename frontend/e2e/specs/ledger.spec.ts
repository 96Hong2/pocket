import { LEDGER_PAGE_SIZE } from '../../src/features/transactions/ledgerView';
import { formatCurrency, formatDayLabel, toLedgerDate } from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';

/**
 * 기록한 것을 다시 보고 고치는 화면.
 *
 * 준비는 API 로 심고, 행동과 단언은 화면으로 한다.
 * 날짜는 실행하는 날에 따라 달라지므로 같은 달 안에서 만들어 쓴다. 달을 넘기면
 * 이번 달 달력에 안 보여서 테스트가 날짜 때문에 깨진다.
 */

const TODAY = toLedgerDate(new Date());
const DAY_OF_MONTH = Number(TODAY.slice(8, 10));

/** 같은 달 안의 다른 날. 1일이면 앞날짜가 없어 다음 날을 쓴다. */
const OTHER_DAY_AGO = DAY_OF_MONTH > 1 ? 1 : -1;

function otherDayIso(): string {
  const at = new Date();
  at.setDate(at.getDate() - OTHER_DAY_AGO);
  return toLedgerDate(at);
}

/** 달력 칸 이름. 화면이 붙이는 접근성 이름과 같은 방식으로 만든다. */
function cellName(iso: string, ...parts: string[]): string {
  return `${formatDayLabel(iso)}, ${parts.length > 0 ? parts.join(', ') : '기록 없음'}`;
}

// ── 달력과 하루 목록 ────────────────────────────────────

test('달력이 날짜별 합계를 보여주고, 날짜를 누르면 그 날만 남는다', async ({
  prep,
  calendar,
}) => {
  await prep.addTransaction({ amount: 12_000, merchant: '스타벅스', minutesAgo: 1 });
  await prep.addTransaction({ amount: 3_000, merchant: '이마트', minutesAgo: 2 });
  await prep.addTransaction({ amount: 8_000, merchant: '어제분식', daysAgo: OTHER_DAY_AGO });

  await calendar.open();
  await calendar.waitReady();

  // 달마다 며칠인지 화면이 스스로 맞춘다.
  const daysInMonth = new Date(
    Number(TODAY.slice(0, 4)),
    Number(TODAY.slice(5, 7)),
    0,
  ).getDate();
  expect(await calendar.grid.cellCount()).toBe(daysInMonth);

  await expect(calendar.totals.expense).toHaveText(formatCurrency(23_000));
  await expect(
    calendar.grid.cell(cellName(TODAY, `지출 ${formatCurrency(15_000)}`)),
  ).toBeVisible();

  // 처음에는 오늘이 골라져 있다.
  await expect(calendar.grid.selected).toHaveAttribute(
    'aria-label',
    cellName(TODAY, `지출 ${formatCurrency(15_000)}`),
  );
  await expect(calendar.list.row('스타벅스')).toBeVisible();
  await expect(calendar.list.row('어제분식')).toHaveCount(0);
  await expect(calendar.list.dayTotal).toHaveText(formatCurrency(15_000));

  // 다른 날로 옮기면 목록과 합계가 그 날 것으로 갈린다.
  const other = otherDayIso();
  await calendar.grid.select(cellName(other, `지출 ${formatCurrency(8_000)}`));

  await expect(calendar.list.row('어제분식')).toBeVisible();
  await expect(calendar.list.row('스타벅스')).toHaveCount(0);
  await expect(calendar.list.dayTotal).toHaveText(formatCurrency(8_000));
});

test('기록이 없는 날은 없다고 말한다', async ({ prep, calendar }) => {
  await prep.addTransaction({ amount: 8_000, merchant: '어제분식', daysAgo: OTHER_DAY_AGO });

  await calendar.open();
  await calendar.waitReady();

  // 오늘은 비어 있다. 먼저 비었다고 말하는지 보고,
  await expect(calendar.list.emptyDay).toBeVisible();
  // 기록이 있는 날로 옮기면 그 말이 사라진다. 항상 떠 있는 문구가 아니라는 증거다.
  await calendar.grid.select(cellName(otherDayIso(), `지출 ${formatCurrency(8_000)}`));
  await expect(calendar.list.emptyDay).toHaveCount(0);
});

// ── 검색 ────────────────────────────────────────────────

test('상호와 카테고리 이름으로 찾고, 없으면 없다고 말한다', async ({ prep, calendar }) => {
  const food = await prep.categoryIdByName('식비');
  await prep.addTransaction({ amount: 12_000, merchant: '스타벅스', categoryId: food });
  await prep.addTransaction({ amount: 3_000, merchant: '이마트', minutesAgo: 1 });

  await calendar.open();
  await calendar.waitReady();

  // 검색하기 전에는 결과 안내도 없음 안내도 뜨지 않는다.
  await expect(calendar.search.resultCount).toHaveCount(0);
  await expect(calendar.search.noResult).toHaveCount(0);

  await calendar.search.find('스타벅스');
  await expect(calendar.search.resultCount).toHaveText('검색 결과 1건');
  await expect(calendar.list.row('스타벅스')).toBeVisible();
  await expect(calendar.list.row('이마트')).toHaveCount(0);

  // 안내 문구가 '상호나 카테고리로 검색' 이다. 카테고리 이름으로도 찾혀야 그 약속이 지켜진다.
  await calendar.search.find('식비');
  await expect(calendar.list.row('스타벅스')).toBeVisible();

  await calendar.search.find('없는가게');
  await expect(calendar.search.noResult).toBeVisible();
  await expect(calendar.list.row('스타벅스')).toHaveCount(0);

  // 지우면 달력이 돌아온다.
  await calendar.search.clear();
  await expect(calendar.grid.selected).toBeVisible();
});

// ── 페이지 넘기기 ───────────────────────────────────────

test('한 화면에 다 안 들어오면 더 보기로 이어 받는다', async ({ prep, calendar }) => {
  const total = LEDGER_PAGE_SIZE + 1;
  await prep.addSeries(total, { amount: 1_000, prefix: '줄' });

  await calendar.open();
  await calendar.waitReady();

  const oldest = `줄${String(total).padStart(2, '0')}`;
  const newest = '줄01';

  // 첫 페이지에는 새것부터 들어오고, 마지막 줄은 아직 없다.
  await expect(calendar.list.row(newest)).toBeVisible();
  await expect(calendar.list.row(oldest)).toHaveCount(0);
  await expect(calendar.list.moreButton).toBeVisible();

  await calendar.list.more();

  // 없던 줄이 생겼고, 더 받을 것이 없어 버튼이 사라진다.
  await expect(calendar.list.row(oldest)).toBeVisible();
  await expect(calendar.list.moreButton).toHaveCount(0);
  await expect(calendar.list.row(newest)).toBeVisible();
});

// ── 수정 ────────────────────────────────────────────────

test('수정 시트에서 상호·금액·카테고리를 고치면 목록과 합계가 함께 바뀐다', async ({
  prep,
  calendar,
}) => {
  const food = await prep.categoryIdByName('식비');
  await prep.addTransaction({ amount: 12_000, merchant: '스타벅스', categoryId: food });

  await calendar.open();
  await calendar.waitReady();
  await expect(calendar.totals.expense).toHaveText(formatCurrency(12_000));

  await calendar.list.pick('스타벅스');
  await calendar.edit.waitOpen();
  await expect(calendar.edit.pickedCategory).toHaveText(/식비/);

  await calendar.edit.merchant.fill('스타벅스 강남');
  await calendar.edit.amount.fill('9000');
  await calendar.edit.categoryChip('교통').click();
  await calendar.edit.done();

  await expect(calendar.list.row('스타벅스 강남')).toBeVisible();
  await expect(calendar.list.row('교통')).toBeVisible();
  await expect(calendar.totals.expense).toHaveText(formatCurrency(9_000));
  await expect(calendar.list.dayTotal).toHaveText(formatCurrency(9_000));
});

test('예산 계산에서 제외하면 남은 예산이 돌아오고 목록에는 남는다', async ({
  prep,
  calendar,
  home,
}) => {
  await prep.setBudget(300_000);
  await prep.addTransaction({ amount: 50_000, merchant: '노트북거치대' });

  await home.open();
  await home.waitReady();
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(250_000));

  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('노트북거치대');
  await calendar.edit.waitOpen();

  await expect(calendar.edit.excludeToggle).toHaveAttribute('aria-checked', 'false');
  await calendar.edit.excludeToggle.click();
  await calendar.edit.done();

  // 목록에는 남고 칩이 붙는다. 사라지면 사용자는 기록이 없어진 줄로 안다.
  await expect(calendar.list.row('노트북거치대')).toBeVisible();
  await expect(calendar.list.chip('예산 제외')).toBeVisible();
  // 이번 달 지출에서는 빠지지 않는다. 빠지는 것은 예산 계산에서다.
  await expect(calendar.totals.expense).toHaveText(formatCurrency(50_000));

  await home.open();
  await home.waitReady();
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(300_000));
});

test('수정 시트에서 지우면 목록에서 빠지고 합계가 줄어든다', async ({ prep, calendar }) => {
  await prep.addTransaction({ amount: 12_000, merchant: '스타벅스', minutesAgo: 1 });
  await prep.addTransaction({ amount: 3_000, merchant: '이마트', minutesAgo: 2 });

  await calendar.open();
  await calendar.waitReady();
  await expect(calendar.totals.expense).toHaveText(formatCurrency(15_000));

  await calendar.list.pick('스타벅스');
  await calendar.edit.waitOpen();
  await calendar.edit.remove();

  await expect(calendar.list.row('스타벅스')).toHaveCount(0);
  await expect(calendar.list.row('이마트')).toBeVisible();
  await expect(calendar.totals.expense).toHaveText(formatCurrency(3_000));
});

// ── 이체·환불 ───────────────────────────────────────────

test('이체와 환불은 라벨이 붙고, 집계에서 이체는 빠진다', async ({ prep, calendar }) => {
  await prep.addTransaction({ amount: 10_000, merchant: '이마트', minutesAgo: 1 });
  await prep.addTransaction({
    amount: 3_000,
    merchant: '이마트 반품',
    type: 'refund',
    minutesAgo: 2,
  });
  await prep.addTransaction({
    amount: 200_000,
    merchant: '적금 자동이체',
    type: 'transfer',
    minutesAgo: 3,
  });
  await prep.addTransaction({
    amount: 500_000,
    merchant: '9월 급여',
    type: 'income',
    minutesAgo: 4,
  });

  await calendar.open();
  await calendar.waitReady();

  // 이체는 지출도 수입도 아니다. 환불은 지출을 깎는다.
  await expect(calendar.totals.expense).toHaveText(formatCurrency(7_000));
  await expect(calendar.totals.income).toHaveText(formatCurrency(500_000));

  await expect(calendar.list.row('9월 급여')).toBeVisible();
  await expect(calendar.list.chip('환불')).toBeVisible();
  await expect(calendar.list.chip('이체')).toBeVisible();
  await expect(calendar.list.chip('수입')).toBeVisible();

  // 달력 칸도 같은 규칙으로 접힌다. 20만원 이체가 섞이면 숫자가 달라진다.
  await expect(
    calendar.grid.cell(
      cellName(TODAY, `지출 ${formatCurrency(7_000)}`, `수입 ${formatCurrency(500_000)}`),
    ),
  ).toBeVisible();
});
