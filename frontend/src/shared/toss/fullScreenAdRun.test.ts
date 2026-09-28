import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DISMISS_FALLBACK_MS,
  FULL_SCREEN_LOAD_TIMEOUT_MS,
  INTERSTITIAL_RELEASE_MS,
  REWARDED_RELEASE_MS,
} from './fullScreenAdFlow';
import { runFullScreenAd, type AdSdk } from './fullScreenAdRun';

/**
 * 광고 한 편이 도는 길을 **실기기와 같은 코드로** 잰다.
 *
 * 목 브릿지(`mockBridge`)는 이 배선을 통째로 건너뛴다. 시간 제한도 닫힘 폴백도 여기에만
 * 있어서, 목으로 재면 실기기에서 실제로 나는 일을 하나도 못 잰다. 그래서 SDK 두 함수만
 * 가짜로 넣고 나머지는 그대로 돌린다.
 *
 * 여기서 지키는 것 다섯이다.
 *
 * - 🔴 **덮여 있어도 시계가 돈다.** 15초·35초가 지나면 화면을 풀어 준다
 * - 🔴 **화면을 푸는 그 시각에 갇혔는지 가른다.** 그때도 덮고 있으면 갇힌 것이다(ADR-0041)
 * - 뜬 적이 없으면 **갇힌 것이 아니다**(못 띄운 것이다)
 * - 한 번도 안 숨었으면 「다시 보인다」 를 **닫힘으로 안 읽는다**
 * - 광고가 뜬 뒤 로드 채널로 오는 신호가 **판을 접지 않는다**
 */

interface Channel {
  onEvent: (event: { type: string }) => void;
  onError: (error: unknown) => void;
  cancelled: boolean;
}

let loads: Channel[] = [];
let shows: Channel[] = [];

const sdk: AdSdk = {
  load: (params) => {
    const entry: Channel = { onEvent: params.onEvent, onError: params.onError, cancelled: false };
    loads.push(entry);
    return () => {
      entry.cancelled = true;
    };
  },
  show: (params) => {
    const entry: Channel = { onEvent: params.onEvent, onError: params.onError, cancelled: false };
    shows.push(entry);
    return () => {
      entry.cancelled = true;
    };
  },
};

/** 화면이 보이나 안 보이나. jsdom 은 `visibilitychange` 를 저절로 쏘지 않는다. */
function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

/** 아직 답이 안 나왔는지. 나왔으면 그 값. */
async function peek(promise: Promise<unknown>): Promise<unknown> {
  const pending = Symbol('아직');
  return Promise.race([promise, Promise.resolve(pending)]);
}

beforeEach(() => {
  vi.useFakeTimers();
  loads = [];
  shows = [];
  setVisibility('visible');
});

afterEach(() => {
  vi.useRealTimers();
});

/** 광고를 띄우라고 보낸 상태까지 간다. */
function launch(
  hooks?: { onShown?: () => void; onStalled?: () => void; onAdGone?: () => void },
  releaseMs: number = INTERSTITIAL_RELEASE_MS,
) {
  const promise = runFullScreenAd(sdk, 'group-1', releaseMs, hooks);
  loads[0].onEvent({ type: 'loaded' });
  return promise;
}

describe('정상으로 끝나는 판', () => {
  it('떴다가 닫히면 본 것이다', async () => {
    const promise = launch();
    shows[0].onEvent({ type: 'show' });
    shows[0].onEvent({ type: 'dismissed' });
    await expect(promise).resolves.toBe('watched');
  });

  it('보상까지 오면 받은 것이다', async () => {
    const promise = launch();
    shows[0].onEvent({ type: 'impression' });
    shows[0].onEvent({ type: 'userEarnedReward' });
    // 보상 뒤에도 닫힘을 기다린다. 먼저 답하면 광고가 덮은 채로 다음 화면이 열린다.
    shows[0].onEvent({ type: 'dismissed' });
    await expect(promise).resolves.toBe('earned');
  });

  it('떴다고 한 번만 알린다', async () => {
    const onShown = vi.fn();
    const promise = launch({ onShown });
    shows[0].onEvent({ type: 'show' });
    shows[0].onEvent({ type: 'impression' });
    shows[0].onEvent({ type: 'clicked' });
    expect(onShown).toHaveBeenCalledTimes(1);
    shows[0].onEvent({ type: 'dismissed' });
    await promise;
  });

  it('끝나면 두 구독을 다 끊는다', async () => {
    const promise = launch();
    shows[0].onEvent({ type: 'show' });
    shows[0].onEvent({ type: 'dismissed' });
    await promise;
    expect(loads[0].cancelled).toBe(true);
    expect(shows[0].cancelled).toBe(true);
  });
});

describe('갇힌 판', () => {
  it('🔴 광고가 덮고 있어도 15초가 지나면 화면을 풀어 준다', async () => {
    /*
      🔴 **이 판의 핵심이다**(2026-09-25 신고: 「2분 넘게 지나도 아무런 반응 없고 눌러지지도
      않아」). 예전에는 화면이 보이는 동안만 셌는데, 광고가 웹뷰를 덮으면 화면은 hidden 이다.
      그래서 갇힌 바로 그 상황에서 시계가 한 번도 안 돌았다.
    */
    const promise = launch();
    setVisibility('hidden');
    shows[0].onEvent({ type: 'impression' });

    expect(await peek(promise)).toBeTypeOf('symbol');
    await vi.advanceTimersByTimeAsync(INTERSTITIAL_RELEASE_MS + 10);
    await expect(promise).resolves.toBe('watched');
    // 우리에게 닫는 함수는 없다. 구독을 끊는 것이 유일하게 해 볼 수 있는 일이다.
    expect(shows[0].cancelled).toBe(true);
  });

  it('🔴 15초 안에 광고가 걷히면 갇힌 것이 아니다', async () => {
    const onStalled = vi.fn();
    const promise = launch({ onStalled });
    setVisibility('hidden');
    shows[0].onEvent({ type: 'show' });

    // 닫힘 신호 없이 화면만 돌아오는 기기다. 닫힘 폴백이 접는다.
    await vi.advanceTimersByTimeAsync(10_000);
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(DISMISS_FALLBACK_MS + 10);
    await expect(promise).resolves.toBe('watched');

    await vi.advanceTimersByTimeAsync(INTERSTITIAL_RELEASE_MS);
    expect(onStalled).not.toHaveBeenCalled();
  });

  it('🔴 15초에도 덮고 있으면 그 자리에서 갇혔다고 알린다', async () => {
    /*
      전면은 5~10초짜리다. 15초가 지나도 덮고 있으면 기다려 주는 사람은 없다(2026-09-28
      사용자 지시). 예전처럼 90초까지 미루면 그 사이에 앱을 끈 사람의 기기가 그대로 남는다.
    */
    const onStalled = vi.fn();
    const promise = launch({ onStalled });
    setVisibility('hidden');
    shows[0].onEvent({ type: 'show' });

    await vi.advanceTimersByTimeAsync(INTERSTITIAL_RELEASE_MS - 10);
    expect(onStalled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20);
    await expect(promise).resolves.toBe('watched');
    await vi.advanceTimersByTimeAsync(DISMISS_FALLBACK_MS);
    expect(onStalled).toHaveBeenCalledTimes(1);
  });

  it('🔴 리워드는 35초에 가른다', async () => {
    const onStalled = vi.fn();
    const promise = launch({ onStalled }, REWARDED_RELEASE_MS);
    setVisibility('hidden');
    shows[0].onEvent({ type: 'show' });

    await vi.advanceTimersByTimeAsync(REWARDED_RELEASE_MS - 10);
    expect(onStalled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20);
    await expect(promise).resolves.toBe('watched');
    await vi.advanceTimersByTimeAsync(DISMISS_FALLBACK_MS);
    expect(onStalled).toHaveBeenCalledTimes(1);
  });

  it('🔴 밀린 시계가 먼저 돌아도 곧 화면이 돌아오면 갇힌 것이 아니다', async () => {
    /*
      광고가 덮고 있는 동안 웹뷰 타이머는 밀린다. 광고가 제때 닫혔는데 밀린 시계가 화면
      복귀 신호보다 먼저 돌 수 있다. 판정이 한 번이면 그 기기의 광고가 영영 꺼지므로
      화면만 먼저 풀고 판정은 잠깐 기다린다.
    */
    const onStalled = vi.fn();
    const onAdGone = vi.fn();
    const promise = launch({ onStalled, onAdGone });
    setVisibility('hidden');
    shows[0].onEvent({ type: 'show' });

    await vi.advanceTimersByTimeAsync(INTERSTITIAL_RELEASE_MS + 10);
    await expect(promise).resolves.toBe('watched');
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(DISMISS_FALLBACK_MS * 2);

    expect(onStalled).not.toHaveBeenCalled();
    expect(onAdGone).toHaveBeenCalledTimes(1);
  });

  it('갇혔다고 판정한 뒤라도 광고가 걷히면 표를 지운다', async () => {
    // 안 지우면 앱을 계속 쓴 사람이 다음 실행에서 「덮인 채 꺼졌다」 로 또 세어진다.
    const onStalled = vi.fn();
    const onAdGone = vi.fn();
    launch({ onStalled, onAdGone });
    setVisibility('hidden');
    shows[0].onEvent({ type: 'show' });

    await vi.advanceTimersByTimeAsync(INTERSTITIAL_RELEASE_MS + DISMISS_FALLBACK_MS + 10);
    expect(onStalled).toHaveBeenCalledTimes(1);
    expect(onAdGone).not.toHaveBeenCalled();

    setVisibility('visible');
    expect(onAdGone).toHaveBeenCalledTimes(1);
  });

  it('🔴 광고를 눌러 나간 사람을 갇힌 것으로 세지 않는다', async () => {
    /*
      **광고를 누르면 토스가 광고주 페이지를 열고 우리 웹뷰는 숨는다.** 거기 오래 머무는
      것은 광고 클릭의 정상 모습이고, 노출이 아니라 클릭이 우리가 돈을 버는 자리다.
      화면 상태만 보면 그 모습과 갇힌 것이 똑같이 보인다. 가르지 않으면 **광고를 눌러 준
      사람의 기기에서 광고를 끄게 된다**(PR 리뷰가 잡았다).
    */
    const onStalled = vi.fn();
    const promise = launch({ onStalled });
    setVisibility('hidden');
    shows[0].onEvent({ type: 'show' });
    shows[0].onEvent({ type: 'clicked' });

    await vi.advanceTimersByTimeAsync(INTERSTITIAL_RELEASE_MS + DISMISS_FALLBACK_MS + 10);
    await expect(promise).resolves.toBe('watched');
    expect(onStalled).not.toHaveBeenCalled();
  });

  it('🔴 광고를 누르면 그 자리에서 표를 지운다', () => {
    /*
      광고주 페이지에 머무는 사이 토스가 백그라운드에서 정리되면 표가 남는다. 덮인 채 한 번
      꺼지면 기기의 광고를 끄므로, 광고를 눌러 준 사람의 기기가 막힌다.
    */
    const onShown = vi.fn();
    const onAdGone = vi.fn();
    launch({ onShown, onAdGone });
    setVisibility('hidden');
    // 떴다는 신호 없이 누름부터 오는 조합도 있다. 표를 적은 뒤에 지워야 한다.
    shows[0].onEvent({ type: 'clicked' });

    expect(onShown).toHaveBeenCalledTimes(1);
    expect(onAdGone).toHaveBeenCalledTimes(1);
    expect(onShown.mock.invocationCallOrder[0]).toBeLessThan(onAdGone.mock.invocationCallOrder[0]);
  });

  it('🔴 뜬 적이 없으면 갇힌 것이 아니다', async () => {
    /*
      띄우라고 보냈는데 한 번도 안 뜬 판이 있다(렌더 실패·느린 기기). 그것을 갇힌 것으로
      세면 「못 띄웠다」 와 「갇혔다」 가 한 칸에 들어간다. 갇힘을 세는 쪽이 그 세션 광고를
      통째로 끄기 때문에, 멀쩡한 사람의 광고까지 사라진다.
    */
    const onStalled = vi.fn();
    const promise = launch({ onStalled });

    await vi.advanceTimersByTimeAsync(INTERSTITIAL_RELEASE_MS * 2);
    expect(onStalled).not.toHaveBeenCalled();
    await expect(promise).resolves.toBe('failed');
  });

  it('🔴 리워드는 35초까지 기다린다', async () => {
    /*
      리워드는 실측 30초다. 전면과 같은 15초로 끊으면 **끝까지 보던 사람의 보상이 잘린다.**
      사진 한 장을 받으려고 광고를 본 사람에게서 그 장을 빼앗는 셈이다.
    */
    const promise = launch(undefined, REWARDED_RELEASE_MS);
    setVisibility('hidden');
    shows[0].onEvent({ type: 'show' });

    await vi.advanceTimersByTimeAsync(INTERSTITIAL_RELEASE_MS + 10);
    expect(await peek(promise)).toBeTypeOf('symbol');

    shows[0].onEvent({ type: 'userEarnedReward' });
    await vi.advanceTimersByTimeAsync(REWARDED_RELEASE_MS);
    await expect(promise).resolves.toBe('earned');
  });

  it('보상까지 받았는데 닫힘만 안 오면 받은 것으로 끝낸다', async () => {
    // 닫힘을 안 주는 안드로이드 버전이 실재한다. 그 사람의 보상을 버리지 않는다.
    const promise = launch();
    shows[0].onEvent({ type: 'show' });
    shows[0].onEvent({ type: 'userEarnedReward' });

    await vi.advanceTimersByTimeAsync(INTERSTITIAL_RELEASE_MS + 10);
    await expect(promise).resolves.toBe('earned');
  });
});

describe('🔴 리뷰가 잡은 자리', () => {
  it('화면이 잠깐씩 비쳐도 15초를 처음부터 다시 세지 않는다', () => {
    /*
      🔴 **고치려던 버그와 같은 모양이 다른 자리에 있었다**(PR #84 리뷰).

      광고를 눌러 광고주 페이지로 나갔다 오는 길에 화면이 잠깐 비친다. 그때 시계를 다시
      걸면 경과 시간이 0으로 돌아가, 13초 덮임과 1초 비침을 되풀이하는 판에서 15초가
      영영 안 찬다. 남은 시간이 아니라 **마감 시각**을 쥐고 있어야 한다.
    */
    const promise = launch();
    setVisibility('hidden');
    shows[0].onEvent({ type: 'impression' });

    let done = false;
    void promise.then(() => {
      done = true;
    });

    // 13초 덮임 + 1초 비침을 되풀이한다. 합계 14초 × 2 = 28초.
    for (let lap = 0; lap < 2; lap += 1) {
      vi.advanceTimersByTime(13_000);
      setVisibility('visible');
      vi.advanceTimersByTime(1_000);
      setVisibility('hidden');
    }
    expect(done).toBe(false);
    // 아직 안 풀렸다면 마감 시각이 이미 지났으므로 다음 틱에 풀린다.
    vi.advanceTimersByTime(1);
    return vi.runOnlyPendingTimersAsync().then(() => expect(promise).resolves.toBe('watched'));
  });

  it('닫힘 신호가 왔으면 화면이 안 보여도 갇힌 것으로 안 센다', async () => {
    /*
      🔴 판정 근거가 「화면이 안 보인다」 하나뿐이면 광고를 다 보고 곧장 다른
      앱으로 넘어간 사람이 전부 갇힘으로 잡힌다. 닫힘 신호가 광고가 닫혔다는 유일한 증거다.
    */
    const onStalled = vi.fn();
    const onAdGone = vi.fn();
    const promise = launch({ onStalled, onAdGone });
    setVisibility('hidden');
    shows[0].onEvent({ type: 'show' });

    // 광고는 닫혔는데 사람은 다른 앱에 있다. 화면은 계속 안 보인다.
    await vi.advanceTimersByTimeAsync(8_000);
    shows[0].onEvent({ type: 'dismissed' });
    await expect(promise).resolves.toBe('watched');
    expect(onAdGone).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(INTERSTITIAL_RELEASE_MS * 2);
    expect(onStalled).not.toHaveBeenCalled();
  });

  it('정상으로 닫히면 걷혔다고 알린다', async () => {
    // 표를 지우는 자리다. 화면을 푼 시각이 아니라 걷힌 것을 확인한 이 자리에서 지운다.
    const onAdGone = vi.fn();
    const promise = launch({ onAdGone });
    shows[0].onEvent({ type: 'show' });
    shows[0].onEvent({ type: 'dismissed' });
    await promise;
    expect(onAdGone).toHaveBeenCalledTimes(1);
  });

  it('갇힌 판에서는 걷혔다고 안 알린다', async () => {
    // 표가 남아야 다음 실행에서 `ad_stuck_exit` 로 세어진다.
    const onAdGone = vi.fn();
    const onStalled = vi.fn();
    const promise = launch({ onAdGone, onStalled });
    setVisibility('hidden');
    shows[0].onEvent({ type: 'show' });

    await vi.advanceTimersByTimeAsync(INTERSTITIAL_RELEASE_MS + 10);
    await promise;
    await vi.advanceTimersByTimeAsync(DISMISS_FALLBACK_MS);
    expect(onStalled).toHaveBeenCalledTimes(1);
    expect(onAdGone).not.toHaveBeenCalled();
  });
});

describe('닫힘 폴백', () => {
  it('숨었다 돌아오면 닫힌 것으로 본다', async () => {
    const promise = launch();
    shows[0].onEvent({ type: 'show' });

    setVisibility('hidden');
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(DISMISS_FALLBACK_MS + 10);
    await expect(promise).resolves.toBe('watched');
  });

  it('🔴 한 번도 안 숨었으면 다시 보인다고 접지 않는다', async () => {
    /*
      광고가 우리 웹뷰를 안 가리는 조합에서 다른 이유로 visible 이 한 번 오면, 그것을
      닫힘으로 읽어 **광고가 떠 있는데 다음 화면이 열린다.**
    */
    const promise = launch();
    shows[0].onEvent({ type: 'show' });

    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(DISMISS_FALLBACK_MS + 10);
    expect(await peek(promise)).toBeTypeOf('symbol');

    shows[0].onEvent({ type: 'dismissed' });
    await expect(promise).resolves.toBe('watched');
  });

  it('돌아왔다 다시 숨으면 접지 않는다', async () => {
    // 광고를 눌러 광고주 페이지로 나갔다 오는 길에 화면이 잠깐 보인다. 그 사람이 가장 값지다.
    const promise = launch();
    shows[0].onEvent({ type: 'show' });

    setVisibility('hidden');
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(DISMISS_FALLBACK_MS / 2);
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(DISMISS_FALLBACK_MS * 2);
    expect(await peek(promise)).toBeTypeOf('symbol');

    setVisibility('visible');
    shows[0].onEvent({ type: 'userEarnedReward' });
    shows[0].onEvent({ type: 'dismissed' });
    await expect(promise).resolves.toBe('earned');
  });
});

describe('로드 채널', () => {
  it('🔴 광고가 뜬 뒤에 오는 로드 오류가 판을 접지 않는다', async () => {
    /*
      로드 구독을 안 끊어 두면 그 채널로 오는 에러 하나가 판을 실패로 접는다. 광고는
      화면을 덮고 있는데 부르는 쪽은 다음 화면을 연다. 이 판이 막으려던 그 장면이다.
    */
    const promise = launch();
    shows[0].onEvent({ type: 'show' });
    loads[0].onError(new Error('늦게 온 로드 오류'));

    expect(await peek(promise)).toBeTypeOf('symbol');
    shows[0].onEvent({ type: 'dismissed' });
    await expect(promise).resolves.toBe('watched');
  });

  it('두 번째 loaded 로 광고를 또 띄우지 않는다', async () => {
    const promise = launch();
    loads[0].onEvent({ type: 'loaded' });
    expect(shows).toHaveLength(1);

    shows[0].onEvent({ type: 'show' });
    shows[0].onEvent({ type: 'dismissed' });
    await promise;
  });

  it('제때 못 불러오면 광고 없이 지나간다', async () => {
    const promise = runFullScreenAd(sdk, 'group-1', INTERSTITIAL_RELEASE_MS);
    await vi.advanceTimersByTimeAsync(FULL_SCREEN_LOAD_TIMEOUT_MS + 10);
    await expect(promise).resolves.toBe('failed');
    expect(shows).toHaveLength(0);
  });

  it('시간이 다 된 뒤에 오는 loaded 로는 안 띄운다', async () => {
    const promise = runFullScreenAd(sdk, 'group-1', INTERSTITIAL_RELEASE_MS);
    await vi.advanceTimersByTimeAsync(FULL_SCREEN_LOAD_TIMEOUT_MS + 10);
    loads[0].onEvent({ type: 'loaded' });
    expect(shows).toHaveLength(0);
    await expect(promise).resolves.toBe('failed');
  });
});
