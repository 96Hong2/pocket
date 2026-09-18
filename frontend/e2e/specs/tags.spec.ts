import { expect, test } from '../support/fixtures';

/**
 * 태그. 카테고리와 다른 축으로 기록을 묶는다.
 *
 * 확인할 것은 다섯이다: 만들고 고치고 지운다, 저장한 뒤에 단다, 목록 줄에 표식이 붙는다,
 * 리포트에서 묶음별로 갈린다, **지출 태그와 수입 태그가 섞이지 않는다.**
 *
 * 마지막 것이 이 기능에서 제일 중요하다. 섞이면 리포트가 번 돈과 쓴 돈을 한 조각에 더한다.
 */

test('만들고 고치고, 쓰인 건수까지 보여준다', async ({ tags }) => {
  await tags.open();
  await tags.waitReady();

  await tags.create('지출 태그', '출장');
  await expect(tags.group('지출 태그').getByText('출장', { exact: true })).toBeVisible();
  // 아직 아무 기록에도 안 달렸다. 0건이 정상이다.
  await expect(tags.usageCount('출장')).toHaveText('0건');

  await test.step('이름을 고치면 목록이 바로 바뀐다', async () => {
    await tags.editButton('출장').click();
    await expect(tags.sheet('태그 고치기')).toBeVisible();
    await tags.nameInput.fill('외근');
    await tags.saveButton('고치기').click();
    await expect(tags.group('지출 태그').getByText('외근', { exact: true })).toBeVisible();
  });
});

test('지출 태그와 수입 태그는 같은 이름을 따로 쓴다', async ({ tags }) => {
  await tags.open();
  await tags.waitReady();

  await tags.create('지출 태그', '출장');
  await tags.create('수입 태그', '출장');

  // 「출장」 이 지출에도 수입에도 있는 사람이 있다. 목록이 갈려 있으니 이름도 갈린다.
  await expect(tags.group('지출 태그').getByText('출장', { exact: true })).toBeVisible();
  await expect(tags.group('수입 태그').getByText('출장', { exact: true })).toBeVisible();
});

test('저장한 뒤에 태그를 달고, 목록 줄에 표식이 붙는다', async ({
  home,
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
  await recordSheet.input.enterAmount(12000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();

  /*
    **저장이 끝난 다음에 묻는다.** 적는 화면에 칸이 하나 더 서면 10초 약속이 깨진다.
    결제 수단과 같은 자리, 같은 규칙이다.
  */
  await recordSheet.feedback.tagChip('출장').click();
  await expect(recordSheet.feedback.tagChip('출장')).toHaveAttribute('aria-pressed', 'true');
  await recordSheet.closeByEsc();

  // 목록 줄에 표식이 붙는다. 무엇이 어느 묶음인지 훑으면서 알 수 있어야 한다.
  await expect(home.today.row('출장')).toBeVisible();
});

test('눌린 태그를 다시 누르면 떨어진다', async ({ home, recordSheet, tags }) => {
  await tags.open();
  await tags.waitReady();
  await tags.create('지출 태그', '출장');

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(9000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();

  await recordSheet.feedback.tagChip('출장').click();
  await expect(recordSheet.feedback.tagChip('출장')).toHaveAttribute('aria-pressed', 'true');

  // 잘못 단 태그를 되무를 길이 이것뿐이다.
  await recordSheet.feedback.tagChip('출장').click();
  await expect(recordSheet.feedback.tagChip('출장')).toHaveAttribute('aria-pressed', 'false');
});

test('태그가 하나도 없으면 만들러 가는 길만 보여준다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(5000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();

  // 「태그가 없어요」 만 적으면 어디서 만드는지 모른다.
  await expect(recordSheet.feedback.tagEmptyLink).toBeVisible();
});

test('리포트에서 태그별로 갈린다', async ({ home, recordSheet, report, tags }) => {
  await tags.open();
  await tags.waitReady();
  await tags.create('지출 태그', '출장');

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(30000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.tagChip('출장').click();
  await expect(recordSheet.feedback.tagChip('출장')).toHaveAttribute('aria-pressed', 'true');
  await recordSheet.closeByEsc();

  await report.open();
  await report.waitReady();

  await expect(report.tagCard('지출')).toBeVisible();
  // 태그를 단 돈 안에서의 비중이다. 한 건뿐이니 100% 다.
  await expect(report.tagRow('출장')).toContainText('100%');
});

test('지운 태그는 목록에서 사라지고 기록은 남는다', async ({
  home,
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
  await recordSheet.input.enterAmount(12000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.tagChip('출장').click();
  await expect(recordSheet.feedback.tagChip('출장')).toHaveAttribute('aria-pressed', 'true');
  await recordSheet.closeByEsc();

  await tags.open();
  await tags.waitReady();
  // 지우기 전에 몇 건이 이 태그를 잃는지 먼저 말한다.
  await expect(tags.usageCount('출장')).toHaveText('1건');

  await tags.editButton('출장').click();
  await tags.deleteButton.click();
  await expect(tags.confirmSheet).toBeVisible();
  await expect(tags.confirmSheet).toContainText('기록과 금액은 그대로 남아요');
  await tags.confirmDelete.click();

  await expect(tags.group('지출 태그').getByText('출장', { exact: true })).toHaveCount(0);

  // 지운 것은 태그지 그날 쓴 돈이 아니다.
  await home.open();
  await home.waitReady();
  await expect(home.today.row('식비')).toBeVisible();
});
