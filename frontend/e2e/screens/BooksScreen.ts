import { expect, type Locator, type Page } from '@playwright/test';

import { ROUTES, bookSettingsPath, bookSettlePath, joinPath } from '../../src/app/router/routes';
import { TEST_IDS } from '../../src/shared/testIds';

/**
 * 같이 쓰는 가계부의 하위 화면 다섯: 목록 · 만들기 · 설정 · 정산 · 초대.
 *
 * 공유 홈과 기록 시트의 「적을 곳」 은 여기가 아니라 HomeScreen · RecordSheet 에 있다.
 * 셀렉터는 이 파일 안에만 둔다. 이름은 화면 문구 그대로다.
 */
export class BooksScreen {
  private readonly page: Page;
  readonly list: BookListArea;
  readonly create: BookCreateArea;
  readonly settings: BookSettingsArea;
  readonly settle: BookSettleArea;
  readonly join: JoinArea;

  constructor(page: Page) {
    this.page = page;
    this.list = new BookListArea(page);
    this.create = new BookCreateArea(page);
    this.settings = new BookSettingsArea(page);
    this.settle = new BookSettleArea(page);
    this.join = new JoinArea(page);
  }

  async openList(): Promise<void> {
    await this.page.goto(ROUTES.books);
  }

  async openNew(): Promise<void> {
    await this.page.goto(ROUTES.bookNew);
  }

  async openSettings(bookId: string): Promise<void> {
    await this.page.goto(bookSettingsPath(bookId));
  }

  async openSettle(bookId: string): Promise<void> {
    await this.page.goto(bookSettlePath(bookId));
  }

  /** 초대 링크를 누른 것처럼 연다. 토스 링크는 브라우저에서 못 열어 앱 안 경로로 들어간다. */
  async openJoin(code: string): Promise<void> {
    await this.page.goto(joinPath(code));
  }

  /** 떠 있는 확인 창. 나가기·내보내기·지우기가 같은 모양을 쓴다. */
  get confirm(): Locator {
    return this.page.getByRole('alertdialog');
  }

  /** 확인 창 안의 버튼. 뒤에 같은 이름의 버튼(내보내기)이 있어 창 안에서만 찾는다. */
  confirmButton(label: string): Locator {
    return this.confirm.getByRole('button', { name: label, exact: true });
  }

  /** 화면 아래 한 줄 알림. 글이 맞는 것 하나만 잡는다. */
  toast(text: string | RegExp): Locator {
    return this.page.getByRole('status').filter({ hasText: text });
  }

  /** 알림 안의 버튼(「되돌리기」). */
  toastAction(text: string | RegExp, label = '되돌리기'): Locator {
    return this.toast(text).getByRole('button', { name: label, exact: true });
  }

  /**
   * 홈 맨 위 가계부 칩. 읽는 이름이 「보는 가계부 <이름>」 이다.
   * 합류·만들기·되살리기 뒤 어느 가계부 홈에 내렸는지를 이것으로 본다.
   */
  homeChip(bookName: string): Locator {
    return this.page.getByRole('button', { name: `보는 가계부 ${bookName}`, exact: true });
  }

  /** 가계부 칩을 누르면 뜨는 고르기 창. */
  get picker(): Locator {
    return this.page.getByRole('dialog', { name: '어느 가계부를 볼까요' });
  }

  /** 고르기 창의 한 줄. 이름 뒤에 고른 표시가 붙어 읽힌다. */
  pickerRow(bookName: string): Locator {
    return this.picker.getByRole('button', { name: startsWith(bookName) });
  }

  /** 배너 광고 자리. 이 하위 화면들에는 없어야 한다. */
  get adSlot(): Locator {
    return this.page.getByTestId(TEST_IDS.adSlot);
  }

  /** 광고 바로 전에 서는 확인 창. 이 화면들에서는 뜨면 안 된다. */
  get adConsent(): Locator {
    return this.page.getByRole('alertdialog', { name: '광고가 한 번 나와요' });
  }

  /** 처음 안내. 초대받아 들어온 사람에게는 뜨면 안 된다. */
  get onboarding(): Locator {
    return this.page.getByRole('dialog', { name: '처음 안내' });
  }
}

/** 이름 앞부분이 같은 줄을 찾는다. 이름 뒤에 인원이나 칩이 붙어 읽힌다. */
function startsWith(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
}

/** `/books` 같이 쓰는 가계부 목록. */
export class BookListArea {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { level: 1, name: '같이 쓰는 가계부', exact: true });
  }

  async waitReady(): Promise<void> {
    await expect(this.heading).toBeVisible();
  }

  get createButton(): Locator {
    return this.page.getByRole('button', { name: '같이 쓸 가계부 만들기', exact: true });
  }

  /** 가계부 한 줄. 누르면 그 가계부 설정으로 간다. */
  row(bookName: string): Locator {
    return this.page.getByRole('link', { name: startsWith(bookName) });
  }

  get emptyLine(): Locator {
    return this.page.getByText('링크 하나로 초대해요', { exact: true });
  }

  get endedLabel(): Locator {
    return this.page.getByText('완료한 가계부', { exact: true });
  }
}

/** `/books/new` 만들기. 한 화면 안에서 유형 고르기와 정하기 두 단계로 간다. */
export class BookCreateArea {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** 첫 단계 제목. */
  get kindTitle(): Locator {
    return this.page.getByRole('heading', { level: 1, name: '누구와 같이 쓰나요', exact: true });
  }

  /** 첫 단계 카드. 「연인·부부」·「가족」·「여행·모임」·「룸메이트」 */
  kindButton(label: string): Locator {
    return this.page.getByRole('button', { name: startsWith(label) });
  }

  /** 둘째 단계 제목. 유형 이름으로 고정이다. 「연인·부부 가계부를 만들게요」 */
  stepTitle(kindLabel: string): Locator {
    return this.page.getByRole('heading', { name: `${kindLabel} 가계부를 만들게요` });
  }

  /** 「돈 나누기」 칸 하나. 「반반」·「같이 모은 돈」·「똑같이 나눠요」 */
  settleOption(label: string): Locator {
    return this.page.getByRole('radio', { name: startsWith(label) });
  }

  get myName(): Locator {
    return this.page.getByLabel('내 이름', { exact: true });
  }

  /** 둘째 단계 맨 위 칸. 유형에 맞는 기본 이름이 채워져 있다. */
  get bookName(): Locator {
    return this.page.getByLabel('가계부 이름', { exact: true });
  }

  get submitButton(): Locator {
    return this.page.getByRole('button', { name: '만들고 초대하기', exact: true });
  }
}

/** `/books/settings?id=` 가계부 설정. 관리자만 보이는 줄은 `owner` 로 나눈다. */
export class BookSettingsArea {
  private readonly page: Page;
  readonly owner: BookOwnerActions;

  constructor(page: Page) {
    this.page = page;
    this.owner = new BookOwnerActions(page);
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { level: 1, name: '가계부 설정', exact: true });
  }

  async waitReady(): Promise<void> {
    await expect(this.heading).toBeVisible();
  }

  /** 「멤버 2/10」 또는 둘이 다 찬 연인 가계부의 「멤버 2명」. */
  get membersLabel(): Locator {
    return this.page.getByRole('heading', { level: 2, name: /^멤버 / });
  }

  /** 「우리 집 열기」. 그 가계부를 홈에 띄운다. 홈의 멤버 얼굴에서 왔으면 없다. */
  openBookButton(bookName: string): Locator {
    return this.page.getByRole('button', { name: `${bookName} 열기`, exact: true });
  }

  /** 멤버 한 줄. 앞에 첫 글자 동그라미, 뒤에 「관리자」·「나」 칩이 붙어 이름 글자로 찾는다. */
  member(name: string): Locator {
    return this.page
      .getByRole('listitem')
      .filter({ has: this.page.getByText(name, { exact: true }) });
  }

  /** 관리자가 다른 멤버 줄을 누르면 그 아래 서는 「내보내기」. */
  kickButton(name: string): Locator {
    return this.member(name).getByRole('button', { name: '내보내기', exact: true });
  }

  /** 멤버 줄 자체(관리자에게만 눌리는 버튼). */
  memberButton(name: string): Locator {
    return this.member(name).getByRole('button', { name: startsWith(name) });
  }

  /** 「링크는 10월 5일까지 쓸 수 있어요」 */
  get inviteUntil(): Locator {
    return this.page.getByText(/^링크는 .+까지 쓸 수 있어요$/);
  }

  get inviteButton(): Locator {
    return this.page.getByRole('button', { name: '초대장 보내기', exact: true });
  }

  get settleRule(): Locator {
    return this.page.getByRole('radiogroup', { name: '돈 나누기' });
  }

  get leaveButton(): Locator {
    return this.page.getByRole('button', { name: /에서 나가기$/ });
  }

  get plusRow(): Locator {
    return this.page.getByRole('button', { name: /광고 없이 쓰기/ });
  }

  /** 「우리 집 광고 없이 쓰기」 창. */
  get plusSheet(): Locator {
    return this.page.getByRole('dialog', { name: /광고 없이 쓰기$/ });
  }

  get plusWantButton(): Locator {
    return this.plusSheet.getByRole('button', { name: '원해요', exact: true });
  }

  /** 창 아래 「닫기」 글씨 버튼. 손잡이도 읽는 이름이 「닫기」 라 보이는 글자로 가른다. */
  get plusCloseButton(): Locator {
    return this.plusSheet
      .getByRole('button', { name: '닫기', exact: true })
      .filter({ hasText: '닫기' });
  }
}

/** 관리자만 보는 줄. 멤버에게는 아예 없다. */
export class BookOwnerActions {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get renameButton(): Locator {
    return this.page.getByRole('button', { name: '이름 바꾸기', exact: true });
  }

  get endButton(): Locator {
    return this.page.getByRole('button', { name: '가계부 완료하기', exact: true });
  }

  get reopenButton(): Locator {
    return this.page.getByRole('button', { name: '다시 열기', exact: true });
  }

  get deleteButton(): Locator {
    return this.page.getByRole('button', { name: '가계부 지우기', exact: true });
  }

  /** 이름 바꾸기를 누르면 그 자리에 서는 칸. */
  get renameInput(): Locator {
    return this.page.getByLabel('가계부 이름', { exact: true });
  }

  get renameSaveButton(): Locator {
    return this.page.getByRole('button', { name: '저장', exact: true });
  }
}

/** `/books/settle?id=` 정산. */
export class BookSettleArea {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** 「우리 집 정산」. 가계부 이름을 읽기 전에는 「정산」 만 선다. */
  get heading(): Locator {
    return this.page.getByRole('heading', { level: 1, name: / 정산$/ });
  }

  async waitReady(): Promise<void> {
    await expect(this.heading).toBeVisible();
  }

  get doneButton(): Locator {
    return this.page.getByRole('button', { name: '정산 끝냈어요', exact: true });
  }

  get redoButton(): Locator {
    return this.page.getByRole('button', { name: '다시 끝내기', exact: true });
  }

  /** 끝낸 정산 되돌리기. 화면에 「되돌리기」 는 이것 하나다. */
  get undoButton(): Locator {
    return this.page.getByRole('button', { name: '되돌리기', exact: true });
  }

  line(text: string | RegExp): Locator {
    return this.page.getByText(text);
  }

  /** 정산 결과 카드. 결과 문장은 이 카드 안에서만 찾는다. */
  get result(): Locator {
    return this.page.getByRole('group', { name: '정산 결과' });
  }

  resultLine(text: string): Locator {
    return this.result.getByText(text, { exact: true });
  }

  /** 「은홍이 낸 돈 304,900원」 한 줄. 이름과 금액을 같은 줄 안에서 묶어 본다. */
  paidRow(label: string): Locator {
    return this.page.getByRole('listitem').filter({ hasText: label });
  }

  /** 끝낸 정산 자리의 한 줄. 「은홍이 9월 28일에 끝냈어요」 */
  get doneLine(): Locator {
    return this.page.getByText(/에 끝냈어요$/);
  }
}

/** `/join?c=` 초대받은 사람이 여는 화면. */
export class JoinArea {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** 「우리 집에서 부를 내 이름」 */
  get nameInput(): Locator {
    return this.page.getByLabel(/에서 부를 내 이름$/);
  }

  get joinButton(): Locator {
    return this.page.getByRole('button', { name: '같이 쓰기', exact: true });
  }

  /** 링크를 못 쓸 때 서는 하나뿐인 버튼. */
  get openMineButton(): Locator {
    return this.page.getByRole('button', { name: '내 가계부 열기', exact: true });
  }

  message(text: string | RegExp): Locator {
    return this.page.getByText(text);
  }

  /** 누가 어느 가계부에 불렀는지 말하는 제목, 또는 링크를 못 쓸 때의 한 문장. */
  get title(): Locator {
    return this.page.getByRole('heading', { level: 1 });
  }

  /** 내 가계부는 안 보인다는 한 줄. */
  get lockLine(): Locator {
    return this.page.getByText(/^내 가계부 기록은 .+ 보이지 않아요$/);
  }
}
