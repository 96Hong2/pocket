/**
 * 사용자를 탓하는 말 목록 한 곳.
 *
 * 백엔드 `app/domain/feedback.py` 의 `FORBIDDEN_WORDS` 와 같은 목록이다. 서버는 판정만
 * 하고 문장은 화면이 만들기 때문에, 문장을 만드는 쪽에도 같은 검사가 필요하다.
 *
 * 부수효과가 없는 순수 모듈이라 e2e(Node)에서도 그대로 가져다 쓴다. 화면에 실제로 찍힌
 * 글자를 이 목록으로 훑으면, 새로 쓴 문구가 규칙을 어겼을 때 그 자리에서 걸린다.
 */

export const FORBIDDEN_WORDS = ['과소비', '낭비', '실패', '벌써', '또', '망함'] as const;

/** `또는`·`또한` 은 접속사라 걸지 않는다. 백엔드 판정과 같은 규칙이다. */
const WORD_PATTERNS: Record<string, RegExp> = { 또: /또(?!는|한)/ };

export function findForbiddenWords(text: string): string[] {
  return FORBIDDEN_WORDS.filter((word) => {
    const pattern = WORD_PATTERNS[word];
    return pattern ? pattern.test(text) : text.includes(word);
  });
}
