import { useCallback, useRef, useState } from 'react';

import { useBridge } from '../../app/providers';
import { EVENTS, useAnalytics, type BookInviteWhere } from '../../shared/analytics';
import { ApiError, useCreateInvite, type BookOut } from '../../shared/api';
import { markBookInviteSent } from '../../shared/lib/bookInviteSent';
import { BridgeError } from '../../shared/toss';
import { invitePath, inviteLine, shareImageUrl } from '../share';

import { myMember } from './bookText';

/** 공유가 막혔을 때 보여 줄 말. 취소는 막힌 것이 아니라 아무 말도 안 한다. */
const BRIDGE_MESSAGES: Record<string, string | null> = {
  UNSUPPORTED: '토스 앱을 최신으로 올리면 초대장을 보낼 수 있어요',
  PERMISSION_DENIED: '공유 권한이 없어 열지 못했어요',
  CANCELLED: null,
};

const FALLBACK = '지금은 공유창을 열지 못했어요. 잠시 뒤 다시 해 주세요';

/** 곧 만료될 링크는 새로 만든다. 받은 사람이 누르는 순간 막히면 안 된다. */
const EXPIRY_MARGIN_MS = 60 * 60_000;

function liveCode(book: BookOut, now: number): string | null {
  const invite = book.invite;
  if (invite == null) return null;
  return Date.parse(invite.expires_at) - now > EXPIRY_MARGIN_MS ? invite.code : null;
}

function reasonOf(error: unknown): string {
  if (error instanceof BridgeError) return error.code;
  if (error instanceof ApiError) return String(error.code);
  return 'UNKNOWN';
}

function failureOf(error: unknown): string | null {
  if (error instanceof BridgeError) {
    return error.code in BRIDGE_MESSAGES ? BRIDGE_MESSAGES[error.code] : FALLBACK;
  }
  if (error instanceof ApiError) return error.message;
  return FALLBACK;
}

/**
 * 초대장 보내기 한 번.
 *
 * 살아 있는 링크가 있으면 그대로 쓰고, 없거나 곧 만료되면 새로 만든 뒤 토스 공유창을 연다.
 * 코드와 보낸 글은 로그에 싣지 않는다. 어디서 보냈나와 결과, 가계부 유형까지다.
 *
 * `send` 는 공유창까지 갔으면 true 다. 취소하거나 막혀도 던지지 않는다. 만들기 화면은
 * 결과와 상관없이 우리 집 홈으로 가고, 그 홈의 「아직 혼자예요」 카드가 다시 보낼 길이 된다.
 * 보냈으면 이 기기에 가계부마다 남긴다(`book-invite-sent`). 홈 카드가 그걸 보고 말을 바꾼다.
 */
export function useBookInvite(where: BookInviteWhere): {
  busy: boolean;
  /** 마지막 시도가 막힌 이유. 성공했거나 취소했거나 아직 안 눌렀으면 null. */
  failure: string | null;
  send: (book: BookOut) => Promise<boolean>;
} {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const { mutateAsync: createInvite } = useCreateInvite();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // 링크 만들기와 공유창이 둘 다 왕복이라 한 박자 걸린다. 그 사이 또 누르면 창이 두 번 뜨려 한다.
  const running = useRef(false);

  const send = useCallback(
    async (book: BookOut): Promise<boolean> => {
      if (running.current) return false;
      running.current = true;
      setBusy(true);
      setFailure(null);
      try {
        const code = liveCode(book, Date.now()) ?? (await createInvite(book.id)).code;
        await bridge.share.send({
          path: invitePath(code),
          ogImageUrl: shareImageUrl('app'),
          message: inviteLine(myMember(book)?.name ?? null, book.name),
        });
        // 홈 카드가 「아직 혼자예요」 대신 「보냈어요」 로 선다. 홈으로 가기 전에 남겨 둔다.
        await markBookInviteSent(bridge.storage, book.id);
        analytics.log(
          EVENTS.bookInviteResult,
          { where, result: 'ok', kind: book.kind },
          { kind: 'click' },
        );
        return true;
      } catch (error) {
        setFailure(failureOf(error));
        analytics.log(
          EVENTS.bookInviteResult,
          { where, result: 'failed', reason: reasonOf(error), kind: book.kind },
          { kind: 'click' },
        );
        return false;
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [analytics, bridge, createInvite, where],
  );

  return { busy, failure, send };
}
