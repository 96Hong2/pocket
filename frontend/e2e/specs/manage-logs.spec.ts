import { shiftMonth, toLedgerDate } from '../../src/shared/lib/format';
import type { PrepApi } from '../support/api';
import { logsNamed } from '../support/aitMock';
import { expect, test } from '../support/fixtures';

/**
 * 사람이 손수 관리하는 목록에서 **무엇이 로그로 남는가.**
 *
 * 태그·자산·반복 지출·월간 결산 넷은 오래 로그가 비어 있었다. 화면 진입(`screen_view`)만
 * 남아서 **들어왔다는 것까지만** 알고 거기서 무엇을 했는지는 몰랐다. 그러면 「쓰이는
 * 기능인가」 를 판단할 근거가 없어서, 지울지 키울지를 느낌으로 정하게 된다.
 *
 * 특히 태그는 만든 수만으로 판단하면 안 된다. 만들어 놓고 한 번도 안 다는 사람이 있어서
 * `tag_changed` 와 `tag_applied` 를 나란히 놓아야 뜻이 생긴다. 둘 다 여기서 못 박는다.
 *
 * 로그 사본은 개발·샌드박스에서만 창에 쌓인다. 같은 일이 두 번 적히는 판이 있으므로
 * **줄 수를 세지 않고 값의 집합**을 본다.
 */

const TODAY = toLedgerDate(new Date());
const THIS_MONTH = TODAY.slice(0, 7);
const LAST_MONTH = shiftMonth(THIS_MONTH, -1);

interface LogLine {
  params: Record<string, string | number | boolean | undefined>;
}

/** 그 칸에 적힌 값들. 같은 일이 두 번 적혀도 하나로 센다. */
function valuesOf(logs: LogLine[], key: string): Set<string | number | boolean | undefined> {
  return new Set(logs.map((log) => log.params[key]));
}

test('태그는 만든 것과 실제로 단 것이 따로 남는다', async ({ home, page, recordSheet, tags }) => {
  await tags.open();
  await tags.waitReady();
  await tags.create('지출 태그', '출장');

  await test.step('만들었다는 사실이 갈래까지 남는다', async () => {
    const made = await logsNamed(page, 'tag_changed');
    expect(valuesOf(made, 'action')).toEqual(new Set(['created']));
    expect(valuesOf(made, 'kind')).toEqual(new Set(['expense']));
  });

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(12_000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();

  await recordSheet.feedback.tagChip('출장').click();
  await expect(recordSheet.feedback.tagChip('출장')).toHaveAttribute('aria-pressed', 'true');
  // 눌린 것을 다시 누르면 뗀다. 붙인 것과 뗀 것이 갈려야 「달아 놓고 되무른다」 를 본다.
  await recordSheet.feedback.tagChip('출장').click();
  await expect(recordSheet.feedback.tagChip('출장')).toHaveAttribute('aria-pressed', 'false');

  const applied = await logsNamed(page, 'tag_applied');
  expect(valuesOf(applied, 'result')).toEqual(new Set(['attached', 'detached']));
  // 적고 난 직후에 다는 것과 나중에 고치면서 다는 것은 다른 행동이라 자리를 남긴다.
  expect(valuesOf(applied, 'where')).toEqual(new Set(['record']));
});

test('태그를 지우면 몇 건이 표시를 잃는지까지 남는다', async ({
  home,
  page,
  recordSheet,
  tags,
}) => {
  await tags.open();
  await tags.waitReady();
  await tags.create('지출 태그', '출장');

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(8_000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.tagChip('출장').click();
  await expect(recordSheet.feedback.tagChip('출장')).toHaveAttribute('aria-pressed', 'true');
  await recordSheet.closeByEsc();

  await tags.open();
  await tags.waitReady();
  await expect(tags.usageCount('출장')).toHaveText('1건');

  await tags.editButton('출장').click();
  await tags.deleteButton.click();
  await expect(tags.confirmSheet).toBeVisible();
  await tags.confirmDelete.click();
  await expect(tags.group('지출 태그').getByText('출장', { exact: true })).toHaveCount(0);

  const removed = (await logsNamed(page, 'tag_changed')).filter(
    (log) => log.params.action === 'deleted',
  );
  expect(removed, '지운 로그가 없다').not.toHaveLength(0);
  // 한 번도 안 쓴 태그를 지우는 것과 달아 둔 태그를 지우는 것은 다른 일이다.
  expect(valuesOf(removed, 'used')).toEqual(new Set([1]));
});

test('반복 지출은 만들고 끄고 지운 것이 갈려 남는다', async ({ page, recurring }) => {
  await recurring.open();
  await recurring.waitReady();
  await recurring.create({ name: '구독', amount: 9_900, day: 15, remindAt: '09:00' });

  await test.step('알림을 켰는지가 함께 남는다', async () => {
    const made = await logsNamed(page, 'recurring_changed');
    expect(valuesOf(made, 'action')).toEqual(new Set(['created']));
    /*
      「곧 나갈 돈」 카드는 알림을 켠 사람에게만 뜬다. 그 카드의 반응(`recurring_result`)을
      읽으려면 분모가 되는 이 값이 있어야 한다.
    */
    expect(valuesOf(made, 'notify')).toEqual(new Set([true]));
  });

  // 끄는 것은 지우는 것과 다른 뜻이다. 이 항목이 아직 맞는데 지금만 안 알리겠다는 말이다.
  await recurring.toggle('구독').click();
  await expect(recurring.toggle('구독')).not.toBeChecked();

  await recurring.row('구독').getByText('구독', { exact: true }).click();
  await expect(recurring.sheet('반복 지출 고치기')).toBeVisible();
  await recurring.deleteButton.click();
  await recurring.page.getByRole('button', { name: '지우기', exact: true }).click();
  await expect(recurring.row('구독')).toHaveCount(0);

  const all = await logsNamed(page, 'recurring_changed');
  expect(valuesOf(all, 'action')).toEqual(new Set(['created', 'paused', 'deleted']));
});

test('자산은 더하고 고치고 지운 것이 그룹과 함께 남는다', async ({ assets, page }) => {
  await assets.open();
  await assets.waitReady();

  // 한 줄도 없는 화면에는 그룹별 추가 버튼이 아직 없다. 첫 줄은 시작하기로 만든다.
  await assets.start({ group: '예적금·현금', name: '통장', amount: 1_200_000 });
  await assets.edit('통장', { amount: 1_500_000 });
  await assets.remove('통장');

  const changed = await logsNamed(page, 'asset_changed');
  expect(valuesOf(changed, 'action')).toEqual(new Set(['created', 'updated', 'deleted']));
  // 이름도 금액도 안 싣는다. 순자산은 이 앱에서 가장 사적인 숫자다.
  for (const log of changed) {
    expect(Object.keys(log.params)).not.toContain('label');
    expect(Object.keys(log.params)).not.toContain('amount');
  }
});

test('결산은 연 것과 몇 장째에서 닫았는지가 남는다', async ({ page, prep, report }) => {
  await seedClosableMonth(prep);

  await report.open({ month: LAST_MONTH });
  await report.waitReady();
  await report.closing.open();

  expect(await logsNamed(page, 'closing_opened'), '연 로그가 없다').not.toHaveLength(0);

  // 첫 장만 보고 닫는다. 이 자리가 1에 몰리면 카드 수가 아니라 첫 장이 잘못된 것이다.
  await report.closing.closeButton.click();
  await expect(report.closing.overlay).toHaveCount(0);

  const closed = await logsNamed(page, 'closing_closed');
  expect(valuesOf(closed, 'page')).toEqual(new Set([1]));
  expect(valuesOf(closed, 'finished')).toEqual(new Set([false]));
});

test('결산을 끝까지 넘겨 닫으면 다 봤다고 남는다', async ({ page, prep, report }) => {
  await seedClosableMonth(prep);

  await report.open({ month: LAST_MONTH });
  await report.waitReady();
  await report.closing.open();

  const total = await report.closing.dots.count();
  for (let step = 1; step < total; step += 1) {
    await report.closing.nextButton.click();
  }
  await report.closing.doneButton.click();
  await expect(report.closing.overlay).toHaveCount(0);

  const closed = await logsNamed(page, 'closing_closed');
  expect(valuesOf(closed, 'page')).toEqual(new Set([total]));
  expect(valuesOf(closed, 'finished')).toEqual(new Set([true]));
});

/** 결산 입구가 서려면 끝난 달에 기록이 있어야 한다. 여기서는 최소만 심는다. */
async function seedClosableMonth(prep: PrepApi): Promise<void> {
  const byName = await prep.categoryIds();
  const food = byName.get('식비');
  expect(food, '식비 분류를 찾지 못했다').toBeDefined();
  await prep.addTransaction({ amount: 30_000, on: `${LAST_MONTH}-05`, categoryId: food });
}
