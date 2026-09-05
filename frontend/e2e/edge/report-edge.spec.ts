import { thisMonth } from '../support/api';
import { E2E_API_URL } from '../support/env';
import { expect, test } from '../support/fixtures';

/**
 * 리포트가 그릴 것이 없거나 너무 많을 때.
 *
 * 기본 동작은 `specs/report.spec.ts` 가 지킨다. 여기서 보는 것은 빈 달·미래 달·
 * 조각이 많은 달·수입이 없는 달이다. 전부 실제 사용자에게 흔한 상태다.
 *
 * 리포트에서 가장 위험한 것은 **그럴듯한 거짓말**이다. 견줄 것이 없는데 견준 문장을 쓰거나,
 * 조각 합과 헤드라인이 다른데 아무 설명이 없으면 사용자는 숫자를 못 믿게 된다.
 */

test('기록이 없는 달은 빈 안내가 뜨고 6개월 흐름은 남는다', async ({ report }) => {
  await report.open();
  await report.waitReady();

  await expect(report.emptyNotice).toBeVisible();
  // 흐름까지 사라지면 스크롤할 이유가 없어져 사용자가 그 달에서 나가지 못한다.
  await expect(report.trendBars).toHaveCount(6);
});

test('아직 오지 않은 달로는 갈 수 없다', async ({ report }) => {
  await report.open();
  await report.waitReady();

  // 미래로 가면 "안 끝난 이번 달" 을 "지난달 전체" 와 견주는 거짓 문장이 나온다.
  await expect(report.monthButton('next')).toBeDisabled();
});

test('지난달로 갔다가 돌아오면 다시 앞으로 못 간다', async ({ report }) => {
  await report.open();
  await report.waitReady();

  await report.goPreviousMonth();
  await expect(report.monthButton('next')).toBeEnabled();

  await report.monthButton('next').click();
  await expect(report.monthLabel()).toHaveText(monthLabelOf(thisMonth()));
  await expect(report.monthButton('next')).toBeDisabled();
});

test('분류가 열 개를 넘으면 나머지를 한 줄로 접는다', async ({ prep, report }) => {
  // 기본 지출 분류가 아홉이라 내 분류를 더 만들어 열둘을 넘긴다.
  const extras = ['반려동물', '데이트', '경조사', '자기계발'];
  for (const [index, name] of extras.entries()) {
    const id = await prep.addCategory(name);
    await prep.addTransaction({ amount: 10_000 + index * 1_000, categoryId: id });
  }
  for (const name of ['식비', '카페·간식', '교통', '쇼핑', '생활', '주거·고정비', '여가·취미', '건강·미용', '기타']) {
    const id = await prep.categoryIdByName(name);
    await prep.addTransaction({ amount: 50_000, categoryId: id });
  }

  await report.open();
  await report.waitReady();

  // 열세 줄을 다 그리면 도넛 색이 서로 구분되지 않고 목록도 한 화면을 넘긴다.
  const rows = await report.rows.count();
  expect(rows, '조각을 접지 않고 다 그렸다').toBeLessThanOrEqual(10);
  // 줄 하나에 이름·금액·비중이 이어 붙어서 앵커(^$)를 걸 수 없다.
  await expect(report.row(/그 밖 \d+개/)).toBeVisible();
});

test('수입이 하나도 없는 사람이 수입 탭을 열면 그 사실을 말한다', async ({ prep, report }) => {
  await prep.addTransaction({ amount: 30_000, merchant: '점심' });

  await report.open();
  await report.waitReady();
  await report.modeTab('수입').click();

  // 아무 말 없이 0 원과 빈 자리만 두면 화면이 고장 난 것처럼 보인다.
  await expect(report.total).toHaveText('0원');
  await expect(report.emptyModeNotice).toHaveText('이 달엔 수입 기록이 없어요');
});

test('환불이 지출보다 큰 분류가 있으면 조각 합이 다른 이유를 적는다', async ({ prep, report }) => {
  const cafe = await prep.categoryIdByName('카페·간식');
  await prep.addTransaction({ amount: 40_000, categoryId: cafe });
  await prep.addTransaction({ amount: 90_000, type: 'refund', categoryId: cafe });
  await prep.addTransaction({ amount: 120_000, categoryId: await prep.categoryIdByName('식비') });

  await report.open();
  await report.waitReady();

  // 설명이 조각 카드 안에 있으면 조각이 없는 달에 설명도 함께 사라진다.
  // 그 달이야말로 설명이 가장 필요한 달이다.
  await expect(report.sliceNote).toBeVisible();
});

test('아주 긴 분류 이름이 리포트를 가로로 밀지 않는다', async ({ prep, report }) => {
  const id = await prep.addCategory('아주아주기다란분류이름을적어보면어디까지늘어나는지보자');
  await prep.addTransaction({ amount: 30_000, categoryId: id });

  await report.open();
  await report.waitReady();

  const { content, visible } = await report.widths();
  expect(content, `${content} > ${visible} 긴 이름이 리포트를 가로로 밀었다`).toBeLessThanOrEqual(
    visible + 1,
  );
});

test.describe('리포트 조회가 실패했을 때', () => {
  test.use({ consoleErrorAllowList: [/Failed to load resource[\s\S]*500/] });

  test('달을 옮기는 자리는 남는다', async ({ page, report }) => {
    await page.route(`${E2E_API_URL}/api/v1/reports/monthly**`, (route) =>
      route.fulfill({ status: 500, body: '{}' }),
    );

    await report.open();

    // 선택기까지 지우면 오류 난 달에 갇혀 다른 달로 갈 수 없다. 앞뒤 두 개가 다 남아야 한다.
    await expect(report.monthStepper).toHaveCount(2);
    await expect(report.loadError).toBeVisible();
  });
});

/** `2026-09` → 화면에 찍히는 `2026년 9월`. 화면 출력에서 베끼지 않고 여기서 만든다. */
function monthLabelOf(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${year}년 ${monthNumber}월`;
}
