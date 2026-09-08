import { formatCurrency, shiftMonth } from '../../src/shared/lib/format';
import { lastMonth, thisMonth } from '../support/api';
import { watchAgreementRequests } from '../support/aitMock';
import { expect, test } from '../support/fixtures';

/**
 * 월간 결산·알림·안 쓴 날의 바깥값.
 *
 * 셋 다 「없어야 할 때 없는가」가 핵심이다. 결산은 아직 안 끝난 달에 열리면 안 되고,
 * 알림은 켜는 순간 말고는 묻지 않아야 하고, 안 썼다는 표시는 그 날 쓴 것이 생기면
 * 남아 있으면 안 된다. 기본 스위트는 있어야 할 때 있는지를 보고 여기는 반대쪽만 본다.
 */

/** 지난달 한가운데. 달마다 있는 날이라 어느 달에 돌려도 그 달에 들어간다. */
const LAST_MONTH_DAY = `${lastMonth()}-15`;

test('아직 안 끝난 달은 주소로 부탁해도 결산이 열리지 않는다', async ({ prep, report }) => {
  await prep.addTransaction({ amount: 30_000, merchant: '오늘점심' });

  await report.open({ month: thisMonth(), closing: true });
  await report.waitReady();

  // 지나는 중인 달을 결산하면 아직 안 쓴 돈까지 「이번 달은 이랬어요」로 굳는다.
  await expect(report.closing.overlay).toHaveCount(0);
  await expect(report.closing.card).toHaveCount(0);
});

test('기록이 없는 끝난 달은 주소로 부탁해도 결산이 열리지 않는다', async ({ report }) => {
  await report.open({ month: lastMonth(), closing: true });
  await report.waitReady();

  // 돌아볼 것이 없는 달에 넉 장을 띄우면 빈 카드만 넘기게 된다.
  await expect(report.closing.overlay).toHaveCount(0);
  await expect(report.closing.card).toHaveCount(0);
});

test('결산을 닫으면 보고 있던 달의 리포트가 그대로 남는다', async ({ prep, report }) => {
  await prep.addTransaction({ amount: 120_000, on: LAST_MONTH_DAY, merchant: '지난달쇼핑' });

  await report.open({ month: lastMonth() });
  await report.waitReady();
  await report.closing.open();
  await report.closing.closeButton.click();

  await expect(report.closing.overlay).toHaveCount(0);
  // 닫으면서 이번 달로 튕기면 사용자가 보던 자리를 잃는다.
  await expect(report.total).toHaveText(formatCurrency(120_000));
  await expect(report.closing.card).toBeVisible();
});

test('결산을 한 번 닫은 뒤 달을 옮겨도 저절로 다시 열리지 않는다', async ({ prep, report }) => {
  await prep.addTransaction({ amount: 90_000, on: LAST_MONTH_DAY, merchant: '지난달' });
  await prep.addTransaction({
    amount: 40_000,
    on: `${shiftMonth(thisMonth(), -2)}-15`,
    merchant: '두달전',
  });

  await report.open({ month: lastMonth(), closing: true });
  await report.waitReady();
  await expect(report.closing.overlay).toBeVisible();
  await report.closing.closeButton.click();
  await expect(report.closing.overlay).toHaveCount(0);

  await report.goPreviousMonth();

  // 주소에 남은 부탁을 다시 읽으면 엉뚱한 달의 결산이 저절로 뜬다.
  await expect(report.closing.overlay).toHaveCount(0);
});

test('알림 시각은 자정과 하루 끝에서도 저장되고 다시 열어도 남는다', async ({
  notifications,
  page,
}) => {
  await notifications.open();
  await notifications.waitReady();
  await notifications.turnOn();

  for (const time of ['00:00', '23:59']) {
    await notifications.setTime(time);
    await page.reload();
    await notifications.waitReady();
    // 자정을 「값이 없다」로 보면 켜 둔 채 영영 안 가는 알림이 된다.
    await expect(notifications.timeInput).toHaveValue(time);
  }
});

test('시각만 바꾸는 것으로는 동의를 다시 묻지 않는다', async ({ notifications, page }) => {
  await notifications.open();
  await notifications.waitReady();

  const agreementRequests = watchAgreementRequests(page);
  await notifications.turnOn();
  expect(agreementRequests()).toBe(1);

  await notifications.setTime('07:30');
  await notifications.setTime('20:15');

  // 시각을 만질 때마다 동의 화면이 뜨면 설정을 못 만진다.
  expect(agreementRequests()).toBe(1);
});

test('끄는 것은 동의를 묻지 않고, 켤 때만 한 번씩 묻는다', async ({ notifications, page }) => {
  await notifications.open();
  await notifications.waitReady();

  const agreementRequests = watchAgreementRequests(page);
  await notifications.turnOn();
  expect(agreementRequests()).toBe(1);

  // 끄면서 동의를 물으면 「알림을 끄려는데 알림을 허락하라」는 말이 된다.
  await notifications.turnOff();
  expect(agreementRequests()).toBe(1);

  // 다시 켜는 것도 켜는 순간이라 한 번 묻는다. 이미 동의했으면 토스가 화면 없이 통과시킨다.
  await notifications.turnOn();
  expect(agreementRequests()).toBe(2);
  await expect(notifications.toggle).toHaveAttribute('aria-checked', 'true');
});

test('안 썼다고 남긴 날에 지출을 적으면 안 썼다는 줄이 사라진다', async ({
  home,
  prep,
  recordSheet,
}) => {
  await prep.setBudget(600_000);
  const noSpend = await prep.saveNoSpend();
  expect(noSpend.status).toBe(201);

  await home.open();
  await home.waitReady();
  await expect(home.today.noSpendRow).toBeVisible();

  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(8_000);
  await recordSheet.input.pickCategory('식비');
  await expect(recordSheet.feedback.savedLabel).toBeVisible();
  await recordSheet.closeButton.click();
  await recordSheet.waitClosed();

  // 쓴 것이 있는 날에 「오늘은 안 썼어요」가 남아 있으면 그 날 장부가 스스로를 뒤집는다.
  await expect(home.today.row('식비')).toBeVisible();
  await expect(home.today.noSpendRow).toHaveCount(0);
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(592_000));
});

test('이번 주 쓸 수 있는 돈은 하루치보다 적어지지 않는다', async ({ home, prep }) => {
  await prep.setBudget(700_000);

  await home.open();
  await home.waitReady();

  const daily = wonOf(await home.hero.dailyAllowance.textContent());
  const weekly = wonOf(await home.hero.weeklyAllowance.textContent());

  // 주간값은 하루치 × 이번 주에 남은 날이고 그 날 수는 오늘을 포함해 최소 하나다.
  // 남은 날을 오늘을 빼고 세면 말일에 0 이 되어 주간값이 하루치보다 작아진다.
  expect(weekly).toBeGreaterThanOrEqual(daily);
  expect(weekly % daily).toBe(0);
  expect(weekly / daily).toBeLessThanOrEqual(7);
});

/** `15,991원` → `15991`. 화면에 그려진 글자에서 숫자만 뽑는다. */
function wonOf(text: string | null): number {
  return Number((text ?? '').replace(/[^0-9]/g, ''));
}
