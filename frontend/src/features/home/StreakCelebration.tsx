import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useBridge, useOverlay, useOverlayBackClose } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import {
  STREAK_FOOT,
  celebrationToken,
  markCelebrated,
  reachedMilestone,
  readCelebrated,
  streakLead,
  streakTitle,
  type StreakFact,
} from '../../shared/lib/streakCelebration';
import { CategoryAvatar } from '../../shared/ui';
import { trapTab } from '../../shared/ui/focusTrap';
import { ShareButton, streakLine } from '../share';

import { StreakKeepPrompt } from './StreakKeepPrompt';

export interface StreakCelebrationProps {
  /** 서버가 센 이어진 날. 끊겼으면 null 이다. */
  streak: StreakFact | null | undefined;
  /**
   * 기록 시트나 묻는 창이 떠 있나.
   *
   * 7일째를 적는 그 순간 서버 값은 이미 7 이 된다. 그때 바로 띄우면 방금 적은 것의 피드백
   * 위로 덮여, 적은 결과를 못 보고 축하부터 보게 된다. 시트가 닫힐 때까지 기다린다.
   */
  blocked: boolean;
}

/**
 * 7일을 이어서 적었을 때 홈 맨 앞에 뜨는 축하.
 *
 * **결산처럼 화면을 다 쓰는 카드 한 장이다.** 모양도 결산 오버레이의 것을 그대로 빌린다.
 * 한 달을 돌아보는 자리와 한 주를 채운 자리는 같은 무게의 순간이고, 같은 모양이어야
 * 「이건 잘한 것을 알려 주는 화면」 이라고 한눈에 읽힌다.
 *
 * 결산과 달리 **저절로 뜬다.** 결산은 한 달치 숫자를 읽는 화면이라 스스로 열 때를 고르게
 * 두었지만, 이건 읽을 것이 한 줄뿐인 축하라 누르게 만들면 아무도 안 누른다. 대신
 * 같은 축하는 한 번만 뜨고(`streak-celebrated`), 닫는 길이 둘이다(오른쪽 위 ✕·뒤로가기).
 *
 * **카드 안에는 공유 버튼만 둔다.** 닫는 버튼을 나란히 두면 둘이 같은 무게로 보여서,
 * 자랑하려고 연 카드가 그냥 닫는 카드가 된다. 닫고 나면 이메일로 지켜 두겠냐고
 * 한 번 묻는다([[StreakKeepPrompt]]).
 *
 * **광고를 넣지 않는다.** 결산과 같은 이유다.
 */
export function StreakCelebration({ streak, blocked }: StreakCelebrationProps) {
  const bridge = useBridge();
  const overlay = useOverlay();
  const milestone = streak == null ? null : reachedMilestone(streak.days);
  const token = streak == null || milestone == null ? null : celebrationToken(streak, milestone);
  // 표를 읽기 전(undefined)에는 띄우지 않는다. 읽는 사이에 떴다 사라지면 더 이상하다.
  const [celebrated, setCelebrated] = useState<string | null | undefined>(undefined);
  // 이 화면에서 닫은 것. 저장이 막힌 기기에서도 닫은 뒤에 다시 뜨지 않게 한다.
  const [closed, setClosed] = useState<string | null>(null);
  /*
    띄운 표. **한 번 띄우면 다른 창 신호로 도로 접지 않는다.** 이 대화상자도 뒤로가기를
    가져가려고 오버레이로 등록되므로, 띄운 순간 `hasOpen` 이 켜진다. 그걸 보고 접으면
    떴다 사라지기를 되풀이한다.
  */
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    if (token == null) return;
    let alive = true;
    void readCelebrated(bridge.storage).then((value) => {
      if (alive) setCelebrated(value);
    });
    return () => {
      alive = false;
    };
  }, [bridge, token]);

  /** 축하를 닫고 나서 이메일을 권했나. 닫는 그 순간에 이어서 뜬다. */
  const [keepAsked, setKeepAsked] = useState(false);

  // 홈이 다시 그려질 때마다 새 함수가 가면 대화상자가 초점을 제 몸으로 도로 끌어간다.
  const close = useCallback(() => {
    setClosed(token);
    setKeepAsked(true);
  }, [token]);

  const ready =
    token != null && celebrated !== undefined && celebrated !== token && closed !== token;
  /*
    홈 카드 안에서 열리는 시트(홈 화면 추가, 생활비 계산기)는 홈이 모른다. 그런 창도
    뒤로가기 목록에는 올라 있으니 `hasOpen` 으로 함께 기다린다.
  */
  if (ready && shown !== token && !blocked && !overlay.hasOpen) setShown(token);

  const open = ready && milestone != null && shown === token;

  return (
    <>
      {/* 표가 바뀌면 새로 띄운다. 같은 대화상자를 다시 쓰면 7일 로그를 남긴 표시가 14일까지 따라간다. */}
      {open && milestone != null ? (
        <StreakDialog key={token} token={token} milestone={milestone} onClose={close} />
      ) : null}
      <StreakKeepPrompt open={keepAsked} onClose={() => setKeepAsked(false)} />
    </>
  );
}

function StreakDialog({
  token,
  milestone,
  onClose,
}: {
  token: string;
  milestone: number;
  onClose: () => void;
}) {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const dialogRef = useRef<HTMLDivElement>(null);

  useOverlayBackClose(true, onClose);

  const logged = useRef(false);

  // 뜬 그 순간에 남긴다. 「좋아요」 까지 눌러야 남기면, 앱을 그냥 닫은 사람에게 매번 다시 뜬다.
  // 로그는 한 번만 싣는다. 개발 모드는 효과를 두 번 돌려서, 막지 않으면 뜬 횟수가 두 배로 센다.
  useEffect(() => {
    void markCelebrated(bridge.storage, token);
    if (logged.current) return;
    logged.current = true;
    analytics.log(EVENTS.streakCelebrated, { days: milestone }, { kind: 'impression' });
  }, [analytics, bridge, milestone, token]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      trapTab(dialogRef.current, event);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const title = streakTitle(milestone);

  return createPortal(
    <div
      ref={dialogRef}
      className="closing closing--streak"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
    >
      <header className="closing__head">
        <p className="closing__month">{title}</p>
        <button type="button" className="closing__close" onClick={onClose} aria-label="닫기">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path
              d="M4 4l10 10M14 4L4 14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      <section className="closing__card">
        <CategoryAvatar className="closing__icon" size={84} icon="26_sparkles" />
        {/* 무슨 일인지보다 축하가 먼저다. 카드를 연 순간 눈에 들어오는 줄은 하나뿐이다. */}
        <p className="closing__lead">축하합니다!</p>
        <p className="closing__line">{streakLead(milestone)}</p>
        <p className="closing__foot">{STREAK_FOOT}</p>

        {/*
          **카드 안의 버튼은 이 하나뿐이다.** 「좋아요」 를 나란히 두었더니 닫는 길이
          둘이 되어, 공유와 닫기가 같은 무게로 보였다. 닫기는 오른쪽 위 ✕ 로 올리고
          여기는 자랑하는 자리만 남긴다.
        */}
        <ShareButton
          className="closing__share"
          kind="streak"
          where="streak"
          tone="strong"
          label="친구에게 공유하기"
          message={streakLine(milestone)}
        />
      </section>
    </div>,
    document.body,
  );
}
