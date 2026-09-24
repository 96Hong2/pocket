import { formatDayLabel, shiftDay, toLedgerDate, withTopic } from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';

/**
 * **이름에 날이 붙은 버튼을 눌렀는데 정말 그 날에 적히나.**
 *
 * 키패드로 적는 길은 `home-record-day.spec.ts` 와 `calendar-record.spec.ts` 가 지킨다.
 * 여기서 보는 것은 그 둘이 안 밟는 길이다.
 *
 * 하나는 **방식 고르기가 끼어드는 길**이다. 한 번이라도 줄글로 저장하면 시트가 다음부터
 * 줄글 탭으로 열리는데, 예전에는 고른 날이 키패드 저장에만 붙었다. 그래서 버튼 이름은
 * 「어제」인데 아무 말 없이 오늘에 들어갔다.
 *
 * **고친 방식: 고른 날을 세 탭에 함께 내려보낸다**(`baseDay`). 적힌 날짜가 있으면 그쪽이
 * 이기고, 못 찾은 줄만 고른 날로 간다. 예전에는 키패드만 열어 두는 것으로 증상을 가렸는데,
 * 그러면 지난 날 영수증을 사진으로 적는 길이 통째로 막혔다.
 *
 * 다른 하나는 「어제는 안 썼어요」다. 이것도 이름에 날을 달고 그 날로 저장하는 두 번째
 * 버튼인데, 지금까지 오늘로만 눌러 봤다.
 */

// ── 홈에서 날을 들고 연 시트 ──────────────────────────────

test('줄글을 마지막에 썼어도 어제 기록하기는 키패드로 열리고, 방식은 잠기지 않는다', async ({
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
    날 이름이 붙은 버튼은 키패드로 열린다. 그 날에 적는 가장 짧은 길이라 그대로 둔다.
    다만 **잠기지는 않는다.** 고른 날이 세 탭에 함께 내려가므로 옮겨도 잃을 것이 없다.
  */
  const yesterday = shiftDay(toLedgerDate(new Date()), -1);
  await home.today.prevDayButton.click();
  await expect(home.today.title).toHaveText('어제');
  await home.today.emptyButton.click();
  await recordSheet.waitOpen();

  await expect(recordSheet.input.dayChip).toHaveText(formatDayLabel(yesterday));
  await expect(recordSheet.methodTab('줄글')).toBeEnabled();
  await expect(recordSheet.methodTab('캡처')).toBeEnabled();
  await expect(recordSheet.methodTab('영수증')).toBeEnabled();

  // 옮기면 어디로 떨어지는지 그 자리에서 말한다. 「무조건 이 날」 이 아니라 날짜가 없는 것만이다.
  await recordSheet.methodTab('줄글').click();
  await expect(recordSheet.input.dayBaseNotice(formatDayLabel(yesterday))).toBeVisible();

  // 날짜 칸은 키패드 안에 있다. 돌아와서 오늘로 되돌리면 그 줄이 걷힌다.
  await recordSheet.methodTab('키패드').click();
  await recordSheet.input.dayField.fill(toLedgerDate(new Date()));
  await recordSheet.methodTab('줄글').click();
  await expect(recordSheet.input.dayBaseNotice(formatDayLabel(yesterday))).toHaveCount(0);
});

test('달력에서 고른 날도 그 날 키패드로 열리고, 방식은 잠기지 않는다', async ({
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

  await expect(recordSheet.input.dayChip).not.toHaveText(formatDayLabel(toLedgerDate(new Date())));
  // 키패드로 열리지만 잠기지는 않는다. 그 날 영수증을 사진으로 적는 길이 살아 있어야 한다.
  await expect(recordSheet.methodTab('줄글')).toBeEnabled();
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

/*
  **이 파일에서 가장 중요한 한 판이다.**

  잠금을 걷어내면서 그 자리를 대신할 검증을 안 넣으면, `baseDay` 배선(prop 하나·
  `AnalyzeInput`·`baseDayBody`) 중 아무거나 지워도 모든 시험이 초록인 채로
  사용자가 신고했던 버그가 돌아온다. 예전에는 잠금이 막아 줬는데 이제는 아무것도 안 막는다.

  백엔드 테스트는 `base_day` 를 손으로 박아 넣어 확인한다. 그 값이 **화면에서 서버까지
  실제로 흘러가는지**는 여기서만 증명된다.
*/
test('어제를 골라 줄글로 적으면, 날짜를 안 써도 어제에 저장된다', async ({ home, recordSheet }) => {
  const yesterday = shiftDay(toLedgerDate(new Date()), -1);

  await home.open();
  await home.waitReady();

  // 어제로 옮겨 그 날 이름이 붙은 버튼으로 연다. 시트가 어제를 들고 열린다.
  await home.today.prevDayButton.click();
  await expect(home.today.title).toHaveText('어제');
  await home.today.emptyButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.input.dayChip).toHaveText(formatDayLabel(yesterday));

  /*
    **날짜를 안 적는다.** 적으면 그 날짜가 이겨서 고른 날이 쓰였는지 알 수 없다.
    빈 자리를 무엇으로 채우는지가 여기서 보는 것 전부다.
  */
  await recordSheet.methodTab('줄글').click();
  await expect(recordSheet.input.dayBaseNotice(formatDayLabel(yesterday))).toBeVisible();
  await recordSheet.nl.analyze('편의점 3000원');
  await recordSheet.nl.save();
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  // 어제 목록에 남는다. 오늘로 가면 없다. 둘 다 봐야 「어제에 갔다」 가 증명된다.
  await expect(home.today.title).toHaveText('어제');
  await expect(home.today.row('편의점')).toBeVisible();

  await home.today.jumpTodayButton.click();
  await expect(home.today.row('편의점')).toHaveCount(0);
});
