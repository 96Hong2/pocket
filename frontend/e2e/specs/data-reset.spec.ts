import { formatCurrency } from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';

/**
 * 앱 데이터 초기화.
 *
 * 되돌릴 수 없는 자리다. 여기서 지키는 것이 셋이다.
 * **한 번에 지워지지 않는 것**(여는 것과 지우는 것이 갈려 있다),
 * **무엇이 사라지는지 이름으로 적혀 있는 것**, 그리고 **정말 다 지워지는 것**.
 */

test('동의를 누르기 전에는 확인이 잠겨 있다', async ({ settings }) => {
  await settings.open();
  await settings.waitReady();

  await settings.dataReset.openButton.click();
  await expect(settings.dataReset.sheet).toBeVisible();

  // 무엇을 잃는지 먼저 읽힌다. "데이터" 한 단어로는 무엇이 사라지는지 모른다.
  await expect(settings.dataReset.list.first()).toBeVisible();
  await expect(settings.dataReset.warning).toBeVisible();

  await expect(settings.dataReset.confirmButton).toBeDisabled();
  await settings.dataReset.agree.check();
  await expect(settings.dataReset.confirmButton).toBeEnabled();
});

test('닫았다 다시 열면 동의가 풀려 있다', async ({ settings }) => {
  await settings.open();
  await settings.waitReady();

  await settings.dataReset.openButton.click();
  await settings.dataReset.agree.check();
  await settings.dataReset.sheet.getByRole('button', { name: '닫기' }).click();
  await expect(settings.dataReset.sheet).toBeHidden();

  // 눌러 둔 채로 남으면 두 번째는 한 번 누르는 것으로 지워진다.
  await settings.dataReset.openButton.click();
  await expect(settings.dataReset.confirmButton).toBeDisabled();
});

test('지우면 기록도 예산도 목표도 사라지고, 첫 화면으로 돌아간다', async ({
  goal,
  home,
  prep,
  settings,
}) => {
  await prep.addTransaction({ amount: 12_000, merchant: '김밥천국' });
  await prep.setBudget(500_000);
  await prep.setGoal({ title: '세부여행', targetAmount: 1_300_000 });
  await prep.addCategory('반려동물');

  await home.open();
  await home.waitReady();
  await expect(home.today.amount(formatCurrency(12_000))).toBeVisible();

  await settings.open();
  await settings.waitReady();
  await settings.dataReset.run();

  // 홈은 예산도 기록도 없는 첫 화면으로 돌아간다. 설정은 하위 화면이라 탭바가 없다.
  await home.open();
  await home.waitReady();
  await expect(home.today.amount(formatCurrency(12_000))).toHaveCount(0);

  await goal.open();
  await expect(goal.emptyTitle).toBeVisible();
});

test('지운 뒤에도 곧바로 다시 적을 수 있다', async ({ home, prep, recordSheet, settings }) => {
  await prep.addTransaction({ amount: 8_000, merchant: '분식' });

  await settings.open();
  await settings.waitReady();
  await settings.dataReset.run();

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  // 기본 분류는 남는다. 모두가 같이 보는 행이라 지우지 않는다.
  await recordSheet.input.enterAmount(5_000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await expect(home.today.amount(formatCurrency(5_000))).toBeVisible();
});
