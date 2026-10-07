import { expect, type Locator, type Page } from '@playwright/test';

import { CategoryComposeArea } from './CategoryComposeArea';

import { shiftDay, toLedgerDate } from '../../src/shared/lib/format';
import { TEST_IDS } from '../../src/shared/testIds';
import { horizontalScrollersIn } from '../support/overflow';

/**
 * 기록 방법 이름. 왼쪽은 예전 탭 이름이고 오른쪽이 지금 첫 화면 카드 이름이다.
 *
 * spec 이 예전 이름을 그대로 써도 같은 카드를 고르게 짝지어 둔다.
 */
const WAY_NAMES = {
  키패드: '직접 입력',
  줄글: '글로 쓰기',
  캡처: '캡처로 정리',
  영수증: '영수증 찍기',
  '직접 입력': '직접 입력',
  '글로 쓰기': '글로 쓰기',
  '캡처로 정리': '캡처로 정리',
  '영수증 찍기': '영수증 찍기',
} as const;

export type WayLabel = keyof typeof WAY_NAMES;
export type KindLabel = '지출' | '수입' | '이체' | '저축·투자';

/** 「새 종목이나 통장」 의 그룹 칩. 부채는 「어디에」 에 없다. */
export type DestGroupLabel = '예적금·현금' | '투자' | '연금' | '보증금·기타';

/** 투자 종류 칩. */
export type DestKindLabel = '주식' | 'ETF' | '펀드' | '코인' | '채권' | '기타';

/** 첫 화면에서 가까운 사흘은 한 번 눌러 고른다. 그 밖의 날은 기기 달력 칸에 넣는다. */
const NEAR_DAY_WORDS = [
  { delta: 0, word: '오늘' },
  { delta: -1, word: '어제' },
  { delta: -2, word: '그저께' },
] as const;

/**
 * 적던 것을 두고 나가려 할 때의 확인.
 *
 * 화면에 못 박혀 있어 목록을 어디까지 내려 읽었든 같은 자리다. **기록 시트 · 기록 고치기 ·
 * 새 분류 만들기가 같은 한 벌을 쓴다**(`shared/ui/LeaveConfirm`). 그래서 이 객체도 하나다.
 */
export class LeaveConfirmArea {
  private readonly root: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('alertdialog', { name: '그만둘까요' });
  }

  get dialog(): Locator {
    return this.root;
  }

  get isVisible(): Promise<boolean> {
    return this.root.isVisible();
  }

  /** `읽어 온 3건이 사라져요. 그만둘까요?` 몇 건인지가 문구에 그대로 있다. */
  get text(): Locator {
    return this.root.getByText(/읽어 온 \d+건이 사라져요/);
  }

  /**
   * 손으로 적어 둔 것을 두고 나가려 할 때의 문구.
   *
   * **건수 문구와 겹치지 않게 못 박는다.** 느슨하게 두면 기록 고치기가 엉뚱하게
   * 「읽어 온 3건」 을 띄워도 통과한다.
   */
  get draftText(): Locator {
    return this.root.getByText(/^(적던 내용|고친 것|만들던 분류)이?가? 사라져요\. 그만둘까요\?$/);
  }

  /**
   * 머무는 쪽. 기본으로 눌리기 쉬운 자리에 크게 있다.
   *
   * 적는 화면은 「계속 쓰기」, 고치는 화면은 「계속 고치기」 다. 하는 일이 다르니 말도
   * 다르다. 이 객체는 둘 다 잡는다.
   */
  get stayButton(): Locator {
    return this.root.getByRole('button', { name: /^계속 (쓰기|고치기)$/ });
  }

  get leaveButton(): Locator {
    return this.root.getByRole('button', { name: '그만두기' });
  }
}

/**
 * 줄글이나 사진에서 읽어 온 것이 남은 채 ‹ 를 눌렀을 때의 확인.
 *
 * 시트를 닫는 확인(「그만둘까요」)과 다른 창이다. 시트는 남고, 「나가기」 를 고르면 그 패널만
 * 비우고 첫 화면으로 간다.
 */
export class PanelLeaveArea {
  private readonly root: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('alertdialog', { name: '나갈까요' });
  }

  get dialog(): Locator {
    return this.root;
  }

  /** `읽어 온 3건이 사라져요` 몇 건인지가 문구에 그대로 있다. */
  get text(): Locator {
    return this.root.getByText(/읽어 온 \d+건이 사라져요/);
  }

  get stayButton(): Locator {
    return this.root.getByRole('button', { name: '계속 쓰기', exact: true });
  }

  get leaveButton(): Locator {
    return this.root.getByRole('button', { name: '나가기', exact: true });
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
  /** 「적을 곳」 줄과 「다른 가계부」 고르기 창. 공유 가계부가 있는 사람에게만 선다. */
  readonly destination: RecordDestination;
  /** 공유 가계부에 적은 뒤의 화면. 개인 저장 뒤 화면보다 짧다. */
  readonly bookFeedback: RecordBookFeedback;
  /** 캡처와 글로 「저축·투자」 를 고른 자산 채우기. 자산 화면의 캡처로 채우기와 같은 검토다. */
  readonly assetFill: RecordAssetFill;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByRole('dialog', { name: '10초 기록' });
    this.input = new RecordInput(this.root, () => this.openKeypad());
    this.feedback = new RecordFeedback(this.root);
    this.nl = new RecordNaturalLanguage(this.root);
    this.capture = new RecordImageImport(this.root, CAPTURE_LABELS);
    this.receipt = new RecordImageImport(this.root, RECEIPT_LABELS);
    this.leave = new LeaveConfirmArea(page);
    this.panelLeave = new PanelLeaveArea(page);
    this.futureDayConfirm = new FutureDayConfirmArea(page);
    this.destination = new RecordDestination(page, this.root);
    this.bookFeedback = new RecordBookFeedback(this.root);
    this.assetFill = new RecordAssetFill(this.root);
  }

  get isVisible(): Promise<boolean> {
    return this.root.isVisible();
  }

  async waitOpen(): Promise<void> {
    await expect(this.root).toBeVisible();
  }

  /** 시트 전체. 시트 어디에도 없어야 하는 글을 확인할 때 쓴다. */
  get sheet(): Locator {
    return this.root;
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
  readonly leave: LeaveConfirmArea;

  /** 읽어 온 것이 남은 패널에서 ‹ 를 눌렀을 때 그 패널을 비울지 묻는 창. */
  readonly panelLeave: PanelLeaveArea;

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

  /** 첫 화면의 방법 카드 넷. 이 묶음이 보이면 첫 화면이다. */
  get wayGroup(): Locator {
    return this.root.getByRole('radiogroup', { name: '기록 방법' });
  }

  /**
   * 첫 화면의 방법 카드 하나. 예전 탭 이름(키패드, 줄글, 캡처, 영수증)도 받는다.
   *
   * 카드는 `role="radio"` 다. 고른 카드는 aria-checked 가 참이다.
   */
  methodTab(label: WayLabel): Locator {
    return this.wayGroup.getByRole('radio', { name: WAY_NAMES[label], exact: true });
  }

  /** 방법 카드 전체. 몇 개가 놓여 있는지 셀 때 쓴다. */
  get methodTabs(): Locator {
    return this.wayGroup.getByRole('radio');
  }

  /** 첫 화면의 종류 칩(지출, 수입, 이체, 저축·투자). 영수증에는 서지 않는다. */
  get kindGroup(): Locator {
    return this.root.getByRole('radiogroup', { name: '종류', exact: true });
  }

  kindChip(label: KindLabel): Locator {
    return this.kindGroup.getByRole('radio', { name: label, exact: true });
  }

  /** 첫 화면 아래 버튼. 방법에 따라 「다음」, 「카메라 열기」, 「사진 고르기」 다. */
  get nextButton(): Locator {
    return this.root
      .locator('.record-setup')
      .getByRole('button', { name: /^(다음|카메라 열기|사진 고르기)$/ });
  }

  /** 첫 화면 머리의 날짜. `오늘 10월 5일 (일)` 처럼 읽힌다. 누르면 「언제예요?」 로 간다. */
  get dayButton(): Locator {
    return this.root.locator('.record-setup__date');
  }

  /** 「언제예요?」 단계의 줄 하나. 오늘, 어제, 그저께. */
  dayRow(word: '오늘' | '어제' | '그저께'): Locator {
    return this.root
      .locator('.record-day')
      .getByRole('button', { name: new RegExp(`^${word} `) });
  }

  /** 「다른 날 고르기」 줄 위에 투명하게 겹친 날짜 칸. */
  get otherDayField(): Locator {
    return this.root.getByLabel('다른 날 고르기');
  }

  /** 지금 보이는 화면 머리의 ‹. 한 단계 뒤로 간다. 첫 화면에서는 시트를 닫으려 든다. */
  get backButton(): Locator {
    return this.root.getByRole('button', { name: '뒤로', exact: true });
  }

  /**
   * 둘째 화면(금액) 제목. 종류에 따라 「얼마 썼어요?」, 「얼마 벌었어요?」, 「얼마 옮겼어요?」,
   * 저축·투자는 「얼마를 어디에 넣었어요?」, 팔 때는 「얼마 받았어요?」.
   */
  get amountTitle(): Locator {
    return this.root
      .getByText(/^얼마(를 어디에 넣었| 썼| 벌었| 옮겼| 받았)어요\?$/)
      .filter({ visible: true });
  }

  /** 둘째 화면 오른쪽 위 태그 칩. 안 골랐으면 「＃ 태그」, 골랐으면 「＃ 회식」. */
  get tagChip(): Locator {
    return this.root.locator('.record__amount').getByRole('button', { name: /^＃ / });
  }

  /** 태그 단계의 칩 묶음. */
  get tagGroup(): Locator {
    return this.root.getByRole('group', { name: '태그', exact: true });
  }

  tagOption(name: string): Locator {
    return this.tagGroup.getByRole('button', { name, exact: true });
  }

  /** 태그 단계 맨 끝 점선 칩. 같은 단계 안쪽이 새 태그 폼으로 바뀐다. */
  get newTagButton(): Locator {
    return this.root.getByRole('button', { name: '＋ 새 태그', exact: true });
  }

  /** 첫 화면이 보이나. */
  async isOnSetup(): Promise<boolean> {
    return this.wayGroup.isVisible();
  }

  /** 시트 안 ‹ 를 누른다. */
  async back(): Promise<void> {
    await this.backButton.click();
  }

  /** 읽어 온 것이 남은 패널을 ‹ 로 나가며 비운다. 확인 창에서 「나가기」 를 고른다. */
  async leavePanel(): Promise<void> {
    await this.back();
    await this.panelLeave.leaveButton.click();
    await expect(this.wayGroup).toBeVisible();
  }

  /** 첫 화면 아래 버튼을 누른다. */
  async next(): Promise<void> {
    await this.nextButton.click();
  }

  /**
   * 첫 화면까지 ‹ 로 물러난다. 이미 첫 화면이면 아무것도 안 누른다.
   *
   * 첫 화면에서 ‹ 를 누르면 시트가 닫히므로, 한 번 누를 때마다 어디에 닿았는지 확인한다.
   */
  async toSetup(): Promise<void> {
    await expect(this.wayGroup.or(this.backButton).first()).toBeVisible();
    if (await this.wayGroup.isVisible()) return;
    if (await this.tagGroup.or(this.newTagForm).first().isVisible()) {
      await this.back();
      await expect(this.amountTitle).toBeVisible();
    }
    // 「새 종목이나 통장」 → 「다른 곳」 → 둘째 화면 차례로 물러난다.
    if (await this.newDestForm.isVisible()) {
      await this.back();
      await expect(this.destList).toBeVisible();
    }
    if (await this.destList.isVisible()) {
      await this.back();
      await expect(this.amountTitle).toBeVisible();
    }
    await this.back();
    await expect(this.wayGroup).toBeVisible();
  }

  /** 태그 단계의 새 태그 폼 이름 칸. 이 칸이 보이면 폼이다. */
  get newTagNameField(): Locator {
    return this.root.locator('.record-tags').getByRole('textbox');
  }

  /** 새 태그 폼의 「만들기」. 누르면 만든 태그가 골라진 채 둘째 화면으로 간다. */
  get newTagCreateButton(): Locator {
    return this.root.locator('.record-tags').getByRole('button', { name: '만들기', exact: true });
  }

  private get newTagForm(): Locator {
    return this.newTagNameField;
  }

  /**
   * 방법을 고른다. 첫 화면이 아니면 먼저 물러난다.
   *
   * 직접 입력과 글로 쓰기는 「다음」 까지 눌러 그 화면으로 간다. 사진 둘은 카드만 고르고 첫
   * 화면에 남는다. 아래 버튼이 곧 고르기라 `capture.pick()` 이 그 버튼을 누른다.
   */
  async chooseWay(label: WayLabel): Promise<void> {
    await this.toSetup();
    // 이미 골라진 카드는 누르지 않는다. 탭 수를 세는 spec 이 헛누름까지 세게 된다.
    if ((await this.methodTab(label).getAttribute('aria-checked')) !== 'true') {
      await this.methodTab(label).click();
    }
    const name = WAY_NAMES[label];
    if (name === '직접 입력' || name === '글로 쓰기') await this.next();
  }

  /**
   * 종류를 바꾼다. 둘째 화면이면 ‹ 로 물러나 칩을 누르고 「다음」 으로 돌아온다.
   * 끝나면 늘 둘째 화면이다.
   */
  async chooseKind(label: KindLabel): Promise<void> {
    await this.toSetup();
    if ((await this.methodTab('직접 입력').getAttribute('aria-checked')) !== 'true') {
      await this.methodTab('직접 입력').click();
    }
    await this.kindChip(label).click();
    await this.next();
    await expect(this.amountTitle).toBeVisible();
  }

  /**
   * 적을 날을 고른다. 첫 화면 날짜를 눌러 「언제예요?」 에서 고르고 첫 화면으로 돌아온다.
   *
   * 오늘, 어제, 그저께는 그 줄을 누르고, 그 밖의 날은 기기 달력 칸에 넣는다.
   */
  async chooseDay(iso: string): Promise<void> {
    await this.toSetup();
    await this.dayButton.click();
    const today = toLedgerDate(new Date());
    const near = NEAR_DAY_WORDS.find((item) => shiftDay(today, item.delta) === iso);
    if (near != null) await this.dayRow(near.word).click();
    else await this.otherDayField.fill(iso);
    await expect(this.wayGroup).toBeVisible();
  }

  /** 직접 입력 둘째 화면을 연다. 이미 거기면 아무것도 안 누른다. */
  async openKeypad(): Promise<void> {
    await expect(this.wayGroup.or(this.amountTitle).first()).toBeVisible();
    if (await this.amountTitle.isVisible()) return;
    await this.chooseWay('직접 입력');
    await expect(this.amountTitle).toBeVisible();
  }

  /**
   * 태그를 고른다. 둘째 화면 「＃ 태그」 를 눌러 태그 단계에서 고르면 둘째 화면으로 돌아온다.
   * 태그가 하나도 없으면 칩을 누르는 즉시 새 태그 폼이 선다.
   */
  async pickTag(name: string): Promise<void> {
    await this.openKeypad();
    await this.tagChip.click();
    await this.tagOption(name).click();
    await expect(this.amountTitle).toBeVisible();
  }

  // ── 저축·투자 ─────────────────────────────

  /** 「어디에」 두 칸 격자. 고르기 전에만 보인다. */
  get destGrid(): Locator {
    return this.root.getByRole('group', { name: '어디에', exact: true });
  }

  /** 격자 칸 하나. 이름만 적혀 있다. */
  destCell(name: string): Locator {
    return this.destGrid.getByRole('button', { name, exact: true });
  }

  /** 고른 뒤 한 줄로 접힌 「어디에」. 누르면 격자가 다시 펼쳐진다. */
  get destPicked(): Locator {
    return this.root.locator('.asset-dest__picked');
  }

  /** 격자 끝 「다른 곳」. */
  get otherDestButton(): Locator {
    return this.destGrid.getByRole('button', { name: '다른 곳', exact: true });
  }

  /** 「다른 곳」 단계. 그룹별 전체 목록과 맨 아래 「새 종목이나 통장」. */
  get destList(): Locator {
    return this.root.locator('.asset-dest-list');
  }

  /** 「다른 곳」 목록의 줄 하나. 이름 뒤에 금액이나 보유 수량이 붙어 읽힌다. */
  destListRow(name: string): Locator {
    return this.destList.getByRole('button', { name: new RegExp(`^${escapeRegExp(name)}`) });
  }

  /** 「새 종목이나 통장」 폼. */
  get newDestForm(): Locator {
    return this.root.locator('.asset-dest-new');
  }

  /** 「넣었어요 | 팔았어요」. 팔 수 있는 종목에만 선다. */
  sideOption(label: '넣었어요' | '팔았어요'): Locator {
    return this.root
      .getByRole('radiogroup', { name: '넣었나 팔았나' })
      .getByRole('radio', { name: label, exact: true });
  }

  /** 수량 칸. `수량 2주` 처럼 읽힌다. 골라져 있으면 aria-pressed 가 참이다. */
  get quantityBox(): Locator {
    return this.root.locator('.record-lot__qty');
  }

  /** 팔 때 「전부」. */
  get sellAllButton(): Locator {
    return this.root.locator('.record-lot').getByRole('button', { name: '전부', exact: true });
  }

  /**
   * 금액으로 팔 때 한 줄 칸. `남은 금액 900,000원` 처럼 이름 뒤에 값(비었으면 자리표시)이 붙어 읽힌다.
   * 「넣은 돈」 은 넣은 돈을 모르는 항목을 팔 때만 선다.
   */
  sellBox(label: '남은 금액' | '넣은 돈'): Locator {
    return this.root.getByRole('button', { name: new RegExp(`^${label} `) });
  }

  /** 팔 때 저장 전에 보이는 수익과 수익률. */
  get sellPreview(): Locator {
    return this.root.getByTestId(TEST_IDS.recordSellPreview);
  }

  /** 금액 숫자. 수량 칸이 있으면 버튼이라 누르면 키패드가 다시 금액을 친다. */
  get amountHead(): Locator {
    return this.root.locator('.record__amount .keypad__head--press');
  }

  /** 저축·투자 저장 뒤 화면의 줄. `saved` 이번 달 모은 돈, `item` 그 항목, `gain` 수익, `left` 남은 것. */
  savedAssetRow(row: 'saved' | 'item' | 'gain' | 'left'): Locator {
    return this.root.getByTestId(TEST_IDS.savedAssetRow).and(this.root.locator(`[data-row="${row}"]`));
  }

  /** 저장 뒤 「자산 보기」. */
  get assetsButton(): Locator {
    return this.root.getByRole('button', { name: '자산 보기', exact: true });
  }

  /**
   * 「어디에」 에서 항목을 고른다. 접혀 있으면 펼치고, 격자에 없으면 「다른 곳」 목록에서 고른다.
   * 끝나면 둘째 화면이다.
   */
  async pickDest(name: string): Promise<void> {
    await expect(this.destGrid.or(this.destPicked).first()).toBeVisible();
    if (await this.destPicked.isVisible()) await this.destPicked.click();
    if ((await this.destCell(name).count()) > 0) {
      await this.destCell(name).click();
    } else {
      await this.openOtherDest();
      await this.destListRow(name).click();
    }
    await expect(this.amountTitle).toBeVisible();
  }

  /** 「다른 곳」 단계를 연다. 접혀 있으면 격자부터 펼친다. */
  async openOtherDest(): Promise<void> {
    if (await this.destList.isVisible()) return;
    if (await this.destPicked.isVisible()) await this.destPicked.click();
    await this.otherDestButton.click();
    await expect(this.destList).toBeVisible();
  }

  /** 「다른 곳」 → 「새 종목이나 통장」 에서 그룹, 종류, 이름을 적고 「저장」. 둘째 화면으로 돌아온다. */
  async addNewDest({
    group,
    kind,
    name,
  }: {
    group: DestGroupLabel;
    kind?: DestKindLabel;
    name: string;
  }): Promise<void> {
    await this.openOtherDest();
    await this.destList.getByRole('button', { name: '새 종목이나 통장', exact: true }).click();
    await expect(this.newDestForm).toBeVisible();
    await this.newDestForm
      .getByRole('radiogroup', { name: '자산 그룹' })
      .getByRole('radio', { name: group, exact: true })
      .click();
    if (kind != null) {
      await this.newDestForm
        .getByRole('radiogroup', { name: '투자 종류' })
        .getByRole('radio', { name: kind, exact: true })
        .click();
    }
    await this.newDestForm.getByRole('textbox', { name: '이름' }).fill(name);
    await this.newDestForm.getByRole('button', { name: '저장', exact: true }).click();
    await expect(this.amountTitle).toBeVisible();
  }

  /** 수량 칸을 골라 키패드로 친다. 적혀 있던 수량은 먼저 지운다. 끝나도 수량 칸이 골라져 있다. */
  async setQuantity(text: string): Promise<void> {
    await this.quantityBox.click();
    const label = (await this.quantityBox.getAttribute('aria-label')) ?? '';
    const current = /^수량 ([\d.]+)/.exec(label)?.[1] ?? '';
    for (let index = 0; index < current.length; index += 1) {
      await this.root.getByRole('button', { name: '한 자리 지우기' }).click();
    }
    for (const key of text) {
      await this.root.locator('.keypad__keys').getByRole('button', { name: key, exact: true }).click();
    }
  }

  /** 「넣었어요 | 팔았어요」 를 바꾼다. 수량은 비워진다. */
  async toggleSide(label: '넣었어요' | '팔았어요'): Promise<void> {
    await this.sideOption(label).click();
    await expect(this.sideOption(label)).toHaveAttribute('aria-checked', 'true');
  }

  /** 팔 때 「전부」. 보유 수량이 그대로 들어가고 키패드는 금액으로 돌아간다. */
  async sellAll(): Promise<void> {
    await this.sellAllButton.click();
  }

  /**
   * 시트가 세로로 넘친 만큼(px). 0 이면 한 화면에 다 들어온다.
   *
   * 넘치면 시트가 스크롤 상자가 되고 손잡이가 밀려 밀어 닫기가 안 먹는다.
   */
  async overflowY(): Promise<number> {
    return this.root.evaluate((sheet) => Math.max(0, sheet.scrollHeight - sheet.clientHeight - 1));
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
  /** 둘째 화면(금액)이 아니면 첫 화면에서 「다음」 을 눌러 그리로 간다. */
  private readonly ready: () => Promise<void>;

  constructor(root: Locator, ready: () => Promise<void>) {
    this.root = root;
    this.ready = ready;
  }

  /** 지금 눌러 둔 금액. `12,000원` 처럼 포맷된 문자열이다. */
  get amountText(): Locator {
    return this.root.getByTestId(TEST_IDS.recordAmount);
  }

  /**
   * 금액 아래 안내 한 줄. **기록 시트에는 없다**(모든 상태에서 뺐다).
   * 저장 뒤 패널에서 금액을 고칠 때만 선다. 없다는 것을 개수로 단언하는 자리다.
   */
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

  /**
   * 숫자판 전체.
   *
   * **늘 서 있지 않다.** 분류 목록을 「더 보기」로 끝까지 펼친 동안과 새 분류 만들기 화면에서는
   * 접힌다. 고를 것이 화면을 채운 자리에 숫자판까지 서면 지금 무엇을 하는 중인지 흐려진다.
   */
  get keypad(): Locator {
    return this.root.locator('.keypad__keys');
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

  /**
   * 「더 보기」 를 다 펼쳤을 때 끝에 서는 작은 칩. 누르면 카테고리 관리로 간다.
   * 잃을 것이 있으면 먼저 묻는다. 예전의 안내 문단은 걷었다.
   */
  get categoryManageLink(): Locator {
    return this.root.getByRole('button', { name: '카테고리 관리', exact: true });
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
    await this.ready();
    if ((await this.newCategoryButton.count()) === 0) {
      await this.moreCategoriesButton.click();
    }
    await this.newCategoryButton.click();
  }

  /** 「새 분류」를 누르면 칩 자리에 펼쳐지는 만들기 폼. 시트를 더 띄우지 않는다. */
  get newCategoryForm(): CategoryComposeArea {
    return new CategoryComposeArea(this.root.page());
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
    await this.ready();
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
    await this.ready();
    if ((await this.categoryChip(name).count()) === 0) {
      await this.moreCategoriesButton.click();
    }
    await this.categoryChip(name).click();
  }

  /** 금액보다 먼저 고른 뒤 접혀 있는 한 줄. 누르면 목록이 다시 펴진다. */
  get pickedCategory(): Locator {
    return this.root.getByRole('button', { name: /다시 고르기$/ });
  }

  /**
   * 카테고리를 먼저 고른 다음에만 나오는 저장 버튼.
   *
   * 저장이 도는 동안에는 이름이 `저장하는 중` 으로 바뀐다. 키패드 위 안내 줄을 없애
   * 저장 중이라는 표시를 이 버튼이 맡는다. 같은 버튼을 계속 잡으려고 두 이름을 함께 본다.
   */
  get saveButton(): Locator {
    return this.root.getByRole('button', { name: /^저장(하는 중)?$/ });
  }
}

/** 저장 후 얼굴. */
/**
 * 기록 시트 안의 분류 만들기 화면.
 *
 * 시트가 하나 더 뜨는 것이 아니라 **시트 안쪽이 통째로 이 화면이 된다.** 그래야 적던 금액이
 * 살아 있고, 탭·키패드가 함께 보여 헷갈릴 일도 없다.
 * 「이전」 과 「저장」 은 맨 위에 붙어 있어 아이콘 격자를 내려도 자리가 안 바뀐다.
 */
class RecordFeedback {
  private readonly root: Locator;

  constructor(root: Locator) {
    this.root = root;
  }

  /** 저장 뒤 화면 맨 위 큰 제목. 공유 가계부가 있든 없든 같은 말이다. */
  get savedLabel(): Locator {
    return this.root.getByText('내 가계부에 적었어요', { exact: true });
  }

  /** 공유 가계부가 있는 사람의 머리 한 줄. 어디에 적혔는지를 먼저 말한다. */
  get savedToMineLabel(): Locator {
    return this.root.getByText('내 가계부에 적었어요', { exact: true });
  }

  /** 저장 뒤 화면의 ‹. 「확인」 과 같은 길이다(적어 둔 상호와 메모를 보내고 닫는다). */
  get backButton(): Locator {
    return this.root.getByRole('button', { name: '뒤로', exact: true });
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

  /**
   * 상호 칸. **처음에는 접혀 있다.** 아이콘 줄의 「어디서 썼나요」(수입은 「어디서 받았나요」)를
   * 눌러야 그 자리에 펼쳐진다. 이미 상호가 있는 기록도 같다.
   */
  get merchantField(): Locator {
    return this.root.getByTestId(TEST_IDS.feedbackMerchantField);
  }

  /** 상호 칸을 펴는 아이콘 버튼. 이체에는 없다. */
  get merchantOpener(): Locator {
    return this.root.getByRole('button', { name: /^어디서 (썼|받았)나요$/ });
  }

  /** 메모 칸을 펴는 아이콘 버튼. */
  get memoOpener(): Locator {
    return this.root.getByRole('button', { name: '메모 남기기', exact: true });
  }

  /** 상호 칸을 편다. 이미 펴져 있으면 그대로 둔다. */
  async openMerchant(): Promise<void> {
    if (!(await this.merchantField.isVisible())) await this.merchantOpener.click();
    await expect(this.merchantField).toBeVisible();
  }

  /** 메모 칸을 편다. 이미 펴져 있으면 그대로 둔다. */
  async openMemo(): Promise<void> {
    if (!(await this.memoField.isVisible())) await this.memoOpener.click();
    await expect(this.memoField).toBeVisible();
  }

  /**
   * 상호를 적고 칸에서 빠져나온다. 접혀 있으면 먼저 편다.
   *
   * 저장 버튼이 따로 없다. 칸을 벗어날 때 보내므로 blur 까지 해야 실제로 저장된다.
   */
  async writeMerchant(name: string): Promise<void> {
    await this.openMerchant();
    await this.merchantField.fill(name);
    await this.merchantField.blur();
  }

  /** 상호와 **다른 칸**이다. 「어디서」 가 아니라 「무엇을·왜」 를 적는다. */
  get memoField(): Locator {
    return this.root.getByTestId(TEST_IDS.feedbackMemoField);
  }

  /** 상호와 같은 규칙이다. 접혀 있으면 펴고, 칸을 벗어날 때 보낸다. */
  async writeMemo(text: string): Promise<void> {
    await this.openMemo();
    await this.memoField.fill(text);
    await this.memoField.blur();
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

  /** 공유 가계부에 저장한 뒤의 한 줄. `둘이 쓰는 돈에 2건 적었어요` */
  savedInBook(bookName: string): Locator {
    return this.root.getByText(new RegExp(`^${escapeRegExp(bookName)}에 \\d+건 적었어요$`));
  }

  /** 탭 패널 자체. 저장 뒤에는 그 달 같이 쓴 돈과 누가 보는지가 여기 적힌다. */
  get panel(): Locator {
    return this.root;
  }

  /** 공유 가계부 검토에서 지출이 아닌 줄에 붙는 한 줄. 이 줄은 켤 수 없다. */
  lockedNote(name: string): Locator {
    return this.row(name).getByText('내 가계부에만 적을 수 있어요', { exact: true });
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

  /**
   * 분류 없이 읽힌 줄에 분류를 골라 넣으면 그 줄 아래 뜨는 물음.
   * 「기억하기」 와 「이번만」. 펼친 폼에만 있어 줄을 접으면 함께 접히고, 답하면 사라진다.
   * 모델이 분류를 붙여 준 줄, 체크를 끈 줄, 공유 가계부 검토에는 없다.
   */
  rulePrompt(name: string): Locator {
    return this.row(name).getByTestId(TEST_IDS.nlCandidateAsk);
  }

  rememberButton(name: string): Locator {
    return this.rulePrompt(name).getByRole('button', { name: '기억하기', exact: true });
  }

  onceButton(name: string): Locator {
    return this.rulePrompt(name).getByRole('button', { name: '이번만', exact: true });
  }

  /** 「기억하기」 뒤 그 자리에 남는 한 줄. 「저장할 때 「생활」 분류로 기억해요」 와 「되돌리기」 */
  ruleNote(name: string): Locator {
    return this.row(name).getByTestId(TEST_IDS.nlCandidateAskDone);
  }

  ruleUndoButton(name: string): Locator {
    return this.ruleNote(name).getByRole('button', { name: '되돌리기', exact: true });
  }

  amount(name: string): Locator {
    return this.row(name).getByTestId(TEST_IDS.nlCandidateAmount);
  }

  /** 후보 줄 금액의 글자색. 수입과 지출이 색으로 갈리는지 본다. */
  async amountColor(name: string): Promise<string> {
    return this.amount(name).evaluate((el) => getComputedStyle(el).color);
  }

  /** 날짜 칩. 글자는 `9월 29일` 이고, 접힌 줄에서 누르면 줄이 펴지며 날짜 칸이 바로 열린다. */
  day(name: string): Locator {
    return this.row(name).getByTestId(TEST_IDS.nlCandidateDate);
  }

  /** 분류 칩. 접힌 줄에서 누르면 줄이 펴지며 분류 격자가 바로 열린다. */
  categoryButton(name: string): Locator {
    return this.row(name).getByRole('button', { name: /^분류 (.+, 바꾸기|고르기)$/ });
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
    await expect(this.root.getByRole('button', { name: '완료', exact: true })).toBeVisible();
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

  /**
   * 지금 펼친 줄. 끝에 「완료」 가 있는 줄이다.
   *
   * 날짜·분류 칩은 접힌 줄에도 있어 패널 전체로 잡으면 여러 줄 것이 섞인다.
   */
  private get row(): Locator {
    return this.root
      .getByTestId(TEST_IDS.nlCandidateRow)
      .filter({ has: this.root.page().getByRole('button', { name: '완료', exact: true }) });
  }

  /** 펼친 줄 머리의 분류 아이콘. 폼에서 고른 분류를 「완료」 전에도 따라 그린다. */
  get headAvatar(): Locator {
    return this.row.getByRole('button', { name: /눌러서 고치기$/ }).locator('img');
  }

  get merchantField(): Locator {
    return this.root.getByLabel('상호');
  }

  get amountField(): Locator {
    return this.root.getByLabel('금액');
  }

  /**
   * 머리 아래 날짜 칩. `날짜 9월 29일, 바꾸기` 라는 이름을 달고, 글자는 `9월 29일` 이다.
   * 누르면 바로 아래에 날짜 칸이 열린다.
   */
  get dayChip(): Locator {
    return this.row.getByTestId(TEST_IDS.nlCandidateDate);
  }

  /** 날짜 칩을 눌러야 열리는 칸. 기본으로 닫혀 있고, 날을 고르면 저절로 닫힌다. */
  get dayField(): Locator {
    return this.row.getByLabel('날짜', { exact: true });
  }

  /** 날짜 칸을 연다. 이미 열려 있으면 그대로 둔다. */
  async openDay(): Promise<void> {
    if ((await this.dayField.count()) === 0) await this.dayChip.click();
    await expect(this.dayField).toBeVisible();
  }

  /** 날짜를 바꾼다. 칸을 열고 적으면 칸이 닫히고 칩 글자가 바뀐다. */
  async setDay(iso: string): Promise<void> {
    await this.openDay();
    await this.dayField.fill(iso);
    await expect(this.dayField).toHaveCount(0);
  }

  /**
   * 머리 아래 분류 칩. `분류 식비, 바꾸기`, 안 골랐으면 `분류 고르기`.
   * 이체처럼 분류가 없는 종류에는 없다.
   */
  get categoryButton(): Locator {
    return this.row.getByRole('button', { name: /^분류 (.+, 바꾸기|고르기)$/ });
  }

  get doneButton(): Locator {
    return this.root.getByRole('button', { name: '완료', exact: true });
  }

  typeTab(label: '지출' | '수입' | '이체' | '환불'): Locator {
    return this.root.getByRole('radiogroup', { name: '종류' }).getByRole('radio', { name: label });
  }

  /** 분류 칩을 눌러야 열리는 격자. 하나를 고르면 저절로 닫힌다. */
  get categoryGroup(): Locator {
    // 「분류 기억하기」 물음 칸도 group 이라 이름이 정확히 「분류」 인 것만 잡는다.
    return this.root.getByRole('group', { name: '분류', exact: true });
  }

  categoryChip(name: string): Locator {
    return this.categoryGroup.getByRole('button', { name });
  }

  /** 분류 격자를 연다. 이미 열려 있으면 그대로 둔다. */
  async openCategories(): Promise<void> {
    if ((await this.categoryGroup.count()) === 0) await this.categoryButton.click();
    await expect(this.categoryGroup).toBeVisible();
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

  /** 격자를 열고, 숨긴 분류가 있으면 한 번 펼쳐 만들기를 연다. 기록 시트와 같은 규칙이다. */
  async openNewCategory(): Promise<void> {
    await this.openCategories();
    if ((await this.newCategoryButton.count()) === 0) {
      await this.moreCategoriesButton.click();
    }
    await this.newCategoryButton.click();
  }

  /** 격자를 열고, 앞자리에 없으면 한 번 펼쳐 고른다. 고르면 격자가 닫힌다. */
  async pickCategory(name: string): Promise<void> {
    await this.openCategories();
    if ((await this.categoryChip(name).count()) === 0) {
      await this.moreCategoriesButton.click();
    }
    await this.categoryChip(name).click();
    await expect(this.categoryGroup).toHaveCount(0);
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

  /** 짧은 폼 끝의 「완료」. 고친 것을 보내고 줄을 접는다. */
  async apply(): Promise<void> {
    await this.doneButton.click();
    await expect(this.doneButton).toHaveCount(0);
  }

  /**
   * 「새 분류」를 누르면 뜨는 만들기 창.
   *
   * **화면을 덮는 한 장이고 포털로 `body` 에 붙는다.** 이 줄의 root 로는 안 잡혀서
   * 페이지 전체를 보는 객체를 쓴다. 기록 시트의 키패드 탭과 같은 화면이다.
   */
  get compose(): CategoryComposeArea {
    return new CategoryComposeArea(this.root.page());
  }

  /** 이 창이 떠 있는지. 적어 둔 상호·금액·날짜가 살아 있는지 보려면 열림·닫힘을 가린다. */
  get newCategoryTitle(): Locator {
    return this.compose.title;
  }

  /** 만들지 않고 고치던 줄로 돌아간다. 맨 위 왼쪽에 있다. */
  get newCategoryBackButton(): Locator {
    return this.compose.backButton;
  }

  /** 이름과 그림을 정해 분류를 만든다. 종류는 위 칸이 이미 정했다. */
  async createCategory(name: string, iconLabel: string): Promise<void> {
    await this.compose.create(name, iconLabel);
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
  /** 첫 화면에서 이 방법을 골랐을 때 아래 버튼. 누르면 패널로 가면서 곧바로 고르기를 연다. */
  setupCta: string;
  /** 패널 안에서 사진을 가져오는 버튼. 실패한 뒤에는 `다시 시도` 로 바뀐다. */
  pickButton: RegExp;
  /** 진행 표시의 첫 문구. 1~2초 뒤 다음 단계로 넘어간다. */
  analyzingLabel: string;
  emptyNotice: string;
  restartLabel: string;
  permissionTitle: string;
}

const CAPTURE_LABELS: ImageImportLabels = {
  panelTestId: TEST_IDS.capturePanel,
  setupCta: '사진 고르기',
  pickButton: /^(캡처 고르기|다시 시도)$/,
  analyzingLabel: '캡처를 준비하고 있어요',
  emptyNotice: '캡처에서 거래를 찾지 못했어요',
  restartLabel: '다시 고르기',
  permissionTitle: '사진 접근이 꺼져 있어요',
};

const RECEIPT_LABELS: ImageImportLabels = {
  panelTestId: TEST_IDS.receiptPanel,
  setupCta: '카메라 열기',
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
  private readonly sheet: Locator;
  private readonly labels: ImageImportLabels;

  constructor(sheet: Locator, labels: ImageImportLabels) {
    this.sheet = sheet;
    this.root = sheet.getByTestId(labels.panelTestId);
    this.labels = labels;
  }

  /** 첫 화면에서 이 방법을 골랐을 때 서는 아래 버튼. 패널로 가면서 고르기를 곧바로 연다. */
  get setupCta(): Locator {
    return this.sheet
      .locator('.record-setup')
      .getByRole('button', { name: this.labels.setupCta, exact: true });
  }

  /** 패널 안의 고르기 버튼. 첫 화면 버튼이 고르기를 못 열었을 때(권한, 실패) 여기서 다시 고른다. */
  get panelPickButton(): Locator {
    return this.root.getByRole('button', { name: this.labels.pickButton });
  }

  /**
   * 사진을 가져오는 버튼. 첫 화면이면 아래 버튼, 패널이면 패널 안 버튼이다.
   *
   * 둘이 한꺼번에 보이는 일은 없다. 첫 화면에 있는 동안 패널은 감춰져 있다.
   */
  get pickButton(): Locator {
    return this.setupCta.or(this.panelPickButton);
  }

  /**
   * 버튼 아래 한 줄. **체험 한 장을 이미 쓴 사람에게만** 뜬다.
   *
   * 처음 써 보는 사람에게는 「무료」 도 「광고」 도 꺼내지 않는다. 10초 안에 한 건 적으러
   * 온 사람 앞에 광고라는 개념을 먼저 세울 이유가 없다.
   */
  get creditLine(): Locator {
    // 첫 화면 아래 버튼 밑과 패널 버튼 밑에 같은 줄이 있다. 지금 보이는 쪽만 센다.
    return this.sheet
      .getByText('읽는 동안 광고가 한 번 지나가요', { exact: true })
      .filter({ visible: true });
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

  /**
   * 읽기가 실패한 뒤 덧붙는 한마디.
   *
   * 광고는 끝까지 보고 빈손으로 남은 사람에게만 뜬다. 다음 한 번이 공짜라는 것을 여기서
   * 말하지 않으면 사용자는 알 방법이 없어 다시 누르기를 망설인다.
   */
  get adFreeNextNotice(): Locator {
    return this.root.getByText('광고는 다시 안 나와요');
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
    return this.root.getByRole('button', { name: '직접 입력', exact: true });
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

  /** 공유 가계부에 저장한 뒤의 한 줄. `둘이 쓰는 돈에 2건 적었어요` */
  savedInBook(bookName: string): Locator {
    return this.root.getByText(new RegExp(`^${escapeRegExp(bookName)}에 \\d+건 적었어요$`));
  }

  /** 탭 패널 자체. 저장 뒤에는 그 달 같이 쓴 돈과 누가 보는지가 여기 적힌다. */
  get panel(): Locator {
    return this.root;
  }

  /** 공유 가계부 검토에서 지출이 아닌 줄에 붙는 한 줄. 이 줄은 켤 수 없다. */
  lockedNote(name: string): Locator {
    return this.row(name).getByText('내 가계부에만 적을 수 있어요', { exact: true });
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
    await expect(this.root.getByRole('button', { name: '완료', exact: true })).toBeVisible();
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

/**
 * 「적을 곳」 한 줄. 알약은 셋까지다: 내 가계부, 둘째 가계부, 셋째 가계부나 「다른 가계부」.
 *
 * 알약은 aria-pressed 버튼이다. 「다른 가계부」 가 여는 고르기 창은 포털이라 시트 밖에서 찾는다.
 */
class RecordDestination {
  private readonly page: Page;
  private readonly root: Locator;

  constructor(page: Page, sheet: Locator) {
    this.page = page;
    this.root = sheet.getByRole('group', { name: '적을 곳', exact: true });
  }

  get group(): Locator {
    return this.root;
  }

  get pills(): Locator {
    return this.root.getByRole('button');
  }

  pill(name: string): Locator {
    return this.root.getByRole('button', { name, exact: true });
  }

  get otherButton(): Locator {
    return this.pill('다른 가계부');
  }

  get picker(): Locator {
    return this.page.getByRole('dialog', { name: '어디에 적을까요' });
  }

  /** 고르기 창의 한 줄. 이름 뒤에 인원이 붙어 읽힌다. */
  pickerRow(name: string): Locator {
    return this.picker.getByRole('button', { name: new RegExp(`^${escapeRegExp(name)}`) });
  }
}

/** 공유 가계부에 적은 뒤. 어디에 적혔나, 그 달 돈, 낸 사람, 내 가계부로 옮기기. */
class RecordBookFeedback {
  private readonly root: Locator;

  constructor(root: Locator) {
    this.root = root;
  }

  /** `우리 집에 적었어요` */
  savedLabel(bookName: string): Locator {
    return this.root.getByText(`${bookName}에 적었어요`, { exact: true });
  }

  get movedLabel(): Locator {
    return this.root.getByText('내 가계부로 옮겼어요', { exact: true });
  }

  /** 그 달 남은 예산이나 같이 쓴 돈, 그리고 누가 볼 수 있는지. */
  get card(): Locator {
    return this.root.getByRole('status');
  }

  get payerGroup(): Locator {
    return this.root.getByRole('group', { name: '낸 사람', exact: true });
  }

  payer(name: string): Locator {
    return this.payerGroup.getByRole('button', { name, exact: true });
  }

  get moveOutButton(): Locator {
    return this.root.getByRole('button', { name: '내 가계부로 옮기기', exact: true });
  }

  /** 옮긴 뒤에만 선다. 누르면 같은 기록이 이 가계부로 돌아온다. */
  get undoMoveButton(): Locator {
    return this.root.getByRole('button', { name: '되돌리기', exact: true });
  }

  get confirmButton(): Locator {
    return this.root.getByRole('button', { name: '확인', exact: true });
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 기록하기의 자산 채우기. 캡처(사진)와 글 두 패널이 같은 검토 화면을 쓴다.
 *
 * 두 패널이 함께 서 있고 하나만 보이므로 보이는 쪽만 잡는다.
 */
class RecordAssetFill {
  private readonly sheet: Locator;

  constructor(sheet: Locator) {
    this.sheet = sheet;
  }

  /** 본문. `data-step` 이 intro, reading, review, fail 중 하나다. */
  get body(): Locator {
    return this.sheet.getByTestId(TEST_IDS.captureSheet).filter({ visible: true });
  }

  async waitStep(step: 'intro' | 'reading' | 'review' | 'fail'): Promise<void> {
    await expect(this.body).toHaveAttribute('data-step', step);
  }

  /** 첫 화면 아래 버튼 밑 예고 한 줄. 캡처 + 저축·투자일 때 선다. */
  get adLine(): Locator {
    return this.sheet
      .locator('.record-setup')
      .getByText('읽는 동안 광고가 한 번 지나가요', { exact: true });
  }

  get textarea(): Locator {
    return this.body.getByLabel('어디에 얼마 있나요', { exact: true });
  }

  get analyzeButton(): Locator {
    return this.body.getByRole('button', { name: '분석', exact: true });
  }

  /** 적고 「분석」 을 누른다. 검토 화면이 설 때까지 기다린다. */
  async analyze(text: string): Promise<void> {
    await this.textarea.fill(text);
    await this.analyzeButton.click();
    await this.waitStep('review');
  }

  get rows(): Locator {
    return this.body.getByTestId(TEST_IDS.captureRow);
  }

  row(name: string): Locator {
    return this.rows.filter({ hasText: name });
  }

  get saveButton(): Locator {
    return this.body.getByRole('button', { name: /줄 저장$/ });
  }

  get cancelButton(): Locator {
    return this.body.getByRole('button', { name: '취소', exact: true });
  }
}
