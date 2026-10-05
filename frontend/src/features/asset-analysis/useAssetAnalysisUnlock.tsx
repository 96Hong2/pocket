import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { useBridge } from '../../app/providers';
import type { AssetAnalysisScope } from '../../app/router/routes';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { AdConsent, useAssetAnalysisRewardedAd } from '../ads';

import {
  analysisLockState,
  readAnalysisLock,
  withFingerprint,
  writeAnalysisLock,
  type AnalysisLock,
  type AnalysisLockState,
} from './analysisLock';

/**
 * 이 세션에서 알게 된 잠금. 아직 저장소를 안 읽었으면 undefined 다.
 *
 * 자산 화면과 분석 화면을 오가며 훅이 새로 서도 열린 범위가 잠깐 잠겨 보이지 않게 한다.
 */
let knownLock: AnalysisLock | undefined;

/** 확인 창 첫 줄에 넣는 이름. */
const RESULT_LABEL: Record<AssetAnalysisScope, string> = {
  all: '분석 결과',
  stock: '주식 분석 결과',
  cash: '예/적금 분석 결과',
};

export interface AnalysisTarget {
  scope: AssetAnalysisScope;
  /** 지금 숫자의 지문. 모르면 null 이고, 그때는 열어도 남기지 않는다. */
  fingerprint: string | null;
}

export interface AssetAnalysisUnlock {
  stateOf: (scope: AssetAnalysisScope, fingerprint: string | null | undefined) => AnalysisLockState;
  /** 광고를 띄우는 중. 버튼을 잠근다. */
  busy: boolean;
  /** 눌렀을 때 부른다. 열려 있으면 바로, 아니면 확인 창과 광고를 지나 `go` 를 부른다. */
  request: (target: AnalysisTarget, go: () => void) => void;
  /** 확인 창. 화면이 그대로 그린다. 물을 것이 없으면 null 이다. */
  prompt: ReactNode;
}

interface Asking {
  target: AnalysisTarget;
  state: 'locked' | 'stale';
  go: () => void;
}

/**
 * 「내 자산 분석」 잠금.
 *
 * - 한 번 본 범위는 숫자가 그대로인 동안 광고 없이 열린다. 날짜만 지나는 것은 바뀜이 아니다.
 * - 광고가 끝까지 가도, 중간에 닫혀도, 안 떠도 열고 지문을 남긴다.
 * - 이 기기에서 광고가 설 수 없으면 창 없이 연다. 예고할 광고가 없는데 묻지 않는다.
 */
export function useAssetAnalysisUnlock(): AssetAnalysisUnlock {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const ad = useAssetAnalysisRewardedAd();
  const [lock, setLock] = useState<AnalysisLock | undefined>(knownLock);
  const [asking, setAsking] = useState<Asking | null>(null);
  // 광고가 뜨기 전 짧은 틈에 두 번 눌리면 광고가 겹친다.
  const pending = useRef(false);

  useEffect(() => {
    if (knownLock !== undefined) return;
    let alive = true;
    void readAnalysisLock(bridge.storage).then((stored) => {
      // 읽는 사이에 열었으면 그 값이 더 새롭다.
      if (knownLock === undefined) knownLock = stored;
      if (alive) setLock(knownLock);
    });
    return () => {
      alive = false;
    };
  }, [bridge]);

  const stateOf = useCallback(
    (scope: AssetAnalysisScope, fingerprint: string | null | undefined) =>
      analysisLockState(lock, scope, fingerprint),
    [lock],
  );

  const remember = useCallback(
    (target: AnalysisTarget) => {
      if (target.fingerprint == null) return;
      const next = withFingerprint(knownLock ?? {}, target.scope, target.fingerprint);
      knownLock = next;
      setLock(next);
      void writeAnalysisLock(bridge.storage, next);
    },
    [bridge],
  );

  const play = useCallback(
    async (target: AnalysisTarget, go: () => void) => {
      if (pending.current) return;
      pending.current = true;
      try {
        const outcome = await ad.show('asset_analysis');
        remember(target);
        analytics.log(
          EVENTS.assetAnalysisOpened,
          outcome.result === 'skipped'
            ? { scope: target.scope, ad: 'skipped', reason: outcome.reason }
            : { scope: target.scope, ad: outcome.result },
          { kind: 'click' },
        );
        go();
      } finally {
        pending.current = false;
      }
    },
    [ad, analytics, remember],
  );

  const request = useCallback(
    (target: AnalysisTarget, go: () => void) => {
      const state = analysisLockState(knownLock ?? lock, target.scope, target.fingerprint);
      if (state === 'open') {
        analytics.log(
          EVENTS.assetAnalysisOpened,
          { scope: target.scope, ad: 'free' },
          { kind: 'click' },
        );
        go();
        return;
      }
      // 못 서는 광고는 묻지 않는다. show 가 광고 없이 지나가며 까닭을 돌려준다.
      if (!ad.available) {
        void play(target, go);
        return;
      }
      setAsking({ target, state: state === 'stale' ? 'stale' : 'locked', go });
    },
    [ad.available, analytics, lock, play],
  );

  const prompt =
    asking == null ? null : (
      <AdConsent
        what={`30초 광고를 보면 ${RESULT_LABEL[asking.target.scope]}를 볼 수 있어요`}
        text={`${asking.state === 'stale' ? '자산 숫자가 바뀌어서 다시 분석해요. ' : ''}자산이 그대로면 다음에는 광고 없이 바로 열려요`}
        confirmLabel="확인"
        onCancel={() => {
          analytics.log(
            EVENTS.assetAnalysisAsked,
            { scope: asking.target.scope, state: asking.state, answer: 'close' },
            { kind: 'click' },
          );
          setAsking(null);
        }}
        onConfirm={() => {
          const current = asking;
          analytics.log(
            EVENTS.assetAnalysisAsked,
            { scope: current.target.scope, state: current.state, answer: 'ok' },
            { kind: 'click' },
          );
          setAsking(null);
          void play(current.target, current.go);
        }}
      />
    );

  return { stateOf, busy: ad.busy, request, prompt };
}
