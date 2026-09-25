import { useCallback, useState } from 'react';

import { useBridge } from '../../app/providers';
import { clearAdOnScreen, markAdOnScreen } from '../../shared/lib/stuckAd';
import type { AdsBridge, FullScreenAdHooks } from '../../shared/toss';

/**
 * 개발에서 쓰는 공식 테스트 전면 광고.
 *
 * **운영 번들에는 이 문자열이 실리면 안 된다.** 콘솔 검토가 번들 안을 훑어 테스트 광고 ID 를
 * 찾아내고, 나오면 반려한다(2026-09-16 에 실제로 반려됐다). 실행할 때 갈라서는 늦다.
 * `import.meta.env.DEV` 는 vite 가 빌드 때 `false` 로 갈아 끼우므로 이 가지가 통째로 지워진다.
 *
 * 리워드 자리도 이 값을 쓴다. 리워드용 공식 테스트 ID 는 확인된 것이 없어서, 이름을 지어내는
 * 대신 확인된 전면 테스트 ID 로 대신 띄운다. 개발에서는 보상 이벤트가 안 오므로 실기기
 * 개발 빌드에서 리워드 자리는 `watched` 로 끝난다(브라우저는 목이 `earned` 로 답한다).
 */
const TEST_GROUP = import.meta.env.DEV ? 'ait-ad-test-interstitial-id' : null;

/**
 * 전면 광고를 지나온 결과.
 *
 * - `watched`  광고가 뜨고 닫혔다
 * - `skipped`  광고 없이 지나갔다. 왜인지는 `reason` 이 말한다
 */
export type FullScreenAdOutcome = { result: 'watched' } | { result: 'skipped'; reason: SkipReason };

/**
 * 광고 없이 지나간 이유.
 *
 * `stalled` 만 성질이 다르다. 나머지 셋은 광고가 **안 뜬** 것이고, 이것은 떴는데 끝나지
 * 않아 우리가 접은 것이다. 한 낱말로 뭉치면 「광고 서버가 안 준다」 와 「광고에 갇혔다」 가
 * 같은 칸에 들어가, 갇힌 사람이 몇인지 영영 모른다.
 */
export type SkipReason = 'no_group' | 'unsupported' | 'failed' | 'stalled';

/**
 * 리워드 광고를 지나온 결과.
 *
 * - `earned`   끝까지 보고 보상까지 받았다
 * - `watched`  떴지만 보상 전에 닫았다
 * - `skipped`  광고 없이 지나갔다
 */
export type RewardedAdOutcome =
  { result: 'earned' } | { result: 'watched' } | { result: 'skipped'; reason: SkipReason };

/**
 * 어느 광고 그룹을 띄울지.
 *
 * 배너와 같은 규칙이다. 운영 값은 빌드 환경변수로만 들어오고, 비어 있으면 null 이라
 * 광고 없이 지나간다. `toss` 가 아닌 판은 개발 빌드에서만 테스트 광고로 간다.
 * 운영 번들에서는 `TEST_GROUP` 이 null 이라 그 자리도 광고 없이 지나간다.
 */
function resolveGroup(environment: string, configured: unknown): string | null {
  if (environment !== 'toss') return TEST_GROUP;
  return typeof configured === 'string' && configured.trim() !== '' ? configured.trim() : null;
}

/**
 * 광고 한 편을 띄우고 지나온 자리를 알려 준다.
 *
 * **광고가 안 떠도 기능은 열린다.** 광고 서버 사정으로 사람이 하려던 일을 못 하게 두지
 * 않는다. 대신 무엇 때문에 지나갔는지를 결과에 담아, 부르는 쪽이 로그로 남기게 한다.
 * 광고를 보는 동안 `busy` 가 켜져 버튼을 잠근다.
 */
function useAdShow(
  configured: unknown,
  run: (
    ads: AdsBridge,
    group: string,
    hooks: FullScreenAdHooks,
  ) => Promise<'earned' | 'watched' | 'failed'>,
): {
  busy: boolean;
  available: boolean;
  show: (where: string) => Promise<RewardedAdOutcome>;
} {
  const bridge = useBridge();
  const [busy, setBusy] = useState(false);
  /*
    갇힘 판정이 늦게 오면 그릴 기회가 없다. 그 판정은 `available` 을 뒤집는데, 모듈
    변수라서 스스로 그림을 다시 그리게 하지 못한다. 그때 이 값을 올려 한 번 그린다.
  */
  const [, bump] = useState(0);
  /*
    이 기기에서 애초에 광고가 설 수 있는가. 못 서는 곳에 예고를 적지 않으려고 화면에 알린다.

    **이 세션에서 한 번 갇혔으면 여기서 닫는다.** 아래 `stalledThisSession` 을 참고.
  */
  const available =
    !stalledThisSession &&
    resolveGroup(bridge.environment, configured) != null &&
    bridge.supports('fullScreenAd');

  const show = useCallback(
    async (where: string): Promise<RewardedAdOutcome> => {
      /*
        갇힌 적이 있으면 이 세션에서는 다시 안 띄운다.

        광고가 뜬 채 멈추는 판은 **특정 기기와 특정 광고의 조합**에서 난다. 한 번 걸린
        사람은 다음에도 걸린다. 화면은 15초에 풀리지만 광고 자체는 그대로 덮고 있어
        아무것도 못 누른다. 그 사람에게서 이번 세션의 광고 수입을 포기하는 쪽이 싸다.
      */
      if (stalledThisSession) return { result: 'skipped', reason: 'stalled' };

      const group = resolveGroup(bridge.environment, configured);
      if (group == null) return { result: 'skipped', reason: 'no_group' };
      if (!bridge.supports('fullScreenAd')) return { result: 'skipped', reason: 'unsupported' };

      setBusy(true);
      let stalled = false;
      /*
        표를 적는 약속을 쥐고 있다가 지우기 전에 기다린다.

        둘 다 네이티브를 다녀오는 일이라 순서 보장이 없다. 빨리 끝나는 판에서 적기가
        지우기보다 늦게 닿으면 표가 남고, 다음 실행에서 멀쩡한 사람이 갇힌 것으로 세어진다.
      */
      let marking: Promise<void> = Promise.resolve();
      try {
        /*
          광고가 뜨는 순간 표를 적고 **걷힌 것을 확인하면** 지운다. 갇힌 사람은 답을
          기다리지 않고 앱을 끄기 때문에, 결과만 보면 가장 나쁜 결말이 통계에서 통째로 빠진다.

          🔴 **화면을 풀어 준 시각에 지우지 않는다.** 전면 15초·리워드 35초에 화면은 먼저
          풀리지만 광고는 그대로 덮고 있을 수 있다. 거기서 지우면 정작 갇힌 사람이 안 세어진다.
        */
        const result = await run(bridge.ads, group, {
          onShown: () => {
            marking = markAdOnScreen(bridge.storage, where);
          },
          onAdGone: () => {
            // 적기가 먼저 닿게 이어 붙인다. 둘 다 네이티브를 다녀와 순서 보장이 없다.
            void marking.then(() => clearAdOnScreen(bridge.storage));
          },
          onStalled: () => {
            stalled = true;
            stalledThisSession = true;
            /*
              **판정이 답보다 늦게 온다.** 화면은 15·35초에 먼저 풀고, 정말 갇힌 것인지는
              90초까지 보고 정한다. 그래서 그림 그릴 기회를 여기서 한 번 준다. 안 주면
              화면은 「광고 보고 받기」 를 계속 권하는데 누르면 그냥 지나간다.
            */
            bump((n) => n + 1);
          },
        });
        await marking;
        /*
          **결과가 나왔으면 그 결과를 살린다.** 보상까지 받았는데 닫힘 신호만 안 와서 접힌
          판이 있다(닫힘을 안 주는 안드로이드 버전). 그것을 「광고 안 봄」 으로 적으면
          콘솔이 세는 노출과 우리 장부가 갈린다. 갇혔다는 사실은 세션 스위치가 이미 든다.
        */
        if (result !== 'failed') return { result };
        return { result: 'skipped', reason: stalled ? 'stalled' : 'failed' };
      } finally {
        setBusy(false);
      }
    },
    [bridge, configured, run],
  );

  return { busy, available, show };
}

/**
 * 이 세션에서 광고가 뜬 채 멈춘 적이 있나.
 *
 * 훅 바깥의 모듈 변수다. 화면마다 훅이 따로 도는데 **사람은 하나**라서, 훅 안에 두면
 * 캡처 탭에서 갇힌 사람이 영수증 탭에서 다시 갇힌다.
 */
let stalledThisSession = false;

/** 테스트 사이에 세션 기억을 비운다. */
export function resetStalledMemory(): void {
  stalledThisSession = false;
}

const runFullScreen = (ads: AdsBridge, group: string, hooks: FullScreenAdHooks) =>
  ads.showFullScreen(group, hooks);
const runRewarded = (ads: AdsBridge, group: string, hooks: FullScreenAdHooks) =>
  ads.showRewarded(group, hooks);

/**
 * 부가기능 앞에 세우는 전면 광고 한 편.
 *
 * 화면이 직접 부르지 않는다. 총량을 세는 `useInterstitial()` 만 이걸 쓴다.
 */
export function useFullScreenAd(): {
  busy: boolean;
  available: boolean;
  show: (where: string) => Promise<FullScreenAdOutcome>;
} {
  const { busy, available, show } = useAdShow(
    import.meta.env.VITE_AD_FULLSCREEN_GROUP_ID,
    runFullScreen,
  );

  const showInterstitial = useCallback(
    async (where: string): Promise<FullScreenAdOutcome> => {
      const outcome = await show(where);
      // 전면형 그룹에서 보상 이벤트가 올 일은 없다. 와도 「봤다」 와 다를 것이 없다.
      return outcome.result === 'earned' ? { result: 'watched' } : outcome;
    },
    [show],
  );

  return { busy, available, show: showInterstitial };
}

/**
 * 사람이 스스로 광고와 맞바꾸는 자리에 세우는 리워드 광고 한 편.
 *
 * 상한(`useInterstitial`)을 지나지 않는다. 상한은 **안 물어보고 끼어드는 광고**로부터
 * 사람을 지키는 장치인데, 여기는 무엇을 받는지 먼저 읽고 스스로 누른 자리다.
 * 그 사람에게 「오늘 이미 두 편 보셨어요」 라고 답하면 약속을 우리가 깨는 셈이 된다.
 */
export function useRewardedAd(): {
  busy: boolean;
  available: boolean;
  show: (where: string) => Promise<RewardedAdOutcome>;
} {
  return useAdShow(import.meta.env.VITE_AD_REWARDED_GROUP_ID, runRewarded);
}

/**
 * 사진 한 장을 받으려고 스스로 보는 광고.
 *
 * **전용 그룹을 먼저 본다.** 콘솔은 광고 그룹마다 보상 이름을 하나만 갖는다. 생활비 계산기
 * 그룹을 사진에도 쓰면 광고 화면이 말하는 보상과 우리가 실제로 주는 것이 어긋난다.
 * 전용 그룹 id 가 아직 없는 동안에만 기존 그룹으로 떨어지고, 값이 들어오면 저절로 옮겨 간다.
 */
export function usePhotoRewardedAd(): {
  busy: boolean;
  available: boolean;
  show: (where: string) => Promise<RewardedAdOutcome>;
} {
  const dedicated = import.meta.env.VITE_AD_PHOTO_GROUP_ID;
  const configured =
    typeof dedicated === 'string' && dedicated.trim() !== ''
      ? dedicated
      : import.meta.env.VITE_AD_REWARDED_GROUP_ID;
  return useAdShow(configured, runRewarded);
}
