import { toLedgerDate } from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';

/**
 * 반복 지출. 매달 같은 날 나가는 돈을 미리 적어 둔다.
 *
 * **거래를 스스로 만들지 않는다.** 구독을 해지했는데 가계부에는 계속 찍히면 그 가계부가
 * 사실이 아니게 된다. 예고를 보여 주고 누르는 것은 사람이다.
 *
 * 확인할 것: 만들고 지운다, 오늘이 그날이면 홈에서 묻는다, 누르면 기록이 되고 그 회차는
 * 다시 안 묻는다, 「이번 달은 됐어요」 가 있다, 꺼 두면 아예 안 묻는다,
 * **그 카드가 떠 있으면 아래 권유가 비켜 준다.**
 *
 * 그리고 **언제 적히는지·언제 알릴지**를 화면이 말한다. 안 고르면 당일이고,
 * 전날로 걸면 그 전날부터 카드가 선다.
 */

// 카드를 함께 봐야 하는 시험이 있어 홈 화면 추가 카드를 켜 둔다.
test.use({ showStarterCards: true });

/**
 * 오늘 날짜. 그날로 걸어야 홈 카드가 뜬다.
 *
 * **기기 시간대로 세면 안 된다.** CI 런너는 UTC 라, KST 로 이미 다음 날인 시각에 돌리면
 * 하루 어긋난 날짜로 예고를 걸고 카드가 영영 안 뜬다(실제로 CI 만 빨갰다).
 * 서버가 보는 것과 같은 가계부 시간대(Asia/Seoul)로 센다.
 */
function ledgerDay(offset = 0): number {
  const iso = toLedgerDate(new Date());
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day + offset).getDate();
}

function today(): number {
  return ledgerDay();
}

test('걸어 둔 것이 없으면 무엇을 하는 자리인지만 말한다', async ({ recurring }) => {
  await recurring.open();
  await recurring.waitReady();

  // 빈 목록이 정상이다. 오류 자리를 만들지 않고, 무엇을 하는 자리인지 한 줄로 말한다.
  await expect(recurring.emptyTitle).toBeVisible();
  await expect(
    recurring.page.getByText('매달 같은 날 나가는 돈을 적어 두면 그날 알려드려요'),
  ).toBeVisible();
});

test('만들면 목록에 서고, 지우면 사라진다', async ({ recurring }) => {
  await recurring.open();
  await recurring.waitReady();

  await recurring.create({ name: '넷플릭스', amount: 17000, day: 25 });

  const row = recurring.row('넷플릭스');
  await expect(row).toBeVisible();
  await expect(row).toContainText('매달 25일');
  await expect(row).toContainText('17,000원');

  await test.step('지우기 전에 무엇이 남는지 말한다', async () => {
    await row.getByText('넷플릭스', { exact: true }).click();
    await expect(recurring.sheet('반복 지출 고치기')).toBeVisible();
    await recurring.deleteButton.click();
    await expect(recurring.page.getByText(/이미 적어 둔 기록은 그대로 남아요/)).toBeVisible();
    await recurring.page.getByRole('button', { name: '지우기', exact: true }).click();
  });

  await expect(recurring.row('넷플릭스')).toHaveCount(0);
});

test('오늘이 그날이면 홈에서 묻고, 누르면 그 자리에서 기록이 된다', async ({
  home,
  recurring,
}) => {
  await recurring.open();
  await recurring.waitReady();
  await recurring.create({ name: '넷플릭스', amount: 17000, day: today() });

  await home.open();
  await home.waitReady();

  await expect(home.recurring.card).toBeVisible();
  await expect(home.recurring.headline).toContainText('오늘 빠져나가는 돈이에요');
  await expect(home.recurring.card).toContainText('넷플릭스');
  await expect(home.recurring.card).toContainText('17,000원');

  await home.recurring.recordButton.click();

  // 누르면 카드가 사라진다. 한 회차에 한 번만 묻는다.
  await expect(home.recurring.card).toHaveCount(0);
  // 그리고 목록에 그 이름 그대로 앉는다. 무엇이 빠져나갔나가 보여야 한다.
  await expect(home.today.row('넷플릭스')).toBeVisible();
});

test('이번 달은 됐다고 하면 그 회차는 다시 안 묻는다', async ({ home, page, recurring }) => {
  await recurring.open();
  await recurring.waitReady();
  await recurring.create({ name: '넷플릭스', amount: 17000, day: today() });

  await home.open();
  await home.waitReady();
  await expect(home.recurring.card).toBeVisible();

  // 해지했거나 이번 달만 안 나가는 경우가 있다. 닫을 길이 없으면 카드가 이틀 내내 앉는다.
  await home.recurring.dismissButton.click();
  await expect(home.recurring.card).toHaveCount(0);

  await page.reload();
  await home.waitReady();
  await expect(home.recurring.card).toHaveCount(0);
});

test('꺼 두면 아예 안 묻는다', async ({ home, recurring }) => {
  await recurring.open();
  await recurring.waitReady();
  await recurring.create({ name: '넷플릭스', amount: 17000, day: today() });

  // 끄기와 지우기는 다르다. 끈 것은 목록에 흐리게 남아 다시 켤 수 있다.
  await recurring.toggle('넷플릭스').click();
  await expect(recurring.toggle('넷플릭스')).toHaveAttribute('aria-checked', 'false');

  await home.open();
  await home.waitReady();
  await expect(home.recurring.card).toHaveCount(0);
});

test('한 번에 한 장만 서고, 적으면 다음 것이 올라온다', async ({ home, recurring }) => {
  await recurring.open();
  await recurring.waitReady();
  await recurring.create({ name: '넷플릭스', amount: 17000, day: today() });
  await recurring.create({ name: '헬스장', amount: 60000, day: today() });

  await home.open();
  await home.waitReady();

  // 같은 날 둘이 걸려 있어도 카드는 하나다. 석 장이 서면 홈이 알림판이 된다.
  await expect(home.recurring.card).toHaveCount(1);

  await home.recurring.dismissButton.click();
  await expect(home.recurring.card).toBeVisible();
  await expect(home.recurring.card).toContainText('헬스장');
});

/**
 * 「곧 나갈 돈」 이 떠 있으면 권유 카드는 비켜 준다.
 *
 * 그건 권유가 아니라 오늘 실제로 돈이 빠져나간다는 사실이다. 그 아래 권유가 둘씩 붙으면
 * 정작 급한 것이 안 읽힌다. 카드가 셋 쌓인 화면을 직접 찍어 보고 정했다.
 */
test('곧 나갈 돈이 있으면 홈 화면 추가 권유는 비켜 준다', async ({ home, recurring }) => {
  await recurring.open();
  await recurring.waitReady();
  await recurring.create({ name: '넷플릭스', amount: 17000, day: today() });

  await home.open();
  await home.waitReady();

  await expect(home.recurring.card).toBeVisible();
  await expect(home.addToHome.card).toHaveCount(0);

  // 그 일을 끝내면 그때 권유가 올라온다.
  await home.recurring.recordButton.click();
  await expect(home.recurring.card).toHaveCount(0);
  await expect(home.addToHome.card).toBeVisible();
});

/**
 * 「매달 31일」 만으로는 2월에 무슨 일이 나는지 모른다.
 *
 * 고른 값으로 다음 날짜를 그 자리에서 세어 굵게 적는다. 저장한 뒤로는 서버가 당겨 준
 * 날짜를 목록 줄이 그대로 적는다(규칙이 두 곳에 생기지 않게).
 */
test('언제 적히는지를 폼과 목록이 말한다', async ({ recurring }) => {
  await recurring.open();
  await recurring.waitReady();

  await recurring.addButton.click();
  await expect(recurring.sheet('새 반복 지출')).toBeVisible();
  await recurring.nameInput.fill('넷플릭스');
  await recurring.daySelect.selectOption('31');

  // 31일이 없는 달을 고른 사람에게 무슨 일이 나는지 그 자리에서 말한다.
  await expect(recurring.nextLine).toContainText('다음은');
  await expect(recurring.nextLine).toContainText('에 적어요');

  await test.step('전날로 바꾸면 알림 날짜가 따로 적힌다', async () => {
    await recurring.leadButton('전날').click();
    await expect(recurring.nextLine).toContainText('알림은');
  });
});

test('안 고르면 당일이고, 전날로 걸면 전날부터 묻는다', async ({ home, recurring }) => {
  await recurring.open();
  await recurring.waitReady();
  // 내일 나갈 돈이다. 당일이면 오늘은 아직 안 묻는다.
  await recurring.create({ name: '넷플릭스', amount: 17000, day: ledgerDay(1) });

  await home.open();
  await home.waitReady();
  await expect(home.recurring.card).toHaveCount(0);

  await test.step('전날로 바꾸면 오늘부터 선다', async () => {
    await recurring.open();
    await recurring.waitReady();
    await recurring.row('넷플릭스').getByText('넷플릭스', { exact: true }).click();
    await expect(recurring.sheet('반복 지출 고치기')).toBeVisible();
    await recurring.leadButton('전날').click();
    await recurring.saveButton('고치기').click();
    await expect(recurring.sheet('반복 지출 고치기')).toHaveCount(0);

    await home.open();
    await home.waitReady();
    await expect(home.recurring.card).toBeVisible();
  });
});

test('예고마다 알림 시각을 따로 정한다', async ({ recurring }) => {
  await recurring.open();
  await recurring.waitReady();
  await recurring.create({ name: '월세', amount: 500000, day: 5, remindAt: '09:00' });

  await recurring.row('월세').getByText('월세', { exact: true }).click();
  await expect(recurring.sheet('반복 지출 고치기')).toBeVisible();

  // 다시 열어도 남아 있어야 한다. 안 남으면 정한 적이 없는 것과 같다.
  await expect(recurring.remindAtInput).toHaveValue('09:00');
});

/** 목록 카드와 추가 버튼이 붙어 있으면 버튼이 안내의 일부처럼 읽힌다. */
test('빈 안내와 추가 버튼 사이에 여백이 있다', async ({ recurring }) => {
  await recurring.open();
  await recurring.waitReady();

  const card = await recurring.page.locator('.recurring-card').boundingBox();
  const button = await recurring.addButton.boundingBox();
  expect(card).not.toBeNull();
  expect(button).not.toBeNull();

  expect(button!.y - (card!.y + card!.height), '안내와 버튼이 붙어 있다').toBeGreaterThanOrEqual(
    10,
  );
});
