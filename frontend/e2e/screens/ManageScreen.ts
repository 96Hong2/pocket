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
  /** 생활비 계산기. 예산 시트의 「계산해서 정하기」 로만 열린다. */
  readonly calc: BudgetCalcArea;
  /** 카테고리 예산 목록과 추가·수정 시트. */
  readonly categories: CategoryBudgetArea;
  /** 지난달 예산을 그대로 가져왔을 때 뜨는 안내 띠. */
  readonly banner: CarryoverBannerArea;
  /** 예산 섹션 아래 설정 한 줄. */
  readonly settings: BudgetSettingArea;

  constructor(page: Page) {
    this.page = page;
    // '카테고리 예산' 도 region 이라 이름을 정확히 맞춰야 바깥 섹션만 잡힌다.
    this.section = page.getByRole('region', { name: '예산', exact: true });
    this.total = new BudgetTotalArea(page, this.section);
    this.calc = new BudgetCalcArea(page);
    this.categories = new CategoryBudgetArea(page);
    this.banner = new CarryoverBannerArea(page);
    this.settings = new BudgetSettingArea(page);
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

  /**
   * 예산 위의 자산 입구 카드.
   *
   * 목록 줄이 아니라 순자산을 그 자리에 그리는 카드라 이름에 금액이 붙는다.
   * 이름을 못 박으면 안 잡혀서 제목으로 시작하는지만 본다.
   */
  get assetsEntry(): Locator {
    return this.page.getByRole('link', { name: /^자산관리/ });
  }

  /**
   * 「기록을 지켜 두세요」 줄의 본문.
   *
   * 제목은 내 계정 카드와 글자가 같아 이 줄로 가른다.
   * 몇 번 와 본 사람에게만, 그리고 메일을 보낼 수단이 있을 때만 선다.
   */
  get keepDataNote(): Locator {
    return this.page.getByText('지금은 이 기기에만 있어요. 이메일 하나면 기기를 바꿔도 따라와요', {
      exact: true,
    });
  }

  /** 그 줄에서 내 계정으로 가는 입구. */
  get keepDataLink(): Locator {
    return this.page.getByRole('link', { name: '지켜 두기', exact: true });
  }

  /** 지금 보고 있는 달. `2026년 9월`. */
  get monthLabel(): Locator {
    return this.section.getByText(/^\d{4}년 \d{1,2}월$/);
  }

  /** 끝난 달에 뜨는 안내. 이 달은 보기만 한다는 말이다. */
  get closedNotice(): Locator {
    return this.section.getByText('끝난 달이에요 · 보기만 할 수 있어요', { exact: true });
  }

  /** 그 달 예산을 아예 못 불러왔을 때. 카드 자리를 이 안내가 대신한다. */
  get loadFailure(): Locator {
    return this.section.getByText('예산을 불러오지 못했어요', { exact: true });
  }

  /**
   * 못 받은 자리의 다시 시도.
   *
   * 카테고리 목록이 따로 실패해도 같은 이름의 버튼이 이 섹션 안에 선다.
   * 둘을 한꺼번에 막으면 어느 쪽을 눌렀는지 말할 수 없어진다.
   */
  get retryButton(): Locator {
    return this.section.getByRole('button', { name: '다시 시도' });
  }

  /** 달을 옮긴다. 버튼 이름에 갈 달이 적혀 있어 그것으로 집는다. */
  async goToMonth(label: string): Promise<void> {
    await this.section.getByRole('button', { name: `${label}로 이동` }).click();
    await expect(this.monthLabel).toHaveText(label);
    await this.waitReady();
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
      visible: Math.ceil(window.visualViewport?.width ?? window.innerWidth),
    }));
  }
}

/**
 * 생활비 계산기 시트.
 *
 * 예산 시트의 「계산해서 정하기」 를 눌러 광고 한 편을 지난 뒤에 열린다.
 * 손에 쥐는 돈 → 꼭 나가는 돈 → 모을 돈 순서로 적고, 빼기는 서버가 한다.
 */
class BudgetCalcArea {
  private readonly page: Page;
  private readonly root: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByRole('dialog', { name: '생활비 계산하기', exact: true });
  }

  get sheet(): Locator {
    return this.root;
  }

  /** 목 브릿지가 실광고처럼 화면을 덮는 자리. 광고를 지났는지를 이것으로 본다. */
  get mockAd(): Locator {
    return this.page.getByTestId('mock-fullscreen-ad');
  }

  get takeHomeField(): Locator {
    return this.root.getByLabel('실수령 (세후 월급 등)');
  }

  /** 매달 꼭 나가는 돈의 한 칸. 라벨로 고른다. */
  fixedField(label: string): Locator {
    return this.root.getByLabel(label);
  }

  get fixedSum(): Locator {
    return this.root.getByTestId(TEST_IDS.budgetCalcFixedSum);
  }

  get savingField(): Locator {
    return this.root.getByLabel('목표 저축');
  }

  /** 제안액. 화면이 계산하지 않고 서버가 준 값을 그린다. */
  get amount(): Locator {
    return this.root.getByTestId(TEST_IDS.budgetSuggestAmount);
  }

  get applyButton(): Locator {
    return this.root.getByRole('button', { name: '이 금액으로 예산 정하기' });
  }

  /** 어림한 값이라는 한 줄들. 지난달에서 가져온 칸에만 붙는다. */
  get basisNotes(): Locator {
    return this.root.getByText(/어림했어요/);
  }

  /** 목표 저축 칸 아래 한 줄. 어디서 온 숫자인지 말한다. */
  get savingNote(): Locator {
    return this.root.getByText(/^(목표 「.+」|직접 적은 값이에요|목표가 없으면)/);
  }

  /** 제안액 자리에 아직 숫자가 없을 때 대신 서는 글자. */
  get pending(): Locator {
    return this.root.getByText('계산 중', { exact: true });
  }

  /**
   * 무엇이 안 됐는지 알리는 한 줄.
   *
   * 저장이 막힌 것은 `alert` 자리로, 불러오기가 막힌 것은 다른 화면처럼 `status` 자리로
   * 온다. 사람이 읽는 것은 어느 쪽이든 한 줄이라 둘을 함께 잡는다.
   */
  get failureNotice(): Locator {
    return this.root.getByRole('alert').or(this.root.getByRole('status'));
  }

  /** 못 받은 자리에서 다시 받는 입구. */
  get retryButton(): Locator {
    return this.root.getByRole('button', { name: '다시 시도' });
  }

  /** 시트가 열린 것까지만 기다린다. 제안을 못 받는 때를 보는 자리는 이걸 쓴다. */
  async waitSheetOpen(): Promise<void> {
    await expect(this.root).toBeVisible();
  }

  async waitOpen(): Promise<void> {
    await expect(this.root).toBeVisible();
    await expect(this.amount).toBeVisible();
  }

  async waitClosed(): Promise<void> {
    await expect(this.root).toHaveCount(0);
  }

  suggestedWon(): Promise<number> {
    return wonOf(this.amount);
  }

  async setTakeHome(amount: number): Promise<void> {
    await this.takeHomeField.fill(String(amount));
  }

  async setSaving(amount: number): Promise<void> {
    await this.savingField.fill(String(amount));
  }

  /** 제안액을 이번 달 예산으로 정한다. 시트가 닫히면 저장이 끝난 것이다. */
  async apply(): Promise<void> {
    await this.applyButton.click();
    await this.waitClosed();
  }
}

/** `1,100,000원` → `1100000`. 화면에 그려진 글자에서 숫자만 뽑는다. */
async function wonOf(locator: Locator): Promise<number> {
  const text = (await locator.textContent()) ?? '';
  return Number(text.replace(/[^0-9]/g, ''));
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

  /**
   * 예산을 친구에게 보내는 줄.
   *
   * 진행 중인 달과 끝난 달이 서로 다른 말을 하고, 넘긴 달에는 아예 없다.
   * 누르는 동안 이름이 「공유창 여는 중」으로 바뀐다.
   */
  get shareButton(): Locator {
    return this.section.getByRole('button', {
      name: /^(이번 달 예산 친구에게 공유하기|예산 지킨 달 친구에게 공유하기|공유창 여는 중)$/,
    });
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

  /**
   * 지우기를 누른 뒤 그 자리에 펼쳐지는 확인.
   *
   * 시트를 겹치지 않고 카드 안에서 버튼 줄만 물음으로 바뀐다. 목표 시트와 같은 모양이다.
   */
  get deleteConfirm(): Locator {
    return this.section.getByRole('group', { name: '지우기 확인' });
  }

  /** 확인 안의 지우기. 카드의 「예산 지우기」와 섞이지 않게 확인 안에서만 찾는다. */
  get confirmDeleteButton(): Locator {
    return this.deleteConfirm.getByRole('button', { name: '지울게요', exact: true });
  }

  /** 잘못 눌렀을 때 빠져나오는 자리. */
  get keepButton(): Locator {
    return this.deleteConfirm.getByRole('button', { name: '그대로 둘래요', exact: true });
  }

  /**
   * 지우기가 막혔을 때 카드 아래 서는 한 줄.
   *
   * 이어쓰기 설정 저장이 막힐 때도 같은 자리를 쓴다. 둘을 함께 만들지 않는다.
   */
  get deleteFailure(): Locator {
    return this.section.getByRole('alert');
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

  /** 지우기를 끝까지. 묻는 한 걸음을 지나야 실제로 지워진다. */
  async remove(): Promise<void> {
    await this.deleteButton.click();
    await expect(this.deleteConfirm).toBeVisible();
    await this.confirmDeleteButton.click();
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

  /** 얼마로 할지 모르는 사람의 길. 처음 정할 때만 있고, 광고 한 편 뒤에 계산기가 열린다. */
  get calcButton(): Locator {
    return this.root.getByRole('button', { name: '얼마로 할지 모르겠어요' });
  }

  /**
   * 광고를 봐야 열린다는 한 줄.
   *
   * 예전에는 버튼 아래 늘 적혀 있었다. 지금은 **누른 뒤 한 번 묻는 자리**로 옮겼고,
   * 그 자리에서는 금액 칸과 저장 버튼이 사라진다.
   */
  get calcNote(): Locator {
    return this.root.getByText(/광고 5초만 보면 예산을 대신 잡아 드려요/);
  }

  /** 묻는 자리의 「확인」. 이걸 눌러야 광고가 뜬다. */
  get calcConfirmButton(): Locator {
    return this.root.getByRole('button', { name: /^(확인|광고를 불러오는 중이에요)$/ });
  }

  /** 계산기까지 가는 두 단. 물어보는 자리를 거쳐야 광고가 뜬다. */
  async openCalc(): Promise<void> {
    await this.calcButton.click();
    await expect(this.calcNote).toBeVisible();
    await this.calcConfirmButton.click();
  }

  /**
   * 묻는 자리의 「닫기」. 금액을 적는 화면으로 돌아온다.
   *
   * 시트 손잡이의 이름도 「닫기」라 시트 전체에서 찾으면 둘이 걸린다. 묻는 자리 안에서만 찾는다.
   */
  get calcCloseButton(): Locator {
    return this.root
      .getByRole('group', { name: '예산 대신 잡아 드리기' })
      .getByRole('button', { name: '닫기', exact: true });
  }

  /** 저장이 막혔을 때 시트 안에 서는 한 줄. 시트를 닫지 않고 여기서 말한다. */
  get failureNotice(): Locator {
    return this.root.getByRole('alert');
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

  /** 그 줄 게이지가 스크린리더에 알리는 사용률(%). */
  async gaugePercent(name: string): Promise<number | null> {
    const value = await this.gauge(name).getAttribute('aria-valuenow');
    return value == null ? null : Number(value);
  }

  /**
   * 그 줄 게이지 채움의 실제 색.
   *
   * 한도를 넘겼는지는 줄에 글로 적히지 않고 색만 바뀐다. 클래스 이름이 아니라
   * 브라우저가 계산한 값을 읽어, 스타일을 어떻게 붙였든 화면에 그려진 색으로 본다.
   */
  async gaugeFillColor(name: string): Promise<string> {
    return this.gauge(name)
      .locator('*')
      .first()
      .evaluate((element) => getComputedStyle(element).backgroundColor);
  }

  /** 그 줄의 게이지. 줄마다 스크린리더 이름이 달라 그것으로 집는다. */
  private gauge(name: string): Locator {
    return this.row(name).getByRole('progressbar', { name: `${name} 예산 사용률` });
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

  /** 지금 고를 수 있는 칩 전부. 무엇이 빠졌는지 셀 때 쓴다. */
  get categoryChips(): Locator {
    return this.picker.getByRole('button');
  }

  /** 저장·지우기가 막혔을 때 시트 안에 서는 한 줄. 적어 둔 한도를 지우지 않고 여기서 말한다. */
  get failureNotice(): Locator {
    return this.root.getByRole('alert');
  }

  /** 칩에 적힌 이름들. 화면에 그려진 순서 그대로다. */
  async chipNames(): Promise<string[]> {
    return (await this.categoryChips.allInnerTexts()).map((name) => name.trim());
  }

  /**
   * 고를 것이 하나도 남지 않았을 때 칩 대신 서는 안내.
   *
   * 앞뒤를 다 못 박는다. 앞머리만 잡으면 닫기까지 품은 조상 요소가 함께 잡힌다.
   */
  get emptyNotice(): Locator {
    return this.root.getByText(/^고를 수 있는 카테고리가 없어요\..*불러오지 못했어요\.$/);
  }

  /**
   * 그 안내 아래 닫기. 저장할 것이 없는 시트에서 빠져나오는 자리다.
   *
   * 시트 손잡이도 접근성 이름이 「닫기」 라 이름만으로는 둘이 잡힌다.
   * 글자가 보이는 쪽이 본문 버튼이다.
   */
  get closeButton(): Locator {
    return this.root.getByRole('button', { name: '닫기', exact: true }).filter({ hasText: '닫기' });
  }

  /** 아무것도 정하지 않고 닫는다. 시트는 딤·Esc·손잡이를 다 받는다. */
  async dismiss(): Promise<void> {
    await this.root.press('Escape');
    await this.waitClosed();
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
