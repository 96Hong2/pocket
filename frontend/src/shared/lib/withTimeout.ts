/**
 * 끝나지 않는 약속에 마감을 건다.
 *
 * **SDK 가 준 약속이 영원히 안 끝날 수 있다.** 실패하면 `.catch` 로 잡아 되묻고 안내라도
 * 띄우지만, 아무 답이 없으면 잡을 자리 자체가 없다. 화면은 「불러오는 중」 에서 멈추고,
 * 사람은 고장인지 느린 것인지 구분할 수 없다.
 *
 * 2026-09-20 에 이 자리가 실제로 검수를 막았다. 「미니앱 최초 접속 시간이 20초를 초과」 로
 * 반려됐는데, 그 앞 회차의 「앱 메인 스킴으로 접속이 되지 않아요」 도 같은 자리였다.
 * 식별키를 기다리는 동안 우리 서버로는 요청이 한 건도 안 나가서, 검수 기기가 왔다 간
 * 흔적조차 서버 로그에 없었다.
 *
 * 마감이 지나면 `TimeoutError` 로 거절한다. 부르는 쪽이 평소 실패와 같은 길로 다루면 된다.
 */

/** 마감을 넘겼을 때 나는 오류. 이름으로 가려서 로그에 사유를 남길 수 있다. */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`${ms}ms 안에 답이 오지 않았어요.`);
    this.name = 'TimeoutError';
  }
}

/**
 * `task` 가 `ms` 안에 안 끝나면 `TimeoutError` 로 거절한다.
 *
 * 원래 약속을 멈추지는 못한다(자바스크립트 약속에는 취소가 없다). 늦게 온 답은 버린다.
 */
export function withTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error as Error);
      },
    );
  });
}
