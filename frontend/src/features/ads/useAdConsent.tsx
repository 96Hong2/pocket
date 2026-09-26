/**
 * 「누르면 광고가 뜬다」 를 **누르는 순간에 묻는** 자리.
 *
 * `useInterstitial` 이 상한을 세고, 여기가 그 앞에 확인 한 단계를 둔다. 화면은 이것만
 * 부르면 되고, 묻는 말과 모양은 한 곳에 모인다(2026-09-23 반려 대응, ADR-0031).
 *
 * **광고가 안 설 자리에서는 안 묻는다.** 상한을 이미 채웠거나 광고 그룹이 없는 기기면
 * 곧바로 이어서 한다. 아무 일도 안 일어나는데 창부터 띄우면 그건 예고가 아니라 방해다.
 */

import { useCallback, useState, type ReactNode } from 'react';

import { AdConsent } from './AdConsent';
import { useInterstitial, type InterstitialWhere } from './useInterstitial';

export interface AdConsentRequest {
  /** 로그에 남는 자리 이름. */
  where: InterstitialWhere;
  /** 확인 창에 적을 화면 이름. 「카테고리 관리」 처럼 보이는 그대로. */
  what: string;
  /** 광고가 끝난 뒤(또는 광고 없이) 이어서 할 일. */
  go: () => void;
}

export interface AdConsentHandle {
  /** 이 기기에서 지금 광고가 설 수 있나. 버튼 곁의 예고를 그릴지 이 값으로 가른다. */
  ready: boolean;
  /** 확인까지 마치고 광고를 기다리는 자리. 없으면 null. */
  pending: string | null;
  /** 눌렸을 때 부른다. 필요하면 먼저 묻고, 아니면 그대로 이어서 한다. */
  request: (input: AdConsentRequest) => void;
  /** 확인 창. 화면이 그대로 그린다. 물을 것이 없으면 null 이다. */
  prompt: ReactNode;
}

export function useAdConsent(): AdConsentHandle {
  const interstitial = useInterstitial();
  const [asking, setAsking] = useState<AdConsentRequest | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const { canShow, ready, show } = interstitial;

  const play = useCallback(
    async (input: AdConsentRequest): Promise<void> => {
      setPending(input.where);
      try {
        await show(input.where);
      } finally {
        setPending(null);
      }
      // 광고가 뜨든 안 뜨든 화면은 열린다. 광고 서버 사정으로 하려던 일을 막지 않는다.
      input.go();
    },
    [show],
  );

  const request = useCallback(
    (input: AdConsentRequest): void => {
      /*
        **묻지 않은 광고가 뜨는 일이 없어야 한다.** 그게 콘솔이 반려한 사유다.

        그래서 `ready`(그릴 때 쓰는 캐시)가 아니라 `canShow()` 로 **그 자리에서 다시
        읽어** 가른다. 둘이 어긋나는 창이 실제로 있다: 어제 상한을 채운 채 앱을 켜 두고
        자정을 넘기면 `ready` 는 거짓으로 굳어 있는데 문은 열려 있다.

        설 수 없으면 `play()` 로 지나간다. 그 안의 `show()` 가 상한에 걸린 것을
        `skipped`·`capped` 로 남긴다. 곧바로 `go()` 로 빠지면 상한이 몇 번 걸렸는지가
        어디에도 안 남아, 세션당 한 편이 맞는 선인지 알 수 없게 된다.
      */
      void canShow().then((allowed) => {
        if (allowed) {
          setAsking(input);
          return;
        }
        void play(input);
      });
    },
    [canShow, play],
  );

  return {
    ready,
    pending,
    request,
    prompt:
      asking == null ? null : (
        <AdConsent
          what={asking.what}
          onCancel={() => setAsking(null)}
          onConfirm={() => {
            const input = asking;
            setAsking(null);
            void play(input);
          }}
        />
      ),
  };
}
