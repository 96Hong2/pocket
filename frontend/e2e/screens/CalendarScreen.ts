import { expect, type Locator, type Page } from '@playwright/test';

import { ROUTES } from '../../src/app/router/routes';
import { TEST_IDS } from '../../src/shared/testIds';

/**
 * 월간 달력 화면. 달력·선택한 날 목록·검색·수정 시트를 한 화면이 다 가진다.
 *
 * 셀렉터는 이 파일 안에만 둔다. 숫자만 그리는 합계는 testid 로 잡고,
 * 날짜 칸·행·시트 입력은 접근성 이름으로 잡는다. 단언은 spec 이 한다.
 */
export class CalendarScreen {
  private readonly page: Page;

  /** 지출·수입·차액 띠. */
  readonly totals: MonthTotalsArea;
  /** 날짜 격자. */
  readonly grid: CalendarGridArea;
  /** 선택한 날 목록과 검색 결과가 함께 쓰는 목록 자리. */
  readonly list: LedgerListArea;
  /** 검색 입력과 결과 안내. */
  readonly search: SearchArea;
  /** 행을 누르면 열리는 수정 시트. */
  readonly edit: EditSheetArea;

  constructor(page: Page) {
    this.page = page;
    this.totals = new MonthTotalsArea(page);
    this.grid = new CalendarGridArea(page);
    this.list = new LedgerListArea(page);
    this.search = new SearchArea(page);
    this.edit = new EditSheetArea(page);
  }

  async open(): Promise<void> {
    await this.page.goto(ROUTES.calendar);
  }

  /** 그릴 것을 다 그린 뒤. 합계 띠가 뜨면 그 달 조회가 끝난 것이다. */
  async waitReady(): Promise<void> {
    await expect(this.totals.expense).toBeVisible();
  }

  /** 지금 보고 있는 달. `2026년 9월`. */
  get monthLabel(): Locator {
    return this.page.getByText(/^\d{4}년 \d{1,2}월$/);
  }

  /** 지난달로 옮긴다. 버튼 이름에 갈 달이 적혀 있어 그것으로 집는다. */
  async goToMonth(label: string): Promise<void> {
    await this.page.getByRole('button', { name: `${label}로 이동` }).click();
    await expect(this.page.getByText(label, { exact: true })).toBeVisible();
  }
}

/** 지출·수입·차액 띠. 숫자만 그려서 testid 로 잡는다. */
class MonthTotalsArea {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get expense(): Locator {
    return this.page.getByTestId(TEST_IDS.monthTotalExpense);
  }

  get income(): Locator {
    return this.page.getByTestId(TEST_IDS.monthTotalIncome);
  }

  /** 수입 - 지출. 남은 예산과 다른 개념이다. */
  get delta(): Locator {
    return this.page.getByTestId(TEST_IDS.monthTotalDelta);
  }
}

/** 날짜 격자. 칸마다 날짜와 금액이 접근성 이름에 들어 있다. */
class CalendarGridArea {
  private readonly root: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('group', { name: '날짜 고르기' });
  }

  /** 그 날 칸. 금액까지 맞춰 보려면 이름 전체를 넘긴다. */
  cell(name: string | RegExp): Locator {
    return this.root.getByRole('button', { name });
  }

  /** 지금 골라 둔 칸. 화면이 스크린리더에 알리는 방식 그대로 본다. */
  get selected(): Locator {
    return this.root.locator('button[aria-current="date"]');
  }

  async select(name: string | RegExp): Promise<void> {
    await this.cell(name).click();
  }

  /** 그려진 날짜 칸 수. 달마다 며칠인지 화면이 스스로 맞추는지 본다. */
  async cellCount(): Promise<number> {
    return this.root.getByRole('button').count();
  }
}

/**
 * 목록 자리. 고른 날 기록과 검색 결과가 같은 것을 쓴다.
 *
 * 목록 영역 안에서만 글자를 찾는다. 화면 밖에서 찾으면 합계 띠의 '수입' 같은 라벨과
 * 행에 붙은 '수입' 칩이 함께 잡혀 무엇을 본 것인지 알 수 없다.
 */
class LedgerListArea {
  private readonly root: Locator;

  constructor(page: Page) {
    this.root = page
      .getByRole('region', { name: '고른 날 기록' })
      .or(page.getByRole('region', { name: '검색 결과' }));
  }

  /** 고른 날의 지출 합계. 목록 제목 오른쪽에 붙는다. */
  get dayTotal(): Locator {
    return this.root.getByTestId(TEST_IDS.dayTotal);
  }

  /** 행 제목. 가맹점을 아는 기록은 가맹점명, 아니면 카테고리 이름이다. */
  row(title: string): Locator {
    return this.root.getByText(title, { exact: true });
  }

  /** 제목 아래 붙는 칩. '예산 제외' · '이체' · '환불' · '수입'. */
  chip(label: string): Locator {
    return this.root.getByText(label, { exact: true });
  }

  get moreButton(): Locator {
    return this.root.getByRole('button', { name: '더 보기' });
  }

  /** 다음 페이지를 받고, 버튼이 다시 눌릴 수 있는 상태가 될 때까지 기다린다. */
  async more(): Promise<void> {
    await this.moreButton.click();
    await expect(this.root.getByRole('button', { name: '불러오는 중…' })).toHaveCount(0);
  }

  get emptyDay(): Locator {
    return this.root.getByText('이 날은 기록이 없어요', { exact: true });
  }

  /** 행을 눌러 수정 시트를 연다. */
  async pick(title: string): Promise<void> {
    await this.row(title).click();
  }
}

/** 검색 입력과 결과 안내. */
class SearchArea {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get input(): Locator {
    return this.page.getByLabel('기록 검색');
  }

  get clearButton(): Locator {
    return this.page.getByRole('button', { name: '검색어 지우기' });
  }

  /** `검색 결과 3건`. 더 남았으면 `건 이상` 이라고 적힌다. */
  get resultCount(): Locator {
    return this.page.getByText(/^검색 결과 \d+건( 이상)?$/);
  }

  get noResult(): Locator {
    return this.page.getByText('맞는 내역이 없어요', { exact: true });
  }

  /** 찍고 나서 입력이 잦아들기를 기다린다. 화면이 250ms 뒤에 서버를 부른다. */
  async find(text: string): Promise<void> {
    await this.input.fill(text);
    await expect(this.resultCount.or(this.noResult)).toBeVisible();
  }

  async clear(): Promise<void> {
    await this.clearButton.click();
  }
}

/** 수정 시트. 상호·금액·카테고리·예산 제외를 한 화면에서 고친다. */
class EditSheetArea {
  private readonly root: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('dialog', { name: '기록 수정' });
  }

  async waitOpen(): Promise<void> {
    await expect(this.root).toBeVisible();
  }

  async waitClosed(): Promise<void> {
    await expect(this.root).toHaveCount(0);
  }

  /** 맨 위 한 줄. `스타벅스 · 9월 10일`. */
  get title(): Locator {
    return this.root.getByText(/ · \d{1,2}월 \d{1,2}일$/);
  }

  get merchant(): Locator {
    return this.root.getByLabel('상호');
  }

  get amount(): Locator {
    return this.root.getByLabel('금액');
  }

  categoryChip(name: string): Locator {
    return this.root.getByRole('button', { name, exact: true });
  }

  /** 지금 골라 둔 카테고리 칩. 화면이 aria-pressed 로 알린다. */
  get pickedCategory(): Locator {
    return this.root.locator('button[aria-pressed="true"]');
  }

  get excludeToggle(): Locator {
    return this.root.getByRole('switch', { name: '예산 계산에서 제외' });
  }

  get deleteButton(): Locator {
    return this.root.getByRole('button', { name: '삭제' });
  }

  get doneButton(): Locator {
    return this.root.getByRole('button', { name: '완료' });
  }

  /** 저장이 실패했을 때 버튼 위에 뜨는 한 줄. */
  get notice(): Locator {
    return this.root.getByRole('alert');
  }

  async done(): Promise<void> {
    await this.doneButton.click();
    await this.waitClosed();
  }

  async remove(): Promise<void> {
    await this.deleteButton.click();
    await this.waitClosed();
  }
}
