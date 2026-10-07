import type { Locator, Page } from '@playwright/test';

import { formatCurrency } from '../../src/shared/lib/format';
import { TEST_IDS } from '../../src/shared/testIds';
import { logsNamed } from '../support/aitMock';
import type { AssetSeed, PrepApi } from '../support/api';
import { expect, test } from '../support/fixtures';
import { shotBothWidths } from '../support/shots';
import type { AssetsScreen } from '../screens/AssetsScreen';
import type { HomeScreen } from '../screens/HomeScreen';
import type { RecordSheet } from '../screens/RecordSheet';

/**
 * 팔았어요로 받은 돈을 넣을 곳(ADR-0049).
 *
 * 지키는 것:
 * - 팔고 난 저장 뒤 화면에 「받은 돈 넣을 곳」 한 줄이 선다. 누르면 「받은 돈을 어디에 넣었어요?」 창이
 *   예적금·현금 통장을 이름과 지금 금액으로 세운다. 고르면 그 통장이 받은 돈만큼 오른다.
 * - 창에는 앱이 그리는 뒤로 버튼이 없다. 토스 ‹ 와 같은 신호로 닫으면 저장 뒤 화면으로 돌아온다
 *   (기록 시트는 그대로다).
 * - 통장이 없으면 「새 통장」 에 이름만 적어 그 자리에서 만든다.
 * - 기록 고치기에서 같은 줄로 바꾸거나 비운다. 「넣었어요」 로 바꾸면 줄이 사라진다.
 *
 * 기대값은 손으로 셈했다. 삼성전자 10주를 700,000원에 가지고 있다(1주 70,000원).
 * 5주를 420,000원 받고 팔면 판 몫의 넣은 돈은 350,000원이라 수익이 +70,000원이다.
 * 카카오뱅크 1,000,000원에 받은 돈을 넣으면 1,420,000원이다.
 * 순자산은 2,200,000원에서 종목 -350,000원, 통장 +420,000원이라 2,270,000원이다.
 *
 * POCKET_SHOT_DIR 을 주면 바뀐 화면을 390, 344 폭으로 찍어 그 폴더에 둔다.
 */

const KAKAO: AssetSeed = { group: 'cash', label: '카카오뱅크', amount: 1_000_000 };
const TOSS: AssetSeed = { group: 'cash', label: '토스뱅크 통장', amount: 500_000 };
const SAMSUNG_TEN: AssetSeed = {
  group: 'investment',
  label: '삼성전자',
  kind: 'stock',
  quantity: '10',
  cost: 700_000,
  amount: 700_000,
};

/**
 * 사진에 개발용 표식(파란 AIT 버튼)과 데스크톱 스크롤바가 찍히지 않게 감춘다.
 * 배너 자리는 통째로 걷는다. 목이 그리는 점선 상자만 감추면 그 높이만큼 빈 틈이 남는다.
 */
async function shot(
  page: Page,
  name: string,
  focus?: Locator,
  block: 'start' | 'center' = 'center',
): Promise<void> {
  if ((process.env.POCKET_SHOT_DIR ?? '') === '') return;
  const hidden = ['.ait-panel-toggle', '.ait-panel', `[data-testid="${TEST_IDS.adSlot}"]`];
  await page.addStyleTag({
    content: `${hidden.join(',')}{display:none!important}*{scrollbar-width:none!important}`,
  });
  await shotBothWidths(page, name, focus, block);
}

type Seeded = Awaited<ReturnType<PrepApi['putAssets']>>;

/** 심은 자산에서 그 이름의 항목 키. */
function keyIn(seeded: Seeded, label: string): string {
  const key = seeded.items.find((item) => item.label === label)?.item_key;
  if (key == null) throw new Error(`${label} 항목 키가 없다`);
  return key;
}

/** 기록하기 › 저축·투자에서 삼성전자 5주를 420,000원 받고 판다. 끝나면 저장 뒤 화면이다. */
async function sellFiveFromRecord(home: HomeScreen, recordSheet: RecordSheet): Promise<void> {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.chooseKind('저축·투자');
  await recordSheet.pickDest('삼성전자');
  await recordSheet.toggleSide('팔았어요');
  await recordSheet.setQuantity('5');
  await recordSheet.amountHead.click();
  await recordSheet.input.enterAmount(420_000);
  await recordSheet.input.saveButton.click();
  await expect(recordSheet.feedback.headline).toHaveText('삼성전자 5주 팔았어요');
}

/** 내 자산 화면 항목 창의 「팔았어요」 로 같은 팔기를 적는다. */
async function sellFiveFromAssets(assets: AssetsScreen, recordSheet: RecordSheet): Promise<void> {
  await assets.open();
  await assets.waitReady();
  await assets.openEdit('삼성전자');
  await assets.sheet.sellButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.amountTitle).toHaveText('얼마 받았어요?');
  await recordSheet.setQuantity('5');
  await recordSheet.amountHead.click();
  await recordSheet.input.enterAmount(420_000);
  await recordSheet.input.saveButton.click();
  await expect(recordSheet.feedback.headline).toHaveText('삼성전자 5주 팔았어요');
}

test('팔고 난 저장 뒤 화면에서 받은 돈 넣을 곳을 고르면 그 통장이 받은 돈만큼 오르고 창의 뒤로가기는 저장 뒤 화면으로 돌아온다', async ({
  appShell,
  assets,
  home,
  page,
  prep,
  recordSheet,
}) => {
  test.slow();
  await prep.putAssets([KAKAO, TOSS, SAMSUNG_TEN]);

  await sellFiveFromRecord(home, recordSheet);

  await test.step('저장 뒤 화면: 수익과 남은 수량 아래에 「받은 돈 넣을 곳 고르기」 한 줄', async () => {
    await expect(recordSheet.savedAssetRow('gain')).toContainText('+70,000원');
    await expect(recordSheet.savedAssetRow('left')).toContainText('5주');
    await expect(recordSheet.proceedsRow).toHaveAccessibleName('받은 돈 넣을 곳 고르기');
    await expect(recordSheet.proceedsRow).toContainText('고르기');
    const row = await recordSheet.proceedsRow.boundingBox();
    const left = await recordSheet.savedAssetRow('left').boundingBox();
    // 줄 전체가 누르는 자리다. 「남은 수량」 줄 바로 아래에 선다.
    expect(row?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(row?.y ?? 0).toBeGreaterThanOrEqual((left?.y ?? 0) + (left?.height ?? 0) - 1);
    await expect(appShell.selfDrawnBackControls).toHaveCount(0);
    await shot(page, 'S_저장뒤_고르기전', recordSheet.proceedsRow);
  });

  await test.step('고르는 창: 예적금·현금 통장만 이름과 지금 금액으로 서고 뒤로 버튼이 없다', async () => {
    await recordSheet.proceedsRow.click();
    await expect(recordSheet.proceeds.title).toBeVisible();
    await expect(recordSheet.proceeds.accounts).toHaveCount(2);
    await expect(recordSheet.proceeds.account('카카오뱅크')).toContainText(
      formatCurrency(1_000_000),
    );
    await expect(recordSheet.proceeds.account('토스뱅크 통장')).toContainText(
      formatCurrency(500_000),
    );
    // 판 종목 자신은 넣을 곳이 아니다.
    await expect(recordSheet.proceeds.account('삼성전자')).toHaveCount(0);
    await expect(recordSheet.proceeds.picked).toHaveCount(0);
    await expect(recordSheet.proceeds.newButton).toBeVisible();
    // 아직 넣은 곳이 없어 「넣지 않기」 가 없다.
    await expect(recordSheet.proceeds.clearButton).toHaveCount(0);
    await expect(appShell.selfDrawnBackControls).toHaveCount(0);
    await shot(page, 'S_고르는창_통장둘', recordSheet.proceeds.title, 'start');
  });

  await test.step('토스 ‹ 와 같은 신호로 닫으면 창만 닫히고 저장 뒤 화면이 남는다', async () => {
    await appShell.pressBack();
    await expect(recordSheet.proceeds.dialog).toHaveCount(0);
    await expect(recordSheet.feedback.headline).toHaveText('삼성전자 5주 팔았어요');
    await expect(recordSheet.proceedsRow).toHaveAccessibleName('받은 돈 넣을 곳 고르기');
  });

  await test.step('통장을 고르면 창이 닫히고 그 줄에 통장 이름이 선다', async () => {
    await recordSheet.proceedsRow.click();
    await recordSheet.proceeds.account('카카오뱅크').click();
    await expect(recordSheet.proceeds.dialog).toHaveCount(0);
    await expect(recordSheet.proceedsRow).toHaveAccessibleName(
      '받은 돈 넣을 곳 카카오뱅크, 바꾸기',
    );
    await expect(recordSheet.proceedsRow).toBeEnabled();
    await expect(recordSheet.savedAssetRow('gain')).toContainText('+70,000원');
    await shot(page, 'S_저장뒤_고른뒤', recordSheet.proceedsRow);
  });

  await test.step('로그: 창을 연 것과 고른 결과만 남고 이름과 금액은 없다', async () => {
    const actions = await logsNamed(page, 'feedback_action');
    expect(actions.filter((log) => log.params.action === 'proceeds')).toHaveLength(2);
    const results = actions.filter((log) => log.params.action === 'proceeds_result');
    expect(results.map((log) => log.params.result)).toEqual(['picked']);
    expect(JSON.stringify(results)).not.toMatch(/카카오뱅크|420000|1420000/);
  });

  await test.step('다시 열면 고른 통장에 표시가 있고 「넣지 않기」 가 선다', async () => {
    await recordSheet.proceedsRow.click();
    await expect(recordSheet.proceeds.picked).toHaveCount(1);
    await expect(recordSheet.proceeds.picked).toContainText('카카오뱅크');
    await expect(recordSheet.proceeds.picked).toContainText(formatCurrency(1_420_000));
    await expect(recordSheet.proceeds.clearButton).toBeVisible();
    await shot(page, 'S_고르는창_고른뒤', recordSheet.proceeds.title, 'start');
    await appShell.pressBack();
    await expect(recordSheet.proceeds.dialog).toHaveCount(0);
  });

  await test.step('「자산 보기」: 통장이 받은 돈만큼 올랐고 순자산은 수익만큼만 늘었다', async () => {
    await recordSheet.assetsButton.click();
    await recordSheet.waitClosed();
    await assets.waitArrived();
    await expect(assets.row('카카오뱅크')).toContainText(formatCurrency(1_420_000));
    await expect(assets.row('토스뱅크 통장')).toContainText(formatCurrency(500_000));
    await expect(assets.row('삼성전자')).toContainText('5주 보유, 넣은 돈 350,000원');
    await expect(assets.netWorth).toHaveText(formatCurrency(2_270_000));
    await shot(page, 'S_내자산_통장오름', assets.row('카카오뱅크'));
  });
});

test('통장이 없으면 고르는 창에서 「새 통장」 에 이름만 적어 만들고, 칸을 편 채 뒤로가면 칸만 접힌다', async ({
  appShell,
  assets,
  page,
  prep,
  recordSheet,
}) => {
  test.slow();
  await prep.putAssets([SAMSUNG_TEN]);

  await sellFiveFromAssets(assets, recordSheet);
  await recordSheet.proceedsRow.click();

  await expect(recordSheet.proceeds.title).toBeVisible();
  await expect(recordSheet.proceeds.accounts).toHaveCount(0);
  await expect(recordSheet.proceeds.newButton).toBeVisible();
  await shot(page, 'S_고르는창_통장없음', recordSheet.proceeds.title, 'start');

  await recordSheet.proceeds.newButton.click();
  await expect(recordSheet.proceeds.nameInput).toBeFocused();
  // 이름이 비면 「확인」 이 꺼져 있다.
  await expect(recordSheet.proceeds.okButton).toBeDisabled();
  await expect(appShell.selfDrawnBackControls).toHaveCount(0);

  // 한 단계씩 물러난다. 칸이 접히고 창은 남는다.
  await appShell.pressBack();
  await expect(recordSheet.proceeds.nameInput).toHaveCount(0);
  await expect(recordSheet.proceeds.title).toBeVisible();

  await recordSheet.proceeds.newButton.click();
  await recordSheet.proceeds.nameInput.fill('카카오뱅크');
  await expect(recordSheet.proceeds.okButton).toBeEnabled();
  await shot(page, 'S_새통장_칸', recordSheet.proceeds.title, 'start');
  await recordSheet.proceeds.okButton.click();

  await expect(recordSheet.proceeds.dialog).toHaveCount(0);
  await expect(recordSheet.proceedsRow).toHaveAccessibleName('받은 돈 넣을 곳 카카오뱅크, 바꾸기');
  // 서버가 받는 동안 줄이 잠긴다. 풀리면 저장이 끝난 것이다.
  await expect(recordSheet.proceedsRow).toBeEnabled();
  const results = (await logsNamed(page, 'feedback_action')).filter(
    (log) => log.params.action === 'proceeds_result',
  );
  expect(results.map((log) => log.params.result)).toEqual(['created']);

  // 이미 자산 화면에서 열었다. 「확인」 으로 닫으면 새 통장이 받은 돈을 들고 서 있다.
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(assets.row('카카오뱅크')).toContainText(formatCurrency(420_000));
  await expect(assets.row('삼성전자')).toContainText('5주 보유, 넣은 돈 350,000원');
  // 700,000원에서 종목 -350,000원, 새 통장 +420,000원.
  await expect(assets.netWorth).toHaveText(formatCurrency(770_000));
});

test('기록 고치기에서 받은 돈 넣을 곳을 비우면 통장이 돌아오고 다른 통장으로 바꾸면 그 통장이 오른다', async ({
  appShell,
  assets,
  calendar,
  page,
  prep,
}) => {
  test.slow();
  const seeded = await prep.putAssets([KAKAO, TOSS, SAMSUNG_TEN]);
  await prep.addAssetTransfer({
    amount: 420_000,
    itemKey: keyIn(seeded, '삼성전자'),
    side: 'sell',
    quantity: '5',
    proceedsKey: keyIn(seeded, '카카오뱅크'),
    memo: '반만 팔았다',
  });

  await assets.open();
  await assets.waitReady();
  await expect(assets.row('카카오뱅크')).toContainText(formatCurrency(1_420_000));

  await test.step('팔았어요 기록에만 줄이 서고 「넣었어요」 로 바꾸면 사라진다', async () => {
    await calendar.open();
    await calendar.waitReady();
    await calendar.list.pick('반만 팔았다');
    await calendar.edit.waitOpen();
    await expect(calendar.edit.proceedsRow).toHaveAccessibleName(
      '받은 돈 넣을 곳 카카오뱅크, 바꾸기',
    );
    const row = await calendar.edit.proceedsRow.boundingBox();
    expect(row?.height ?? 0).toBeGreaterThanOrEqual(44);
    await shot(page, 'S_기록고치기_줄', calendar.edit.proceedsRow);

    await calendar.edit.sideOption('넣었어요').click();
    await expect(calendar.edit.proceedsRow).toHaveCount(0);
    await calendar.edit.sideOption('팔았어요').click();
    await expect(calendar.edit.proceedsRow).toHaveAccessibleName(
      '받은 돈 넣을 곳 카카오뱅크, 바꾸기',
    );
  });

  await test.step('같은 창에서 「넣지 않기」 로 비우고 「완료」 하면 통장이 돌아온다', async () => {
    await calendar.edit.proceedsRow.click();
    await expect(calendar.edit.proceeds.title).toBeVisible();
    await expect(calendar.edit.proceeds.picked).toContainText('카카오뱅크');
    await expect(appShell.selfDrawnBackControls).toHaveCount(0);
    // 뒤로가기는 창만 닫는다. 고치던 기록은 그대로 열려 있다.
    await appShell.pressBack();
    await expect(calendar.edit.proceeds.dialog).toHaveCount(0);
    await expect(calendar.edit.dialog).toBeVisible();

    await calendar.edit.proceedsRow.click();
    await calendar.edit.proceeds.clearButton.click();
    await expect(calendar.edit.proceeds.dialog).toHaveCount(0);
    await expect(calendar.edit.proceedsRow).toHaveAccessibleName('받은 돈 넣을 곳 고르기');
    await calendar.edit.done();
    await calendar.edit.waitClosed();

    await assets.open();
    await assets.waitReady();
    await expect(assets.row('카카오뱅크')).toContainText(formatCurrency(1_000_000));
    // 받은 돈이 어디에도 안 들어가 순자산이 판 종목 몫만큼 준다.
    await expect(assets.netWorth).toHaveText(formatCurrency(1_850_000));
  });

  await test.step('다시 열어 토스뱅크 통장을 고르고 「완료」 하면 그 통장이 받은 돈만큼 오른다', async () => {
    await calendar.open();
    await calendar.waitReady();
    await calendar.list.pick('반만 팔았다');
    await calendar.edit.waitOpen();
    await expect(calendar.edit.proceedsRow).toHaveAccessibleName('받은 돈 넣을 곳 고르기');
    await calendar.edit.proceedsRow.click();
    await calendar.edit.proceeds.account('토스뱅크 통장').click();
    await expect(calendar.edit.proceedsRow).toHaveAccessibleName(
      '받은 돈 넣을 곳 토스뱅크 통장, 바꾸기',
    );
    await calendar.edit.done();
    await calendar.edit.waitClosed();

    await assets.open();
    await assets.waitReady();
    await expect(assets.row('토스뱅크 통장')).toContainText(formatCurrency(920_000));
    await expect(assets.row('카카오뱅크')).toContainText(formatCurrency(1_000_000));
    await expect(assets.netWorth).toHaveText(formatCurrency(2_270_000));
  });
});

test('금액으로 적는 펀드의 팔기 기록도 고치기에 줄이 서고, 금액만 고치면 넣은 통장이 따라간다', async ({
  assets,
  calendar,
  prep,
}) => {
  // 펀드 1,000,000원을 전부 1,200,000원 받고 팔아 토스뱅크 통장(500,000원)에 넣었다: 1,700,000원.
  const seeded = await prep.putAssets([
    TOSS,
    { group: 'investment', label: 'S&P500 펀드', kind: 'fund', amount: 1_000_000, cost: 1_000_000 },
  ]);
  await prep.addAssetTransfer({
    amount: 1_200_000,
    itemKey: keyIn(seeded, 'S&P500 펀드'),
    side: 'sell',
    remaining: '0',
    proceedsKey: keyIn(seeded, '토스뱅크 통장'),
    memo: '펀드 정리',
  });

  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('펀드 정리');
  await calendar.edit.waitOpen();
  // 금액 종목은 「넣었어요 | 팔았어요」 를 고르지 않는다. 적혀 있던 쪽이 팔았어요라 줄이 선다.
  await expect(calendar.edit.sideOption('팔았어요')).toHaveCount(0);
  await expect(calendar.edit.proceedsRow).toHaveAccessibleName(
    '받은 돈 넣을 곳 토스뱅크 통장, 바꾸기',
  );

  // 넣을 곳은 건드리지 않고 받은 돈만 1,300,000원으로 고친다. 통장은 500,000 + 1,300,000 이다.
  await calendar.edit.amount.fill('1300000');
  await calendar.edit.done();
  await calendar.edit.waitClosed();

  await assets.open();
  await assets.waitReady();
  await expect(assets.row('토스뱅크 통장')).toContainText(formatCurrency(1_800_000));
  await expect(assets.netWorth).toHaveText(formatCurrency(1_800_000));
});

test.describe('서버가 넣을 곳을 막았을 때', () => {
  test.use({
    // 서버가 422 로 막는 것이 확인하려는 일이다. 브라우저가 적는 줄이고 앱이 낸 오류가 아니다.
    consoleErrorAllowList: [/Failed to load resource[\s\S]*422/],
  });

  test('고르는 사이 그 통장이 예적금·현금이 아니게 됐으면 서버 문구가 줄 아래에 뜨고 줄은 「고르기」 로 돌아온다', async ({
    assets,
    home,
    prep,
    recordSheet,
  }) => {
    test.slow();
    const seeded = await prep.putAssets([KAKAO, SAMSUNG_TEN]);

    await sellFiveFromRecord(home, recordSheet);
    await recordSheet.proceedsRow.click();
    await expect(recordSheet.proceeds.account('카카오뱅크')).toBeVisible();

    // 창이 떠 있는 사이 다른 기기에서 그 통장을 보증금·기타로 옮겼다. 화면의 목록은 아직 옛 것이다.
    await prep.putAssets([
      {
        group: 'deposit',
        label: '카카오뱅크',
        amount: 1_000_000,
        itemKey: keyIn(seeded, '카카오뱅크'),
      },
      {
        group: 'investment',
        label: '삼성전자',
        amount: 350_000,
        itemKey: keyIn(seeded, '삼성전자'),
      },
    ]);
    await recordSheet.proceeds.account('카카오뱅크').click();

    await expect(recordSheet.proceeds.dialog).toHaveCount(0);
    await expect(recordSheet.feedback.notice).toHaveText(
      '받은 돈은 예적금·현금 항목에만 넣을 수 있어요.',
    );
    // 먼저 세워 둔 이름은 걷히고 다시 고를 수 있다.
    await expect(recordSheet.proceedsRow).toHaveAccessibleName('받은 돈 넣을 곳 고르기');
    await expect(recordSheet.proceedsRow).toBeEnabled();

    // 통장 금액은 안 움직였다. 판 기록은 그대로 저장돼 있다.
    await recordSheet.assetsButton.click();
    await recordSheet.waitClosed();
    await assets.waitArrived();
    await expect(assets.row('카카오뱅크')).toContainText(formatCurrency(1_000_000));
    await expect(assets.row('삼성전자')).toContainText('5주 보유, 넣은 돈 350,000원');
  });
});

test('가장 좁은 344 폭에서 통장 이름이 길어도 「받은 돈 넣을 곳」 줄이 옆으로 넘치지 않는다', async ({
  home,
  page,
  prep,
  recordSheet,
}) => {
  test.slow();
  const long = '카카오뱅크 세이프박스 비상금 통장';
  await prep.putAssets([{ group: 'cash', label: long, amount: 1_000_000 }, SAMSUNG_TEN]);

  await sellFiveFromRecord(home, recordSheet);
  await recordSheet.proceedsRow.click();
  await recordSheet.proceeds.account(long).click();
  await expect(recordSheet.proceedsRow).toHaveAccessibleName(`받은 돈 넣을 곳 ${long}, 바꾸기`);
  await expect(recordSheet.proceedsRow).toBeEnabled();

  await page.setViewportSize({ width: 344, height: 882 });
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(344);

  const row = await recordSheet.proceedsRow.boundingBox();
  expect((row?.x ?? -1) >= 0 && (row?.x ?? 0) + (row?.width ?? 999) <= 344).toBe(true);
  expect(await recordSheet.horizontalScrollers()).toEqual([]);
  // 이름표는 줄어들지 않고 그대로 읽힌다. 긴 이름은 값 칸 안에서 말줄임된다.
  await expect(recordSheet.proceedsRow).toContainText('받은 돈 넣을 곳');
  await shot(page, 'S_저장뒤_긴이름', recordSheet.proceedsRow);
});
