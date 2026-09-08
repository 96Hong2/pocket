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

  /** 월간 결산 입구와 오버레이. 끝난 달에 기록이 있을 때만 입구가 생긴다. */
  readonly closing: ClosingArea;

  constructor(page: Page) {
    this.page = page;
    this.root = page;
    this.closing = new ClosingArea(page);
  }

  /**
   * 리포트를 연다.
   *
   * `month`·`closing` 은 홈의 결산 카드가 붙여 주는 것과 같은 주소다. 눌러서 오는 길은
   * 홈 spec 이 보고, 여기서는 그 주소로 들어왔을 때 무엇이 열리는지를 본다.
   */
  async open(options?: { month?: string; closing?: boolean }): Promise<void> {
    const query = new URLSearchParams();
    if (options?.month != null) query.set('month', options.month);
    if (options?.closing) query.set('closing', '1');
    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    await this.page.goto(`${ROUTES.report}${suffix}`);
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

  async goNextMonth(): Promise<void> {
    await this.monthButton('next').click();
  }

  /** 지금 열려 있는 주소. 결산처럼 한 번만 쓰는 파라미터가 남았는지 여기로 본다. */
  get url(): URL {
    return new URL(this.page.url());
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

  /**
   * 조각과 목록 줄에 실제로 칠해진 색.
   *
   * 조각 수만 세면 **색이 하나도 안 칠해져도 통과한다.** 실제로 그런 적이 있다.
   * 램프를 `@theme` 안에 두면 tailwind 가 클래스에서 안 쓰인 변수를 지우는데,
   * 그 이름을 JS 가 문자열로 만들어 써서 도구가 못 본다. 그래서 화면에서 계산된 값을 본다.
   */
  async paintedColors(): Promise<{ slices: string[]; swatches: string[] }> {
    return this.root.evaluate(() => {
      const paint = (selector: string, prop: 'stroke' | 'backgroundColor') =>
        [...document.querySelectorAll(selector)].map((el) => getComputedStyle(el)[prop]);
      return {
        slices: paint('[data-testid="report-donut"] circle', 'stroke'),
        swatches: paint('.report__row-swatch:not(.is-empty)', 'backgroundColor'),
      };
    });
  }

  get rows(): Locator {
    return this.root.getByTestId(TEST_IDS.reportBreakdownRow);
  }

  row(name: string | RegExp): Locator {
    return this.rows.filter({ hasText: name });
  }

  amount(name: string | RegExp): Locator {
    return this.row(name).getByTestId(TEST_IDS.reportRowAmount);
  }

  share(name: string | RegExp): Locator {
    return this.row(name).getByTestId(TEST_IDS.reportRowShare);
  }

  /**
   * 큰 지출 다섯 건 카드의 제목.
   *
   * 소비 이야기라 수입 쪽에는 없다. 그 달에 큰 지출이 하나도 없으면 카드째 없다.
   */
  get largeExpenseCard(): Locator {
    return this.root.getByRole('heading', { name: '큰 지출 Top 5' });
  }

  /** 큰 지출 한 줄. 이름이 없는 줄이라 클래스로 잡는다. */
  get largeExpenseRows(): Locator {
    return this.root.getByTestId(TEST_IDS.reportLargeExpenseRow);
  }

  largeExpenseRow(name: string | RegExp): Locator {
    return this.largeExpenseRows.filter({ hasText: name });
  }

  largeExpenseAmount(name: string | RegExp): Locator {
    return this.largeExpenseRow(name).getByTestId(TEST_IDS.reportLargeExpenseAmount);
  }

  /** 6개월 막대. 기록이 없는 달도 남으므로 늘 여섯이다. */
  get trendBars(): Locator {
    return this.root.getByTestId(TEST_IDS.reportTrendBar);
  }

  trendBar(month: string): Locator {
    return this.root.locator(`[data-testid="${TEST_IDS.reportTrendBar}"][data-month="${month}"]`);
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
   * 조각 합이 그 달 금액과 다른 이유를 적는 줄.
   *
   * 조각 카드 밖에 있다. 안에 두면 환불이 지출보다 큰 달에는 카드 자체가 없어
   * 가장 설명이 필요한 달에 아무 말도 못 한다.
   */
  get sliceNote(): Locator {
    return this.root.getByTestId(TEST_IDS.reportSliceNote);
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

  /**
   * 그 달에 기록은 있는데 지금 보는 쪽(소비·수입)만 비었을 때.
   *
   * 빈 달 안내와 다른 자리다. 이 줄이 없으면 수입을 한 번도 안 적은 사람이
   * 수입 탭에서 0 원과 빈 화면만 보고 화면이 고장 났다고 여긴다.
   */
  get emptyModeNotice(): Locator {
    return this.root.getByText(/^이 달엔 (수입|소비) 기록이 없어요$/);
  }

  /**
   * 광고 자리. 리포트에는 없어야 한다.
   *
   * 배너는 홈 한 곳뿐이다. 이 화면은 달을 옮길 때마다 본문을 다시 그려서,
   * 여기에 두면 배너가 다시 붙고 그것이 곧 광고 새로고침이 된다.
   */
  get adSlot(): Locator {
    return this.root.getByTestId(TEST_IDS.adSlot);
  }

  /** 조회가 실패했을 때 본문 자리를 대신하는 제목. */
  get loadError(): Locator {
    return this.root.getByText('리포트를 불러오지 못했어요', { exact: true });
  }
}

/**
 * 월간 결산.
 *
 * 입구는 버튼, 오버레이는 다이얼로그라 둘 다 이름으로 잡는다. 이름이 없는 것은
 * 안쪽의 점과 줄뿐이고 그것만 testid 를 쓴다.
 */
export class ClosingArea {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** 리포트 헤드라인 아래 결산 입구. 끝난 달에 기록이 있을 때만 있다. */
  get card(): Locator {
    return this.page.getByRole('button', { name: /결산/ });
  }

  /** 열려 있는 결산 오버레이. 닫혀 있으면 DOM 에 아예 없다. */
  get overlay(): Locator {
    return this.page.getByRole('dialog', { name: /결산$/ });
  }

  /** 입구를 눌러 연다. 열린 것까지 확인하고 돌아온다. */
  async open(): Promise<void> {
    await this.card.click();
    await expect(this.overlay).toBeVisible();
  }

  /** 지금 펼쳐진 카드의 제목. 순서가 고정인지 여기로 본다. */
  get title(): Locator {
    return this.overlay.getByRole('heading', { level: 2 });
  }

  /** 몇 장인지 알려 주는 점. 카드 수와 같아야 한다. */
  get dots(): Locator {
    return this.overlay.getByTestId(TEST_IDS.closingDot);
  }

  /** 지금 몇 번째 카드인지. 점에 붙은 표시로 읽는다. */
  get currentDot(): Locator {
    return this.page.locator(`[data-testid="${TEST_IDS.closingDot}"][data-current]`);
  }

  /** 잘한 것 줄들. 근거가 없으면 하나도 없다. */
  get highlights(): Locator {
    return this.overlay.getByTestId(TEST_IDS.closingHighlight);
  }

  get flow(): Locator {
    return this.overlay.getByTestId(TEST_IDS.closingFlow);
  }

  get change(): Locator {
    return this.overlay.getByTestId(TEST_IDS.closingChange);
  }

  get next(): Locator {
    return this.overlay.getByTestId(TEST_IDS.closingNext);
  }

  /** 다음 카드로. 마지막 장에서는 이 버튼이 없고 대신 `doneButton` 이 있다. */
  get nextButton(): Locator {
    return this.overlay.getByRole('button', { name: '다음' });
  }

  /** 마지막 장의 버튼. 이름이 ✕ 와 달라야 둘을 갈라 누를 수 있다. */
  get doneButton(): Locator {
    return this.overlay.getByRole('button', { name: '다 봤어요' });
  }

  /** 오른쪽 위 ✕. */
  get closeButton(): Locator {
    return this.overlay.getByRole('button', { name: '닫기' });
  }

  /** 예산 화면으로 가는 링크. 권할 것이 있을 때만 있다. */
  get budgetLink(): Locator {
    return this.overlay.getByRole('link', { name: '예산 화면으로' });
  }

  /**
   * 오버레이 안의 광고 자리. 배너는 홈 한 곳뿐이라 여기는 늘 비어 있어야 한다.
   * 한 달을 돌아보는 자리에 광고가 끼면 결산이 광고를 보여주는 구실이 된다.
   */
  get adSlot(): Locator {
    return this.overlay.getByTestId(TEST_IDS.adSlot);
  }

  /**
   * 카드 넉 장을 끝까지 넘기며 장마다 글자와 광고 자리 수를 모은다.
   *
   * 한 장만 보면 나머지 석 장의 문구는 아무도 안 본다. 화면에는 늘 한 장만 있어서
   * 열자마자 한 번 세는 것으로는 뒤 석 장의 광고 자리를 못 본다. 그래서 같이 센다.
   */
  async readAllCards(): Promise<Array<{ text: string; adSlots: number }>> {
    const cards: Array<{ text: string; adSlots: number }> = [];
    for (;;) {
      cards.push({
        text: (await this.overlay.innerText()) ?? '',
        adSlots: await this.adSlot.count(),
      });
      if ((await this.nextButton.count()) === 0) return cards;
      await this.nextButton.click();
    }
  }
}
