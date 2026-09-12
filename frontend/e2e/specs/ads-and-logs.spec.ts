import { logsNamed, readLogs } from '../support/aitMock';
import { expect, test } from '../support/fixtures';

/**
 * 배너 자리와 행동 로그.
 *
 * 둘을 한 파일에 둔 이유는 배너의 결과 자체가 로그로만 확인되기 때문이다.
 * 운영에서 광고 그룹 ID 를 빠뜨린 채 배포하면 아무 오류 없이 자리가 접힌다.
 * 그때 남는 유일한 실마리가 `ad_result` 다.
 *
 * 로그는 개발·샌드박스에서만 창에 사본이 남는다. 실기기 운영 판에서는 토스 수집기로만 간다.
 */

test('배너가 네 화면에 서고, 자리마다 결과를 남긴다', async ({ appShell, home, page, settings }) => {
  await home.open();
  await home.waitReady();
  await expect(home.ads.slot).toHaveCount(1);
  await expect(home.ads.slot).toHaveAttribute('data-placement', 'home');

  await test.step('리포트와 관리에도 한 자리씩', async () => {
    await appShell.goToTab('리포트');
    await expect(page.getByTestId('ad-slot')).toHaveAttribute('data-placement', 'report');

    await appShell.goToTab('관리');
    await expect(page.getByTestId('ad-slot')).toHaveAttribute('data-placement', 'manage');
  });

  await test.step('앱 설정의 버전 줄 아래에도', async () => {
    await settings.open();
    await settings.waitReady();
    await expect(settings.adSlot).toHaveAttribute('data-placement', 'settings');
    /*
      결과 로그는 배너가 붙거나 접힌 뒤에 남는다. 자리가 선 것만 보고 로그를 읽으면
      아직 기다리는 중일 수 있다. 붙이기 전에 기기 설정을 한 번 읽으므로 그만큼 늦다.
    */
    await expect(settings.adSlot).not.toHaveAttribute('data-state', 'waiting');
  });

  await test.step('자리마다 결과가 남는다', async () => {
    const results = await logsNamed(page, 'ad_result');
    // 앱 설정으로 옮기며 화면이 새로 뜨므로 그 화면 것만 확실히 있다.
    expect(results.map((log) => log.params.placement)).toContain('settings');
    for (const log of results) {
      expect(log.params.result, `광고 결과가 비어 있다: ${JSON.stringify(log.params)}`).toBeTruthy();
    }
  });
});

test('같은 자리로 곧바로 돌아오면 배너를 다시 요청하지 않는다', async ({
  appShell,
  home,
  page,
}) => {
  await home.open();
  await home.waitReady();
  await expect(home.ads.banner).toBeVisible();

  // 탭을 오갈 때마다 새 요청이 나가면 노출 수가 부풀려진다(ADR-0004 개정).
  await appShell.goToTab('리포트');
  await appShell.goToTab('홈');
  await home.waitReady();

  const home방문 = (await logsNamed(page, 'ad_result')).filter(
    (log) => log.params.placement === 'home',
  );
  expect(home방문.at(-1)?.params.result).toBe('cooldown');
  await expect(home.ads.slot).not.toBeVisible();
});

test('기록 흐름 하나가 같은 값으로 이어지고, 적은 내용은 남지 않는다', async ({
  home,
  page,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('점심 12000');
  await recordSheet.nl.save();

  const logs = await readLogs(page);
  const names = logs.map((log) => log.name);

  await test.step('시작부터 저장까지 다 남는다', async () => {
    expect(names).toContain('app_open');
    expect(names).toContain('record_started');
    expect(names).toContain('parse_started');
    expect(names).toContain('parse_finished');
    expect(names).toContain('review_shown');
    expect(names).toContain('save_requested');
    expect(names).toContain('save_result');
  });

  await test.step('한 흐름은 같은 flow_id 로 묶인다', async () => {
    const flowed = logs.filter((log) => log.params.flow_id != null);
    const ids = new Set(flowed.map((log) => log.params.flow_id));
    expect(ids.size, '한 번 기록했는데 흐름이 여럿으로 갈렸다').toBe(1);
  });

  await test.step('저장은 서버가 답한 뒤에만 성공이다', async () => {
    const saved = (await logsNamed(page, 'save_result')).at(-1);
    expect(saved?.params.result).toBe('ok');
    expect(saved?.params.created_count).toBe(1);
    // 시간을 재지 않으면 AI 대기인지 사람이 고친 시간인지 가를 수 없다.
    expect(Number(saved?.params.elapsed_ms)).toBeGreaterThanOrEqual(0);
  });

  await test.step('적은 문장도 금액도 어느 로그에도 없다', async () => {
    const dump = JSON.stringify(logs);
    for (const secret of ['점심', '12000']) {
      expect(dump, `로그에 입력이 새어 나갔다: ${secret}`).not.toContain(secret);
    }
  });
});

test('앱 정보 시트가 지금 어느 판인지 말해 준다', async ({ settings }) => {
  await settings.open();
  await settings.waitReady();

  // 실기기에서 판을 볼 자리가 여기 말고는 없다. 로그는 운영 판에서만 실제로 나간다.
  await settings.versionRow.click();
  await expect(settings.diagnosticsSheet).toBeVisible();

  // e2e 는 devtools 목 SDK 가 주입돼 샌드박스로 잡힌다. 운영이면 여기가 「운영 (toss)」 다.
  const shown = settings.diagnostics;
  await expect(shown).toContainText('테스트 (sandbox)');
  await expect(shown).toContainText('배포');
  await expect(shown).toContainText('기기');
});

test('이 기기에서 광고를 끄면 빈 자리만 남고 그 이유가 남는다', async ({ page, settings }) => {
  await settings.open();
  await settings.waitReady();
  await expect(settings.adSlot).toBeVisible();

  await settings.versionRow.click();
  await settings.adOptOutToggle.click();
  await expect(settings.adOptOutToggle).toHaveAttribute('aria-checked', 'true');

  // 만든 사람이 자기 광고를 보면 무효 트래픽으로 잡힌다. 판으로만 가르면 QR 테스트에서 샌다.
  await settings.open();
  await settings.waitReady();
  await expect(settings.adSlot).toHaveAttribute('data-state', 'preview');

  // 접지 않고 같은 크기로 남긴다. 접어 버리면 배너가 들어간 화면을 확인할 수 없다.
  await expect(settings.adSlot).toContainText('광고 자리');

  const results = (await logsNamed(page, 'ad_result')).filter(
    (log) => log.params.placement === 'settings',
  );
  expect(results.at(-1)?.params.result).toBe('opted_out');
});

test('배너 자리는 화면마다 흐름을 끊지 않는 끝자리에 선다', async ({ page }) => {
  // 예산과 하위 화면 사이처럼 할 일 한가운데에 두면 어색하다. 여섯 자리를 끝으로 몰았다.
  for (const [path, placement] of [
    ['/manage', 'manage'],
    ['/assets', 'assets'],
    ['/goal', 'goal'],
  ] as const) {
    await page.goto(path);
    const slot = page.getByTestId('ad-slot');
    await expect(slot).toHaveAttribute('data-placement', placement);
  }
});
