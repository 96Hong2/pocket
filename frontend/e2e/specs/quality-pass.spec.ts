import { formatCurrency } from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';

/**
 * 손으로 써 보고 걸린 것들.
 *
 * 화면을 만들고 나서야 보이는 종류다. 기능은 도는데 읽기 어렵거나, 갈 수 있어야 하는 곳으로
 * 못 가거나, 종류가 화면에 안 드러나는 것. 마일스톤과 섞지 않고 여기 모아 둔다.
 */

const CATEGORY = '식비';
const BUDGET = 500_000;

// ── 홈에서 바로 고치기 ──────────────────────────────────

test('홈의 오늘 목록에서 한 줄을 눌러 그 자리에서 고친다', async ({ home, prep, recordSheet }) => {
  await test.step('오늘 지출을 하나 심는다', async () => {
    const foodId = await prep.categoryIdByName(CATEGORY);
    await prep.addTransaction({ amount: 12_000, merchant: '김밥천국', categoryId: foodId });
  });

  await home.open();
  await home.waitReady();
  await expect(home.today.row('김밥천국')).toBeVisible();

  // 눌러서 고치는 길이 달력 안에만 있으면, 고치려고 화면을 셋 지나야 한다.
  await home.today.row('김밥천국').click();
  await home.edit.waitOpen();

  await expect(home.edit.merchant).toHaveValue('김밥천국');
  await home.edit.merchant.fill('백반집 이모네');
  await home.edit.doneButton.click();
  await home.edit.waitClosed();

  // 목록이 그 자리에서 바뀐다. 다시 불러오지 않는다.
  await expect(home.today.row('백반집 이모네')).toBeVisible();
  await expect(home.today.row('김밥천국')).toHaveCount(0);

  // 고치기 시트가 기록 시트를 건드리지 않아야 한다.
  await recordSheet.waitClosed();
});

// ── 홈에서 예산으로 가기 ────────────────────────────────

test('홈의 예산 숫자를 누르면 관리 탭의 예산으로 간다', async ({
  appShell,
  home,
  manage,
  prep,
}) => {
  await prep.setBudget(BUDGET);

  await home.open();
  await home.waitReady();
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET));

  // 숫자를 보고 고쳐야겠다고 생각하는 자리가 여기다. 그때 갈 길이 없으면 그냥 지나간다.
  await home.hero.budgetLink.click();

  await appShell.expectScreen('관리', '예산과 분류를 손봐요');
  await expect(manage.total.amount).toHaveText(formatCurrency(BUDGET));
});

test('예산을 안 정했으면 그 입구가 아예 없다', async ({ home }) => {
  await home.open();
  await home.waitReady();

  // 갈 곳이 없는 링크를 두면 눌러 보고 나서야 없다는 것을 안다.
  await expect(home.hero.budgetLink).toHaveCount(0);
});

// ── 줄글에서 수입 ───────────────────────────────────────

test('금액 앞에 +를 붙이면 수입으로 읽고 수입 분류까지 고른다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.methodTab('줄글').click();

  await recordSheet.nl.analyze('알바비 +150000 점심 9000');

  await test.step('+ 가 붙은 것만 수입이다', async () => {
    // 종류를 글자로 말해 주지 않아도 부호와 색으로 갈린다.
    await expect(recordSheet.nl.amount('알바비')).toHaveText('+150,000원');
    await expect(recordSheet.nl.amount('점심')).toHaveText('9,000원');

    const income = await recordSheet.nl.amountColor('알바비');
    const expense = await recordSheet.nl.amountColor('점심');
    expect(income, '수입과 지출이 같은 색이다').not.toBe(expense);
  });

  await test.step('수입에도 분류가 붙는다', async () => {
    // 여기가 '분류 없음' 이면 수입은 리포트에서 영영 한 덩어리다.
    await expect(recordSheet.nl.row('알바비')).toContainText('월급');
    await expect(recordSheet.nl.row('알바비')).not.toContainText('분류 없음');
  });

  await test.step('저장하면 홈이 수입으로 센다', async () => {
    await recordSheet.nl.save();
    await recordSheet.nl.confirmButton.click();
    await recordSheet.waitClosed();

    await expect(home.today.row('알바비')).toBeVisible();
    await expect(home.today.amount('+150,000원')).toBeVisible();
  });
});

test('검토 화면에서 수입으로 바꾸면 수입 분류를 고를 수 있다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.methodTab('줄글').click();

  await recordSheet.nl.analyze('용돈 30000');
  // 말버릇으로는 수입이 되지만, 종류를 손으로 바꿔도 분류가 따라와야 한다.
  await recordSheet.nl.openEdit('용돈');
  await recordSheet.nl.form.typeTab('지출').click();

  // 지출로 바꾸면 지출 분류가 보인다.
  await expect(recordSheet.nl.form.categoryChip(CATEGORY)).toBeVisible();

  await recordSheet.nl.form.typeTab('수입').click();
  // 다시 수입으로 오면 수입 분류가 보인다. 예전에는 여기서 분류 칸이 통째로 사라졌다.
  await expect(recordSheet.nl.form.categoryChip('용돈')).toBeVisible();
  await expect(recordSheet.nl.form.categoryChip(CATEGORY)).toHaveCount(0);
});

// ── 날짜 칸 ────────────────────────────────────────────

/**
 * 날짜 칸이 자기 자리를 넘지 않는지.
 *
 * iOS 는 안쪽 값 영역의 최소 너비를 칸의 최소 너비로 삼아 `width: 100%` 를 무시하고
 * 부모를 밀고 나간다. 실기기 영수증 화면에서 날짜 칸이 카드 밖으로 삐져나온 자리다.
 * 눈으로만 보면 "왜 이상하지" 로 끝나므로 숫자로 못 박는다.
 */
async function overflowOf(field: import('@playwright/test').Locator): Promise<number> {
  return field.evaluate((element) => {
    const parent = element.parentElement;
    if (parent == null) return 0;
    return element.getBoundingClientRect().right - parent.getBoundingClientRect().right;
  });
}

test('날짜 칸이 제 자리를 넘지 않는다', async ({ goal, home, page, prep, recordSheet }) => {
  await test.step('검토 화면의 날짜 칸', async () => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.methodTab('줄글').click();
    await recordSheet.nl.analyze('점심 12000');
    await recordSheet.nl.openEdit('점심');

    // 금액과 나란히 두 칸으로 서는 자리다. 여기가 가장 좁다.
    expect(await overflowOf(recordSheet.nl.form.dayField), '날짜 칸이 폼 밖으로 나갔다').toBeLessThanOrEqual(1);
    // 한 칸이 삐져나가면 화면 전체가 가로로 밀린다. 그쪽도 함께 본다.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      '화면이 가로로 밀린다',
    ).toBeLessThanOrEqual(0);
    await recordSheet.closeByEsc();
  });

  await test.step('목표 시트의 기한 칸', async () => {
    await prep.setGoal({ title: '세부여행', targetAmount: 1_500_000 });
    await goal.open();
    await goal.editButton.click();
    await goal.form.waitOpen();

    await expect(goal.form.deadlineField).toBeVisible();
    expect(await overflowOf(goal.form.deadlineField), '기한 칸이 시트 밖으로 나갔다').toBeLessThanOrEqual(1);
  });
});

// ── 아이콘 고르기 ───────────────────────────────────────

test('고른 아이콘 칸의 테두리가 네 변 다 있다', async ({ categories }) => {
  await categories.open();
  await categories.waitReady();
  await categories.addButton.click();
  await categories.sheet.waitOpen();

  await categories.sheet.pickIcon('paw');

  // 칸 높이가 행 간격보다 크면 아래 칸이 위 칸 바닥을 덮어 테두리가 잘린다.
  // 눈으로만 보면 "왜 이상하지" 로 끝나고 원인을 못 찾는다. 숫자로 못 박는다.
  const grid = await categories.sheet.iconGridMetrics();
  expect(grid.cellHeight, '칸이 행 간격보다 크면 아래 칸이 바닥을 덮는다').toBeLessThanOrEqual(
    grid.rowPitch,
  );
  expect(grid.iconSize, '아이콘이 너무 작아 무엇인지 알아보기 어렵다').toBeGreaterThanOrEqual(30);
});

// ── 리포트 헤드라인 ─────────────────────────────────────

test('리포트 헤드라인이 라벨과 값으로 갈려 있다', async ({ prep, report }) => {
  const foodId = await prep.categoryIdByName(CATEGORY);
  await prep.setBudget(BUDGET);
  await prep.addTransaction({ amount: 30_000, merchant: '김밥천국', categoryId: foodId });

  await report.open();
  await report.waitReady();

  // 예산은 게이지가 말한다. 긴 문장으로 적으면 옆의 비교 문장과 구분이 안 된다.
  await expect(report.budgetLine).toBeVisible();
  await expect(report.budgetLine).toContainText(formatCurrency(BUDGET));

  // 견준 창은 남긴다. 지우면 이쪽 창이 달을 넘어가 있어도 알 방법이 없다.
  await expect(report.comparison).toContainText('지난달 같은 기간');
  await expect(report.comparison).toContainText(/\d{1,2}\.\d{1,2}~\d{1,2}\.\d{1,2} vs /);
});

// ── 카테고리를 먼저 고르기 ──────────────────────────────

test('카테고리를 먼저 고르면 목록이 접히고, 금액을 다 누른 뒤 저장한다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  // 화면에서 카테고리가 금액 바로 아래에 있다. 손이 먼저 그리로 가는데 눌리지 않았다.
  await recordSheet.input.pickCategory(CATEGORY);
  await expect(recordSheet.input.pickedCategory).toContainText(CATEGORY);
  // 접혀야 한다. 분류가 늘수록 목록이 화면을 다 먹는다.
  await expect(recordSheet.input.categoryChip('교통')).toHaveCount(0);

  // 고르기만 했지 저장은 아니다. 금액이 없으면 저장도 눌리지 않는다.
  await expect(recordSheet.input.saveButton).toBeDisabled();

  await recordSheet.input.enterAmount(7_000);
  await expect(recordSheet.input.saveButton).toBeEnabled();
  await recordSheet.input.saveButton.click();

  await expect(recordSheet.feedback.savedLabel).toBeVisible();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await expect(home.today.amount('7,000원')).toBeVisible();
});

test('접힌 줄을 누르면 목록이 다시 펴져 분류를 바꿀 수 있다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await recordSheet.input.pickCategory(CATEGORY);
  await expect(recordSheet.input.pickedCategory).toContainText(CATEGORY);

  // 잘못 골랐을 때 되돌릴 길이 없으면 시트를 닫았다 다시 열어야 한다.
  await recordSheet.input.pickedCategory.click();
  await recordSheet.input.pickCategory('교통');
  await expect(recordSheet.input.pickedCategory).toContainText('교통');
  await expect(recordSheet.input.pickedCategory).not.toContainText(CATEGORY);
});

// ── 저장 카드는 한 줄 ───────────────────────────────────

test('저장 직후 카드가 남은 날 수를 세지 않는다', async ({ home, prep, recordSheet }) => {
  await prep.setBudget(BUDGET);

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await recordSheet.input.enterAmount(9_000);
  await recordSheet.input.pickCategory(CATEGORY);
  await expect(recordSheet.feedback.savedLabel).toBeVisible();

  // 적을 때마다 남은 날을 세어 보여 주면 시간에 쫓기는 화면이 된다.
  await expect(recordSheet.feedback.card).not.toContainText(/남은 \d+일/);
  await expect(recordSheet.feedback.headline).toContainText('남은 예산');
});
