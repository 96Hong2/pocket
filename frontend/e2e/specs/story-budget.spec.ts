import { formatCurrency } from '../../src/shared/lib/format';
import { logsNamed } from '../support/aitMock';
import { expect, test } from '../support/fixtures';

/**
 * 예산을 정하고 지우는 자리에서 **되돌릴 수 없는 일과 안 보이는 일.**
 *
 * 세 가지를 본다.
 * 1. 「예산 지우기」가 한 번 묻는가. 카테고리 한도가 딸려 사라진다는 것을 그 자리에서 말하는가.
 * 2. 예산을 어디서 정했는지가 로그에 남는가. 앱 설정 쪽 입구를 더 밀지 말지를 그 숫자로 정한다.
 * 3. 이미 한도를 정한 카테고리가 추가 시트의 칩에서 빠지는가. 두 번 고르면 앞 값이 소리 없이 덮인다.
 *
 * 첫 번째는 지금 제품이 묻지 않아서 빨갛다. 고치기 전까지 빨간 채로 둔다.
 */

const BUDGET = 600_000;
const FOOD_CAP = 200_000;
const TRANSPORT_CAP = 100_000;

test('예산 지우기는 한 번 묻고, 카테고리 한도도 함께 사라진다고 말한다', async ({
  manage,
  prep,
}) => {
  const food = await prep.categoryIdByName('식비');
  const transport = await prep.categoryIdByName('교통');
  await prep.setBudget(BUDGET);
  await prep.setCategoryBudget(food, FOOD_CAP);
  await prep.setCategoryBudget(transport, TRANSPORT_CAP);

  await manage.open();
  await manage.waitReady();
  await expect(manage.total.amount).toHaveText(formatCurrency(BUDGET));
  await expect(manage.categories.rows).toHaveCount(2);

  await manage.total.deleteButton.click();

  /*
    확인을 먼저 못 박는다. 이 줄이 없으면 **바로 지워진** 경우에도 뒤의 단언이
    "없어진 것을 확인" 하는 모양이 되어 통과할 수 있다.
  */
  await expect(manage.total.deleteConfirm).toBeVisible();
  // 문구까지 못 박지는 않는다. 딸려 사라지는 것을 이름으로 말하는지만 본다.
  await expect(manage.total.deleteConfirm).toContainText('카테고리');

  // 아직 아무것도 안 지워졌다.
  await expect(manage.total.amount).toHaveText(formatCurrency(BUDGET));
  await expect(manage.categories.rows).toHaveCount(2);

  await manage.total.keepButton.click();
  await expect(manage.total.deleteConfirm).toHaveCount(0);
  await expect(manage.total.amount).toHaveText(formatCurrency(BUDGET));
  await expect(manage.categories.cap('식비')).toHaveText(formatCurrency(FOOD_CAP));

  // 한 번 더 눌러야 그때 지워진다.
  await manage.total.deleteButton.click();
  await manage.total.confirmDeleteButton.click();

  await expect(manage.total.emptyTitle).toBeVisible();
  // 전체 예산이 없으면 카테고리 한도를 붙일 자리도 사라진다.
  await expect(manage.categories.addButton).toHaveCount(0);
});

test('예산을 지웠다 다시 정해도 카테고리 한도는 돌아오지 않는다', async ({ manage, prep }) => {
  const food = await prep.categoryIdByName('식비');
  const transport = await prep.categoryIdByName('교통');
  await prep.setBudget(BUDGET);
  await prep.setCategoryBudget(food, FOOD_CAP);
  await prep.setCategoryBudget(transport, TRANSPORT_CAP);
  // 지우는 길은 화면이든 API 든 같은 하나다. 여기서 보려는 것은 지운 뒤에 다시 정했을 때다.
  await prep.deleteBudget();

  await manage.open();
  await manage.waitReady();
  await expect(manage.total.emptyTitle).toBeVisible();

  await manage.total.start(BUDGET);
  await expect(manage.total.amount).toHaveText(formatCurrency(BUDGET));

  // 전체 예산만 돌아온다. 앞서 정해 둔 두 줄은 되살아나지 않는다.
  await expect(manage.categories.rows).toHaveCount(0);
  await expect(manage.categories.countBadge).toHaveText('0개');
  await expect(manage.categories.row('식비')).toHaveCount(0);
  await expect(manage.categories.row('교통')).toHaveCount(0);
});

test('앱 설정에서 정한 예산은 그 자리에서 정했다고 남는다', async ({ page, settings }) => {
  await settings.open();
  await settings.waitReady();
  await settings.chooseHero('남은 예산');

  // 예산이 없어 그 갈래가 성립하지 않는 사람에게만 서는 입구다.
  await expect(settings.budgetButton).toBeVisible();
  await settings.setBudget(500_000);
  await expect(settings.budgetButton).toHaveCount(0);

  /*
    이 입구를 더 밀지 말지를 이 숫자로 정한다. 값이 안 실려 나가면 0 으로 보이고,
    팀은 아무도 안 쓴다고 읽어 입구를 지운다.
    개발 판은 효과를 두 번 부르므로 줄 수는 못 박지 않는다. 값이 한 가지인 것만 본다.
  */
  const saved = await logsNamed(page, 'budget_saved');
  expect(saved.length).toBeGreaterThan(0);
  expect(new Set(saved.map((log) => `${log.params.first}/${log.params.from}`))).toEqual(
    new Set(['true/settings']),
  );
});

test('관리 탭에서 처음 정한 것과 고친 것이 로그에서 갈린다', async ({ manage, page }) => {
  await manage.open();
  await manage.waitReady();

  await manage.total.start(BUDGET);
  await expect(manage.total.amount).toHaveText(formatCurrency(BUDGET));

  const first = await logsNamed(page, 'budget_saved');
  expect(first.length).toBeGreaterThan(0);
  expect(new Set(first.map((log) => `${log.params.first}/${log.params.from}`))).toEqual(
    new Set(['true/sheet']),
  );

  await manage.total.edit(900_000);
  await expect(manage.total.amount).toHaveText(formatCurrency(900_000));

  // 고친 것은 처음이 아니다. 앞서 찍힌 줄을 빼고 이번에 더해진 것만 본다.
  const added = (await logsNamed(page, 'budget_saved')).slice(first.length);
  expect(added.length).toBeGreaterThan(0);
  expect(new Set(added.map((log) => `${log.params.first}/${log.params.from}`))).toEqual(
    new Set(['false/sheet']),
  );
});

test('카테고리 예산 추가는 이미 한도를 정한 카테고리를 칩에서 뺀다', async ({ manage, prep }) => {
  const food = await prep.categoryIdByName('식비');
  await prep.setBudget(BUDGET);
  await prep.setCategoryBudget(food, FOOD_CAP);

  await manage.open();
  await manage.waitReady();
  await expect(manage.categories.cap('식비')).toHaveText(formatCurrency(FOOD_CAP));

  await manage.categories.addButton.click();
  await manage.categories.sheet.waitOpen();

  // 여기 식비가 또 있으면, 고르는 순간 앞서 정한 20만원이 경고 없이 덮인다.
  await expect(manage.categories.sheet.categoryChip('식비')).toHaveCount(0);
  await expect(manage.categories.sheet.categoryChip('교통')).toBeVisible();

  await manage.categories.sheet.pick('교통');
  await manage.categories.sheet.save(TRANSPORT_CAP);
  await expect(manage.categories.rows).toHaveCount(2);

  // 방금 정한 것도 다음 시트에서 빠져 있다.
  await manage.categories.addButton.click();
  await manage.categories.sheet.waitOpen();
  await expect(manage.categories.sheet.categoryChip('식비')).toHaveCount(0);
  await expect(manage.categories.sheet.categoryChip('교통')).toHaveCount(0);
  await expect(manage.categories.sheet.categoryChip('쇼핑')).toBeVisible();
  await manage.categories.sheet.dismiss();
});

test('지출 카테고리에 모두 한도를 정하면 왜 빈지 말하고 닫을 길을 준다', async ({
  manage,
  prep,
}) => {
  await prep.setBudget(BUDGET);

  await manage.open();
  await manage.waitReady();
  await manage.categories.addButton.click();
  await manage.categories.sheet.waitOpen();

  // 고를 수 있는 것을 화면에서 그대로 받아 온다. 기본 카테고리 목록을 여기 다시 적지 않는다.
  const pickable = await manage.categories.sheet.chipNames();
  expect(pickable).toContain('식비');
  await manage.categories.sheet.dismiss();

  for (const name of pickable) {
    await prep.setCategoryBudget(await prep.categoryIdByName(name), 10_000);
  }

  await manage.open();
  await manage.waitReady();
  await expect(manage.categories.rows).toHaveCount(pickable.length);

  await manage.categories.addButton.click();
  await manage.categories.sheet.waitOpen();

  // 칩도 저장도 없는 빈 시트만 남으면 사용자는 화면이 고장 난 것으로 읽는다.
  await expect(manage.categories.sheet.picker).toHaveCount(0);
  await expect(manage.categories.sheet.saveButton).toHaveCount(0);
  await expect(manage.categories.sheet.emptyNotice).toBeVisible();

  await manage.categories.sheet.closeButton.click();
  await manage.categories.sheet.waitClosed();
});
