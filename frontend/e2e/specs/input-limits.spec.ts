import { NL_TEXT_MAX_LENGTH, SEARCH_MAX_LENGTH } from '../../src/shared/lib/limits';
import { expect, test } from '../support/fixtures';

/**
 * 입력칸의 상한과 그 상한에 닿았을 때.
 *
 * **여기 있는 것은 전부 화면을 보고 찾은 것이다.** 상한을 코드로만 읽으면 숫자가 맞는지만
 * 보게 되는데, 사람이 겪는 것은 「붙여넣었더니 값이 달라졌다」·「눌러도 안 풀리는 오류」·
 * 「이름 하나가 카드를 여섯 줄로 만들었다」 쪽이다.
 *
 * 화면과 서버의 상한이 어긋나면 사용자가 넣을 수 있는 값이 422 가 된다. 그 오류는 재시도
 * 대상이 아니라 「다시 시도」 를 눌러도 같은 카드만 다시 뜬다. 값은 `shared/lib/limits.ts`
 * 한 곳에 모아 두고 서버 자리를 주석으로 가리킨다.
 */

/** 문자로 오는 카드 결제 알림 한 줄. 예전 상한(60)을 훌쩍 넘는다. */
const PAYMENT_SMS =
  '[Web발신] 신한카드(1234) 12,000원 일시불 09/16 14:22 김밥천국 누적 123,456원 승인되었습니다 확인 바랍니다';

test('문자로 온 결제 알림을 검색칸에 붙여도 오류 카드가 뜨지 않는다', async ({
  calendar,
  page,
  prep,
}) => {
  await prep.addTransaction({ amount: 8_800, daysAgo: 0, merchant: '김밥천국' });

  await calendar.open();
  await calendar.waitReady();

  expect(PAYMENT_SMS.length, '예전 상한을 넘는 길이여야 이 검사가 뜻이 있다').toBeGreaterThan(60);
  await calendar.search.input.fill(PAYMENT_SMS);

  // 서버 상한을 넘겨 422 가 나면 오류 카드가 선다. 눌러도 같은 오류라 빠져나올 길이 없다.
  await expect(calendar.search.noResult).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('기록을 불러오지 못했어요')).toHaveCount(0);
});

test('검색칸은 서버와 같은 길이에서 끊는다', async ({ calendar, prep }) => {
  await prep.addTransaction({ amount: 8_800, daysAgo: 0, merchant: '김밥천국' });

  await calendar.open();
  await calendar.waitReady();

  await calendar.search.input.fill('가'.repeat(SEARCH_MAX_LENGTH + 40));
  expect(await calendar.search.input.inputValue()).toHaveLength(SEARCH_MAX_LENGTH);
});

test('잔액 0원인 계좌도 자산에 적을 수 있다', async ({ assets }) => {
  await assets.open();
  await assets.waitReady();
  await assets.startButton.click();
  await assets.sheet.waitOpen();

  await assets.sheet.nameField.fill('다 쓴 간편결제 지갑');
  await assets.sheet.amountField.fill('0');

  // 예전에는 `0` 이 칸에서 그대로 사라져 저장 버튼이 죽었다. 서버는 0 을 허락하는데도.
  await expect(assets.sheet.amountField).toHaveValue('0');
  await assets.sheet.save();
  await assets.sheet.waitClosed();

  await expect(assets.entryRow('다 쓴 간편결제 지갑')).toBeVisible();
});

test('연도를 잘못 친 기한은 저장이 막히고 이유가 뜬다', async ({ goal }) => {
  await goal.open();
  await goal.waitReady();
  await goal.startButton.click();
  await goal.form.waitOpen();

  await goal.form.titleField.fill('여행 자금');
  await goal.form.amountField.fill('3000000');
  // `2026` 을 치다 만 모양. 칸의 min·max 는 크롬에서 값을 막지 않는다.
  await goal.form.deadlineField.fill('0202-12-31');

  await expect(goal.form.dayRangeNotice).toBeVisible();
  await expect(goal.form.saveButton).toBeDisabled();

  await goal.form.deadlineField.fill('2026-12-31');
  await expect(goal.form.dayRangeNotice).toHaveCount(0);
  await expect(goal.form.saveButton).toBeEnabled();
});

test('아주 긴 이름이 카드와 줄을 부풀리지 않는다', async ({ assets, home, prep }) => {
  const long = '엄마 생신 선물 사러 들른 신세계백화점 강남점 지하 식품관 '.repeat(3).slice(0, 60);
  await prep.setGoal({ title: long, targetAmount: 300_000 });
  await prep.putAssets([{ group: 'cash', label: `${long}${long}`.slice(0, 80), amount: 1_000 }]);

  await home.open();
  await home.waitReady();

  /*
    두 줄에서 끊는다. 예전에는 60자가 네 줄이 되어 카드가 기록 버튼만큼 커졌고,
    자산 줄은 80자가 여섯 줄이 되어 금액과 「고치기」 가 이름에 밀렸다.
    글자 단언으로는 안 잡히는 자리라 그려진 높이를 잰다.
  */
  expect(await lineCount(home.goal.title(long))).toBeLessThanOrEqual(2);

  await assets.open();
  await assets.waitReady();
  expect(await lineCount(assets.entryRow(`${long}${long}`.slice(0, 80)))).toBeLessThanOrEqual(2);
});

/** 그려진 높이를 줄 높이로 나눈 값. 몇 줄로 그려졌는지 본다. */
async function lineCount(locator: import('@playwright/test').Locator): Promise<number> {
  return locator.evaluate((node) => {
    const style = getComputedStyle(node);
    const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2;
    return Math.round(node.getBoundingClientRect().height / lineHeight);
  });
}

test('메일 주소가 아직 모양이 아닐 때 왜 회색인지 적힌다', async ({ account }) => {
  await account.open();
  await account.waitReady();
  await account.linkButton.click();
  await expect(account.linkSheet).toBeVisible();

  // 치는 중에는 말이 없다. 아래 도메인 칩이 이미 무엇을 적어야 하는지 보여 준다.
  await account.emailField.fill('hong');
  await expect(account.formatNotice).toHaveCount(0);

  // `@` 를 넣고도 모양이 아니면 그때 말한다.
  await account.emailField.fill('hong@');
  await expect(account.formatNotice).toBeVisible();
  await expect(account.sendButton).toBeDisabled();

  await account.emailField.fill('hong@example.com');
  await expect(account.formatNotice).toHaveCount(0);
  await expect(account.sendButton).toBeEnabled();
});

test('줄글을 상한까지 채워도 서버가 받는다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.methodTab('줄글').click();

  // 상한에 닿으면 안내가 바뀐다. 예전에는 말없이 잘렸다.
  const filler = '점심 12000 스벅 4500 어제 택시 9000 ';
  await recordSheet.nl.textarea.fill(filler.repeat(120).slice(0, NL_TEXT_MAX_LENGTH));
  expect(await recordSheet.nl.textarea.inputValue()).toHaveLength(NL_TEXT_MAX_LENGTH);
  await expect(recordSheet.nl.hint).toContainText(`${NL_TEXT_MAX_LENGTH}자까지 읽어요`);

  /*
    화면만 올리고 서버를 안 올리면 여기서 422 가 난다. 그 오류는 pydantic 형식 오류라
    화면에 「요청 형식이 올바르지 않아요」 계열로 떠서 사용자는 무엇이 문제인지 모른다.
  */
  await recordSheet.nl.analyzeButton.click();
  await expect(recordSheet.nl.rows.first()).toBeVisible({ timeout: 30_000 });
});
