import { expect, type Locator, type Page } from '@playwright/test';

import { assetAnalysisPath, type AssetAnalysisScope } from '../../src/app/router/routes';
import { TEST_IDS } from '../../src/shared/testIds';

/**
 * 「내 자산 분석」 화면. 경로(`/assets/analysis?scope=`)가 달라 따로 둔다.
 *
 * 잠겨 있으면 본문 대신 잠김 카드와 광고 확인 창이 선다. 확인 창은 자산 화면 입구가 띄우는
 * 것과 같은 부품이라 여기서 함께 든다.
 */
export class AssetAnalysisScreen {
  private readonly page: Page;
  /** 리포트 같은 그림 카드들(순자산 흐름, 지난달 대비 막대, 어디에 모았나, 달마다, Top 5, 종목별 수익률). */
  readonly charts: AnalysisChartsArea;

  constructor(page: Page) {
    this.page = page;
    this.charts = new AnalysisChartsArea(page);
  }

  async open(scope: AssetAnalysisScope = 'all'): Promise<void> {
    await this.page.goto(assetAnalysisPath(scope));
  }

  /** 화면 틀. `data-scope` 가 all, stock, cash 중 하나다. */
  get root(): Locator {
    return this.page.getByTestId(TEST_IDS.analysisPage);
  }

  get title(): Locator {
    return this.page.getByRole('heading', { level: 1 });
  }

  /** 잠김 카드. 경로로 바로 들어왔는데 잠겨 있으면 본문 대신 선다. */
  get lockedCard(): Locator {
    return this.page.getByTestId(TEST_IDS.analysisEntry);
  }

  /** 도넛 카드(전체는 「어디에 얼마 있나」, 종류별은 「무엇에 얼마 있나」). */
  get donutCard(): Locator {
    return this.page.getByTestId(TEST_IDS.analysisDonut);
  }

  /** 도넛 svg. 조각마다 path 가 하나씩 있다. */
  get ring(): Locator {
    return this.page.getByTestId(TEST_IDS.analysisRing);
  }

  get noPensionToggle(): Locator {
    return this.page.getByTestId(TEST_IDS.analysisNoPension);
  }

  /** 도넛 아래 부채와 순자산 한 줄. */
  get netWorthLine(): Locator {
    return this.page.getByTestId(TEST_IDS.analysisNetWorth);
  }

  get returns(): Locator {
    return this.page.getByTestId(TEST_IDS.analysisReturns);
  }

  get monthChange(): Locator {
    return this.page.getByTestId(TEST_IDS.analysisMonthChange);
  }

  get saving(): Locator {
    return this.page.getByTestId(TEST_IDS.analysisSaving);
  }

  /** 저축률 카드 이름 옆 기간. 한 달 시작일이 1 이 아닐 때만 선다. */
  get savingPeriod(): Locator {
    return this.page.getByTestId(TEST_IDS.analysisSavingPeriod);
  }

  /** 투자 수익률 카드의 「판 것」 줄. */
  realizedRow(name: string): Locator {
    return this.returns.locator('[data-kind="realized"]').filter({ hasText: name });
  }

  get monthly(): Locator {
    return this.page.getByTestId(TEST_IDS.analysisMonthly);
  }

  /** 「매달 넣는 돈」 카드의 큰 합계. */
  get monthlyTotal(): Locator {
    return this.monthly.getByTestId(TEST_IDS.analysisMonthlyTotal);
  }

  /** 「종류별로 더 보기」 아래 줄 하나. `data-state` 가 locked, open, stale 중 하나다. */
  kindRow(scope: 'stock' | 'cash'): Locator {
    return this.page.locator(`[data-testid="${TEST_IDS.analysisKindRow}"][data-scope="${scope}"]`);
  }

  get kindRows(): Locator {
    return this.page.getByTestId(TEST_IDS.analysisKindRow);
  }

  /** 광고 확인 창. */
  get adConsent(): Locator {
    return this.page.getByRole('alertdialog', { name: '광고가 한 번 나와요' });
  }

  get adConsentConfirm(): Locator {
    return this.adConsent.getByRole('button', { name: '확인', exact: true });
  }

  get adConsentCancel(): Locator {
    return this.adConsent.getByRole('button', { name: '닫기', exact: true });
  }

  /** 본문이 그려졌다(잠김이 풀렸다). */
  async waitOpen(scope: AssetAnalysisScope = 'all'): Promise<void> {
    await expect(this.root).toHaveAttribute('data-scope', scope);
    await expect(this.donutCard).toBeVisible();
  }

  /** 범례 한 줄(이름, 비율, 금액). */
  legendRow(name: string): Locator {
    return this.donutCard.getByRole('listitem').filter({ hasText: name });
  }

  get legendRows(): Locator {
    return this.donutCard.getByRole('listitem');
  }

  /**
   * 화면 안 범례 글자 전부. 도넛 조각 이름과 금액, 비율이 여기 적힌다.
   */
  get donutText(): Locator {
    return this.donutCard;
  }
}

/** 분석 화면의 그림 카드. 카드가 없으면(기록이 모자라면) 각 카드 locator 의 개수가 0 이다. */
class AnalysisChartsArea {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** 「순자산 흐름」 카드. */
  get netWorthTrend(): Locator {
    return this.page.getByTestId(TEST_IDS.analysisNetWorthTrend);
  }

  /** 순자산 흐름 막대. 기록이 없는 앞 달은 막대 없이 달 이름만 선다. */
  get netWorthBars(): Locator {
    return this.netWorthTrend.getByTestId(TEST_IDS.analysisTrendBar);
  }

  /** 순자산 흐름의 달 자리 여섯. */
  get netWorthMonths(): Locator {
    return this.netWorthTrend.getByRole('listitem');
  }

  /** 「지난달 대비」 그룹 줄 하나. `data-sign` 이 up, down, same 중 하나다. */
  monthChangeRow(group: string): Locator {
    return this.page
      .getByTestId(TEST_IDS.analysisMonthChange)
      .getByTestId(TEST_IDS.analysisSignedRow)
      .filter({ hasText: group });
  }

  /** 「어디에 모았나」 카드. */
  get savedItems(): Locator {
    return this.page.getByTestId(TEST_IDS.analysisSavedItems);
  }

  /** 어디에 모았나 줄(이름, 막대, 금액, 비율). 큰 것부터. */
  get savedItemRows(): Locator {
    return this.savedItems.getByRole('listitem');
  }

  /** 「달마다 모은 돈」 카드. */
  get savedTrend(): Locator {
    return this.page.getByTestId(TEST_IDS.analysisSavedTrend);
  }

  /** 달마다 모은 돈 막대 여섯. 높이는 `style` 의 퍼센트다. */
  get savedTrendBars(): Locator {
    return this.savedTrend.getByTestId(TEST_IDS.analysisTrendBar);
  }

  /** 「큰 저축·투자 Top 5」 카드. */
  get topSaves(): Locator {
    return this.page.getByTestId(TEST_IDS.analysisTopSaves);
  }

  /** Top 5 줄. 누르면 그 기록의 고치기 시트가 열린다. */
  get topSaveRows(): Locator {
    return this.topSaves.getByTestId(TEST_IDS.analysisTopSaveRow);
  }

  get topSaveAmounts(): Locator {
    return this.topSaves.getByTestId(TEST_IDS.analysisTopSaveAmount);
  }

  /** 주식 분석 수익률 카드의 종목별 막대. */
  get stockRates(): Locator {
    return this.page.getByTestId(TEST_IDS.analysisStockRates);
  }

  /** 종목별 수익률 줄 하나. `data-sign` 이 up, down 중 하나다. */
  stockRateRow(name: string): Locator {
    return this.stockRates.getByTestId(TEST_IDS.analysisSignedRow).filter({ hasText: name });
  }
}
