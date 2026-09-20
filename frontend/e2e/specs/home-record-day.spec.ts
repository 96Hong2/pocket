import { formatDayLabel, shiftDay, toLedgerDate } from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';

/** 알약에 적히는 오늘. 「오늘」 이 아니라 날짜 그대로다. */
function todayLabel(): string {
  return formatDayLabel(toLedgerDate(new Date()));
}

/** 알약에 적히는 어제. 가계부 시간대로 센다. */
function yesterdayLabel(): string {
  return formatDayLabel(shiftDay(toLedgerDate(new Date()), -1));
}

/**
 * 홈에서 기록할 때 **어느 날에 적히는가.**
 *
 * 실기기 신고에서 나왔다. 「어제 기록하기」 를 눌러 적었는데 오늘에 들어갔다.
 * 시트가 날짜를 아예 못 받고 늘 `new Date()` 로 저장하고 있었다.
 *
 * 규칙은 버튼 이름과 같다. **이름에 날이 붙은 버튼만 그 날에 적는다.**
 * 위의 큰 「기록하기」 는 날 이름이 없으니 어느 날을 보고 있든 오늘이다.
 */

test('어제 기록하기로 적으면 어제에 남는다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.today.prevDayButton.click();
  await expect(home.today.title).toHaveText('어제');

  await home.today.emptyButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.input.dayChip).toHaveText(yesterdayLabel());
  await recordSheet.input.enterAmount(7000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await expect(home.today.title).toHaveText('어제');
  await expect(home.today.emptyButton).toHaveCount(0);

  // 오늘로 돌아오면 그 기록은 없다
  await home.today.jumpTodayButton.click();
  await expect(home.today.title).toHaveText('오늘');
  await expect(home.today.emptyButton).toBeVisible();
});

test('어제보다 더 전인 날도 그 날에 남는다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();

  // 사흘 전까지 되짚는다. 「어제」 만 되는 것이 아니라 어느 날이든 그 날에 적혀야 한다.
  await home.today.prevDayButton.click();
  await home.today.prevDayButton.click();
  await home.today.prevDayButton.click();
  const label = (await home.today.title.textContent())?.trim() ?? '';
  expect(label).toMatch(/^\d+월 \d+일$/);

  await expect(home.today.emptyButton).toHaveText(`${label} 기록하기`);
  await home.today.emptyButton.click();
  await recordSheet.waitOpen();
  // 알약에도 그 날 이름이 그대로 적힌다. 「어제」 로 뭉뚱그리지 않는다.
  await expect(recordSheet.input.dayChip).toHaveText(label);

  await recordSheet.input.enterAmount(9000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await expect(home.today.title).toHaveText(label);
  await expect(home.today.emptyButton).toHaveCount(0);

  // 오늘로 돌아오면 없다. 사흘 전에 적은 것이 오늘로 올라오지 않는다.
  await home.today.jumpTodayButton.click();
  await expect(home.today.title).toHaveText('오늘');
  await expect(home.today.emptyButton).toBeVisible();
});

test('오늘 기록하기는 오늘에 남고 날짜 안내가 없다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await expect(home.today.title).toHaveText('오늘');

  await home.today.emptyButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.input.dayChip).toHaveText(todayLabel());
  await recordSheet.input.enterAmount(5000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await expect(home.today.title).toHaveText('오늘');
  await expect(home.today.emptyButton).toHaveCount(0);
});

test('지난 날을 보는 중에 큰 기록하기를 누르면 어느 날에 적을지 먼저 묻는다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.today.prevDayButton.click();
  await expect(home.today.title).toHaveText('어제');

  // 바로 열리지 않는다. 이 버튼은 늘 오늘에 적는데, 며칠 전을 훑다 누른 사람은
  // 보고 있던 날에 적힐 것이라고 여긴다.
  await home.recordButton.click();
  await expect(home.recordDayAsk).toBeVisible();
  await expect(recordSheet.isVisible).resolves.toBe(false);

  // 그만두면 아무 일도 없다.
  await home.recordDayClose.click();
  await expect(home.recordDayAsk).toHaveCount(0);
  await expect(recordSheet.isVisible).resolves.toBe(false);

  // 어제를 고르면 어제에 적는다. 시트가 어느 날인지 적어 준다.
  await home.recordButton.click();
  await home.recordDayChoice('어제').click();
  await recordSheet.waitOpen();
  await expect(recordSheet.input.dayChip).toHaveText(yesterdayLabel());
  await recordSheet.input.enterAmount(4500);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await expect(home.today.title).toHaveText('어제');
  await expect(home.today.row('식비')).toBeVisible();
});

test('물음에서 오늘을 고르면 오늘에 적히고 방식도 고를 수 있다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.today.prevDayButton.click();
  await expect(home.today.title).toHaveText('어제');

  await home.recordButton.click();
  await home.recordDayChoice('오늘').click();
  await recordSheet.waitOpen();
  await expect(recordSheet.input.dayChip).toHaveText(todayLabel());
  // 오늘로 갔으면 날이 붙은 버튼으로 들어온 것이 아니라 방식 알약이 그대로 있다.
  await expect(recordSheet.methodTab('줄글')).toBeEnabled();

  await recordSheet.input.enterAmount(3000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  /*
    적고 나면 **적힌 날이 눈앞에 선다.** 어제를 보던 사람에게 오늘 것을 적어 놓고
    화면은 어제에 두면, 들어간 것인지 아닌지를 화살표로 찾아가 봐야 안다.
  */
  await expect(home.today.title).toHaveText('오늘');
  await expect(home.today.emptyButton).toHaveCount(0);

  // 보고 있던 어제에 잘못 적히지 않았다. 큰 버튼은 늘 오늘에 적는다.
  await home.today.prevDayButton.click();
  await expect(home.today.title).toHaveText('어제');
  await expect(home.today.emptyButton).toBeVisible();
});
