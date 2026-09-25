import { QUICK_LIMIT } from '../../src/shared/ledger/quickPick';
import { formatCurrency } from '../../src/shared/lib/format';
import { CAPTURE_DATA_URI, mockImagesSeeded, seedMockImages } from '../support/deviceMock';
import { expect, test } from '../support/fixtures';

/**
 * 카테고리 관리 화면.
 *
 * 준비는 API 로 심고, 행동과 단언은 화면으로 한다. 여기서 지키는 것이 셋이다.
 * 기본 카테고리는 **고칠 수는 있되 지우지는 못한다**는 것, 만든 것이 기록 시트까지 곧바로
 * 닿는다는 것, 지운 뒤에도 그 분류로 적어 둔 기록이 사라지지 않는다는 것.
 */

/**
 * 기본 카테고리와 그 순서.
 *
 * 정본은 백엔드 `app/domain/categories.py` 의 `DEFAULT_CATEGORIES` 이고, 순서는 그 파일의
 * `sort_order` 순이다. 화면 출력에서 베끼지 않고 그 파일을 읽어 적었다.
 */
const EXPENSE_CATEGORIES = [
  '식비',
  '카페·간식',
  '편의점',
  '교통',
  '쇼핑',
  '생활',
  '주거·고정비',
  '구독',
  '여가·취미',
  '건강·미용',
  '기타',
];
const INCOME_CATEGORIES = ['월급', '용돈', '부업', '기타 수입'];
const TRANSFER_CATEGORIES = ['이체'];
const BASIC_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, ...TRANSFER_CATEGORIES];

const PET = '반려동물';
/** 아이콘 파일 `16_paw`. 격자 칸은 파일 이름에서 앞 번호를 뗀 영어를 읽어 준다. */
const PET_ICON = 'paw';

/** 내가 만드는 수입 분류. '부업' 은 이제 기본 분류라 같은 이름으로는 못 만든다. */
const DIVIDEND = '배당금';
/** 아이콘 파일 `28_cash`. */
const DIVIDEND_ICON = 'cash';

/**
 * 내가 만든 지출 분류가 앉는 자리.
 *
 * `USER_CATEGORY_SORT_ORDER` 가 85 라 기본 지출(10~80) 뒤, '기타'(90) 앞이다.
 * 이것도 화면이 아니라 `app/domain/categories.py` 를 읽어 적었다.
 */
const EXPENSE_WITH_PET = [
  '식비',
  '카페·간식',
  '편의점',
  '교통',
  '쇼핑',
  '생활',
  '주거·고정비',
  '구독',
  '여가·취미',
  '건강·미용',
  PET,
  '기타',
];

// ── 두 구획 ─────────────────────────────────────────────

test('지출·수입·이체가 다른 구획에 놓인다', async ({ appShell, categories }) => {
  // 사용자가 이 화면에 닿는 길은 관리 탭 하나뿐이다. 주소로 바로 들어가지 않는다.
  await appShell.open();
  await appShell.goToTab('관리');
  await appShell.followRow('카테고리 관리');

  await appShell.expectScreen('카테고리 관리', '내가 쓰는 카테고리만 남겨요');
  await categories.waitReady();

  await expect(categories.basicRow('식비')).toBeVisible();
  await expect(categories.basicRow('카페·간식')).toBeVisible();

  // 개수를 박아 둔다. 기본 목록이 늘거나 줄면 화면보다 여기가 먼저 걸린다.
  // 숫자를 따로 적지 않고 위 배열을 센다. 두 곳에 적으면 한쪽만 고쳐진다.
  await expect(categories.basicRows).toHaveCount(BASIC_CATEGORIES.length);

  // 종류가 섞이면 수입 분류를 만들어 놓고도 어디서 쓰이는지 알 수 없다.
  // 기록 시트가 종류로 갈라 보여주는 것과 같은 모양이어야 한다.
  expect(await categories.sectionNames('지출 카테고리')).toEqual(EXPENSE_CATEGORIES);
  expect(await categories.sectionNames('수입 카테고리')).toEqual(INCOME_CATEGORIES);
  expect(await categories.sectionNames('이체')).toEqual(TRANSFER_CATEGORIES);

  // 만든 것이 하나도 없어도 만들 수 있다는 안내는 남는다.
  await expect(categories.mineRows).toHaveCount(0);
  await expect(categories.emptyNotice).toBeVisible();
});

// ── 만들기 ──────────────────────────────────────────────

test('카테고리를 만들면 새로고침 없이 목록에 나타난다', async ({ categories }) => {
  await categories.open();
  await categories.waitReady();

  await categories.addButton.click();
  await categories.sheet.waitOpen();
  await expect(categories.sheet.createDialog).toBeVisible();

  await categories.sheet.nameField.fill(PET);
  await categories.sheet.pickIcon(PET_ICON);
  await categories.sheet.saveButton.click();
  await categories.sheet.waitClosed();

  // 다시 불러오지 않고 그 자리에서 나타나야 한다.
  await expect(categories.editButton(PET)).toBeVisible();
  await expect(categories.emptyNotice).toHaveCount(0);

  // 새로 만든 것이 지출 구획 안, '기타' 앞에 선다. 앞으로 오면 기록 시트 칩의 첫 자리를 빼앗는다.
  expect(await categories.sectionNames('지출 카테고리')).toEqual(EXPENSE_WITH_PET);
  expect(await categories.rowNames()).toEqual([
    ...EXPENSE_WITH_PET,
    ...INCOME_CATEGORIES,
    ...TRANSFER_CATEGORIES,
  ]);

  // 구분을 여기서 본다. **양쪽 구획이 다 찬 뒤에** 서로의 이름이 건너편에서 안 잡혀야
  // 구분이 실제로 되고 있는 것이다. 내 구획이 비어 있을 때 '식비가 거기 없다' 를 세면,
  // 화면이 구분을 어떻게 하든 늘 참이라 아무것도 지키지 못한다.
  await expect(categories.mineRow('식비')).toHaveCount(0);
  await expect(categories.basicRow(PET)).toHaveCount(0);
  await expect(categories.mineRow(PET)).toBeVisible();
});

/**
 * 새로고침으로 확인하면 이 방어를 못 본다. useCategories 의 staleTime 이 30분이고
 * moneyQueryKeys 에 categories 가 일부러 빠져 있어, 저장 훅이 무효화를 빠뜨리면 여기서만 빨개진다.
 * home.open() 으로 바꾸면 이 검사가 무의미해진다.
 */
test('방금 만든 카테고리가 기록 시트 칩에 바로 나온다', async ({
  appShell,
  categories,
  home,
  recordSheet,
}) => {
  await categories.open();
  await categories.waitReady();
  await categories.create(PET, PET_ICON);
  await expect(categories.editButton(PET)).toBeVisible();

  // 화면을 다시 띄우지 않고 앱 안에서 홈으로 건너간다.
  await appShell.pressBack();
  await appShell.goToTab('홈');
  await home.waitReady();

  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(5_000);

  await expect(recordSheet.input.categoryChip(PET)).toBeVisible();

  // 있기만 하면 되는 것이 아니라 자리도 맞아야 한다. 서버가 정렬값을 안 넣으면
  // 새 분류가 '식비' 앞으로 와 칩 첫 자리를 빼앗는다. 관리 화면은 기본과 내 것을 구획으로
  // 갈라 그려서 그 뒤집힘이 거기서는 안 보인다. 이 줄이 그 방어를 지키는 유일한 자리다.
  //
  // **앞자리는 열한 개까지다.** 기본 지출이 이미 열한이라, 하나를 만들면 끝자리 '기타' 가
  // 「더 보기」 뒤로 밀린다. 만든 것은 '기타' 앞자리에 앉으므로 앞자리에 남는다.
  const chips = await recordSheet.input.categoryChipNames();
  expect(chips).toHaveLength(QUICK_LIMIT);
  expect(chips.at(-1)).toBe(PET);
  expect(chips[0]).toBe('식비');
  expect(chips).not.toContain('기타');

  // 보이기만 하는 것으로는 부족하다. 그 칩으로 실제 기록이 만들어져야 한다.
  await recordSheet.input.pickCategory(PET);
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await expect(home.today.row(PET)).toBeVisible();
  await expect(home.today.amount(formatCurrency(5_000))).toBeVisible();
});

// ── 수입 ────────────────────────────────────────────────

/**
 * 수입을 적는 길 전체.
 *
 * 예전에는 서버가 만들기를 지출로 고정했고 기록 시트도 지출 분류만 보여줘서, 들어온 돈을
 * 적을 자리가 아예 없었다. 만들기부터 저장까지 한 줄기로 지나 그 자리가 생겼는지 본다.
 */
test('수입 카테고리를 만들어 키패드에서 수입으로 저장한다', async ({
  appShell,
  categories,
  home,
  recordSheet,
}) => {
  await categories.open();
  await categories.waitReady();
  await categories.create(DIVIDEND, DIVIDEND_ICON, '수입');

  await test.step('수입 구획에 서고 지출 구획에는 없다', async () => {
    expect(await categories.sectionNames('수입 카테고리')).toEqual([
      ...INCOME_CATEGORIES,
      DIVIDEND,
    ]);
    expect(await categories.sectionNames('지출 카테고리')).toEqual(EXPENSE_CATEGORIES);
    await expect(categories.mineRow(DIVIDEND)).toBeVisible();
    // 기본 목록은 그대로다. 만든 것이 기본으로 섞여 들어가면 지울 수 없는 줄이 된다.
    await expect(categories.basicRows).toHaveCount(BASIC_CATEGORIES.length);
  });

  await appShell.pressBack();
  await appShell.goToTab('홈');
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await test.step('지출로 열리고, 수입을 고르면 분류 목록이 갈린다', async () => {
    await expect(recordSheet.input.kindButton('지출')).toHaveAttribute('aria-pressed', 'true');
    // 기본 지출이 딱 열한 개라 앞자리에 그대로 다 선다.
    expect(await recordSheet.input.categoryChipNames()).toEqual(EXPENSE_CATEGORIES);

    await recordSheet.input.pickKind('수입');
    // 지출 분류가 남아 있으면 수입이 '식비' 로 저장된다.
    expect(await recordSheet.input.categoryChipNames()).toEqual([...INCOME_CATEGORIES, DIVIDEND]);
  });

  await test.step('수입으로 저장된다', async () => {
    await recordSheet.input.enterAmount(300_000);
    await recordSheet.input.pickCategory(DIVIDEND);
    await recordSheet.feedback.waitSaved();

    // 지출 판정 문장을 그대로 쓰면 "이번 달 얼마 썼어요" 가 수입 자리에 나온다.
    await expect(recordSheet.feedback.headline).toHaveText(
      `수입 ${formatCurrency(300_000)}을 적었어요.`,
    );

    await recordSheet.feedback.confirmButton.click();
    await recordSheet.waitClosed();
  });

  await test.step('홈 목록이 수입이라고 말한다', async () => {
    await expect(home.today.row(DIVIDEND)).toBeVisible();
    await expect(home.today.chip('수입')).toBeVisible();
    // 수입은 쓴 돈이 아니다. 오늘 합계에 들어가면 남은 예산이 통째로 어긋난다.
    await expect(home.today.amount(`+${formatCurrency(300_000)}`)).toBeVisible();
  });
});

// ── 이름이 겹칠 때 ──────────────────────────────────────

test.describe('이름이 겹칠 때', () => {
  test.use({
    // 서버가 일부러 막은 409 다. 브라우저가 그 응답을 콘솔에 적는 것이고 앱이 낸 오류가 아니다.
    consoleErrorAllowList: [/Failed to load resource[\s\S]*409/],
  });

  test('같은 이름은 막고 왜 막혔는지 말한다', async ({ categories }) => {
    await categories.open();
    await categories.waitReady();
    await categories.create(PET, PET_ICON);

    await test.step('내가 만든 것과 같은 이름', async () => {
      await categories.addButton.click();
      await categories.sheet.waitOpen();
      await categories.sheet.nameField.fill(PET);
      await categories.sheet.saveButton.click();

      await expect(categories.sheet.errorText).toHaveText('같은 이름의 카테고리가 이미 있어요.');
      // 닫히면 적어 둔 이름이 함께 사라진다. 고쳐 쓸 수 있게 열린 채로 둔다.
      await expect(categories.sheet.dialog).toBeVisible();
      await expect(categories.row(PET)).toHaveCount(1);

      await categories.sheet.closeButton.click();
      await categories.sheet.waitClosed();
    });

    await test.step('기본 카테고리와 같은 이름', async () => {
      await categories.addButton.click();
      await categories.sheet.waitOpen();
      // 앞 시도의 안내가 남아 있으면 뒤 단언이 아무것도 지키지 않는다.
      await expect(categories.sheet.errorText).toHaveCount(0);

      await categories.sheet.nameField.fill('식비');
      await categories.sheet.saveButton.click();

      // 기본 '식비' 와 내 '식비' 는 DB 에서 서로 다른 자리라 유니크 키가 안 막는다.
      // 코드가 막고 있는지 화면으로 볼 수 있는 곳이 여기뿐이다.
      await expect(categories.sheet.errorText).toHaveText('같은 이름의 카테고리가 이미 있어요.');
      await expect(categories.sheet.dialog).toBeVisible();
      await expect(categories.row('식비')).toHaveCount(1);
    });
  });
});

// ── 고치기 입구 ─────────────────────────────────────────

test('기본 카테고리도 고칠 수 있고, 지우기만 막힌다', async ({ categories }) => {
  await categories.open();
  await categories.waitReady();

  await categories.openEdit('식비');
  await expect(categories.sheet.editDialog).toBeVisible();
  await expect(categories.sheet.nameField).toHaveValue('식비');
  /*
    **지우기만 없다.** 기본 분류는 남들도 쓰는 한 행이라 지우면 그 분류로 적어 둔 남의
    기록이 분류를 잃는다. 이름·그림·색은 내 설정에만 남아 남에게 안 번진다.
  */
  await expect(categories.sheet.deleteButton).toHaveCount(0);
  // 무엇이 남의 화면에 가는지 그 자리에서 말한다.
  await expect(categories.sheet.scopeNote).toBeVisible();
  // 종류는 못 바꾼다. 바꾸면 그 분류로 적어 둔 지난 기록이 종류와 어긋난다.
  await expect(categories.sheet.kindToggle).toHaveCount(0);

  await categories.sheet.nameField.fill('밥값');
  await categories.sheet.saveButton.click();
  await categories.sheet.waitClosed();

  // 「기본」 배지는 그대로다. 지우는 길이 없다는 것을 그 배지가 말한다.
  await expect(categories.basicRow('밥값')).toBeVisible();
  await expect(categories.row('식비')).toHaveCount(0);
});

test('내가 만든 카테고리는 고치기와 지우기가 둘 다 있다', async ({ categories }) => {
  await categories.open();
  await categories.waitReady();
  await categories.create(PET, PET_ICON);

  await categories.openEdit(PET);
  await expect(categories.sheet.editDialog).toBeVisible();
  await expect(categories.sheet.nameField).toHaveValue(PET);
  await expect(categories.sheet.deleteButton).toBeVisible();

  await categories.sheet.nameField.fill('반려친구');
  await categories.sheet.saveButton.click();
  await categories.sheet.waitClosed();

  await expect(categories.editButton('반려친구')).toBeVisible();
  await expect(categories.row(PET)).toHaveCount(0);
});

// ── 지우기 ──────────────────────────────────────────────

test('카테고리를 지워도 그 분류로 적어 둔 기록은 남는다', async ({
  appShell,
  categories,
  home,
  prep,
}) => {
  await categories.open();
  await categories.waitReady();
  await categories.create(PET, PET_ICON);

  await test.step('그 분류로 오늘 지출을 하나 심는다', async () => {
    const petId = await prep.categoryIdByName(PET);
    await prep.addTransaction({ amount: 30_000, merchant: '동물병원', categoryId: petId });
  });

  await test.step('홈에 상호와 분류가 함께 보인다', async () => {
    await appShell.pressBack();
    await appShell.goToTab('홈');
    await home.waitReady();

    await expect(home.today.row('동물병원')).toBeVisible();
    await expect(home.today.subtitle(PET)).toBeVisible();
    await expect(home.today.amount(formatCurrency(30_000))).toBeVisible();
  });

  await test.step('카테고리를 지운다', async () => {
    await appShell.goToTab('관리');
    await appShell.followRow('카테고리 관리');
    await categories.waitReady();

    await categories.openEdit(PET);
    await categories.sheet.deleteButton.click();
    // 화면이 하는 약속이다. 이 말과 다르게 굴면 아래 단언이 잡는다.
    await expect(categories.sheet.confirmText).toBeVisible();
    await categories.sheet.confirmDeleteButton.click();
    await categories.sheet.waitClosed();

    await expect(categories.row(PET)).toHaveCount(0);
    await expect(categories.emptyNotice).toBeVisible();
  });

  await test.step('기록은 그대로 있고 분류만 빠진다', async () => {
    await appShell.pressBack();
    await appShell.goToTab('홈');
    await home.waitReady();

    // 행이 통째로 사라지면 지난달 리포트가 나중에 달라진다.
    await expect(home.today.row('동물병원')).toBeVisible();
    await expect(home.today.amount(formatCurrency(30_000))).toBeVisible();
    // 제목은 상호라 그대로고, 분류 이름이 앉던 부제만 빈다.
    await expect(home.today.subtitle(PET)).toHaveCount(0);
  });
});

// ── 직접 건 아이콘 ──────────────────────────────────────

/**
 * 앱에 든 그림 말고 자판의 이모지도 걸 수 있다.
 *
 * 이모지 목록을 우리가 들고 있지 않으므로 e2e 도 자판을 열지 않는다. 칸에 값이 들어가는 것과
 * 그것이 목록·기록 시트까지 따라가는 것만 본다.
 */
test('이모지를 걸면 목록과 기록 시트가 같은 이모지를 그린다', async ({
  categories,
  recordSheet,
  home,
}) => {
  const GLYPH = '🍗';

  await categories.open();
  await categories.waitReady();

  await categories.addButton.click();
  await categories.sheet.waitOpen();
  await categories.sheet.nameField.fill('치킨');
  await categories.sheet.pickIconSource('이모지');
  await categories.sheet.emojiField.fill(GLYPH);
  await categories.sheet.saveButton.click();
  await categories.sheet.waitClosed();

  await expect(categories.row('치킨').getByText(GLYPH, { exact: true })).toBeVisible();

  // 기록 시트의 분류 칩까지 같은 그림이어야 한다. 한 곳만 따라가면 목록마다 다르게 보인다.
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await expect(
    recordSheet.input.categoryChip('치킨').getByText(GLYPH, { exact: true }),
  ).toBeVisible();

  /*
    **저장한 뒤 확인 화면까지 따라가야 한다.** 여기가 실기기에서 빠져 있었다.
    목록도 칩도 이모지를 그리는데 이 줄만 기본 그림이라, 「저장은 됐는데 확인 화면이
    안 바뀐다」 로 보였다. 그리는 컴포넌트는 같고 넘기는 값이 한 자리만 달랐다.
  */
  await recordSheet.input.enterAmount(9_000);
  await recordSheet.input.pickCategory('치킨');
  await recordSheet.feedback.waitSaved();
  await expect(recordSheet.feedback.savedRowAvatar.getByText(GLYPH, { exact: true })).toBeVisible();

  // 오늘 목록도 같은 그림이다. 시트를 닫고 나서도 갈리지 않는다.
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(home.today.rowAvatar('치킨').getByText(GLYPH, { exact: true })).toBeVisible();
});

test('걸어 둔 이모지는 기본 아이콘으로 되돌릴 수 있다', async ({ categories }) => {
  await categories.open();
  await categories.waitReady();

  await categories.addButton.click();
  await categories.sheet.waitOpen();
  await categories.sheet.nameField.fill('치킨');
  await categories.sheet.pickIconSource('이모지');
  await categories.sheet.emojiField.fill('🍗');
  await categories.sheet.saveButton.click();
  await categories.sheet.waitClosed();

  await categories.openEdit('치킨');
  // 다시 열면 걸어 둔 그대로가 들어 있어야 한다. 비어 있으면 고치다가 실수로 지우게 된다.
  await expect(categories.sheet.emojiField).toHaveValue('🍗');
  await categories.sheet.clearCustomButton.click();
  await categories.sheet.saveButton.click();
  await categories.sheet.waitClosed();

  await expect(categories.row('치킨').getByText('🍗', { exact: true })).toHaveCount(0);
});

/**
 * 새로 들어온 기본 지출 분류 셋.
 *
 * 이름만 세는 것은 위 구획 테스트가 이미 한다. 여기서는 **기록까지 닿는지**를 본다.
 * 목록에만 있고 기록 시트의 칩에 없으면 있으나 마나다.
 */
test('편의점·구독으로 바로 적을 수 있고, 주유는 기본에 없다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  for (const name of ['편의점', '구독']) {
    await expect(recordSheet.input.categoryChip(name)).toBeVisible();
  }
  // 하루 썼다가 뺐다. 차가 없으면 안 쓰는 갈래라 모두에게 보이는 자리에 둘 것이 아니었다.
  await expect(recordSheet.input.categoryChip('주유')).toHaveCount(0);
});

// ── 기록 화면에서 바로 만들기 ────────────────────────────

/**
 * 분류를 만들 수 있다는 것을 관리 탭까지 들어가야 알 수 있었다.
 *
 * 필요한 순간은 적으려다 맞는 칸이 없을 때고, 그 순간이 바로 기록 시트다.
 * **만들고 나서 그 기록으로 돌아와 이어 적을 수 있어야 한다.** 여기가 핵심이다.
 */
test('기록하다 분류를 만들면 그 자리로 돌아와 이어서 적는다', async ({ home, recordSheet }) => {
  const NAME = '반려동물';

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  // 금액을 먼저 찍어 둔다. 만들고 돌아왔을 때 이 값이 살아 있어야 한다.
  await recordSheet.input.enterAmount(30_000);
  await recordSheet.input.openNewCategory();
  await expect(recordSheet.input.newCategoryForm.title).toBeVisible();
  // 종류는 위에서 이미 골랐다. 여기서 다시 묻지 않는다.
  await expect(recordSheet.input.newCategoryForm.kindToggle).toHaveCount(0);

  /*
    만드는 동안에는 시트가 통째로 이 화면이다. 탭도 금액도 숫자판도 안 보인다.
    같이 보이면 지금 무엇을 하는 중인지가 흐려지고, 숫자가 눌려 금액이 바뀐다.
  */
  await expect(recordSheet.input.amountText).toBeHidden();
  await expect(recordSheet.input.keypad).toBeHidden();
  await expect(recordSheet.methodTabs).toHaveCount(0);

  await recordSheet.input.newCategoryForm.create(NAME, 'paw');

  // 만든 것이 골라진 채로 기록 화면이 돌아온다. 저장은 이 사람이 누른다.
  await expect(recordSheet.input.newCategoryForm.title).toHaveCount(0);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(30_000));
  await expect(recordSheet.input.pickedCategory).toContainText(NAME);

  await recordSheet.input.saveButton.click();
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await home.waitReady();
  await expect(home.today.row(NAME)).toBeVisible();
});

/**
 * 이름 하나면 분류가 만들어진다.
 *
 * 아이콘 격자와 색 열넷이 이름 칸 아래 한꺼번에 서 있으면, 그것까지 골라야 하는 줄 안다.
 * **색은 아이콘을 고른 뒤에야 나온다.** 둘 다 안 골라도 저장된다.
 */
test('이름만 적어도 분류가 만들어지고, 적던 금액은 그대로다', async ({ home, recordSheet }) => {
  const NAME = '데이트';

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await recordSheet.input.enterAmount(8_000);
  await recordSheet.input.openNewCategory();

  const form = recordSheet.input.newCategoryForm;
  /*
    **격자는 펴진 채로 열린다.** 여기 온 사람은 아이콘을 고르러 온 사람이라, 한 번 더
    눌러야 목록이 나오면 그 한 번이 군더더기다. 「이전·저장」 이 맨 위에 붙어 있어
    격자가 밀어낼 것도 없다.
  */
  await expect(form.iconGrid).toBeVisible();
  await expect(form.openIconsButton).toHaveCount(0);
  // 색은 아이콘을 고르기 전에는 아예 없다. 한 번에 하나씩 묻는다.
  await expect(form.colorGroup).toHaveCount(0);

  await form.createByName(NAME);

  await expect(form.title).toHaveCount(0);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(8_000));
  await expect(recordSheet.input.pickedCategory).toContainText(NAME);

  await recordSheet.input.saveButton.click();
  await recordSheet.feedback.waitSaved();
});

test('아이콘을 고르면 격자가 접히고 그때 색이 나온다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await recordSheet.input.openNewCategory();
  const form = recordSheet.input.newCategoryForm;

  // 펴진 채로 열린다. 그래도 색은 아직 없다. 고른 것이 없으니 깔 색도 없다.
  await expect(form.iconGrid).toBeVisible();
  await expect(form.colorGroup).toHaveCount(0);

  /*
    격자를 끝까지 내려도 나가는 길과 저장이 제자리다. 맨 위에 붙여 둔 줄이라
    아래로 아무리 굴려도 화면 안에 있어야 한다.
  */
  await form.iconCell('calendar clock').scrollIntoViewIfNeeded();
  await expect(form.saveButton).toBeInViewport();
  await expect(form.backButton).toBeInViewport();

  await form.iconCell(PET_ICON).click();

  await expect(form.iconGrid).toHaveCount(0);
  await expect(form.reopenIconsButton).toBeVisible();
  await expect(form.colorGroup).toBeVisible();
});

/**
 * 왜 저장이 안 되는지 그 자리에서 말한다.
 *
 * 겹치는 이름은 **서버를 다녀오지 않고 화면이 먼저 막는다.** 접는 규칙은 서버와 같아서
 * (`categoryNameKey`) 화면이 통과시킨 것을 서버가 다시 막는 일이 없다.
 */
test('이름이 비었거나 겹치면 저장이 막히고 이유가 적힌다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await recordSheet.input.openNewCategory();
  const form = recordSheet.input.newCategoryForm;

  await expect(form.reason).toHaveText('이름을 적어 주세요');
  await expect(form.saveButton).toBeDisabled();

  // 기본 분류와 같은 이름. 공백과 대소문자 차이는 같은 이름으로 본다.
  await form.nameField.fill(' 식비 ');
  await expect(form.reason).toHaveText('같은 이름의 분류가 이미 있어요. 다른 이름으로 적어 주세요');
  await expect(form.saveButton).toBeDisabled();

  await form.nameField.fill('식비 그리고');
  await expect(form.reason).toHaveCount(0);
  await expect(form.saveButton).toBeEnabled();
});

/**
 * 시스템 뒤로가기도 화면의 「이전」 과 같은 일을 해야 한다.
 *
 * 만들기 화면은 시트 안쪽을 통째로 먹고 맨 위에 「이전」 이 붙어 있어, 안드로이드에서는
 * 뒤로가기가 그 「이전」 으로 읽힌다. 시트째 닫히면 적던 이름도, 금액도, 고른 날도
 * 확인 한 번 없이 사라진다(읽어 둔 것이 없으면 그만둘지 묻지도 않는다).
 */
test('분류를 만들다 시스템 뒤로가기를 누르면 만들기만 닫히고 시트는 남는다', async ({
  appShell,
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await recordSheet.input.enterAmount(12_000);
  await recordSheet.input.openNewCategory();
  await recordSheet.input.newCategoryForm.nameField.fill(PET);

  await appShell.pressBack();

  await expect(recordSheet.input.newCategoryForm.title).toHaveCount(0);
  await recordSheet.waitOpen();
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(12_000));
  await expect(recordSheet.input.categoryChip('식비')).toBeVisible();

  // 한 번 더 누르면 그때는 시트가 닫힌다. 만들기만 삼키고 갇히면 그것도 막다른 길이다.
  await appShell.pressBack();
  await recordSheet.waitClosed();
});

test('분류를 만들다 그만두면 적던 금액 그대로 돌아온다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await recordSheet.input.enterAmount(12_000);
  await recordSheet.input.openNewCategory();
  await expect(recordSheet.input.newCategoryForm.title).toBeVisible();
  /*
    누른 「새 분류」 칩이 그 클릭으로 사라진다. 안 잡아 주면 포커스가 시트 밖 body 로 떨어져
    읽는 프로그램에는 화면이 바뀐 것이 한마디도 안 닿는다. 여기서 처음 할 일이 이름 적기다.
  */
  await expect(recordSheet.input.newCategoryForm.nameField).toBeFocused();

  await recordSheet.input.newCategoryForm.backButton.click();

  await expect(recordSheet.input.newCategoryForm.title).toHaveCount(0);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(12_000));
  await expect(recordSheet.input.categoryChip('식비')).toBeVisible();
  // 돌아올 때도 마찬가지다. 왔던 자리인 「새 분류」 칩이 포커스를 되받는다.
  await expect(recordSheet.input.newCategoryButton).toBeFocused();
});

// ── 기록 화면에 먼저 보일 분류 고르기 ─────────────────────

test('기록 화면에 보이기를 끄면 「더 보기」 뒤로 간다', async ({
  categories,
  home,
  recordSheet,
}) => {
  await categories.open();
  await categories.waitReady();

  // 기본 분류도 끌 수 있다. 그 값은 내 설정에만 남는다.
  await categories.quickToggle('기타').click();
  await expect(categories.quickToggle('기타')).toHaveAttribute('aria-checked', 'false');

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await expect(recordSheet.input.categoryChip('기타')).toHaveCount(0);
  await expect(recordSheet.input.categoryChip('식비')).toBeVisible();

  // 없애는 것이 아니라 뒤로 미는 것이다. 없애면 그 분류로 적을 길이 사라진다.
  await expect(recordSheet.input.keypad).toBeVisible();
  await recordSheet.input.moreCategoriesButton.click();
  await expect(recordSheet.input.categoryChip('기타')).toBeVisible();

  /*
    펼친 동안에는 숫자판을 접는다. 칩이 화면을 채운 아래로 숫자판이 밀려 있는데도 눌려서,
    고르는 중인지 적는 중인지가 흐려진다는 말을 들었다. 접으면 바로 돌아온다.
  */
  await expect(recordSheet.input.keypad).toBeHidden();
  await recordSheet.input.foldCategoriesButton.click();
  await expect(recordSheet.input.keypad).toBeVisible();
});

/**
 * 뒤로 밀린 분류를 골라 두면 목록이 저절로 펼쳐진다. 눌러 둔 표시가 갈 곳이 없어서다.
 *
 * 그 상태에는 **접기가 없다.** 「더 보기」로 직접 편 것과 같이 세어 숫자판까지 감추면,
 * 금액을 고칠 길도 저장 버튼도 함께 사라져 아무 분류나 한 번 골라야만 빠져나올 수 있었다.
 */
test('뒤로 밀린 분류를 골라 두고 다시 고르기를 눌러도 숫자판이 남는다', async ({
  home,
  prep,
  recordSheet,
}) => {
  // 앞자리가 차면 마지막 기본 분류('기타')가 「더 보기」 뒤로 밀린다.
  await prep.addCategory(PET);

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await recordSheet.input.moreCategoriesButton.click();
  // 금액이 아직 없으면 고르기만 하고 목록이 접힌다.
  await recordSheet.input.categoryChip('기타').click();
  await expect(recordSheet.input.pickedCategory).toContainText('기타');

  await recordSheet.input.pickedCategory.click();
  // 눌러 둔 표시를 보이려고 펼친 채로 열린다. 그래서 접기가 없다.
  await expect(recordSheet.input.foldCategoriesButton).toHaveCount(0);
  // 되돌릴 버튼이 없는 만큼, 감추는 것도 없어야 한다.
  await expect(recordSheet.input.keypad).toBeVisible();

  await recordSheet.input.enterAmount(12_000);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(12_000));
});

test('끈 것을 다시 켜면 곧바로 앞자리로 돌아온다', async ({ categories, home, recordSheet }) => {
  await categories.open();
  await categories.waitReady();
  await categories.quickToggle('기타').click();
  await expect(categories.quickToggle('기타')).toHaveAttribute('aria-checked', 'false');
  await categories.quickToggle('기타').click();
  await expect(categories.quickToggle('기타')).toHaveAttribute('aria-checked', 'true');

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await expect(recordSheet.input.categoryChip('기타')).toBeVisible();
  // 뒤로 밀린 것이 없어졌으니 「더 보기」도 사라진다. 그 자리는 「새 분류」가 받는다.
  await expect(recordSheet.input.moreCategoriesButton).toHaveCount(0);
  await expect(recordSheet.input.newCategoryButton).toBeVisible();
});

/**
 * 이모지가 아닌 글자.
 *
 * 실기기에서 나온 두 가지가 여기 있다. 숫자 하나를 넣으면 뭉뚱그린 「요청 형식이 올바르지
 * 않아요」로 끝났고(무엇을 고쳐야 하는지 알 수 없다), 한글 자음 한 글자는 그대로 통과해
 * 아이콘 자리에 'ㅋ' 이 박혔다. 서버까지 다녀오기 전에 그 자리에서 말해 준다.
 */
test('이모지가 아닌 글자는 그 자리에서 왜 안 되는지 말한다', async ({ categories }) => {
  await categories.open();
  await categories.waitReady();

  await categories.addButton.click();
  await categories.sheet.waitOpen();
  await categories.sheet.nameField.fill('데이트');
  await categories.sheet.pickIconSource('이모지');

  await categories.sheet.emojiField.fill('7');
  await expect(categories.sheet.emojiNotice).toHaveText(/이모지 형식이 아니에요/);

  // 자음 한 글자도 마찬가지다. 아스키가 아니라고 통과시키던 자리다.
  await categories.sheet.emojiField.fill('ㅋ');
  await expect(categories.sheet.emojiNotice).toHaveText(/이모지 형식이 아니에요/);

  // 숫자 키캡은 이모지다. 숫자라고 싸잡아 막으면 이것까지 막힌다.
  await categories.sheet.emojiField.fill('7️⃣');
  await expect(categories.sheet.emojiNotice).toHaveCount(0);

  await categories.sheet.saveButton.click();
  await categories.sheet.waitClosed();
  await expect(categories.row('데이트').getByText('7️⃣', { exact: true })).toBeVisible();
});

/**
 * 이미 적어 둔 기록을 고치다가 분류를 만든다.
 *
 * 기록할 때만 만들 수 있으면, 나중에 목록을 보다가 「이건 따로 세고 싶다」 고 생각한 순간에
 * 갈 곳이 없다. 관리 탭까지 나갔다 오면 고쳐 둔 값이 사라진다.
 */
test('기록을 고치다 분류를 만들면 그 기록에 바로 붙는다', async ({ calendar, prep }) => {
  await prep.addTransaction({ amount: 12000, merchant: '꽃집' });

  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('꽃집');
  await calendar.edit.waitOpen();

  await calendar.edit.openNewCategory();
  await expect(calendar.edit.newCategoryTitle).toBeVisible();
  await calendar.edit.createCategory('선물', 'gift');

  // 만들기가 끝나면 폼이 접히고 칩 자리가 돌아온다. 목록이 새로 올 때까지가 한 걸음이다.
  await expect(calendar.edit.newCategoryTitle).toHaveCount(0);
  await expect(calendar.edit.categoryChip('선물')).toBeVisible();
  // 만든 것이 곧바로 이 기록의 분류가 된다. 다시 찾아 누르게 하면 만든 보람이 없다.
  await expect(calendar.edit.pickedCategory).toHaveText(/선물/);
  // 고쳐 둔 값은 그대로 있어야 한다. 만들기가 끝나면 이어서 저장한다.
  await expect(calendar.edit.merchant).toHaveValue('꽃집');
  await calendar.edit.done();

  /*
    저장까지 갔는지 다시 열어 확인한다. 화면만 바뀌고 서버에 안 갔던 일이 실제로 있었다.

    **목록이 새 값으로 온 뒤에 연다.** 수정 시트는 열릴 때 그 줄의 값으로 한 번 채워지고
    나중에 오는 조회를 다시 읽지 않는다. 그래서 목록이 아직 옛 값일 때 열면, 서버에는
    제대로 저장됐는데도 시트에는 분류가 비어 보인다(붐빌 때만 가끔 그랬다).
  */
  await expect(calendar.list.rowSubtitle('꽃집')).toHaveText('선물');
  await calendar.list.pick('꽃집');
  await calendar.edit.waitOpen();
  await expect(calendar.edit.pickedCategory).toHaveText(/선물/);
});

test('분류를 만들다 그만두면 고치던 화면으로 돌아온다', async ({ calendar, prep }) => {
  await prep.addTransaction({ amount: 9000, merchant: '문구점' });

  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('문구점');
  await calendar.edit.waitOpen();

  await calendar.edit.merchant.fill('문구사');
  await calendar.edit.openNewCategory();
  await calendar.edit.newCategoryBackButton.click();

  await expect(calendar.edit.newCategoryTitle).toHaveCount(0);
  await expect(calendar.edit.merchant).toHaveValue('문구사');
});

/**
 * 앨범 사진을 아이콘으로 건다.
 *
 * 실기기에서 이 길이 늘 「사진을 읽지 못했어요」로 끝났다. 같은 값이 서버로는 잘 가서
 * (캡처 인식은 됐다) 값이 깨진 것이 아니라 **읽는 길이 막힌 것**이었다. 지금은 `<img>` 가
 * 아니라 `createImageBitmap` 으로 읽는다.
 *
 * ⚠ 여기서 증명되는 것은 새 길이 끝까지 돈다는 것까지다. 웹뷰가 `data:` 그림을 막았는지는
 * Chromium 으로 못 본다. 그 판정은 실기기에서 사람이 한다.
 */
test('앨범에서 고른 사진이 아이콘이 된다', async ({ categories, home, page, recordSheet }) => {
  await seedMockImages(CAPTURE_DATA_URI)(page);

  await categories.open();
  await categories.waitReady();
  // 다이얼이 안 걸린 채로 통과하면 목이 만든 기본 그림을 보고 있는 것이다.
  expect(await mockImagesSeeded(page)).toBe(true);

  await categories.addButton.click();
  await categories.sheet.waitOpen();
  await categories.sheet.nameField.fill('데이트');
  await categories.sheet.pickIconSource('사진');
  await categories.sheet.albumButton.click();

  // 읽지 못했으면 이 자리에 빨간 한 줄이 선다. 되돌리기 버튼은 실제로 걸렸을 때만 뜬다.
  await expect(categories.sheet.clearCustomButton).toBeVisible();
  await expect(categories.sheet.emojiNotice).toHaveCount(0);

  await categories.sheet.saveButton.click();
  await categories.sheet.waitClosed();
  await expect(categories.iconImageOf('데이트')).toHaveAttribute('src', /^data:image\//);

  /*
    **사진도 저장 뒤 확인 화면까지 따라가야 한다.** 이모지와 같은 자리에서 걸렸다.
    목록은 사진을 그리는데 그 줄만 기본 그림이면, 사용자 눈에는 사진이 저장 안 된 것이다.
  */
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(7_000);
  await recordSheet.input.pickCategory('데이트');
  await recordSheet.feedback.waitSaved();
  await expect(recordSheet.feedback.savedRowAvatar.locator('img')).toHaveAttribute(
    'src',
    /^data:image\//,
  );
});

test('이모지가 아닌 글자가 남아 있으면 저장이 막힌다', async ({ categories }) => {
  await categories.open();
  await categories.waitReady();

  await categories.addButton.click();
  await categories.sheet.waitOpen();
  await categories.sheet.nameField.fill('데이트');
  await categories.sheet.pickIconSource('이모지');

  /*
    예전에는 그대로 저장됐다. 친 글자는 버려지고 아무도 안 고른 별표가 걸려서,
    아래 한 줄을 못 본 사람은 저장하고 나서야 다른 그림을 봤다.
  */
  await categories.sheet.emojiField.fill('ㅋ');
  await expect(categories.sheet.saveButton).toBeDisabled();
  // 왜 막혔는지가 버튼 곁에도 있어야 한다. 격자 아래 한 줄만으로는 안 보인다.
  await expect(categories.sheet.saveBlockedNotice).toBeVisible();

  // 지우면 풀린다. 아무것도 안 고른 것은 막을 일이 아니다.
  await categories.sheet.emojiField.fill('');
  await expect(categories.sheet.saveButton).toBeEnabled();
  await expect(categories.sheet.saveBlockedNotice).toHaveCount(0);

  // 제대로 고르면 그것으로 저장된다.
  await categories.sheet.emojiField.fill('🍰');
  await expect(categories.sheet.saveButton).toBeEnabled();
  await categories.sheet.saveButton.click();
  await categories.sheet.waitClosed();
  await expect(categories.row('데이트').getByText('🍰', { exact: true })).toBeVisible();
});

test('다른 탭으로 옮기면 안 보이는 칸 때문에 저장이 막히지 않는다', async ({ categories }) => {
  await categories.open();
  await categories.waitReady();

  await categories.addButton.click();
  await categories.sheet.waitOpen();
  await categories.sheet.nameField.fill('데이트');
  await categories.sheet.pickIconSource('이모지');
  await categories.sheet.emojiField.fill('ㅋ');
  await expect(categories.sheet.saveButton).toBeDisabled();

  // 안 보이는 칸이 저장을 막으면 무엇이 잘못됐는지 화면 어디에도 없다.
  await categories.sheet.pickIcon('gift');
  await expect(categories.sheet.saveButton).toBeEnabled();
});

test('아이콘 격자를 끝까지 내려도 저장 버튼이 보인다', async ({ categories }) => {
  await categories.open();
  await categories.waitReady();

  await categories.addButton.click();
  await categories.sheet.waitOpen();
  await categories.sheet.nameField.fill('데이트');

  /*
    저장을 못 찾아 이름만 고치고 시트를 닫은 사람이 있었다. 시트를 크게 열고 버튼을
    바닥에 붙였으니, 격자를 끝까지 굴려도 같은 자리에 있어야 한다.
  */
  await categories.sheet.saveButton.scrollIntoViewIfNeeded();
  await expect(categories.sheet.saveButton).toBeInViewport();
});

/**
 * 새 분류 창이 떠 있는 동안 **뒤에 있는 것이 닫히면 안 된다.**
 *
 * 감싼 시트도 Esc 와 딤 클릭을 듣고 있어서, 창이 그 둘을 안 삼키면 분류 만들기를
 * 그만두려던 한 번에 읽어 온 검토 목록이나 고치던 기록까지 함께 닫힌다.
 * 시트의 `dismissible` 을 끄는 방법은 안 쓴다. 그 값을 토글하면 `BottomSheet` 의
 * 포커스 효과가 다시 돌아 이름 칸의 포커스를 시트가 도로 가져간다.
 */
test.describe('새 분류 창이 뒤로 새지 않는다', () => {
  test('검토 줄에서 열고 Esc 를 눌러도 읽어 온 목록이 그대로다', async ({
    home,
    page,
    recordSheet,
  }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.methodTab('줄글').click();
    await recordSheet.nl.analyze('점심 12000');
    await recordSheet.nl.openEdit('점심');

    await recordSheet.nl.form.openNewCategory();
    const compose = recordSheet.nl.form.compose;
    await expect(compose.title).toBeVisible();

    await page.keyboard.press('Escape');

    // 창만 닫힌다. 기록 시트도 읽어 온 줄도 그대로다.
    await expect(compose.title).toHaveCount(0);
    await recordSheet.waitOpen();
    await expect(recordSheet.nl.form.merchantField).toBeVisible();
    /*
      **뒤에서 「그만둘까요」 가 뜨지도 않아야 한다.** 그 창은 시트 안(z 2)에 서는데
      새 분류 창이 z 70 이라 완전히 가려진다. 사용자 눈에는 아무 일도 안 일어난 것으로
      보이다가, 분류를 만들고 돌아오는 순간 「읽어 온 1건이 사라져요」 가 튀어나온다.
    */
    await expect(recordSheet.leave.text).toHaveCount(0);
  });

  test('기록을 고치다 열면 이름 칸에 커서가 남는다', async ({ calendar, prep }) => {
    await prep.addTransaction({ amount: 9000, merchant: '문구점' });

    await calendar.open();
    await calendar.waitReady();
    await calendar.list.pick('문구점');
    await calendar.edit.waitOpen();
    await calendar.edit.openNewCategory();

    /*
      한때 시트의 `dismissible` 을 끄면서 포커스가 오버레이 밖 시트 컨테이너로 끌려갔다.
      웹뷰에서 자판이 안 올라오고, 그 자리에서 Tab 을 치면 가려진 시트 안으로 샜다.
    */
    await expect(calendar.edit.compose.nameField).toBeFocused();
  });

  test('펴는 폰에서 창 옆을 눌러도 뒤가 안 닫힌다', async ({ page, calendar, prep }) => {
    // 폴드 펼침 폭. 여기서 창 바탕을 기둥으로 좁히면 좌우에 시트의 딤이 드러났다.
    await page.setViewportSize({ width: 673, height: 841 });
    await prep.addTransaction({ amount: 9000, merchant: '문구점' });

    await calendar.open();
    await calendar.waitReady();
    await calendar.list.pick('문구점');
    await calendar.edit.waitOpen();
    await calendar.edit.openNewCategory();
    await expect(calendar.edit.compose.title).toBeVisible();

    // 기둥 바깥을 누른다. 창 바탕이 화면 끝까지 가 있으면 여기가 창이다.
    await page.mouse.click(20, 400);

    await expect(calendar.edit.compose.title).toBeVisible();
    await calendar.edit.waitOpen();
  });
});
