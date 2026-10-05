import {
  formatCurrency,
  formatDayLabel,
  shiftDay,
  toLedgerDate,
} from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';

/** 첫 화면 맨 위 날짜에 적히는 오늘의 날짜 부분. 앞에 「오늘」 이 붙는다. */
function todayLabel(): string {
  return formatDayLabel(toLedgerDate(new Date()));
}

/** 첫 화면 맨 위 날짜에 적히는 어제의 날짜 부분. 가계부 시간대로 센다. */
function yesterdayLabel(): string {
  return formatDayLabel(shiftDay(toLedgerDate(new Date()), -1));
}

/**
 * 홈에서 기록할 때 **어느 날에 적히는가.**
 *
 * 실기기 신고에서 나왔다. 「어제 기록하기」 를 눌러 적었는데 오늘에 들어갔다.
 * 시트가 날짜를 아예 못 받고 늘 `new Date()` 로 저장하고 있었다.
 *
 * 시트는 **보고 있던 날이 골라진 채** 열린다. 이름에 날이 붙은 버튼도, 위의 큰 「기록하기」 도
 * 같다. 날짜는 첫 화면 맨 위에서 바꾼다.
 */

test('어제 기록하기로 적으면 어제에 남는다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.today.prevDayButton.click();
  await expect(home.today.title).toHaveText('어제');

  await home.today.emptyButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.dayButton).toContainText(`어제 ${yesterdayLabel()} (`);
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
  // 첫 화면 맨 위에도 그 날 이름이 그대로 적힌다. 「어제」 로 뭉뚱그리지 않는다.
  await expect(recordSheet.dayButton).toContainText(`${label} (`);

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
  await expect(recordSheet.dayButton).toContainText(`오늘 ${todayLabel()} (`);
  await recordSheet.input.enterAmount(5000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await expect(home.today.title).toHaveText('오늘');
  await expect(home.today.emptyButton).toHaveCount(0);
});

test('지난 날을 보는 중에 큰 기록하기를 누르면 그 날이 골라진 채 첫 화면이 열린다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.today.prevDayButton.click();
  await expect(home.today.title).toHaveText('어제');

  /*
    따로 묻지 않는다. 날짜가 첫 화면 맨 위에 있어 거기서 묻고 바꾼다. 앞에서 한 번 더 물으면
    같은 것을 두 번 묻게 된다. 며칠 전을 훑다 누른 사람은 보던 날에 적힐 것이라고 여긴다.
  */
  await home.recordButton.click();
  await expect(home.recordDayAsk).toHaveCount(0);
  await recordSheet.waitOpen();
  await expect(recordSheet.dayButton).toContainText(`어제 ${yesterdayLabel()} (`);
  await recordSheet.input.enterAmount(4500);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await expect(home.today.title).toHaveText('어제');
  await expect(home.today.row('식비')).toBeVisible();
});

test('지난 날을 보다 연 시트에서 오늘로 바꾸면 오늘에 적히고 방식도 고를 수 있다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.today.prevDayButton.click();
  await expect(home.today.title).toHaveText('어제');

  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.chooseDay(toLedgerDate(new Date()));
  await expect(recordSheet.dayButton).toContainText(`오늘 ${todayLabel()} (`);
  // 날을 바꿔도 방법 카드는 그대로 다 고를 수 있다.
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

  // 보고 있던 어제에 잘못 적히지 않았다.
  await home.today.prevDayButton.click();
  await expect(home.today.title).toHaveText('어제');
  await expect(home.today.emptyButton).toBeVisible();
});

/**
 * **이미 적어 둔 지난 날에 하나 더.**
 *
 * 기록이 있는 날은 카드가 「전체 내역 보기」 로 끝나서, 어제 것을 뒤늦게 떠올린 사람은
 * 달력으로 들어가거나 큰 기록하기를 눌러 날을 다시 고르는 수밖에 없었다.
 * 보고 있는 날이 화면에 떠 있는데 그 날에 적을 자리가 없던 셈이다.
 */
test('기록이 있는 지난 날에도 목록 아래에서 하나 더 적는다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.today.prevDayButton.click();
  await expect(home.today.title).toHaveText('어제');

  // 먼저 한 건 적어 어제를 빈 날이 아니게 만든다.
  await home.today.emptyButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(7000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(home.today.title).toHaveText('어제');
  await expect(home.today.emptyButton).toHaveCount(0);

  // 「전체 내역 보기」 는 그대로 두고, 그 아래에 따로 선다.
  await expect(home.today.moreLink).toBeVisible();
  await expect(home.today.addMoreButton).toHaveText('어제 기록 더하기');

  await home.today.addMoreButton.click();
  await recordSheet.waitOpen();
  // 보고 있던 날 그대로 열린다. 오늘로 새지 않는다.
  await expect(recordSheet.dayButton).toContainText(`어제 ${yesterdayLabel()} (`);
  await recordSheet.input.enterAmount(1200);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  // 두 건이 같은 날에 쌓인다. 합계로 본다.
  await expect(home.today.title).toHaveText('어제');
  await expect(home.today.spentTotal).toHaveText(`${formatCurrency(8_200)} 씀`);

  // 오늘에는 세우지 않는다. 맨 위 큰 「기록하기」 가 이미 오늘에 적는다.
  await home.today.jumpTodayButton.click();
  await expect(home.today.title).toHaveText('오늘');
  await expect(home.today.addMoreButton).toHaveCount(0);
});
