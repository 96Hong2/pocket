import { logsNamed, readLogs } from '../support/aitMock';
import { expect, test } from '../support/fixtures';
import { shotBothWidths as shot } from '../support/shots';

/**
 * 배너 자리와 행동 로그.
 *
 * 둘을 한 파일에 둔 이유는 배너의 결과 자체가 로그로만 확인되기 때문이다.
 * 운영에서 광고 그룹 ID 를 빠뜨린 채 배포하면 아무 오류 없이 자리가 접힌다.
 * 그때 남는 유일한 실마리가 `ad_result` 다.
 *
 * 로그는 개발·샌드박스에서만 창에 사본이 남는다. 실기기 운영 판에서는 토스 수집기로만 간다.
 */

test('배너가 네 화면에 서고, 자리마다 결과를 남긴다', async ({
  appShell,
  home,
  page,
  settings,
}) => {
  await home.open();
  await home.waitReady();
  await expect(home.ads.slot).toHaveCount(1);
  await expect(home.ads.slot).toHaveAttribute('data-placement', 'home');

  await test.step('리포트에는 두 자리다. 도넛 위와 「큰 지출 Top 5」 위', async () => {
    await appShell.goToTab('리포트');
    const slots = page.getByTestId('ad-slot');
    // 앞 화면이 걷히고 이 화면의 자리 둘이 다 설 때까지 기다린다.
    await expect(slots).toHaveCount(2);
    /*
      **자리 이름이 서로 달라야 한다.** 같으면 뒤에 붙는 쪽이 쿨다운에 걸려 늘 접히고,
      로그에서도 어느 자리가 벌었는지 못 가른다.
    */
    await expect(slots.first()).toHaveAttribute('data-placement', 'report');
    await expect(slots.last()).toHaveAttribute('data-placement', 'report_bottom');

    await appShell.goToTab('관리');
    /*
      **자리 수를 먼저 기다린다.** 탭을 옮기는 사이 앞 화면이 아직 붙어 있을 수 있고,
      리포트에는 자리가 둘이라 그 찰나에 strict mode 로 죽는다(CI 에서만 그랬다).
    */
    await expect(page.getByTestId('ad-slot')).toHaveCount(1);
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
      expect(
        log.params.result,
        `광고 결과가 비어 있다: ${JSON.stringify(log.params)}`,
      ).toBeTruthy();
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

  await recordSheet.chooseWay('줄글');
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
  for (const [path, placement] of [
    // 자산은 그룹 목록 위 한 자리다(위치는 assets-v2.spec.ts 가 잰다).
    ['/assets', 'assets_top'],
    ['/goal', 'goal'],
  ] as const) {
    await page.goto(path);
    const slot = page.getByTestId('ad-slot');
    await expect(slot).toHaveAttribute('data-placement', placement);
  }
});

/**
 * 관리 탭만 예외다. 배너가 자산관리 바로 아래, 예산 위에 선다(사용자 지시).
 *
 * 예산 아래에 있던 배너는 옮겼다. 토스 광고 정책이 같은 화면에 같은 형식의 광고를 둘 이상
 * 두는 것을 막는다. 자리 이름만 보면 위치가 바뀐 것을 못 잡으니 자산 카드와 예산 사이에 있는지를 잰다.
 */
test('관리 탭 배너는 하나이고, 자산관리 바로 아래 예산 위에 선다', async ({
  manage,
  page,
  prep,
}) => {
  // 사진에 예산 카드가 실제 모양으로 서게 한다. 위치 단언은 예산 유무와 무관하다.
  await prep.setBudget(300_000);
  await prep.addExpense({ amount: 161_000, daysAgo: 0 });
  await manage.open();
  await manage.waitReady();
  const slot = page.getByTestId('ad-slot');
  await expect(slot).toHaveCount(1);
  await expect(slot).toHaveAttribute('data-placement', 'manage');

  const assets = await manage.assetsEntry.boundingBox();
  const ad = await slot.boundingBox();
  const budget = await page.getByRole('region', { name: '예산', exact: true }).boundingBox();
  expect(assets, '자산관리 카드가 안 보인다').not.toBeNull();
  expect(ad, '배너 자리가 안 보인다').not.toBeNull();
  expect(budget, '예산 자리가 안 보인다').not.toBeNull();
  if (assets == null || ad == null || budget == null) return;
  expect(ad.y).toBeGreaterThanOrEqual(assets.y + assets.height);
  expect(ad.y + ad.height).toBeLessThanOrEqual(budget.y);

  await shot(page, 'C_관리탭_위', page.getByRole('heading', { name: '관리', level: 1 }), 'start');
});

test('저축·투자 기록의 로그에 종목 이름, 수량, 금액이 없고 한 흐름으로 이어진다', async ({
  home,
  page,
  prep,
  recordSheet,
}) => {
  await prep.putAssets([{ group: 'cash', label: '비상금 통장', amount: 500_000 }]);

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.chooseKind('저축·투자');
  await recordSheet.addNewDest({ group: '투자', kind: '주식', name: '테스트전자' });
  await recordSheet.setQuantity('0.01234567');
  await recordSheet.amountHead.click();
  await recordSheet.input.enterAmount(73_519);
  await recordSheet.input.saveButton.click();
  await expect(recordSheet.feedback.headline).toHaveText('테스트전자에 73,519원 넣었어요');
  await recordSheet.assetsButton.click();
  await recordSheet.waitClosed();

  const logs = await readLogs(page);

  await test.step('저장과 자산 바뀜이 남는다', async () => {
    const saved = (await logsNamed(page, 'save_result')).at(-1);
    expect(saved?.params.result).toBe('ok');
    expect(saved?.params.kind).toBe('save');
    expect(saved?.params.qty).toBe('decimal');
    expect(saved?.params.dest_from).toBe('new');
    const changed = await logsNamed(page, 'asset_changed');
    expect(changed.map((log) => log.params.from)).toContain('record');
  });

  await test.step('기록 한 번의 로그가 같은 flow_id 로 이어진다', async () => {
    const flow = logs.filter((log) =>
      ['record_started', 'record_setup_done', 'save_requested', 'save_result', 'asset_changed'].includes(
        log.name,
      ),
    );
    // 다섯 이름이 다 있고, 모두 비지 않은 flow_id 를 실었다. 다 빠져도 크기가 1 이 되는 구멍을 막는다.
    expect(new Set(flow.map((log) => log.name)).size).toBe(5);
    for (const log of flow) {
      expect(typeof log.params.flow_id, log.name).toBe('string');
      expect(log.params.flow_id, log.name).not.toBe('');
    }
    expect(new Set(flow.map((log) => log.params.flow_id)).size).toBe(1);
  });

  await test.step('id 키를 뺀 모든 로그 값에 이름, 수량, 금액이 없다', async () => {
    const values = logs.map((log) => ({
      name: log.name,
      params: Object.fromEntries(
        Object.entries(log.params).filter(([key]) => !/(^|_)id$/.test(key)),
      ),
    }));
    const dump = JSON.stringify(values);
    for (const secret of ['테스트전자', '0.01234567', '1234567', '73519', '73,519']) {
      expect(dump, `로그에 적은 값이 새어 나갔다: ${secret}`).not.toContain(secret);
    }
  });
});
