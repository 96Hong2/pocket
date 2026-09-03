import { expect, type Locator, type Page } from '@playwright/test';

import { ROUTES } from '../../src/app/router/routes';
import { TEST_IDS } from '../../src/shared/testIds';

/**
 * 홈 화면.
 *
 * 셀렉터는 이 파일 안에만 둔다. 숫자와 게이지만 testid 로 잡고 나머지는 접근성 이름으로 잡는다.
 * 단언은 spec 이 한다. 여기는 무엇을 어떻게 집는지만 안다.
 *
 * 홈은 카드가 여럿 쌓인 화면이라 한 덩어리로 두면 금방 커진다.
 * 화면 안 영역별로 나눠 두고, 화면 전체에 걸린 것만 여기 남긴다.
 */
export class HomeScreen {
  private readonly page: Page;

  /** 맨 위 숫자 덩어리. 남은 예산·이번 달 지출·게이지·하루 가용액. */
  readonly hero: HomeHero;
  /** 오늘 목록. 행·칩·빈 상태·조회 실패. */
  readonly today: TodaySection;
  /** 예산 제안 카드. 첫 기록을 마쳐야 뜬다. */
  readonly budget: BudgetCard;
  /** 광고 자리. */
  readonly ads: AdArea;
  /** 며칠 비웠을 때 뜨는 복귀 카드. */
  readonly recovery: RecoveryCard;

  constructor(page: Page) {
    this.page = page;
    this.hero = new HomeHero(page);
    this.today = new TodaySection(page);
    this.budget = new BudgetCard(page);
    this.ads = new AdArea(page);
    this.recovery = new RecoveryCard(page);
  }

  async open(): Promise<void> {
    await this.page.goto(ROUTES.home);
  }

  get recordButton(): Locator {
    return this.page.getByRole('button', { name: '10초 기록' });
  }

  /** 홈이 그릴 것을 다 그린 뒤를 기다린다. 조회가 끝나야 히어로 숫자가 진짜다. */
  async waitReady(): Promise<void> {
    await expect(this.recordButton).toBeVisible();
  }

  /** 맨 위로 되돌린다. 목록을 훑고 나서 히어로 숫자를 다시 볼 때 쓴다. */
  async scrollToTop(): Promise<void> {
    await this.page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /** 조회가 끝나기 전 본문 자리에 도는 스피너. 화면에 글자가 없어 스크린리더 이름으로 잡는다. */
  get loadingState(): Locator {
    return this.page.getByRole('status', { name: '지금 상태를 불러오는 중이에요' });
  }

  /** 예산 상태를 못 불러왔을 때 히어로·버튼·목록을 통째로 대신하는 안내. */
  get loadError(): Locator {
    return this.page.getByText('지금은 불러오지 못했어요', { exact: true });
  }

  /** 본문 오류의 다시 시도. 이 오류일 때는 오늘 목록이 아예 없어 화면에 하나뿐이다. */
  get retryButton(): Locator {
    return this.page.getByRole('button', { name: '다시 시도' });
  }
}

/** 맨 위 숫자 덩어리. 예산을 정했는지에 따라 그리는 것이 달라진다. */
class HomeHero {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** 예산을 정한 뒤 그리는 남은 예산. */
  get remainingBudget(): Locator {
    return this.page.getByTestId(TEST_IDS.remainingBudget);
  }

  /** 예산을 정하기 전 그리는 이번 달 지출. */
  get monthSpent(): Locator {
    return this.page.getByTestId(TEST_IDS.monthSpent);
  }

  get dailyAllowance(): Locator {
    return this.page.getByTestId(TEST_IDS.dailyAllowance);
  }

  get gauge(): Locator {
    return this.page.getByTestId(TEST_IDS.budgetGauge);
  }

  /** 게이지 옆 `30% 썼어요`. 막대가 100% 에서 멈춘 뒤에도 넘긴 정도는 여기 적힌다. */
  get spendPercent(): Locator {
    return this.page.getByText(/^\d+% 썼어요$/);
  }

  /** 첫 진입에만 뜨는 부담 덜기 문구. 기록이 하나라도 생기면 사라진다. */
  get firstLead(): Locator {
    return this.page.getByText('가계부 쓰러 오지 마세요.');
  }

  /**
   * 하루 가용액과 함께 그리는 남은 일수. 없으면 null.
   *
   * 하루 가용액이 이 일수로 나눈 값인지 spec 이 되짚는 데 쓴다.
   */
  async remainingDays(): Promise<number | null> {
    const locator = this.page.getByTestId(TEST_IDS.remainingDays);
    if ((await locator.count()) === 0) return null;
    const days = Number((await locator.textContent())?.trim());
    return Number.isInteger(days) ? days : null;
  }

  /** 게이지가 스크린리더에 알리는 사용률(%). 게이지가 없으면 null. */
  async gaugePercent(): Promise<number | null> {
    if ((await this.gauge.count()) === 0) return null;
    const value = await this.gauge.getAttribute('aria-valuenow');
    return value == null ? null : Number(value);
  }

  /**
   * 게이지 채움의 실제 색.
   *
   * 클래스 이름이 아니라 브라우저가 계산한 값을 읽는다. 스타일을 어떻게 붙였든
   * 화면에 실제로 그려진 색이 바뀌었는지만 본다.
   */
  async gaugeFillColor(): Promise<string> {
    return this.gauge
      .locator('*')
      .first()
      .evaluate((element) => getComputedStyle(element).backgroundColor);
  }
}

/** 오늘 목록. 홈 아래쪽에 붙는 카드 하나다. */
class TodaySection {
  private readonly root: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('region', { name: '오늘' });
  }

  /** 아직 안 적었거나, 적은 것을 되돌려 다시 비었을 때. */
  get empty(): Locator {
    return this.text('오늘은 아직 비어 있어요');
  }

  /** 행 제목. 가맹점을 아는 기록은 가맹점명, 아니면 카테고리 이름이다. */
  row(title: string): Locator {
    return this.text(title);
  }

  /** 가맹점이 제목을 가져간 행에서 제목 아래로 내려간 카테고리 이름. */
  subtitle(name: string): Locator {
    return this.text(name);
  }

  /** 제목 아래 붙는 작은 칩. '예산 제외' · '이체' · '환불' · '수입'. */
  chip(label: string): Locator {
    return this.text(label);
  }

  /** 행 오른쪽 금액. 화면에 찍히는 문자열 그대로 찾는다. */
  amount(text: string): Locator {
    return this.text(text);
  }

  /** 이 목록만 못 불러왔을 때 카드 안에 뜨는 제목. */
  get loadError(): Locator {
    return this.text('오늘 기록을 불러오지 못했어요');
  }

  /** 그 아래 둘째 줄. 적어 둔 것이 없어진 게 아니라고 말한다. */
  get loadHint(): Locator {
    return this.text('적어 둔 것이 사라진 게 아니에요. 다시 시도해 주세요.');
  }

  /** 카드 안의 다시 시도. 본문 오류의 것과 섞이지 않게 카드 안에서만 찾는다. */
  get retryButton(): Locator {
    return this.root.getByRole('button', { name: '다시 시도' });
  }

  /** 목록이 화면에 들어오게 굴린다. 화면 밖에 있으면 영상에 안 찍힌다. */
  async reveal(): Promise<void> {
    await this.root.evaluate((element) => {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /** 그 줄이 화면 가운데로 오게 굴린다. 목록을 위에서 아래로 훑을 때 쓴다. */
  async revealRow(title: string): Promise<void> {
    await this.row(title).evaluate((element) => {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  /**
   * 목록 안에 찍힌 글자.
   *
   * 제목·부제·칩·금액을 잡는 방법은 다 같고 무엇을 가리키는지만 다르다.
   * 부르는 쪽에서 그것이 읽히게 이름을 나눠 두고 여기 한 곳에서 잡는다.
   */
  private text(value: string): Locator {
    return this.root.getByText(value, { exact: true });
  }
}

/** 예산 제안 카드. 기록이 하나라도 있고 예산이 없을 때만 뜬다. */
class BudgetCard {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get input(): Locator {
    return this.page.getByLabel('이번 달 예산');
  }

  get saveButton(): Locator {
    return this.page.getByRole('button', { name: '예산 정하기' });
  }

  /** 카드가 말하는 한 줄. 첫 기록을 마쳐야 뜬다. */
  get suggestLead(): Locator {
    return this.page.getByText('예산을 정하면');
  }

  /** 저장이 실패했을 때 입력칸과 버튼 사이에 뜨는 한 줄. 홈에서 alert 는 이 자리뿐이다. */
  get saveNotice(): Locator {
    return this.page.getByRole('alert');
  }

  async set(amount: number): Promise<void> {
    await this.input.fill(String(amount));
    await this.saveButton.click();
    // 저장이 끝나면 히어로가 남은 예산 모드로 바뀐다.
    await expect(this.page.getByTestId(TEST_IDS.remainingBudget)).toBeVisible();
  }
}

/** 광고 자리. 채울 광고가 없으면 접혀서 자리를 차지하지 않는다. */
class AdArea {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get slot(): Locator {
    return this.page.getByTestId(TEST_IDS.adSlot);
  }

  /** 슬롯 안에 SDK 가 그린 것. 라벨·테두리는 우리가 넣지 않으니 여기 있으면 배너가 붙은 것이다. */
  get banner(): Locator {
    return this.slot.locator('*').first();
  }

  /**
   * 지금 붙어 있는 배너 요소에 표식을 찍는다.
   *
   * 홈이 얼굴을 바꾼 뒤에도 같은 표식이 남아 있으면 그 DOM 이 그대로 산 것이고,
   * 곧 배너를 다시 붙이지 않았다는 뜻이다. 사라졌으면 새로 그린 것이다.
   */
  async stamp(token: string): Promise<void> {
    await this.banner.evaluate((element, value) => {
      element.setAttribute('data-e2e-stamp', value);
    }, token);
  }

  /** 찍어 둔 표식. 배너가 다시 붙었으면 null 이다. */
  async stampValue(): Promise<string | null> {
    return this.banner.getAttribute('data-e2e-stamp');
  }
}

/** 며칠 비웠을 때 뜨는 복귀 카드. 벌주지 않고 다시 이어 쓰게 돕는다. */
class RecoveryCard {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get catchUpButton(): Locator {
    return this.page.getByRole('button', { name: '기억나는 것 하나 적기' });
  }

  /** 며칠 만인지 말하는 줄. 며칠을 비웠는지는 서버가 세어 준다. */
  lead(daysAway: number): Locator {
    return this.page.getByText(`${daysAway}일 만이네요. 반가워요.`);
  }
}
