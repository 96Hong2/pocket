import { formatCurrency } from '../../src/shared/lib/format';
import { logsNamed } from '../support/aitMock';
import { PrepApi } from '../support/api';
import { expect, test } from '../support/fixtures';

/**
 * 내 계정: 이메일로 지켜 두기.
 *
 * 로그인 화면이 아니라 「기록 지켜 두기」 다. 여기서 지키는 것은 셋이다.
 * **안 해도 된다고 적혀 있는 것**, **주소 → 코드 두 단으로 끝나는 것**, 그리고
 * **새 기기에서 같은 이메일로 확인하면 기록이 그대로 이어지는 것.**
 *
 * 코드는 로컬 스텁이 보낸 것을 `/account/email/peek` 로 읽는다. 메일함은 없다.
 */

test('안 해도 된다고 먼저 말하고, 주소와 코드 두 단으로 붙는다', async ({
  account,
  page,
  prep,
}) => {
  const address = `e2e-${Date.now()}@example.com`;

  await account.open();
  await account.waitReady();
  await expect(account.optionalNote).toBeVisible();

  await account.requestCode(address);
  const code = await prep.peekLoginCode(address);
  await account.submitCode(code);

  // 붙자마자 연령대·성별을 한 번 묻는다. 건너뛸 수 있다.
  await expect(account.profileSheet).toBeVisible();
  await account.profileSkipButton.click();
  await expect(account.profileSheet).toHaveCount(0);

  await expect(account.linkedTitle).toBeVisible();
  await expect(account.email(address)).toBeVisible();
  await expect(account.profileRow).toContainText('아직 안 적었어요');

  const link = await logsNamed(page, 'account_link_result');
  expect(link.map((log) => log.params.result)).toEqual(['sent', 'linked']);
  const profile = await logsNamed(page, 'profile_result');
  expect(profile.map((log) => log.params.result)).toEqual(['skipped']);
  // 주소는 어느 로그에도 실리지 않는다.
  expect(JSON.stringify([...link, ...profile])).not.toContain(address);
});

test.describe('틀린 코드', () => {
  // 틀린 코드는 서버가 422 로 답한다. 그 응답이 콘솔에 남는 것은 오류가 아니라 이 흐름의 정상 소리다.
  test.use({ consoleErrorAllowList: [/Failed to load resource.*422/] });

  test('틀린 코드는 그 자리에서 알려 주고 다시 적을 수 있다', async ({ account, prep }) => {
    const address = `e2e-wrong-${Date.now()}@example.com`;

    await account.open();
    await account.waitReady();
    await account.requestCode(address);
    const code = await prep.peekLoginCode(address);
    const wrong = code === '000000' ? '111111' : '000000';

    await account.codeField.fill(wrong);
    await account.confirmButton.click();
    await expect(account.linkNotice).toContainText('코드가 맞지 않아요');

    await account.submitCode(code);
    await account.profileSkipButton.click();
    await expect(account.linkedTitle).toBeVisible();
  });
});

test('연령대·성별을 고르면 카드 한 줄에 남고, 다시 열어 고칠 수 있다', async ({
  account,
  page,
  prep,
}) => {
  const address = `e2e-profile-${Date.now()}@example.com`;

  await account.open();
  await account.waitReady();
  await account.requestCode(address);
  await account.submitCode(await prep.peekLoginCode(address));

  await account.ageChoice('30대').click();
  await account.genderChoice('여성').click();
  await account.profileSaveButton.click();
  await expect(account.profileSheet).toHaveCount(0);
  await expect(account.profileRow).toContainText('30대 · 여성');

  // 다시 열면 고른 것이 켜져 있고, 바꿀 수 있다.
  await account.profileRow.click();
  await expect(account.ageChoice('30대')).toHaveAttribute('aria-checked', 'true');
  await account.genderChoice('말하지 않을래요').click();
  await account.profileSaveButton.click();
  await expect(account.profileRow).toContainText('30대');
  await expect(account.profileRow).not.toContainText('여성');

  const profile = await logsNamed(page, 'profile_result');
  expect(profile.map((log) => [log.params.result, log.params.age_band])).toEqual([
    ['saved', '30s'],
    ['saved', '30s'],
  ]);
});

test('새 기기에서 같은 이메일로 확인하면 첫 기기의 기록이 그대로 이어진다', async ({
  account,
  home,
  prep,
}) => {
  const address = `e2e-switch-${Date.now()}@example.com`;

  // 첫 기기. 기록 하나를 적고 이메일을 붙여 둔다.
  const first = await PrepApi.create(`e2e-first-device-${Date.now()}`);
  try {
    await first.addTransaction({ amount: 12_000, merchant: '김밥천국' });
    await first.startEmailLogin(address);
    await first.verifyEmailLogin(address, await first.peekLoginCode(address));
  } finally {
    await first.dispose();
  }

  // 이 브라우저는 새 기기다. 아직 아무것도 없다.
  await home.open();
  await home.waitReady();
  await expect(home.today.amount(formatCurrency(12_000))).toHaveCount(0);

  await account.open();
  await account.waitReady();
  await account.requestCode(address);
  await account.submitCode(await prep.peekLoginCode(address));
  // 첫 기기에서 이미 물었으면 다시 안 묻는다. 여기서는 안 물었으니 뜬다.
  await account.profileSkipButton.click();
  await expect(account.email(address)).toBeVisible();

  // 이제 이 기기는 그 사람이다. 첫 기기의 기록이 홈에 있다.
  await home.open();
  await home.waitReady();
  await expect(home.today.amount(formatCurrency(12_000))).toBeVisible();
});
