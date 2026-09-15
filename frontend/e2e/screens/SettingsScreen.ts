import { expect, type Locator, type Page } from '@playwright/test';

import { ROUTES } from '../../src/app/router/routes';
import { TEST_IDS } from '../../src/shared/testIds';

/** 홈 맨 위에 무엇을 보여줄지 고르는 세 갈래. 화면에 적힌 라벨 그대로다. */
export type HeroChoiceLabel = '남은 예산' | '수입·지출' | '수입·예산';

/**
 * 앱 설정 화면.
 *
 * 관리 탭 아래 하위 화면이라 URL 이 달라 별도 객체다.
 * 셀렉터는 이 파일 안에만 두고, 무엇이 맞는지는 spec 이 정한다.
 */
export class SettingsScreen {
  private readonly page: Page;

  /** 여기서 고른 것이 홈 맨 위에 어떻게 나타나는지. */
  readonly heroResult: HeroResultArea;

  constructor(page: Page) {
    this.page = page;
    this.heroResult = new HeroResultArea(page);
    this.dataReset = new DataResetArea(page);
  }

  async open(): Promise<void> {
    await this.page.goto(ROUTES.settings);
  }

  /**
   * 설정 조회가 끝난 뒤.
   *
   * 지금 고른 값을 받기 전에는 세 갈래를 아예 그리지 않는다. 기본값으로 미리 그려 두면
   * 고르지 않은 것을 골랐다고 말하게 되기 때문이다. 그래서 갈래가 보이면 조회가 끝난 것이다.
   */
  async waitReady(): Promise<void> {
    await expect(this.heroChoice('남은 예산')).toBeVisible();
  }

  /** 홈 표시 방식 세 갈래 중 하나. */
  heroChoice(label: HeroChoiceLabel): Locator {
    return this.page
      .getByRole('radiogroup', { name: '홈 표시 방식' })
      .getByRole('radio', { name: label, exact: true });
  }

  /**
   * 하나를 골라 저장까지 마친다.
   *
   * 저장을 기다리는 동안은 세 갈래가 잠기고 고른 자리도 아직 옮겨 가지 않는다.
   * 켜진 자리가 옮겨 온 것이 곧 저장이 끝났다는 신호다.
   */
  async chooseHero(label: HeroChoiceLabel): Promise<void> {
    await this.heroChoice(label).click();
    await expect(this.heroChoice(label)).toHaveAttribute('aria-checked', 'true');
  }

  /**
   * 고른 것이 홈을 어떻게 바꾸는지 되짚는 한 줄. 라벨 세 개만으로는 결과가 안 그려진다.
   *
   * 글자로 잡지 않는다. 문구가 예산 유무에 따라 갈려서, 앞머리를 못 박으면
   * 한쪽 문구만 잡히고 다른 쪽에서는 조상 요소가 통째로 잡힌다.
   */
  get preview(): Locator {
    return this.page.getByTestId(TEST_IDS.homeHeroPreview);
  }

  /**
   * 예산을 안 정한 채 예산이 걸린 갈래를 고른 사람에게만 서는 버튼.
   *
   * 예산은 관리 탭에 있는데, 「관리 탭에 가서 정하세요」 라고 적어 두면 대부분 안 간다.
   * 여기서 바로 연다.
   */
  get budgetButton(): Locator {
    return this.page.getByTestId(TEST_IDS.homeHeroBudget);
  }

  /** 그 버튼이 여는 시트. 관리 탭이 쓰는 것과 같은 시트다. */
  get budgetSheet(): Locator {
    return this.page.getByRole('dialog', { name: '전체 예산', exact: true });
  }

  /** 시트 안 금액 칸과 저장. 관리 탭 쪽 화면 객체와 같은 이름을 쓴다. */
  get budgetAmountField(): Locator {
    return this.budgetSheet.getByLabel('금액');
  }

  get budgetSaveButton(): Locator {
    return this.budgetSheet.getByRole('button', { name: '저장', exact: true });
  }

  /**
   * 얼마로 할지 모르는 사람의 다른 길. 관리 탭 쪽 화면 객체와 같은 이름을 쓴다.
   *
   * 여기 오는 사람은 예산이 아직 없는 사람뿐이라, 이 길이 가장 필요한 자리다.
   */
  get budgetCalcButton(): Locator {
    return this.budgetSheet.getByRole('button', {
      name: /계산해서 정하기|광고를 불러오는 중이에요/,
    });
  }

  /** 광고 한 편을 봐야 열린다는 한 줄. 눌러 보고 알면 속은 기분이 든다. */
  get budgetCalcNote(): Locator {
    return this.budgetSheet.getByText(/짧은 광고 한 편을 보면 열려요/);
  }

  /** 금액을 적고 저장까지. 시트가 닫히면 정해진 것이다. */
  async setBudget(amount: number): Promise<void> {
    await this.budgetButton.click();
    await expect(this.budgetSheet).toBeVisible();
    await this.budgetAmountField.fill(String(amount));
    await this.budgetSaveButton.click();
    await expect(this.budgetSheet).toHaveCount(0);
  }

  /**
   * 저장이 막혔을 때 그 자리에 뜨는 한 줄.
   *
   * 고른 자리가 원래대로 돌아가는데, 왜 돌아갔는지 말하지 않으면 눌리지 않은 것으로 보인다.
   */
  get saveNotice(): Locator {
    return this.page.getByRole('alert');
  }

  /** 설정을 아예 못 받았을 때. 덩어리를 감추지 않고 이 줄로 바꿔 그린다. */
  get loadFailure(): Locator {
    return this.page.getByText('홈 표시 설정을 불러오지 못했어요', { exact: true });
  }

  /** 못 받은 자리의 다시 시도. 이 화면에서 다시 시도는 여기뿐이다. */
  get retryButton(): Locator {
    return this.page.getByRole('button', { name: '다시 시도' });
  }

  /** 사진을 올리는 사람이 가장 먼저 묻는 것에 답하는 한 줄. */
  get captureNotice(): Locator {
    return this.page.getByText(/^캡처 원본은 /);
  }

  get privacyLink(): Locator {
    return this.page.getByRole('link', { name: '개인정보처리방침', exact: true });
  }

  /** 홈 화면에 추가하는 법을 여는 줄. 홈 카드를 놓친 사람이 나중에 찾아오는 자리다. */
  get addToHomeRow(): Locator {
    return this.page.getByRole('button', { name: /휴대폰 홈 화면에 추가/ });
  }

  /** 그 줄이 여는 안내 시트. 홈 카드가 여는 것과 같은 시트다. */
  get addToHomeSheet(): Locator {
    return this.page.getByRole('dialog', { name: '홈 화면에 추가하면 더 빨라요', exact: true });
  }

  /** 버전 줄 아래 배너 자리. 채울 광고가 없으면 접힌다. */
  get adSlot(): Locator {
    return this.page.getByTestId(TEST_IDS.adSlot);
  }

  /** 앱 정보 시트를 여는 버전 줄. 실기기에서 판을 확인할 유일한 자리다. */
  get versionRow(): Locator {
    return this.page.getByRole('button', { name: /^버전/ });
  }

  /** 그 줄이 여는 시트. */
  get diagnosticsSheet(): Locator {
    return this.page.getByRole('dialog', { name: '앱 정보', exact: true });
  }

  /** 시트 안의 값 목록. 판·앱 버전·토스 앱·배포·기기가 여기 있다. */
  get diagnostics(): Locator {
    return this.page.getByTestId(TEST_IDS.diagnostics);
  }

  /** 이 기기에서 배너를 끄는 스위치. 무효 트래픽 방어의 마지막 자리다. */
  get adOptOutToggle(): Locator {
    return this.page.getByRole('switch', { name: '이 기기에서 광고 끄기' });
  }

  /** 한 번만 뜨는 안내를 처음 상태로. 실기기에서 첫 기록 흐름을 다시 보려면 이게 있어야 한다. */
  get resetMarksButton(): Locator {
    return this.page.getByRole('button', { name: '안내를 처음 상태로', exact: true });
  }

  /**
   * 앱 데이터 초기화. 배너 아래, 화면 맨 끝이다.
   *
   * 되돌릴 수 없는 자리라 여는 것과 지우는 것이 갈려 있다.
   * 무엇이 사라지는지 읽고 동의를 눌러야 확인이 열린다.
   */
  readonly dataReset: DataResetArea;

  /**
   * 화면 어디든 그 글자.
   *
   * 없어야 할 것을 세는 자리다. 있어야 할 것은 역할이나 testid 로 집는다.
   * 문자열은 부분일치라 앞뒤를 못 박아야 할 때는 정규식을 넘긴다.
   */
  text(value: string | RegExp): Locator {
    return this.page.getByText(value);
  }

  /**
   * 화면에 떠 있는 대화상자 전부.
   *
   * 처음 온 사람에게 표시 방식을 묻지 않는 것을 세는 데 쓴다. 홈에서도 부른다.
   */
  get anyDialog(): Locator {
    return this.page.getByRole('dialog');
  }

  /** 화면에 놓인 갈래 고르기 전부. 홈이 표시 방식을 묻지 않는 것을 세는 데 쓴다. */
  get anyChoiceGroup(): Locator {
    return this.page.getByRole('radiogroup');
  }
}

/**
 * 설정을 바꾼 결과가 홈 맨 위에 나타난 모습.
 *
 * 홈 화면 객체가 아직 차액·번 돈 자리를 들고 있지 않아 여기서 잡는다.
 * 홈 쪽에 그 자리가 생기면 이 덩어리를 지우고 그리로 옮긴다.
 */
class HeroResultArea {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * 큰 숫자 위 한 줄. `9월 · 이번 달 차액` 처럼 지금 무엇을 보여주는지 적혀 있다.
   *
   * 네 갈래를 다 받아 두고 어느 것인지는 spec 이 못 박는다.
   * 여기서 하나로 좁히면 화면이 다른 것을 그려도 로케이터가 비어 조용히 넘어간다.
   */
  get label(): Locator {
    return this.page.getByText(
      /^\d{1,2}월 · (남은 예산|이번 달 쓴 돈|이번 달 차액|번 돈과 남은 예산)$/,
    );
  }

  /** 이번 달 차액. 번 돈에서 쓴 돈을 뺀 값이라 부호가 붙는다. */
  get delta(): Locator {
    return this.page.getByTestId(TEST_IDS.heroDelta);
  }

  /** 이번 달 번 돈. 수입이라 `+` 가 붙는다. */
  get income(): Locator {
    return this.page.getByTestId(TEST_IDS.heroIncome);
  }
}

/** 앱 데이터 초기화 덩어리와 그 확인 시트. */
class DataResetArea {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** 화면 맨 끝의 회색 글자 한 줄. 카드가 아니라 눈에 안 띄는 것이 맞다. */
  get openButton(): Locator {
    return this.page.getByRole('button', { name: '앱 데이터 초기화', exact: true });
  }

  get sheet(): Locator {
    return this.page.getByRole('dialog', { name: '정말 지울까요?', exact: true });
  }

  /** 무엇이 사라지는지 이름으로 적어 둔 목록. "데이터" 한 단어로는 무엇을 잃는지 모른다. */
  get list(): Locator {
    return this.sheet.getByRole('listitem');
  }

  get warning(): Locator {
    return this.sheet.getByText(/앱에서는 전부 사라져요/);
  }

  /** 확인 버튼을 여는 유일한 열쇠. */
  get agree(): Locator {
    return this.sheet.getByTestId(TEST_IDS.resetAgree);
  }

  /** 실제로 지우는 버튼. 저장 버튼과 같은 초록이면 손이 습관대로 누른다. */
  get confirmButton(): Locator {
    return this.sheet.getByRole('button', { name: '전부 지우기', exact: true });
  }

  /** 열고, 동의하고, 지운다. 시트가 닫히면 끝난 것이다. */
  async run(): Promise<void> {
    await this.openButton.click();
    await expect(this.sheet).toBeVisible();
    await this.agree.check();
    await this.confirmButton.click();
    await expect(this.sheet).toBeHidden();
  }
}
