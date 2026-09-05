import { formatCurrency } from '../../src/shared/lib/format';
import { E2E_API_URL } from '../support/env';
import { expect, test } from '../support/fixtures';

/**
 * 기록 한 건을 험하게 넣었을 때.
 *
 * 이 앱은 기록이 목적이라 이 화면만은 어떤 상태에서도 살아 있어야 한다.
 * 조회가 실패해도 기록은 되어야 하고, 잘못 누른 것은 저장되기 전에 막혀야 한다.
 */

test('0원은 저장으로 넘어가지 않는다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  // 아무것도 안 누른 처음 상태가 0 원이다. 여기서 분류를 고를 수 있으면 0 원이 저장된다.
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(0));
  await expect(recordSheet.input.categoryChip('식비')).toBeDisabled();
});

test('지웠다 다시 적으면 금액이 처음부터 다시 쌓인다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await recordSheet.input.enterAmount(12_300);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(12_300));

  // 다섯 자리를 다 지운다. 한 번 더 눌러도 0 아래로 내려가지 않아야 한다.
  for (let i = 0; i < 6; i += 1) await recordSheet.input.backspaceKey.click();
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(0));

  await recordSheet.input.enterAmount(500);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(500));
});

test('아주 큰 금액을 적어도 홈이 가로로 넘치지 않는다', async ({ home, page, prep }) => {
  // 전세 보증금처럼 실제로 있을 수 있는 큰 값이다.
  await prep.addTransaction({ amount: 900_000_000, merchant: '전세보증금' });
  await prep.setBudget(1_000_000_000);

  await home.open();
  await home.waitReady();

  await expect(home.today.amount(formatCurrency(900_000_000))).toBeVisible();

  const box = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    visual: Math.ceil(window.visualViewport?.width ?? window.innerWidth),
  }));
  expect(box.scroll, `${JSON.stringify(box)} 큰 금액이 화면을 가로로 밀었다`).toBeLessThanOrEqual(
    box.visual + 1,
  );
});

test('저장이 도는 동안 같은 분류를 다시 눌러도 한 건만 저장된다', async ({
  home,
  page,
  recordSheet,
}) => {
  let posts = 0;
  await page.route(`${E2E_API_URL}/api/v1/transactions`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    posts += 1;
    // 응답을 붙잡아 두 번째 누를 틈을 만든다. 실제 느린 회선에서 생기는 상태다.
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.continue();
  });

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(7_000);

  const chip = recordSheet.input.categoryChip('식비');
  await chip.click();
  // 응답을 기다리는 동안 다시 누른다. 잠그지 않으면 같은 기록이 두 건 생긴다.
  await chip.click({ force: true }).catch(() => undefined);

  await recordSheet.feedback.waitSaved();
  expect(posts, '저장 요청이 두 번 나갔다').toBe(1);

  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(home.today.amount(formatCurrency(7_000))).toHaveCount(1);
});

test.describe('저장이 실패했을 때', () => {
  test.use({
    // 우리가 일부러 막은 응답이다. 브라우저가 그것을 콘솔에 적는 것뿐이고 앱이 낸 오류가 아니다.
    // 정규식을 하나로 합쳐 둔다. 원소가 둘인 배열은 playwright 가 `[값, 설정]` 짝으로 읽는다.
    consoleErrorAllowList: [/Failed to load resource[\s\S]*(500|503)|net::ERR_FAILED/],
  });

  test('적어 둔 금액이 남고 왜 안 됐는지 말한다', async ({ home, page, recordSheet }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.input.enterAmount(8_400);

    await page.route(`${E2E_API_URL}/api/v1/transactions`, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 503, body: '{}' });
        return;
      }
      await route.continue();
    });

    await recordSheet.input.categoryChip('식비').click();

    // 시트가 닫히면 적어 둔 금액이 함께 사라져 처음부터 다시 눌러야 한다.
    await expect(recordSheet.input.notice).toBeVisible();
    await expect(recordSheet.input.amountText).toHaveText(formatCurrency(8_400));
  });

  test('연결이 끊겨도 시트가 닫히지 않는다', async ({ home, page, recordSheet }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.input.enterAmount(3_300);

    // 지하철에서 흔한 상태다. 응답이 오지 않는 것과 오류가 오는 것은 다른 경로다.
    await page.route(`${E2E_API_URL}/api/v1/transactions`, (route) => route.abort('failed'));

    await recordSheet.input.categoryChip('식비').click();

    await expect(recordSheet.input.notice).toBeVisible();
    await expect(recordSheet.input.amountText).toHaveText(formatCurrency(3_300));
  });
});

test.describe('조회가 실패했을 때', () => {
  test.use({ consoleErrorAllowList: [/Failed to load resource[\s\S]*500/] });

  test('예산 조회가 실패해도 기록은 끝까지 된다', async ({ home, page, recordSheet }) => {
    await page.route(`${E2E_API_URL}/api/v1/budgets**`, (route) =>
      route.fulfill({ status: 500, body: '{}' }),
    );

    await home.open();

    // 읽기 실패가 쓰기 입구를 막으면 이 앱의 목적 자체가 사라진다.
    await expect(home.recordButton).toBeVisible();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.input.enterAmount(4_500);
    await recordSheet.input.pickCategory('식비');
    await recordSheet.feedback.waitSaved();
  });
});
