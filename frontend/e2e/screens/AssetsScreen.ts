import { expect, type Locator, type Page } from '@playwright/test';

import { ROUTES } from '../../src/app/router/routes';
import { TEST_IDS } from '../../src/shared/testIds';

/** 화면에 적힌 그룹 이름 그대로다. 구획과 시트의 갈래가 같은 이름을 쓴다. */
export type AssetGroupLabel = '예적금·현금' | '투자' | '연금' | '보증금·기타' | '부채';

/** 투자 그룹의 종류 칩. 화면에 적힌 그대로다. */
export type InvestKindLabel = '주식' | 'ETF' | '펀드' | '코인' | '채권' | '기타';

/**
 * 자산 화면.
 *
 * 관리 탭 아래 하위 화면이라 URL 이 달라 별도 객체다. 한 화면이 순자산 카드와
 * 그룹 구획 넷, 시트 하나를 데리고 있어 시트만 안쪽 객체로 나눠 뒀다.
 *
 * 셀렉터는 이 파일 안에만 둔다. 무엇이 맞는지는 spec 이 정한다.
 */
export class AssetsScreen {
  private readonly page: Page;

  /** 더하기와 고치기가 같은 시트다. 제목만 다르다. */
  readonly sheet: AssetItemSheet;
  /** 「캡처로 채우기」 시트. */
  readonly capture: CaptureArea;
  /** 홈 체크인의 「바뀐 게 있어요」 가 여는 시트. */
  readonly checkin: CheckinSheet;

  constructor(page: Page) {
    this.page = page;
    this.sheet = new AssetItemSheet(page);
    this.capture = new CaptureArea(page);
    this.checkin = new CheckinSheet(page);
  }

  async open(): Promise<void> {
    await this.page.goto(ROUTES.assets);
  }

  /**
   * 조회가 끝난 뒤.
   *
   * 적어 둔 것이 있으면 순자산이, 없으면 빈 상태 제목이 뜬다. 둘 중 하나가 보이면
   * 로딩 자리표시자가 걷힌 것이다.
   */
  async waitReady(): Promise<void> {
    await expect(this.netWorth.or(this.emptyTitle)).toBeVisible();
  }

  /** 순자산 금액. 자산 합에서 부채 합을 뺀 값이고 서버가 센다. */
  get netWorth(): Locator {
    return this.page.getByTestId(TEST_IDS.netWorth);
  }

  /** 순자산 위 한 줄. 언제 적은 것인지 기준일이 여기 적힌다. */
  get basisLabel(): Locator {
    return this.netWorthCard.getByText(/^내 순자산( · \d{1,2}월 \d{1,2}일 기준)? ?›$/);
  }

  /** 예전 카드의 `자산 X − 부채 Y` 줄. 이제는 없어야 하는 자리다. */
  get breakdown(): Locator {
    return this.netWorthCard.getByText(/자산 .* − 부채/);
  }

  /** 순자산 카드 전체(누르는 자리). */
  get netWorthButton(): Locator {
    return this.netWorthCard.getByRole('button');
  }

  /** 카드 안 글자 전부. 무엇이 있고 없는지 볼 때 쓴다. */
  get netWorthText(): Locator {
    return this.netWorthCard;
  }

  /** 카드의 작은 추이 그래프. */
  get sparkline(): Locator {
    return this.netWorthCard.locator('svg');
  }

  /** 순자산 상세 시트. */
  get detailSheet(): Locator {
    return this.page.getByRole('dialog', { name: '순자산', exact: true });
  }

  /** 상세 시트의 한 줄(자산, 부채, 순자산). */
  detailRow(label: '자산' | '부채' | '순자산'): Locator {
    return this.detailSheet
      .getByText(label, { exact: true })
      .locator('..')
      .filter({ hasText: /\d원$/ });
  }

  /** 「내 자산 분석」 입구. `data-state` 가 locked, open, stale 중 하나다. */
  get analysisEntry(): Locator {
    return this.page.getByTestId(TEST_IDS.analysisEntry);
  }

  /** 입구 안의 「내 자산 분석」 버튼(잠김, 바뀜 카드). 열림 줄이면 줄 자체가 버튼이다. */
  get analysisButton(): Locator {
    return this.page.getByRole('button', { name: /^내 자산 분석/ });
  }

  /** 자산 화면의 캡처 입구 버튼. */
  get captureEntry(): Locator {
    return this.page.getByRole('button', { name: '은행·증권 앱 화면 캡처로 채우기', exact: true });
  }

  /** 그룹 목록 위 배너. */
  get topAdSlot(): Locator {
    return this.page.locator(`[data-testid="${TEST_IDS.adSlot}"][data-placement="assets_top"]`);
  }

  /** 첫 그룹 구획 머리. 차례를 잴 때 쓴다. */
  get firstGroup(): Locator {
    return this.page.getByRole('region', { name: '예적금·현금', exact: true });
  }

  /** 상세 시트의 큰 선 그래프. */
  get detailChart(): Locator {
    return this.detailSheet.locator('svg').first();
  }

  /** 화면에 그 글자가 보이는 자리. 없어야 하는 문구를 셀 때 쓴다. */
  anyText(text: string | RegExp): Locator {
    return this.page.getByText(text, { exact: typeof text === 'string' });
  }

  /** 광고 확인 창. 자산 화면에 들어올 때는 없어야 한다. */
  get adConsent(): Locator {
    return this.page.getByRole('alertdialog');
  }

  /** 맨 위 제목 아래 설명 줄(page__lead). 자산 화면에는 없어야 한다. */
  get leadText(): Locator {
    return this.page.getByText(/모든 항목은 건너뛸 수 있어요/);
  }

  /** 한 줄도 없을 때의 제목. */
  get emptyTitle(): Locator {
    return this.page.getByText('아직 자산을 적지 않았어요', { exact: true });
  }

  /** 빈 상태에서 처음 적기 시작하는 버튼. */
  get startButton(): Locator {
    return this.page.getByRole('button', { name: '직접 적기', exact: true });
  }

  /** 못 불러왔을 때. 이 자리에는 더하기 입구를 두지 않는다. */
  get loadFailure(): Locator {
    return this.page.getByText('자산을 불러오지 못했어요', { exact: true });
  }

  /** 못 불러온 자리에 함께 적는 한 줄. 왜 지금 적으면 안 되는지 여기서 말한다. */
  get loadFailureHint(): Locator {
    return this.page.getByText(
      '지금 적으면 이미 적어 둔 것이 지워질 수 있어서, 먼저 다시 받아 볼게요.',
      { exact: true },
    );
  }

  /**
   * 못 불러온 자리의 다시 시도.
   *
   * 빈 상태와 오류가 같은 `status` 블록을 쓰지만 둘이 함께 뜨지 않아, 그 안에서만 찾는다.
   */
  get retryButton(): Locator {
    return this.page.getByRole('status').getByRole('button', { name: '다시 시도', exact: true });
  }

  /**
   * 시트를 여는 입구 전부. 빈 상태의 「직접 적기」와 구획마다의 「... 항목 추가」다.
   *
   * 저장이 목록을 통째로 보내는 PUT 하나라, 목록을 못 받은 채로 한 줄을 더하면 있던 줄이
   * 함께 사라진다. 그래서 못 받았을 때 여기가 0 인지를 세는 자리가 필요하다.
   */
  get addEntries(): Locator {
    return this.page.getByRole('button', { name: /^직접 적기$|항목 추가$/ });
  }

  /**
   * 목록의 한 줄에 적힌 이름.
   *
   * 아주 긴 이름은 두 줄에서 끊기는데 잘리는 것은 보이는 쪽뿐이라 글자는 그대로다.
   * 그래서 이름 전체로 찾는다.
   */
  entryRow(name: string): Locator {
    return this.page.locator('.asset-row__name').filter({ hasText: name });
  }

  /** 항목을 더 넣을 수 없을 때 더하기 버튼 자리에 서는 한 줄. */
  get fullNotice(): Locator {
    return this.page.getByText(/자산은 \d+개까지 적을 수 있어요$/);
  }

  /** 그 그룹 구획. 항목이 없어도 구획은 그려진다. */
  group(label: AssetGroupLabel): Locator {
    return this.page.getByRole('region', { name: label, exact: true });
  }

  /** 그 그룹의 소계. 서버가 센 값이다. */
  groupTotal(label: AssetGroupLabel): Locator {
    return this.group(label).getByTestId(TEST_IDS.assetGroupTotal);
  }

  /** 그 그룹 안의 항목 줄 전부. */
  rows(label: AssetGroupLabel): Locator {
    return this.group(label).getByTestId(TEST_IDS.assetItemRow);
  }

  /** 화면 어디에 있든 그 이름의 항목 줄. 몇 개인지 셀 때 쓴다. */
  row(name: string): Locator {
    return this.page
      .getByTestId(TEST_IDS.assetItemRow)
      .filter({ has: this.page.getByText(name, { exact: true }) });
  }

  /** 그 그룹에 항목을 더하는 버튼. 구획마다 이름이 달라 그것으로 집는다. */
  addButton(label: AssetGroupLabel): Locator {
    return this.page.getByRole('button', { name: `${label} 항목 추가`, exact: true });
  }

  /** 그 줄의 칩 하나(종류, 매달, 수익률, 현재가 없음). */
  rowChip(name: string, text: string | RegExp): Locator {
    return this.row(name).locator('i').filter({ hasText: text });
  }

  /**
   * 그 그룹 ＋ 의 누르는 자리가 가로세로 몇 px 까지 닿나.
   *
   * 보이는 동그라미는 30px 이고 누르는 자리는 가상 요소로 넓혔다. 상자 크기로는 못 재서,
   * 가운데에서 바깥으로 1px 씩 나가며 그 점을 누르면 ＋ 가 받는지 본다.
   */
  async plusHitSize(label: AssetGroupLabel): Promise<{ width: number; height: number }> {
    // 화면 밖이나 아래 탭바 뒤의 점은 다른 요소를 준다. 가운데로 올린 뒤 잰다.
    return this.addButton(label).evaluate((button) => {
      button.scrollIntoView({ block: 'center' });
      const rect = button.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const hits = (x: number, y: number) => {
        const at = document.elementFromPoint(x, y);
        return at != null && (at === button || button.contains(at));
      };
      const reach = (dx: number, dy: number) => {
        let step = 0;
        while (step < 60 && hits(cx + dx * (step + 1), cy + dy * (step + 1))) step += 1;
        return step;
      };
      return { width: reach(-1, 0) + reach(1, 0) + 1, height: reach(0, -1) + reach(0, 1) + 1 };
    });
  }

  /** 그 항목을 고치려고 누르는 줄. */
  editButton(name: string): Locator {
    return this.page.getByRole('button', { name: `${name} 고치기`, exact: true });
  }

  /** 빈 상태에서 첫 항목을 적는다. */
  async start(input: { group: AssetGroupLabel; name?: string; amount: number }): Promise<void> {
    await this.startButton.click();
    await this.sheet.waitOpen();
    await this.sheet.fill(input);
    await this.sheet.save();
  }

  /** 그 그룹에 항목 하나를 더한다. */
  async add(
    label: AssetGroupLabel,
    input: { group?: AssetGroupLabel; name?: string; amount: number },
  ): Promise<void> {
    await this.addButton(label).click();
    await this.sheet.waitOpen();
    await this.sheet.fill({ ...input, group: input.group ?? label });
    await this.sheet.save();
  }

  /** 이미 적어 둔 줄을 눌러 시트만 연다. 지금 무엇이 들어 있는지 볼 때 쓴다. */
  async openEdit(name: string): Promise<void> {
    await this.editButton(name).click();
    await this.sheet.waitOpen();
  }

  /** 이미 적어 둔 줄을 고친다. */
  async edit(
    name: string,
    input: { group?: AssetGroupLabel; name?: string; amount?: number },
  ): Promise<void> {
    await this.openEdit(name);
    await this.sheet.fill(input);
    await this.sheet.save();
  }

  /** 이미 적어 둔 줄을 지운다. */
  async remove(name: string): Promise<void> {
    await this.openEdit(name);
    await this.sheet.remove();
  }

  /**
   * 본문이 실제로 차지한 가로 폭과 화면에 보이는 폭.
   *
   * `innerWidth` 와 견주면 안 된다. 본문이 넘치면 브라우저가 축소하면서 `innerWidth` 도
   * 함께 커져 둘이 늘 같아진다(항진 명제다). 축소해도 안 움직이는 것은 visual viewport 다.
   */
  async widths(): Promise<{ content: number; visible: number }> {
    return this.page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      visible: Math.ceil(window.visualViewport?.width ?? window.innerWidth),
    }));
  }

  /** 순자산 카드. 그 안의 글자만 잡으려고 좁힌다. */
  private get netWorthCard(): Locator {
    return this.page.getByRole('region', { name: '순자산', exact: true });
  }
}

/** 자산 항목 시트. 더할 때와 고칠 때가 같은 시트이고 제목만 다르다. */
class AssetItemSheet {
  private readonly page: Page;
  private readonly root: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByRole('dialog', { name: /^(.+ 항목 추가|자산 항목 고치기)$/ });
  }

  /** 시트 자체. 저장이 막혔을 때 닫히지 않고 남아 있는지 볼 때 쓴다. */
  get dialog(): Locator {
    return this.root;
  }

  /** 더하는 시트. 제목이 「<그룹> 항목 추가」 다. */
  get addDialog(): Locator {
    return this.page.getByRole('dialog', { name: /^.+ 항목 추가$/ });
  }

  get editDialog(): Locator {
    return this.page.getByRole('dialog', { name: '자산 항목 고치기', exact: true });
  }

  get nameField(): Locator {
    return this.root.getByLabel('이름', { exact: true });
  }

  /**
   * 금액 입력칸.
   *
   * 라벨이 입력칸을 감싸는 모양이라 접근성 이름에 단위 `원` 까지 붙는다.
   * 이름을 못 박으면 잡히지 않는다. 예산 시트도 같은 이유로 부분일치로 집는다.
   */
  get amountField(): Locator {
    return this.root.getByLabel(/^금액/);
  }

  /** 이름이 그 말로 시작하는 입력칸(「갖고 있는 수량」, 「넣은 돈」, 「지금 1주 가격」, 「지금 금액」). */
  field(label: string): Locator {
    return this.root.getByLabel(new RegExp(`^${label}`));
  }

  /** 투자 종류 칩 하나. */
  kindChoice(label: InvestKindLabel): Locator {
    return this.root
      .getByRole('radiogroup', { name: '투자 종류' })
      .getByRole('radio', { name: label, exact: true });
  }

  /** 맨 위 ‹ . */
  get backButton(): Locator {
    return this.root.getByRole('button', { name: /뒤로/ });
  }

  get saveButton(): Locator {
    return this.root.getByRole('button', { name: '저장', exact: true });
  }

  /** 고치는 시트에만 있다. */
  get deleteButton(): Locator {
    return this.root.getByRole('button', { name: '지우기', exact: true });
  }

  /** 저장이 막힌 이유를 시트 안에서 적는 한 줄. 문구는 서버가 정한다. */
  get errorText(): Locator {
    return this.root.getByRole('alert');
  }

  /** 그룹 갈래 하나. 지금 고른 것은 `aria-checked` 로 알린다. */
  groupChoice(label: AssetGroupLabel): Locator {
    return this.root
      .getByRole('radiogroup', { name: '자산 그룹' })
      .getByRole('radio', { name: label, exact: true });
  }

  async waitOpen(): Promise<void> {
    await expect(this.root).toBeVisible();
  }

  async waitClosed(): Promise<void> {
    await expect(this.root).toHaveCount(0);
  }

  /**
   * 그룹 갈래마다 이름이 몇 줄로 그려졌나.
   *
   * 넷을 한 줄에 늘어놓았다. 글자가 칸보다 넓으면 넘치는 게 아니라 **두 줄로 접혀서**,
   * 34px 짜리 칸 안에서 위아래가 잘린다. 그래서 폭이 아니라 줄 수를 센다.
   * 글자를 감싼 범위(Range)가 만든 줄 상자 개수가 곧 줄 수다.
   */
  async groupChoiceLines(): Promise<{ label: string; lines: number }[]> {
    return this.root.getByRole('radiogroup', { name: '자산 그룹' }).evaluate((group) =>
      [...group.querySelectorAll<HTMLElement>('[role="radio"]')].map((item) => {
        const range = document.createRange();
        range.selectNodeContents(item);
        return { label: item.textContent ?? '', lines: range.getClientRects().length };
      }),
    );
  }

  /** 넘긴 것만 채운다. 고칠 때 금액만 바꾸는 것과 이름만 바꾸는 것이 둘 다 된다. */
  async fill(input: { group?: AssetGroupLabel; name?: string; amount?: number }): Promise<void> {
    if (input.group != null) {
      await this.groupChoice(input.group).click();
      await expect(this.groupChoice(input.group)).toHaveAttribute('aria-checked', 'true');
    }
    if (input.name != null) await this.nameField.fill(input.name);
    if (input.amount != null) await this.amountField.fill(String(input.amount));
  }

  /** 저장한다. 시트가 닫히면 저장이 끝난 것이다. */
  async save(): Promise<void> {
    await this.saveButton.click();
    await this.waitClosed();
  }

  async remove(): Promise<void> {
    await this.deleteButton.click();
    await this.waitClosed();
  }
}

/** 「캡처로 채우기」 시트. 입구, 읽는 중, 검토, 못 읽음이 한 시트 안에서 바뀐다. */
class CaptureArea {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** 시트 본문. `data-step` 이 intro, reading, review, fail 중 하나다. */
  get body(): Locator {
    return this.page.getByTestId(TEST_IDS.captureSheet);
  }

  /** 입구 한 줄. */
  get lead(): Locator {
    return this.body.getByText(/^은행이나 증권 앱의 잔액 화면을 올리면 읽어요/);
  }

  get pickButton(): Locator {
    return this.body.getByRole('button', { name: '사진 고르기', exact: true });
  }

  /** 시트 본문 안 버튼 전부. 입구에는 「사진 고르기」 하나뿐이어야 한다. */
  get buttons(): Locator {
    return this.body.getByRole('button');
  }

  get reading(): Locator {
    return this.page.getByTestId(TEST_IDS.captureReading);
  }

  /** 검토 줄 전부. `data-state` 가 same, changed, new 중 하나다. */
  get rows(): Locator {
    return this.page.getByTestId(TEST_IDS.captureRow);
  }

  row(name: string): Locator {
    return this.rows.filter({ hasText: name });
  }

  get saveButton(): Locator {
    return this.body.getByRole('button', { name: /줄 저장$/ });
  }

  get fail(): Locator {
    return this.page.getByTestId(TEST_IDS.captureFail);
  }

  get retryButton(): Locator {
    return this.fail.getByRole('button', { name: '다른 사진 고르기', exact: true });
  }

  get manualButton(): Locator {
    return this.fail.getByRole('button', { name: '직접 적기', exact: true });
  }

  async waitStep(step: 'intro' | 'reading' | 'review' | 'fail'): Promise<void> {
    await expect(this.body).toHaveAttribute('data-step', step);
  }
}

/** 「바뀐 것만 고쳐요」. 항목마다 지금 금액 칸 하나와 「저장」. */
class CheckinSheet {
  private readonly root: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('dialog', { name: '바뀐 것만 고쳐요', exact: true });
  }

  get dialog(): Locator {
    return this.root;
  }

  /** 그 항목의 금액 칸. */
  amount(name: string): Locator {
    return this.root.getByLabel(`${name} 금액`, { exact: true });
  }

  get saveButton(): Locator {
    return this.root.getByRole('button', { name: '저장', exact: true });
  }
}
