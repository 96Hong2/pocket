import { expect, test } from '../support/fixtures';

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
  await expect(recordSheet.root.getByText('에 적어요')).toBeVisible();
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

test('오늘 기록하기는 오늘에 남고 날짜 안내가 없다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await expect(home.today.title).toHaveText('오늘');

  await home.today.emptyButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.root.getByText('에 적어요')).toHaveCount(0);
  await recordSheet.input.enterAmount(5000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await expect(home.today.title).toHaveText('오늘');
  await expect(home.today.emptyButton).toHaveCount(0);
});

test('위의 큰 기록하기는 어제를 보고 있어도 오늘에 적는다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.today.prevDayButton.click();
  await expect(home.today.title).toHaveText('어제');

  await home.recordButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.root.getByText('에 적어요')).toHaveCount(0);
  await recordSheet.input.enterAmount(3000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  // 어제는 그대로 비어 있고, 오늘로 가면 있다
  await expect(home.today.emptyButton).toBeVisible();
  await home.today.jumpTodayButton.click();
  await expect(home.today.emptyButton).toHaveCount(0);
});
