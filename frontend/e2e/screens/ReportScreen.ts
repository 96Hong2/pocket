import { expect, type Locator, type Page } from '@playwright/test';

import { ROUTES } from '../../src/app/router/routes';
import { TEST_IDS } from '../../src/shared/testIds';

/**
 * 리포트 탭. 그 달의 총액·조각·6개월 흐름을 한 화면에서 본다.
 *
 * 화면이 그리는 것은 조회 하나가 실어 준다. 그래서 여기서 잡는 값들은 전부
 * 서버가 준 값이고, 화면이 다시 더한 것이 아니다.
 */
export class ReportScreen {
  private readonly page: Page;
  /** 이 탭에는 다른 화면이 함께 떠 있지 않다. 페이지 전체가 곧 이 화면이다. */
  private readonly root: Page;

  constructor(page: Page) {
    this.page = page;
    this.root = page;
  }

  async open(): Promise<void> {
    await this.page.goto(ROUTES.report);
  }

  /** 조회가 끝나 총액이 그려질 때까지. */
  async waitReady(): Promise<void> {
    await expect(this.total).toBeVisible();
  }

  /** 소비/수입 전환. 기본은 소비다. */
  modeTab(label: '소비' | '수입'): Locator {
    return this.root.getByRole('radio', { name: label, exact: true });
  }

  monthLabel(): Locator {
    return this.root.getByText(/^\d{4}년 \d{1,2}월$/);
  }

  async goPreviousMonth(): Promise<void> {
    await this.monthButton('previous').click();
  }

  /** 다음 달 버튼. 이번 달에서는 눌리지 않아야 한다(아직 오지 않은 달이다). */
  monthButton(direction: 'previous' | 'next'): Locator {
    const buttons = this.root.getByRole('button', { name: /로 이동$/ });
    return direction === 'previous' ? buttons.first() : buttons.last();
  }

  /** 월 선택기가 화면에 있나. 로딩·오류 중에도 남아야 다른 달로 갈 수 있다. */
  get monthStepper(): Locator {
    return this.root.getByRole('button', { name: /로 이동$/ });
  }

  /** 어느 달의 무엇인지 적는 줄. 지난달을 보면서 "이번 달" 이라고 하면 거짓이다. */
  get headlineLabel(): Locator {
    return this.root.getByTestId(TEST_IDS.reportHeadlineLabel);
  }

  /** 그 달 쓴 돈(또는 번 돈). */
  get total(): Locator {
    return this.root.getByTestId(TEST_IDS.reportTotal);
  }

  /** 카테고리 도넛. 조각이 둘 미만이면 아예 안 그린다. */
  get donut(): Locator {
    return this.root.getByTestId(TEST_IDS.reportDonut);
  }

  /** 도넛 조각 하나하나. 색 램프 순서와 목록 순서가 같아야 한다. */
  get donutSlices(): Locator {
    return this.donut.locator('circle');
  }

  get rows(): Locator {
    return this.root.getByTestId(TEST_IDS.reportBreakdownRow);
  }

  row(name: string): Locator {
    return this.rows.filter({ hasText: name });
  }

  amount(name: string): Locator {
    return this.row(name).getByTestId(TEST_IDS.reportRowAmount);
  }

  share(name: string): Locator {
    return this.row(name).getByTestId(TEST_IDS.reportRowShare);
  }

  /** 6개월 막대. 기록이 없는 달도 남으므로 늘 여섯이다. */
  get trendBars(): Locator {
    return this.root.getByTestId(TEST_IDS.reportTrendBar);
  }

  trendBar(month: string): Locator {
    return this.root.locator(
      `[data-testid="${TEST_IDS.reportTrendBar}"][data-month="${month}"]`,
    );
  }

  /**
   * 지난달 같은 기간과 견준 한 줄.
   *
   * **무엇과 견줬는지 날짜가 글자로 들어 있다.** 숫자만 보면 서버가 달 전체를 세도 그럴듯하다.
   */
  get comparison(): Locator {
    return this.root.getByTestId(TEST_IDS.reportComparison);
  }

  get weeks(): Locator {
    return this.root.getByTestId(TEST_IDS.reportWeeks);
  }

  /** 예산 사용률 한 줄. 예산을 정하지 않았으면 없다. */
  get budgetLine(): Locator {
    return this.root.getByTestId(TEST_IDS.reportBudgetLine);
  }

  /**
   * 본문이 실제로 차지한 가로 폭과 화면에 보이는 폭.
   *
   * `innerWidth` 와 견주면 안 된다. 본문이 넘치면 브라우저가 축소하면서 `innerWidth` 도
   * 함께 커져 둘이 늘 같아진다(항진 명제다). 축소해도 안 움직이는 것은 visual viewport 다.
   */
  async widths(): Promise<{ content: number; visible: number }> {
    return this.page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      visible: window.visualViewport?.width ?? window.innerWidth,
    }));
  }

  get emptyNotice(): Locator {
    return this.root.getByText('이 달엔 기록이 없어요', { exact: true });
  }
}
