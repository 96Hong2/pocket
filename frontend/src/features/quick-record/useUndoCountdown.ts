import { useEffect, useState } from 'react';

import type { TransactionCreated } from '../../shared/api';

/**
 * 되돌리기에 남은 초.
 *
 * 서버는 기기 시계를 보지 않는다. 그래서 응답을 받은 시각부터 흐른 시간으로만 센다.
 * `Date.now()` 는 앱이 백그라운드에 있는 동안에도 흘러가므로 돌아왔을 때 그대로 이어진다.
 * 화면이 다시 보이는 순간에도 한 번 더 읽어 숫자가 굳어 있지 않게 한다.
 *
 * 남은 초는 지금 시각에서 그때그때 뽑는다. 따로 들고 있으면 두 값이 어긋난다.
 */
export function useUndoCountdown(deadline: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadline == null) return;

    // 창이 지나면 값을 그대로 두어 더 그리지 않는다.
    const read = () => setNow((prev) => (prev >= deadline ? prev : Date.now()));
    // 250ms 마다 읽어야 보이는 숫자가 실제보다 늦게 줄지 않는다.
    const timer = window.setInterval(read, 250);
    document.addEventListener('visibilitychange', read);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', read);
    };
  }, [deadline]);

  if (deadline == null) return 0;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/**
 * 카운트다운이 끝나는 시각.
 *
 * 기본은 응답을 받은 시각 + 창 길이다. `undo_until` 절대 시각은 창 길이를 못 받았을 때만 쓴다.
 * 서버 시계와 기기 시계가 어긋나면 절대 시각이 그만큼 틀리기 때문이다.
 */
export function undoDeadline(created: TransactionCreated, receivedAt: number): number | null {
  const seconds = created.undo_window_seconds;
  if (typeof seconds === 'number' && seconds > 0) return receivedAt + seconds * 1000;

  const until = Date.parse(created.undo_until);
  return Number.isNaN(until) ? null : until;
}
