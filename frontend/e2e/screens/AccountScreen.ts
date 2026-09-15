import { expect, type Locator, type Page } from '@playwright/test';

import { ROUTES } from '../../src/app/router/routes';

/**
 * 내 계정 화면.
 *
 * 앱 설정 아래 하위 화면이라 URL 이 달라 별도 객체다. 카드 하나와 시트 둘(이메일·연령대)뿐이다.
 * 셀렉터는 이 파일 안에만 두고, 무엇이 맞는지는 spec 이 정한다.
 */
export class AccountScreen {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async open(): Promise<void> {
    await this.page.goto(ROUTES.account);
  }

  /** 조회가 끝난 뒤. 연결 전 제목이나 연결 뒤 제목 중 하나가 뜬다. */
  async waitReady(): Promise<void> {
    await expect(this.notLinkedTitle.or(this.linkedTitle)).toBeVisible();
  }

  get notLinkedTitle(): Locator {
    return this.page.getByRole('heading', { name: '기록을 지켜 두세요', exact: true });
  }

  get linkedTitle(): Locator {
    return this.page.getByRole('heading', { name: '지켜 두고 있어요', exact: true });
  }

  /** 안 해도 된다는 한 줄. 로그인 화면이 강요로 읽히면 안 된다. */
  get optionalNote(): Locator {
    return this.page.getByText('안 해도 지금처럼 그대로 쓸 수 있어요', { exact: true });
  }

  get linkButton(): Locator {
    return this.page.getByRole('button', { name: '이메일로 지켜 두기', exact: true });
  }

  /** 연결된 이메일. 카드 머리에 초록으로 적힌다. */
  email(address: string): Locator {
    return this.page.getByText(address, { exact: true });
  }

  /** 연령대·성별 한 줄. 눌러서 고친다. */
  get profileRow(): Locator {
    return this.page.getByRole('button', { name: /^연령대·성별/ });
  }

  // ── 이메일 시트 ───────────────────────────────────

  get linkSheet(): Locator {
    return this.page.getByRole('dialog', { name: '이메일로 지켜 두기', exact: true });
  }

  get emailField(): Locator {
    return this.linkSheet.getByLabel('이메일');
  }

  get sendButton(): Locator {
    return this.linkSheet.getByRole('button', { name: '코드 받기', exact: true });
  }

  /** 흔한 주소 뒷자리 칩. 앞자리만 적고 눌러서 끝낸다. */
  domainChip(domain: string): Locator {
    return this.linkSheet.getByRole('button', { name: `@${domain}`, exact: true });
  }

  /** 주소가 다 갖춰지면 칩은 치운다. 그것을 확인할 자리. */
  get domainChips(): Locator {
    return this.linkSheet.getByLabel('흔한 주소 뒷자리');
  }

  /** 코드 단계의 안내. 메일을 안 열어도 된다고 적혀 있어야 한다. */
  get codeHint(): Locator {
    return this.linkSheet.getByText('제목에 코드가 그대로');
  }

  get spamHint(): Locator {
    return this.linkSheet.getByText('스팸함에 가 있을 수 있어요', { exact: true });
  }

  get codeField(): Locator {
    return this.linkSheet.getByLabel('확인 코드');
  }

  get confirmButton(): Locator {
    return this.linkSheet.getByRole('button', { name: '확인', exact: true });
  }

  get resendButton(): Locator {
    return this.linkSheet.getByRole('button', { name: /다시 보내기|새 코드 받기/ });
  }

  /** 시트 안 오류 한 줄. 코드가 틀렸을 때 등. */
  get linkNotice(): Locator {
    return this.linkSheet.getByRole('alert');
  }

  /** 주소를 적고 코드를 받는 데까지. 코드 칸이 보이면 메일이 나간 것이다. */
  async requestCode(address: string): Promise<void> {
    await this.linkButton.click();
    await expect(this.linkSheet).toBeVisible();
    await this.emailField.fill(address);
    await this.sendButton.click();
    await expect(this.codeField).toBeVisible();
  }

  /** 코드를 적고 확인까지. 시트가 닫히면 붙은 것이다. */
  async submitCode(code: string): Promise<void> {
    await this.codeField.fill(code);
    await this.confirmButton.click();
    await expect(this.linkSheet).toHaveCount(0);
  }

  // ── 연령대·성별 시트 ──────────────────────────────

  get profileSheet(): Locator {
    return this.page.getByRole('dialog', { name: '두 가지만 알려 주세요', exact: true });
  }

  /** 연령대는 고르는 칸이다. 처음 안내와 같은 모양을 쓴다. */
  get ageSelect(): Locator {
    return this.profileSheet.getByLabel('연령대');
  }

  genderChoice(label: string): Locator {
    return this.profileSheet
      .getByRole('radiogroup', { name: '성별' })
      .getByRole('radio', { name: label, exact: true });
  }

  get profileSaveButton(): Locator {
    return this.profileSheet.getByRole('button', { name: '저장', exact: true });
  }

  get profileSkipButton(): Locator {
    return this.profileSheet.getByRole('button', { name: '건너뛰기', exact: true });
  }
}
