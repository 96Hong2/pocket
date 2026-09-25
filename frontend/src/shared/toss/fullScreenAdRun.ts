/**
 * 광고 한 편이 도는 길. **SDK 와 떼어 놓았다.**
 *
 * 이 배선에서 틀리면 광고가 뜬 채로 화면이 영영 안 넘어가는데, 그 사고는 실기기에서만
 * 보이고 재현도 어렵다. 목 브릿지는 이 길을 통째로 건너뛰므로 목으로는 못 잰다.
 * 그래서 SDK 두 함수를 **받아서** 쓴다. 검사는 가짜 두 개를 넣고 가짜 시계로 돌린다
 * (`fullScreenAdRun.test.ts`). 붙이는 일은 `tossBridge.ts` 가 한다.
 *
 * 무엇이 「떴다」 이고 무엇이 끝인지는 `fullScreenAdFlow` 가 정한다. 여기는 배선이다.
 */

import {
  DISMISS_FALLBACK_MS,
  FULL_SCREEN_LOAD_TIMEOUT_MS,
  FULL_SCREEN_SHOW_TIMEOUT_MS,
  adEventEffect,
  marksAdOnScreen,
  outcomeOf,
} from './fullScreenAdFlow';
import type { FullScreenAdHooks, FullScreenAdResult } from './types';

/** SDK 의 `loadFullScreenAd` · `showFullScreenAd` 가 이 모양이다. 돌려주는 것은 구독 해제 함수다. */
export type AdChannel = (params: {
  options: { adGroupId: string };
  onEvent: (event: { type: string }) => void;
  onError: (error: unknown) => void;
}) => () => void;

export interface AdSdk {
  load: AdChannel;
  show: AdChannel;
}

/**
 * 전면 광고 한 편을 불러와 띄우고 닫힐 때까지 기다린다.
 *
 * 보상 이벤트가 오면 `earned`, 떴다가 그냥 닫히면 `watched` 다. **둘을 뭉치지 않는다.**
 * 리워드형에서 보상 없이 닫힌 것은 중간에 나갔다는 뜻이라, 끝까지 본 사람과 같이 세면
 * 리워드 자리가 실제로 얼마나 끝까지 읽히는지 알 수 없다.
 */
export function runFullScreenAd(
  sdk: AdSdk,
  adGroupId: string,
  hooks?: FullScreenAdHooks,
): Promise<FullScreenAdResult> {
  return new Promise<FullScreenAdResult>((resolve) => {
    let settled = false;
    /**
     * 이미 한 편을 띄우라고 보냈나. **「떴다」 와 다른 값이다.**
     *
     * 보냈는데 한 번도 안 뜬 판이 있다. 그것을 `watched` 로 세면 광고가 한 장도 안 온
     * 기기와 끝까지 본 사람이 같은 칸에 들어간다. 그래서 둘을 따로 둔다.
     */
    let launched = false;
    /** 뜬 것으로 읽는 이벤트가 실제로 왔나. 결과를 가르는 것은 이쪽이다. */
    let shown = false;
    let earned = false;

    /*
      구독을 끊는 함수 둘. **받아서 쥐고 있다가 끝날 때 부른다.**

      예전에는 두 반환값을 그냥 버렸다. 끝난 뒤에도 구독이 살아 있어서 다음 광고의 신호가
      이미 끝난 판의 콜백으로 들어온다. 사진 자리가 상한 밖으로 나가며(ADR-0035) 한
      세션에 광고가 여러 편 도는 일이 흔해져, 이 누수가 실제로 겹치기 시작했다.

      노출 쪽 구독을 끊는 것에는 기대가 하나 더 있다. 그 실체가 SDK 의
      `__unsubscribeAppEvent` 라, 노출 중에 보내면 네이티브가 광고를 정리할지도 모른다.
      **정리한다면 그것이 멈춘 광고를 걷는 유일한 길이다**(우리에게 닫는 함수는 없다).
      확인은 실기기 몫이고, 여기서는 일단 제때 끊어 둔다.
    */
    let cancelLoad: (() => void) | undefined;
    let cancelShow: (() => void) | undefined;
    let loadCancelled = false;

    /** 광고가 뜬 뒤 화면이 다시 보이는지 듣는 자리. 닫힘 신호를 안 주는 버전을 위한 것이다. */
    let onVisible: (() => void) | undefined;
    /** 화면이 돌아온 뒤 닫힘으로 접기까지 기다리는 타이머. 다시 숨으면 걷는다. */
    let dismissTimer: ReturnType<typeof setTimeout> | undefined;
    /**
     * 광고가 뜬 뒤 화면이 **한 번이라도 숨었나.**
     *
     * 안 숨었으면 「다시 보인다」 는 아무 뜻도 없다. 그걸 닫힘으로 읽으면 광고가 아직
     * 화면을 덮고 있는데 다음 화면이 열린다. 숨은 적이 있어야 돌아온 것이다.
     */
    let wentHidden = false;
    /** 뜬 뒤 끝 신호를 기다리는 시계. **화면이 보이는 동안만 센다.** */
    let showTimer: ReturnType<typeof setTimeout> | undefined;

    const loadTimer = setTimeout(() => finish('failed'), FULL_SCREEN_LOAD_TIMEOUT_MS);

    function stopLoading(): void {
      if (loadCancelled) return;
      loadCancelled = true;
      cancelLoad?.();
    }

    function finish(result: FullScreenAdResult): void {
      if (settled) return;
      settled = true;
      clearTimeout(loadTimer);
      clearTimeout(showTimer);
      clearTimeout(dismissTimer);
      stopLoading();
      cancelShow?.();
      if (onVisible != null) document.removeEventListener('visibilitychange', onVisible);
      resolve(result);
    }

    /**
     * 뜬 뒤 끝 신호를 기다리는 시계를 건다. **화면이 보이는 동안만 센다.**
     *
     * 광고를 보다 전화를 받거나 알림을 열어 앱을 잠시 떠나는 사람이 있다. 그 시간까지
     * 세면 멀쩡히 광고를 본 사람이 「갇혔다」 로 잡히고, 그 세션 광고가 통째로 꺼진다.
     * 우리가 재려는 것은 사람이 앱 앞에 앉아 있는데 아무 일도 안 일어나는 시간이다.
     */
    function armShowTimer(): void {
      clearTimeout(showTimer);
      showTimer = undefined;
      if (document.visibilityState !== 'visible') return;
      showTimer = setTimeout(() => {
        // 뜬 적이 없으면 갇힌 것이 아니라 못 띄운 것이다. 둘을 한 낱말로 뭉치지 않는다.
        if (shown) hooks?.onStalled?.();
        finish(outcomeOf({ shown, earned }));
      }, FULL_SCREEN_SHOW_TIMEOUT_MS);
    }

    /**
     * 광고가 사람 눈앞에 섰다. 한 편에 한 번만 돈다.
     *
     * 여기서 닫힘 폴백을 건다. 안드로이드 토스앱 5.255.0 은 `dismissed` 를 주지 않아
     * (공식 FAQ), 폴백이 없으면 광고가 닫혀도 화면이 시간 제한까지 기다린다.
     */
    function onScreen(): void {
      if (shown) return;
      shown = true;
      hooks?.onShown?.();
      /*
        **여기서부터 시계를 센다.** 예전에는 띄우라고 보낸 순간부터 쟀는데, 네이티브가
        준비하는 시간까지 그 안에 들어가 끝까지 보던 사람이 끊겼다.
      */
      armShowTimer();
      /*
        **이미 숨어 있으면 그것이 곧 「광고가 덮었다」 다.**

        광고가 우리 웹뷰를 덮으면 화면이 먼저 숨고 `impression` 이 뒤에 오는 조합이 있다.
        그때는 숨는 신호를 들을 사람이 아직 없어서(아래에서 리스너를 단다) 「숨은 적 있음」
        이 영영 거짓으로 남고, 광고를 닫아도 닫힘 폴백이 안 걸린다.
      */
      if (document.visibilityState !== 'visible') wentHidden = true;
      if (onVisible != null) return;
      onVisible = () => {
        if (document.visibilityState !== 'visible') {
          /*
            ⚠ **다시 숨으면 걷는다.** 광고를 눌러 광고주 페이지로 나갔다 오는 길에 화면이
            잠깐 보이는 순간이 있다. 그때 건 타이머를 안 걷으면, 돌아와 끝까지 봐도 2초
            뒤에 이미 닫힘으로 접혀 보상을 못 받는다. 광고를 눌러 준 사람이 가장 손해다.
          */
          wentHidden = true;
          clearTimeout(dismissTimer);
          dismissTimer = undefined;
          clearTimeout(showTimer);
          showTimer = undefined;
          return;
        }
        armShowTimer();
        /*
          **한 번도 안 숨었으면 돌아온 것이 아니다.** 광고가 우리 웹뷰를 안 가리는 조합에서
          다른 이유로 visible 이 한 번 오면, 그걸 닫힘으로 읽어 광고가 떠 있는데 다음
          화면을 열게 된다.
        */
        if (!wentHidden) return;
        if (dismissTimer != null) return;
        dismissTimer = setTimeout(() => {
          // 접기 직전에 한 번 더 본다. 그 사이에 다시 숨었으면 아직 광고 중이다.
          if (document.visibilityState !== 'visible') return;
          finish(outcomeOf({ shown, earned }));
        }, DISMISS_FALLBACK_MS);
      };
      document.addEventListener('visibilitychange', onVisible);
    }

    const show = () => {
      /*
        한 편만 띄운다. 이 함수는 로드 구독의 `loaded` 에서 불리는데 그 구독은 한 번
        불렀다고 끊기지 않아서, `loaded` 가 한 번 더 오면 광고가 또 떠오른다.

        `settled` 도 함께 본다. 8초를 넘겨 이미 「못 띄웠다」 고 답한 뒤에 띄우면 부르던
        쪽은 벌써 다음 화면을 열었으므로 엉뚱한 화면 위로 광고가 덮인다.
      */
      if (settled || launched) return;
      launched = true;
      /*
        불러오기는 끝났다. 그 시계를 걷고 **로드 구독도 여기서 끊는다.**

        안 끊으면 광고가 떠 있는 동안 로드 채널로 오는 에러 하나가 `finish('failed')` 를
        불러, 광고가 화면을 덮은 채로 부르는 쪽이 다음 화면을 연다. 이 판이 막으려던
        바로 그 장면이다.

        뜬 뒤의 시계는 `onScreen()` 이 건다.
      */
      clearTimeout(loadTimer);
      stopLoading();
      /*
        **여기서도 시계를 건다.** 뜬 뒤의 시계는 `onScreen()` 이 다시 걸지만, 한 번도 안
        뜨는 판이 있다. 거기에 아무 시계가 없으면 약속이 영영 안 풀려 버튼이 죽은 채로 남는다.
      */
      armShowTimer();

      cancelShow = sdk.show({
        options: { adGroupId },
        onEvent: (event) => {
          /*
            끝난 뒤에 오는 신호는 버린다. 없으면 `finish` 가 떼고 간 자리에 리스너를
            새로 달게 되고, 그것을 떼어 줄 사람이 아무도 없다.
          */
          if (settled) return;
          if (marksAdOnScreen(event.type)) onScreen();
          const effect = adEventEffect(event.type);
          /*
            보상 이벤트 뒤에도 닫힘이 따라온다. 여기서 바로 끝내지 않고 표시만 해 두는
            이유는, 광고가 아직 화면을 덮고 있는 동안 다음 화면을 열면 그 위로 광고가
            남기 때문이다. 닫힘까지 기다렸다가 한 번에 답한다.
          */
          if (effect === 'reward') earned = true;
          if (effect === 'end') finish(outcomeOf({ shown, earned }));
          if (effect === 'fail') finish('failed');
        },
        onError: () => finish('failed'),
      });
      // 콜백이 먼저 끝났으면 위 구독 값이 아직 없었다. 여기서 한 번 더 끊는다.
      if (settled) cancelShow();
    };

    cancelLoad = sdk.load({
      options: { adGroupId },
      onEvent: (event) => {
        // 시간이 다 돼 접은 뒤에 오는 `loaded` 는 버린다. 화면은 이미 다음으로 넘어갔다.
        if (loadCancelled) return;
        if (event.type === 'loaded') show();
      },
      onError: () => {
        /*
          광고가 이미 떠 있는데 로드 채널로 늦게 오는 오류는 버린다. 안 버리면 광고가
          화면을 덮은 채로 부르는 쪽이 다음 화면을 연다. 구독을 끊어 뒀어도 방어한다.
        */
        if (loadCancelled || launched) return;
        finish('failed');
      },
    });
    if (loadCancelled || settled) cancelLoad();
  });
}
