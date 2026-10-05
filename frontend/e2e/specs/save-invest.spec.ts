import type { Locator } from '@playwright/test';

import { formatCurrency } from '../../src/shared/lib/format';
import { logsNamed } from '../support/aitMock';
import type { AssetSeed } from '../support/api';
import { expect, test } from '../support/fixtures';
import type { HomeScreen } from '../screens/HomeScreen';
import type { RecordSheet } from '../screens/RecordSheet';

/**
 * 기록하기의 저축·투자.
 *
 * 지키는 것:
 * - 넷째 종류 「저축·투자」 는 분류 대신 「어디에」 를 고른다. 두 칸 격자에 매달 넣는 항목이
 *   먼저 서고 다섯 칸 뒤에 「다른 곳」 이 붙는다. 고르면 한 줄로 접힌다.
 * - 주식, ETF, 코인은 수량이 있어야 저장된다. 수량 칸이 먼저 골라지고 키패드 왼쪽 아래가 「.」 이다.
 * - 팔 때 제목은 「얼마 받았어요?」 이고 저장 전에 평균 넣은 돈 기준 수익이 크게 보인다.
 * - 저장해도 홈 남은 예산과 지출은 그대로다. 그 항목의 보유와 넣은 돈이 움직인다.
 *
 * 기대값은 PRD 확인 항목과 수익률 검산 표 ①(2주 500,000원, 1주를 300,000원 받고 → +50,000원, +20%)에서 왔다.
 */

async function openSaveInvest(home: HomeScreen, recordSheet: RecordSheet): Promise<void> {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.chooseKind('저축·투자');
}

/** 이름이 칸 안에 다 들어갔나. 말줄임이나 줄 수 제한으로 잘리면 넘친 만큼 남는다. */
async function clipped(name: Locator): Promise<{ x: number; y: number }> {
  return name.evaluate((el) => ({
    x: el.scrollWidth - el.clientWidth,
    y: el.scrollHeight - el.clientHeight,
  }));
}

const SAMSUNG_TWO: AssetSeed = {
  group: 'investment',
  label: '삼성전자',
  kind: 'stock',
  quantity: '2',
  cost: 500_000,
  amount: 500_000,
};

test('저축·투자를 저장하면 어디에 얼마 넣었는지 말하고 홈 남은 예산과 지출은 그대로다', async ({
  assets,
  home,
  page,
  prep,
  recordSheet,
}) => {
  await prep.putAssets([
    { group: 'cash', label: '청년도약계좌', amount: 1_000_000, monthly: 300_000 },
  ]);
  await prep.setBudget(1_000_000);
  await prep.addTransaction({ amount: 100_000 });

  await home.open();
  await home.waitReady();
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(900_000));
  await expect(home.today.spentTotal).toHaveText('100,000원 씀');

  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.chooseKind('저축·투자');
  await expect(recordSheet.amountTitle).toHaveText('얼마를 어디에 넣었어요?');
  await recordSheet.pickDest('청년도약계좌');
  await recordSheet.input.enterAmount(300_000);
  await recordSheet.input.saveButton.click();

  await expect(recordSheet.feedback.headline).toHaveText('청년도약계좌에 300,000원 넣었어요');
  await expect(recordSheet.assetsButton).toBeVisible();
  // 이체라 결제 수단과 태그가 없다.
  await expect(page.getByRole('group', { name: '결제 수단' })).toHaveCount(0);

  const saved = (await logsNamed(page, 'save_result')).at(-1);
  expect(saved?.params.kind).toBe('save');
  expect(saved?.params.dest_from).toBe('grid');

  await recordSheet.assetsButton.click();
  await recordSheet.waitClosed();
  await expect(page).toHaveURL(/\/assets$/);
  await assets.waitReady();
  await expect(assets.row('청년도약계좌')).toContainText(formatCurrency(1_300_000));
  expect((await logsNamed(page, 'feedback_action')).map((log) => log.params.action)).toContain(
    'assets',
  );

  await home.open();
  await home.waitReady();
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(900_000));
  await expect(home.today.spentTotal).toHaveText('100,000원 씀');
  await expect(home.today.row('저축·투자')).toBeVisible();
});

test('「다른 곳」 → 「새 종목이나 통장」 으로 종류와 이름만 적으면 그 종목이 골라져 돌아오고 수량 없이는 저장이 꺼진다', async ({
  assets,
  home,
  page,
  prep,
  recordSheet,
}) => {
  await prep.putAssets([{ group: 'cash', label: '비상금 통장', amount: 500_000 }]);

  await openSaveInvest(home, recordSheet);
  await recordSheet.addNewDest({ group: '투자', kind: '주식', name: '네이버' });

  await expect(recordSheet.destPicked).toContainText('네이버');
  // 저장 전 새 종목은 팔 보유가 없어 「넣었어요 | 팔았어요」 가 없다.
  await expect(recordSheet.sideOption('팔았어요')).toHaveCount(0);
  await expect(recordSheet.quantityBox).toHaveAttribute('aria-pressed', 'true');

  await recordSheet.amountHead.click();
  await recordSheet.input.enterAmount(450_000);
  await expect(recordSheet.input.saveButton).toBeDisabled();

  await recordSheet.setQuantity('3');
  await expect(recordSheet.quantityBox).toHaveAttribute('aria-label', '수량 3주');
  await expect(recordSheet.input.saveButton).toBeEnabled();
  await recordSheet.input.saveButton.click();

  await expect(recordSheet.feedback.headline).toHaveText('네이버에 450,000원 넣었어요');
  const changed = await logsNamed(page, 'asset_changed');
  expect(changed.map((log) => [log.params.action, log.params.from])).toContainEqual([
    'created',
    'record',
  ]);
  expect((await logsNamed(page, 'save_result')).at(-1)?.params.dest_from).toBe('new');

  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await assets.open();
  await assets.waitReady();
  await expect(assets.row('네이버')).toContainText('3주 보유, 넣은 돈 450,000원');
  await expect(assets.rowChip('네이버', '주식')).toBeVisible();
});

test('펀드는 수량 칸 없이 금액만, 주식은 수량 칸이 먼저 골라지고 금액 숫자를 누르면 금액을 친다', async ({
  assets,
  home,
  page,
  prep,
  recordSheet,
}) => {
  await prep.putAssets([
    { group: 'investment', label: 'S&P500 펀드', kind: 'fund', amount: 1_000_000, cost: 1_000_000 },
    { ...SAMSUNG_TWO, quantity: '1', cost: 250_000, amount: 250_000 },
  ]);

  await openSaveInvest(home, recordSheet);

  await test.step('펀드: 수량 칸이 없고 금액만 있으면 저장된다', async () => {
    await recordSheet.pickDest('S&P500 펀드');
    await expect(recordSheet.quantityBox).toHaveCount(0);
    await expect(recordSheet.sideOption('넣었어요')).toBeVisible();
    await recordSheet.input.enterAmount(10_000);
    await expect(recordSheet.input.saveButton).toBeEnabled();
  });

  await test.step('주식: 수량 칸이 먼저 골라져 키패드가 수량을 친다', async () => {
    await recordSheet.pickDest('삼성전자');
    await expect(recordSheet.quantityBox).toHaveAttribute('aria-pressed', 'true');
    await expect(recordSheet.sideOption('넣었어요')).toHaveAttribute('aria-checked', 'true');
    const amountBefore = await recordSheet.input.amountText.innerText();
    await recordSheet.input.numberKey('1').click();
    await expect(recordSheet.quantityBox).toHaveAttribute('aria-label', '수량 1주');
    // 누른 키는 수량으로 갔고 금액은 그대로다.
    await expect(recordSheet.input.amountText).toHaveText(amountBefore);
  });

  await test.step('금액 숫자를 누르면 다시 금액을 친다', async () => {
    await recordSheet.amountHead.click();
    await expect(recordSheet.quantityBox).toHaveAttribute('aria-pressed', 'false');
    for (let index = 0; index < 12; index += 1) {
      if ((await recordSheet.input.amountText.innerText()) === formatCurrency(0)) break;
      await recordSheet.input.backspaceKey.click();
    }
    await recordSheet.input.enterAmount(250_000);
    await expect(recordSheet.input.amountText).toHaveText(formatCurrency(250_000));
    await expect(recordSheet.quantityBox).toHaveAttribute('aria-label', '수량 1주');
  });

  await recordSheet.input.saveButton.click();
  await expect(recordSheet.feedback.headline).toHaveText('삼성전자에 250,000원 넣었어요');
  const saved = (await logsNamed(page, 'save_result')).at(-1);
  expect(saved?.params.side).toBe('buy');
  expect(saved?.params.qty).toBe('int');

  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(home.today.row('저축·투자')).toBeVisible();

  await assets.open();
  await assets.waitReady();
  await expect(assets.row('삼성전자')).toContainText('2주 보유, 넣은 돈 500,000원');
});

test('수량 칸이 골라져 있으면 키패드 왼쪽 아래가 「.」 이고 소수점은 한 번만 들어간다', async ({
  home,
  prep,
  recordSheet,
}) => {
  await prep.putAssets([
    {
      group: 'investment',
      label: '비트코인',
      kind: 'coin',
      quantity: '0.01',
      cost: 1_000_000,
      amount: 1_000_000,
    },
  ]);

  await openSaveInvest(home, recordSheet);
  await recordSheet.pickDest('비트코인');
  await expect(recordSheet.quantityBox).toHaveAttribute('aria-pressed', 'true');

  const keys = recordSheet.input.keypad;
  const dot = keys.getByRole('button', { name: '.', exact: true });
  await expect(dot).toBeVisible();
  await expect(keys.getByRole('button', { name: '00', exact: true })).toHaveCount(0);
  // 왼쪽 아래: 「7」 과 같은 열, 「0」 과 같은 줄.
  const dotBox = await dot.boundingBox();
  const sevenBox = await keys.getByRole('button', { name: '7', exact: true }).boundingBox();
  const zeroBox = await keys.getByRole('button', { name: '0', exact: true }).boundingBox();
  expect(Math.abs((dotBox?.x ?? -1) - (sevenBox?.x ?? -2))).toBeLessThan(2);
  expect(Math.abs((dotBox?.y ?? -1) - (zeroBox?.y ?? -2))).toBeLessThan(2);

  await keys.getByRole('button', { name: '0', exact: true }).click();
  await dot.click();
  await expect(dot).toBeDisabled();
  for (const key of ['0', '0', '3']) {
    await keys.getByRole('button', { name: key, exact: true }).click();
  }
  await expect(recordSheet.quantityBox).toHaveAttribute('aria-label', '수량 0.003개');

  await recordSheet.amountHead.click();
  await recordSheet.input.enterAmount(150_000);
  await recordSheet.input.saveButton.click();
  await expect(recordSheet.feedback.headline).toHaveText('비트코인에 150,000원 넣었어요');
  await expect(recordSheet.savedAssetRow('item')).toContainText('0.013개');
});

test('「어디에」 는 이름이 안 잘리는 두 칸 격자이고 매달 넣는 항목이 먼저, 다섯 칸 뒤에 「다른 곳」 이다', async ({
  home,
  page,
  prep,
  recordSheet,
}) => {
  await prep.putAssets([
    { group: 'cash', label: '비상금 통장', amount: 1_000_000 },
    { group: 'cash', label: '청년도약계좌', amount: 2_000_000, monthly: 300_000 },
    {
      group: 'investment',
      label: '카카오페이증권',
      kind: 'other',
      amount: 500_000,
      cost: 500_000,
      monthly: 100_000,
    },
    SAMSUNG_TWO,
    {
      group: 'investment',
      label: '비트코인',
      kind: 'coin',
      quantity: '0.01',
      cost: 1_000_000,
      amount: 1_000_000,
    },
    { group: 'pension', label: '연금저축', amount: 1_500_000, monthly: 200_000 },
    { group: 'deposit', label: '전세 보증금', amount: 50_000_000 },
    { group: 'debt', label: '학자금', amount: 3_000_000 },
  ]);

  await openSaveInvest(home, recordSheet);
  const cells = recordSheet.destGrid.getByRole('button');

  await test.step('여섯 칸: 매달 셋이 먼저, 마지막이 「다른 곳」, 부채는 없다', async () => {
    await expect(cells).toHaveCount(6);
    const names = (await cells.allInnerTexts()).map((text) => text.trim());
    expect(names.slice(0, 3).sort()).toEqual(['연금저축', '청년도약계좌', '카카오페이증권'].sort());
    expect(names[5]).toBe('다른 곳');
    expect(names).not.toContain('학자금');
  });

  await test.step('두 칸 격자이고 이름이 잘리지 않는다', async () => {
    const first = await cells.nth(0).boundingBox();
    const second = await cells.nth(1).boundingBox();
    const third = await cells.nth(2).boundingBox();
    expect(Math.abs((first?.y ?? 0) - (second?.y ?? 1))).toBeLessThan(2);
    expect((second?.x ?? 0) > (first?.x ?? 0)).toBe(true);
    expect((third?.y ?? 0) > (first?.y ?? 0)).toBe(true);
    for (const name of ['청년도약계좌', '카카오페이증권']) {
      const label = recordSheet.destCell(name).locator('.asset-dest__cell-name');
      const over = await clipped(label);
      expect(over, `${name} 이름이 잘렸다`).toEqual({ x: 0, y: 0 });
    }
  });

  await test.step('고르면 한 줄로 접히고 누르면 격자가 다시 펼쳐진다', async () => {
    await recordSheet.destCell('청년도약계좌').click();
    await expect(recordSheet.destGrid).toHaveCount(0);
    await expect(recordSheet.destPicked).toContainText('청년도약계좌');
    await expect(recordSheet.destPicked).toContainText(formatCurrency(2_000_000));
    await expect(recordSheet.destPicked).toContainText('▾');
    await recordSheet.destPicked.click();
    await expect(recordSheet.destGrid).toBeVisible();
  });

  await test.step('「다른 곳」 목록에도 부채는 없고 고른 항목이 다섯째 자리에 선다', async () => {
    await recordSheet.openOtherDest();
    await expect(recordSheet.destList).not.toContainText('학자금');
    await recordSheet.destListRow('비트코인').click();
    await expect(recordSheet.destPicked).toContainText('비트코인');
    await expect(recordSheet.destPicked).toContainText('0.01개');
    await recordSheet.destPicked.click();
    await expect(cells.nth(4)).toHaveText('비트코인');
    await recordSheet.destCell('비트코인').click();
  });

  await recordSheet.setQuantity('1');
  await recordSheet.amountHead.click();
  await recordSheet.input.enterAmount(10_000);
  await recordSheet.input.saveButton.click();
  await expect(recordSheet.feedback.headline).toHaveText('비트코인에 10,000원 넣었어요');
  expect((await logsNamed(page, 'save_result')).at(-1)?.params.dest_from).toBe('grid');
});

test('기록 시트에서 팔면 제목이 「얼마 받았어요?」 이고 저장 전에 수익과 수익률이 크게 보인다', async ({
  home,
  page,
  prep,
  recordSheet,
}) => {
  await prep.putAssets([SAMSUNG_TWO]);

  await openSaveInvest(home, recordSheet);
  await recordSheet.pickDest('삼성전자');
  await recordSheet.toggleSide('팔았어요');
  await expect(recordSheet.amountTitle).toHaveText('얼마 받았어요?');

  await recordSheet.setQuantity('1');
  await recordSheet.amountHead.click();
  await recordSheet.input.enterAmount(300_000);

  // 검산 표 ①: 평균 250,000원에 산 1주를 300,000원 받고 → +50,000원, +20%.
  await expect(recordSheet.sellPreview).toContainText('+50,000원');
  await expect(recordSheet.sellPreview).toContainText('+20%');

  await recordSheet.input.saveButton.click();
  await expect(recordSheet.feedback.headline).toHaveText('삼성전자 1주 팔았어요');
  await expect(page.getByText('받은 돈 300,000원', { exact: true })).toBeVisible();
  await expect(recordSheet.savedAssetRow('gain')).toContainText('+50,000원');
  await expect(recordSheet.savedAssetRow('gain')).toContainText('+20%');
  await expect(recordSheet.savedAssetRow('left')).toContainText('1주');

  const saved = (await logsNamed(page, 'save_result')).at(-1);
  expect(saved?.params.side).toBe('sell');
  expect(saved?.params.qty_all).toBe(false);
});

test('항목 시트 「팔았어요」 로 연 기록을 저장하면 보유와 넣은 돈이 판 몫만큼 줄고 실현 수익이 남는다', async ({
  assets,
  prep,
  recordSheet,
}) => {
  await prep.putAssets([SAMSUNG_TWO]);

  await assets.open();
  await assets.waitReady();
  await expect(assets.row('삼성전자')).toContainText('2주 보유, 넣은 돈 500,000원');
  await assets.openEdit('삼성전자');
  await assets.sheet.dialog.getByRole('button', { name: '팔았어요', exact: true }).click();

  await recordSheet.waitOpen();
  await expect(recordSheet.amountTitle).toHaveText('얼마 받았어요?');
  await expect(recordSheet.destPicked).toContainText('삼성전자');
  await expect(recordSheet.quantityBox).toHaveAttribute('aria-pressed', 'true');

  await recordSheet.input.numberKey('1').click();
  await recordSheet.amountHead.click();
  await recordSheet.input.enterAmount(300_000);
  await expect(recordSheet.sellPreview).toContainText('+50,000원');
  await recordSheet.input.saveButton.click();
  await expect(recordSheet.feedback.headline).toHaveText('삼성전자 1주 팔았어요');

  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(assets.row('삼성전자')).toContainText('1주 보유, 넣은 돈 250,000원');
  await expect(assets.rowChip('삼성전자', /^\+20% 실현$/)).toBeVisible();
});

test('팔 때 「전부」 는 보유 수량을 그대로 넣고, 보유보다 큰 수량이면 저장이 꺼진다', async ({
  home,
  page,
  prep,
  recordSheet,
}) => {
  await prep.putAssets([SAMSUNG_TWO]);

  await openSaveInvest(home, recordSheet);
  await recordSheet.pickDest('삼성전자');
  await recordSheet.toggleSide('팔았어요');
  await expect(recordSheet.amountTitle).toHaveText('얼마 받았어요?');

  await recordSheet.sellAll();
  await expect(recordSheet.quantityBox).toHaveAttribute('aria-label', '수량 2주');
  await recordSheet.input.enterAmount(600_000);
  await expect(recordSheet.input.saveButton).toBeEnabled();

  await recordSheet.setQuantity('3');
  await expect(recordSheet.quantityBox).toHaveAttribute('aria-label', '수량 3주');
  await expect(recordSheet.input.saveButton).toBeDisabled();

  await recordSheet.sellAll();
  await recordSheet.input.saveButton.click();
  await expect(recordSheet.feedback.headline).toHaveText('삼성전자 2주 팔았어요');
  await expect(recordSheet.savedAssetRow('left')).toContainText('없음');
  expect((await logsNamed(page, 'save_result')).at(-1)?.params.qty_all).toBe(true);
});
