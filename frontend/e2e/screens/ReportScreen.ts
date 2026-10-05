import { expect, type Locator, type Page } from '@playwright/test';

import { ROUTES } from '../../src/app/router/routes';
import { TEST_IDS } from '../../src/shared/testIds';

import { EditSheetArea } from './CalendarScreen';

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
  /** 머리의 가계부 칩과 고르기 창. 같이 쓰는 가계부가 있을 때만 선다. */
  readonly book: ReportBookArea;
  /** 공유 가계부 리포트의 「자세히 보기」 카드. */
  readonly insight: ReportInsightArea;
  /** 큰 지출 줄을 눌러 뜨는 「기록 수정」 시트. 달력과 같은 시트다. */
  readonly edit: EditSheetArea;

  constructor(page: Page) {
    this.page = page;
    this.root = page;
    this.closing = new ClosingArea(page);
    this.book = new ReportBookArea(page);
    this.insight = new ReportInsightArea(page);
    this.edit = new EditSheetArea(page);
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

  /** 탭 줄 오른쪽 「저축·투자 ›」. 자산 화면으로 간다. 공유 가계부 리포트에는 없다. */
  get assetsLink(): Locator {
    return this.root.getByRole('button', { name: /^저축·투자/ });
  }

  /** 소비/수입 전환. 기본은 소비다. */
  modeTab(label: '소비' | '수입'): Locator {
    return this.root.getByRole('radio', { name: label, exact: true });
  }

  monthLabel(): Locator {
    return this.root.getByText(/^\d{4}년 \d{1,2}월$/);
  }

  /** 달은 주소에 들어 있어 눌러도 한 박자 뒤에 그려진다. 이름이 바뀔 때까지 기다린다. */
  async goPreviousMonth(): Promise<void> {
    await this.stepMonth('previous');
  }

  async goNextMonth(): Promise<void> {
    await this.stepMonth('next');
  }

  private async stepMonth(direction: 'previous' | 'next'): Promise<void> {
    const before = await this.monthLabel().innerText();
    await this.monthButton(direction).click();
    await expect(this.monthLabel()).not.toHaveText(before);
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

  /**
   * 여러 달 뒤로 갔다가 한 번에 돌아오는 알약. 이번 달을 보고 있으면 없다.
   */
  /**
   * 제목 줄 오른쪽의 달력 아이콘.
   *
   * 리포트는 「어디에 썼나」 고 달력은 「언제 썼나」 라, 한쪽을 보다 다른 쪽이 궁금해지는
   * 자리가 여기다. **보던 달을 들고 간다.**
   */
  get calendarLink(): Locator {
    return this.page.getByRole('link', { name: '이 달을 달력으로 보기', exact: true });
  }

  get thisMonthJump(): Locator {
    return this.root.getByRole('button', { name: '이번 달로' });
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

  /** 조각 하나. 목록 줄과 같은 차례다(0 이 가장 큰 조각). */
  donutSlice(index: number): Locator {
    return this.donutSlices.nth(index);
  }

  /**
   * 조각 하나를 손가락으로 누른다.
   *
   * 조각은 링 위의 호라서 상자 가운데를 누르면 링 구멍에 빠진다. 그 조각 호의 가운데 각도에
   * 있는 링 위 점을 계산해 누르고, 그 점에 실제로 그 조각이 있는지 먼저 확인한다.
   */
  async tapDonutSlice(index: number): Promise<void> {
    await this.donut.scrollIntoViewIfNeeded();
    const point = await this.donutSlice(index).evaluate((node) => {
      const circle = node as unknown as SVGCircleElement;
      const svg = circle.ownerSVGElement;
      if (svg == null) throw new Error('도넛 svg 가 없다');
      const radius = Number(circle.getAttribute('r'));
      const cx = Number(circle.getAttribute('cx'));
      const cy = Number(circle.getAttribute('cy'));
      const round = 2 * Math.PI * radius;
      const length = Number((circle.getAttribute('stroke-dasharray') ?? '0').split(' ')[0]);
      const start = -Number(circle.getAttribute('stroke-dashoffset') ?? '0');
      // 12시에서 시계 방향으로 돈다.
      const angle = (2 * Math.PI * (start + length / 2)) / round;
      const box = svg.getBoundingClientRect();
      const scale = box.width / svg.viewBox.baseVal.width;
      const x = box.left + (cx + radius * Math.sin(angle)) * scale;
      const y = box.top + (cy - radius * Math.cos(angle)) * scale;
      if (document.elementFromPoint(x, y) !== circle) throw new Error('누를 점에 그 조각이 없다');
      return { x, y };
    });
    await this.page.mouse.click(point.x, point.y);
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

  /** 차례로 본 줄의 이름 칸. 조각과 같은 차례다. */
  rowNameAt(index: number): Locator {
    return this.rows.nth(index).locator('.report__row-name');
  }

  rowAmountAt(index: number): Locator {
    return this.rows.nth(index).getByTestId(TEST_IDS.reportRowAmount);
  }

  share(name: string | RegExp): Locator {
    return this.row(name).getByTestId(TEST_IDS.reportRowShare);
  }

  /**
   * 무엇으로 냈나 카드. 한 번도 안 고른 달에는 아예 없다.
   */
  get methodCard(): Locator {
    return this.root.getByRole('heading', { name: '무엇으로 냈나' });
  }

  /** 결제 수단 한 줄. 신용카드·체크카드·현금·안 고름 중에서 나온다. */
  methodRows(): Locator {
    return this.root.getByTestId(TEST_IDS.reportMethods).getByRole('listitem');
  }

  methodRow(name: string): Locator {
    return this.methodRows().filter({ hasText: name });
  }

  /**
   * 태그별 조각 카드의 제목. 지출·수입 모드에 따라 말이 갈린다.
   *
   * 태그를 하나도 안 만든 사람에게는 이 카드가 통째로 없다.
   */
  tagCard(kindLabel: '지출' | '수입'): Locator {
    return this.root.getByRole('heading', { name: `태그별 ${kindLabel}`, exact: true });
  }

  /** 태그 조각 한 줄. 이름으로 찾는다. */
  tagRow(name: string): Locator {
    return this.root.getByRole('listitem').filter({ hasText: name });
  }

  /** 아직 태그를 안 단 돈을 말하는 한 줄. 조각에 안 들어간다는 것을 여기서 말한다. */
  get tagRest(): Locator {
    return this.root.getByText(/태그를 안 단 .+ 은 위 비율에 안 들어가요/);
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
   * 배너 자리 둘. 도넛 위와 「큰 지출 Top 5」 위다.
   *
   * 달을 옮길 때마다 본문을 다시 그리는 화면이라, 다시 붙는 것이 곧 광고 새로고침이 된다.
   * 그래서 자리마다 재요청 간격을 둔다. 둘을 함께 잡으면 strict mode 에 걸려 자리 이름으로 가른다.
   */
  get adSlot(): Locator {
    return this.root.locator('[data-placement="report"]');
  }

  /** 「큰 지출 Top 5」 위 배너. 소비 탭에만 선다(수입에는 아래에 아무것도 없다). */
  get bottomAdSlot(): Locator {
    return this.root.locator('[data-placement="report_bottom"]');
  }

  /** 제목 아래 한 줄 안내. 같이 쓰는 가계부가 있으면 이 자리에 가계부 칩이 대신 선다. */
  get lead(): Locator {
    return this.root.getByText('지출이 어디로 갔는지 봐요', { exact: true });
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

  /**
   * 입구에 적힌 광고 예고.
   *
   * 토스 노출 가이드가 「전면광고가 나오기 전, 명확한 광고 안내 표시가 있나요」 를 묻는
   * 자리다. 이 줄이 사라지면 그 검수를 통과하지 못한다.
   */
  get adNote(): Locator {
    return this.card.getByText(/광고/);
  }

  /** 열려 있는 결산 오버레이. 닫혀 있으면 DOM 에 아예 없다. */
  get overlay(): Locator {
    return this.page.getByRole('dialog', { name: /결산$/ });
  }

  /**
   * 결산을 연다. 광고가 붙는 자리면 확인 창이 한 번 서고 그때는 「광고 보고 열기」 를 누른다.
   * 열린 것까지 확인하고 돌아온다.
   *
   * 2026-09-23 반려 대응으로 생긴 단계다. 적어 두는 것만으로는 안 읽고 누른 사람에게
   * 아무 예고도 아니어서, 누른 뒤 광고 앞에서 한 번 묻는다.
   *
   * **누른 직후 한 번만 보고 가르지 않는다.** 확인 창은 광고를 띄울 수 있는지 저장소를
   * 읽은 뒤에 뜬다. 그 사이에 보면 「안 뜬다」 로 읽고 넘어가 오버레이를 영영 기다린다.
   * 확인 창과 오버레이 중 먼저 뜨는 쪽을 기다린 뒤 가른다.
   */
  async open(): Promise<void> {
    await this.card.click();
    await expect(this.adConsent.or(this.overlay).first()).toBeVisible();
    if (await this.adConsent.isVisible()) await this.adConsentConfirm.click();
    await expect(this.overlay).toBeVisible();
  }

  /** 누른 뒤 광고 앞에 서는 확인 창. */
  get adConsent(): Locator {
    return this.page.getByRole('alertdialog', { name: '광고가 한 번 나와요' });
  }

  /** 「광고 보고 열기」. 이 버튼이 곧 CTA 다. */
  get adConsentConfirm(): Locator {
    return this.adConsent.getByRole('button', { name: '광고 보고 열기' });
  }

  /** 「닫기」. 결산도 안 열리고 광고도 안 뜬다. */
  get adConsentCancel(): Locator {
    return this.adConsent.getByRole('button', { name: '닫기' });
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

  /**
   * 돈 흐름 카드의 한 줄. 이름표와 금액이 한 덩어리로 들어 있다.
   *
   * 값만 따로 잡으면 번 돈 자리에 쓴 돈 금액이 들어가도 통과한다. 줄째로 잡아
   * 어느 이름표 옆에 붙은 숫자인지까지 본다.
   * 한 번도 안 옮긴 달에는 `transfer` 줄이 아예 없다.
   */
  flowRow(row: 'income' | 'expense' | 'delta' | 'transfer' | 'saved'): Locator {
    return this.page.locator(`[data-testid="${TEST_IDS.closingFlowRow}"][data-row="${row}"]`);
  }

  /** 돈 흐름 줄 전부. 차례를 볼 때 `data-row` 를 읽는다. */
  get flowRows(): Locator {
    return this.overlay.getByTestId(TEST_IDS.closingFlowRow);
  }

  /** 순자산 장. 그 달 스냅샷이 없으면 없다. */
  get netWorth(): Locator {
    return this.overlay.getByTestId(TEST_IDS.closingNetWorth);
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

  /**
   * 마지막 장에만 서는 공유. 앞 석 장에는 없다.
   *
   * 한 달을 다 훑은 뒤라야 무엇을 알리는 것인지 알고 누른다.
   * 누르는 동안 이름이 「공유창 여는 중」으로 바뀐다.
   */
  get shareButton(): Locator {
    return this.overlay.getByRole('button', {
      name: /^(이번 결산 친구에게 공유하기|공유창 여는 중)$/,
    });
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
  /** 도넛 위 배너. 「큰 지출 Top 5」 위에도 하나 더 있어 자리 이름으로 가른다. */
  get bottomAdSlot(): Locator {
    return this.page.locator('[data-placement="report_bottom"]');
  }

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

/**
 * 리포트 머리의 가계부 칩.
 *
 * 칩의 읽는 이름은 「보는 가계부 <이름>」 이다. 기록 시트의 「내 가계부」 칩과 겹치지 않게
 * 앞말을 붙였다. 고르기 창은 홈과 같은 창이다.
 */
export class ReportBookArea {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get chip(): Locator {
    return this.page.getByRole('button', { name: /^보는 가계부 / });
  }

  get picker(): Locator {
    return this.page.getByRole('dialog', { name: '어느 가계부를 볼까요' });
  }

  /** 고르기 창의 한 줄. 이름 뒤에 인원(「2명」)이 붙어 읽혀 앞부분으로 찾는다. */
  pickerRow(name: string): Locator {
    return this.picker.getByRole('button', { name: startsWith(name) });
  }

  /** 칩을 눌러 그 가계부를 고른다. 창이 닫힌 것까지 보고 돌아온다. */
  async pick(name: string): Promise<void> {
    await this.chip.click();
    await expect(this.picker).toBeVisible();
    await this.pickerRow(name).click();
    await expect(this.picker).toBeHidden();
    await expect(this.chip).toHaveAccessibleName(`보는 가계부 ${name}`);
  }
}

/**
 * 공유 리포트의 「자세히 보기」.
 *
 * 잠겨 있으면 받을 것 목록과 「광고 보고 자세히 보기」 가 있고, 풀리면 같은 이름의 칸이 선다.
 * 칸은 이름 붙은 group 이라 이름으로 잡는다.
 */
export class ReportInsightArea {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** 「<가계부 이름> 소비 자세히 보기」 카드. */
  get card(): Locator {
    return this.page.getByRole('region', { name: /소비 자세히 보기$/ });
  }

  get unlockButton(): Locator {
    return this.card.getByRole('button', { name: '광고 보고 자세히 보기', exact: true });
  }

  /** 광고를 띄우는 동안 버튼 글자. */
  get loadingButton(): Locator {
    return this.card.getByRole('button', { name: '광고를 불러오는 중이에요', exact: true });
  }

  /** 잠긴 카드가 미리 적어 둔 받을 것. 풀린 뒤에는 없다. */
  get topics(): Locator {
    return this.card.getByRole('listitem');
  }

  /** 풀린 카드의 한 칸. 「지난달과 비교」·「가장 많이 늘어난 소비」·「분류별 자세히」·「월말 예상」 */
  part(label: string): Locator {
    return this.card.getByRole('group', { name: label, exact: true });
  }

  /** 「분류별 자세히」 의 한 줄. */
  changeRow(name: string): Locator {
    return this.part('분류별 자세히').getByRole('listitem').filter({ hasText: name });
  }
}

/** 이름 앞부분이 같은 것을 찾는다. 이름 뒤에 인원 같은 말이 붙어 읽힌다. */
function startsWith(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
}
