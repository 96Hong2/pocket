import { E2E_API_URL } from '../support/env';
import { expect, test } from '../support/fixtures';

/**
 * 앱 설정이 어긋났을 때.
 *
 * 기본 동작은 `specs/settings.spec.ts` 가 지킨다. 여기서 보는 것은
 * 저장이 실패했을 때·조회가 실패했을 때·예산이 아직 없을 때다.
 *
 * 설정 화면의 어려움은 하나다. **고른 것과 화면에 실제로 나오는 것이 다를 수 있다.**
 * 예산이 없으면 홈이 예산 갈래를 못 쓰고 다른 것으로 떨어진다.
 * 그 사실을 설정 화면이 숨기면 사용자는 자기가 고른 것이 무시됐다고 느낀다.
 */

test.describe('저장이 실패했을 때', () => {
  test.use({
    // 우리가 일부러 500 을 내려보낸다. 브라우저가 그 응답을 콘솔에 적는 것뿐이다.
    consoleErrorAllowList: [/Failed to load resource[\s\S]*500/],
  });

  test('고른 자리가 되돌아오고 왜 안 됐는지 말한다', async ({ page, settings }) => {
    await settings.open();
    await settings.waitReady();
    await expect(settings.heroChoice('남은 예산')).toHaveAttribute('aria-checked', 'true');

    await page.route(`${E2E_API_URL}/api/v1/preferences`, async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({ status: 500, body: '{}' });
        return;
      }
      await route.continue();
    });

    await settings.heroChoice('수입·지출').click();

    // 말없이 되돌아가면 눌리지 않은 것으로 보인다. 되돌아간 이유를 그 자리에서 말한다.
    await expect(settings.saveNotice).toBeVisible();
    await expect(settings.heroChoice('남은 예산')).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('설정 조회가 실패했을 때', () => {
  test.use({ consoleErrorAllowList: [/Failed to load resource[\s\S]*500/] });

  test('설정 화면이 그 사실을 말하고 다시 시도할 길을 준다', async ({ page, settings }) => {
    await page.route(`${E2E_API_URL}/api/v1/preferences`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 500, body: '{}' });
        return;
      }
      await route.continue();
    });

    await settings.open();

    // 덩어리가 통째로 사라지면 이런 설정이 있다는 것조차 알 수 없다.
    await expect(settings.loadFailure).toBeVisible();
    await expect(settings.retryButton).toBeVisible();
  });

  test('홈은 기본 화면으로 그리되 그 사실을 숨기지 않는다', async ({ home, page, prep }) => {
    await prep.setBudget(500_000);
    await page.route(`${E2E_API_URL}/api/v1/preferences`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 500, body: '{}' });
        return;
      }
      await route.continue();
    });

    await home.open();
    await home.waitReady();

    // 폴백 화면이 서버 기본값과 똑같이 생겨서, 이 한 줄이 없으면
    // "설정을 받아서 이 화면" 과 "못 받아서 떨어진 화면" 을 가를 방법이 없다.
    await expect(home.hero.preferencesNotice).toBeVisible();
    await expect(home.hero.remainingBudget).toBeVisible();
  });
});

test('예산이 없으면 미리보기가 실제로 보일 화면을 말한다', async ({ prep, settings }) => {
  // 예산 없이 '남은 예산' 을 골라 둔 사람. 홈은 그 갈래를 못 쓰고 쓴 돈으로 떨어진다.
  await prep.setHomeHero('remaining_budget');

  await settings.open();
  await settings.waitReady();

  // 고른 라벨만 되풀이하면 홈과 다른 말을 하는 안내가 된다.
  // 예산 미설정은 예외가 아니라 새로 온 사람의 기본 상태다.
  await expect(settings.preview).toHaveText(
    '아직 예산을 안 정해서, 홈 맨 위에 이번 달 쓴 돈이 보여요.',
  );
});

test('예산을 정하면 같은 설정에서 미리보기 문구가 바뀐다', async ({ prep, settings }) => {
  await prep.setHomeHero('remaining_budget');
  await prep.setBudget(500_000);

  await settings.open();
  await settings.waitReady();

  await expect(settings.preview).toHaveText('홈 맨 위에 남은 예산이 먼저 보여요.');
});

test('고른 값은 화면을 다시 열어도 남는다', async ({ settings }) => {
  await settings.open();
  await settings.waitReady();
  await settings.chooseHero('수입·예산');

  await settings.open();
  await settings.waitReady();

  // 저장이 실제로 서버까지 갔는지를 보는 자리다. 화면 상태만 바뀌고 끝났으면 여기서 걸린다.
  await expect(settings.heroChoice('수입·예산')).toHaveAttribute('aria-checked', 'true');
});

test('첫 사용자에게 표시 방식을 묻지 않는다', async ({ home, settings }) => {
  await home.open();
  await home.waitReady();

  // 첫 기록 전 필수 질문 0개가 이 제품의 원칙이다. 설정은 찾아 들어가는 것이지 묻는 것이 아니다.
  await expect(settings.anyDialog).toHaveCount(0);
  await expect(settings.anyChoiceGroup).toHaveCount(0);
});
