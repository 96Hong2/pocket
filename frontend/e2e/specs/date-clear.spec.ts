import { expect, test } from '../support/fixtures';

/**
 * 안 골라도 되는 날짜 칸은 비울 수 있어야 한다.
 *
 * 실기기에서 목표 기한을 지우려다 못 지운 자리가 있었다. 달력을 한 번 열면 「재설정」 을
 * 눌러도 칸에 값이 남는 기기가 있어(iOS), 「선택」 이라고 적힌 칸을 비울 방법이 사라진다.
 * 그래서 비울 수 있는 칸에는 ✕ 를 우리 손으로 단다.
 *
 * **기간을 고르는 자리가 여기 하나뿐이다.** 다른 날짜 칸 둘(모은 돈 더하기·가져오기 후보)은
 * 안 적으면 저장이 안 되는 필수 칸이라 ✕ 를 안 단다. 필수 칸에 ✕ 가 있으면 비워 놓고
 * 저장을 눌러 왜 안 되는지 모르는 자리가 생긴다.
 */

test('기한을 골랐다가 ✕ 로 지우고, 지운 채로 저장된다', async ({ goal }) => {
  await goal.open();
  await goal.waitReady();

  await goal.startButton.click();
  await goal.form.waitOpen();
  await goal.form.fill({ title: '제주도 여행', amount: 1_000_000, deadline: '2026-12-31' });

  // 값이 있을 때만 ✕ 가 선다. 빈 칸 옆의 ✕ 는 아무것도 안 하는 버튼이다.
  await expect(goal.form.deadlineClearButton).toBeVisible();

  await test.step('✕ 가 무엇에도 가려 있지 않다', async () => {
    /*
      **`toBeVisible` 은 겹침을 못 본다.** 처음에는 ✕ 를 칸 오른쪽 끝에 뒀는데 그 자리에
      크롬이 달력 아이콘을 그려서 ✕ 가 그 아래에 깔렸다. 시험은 초록이었고 캡처를
      눈으로 보다 잡았다. 그래서 그 점을 실제로 누르면 무엇이 잡히는지까지 본다.
    */
    const onTop = await goal.form.deadlineClearButton.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return hit != null && element.contains(hit);
    });
    expect(onTop, '지우기 ✕ 가 다른 것에 가려 있다').toBe(true);
  });

  await goal.form.deadlineClearButton.click();
  await expect(goal.form.deadlineField).toHaveValue('');
  await expect(goal.form.deadlineClearButton).toHaveCount(0);

  await goal.form.save();
  await goal.waitReady();

  // 기한이 없어도 목표는 목표다. 대신 「매달 얼마씩」 이라는 말은 만들 수 없다.
  await expect(goal.title).toHaveText('제주도 여행');
  await expect(goal.requiredMonthly).toHaveCount(0);
});

test('기한이 없을 때는 지우는 버튼도 없다', async ({ goal }) => {
  await goal.open();
  await goal.waitReady();

  await goal.startButton.click();
  await goal.form.waitOpen();

  await expect(goal.form.deadlineField).toHaveValue('');
  await expect(goal.form.deadlineClearButton).toHaveCount(0);
});

test('정해 둔 기한을 나중에 지울 수도 있다', async ({ goal }) => {
  await goal.open();
  await goal.waitReady();

  await goal.start({ title: '노트북', amount: 1_500_000, deadline: '2026-12-31' });
  await goal.waitReady();
  await expect(goal.requiredMonthly).toBeVisible();

  // 다시 열면 저장해 둔 기한이 그대로 있고, 그 자리에서 지울 수 있다.
  await goal.editButton.click();
  await goal.form.waitOpen();
  await expect(goal.form.deadlineField).toHaveValue('2026-12-31');
  await goal.form.deadlineClearButton.click();
  await goal.form.save();
  await goal.waitReady();

  await expect(goal.requiredMonthly).toHaveCount(0);
});
