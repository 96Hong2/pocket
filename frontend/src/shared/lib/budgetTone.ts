/**
 * 예산을 얼마나 썼을 때 '주의' 로 볼지.
 *
 * 넘긴 뒤에 알려 주면 늦다. 넘기기 전에 한 번 눈에 띄어야 줄일 기회가 있다.
 * 홈 히어로와 카테고리 예산 줄이 같은 값을 써야 한 화면에서 서로 다른 말을 하지 않는다.
 */
export const CAUTION_RATIO = 0.8;

/** 이 비율을 넘겼나. 넘김(초과)까지 함께 볼지는 부르는 쪽이 정한다. */
export function isCaution(progress: number | null): boolean {
  return progress != null && progress >= CAUTION_RATIO;
}
