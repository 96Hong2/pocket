import { expect, type Locator, type Page } from '@playwright/test';

import { TEST_IDS } from '../../src/shared/testIds';

/**
 * 기록 바텀시트.
 *
 * 저장해도 시트는 닫히지 않고 안쪽이 입력에서 피드백으로 바뀐다.
 * 그래서 저장 전후가 같은 dialog 이고, 시트 객체도 하나다.
 * 다만 안쪽 두 얼굴이 가진 것이 서로 달라 `input` 과 `feedback` 으로 나눠 둔다.
 */
export class RecordSheet {
  private readonly page: Page;
  private readonly root: Locator;

  /** 저장 전. 금액·키패드·카테고리 칩. */
  readonly input: RecordInput;
  /** 저장 후. 피드백 한마디·되돌리기·카테고리 바꾸기. */
  readonly feedback: RecordFeedback;
  /** 줄글 탭. 적기·검토·저장이 한 자리에서 이어진다. */
  readonly nl: RecordNaturalLanguage;
  /** 캡처 탭. 앨범에서 한 장 골라 읽고, 그 뒤로는 줄글과 같은 검토 화면이다. */
  readonly capture: RecordImageImport;
  /** 영수증 탭. 카메라로 찍는 것만 다르고 그 뒤는 캡처와 같다. */
  readonly receipt: RecordImageImport;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByRole('dialog', { name: '10초 기록' });
    this.input = new RecordInput(this.root);
    this.feedback = new RecordFeedback(this.root);
    this.nl = new RecordNaturalLanguage(this.root);
    this.capture = new RecordImageImport(this.root, CAPTURE_LABELS);
    this.receipt = new RecordImageImport(this.root, RECEIPT_LABELS);
  }

  get isVisible(): Promise<boolean> {
    return this.root.isVisible();
  }

  async waitOpen(): Promise<void> {
    await expect(this.root).toBeVisible();
  }

  async waitClosed(): Promise<void> {
    await expect(this.root).toBeHidden();
  }

  /** 헤더의 X. 딤을 누르거나 Esc 를 눌러도 같은 결과다. */
  get closeButton(): Locator {
    return this.root.getByRole('button', { name: '닫기' });
  }

  /**
   * 기록 방법 탭. 넷 다 열려 있다.
   *
   * SegmentedControl 이 `role="radio"` 를 붙인다. button 으로 잡으면 하나도 안 걸린다.
   */
  methodTab(label: '키패드' | '줄글' | '캡처' | '영수증'): Locator {
    return this.root.getByRole('radio', { name: label, exact: true });
  }

  /** 기록 방법 탭 전체. 몇 개가 놓여 있는지 셀 때 쓴다. */
  get methodTabs(): Locator {
    return this.root.getByRole('radiogroup', { name: '기록 방법' }).getByRole('radio');
  }

  async closeByEsc(): Promise<void> {
    await this.page.keyboard.press('Escape');
  }

  /** Tab 을 여러 번 눌러 포커스를 한 바퀴 돌린다. */
  async pressTab(times: number): Promise<void> {
    for (let step = 0; step < times; step += 1) {
      await this.page.keyboard.press('Tab');
    }
  }

  /**
   * 포커스가 아직 시트 안에 있나.
   *
   * 감춘 탭의 버튼까지 포커스 대상으로 세면 마지막 자리가 안 보이는 요소가 되어
   * 되돌리는 손잡이가 영영 안 잡힌다. 그러면 Tab 이 시트 밖으로 샌다.
   */
  get focusInside(): Promise<boolean> {
    return this.root.evaluate((sheet) => sheet.contains(document.activeElement));
  }
}

/** 저장 전 얼굴. */
class RecordInput {
  private readonly root: Locator;

  constructor(root: Locator) {
    this.root = root;
  }

  /** 지금 눌러 둔 금액. `12,000원` 처럼 포맷된 문자열이다. */
  get amountText(): Locator {
    return this.root.getByTestId(TEST_IDS.recordAmount);
  }

  /** 다음에 무엇을 하면 되는지 알려 주는 한 줄. 저장 중에는 문구가 바뀐다. */
  get hint(): Locator {
    return this.root.getByTestId(TEST_IDS.recordHint);
  }

  /** 저장이 실패했을 때 뜨는 안내. */
  get notice(): Locator {
    return this.root.getByRole('alert');
  }

  get backspaceKey(): Locator {
    return this.root.getByRole('button', { name: '한 자리 지우기' });
  }

  /** 직전에 저장한 것과 같은 기록을 한 번에 만드는 칩. 저장 이력이 있어야 뜬다. */
  get repeatChip(): Locator {
    return this.root.getByRole('button', { name: /^한 번 더 · / });
  }

  /**
   * 카테고리를 불러오는 동안 도는 스피너.
   *
   * 오류 안내도 role=status 라 이름까지 봐야 둘이 갈린다.
   */
  get categoriesLoading(): Locator {
    return this.root.getByRole('status', { name: '불러오는 중이에요' });
  }

  get categoriesError(): Locator {
    return this.root.getByText('카테고리를 불러오지 못했어요');
  }

  /** 카테고리를 다시 불러오는 버튼. 오류 안내 안에만 있다. */
  get categoriesRetryButton(): Locator {
    return this.root.getByRole('button', { name: '다시 시도' });
  }

  categoryChip(name: string): Locator {
    return this.root.getByRole('button', { name, exact: true });
  }

  numberKey(key: string): Locator {
    return this.root.getByRole('button', { name: key, exact: true });
  }

  /**
   * 금액을 키패드로 찍는다.
   *
   * `fill` 로 우회하지 않는다. 실제로 누르지 않으면 앞자리 0 규칙 같은 것이 검증되지 않는다.
   * 몇 번을 눌렀는지는 `keyStrokesFor` 가 알려 준다.
   */
  async enterAmount(amount: number): Promise<void> {
    for (const key of keyStrokesFor(amount)) {
      await this.numberKey(key).click();
    }
  }

  /** 카테고리를 누르는 것이 곧 저장이다. 저장 버튼이 따로 없다. */
  async pickCategory(name: string): Promise<void> {
    await this.categoryChip(name).click();
  }
}

/** 저장 후 얼굴. */
class RecordFeedback {
  private readonly root: Locator;

  constructor(root: Locator) {
    this.root = root;
  }

  get savedLabel(): Locator {
    return this.root.getByText('저장했어요', { exact: true });
  }

  get headline(): Locator {
    return this.root.getByTestId(TEST_IDS.feedbackHeadline);
  }

  get detail(): Locator {
    return this.root.getByTestId(TEST_IDS.feedbackDetail);
  }

  /**
   * 피드백 카드 한 덩어리. 배지·한마디·둘째 줄이 이 안에 들어 있다.
   *
   * 배지('주의'·'예산 초과')에는 잡을 이름도 testid 도 없어서 카드 글로 확인한다.
   * 카테고리를 바꾸는 중이 아니면 시트 안에서 role=status 는 이 카드 하나다.
   */
  get card(): Locator {
    return this.root.getByRole('status');
  }

  get undoButton(): Locator {
    return this.root.getByRole('button', { name: '되돌리기' });
  }

  get confirmButton(): Locator {
    return this.root.getByRole('button', { name: '확인' });
  }

  get changeCategoryButton(): Locator {
    return this.root.getByRole('button', { name: '카테고리 바꾸기' });
  }

  /** 카테고리 바꾸기를 눌렀을 때 칩 위에 뜨는 제목. 접혀 있으면 없다. */
  get changeTitle(): Locator {
    return this.root.getByText('어디에 넣을까요?', { exact: true });
  }

  /**
   * 저장한 거래 한 줄의 제목. 분류를 바꾸면 여기가 새 카테고리 이름으로 바뀐다.
   *
   * 칩이 펼쳐져 있으면 같은 이름의 칩과 둘이 잡힌다. 칩을 접은 상태에서 쓴다.
   */
  rowTitle(name: string): Locator {
    return this.root.getByText(name, { exact: true });
  }

  /** 되돌리기가 만료됐을 때처럼, 눌렀지만 안 된 이유를 말하는 자리. */
  get notice(): Locator {
    return this.root.getByRole('alert');
  }

  categoryChip(name: string): Locator {
    return this.root.getByRole('button', { name, exact: true });
  }

  async waitSaved(): Promise<void> {
    await expect(this.savedLabel).toBeVisible();
  }

  async undo(): Promise<void> {
    await this.undoButton.click();
  }

  /**
   * 되돌리기 버튼 옆 배지가 말하는 남은 초.
   *
   * 배지는 `aria-hidden` 이라 접근성 이름에는 안 들어가고 버튼 글자 뒤에만 붙는다.
   * 창이 지나면 배지만 사라지므로 그때는 0 이고, 버튼 자체가 거둬졌으면 null 이다.
   */
  async undoSecondsLeft(): Promise<number | null> {
    if ((await this.undoButton.count()) === 0) return null;
    const digits = ((await this.undoButton.textContent()) ?? '').replace(/\D/g, '');
    return digits === '' ? 0 : Number(digits);
  }

  /** 저장한 뒤 분류를 고친다. 펼치기와 고르기가 한 동작이다. */
  async changeCategory(name: string): Promise<void> {
    await this.changeCategoryButton.click();
    await this.categoryChip(name).click();
  }
}

/**
 * 금액을 키패드 키 순서로 바꾼다.
 *
 * 키패드에 두 자리 키가 `00` 하나뿐이라 뒤에서부터 0 을 둘씩 묶는다.
 * 12000 이면 `1` `2` `00` `0` 네 번이다.
 */
/**
 * 줄글 얼굴.
 *
 * 적기 → 검토 → 저장 뒤가 같은 자리에서 갈린다. 셋을 한 객체로 들고
 * 무엇이 보이는지로 지금 어느 단계인지 가른다.
 */
class RecordNaturalLanguage {
  private readonly root: Locator;

  constructor(root: Locator) {
    // 안 보이는 탭도 hidden 으로 DOM 에 남는다. 패널 안으로 좁히지 않으면 캡처 탭의 후보 줄까지 잡힌다.
    this.root = root.getByTestId(TEST_IDS.nlPanel);
  }

  get textarea(): Locator {
    return this.root.getByLabel('무엇을 썼나요');
  }

  get analyzeButton(): Locator {
    return this.root.getByRole('button', { name: '분석' });
  }

  get rewriteButton(): Locator {
    return this.root.getByRole('button', { name: '다시 쓰기' });
  }

  /**
   * `3건 저장 · 25,500원`. 건수와 지출 합계가 버튼 이름에 그대로 있다.
   *
   * 고른 것에 지출이 없으면 금액 없이 `2건 저장` 이다. 수입을 지출과 더해 적으면
   * 쓴 돈처럼 읽히기 때문이다. 그래서 합계 부분까지 이름으로 잡지 않는다.
   */
  get saveButton(): Locator {
    return this.root.getByRole('button', { name: /^\d+건 저장/ });
  }

  get confirmButton(): Locator {
    return this.root.getByRole('button', { name: '확인' });
  }

  get notice(): Locator {
    return this.root.getByRole('alert');
  }

  /** 분석 응답을 기다리는 동안 도는 스피너. 이름으로 다른 로딩 자리와 갈린다. */
  get analyzing(): Locator {
    return this.root.getByRole('status', { name: '읽는 중이에요' });
  }

  /** 한 번에 읽는 상한을 넘겼을 때 몇 건이 빠졌는지 말하는 안내. */
  get truncatedNotice(): Locator {
    return this.root.getByText('한 번에 20건까지만 읽어요', { exact: false });
  }

  /** 분류 목록을 못 불러왔을 때 검토 화면에 뜨는 안내. 키패드 쪽 문구와 다르다. */
  get categoriesError(): Locator {
    return this.root.getByText('분류를 불러오지 못했어요');
  }

  /** 검토 단계에 들어섰다는 표시. 후보가 없어도 이 줄은 있다. */
  get readLine(): Locator {
    return this.root.getByText('이렇게 이해했어요', { exact: false });
  }

  /** 금액을 하나도 못 읽었을 때 뜨는 안내. */
  get emptyNotice(): Locator {
    return this.root.getByText('문장에서 금액을 찾지 못했어요', { exact: false });
  }

  /** 저장을 마친 뒤의 한 줄. `3건 저장했어요 · 25,500원` */
  get savedTitle(): Locator {
    return this.root.getByText(/건 저장했어요/);
  }

  get rows(): Locator {
    return this.root.getByTestId(TEST_IDS.nlCandidateRow);
  }

  /** 이름으로 잡는다. 상호가 비면 화면이 '이름 없음' 으로 그린다. */
  row(name: string): Locator {
    return this.rows.filter({ has: this.root.page().getByRole('checkbox', { name, exact: true }) });
  }

  checkbox(name: string): Locator {
    return this.root.getByRole('checkbox', { name, exact: true });
  }

  amount(name: string): Locator {
    return this.row(name).getByTestId(TEST_IDS.nlCandidateAmount);
  }

  day(name: string): Locator {
    return this.row(name).getByTestId(TEST_IDS.nlCandidateDate);
  }

  /** `이미 있어요`·`확인 필요` 같은 칩. 없으면 개수 0 이다. */
  chip(name: string, label: string): Locator {
    return this.row(name).getByText(label, { exact: true });
  }

  async analyze(text: string): Promise<void> {
    await this.textarea.fill(text);
    await this.analyzeButton.click();
    // 되돌리는 버튼으로 기다린다. 한 건도 못 읽으면 `이렇게 이해했어요` 가 안 뜬다.
    await expect(this.rewriteButton).toBeVisible();
  }

  async toggle(name: string, selected: boolean): Promise<void> {
    const box = this.checkbox(name);
    await box.click();
    await expect(box).toBeChecked({ checked: selected });
  }

  async openEdit(name: string): Promise<void> {
    await this.row(name).getByRole('button', { name: '고치기' }).click();
    await expect(this.root.getByRole('button', { name: '이대로 고치기' })).toBeVisible();
  }

  /** 펼쳐 둔 고치기 폼. 한 번에 하나만 열린다. */
  get form(): RecordNaturalLanguageForm {
    return new RecordNaturalLanguageForm(this.root);
  }

  async save(): Promise<void> {
    await this.saveButton.click();
    await expect(this.savedTitle).toBeVisible();
  }
}

/** 후보 한 줄을 고치는 폼. */
class RecordNaturalLanguageForm {
  private readonly root: Locator;

  constructor(root: Locator) {
    this.root = root;
  }

  get merchantField(): Locator {
    return this.root.getByLabel('상호');
  }

  get amountField(): Locator {
    return this.root.getByLabel('금액');
  }

  get dayField(): Locator {
    return this.root.getByLabel('날짜');
  }

  get doneButton(): Locator {
    return this.root.getByRole('button', { name: '이대로 고치기' });
  }

  typeTab(label: '지출' | '수입' | '이체' | '환불'): Locator {
    return this.root.getByRole('radiogroup', { name: '종류' }).getByRole('radio', { name: label });
  }

  categoryChip(name: string): Locator {
    return this.root.getByRole('group', { name: '분류' }).getByRole('button', { name });
  }

  async apply(): Promise<void> {
    await this.doneButton.click();
    await expect(this.doneButton).toHaveCount(0);
  }
}

export function keyStrokesFor(amount: number): string[] {
  const digits = String(Math.trunc(amount));
  const keys: string[] = [];

  let index = 0;
  while (index < digits.length) {
    // 앞자리에는 0 을 못 쓴다. 첫 키가 아닐 때만 `00` 으로 묶는다.
    if (index > 0 && digits.startsWith('00', index)) {
      keys.push('00');
      index += 2;
    } else {
      keys.push(digits[index]);
      index += 1;
    }
  }
  return keys;
}

/** 캡처와 영수증이 서로 다르게 가진 문구. 나머지는 같은 검토 화면이라 셀렉터가 하나다. */
interface ImageImportLabels {
  panelTestId: string;
  guide: string;
  /** 사진을 가져오는 버튼. 실패한 뒤에는 `다시 시도` 로 바뀐다. */
  pickButton: RegExp;
  analyzingLabel: string;
  emptyNotice: string;
  restartLabel: string;
  permissionTitle: string;
}

const CAPTURE_LABELS: ImageImportLabels = {
  panelTestId: TEST_IDS.capturePanel,
  guide: '거래내역 캡처를 골라주세요',
  pickButton: /^(캡처 고르기|다시 시도)$/,
  analyzingLabel: '캡처를 읽는 중이에요',
  emptyNotice: '캡처에서 거래를 찾지 못했어요',
  restartLabel: '다시 고르기',
  permissionTitle: '사진 접근이 꺼져 있어요',
};

const RECEIPT_LABELS: ImageImportLabels = {
  panelTestId: TEST_IDS.receiptPanel,
  guide: '영수증이 잘 보이게 찍어주세요',
  pickButton: /^(영수증 찍기|다시 시도)$/,
  analyzingLabel: '영수증을 읽는 중이에요',
  emptyNotice: '영수증을 읽지 못했어요',
  restartLabel: '다시 찍기',
  permissionTitle: '카메라 접근이 꺼져 있어요',
};

/**
 * 사진 한 장으로 적는 탭. 캡처(앨범)와 영수증(카메라)이 이 객체를 나눠 쓴다.
 *
 * 한 장을 가져오면 서버가 읽고, 그 뒤로는 줄글과 같은 검토 화면이다.
 * 그래서 후보 줄·저장 버튼 셀렉터가 줄글 것과 같고, 패널 안으로 좁혀야 서로 안 섞인다.
 * 두 탭이 갈리는 것은 문구뿐이라 클래스를 복사하지 않고 표만 바꿔 끼운다.
 */
class RecordImageImport {
  private readonly root: Locator;
  private readonly labels: ImageImportLabels;

  constructor(root: Locator, labels: ImageImportLabels) {
    this.root = root.getByTestId(labels.panelTestId);
    this.labels = labels;
  }

  get guide(): Locator {
    return this.root.getByText(this.labels.guide, { exact: false });
  }

  get pickButton(): Locator {
    return this.root.getByRole('button', { name: this.labels.pickButton });
  }

  /** 분석 응답을 기다리는 동안 도는 스피너. 탭마다 문구가 다르다. */
  get analyzing(): Locator {
    return this.root.getByRole('status', { name: this.labels.analyzingLabel });
  }

  /** 스텁이 지어낸 결과라는 안내. provider 가 붙으면 사라진다. */
  get stubNotice(): Locator {
    return this.root.getByText('아직 예시 결과예요', { exact: false });
  }

  /** 접근 권한이 꺼져 있을 때 뜨는 화면의 제목. 사진과 카메라가 다른 말이다. */
  get permissionDenied(): Locator {
    return this.root.getByText(this.labels.permissionTitle, { exact: true });
  }

  /** 앨범·카메라를 아예 열지 못했을 때의 한 줄. 권한 거부와 다른 자리다. */
  get pickAlert(): Locator {
    return this.root.getByRole('alert');
  }

  /** 한 건도 못 읽었을 때의 안내. */
  get emptyNotice(): Locator {
    return this.root.getByText(this.labels.emptyNotice, { exact: false });
  }

  /** 왜 못 읽었는지 짚어 주는 둘째 줄. 영수증에만 있다. */
  get emptyReason(): Locator {
    return this.root.getByText('사진이 어둡거나 구겨져 있으면', { exact: false });
  }

  /** 사진으로 안 될 때 손으로 적으러 가는 버튼. */
  get keypadFallbackButton(): Locator {
    return this.root.getByRole('button', { name: '키패드로 입력' });
  }

  /** 검토 단계에 들어섰다는 표시. 후보가 없어도 이 줄은 있다. */
  get readLine(): Locator {
    return this.root.getByText('이렇게 이해했어요', { exact: false });
  }

  get restartButton(): Locator {
    return this.root.getByRole('button', { name: this.labels.restartLabel });
  }

  get saveButton(): Locator {
    return this.root.getByRole('button', { name: /^\d+건 저장/ });
  }

  get confirmButton(): Locator {
    return this.root.getByRole('button', { name: '확인' });
  }

  /** 저장을 마친 뒤의 한 줄. `3건 저장했어요 · 44,100원` */
  get savedTitle(): Locator {
    return this.root.getByText(/건 저장했어요/);
  }

  get rows(): Locator {
    return this.root.getByTestId(TEST_IDS.nlCandidateRow);
  }

  /** 이름으로 잡는다. 상호가 비면 화면이 '이름 없음' 으로 그린다. */
  row(name: string): Locator {
    return this.rows.filter({ has: this.root.page().getByRole('checkbox', { name, exact: true }) });
  }

  checkbox(name: string): Locator {
    return this.root.getByRole('checkbox', { name, exact: true });
  }

  amount(name: string): Locator {
    return this.row(name).getByTestId(TEST_IDS.nlCandidateAmount);
  }

  day(name: string): Locator {
    return this.row(name).getByTestId(TEST_IDS.nlCandidateDate);
  }

  /** `이미 있어요`·`확인 필요` 같은 칩. 없으면 개수 0 이다. */
  chip(name: string, label: string): Locator {
    return this.row(name).getByText(label, { exact: true });
  }

  /** 사진을 가져와 검토 화면에 닿을 때까지. */
  async pick(): Promise<void> {
    await this.pickButton.click();
    // 되돌리는 버튼으로 기다린다. 한 건도 못 읽으면 `이렇게 이해했어요` 가 안 뜬다.
    await expect(this.restartButton).toBeVisible();
  }

  async toggle(name: string, selected: boolean): Promise<void> {
    const box = this.checkbox(name);
    await box.click();
    await expect(box).toBeChecked({ checked: selected });
  }

  async save(): Promise<void> {
    await this.saveButton.click();
    await expect(this.savedTitle).toBeVisible();
  }
}
