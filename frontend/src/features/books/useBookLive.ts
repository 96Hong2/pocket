import { bookRefetchInterval, markBookActivity, type BookQueryOptions } from '../../shared/api';

/**
 * 우리 집 화면이 떠 있는 동안 공유 조회에 얹는 선택.
 *
 * 화면이 보이는 동안 30초마다, 무언가 움직인 뒤 2분은 10초마다 다시 읽는다. 앱이 다시 앞으로
 * 오면 곧바로 읽는다. 뒤에 가 있는 동안은 읽지 않는다. 웹소켓은 쓰지 않는다.
 *
 * 다른 화면은 이걸 안 얹는다. 목록이나 설정까지 10초마다 읽을 이유가 없다.
 */
const LIVE: BookQueryOptions = {
  staleTime: 0,
  refetchOnWindowFocus: 'always',
  refetchIntervalInBackground: false,
  refetchInterval: () => bookRefetchInterval(),
};

const IDLE: BookQueryOptions = {};

/** `active` 가 false 면 아무 선택도 안 얹는다. 끝난 가계부처럼 바뀔 일이 드문 화면에 쓴다. */
export function useBookLive(active = true): BookQueryOptions {
  return active ? LIVE : IDLE;
}

export { markBookActivity };
