import { expect, type Locator, type Page } from '@playwright/test';

import { ROUTES } from '../../src/app/router/routes';
import { withTopic } from '../../src/shared/lib/format';
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
  /** 홈 화면 추가 바로 아래에 따로 서는 저녁 알림 카드. */
  readonly remind: RemindCardArea;
  /** 며칠 비웠을 때 뜨는 복귀 카드. */
  readonly recovery: RecoveryCard;
  /** 기록 버튼 아래 공유 권유 카드. 몇 번 적어 본 사람에게만 뜬다. */
  readonly share: HomeShareCard;
  /** 오늘·내일 빠져나갈 돈. 걸어 둔 반복 지출이 있을 때만 뜬다. */
  readonly recurring: HomeRecurringCard;
  /** 7일을 이어서 적었을 때 맨 앞에 뜨는 축하. 결산과 같은 전체화면 카드다. */
  readonly streak: StreakCelebrationArea;

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
    this.remind = new RemindCardArea(page);
    this.recovery = new RecoveryCard(page);
    this.share = new HomeShareCard(page);
    this.recurring = new HomeRecurringCard(page);
    this.streak = new StreakCelebrationArea(page);
  }

  async open(): Promise<void> {
    await this.page.goto(ROUTES.home);
  }

  /**
   * 지난 날을 보는 중에 큰 기록 버튼을 누르면 펴지는 물음.
   *
   * 오늘을 보고 있을 때는 아예 없다. 있으면 기록이 늘 한 번 더 묻는 일이 된다.
   */
  get recordDayAsk(): Locator {
    return this.page.getByRole('alertdialog', { name: '어느 날에 적을까요' });
  }

  /** 그 물음의 날짜 버튼. 「오늘」·「어제」·「9월 14일」. */
  recordDayChoice(label: string): Locator {
    return this.recordDayAsk.getByRole('button', { name: label, exact: true });
  }

  /** 묻던 것을 접는 ✕. 「그만두기」 라고 적으면 읽어 온 것을 버리는 그 버튼과 겹친다. */
  get recordDayClose(): Locator {
    return this.recordDayAsk.getByRole('button', { name: '묻는 것 닫기', exact: true });
  }

  get recordButton(): Locator {
    // 오늘 카드에도 「오늘 기록하기」가 있다. 위 큰 버튼만 잡으려면 정확히 맞춰야 한다.
    return this.page.getByRole('button', { name: '기록하기', exact: true });
  }

  /** 홈이 그릴 것을 다 그린 뒤를 기다린다. 조회가 끝나야 히어로 숫자가 진짜다. */
  /**
   * 홈이 다 섰다.
   *
   * **기록 버튼만으로는 모자라다.** 조회를 기다리는 동안에도 그 버튼은 서 있다(ADR-0026).
   * 히어로 자리의 스피너까지 걷혀야 숫자를 읽을 수 있다.
   */
  async waitReady(): Promise<void> {
    await expect(this.recordButton).toBeVisible();
    await expect(this.loadingState).toHaveCount(0);
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
   * 큰 숫자 옆의 달력 아이콘. 선으로 그린 그림뿐이라 화면에 글자가 없다.
   *
   * 오늘 목록 끝의 「전체 내역 보기」와 같은 곳으로 간다. 이름으로만 잡을 수 있다.
   */
  get calendarLink(): Locator {
    return this.page.getByRole('link', { name: '월간 달력 보기', exact: true });
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
  private readonly page: Page;

  /**
   * 구획 이름이 보고 있는 날이다. 오늘에서 뒤로 넘기면 「어제」 나 「9월 6일」 이 된다.
   * 날짜를 옮겨 다니는 테스트도 같은 객체로 보려고 이름을 묶어 잡는다.
   */
  constructor(page: Page) {
    this.page = page;
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

  /**
   * 아직 안 적은 날인가.
   *
   * 「비어 있어요」 안내는 없앴다. 빈 날 카드에 남은 것은 안 썼다는 줄과
   * 기록하기 버튼 둘뿐이라, 그 버튼이 있으면 빈 날이다.
   */
  get empty(): Locator {
    return this.emptyButton;
  }

  /**
   * 없앤 안내문. **자리가 비었는지 보려고만 둔다.**
   *
   * 「비어 있어요」와 「하나만 적어도 충분해요」 둘 다 지웠다. 안 썼다는 줄과 같은 말투라
   * 어느 쪽이 버튼인지 읽히지 않았다.
   */
  get emptyNotice(): Locator {
    return this.root.getByText(/비어 있어요|하나만 적어도 충분해요/);
  }

  /**
   * 빈 날 카드의 기록 시트 입구. 「오늘 기록하기」.
   *
   * 위 큰 버튼(「기록하기」)과 글자가 겹치지 않게 날 이름이 앞에 붙는다.
   */
  get emptyButton(): Locator {
    /*
      날 이름이 앞에 붙는다. **「오늘」·「어제」 뿐 아니라 「9월 12일」 도 온다.**
      예전에는 `\S+` 로 잡아 띄어쓰기가 든 날짜를 못 찾았다. 며칠 전으로 되짚은
      테스트가 버튼이 없다고 죽었다(제품은 멀쩡했다).
    */
    return this.root.getByRole('button', { name: /기록하기$/ });
  }

  /**
   * 카드 제목 오른쪽에 붙는 그 날 합계. `4,500원 씀`.
   *
   * 적은 줄이 하나도 없는 날에는 0원을 적지 않고 자리째 없다.
   * 달력의 같은 날 합계와 견주는 자리라, 숫자만이 아니라 `씀` 까지 통째로 잡는다.
   */
  get spentTotal(): Locator {
    return this.root.getByText(/^[\d,]+원 씀$/);
  }

  /** 행 제목. 가맹점을 아는 기록은 가맹점명, 아니면 카테고리 이름이다. */
  row(title: string): Locator {
    return this.text(title);
  }

  /**
   * 그 행에 그려진 그림.
   *
   * `row()` 는 제목 글자만 잡는다. 그림은 그 형제라 행까지 올라가야 닿는다.
   * 분류에 걸어 둔 이모지·사진이 목록에도 따라오는지 보는 자리다.
   * 이름이 없는 그림이라 그려진 클래스로 잡는다(금액을 잡는 방식과 같다).
   */
  rowAvatar(title: string): Locator {
    return this.root
      .locator('.pk-tx')
      .filter({ has: this.page.getByText(title, { exact: true }) })
      .locator('.pk-avatar');
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
   * 날 이름이 붙은 안 썼어요 버튼. 「어제는 안 썼어요」·「9월 6일은 안 썼어요」.
   *
   * 위 `noSpendButton` 은 오늘 문구로 못 박혀 있어 화살표로 옮긴 날을 못 잡는다.
   * 이 버튼도 「N 기록하기」 처럼 이름에 날을 달고 그 날에 저장하는 자리라,
   * 오늘 말고도 밟아 볼 수 있게 이름을 열어 둔다.
   *
   * 조사는 화면이 쓰는 함수를 그대로 부른다. 여기에 「는」 을 적어 두면
   * 「어제은 안 썼어요」 같은 것이 나와도 잡히지 않는다.
   */
  noSpendButtonFor(dayLabel: string): Locator {
    return this.root.getByRole('button', { name: `${withTopic(dayLabel)} 안 썼어요` });
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

  /** 카드 마지막 줄. 달력으로 가는 입구다. 적은 줄이 하나도 없는 날에도 있다. */
  get moreLink(): Locator {
    return this.root.getByRole('link', { name: '전체 내역 보기', exact: true });
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

  /*
    이름을 정확히 맞춘다. 카드 닫기가 이 이름을 품으면 둘이 함께 걸려 strict 위반이 난다.
    실제로 닫기를 「예산 정하기 안내 닫기」로 뒀다가 관계없는 테스트 둘이 빨개졌다.
  */
  get saveButton(): Locator {
    return this.page.getByRole('button', { name: '예산 정하기', exact: true });
  }

  /** 카드가 말하는 한 줄. 첫 기록을 마쳐야 뜬다. */
  get suggestLead(): Locator {
    return this.page.getByText('예산을 정하면');
  }

  /** 제안 카드가 떴나. 아래 카드들이 이 카드에 비켜 주는지 볼 때 쓴다. */
  get suggestCard(): Locator {
    return this.suggestLead;
  }

  /** 제안 카드를 닫는다. 닫아야 그 아래 자리를 다투는 카드가 선다. */
  async dismissSuggest(): Promise<void> {
    await this.closeButton.click();
  }

  /** 저장이 실패했을 때 입력칸과 버튼 사이에 뜨는 한 줄. 홈에서 alert 는 이 자리뿐이다. */
  get saveNotice(): Locator {
    return this.page.getByRole('alert');
  }

  /** 카드 오른쪽 위의 닫기. 누르면 예산을 정할 때까지 다시 안 뜬다. */
  get closeButton(): Locator {
    return this.page.getByRole('button', { name: '예산 안내 닫기' });
  }

  /**
   * 얼마로 할지 모르는 사람의 길. 첫 기록을 막 끝낸 사람이 금액을 가장 모른다.
   *
   * 관리 탭·앱 설정의 예산 시트와 같은 이름을 쓴다. 자리에 따라 다른 말을 하면 안 된다.
   */
  get calcButton(): Locator {
    return this.page.getByRole('button', { name: '얼마로 할지 모르겠어요' });
  }

  /** 카드 위에 따로 뜨는 모달. 이 안에서는 금액 칸과 저장 버튼이 안 보인다. */
  get calcAsk(): Locator {
    return this.page.getByRole('dialog', { name: '예산 대신 잡아 드리기' });
  }

  get calcNote(): Locator {
    return this.calcAsk.getByText(/광고 한 편 보면 예산을 대신 잡아 드려요/);
  }

  get calcConfirmButton(): Locator {
    return this.calcAsk.getByRole('button', { name: /^(확인|광고를 불러오는 중이에요)$/ });
  }

  /**
   * 묻는 자리의 「닫기」. 예산을 정하던 카드로 그대로 돌아온다.
   *
   * 시트 손잡이의 이름도 「닫기」라 모달 전체에서 찾으면 둘이 걸린다.
   */
  get calcCloseButton(): Locator {
    return this.calcAsk
      .getByRole('group', { name: '예산 대신 잡아 드리기' })
      .getByRole('button', { name: '닫기', exact: true });
  }

  /** 계산기까지 가는 두 단. 물어보는 자리를 거쳐야 광고가 뜬다. */
  async openCalc(): Promise<void> {
    await this.calcButton.click();
    await expect(this.calcNote).toBeVisible();
    await this.calcConfirmButton.click();
  }

  /** 닫기 전에 어디서 다시 할 수 있는지 말하는 한 줄. 이게 없으면 닫는 순간 길이 사라진다. */
  get aside(): Locator {
    return this.page.getByText('하단의 「관리」 탭에서 예산을 다시 설정할 수 있어요');
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

  /**
   * 다 모았을 때 진행 줄 대신 서는 축하 카드.
   *
   * 진행 줄과 **함께 뜨지 않는다.** 둘 다 보이면 같은 목표를 두 번 말하는 것이다.
   */
  get doneLink(): Locator {
    return this.page.getByRole('link', { name: /다 모았어요/ });
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
   * 한 번이라도 적은 사람의 홈에 서는 카드.
   *
   * 예전에는 첫 기록 직후 시트가 스스로 열렸다. 그 한 번을 놓치면 다시 볼 길이 앱 설정
   * 뿐이었고, 세 번째에 한 번 더 묻는 장치는 기기에 센 횟수에 기대고 있어서 실기기에서
   * 안 떴다. 카드는 닫을 때까지 그 자리에 있어 놓칠 수가 없다.
   */
  get card(): Locator {
    return this.page.getByRole('group', { name: '홈 화면에 추가', exact: true });
  }

  /** 카드 안의 버튼. 누르면 안내 시트가 열린다. */
  get openButton(): Locator {
    return this.card.getByRole('button', { name: '홈 화면에 추가하는 법', exact: true });
  }

  get closeButton(): Locator {
    return this.card.getByRole('button', { name: '홈 화면 추가 안내 닫기', exact: true });
  }

  /**
   * 안내 시트. 홈 카드와 앱 설정이 **같은 시트**를 연다.
   *
   * 제목을 하나로 합쳤다. 「첫 기록 끝!」 같은 제목은 정말 그 순간에만 쓸 수 있는데,
   * 카드는 며칠 뒤에도 눌린다.
   */
  get sheet(): Locator {
    return this.page.getByRole('dialog', { name: '홈 화면에 추가하면 더 빨라요', exact: true });
  }

  /** 안내 시트 안의 단계 셋. 넷째 단계부터는 읽지 않는다. */
  get steps(): Locator {
    return this.sheet.getByRole('listitem');
  }

  get doneButton(): Locator {
    return this.sheet.getByRole('button', { name: '알겠어요', exact: true });
  }
}

/**
 * 저녁 알림 카드.
 *
 * 홈 화면 추가와 **다른 카드**다. 닫는 ✕ 도 따로 갖는다. 하나는 앱을 찾기 쉽게 하는
 * 일이고 하나는 우리가 부르는 일이라, 하나만 하고 싶은 사람이 나머지를 같이 닫게
 * 두지 않는다.
 *
 * 버튼 하나로 저녁 8시가 정해진다. 시각을 고르게 하면 그 자리에서 고민이 시작된다.
 */
class RemindCardArea {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get card(): Locator {
    return this.page.getByRole('group', { name: '저녁 알림', exact: true });
  }

  /** 그 자리에서 저녁 8시로 켜는 버튼. */
  get turnOnButton(): Locator {
    return this.card.getByRole('button', { name: '저녁 8시 알림 받기', exact: true });
  }

  get closeButton(): Locator {
    return this.card.getByRole('button', { name: '저녁 알림 안내 닫기', exact: true });
  }

  /** 시간을 바꾸러 알림 설정으로 가는 줄. 켜기 전후로 글이 바뀐다. */
  get settingsLink(): Locator {
    return this.card.getByRole('link');
  }
}

/**
 * 기록 버튼 아래 공유 권유 카드.
 *
 * 몇 번 적어 본 사람에게만 뜨고, 닫으면 다시 뜨지 않는다. 닫아 둔 표시는 기기에 남으므로
 * 테스트마다 새 브라우저 컨텍스트에서 다시 볼 수 있다(홈 화면 추가 안내와 같다).
 *
 * **예산 제안 카드가 떠 있으면 비켜 준다.** 둘이 같이 서지 않는다.
 */
class HomeShareCard {
  private readonly root: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('group', { name: '앱 공유', exact: true });
  }

  /** 카드 한 덩어리. 떴는지 없는지를 이것으로 본다. */
  get card(): Locator {
    return this.root;
  }

  /** 그림 옆 한 줄. 이 카드가 무엇을 권하는지가 여기 있다. */
  get title(): Locator {
    return this.root.getByText('가계부 쓰기 싫어하는 친구, 있죠?', { exact: true });
  }

  /** 그 아래 작은 줄. 보내기를 망설이게 하는 것을 없애는 자리다. */
  get lead(): Locator {
    return this.root.getByText('10초면 한 건 끝난다고 알려 주세요', { exact: true });
  }

  /**
   * 공유 버튼.
   *
   * 누르면 링크를 만드는 동안 이름이 「공유창 여는 중」으로 바뀐다. 두 이름을 함께 잡아야
   * 누른 뒤에도 같은 버튼을 가리킬 수 있다.
   */
  get button(): Locator {
    return this.root.getByRole('button', {
      name: /^(10초 가계부 친구에게 공유하기|공유창 여는 중)$/,
    });
  }

  get closeButton(): Locator {
    return this.root.getByRole('button', { name: '공유 안내 닫기' });
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

  /** 카드 오른쪽 위의 닫기. 다시 적고 또 며칠 비면 새로 뜬다. */
  get closeButton(): Locator {
    return this.card.getByRole('button', { name: '밀린 내역 안내 닫기' });
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


/**
 * 홈의 「곧 나갈 돈」 카드.
 *
 * 걸어 둔 반복 지출이 있고 그날이 가까울 때만 뜬다. **한 번에 한 장**이라, 같은 날 둘이
 * 걸려 있어도 카드는 하나다. 하나를 적으면 다음 것이 그 자리에 올라온다.
 */
class HomeRecurringCard {
  private readonly root: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('group', { name: '곧 나갈 돈', exact: true });
  }

  get card(): Locator {
    return this.root;
  }

  /** 첫 줄. 전날과 당일의 말이 달라야 한다. */
  get headline(): Locator {
    return this.root.getByText(/(오늘 빠져나가는 돈이에요|내일 빠져나가요)/);
  }

  get recordButton(): Locator {
    return this.root.getByRole('button', { name: '지금 기록하기', exact: true });
  }

  get dismissButton(): Locator {
    return this.root.getByRole('button', { name: '이번 달은 됐어요', exact: true });
  }
}

/**
 * 연속 기록 축하.
 *
 * 이름이 `N일 연속 기록` 인 대화상자다. 몇 일째인지를 이름에서 못 박지 않고 찾는다.
 * 뜨지 않아야 하는 자리에서 「몇 일이든 하나도 없다」 를 봐야 해서다.
 */
class StreakCelebrationArea {
  private readonly root: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('dialog', { name: /^\d+일 연속 기록$/ });
  }

  get dialog(): Locator {
    return this.root;
  }

  /** 큰 글씨 한 줄. `축하합니다!`. */
  get lead(): Locator {
    return this.root.locator('.closing__lead');
  }

  /** 그 아래 줄. `일주일을 다 채웠어요` 처럼 몇 주를 채웠는지. */
  get milestone(): Locator {
    return this.root.locator('.closing__line');
  }

  get shareButton(): Locator {
    return this.root.getByRole('button', { name: '친구에게 공유하기' });
  }

  get closeButton(): Locator {
    return this.root.getByRole('button', { name: '닫기', exact: true });
  }

  async waitOpen(): Promise<void> {
    await expect(this.root).toBeVisible();
  }

  async waitClosed(): Promise<void> {
    await expect(this.root).toHaveCount(0);
  }
}
