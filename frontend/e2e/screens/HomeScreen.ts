import { expect, type Locator, type Page } from '@playwright/test';

import { ROUTES } from '../../src/app/router/routes';
import { TEST_IDS } from '../../src/shared/testIds';

import { EditSheetArea } from './CalendarScreen';

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
  /** 오늘 목록의 한 줄을 누르면 열리는 시트. 달력과 같은 것이다. */
  readonly edit: EditSheetArea;
  /** 예산 제안 카드. 첫 기록을 마쳐야 뜬다. */
  readonly budget: BudgetCard;
  /** 목표 카드. 진행 중인 목표가 있을 때만 뜬다. */
  readonly goal: HomeGoalCard;
  /** 지난달 결산 진입 카드. 달이 바뀐 뒤 며칠 동안, 아직 안 봤을 때만 뜬다. */
  readonly closing: HomeClosingCard;
  /** 광고 자리. */
  readonly ads: AdArea;
  /** 첫 기록 뒤 한 번 뜨는 홈 화면 추가 제안. */
  readonly addToHome: AddToHomeArea;
  /** 며칠 비웠을 때 뜨는 복귀 카드. */
  readonly recovery: RecoveryCard;

  constructor(page: Page) {
    this.page = page;
    this.hero = new HomeHero(page);
    this.today = new TodaySection(page);
    this.edit = new EditSheetArea(page);
    this.budget = new BudgetCard(page);
    this.goal = new HomeGoalCard(page);
    this.closing = new HomeClosingCard(page);
    this.ads = new AdArea(page);
    this.addToHome = new AddToHomeArea(page);
    this.recovery = new RecoveryCard(page);
  }

  async open(): Promise<void> {
    await this.page.goto(ROUTES.home);
  }

  get recordButton(): Locator {
    return this.page.getByRole('button', { name: '기록하기' });
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

  /** 큰 숫자를 감싼 관리 탭 입구. 예산이 있는 히어로에만 있다. */
  get budgetLink(): Locator {
    return this.page.getByTestId(TEST_IDS.heroBudgetLink);
  }

  /** 예산을 정하기 전 그리는 이번 달 지출. 수입·지출 히어로에서는 큰 숫자 아래 칸으로 내려간다. */
  get monthSpent(): Locator {
    return this.page.getByTestId(TEST_IDS.monthSpent);
  }

  /** 수입을 함께 그리는 히어로의 번 돈. 다른 히어로에는 아예 없다. */
  get income(): Locator {
    return this.page.getByTestId(TEST_IDS.heroIncome);
  }

  /** 이번 달 차액. 부호가 붙고, 남은 예산과 다른 개념이다. */
  get delta(): Locator {
    return this.page.getByTestId(TEST_IDS.heroDelta);
  }

  /**
   * 히어로가 무엇을 보여주는 중인지 스스로 적는 한 줄. `9월 · 남은 예산`.
   *
   * 같은 문구가 히어로 section 의 aria-label 로도 붙는다. 눈에 보이는 쪽을 잡는다.
   * 숫자로 끝나지 않는 것으로 좁혀야 금액까지 이어 붙은 section 전체가 함께 잡히지 않는다.
   */
  get label(): Locator {
    return this.page.getByText(/^\d+월 · \D+$/);
  }

  get dailyAllowance(): Locator {
    return this.page.getByTestId(TEST_IDS.dailyAllowance);
  }

  /** 이번 주에 쓸 수 있는 돈. 예산이 없으면 아예 없다. */
  get weeklyAllowance(): Locator {
    return this.page.getByTestId(TEST_IDS.weeklyAllowance);
  }

  /** 이번 주 줄의 라벨. 숫자만 보고는 무슨 기간인지 알 수 없어 함께 확인한다. */
  get weeklyLabel(): Locator {
    return this.page.getByText('이번 주 쓸 수 있는 돈', { exact: true });
  }

  get gauge(): Locator {
    return this.page.getByTestId(TEST_IDS.budgetGauge);
  }

  /** 게이지 옆 `30% 썼어요`. 막대가 100% 에서 멈춘 뒤에도 넘긴 정도는 여기 적힌다. */
  get spendPercent(): Locator {
    return this.page.getByText(/^\d+% 썼어요$/);
  }

  /**
   * 표시 설정을 못 받아 기본 화면을 그리고 있다는 안내.
   *
   * 폴백 화면이 서버 기본값과 같은 모양이라, 이 줄이 있는지 없는지가
   * "설정을 받아서 이 화면" 과 "못 받아서 떨어진 화면" 을 가르는 유일한 표시다.
   */
  get preferencesNotice(): Locator {
    return this.page.getByText('표시 설정을 불러오지 못해 기본 화면으로 보여주고 있어요.');
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
    return gaugePercentOf(this.gauge);
  }

  /** 게이지 채움의 실제 색. */
  async gaugeFillColor(): Promise<string> {
    return gaugeFillColorOf(this.gauge);
  }
}

/** 게이지가 스크린리더에 알리는 값(%). 게이지가 없으면 null. */
async function gaugePercentOf(gauge: Locator): Promise<number | null> {
  if ((await gauge.count()) === 0) return null;
  const value = await gauge.getAttribute('aria-valuenow');
  return value == null ? null : Number(value);
}

/**
 * 게이지 채움의 실제 색.
 *
 * 클래스 이름이 아니라 브라우저가 계산한 값을 읽는다. 스타일을 어떻게 붙였든
 * 화면에 실제로 그려진 색이 무엇인지만 본다.
 */
function gaugeFillColorOf(gauge: Locator): Promise<string> {
  return gauge
    .locator('*')
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor);
}

/** 오늘 목록. 홈 아래쪽에 붙는 카드 하나다. */
class TodaySection {
  private readonly root: Locator;

  /**
   * 구획 이름이 보고 있는 날이다. 오늘에서 뒤로 넘기면 「어제」 나 「9월 6일」 이 된다.
   * 날짜를 옮겨 다니는 테스트도 같은 객체로 보려고 이름을 묶어 잡는다.
   */
  constructor(page: Page) {
    this.root = page.getByRole('region', { name: /^(오늘|어제|\d+월 \d+일)$/ });
  }

  /** 지금 보고 있는 날. 화살표로 옮긴 뒤 어디에 있는지 확인할 때 쓴다. */
  get title(): Locator {
    return this.root.getByRole('heading', { level: 2 });
  }

  /** 하루 뒤로. 이름에 갈 날짜가 들어 있어 이름이 아니라 자리로 잡는다. */
  get prevDayButton(): Locator {
    return this.root.getByRole('button', { name: /보기$/ }).first();
  }

  get nextDayButton(): Locator {
    return this.root.getByRole('button', { name: /보기$/ }).last();
  }

  /** 오늘이 아닐 때만 뜨는 돌아오기. 오늘에서는 아예 없다. */
  get jumpTodayButton(): Locator {
    return this.root.getByRole('button', { name: '오늘로', exact: true });
  }

  /** 아직 안 적었거나, 적은 것을 되돌려 다시 비었을 때. */
  get empty(): Locator {
    return this.text('오늘은 아직 비어 있어요');
  }

  /**
   * 비었다는 안내 줄 자체. 안내가 곧 기록 시트 입구다.
   *
   * 위 큰 버튼과 글자가 달라야 둘이 안 섞인다. 여기는 비었다는 말로 잡는다.
   */
  get emptyButton(): Locator {
    return this.root.getByRole('button', { name: /비어 있어요/ });
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

  /**
   * 빈 상태에서 안 썼다고 남기는 버튼. 오늘 기록이 하나도 없을 때만 있다.
   *
   * 적어 둔 줄과 글자가 같아서 역할로 가른다. 둘은 함께 그려지지 않는다.
   */
  get noSpendButton(): Locator {
    return this.root.getByRole('button', { name: '오늘은 안 썼어요' });
  }

  /**
   * 안 쓴 날로 적어 둔 줄.
   *
   * 줄에는 role 도 이름도 없고 빈 상태 버튼과 글자가 같아, 줄 안의 취소 버튼에서
   * 부모로 한 칸 올라가 잡는다. `RecoveryCard` 의 카드와 같은 방법이다.
   */
  get noSpendRow(): Locator {
    return this.noSpendCancelButton.locator('..');
  }

  /** 적어 둔 무지출 표시를 되돌리는 버튼. */
  get noSpendCancelButton(): Locator {
    return this.root.getByRole('button', { name: '취소' });
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

/**
 * 홈의 목표 카드. 진행 중인 목표가 있을 때만 뜬다.
 *
 * 카드 전체가 목표 화면으로 가는 링크다. 링크 이름 끝에 갈 곳이 덧붙어 있어
 * 그것으로 집는다. 안쪽 숫자에는 testid 를 두지 않았다. 같은 값을 목표 화면이 크게
 * 그리고 있어서, 여기서 다시 재면 어느 화면을 보는 검사인지 흐려진다.
 */
class HomeGoalCard {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get link(): Locator {
    return this.page.getByRole('link', { name: /목표 자세히 보기$/ });
  }

  /** 카드에 적힌 목표 이름. 어느 목표인지는 부르는 쪽이 안다. */
  title(name: string): Locator {
    return this.link.getByText(name, { exact: true });
  }

  /** 카드 오른쪽 한 줄. 남은 금액이거나 다 모았다는 말이다. */
  get foot(): Locator {
    return this.link.getByText(/^(남은 .+원|다 모았어요)$/);
  }

  /** 게이지가 스크린리더에 알리는 진행률(%). 카드가 없으면 null. */
  async gaugePercent(): Promise<number | null> {
    const gauge = this.link.getByRole('progressbar', { name: '목표 진행률' });
    if ((await gauge.count()) === 0) return null;
    const value = await gauge.getAttribute('aria-valuenow');
    return value == null ? null : Number(value);
  }
}

/**
 * 홈의 결산 진입 카드.
 *
 * 카드 전체가 리포트로 가는 링크다. 링크라 이름으로 잡는다. 한 번 열어 보면 사라지므로
 * 있는지 없는지가 곧 '아직 안 봤는지' 다.
 */
class HomeClosingCard {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get link(): Locator {
    return this.page.getByRole('link', { name: /결산이 도착했어요/ });
  }
}

/**
 * 첫 기록을 마친 사람에게 한 번만 뜨는 카드.
 *
 * 어느 버튼을 눌러도 다시 뜨지 않는다. 기기에 남기는 표시라, e2e 는 브라우저 저장소가
 * 깨끗한 채로 시작하는 테스트마다 다시 볼 수 있다.
 */
class AddToHomeArea {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * 첫 기록을 마친 그 순간 스스로 열리는 시트.
   *
   * 처음에는 홈 카드였다. 목록에 섞여 그냥 지나쳐져서 시트 하나로 합쳤다.
   * 제목이 앱 설정에서 여는 것과 다르다. 방금 한 일과 이어 붙이기 때문이다.
   */
  get sheet(): Locator {
    return this.page.getByRole('dialog', { name: '첫 기록 끝! 홈에 두면 더 빨라요', exact: true });
  }

  /** 안내 시트 안의 단계 셋. 넷째 단계부터는 읽지 않는다. */
  get steps(): Locator {
    return this.sheet.getByRole('listitem');
  }

  get doneButton(): Locator {
    return this.sheet.getByRole('button', { name: '알겠어요', exact: true });
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

/** 며칠 비웠을 때 뜨는 복귀 카드. 벌주지 않고 밀린 것을 한 번에 정리하게 돕는다. */
class RecoveryCard {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * 카드 한 덩어리.
   *
   * 카드에는 role 도 접근성 이름도 붙어 있지 않아 이름으로 집을 자리가 없다.
   * 클래스로 잡는 것은 금지라, 카드의 직계 자식인 버튼에서 부모로 한 칸 올라가 잡는다.
   * 카드가 이름을 갖게 되면 그때 이름으로 바꾼다.
   */
  get card(): Locator {
    return this.catchUpButton.locator('..');
  }

  /** 밀린 며칠치를 한 번에 정리하러 가는 버튼. 누르면 기록 시트가 캡처 탭으로 열린다. */
  get catchUpButton(): Locator {
    return this.page.getByRole('button', { name: '밀린 내역 한 번에 정리' });
  }

  /**
   * 최근 며칠 중 며칠을 정리했는지 말하는 한 줄.
   *
   * 하루도 없으면 숫자를 세는 대신 다른 말로 바뀐다. 둘 다 이 자리에 온다.
   */
  get progressText(): Locator {
    return this.card.getByText(/^(이번 주 \d+\/\d+일 정리했어요|이번 주는 지금부터 시작이에요)$/);
  }

  /**
   * 카드가 무엇을 하면 되는지 알려 주는 두 줄.
   *
   * 없어야 할 말(아래 `punishingText`)만 세면 카드가 문구를 통째로 잃어도 초록이다.
   * 있어야 할 말을 함께 못 박아 둔다. 시안이 정한 문구다.
   */
  get lead(): Locator {
    return this.card.getByText('며칠 놓쳤어도 괜찮아요.');
  }

  /** 둘째 줄. 다음 한 걸음이 무엇인지 여기 적혀 있다. */
  get leadNext(): Locator {
    return this.card.getByText('캡처 한 장이면 다시 정리할 수 있어요.');
  }

  /** 카드 안의 경고 자리. 돌아온 것을 경고할 일이 아니라 늘 비어 있어야 한다. */
  get alerts(): Locator {
    return this.card.getByRole('alert');
  }

  get gauge(): Locator {
    return this.page.getByTestId(TEST_IDS.recoveryGauge);
  }

  /** 게이지가 스크린리더에 알리는 정리 진행(%). 게이지가 없으면 null. */
  async gaugePercent(): Promise<number | null> {
    return gaugePercentOf(this.gauge);
  }

  /** 게이지 채움의 실제 색. 예산 게이지와 같은 방법으로 잰다. */
  async gaugeFillColor(): Promise<string> {
    return gaugeFillColorOf(this.gauge);
  }

  /**
   * 디자인 토큰 하나의 실제 색을 브라우저가 계산한 값으로 읽는다.
   *
   * 게이지 색을 16진수로 적어 두면 토큰이 바뀔 때 검사가 조용히 낡는다.
   * 견줄 색을 페이지에서 직접 뽑아 오면 그 일이 없다.
   */
  async tokenColor(token: string): Promise<string> {
    return this.page.evaluate((name) => {
      const probe = document.createElement('div');
      probe.style.backgroundColor = `var(${name})`;
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    }, token);
  }

  /**
   * 며칠 빠졌는지·연속이 끊겼는지를 세는 표현. **페이지 전체**에서 훑는다.
   *
   * 카드 안만 보면 같은 말이 히어로나 오늘 목록에 새로 생겼을 때 놓친다.
   * 돌아온 사람에게 실점을 알리지 않는다는 약속이라 화면 어디에도 있으면 안 된다.
   *
   * 금지하는 것은 **며칠 빠졌는지 세는 것**이지 '놓치다' 라는 낱말이 아니다.
   * 시안의 첫 줄이 `며칠 놓쳤어도 괜찮아요` 이고, 그 말에는 숫자가 없어 실점이 아니다.
   * 그래서 낱말이 아니라 **숫자와 함께 오는 실점 어투**를 센다.
   *
   * 활용형까지 잡는다. `3일 놓친` 만 적으면 `3일 놓쳤어요` 를 지나치고, `일 만이네요` 만
   * 적으면 `4일 만에` 를 지나친다. 문구를 조금 바꾸는 것으로 이 가드가 무력해지면 안 된다.
   * 정리 진행 줄(`이번 주 2/7일 정리했어요`)에도 날 수가 있어 `\d+일` 을 통째로 금지할 수 없다.
   */
  get punishingText(): Locator {
    return this.page.getByText(
      /\d+\s*일\s*(만|째|빠짐|동안|넘게)|\d+\s*일[^.]{0,8}(놓쳤|놓친|빠뜨)|연속\s*기록|기록이\s*끊|이어지지\s*않/,
    );
  }
}
