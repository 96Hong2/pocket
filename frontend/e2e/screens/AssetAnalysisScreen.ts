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

  constructor(page: Page) {
    this.page = page;
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

  get monthly(): Locator {
    return this.page.getByTestId(TEST_IDS.analysisMonthly);
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
