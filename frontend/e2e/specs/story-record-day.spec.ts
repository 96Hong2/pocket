import { shiftDay, toLedgerDate, withTopic } from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';

/**
 * **이름에 날이 붙은 버튼을 눌렀는데 정말 그 날에 적히나.**
 *
 * 키패드로 적는 길은 `home-record-day.spec.ts` 와 `calendar-record.spec.ts` 가 지킨다.
 * 여기서 보는 것은 그 둘이 안 밟는 길이다.
 *
 * 하나는 **방식 고르기가 끼어드는 길**이다. 한 번이라도 줄글로 저장하면 시트가 다음부터
 * 줄글 탭으로 열리는데, 고른 날은 키패드 저장에만 붙는다(줄글·캡처·영수증은 읽은 내용에서
 * 날짜가 나온다). 그래서 버튼 이름은 「어제」인데 아무 말 없이 오늘에 들어갔다.
 *
 * **고친 방식: 이름에 날이 붙은 버튼은 키패드 하나만 연다.** 방식을 고를 수 있게 두고
 * 「여기서는 안 붙어요」 라고 적는 길도 있었지만, 읽을 것이 늘고 고른 날을 잃을 길이
 * 그대로 남는다. 지난 날을 줄글로 적고 싶으면 큰 「기록하기」 에서 글에 날짜를 적으면 된다.
 *
 * 다른 하나는 「어제는 안 썼어요」다. 이것도 이름에 날을 달고 그 날로 저장하는 두 번째
 * 버튼인데, 지금까지 오늘로만 눌러 봤다.
 */

// ── 홈에서 날을 들고 연 시트 ──────────────────────────────

test('줄글을 마지막에 썼어도 어제 기록하기는 키패드로 열린다', async ({
  home,
  recordSheet,
}) => {
  // 한 번 줄글로 저장해 「마지막에 쓴 방식」 을 줄글로 만든다.
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('편의점 3000원');
  await recordSheet.nl.save();
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  // 큰 버튼은 그 방식을 기억한다. 여기까지는 그대로다.
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.nl.textarea).toBeVisible();
  await recordSheet.closeByEsc();
  await recordSheet.waitClosed();

  /*
    날 이름이 붙은 버튼은 다르다. **방식을 아예 묻지 않는다.**
    묻는 자리를 남겨 두면 탭을 옮기는 순간 고른 날이 말없이 버려진다.
  */
  await home.today.prevDayButton.click();
  await expect(home.today.title).toHaveText('어제');
  await home.today.emptyButton.click();
  await recordSheet.waitOpen();

  await expect(recordSheet.input.dayNotice).toHaveText('어제에 적어요');
  await expect(recordSheet.methodTabs).toHaveCount(0);
  await expect(recordSheet.nl.textarea).toHaveCount(0);
});

test('달력에서 고른 날도 방식을 묻지 않고 그 날 키패드로 연다', async ({
  calendar,
  recordSheet,
}) => {
  await calendar.open();
  await calendar.waitReady();

  // 이번 달 1일. 오늘이 1일이면 지난 날이 아니라 이 확인이 성립하지 않는다.
  test.skip(new Date().getDate() === 1, '오늘이 1일이라 이번 달에 지난 날이 없다');
  const now = new Date();
  const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  await calendar.grid.select(calendar.grid.cellName(first));

  await calendar.list.recordButton.click();
  await recordSheet.waitOpen();

  await expect(recordSheet.input.dayNotice).toBeVisible();
  await expect(recordSheet.methodTabs).toHaveCount(0);
});

test('어제는 안 썼어요는 어제에만 남고, 어제에 적으면 그 줄이 걷힌다', async ({
  calendar,
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.today.prevDayButton.click();
  await expect(home.today.title).toHaveText('어제');

  // 「어제 기록하기」 바로 위에 선 두 번째 날 버튼이다. 이름의 날과 저장되는 날이 같아야 한다.
  await expect(home.today.noSpendButtonFor('어제')).toBeVisible();
  await home.today.noSpendButtonFor('어제').click();
  await expect(home.today.noSpendRow).toContainText(`${withTopic('어제')} 안 썼어요`);
  await expect(home.today.noSpendCancelButton).toBeVisible();

  await test.step('오늘은 건드리지 않는다', async () => {
    await home.today.jumpTodayButton.click();
    await expect(home.today.title).toHaveText('오늘');
    await expect(home.today.noSpendCancelButton).toHaveCount(0);
    await expect(home.today.noSpendButtonFor('오늘')).toBeVisible();
  });

  await test.step('달력 어제 칸이 안 쓴 날로 읽힌다', async () => {
    await calendar.open();
    await calendar.waitReady();
    await expect(
      calendar.grid.cell(calendar.grid.cellName(yesterday(), { isNoSpend: true })),
    ).toBeVisible();
  });

  await test.step('어제에 지출을 적으면 어제 줄만 걷힌다', async () => {
    // 안 썼다는 줄이 선 날에는 홈의 「어제 기록하기」가 사라진다. 적을 길은 달력에 있다.
    await calendar.grid.select(calendar.grid.cellName(yesterday(), { isNoSpend: true }));
    await expect(calendar.list.noSpendRow).toBeVisible();

    await calendar.list.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.input.enterAmount(5000);
    await recordSheet.input.pickCategory('식비');
    await recordSheet.feedback.waitSaved();
    await recordSheet.feedback.confirmButton.click();
    await recordSheet.waitClosed();

    // 쓴 것이 있는 날에 안 썼다는 줄이 함께 남으면 그 날 장부가 스스로를 뒤집는다.
    await expect(calendar.list.row('식비')).toBeVisible();
    await expect(calendar.list.noSpendRow).toHaveCount(0);
    await expect(
      calendar.grid.cell(calendar.grid.cellName(yesterday(), { isNoSpend: true })),
    ).toHaveCount(0);
  });

  await test.step('오늘은 여전히 안 썼다고 남길 수 있다', async () => {
    await home.open();
    await home.waitReady();
    await expect(home.today.title).toHaveText('오늘');
    await expect(home.today.noSpendButtonFor('오늘')).toBeVisible();
  });
});

/** 어제의 `2026-09-14`. 기기 시간대가 아니라 가계부 시간대로 센다. */
function yesterday(): string {
  return shiftDay(toLedgerDate(new Date()), -1);
}
