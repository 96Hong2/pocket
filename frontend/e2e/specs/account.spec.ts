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

  // 코드를 맞히면 그걸로 끝이다. 뒤에 아무것도 더 묻지 않는다.
  await expect(account.linkedTitle).toBeVisible();
  await expect(account.email(address)).toBeVisible();
  await expect(account.anyDialog).toHaveCount(0);

  const link = await logsNamed(page, 'account_link_result');
  expect(link.map((log) => log.params.result)).toEqual(['sent', 'linked']);
  // 주소는 어느 로그에도 실리지 않는다.
  expect(JSON.stringify(link)).not.toContain(address);
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
    await expect(account.linkedTitle).toBeVisible();
  });
});

/*
  **연령대·성별은 이 화면에 없다.**

  처음 안내 마지막 장에서 한 번 묻고 끝이다. 통계용으로 받아 둔 값을 계정 화면에 다시
  세우면, 가입과 상관없다고 적어 놔도 계정에 딸린 개인정보로 읽힌다. 이 화면이 하는
  이야기는 「기록 지켜 두기」 하나여야 한다.
*/
test('내 계정은 연령대·성별을 보여주지도 묻지도 않는다', async ({ account, prep }) => {
  const address = `e2e-noprofile-${Date.now()}@example.com`;

  await account.open();
  await account.waitReady();
  await expect(account.text('연령대')).toHaveCount(0);
  await expect(account.text('성별')).toHaveCount(0);

  await account.requestCode(address);
  await account.submitCode(await prep.peekLoginCode(address));

  // 붙인 뒤에도 마찬가지다. 예전에는 붙자마자 한 번 물었다.
  await expect(account.linkedTitle).toBeVisible();
  await expect(account.text('연령대')).toHaveCount(0);
  await expect(account.text('성별')).toHaveCount(0);
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
  await expect(account.email(address)).toBeVisible();

  // 이제 이 기기는 그 사람이다. 첫 기기의 기록이 홈에 있다.
  await home.open();
  await home.waitReady();
  await expect(home.today.amount(formatCurrency(12_000))).toBeVisible();
});

test('앞자리만 적고 뒷자리는 눌러서 끝내고, 메일을 안 열어도 코드가 보인다고 알려 준다', async ({
  account,
  prep,
}) => {
  const stamp = Date.now();

  await account.open();
  await account.waitReady();
  await account.linkButton.click();
  await expect(account.linkSheet).toBeVisible();

  // 앞자리를 적기 전에는 고를 것이 없다. 칩은 보이되 눌리지 않는다.
  await expect(account.domainChip('gmail.com')).toBeDisabled();

  await account.emailField.fill(`e2e-chip-${stamp}`);
  await account.domainChip('gmail.com').click();
  await expect(account.emailField).toHaveValue(`e2e-chip-${stamp}@gmail.com`);
  await expect(account.domainChip('gmail.com')).toHaveAttribute('aria-pressed', 'true');

  // 잘못 골랐으면 한 번 더 눌러 고친다. 뒷자리를 갈아 끼우지, 뒤에 또 붙이지 않는다.
  await account.domainChip('naver.com').click();
  await expect(account.emailField).toHaveValue(`e2e-chip-${stamp}@naver.com`);
  await expect(account.domainChip('gmail.com')).toHaveAttribute('aria-pressed', 'false');

  await account.sendButton.click();
  await expect(account.codeField).toBeVisible();

  // 메일을 열지 않아도 되는 것이 이 화면의 핵심이다.
  await expect(account.codeHint).toBeVisible();
  await expect(account.spamHint).toBeVisible();

  const address = `e2e-chip-${stamp}@naver.com`;
  await account.submitCode(await prep.peekLoginCode(address));
  await expect(account.email(address)).toBeVisible();
});
