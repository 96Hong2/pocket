import { createContext, useContext } from 'react';

export interface OnboardingContextValue {
  /**
   * 처음 안내가 화면을 덮고 있나. **아직 모르는 동안은 `null`.**
   *
   * 모르는 동안을 「안 떠 있다」 로 세면, 안내가 뜨기 직전 한 프레임에 다른 안내가
   * 먼저 열린다. 읽는 쪽은 `null` 도 막힌 것으로 다룬다.
   */
  showing: boolean | null;
  /** 문지기가 판단을 끝내면 한 번, 안내가 닫히면 한 번 알린다. */
  setShowing(value: boolean): void;
}

export const OnboardingContext = createContext<OnboardingContextValue | null>(null);

/**
 * 처음 안내가 떠 있는지 알려 준다.
 *
 * 한 번뿐인 안내가 여럿이라 서로 겹친다. 처음 안내의 마지막 장이 홈 화면 추가를 이미
 * 말하는데 그 위에 같은 시트가 또 열리면 같은 말을 두 번 듣고, 심하면 아무것도 안 적은
 * 사람이 「첫 기록 끝!」 을 본다. 실제로 그렇게 떴다.
 *
 * **저장소 표시로 서로 눈치 보게 하지 않는다.** 둘 다 마운트하며 표시를 읽고 쓰기 때문에
 * 누가 먼저인지가 그때그때 달라진다. 지금 떠 있는지는 화면이 알고 있으니 그대로 넘긴다.
 */
export function useOnboardingShowing(): boolean | null {
  const value = useContext(OnboardingContext);
  if (value == null) {
    throw new Error('useOnboardingShowing 은 OnboardingProvider 안에서만 쓸 수 있어요.');
  }
  return value.showing;
}

export function useOnboardingReport(): (value: boolean) => void {
  const value = useContext(OnboardingContext);
  if (value == null) {
    throw new Error('useOnboardingReport 는 OnboardingProvider 안에서만 쓸 수 있어요.');
  }
  return value.setShowing;
}
