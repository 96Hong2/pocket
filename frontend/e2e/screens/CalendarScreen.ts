import { expect, type Locator, type Page } from '@playwright/test';

import { ROUTES } from '../../src/app/router/routes';
import { dayCellLabel } from '../../src/features/transactions/ledgerView';
import { TEST_IDS } from '../../src/shared/testIds';
import { horizontalScrollersIn } from '../support/overflow';

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
  /** 합계·달력 조회가 실패했거나 아직 오지 않았을 때 그 자리에 서는 것. */
  readonly trouble: LoadTroubleArea;

  constructor(page: Page) {
    this.page = page;
    this.totals = new MonthTotalsArea(page);
    this.grid = new CalendarGridArea(page);
    this.list = new LedgerListArea(page);
    this.search = new SearchArea(page);
    this.edit = new EditSheetArea(page);
    this.trouble = new LoadTroubleArea(page);
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

  /**
   * 그 날 칸이 스크린리더에 읽히는 이름.
   *
   * 문구는 화면이 쓰는 함수를 그대로 부른다. 베껴 적으면 화면만 바뀌어도 눈치채지 못한다.
   * 안 적은 쪽은 0원이다. 환불이 그날 지출을 깎으므로 expense 는 음수로 들어올 수 있다.
   * `isNoSpend` 는 안 쓴 날로 적어 둔 날이다. 금액이 0 이라 그 표시로만 가려진다.
   */
  cellName(
    iso: string,
    totals?: { expense?: number; income?: number; isNoSpend?: boolean },
  ): string {
    if (totals == null) return dayCellLabel(iso);
    return dayCellLabel(iso, {
      expense: totals.expense ?? 0,
      income: totals.income ?? 0,
      isNoSpend: totals.isNoSpend ?? false,
    });
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

  /**
   * 안 쓴 날로 적어 둔 줄.
   *
   * 홈은 '오늘은 안 썼어요' 라고 적고 달력은 고른 날이라 날짜를 말하지 않는다.
   * 눌러도 아무 일이 없어야 하는 읽기 전용 줄이다.
   */
  get noSpendRow(): Locator {
    return this.root.getByText('안 썼어요', { exact: true });
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

  /** 기록이 없는 날에 목록 자리를 대신하는 한 줄. */
  get emptyDay(): Locator {
    return this.root.getByText('이 날은 기록이 없어요. 없는 날도 괜찮아요.', { exact: true });
  }

  /** 행을 눌러 수정 시트를 연다. */
  async pick(title: string): Promise<void> {
    await this.row(title).click();
  }

  /**
   * 고른 날에 적는 버튼. **이름에 그 날이 적혀 있다.**
   *
   * 「기록하기」 라고만 쓰면 오늘에 적히는 홈의 버튼과 구분이 안 된다.
   * 띄어쓰기가 든 이름(「9월 12일 기록하기」)도 잡아야 하므로 끝만 못 박는다.
   */
  get recordButton(): Locator {
    return this.root.getByRole('button', { name: /기록하기$/ });
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

  /**
   * 찍고 나서 입력이 잦아들기를 기다린다. 화면이 250ms 뒤에 서버를 부른다.
   *
   * 결과가 0건이면 건수 줄과 '맞는 내역이 없어요' 가 함께 뜬다. 둘 중 하나만 뜬다고 보고
   * 기다리면 strict mode 위반으로 죽는다. 여기서는 "결과가 도착했다" 만 확인하고,
   * 어느 쪽이 맞는지는 부르는 spec 이 단언한다.
   */
  async find(text: string): Promise<void> {
    await this.input.fill(text);
    await expect(this.resultCount.or(this.noResult).first()).toBeVisible();
  }

  async clear(): Promise<void> {
    await this.clearButton.click();
  }
}

/** 수정 시트. 상호·금액·카테고리·예산 제외를 한 화면에서 고친다.
 *
 * 달력과 홈이 같은 시트를 쓴다. 화면마다 사본을 만들면 규칙도 둘이 된다. */
export class EditSheetArea {
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

  /** 지출인지 수입인지 고르는 알약 두 개. 이 시트에도 aria-pressed 를 쓴다. */
  get kindToggle(): Locator {
    return this.root.getByRole('group', { name: '지출인지 수입인지' });
  }

  kindButton(label: string): Locator {
    return this.kindToggle.getByRole('button', { name: label, exact: true });
  }

  /** 고를 수 있는 카테고리 칩이 놓인 자리. */
  get categoryGroup(): Locator {
    return this.root.getByRole('group', { name: '카테고리' });
  }

  /**
   * 지금 골라 둔 카테고리 칩. 화면이 aria-pressed 로 알린다.
   *
   * 종류 토글도 같은 속성을 쓰므로 칩 자리 안에서만 찾는다. 시트 전체에서 찾으면
   * '지출' 알약이 함께 잡혀 무엇을 골랐는지 못 가린다.
   */
  get pickedCategory(): Locator {
    return this.categoryGroup.locator('button[aria-pressed="true"]');
  }

  /** 앞자리에 안 선 분류를 펼치는 칩. 기록 시트와 같은 규칙이다. */
  get moreCategoriesButton(): Locator {
    return this.categoryGroup.getByRole('button', { name: '더 보기', exact: true });
  }

  /**
   * 펼친 목록을 다시 접는 버튼.
   *
   * 지금 걸린 분류가 앞자리 밖에 있을 때는 없어야 한다. 접는 순간 눌러 둔 표시가
   * 화면에서 사라져, 아무것도 안 고른 것처럼 보인다.
   */
  get foldCategoriesButton(): Locator {
    return this.categoryGroup.getByRole('button', { name: '접기', exact: true });
  }

  /**
   * 분류를 이 자리에서 바로 만든다. **「더 보기」 안에 있다.**
   *
   * 나중에 내역을 보다가 「이건 따로 세고 싶다」 고 생각하는 순간이 여기다. 그때
   * 관리 탭까지 나갔다 오면 고쳐 둔 값이 사라진다.
   * 앞자리는 고르는 자리라 만들기를 늘 세워 두지 않는다.
   */
  get newCategoryButton(): Locator {
    return this.categoryGroup.getByRole('button', { name: '새 분류', exact: true });
  }

  /** 「더 보기」를 펴고 만들기를 연다. 두 번 누르는 것이 한 동작이다. */
  async openNewCategory(): Promise<void> {
    if ((await this.newCategoryButton.count()) === 0) {
      await this.moreCategoriesButton.click();
    }
    await this.newCategoryButton.click();
  }

  /** 앞자리에 없으면 한 번 펼치고 고른다. */
  async pickCategory(name: string): Promise<void> {
    if ((await this.categoryChip(name).count()) === 0) {
      await this.moreCategoriesButton.click();
    }
    await this.categoryChip(name).click();
  }

  /** 「새 분류」를 누르면 칩 자리에 펼쳐지는 만들기 폼. */
  get newCategoryTitle(): Locator {
    return this.root.getByText('새 분류 만들기', { exact: true });
  }

  get newCategoryNameField(): Locator {
    return this.root.getByLabel('이름', { exact: true });
  }

  get newCategorySaveButton(): Locator {
    return this.root.getByRole('button', { name: '저장', exact: true });
  }

  get newCategoryBackButton(): Locator {
    return this.root.getByRole('button', { name: '고치기로 돌아가기', exact: true });
  }

  /** 이름과 아이콘을 채워 한 건을 만든다. 기록 시트의 만들기 자리와 같은 폼이다. */
  async createCategory(name: string, iconLabel: string): Promise<void> {
    await this.newCategoryNameField.fill(name);
    await this.root
      .getByRole('group', { name: '아이콘' })
      .getByRole('button', { name: iconLabel, exact: true })
      .click();
    await this.newCategorySaveButton.click();
  }

  /** 무엇으로 냈나. 지출일 때만 선다. */
  get paymentGroup(): Locator {
    return this.root.getByRole('group', { name: '결제 수단' });
  }

  paymentButton(label: '신용카드' | '체크카드' | '현금'): Locator {
    return this.paymentGroup.getByRole('button', { name: label, exact: true });
  }

  get excludeToggle(): Locator {
    return this.root.getByRole('switch', { name: '예산 계산에서 제외' });
  }

  get deleteButton(): Locator {
    return this.root.getByRole('button', { name: '삭제' });
  }

  /**
   * 지우기 전 물음. 시트를 하나 더 겹치지 않고 버튼 줄 자체가 이 자리로 바뀐다.
   *
   * 되돌릴 수 없는 유일한 동작이라 한 걸음을 둔다.
   */
  get deleteConfirm(): Locator {
    return this.root.getByRole('group', { name: '삭제 확인' });
  }

  get confirmDeleteButton(): Locator {
    return this.deleteConfirm.getByRole('button', { name: '지울게요', exact: true });
  }

  get keepButton(): Locator {
    return this.deleteConfirm.getByRole('button', { name: '그대로 둘래요', exact: true });
  }

  get doneButton(): Locator {
    return this.root.getByRole('button', { name: '완료' });
  }

  /** 저장이 실패했을 때 버튼 위에 뜨는 한 줄. */
  get notice(): Locator {
    return this.root.getByRole('alert');
  }

  /** 금액이 비었거나 0일 때 완료가 잠긴 이유를 알리는 한 줄. */
  get amountHint(): Locator {
    return this.root.getByText('금액은 1원부터 넣을 수 있어요', { exact: true });
  }

  /** 시트 안에서 가로로 구르는 자리. 판정은 support/overflow.ts 한 곳이 한다. */
  async horizontalScrollers(): Promise<string[]> {
    return horizontalScrollersIn(this.root);
  }

  async done(): Promise<void> {
    await this.doneButton.click();
    await this.waitClosed();
  }

  /** 지우기를 끝까지. 묻는 한 걸음을 지나야 실제로 지워진다. */
  async remove(): Promise<void> {
    await this.deleteButton.click();
    await expect(this.deleteConfirm).toBeVisible();
    await this.confirmDeleteButton.click();
    await this.waitClosed();
  }

  /**
   * 묻는 데까지만 간다. 지우지는 않는다.
   *
   * 지우기가 실패했을 때 물음이 어떻게 되는지 보려면 `remove` 를 못 쓴다.
   * 그쪽은 시트가 닫히기를 기다려서, 안 닫히는 것이 맞는 자리에서는 항상 실패한다.
   */
  async askDelete(): Promise<void> {
    await this.deleteButton.click();
    await expect(this.deleteConfirm).toBeVisible();
  }
}

/**
 * 조회가 실패했거나 아직 안 왔을 때 달력이 하는 말.
 *
 * 합계와 달력이 따로 실패한다. 한 덩어리로 묶으면 무엇을 못 불러왔는지 알 수 없어서
 * 카드도 둘이다. 카드는 제목으로 가르고, 그 안에서만 「다시 시도」를 찾는다.
 * 둘이 함께 실패하면 같은 이름의 버튼이 화면에 둘이라 바깥에서 찾으면 못 가린다.
 */
class LoadTroubleArea {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** 제목으로 가른 실패 카드. 상태 알림 상자 하나가 카드 하나다. */
  private card(title: string): Locator {
    return this.page.getByRole('status').filter({ hasText: title });
  }

  get totalsError(): Locator {
    return this.card('이번 달 합계를 불러오지 못했어요');
  }

  get totalsRetryButton(): Locator {
    return this.totalsError.getByRole('button', { name: '다시 시도' });
  }

  /**
   * 합계를 기다리는 동안의 자리표시자.
   *
   * 글자는 화면에 안 그리고 스크린리더에만 읽힌다. 그래서 이름으로 잡는다.
   */
  get totalsLoading(): Locator {
    return this.page.getByRole('status', { name: '이번 달 합계를 불러오는 중이에요' });
  }

  get gridError(): Locator {
    return this.card('달력을 불러오지 못했어요');
  }

  get gridRetryButton(): Locator {
    return this.gridError.getByRole('button', { name: '다시 시도' });
  }
}
