import { formatCurrency, toLedgerDate } from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';

/**
 * **화면에 보이는 것이 손에 닿는가.**
 *
 * 기능이 다 있어도 버튼이 화면 밖으로 나가 있거나, 칩 격자가 시트 밖으로 밀리거나,
 * 버튼 이름이 다른 날을 가리키면 귀찮은 사람은 거기서 멈춘다. 나가서 다시 들어오지 않는다.
 * 그래서 여기서 보는 것은 「기능이 있나」가 아니라 「이 화면에서 막히나」다.
 *
 * 좁은 화면은 `ios-layout` 프로젝트가 따로 보지만 그 프로젝트는 파일 하나에 묶여 있다.
 * 여기서는 뷰포트만 아이폰 세로 크기로 맞춘다. 버튼이 밀리는 원인이 브라우저 종류가
 * 아니라 **화면 높이**라, 폭만 좁힌 기본 뷰포트로는 한 번도 안 지나가는 자리다.
 */

/** 이름 상한(40자)에 가까운 분류. 짧은 이름으로는 칸이 밀리지 않아 아무것도 못 본다. */
const LONG_CATEGORY = '한 달에 한 번 가는 동네 단골 국밥집';

/** 기기 시간대를 한국 밖으로 옮긴다. 가계부는 한국 시간으로 날을 센다. */
const DEVICE_TIME_ZONE = 'America/Los_Angeles';

const SUMMARY = '**/api/v1/transactions/summary*';
const CALENDAR = '**/api/v1/transactions/calendar*';

/**
 * 다시 불러도 같은 실패라 앱이 재시도하지 않는다. 500 으로 만들면 백오프를 기다려야 한다.
 * 앱과 API 는 출처가 달라 브라우저가 응답에 CORS 헤더를 요구한다.
 */
const FAIL_422 = {
  status: 422,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  body: JSON.stringify({ error: { code: 'INVALID_REQUEST', message: '' } }),
};

test.describe('아이폰 세로 한 화면(390x664)', () => {
  test.use({ viewport: { width: 390, height: 664 } });

  test('수정 시트를 열면 버튼 줄이 화면 안에 온전히 있다', async ({ calendar, prep }) => {
    await prep.addTransaction({ amount: 12_000, daysAgo: 0, merchant: '교보문고' });

    await calendar.open();
    await calendar.waitReady();
    await calendar.list.pick('교보문고');
    await calendar.edit.waitOpen();

    /*
      열자마자 보여야 한다. 아래로 굴려야 나오는 버튼은 없는 버튼이다.
      공용 시트가 이 실패를 알고 `size="tall"` 과 바닥에 붙는 버튼 줄을 마련해 뒀다.
    */
    await expect(calendar.edit.doneButton).toBeInViewport({ ratio: 1 });
    await expect(calendar.edit.deleteButton).toBeInViewport({ ratio: 1 });

    await calendar.edit.askDelete();

    /*
      묻는 줄로 바뀐 뒤가 더 위험하다. 되돌릴 수 없는 자리인데 「지울게요」도
      「그대로 둘래요」도 안 보이면, 시트가 방금 무엇으로 바뀌었는지 모른 채 멈춘다.
    */
    await expect(calendar.edit.confirmDeleteButton).toBeInViewport({ ratio: 1 });
    await expect(calendar.edit.keepButton).toBeInViewport({ ratio: 1 });
  });
});

test('아주 긴 분류 이름이 기록·수정 시트의 칩 격자를 밀어내지 않는다', async ({
  calendar,
  home,
  prep,
  recordSheet,
}) => {
  await prep.addCategory(LONG_CATEGORY);
  await prep.addTransaction({ amount: 9_000, daysAgo: 0, merchant: '국밥' });

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  // 기본 지출이 딱 열한 개라 새로 만든 분류는 앞자리 밖이다. 한 번 펴야 칩이 선다.
  await recordSheet.input.moreCategoriesButton.click();
  await expect(recordSheet.input.categoryChip(LONG_CATEGORY)).toBeVisible();

  // 긴 이름은 칩 안에서 잘려야 한다. 칸이 이름을 따라 늘면 시트가 통째로 가로로 굴러간다.
  expect(await recordSheet.horizontalScrollers()).toEqual([]);

  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('국밥');
  await calendar.edit.waitOpen();

  // 두 시트가 같은 칩 격자를 쓴다. 한쪽만 막으면 다른 쪽에서 같은 일이 난다.
  await calendar.edit.moreCategoriesButton.click();
  await expect(calendar.edit.categoryChip(LONG_CATEGORY)).toBeVisible();
  expect(await calendar.edit.horizontalScrollers()).toEqual([]);
});

/*
  수정 시트를 열었을 때 날짜 칸이 아이콘 줄 바로 밑에 붙어 있었다.

  붙어 있으면 아이콘에 딸린 설명처럼 보여서, 눌러서 옮길 수 있는 칸이라는 것이 안 읽힌다.
  아래 칸들과 같은 간격(14px)을 줘서 같은 층의 칸으로 서게 했다.
*/
test('수정 시트의 날짜 칸이 위 아이콘 줄에 붙지 않는다', async ({ calendar, prep }) => {
  await prep.addTransaction({ amount: 9_000, daysAgo: 0, merchant: '국밥' });

  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('국밥');
  await calendar.edit.waitOpen();

  await expect
    .poll(() => calendar.edit.dayGap(), { message: '날짜 칸이 아이콘 줄에 붙어 있다' })
    .toBeGreaterThanOrEqual(10);
});

/*
  앱 설정에서 「남은 예산」을 골랐는데 예산이 없을 때 뜨는 입구.

  이 버튼은 예산이 아예 없는 사람에게만 선다. 곧 **여기 오는 사람은 전부 처음 정하는
  사람**이다. 얼마로 할지 모르는 사람이 가장 많은 자리인데, 그 길이 관리 탭에만 있으면
  같은 사람이 어느 자리에서 열었느냐에 따라 다른 것을 본다.
*/
test('앱 설정에서 연 예산 시트에도 계산해서 정하는 길이 있다', async ({ manage, settings }) => {
  await settings.open();
  await settings.waitReady();
  await settings.chooseHero('남은 예산');

  await settings.budgetButton.click();
  await expect(settings.budgetSheet).toBeVisible();

  await expect(settings.budgetCalcButton).toBeVisible();
  // 광고 이야기는 누른 뒤에 한 번 묻는 자리에 있다. 버튼 곁에 늘 적어 두지 않는다.
  await settings.budgetCalcButton.click();
  await expect(settings.budgetCalcNote).toBeVisible();

  // 관리 탭에서 여는 것과 같은 시트여야 한다. 견줄 것이 없으면 무엇이 맞는지 알 수 없다.
  await manage.open();
  await manage.waitReady();
  await manage.total.startButton.click();
  await manage.total.sheet.waitOpen();
  await expect(manage.total.sheet.calcButton).toBeVisible();
});

test.describe('기기 시간대가 한국 밖일 때', () => {
  test.use({ timezoneId: DEVICE_TIME_ZONE });

  test('달력의 오늘 칸 버튼은 「오늘 기록하기」다', async ({ calendar, page }) => {
    const ledgerToday = toLedgerDate(new Date());
    const fixedAt = new Date(`${ledgerToday}T08:00:00+09:00`);

    /*
      가계부로는 오늘 아침 여덟 시. 그 순간 로스앤젤레스는 아직 어제 낮이라 기기 날짜와
      가계부 날짜가 **언제 돌려도** 하루 어긋난다. 시각을 안 고정하면 실행 시간대에 따라
      둘이 같아지는 때가 생겨, 통과했다는 말이 아무 뜻이 없어진다.
    */
    const deviceToday = new Intl.DateTimeFormat('en-CA', { timeZone: DEVICE_TIME_ZONE }).format(
      fixedAt,
    );
    expect(deviceToday).not.toBe(ledgerToday);

    await page.clock.setFixedTime(fixedAt);
    await calendar.open();
    await calendar.waitReady();

    // 가계부가 오늘로 치는 칸이 골라져 있다. 여기까지는 한국 시간으로 판정한다.
    await expect(calendar.grid.selected).toHaveAccessibleName(calendar.grid.cellName(ledgerToday));

    // 이 버튼의 존재 이유가 「어느 날에 적히는지 이름으로 말한다」인데, 그 이름이 틀린다.
    await expect(calendar.list.recordButton).toHaveText('오늘 기록하기');
  });
});

test.describe('달력을 못 불러올 때', () => {
  test.use({
    // 우리가 일부러 만든 422 다. 브라우저가 그 응답을 적는 것이고 앱이 낸 오류가 아니다.
    consoleErrorAllowList: [/Failed to load resource.*422/],
  });

  test('합계와 달력이 실패해도 제 문구로 말하고 기록 입구는 남는다', async ({
    calendar,
    page,
    prep,
  }) => {
    const spent = 12_000;
    await prep.addExpense({ amount: spent, daysAgo: 0 });

    // 먼저 늦은 응답. 숫자가 오기 전에도 빈 칸이 아니라 기다리는 자리가 서야 한다.
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(SUMMARY, async (route) => {
      await held;
      await route.continue();
    });

    await calendar.open();
    await expect(calendar.trouble.totalsLoading).toBeVisible();
    release();
    await calendar.waitReady();
    await page.unroute(SUMMARY);

    await page.route(SUMMARY, (route) =>
      route.request().method() === 'GET' ? route.fulfill(FAIL_422) : route.continue(),
    );
    await calendar.open();

    // 합계만 실패했다. 달력 격자까지 덮으면 한 자리의 실패가 화면 전부의 실패가 된다.
    await expect(calendar.trouble.totalsError).toBeVisible();
    await expect(calendar.trouble.totalsRetryButton).toBeVisible();
    await expect(calendar.grid.selected).toBeVisible();

    await page.route(CALENDAR, (route) =>
      route.request().method() === 'GET' ? route.fulfill(FAIL_422) : route.continue(),
    );
    await calendar.open();

    // 둘이 각각 제 이름으로 말한다. 「불러오지 못했어요」 한 줄로 뭉뚱그리면 무엇이 빈 것인지 모른다.
    await expect(calendar.trouble.totalsError).toBeVisible();
    await expect(calendar.trouble.gridError).toBeVisible();
    await expect(calendar.grid.selected).toHaveCount(0);

    // 이 앱의 목적은 기록이다. 못 읽는 것이 쓰는 것을 막으면 앱이 통째로 멈춘 것과 같다.
    await expect(calendar.list.recordButton).toBeVisible();

    await page.unroute(SUMMARY);
    await page.unroute(CALENDAR);
    await calendar.trouble.totalsRetryButton.click();
    await calendar.trouble.gridRetryButton.click();

    await expect(calendar.trouble.totalsError).toHaveCount(0);
    await expect(calendar.trouble.gridError).toHaveCount(0);
    await expect(calendar.totals.expense).toHaveText(formatCurrency(spent));
    await expect(calendar.grid.selected).toBeVisible();
  });
});

test.describe('큰 금액이 달력과 수정 시트를 밀어낼 때', () => {
  /** 전세금·차·보증금처럼 실제로 적히는 큰 돈. 열두 자리는 입력칸 상한이다. */
  const HUGE = 123_456_789_012;

  test('억대 지출이 있어도 달력 일곱 열의 너비가 같다', async ({ calendar, prep }) => {
    await prep.addTransaction({ amount: HUGE, daysAgo: 2, merchant: '전세금' });

    await calendar.open();
    await calendar.waitReady();

    /*
      `1fr` 은 `minmax(auto, 1fr)` 이라 칸 안의 글자가 길면 그 열만 넓어진다.
      요일 머리글은 내용이 없어 그대로라, 날짜가 머리글 아래에서 어긋난다.
      글자 단언으로는 안 잡히고 화면을 봐야 보이는 자리다.
    */
    const widths = await calendar.grid.columnWidths();
    expect(widths, '달력 열이 일곱이 아니다').toHaveLength(7);
    expect(new Set(widths).size, `열 너비가 갈렸다: ${widths.join(' · ')}`).toBe(1);
  });

  test('억대 금액을 고칠 때 앞자리가 칸 밖으로 밀리지 않는다', async ({ calendar, prep }) => {
    await prep.addTransaction({ amount: HUGE, daysAgo: 2, merchant: '전세금' });

    /*
      가계부 시간대(KST)로 센 그저께. spec 은 러너의 시간대로 도는데 CI 는 UTC 라,
      `new Date()` 로 날을 세면 한국 시간으로 오전 9시 전에는 하루가 어긋난다.
      실제로 여기서 CI 만 빨갰다.
    */
    const ledgerToday = toLedgerDate(new Date());
    const twoDaysAgo = toLedgerDate(
      new Date(Date.parse(`${ledgerToday}T12:00:00+09:00`) - 2 * 86_400_000),
    );

    await calendar.open();
    await calendar.waitReady();
    await calendar.grid.select(new RegExp(`${Number(twoDaysAgo.slice(8, 10))}일`));
    await calendar.list.pick('전세금');
    await calendar.edit.waitOpen();

    // 칸을 116px 에 못 박아 두면 「56,789,01원」 처럼 앞자리가 잘려 보인다.
    const fits = await calendar.edit.amount.evaluate(
      (node: HTMLInputElement) => node.scrollWidth <= node.clientWidth + 1,
    );
    expect(fits, '금액 칸에서 앞자리가 잘린다').toBe(true);
  });
});
