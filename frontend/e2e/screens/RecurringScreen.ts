import { expect, type Locator, type Page } from '@playwright/test';

import { ROUTES } from '../../src/app/router/routes';

/**
 * 반복 지출. 관리 탭 아래 하위 화면이라 URL 이 달라 별도 화면이다.
 *
 * 홈에 서는 「곧 나갈 돈」 카드는 이 화면이 아니라 `HomeScreen.recurring` 이 들고 있다.
 * 설정하는 자리와 알려 주는 자리가 다르기 때문이다.
 */
export class RecurringScreen {
  /** 시트 안의 확인 줄처럼 화면 객체가 다 못 감싸는 자리를 spec 이 직접 볼 때 쓴다. */
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async open(): Promise<void> {
    await this.page.goto(ROUTES.recurring);
  }

  /** 목록이 그려진 뒤. 걸어 둔 것이 없으면 빈 안내가, 있으면 추가 버튼이 보인다. */
  async waitReady(): Promise<void> {
    await expect(this.addButton).toBeVisible();
  }

  get emptyTitle(): Locator {
    return this.page.getByText('걸어 둔 것이 없어요', { exact: true });
  }

  get addButton(): Locator {
    return this.page.getByRole('button', { name: '＋ 반복 지출 추가', exact: true });
  }

  /** 목록 한 줄. 이름으로 찾는다. */
  row(name: string): Locator {
    return this.page.getByRole('listitem').filter({ hasText: name });
  }

  /** 그 줄의 켜짐 스위치. 끄면 홈에서 안 묻는다. */
  toggle(name: string): Locator {
    return this.row(name).getByRole('switch');
  }

  sheet(title: '새 반복 지출' | '반복 지출 고치기'): Locator {
    return this.page.getByRole('dialog', { name: title, exact: true });
  }

  get nameInput(): Locator {
    return this.page.getByRole('dialog').getByLabel('무엇이 나가나요', { exact: true });
  }

  get daySelect(): Locator {
    return this.page.getByRole('dialog').getByLabel('매달', { exact: true });
  }

  /** 며칠 전에 알릴지. 안 고르면 「당일」 이다. */
  leadButton(label: '당일' | '전날'): Locator {
    return this.page
      .getByRole('dialog')
      .getByRole('radiogroup', { name: '언제 알릴까요' })
      .getByRole('radio', { name: label, exact: true });
  }

  /** 이 예고만 받을 시각. 비우면 기록 알림 시각을 따른다. */
  get remindAtInput(): Locator {
    return this.page.getByRole('dialog').getByLabel('알림 시각', { exact: true });
  }

  /** 폼이 굵게 적는 「다음은 N월 D일에 적어요」 한 줄. */
  get nextLine(): Locator {
    return this.page.getByRole('dialog').locator('.recurring-form__next');
  }

  /** 목록 줄이 적는 다음 날짜. 서버가 당겨 준 값이다. */
  nextOnRow(name: string): Locator {
    return this.row(name).locator('.recurring-row__next');
  }

  saveButton(label: '만들기' | '고치기'): Locator {
    return this.page.getByRole('dialog').getByRole('button', { name: label, exact: true });
  }

  /**
   * 반복 지출 하나를 만든다.
   *
   * 금액은 키패드가 아니라 공용 금액 칸이라 숫자를 그대로 넣는다.
   */
  async create({
    name,
    amount,
    day,
    lead,
    remindAt,
  }: {
    name: string;
    amount: number;
    day: number;
    /** 안 주면 폼 기본값(당일)을 그대로 쓴다. */
    lead?: '당일' | '전날';
    /** `09:00` 모양. 안 주면 비워 둔다(기록 알림 시각을 따른다). */
    remindAt?: string;
  }): Promise<void> {
    await this.addButton.click();
    await expect(this.sheet('새 반복 지출')).toBeVisible();
    await this.nameInput.fill(name);
    /*
      **`exact` 를 안 쓴다.** 공용 금액 칸은 라벨이 입력칸을 감싸는 모양이라 접근성 이름에
      단위 「원」 까지 딸려 온다. 정확히 맞추면 영영 안 잡힌다.
    */
    await this.page.getByRole('dialog').getByLabel('금액').fill(String(amount));
    await this.daySelect.selectOption(String(day));
    if (lead != null) await this.leadButton(lead).click();
    if (remindAt != null) await this.remindAtInput.fill(remindAt);
    await this.saveButton('만들기').click();
    await expect(this.sheet('새 반복 지출')).toHaveCount(0);
  }

  get deleteButton(): Locator {
    return this.page.getByRole('button', { name: '이 반복 지출 지우기', exact: true });
  }
}
