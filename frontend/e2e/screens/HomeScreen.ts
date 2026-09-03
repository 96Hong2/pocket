import { expect, type Locator, type Page } from '@playwright/test';

import { ROUTES } from '../../src/app/router/routes';
import { TEST_IDS } from '../../src/shared/testIds';

/**
 * 홈 화면.
 *
 * 셀렉터는 이 파일 안에만 둔다. 숫자와 게이지만 testid 로 잡고 나머지는 접근성 이름으로 잡는다.
 * 단언은 spec 이 한다. 여기는 무엇을 어떻게 집는지만 안다.
 */
export class HomeScreen {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async open(): Promise<void> {
    await this.page.goto(ROUTES.home);
  }

  /** 예산을 정한 뒤 히어로가 그리는 남은 예산. */
  get remainingBudget(): Locator {
    return this.page.getByTestId(TEST_IDS.remainingBudget);
  }

  /** 예산을 정하기 전 히어로가 그리는 이번 달 지출. */
  get monthSpent(): Locator {
    return this.page.getByTestId(TEST_IDS.monthSpent);
  }

  get dailyAllowance(): Locator {
    return this.page.getByTestId(TEST_IDS.dailyAllowance);
  }

  get gauge(): Locator {
    return this.page.getByTestId(TEST_IDS.budgetGauge);
  }

  get recordButton(): Locator {
    return this.page.getByRole('button', { name: '10초 기록' });
  }

  /** 복귀 카드의 행동 버튼. 며칠 비었을 때만 뜬다. */
  get catchUpButton(): Locator {
    return this.page.getByRole('button', { name: '밀린 내역 한 번에 정리' });
  }

  get budgetInput(): Locator {
    return this.page.getByLabel('이번 달 예산');
  }

  get saveBudgetButton(): Locator {
    return this.page.getByRole('button', { name: '예산 정하기' });
  }

  /** 광고 슬롯. 붙지 않으면 DOM 에 자리 자체가 없어야 한다. */
  get adSlot(): Locator {
    return this.page.getByTestId(TEST_IDS.adSlot);
  }

  todayRow(title: string): Locator {
    return this.page.getByRole('region', { name: '오늘' }).getByText(title, { exact: true });
  }

  /** 게이지가 스크린리더에 알리는 사용률(%). 게이지가 없으면 null. */
  async gaugePercent(): Promise<number | null> {
    if ((await this.gauge.count()) === 0) return null;
    const value = await this.gauge.getAttribute('aria-valuenow');
    return value == null ? null : Number(value);
  }

  /** 홈이 그릴 것을 다 그린 뒤를 기다린다. 조회가 끝나야 히어로 숫자가 진짜다. */
  async waitReady(): Promise<void> {
    await expect(this.recordButton).toBeVisible();
  }

  async setBudget(amount: number): Promise<void> {
    await this.budgetInput.fill(String(amount));
    await this.saveBudgetButton.click();
    // 저장이 끝나면 히어로가 남은 예산 모드로 바뀐다.
    await expect(this.remainingBudget).toBeVisible();
  }
}
