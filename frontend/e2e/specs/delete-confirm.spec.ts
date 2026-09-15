import { logsNamed } from '../support/aitMock';
import { expect, test } from '../support/fixtures';

/**
 * 내역 지우기는 **한 번 묻는다.**
 *
 * 이 앱에서 되돌릴 수 없는 동작은 둘뿐이다. 앱 데이터 초기화와 기록 하나 지우기.
 * 앞의 것은 이미 동의 칸까지 두고 있었는데, 뒤의 것은 수정 시트 왼쪽 버튼 한 번이면
 * 끝이었다. 「완료」 바로 옆이라 손이 미끄러지기 쉬운 자리다.
 *
 * 대신 **시트를 하나 더 겹치지 않는다.** 화면에 dialog 가 둘이 되면 뒤로가기가 어느
 * 것을 닫는지 흔들린다. 버튼 줄 자체가 물음으로 바뀌고, 위쪽 칸은 그대로 보인다.
 */

test('삭제를 눌러도 바로 안 지우고, 한 번 더 눌러야 지운다', async ({ calendar, page, prep }) => {
  await prep.addTransaction({ amount: 12_000, daysAgo: 0, merchant: '지울 것' });

  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('지울 것');
  await calendar.edit.waitOpen();

  await calendar.edit.deleteButton.click();

  // 아직 안 지워졌다. 시트도 그대로 열려 있고, 무엇을 지우려는지 위에 보인다.
  await expect(calendar.edit.deleteConfirm).toBeVisible();
  await expect(calendar.edit.title).toBeVisible();
  await expect(calendar.edit.merchant).toHaveValue('지울 것');

  await calendar.edit.confirmDeleteButton.click();
  await calendar.edit.waitClosed();
  await expect(calendar.list.row('지울 것')).toHaveCount(0);

  // 물었고, 실제로 지웠다. 둘 다 남아야 이 물음이 값어치가 있는지 나중에 잰다.
  const changed = await logsNamed(page, 'record_changed');
  expect(changed.map((log) => log.params.action)).toEqual(['delete_asked', 'delete']);
});

test('그대로 둘래요를 누르면 기록이 남고 고치던 값도 살아 있다', async ({
  calendar,
  page,
  prep,
}) => {
  await prep.addTransaction({ amount: 8000, daysAgo: 0, merchant: '살릴 것' });

  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('살릴 것');
  await calendar.edit.waitOpen();

  // 고치던 중에 잘못 눌렀다. 물음에서 빠져나오면 고친 값이 그대로 있어야 한다.
  await calendar.edit.merchant.fill('고치던 이름');
  await calendar.edit.deleteButton.click();
  await calendar.edit.keepButton.click();

  await expect(calendar.edit.deleteConfirm).toHaveCount(0);
  await expect(calendar.edit.merchant).toHaveValue('고치던 이름');

  await calendar.edit.done();
  await expect(calendar.list.row('고치던 이름')).toBeVisible();

  const changed = await logsNamed(page, 'record_changed');
  expect(changed.map((log) => log.params.action)).toEqual([
    'delete_asked',
    'delete_cancelled',
    'edit',
  ]);
});

test('묻는 동안에는 완료가 사라져 손이 미끄러질 자리가 없다', async ({ calendar, prep }) => {
  await prep.addTransaction({ amount: 3000, daysAgo: 0, merchant: '한 건' });

  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('한 건');
  await calendar.edit.waitOpen();

  await calendar.edit.deleteButton.click();
  /*
    시트가 아직 열려 있는 것을 먼저 못 박는다. 이 줄이 없으면 **바로 지워져 시트가 닫힌**
    경우에도 버튼이 0개라 이 확인이 통과한다. 일부러 깨뜨려 보고 알았다.
  */
  await expect(calendar.edit.deleteConfirm).toBeVisible();
  // 물음이 뜬 동안 원래 버튼 줄은 없다. 같은 자리에 두 벌이 서면 어느 것이 지금 것인지 모른다.
  await expect(calendar.edit.doneButton).toHaveCount(0);
  await expect(calendar.edit.deleteButton).toHaveCount(0);
});
