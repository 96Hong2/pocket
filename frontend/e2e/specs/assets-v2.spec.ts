import { formatCurrency, formatDayLabel, toLedgerDate } from '../../src/shared/lib/format';
import { logsNamed } from '../support/aitMock';
import { lastMonth } from '../support/api';
import { expect, test } from '../support/fixtures';

/**
 * 자산 화면 새 판.
 *
 * 순자산 카드는 순자산, 작은 추이, 지난달 대비, 이번 달 모은 돈만 싣고, 누르면 상세가 열린다.
 * 그룹은 연금을 더해 다섯이고 머리의 작은 ＋ 로 더한다. 종목 줄은 수량과 넣은 돈, 수익률 칩을
 * 광고 없이 보인다. 기대값은 PRD 확인 항목의 예(2주, 500,000원, 1주 300,000원 → +20%)에서 왔다.
 */

const CASH_BEFORE = 1_000_000;
const CASH_NOW = 1_200_000;
const DEBT = 300_000;
const SAVED = 300_000;

test('순자산 카드는 순자산, 추이, 지난달 대비, 모은 돈만 싣고 누르면 상세가 열린다', async ({
  assets,
  page,
  prep,
}) => {
  await prep.putAssets([
    { group: 'cash', label: '청년도약계좌', amount: CASH_BEFORE },
    { group: 'debt', label: '학자금', amount: DEBT },
  ]);
  await prep.moveLatestAssetSnapshot(`${lastMonth()}-15`);
  const now = await prep.putAssets([
    { group: 'cash', label: '청년도약계좌', amount: CASH_NOW },
    { group: 'debt', label: '학자금', amount: DEBT },
  ]);
  const savings = now.items.find((item) => item.label === '청년도약계좌');
  if (savings?.item_key == null) throw new Error('청년도약계좌 항목 키가 없다');
  await prep.addAssetTransfer({ amount: SAVED, itemKey: savings.item_key });

  // 넣은 돈은 그 통장 잔액을 늘린다. 순자산 = (1,200,000 + 300,000) − 300,000.
  const netNow = CASH_NOW + SAVED - DEBT;
  const netBefore = CASH_BEFORE - DEBT;

  await assets.open();
  await assets.waitReady();

  await expect(assets.netWorth).toHaveText(formatCurrency(netNow));
  await expect(assets.basisLabel).toHaveText(
    new RegExp(`^내 순자산 · ${formatDayLabel(toLedgerDate(new Date()))} 기준 ?›$`),
  );
  await expect(assets.sparkline).toBeVisible();
  await expect(assets.netWorthText).toContainText(
    `지난달보다 +${formatCurrency(netNow - netBefore)}`,
  );
  await expect(assets.netWorthText).toContainText(`이번 달 모은 돈 ${formatCurrency(SAVED)}`);
  // 「자산 − 부채」 줄과 안내 글씨는 걷었다.
  await expect(assets.breakdown).toHaveCount(0);
  await expect(assets.leadText).toHaveCount(0);

  await assets.netWorthButton.click();
  await expect(assets.detailSheet).toBeVisible();
  await expect(assets.detailChart).toBeVisible();
  await expect(assets.detailValue('자산')).toHaveText(formatCurrency(CASH_NOW + SAVED));
  await expect(assets.detailValue('부채')).toHaveText(`− ${formatCurrency(DEBT)}`);
  await expect(assets.detailValue('순자산')).toHaveText(formatCurrency(netNow));

  const opened = await logsNamed(page, 'asset_networth_opened');
  expect(opened).toHaveLength(1);
});

test('그룹은 연금까지 다섯이고, 종목 줄에 수량과 넣은 돈, 수익률 칩이 광고 없이 보인다', async ({
  assets,
  page,
  prep,
}) => {
  await prep.putAssets([
    { group: 'cash', label: '카카오뱅크', amount: 1_250_000, monthly: 300_000 },
    {
      group: 'investment',
      label: '삼성전자',
      amount: 500_000,
      kind: 'stock',
      quantity: '2',
      cost: 500_000,
      price: 300_000,
    },
    {
      group: 'investment',
      label: '카카오',
      amount: 400_000,
      kind: 'stock',
      quantity: '5',
      cost: 400_000,
    },
    { group: 'pension', label: '연금저축펀드', amount: 2_100_000 },
  ]);

  await assets.open();
  await assets.waitReady();

  for (const label of ['예적금·현금', '투자', '연금', '보증금·기타', '부채'] as const) {
    await expect(assets.group(label)).toBeVisible();
  }
  await expect(assets.groupTotal('연금')).toHaveText(formatCurrency(2_100_000));

  await expect(assets.row('삼성전자')).toContainText('2주 보유, 넣은 돈 500,000원');
  await expect(assets.rowChip('삼성전자', '주식')).toBeVisible();
  // 2주 × 300,000원 = 600,000원, 넣은 돈 500,000원 → +20%
  await expect(assets.rowChip('삼성전자', /^\+20%$/)).toBeVisible();
  await expect(assets.rowChip('카카오', '현재가 없음')).toBeVisible();
  await expect(assets.rowChip('카카오뱅크', '매달')).toBeVisible();

  // 순자산, 추이, 합계, 칩이 보이는 동안 광고도 확인 창도 없었다.
  await expect(assets.netWorth).toBeVisible();
  await expect(assets.adConsent).toHaveCount(0);
  expect(await logsNamed(page, 'interstitial_result')).toEqual([]);
});

test('항목 시트에서 지금 1주 가격을 적으면 현재가 없음이 수익률 칩으로 바뀐다', async ({
  assets,
  page,
  prep,
}) => {
  await prep.putAssets([
    {
      group: 'investment',
      label: '카카오',
      amount: 250_000,
      kind: 'stock',
      quantity: '1',
      cost: 250_000,
    },
  ]);

  await assets.open();
  await assets.waitReady();
  await expect(assets.rowChip('카카오', '현재가 없음')).toBeVisible();

  await assets.openEdit('카카오');
  await assets.sheet.field('지금 1주 가격').fill('300000');
  await assets.sheet.save();

  // 250,000원에 산 1주가 지금 300,000원 → +20%
  await expect(assets.rowChip('카카오', /^\+20%$/)).toBeVisible();
  await expect(assets.rowChip('카카오', '현재가 없음')).toHaveCount(0);

  const changed = await logsNamed(page, 'asset_changed');
  expect(changed.at(-1)?.params).toMatchObject({ kind: 'stock', from: 'assets', fields: 'price' });
});

test('펀드에 넣은 돈과 지금 금액을 적으면 항목 줄에 평가 수익률 칩이 선다', async ({
  assets,
  prep,
}) => {
  await prep.putAssets([{ group: 'cash', label: '카카오뱅크', amount: 1_000_000 }]);

  await assets.open();
  await assets.waitReady();

  await assets.addButton('투자').click();
  await assets.sheet.waitOpen();
  await assets.sheet.kindChoice('펀드').click();
  await assets.sheet.nameField.fill('테스트 펀드');
  await assets.sheet.field('넣은 돈').fill('1000000');
  await assets.sheet.field('지금 금액').fill('1200000');
  await assets.sheet.save();

  // 넣은 돈 1,000,000원이 지금 1,200,000원 → +20%
  await expect(assets.row('테스트 펀드')).toContainText(formatCurrency(1_200_000));
  await expect(assets.rowChip('테스트 펀드', /^\+20%$/)).toBeVisible();
});

test('그룹 머리의 작은 ＋ 로 그 그룹 항목을 더한다. 큰 추가 버튼과 그룹 설명은 없다', async ({
  assets,
  prep,
}) => {
  await prep.putAssets([{ group: 'cash', label: '카카오뱅크', amount: 1_000_000 }]);

  await assets.open();
  await assets.waitReady();

  await expect(assets.anyText('항목 추가')).toHaveCount(0);
  await expect(assets.anyText('퇴직연금, 연금저축, IRP')).toHaveCount(0);
  await expect(assets.anyText('주식, ETF, 펀드, 코인, 채권')).toHaveCount(0);

  // 보이는 ＋ 는 작아도 누르는 자리는 44px 이상이다.
  const reach = await assets.plusHitSize('연금');
  expect(reach.width).toBeGreaterThanOrEqual(44);
  expect(reach.height).toBeGreaterThanOrEqual(44);

  await assets.addButton('연금').click();
  await expect(assets.sheet.addDialog).toHaveAccessibleName('연금 항목 추가');
  await assets.sheet.fill({ name: '퇴직연금 IRP', amount: 3_000_000 });
  await assets.sheet.save();

  await expect(assets.rows('연금')).toHaveCount(1);
  await expect(assets.groupTotal('연금')).toHaveText(formatCurrency(3_000_000));
});

test.describe('390x844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('차례는 순자산, 내 자산 리포트, 캡처, 배너, 그룹 다섯이고 배너가 첫 화면 안에 든다', async ({
    assets,
    prep,
  }) => {
    await prep.putAssets([
      { group: 'cash', label: '카카오뱅크', amount: 1_250_000 },
      {
        group: 'investment',
        label: '삼성전자',
        amount: 500_000,
        kind: 'stock',
        quantity: '2',
        cost: 500_000,
      },
    ]);

    await assets.open();
    await assets.waitReady();
    await expect(assets.topAdSlot).toBeAttached();

    const order = [
      assets.netWorthButton,
      assets.analysisEntry,
      assets.captureEntry,
      assets.topAdSlot,
      assets.firstGroup,
    ];
    const tops: number[] = [];
    for (const locator of order) {
      const box = await locator.boundingBox();
      if (box == null) throw new Error('자리를 재지 못했다');
      tops.push(box.y);
    }
    expect(tops).toEqual([...tops].sort((a, b) => a - b));

    const ad = await assets.topAdSlot.boundingBox();
    expect(ad).not.toBeNull();
    expect((ad?.y ?? 0) + (ad?.height ?? 0)).toBeLessThanOrEqual(844);
    const { content, visible } = await assets.widths();
    expect(content).toBeLessThanOrEqual(visible);
  });
});
