import { expect, type Locator, type Page } from '@playwright/test';

import { ROUTES } from '../../src/app/router/routes';

/**
 * 알림 설정 화면.
 *
 * 앱 설정 아래 하위 화면이라 URL 이 달라 별도 객체다.
 * 여기서 손댈 수 있는 것은 켜기와 시각 둘뿐이라 영역을 더 쪼개지 않았다.
 */
export class NotificationsScreen {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async open(): Promise<void> {
    await this.page.goto(ROUTES.notifications);
  }

  /**
   * 설정 조회가 끝난 뒤.
   *
   * 지금 값을 받기 전에는 토글을 아예 그리지 않는다. 기본값으로 미리 그려 두면 꺼져 있는
   * 것을 켜져 있다고 말하게 되기 때문이다. 그래서 토글이 보이면 조회가 끝난 것이다.
   */
  async waitReady(): Promise<void> {
    await expect(this.toggle).toBeVisible();
  }

  /** 기록 알림 켜기. 옆의 글자가 접근성 이름이다. */
  get toggle(): Locator {
    return this.page.getByRole('switch', { name: '기록 알림' });
  }

  /** 알림 받을 시각. 켜져 있을 때만 손댈 수 있다. */
  get timeInput(): Locator {
    return this.page.getByLabel('알림 시간');
  }

  /** 켠 뒤 서버가 값을 돌려줄 때까지 기다린다. 켜진 자리가 곧 저장이 끝났다는 신호다. */
  async turnOn(): Promise<void> {
    await this.toggle.click();
    await expect(this.toggle).toHaveAttribute('aria-checked', 'true');
  }

  async turnOff(): Promise<void> {
    await this.toggle.click();
    await expect(this.toggle).toHaveAttribute('aria-checked', 'false');
  }

  /** `22:00` 모양으로 넘긴다. 저장이 끝나면 입력칸이 다시 손댈 수 있게 된다. */
  async setTime(value: string): Promise<void> {
    await this.timeInput.fill(value);
    await expect(this.timeInput).toBeEnabled();
    await expect(this.timeInput).toHaveValue(value);
  }

  /** 켜지지 않은 이유나 저장이 막힌 이유를 적는 줄. */
  get notice(): Locator {
    return this.page.getByRole('alert');
  }

  /** 낮은 토스 앱 버전에서 이 자리를 대신하는 안내. devtools 목에서는 뜨지 않는다. */
  get unsupported(): Locator {
    return this.page.getByText('이 버전에서는 아직 안 되는 기능이에요', { exact: true });
  }

  /**
   * 화면 어디든 그 글자.
   *
   * 없어야 할 것을 세는 자리다. 있어야 할 것은 역할이나 라벨로 집는다.
   */
  text(value: string | RegExp): Locator {
    return this.page.getByText(value);
  }

  /** 화면에 떠 있는 대화상자 전부. 저절로 뜨는 것이 없는지 세는 데 쓴다. */
  get anyDialog(): Locator {
    return this.page.getByRole('dialog');
  }
}
