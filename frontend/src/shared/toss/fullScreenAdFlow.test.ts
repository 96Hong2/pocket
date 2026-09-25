import { describe, expect, it } from 'vitest';

import {
  DISMISS_FALLBACK_MS,
  FULL_SCREEN_LOAD_TIMEOUT_MS,
  INTERSTITIAL_RELEASE_MS,
  REWARDED_RELEASE_MS,
  STALL_AFTER_MS,
  adEventEffect,
  marksAdOnScreen,
  outcomeOf,
} from './fullScreenAdFlow';

/**
 * 여기서 틀리면 광고가 뜬 채로 화면이 영영 안 넘어간다. 실기기에서만 보이고 재현도
 * 어려운 사고라, 판정만 떼어 내 표로 잰다.
 */

describe('marksAdOnScreen', () => {
  it('뜸·노출·눌림 셋 다 「떠 있다」 로 읽는다', () => {
    /*
      `show` 하나만 보면 안 된다. 그것을 안 주고 `impression` 부터 주는 조합에서 닫힘
      폴백이 아예 안 걸리고, 그 기기가 `dismissed` 도 안 주면 영영 기다린다.
    */
    expect(marksAdOnScreen('show')).toBe(true);
    expect(marksAdOnScreen('impression')).toBe(true);
    expect(marksAdOnScreen('clicked')).toBe(true);
  });

  it('불러오기와 끝 신호는 「떠 있다」 가 아니다', () => {
    expect(marksAdOnScreen('loaded')).toBe(false);
    expect(marksAdOnScreen('dismissed')).toBe(false);
    expect(marksAdOnScreen('failedToShow')).toBe(false);
    expect(marksAdOnScreen('userEarnedReward')).toBe(false);
  });
});

describe('adEventEffect', () => {
  it('보상은 표시만 하고 끝내지 않는다', () => {
    // 보상 뒤에도 닫힘이 온다. 여기서 끝내면 광고가 화면을 덮은 채 다음 화면이 열린다.
    expect(adEventEffect('userEarnedReward')).toBe('reward');
  });

  it('닫힘이 끝이고 실패는 실패다', () => {
    expect(adEventEffect('dismissed')).toBe('end');
    expect(adEventEffect('failedToShow')).toBe('fail');
  });

  it('나머지는 아무것도 안 한다', () => {
    expect(adEventEffect('loaded')).toBe(null);
    expect(adEventEffect('show')).toBe(null);
    expect(adEventEffect('clicked')).toBe(null);
  });
});

describe('outcomeOf', () => {
  it('보상이 왔으면 받은 것이다', () => {
    expect(outcomeOf({ shown: true, earned: true })).toBe('earned');
  });

  it('떴다가 보상 없이 끝났으면 본 것이다', () => {
    expect(outcomeOf({ shown: true, earned: false })).toBe('watched');
  });

  it('뜬 적이 없으면 못 띄운 것이다', () => {
    /*
      **여기가 핵심이다.** 띄우라고 보냈지만 한 번도 안 뜬 판을 `watched` 로 세면,
      광고가 한 장도 안 온 기기와 끝까지 본 사람이 같은 칸에 들어간다.
    */
    expect(outcomeOf({ shown: false, earned: false })).toBe('failed');
  });
});

describe('시간 제한', () => {
  it('전면은 15초, 리워드는 35초 안에 화면을 풀어 준다', () => {
    /*
      🔴 신고가 두 번 왔다. 「2분 넘게 지나도 아무런 반응 없고 눌러지지도 않아」.
      전면은 실측 5초 남짓, 리워드는 30초다. 각각 세 배와 한 배 조금을 준다.
    */
    expect(INTERSTITIAL_RELEASE_MS).toBe(15_000);
    expect(REWARDED_RELEASE_MS).toBe(35_000);
  });

  it('불러오기 제한보다는 길다', () => {
    // 못 불러온 것과 안 끝나는 것은 다른 일이다. 짧으면 불러오는 중에 접힌다.
    expect(INTERSTITIAL_RELEASE_MS).toBeGreaterThan(FULL_SCREEN_LOAD_TIMEOUT_MS);
  });

  it('갇혔다고 세는 시각은 화면을 푸는 시각보다 한참 뒤다', () => {
    /*
      **둘을 같은 값으로 두면 안 된다.** 15초에 안 끝난 광고가 전부 갇힌 것은 아닌데,
      갇힘 판정은 그 세션 광고를 통째로 끈다. 멀쩡한 사람의 수입까지 사라진다.
    */
    expect(STALL_AFTER_MS).toBeGreaterThanOrEqual(REWARDED_RELEASE_MS * 2);
  });

  it('닫힘 폴백은 화면이 돌아온 뒤 잠깐만 기다린다', () => {
    expect(DISMISS_FALLBACK_MS).toBeLessThan(5_000);
  });
});
