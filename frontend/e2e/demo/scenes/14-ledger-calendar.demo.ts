import { LEDGER_PAGE_SIZE } from '../../../src/features/transactions/ledgerView';
import {
  formatCurrency,
  formatDayLabel,
  formatSignedCurrency,
  toLedgerDate,
} from '../../../src/shared/lib/format';
import { expect, test } from '../support/director';

/**
 * 적어 둔 것을 다시 보는 화면을 찍는다.
 *
 * 달력·검색·페이지 넘기기 세 장면이다. 날짜는 실행하는 날에 따라 달라지므로
 * 같은 달 안에서만 만들어 쓴다. 달을 넘기면 이번 달 달력에 안 보인다.
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

function cellName(iso: string, ...parts: string[]): string {
  return `${formatDayLabel(iso)}, ${parts.length > 0 ? parts.join(', ') : '기록 없음'}`;
}

const COFFEE = 4_500;
const MEAL = 12_000;
const TRANSFER = 200_000;
const INCOME = 2_000_000;
const OTHER_DAY_SPEND = 8_000;

test('24 달력이 그 달을 한눈에 보여준다', async ({ demo, calendar, prep }) => {
  await calendar.open();
  await calendar.waitReady();
  await demo.open('월간 달력', '적어 둔 것을 날짜로 다시 보기');

  await demo.step('아직 아무것도 없는 달');
  await expect(calendar.totals.expense).toHaveText(formatCurrency(0));
  await expect(calendar.list.emptyDay).toBeVisible();
  await demo.beat(2);

  await demo.step('며칠치를 종류별로 심는다');
  const cafe = await prep.categoryIdByName('카페·간식');
  const meal = await prep.categoryIdByName('식비');

  await prep.addTransaction({
    amount: COFFEE,
    minutesAgo: 1,
    categoryId: cafe,
    merchant: '스타벅스',
  });
  await prep.addTransaction({ amount: MEAL, minutesAgo: 2, categoryId: meal });
  await prep.addTransaction({
    amount: TRANSFER,
    minutesAgo: 3,
    type: 'transfer',
    merchant: '카카오뱅크',
  });
  await prep.addTransaction({ amount: INCOME, minutesAgo: 4, type: 'income', merchant: '월급' });
  await prep.addTransaction({
    amount: OTHER_DAY_SPEND,
    daysAgo: OTHER_DAY_AGO,
    merchant: '동네분식',
  });

  await calendar.open();
  await calendar.waitReady();

  await demo.step('맨 위 띠가 그 달 지출·수입·차액을 말한다');
  await expect(calendar.totals.expense).toHaveText(formatCurrency(COFFEE + MEAL + OTHER_DAY_SPEND));
  await expect(calendar.totals.income).toHaveText(formatCurrency(INCOME));
  await expect(calendar.totals.delta).toHaveText(
    formatSignedCurrency(INCOME - (COFFEE + MEAL + OTHER_DAY_SPEND)),
  );
  await demo.beat(3);

  await demo.step('20만원 이체는 지출도 수입도 아니라 어디에도 안 들어간다');
  await demo.beat(2);

  await demo.step('날짜칸마다 그 날 지출과 수입이 붙는다');
  await expect(
    calendar.grid.cell(
      cellName(TODAY, `지출 ${formatCurrency(COFFEE + MEAL)}`, `수입 ${formatCurrency(INCOME)}`),
    ),
  ).toBeVisible();
  await demo.beat(3);

  await demo.step('처음에는 오늘이 골라져 있다');
  await expect(calendar.list.dayTotal).toHaveText(formatCurrency(COFFEE + MEAL));
  await expect(calendar.list.row('스타벅스')).toBeVisible();
  await demo.beat(2);

  await demo.step('다른 날을 누르면 아래 목록이 그 날 것으로 갈린다');
  await calendar.grid.select(cellName(otherDayIso(), `지출 ${formatCurrency(OTHER_DAY_SPEND)}`));
  await expect(calendar.list.row('동네분식')).toBeVisible();
  await expect(calendar.list.row('스타벅스')).toHaveCount(0);
  await expect(calendar.list.dayTotal).toHaveText(formatCurrency(OTHER_DAY_SPEND));
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});

test('25 상호나 카테고리 이름으로 찾는다', async ({ demo, calendar, prep }) => {
  await calendar.open();
  await calendar.waitReady();
  await demo.open('검색', '상호로도, 카테고리 이름으로도');

  await demo.step('찾을 것을 먼저 심는다');
  const cafe = await prep.categoryIdByName('카페·간식');
  const meal = await prep.categoryIdByName('식비');

  await prep.addTransaction({
    amount: COFFEE,
    minutesAgo: 1,
    categoryId: cafe,
    merchant: '스타벅스',
  });
  await prep.addTransaction({
    amount: 5_600,
    minutesAgo: 2,
    categoryId: cafe,
    merchant: 'CU 삼성점',
  });
  await prep.addTransaction({
    amount: MEAL,
    minutesAgo: 3,
    categoryId: meal,
    merchant: '김밥천국',
  });

  await calendar.open();
  await calendar.waitReady();

  await demo.step('찾기 전에는 결과 안내가 없다');
  await expect(calendar.search.resultCount).toHaveCount(0);
  await demo.beat(2);

  await demo.step('상호로 찾으면 그 줄만 남는다');
  await calendar.search.find('스타벅스');
  await expect(calendar.search.resultCount).toHaveText('검색 결과 1건');
  await expect(calendar.list.row('스타벅스')).toBeVisible();
  await expect(calendar.list.row('김밥천국')).toHaveCount(0);
  await demo.beat(3);

  await demo.step('카테고리 이름으로도 찾힌다');
  await calendar.search.find('카페');
  await expect(calendar.search.resultCount).toHaveText('검색 결과 2건');
  await expect(calendar.list.row('CU 삼성점')).toBeVisible();
  await demo.beat(3);

  await demo.step('맞는 것이 없으면 다른 말로 찾아보자고 한다');
  await calendar.search.find('없는가게');
  await expect(calendar.search.noResult).toBeVisible();
  await demo.beat(3);

  await demo.step('지우면 달력이 돌아온다');
  await calendar.search.clear();
  await expect(calendar.grid.selected).toBeVisible();
  await demo.beat(2);

  await demo.clearStep();
  await demo.beat(2);
});

test('26 한 화면에 다 안 들어오면 더 보기로 이어 받는다', async ({ demo, calendar, prep }) => {
  const total = LEDGER_PAGE_SIZE + 1;

  await calendar.open();
  await calendar.waitReady();
  await demo.open('더 보기', `한 번에 ${LEDGER_PAGE_SIZE}줄씩`);

  const oldest = `기록 ${String(total).padStart(2, '0')}`;

  await demo.step(`오늘 ${total}건을 심는다`);
  await prep.addSeries(total, { amount: 1_000, prefix: '기록 ' });
  await calendar.open();
  await calendar.waitReady();

  await demo.step(`적은 것이 ${total}건`);
  await expect(calendar.list.dayTotal).toHaveText(formatCurrency(total * 1_000));
  await demo.beat(2);

  await demo.step(`먼저 ${LEDGER_PAGE_SIZE}줄만 받는다. 마지막 줄은 아직 없다`);
  await expect(calendar.list.row('기록 01')).toBeVisible();
  await expect(calendar.list.row(oldest)).toHaveCount(0);
  await expect(calendar.list.moreButton).toBeVisible();
  await demo.beat(3);

  await demo.step('더 보기를 누르면 다음 줄이 이어 붙는다');
  await calendar.list.more();
  await expect(calendar.list.row(oldest)).toBeVisible();
  await demo.beat(2);

  await demo.step('더 받을 것이 없으면 버튼이 사라진다');
  await expect(calendar.list.moreButton).toHaveCount(0);
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});
