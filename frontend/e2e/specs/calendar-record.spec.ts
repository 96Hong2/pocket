import { logsNamed } from '../support/aitMock';
import { expect, test } from '../support/fixtures';

/**
 * 월간 달력에서 **그 날에 적고·고치고·지우는** 것.
 *
 * 지난 날 하나를 빠뜨린 것은 대개 달력을 보다가 발견한다. 그런데 여기에는 적을 길이
 * 없어서 홈으로 돌아가야 했고, 홈의 큰 버튼은 늘 오늘에 적는다. 그래서 「지난 날을
 * 발견한 자리」 와 「적는 자리」 가 갈려 있었다.
 *
 * 규칙은 홈과 같다. **이름에 날이 붙은 버튼만 그 날에 적는다.**
 */

test('고른 날에 적으면 그 날에 남고, 다른 날에는 안 보인다', async ({
  calendar,
  page,
  recordSheet,
}) => {
  await calendar.open();
  await calendar.waitReady();

  // 이 달 5일을 고른다. 오늘이 며칠이든 지난 날이 되도록 달을 먼저 지난달로 옮긴다.
  await calendar.goToMonth(lastMonthLabel());
  await calendar.grid.select(calendar.grid.cellName(dayOfLastMonth(5)));
  await expect(calendar.list.emptyDay).toBeVisible();

  const label = `${Number(dayOfLastMonth(5).slice(5, 7))}월 5일`;
  await expect(calendar.list.recordButton).toHaveText(`${label} 기록하기`);

  await calendar.list.recordButton.click();
  await recordSheet.waitOpen();
  // 어느 날에 적는지 금액을 누르기 전에 화면이 말한다.
  await expect(recordSheet.input.dayNotice).toHaveText(`${label} 에 적어요`);

  await recordSheet.input.enterAmount(4300);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  // 그 날 목록에 섰다.
  await expect(calendar.list.emptyDay).toHaveCount(0);
  await expect(calendar.list.row('식비')).toBeVisible();

  // 옆 날은 그대로 비어 있다.
  await calendar.grid.select(calendar.grid.cellName(dayOfLastMonth(6)));
  await expect(calendar.list.emptyDay).toBeVisible();

  /*
    어디서 열었는지가 로그에 남는다. 입구가 셋이라 이것이 없으면 쓰이는지조차 모른다.
    개발 판은 효과를 두 번 부르므로 줄 수는 못 박지 않는다. 값이 한 가지인 것만 본다.
  */
  const started = await logsNamed(page, 'record_started');
  expect(started.length).toBeGreaterThan(0);
  expect(new Set(started.map((log) => `${log.params.from}/${log.params.backfill}`))).toEqual(
    new Set(['calendar_day/true']),
  );
});

test('오늘 칸에서 적으면 지난 날 안내 없이 오늘에 적힌다', async ({
  calendar,
  page,
  recordSheet,
}) => {
  await calendar.open();
  await calendar.waitReady();

  // 처음 열면 오늘이 골라져 있다.
  await expect(calendar.list.recordButton).toHaveText('오늘 기록하기');
  await calendar.list.recordButton.click();
  await recordSheet.waitOpen();
  // 오늘은 지난 날이 아니다. 「오늘 에 적어요」 같은 군말을 세우지 않는다.
  await expect(recordSheet.input.dayNotice).toHaveCount(0);

  await recordSheet.input.enterAmount(1500);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await expect(calendar.list.row('식비')).toBeVisible();

  const started = await logsNamed(page, 'record_started');
  expect(started.length).toBeGreaterThan(0);
  expect(new Set(started.map((log) => `${log.params.from}/${log.params.backfill}`))).toEqual(
    new Set(['calendar_day/false']),
  );
});

test('앞날에는 적는 버튼을 아예 안 세운다', async ({ calendar }) => {
  await calendar.open();
  await calendar.waitReady();

  const today = new Date();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  // 이번 달 마지막 날이 오늘이면 앞날이 없다. 그때는 이 확인이 성립하지 않는다.
  test.skip(today.getDate() === lastDay, '오늘이 말일이라 이번 달에 앞날이 없다');

  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  await calendar.grid.select(calendar.grid.cellName(iso));

  // 아직 쓰지 않은 돈이다. 적을 자리를 열지 않는다.
  await expect(calendar.list.recordButton).toHaveCount(0);
});

/** 지난달 이동 버튼에 적히는 이름. `2026년 8월`. */
function lastMonthLabel(): string {
  const now = new Date();
  const at = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${at.getFullYear()}년 ${at.getMonth() + 1}월`;
}

/** 지난달 n일의 `2026-08-05`. */
function dayOfLastMonth(day: number): string {
  const now = new Date();
  const at = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
