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

  /** 사진을 올리는 사람이 가장 먼저 묻는 것에 답하는 한 줄. */
  get captureNotice(): Locator {
    return this.page.getByText(/^캡처 원본은 /);
  }

  get privacyLink(): Locator {
    return this.page.getByRole('link', { name: '개인정보처리방침', exact: true });
  }

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
