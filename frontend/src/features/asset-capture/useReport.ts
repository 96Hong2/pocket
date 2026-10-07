import { useEffect } from 'react';

/**
 * 값이 바뀔 때만 감싼 쪽에 알린다.
 *
 * 감싼 쪽은 그릴 때마다 새 함수를 넘긴다. 함수를 의존값에 두면 다른 패널이 읽는 중에
 * 여기서 「안 바쁘다」 를 덮어써 시트 잠금이 풀린다.
 */
export function useReport<T>(value: T, report: (value: T) => void): void {
  useEffect(() => {
    report(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}
