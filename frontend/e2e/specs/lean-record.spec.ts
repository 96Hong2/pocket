import { QUICK_LIMIT } from '../../src/shared/ledger/quickPick';
import { formatCurrency } from '../../src/shared/lib/format';
import { logsNamed } from '../support/aitMock';
import { expect, test } from '../support/fixtures';

/**
 * 적는 자리에서 덜어낸 것들.
 *
 * 이 앱을 쓰는 사람은 가계부를 좋아해서 쓰는 것이 아니다. 화면에 요소가 하나 늘 때마다
 * 안 쓸 이유가 하나 는다. 여기서 지키는 것이 셋이다.
 * **닫는 길이 손에 익은 것 하나**(X 를 없애고 손잡이를 남겼다),
 * **고를 것이 열한 개를 넘지 않는 것**, 그리고 **더 있다는 것을 알 수 있는 것**.
 */

test('X 버튼이 없고, 손잡이를 아래로 밀면 닫힌다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  // 닫는 자리는 하나뿐이다. 오른쪽 위 X 는 토스가 그리는 미니앱 닫기와 자리가 같아,
  // 시트를 닫으려다 앱을 닫는 일이 실기기에서 있었다.
  await expect(recordSheet.closeButton).toHaveCount(1);

  await recordSheet.input.enterAmount(3000);
  await recordSheet.dragDown();
  await recordSheet.waitClosed();

  // 저장하지 않고 나간 것이다. 오늘 목록에 아무것도 남으면 안 된다.
  await expect(home.today.amount(formatCurrency(3000))).toHaveCount(0);
});

test('조금만 밀면 닫히지 않고 제자리로 돌아온다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  // 목록을 훑다가 손가락이 흐른 정도로 닫히면, 적던 금액이 매번 날아간다.
  await recordSheet.dragDown(24);
  await expect(recordSheet.closeButton).toBeVisible();
});

test('손잡이를 누르면 닫힌다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await recordSheet.closeButton.click();
  await recordSheet.waitClosed();
});

test('칩은 열한 개까지만 서고, 나머지는 「더 보기」 뒤에 있다', async ({
  home,
  prep,
  recordSheet,
}) => {
  // 기본 지출이 딱 열한 개다. 두 개를 더 만들면 앞자리가 넘친다.
  await prep.addCategory('반려동물');
  await prep.addCategory('경조사');

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  const shown = await recordSheet.input.categoryChipNames();
  expect(shown).toHaveLength(QUICK_LIMIT);

  await recordSheet.input.moreCategoriesButton.click();
  const all = await recordSheet.input.categoryChipNames();
  expect(all).toHaveLength(QUICK_LIMIT + 2);
  expect(all).toContain('경조사');
  expect(all).toContain('기타');
});

test('「더 보기」 안에서 분류를 만들고, 관리 화면이 있다는 것도 알려 준다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  // 앞자리는 고르는 자리다. 만들기가 늘 서 있으면 고를 것이 하나 더 는다.
  await expect(recordSheet.input.newCategoryButton).toHaveCount(0);

  await recordSheet.input.moreCategoriesButton.click();
  await expect(recordSheet.input.newCategoryButton).toBeVisible();
  // 카테고리 관리가 있다는 것을 아는 유일한 통로다. 대부분 그 화면이 있는 줄도 모른다.
  await expect(recordSheet.input.categorySettingsNote).toBeVisible();

  await recordSheet.input.foldCategoriesButton.click();
  await expect(recordSheet.input.newCategoryButton).toHaveCount(0);
});

test('한 번 더 칩이 없다', async ({ home, recordSheet }) => {
  // 저장 이력이 있어도 뜨지 않는다. 같은 금액을 또 쓰는 일보다, 화면에 칩이 하나 더 서서
  // 무엇을 눌러야 하는지 헷갈리는 값이 컸다.
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(4000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await home.recordButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.input.repeatChip).toHaveCount(0);
});

/**
 * CX 로그.
 *
 * 화면을 덜어냈으니 **덜어낸 자리가 실제로 덜 막히는지**를 볼 수 있어야 한다.
 * 「더 보기」를 얼마나 여는지 모르면 앞자리를 열한 개로 둔 것이 맞는지 영영 알 수 없고,
 * 초기화는 되돌릴 수 없는 자리라 누른 것과 지운 것을 따로 세야 한다.
 */
test('「더 보기」를 펴면 어느 화면에서 몇 개를 보고 있었는지 남는다', async ({
  home,
  page,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.moreCategoriesButton.click();
  await expect(recordSheet.input.newCategoryButton).toBeVisible();

  const opened = await logsNamed(page, 'category_more_opened');
  expect(opened).toHaveLength(1);
  expect(opened[0]?.params.where).toBe('record');
  expect(opened[0]?.params.shown).toBeGreaterThan(0);
  // 기록 흐름에 묶여 있어야 "적다가 막혀서 열었다" 를 셀 수 있다.
  expect(opened[0]?.params.flow_id).toBeTruthy();
});

test('저장 로그는 그대로 남는다', async ({ home, page, recordSheet }) => {
  // 화면을 덜어내다 로그 줄을 함께 끊은 적이 있다. 저장 한 건이 시작·요청·결과로 이어져야 한다.
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(4000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();

  const started = await logsNamed(page, 'record_started');
  const requested = await logsNamed(page, 'save_requested');
  const result = await logsNamed(page, 'save_result');
  // 개발 판은 효과를 두 번 부르므로 시작 로그가 두 줄일 수 있다. 흐름은 하나여야 한다.
  const flows = new Set(started.map((log) => log.params.flow_id));
  expect(flows.size).toBe(1);
  expect(requested).toHaveLength(1);
  expect(result).toHaveLength(1);
  expect(result[0]?.params.result).toBe('ok');
  // 셋이 같은 흐름이라야 방식별 완료율이 나온다.
  const flow = [...flows][0];
  expect(flow).toBeTruthy();
  expect(requested[0]?.params.flow_id).toBe(flow);
  expect(result[0]?.params.flow_id).toBe(flow);
});

test('결제 수단을 고치면 어느 칸을 고쳤는지 남는다', async ({ home, page, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(4000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.pickPayment('현금');
  await expect(recordSheet.feedback.paymentButton('현금')).toHaveAttribute('aria-pressed', 'true');

  const changed = await logsNamed(page, 'record_changed');
  expect(changed.map((log) => log.params.field)).toContain('payment_method');
});
