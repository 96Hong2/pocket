import { type Locator, type Page } from '@playwright/test';

/**
 * 처음 열었을 때 딱 한 번 뜨는 안내.
 *
 * 기본으로는 모든 spec 에서 꺼져 있다(픽스처가 「이미 봤다」 를 심는다).
 * 이 화면을 확인하는 spec 만 `test.use({ showOnboarding: true })` 로 켠다.
 */
export class OnboardingScreen {
  private readonly root: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('dialog', { name: '처음 안내' });
  }

  get isVisible(): Promise<boolean> {
    return this.root.isVisible();
  }

  /** 지금 장의 제목. 장마다 하나뿐이라 이 한 줄이 곧 몇 번째 장인지다. */
  title(text: string): Locator {
    return this.root.getByText(text, { exact: true });
  }

  /** 다음 장으로. 마지막 장에서는 「시작하기」 라 이름이 바뀐다. */
  get nextButton(): Locator {
    return this.root.getByRole('button', { name: '다음', exact: true });
  }

  get startButton(): Locator {
    return this.root.getByRole('button', { name: '시작하기', exact: true });
  }

  /** 어느 장에서든 빠져나가는 길. 끝까지 봐야 쓸 수 있는 앱으로 만들지 않는다. */
  get skipButton(): Locator {
    return this.root.getByRole('button', { name: '건너뛰기', exact: true });
  }

  // ── 마지막 장의 연령대·성별 ───────────────────────

  ageChip(label: string): Locator {
    return this.root.getByRole('radiogroup', { name: '연령대' }).getByRole('radio', { name: label, exact: true });
  }

  genderChip(label: string): Locator {
    return this.root.getByRole('radiogroup', { name: '성별' }).getByRole('radio', { name: label, exact: true });
  }

  /** 무엇이 아닌지부터 말하는 한 줄. 「가입인가?」 가 가장 먼저 드는 생각이다. */
  get askNote(): Locator {
    return this.root.getByText(/회원가입이 아니에요/);
  }
}
