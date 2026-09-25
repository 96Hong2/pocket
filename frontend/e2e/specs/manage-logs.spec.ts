import { shiftMonth, toLedgerDate } from '../../src/shared/lib/format';
import { LeaveConfirmArea } from '../screens/RecordSheet';
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
 * 로그 사본은 개발·샌드박스에서만 창에 쌓인다.
 *
 * **여기서는 줄 수도 센다.** 값의 집합만 보면 같은 로그가 두 번 나가도 통과한다. 이번
 * 회차가 새로 건 장치 중 하나가 StrictMode 이중 실행을 막는 것(`ClosingOverlay` 의
 * `opened` ref)이라, 개수를 안 세면 그 장치가 사라져도 아무도 모른다.
 */

const TODAY = toLedgerDate(new Date());
const THIS_MONTH = TODAY.slice(0, 7);
const LAST_MONTH = shiftMonth(THIS_MONTH, -1);
const TWO_MONTHS_AGO = shiftMonth(THIS_MONTH, -2);

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
    // 한 번 만들었으면 한 줄이다. 두 줄이면 만든 사람 수가 두 배로 보인다.
    expect(made).toHaveLength(1);
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

  /*
    붙이고 뗐으니 정확히 두 줄이다. 칩을 누른 순간이 아니라 서버가 받아 준 뒤에
    한 번씩 나간다. 순서까지 본다. 집합만 보면 순서가 뒤집혀도 통과한다.
  */
  const applied = await logsNamed(page, 'tag_applied');
  expect(applied.map((log) => log.params.result)).toEqual(['attached', 'detached']);
  // 적고 난 직후에 다는 것과 나중에 고치면서 다는 것은 다른 행동이라 자리를 남긴다.
  expect(valuesOf(applied, 'where')).toEqual(new Set(['record']));
  expect(valuesOf(applied, 'kind')).toEqual(new Set(['expense']));
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
  expect(removed, '지운 로그가 한 줄이 아니다').toHaveLength(1);
  // 한 번도 안 쓴 태그를 지우는 것과 달아 둔 태그를 지우는 것은 다른 일이다.
  expect(valuesOf(removed, 'used')).toEqual(new Set([1]));
});

test('반복 지출은 만들고 끄고 지운 것이 갈려 남는다', async ({ page, recurring }) => {
  await recurring.open();
  await recurring.waitReady();
  await recurring.create({ name: '구독', amount: 9_900, day: 15, remindAt: '09:00' });

  await test.step('알림이 어떻게 걸렸는지가 함께 남는다', async () => {
    const made = await logsNamed(page, 'recurring_changed');
    expect(made).toHaveLength(1);
    expect(valuesOf(made, 'action')).toEqual(new Set(['created']));
    /*
      **시각을 비운 것은 「안 알림」 이 아니다.** 기록 알림 시각을 따르겠다는 뜻이고 그게
      새로 만들 때의 기본값이다. 둘을 하나로 뭉치면 만든 사람 대부분이 「알림 끔」 으로
      찍혀서, 「곧 나갈 돈」 카드의 분모가 통째로 틀린다. 여기서는 09:00 을 따로 골랐다.
    */
    expect(valuesOf(made, 'at')).toEqual(new Set(['custom']));
    /*
      앱 알림 자체는 꺼져 있다(검사 환경의 기본값). 시각을 골라도 아무 일이 안 나는
      상태라, 이 조합이야말로 따로 세어야 하는 것이다. 예고를 걸어 두고도 카드가 한 번도
      안 뜨는 사람이 여기서 드러난다.
    */
    expect(valuesOf(made, 'enabled')).toEqual(new Set([false]));
    // `recurring_result` 와 같은 낱말이라야 두 표를 나란히 놓고 볼 수 있다.
    expect(valuesOf(made, 'lead')).toEqual(new Set(['today']));
  });

  // 끄는 것은 지우는 것과 다른 뜻이다. 이 항목이 아직 맞는데 지금만 안 알리겠다는 말이다.
  await recurring.toggle('구독').click();
  await expect(recurring.toggle('구독')).not.toBeChecked();

  await recurring.row('구독').getByText('구독', { exact: true }).click();
  await expect(recurring.sheet('반복 지출 고치기')).toBeVisible();
  await recurring.deleteButton.click();
  await recurring.page.getByRole('button', { name: '지우기', exact: true }).click();
  await expect(recurring.row('구독')).toHaveCount(0);

  /*
    끈 것은 서버가 받아 준 뒤에만 센다. 순서까지 본다. 껐다 켜기를 오가는 사람을
    세는 값이라, 순서가 흔들리면 그 숫자가 뜻을 잃는다.
  */
  const all = await logsNamed(page, 'recurring_changed');
  expect(all.map((log) => log.params.action)).toEqual(['created', 'paused', 'deleted']);
});

test('자산은 더하고 고치고 지운 것이 그룹과 함께 남는다', async ({ assets, page }) => {
  await assets.open();
  await assets.waitReady();

  // 한 줄도 없는 화면에는 그룹별 추가 버튼이 아직 없다. 첫 줄은 시작하기로 만든다.
  await assets.start({ group: '예적금·현금', name: '통장', amount: 1_200_000 });
  await assets.edit('통장', { amount: 1_500_000 });
  await assets.remove('통장');

  const changed = await logsNamed(page, 'asset_changed');
  expect(changed.map((log) => log.params.action)).toEqual(['created', 'updated', 'deleted']);
  // 지운 줄의 그룹은 폼에서 무엇을 눌렀든 저장돼 있던 그룹이다.
  expect(valuesOf(changed, 'group')).toEqual(new Set(['cash']));
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

  /*
    **정확히 한 줄이다.** 개발 모드는 효과를 두 번 돌려서, 막는 장치가 없으면 결산을
    한 번 열어도 두 번 찍힌다. 집합만 보면 그게 안 잡힌다.
  */
  expect(await logsNamed(page, 'closing_opened'), '연 로그가 한 줄이 아니다').toHaveLength(1);

  // 첫 장만 보고 닫는다. 이 자리가 1에 몰리면 카드 수가 아니라 첫 장이 잘못된 것이다.
  await report.closing.closeButton.click();
  await expect(report.closing.overlay).toHaveCount(0);

  const closed = await logsNamed(page, 'closing_closed');
  expect(closed).toHaveLength(1);
  expect(closed[0].params.page).toBe(1);
  expect(closed[0].params.finished).toBe(false);
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
  expect(closed).toHaveLength(1);
  expect(closed[0].params.page).toBe(total);
  expect(closed[0].params.finished).toBe(true);
});

test('고치기 시트에서는 눌러 놓고 닫으면 달았다고 세지 않는다', async ({
  calendar,
  page,
  prep,
  tags,
}) => {
  await tags.open();
  await tags.waitReady();
  await tags.create('지출 태그', '데이트');

  await prep.addTransaction({ amount: 12_000, merchant: '영화관' });

  await calendar.open();
  await calendar.waitReady();

  await test.step('눌렀다가 그냥 닫으면 아무것도 안 남는다', async () => {
    await calendar.list.pick('영화관');
    await calendar.edit.waitOpen();
    await calendar.edit.tagChip('데이트').click();
    // 완료를 안 눌렀다. 이 시트에서는 칩을 눌러도 아직 아무것도 안 붙는다.
    // 다만 고친 것이 있으니 나가기 전에 한 번 묻는다.
    await page.keyboard.press('Escape');
    await new LeaveConfirmArea(page).leaveButton.click();
    await calendar.edit.waitClosed();
    expect(await logsNamed(page, 'tag_applied'), '안 붙었는데 붙었다고 셌다').toHaveLength(0);
  });

  await calendar.list.pick('영화관');
  await calendar.edit.waitOpen();
  await calendar.edit.tagChip('데이트').click();
  await calendar.edit.done();

  const applied = await logsNamed(page, 'tag_applied');
  expect(applied).toHaveLength(1);
  expect(applied[0].params.where).toBe('edit');
  expect(applied[0].params.result).toBe('attached');
});

test('결산에서 예산 화면으로 빠져나가도 닫힘이 남는다', async ({ page, prep, report }) => {
  // 마지막 장의 링크는 권할 것이 있을 때만 선다. 지난달에 늘어난 분류를 만들어 둔다.
  await seedClosableMonth(prep);
  await seedGrownCategory(prep);

  await report.open({ month: LAST_MONTH });
  await report.waitReady();
  await report.closing.open();

  const total = await report.closing.dots.count();
  for (let step = 1; step < total; step += 1) {
    await report.closing.nextButton.click();
  }

  /*
    마지막 장에만 서는 링크라, 여기가 안 남으면 **끝까지 본 사람만** 표에서 빠진다.
    남은 표가 「첫 장에서 닫는다」 쪽으로 기울어 잘못된 결론을 부른다.
  */
  await expect(report.closing.budgetLink).toBeVisible();
  await report.closing.budgetLink.click();
  await expect(report.closing.overlay).toHaveCount(0);

  const closed = await logsNamed(page, 'closing_closed');
  expect(closed).toHaveLength(1);
  expect(closed[0].params.finished).toBe(true);
});

/** 결산 입구가 서려면 끝난 달에 기록이 있어야 한다. 여기서는 최소만 심는다. */
async function seedClosableMonth(prep: PrepApi): Promise<void> {
  const byName = await prep.categoryIds();
  const food = byName.get('식비');
  expect(food, '식비 분류를 찾지 못했다').toBeDefined();
  await prep.addTransaction({ amount: 30_000, on: `${LAST_MONTH}-05`, categoryId: food });
}

/**
 * 지지난달보다 크게 늘어난 분류 하나.
 *
 * 마지막 장의 「예산 화면으로」 는 권할 것이 있을 때만 선다. 견줄 앞 달이 없으면
 * 결산이 변화를 지어내지 않기 때문에, 두 달치를 함께 심어야 한다.
 */
async function seedGrownCategory(prep: PrepApi): Promise<void> {
  const byName = await prep.categoryIds();
  const cafe = byName.get('카페·간식');
  expect(cafe, '카페·간식 분류를 찾지 못했다').toBeDefined();
  await prep.addTransaction({ amount: 20_000, on: `${TWO_MONTHS_AGO}-06`, categoryId: cafe });
  await prep.addTransaction({ amount: 90_000, on: `${LAST_MONTH}-06`, categoryId: cafe });
}
