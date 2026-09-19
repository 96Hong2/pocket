import type { Page } from '@playwright/test';

import { shiftMonth, toLedgerDate } from '../../src/shared/lib/format';
import { logsNamed, setFullScreenAdFailure } from '../support/aitMock';
import type { PrepApi } from '../support/api';
import { expect, test } from '../support/fixtures';

/**
 * 전면 광고가 서는 세 자리와 그 상한.
 *
 * 여기서 지키는 것 둘이다. **광고가 어떻게 되든 기능은 열린다**, 그리고 **한 세션에
 * 한 편이다**. 자리를 늘리면서 상한을 안 두면, 자리마다 「여기는 괜찮다」 고 판단한 결과가
 * 한 사람에게 다 쌓인다.
 *
 * 생활비 계산기는 여기 없다. 사람이 스스로 광고와 맞바꾸겠다고 누르는 자리라 리워드
 * 광고로 나갔고 상한도 안 센다(ADR-0024). 그 둘이 서로를 안 갉아먹는지를 이 파일 끝에서 본다.
 *
 * 광고가 떴는지는 로그로 본다. 목 SDK 의 전면 광고는 화면을 가렸다가 1.5초 뒤 스스로
 * 닫혀서, 그 사이를 노려 잡으면 느린 러너에서 어긋난다.
 */

/** 가계부 시간대(KST) 기준으로 센다. 러너가 UTC 면 하루 어긋난다. */
function ledgerToday(): string {
  return toLedgerDate(new Date());
}

/** 결산 입구는 끝난 달에 기록이 있을 때만 선다. 지난달 한가운데에 한 건 심는다. */
async function seedLastMonth(prep: PrepApi): Promise<void> {
  const lastMonth = shiftMonth(ledgerToday().slice(0, 7), -1);
  await prep.addTransaction({ amount: 12_000, on: `${lastMonth}-15` });
}

/** 오늘 이미 몇 편을 본 것으로 두고 연다. 목 SDK 저장소는 접두사를 붙인 localStorage 다. */
async function seedWatchedToday(page: Page, count: number): Promise<void> {
  await page.addInitScript(
    ([day, seen]) => {
      try {
        window.localStorage.setItem('__ait_storage:ad-fullscreen-day', `${day}:${seen}`);
      } catch {
        /* 저장소를 못 여는 문서에서는 이 앱이 돌지 않는다. */
      }
    },
    [ledgerToday(), String(count)] as const,
  );
}

test('월말 결산은 광고 한 편을 지나 열린다', async ({ page, prep, report }) => {
  await seedLastMonth(prep);

  await report.open({ month: shiftMonth(ledgerToday().slice(0, 7), -1) });
  await report.waitReady();
  await report.closing.open();

  const logs = await logsNamed(page, 'interstitial_result');
  expect(logs.map((log) => [log.params.where, log.params.result])).toEqual([
    ['closing', 'watched'],
  ]);
});

test('광고를 못 불러와도 결산은 열린다. 광고 서버 사정으로 지난달을 막지 않는다', async ({
  page,
  prep,
  report,
}) => {
  await seedLastMonth(prep);

  await report.open({ month: shiftMonth(ledgerToday().slice(0, 7), -1) });
  await report.waitReady();
  await setFullScreenAdFailure(page, 'FAILED_TO_GET_LOADED_AD');

  await report.closing.open();

  const logs = await logsNamed(page, 'interstitial_result');
  expect(logs.map((log) => [log.params.where, log.params.result, log.params.reason])).toEqual([
    ['closing', 'skipped', 'failed'],
  ]);
});

test('홈 카드로 저절로 열리는 결산에는 광고를 세우지 않는다', async ({ page, prep, report }) => {
  await seedLastMonth(prep);

  await report.open({ month: shiftMonth(ledgerToday().slice(0, 7), -1), closing: true });
  await expect(report.closing.overlay).toBeVisible();

  expect(await logsNamed(page, 'interstitial_result')).toEqual([]);
});

test('자산 화면은 이 세션에 처음 들어올 때만 광고를 띄운다', async ({
  appShell,
  assets,
  manage,
  page,
}) => {
  await manage.open();
  await manage.waitReady();

  // 화면 안 링크로 들어간다. 주소로 열면 화면이 통째로 다시 떠서 세션이 새로 시작된다.
  await manage.assetsEntry.click();
  await assets.waitReady();

  await expect
    .poll(async () => (await logsNamed(page, 'interstitial_result')).length)
    .toBeGreaterThan(0);
  const first = await logsNamed(page, 'interstitial_result');
  expect(first.map((log) => [log.params.where, log.params.result])).toEqual([
    ['assets', 'watched'],
  ]);

  // 자산은 관리 아래 하위 화면이라 탭바가 없다. 시스템 뒤로가기로 부모에 돌아간다.
  await appShell.pressBack();
  await manage.waitReady();
  await manage.assetsEntry.click();
  await assets.waitReady();

  // 두 번째 진입에서는 아예 묻지 않는다. 로그도 늘지 않아야 자리별 수치가 「들어온 횟수」가
  // 아니라 「광고를 세운 횟수」로 남는다.
  await expect(assets.netWorth.or(assets.emptyTitle)).toBeVisible();
  expect((await logsNamed(page, 'interstitial_result')).length).toBe(1);
});

test('리포트에서 세 번째로 달을 옮길 때 광고가 한 편 서고, 더 옮겨도 다시 안 선다', async ({
  page,
  report,
}) => {
  await report.open();
  await report.waitReady();

  await report.goPreviousMonth();
  await report.goPreviousMonth();
  // 두 번까지는 무언가 확인하러 온 사람이다. 막지 않는다.
  expect(await logsNamed(page, 'interstitial_result')).toEqual([]);

  await report.goPreviousMonth();
  await expect
    .poll(async () => (await logsNamed(page, 'interstitial_result')).length)
    .toBe(1);
  const third = await logsNamed(page, 'interstitial_result');
  expect(third.map((log) => [log.params.where, log.params.result])).toEqual([
    ['report_months', 'watched'],
  ]);

  await report.goPreviousMonth();
  await report.goPreviousMonth();
  await report.goPreviousMonth();
  expect((await logsNamed(page, 'interstitial_result')).length).toBe(1);
});

test('하루 두 편을 다 본 사람에게는 안 띄운다. 기능은 그대로 열린다', async ({
  page,
  prep,
  report,
}) => {
  await seedLastMonth(prep);
  await seedWatchedToday(page, 2);

  await report.open({ month: shiftMonth(ledgerToday().slice(0, 7), -1) });
  await report.waitReady();
  await report.closing.open();

  const logs = await logsNamed(page, 'interstitial_result');
  expect(logs.map((log) => [log.params.where, log.params.result, log.params.reason])).toEqual([
    ['closing', 'skipped', 'capped'],
  ]);
});

test('하루 두 편을 다 본 사람도 계산기 광고는 본다. 스스로 맞바꾸겠다고 누른 자리다', async ({
  manage,
  page,
}) => {
  await seedWatchedToday(page, 2);

  await manage.open();
  await manage.waitReady();
  await manage.total.startButton.click();
  await manage.total.sheet.waitOpen();
  await manage.total.sheet.openCalc();
  await manage.calc.waitSheetOpen();

  /*
    상한에 걸렸다면 `skipped`·`capped` 로 남았을 자리다. 리워드 광고는 그 상한을 안 지난다.
    목 SDK 는 보상 이벤트를 안 보내므로 끝까지 본 `earned` 가 아니라 `watched` 로 끝난다.
  */
  const opened = await logsNamed(page, 'budget_calc_opened');
  expect(opened.map((log) => [log.params.ad, log.params.reason])).toEqual([['watched', undefined]]);

  // 계산기 광고는 전면 광고 장부에 안 적힌다. 적혔다면 이 로그가 생겼을 것이다.
  expect(await logsNamed(page, 'interstitial_result')).toEqual([]);
});

test('계산기 광고를 봐도 그 세션의 전면 광고 한 편은 그대로 남는다', async ({
  appShell,
  assets,
  manage,
  page,
}) => {
  await manage.open();
  await manage.waitReady();
  await manage.total.startButton.click();
  await manage.total.sheet.waitOpen();
  await manage.total.sheet.openCalc();
  await manage.calc.waitSheetOpen();

  // 시트를 닫고 같은 세션 그대로 자산으로 간다. 주소로 열면 세션이 새로 시작해 뜻이 없어진다.
  await appShell.pressBack();
  await manage.calc.waitClosed();
  await manage.assetsEntry.click();
  await assets.waitReady();

  await expect
    .poll(async () => (await logsNamed(page, 'interstitial_result')).length)
    .toBeGreaterThan(0);
  const logs = await logsNamed(page, 'interstitial_result');
  expect(logs.map((log) => [log.params.where, log.params.result])).toEqual([['assets', 'watched']]);
});
