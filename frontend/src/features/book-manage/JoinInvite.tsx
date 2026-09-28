import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { useBookView, useBridge, useOverlayBackClose, useToast } from '../../app/providers';
import { ROUTES } from '../../app/router/routes';
import { EVENTS, useAnalytics, type BookJoinOutcome } from '../../shared/analytics';
import {
  ApiError,
  useBooks,
  useInvitePreview,
  useJoinBook,
  type InvitePreviewOut,
} from '../../shared/api';
import { markHomeAddPrompted } from '../../shared/lib/homeAddSeen';
import { markOnboardingSeen, readOnboardingSeen } from '../../shared/lib/onboardingSeen';
import { Button, CategoryAvatar, LoadingState, iconUrl } from '../../shared/ui';
import { bookKindIcon, membersBucket, myNameIn } from '../books';

import { BookField } from './BookField';

type LogExtra = Record<string, string | boolean | undefined>;

/** 링크를 못 쓰는 경우. 제목 한 문장, 조용한 한 줄, 버튼 하나로 끝낸다. */
type Blocked = 'expired' | 'full' | 'closed' | 'ended' | 'invalid';

/** 합류 요청이 막혔을 때 서버 코드를 화면 상태로. 미리보기 뒤에 링크가 닫힌 경우다. */
const BLOCKED_BY_CODE: Record<string, Blocked> = {
  INVITE_EXPIRED: 'expired',
  BOOK_FULL: 'full',
  INVITE_CLOSED: 'closed',
  BOOK_ENDED: 'ended',
  NOT_FOUND: 'invalid',
};

/** 서버가 가계부 근황(이름, 인원)을 싣지 않는 상태. 인원이 0 으로 오니 로그에 싣지 않는다. */
const SEALED: ReadonlySet<InvitePreviewOut['status']> = new Set(['closed', 'ended', 'expired']);

/** `book_join_result` 에 싣는 값. 이름·코드·id 는 싣지 않는다. */
function joinParams(
  preview: InvitePreviewOut | undefined,
  firstOpen: boolean | null,
  result: BookJoinOutcome,
  extra: LogExtra = {},
): LogExtra {
  return {
    result,
    kind: preview?.book_kind,
    members:
      preview == null || SEALED.has(preview.status)
        ? undefined
        : membersBucket(preview.active_member_count),
    first_open: firstOpen ?? undefined,
    ...extra,
  };
}

function blockedOf(error: unknown): Blocked | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 404) return 'invalid';
  return BLOCKED_BY_CODE[String(error.code)] ?? null;
}

/**
 * 초대 링크가 여는 화면.
 *
 * 누가 어느 가계부에 불렀는지, 내 가계부는 안 보인다는 한 줄, 이름 칸, 「같이 쓰기」 가 전부다.
 * 가입, 설정, 처음 안내가 없다. 처음 안내는 이 화면이 떠 있는 동안 문지기가 띄우지 않고,
 * 같이 쓰기를 누르면 이미 본 것으로 적는다.
 *
 * 링크를 못 쓰면(만료, 다 참, 닫힘, 모르는 링크) 한 문장, 무엇을 하면 되는지 한 줄, 「내 가계부 열기」 하나다.
 * 이미 멤버면 곧바로 그 가계부 홈으로 보낸다.
 */
export function JoinInvite({ code }: { code: string | null }) {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const preview = useInvitePreview(code);
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  // 이 링크로 앱을 처음 여는가. 문지기가 이 화면에서는 「봤다」 를 적지 않아 그대로 읽힌다.
  const [firstOpen, setFirstOpen] = useState<boolean | null>(null);
  // 「같이 쓰기」 를 누른 뒤에는 미리보기가 바뀌어도 이 화면을 그대로 둔다. 들어가는 사이
  // 다시 받은 미리보기가 「이미 멤버」 로 오면 토스트와 로그가 한 번 더 나간다.
  const [joining, setJoining] = useState(false);
  const logged = useRef(false);

  useEffect(() => {
    let alive = true;
    void readOnboardingSeen(bridge.storage).then((seen) => {
      if (alive) setFirstOpen(!seen);
    });
    return () => {
      alive = false;
    };
  }, [bridge]);

  const data = preview.data;
  const previewBlocked: Blocked | null =
    code == null || code === ''
      ? 'invalid'
      : preview.isError
        ? (blockedOf(preview.error) ?? null)
        : data != null && data.status !== 'ok' && data.status !== 'member'
          ? data.status
          : null;
  const shown = blocked ?? (joining ? null : previewBlocked);

  function log(result: BookJoinOutcome, extra: LogExtra = {}) {
    analytics.log(EVENTS.bookJoinResult, joinParams(data, firstOpen, result, extra));
  }

  // 막힌 링크는 보이는 순간 한 번 센다. 합류·나중에·실패는 누른 자리에서 센다.
  useEffect(() => {
    if (logged.current || joining || previewBlocked == null || firstOpen == null) return;
    logged.current = true;
    analytics.log(EVENTS.bookJoinResult, joinParams(data, firstOpen, previewBlocked));
  }, [analytics, data, firstOpen, joining, previewBlocked]);

  if (shown != null) return <JoinBlocked state={shown} inviter={data?.inviter_name ?? null} />;
  if (preview.isError) return <JoinFailed onRetry={() => void preview.refetch()} />;
  // 처음 여는지 모르는 동안은 기다린다. 로그의 first_open 이 비지 않게 한다.
  if (data == null || firstOpen == null) return <LoadingState />;
  if (data.status === 'member' && !joining) {
    return <JoinAlreadyMember preview={data} firstOpen={firstOpen} />;
  }

  return (
    <JoinForm
      code={code ?? ''}
      preview={data}
      onJoining={() => setJoining(true)}
      onBlocked={(state, errorCode) => {
        logged.current = true;
        log(state, { error_code: errorCode });
        setBlocked(state);
      }}
      onLog={log}
    />
  );
}

function JoinForm({
  code,
  preview,
  onJoining,
  onBlocked,
  onLog,
}: {
  code: string;
  preview: InvitePreviewOut;
  onJoining: () => void;
  onBlocked: (state: Blocked, errorCode: string) => void;
  onLog: (result: BookJoinOutcome, extra?: LogExtra) => void;
}) {
  const bridge = useBridge();
  const navigate = useNavigate();
  const { setViewingBookId } = useBookView();
  const books = useBooks();
  const join = useJoinBook();
  const [typed, setTyped] = useState<string | null>(null);
  const name = typed ?? myNameIn(books.data?.items ?? []) ?? '';
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // 들어가는 중에는 뒤로가기를 먹는다. 홈으로 가면 합류가 끝나기 전에 처음 안내가 뜬다.
  useOverlayBackClose(busy, () => {}, true);

  const inviter = preview.inviter_name;
  const bookName = preview.book_name;

  async function submit(): Promise<void> {
    if (name.trim() === '' || busy) return;
    setBusy(true);
    setFailure(null);
    onJoining();
    try {
      const book = await join.mutateAsync({ code, name: name.trim() });
      // 들어온 사람은 처음 안내를 보지 않는다. 홈에 가자마자 안내가 덮으면 방금 한 일이 가려진다.
      await Promise.all([markOnboardingSeen(bridge.storage), markHomeAddPrompted(bridge.storage)]);
      onLog('joined', { members: membersBucket(book.active_member_count) });
      setViewingBookId(book.id);
      navigate(ROUTES.home, { replace: true });
    } catch (error) {
      setBusy(false);
      const blocked = blockedOf(error);
      const errorCode = error instanceof ApiError ? String(error.code) : 'UNKNOWN';
      if (blocked != null) {
        onBlocked(blocked, errorCode);
        return;
      }
      onLog('failed', { error_code: errorCode });
      setFailure(
        error instanceof ApiError
          ? error.message
          : '지금은 들어가지 못했어요. 잠시 뒤 다시 해 주세요',
      );
    }
  }

  return (
    <div className="book-join">
      <CategoryAvatar
        icon={bookKindIcon(preview.book_kind)}
        size={72}
        className="book-join__icon"
      />
      <h1 className="book-join__title">
        {inviter == null ? (
          <>「{bookName}」에 초대받았어요</>
        ) : (
          <>
            {inviter}님이 「{bookName}」에 초대했어요
          </>
        )}
      </h1>

      <p className="book-join__lock">
        <img className="book-join__lock-icon" src={iconUrl('24_lock')} alt="" aria-hidden="true" />
        {inviter == null
          ? '내 가계부 기록은 다른 멤버에게 보이지 않아요'
          : `내 가계부 기록은 ${inviter}님에게 보이지 않아요`}
      </p>

      <BookField
        label={`${bookName}에서 부를 내 이름`}
        value={name}
        onChange={setTyped}
        placeholder="예: 준호"
        maxLength={10}
      />

      {failure != null ? (
        <p className="book-manage__notice" role="alert">
          {failure}
        </p>
      ) : null}

      <Button fullWidth disabled={name.trim() === '' || busy} onClick={() => void submit()}>
        {busy ? '들어가는 중이에요' : '같이 쓰기'}
      </Button>
      <Button
        variant="ghost"
        fullWidth
        disabled={busy}
        onClick={() => {
          onLog('later');
          navigate(ROUTES.home, { replace: true });
        }}
      >
        나중에 할게요
      </Button>
    </div>
  );
}

/** 이미 멤버다. 초대 화면을 보여 주지 않고 그 가계부 홈으로 보낸다. */
function JoinAlreadyMember({
  preview,
  firstOpen,
}: {
  preview: InvitePreviewOut;
  firstOpen: boolean;
}) {
  const navigate = useNavigate();
  const analytics = useAnalytics();
  const toast = useToast();
  const { setViewingBookId } = useBookView();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    analytics.log(EVENTS.bookJoinResult, joinParams(preview, firstOpen, 'member'));
    if (preview.book_id != null) setViewingBookId(preview.book_id);
    navigate(ROUTES.home, { replace: true });
    toast.show({ text: preview.is_inviter ? '내가 보낸 초대장이에요' : '이미 같이 쓰고 있어요' });
  }, [analytics, firstOpen, navigate, preview, setViewingBookId, toast]);

  return <LoadingState />;
}

function JoinBlocked({ state, inviter }: { state: Blocked; inviter: string | null }) {
  const navigate = useNavigate();
  const { title, line } = blockedText(state, inviter);

  return (
    <div className="book-join book-join--blocked">
      <img className="book-join__picture" src={iconUrl('59_people')} alt="" aria-hidden="true" />
      <h1 className="book-join__title">{title}</h1>
      <p className="book-join__line">{line}</p>
      <Button fullWidth onClick={() => navigate(ROUTES.home, { replace: true })}>
        내 가계부 열기
      </Button>
    </div>
  );
}

function JoinFailed({ onRetry }: { onRetry: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="book-join book-join--blocked">
      <h1 className="book-join__title">초대장을 읽지 못했어요</h1>
      <p className="book-join__line">잠깐 연결이 흔들렸을 수 있어요</p>
      <Button fullWidth onClick={onRetry}>
        다시 시도
      </Button>
      <Button variant="ghost" fullWidth onClick={() => navigate(ROUTES.home, { replace: true })}>
        내 가계부 열기
      </Button>
    </div>
  );
}

function blockedText(state: Blocked, inviter: string | null): { title: string; line: string } {
  if (state === 'expired') {
    return {
      title: '초대 링크가 만료됐어요',
      line:
        inviter == null
          ? '초대한 사람에게 새 링크를 부탁해 주세요'
          : `${inviter}님에게 새 링크를 부탁해 주세요`,
    };
  }
  if (state === 'full') {
    return {
      title: '이 가계부는 10명이 다 찼어요',
      line: '관리자에게 한 자리를 비워 달라고 해 주세요',
    };
  }
  return { title: '열 수 없는 초대 링크예요', line: '초대한 사람에게 새 링크를 부탁해 주세요' };
}
