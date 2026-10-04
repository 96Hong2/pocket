import type { HomeScreen } from '../screens/HomeScreen';
import type { RecordSheet } from '../screens/RecordSheet';
import { logsNamed, readLogs } from '../support/aitMock';
import { expect, test } from '../support/fixtures';

/**
 * 분류 없이 읽힌 상호에 분류를 골라 넣으면 다음부터 그렇게 저장할지 묻는다.
 *
 * 저장은 상호마다 분류를 스스로 기억한다(`nl-input.spec.ts` 「기억하기」). 그 길을 그대로
 * 두고, 모델도 몰라서 사람이 골라 넣은 분류만 한 번 묻는다. 여기서 지키는 것은 넷이다.
 * 「기억하기」 면 기억하고, 「이번만」 이면 저장만 하고, 답하지 않아도 저장만 하고,
 * 모델이 분류를 붙여 준 줄에는 묻지 않는다.
 *
 * 「하나슈퍼」 는 스텁 모델의 어느 낱말표에도 없어 분류 없이 읽힌다.
 * 공유 가계부에서 묻지 않는 것은 `shared-books-inputs.spec.ts`, 이체로 바꾸면 사라지는 것은
 * `story-transfer.spec.ts` 가 본다.
 */

async function analyzeUnknownMerchant({
  home,
  recordSheet,
}: {
  home: HomeScreen;
  recordSheet: RecordSheet;
}): Promise<void> {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('하나슈퍼 8000');
  await expect(recordSheet.nl.row('하나슈퍼')).toContainText('분류 없음');
  // 분류를 고르기 전에는 기억할 것이 없어 묻지 않는다.
  await expect(recordSheet.nl.rulePrompt('하나슈퍼')).toHaveCount(0);
}

test('분류 없이 읽힌 상호에 분류를 골라 넣으면 묻고, 「기억하기」 면 다음부터 그 분류가 먼저 잡힌다', async ({
  categories,
  home,
  recordSheet,
  page,
}) => {
  await analyzeUnknownMerchant({ home, recordSheet });

  await recordSheet.nl.openEdit('하나슈퍼');
  await recordSheet.nl.form.pickCategory('생활');

  const prompt = recordSheet.nl.rulePrompt('하나슈퍼');
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('「하나슈퍼」');
  await expect(prompt).toContainText('「생활」');

  await recordSheet.nl.rememberButton('하나슈퍼').click();
  await expect(prompt).toHaveCount(0);
  await expect(recordSheet.nl.ruleNote('하나슈퍼')).toContainText('저장할 때');

  await test.step('잘못 눌렀으면 「되돌리기」 로 물음이 다시 선다', async () => {
    await recordSheet.nl.ruleUndoButton('하나슈퍼').click();
    await expect(prompt).toBeVisible();
    await recordSheet.nl.rememberButton('하나슈퍼').click();
    await expect(recordSheet.nl.ruleNote('하나슈퍼')).toBeVisible();
  });

  // 줄을 접어도 「기억하기」 라고 한 것이 남는다.
  await recordSheet.nl.form.apply();
  await expect(recordSheet.nl.ruleNote('하나슈퍼')).toBeVisible();

  await recordSheet.nl.save();
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  await test.step('답한 횟수만 로그에 남고 상호는 싣지 않는다', async () => {
    const asked = await logsNamed(page, 'merchant_rule_asked');
    expect(asked.map((log) => log.params.answer)).toEqual(['remember', 'remember']);
    expect(JSON.stringify(await readLogs(page))).not.toContain('하나슈퍼');
  });

  await test.step('카테고리 관리에 기억한 분류로 서고, 다음 분석에서 먼저 잡힌다', async () => {
    await categories.open();
    await categories.waitReady();
    await expect(categories.rules.row('하나슈퍼')).toContainText('생활');

    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.methodTab('줄글').click();
    await recordSheet.nl.analyze('하나슈퍼 5000');
    await expect(recordSheet.nl.row('하나슈퍼')).toContainText('생활');
    // 이번에는 모델 대신 기억한 규칙이 분류를 붙였다. 다시 묻지 않는다.
    await expect(recordSheet.nl.rulePrompt('하나슈퍼')).toHaveCount(0);
  });
});

test('「이번만」 을 고르면 저장은 되고 기억은 하지 않는다', async ({
  categories,
  home,
  recordSheet,
}) => {
  await analyzeUnknownMerchant({ home, recordSheet });

  await recordSheet.nl.openEdit('하나슈퍼');
  await recordSheet.nl.form.pickCategory('생활');
  await recordSheet.nl.onceButton('하나슈퍼').click();
  await expect(recordSheet.nl.rulePrompt('하나슈퍼')).toHaveCount(0);
  await expect(recordSheet.nl.ruleNote('하나슈퍼')).toHaveCount(0);

  // 접어도 「이번만」 이 남아 다시 묻지 않고, 고른 분류는 그대로다.
  await recordSheet.nl.form.apply();
  await expect(recordSheet.nl.rulePrompt('하나슈퍼')).toHaveCount(0);
  await expect(recordSheet.nl.row('하나슈퍼')).toContainText('생활');

  await recordSheet.nl.save();
  await expect(recordSheet.nl.savedTitle).toContainText('1건 저장했어요');
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  await categories.open();
  await categories.waitReady();
  await expect(categories.rules.emptyTitle).toBeVisible();
});

test('답하지 않고 저장하면 기억하지 않는다. 물음은 줄을 접어도 남아 있다', async ({
  categories,
  home,
  recordSheet,
}) => {
  await analyzeUnknownMerchant({ home, recordSheet });

  await recordSheet.nl.openEdit('하나슈퍼');
  await recordSheet.nl.form.pickCategory('생활');
  await expect(recordSheet.nl.rulePrompt('하나슈퍼')).toBeVisible();

  // 「완료」 로 줄을 접어도 물음은 그 자리에 남는다. 폼 안에만 있었으면 여기서 사라졌다.
  await recordSheet.nl.form.apply();
  await expect(recordSheet.nl.rulePrompt('하나슈퍼')).toBeVisible();

  await test.step('체크를 끈 줄은 저장되지 않으니 묻지도 않는다', async () => {
    // 체크는 서버가 답한 뒤에 바뀐다. `uncheck()` 는 누른 직후 상태를 재서 느린 기기에서 헛걸린다.
    await recordSheet.nl.checkbox('하나슈퍼').click();
    await expect(recordSheet.nl.checkbox('하나슈퍼')).not.toBeChecked();
    await expect(recordSheet.nl.rulePrompt('하나슈퍼')).toHaveCount(0);
    await recordSheet.nl.checkbox('하나슈퍼').click();
    await expect(recordSheet.nl.checkbox('하나슈퍼')).toBeChecked();
    await expect(recordSheet.nl.rulePrompt('하나슈퍼')).toBeVisible();
  });

  await recordSheet.nl.save();
  await expect(recordSheet.nl.savedTitle).toContainText('1건 저장했어요');
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  await categories.open();
  await categories.waitReady();
  await expect(categories.rules.emptyTitle).toBeVisible();
});

test('모델이 분류를 붙여 준 줄은 묻지 않고, 바꿔 저장하면 예전처럼 그대로 기억한다', async ({
  categories,
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('올리브영 23000');
  await expect(recordSheet.nl.row('올리브영')).toContainText('건강·미용');

  await recordSheet.nl.openEdit('올리브영');
  await recordSheet.nl.form.pickCategory('생활');
  await expect(recordSheet.nl.rulePrompt('올리브영')).toHaveCount(0);

  await recordSheet.nl.form.apply();
  await recordSheet.nl.save();
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  await categories.open();
  await categories.waitReady();
  await expect(categories.rules.row('올리브영')).toContainText('생활');
});
