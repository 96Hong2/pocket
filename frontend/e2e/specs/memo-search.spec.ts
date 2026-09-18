import { expect, test } from '../support/fixtures';

/**
 * 메모와 검색.
 *
 * 메모는 상호와 **다른 칸**이다. 상호는 「어디서」 고 메모는 「무엇을·왜」 다.
 * 같은 스타벅스라도 "팀 커피 쐈다" 는 상호에 적을 말이 아니고, 상호에 적으면 다음에
 * 같은 가게에서 쓴 것과 묶이지 않는다.
 *
 * 검색은 그 메모까지 본다. 그리고 숫자만 적으면 **그 금액**을 찾는다.
 */

test('저장한 뒤에 메모를 적고, 목록 줄에서 그 메모를 읽는다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(12000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();

  await recordSheet.feedback.writeMerchant('스타벅스');
  await recordSheet.feedback.writeMemo('팀 커피 쐈다');
  await recordSheet.closeByEsc();

  /*
    목록에서는 분류 이름 대신 메모를 보여 준다. 분류는 왼쪽 그림이 이미 말하고 있어서,
    같은 자리에 분류 이름을 또 적느니 일부러 남긴 한 줄을 보여 주는 쪽이 쓸모가 있다.
  */
  await expect(home.today.row('스타벅스')).toBeVisible();
  await expect(home.today.row('팀 커피 쐈다')).toBeVisible();
});

test('수정 시트에서도 메모를 고친다', async ({ calendar, home, prep }) => {
  await prep.addTransaction({ amount: 12000, merchant: '스타벅스' });

  await home.open();
  await home.waitReady();
  await home.today.row('스타벅스').click();
  await home.edit.waitOpen();

  await home.edit.memo.fill('팀 커피 쐈다');
  await home.edit.doneButton.click();
  await home.edit.waitClosed();

  await expect(home.today.row('팀 커피 쐈다')).toBeVisible();

  // 달력의 그 날 목록에서도 같은 줄이 보인다. 두 화면이 한 규칙으로 그린다.
  await calendar.open();
  await calendar.waitReady();
  await expect(calendar.list.row('팀 커피 쐈다')).toBeVisible();
});

test('금액으로 찾으면 그 금액만 나온다', async ({ calendar, prep }) => {
  await prep.addTransaction({ amount: 12000, merchant: '스타벅스' });
  await prep.addTransaction({ amount: 112000, merchant: '백화점' });

  await calendar.open();
  await calendar.waitReady();

  await calendar.search.find('12000');

  /*
    부분일치가 아니라 딱 그 금액이다. 12,000 을 찾다가 112,000 이 나오면
    검색이 아니라 훼방이다.
  */
  await expect(calendar.list.row('스타벅스')).toBeVisible();
  await expect(calendar.list.row('백화점')).toHaveCount(0);
});

test('쉼표와 원을 붙여 적어도 찾는다', async ({ calendar, prep }) => {
  await prep.addTransaction({ amount: 12000, merchant: '스타벅스' });

  await calendar.open();
  await calendar.waitReady();

  // 사람은 화면에 보이는 대로 적는다. 화면이 「12,000원」 이라고 보여 주기 때문이다.
  await calendar.search.find('12,000원');
  await expect(calendar.list.row('스타벅스')).toBeVisible();
});

test('메모로도 찾는다', async ({ calendar, home, prep }) => {
  await prep.addTransaction({ amount: 12000, merchant: '스타벅스' });
  await prep.addTransaction({ amount: 8000, merchant: '김밥천국' });

  await home.open();
  await home.waitReady();
  await home.today.row('스타벅스').click();
  await home.edit.memo.fill('팀 커피 쐈다');
  await home.edit.doneButton.click();
  await home.edit.waitClosed();

  await calendar.open();
  await calendar.waitReady();
  await calendar.search.find('커피');

  await expect(calendar.list.row('스타벅스')).toBeVisible();
  await expect(calendar.list.row('김밥천국')).toHaveCount(0);
});

test('태그 이름으로도 찾는다', async ({ calendar, home, prep, recordSheet, tags }) => {
  await tags.open();
  await tags.waitReady();
  await tags.create('지출 태그', '출장');

  await prep.addTransaction({ amount: 8000, merchant: '김밥천국' });

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(12000);
  await recordSheet.input.pickCategory('교통');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.writeMerchant('택시');
  await recordSheet.feedback.tagChip('출장').click();
  await expect(recordSheet.feedback.tagChip('출장')).toHaveAttribute('aria-pressed', 'true');
  await recordSheet.closeByEsc();

  await calendar.open();
  await calendar.waitReady();
  await calendar.search.find('출장');

  await expect(calendar.list.row('택시')).toBeVisible();
  await expect(calendar.list.row('김밥천국')).toHaveCount(0);
});

test('검색 안내 문구가 실제로 찾는 것과 같다', async ({ calendar }) => {
  await calendar.open();
  await calendar.waitReady();

  // 문구와 동작이 어긋나면 사용자는 검색이 고장 난 줄로 안다.
  await expect(calendar.search.input).toHaveAttribute('placeholder', '이름·태그·금액으로 검색');
});
