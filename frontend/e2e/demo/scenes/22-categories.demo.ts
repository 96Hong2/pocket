import { formatCurrency } from '../../../src/shared/lib/format';
import { expect, test } from '../support/director';

/**
 * 카테고리 관리 화면 두 장면.
 *
 * 만들기를 먼저 두고 기억한 분류를 뒤에 둔다. 내가 만든 분류가 하나 생긴 뒤라야
 * '고쳐서 저장한 분류가 어디에 쌓이나' 라는 뒷장면이 무슨 말인지 보인다.
 *
 * 뒷장면에서 도는 줄글 분석은 실제 모델이 아니라 규칙 기반 스텁이다. 그래서 여기서 보이는 것은
 * '얼마나 잘 알아듣는가' 가 아니라 '한 번 고친 분류를 화면이 어디에 적어 두고 어떻게 지우게 하는가' 다.
 */

const PET = '반려동물';
/** 아이콘 격자 칸은 파일 이름(`16_paw`)에서 앞 번호를 뗀 영어를 읽어 준다. */
const PET_ICON = 'paw';

test('46 내 분류를 만들고 아이콘을 고른다', async ({
  appShell,
  categories,
  demo,
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await demo.open('내 분류 만들기', '기본 분류에 내가 쓰는 것을 하나 더한다');

  await demo.step('관리 탭에서 카테고리 관리로 들어간다');
  await appShell.goToTab('관리');
  await appShell.followLink('카테고리 관리');
  await categories.waitReady();
  await expect(categories.basicRows).toHaveCount(11);
  await demo.beat(3);

  await demo.step('기본 분류는 처음부터 있고, 내가 만든 칸은 비어 있다');
  await expect(categories.emptyNotice).toBeVisible();
  await demo.beat(2);

  await demo.step('카테고리 만들기를 누른다');
  await categories.addButton.click();
  await categories.sheet.waitOpen();
  await expect(categories.sheet.createDialog).toBeVisible();
  await demo.beat(2);

  await demo.step('이름을 적는다');
  await categories.sheet.nameField.fill(PET);
  await expect(categories.sheet.nameField).toHaveValue(PET);
  await demo.beat(2);

  await demo.step('아이콘을 하나 고른다');
  await categories.sheet.iconCell(PET_ICON).click();
  await expect(categories.sheet.iconCell(PET_ICON)).toHaveAttribute('aria-pressed', 'true');
  await demo.beat(3);

  await demo.step('저장하면 다시 불러오지 않고 그 자리에 나타난다');
  await categories.sheet.saveButton.click();
  await categories.sheet.waitClosed();
  await expect(categories.mineButton(PET)).toBeVisible();
  await demo.beat(3);

  await demo.step('기본 칸이 아니라 내가 만든 칸에 선다');
  await expect(categories.mineRow(PET)).toBeVisible();
  await expect(categories.basicRow(PET)).toHaveCount(0);
  await demo.beat(3);

  await demo.step('기록 시트를 열면 그 분류가 칩으로 나와 있다');
  await appShell.pressBack();
  await appShell.goToTab('홈');
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(5_000);
  await expect(recordSheet.input.categoryChip(PET)).toBeVisible();
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});

test('47 기억한 자동 분류를 보고 지운다', async ({ categories, demo, home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await demo.open('기억한 분류', '한 번 고친 분류가 쌓이는 자리와 지우는 자리');

  await demo.step('줄글로 두 건을 한 줄에 적는다');
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('올리브영 23000 스벅 4500');
  await expect(recordSheet.nl.rows).toHaveCount(2);
  await demo.beat(3);

  await demo.step('올리브영을 건강·미용으로 읽었다');
  await expect(recordSheet.nl.row('올리브영')).toContainText('건강·미용');
  await demo.beat(2);

  await demo.step('내가 쓰는 대로 생활로 바꾼다');
  await recordSheet.nl.openEdit('올리브영');
  await recordSheet.nl.form.categoryChip('생활').click();
  await recordSheet.nl.form.apply();
  await expect(recordSheet.nl.row('올리브영')).toContainText('생활');
  await demo.beat(3);

  await demo.step('버튼에 적힌 대로 두 건을 저장한다');
  await expect(recordSheet.nl.saveButton).toHaveText(`2건 저장 · ${formatCurrency(27_500)}`);
  await recordSheet.nl.save();
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();
  await demo.beat(2);

  await demo.step('카테고리 관리에 두 상호가 쌓여 있다');
  await categories.open();
  await categories.waitReady();
  await expect(categories.rules.rows).toHaveCount(2);
  await demo.beat(3);

  await demo.step('어느 상호를 어떤 분류로 기억했는지 줄마다 적혀 있다');
  await expect(categories.rules.row('올리브영')).toContainText('생활');
  await demo.beat(3);

  await demo.step('스벅은 기억해 두지 않기로 하고 지운다');
  await categories.rules.remove('스벅');
  await expect(categories.rules.rows).toHaveCount(1);
  await demo.beat(3);

  await demo.step('남은 것까지 지우면 안내만 남는다');
  await categories.rules.remove('올리브영');
  await expect(categories.rules.emptyTitle).toBeVisible();
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});
