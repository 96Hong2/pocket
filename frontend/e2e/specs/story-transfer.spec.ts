import { formatCurrency, formatNumber } from '../../src/shared/lib/format';
import type { HomeScreen } from '../screens/HomeScreen';
import type { RecordSheet } from '../screens/RecordSheet';
import { expect, test } from '../support/fixtures';

/**
 * 이체를 **손으로** 적는 길.
 *
 * 이체를 다루는 자리는 여럿인데 전부 `prep` 으로 심어 두고 본다. 그래서 사람이 이체를
 * 만드는 길은 한 번도 밟힌 적이 없다. 키패드와 달력 수정 시트는 지출과 수입만 오가고,
 * 이체로 가는 입구는 **검토 폼의 종류 고르기 하나뿐**이다. 그 입구가 막히면 이체는
 * 화면으로 만들 수 없는 종류가 되는데, 테스트는 전부 초록인 채다.
 *
 * 여기서 지키는 것은 하나로 이어진다. 이체는 돈이 나간 것이 아니다. 목록에는 남되
 * **그 달 지출 합계는 움직이지 않는다.** 카드값이 지출로 들어가면 카드로 이미 적어 둔
 * 지출을 한 번 더 세는 셈이라, 그 달 숫자가 통째로 거짓말이 된다.
 */

/** 카드값은 이미 적어 둔 지출을 갚는 돈이다. 스텁은 이것을 그냥 지출로 읽는다. */
const TRANSFER_TEXT = '카드값 800000';
const TRANSFER_NAME = '카드값';
const TRANSFER_AMOUNT = 800_000;

/** 이체와 나란히 둘 그 달의 진짜 지출. 합계가 이 값에서 안 움직여야 한다. */
const SPENT = 4_500;

/**
 * 줄글로 한 건을 읽어 종류만 이체로 바꿔 저장한다.
 *
 * 두 테스트가 같은 절차로 시작하고 보는 곳만 다르다. 화면 객체로 올리지 않는 것은
 * 이 절차가 이 파일 밖에서 쓸 일이 없어서다.
 */
async function saveAsTransfer(home: HomeScreen, recordSheet: RecordSheet): Promise<void> {
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze(TRANSFER_TEXT);

  await recordSheet.nl.openEdit(TRANSFER_NAME);
  await recordSheet.nl.form.typeTab('이체').click();
  await recordSheet.nl.form.apply();

  await recordSheet.nl.save();
  await expect(recordSheet.nl.savedTitle).toHaveText('1건 저장했어요');

  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();
}

test('읽어 온 지출을 이체로 바꾸면 분류 칸이 사라지고 저장 버튼에서 금액이 빠진다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze(TRANSFER_TEXT);

  // 읽은 그대로는 지출이다. 이대로 두면 800,000원이 이번 달 쓴 돈으로 들어간다.
  await expect(recordSheet.nl.kindButton(TRANSFER_NAME)).toHaveText(/지출/);
  await expect(recordSheet.nl.saveButton).toHaveText(
    `1건 저장 · ${formatCurrency(TRANSFER_AMOUNT)}`,
  );

  await recordSheet.nl.openEdit(TRANSFER_NAME);
  // 분류를 고르다가 종류가 틀린 것을 본다. 실제로 이 순서로 발견한다.
  await recordSheet.nl.form.pickCategory('식비');
  await expect(recordSheet.nl.form.categoryChip('식비')).toHaveAttribute('aria-pressed', 'true');
  await expect(recordSheet.nl.form.paymentGroup).toBeVisible();

  await recordSheet.nl.form.typeTab('이체').click();
  await expect(recordSheet.nl.form.typeTab('이체')).toBeChecked();
  // 이체는 집계 밖이라 분류에 뜻이 없다. 골라 둔 것까지 자리째 사라진다.
  await expect(recordSheet.nl.form.categoryGroup).toHaveCount(0);
  // 무엇으로 냈는지도 마찬가지다. 자리를 남기면 고른 값을 서버가 조용히 버린다.
  await expect(recordSheet.nl.form.paymentGroup).toHaveCount(0);

  await recordSheet.nl.form.apply();

  await expect(recordSheet.nl.row(TRANSFER_NAME)).toContainText('이체');
  await expect(recordSheet.nl.row(TRANSFER_NAME)).toContainText('분류 없음');
  // 지출과 수입만 한 번 눌러 오간다. 이체는 되돌릴 자리가 아니라 사실이라 글자로 선다.
  await expect(recordSheet.nl.kindButton(TRANSFER_NAME)).toHaveCount(0);
  // 쓴 돈이 아니게 됐으니 버튼 이름에서 금액이 통째로 빠진다.
  await expect(recordSheet.nl.saveButton).toHaveText('1건 저장');
});

/**
 * 이 묶음의 핵심.
 *
 * 합계와 목록이 서로 다른 말을 해야 맞는 자리다. 줄은 보이는데 숫자는 그대로여야 한다.
 * 한쪽만 맞으면 둘 중 어느 화면을 봐도 이체를 어떻게 다루는지 알 수 없다.
 */
test('손으로 적은 이체가 목록에는 서고 그 달 지출 합계에는 안 들어간다', async ({
  calendar,
  home,
  prep,
  recordSheet,
}) => {
  await prep.addTransaction({ amount: SPENT, merchant: '편의점' });

  await home.open();
  await home.waitReady();
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(SPENT));

  await saveAsTransfer(home, recordSheet);

  // 80만원이 여기 더해지면 이번 달 쓴 돈이 통째로 거짓말이 된다.
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(SPENT));
  await expect(home.today.spentTotal).toHaveText(`${formatCurrency(SPENT)} 씀`);
  // 합계에서만 빠질 뿐 목록에는 남는다. 적은 것이 안 보이면 어디로 갔는지 찾다가 또 적는다.
  await expect(home.today.row(TRANSFER_NAME)).toBeVisible();
  await expect(home.today.chip('이체')).toBeVisible();

  await calendar.open();
  await calendar.waitReady();
  await expect(calendar.totals.expense).toHaveText(formatCurrency(SPENT));
  // 달력의 날 합계는 예산에서 뺀 줄까지 세는 자리인데, 이체는 그것과 달리 아예 안 센다.
  await expect(calendar.list.dayTotal).toHaveText(formatCurrency(SPENT));
  await expect(calendar.list.row(TRANSFER_NAME)).toBeVisible();
  await expect(calendar.list.chip('이체')).toBeVisible();
});

/**
 * 적고 나서 다시 열었을 때.
 *
 * 심어 둔 이체 줄로 같은 것을 보는 자리가 `story-income-math.spec.ts` 에 있다.
 * 여기서 더 보는 것은 **화면으로 만든 줄**도 같은 대접을 받는가다. 저장 경로가 종류를
 * 제대로 안 썼으면 금액과 결제 수단 칸이 여기서 함께 드러난다.
 */
test('이체로 적은 줄을 달력에서 열면 결제 수단을 고를 자리가 없다', async ({
  calendar,
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await saveAsTransfer(home, recordSheet);

  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick(TRANSFER_NAME);
  await calendar.edit.waitOpen();

  // 검토 폼에 적은 것이 그대로 서버까지 갔다.
  await expect(calendar.edit.title).toContainText(TRANSFER_NAME);
  await expect(calendar.edit.amount).toHaveValue(formatNumber(TRANSFER_AMOUNT));

  // 이체에는 무엇으로 냈는지가 없다. 칸을 세우면 고른 값을 서버가 버려서,
  // 다시 열었을 때 고친 것이 사라진 것처럼 보인다.
  await expect(calendar.edit.paymentGroup).toHaveCount(0);
  // 되돌릴 수 없는 방향이라 지출·수입 토글도 안 세운다.
  await expect(calendar.edit.kindToggle).toHaveCount(0);
});

/**
 * 이체와 달리 지출에는 분류가 있고, 저장한 그 자리에서 바로 옮길 수 있다.
 *
 * 지금까지 이 길은 로그만 확인했다. 화면이 실제로 무엇을 보여 주는지는 본 적이 없어서,
 * 시트 안에서만 바뀌고 홈 목록은 옛 분류로 남아도 아무도 몰랐다.
 */
test('저장한 뒤 그 자리에서 분류를 바꾸면 홈 목록도 그 분류로 바뀐다', async ({
  home,
  prep,
  recordSheet,
}) => {
  // 앞자리가 차면 마지막 기본 분류가 「더 보기」 뒤로 밀린다. 펼쳐 고르는 길을 밟으려고 하나 만든다.
  await prep.addCategory('반려동물');

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(9_000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();

  // 상호를 안 적은 줄이라 분류 이름이 곧 제목이다. 어디에서 옮기는지가 줄에 적혀 있다.
  await expect(recordSheet.feedback.savedRowTitle).toHaveText('식비');

  await recordSheet.feedback.changeCategoryButton.click();
  await expect(recordSheet.feedback.changeTitle).toBeVisible();
  // 밀려난 분류는 펴야 나온다.
  await expect(recordSheet.feedback.categoryChip('기타')).toHaveCount(0);
  await recordSheet.feedback.moreCategoriesButton.click();
  await recordSheet.feedback.categoryChip('기타').click();

  // 고르면 목록이 다시 접히고 줄 제목이 새 분류로 바뀐다.
  await expect(recordSheet.feedback.changeTitle).toHaveCount(0);
  await expect(recordSheet.feedback.savedRowTitle).toHaveText('기타');

  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  // 시트 안에서만 바뀌고 목록이 옛 분류로 남으면, 다음에 열었을 때 어느 쪽이 맞는지 알 수 없다.
  await expect(home.today.row('기타')).toBeVisible();
  await expect(home.today.row('식비')).toHaveCount(0);
});
