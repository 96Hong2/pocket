import { expect, type Locator, type Page } from '@playwright/test';

import { TEST_IDS } from '../../src/shared/testIds';
import { horizontalScrollersIn } from '../support/overflow';

/**
 * 읽어 온 것을 두고 나가려 할 때의 확인.
 *
 * 시트 안에 겹쳐 뜨지만 화면에 못 박혀 있어, 목록을 어디까지 내려 읽었든 같은 자리다.
 */
class LeaveConfirm {
  private readonly root: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('alertdialog', { name: '그만둘까요' });
  }

  get isVisible(): Promise<boolean> {
    return this.root.isVisible();
  }

  /** `읽어 온 3건이 사라져요. 그만둘까요?` 몇 건인지가 문구에 그대로 있다. */
  get text(): Locator {
    return this.root.getByText(/읽어 온 \d+건이 사라져요/);
  }

  /** 머무는 쪽. 기본으로 눌리기 쉬운 자리에 크게 있다. */
  get stayButton(): Locator {
    return this.root.getByRole('button', { name: '계속 고치기' });
  }

  get leaveButton(): Locator {
    return this.root.getByRole('button', { name: '그만두기' });
  }
}

/**
 * 아직 오지 않은 날에 저장하려 할 때 뜨는 확인.
 *
 * 기록 시트·수정 시트·검토 목록·목표 모으기가 **같은 창**을 쓴다. 자리마다 다른 모양으로
 * 물으면 한 화면에서 배운 것이 다음 화면에서 안 통한다.
 */
export class FutureDayConfirmArea {
  private readonly root: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('alertdialog', { name: '아직 오지 않은 날이에요' });
  }

  get dialog(): Locator {
    return this.root;
  }

  /** 그대로 넣는 쪽. 기본이 아니라 왼쪽 작은 버튼이다. */
  get saveButton(): Locator {
    return this.root.getByRole('button', { name: '이 날짜로 저장' });
  }

  /** 되돌리는 쪽. 오른쪽 큰 버튼이 기본이다. */
  get fixButton(): Locator {
    return this.root.getByRole('button', { name: '날짜 고치기' });
  }
}

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
  /** 저장 후. 피드백 한마디와, 저장한 줄을 눌러 금액·분류 고치기. */
  readonly feedback: RecordFeedback;
  /** 줄글 탭. 적기·검토·저장이 한 자리에서 이어진다. */
  readonly nl: RecordNaturalLanguage;
  /** 캡처 탭. 앨범에서 한 장 골라 읽고, 그 뒤로는 줄글과 같은 검토 화면이다. */
  readonly capture: RecordImageImport;
  /** 영수증 탭. 카메라로 찍는 것만 다르고 그 뒤는 캡처와 같다. */
  readonly receipt: RecordImageImport;
  /** 앞날에 저장하려 할 때 뜨는 확인. 시트 위에 겹친다. */
  readonly futureDayConfirm: FutureDayConfirmArea;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByRole('dialog', { name: '10초 기록' });
    this.input = new RecordInput(this.root);
    this.feedback = new RecordFeedback(this.root);
    this.nl = new RecordNaturalLanguage(this.root);
    this.capture = new RecordImageImport(this.root, CAPTURE_LABELS);
    this.receipt = new RecordImageImport(this.root, RECEIPT_LABELS);
    this.leave = new LeaveConfirm(page);
    this.futureDayConfirm = new FutureDayConfirmArea(page);
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

  /**
   * 시트 맨 위 손잡이. **X 버튼은 없다.**
   *
   * 손잡이가 곧 닫기다. 눌러도 닫히고 아래로 밀어도 닫힌다.
   * 딤·Esc·시스템 뒤로가기도 같은 결과다. 닫을 수 없을 때는 이 버튼 자체가 없다.
   */
  get closeButton(): Locator {
    return this.root.getByRole('button', { name: '닫기' });
  }

  /**
   * 읽어 온 것을 두고 나가려 할 때 뜨는 확인.
   *
   * 손잡이·딤·Esc·시스템 뒤로가기가 모두 이 확인을 지난다. 실기기에서 손잡이를 잘못 눌러
   * 읽어 온 것이 통째로 날아가는 일이 있었다.
   */
  readonly leave: LeaveConfirm;

  /** 손잡이를 잡고 아래로 민다. 실기기에서 시트를 닫는 가장 흔한 손짓이다. */
  async dragDown(distance = 160): Promise<void> {
    const box = await this.closeButton.boundingBox();
    if (box == null) throw new Error('손잡이를 찾지 못했다');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await this.page.mouse.move(x, y);
    await this.page.mouse.down();
    // 한 번에 옮기면 브라우저가 중간 좌표를 안 만들어 SLOP 판정을 못 지난다.
    for (let step = 1; step <= 6; step += 1) {
      await this.page.mouse.move(x, y + (distance * step) / 6);
    }
    await this.page.mouse.up();
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

  /** 시트 안에서 가로로 구르는 자리. 판정은 support/overflow.ts 한 곳이 한다. */
  async horizontalScrollers(): Promise<string[]> {
    return horizontalScrollersIn(this.root);
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

  /**
   * 적을 날이 적힌 작은 알약. `오늘`·`어제`·`9월 5일`.
   *
   * **늘 서 있다.** 예전에는 오늘일 때 아무 말도 안 하고 지난 날일 때만 한 줄이 섰는데,
   * 그러면 날짜를 바꿀 수 있다는 것을 지난 날에 들어온 사람만 알게 된다.
   */
  get dayChip(): Locator {
    return this.root.locator('.record__day-chip');
  }

  /**
   * 적을 날을 고르는 칸. 지난 날 것을 찾아가지 않고 여기서 바로 바꾼다.
   *
   * 알약 위에 투명하게 겹쳐 둔 날짜 칸이다. 눈에는 알약만 보이고 누르는 것은 이쪽이다.
   */
  get dayField(): Locator {
    return this.root.getByLabel('날짜');
  }

  /**
   * 방식 알약이 왜 잠겼는지 말하는 한 줄. 알약 **바로 아래**에 선다.
   *
   * 잠긴 버튼은 초점을 못 받아, 읽는 프로그램에는 이 줄이 이유에 닿는 유일한 길이다.
   */
  get dayLockNotice(): Locator {
    return this.root.getByText('오늘이 아닌 날은 키패드로만 적어요', { exact: true });
  }

  /** 저장이 실패했을 때 뜨는 안내. */
  get notice(): Locator {
    return this.root.getByRole('alert');
  }

  get backspaceKey(): Locator {
    return this.root.getByRole('button', { name: '한 자리 지우기' });
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

  /**
   * 지출인지 수입인지 고르는 알약 두 개.
   *
   * 방법 탭과 달리 `role="radio"` 가 아니라 aria-pressed 를 쓰는 버튼이다.
   * 탭과 같은 모양으로 그리면 탭이 두 줄인 것처럼 읽혀 일부러 다르게 뒀다.
   */
  get kindToggle(): Locator {
    return this.root.getByRole('group', { name: '지출인지 수입인지' });
  }

  kindButton(label: '지출' | '수입'): Locator {
    return this.kindToggle.getByRole('button', { name: label, exact: true });
  }

  async pickKind(label: '지출' | '수입'): Promise<void> {
    await this.kindButton(label).click();
  }

  /**
   * '한 번 더' 칩. **이제 없다.**
   *
   * 직전 기록을 한 번에 다시 만드는 칩이었다. 같은 금액을 또 쓰는 일보다, 적는 화면에
   * 칩이 하나 더 서서 무엇을 눌러야 하는지 헷갈리는 값이 컸다. 없다는 것을 지키는 자리다.
   */
  get repeatChip(): Locator {
    return this.root.getByRole('button', { name: /^한 번 더/ });
  }

  /**
   * 결제 수단 자리. **여기에는 없어야 한다.**
   *
   * 무엇으로 냈는지는 저장이 끝난 화면에서 묻는다. 적는 화면에 칸이 하나 더 서면
   * 10초 약속이 깨진다. 없다는 것을 단언하려고 자리만 남겨 둔다.
   */
  get paymentGroup(): Locator {
    return this.root.getByRole('group', { name: '결제 수단' });
  }

  categoryChip(name: string): Locator {
    return this.root.getByRole('button', { name, exact: true });
  }

  /**
   * 앞자리에 안 선 분류를 펼치는 칩.
   *
   * 앞자리는 열한 개까지다(`QUICK_LIMIT`). 그보다 많거나 꺼 둔 것이 있으면 여기 뒤로 간다.
   * **뒤에 아무것도 없으면 이 칩 자체가 없다.** 그 자리에 「새 분류」가 바로 선다.
   */
  get moreCategoriesButton(): Locator {
    return this.root.getByRole('button', { name: '더 보기', exact: true });
  }

  /** 「더 보기」를 편 뒤 다시 접는 버튼. */
  get foldCategoriesButton(): Locator {
    return this.root.getByRole('button', { name: '접기', exact: true });
  }

  /** 카테고리 관리가 있다는 것을 알려 주는 한 줄. 「더 보기」 안에만 있다. */
  get categorySettingsNote(): Locator {
    return this.root.getByText(/카테고리 관리에서 순서를 바꾸고/);
  }

  /** 그 줄 앞머리. 누르면 카테고리 관리로 간다. 잃을 것이 있으면 먼저 묻는다. */
  get categoryManageLink(): Locator {
    return this.root.getByRole('button', { name: '관리 › 카테고리 관리' });
  }

  /**
   * 분류를 여기서 바로 만든다. 관리 탭까지 가지 않는다.
   *
   * 숨긴 분류가 있으면 「더 보기」 안이고, 없으면 「더 보기」 자리에 이것이 바로 선다.
   */
  get newCategoryButton(): Locator {
    return this.root.getByRole('button', { name: '새 분류', exact: true });
  }

  /** 「더 보기」를 펴고 만들기를 연다. 두 번 누르는 것이 한 동작이다. */
  async openNewCategory(): Promise<void> {
    if ((await this.newCategoryButton.count()) === 0) {
      await this.moreCategoriesButton.click();
    }
    await this.newCategoryButton.click();
  }

  /** 「새 분류」를 누르면 칩 자리에 펼쳐지는 만들기 폼. 시트를 더 띄우지 않는다. */
  get newCategoryForm(): RecordNewCategory {
    return new RecordNewCategory(this.root);
  }

  /**
   * 칩에 적힌 이름을 위에서 아래로 읽는다.
   *
   * 칩 순서는 서버가 준 목록 순서 그대로다. 내가 만든 분류가 어느 자리에 앉는지를
   * 화면으로 볼 수 있는 곳이 여기뿐이라, 순서를 지키려면 이 값을 봐야 한다.
   * 관리 화면 목록은 기본과 내 것을 구획으로 갈라 그려서, 서버 순서가 뒤집혀도 거기서는 안 드러난다.
   */
  async categoryChipNames(): Promise<string[]> {
    // 「더 보기」·「새 분류」는 분류가 아니다. 순서를 세는 자리에 섞이면 안 된다.
    const names = await this.root
      .locator('.cat-chips__item:not(.cat-chips__item--more):not(.cat-chips__item--new)')
      .locator('.cat-chips__name')
      .allTextContents();
    return names.map((name) => name.trim());
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

  /**
   * 금액이 이미 있으면 카테고리를 누르는 것이 곧 저장이다.
   *
   * 앞자리는 열한 개까지라, 찾는 분류가 안 보이면 「더 보기」를 한 번 편다.
   */
  async pickCategory(name: string): Promise<void> {
    if ((await this.categoryChip(name).count()) === 0) {
      await this.moreCategoriesButton.click();
    }
    await this.categoryChip(name).click();
  }

  /** 금액보다 먼저 고른 뒤 접혀 있는 한 줄. 누르면 목록이 다시 펴진다. */
  get pickedCategory(): Locator {
    return this.root.getByRole('button', { name: /다시 고르기$/ });
  }

  /** 카테고리를 먼저 고른 다음에만 나오는 저장 버튼. */
  get saveButton(): Locator {
    return this.root.getByRole('button', { name: '저장', exact: true });
  }
}

/** 저장 후 얼굴. */
/**
 * 기록 시트 안의 분류 만들기 자리.
 *
 * 시트가 하나 더 뜨는 것이 아니라 칩 자리가 바뀌는 것이다. 그래야 적던 금액이 살아 있다.
 */
class RecordNewCategory {
  private readonly root: Locator;

  constructor(root: Locator) {
    this.root = root;
  }

  get title(): Locator {
    return this.root.getByText('새 분류 만들기', { exact: true });
  }

  get nameField(): Locator {
    return this.root.getByLabel('이름', { exact: true });
  }

  get saveButton(): Locator {
    return this.root.getByRole('button', { name: '새 카테고리 저장', exact: true });
  }

  /** 만들지 않고 그만둔다. 돌아갈 길이 화면에 적혀 있어야 한다. */
  get backButton(): Locator {
    return this.root.getByRole('button', { name: '기록으로 돌아가기', exact: true });
  }

  /** 종류는 위에서 이미 골랐다. 여기서 다시 묻지 않는다. */
  get kindToggle(): Locator {
    return this.root.getByRole('group', { name: '분류의 종류' });
  }

  async create(name: string, iconLabel: string): Promise<void> {
    await this.nameField.fill(name);
    await this.root
      .getByRole('group', { name: '아이콘' })
      .getByRole('button', { name: iconLabel, exact: true })
      .click();
    await this.saveButton.click();
  }
}

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

  /**
   * 없앤 것들. **자리가 비었는지 보려고만 둔다.**
   *
   * 되돌리기는 서버에서 삭제와 하는 일이 같은데 이름만 달라 걷어냈고,
   * 「금액 바꾸기」·「카테고리 바꾸기」 버튼은 저장한 줄 자체로 옮겼다.
   * 옛 버튼은 이름이 딱 그것뿐이라, 줄로 옮긴 새 버튼(「식비 · 카테고리 바꾸기」)과 갈린다.
   */
  get undoButton(): Locator {
    return this.root.getByRole('button', { name: '되돌리기' });
  }

  get legacyChangeButtons(): Locator {
    return this.root.getByRole('button', { name: /^(금액|카테고리) 바꾸기$/ });
  }

  /** 저장한 줄을 눌러 고칠 수 있다는 안내. 되돌리기가 있던 자리다. */
  get editHint(): Locator {
    return this.root.getByText('눌러서 고칠 수 있어요', { exact: true });
  }

  get confirmButton(): Locator {
    return this.root.getByRole('button', { name: '확인' });
  }

  /**
   * 저장한 줄의 왼쪽. 누르면 분류를 고친다.
   *
   * 예전에는 줄 아래 「카테고리 바꾸기」 버튼이 따로 있었다. 고칠 것을 직접 누르게
   * 바꾸면서 버튼 둘이 사라졌고, 줄이 좌우 두 버튼으로 갈렸다.
   */
  get changeCategoryButton(): Locator {
    return this.root.getByRole('button', { name: /카테고리 바꾸기$/ });
  }

  /** 저장한 줄의 오른쪽 금액. 누르면 키패드가 펴진다. */
  get changeAmountButton(): Locator {
    return this.root.getByRole('button', { name: /금액 바꾸기$/ });
  }

  /** 금액 바꾸기를 눌렀을 때 키패드 위에 뜨는 제목. 접혀 있으면 없다. */
  get changeAmountTitle(): Locator {
    return this.root.getByText('얼마로 고칠까요?', { exact: true });
  }

  /** 고치는 중인 금액. 저장 전 키패드와 같은 자리를 쓴다. */
  get amountText(): Locator {
    return this.root.getByTestId(TEST_IDS.recordAmount);
  }

  /** 눌러 둔 금액으로 실제로 고치는 버튼. 0 원이면 눌리지 않는다. */
  get applyAmountButton(): Locator {
    return this.root.getByRole('button', { name: '이 금액으로 고치기' });
  }

  /** 내용을 적는 칸. 버튼 뒤에 숨지 않고 저장 직후부터 늘 떠 있다. */
  get merchantField(): Locator {
    return this.root.getByTestId(TEST_IDS.feedbackMerchantField);
  }

  /**
   * 내용을 적고 칸에서 빠져나온다.
   *
   * 저장 버튼이 따로 없다. 칸을 벗어날 때 보내므로 blur 까지 해야 실제로 저장된다.
   */
  async writeMerchant(name: string): Promise<void> {
    await this.merchantField.fill(name);
    await this.merchantField.blur();
  }

  /** 상호와 **다른 칸**이다. 「어디서」 가 아니라 「무엇을·왜」 를 적는다. */
  get memoField(): Locator {
    return this.root.getByTestId(TEST_IDS.feedbackMemoField);
  }

  /** 상호와 같은 규칙이다. 칸을 벗어날 때 보낸다. */
  async writeMemo(text: string): Promise<void> {
    await this.memoField.fill(text);
    await this.memoField.blur();
  }

  /** 태그 칩 하나. 눌린 것을 다시 누르면 떨어진다. */
  tagChip(name: string): Locator {
    return this.root.getByRole('button', { name, exact: true });
  }

  /**
   * 태그 라벨 옆의 작은 글씨. **태그가 있든 없든 늘 보인다.**
   *
   * 예전에는 하나도 없을 때만 보여 줬는데, 하나라도 만든 사람은 두 번째를 만들러 갈
   * 자리를 못 찾았다.
   */
  get tagManageLink(): Locator {
    return this.root.getByRole('link', { name: '관리 › 태그에서 설정', exact: true });
  }

  get backspaceKey(): Locator {
    return this.root.getByRole('button', { name: '한 자리 지우기' });
  }

  numberKey(key: string): Locator {
    return this.root.getByRole('button', { name: key, exact: true });
  }

  /**
   * 저장한 거래 한 줄의 금액. 금액을 고치면 여기가 새 값으로 바뀐다.
   *
   * 이 자리에는 접근성 이름이 없고, 줄을 그리는 것은 여러 화면이 함께 쓰는 컴포넌트라
   * 이 화면만 보고 testid 를 붙일 수 없다. 그려진 클래스로 잡는다.
   */
  get savedAmount(): Locator {
    return this.root.locator('.pk-tx__amount');
  }

  /**
   * 저장한 거래 한 줄의 그림.
   *
   * 분류에 이모지를 걸어 뒀으면 그 글자가, 사진을 걸어 뒀으면 `<img>` 가 여기 온다.
   * **목록·칩은 맞는데 이 줄만 기본 그림으로 나온 적이 있다.** 그려 주는 컴포넌트는
   * 같은데 넘기는 값이 한 자리만 달랐다. 이름이 없는 그림이라 클래스로 잡는다.
   */
  get savedRowAvatar(): Locator {
    return this.root.locator('.pk-tx .pk-avatar');
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

  /** 눌렀지만 안 된 이유를 말하는 자리. */
  get notice(): Locator {
    return this.root.getByRole('alert');
  }

  categoryChip(name: string): Locator {
    return this.root.getByRole('button', { name, exact: true });
  }

  /**
   * 무엇으로 냈나. **저장이 끝난 뒤에 묻는다.**
   *
   * 적는 화면에는 이 칸이 없다. 지난번 값으로 조용히 저장하고 여기서 보여 준다.
   * 안 골라도 되는 값이라 `aria-pressed` 로 눌린 것을 가른다.
   */
  get paymentGroup(): Locator {
    return this.root.getByRole('group', { name: '결제 수단' });
  }

  paymentButton(label: '신용카드' | '체크카드' | '현금'): Locator {
    return this.paymentGroup.getByRole('button', { name: label, exact: true });
  }

  async pickPayment(label: '신용카드' | '체크카드' | '현금'): Promise<void> {
    await this.paymentButton(label).click();
  }

  /** 앞자리에 안 선 분류를 펼치는 칩. 「카테고리 바꾸기」 를 편 뒤에만 있다. */
  get moreCategoriesButton(): Locator {
    return this.root.getByRole('button', { name: '더 보기', exact: true });
  }

  async waitSaved(): Promise<void> {
    await expect(this.savedLabel).toBeVisible();
  }

  /**
   * 저장한 뒤 분류를 고친다. 펼치기와 고르기가 한 동작이다.
   *
   * 앞자리는 열한 개까지라, 찾는 분류가 안 보이면 「더 보기」를 한 번 편다.
   */
  async changeCategory(name: string): Promise<void> {
    await this.changeCategoryButton.click();
    if ((await this.categoryChip(name).count()) === 0) {
      await this.moreCategoriesButton.click();
    }
    await this.categoryChip(name).click();
  }

  /**
   * 눌러 둔 금액을 지운다.
   *
   * 자릿수를 미리 알 수 없어 화면에 찍힌 숫자만큼 지우기를 누른다.
   * 빈 상태도 `0원` 으로 그려져 한 번은 헛눌리지만, 지워진 뒤 더 눌러도 값은 그대로다.
   */
  async clearAmount(): Promise<void> {
    const shown = (await this.amountText.textContent()) ?? '';
    const digits = shown.replace(/\D/g, '').length;
    for (let step = 0; step < digits; step += 1) await this.backspaceKey.click();
  }

  /** 펼쳐 둔 키패드에서 금액을 다시 누른다. 지우고 처음부터 찍는다. */
  async enterAmount(amount: number): Promise<void> {
    await this.clearAmount();
    for (const key of keyStrokesFor(amount)) await this.numberKey(key).click();
  }

  /**
   * 저장한 줄의 제목 칸. 줄 안에서만 찾는다.
   *
   * `rowTitle` 은 시트 전체에서 글자를 찾는다. 감춘 키패드 탭은 트리에 그대로 남아 있고
   * 거기 분류 칩이 같은 이름을 달고 있어, 옮겨 간 분류 이름으로 찾으면 둘이 잡힌다.
   * 금액 자리와 같은 이유로 이름이 없는 칸이라 그려진 클래스로 잡는다.
   */
  get savedRowTitle(): Locator {
    return this.root.locator('.pk-tx .pk-tx__title');
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

  /** 칸 아래 한 줄. 상한에 닿으면 문구가 바뀐다. */
  get hint(): Locator {
    return this.root.getByText(/여러 건을 적어도 돼요|자까지 읽어요/);
  }

  /**
   * 한 건도 못 읽었을 때만 서는 되돌리기.
   *
   * 읽어 온 것이 있는 화면에는 이 버튼이 없다. 고칠 것을 눈앞에 두고 「다시 쓰기」가
   * 있으면, 닫고 싶은 사람이 그것을 눌러 읽어 온 것을 통째로 버린다.
   */
  get rewriteButton(): Locator {
    return this.root.getByRole('button', { name: '다시 쓰기' });
  }

  /** 읽어 온 것을 버리고 시트를 닫는다. 검토 목록이 있을 때 서는 버튼이다. */
  get cancelButton(): Locator {
    return this.root.getByRole('button', { name: '취소', exact: true });
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

  /**
   * 앞날 날짜로 읽힌 줄에만 붙는 확인 안내.
   *
   * 가계부는 이미 쓴 돈을 적는 곳이라 앞날은 거의 다 잘못 읽은 것이다.
   * 막지는 않고 눈에 띄게만 해 둔다. 없는 것이 정상이라 개수로 본다.
   */
  get futureNotices(): Locator {
    return this.root.getByTestId(TEST_IDS.nlCandidateFuture);
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

  /** 이름으로 잡는다. 상호가 비면 화면이 분류 이름으로, 분류도 없으면 '기록' 으로 그린다. */
  row(name: string): Locator {
    return this.rows.filter({ has: this.root.page().getByRole('checkbox', { name, exact: true }) });
  }

  checkbox(name: string): Locator {
    return this.root.getByRole('checkbox', { name, exact: true });
  }

  amount(name: string): Locator {
    return this.row(name).getByTestId(TEST_IDS.nlCandidateAmount);
  }

  /** 후보 줄 금액의 글자색. 수입과 지출이 색으로 갈리는지 본다. */
  async amountColor(name: string): Promise<string> {
    return this.amount(name).evaluate((el) => getComputedStyle(el).color);
  }

  day(name: string): Locator {
    return this.row(name).getByTestId(TEST_IDS.nlCandidateDate);
  }

  /** `이미 있어요`·`확인 필요` 같은 칩. 없으면 개수 0 이다. */
  chip(name: string, label: string): Locator {
    return this.row(name).getByText(label, { exact: true });
  }

  /**
   * 줄 위에 드러난 종류. 누르면 지출과 수입을 오간다.
   *
   * 접근성 이름이 `지출이에요. 눌러서 수입으로 바꾸기` 라, 그 안내말로 잡는다.
   * 줄 전체도 「눌러서 고치기」 라는 이름을 달고 있어, 끝말까지 보고 가른다.
   * 이체 줄은 버튼이 아니라 글자라 여기 안 걸린다.
   */
  kindButton(name: string): Locator {
    return this.row(name).getByRole('button', { name: /눌러서 .+으로 바꾸기$/ });
  }

  async switchKind(name: string): Promise<void> {
    await this.kindButton(name).click();
  }

  /**
   * 환불로 읽힌 줄의 안내와 그 자리에 있는 한 번 누르기.
   *
   * 되돌릴 지출을 못 고르는 동안에는 저장할 수 없는 줄이라, 왜 못 켜는지와 무엇을 하면
   * 되는지가 줄 안에 함께 있어야 한다.
   */
  refundNotice(name: string): Locator {
    return this.row(name).getByText('환불로 읽었어요', { exact: false });
  }

  refundToIncome(name: string): Locator {
    return this.row(name).getByRole('button', { name: '수입으로 바꾸기' });
  }

  /**
   * 여러 줄의 분류를 한꺼번에 바꾸는 칩. **줄글에는 없다.**
   *
   * 문장은 한 번에 한두 건이라 줄마다 고치는 편이 빠르다. 없다는 것을 단언하는 자리다.
   */
  get bulkCategoryButton(): Locator {
    return this.root.getByRole('button', { name: '카테고리 한 번에 바꾸기', exact: true });
  }

  async analyze(text: string): Promise<void> {
    await this.textarea.fill(text);
    await this.analyzeButton.click();
    /*
      아래 버튼 줄로 기다린다. 한 건도 못 읽으면 `이렇게 이해했어요` 가 안 뜨고,
      그때는 다시 쓰기가, 읽어 온 것이 있으면 취소가 선다. 둘 중 하나는 늘 있다.
    */
    await expect(this.rewriteButton.or(this.cancelButton)).toBeVisible();
  }

  async toggle(name: string, selected: boolean): Promise<void> {
    const box = this.checkbox(name);
    await box.click();
    await expect(box).toBeChecked({ checked: selected });
  }

  /** 줄을 통째로 누르면 고치기가 펼쳐진다. 예전의 작은 「고치기」 버튼은 없앴다. */
  editTrigger(name: string): Locator {
    return this.row(name).getByRole('button', { name: /눌러서 고치기$/ });
  }

  async openEdit(name: string): Promise<void> {
    await this.editTrigger(name).click();
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

  get categoryGroup(): Locator {
    return this.root.getByRole('group', { name: '분류' });
  }

  categoryChip(name: string): Locator {
    return this.categoryGroup.getByRole('button', { name });
  }

  /** 앞자리에 안 선 분류를 펼치는 칩. 기록 시트와 같은 규칙이다. */
  get moreCategoriesButton(): Locator {
    return this.categoryGroup.getByRole('button', { name: '더 보기', exact: true });
  }

  /**
   * 검토 화면에서도 그 자리에서 분류를 만든다.
   *
   * 숨긴 분류가 있으면 「더 보기」 안이고, 없으면 「더 보기」 자리에 이것이 바로 선다.
   */
  get newCategoryButton(): Locator {
    return this.categoryGroup.getByRole('button', { name: '새 분류', exact: true });
  }

  /** 숨긴 분류가 있으면 한 번 펼치고 만들기를 연다. 기록 시트와 같은 규칙이다. */
  async openNewCategory(): Promise<void> {
    if ((await this.newCategoryButton.count()) === 0) {
      await this.moreCategoriesButton.click();
    }
    await this.newCategoryButton.click();
  }

  /** 앞자리에 없으면 한 번 펼치고 고른다. */
  async pickCategory(name: string): Promise<void> {
    if ((await this.categoryChip(name).count()) === 0) {
      await this.moreCategoriesButton.click();
    }
    await this.categoryChip(name).click();
  }

  /**
   * 무엇으로 냈나. **지출일 때만 선다.**
   *
   * 영수증에 「신용」 이 찍혀 있으면 이미 채워져 있고, 못 읽었으면 여기서 고른다.
   * 안 골라도 되는 값이라 `aria-pressed` 로 눌린 것을 가른다.
   */
  get paymentGroup(): Locator {
    return this.root.getByRole('group', { name: '결제 수단' });
  }

  paymentButton(label: '신용카드' | '체크카드' | '현금'): Locator {
    return this.paymentGroup.getByRole('button', { name: label, exact: true });
  }

  async pickPayment(label: '신용카드' | '체크카드' | '현금'): Promise<void> {
    await this.paymentButton(label).click();
  }

  async apply(): Promise<void> {
    await this.doneButton.click();
    await expect(this.doneButton).toHaveCount(0);
  }

  /**
   * 「새 분류」를 누르면 분류 칸 자리에 펼쳐지는 만들기 폼의 제목.
   *
   * 시트를 하나 더 띄우지 않고 그 자리가 바뀐다. 적어 둔 상호·금액·날짜가 살아 있는지
   * 보려면 이 폼이 열렸다 닫힌 것을 가려야 한다.
   */
  get newCategoryTitle(): Locator {
    return this.root.getByText('새 분류 만들기', { exact: true });
  }

  /** 만들지 않고 고치던 줄로 돌아간다. 기록 시트와 돌아갈 곳이 달라 말도 다르다. */
  get newCategoryBackButton(): Locator {
    return this.root.getByRole('button', { name: '고치기로 돌아가기', exact: true });
  }

  /** 이름과 그림을 정해 분류를 만든다. 종류는 위 칸이 이미 정했다. */
  async createCategory(name: string, iconLabel: string): Promise<void> {
    await this.root.getByLabel('이름', { exact: true }).fill(name);
    await this.root
      .getByRole('group', { name: '아이콘' })
      .getByRole('button', { name: iconLabel, exact: true })
      .click();
    // 아이콘을 고르면 격자가 접힌다. 그래야 그 아래 저장 버튼이 화면에 들어온다.
    await this.root.getByRole('button', { name: '새 카테고리 저장', exact: true }).click();
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
  /** 진행 표시의 첫 문구. 1~2초 뒤 다음 단계로 넘어간다. */
  analyzingLabel: string;
  emptyNotice: string;
  restartLabel: string;
  permissionTitle: string;
}

const CAPTURE_LABELS: ImageImportLabels = {
  panelTestId: TEST_IDS.capturePanel,
  guide: '거래내역 캡처를 골라주세요',
  pickButton: /^(캡처 고르기|다시 시도)$/,
  analyzingLabel: '캡처를 준비하고 있어요',
  emptyNotice: '캡처에서 거래를 찾지 못했어요',
  restartLabel: '다시 고르기',
  permissionTitle: '사진 접근이 꺼져 있어요',
};

const RECEIPT_LABELS: ImageImportLabels = {
  panelTestId: TEST_IDS.receiptPanel,
  guide: '영수증이 잘 보이게 찍어주세요',
  pickButton: /^(영수증 찍기|다시 시도)$/,
  analyzingLabel: '영수증을 준비하고 있어요',
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

  /**
   * 버튼 아래 한 줄. **오늘 무료분을 이미 쓴 사람에게만** 뜬다.
   *
   * 아직 안 쓴 사람에게는 「무료」 도 「광고」 도 꺼내지 않는다. 10초 안에 한 건 적으러
   * 온 사람 앞에 셈이라는 새 개념을 먼저 세울 이유가 없다.
   */
  get creditLine(): Locator {
    return this.root.getByText(/오늘 무료 \d+장을 다 썼어요/);
  }

  /**
   * 사진을 고른 뒤, 광고가 뜨기 **바로 전에** 서는 확인 창.
   *
   * 2026-09-23 반려 사유가 「유저가 예상하기 어려운 시점에 광고가 노출돼요」 였다.
   * 버튼 곁에 적어 두는 것만으로는 안 읽고 누른 사람에게 아무 예고도 아니었다.
   */
  get adConsent(): Locator {
    // 창은 화면에 못 박혀 떠서 이 패널 밖이다. 페이지 전체에서 잡는다.
    return this.root.page().getByRole('alertdialog', { name: '광고가 한 번 나와요' });
  }

  /** 「광고 보고 읽기」. 이 버튼을 누른 것이 곧 광고를 보겠다는 뜻이다. */
  get adConsentConfirm(): Locator {
    return this.adConsent.getByRole('button', { name: '광고 보고 읽기' });
  }

  /** 「닫기」. 아무 일도 일어나지 않는다. */
  get adConsentCancel(): Locator {
    return this.adConsent.getByRole('button', { name: '닫기' });
  }

  /**
   * 분석 응답을 기다리는 동안의 진행 표시.
   *
   * 예전에는 스피너 하나였다. 12초 안팎이 걸리는데 아무 변화가 없어 멈춘 줄 알고 나가는
   * 사람이 있어서, 지금 무엇을 하는 중인지 적는 한 줄과 막대로 바꿨다. 문구는 시간이
   * 지나며 바뀌므로 첫 문구로 잡는다.
   */
  get analyzing(): Locator {
    return this.root.getByTestId(TEST_IDS.parseProgress);
  }

  /** 지금 무엇을 하는 중인지 적는 한 줄. 시간이 지나며 바뀐다. */
  get progressLabel(): Locator {
    return this.analyzing.getByRole('status');
  }

  /** 차오르는 막대. 응답 전에는 끝까지 차지 않는다. */
  get progressBar(): Locator {
    return this.root.getByTestId(TEST_IDS.parseProgressBar);
  }

  /** 막대가 지금 얼마나 찼나. 0 과 1 사이. */
  async progressRatio(): Promise<number> {
    return this.progressBar.evaluate((element) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      return matrix.a;
    });
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

  /** 한 건도 못 읽었을 때만 서는 되돌리기. 읽어 온 것이 있으면 대신 「취소」가 선다. */
  get restartButton(): Locator {
    return this.root.getByRole('button', { name: this.labels.restartLabel });
  }

  /** 읽어 온 것을 버리고 시트를 닫는다. 검토 목록이 있을 때 서는 버튼이다. */
  get cancelButton(): Locator {
    return this.root.getByRole('button', { name: '취소', exact: true });
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

  /** 이름으로 잡는다. 상호가 비면 화면이 분류 이름으로, 분류도 없으면 '기록' 으로 그린다. */
  row(name: string): Locator {
    return this.rows.filter({ has: this.root.page().getByRole('checkbox', { name, exact: true }) });
  }

  checkbox(name: string): Locator {
    return this.root.getByRole('checkbox', { name, exact: true });
  }

  amount(name: string): Locator {
    return this.row(name).getByTestId(TEST_IDS.nlCandidateAmount);
  }

  /** 후보 줄 금액의 글자색. 수입과 지출이 색으로 갈리는지 본다. */
  async amountColor(name: string): Promise<string> {
    return this.amount(name).evaluate((el) => getComputedStyle(el).color);
  }

  day(name: string): Locator {
    return this.row(name).getByTestId(TEST_IDS.nlCandidateDate);
  }

  /**
   * 줄을 통째로 누르면 고치기가 펼쳐진다. 검토 화면은 줄글과 같은 컴포넌트라 모양도 같다.
   */
  editTrigger(name: string): Locator {
    return this.row(name).getByRole('button', { name: /눌러서 고치기$/ });
  }

  async openEdit(name: string): Promise<void> {
    await this.editTrigger(name).click();
    await expect(this.root.getByRole('button', { name: '이대로 고치기' })).toBeVisible();
  }

  /** 펼쳐 둔 고치기 폼. 한 번에 하나만 열린다. */
  get form(): RecordNaturalLanguageForm {
    return new RecordNaturalLanguageForm(this.root);
  }

  /** `이미 있어요`·`확인 필요` 같은 칩. 없으면 개수 0 이다. */
  chip(name: string, label: string): Locator {
    return this.row(name).getByText(label, { exact: true });
  }

  /**
   * 줄 위에 드러난 종류. 누르면 지출과 수입을 오간다.
   *
   * 접근성 이름이 `지출이에요. 눌러서 수입으로 바꾸기` 라, 그 안내말로 잡는다.
   * 줄 전체도 「눌러서 고치기」 라는 이름을 달고 있어, 끝말까지 보고 가른다.
   * 이체 줄은 버튼이 아니라 글자라 여기 안 걸린다.
   */
  kindButton(name: string): Locator {
    return this.row(name).getByRole('button', { name: /눌러서 .+으로 바꾸기$/ });
  }

  async switchKind(name: string): Promise<void> {
    await this.kindButton(name).click();
  }

  /** 환불로 읽힌 줄의 안내. 켤 수 없는 줄이라 왜 못 켜는지가 그 자리에 있어야 한다. */
  refundNotice(name: string): Locator {
    return this.row(name).getByText('환불로 읽었어요', { exact: false });
  }

  /** 그 자리에서 한 번에 고치는 길. 카드 캐시백은 실제로 들어온 돈이다. */
  refundToIncome(name: string): Locator {
    return this.row(name).getByRole('button', { name: '수입으로 바꾸기' });
  }

  /**
   * 여러 줄의 분류를 한꺼번에 바꾸는 칩. **캡처에만 선다.**
   *
   * 한 장에서 여섯 건이 쏟아지는 탭이라, 줄마다 펴서 고치게 두면 거기서 저장을 포기한다.
   */
  get bulkCategoryButton(): Locator {
    return this.root.getByRole('button', { name: '카테고리 한 번에 바꾸기', exact: true });
  }

  /** 칩을 누르면 목록 위에 펼쳐지는 분류들. 줄마다 있는 분류 칸과 이름으로 갈린다. */
  get bulkCategoryPicker(): Locator {
    return this.root.getByRole('group', { name: '한 번에 바꿀 카테고리' });
  }

  /** 펼치기와 고르기가 한 동작이다. 앞자리에 없으면 「더 보기」를 한 번 편다. */
  async bulkPickCategory(name: string): Promise<void> {
    await this.bulkCategoryButton.click();
    await expect(this.bulkCategoryPicker).toBeVisible();

    const chip = this.bulkCategoryPicker.getByRole('button', { name, exact: true });
    if ((await chip.count()) === 0) {
      await this.bulkCategoryPicker.getByRole('button', { name: '더 보기', exact: true }).click();
    }
    await chip.click();
  }

  /** 사진을 가져와 검토 화면에 닿을 때까지. */
  /**
   * 사진을 고르고 결과 화면까지 간다.
   *
   * 광고가 붙는 자리면 확인 창이 한 번 서고, 그때는 「광고 보고 읽기」 를 눌러 지난다.
   * 창이 안 서는 자리(오늘 무료분)에서는 그냥 지나간다.
   */
  async pick(): Promise<void> {
    await this.pickButton.click();
    if (await this.adConsentConfirm.isVisible()) await this.adConsentConfirm.click();
    /*
      아래 버튼 줄로 기다린다. 한 건도 못 읽으면 `이렇게 이해했어요` 가 안 뜨고,
      그때는 되돌리기가, 읽어 온 것이 있으면 취소가 선다. 둘 중 하나는 늘 있다.
    */
    await expect(this.restartButton.or(this.cancelButton)).toBeVisible();
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
