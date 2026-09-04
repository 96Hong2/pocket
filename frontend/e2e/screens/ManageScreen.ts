import { expect, type Locator, type Page } from '@playwright/test';

import { ROUTES } from '../../src/app/router/routes';
import { TEST_IDS } from '../../src/shared/testIds';

/**
 * 관리 탭. 예산을 여기서 바로 정하고 고친다.
 *
 * 홈·달력과 URL 이 달라 별도 화면 객체다. 한 화면 안에 쌓인 것이 많아
 * 전체 예산 카드·카테고리 예산·이어쓰기 배너·설정 한 줄로 나눠 들고 있다.
 * 셀렉터는 이 파일 안에만 두고, 단언은 spec 이 한다.
 */
export class ManageScreen {
  private readonly page: Page;
  /** 예산 섹션 전체. 관리 탭의 다른 것들과 섞이지 않게 여기 안에서만 찾는다. */
  private readonly section: Locator;

  /** 전체 예산 카드와 금액 입력 시트. */
  readonly total: BudgetTotalArea;
  /** 카테고리 예산 목록과 추가·수정 시트. */
  readonly categories: CategoryBudgetArea;
  /** 지난달 예산을 그대로 가져왔을 때 뜨는 안내 띠. */
  readonly banner: CarryoverBannerArea;
  /** 예산 섹션 아래 설정 한 줄. */
  readonly settings: BudgetSettingArea;
  /** 기억한 분류 규칙 목록. 예산 섹션 밖이라 페이지에서 잡는다. */
  readonly rules: MerchantRuleArea;

  constructor(page: Page) {
    this.page = page;
    // '카테고리 예산' 도 region 이라 이름을 정확히 맞춰야 바깥 섹션만 잡힌다.
    this.section = page.getByRole('region', { name: '예산', exact: true });
    this.total = new BudgetTotalArea(page, this.section);
    this.categories = new CategoryBudgetArea(page);
    this.banner = new CarryoverBannerArea(page);
    this.settings = new BudgetSettingArea(page);
    this.rules = new MerchantRuleArea(page);
  }

  async open(): Promise<void> {
    await this.page.goto(ROUTES.manage);
  }

  /**
   * 그 달 조회가 끝난 뒤.
   *
   * 예산이 있으면 한도 금액이, 없으면 빈 상태 제목이 뜬다. 둘 중 하나가 보이면
   * 로딩 자리표시자가 걷힌 것이다.
   */
  async waitReady(): Promise<void> {
    await expect(this.total.amount.or(this.total.emptyTitle)).toBeVisible();
  }

  /** 지금 보고 있는 달. `2026년 9월`. */
  get monthLabel(): Locator {
    return this.section.getByText(/^\d{4}년 \d{1,2}월$/);
  }

  /** 끝난 달에 뜨는 안내. 이 달은 보기만 한다는 말이다. */
  get closedNotice(): Locator {
    return this.section.getByText('끝난 달이에요 · 보기만 할 수 있어요', { exact: true });
  }

  /** 달을 옮긴다. 버튼 이름에 갈 달이 적혀 있어 그것으로 집는다. */
  async goToMonth(label: string): Promise<void> {
    await this.section.getByRole('button', { name: `${label}로 이동` }).click();
    await expect(this.monthLabel).toHaveText(label);
    await this.waitReady();
  }
}

/**
 * 전체 예산 카드.
 *
 * 카드 자체에는 잡을 이름이 없어 제목을 기준으로 좁힌다. 이어쓰기 배너에도 `수정` 이
 * 있어서, 섹션 전체에서 이름만으로 찾으면 어느 쪽을 눌렀는지 알 수 없다.
 */
class BudgetTotalArea {
  private readonly page: Page;
  private readonly section: Locator;

  /** 금액을 정하는 바텀시트. 처음 정할 때와 고칠 때가 같은 시트다. */
  readonly sheet: AmountSheetArea;

  constructor(page: Page, section: Locator) {
    this.page = page;
    this.section = section;
    this.sheet = new AmountSheetArea(page);
  }

  /** `이번 달 전체 예산` 또는 `8월 전체 예산`. */
  get title(): Locator {
    return this.section.getByRole('heading', { level: 3, name: /전체 예산$/ });
  }

  get amount(): Locator {
    return this.page.getByTestId(TEST_IDS.budgetTotalAmount);
  }

  get gauge(): Locator {
    return this.page.getByTestId(TEST_IDS.budgetTotalGauge);
  }

  get used(): Locator {
    return this.page.getByTestId(TEST_IDS.budgetUsed);
  }

  get left(): Locator {
    return this.page.getByTestId(TEST_IDS.budgetLeft);
  }

  /** 카드 아래 한 줄. 진행률과 하루 가용액이 여기 붙는다. */
  get caption(): Locator {
    return this.page.getByTestId(TEST_IDS.budgetCaption);
  }

  /** 예산이 없을 때의 제목. 이번 달과 끝난 달의 문구가 다르다. */
  get emptyTitle(): Locator {
    return this.section.getByText(/^(아직 \d{1,2}월 예산이 없어요|이 달엔 예산이 없었어요)$/);
  }

  /** 빈 상태의 설명 한 줄. 왜 없는지 단정하지 않고 아는 것만 말하는 자리다. */
  get emptyNote(): Locator {
    return this.section.getByText(
      /^(정하면 남은 예산과 하루에 쓸 수 있는 돈을 알려드려요\.|예산 없이 기록만 해도 괜찮아요)$/,
    );
  }

  /** 아직 예산이 없을 때 여는 버튼. */
  get startButton(): Locator {
    return this.section.getByRole('button', { name: '예산 정하기' });
  }

  /**
   * 카드 머리. 제목과 `수정` 이 나란히 있다.
   *
   * 제목을 품은 가장 안쪽 상자가 그 자리다. 바깥 카드도 제목을 품고 있어 마지막 것을 고른다.
   */
  private get head(): Locator {
    return this.section
      .locator('div')
      .filter({ has: this.page.getByRole('heading', { level: 3, name: /전체 예산$/ }) })
      .last();
  }

  /** 카드 안의 `수정`. 배너의 같은 이름 버튼과 섞이지 않게 카드 머리에서만 찾는다. */
  get editButton(): Locator {
    return this.head.getByRole('button', { name: '수정', exact: true });
  }

  get deleteButton(): Locator {
    return this.section.getByRole('button', { name: '예산 지우기' });
  }

  /** 게이지가 스크린리더에 알리는 사용률(%). 게이지가 없으면 null. */
  async gaugePercent(): Promise<number | null> {
    if ((await this.gauge.count()) === 0) return null;
    const value = await this.gauge.getAttribute('aria-valuenow');
    return value == null ? null : Number(value);
  }

  /** 처음 정한다. 시트를 열고 금액을 넣어 저장한다. */
  async start(amount: number): Promise<void> {
    await this.startButton.click();
    await this.sheet.save(amount);
  }

  /** 카드의 `수정` 으로 시트만 연다. 열린 시트에 무엇이 들어 있는지 볼 때 쓴다. */
  async openEdit(): Promise<void> {
    await this.editButton.click();
    await this.sheet.waitOpen();
  }

  /** 카드의 `수정` 으로 금액을 바꾼다. */
  async edit(amount: number): Promise<void> {
    await this.openEdit();
    await this.sheet.save(amount);
  }

  async remove(): Promise<void> {
    await this.deleteButton.click();
  }
}

/** 전체 예산 금액 시트. 카드의 버튼과 배너의 `수정` 이 같은 것을 연다. */
class AmountSheetArea {
  private readonly root: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('dialog', { name: '전체 예산', exact: true });
  }

  get amountField(): Locator {
    return this.root.getByLabel('금액');
  }

  get saveButton(): Locator {
    return this.root.getByRole('button', { name: '저장' });
  }

  async waitOpen(): Promise<void> {
    await expect(this.root).toBeVisible();
  }

  async waitClosed(): Promise<void> {
    await expect(this.root).toHaveCount(0);
  }

  /** 금액을 넣고 저장한다. 시트가 닫히면 저장이 끝난 것이다. */
  async save(amount: number): Promise<void> {
    await this.waitOpen();
    await this.amountField.fill(String(amount));
    await this.saveButton.click();
    await this.waitClosed();
  }
}

/** 카테고리 예산 목록. 전체 예산이 있어야 나온다. */
class CategoryBudgetArea {
  private readonly page: Page;
  private readonly root: Locator;

  /** 추가와 수정이 같은 시트다. */
  readonly sheet: CategoryBudgetSheetArea;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByRole('region', { name: '카테고리 예산', exact: true });
    this.sheet = new CategoryBudgetSheetArea(page);
  }

  /** 한도를 정해 둔 줄 전부. */
  get rows(): Locator {
    return this.root.getByTestId(TEST_IDS.categoryBudgetRow);
  }

  /** 제목 옆 개수 배지. `3개`. */
  get countBadge(): Locator {
    return this.root.getByText(/^\d+개$/);
  }

  get addButton(): Locator {
    return this.root.getByRole('button', { name: '카테고리 예산 추가' });
  }

  /** 합이 전체 예산보다 클 때만 뜨는 한 줄. */
  get sumNotice(): Locator {
    return this.root.getByTestId(TEST_IDS.categoryBudgetSum);
  }

  /** 그 카테고리의 줄. 줄 안에 적힌 이름으로 가른다. */
  row(name: string): Locator {
    return this.rows.filter({ has: this.page.getByText(name, { exact: true }) });
  }

  used(name: string): Locator {
    return this.row(name).getByTestId(TEST_IDS.categoryBudgetUsed);
  }

  cap(name: string): Locator {
    return this.row(name).getByTestId(TEST_IDS.categoryBudgetCap);
  }

  /** 80% 이상 썼을 때 이름 옆에 붙는 칩. */
  caution(name: string): Locator {
    return this.row(name).getByText('주의', { exact: true });
  }

  /** 줄을 누를 수 있는 상태인지. 끝난 달에는 버튼이 아니라 그냥 글이다. */
  editButton(name: string): Locator {
    return this.row(name).getByRole('button', { name: `${name} 예산 수정` });
  }

  /** 새 카테고리 한도를 정한다. */
  async add(name: string, amount: number): Promise<void> {
    await this.addButton.click();
    await this.sheet.waitOpen();
    await this.sheet.pick(name);
    await this.sheet.save(amount);
  }

  /** 이미 정해 둔 줄을 눌러 시트만 연다. 지금 한도가 들어 있는지 볼 때 쓴다. */
  async openEdit(name: string): Promise<void> {
    await this.editButton(name).click();
    await this.sheet.waitOpen();
  }

  /** 이미 정해 둔 줄을 눌러 한도를 바꾼다. */
  async edit(name: string, amount: number): Promise<void> {
    await this.openEdit(name);
    await this.sheet.save(amount);
  }

  /** 이미 정해 둔 줄을 눌러 한도를 지운다. */
  async remove(name: string): Promise<void> {
    await this.openEdit(name);
    await this.sheet.remove();
  }
}

/** 카테고리 예산 시트. 추가일 때만 고르기 칩이 있다. */
class CategoryBudgetSheetArea {
  private readonly root: Locator;

  constructor(page: Page) {
    // 추가는 `카테고리 예산 추가`, 수정은 `카테고리 예산` 이다.
    this.root = page.getByRole('dialog', { name: /^카테고리 예산( 추가)?$/ });
  }

  get amountField(): Locator {
    return this.root.getByLabel('한도');
  }

  get saveButton(): Locator {
    return this.root.getByRole('button', { name: '저장' });
  }

  get deleteButton(): Locator {
    return this.root.getByRole('button', { name: '지우기', exact: true });
  }

  /** 고르기 칩 묶음. 추가할 때만 있고, 이미 정한 줄을 고칠 때는 없다. */
  get picker(): Locator {
    return this.root.getByRole('group', { name: '카테고리' });
  }

  /** 고를 수 있는 카테고리 칩. 이미 한도가 있는 것은 여기 없다. */
  categoryChip(name: string): Locator {
    return this.picker.getByRole('button', { name });
  }

  async waitOpen(): Promise<void> {
    await expect(this.root).toBeVisible();
  }

  async waitClosed(): Promise<void> {
    await expect(this.root).toHaveCount(0);
  }

  async pick(name: string): Promise<void> {
    await this.categoryChip(name).click();
  }

  async save(amount: number): Promise<void> {
    await this.amountField.fill(String(amount));
    await this.saveButton.click();
    await this.waitClosed();
  }

  async remove(): Promise<void> {
    await this.deleteButton.click();
    await this.waitClosed();
  }
}

/** 지난달 예산을 그대로 가져왔을 때 뜨는 띠. 닫기 버튼은 없다. */
class CarryoverBannerArea {
  private readonly root: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('group', { name: '이어쓴 예산 안내' });
  }

  /** 띠 자체. 떴는지 없는지를 이걸로 본다. */
  get card(): Locator {
    return this.root;
  }

  get text(): Locator {
    return this.root.getByText('지난달 예산을 그대로 가져왔어요', { exact: true });
  }

  /** 띠 안의 `수정`. 전체 예산 카드에도 같은 이름이 있어 띠 안에서만 찾는다. */
  get editButton(): Locator {
    return this.root.getByRole('button', { name: '수정', exact: true });
  }
}

/** 예산 섹션 아래 설정 한 줄. 달을 옮겨도 같은 값이다. */
class BudgetSettingArea {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get carryoverToggle(): Locator {
    return this.page.getByRole('switch', { name: '다음 달에도 이 예산을 이어서 쓸게요' });
  }

  /** 토글을 눌러 원하는 상태로 만든다. 저장이 끝나야 aria-checked 가 바뀐다. */
  async setCarryover(enabled: boolean): Promise<void> {
    await this.carryoverToggle.click();
    await expect(this.carryoverToggle).toHaveAttribute('aria-checked', String(enabled));
  }
}

/** 관리 탭의 기억한 분류. 줄글로 저장할 때 늘어난다. */
class MerchantRuleArea {
  private readonly root: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('region', { name: '기억한 분류', exact: true });
  }

  get rows(): Locator {
    return this.root.getByTestId(TEST_IDS.merchantRuleRow);
  }

  get emptyTitle(): Locator {
    return this.root.getByText('아직 기억한 분류가 없어요');
  }

  row(merchant: string): Locator {
    return this.rows.filter({ hasText: merchant });
  }

  async remove(merchant: string): Promise<void> {
    await this.row(merchant).getByRole('button', { name: '지우기' }).click();
    await expect(this.row(merchant)).toHaveCount(0);
  }
}
