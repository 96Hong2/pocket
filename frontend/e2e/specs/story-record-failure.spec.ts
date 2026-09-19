import {
  formatCurrency,
  formatDayLabel,
  shiftDay,
  toLedgerDate,
} from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';

/**
 * 적다가 막혔을 때.
 *
 * 한 바퀴가 도는 것은 `first-lap`·`nl-input` 이 지킨다. 여기서 보는 것은 **적는 도중에
 * 무언가 어긋난 자리**다. 저장이 막히거나, 분류를 못 불러왔거나, 고치다 딴 길로 새거나,
 * 다른 탭에 읽어 둔 것을 두고 한 건만 따로 저장하는 길이다.
 *
 * 이 넷의 기준은 하나다. **적어 둔 것을 말없이 버리지 않는다.** 이름·금액·날짜를 다시
 * 적게 만들거나, 읽어 온 목록을 소리 없이 지우면 그 사람은 다음 달에 이 앱을 안 연다.
 */

/** 저장 뒤 확인 화면에서 적는 상호. */
const BURGER = '버거킹';
/** 검토 줄을 고치며 바꿔 적는 상호. */
const GIMBAP = '김밥천국';
/** 그 자리에서 만드는 분류. 기본 분류에는 없는 이름이라야 새로 만든 것이 드러난다. */
const TEAM_LUNCH = '점심모임';
/** 아이콘 파일 `16_paw`. 격자 칸은 파일 이름에서 앞 번호를 뗀 영어를 읽어 준다. */
const PAW = 'paw';

/** 두 건이 한 문장에 들어 있다. 읽어 두고 다른 탭으로 옮기는 자리에 쓴다. */
const TWO_ITEMS = '점심 12000 커피 4500';

const TRANSACTION_PATCH = '**/api/v1/transactions/*';
const CATEGORIES = '**/api/v1/categories*';

/**
 * 실패 응답 한 벌.
 *
 * 앱과 API 는 출처가 달라 브라우저가 응답에 CORS 헤더를 요구한다. 없으면 앱이
 * 상태 코드가 아니라 네트워크 실패로 읽어 다른 문구가 뜬다.
 */
function envelope(status: number, code: string, message: string) {
  return {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    body: JSON.stringify({ error: { code, message } }),
  };
}

/** 고친 것을 보내는 길만 막는다. 화면은 서버가 준 이 문구를 그대로 보여 준다. */
const UPDATE_DOWN = envelope(
  500,
  'INTERNAL_ERROR',
  '지금은 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
);
/** 분류 조회만 막는다. 이 화면은 제 문구를 쓰므로 여기 적은 말은 안 보인다. */
const CATEGORIES_DOWN = envelope(500, 'INTERNAL_ERROR', '');

test.describe('일부러 막았을 때', () => {
  test.use({
    // 우리가 막은 응답이다. 브라우저가 그것을 콘솔에 적는 것이고 앱이 낸 오류가 아니다.
    consoleErrorAllowList: [/Failed to load resource.*500/],
  });

  test('상호를 적고 확인을 눌렀는데 막히면, 시트가 안 닫히고 적은 이름이 남는다', async ({
    home,
    page,
    recordSheet,
  }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();

    await recordSheet.input.enterAmount(12_000);
    await recordSheet.input.pickCategory('식비');
    await recordSheet.feedback.waitSaved();

    await page.route(TRANSACTION_PATCH, (route) =>
      route.request().method() === 'PATCH' ? route.fulfill(UPDATE_DOWN) : route.continue(),
    );

    // 확인을 누르는 클릭이 칸에서 먼저 빠져나가게 한다. 실기기에서 상호를 적는 길이 이것뿐이다.
    await recordSheet.feedback.merchantField.fill(BURGER);
    await recordSheet.feedback.confirmButton.click();

    /*
      여기서 닫히면 이름이 저장 안 된 것을 아무도 모른 채 넘어간다.
      거래 자체는 이미 서버에 있어, 화면만 닫히고 이름만 조용히 빠진다.
    */
    await recordSheet.waitOpen();
    await expect(recordSheet.feedback.savedLabel).toBeVisible();
    await expect(recordSheet.feedback.notice).toHaveText(
      '지금은 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
    );
    // 적은 것이 지워지면 왜 막혔는지 읽고 나서 처음부터 다시 쳐야 한다.
    await expect(recordSheet.feedback.merchantField).toHaveValue(BURGER);

    // 이유는 그 칸 아래에 붙는다. 위나 딴 데 서면 무엇이 막혔는지 짚어 주지 못한다.
    const field = await recordSheet.feedback.merchantField.boundingBox();
    const notice = await recordSheet.feedback.notice.boundingBox();
    if (field == null || notice == null) throw new Error('상호 칸과 이유 줄이 화면에 없다');
    expect(notice.y, '이유 줄이 상호 칸보다 위에 그려졌다').toBeGreaterThan(field.y);

    // 풀리고 나면 같은 버튼 하나로 이어진다. 다시 적게 하지 않는다.
    await page.unroute(TRANSACTION_PATCH);
    await recordSheet.feedback.confirmButton.click();
    await recordSheet.waitClosed();

    await expect(home.today.row(BURGER)).toBeVisible();
    await expect(home.today.amount(formatCurrency(12_000))).toBeVisible();
  });

  test('분류를 못 불러온 채 열려도 금액은 눌리고, 다시 시도하면 칩이 돌아온다', async ({
    home,
    page,
    recordSheet,
  }) => {
    await page.route(CATEGORIES, (route) => {
      // 프리플라이트까지 막으면 CORS 실패가 되어 서버 오류와 다른 화면을 보게 된다.
      if (route.request().method() !== 'GET') return route.continue();
      return route.fulfill(CATEGORIES_DOWN);
    });

    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();

    // 서버 오류는 다시 불러 볼 만한 실패라, 한 번 더 부른 뒤에야 실패로 확정된다.
    await expect(recordSheet.input.categoriesError).toHaveText('카테고리를 불러오지 못했어요', {
      timeout: 10_000,
    });
    // 무엇을 하면 되는지가 그 자리에 있어야 한다. 이유만 적으면 여기서 끝난다.
    await expect(recordSheet.input.categoriesRetryButton).toHaveText('다시 시도');
    expect(await recordSheet.input.categoryChipNames()).toEqual([]);

    // 분류를 못 불러왔다고 적는 것까지 막히면 이 앱의 목적이 사라진다.
    await recordSheet.input.enterAmount(6_400);
    await expect(recordSheet.input.amountText).toHaveText(formatCurrency(6_400));

    await page.unroute(CATEGORIES);
    await recordSheet.input.categoriesRetryButton.click();

    await expect(recordSheet.input.categoriesError).toHaveCount(0);
    // 안내가 걷힌 뒤에도 칩이 그려지기까지 한 박자가 있다. 한 번만 읽으면 빈 배열을 본다.
    await expect.poll(() => recordSheet.input.categoryChipNames()).toContain('식비');

    // 되살아난 칩으로 그대로 이어 저장한다. 눌러 둔 금액도 살아 있다.
    await recordSheet.input.pickCategory('식비');
    await recordSheet.feedback.waitSaved();
    await expect(recordSheet.feedback.savedAmount).toHaveText(formatCurrency(6_400));

    await recordSheet.feedback.confirmButton.click();
    await recordSheet.waitClosed();
    await expect(home.today.amount(formatCurrency(6_400))).toBeVisible();
  });
});

test('검토 줄을 고치다 분류를 만들어도 적어 둔 상호·금액·날짜가 그대로다', async ({
  home,
  recordSheet,
}) => {
  const yesterday = shiftDay(toLedgerDate(new Date()), -1);

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('점심 12000');

  await recordSheet.nl.openEdit('점심');
  await recordSheet.nl.form.merchantField.fill(GIMBAP);
  await recordSheet.nl.form.amountField.fill('9000');
  await recordSheet.nl.form.dayField.fill(yesterday);

  // 맞는 칸이 없다는 것을 깨닫는 순간이 여기다. 숨긴 분류가 있으면 「더 보기」를 한 번 편다.
  await recordSheet.nl.form.openNewCategory();
  await expect(recordSheet.nl.form.newCategoryTitle).toBeVisible();
  // 돌아갈 길이 화면에 적혀 있어야 한다. 여기서 돌아가는 곳은 고치던 줄이다.
  await expect(recordSheet.nl.form.newCategoryBackButton).toBeVisible();

  await recordSheet.nl.form.createCategory(TEAM_LUNCH, PAW);

  // 만들고 돌아왔을 때 비어 있으면 세 칸을 처음부터 다시 적어야 한다.
  await expect(recordSheet.nl.form.newCategoryTitle).toHaveCount(0);
  await expect(recordSheet.nl.form.merchantField).toHaveValue(GIMBAP);
  // 금액 칸은 세 자리마다 콤마를 찍는다.
  await expect(recordSheet.nl.form.amountField).toHaveValue('9,000');
  await expect(recordSheet.nl.form.dayField).toHaveValue(yesterday);
  // 만든 것이 곧바로 골라져 있다. 다시 찾아 누르게 하면 만든 보람이 없다.
  await expect(recordSheet.nl.form.categoryChip(TEAM_LUNCH)).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await recordSheet.nl.form.apply();

  // 고친 세 값이 줄에 그대로 올라온다.
  await expect(recordSheet.nl.row(GIMBAP)).toContainText(TEAM_LUNCH);
  await expect(recordSheet.nl.amount(GIMBAP)).toHaveText(formatCurrency(9_000));
  await expect(recordSheet.nl.day(GIMBAP)).toHaveText(formatDayLabel(yesterday));

  await recordSheet.nl.save();
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  // 고친 날에 들어갔나. 적고 나면 홈이 그 날로 옮겨 가므로 찾아갈 것도 없다.
  await home.waitReady();
  await expect(home.today.title).toHaveText('어제');
  await expect(home.today.row(GIMBAP)).toBeVisible();
  await expect(home.today.amount(formatCurrency(9_000))).toBeVisible();

  // 오늘 자리에 서 있으면 날짜를 고친 것이 버려진 것이다.
  await home.today.jumpTodayButton.click();
  await expect(home.today.title).toHaveText('오늘');
  await expect(home.today.row(GIMBAP)).toHaveCount(0);
});

/*
  키패드 저장이 다른 탭의 검토 목록을 버리던 자리.

  저장 결과 화면이 몸통을 통째로 바꿔 끼워서, 사진이나 문장으로 읽어 둔 줄이 그 순간
  언마운트돼 사라졌다. 세던 값까지 0 으로 덮여 「아직 검토할 것이 있다」 는 판단도 같이 죽어,
  닫기를 되묻지도 않았다. 지금은 확인 화면이 다른 탭과 나란히 서고, 「확인」 은 시트를 닫는
  대신 남은 건이 있는 자리로 데려다 놓는다.
*/
test('키패드로 한 건 저장해도 줄글에 읽어 둔 두 건이 사라지지 않는다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze(TWO_ITEMS);
  await expect(recordSheet.nl.rows).toHaveCount(2);

  // 문장에 안 적은 한 건을 키패드로 따로 넣는다. 읽어 둔 둘은 아직 아무 데도 안 갔다.
  await recordSheet.methodTab('키패드').click();
  await recordSheet.input.enterAmount(7_000);
  await recordSheet.input.pickCategory('교통');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();

  // 닫히지 않는다. 읽어 둔 것이 있는 자리로 데려다 놓는다.
  await recordSheet.waitOpen();
  await expect(recordSheet.methodTab('줄글')).toHaveAttribute('aria-checked', 'true');
  await expect(recordSheet.nl.rows).toHaveCount(2);
  await expect(recordSheet.nl.amount('점심')).toHaveText(formatCurrency(12_000));
  await expect(recordSheet.nl.amount('커피')).toHaveText(formatCurrency(4_500));
  await expect(recordSheet.nl.saveButton).toHaveText(`2건 저장 · ${formatCurrency(16_500)}`);

  // 그제서야 닫으려 하면 손잡이로 닫을 때와 똑같이 한 번 묻는다.
  await recordSheet.closeButton.click();
  await expect(recordSheet.leave.text).toContainText('읽어 온 2건이 사라져요');
  await recordSheet.leave.leaveButton.click();
  await recordSheet.waitClosed();

  // 키패드로 넣은 한 건만 남는다. 읽어 두기만 한 둘은 안 들어간다.
  await expect(home.today.amount(formatCurrency(7_000))).toBeVisible();
  await expect(home.today.amount(formatCurrency(12_000))).toHaveCount(0);
});
