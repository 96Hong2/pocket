import type { Page } from '@playwright/test';

import { shiftMonth, toLedgerDate } from '../../src/shared/lib/format';
import { logsNamed, setFullScreenAdFailure } from '../support/aitMock';
import type { PrepApi } from '../support/api';
import { expect, test } from '../support/fixtures';

/**
 * 전면 광고가 서는 자리와 그 상한, 그리고 광고를 세우지 않기로 한 자리들.
 *
 * 여기서 지키는 것 넷이다. **광고가 어떻게 되든 기능은 열린다**, **한 세션에 한 편이다**,
 * **누르기 전에 광고가 있다고 적혀 있다**, 그리고 **광고 바로 전에 한 번 묻는다**.
 *
 * 넷째는 2026-09-23 콘솔 반려로 생겼다. 사유는 「유저가 예상하기 어려운 시점에 광고가
 * 노출돼요. 광고 노출 전에 유저가 인지할 수 있도록 CTA 문구나 UI를 추가해 주세요」 였다.
 * 버튼 곁에 적어 두는 것과 **묻는 것**은 다르다. 적어 둔 것은 안 읽고 누른 사람에게
 * 아무 예고도 아니다.
 *
 * 한 사람이 겪는 총량이 늘지 않는다는 것이 이 파일이 지키는 가장 중요한 것이다.
 * 자리마다 「여기는 괜찮다」 고 더하기 시작하면 아무도 총량을 안 세게 된다.
 *
 * **관리 탭 하위 화면 다섯에는 광고를 세우지 않는다(ADR-0039).** 원래 열리던 화면 앞을
 * 막아선 광고라 토스 노출 정책의 UX 원칙 2 에 걸렸다. 되돌아가지 않게 여기서 못 박는다.
 *
 * 리포트에서 옛날 달을 세 번 훑었을 때는 여전히 뺀 자리다. 화살표를 누른 것 말고는
 * 아무것도 안 한 사람이고 적어 둘 자리도 없다. 그것이 되돌아가지 않게 여기서 못 박는다.
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

test('관리 탭 하위 화면과 자산은 광고 없이 바로 열린다. 예고도 확인 창도 없다', async ({
  appShell,
  assets,
  categories,
  manage,
  page,
}) => {
  await manage.open();
  await manage.waitReady();

  // 광고를 걷었는데 예고만 남으면 거짓말이다.
  await expect(manage.anyAdNote).toHaveCount(0);

  await manage.openSub('카테고리 관리');
  await categories.waitReady();
  await expect(manage.adConsent).toHaveCount(0);

  await appShell.pressBack();
  await manage.waitReady();
  await manage.openAssets();
  await assets.waitReady();
  await expect(manage.adConsent).toHaveCount(0);

  expect(
    await logsNamed(page, 'interstitial_result'),
    '관리 탭 하위 화면에 전면 광고가 돌아왔다',
  ).toEqual([]);
});

test('관리 탭 줄은 전부 링크다. 광고가 순서를 쥘 까닭이 없다', async ({ manage }) => {
  await manage.open();
  await manage.waitReady();

  const labels = ['목표', '카테고리 관리', '태그', '반복 지출', '알림 설정', '내 계정', '앱 설정'];
  for (const label of labels) {
    await expect(manage.subScreenRow(label)).toBeVisible();
  }
});

test('같은 세션에서 결산을 두 번 열어도 광고는 한 편뿐이다. 두 번째는 그대로 열린다', async ({
  appShell,
  page,
  prep,
  report,
}) => {
  await seedLastMonth(prep);

  await report.open({ month: shiftMonth(ledgerToday().slice(0, 7), -1) });
  await report.waitReady();
  await report.closing.open();
  await appShell.pressBack();
  await expect(report.closing.overlay).toHaveCount(0);

  // 두 번째는 묻지도 않는다. 안 뜰 광고를 물으면 방해일 뿐이다.
  await report.closing.card.click();
  await expect(report.closing.overlay).toBeVisible();
  await expect(report.closing.adConsent).toHaveCount(0);

  const logs = await logsNamed(page, 'interstitial_result');
  expect(logs.map((log) => [log.params.where, log.params.result, log.params.reason])).toEqual([
    ['closing', 'watched', undefined],
    ['closing', 'skipped', 'capped'],
  ]);
});

test('상한을 다 쓴 사람에게는 결산 예고도 안 보인다. 안 뜰 광고를 적어 두면 예고가 아니다', async ({
  page,
  prep,
  report,
}) => {
  await seedLastMonth(prep);
  await seedWatchedToday(page, 2);

  await report.open({ month: shiftMonth(ledgerToday().slice(0, 7), -1) });
  await report.waitReady();

  await expect(report.closing.card).toBeVisible();
  await expect(report.closing.adNote).toBeHidden();
});

test('리포트에서 달을 여러 번 옮겨도 광고가 뜨지 않는다. 화살표를 누른 것뿐이다', async ({
  page,
  report,
}) => {
  await report.open();
  await report.waitReady();

  await report.goPreviousMonth();
  await report.goPreviousMonth();
  await report.goPreviousMonth();
  await report.goPreviousMonth();

  expect(
    await logsNamed(page, 'interstitial_result'),
    '달 이동에 전면 광고가 돌아왔다',
  ).toEqual([]);
});

test('결산 입구는 누르기 전에 광고가 있다고 적어 둔다', async ({ prep, report }) => {
  await seedLastMonth(prep);

  await report.open({ month: shiftMonth(ledgerToday().slice(0, 7), -1) });
  await report.waitReady();

  // 눌러서 광고를 보기 **전에** 읽혀야 한다. 누른 뒤에 나오는 말은 예고가 아니다.
  await expect(report.closing.adNote).toBeVisible();
  await expect(report.closing.adNote).toHaveText(/광고/);
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
  manage,
  page,
  prep,
  report,
}) => {
  await seedLastMonth(prep);

  await manage.open();
  await manage.waitReady();
  await manage.total.startButton.click();
  await manage.total.sheet.waitOpen();
  await manage.total.sheet.openCalc();
  await manage.calc.waitSheetOpen();

  // 시트를 닫고 같은 세션 그대로 결산으로 간다. 주소로 열면 세션이 새로 시작해 뜻이 없어진다.
  await appShell.pressBack();
  await manage.calc.waitClosed();
  await appShell.goToTab('리포트');
  await report.waitReady();
  // 결산 입구는 끝난 달에 있다. 탭으로 들어오면 이번 달이라 한 달 뒤로 옮긴다.
  await report.goPreviousMonth();
  await report.closing.open();

  const logs = await logsNamed(page, 'interstitial_result');
  expect(logs.map((log) => [log.params.where, log.params.result])).toEqual([['closing', 'watched']]);
});


// ── 광고 바로 전에 묻는다 (2026-09-23 반려 대응) ──────────────────

test('결산 확인 창에서 닫으면 광고도 안 뜨고 결산도 안 열린다', async ({ page, prep, report }) => {
  await seedLastMonth(prep);

  await report.open({ month: shiftMonth(ledgerToday().slice(0, 7), -1) });
  await report.waitReady();
  await report.closing.card.click();
  await expect(report.closing.adConsent).toBeVisible();
  // 무엇을 열려다 광고를 보는지가 적혀 있어야 한다. 「광고가 나와요」 만으로는 모른다.
  await expect(report.closing.adConsent).toContainText('결산');

  await report.closing.adConsentCancel.click();

  await expect(report.closing.adConsent).toBeHidden();
  await expect(report.closing.overlay).toHaveCount(0);
  expect(await logsNamed(page, 'interstitial_result')).toEqual([]);
});

test('상한을 다 쓴 사람에게는 결산 앞에서 묻지도 않는다', async ({ page, prep, report }) => {
  await seedLastMonth(prep);
  await seedWatchedToday(page, 2);

  await report.open({ month: shiftMonth(ledgerToday().slice(0, 7), -1) });
  await report.waitReady();
  await report.closing.card.click();

  // 곧바로 열린다. 물을 것이 없다.
  await expect(report.closing.overlay).toBeVisible();
  await expect(report.closing.adConsent).toHaveCount(0);
});

test('확인 창에서 뒤로가기를 누르면 창만 닫힌다. 앱이 닫히면 안 된다', async ({
  appShell,
  page,
  prep,
  report,
}) => {
  await seedLastMonth(prep);

  await report.open({ month: shiftMonth(ledgerToday().slice(0, 7), -1) });
  await report.waitReady();
  await report.closing.card.click();
  await expect(report.closing.adConsent).toBeVisible();

  await appShell.pressBack();

  await expect(report.closing.adConsent).toBeHidden();
  // 리포트 그대로다. 등록을 안 하면 스택이 비어 `closeApp()` 으로 떨어진다.
  await expect(report.closing.card).toBeVisible();
  expect(await logsNamed(page, 'interstitial_result')).toEqual([]);
});

test('묻는 창이 떠 있는 동안 탭바를 누를 수 없다', async ({ prep, report }) => {
  await seedLastMonth(prep);

  await report.open({ month: shiftMonth(ledgerToday().slice(0, 7), -1) });
  await report.waitReady();
  await report.closing.card.click();
  await expect(report.closing.adConsent).toBeVisible();

  /*
    딤이 탭바를 덮어야 한다. z-index 를 탭바(40) 아래 두면 탭바가 뚫고 나와 눌리고,
    광고를 묻는 창을 띄운 채 다른 탭으로 나갈 수 있다. `alertdialog` 가 말하는 것과
    화면이 달라진다.
  */
  const blocked = await report.closing.adConsent.evaluate((dim) => {
    const tab = document.querySelector('.tabbar__inner a, .tabbar__inner button');
    if (tab == null) return 'no-tab';
    const box = tab.getBoundingClientRect();
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return dim.contains(top) || top === dim ? 'covered' : 'exposed';
  });
  expect(blocked, '탭바가 딤 위로 뚫고 나왔다').toBe('covered');
});
