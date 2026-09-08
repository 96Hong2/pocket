import { useEffect, useState } from 'react';

/**
 * 값이 잦아든 뒤에만 따라오는 사본.
 *
 * 입력칸은 원래 값을 그대로 그리고, 서버에 묻는 쪽만 이 값을 본다. 한 글자마다 묻지 않는다.
 * 달력 검색과 생활비 제안이 같은 것을 쓴다.
 */
export function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
