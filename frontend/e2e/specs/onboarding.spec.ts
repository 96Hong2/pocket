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

test('처음 열면 네 장을 지나 바로 시작한다', async ({ home, onboarding, page }) => {
  await home.open();

  await expect(onboarding.title('사진 한 장이면 끝나요')).toBeVisible();
  await onboarding.nextButton.click();

  await expect(onboarding.title('아래 탭 두 개만 기억해요')).toBeVisible();
  await onboarding.nextButton.click();

  await expect(onboarding.title('홈 화면에 두면 더 빨라요')).toBeVisible();
  await onboarding.nextButton.click();

  // 마지막 장에서 두 가지를 묻는다. 여기서는 「다음」이 아니라 「시작하기」다.
  await expect(onboarding.title('마지막으로 두 가지만')).toBeVisible();
  await expect(onboarding.nextButton).toHaveCount(0);
  await onboarding.startButton.click();

  // 끝나면 곧장 홈이다. 안내를 지나 또 다른 안내가 서지 않는다.
  await expect(onboarding.isVisible).resolves.toBe(false);
  await home.waitReady();

  const result = await logsNamed(page, 'onboarding_result');
  expect(result).toHaveLength(1);
  expect(result[0]?.params.result).toBe('done');
  expect(result[0]?.params.slide).toBe('profile');
});

/*
  마지막 장의 연령대·성별.

  **회원가입이 아니다.** 익명키만으로 보내는 값이라 여기서 물을 수 있다. 예전에는 이메일을
  붙인 사람에게만 물어서, 메일 발송이 안 붙어 있는 동안에는 아무도 답할 수 없었다.
  여기서 지키는 것은 하나다. **안 고르고 그냥 시작할 수 있어야 한다.**
*/

test('아무것도 안 골라도 그냥 시작되고, 건너뛴 것으로 남는다', async ({
  home,
  onboarding,
  page,
}) => {
  await home.open();
  await onboarding.nextButton.click();
  await onboarding.nextButton.click();
  await onboarding.nextButton.click();
  await expect(onboarding.title('마지막으로 두 가지만')).toBeVisible();

  // 고르라고 막지 않는다. 막으면 그 순간 이 앱은 가입해야 쓰는 앱이 된다.
  await expect(onboarding.startButton).toBeEnabled();
  /*
    **거절을 보기로 세우지 않는다.** 칸의 기본은 「선택하기」 다. 예전에는 「안 고를래요」
    였는데, 안 골라도 된다는 안내가 칸 아래에 이미 있는데 보기로까지 세우면 그냥 넘어가면
    될 것을 굳이 고르게 된다.
  */
  await expect(onboarding.ageSelect).toHaveValue('');
  await expect(onboarding.ageSelect.getByRole('option').first()).toHaveText('선택하기');
  await expect(onboarding.ageSelect.getByRole('option', { name: '안 고를래요' })).toHaveCount(0);
  /*
    **「말하지 않을래요」 는 두지 않는다.** 그 버튼이 있으면 안 고르고 넘어가면 될 것을
    굳이 누르게 된다. 안 고르는 것이 곧 말하지 않는 것이다.
  */
  await expect(onboarding.genderChip('말하지 않을래요')).toHaveCount(0);
  await expect(onboarding.askNote).toHaveText('앱 통계에서만 사용해요');
  await onboarding.startButton.click();

  await home.waitReady();
  const profile = await logsNamed(page, 'profile_result');
  expect(profile.map((log) => [log.params.result, log.params.where])).toEqual([
    ['skipped', 'onboarding'],
  ]);
});

test('고른 연령대·성별이 실제로 서버까지 간다', async ({ home, onboarding, page }) => {
  await home.open();
  await onboarding.nextButton.click();
  await onboarding.nextButton.click();
  await onboarding.nextButton.click();

  /*
    **로그만 보고 끝내지 않는다.** 로그는 남는데 요청이 안 나간 적이 있다.
    화면에는 되비쳐 볼 자리가 없으니(「내 계정」 에서 뺐다) 나가는 요청을 직접 본다.
  */
  const sent = page.waitForRequest(
    (request) => request.url().includes('/account/profile') && request.method() === 'PATCH',
  );

  await onboarding.ageSelect.selectOption('30s');
  await onboarding.genderChip('여성').click();
  await onboarding.startButton.click();
  await home.waitReady();

  expect((await sent).postDataJSON()).toEqual({ age_band: '30s', gender: 'female' });

  const profile = await logsNamed(page, 'profile_result');
  expect(profile.map((log) => [log.params.result, log.params.where, log.params.age_band])).toEqual([
    ['saved', 'onboarding', '30s'],
  ]);
});

test('다시 누르면 고른 것을 무를 수 있다', async ({ home, onboarding, page }) => {
  await home.open();
  await onboarding.nextButton.click();
  await onboarding.nextButton.click();
  await onboarding.nextButton.click();

  // 고른 것을 무를 수 있어야 한다. 칸은 「선택하기」 로 되돌아가고, 칩은 다시 누르면 꺼진다.
  await onboarding.ageSelect.selectOption('20s');
  await expect(onboarding.ageSelect).toHaveValue('20s');
  await onboarding.ageSelect.selectOption('');
  await expect(onboarding.ageSelect).toHaveValue('');

  await onboarding.genderChip('남성').click();
  await expect(onboarding.genderChip('남성')).toHaveAttribute('aria-checked', 'true');
  await onboarding.genderChip('남성').click();
  await expect(onboarding.genderChip('남성')).toHaveAttribute('aria-checked', 'false');

  await onboarding.startButton.click();
  await home.waitReady();
  const profile = await logsNamed(page, 'profile_result');
  expect(profile[0]?.params.result).toBe('skipped');
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

test('안내를 처음 상태로 되돌리면 처음 안내가 다시 뜬다', async ({
  home,
  onboarding,
  settings,
}) => {
  await home.open();
  await onboarding.skipButton.click();
  await home.waitReady();

  // 실기기에서 이 화면을 다시 볼 유일한 길이다. 없으면 앱 데이터를 통째로 지워야 한다.
  await settings.open();
  await settings.waitReady();
  await settings.versionRow.click();
  await settings.resetMarksButton.click();
  await expect(settings.text(/되돌렸어요/)).toBeVisible();

  await home.open();
  await expect(onboarding.title('사진 한 장이면 끝나요')).toBeVisible();
});


/*
  **처음 안내가 끝난 바로 뒤에 다른 안내가 겹치지 않는다.**

  실기기에서 났다. 안내를 마치고 「시작하기」 를 누르자마자 「첫 기록 끝! 홈에 두면 더
  빨라요」 가 떴다. 아무것도 안 적은 사람에게 적었다고 말한 것이다.

  원인은 순서였다. 홈 추가 안내가 처음 안내가 떠 있는 동안 저장소를 미리 읽어 두고,
  안내가 끝나며 적는 「봤다」 표시를 못 본 채 지난 값으로 열었다.
*/
test('처음 안내를 마쳐도 홈 추가 안내가 따라 뜨지 않는다', async ({ home, onboarding, page }) => {
  await home.open();
  await onboarding.nextButton.click();
  await onboarding.nextButton.click();
  await onboarding.nextButton.click();
  await onboarding.startButton.click();

  await home.waitReady();
  await expect(page.getByText('첫 기록 끝!')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // 마지막 장이 홈 화면 추가를 이미 말했다. 그래서 「봤다」 로 적고 넘어간다.
  const homeAdd = await logsNamed(page, 'home_add_result');
  expect(homeAdd).toHaveLength(0);
});

test('안내를 건너뛴 사람에게도 첫 기록 뒤 홈 추가 안내가 안 뜬다', async ({
  home,
  onboarding,
  page,
  recordSheet,
}) => {
  await home.open();
  await onboarding.skipButton.click();
  await home.waitReady();

  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(5000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  /*
    건너뛴 사람은 안내 자체를 원하지 않았다. 그 사람에게 다른 안내를 대신 밀어 넣지 않는다.
    끝까지 본 사람은 마지막 장에서 같은 말을 이미 들었다. 어느 쪽이든 안 뜬다.
  */
  await expect(page.getByText('첫 기록 끝!')).toHaveCount(0);
});
