import { formatCurrency } from '../../../src/shared/lib/format';
import { expect, test } from '../support/director';

/**
 * 줄글로 적고 검토해서 저장하는 다섯 장면.
 *
 * 장면마다 홈을 먼저 열어 제목 카드를 띄우고 그 뒤에 시트를 연다.
 * 시트를 먼저 열고 제목 카드를 띄우면 카드 뒤로 딤이 비쳐 앞머리가 어둡게 남는다.
 *
 * 지금 도는 것은 실제 모델이 아니라 규칙 기반 스텁이다. 그래서 여기서 보이는 것은
 * '얼마나 잘 알아듣는가' 가 아니라 '알아들은 것을 화면이 어떻게 다루는가' 다.
 */

const THREE_ITEMS = '점심 12000 스벅 4500 어제 택시 9000';

test('35 줄글 한 줄에 여러 건을 적는다', async ({ demo, home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await demo.open('줄글로 적기', '한 줄에 여러 건을 적어도 따로 읽는다');

  await demo.step('홈에서 10초 기록을 누른다');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await demo.beat(2);

  await demo.step('기록 방법에서 줄글로 옮긴다');
  await recordSheet.methodTab('줄글').click();
  await expect(recordSheet.nl.textarea).toBeVisible();
  await demo.beat(2);

  await demo.step('생각나는 대로 한 줄에 적는다');
  await recordSheet.nl.textarea.fill(THREE_ITEMS);
  await demo.beat(3);

  await demo.step('분석을 누르면 세 건으로 갈린다');
  await recordSheet.nl.analyzeButton.click();
  await expect(recordSheet.nl.rows).toHaveCount(3);
  await demo.beat(3);

  await demo.step('금액과 분류가 각각 붙는다');
  await expect(recordSheet.nl.amount('점심')).toHaveText(formatCurrency(12_000));
  await expect(recordSheet.nl.row('스벅')).toContainText('카페·간식');
  await demo.beat(3);

  await demo.step("'어제' 라고 쓴 것만 어제 날짜로 간다");
  await expect(recordSheet.nl.row('택시')).toContainText('교통');
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});

test('36 확신이 낮은 것은 스스로 켜지지 않는다', async ({ demo, home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await demo.open('확인이 필요한 것', '알아듣지 못한 것을 조용히 저장하지 않는다');

  await demo.step('금액만 적고 무엇에 썼는지는 안 적었다');
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.textarea.fill('9000');
  await demo.beat(2);

  await demo.step('분석하면 확인 필요로 표시된다');
  await recordSheet.nl.analyzeButton.click();
  await expect(recordSheet.nl.chip('이름 없음', '확인 필요')).toBeVisible();
  await demo.beat(3);

  await demo.step('체크가 꺼져 있어 그대로는 저장되지 않는다');
  await expect(recordSheet.nl.checkbox('이름 없음')).not.toBeChecked();
  await expect(recordSheet.nl.saveButton).toBeDisabled();
  await demo.beat(3);

  await demo.step('상호를 적어 주면 표시가 사라지고 저장 대상이 된다');
  await recordSheet.nl.openEdit('이름 없음');
  await recordSheet.nl.form.merchantField.fill('택시');
  await recordSheet.nl.form.apply();
  await expect(recordSheet.nl.checkbox('택시')).toBeChecked();
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});

test('37 이해한 결과를 눌러서 고친다', async ({ demo, home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await demo.open('눌러서 고치기', '틀리게 읽었으면 그 자리에서 고친다');

  await demo.step('점심 12,000원 한 건을 읽었다');
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('점심 12000');
  await demo.beat(2);

  await demo.step('고치기를 누르면 그 줄이 펼쳐진다');
  await recordSheet.nl.openEdit('점심');
  await demo.beat(3);

  await demo.step('상호와 금액을 고친다');
  await recordSheet.nl.form.merchantField.fill('김밥천국');
  await recordSheet.nl.form.amountField.fill('13000');
  await demo.beat(2);

  await demo.step('분류도 다시 고른다');
  await recordSheet.nl.form.categoryChip('생활').click();
  await demo.beat(2);

  await demo.step('고친 값이 목록과 저장 버튼에 함께 반영된다');
  await recordSheet.nl.form.apply();
  await expect(recordSheet.nl.amount('김밥천국')).toHaveText(formatCurrency(13_000));
  await expect(recordSheet.nl.saveButton).toHaveText(`1건 저장 · ${formatCurrency(13_000)}`);
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});

test('38 고른 것만 한 번에 저장한다', async ({ calendar, demo, home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await demo.open('한 번에 저장', '저장 버튼은 하나. 건수와 합계를 버튼에 적는다');

  await demo.step('세 건을 읽었다. 버튼에 3건과 합계가 적힌다');
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze(THREE_ITEMS);
  await expect(recordSheet.nl.saveButton).toHaveText(`3건 저장 · ${formatCurrency(25_500)}`);
  await demo.beat(3);

  await demo.step('스벅은 빼기로 한다');
  await recordSheet.nl.toggle('스벅', false);
  await expect(recordSheet.nl.saveButton).toHaveText(`2건 저장 · ${formatCurrency(21_000)}`);
  await demo.beat(3);

  await demo.step('누르면 두 건이 한 번에 저장된다');
  await recordSheet.nl.save();
  await expect(recordSheet.nl.savedTitle).toHaveText(`2건 저장했어요 · ${formatCurrency(21_000)}`);
  await demo.beat(3);

  await demo.step('홈의 이번 달 쓴 돈이 그만큼 올라간다');
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(21_000));
  await demo.beat(3);

  await demo.step('달력에도 저장한 것만 들어와 있다');
  await calendar.open();
  await calendar.waitReady();
  await expect(calendar.totals.expense).toHaveText(formatCurrency(21_000));
  await expect(calendar.list.row('점심')).toBeVisible();
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});

test('39 한 번 고친 분류를 기억한다', async ({ demo, home, manage, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await demo.open('기억한 분류', '한 번 고치면 다음부터 그 분류가 먼저다');

  await demo.step('올리브영을 건강·미용으로 읽었다');
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('올리브영 23000');
  await expect(recordSheet.nl.row('올리브영')).toContainText('건강·미용');
  await demo.beat(3);

  await demo.step('생활로 바꿔서 저장한다');
  await recordSheet.nl.openEdit('올리브영');
  await recordSheet.nl.form.categoryChip('생활').click();
  await recordSheet.nl.form.apply();
  await recordSheet.nl.save();
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();
  await demo.beat(2);

  await demo.step('다음에 같은 상호를 적으면 생활로 먼저 잡는다');
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('올리브영 5000');
  await expect(recordSheet.nl.row('올리브영')).toContainText('생활');
  await demo.beat(3);

  await demo.step('관리 탭에 기억한 분류가 쌓인다');
  await recordSheet.closeButton.click();
  await recordSheet.waitClosed();
  await manage.open();
  await manage.waitReady();
  await expect(manage.rules.row('올리브영')).toContainText('생활');
  await demo.beat(3);

  await demo.step('지우면 다시 처음부터 판단한다');
  await manage.rules.remove('올리브영');
  await expect(manage.rules.emptyTitle).toBeVisible();
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});
