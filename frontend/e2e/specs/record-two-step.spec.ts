import type { Page } from '@playwright/test';

import { formatCurrency, shiftDay, toLedgerDate } from '../../src/shared/lib/format';
import { logsNamed, pressSystemBack, readLogs } from '../support/aitMock';
import { expect, test } from '../support/fixtures';
import { horizontalScrollers } from '../support/overflow';

/**
 * 기록하기 두 화면. 첫 화면에서 언제, 어디에, 어떻게, 무엇을 고르고 둘째 화면에서 금액을 친다.
 *
 * 지키는 것:
 * - 처음 열면 오늘, 내 가계부, 직접 입력, 지출이 골라져 있어 「다음」 한 번이면 금액 화면이다.
 * - 둘째 화면에는 금액, 분류, 태그 칩, 저장, 키패드만 선다. 종류와 날짜는 첫 화면에만 있다.
 * - 모든 창 왼쪽 위 ‹ 는 한 단계 뒤로 가고, 돌아가도 적던 금액과 태그가 남는다.
 * - 저장 뒤 화면은 「내 가계부에 적었어요」 가 가장 크고 남은 예산 문장이 없다.
 * - 한 기록의 로그는 처음부터 저장까지 같은 flow_id 로 이어지고, 다시 열면 새 flow_id 다.
 */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** `2026-10-05` 를 화면이 쓰는 `10월 5일 (일)` 로. 요일은 그 날짜의 달력 값으로 따로 센다. */
function dayText(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  return `${month}월 ${day}일 (${WEEKDAYS[weekday]})`;
}

function today(): string {
  return toLedgerDate(new Date());
}

/** 기록 흐름을 잇는 네 로그. */
const FLOW_EVENTS = ['record_started', 'record_setup_done', 'save_requested', 'save_result'];

async function flowIdsOf(page: Page, names: string[]): Promise<string[]> {
  const logs = await readLogs(page);
  return [
    ...new Set(
      logs.filter((log) => names.includes(log.name)).map((log) => String(log.params.flow_id)),
    ),
  ];
}

test.describe('첫 화면', () => {
  test('처음 열면 날짜, 방법 넷, 종류, 「다음」 순서로 서고 기본값이 골라져 있다', async ({
    home,
    recordSheet,
  }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();

    await test.step('맨 위 날짜는 오늘이고 왼쪽에 ‹ 가 있다', async () => {
      await expect(recordSheet.dayButton).toContainText(`오늘 ${dayText(today())}`);
      await expect(recordSheet.backButton).toBeVisible();
    });

    await test.step('방법 이름 넷과 기본값', async () => {
      await expect(recordSheet.methodTabs).toHaveText([
        '직접 입력',
        '영수증 찍기',
        '캡처로 정리',
        '글로 쓰기',
      ]);
      await expect(recordSheet.methodTab('직접 입력')).toHaveAttribute('aria-checked', 'true');
      await expect(recordSheet.kindChip('지출')).toHaveAttribute('aria-checked', 'true');
      await expect(recordSheet.nextButton).toHaveText('다음');
      // 공유 가계부가 없는 사람에게는 적을 곳 줄이 없다.
      await expect(recordSheet.destination.group).toHaveCount(0);
    });

    await test.step('위에서 아래로 날짜, 방법, 종류, 「다음」 이다', async () => {
      const tops = await Promise.all(
        [
          recordSheet.dayButton,
          recordSheet.wayGroup,
          recordSheet.kindGroup,
          recordSheet.nextButton,
        ].map(async (part) => (await part.boundingBox())?.y ?? Number.NaN),
      );
      expect(tops.every((top) => Number.isFinite(top))).toBe(true);
      expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    });

    await test.step('「다음」 한 번이면 금액 화면이다', async () => {
      await recordSheet.next();
      await expect(recordSheet.amountTitle).toHaveText('얼마 썼어요?');
    });
  });

  test('날짜를 누르면 「언제예요?」 에서 오늘, 어제, 그저께, 다른 날을 고른다', async ({
    home,
    recordSheet,
  }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();

    await recordSheet.dayButton.click();
    await expect(recordSheet.sheet.getByText('언제예요?', { exact: true })).toBeVisible();
    await expect(recordSheet.dayRow('오늘')).toContainText(dayText(today()));
    await expect(recordSheet.dayRow('어제')).toContainText(dayText(shiftDay(today(), -1)));
    await expect(recordSheet.dayRow('그저께')).toContainText(dayText(shiftDay(today(), -2)));
    await expect(recordSheet.otherDayField).toBeAttached();

    await recordSheet.dayRow('어제').click();
    // 고르면 곧 첫 화면으로 돌아오고 머리 날짜가 바뀐다.
    await expect(recordSheet.wayGroup).toBeVisible();
    await expect(recordSheet.dayButton).toContainText(`어제 ${dayText(shiftDay(today(), -1))}`);

    const older = shiftDay(today(), -9);
    await recordSheet.chooseDay(older);
    await expect(recordSheet.dayButton).toContainText(dayText(older));
  });

  test('글로 쓰기와 사진 둘을 고르면 종류 칩이 사라지고 아래 버튼 이름이 바뀐다', async ({
    home,
    recordSheet,
  }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();

    const cases = [
      { way: '글로 쓰기', cta: '다음' },
      { way: '영수증 찍기', cta: '카메라 열기' },
      { way: '캡처로 정리', cta: '사진 고르기' },
    ] as const;
    for (const { way, cta } of cases) {
      await recordSheet.methodTab(way).click();
      await expect(recordSheet.methodTab(way)).toHaveAttribute('aria-checked', 'true');
      await expect(recordSheet.kindGroup).toHaveCount(0);
      await expect(recordSheet.nextButton).toHaveText(cta);
    }

    await recordSheet.methodTab('직접 입력').click();
    await expect(recordSheet.kindGroup).toBeVisible();
    await expect(recordSheet.nextButton).toHaveText('다음');
  });

  test('우리 집 가계부를 고르면 종류 칩 가운데 지출만 켜진다', async ({
    home,
    prep,
    recordSheet,
  }) => {
    await prep.createBook({ name: '우리 집', kind: 'family' });

    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();

    await expect(recordSheet.destination.pill('내 가계부')).toHaveAttribute('aria-pressed', 'true');
    // 수입을 골라 둔 채 공유 가계부로 옮기면 지출로 돌아와야 한다. 공유 가계부는 지출만 받는다.
    await recordSheet.kindChip('수입').click();
    await recordSheet.destination.pill('우리 집').click();
    await expect(recordSheet.destination.pill('우리 집')).toHaveAttribute('aria-pressed', 'true');
    await expect(recordSheet.kindChip('지출')).toHaveAttribute('aria-checked', 'true');
    await expect(recordSheet.kindChip('지출')).toBeEnabled();
    await expect(recordSheet.kindChip('수입')).toBeDisabled();
    await expect(recordSheet.kindChip('이체')).toBeDisabled();

    await recordSheet.destination.pill('내 가계부').click();
    await expect(recordSheet.kindChip('수입')).toBeEnabled();
    await expect(recordSheet.kindChip('이체')).toBeEnabled();

    // 공유 가계부 기록에는 태그 칸이 없다. 둘째 화면에 「＃ 태그」 칩이 서지 않는다.
    await recordSheet.destination.pill('우리 집').click();
    await recordSheet.next();
    await expect(recordSheet.amountTitle).toHaveText('얼마 썼어요?');
    await expect(recordSheet.tagChip).toHaveCount(0);
  });
});

test.describe('둘째 화면', () => {
  test('금액, 분류, 태그 칩, 키패드만 서고 금액 뒤 분류를 누르면 곧 저장된다', async ({
    home,
    recordSheet,
  }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.next();

    await expect(recordSheet.amountTitle).toHaveText('얼마 썼어요?');
    await expect(recordSheet.tagChip).toHaveText('＃ 태그');
    await expect(recordSheet.input.keypad).toBeVisible();
    await expect(recordSheet.input.categoryChip('식비')).toBeVisible();
    // 종류, 날짜, 방법은 첫 화면에만 있다.
    await expect(recordSheet.kindGroup).toBeHidden();
    await expect(recordSheet.dayButton).toBeHidden();
    await expect(recordSheet.wayGroup).toBeHidden();
    // 걷은 작은 글씨. 금액 아래 안내와 분류 아래 카테고리 관리 안내가 다시 서면 안 된다.
    await expect(recordSheet.input.hint).toHaveCount(0);
    await expect(recordSheet.sheet).not.toContainText('앞에 보일 분류를 고를 수 있어요');

    await recordSheet.input.enterAmount(12_000);
    await recordSheet.input.pickCategory('식비');
    await recordSheet.feedback.waitSaved();
    await expect(recordSheet.feedback.savedLabel).toBeVisible();
  });

  test('분류를 먼저 고르면 「저장」 을 눌러 저장한다', async ({ home, recordSheet }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.next();

    await recordSheet.input.pickCategory('식비');
    await expect(recordSheet.input.pickedCategory).toBeVisible();
    await recordSheet.input.enterAmount(8_000);
    await recordSheet.input.saveButton.click();
    await recordSheet.feedback.waitSaved();
    await expect(recordSheet.feedback.savedLabel).toBeVisible();
  });

  test('분류만 고르고 ‹ 로 첫 화면에 갔다 와도 그 분류가 골라져 있다', async ({
    home,
    recordSheet,
  }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.next();

    await recordSheet.input.pickCategory('식비');
    await expect(recordSheet.input.pickedCategory).toContainText('식비');
    await recordSheet.back();
    await expect(recordSheet.wayGroup).toBeVisible();
    await recordSheet.next();
    await expect(recordSheet.input.pickedCategory).toContainText('식비');
  });
});

test.describe('저장 뒤 화면', () => {
  test('「내 가계부에 적었어요」 가 가장 크고 남은 예산 문장이 없다', async ({
    home,
    prep,
    recordSheet,
  }) => {
    // 예산이 있어야 예전에는 남은 예산 문장이 섰다. 없어진 것을 보려면 설 조건을 만든다.
    await prep.setBudget(500_000);

    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.input.enterAmount(12_000);
    await recordSheet.input.pickCategory('식비');
    await recordSheet.feedback.waitSaved();

    await expect(recordSheet.feedback.savedLabel).toBeVisible();
    await expect(recordSheet.sheet).not.toContainText('남은 예산');
    await expect(recordSheet.sheet).not.toContainText('예산 안에서');
    await expect(recordSheet.feedback.editHint).toHaveCount(0);

    const sizes = await recordSheet.sheet.evaluate((sheet) => {
      const label = '내 가계부에 적었어요';
      let labelSize = 0;
      let otherMax = 0;
      let biggest = '';
      for (const node of sheet.querySelectorAll<HTMLElement>('*')) {
        const own = [...node.childNodes]
          .filter((child) => child.nodeType === Node.TEXT_NODE)
          .map((child) => child.textContent?.trim() ?? '')
          .join('');
        // ‹ 같은 기호 하나는 글이 아니라 단추 그림이다. 글자나 숫자가 있는 것만 잰다.
        if (!/[\p{L}\p{N}]/u.test(own) || node.offsetParent == null) continue;
        const size = parseFloat(getComputedStyle(node).fontSize);
        if (own === label) labelSize = Math.max(labelSize, size);
        else if (size > otherMax) {
          otherMax = size;
          biggest = `${node.className} 「${own}」`;
        }
      }
      return { labelSize, otherMax, biggest };
    });
    expect(sizes.labelSize).toBeGreaterThan(0);
    expect(sizes.labelSize, `가장 큰 다른 글: ${sizes.biggest}`).toBeGreaterThanOrEqual(
      sizes.otherMax,
    );
  });

  test('지출은 상호와 메모가 아이콘 줄 뒤에 접혀 있고 결제 수단이 보인다', async ({
    home,
    recordSheet,
  }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.input.enterAmount(12_000);
    await recordSheet.input.pickCategory('식비');
    await recordSheet.feedback.waitSaved();

    await expect(recordSheet.feedback.merchantField).toBeHidden();
    await expect(recordSheet.feedback.memoField).toBeHidden();
    await expect(recordSheet.feedback.merchantOpener).toBeVisible();
    await expect(recordSheet.feedback.memoOpener).toBeVisible();
    await expect(recordSheet.feedback.paymentGroup).toBeVisible();

    await recordSheet.feedback.merchantOpener.click();
    await expect(recordSheet.feedback.merchantField).toBeVisible();
  });

  test('이체는 「메모 남기기」 하나만 있고 결제 수단이 없다', async ({ home, recordSheet }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.chooseKind('이체');
    // 이체에는 태그 칩도, 걷은 이체 안내 줄도 없다.
    await expect(recordSheet.amountTitle).toHaveText('얼마 옮겼어요?');
    await expect(recordSheet.tagChip).toHaveCount(0);
    await expect(recordSheet.sheet).not.toContainText('내 계좌끼리 옮긴 돈');
    await expect(recordSheet.sheet).not.toContainText('지출과 수입에 안 들어가요');
    await recordSheet.input.enterAmount(100_000);
    await recordSheet.input.saveButton.click();
    await recordSheet.feedback.waitSaved();

    // 분류가 없어도 줄 이름은 「기록」 이 아니라 「이체」 다.
    await expect(recordSheet.feedback.savedRowTitle).toHaveText('이체');
    await expect(recordSheet.feedback.memoOpener).toBeVisible();
    await expect(recordSheet.feedback.merchantOpener).toHaveCount(0);
    await expect(recordSheet.feedback.paymentGroup).toHaveCount(0);
  });
});

test.describe('뒤로 가기', () => {
  test('둘째 화면 ‹ 는 첫 화면으로 가고 금액과 태그가 남는다', async ({
    home,
    prep,
    recordSheet,
  }) => {
    await prep.addTag('출장');

    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.input.enterAmount(12_000);
    await recordSheet.pickTag('출장');

    await recordSheet.back();
    await expect(recordSheet.wayGroup).toBeVisible();
    await expect(recordSheet.sheet).toBeVisible();

    await recordSheet.next();
    await expect(recordSheet.input.amountText).toHaveText(formatCurrency(12_000));
    await expect(recordSheet.tagChip).toHaveText('＃ 출장');

    // 종류를 바꾸면 태그를 비운다. 지출 태그가 수입 기록에 실리면 안 된다.
    await recordSheet.back();
    await recordSheet.kindChip('수입').click();
    await recordSheet.next();
    await expect(recordSheet.amountTitle).toHaveText('얼마 벌었어요?');
    await expect(recordSheet.tagChip).toHaveText('＃ 태그');
  });

  test('날짜와 태그 단계의 ‹ 는 그 앞 화면으로 간다', async ({ home, prep, recordSheet }) => {
    await prep.addTag('출장');

    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();

    await recordSheet.dayButton.click();
    await expect(recordSheet.dayRow('오늘')).toBeVisible();
    await recordSheet.back();
    await expect(recordSheet.wayGroup).toBeVisible();
    await expect(recordSheet.dayButton).toContainText('오늘');

    await recordSheet.next();
    await recordSheet.tagChip.click();
    await expect(recordSheet.tagGroup).toBeVisible();
    await recordSheet.back();
    await expect(recordSheet.amountTitle).toBeVisible();
    await expect(recordSheet.tagChip).toHaveText('＃ 태그');
  });

  test('폰 뒤로가기와 Esc 도 시트 안 ‹ 와 같이 한 단계씩 물러난다', async ({
    home,
    page,
    recordSheet,
  }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();

    await recordSheet.dayButton.click();
    await expect(recordSheet.dayRow('오늘')).toBeVisible();
    await pressSystemBack(page);
    await expect(recordSheet.wayGroup).toBeVisible();

    await recordSheet.next();
    await expect(recordSheet.amountTitle).toBeVisible();
    await pressSystemBack(page);
    await expect(recordSheet.wayGroup).toBeVisible();

    await recordSheet.next();
    await expect(recordSheet.amountTitle).toBeVisible();
    await recordSheet.closeByEsc();
    await expect(recordSheet.wayGroup).toBeVisible();
    await expect(recordSheet.sheet).toBeVisible();
  });

  test('첫 화면 ‹ 는 창을 닫고, 적던 금액이 있으면 먼저 묻는다', async ({ home, recordSheet }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.back();
    await recordSheet.waitClosed();

    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.input.enterAmount(3_000);
    await recordSheet.back();
    await expect(recordSheet.wayGroup).toBeVisible();
    await recordSheet.back();
    await expect(recordSheet.leave.dialog).toBeVisible();
    await recordSheet.leave.leaveButton.click();
    await recordSheet.waitClosed();
  });

  test('저장 뒤 화면의 ‹ 와 폰 뒤로가기는 적어 둔 상호를 보내고 창을 닫는다', async ({
    home,
    page,
    recordSheet,
  }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.input.enterAmount(12_000);
    await recordSheet.input.pickCategory('식비');
    await recordSheet.feedback.waitSaved();
    await recordSheet.feedback.openMerchant();
    await recordSheet.feedback.merchantField.fill('역전우동');
    await recordSheet.feedback.backButton.click();
    await recordSheet.waitClosed();
    await expect(home.today.row('역전우동')).toBeVisible();

    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.input.enterAmount(5_000);
    await recordSheet.input.pickCategory('식비');
    await recordSheet.feedback.waitSaved();
    await recordSheet.feedback.openMerchant();
    // 칸에서 빠져나오지 않은 채 누른다. blur 가 아니라 「확인」 과 같은 길이 상호를 보내야 한다.
    await recordSheet.feedback.merchantField.fill('김밥천국');
    await pressSystemBack(page);
    await recordSheet.waitClosed();
    await expect(home.today.row('김밥천국')).toBeVisible();
  });

  test('「그만둘까요?」 창이 떠 있을 때 뒤로가기와 Esc 는 그 창만 접는다', async ({
    home,
    page,
    recordSheet,
  }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.input.enterAmount(3_000);

    await recordSheet.dragDown();
    await expect(recordSheet.leave.dialog).toBeVisible();
    await pressSystemBack(page);
    await expect(recordSheet.leave.dialog).toHaveCount(0);
    await expect(recordSheet.amountTitle).toBeVisible();

    await recordSheet.dragDown();
    await expect(recordSheet.leave.dialog).toBeVisible();
    await recordSheet.closeByEsc();
    await expect(recordSheet.leave.dialog).toHaveCount(0);
    await expect(recordSheet.amountTitle).toBeVisible();
    await expect(recordSheet.input.amountText).toHaveText(formatCurrency(3_000));

    await expect
      .poll(async () => (await logsNamed(page, 'record_leave_asked')).map((log) => log.params.result))
      .toEqual(['asked', 'stayed', 'asked', 'stayed']);
    expect(await logsNamed(page, 'record_back')).toHaveLength(0);
  });

  test('앞날 확인 창은 뒤로가기면 그 창만 접히고, 「날짜 고치기」 는 「언제예요?」 로 간다', async ({
    home,
    page,
    recordSheet,
  }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.chooseDay(shiftDay(today(), 1));
    await recordSheet.next();
    await recordSheet.input.enterAmount(5_000);

    await recordSheet.input.pickCategory('식비');
    await expect(recordSheet.futureDayConfirm.dialog).toBeVisible();
    await pressSystemBack(page);
    await expect(recordSheet.futureDayConfirm.dialog).toHaveCount(0);
    await expect(recordSheet.amountTitle).toBeVisible();

    await recordSheet.input.pickCategory('식비');
    await expect(recordSheet.futureDayConfirm.dialog).toBeVisible();
    await recordSheet.futureDayConfirm.fixButton.click();
    await expect(recordSheet.sheet.getByText('언제예요?', { exact: true })).toBeVisible();
    await recordSheet.dayRow('오늘').click();
    await expect(recordSheet.dayButton).toContainText(`오늘 ${dayText(today())}`);

    // 날을 오늘로 고쳤으니 둘째 화면에 들어서도 앞날 창이 다시 뜨지 않는다. 적던 금액은 남는다.
    await recordSheet.next();
    await expect(recordSheet.amountTitle).toBeVisible();
    await expect(recordSheet.futureDayConfirm.dialog).toHaveCount(0);
    await expect(recordSheet.input.amountText).toHaveText(formatCurrency(5_000));
  });
});

test.describe('글로 쓰기', () => {
  test('저장한 결과 화면의 뒤로가기와 ‹ 는 창을 닫고, 다시 열면 빈 입력칸이다', async ({
    home,
    page,
    prep,
    recordSheet,
  }) => {
    // 예산이 있어야 예전에는 저장 뒤에 남은 예산 문장이 섰다.
    await prep.setBudget(500_000);

    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.chooseWay('글로 쓰기');
    await expect(recordSheet.nl.textarea).toBeVisible();
    // 걷은 작은 글씨.
    await expect(recordSheet.sheet).not.toContainText('한 번에 여러 건을 적어도 돼요');

    await recordSheet.nl.analyze('점심 12000');
    await recordSheet.nl.save();
    await expect(recordSheet.nl.panel).not.toContainText('남은 예산');

    await test.step('로그: 종류 칩이 없는 방법이라 kind 가 없고, 저장 결과에 시간이 실린다', async () => {
      const setup = (await logsNamed(page, 'record_setup_done')).at(-1)?.params;
      expect(setup?.way).toBe('nl');
      expect(setup).not.toHaveProperty('kind');
      const saved = (await logsNamed(page, 'save_result')).at(-1)?.params;
      expect(saved).toMatchObject({ method: 'text', result: 'ok', defaults: false });
      expect(typeof saved?.flow_ms).toBe('number');
      expect(typeof saved?.setup_ms).toBe('number');
      // 줄글은 둘째 화면을 지나지 않는다.
      expect(saved).not.toHaveProperty('amount_ms');
    });

    await pressSystemBack(page);
    await recordSheet.waitClosed();

    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.chooseWay('글로 쓰기');
    await expect(recordSheet.nl.textarea).toBeVisible();
    await expect(recordSheet.nl.textarea).toHaveValue('');
    await expect(recordSheet.nl.savedTitle).toHaveCount(0);

    await recordSheet.nl.analyze('저녁 9000');
    await recordSheet.nl.save();
    await recordSheet.back();
    await recordSheet.waitClosed();
  });

  test('검토 화면 ‹ 로 버리면 묻고 답한 것이 남고, 서버의 검토 묶음도 지운다', async ({
    home,
    page,
    recordSheet,
  }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    // 지난 날을 골라 두어도 「날짜가 없는 건 …로 적어요」 안내는 걷었다.
    await recordSheet.chooseDay(shiftDay(today(), -1));
    await recordSheet.chooseWay('글로 쓰기');
    await expect(recordSheet.sheet).not.toContainText('날짜가 없는 건');
    await recordSheet.nl.analyze('점심 12000');

    await recordSheet.back();
    await expect(recordSheet.panelLeave.dialog).toBeVisible();
    await recordSheet.panelLeave.stayButton.click();
    await expect(recordSheet.panelLeave.dialog).toHaveCount(0);

    const deleted = page.waitForRequest(
      (request) => request.method() === 'DELETE' && /\/api\/v1\/imports\//.test(request.url()),
    );
    await recordSheet.leavePanel();
    await deleted;

    await expect
      .poll(async () =>
        (await logsNamed(page, 'record_leave_asked')).map((log) => [
          log.params.result,
          log.params.pending,
        ]),
      )
      .toEqual([
        ['asked', 1],
        ['stayed', 1],
        ['asked', 1],
        ['left', 1],
      ]);
    expect((await logsNamed(page, 'record_leave_asked'))[0].params.reason).toBe('parsed');
    await expect
      .poll(async () => (await logsNamed(page, 'review_cancelled')).map((log) => log.params))
      .toMatchObject([{ method: 'text', candidate_count: 1 }]);
  });

  test('검토 화면 「취소」 로 닫으면 record_closed 가 cancel 로 남는다', async ({
    home,
    page,
    recordSheet,
  }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.chooseWay('글로 쓰기');
    await recordSheet.nl.analyze('점심 12000');
    await recordSheet.nl.cancelButton.click();
    await recordSheet.waitClosed();

    await expect
      .poll(async () => (await logsNamed(page, 'record_closed')).at(-1)?.params)
      .toMatchObject({ step: 'nl', how: 'cancel', drafted: 'none' });
  });
});

/** 태그 조회만 막는다. CORS 헤더가 없으면 앱이 서버 오류가 아니라 네트워크 실패로 읽는다. */
const TAGS = '**/api/v1/tags*';
const TAGS_DOWN = {
  status: 500,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: '' } }),
};

test.describe('태그를 못 불러왔을 때', () => {
  test.use({
    // 우리가 막은 응답이다. 브라우저가 그것을 콘솔에 적는 것이고 앱이 낸 오류가 아니다.
    consoleErrorAllowList: [/Failed to load resource.*500/],
  });

  test('태그 단계에 오류와 「다시 시도」 가 서고, 다시 시도하면 목록이 온다', async ({
    home,
    page,
    prep,
    recordSheet,
  }) => {
    await prep.addTag('출장');
    await page.route(TAGS, (route) =>
      route.request().method() === 'GET' ? route.fulfill(TAGS_DOWN) : route.continue(),
    );

    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.next();
    await recordSheet.tagChip.click();

    // 서버 오류는 한 번 더 불러 본 뒤에야 실패로 확정된다.
    await expect(recordSheet.sheet.getByText('태그를 불러오지 못했어요', { exact: true })).toBeVisible(
      { timeout: 10_000 },
    );
    const retry = recordSheet.sheet.getByRole('button', { name: '다시 시도', exact: true });
    await expect(retry).toBeVisible();

    await page.unroute(TAGS);
    await retry.click();
    await expect(recordSheet.tagOption('출장')).toBeVisible();
  });
});

/** 이름이 긴 태그 스무 개. 열두 자가 상한이다. */
const TWENTY_TAGS = Array.from({ length: 20 }, (_, index) =>
  index % 2 === 0 ? `긴이름태그열두자까지${String(index).padStart(2, '0')}` : `태그${index}`,
);

for (const viewport of [
  { width: 374, height: 667 },
  { width: 344, height: 740 },
]) {
  test.describe(`좁은 폭 ${viewport.width}`, () => {
    test.use({ viewport });

    test('태그가 스무 개여도 가로로 넘치지 않고 태그 단계 안에서만 스크롤된다', async ({
      home,
      page,
      prep,
      recordSheet,
    }) => {
      for (const name of TWENTY_TAGS) await prep.addTag(name);

      await home.open();
      await home.waitReady();
      await home.recordButton.click();
      await recordSheet.waitOpen();
      await recordSheet.next();

      await test.step('둘째 화면은 스크롤 없이 키패드 맨 아래 줄까지 든다', async () => {
        await expect(recordSheet.amountTitle).toBeVisible();
        expect(await recordSheet.overflowY()).toBe(0);
        await expect(recordSheet.input.numberKey('0')).toBeInViewport({ ratio: 1 });
      });

      await recordSheet.tagChip.click();
      await expect(recordSheet.tagGroup).toBeVisible();
      await expect(recordSheet.tagGroup.getByRole('button')).toHaveCount(TWENTY_TAGS.length);

      await test.step('태그 단계', async () => {
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          viewport.width,
        );
        expect(await recordSheet.horizontalScrollers()).toEqual([]);
        // 시트 전체가 아니라 태그 격자만 구른다. 시트가 구르면 손잡이가 밀려 닫기가 안 먹는다.
        expect(await recordSheet.overflowY()).toBe(0);
      });

      const longest = TWENTY_TAGS[18];
      await recordSheet.tagOption(longest).scrollIntoViewIfNeeded();
      await recordSheet.tagOption(longest).click();
      await expect(recordSheet.amountTitle).toBeVisible();
      await expect(recordSheet.tagChip).toHaveText(`＃ ${longest}`);

      await test.step('긴 태그를 고른 둘째 화면', async () => {
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          viewport.width,
        );
        expect(await horizontalScrollers(page)).toEqual([]);
        const chip = await recordSheet.tagChip.boundingBox();
        expect(chip?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(120);
        // 폭만으로는 말줄임이 먹었는지 모른다. flex 계열이면 글자가 잘리기만 하고 「…」 가 안 붙는다.
        const clip = await recordSheet.tagChip.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            cut: element.scrollWidth > element.clientWidth,
            textOverflow: style.textOverflow,
            display: style.display,
          };
        });
        expect(clip.cut).toBe(true);
        expect(clip.textOverflow).toBe('ellipsis');
        expect(['flex', 'inline-flex']).not.toContain(clip.display);
      });
    });
  });
}

test.describe('로그', () => {
  test('한 기록의 시작부터 저장 결과까지 같은 flow_id 로 이어지고, ‹ 뒤 다시 「다음」 은 again 이다', async ({
    home,
    page,
    recordSheet,
  }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.next();
    await recordSheet.input.enterAmount(12_000);

    await recordSheet.back();
    await expect
      .poll(async () => (await logsNamed(page, 'record_back')).at(-1)?.params)
      .toMatchObject({
        from: 'amount',
        how: 'sheet',
      });
    await recordSheet.next();
    await expect
      .poll(async () => (await logsNamed(page, 'record_setup_done')).map((log) => log.params.again))
      .toEqual([false, true]);

    await recordSheet.input.pickCategory('식비');
    await recordSheet.feedback.waitSaved();

    await expect.poll(async () => (await logsNamed(page, 'save_result')).length).toBe(1);
    for (const name of FLOW_EVENTS) {
      expect(await logsNamed(page, name), `${name} 이 남아야 한다`).not.toHaveLength(0);
    }
    const flows = await flowIdsOf(page, [...FLOW_EVENTS, 'record_back']);
    expect(flows).toHaveLength(1);
    expect(flows[0]).not.toBe('undefined');
  });

  test('첫 화면에서 폰 뒤로가기로 닫으면 record_closed 가 남고, 다시 열면 새 flow_id 다', async ({
    home,
    page,
    recordSheet,
  }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await expect(recordSheet.wayGroup).toBeVisible();

    await pressSystemBack(page);
    await recordSheet.waitClosed();

    // 개발 판은 효과를 두 번 불러 시작 로그가 겹칠 수 있다. 줄 수 대신 flow_id 로 센다.
    const [first] = await flowIdsOf(page, ['record_started']);
    expect(await flowIdsOf(page, ['record_started'])).toEqual([first]);
    await expect
      .poll(async () => (await logsNamed(page, 'record_closed')).at(-1)?.params)
      .toMatchObject({
        step: 'setup',
        how: 'back',
        drafted: 'none',
        flow_id: first,
      });

    await home.recordButton.click();
    await recordSheet.waitOpen();
    await expect.poll(async () => (await flowIdsOf(page, ['record_started'])).length).toBe(2);
    const again = (await logsNamed(page, 'record_started')).at(-1)?.params.flow_id;
    expect(again).toBeDefined();
    expect(again).not.toBe(first);
  });
});
