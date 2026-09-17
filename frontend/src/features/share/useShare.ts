import { useCallback, useState } from 'react';

import { useBridge } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { BridgeError } from '../../shared/toss';

import { SHARE_PATH, shareImageUrl } from './shareLink';

import type { ShareKind } from './shareText';

/** 공유가 막혔을 때 사람에게 보여 줄 말. 왜 막혔는지에 따라 할 수 있는 일이 다르다. */
const MESSAGES: Record<string, string> = {
  UNSUPPORTED: '토스 앱을 최신으로 올리면 공유할 수 있어요',
  PERMISSION_DENIED: '공유 권한이 없어 열지 못했어요',
};

const FALLBACK = '지금은 공유창을 열지 못했어요. 잠시 뒤 다시 해 주세요';

/**
 * 시스템 공유 시트를 여는 한 번.
 *
 * **여는 동안 버튼을 잠근다.** 링크 만들기가 네이티브 왕복이라 한 박자 걸리는데,
 * 그 사이에 또 누르면 시트가 두 번 뜨려 한다.
 *
 * **실패를 조용히 삼키지 않는다.** 아무 일도 안 일어나면 사용자는 버튼이 고장 난 줄 안다.
 * 무엇 때문인지 한 줄로 돌려주고, 부르는 쪽이 그 자리에 적는다.
 */
export function useShare(where: string): {
  busy: boolean;
  /** 마지막 시도가 막힌 이유. 성공했거나 아직 안 눌렀으면 null. */
  failure: string | null;
  share: (kind: ShareKind, message: string) => Promise<void>;
} {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const share = useCallback(
    async (kind: ShareKind, message: string): Promise<void> => {
      setBusy(true);
      setFailure(null);
      try {
        await bridge.share.send({
          path: SHARE_PATH,
          ogImageUrl: shareImageUrl(kind),
          message,
        });
        analytics.log(EVENTS.shareResult, { where, kind, result: 'ok' }, { kind: 'click' });
      } catch (error) {
        const code = error instanceof BridgeError ? error.code : 'UNKNOWN';
        setFailure(MESSAGES[code] ?? FALLBACK);
        analytics.log(
          EVENTS.shareResult,
          { where, kind, result: 'failed', reason: code },
          { kind: 'click' },
        );
      } finally {
        setBusy(false);
      }
    },
    [analytics, bridge, where],
  );

  return { busy, failure, share };
}
