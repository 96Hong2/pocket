import { logsNamed } from '../support/aitMock';
import { expect, test } from '../support/fixtures';

/**
 * 처음 열었을 때 딱 한 번 뜨는 안내.
 *
 * 이 앱을 고르는 사람은 배우기 싫어서 고른다. 그래서 여기서 재는 것은 「무엇을 알려 주나」
 * 가 아니라 **「얼마나 빨리 빠져나갈 수 있나」** 다. 세 장, 어디서든 건너뛰기, 그리고
 * 한 번 보면 다시 안 뜨는 것.
 *
 * 다른 spec 은 픽스처가 「이미 봤다」 를 심어 이 화면을 건너뛴다. 여기서만 켠다.
 */

test.use({ showOnboarding: true });

test('처음 열면 세 장을 지나 바로 시작한다', async ({ home, onboarding, page }) => {
  await home.open();

  await expect(onboarding.title('사진 한 장이면 끝나요')).toBeVisible();
  await onboarding.nextButton.click();

  await expect(onboarding.title('아래 탭 두 개만 기억해요')).toBeVisible();
  await onboarding.nextButton.click();

  // 마지막 장은 다시 오기 쉽게 해 두는 자리다. 여기서는 「다음」이 아니라 「시작하기」다.
  await expect(onboarding.title('홈 화면에 두면 더 빨라요')).toBeVisible();
  await expect(onboarding.nextButton).toHaveCount(0);
  await onboarding.startButton.click();

  // 끝나면 곧장 홈이다. 안내를 지나 또 다른 안내가 서지 않는다.
  await expect(onboarding.isVisible).resolves.toBe(false);
  await home.waitReady();

  const result = await logsNamed(page, 'onboarding_result');
  expect(result).toHaveLength(1);
  expect(result[0]?.params.result).toBe('done');
  expect(result[0]?.params.slide).toBe('home_add');
});

test('첫 장에서 건너뛰면 바로 홈이고, 어느 장에서 나갔는지 남는다', async ({
  home,
  onboarding,
  page,
}) => {
  await home.open();
  await expect(onboarding.title('사진 한 장이면 끝나요')).toBeVisible();

  // 끝까지 봐야 쓸 수 있는 앱으로 만들면 그 순간 이 앱은 배워야 하는 앱이 된다.
  await onboarding.skipButton.click();
  await expect(onboarding.isVisible).resolves.toBe(false);
  await home.waitReady();
  await expect(home.recordButton).toBeVisible();

  const result = await logsNamed(page, 'onboarding_result');
  expect(result[0]?.params.result).toBe('skipped');
  // 어느 장에서 나갔나. 첫 장에서 나가는 사람이 많으면 장 수가 아니라 첫 장이 잘못된 것이다.
  expect(result[0]?.params.slide).toBe('record');
});

test('한 번 보면 다시 열어도 안 뜬다', async ({ home, onboarding }) => {
  await home.open();
  await expect(onboarding.title('사진 한 장이면 끝나요')).toBeVisible();
  await onboarding.skipButton.click();
  await home.waitReady();

  await home.open();
  await home.waitReady();
  await expect(onboarding.isVisible).resolves.toBe(false);
});

test('안내가 홈 화면 추가를 말했으니 첫 기록 뒤에 또 말하지 않는다', async ({
  home,
  onboarding,
  recordSheet,
}) => {
  await home.open();
  await onboarding.skipButton.click();
  await home.waitReady();

  // 첫 기록. 예전에는 이 순간 홈 화면 추가 안내가 스스로 열렸다.
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(12_000);
  await recordSheet.input.pickCategory('식비');
  await expect(recordSheet.feedback.headline).toBeVisible();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await home.waitReady();
  // 같은 말을 두 번 들으면 안내가 아니라 잔소리다.
  await expect(home.addToHome.sheet).toHaveCount(0);
});
