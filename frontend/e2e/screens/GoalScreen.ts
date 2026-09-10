import { expect, type Locator, type Page } from '@playwright/test';

import { ROUTES } from '../../src/app/router/routes';
import { TEST_IDS } from '../../src/shared/testIds';

/**
 * 목표 화면.
 *
 * 관리 탭 아래 하위 화면이라 URL 이 달라 별도 객체다. 한 화면이 목표 카드와 모은 돈
 * 목록, 시트 둘을 데리고 있어 시트만 안쪽 객체로 나눠 뒀다.
 *
 * 셀렉터는 이 파일 안에만 둔다. 무엇이 맞는지는 spec 이 정한다.
 */
export class GoalScreen {
  private readonly page: Page;

  /** 목표를 만들고 고치는 시트. 제목만 다른 하나다. */
  readonly form: GoalFormSheet;
  /** 모은 돈을 더하는 시트. */
  readonly contribution: ContributionSheet;

  constructor(page: Page) {
    this.page = page;
    this.form = new GoalFormSheet(page);
    this.contribution = new ContributionSheet(page);
  }

  async open(): Promise<void> {
    await this.page.goto(ROUTES.goal);
  }

  /**
   * 조회가 끝난 뒤.
   *
   * 목표가 있으면 카드가, 없으면 빈 상태 제목이 뜬다. 둘 중 하나가 보이면
   * 로딩 자리표시자가 걷힌 것이다.
   */
  async waitReady(): Promise<void> {
    await expect(this.card.or(this.emptyTitle)).toBeVisible();
  }

  /** 목표 카드. 목표가 없으면 아예 없다. */
  get card(): Locator {
    return this.page.getByRole('region', { name: '목표 진행', exact: true });
  }

  /** 카드 안 목표 이름. */
  get title(): Locator {
    return this.card.getByRole('heading', { level: 2 });
  }

  /**
   * 목표가 하나도 없을 때의 제목.
   *
   * 목표가 있을 때 화면 맨 아래에 뜨는 안심 문구와 섞이지 않게 빈 상태 블록 안에서만 찾는다.
   */
  get emptyTitle(): Locator {
    return this.page.getByRole('status').getByText('아직 정한 목표가 없어요', { exact: true });
  }

  /** 빈 상태에서 처음 만들기 시작하는 버튼. */
  get startButton(): Locator {
    return this.page.getByRole('button', { name: '목표 만들기', exact: true });
  }

  /** 못 불러왔을 때. 이 자리에는 만들기 입구를 두지 않는다. */
  get loadFailure(): Locator {
    return this.page.getByText('목표를 불러오지 못했어요', { exact: true });
  }

  /** 지금까지 모은 돈. 처음 적어 둔 금액 + 더한 돈이고 서버가 센다. */
  get current(): Locator {
    return this.page.getByTestId(TEST_IDS.goalCurrent);
  }

  /** 목표까지 남은 금액. */
  get remaining(): Locator {
    return this.page.getByTestId(TEST_IDS.goalRemaining);
  }

  /** 기한까지 매달 모을 돈. 기한이 없거나 이미 닿았으면 이 줄이 없다. */
  get requiredMonthly(): Locator {
    return this.page.getByTestId(TEST_IDS.goalRequiredMonthly);
  }

  /** 도달 예상 한 줄. 기여가 없으면 숫자 없이 다른 말이 온다. */
  get eta(): Locator {
    return this.page.getByTestId(TEST_IDS.goalEta);
  }

  /** 목표액에 닿았을 때 붙는 배지. */
  get achievedBadge(): Locator {
    return this.card.getByText('달성했어요', { exact: true });
  }

  /** 기한이 지났을 때의 한 줄. 탓하지 않고 바꿀 수 있다는 것만 알린다. */
  get overdueNote(): Locator {
    return this.card.getByText(/기한은 언제든 바꿀 수 있어요$/);
  }

  get editButton(): Locator {
    return this.card.getByRole('button', { name: '목표 고치기', exact: true });
  }

  get contributeButton(): Locator {
    return this.card.getByRole('button', { name: '모은 돈 더하기', exact: true });
  }

  /** 모은 돈 목록. */
  get log(): Locator {
    return this.page.getByRole('region', { name: '모은 돈', exact: true });
  }

  /** 아직 더한 돈이 없을 때의 한 줄. 카드 한 장을 따로 띄우지 않는다. */
  get logEmpty(): Locator {
    return this.log.getByText('아직 더한 돈이 없어요', { exact: true });
  }

  /**
   * 모은 돈 줄마다 붙는 지우기 버튼.
   *
   * 줄 자체에는 role 도 이름도 없다. 버튼 이름에 날짜와 금액이 들어 있어
   * 몇 줄인지 세는 것과 어느 줄을 지우는지 고르는 것을 이것으로 한다.
   */
  get logRemoveButtons(): Locator {
    return this.log.getByRole('button', { name: /지우기$/ });
  }

  /** 게이지가 스크린리더에 알리는 진행률(%). 카드가 없으면 null. */
  async gaugePercent(): Promise<number | null> {
    const gauge = this.page.getByTestId(TEST_IDS.goalGauge);
    if ((await gauge.count()) === 0) return null;
    const value = await gauge.getAttribute('aria-valuenow');
    return value == null ? null : Number(value);
  }

  /** 빈 상태에서 목표를 만든다. */
  async start(input: GoalFormInput): Promise<void> {
    await this.startButton.click();
    await this.form.waitOpen();
    await this.form.fill(input);
    await this.form.save();
  }

  /** 이미 있는 목표를 고친다. 넘긴 칸만 바꾼다. */
  async edit(input: GoalFormInput): Promise<void> {
    await this.editButton.click();
    await this.form.waitOpen();
    await this.form.fill(input);
    await this.form.save();
  }

  /** 목표를 지운다. 지우기는 고치기 시트 안에 있다. */
  async remove(): Promise<void> {
    await this.editButton.click();
    await this.form.waitOpen();
    await this.form.remove();
  }

  /** 모은 돈을 더한다. */
  async contribute(input: { amount: number; day?: string }): Promise<void> {
    await this.contributeButton.click();
    await this.contribution.waitOpen();
    await this.contribution.fill(input);
    await this.contribution.save();
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

/** 시트에 채울 것. 넘긴 칸만 채운다. */
export interface GoalFormInput {
  title?: string;
  amount?: number;
  /** `2026-12-31`. 빈 문자열을 넘기면 기한을 지운다. */
  deadline?: string;
  initial?: number;
}

/** 목표 시트. 만들 때와 고칠 때가 같은 시트이고 제목과 지우기 버튼만 다르다. */
class GoalFormSheet {
  private readonly root: Locator;

  constructor(page: Page) {
    // 만들 때와 고칠 때가 같은 시트라 제목 둘을 함께 잡는다.
    this.root = page.getByRole('dialog', { name: /^목표 (만들기|고치기)$/ });
  }

  /** 시트 자체. 저장이 막혔을 때 닫히지 않고 남아 있는지 볼 때 쓴다. */
  get dialog(): Locator {
    return this.root;
  }

  get titleField(): Locator {
    return this.root.getByLabel('무엇을 위해 모아요', { exact: true });
  }

  /**
   * 목표 금액 입력칸.
   *
   * 라벨이 입력칸을 감싸는 모양이라 접근성 이름에 단위 `원` 까지 붙는다.
   * 이름을 못 박으면 잡히지 않는다. 예산·자산 시트도 같은 이유로 부분일치로 집는다.
   */
  get amountField(): Locator {
    return this.root.getByLabel('목표 금액');
  }

  /**
   * 기한 입력칸.
   *
   * 라벨이 입력칸과 안내 문구를 함께 감싸므로 접근성 이름에 그 문구까지 붙는다.
   * 이름을 못 박으면 잡히지 않는다. 금액 칸이 단위 `원` 때문에 그런 것과 같은 이유다.
   */
  get deadlineField(): Locator {
    return this.root.getByLabel('언제까지 (선택)');
  }

  /** 시작 금액. 카드의 '지금까지' 와 다르다. 여기에 더한 돈까지 합친 것이 그 값이다. */
  get initialField(): Locator {
    return this.root.getByLabel('시작할 때 이미 있던 돈 (선택)');
  }

  get saveButton(): Locator {
    return this.root.getByRole('button', { name: '저장', exact: true });
  }

  /** 고치는 시트에만 있다. */
  get deleteButton(): Locator {
    return this.root.getByRole('button', { name: '지우기', exact: true });
  }

  /** 지우기를 누른 뒤 펼쳐지는 확인 자리. */
  get confirmArea(): Locator {
    return this.root.getByRole('group', { name: '지우기 확인' });
  }

  /** 확인 자리가 하는 약속. 함께 사라지는 것과 남는 것을 둘 다 적는다. */
  get confirmText(): Locator {
    return this.confirmArea.getByText(/^정말 지울까요\? .*더한 돈 기록도 함께 사라져요/);
  }

  /** 확인 자리 안의 지우기. 바깥의 같은 이름과 섞이지 않게 여기서만 찾는다. */
  get confirmDeleteButton(): Locator {
    return this.confirmArea.getByRole('button', { name: '지우기', exact: true });
  }

  /** 확인을 접고 시트로 돌아가는 버튼. */
  get keepButton(): Locator {
    return this.confirmArea.getByRole('button', { name: '그대로 둘게요', exact: true });
  }

  async waitOpen(): Promise<void> {
    await expect(this.root).toBeVisible();
  }

  async waitClosed(): Promise<void> {
    await expect(this.root).toHaveCount(0);
  }

  async fill(input: GoalFormInput): Promise<void> {
    if (input.title != null) await this.titleField.fill(input.title);
    if (input.amount != null) await this.amountField.fill(String(input.amount));
    if (input.deadline != null) await this.deadlineField.fill(input.deadline);
    if (input.initial != null) await this.initialField.fill(String(input.initial));
  }

  /** 저장한다. 시트가 닫히면 저장이 끝난 것이다. */
  async save(): Promise<void> {
    await this.saveButton.click();
    await this.waitClosed();
  }

  /** 지우기를 눌러 확인까지 마친다. 시트가 닫히면 지워진 것이다. */
  async remove(): Promise<void> {
    await this.deleteButton.click();
    await this.confirmDeleteButton.click();
    await this.waitClosed();
  }
}

/** 모은 돈 시트. 금액과 날짜 둘만 받는다. */
class ContributionSheet {
  private readonly root: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('dialog', { name: '모은 돈 더하기', exact: true });
  }

  get dialog(): Locator {
    return this.root;
  }

  get amountField(): Locator {
    return this.root.getByLabel('금액');
  }

  get dayField(): Locator {
    return this.root.getByLabel('날짜', { exact: true });
  }

  get saveButton(): Locator {
    return this.root.getByRole('button', { name: '저장', exact: true });
  }

  async waitOpen(): Promise<void> {
    await expect(this.root).toBeVisible();
  }

  async waitClosed(): Promise<void> {
    await expect(this.root).toHaveCount(0);
  }

  async fill(input: { amount?: number; day?: string }): Promise<void> {
    if (input.amount != null) await this.amountField.fill(String(input.amount));
    if (input.day != null) await this.dayField.fill(input.day);
  }

  async save(): Promise<void> {
    await this.saveButton.click();
    await this.waitClosed();
  }
}
