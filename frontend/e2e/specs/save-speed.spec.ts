import { expect, test } from '../support/fixtures';

/**
 * 저장이 얼마나 빨리 끝나는지.
 *
 * 이 파일만 따로 있는 이유가 있다. 여기 있는 단언은 벽시계 시간이라 **같은 스택에 다른 테스트가
 * 함께 붙어 있으면 그 경합까지 함께 잰다.** 서버와 브라우저가 하나뿐이라 워커가 늘수록 값이 커진다.
 * 실제로 spec 이 34개에서 37개로 늘었을 때 서버 처리 시간은 그대로(중앙값 13ms)인데 이 단언만
 * 320~440ms 로 빨개졌다. 제품이 느려진 것이 아니라 측정 자리가 시끄러웠던 것이다.
 *
 * 그래서 `playwright.config.ts` 가 이 파일을 `perf` 프로젝트로 떼어 내고, 나머지가 전부 끝난 뒤에
 * 혼자 돌게 한다. 여기에 다른 테스트를 더하지 않는다. 하나라도 더하면 다시 서로를 재게 된다.
 */

const CATEGORY = '식비';

test('저장 응답이 300ms 안에 온다', async ({ page, home, recordSheet }) => {
  await home.open();
  await home.waitReady();

  await home.recordButton.click();
  await recordSheet.waitOpen();

  // 첫 저장은 계정을 만드는 왕복이 섞인다. 그것을 워밍업으로 쓰고 두 번째를 잰다.
  await recordSheet.input.enterAmount(1000);
  await recordSheet.input.pickCategory(CATEGORY);
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/transactions') &&
      response.request().method() === 'POST' &&
      response.status() === 201,
  );

  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(2000);
  await recordSheet.input.pickCategory(CATEGORY);

  const response = await saved;
  // waitForResponse 는 헤더를 받은 시점에 풀린다. 본문을 다 읽기 전의 responseEnd 는 -1 이라
  // 이 줄이 없으면 elapsed 가 항상 음수가 되어 아래 단언이 무슨 값이 와도 통과한다.
  await response.finished();

  const timing = response.request().timing();
  const elapsed = timing.responseEnd - timing.requestStart;

  // 음수면 시간을 못 잰 것이다. 못 잰 채로 초록이 되지 않게 여기서 먼저 막는다.
  expect(elapsed, '저장 응답 시간을 재지 못했다').toBeGreaterThan(0);
  expect(elapsed, `저장 응답이 ${Math.round(elapsed)}ms 걸렸다`).toBeLessThan(300);
});
