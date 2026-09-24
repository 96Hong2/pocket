/**
 * 이름이 겹치는지 볼 때 쓰는 값.
 *
 * **서버와 같은 규칙으로 접는다**(`categories/service.py` 의 `_key`). 앞뒤 공백을 지우고
 * 안쪽 연속 공백을 하나로 줄인 뒤 대소문자 차이를 없앤다. 다르게 접으면 화면은 통과시켰는데
 * 서버가 막는 줄이 생긴다. 이름 견주기가 DB 밖으로 나와 있는 이유는 ADR-0027 에 있다.
 *
 * 파이썬의 `casefold()` 와 완전히 같지는 않지만(ß 같은 글자) 한글·영문에서는 같다.
 */
export function categoryNameKey(name: string): string {
  return name.trim().split(/\s+/).join(' ').toLowerCase();
}
