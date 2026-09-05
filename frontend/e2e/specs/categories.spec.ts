import { formatCurrency } from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';

/**
 * 카테고리 관리 화면.
 *
 * 준비는 API 로 심고, 행동과 단언은 화면으로 한다. 여기서 지키는 것이 셋이다.
 * 기본 카테고리는 눈으로 보되 손대지 못한다는 것, 만든 것이 기록 시트까지 곧바로 닿는다는 것,
 * 지운 뒤에도 그 분류로 적어 둔 기록이 사라지지 않는다는 것.
 */

/**
 * 기본 카테고리와 그 순서.
 *
 * 정본은 백엔드 `app/domain/categories.py` 의 `DEFAULT_CATEGORIES` 이고, 순서는 그 파일의
 * `sort_order` 순이다. 화면 출력에서 베끼지 않고 그 파일을 읽어 적었다.
 */
const BASIC_CATEGORIES = [
  '식비',
  '카페·간식',
  '교통',
  '쇼핑',
  '생활',
  '주거·고정비',
  '여가·취미',
  '건강·미용',
  '기타',
  '수입',
  '이체',
];

const PET = '반려동물';
/** 아이콘 파일 `16_paw`. 격자 칸은 파일 이름에서 앞 번호를 뗀 영어를 읽어 준다. */
const PET_ICON = 'paw';

// ── 두 구획 ─────────────────────────────────────────────

test('기본 카테고리와 내가 만든 것이 다른 자리에 놓인다', async ({ appShell, categories }) => {
  // 사용자가 이 화면에 닿는 길은 관리 탭 하나뿐이다. 주소로 바로 들어가지 않는다.
  await appShell.open();
  await appShell.goToTab('관리');
  await appShell.followLink('카테고리 관리');

  await appShell.expectScreen('카테고리 관리', '내가 쓰는 카테고리만 남겨요');
  await categories.waitReady();

  // 같은 이름이 두 구획 중 한쪽에서만 잡혀야 구분이 실제로 되고 있는 것이다.
  await expect(categories.basicRow('식비')).toBeVisible();
  await expect(categories.basicRow('카페·간식')).toBeVisible();
  await expect(categories.mineRow('식비')).toHaveCount(0);
  await expect(categories.mineRow('카페·간식')).toHaveCount(0);

  // 개수를 박아 둔다. 기본 목록이 늘거나 줄면 화면보다 여기가 먼저 걸린다.
  await expect(categories.basicRows).toHaveCount(11);

  // 내 구획은 비어 있어도 자리를 지킨다. 없는 것을 감추면 만들 수 있다는 것도 안 보인다.
  await expect(categories.mineSection).toBeVisible();
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
  await expect(categories.mineButton(PET)).toBeVisible();
  await expect(categories.emptyNotice).toHaveCount(0);

  // 새로 만든 것이 기본 뒤에 선다. 앞으로 오면 기록 시트 칩의 첫 자리를 빼앗는다.
  expect(await categories.rowNames()).toEqual([...BASIC_CATEGORIES, PET]);
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
  await expect(categories.mineButton(PET)).toBeVisible();

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
  const chips = await recordSheet.input.categoryChipNames();
  expect(chips.slice(-2)).toEqual([PET, '기타']);
  expect(chips[0]).toBe('식비');

  // 보이기만 하는 것으로는 부족하다. 그 칩으로 실제 기록이 만들어져야 한다.
  await recordSheet.input.pickCategory(PET);
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await expect(home.today.row(PET)).toBeVisible();
  await expect(home.today.amount(formatCurrency(5_000))).toBeVisible();
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

test('기본 카테고리에는 고치기 입구가 없고, 내가 만든 것만 고친다', async ({ categories }) => {
  await categories.open();
  await categories.waitReady();
  await categories.create(PET, PET_ICON);

  // 눌리지 않는 버튼을 두는 것과 아예 두지 않는 것은 다르다. 기본 구획에는 버튼 자체가 없다.
  await expect(categories.basicButtons).toHaveCount(0);
  // 이름은 보이는데 그 줄을 누를 방법이 없다.
  await expect(categories.basicRow('식비')).toBeVisible();

  await categories.openEdit(PET);
  await expect(categories.sheet.editDialog).toBeVisible();
  await expect(categories.sheet.nameField).toHaveValue(PET);
  await expect(categories.sheet.deleteButton).toBeVisible();

  await categories.sheet.nameField.fill('반려친구');
  await categories.sheet.saveButton.click();
  await categories.sheet.waitClosed();

  await expect(categories.mineButton('반려친구')).toBeVisible();
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
    await appShell.followLink('카테고리 관리');
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
