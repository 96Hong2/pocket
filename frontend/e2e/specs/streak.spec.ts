import { streakLine } from '../../src/features/share/shareText';
import { findForbiddenWords } from '../../src/shared/lib/forbiddenWords';
import { logsNamed, readShares } from '../support/aitMock';
import type { PrepApi } from '../support/api';
import { expect, test } from '../support/fixtures';

/**
 * 7일을 이어서 적으면 홈 맨 앞에 축하가 한 장 뜬다.
 *
 * 여기서 지키는 것 넷이다.
 * **7일을 채운 그 순간에 뜬다**(엿새까지는 아무 말도 안 한다), **적은 결과를 덮지 않는다**
 * (시트가 닫힌 뒤에 뜬다), **한 번 본 축하는 다시 안 뜬다**, **끊긴 것은 말하지 않는다**.
 */

/** `from` 일 전부터 `to` 일 전까지 하루 한 건씩 심는다. 날짜는 가계부 시간대로 센다. */
async function seedDays(prep: PrepApi, from: number, to = 0): Promise<void> {
  for (let daysAgo = to; daysAgo <= from; daysAgo += 1) {
    await prep.addTransaction({ amount: 5_000, daysAgo, merchant: `가게${daysAgo}` });
  }
}

test('엿새까지는 아무 말도 안 한다. 몇 일째인지 세어 보여 주지 않는다', async ({
  home,
  page,
  prep,
}) => {
  await seedDays(prep, 5);

  await home.open();
  await home.waitReady();

  await expect(home.streak.dialog).toHaveCount(0);
  // 「6일째」 같은 중간 숫자가 어디에도 안 보여야 한다. 보이면 끊기는 날 그게 0 으로 돌아간다.
  await expect(page.getByText(/\d+일째/)).toHaveCount(0);
  expect(await logsNamed(page, 'streak_celebrated')).toEqual([]);
});

test('오늘 7일째를 적으면, 결과를 본 뒤 시트가 닫히고 나서 맨 앞에 축하가 뜬다', async ({
  home,
  page,
  prep,
  recordSheet,
}) => {
  // 어제까지 엿새. 오늘 한 건이 일곱째 날이다.
  await seedDays(prep, 6, 1);

  await home.open();
  await home.waitReady();
  await expect(home.streak.dialog).toHaveCount(0);

  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(4_500);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();

  // 서버 값은 이미 7 이다. 그래도 방금 적은 것의 결과 위로 덮지 않는다.
  await expect(recordSheet.feedback.headline).toBeVisible();
  await expect(home.streak.dialog).toHaveCount(0);

  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await home.streak.waitOpen();
  await expect(home.streak.dialog).toHaveAccessibleName('7일 연속 기록');
  await expect(home.streak.lead).toHaveText('축하합니다!');
  await expect(home.streak.milestone).toHaveText('일주일을 다 채웠어요');
  await expect(home.streak.shareButton).toBeVisible();

  const shown = await logsNamed(page, 'streak_celebrated');
  expect(shown.map((log) => log.params.days)).toEqual([7]);
});

test('한 번 본 축하는 다시 안 뜬다. 다시 열어도 마찬가지다', async ({ home, page, prep }) => {
  await seedDays(prep, 6);

  await home.open();
  await home.waitReady();
  await home.streak.waitOpen();

  // 축하에도 탓하는 말이 섞이면 안 된다. 화면에 실제로 찍힌 글자로 본다.
  expect(findForbiddenWords((await home.streak.dialog.innerText()) ?? '')).toEqual([]);

  // 카드 안에서 닫는 버튼은 없다. 닫는 길은 오른쪽 위 ✕ 하나다.
  await expect(home.streak.dialog.getByRole('button', { name: '좋아요' })).toHaveCount(0);

  await home.streak.closeButton.click();
  await home.streak.waitClosed();

  // 주소로 다시 열면 화면이 통째로 새로 뜬다. 기기에 남긴 표가 없으면 여기서 다시 뜬다.
  await home.open();
  await home.waitReady();
  await expect(home.recordButton).toBeVisible();
  await expect(home.streak.dialog).toHaveCount(0);
  expect((await logsNamed(page, 'streak_celebrated')).length).toBeLessThanOrEqual(1);
});

test('✕ 로도 닫히고, 2주를 채우면 그 주의 축하가 새로 뜬다', async ({ home, prep }) => {
  await seedDays(prep, 13);

  await home.open();
  await home.waitReady();
  await home.streak.waitOpen();

  // 7일째 축하를 못 봤어도 지금 닿은 것은 2주다. 지난 축하를 줄 세워 틀지 않는다.
  await expect(home.streak.dialog).toHaveAccessibleName('14일 연속 기록');
  await expect(home.streak.milestone).toHaveText('2주를 다 채웠어요');

  await home.streak.closeButton.click();
  await home.streak.waitClosed();
});

/**
 * 축하를 닫으면 이메일로 지켜 두겠냐고 한 번 묻는다.
 *
 * 일주일치를 쌓아 둔 사람이 방금 그걸 잘했다는 말을 들은 참이라, 이 앱에서 계정을 권할 수
 * 있는 거의 유일한 순간이다. 그 자리에서 이메일 칸까지 바로 열려야 한다.
 */
test('축하를 닫으면 이메일로 지켜 두겠냐고 묻고, 거기서 바로 칸이 열린다', async ({
  home,
  page,
  prep,
}) => {
  await seedDays(prep, 6);

  await home.open();
  await home.waitReady();
  await home.streak.waitOpen();
  await home.streak.closeButton.click();
  await home.streak.waitClosed();

  const ask = page.getByRole('dialog', { name: '기록을 안전하게' });
  await expect(ask).toBeVisible();
  await expect(ask.getByText('이메일을 등록하면 내 기록을 안전하게 저장할 수 있어요!')).toBeVisible();

  await ask.getByRole('button', { name: '이메일 등록하기' }).click();

  // 관리 탭으로 보내지 않는다. 방금 받은 축하가 식기 전에 그 자리에서 적게 한다.
  await expect(page.getByRole('dialog', { name: '이메일로 지켜 두기' })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');
});

/*
  **시스템 뒤로가기가 이 창을 닫아야 한다.**

  홈은 탭 뿌리라, 떠 있는 창이 뒤로가기를 안 가져가면 창은 그대로 있고 미니앱이 통째로
  닫힌다. 바텀시트는 스스로 등록하지 않으므로 여는 쪽이 매번 걸어야 한다.
*/
test('이메일을 권하는 창은 시스템 뒤로가기로 닫힌다', async ({ appShell, home, page, prep }) => {
  await seedDays(prep, 6);

  await home.open();
  await home.waitReady();
  await home.streak.waitOpen();
  await home.streak.closeButton.click();

  const ask = page.getByRole('dialog', { name: '기록을 안전하게' });
  await expect(ask).toBeVisible();

  await appShell.pressBack();
  await expect(ask).toHaveCount(0);
  await expect(home.recordButton).toBeVisible();
});

test('공유하면 금액 없이 꾸준히 적었다는 말만 나간다', async ({ home, page, prep }) => {
  await seedDays(prep, 6);

  await home.open();
  await home.waitReady();
  await home.streak.waitOpen();
  await home.streak.shareButton.click();

  await expect.poll(() => readShares(page)).toHaveLength(1);
  const [sent] = await readShares(page);
  expect(sent.message).toBe(streakLine(7));
  expect(sent.message).not.toMatch(/\d{1,3}(,\d{3})*원/);

  await expect.poll(() => logsNamed(page, 'share_result')).toHaveLength(1);
  const [log] = await logsNamed(page, 'share_result');
  expect([log.params.where, log.params.kind, log.params.result]).toEqual(['streak', 'streak', 'ok']);
});
