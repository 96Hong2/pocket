/**
 * 사람이 지은 이름 뒤에 붙는 조사.
 *
 * 가계부 이름과 멤버 이름은 사용자가 적는다. 「우리 집을」·「하우스를」 처럼 받침에 따라
 * 갈리는데, 하나로 고정하면 「준호이 적었어요」 가 나온다.
 *
 * 한글이 아닌 글자로 끝나면 읽는 소리를 어림한다. 숫자는 한국어로 읽는 소리로,
 * 영문은 l·m·n 으로 끝날 때만 받침으로 본다. 그 밖(기호·이모지)은 받침 없는 쪽이다.
 */

export type JosaPair = '이/가' | '은/는' | '을/를' | '와/과' | '으로/로';

/** 0~9 를 한국어로 읽었을 때 받침이 있나. 영·일·삼·육·칠·팔은 있고 이·사·오·구는 없다. */
const DIGIT_HAS_FINAL = [true, true, false, true, false, false, true, true, true, false];

/** ㄹ 받침. 「으로/로」 만 이걸 받침 없는 쪽으로 친다(「서울로」). */
const RIEUL = 8;

function finalOf(word: string): { has: boolean; rieul: boolean } {
  const last = word.trimEnd().at(-1) ?? '';
  const code = last.codePointAt(0) ?? 0;
  if (code >= 0xac00 && code <= 0xd7a3) {
    const final = (code - 0xac00) % 28;
    return { has: final !== 0, rieul: final === RIEUL };
  }
  if (last >= '0' && last <= '9') {
    const digit = Number(last);
    return { has: DIGIT_HAS_FINAL[digit], rieul: digit === 1 || digit === 7 || digit === 8 };
  }
  const lower = last.toLowerCase();
  if (lower === 'l') return { has: true, rieul: true };
  if (lower === 'm' || lower === 'n') return { has: true, rieul: false };
  return { has: false, rieul: false };
}

/** [받침 있을 때, 없을 때]. 「와/과」 는 부르는 순서와 반대라 이름을 쪼개지 않고 적어 둔다. */
const FORMS: Record<JosaPair, readonly [string, string]> = {
  '이/가': ['이', '가'],
  '은/는': ['은', '는'],
  '을/를': ['을', '를'],
  '와/과': ['과', '와'],
  '으로/로': ['으로', '로'],
};

/** 조사만 돌려준다. `josa('우리 집', '을/를')` → `'을'` */
export function josa(word: string, pair: JosaPair): string {
  const [withFinal, withoutFinal] = FORMS[pair];
  const { has, rieul } = finalOf(word);
  if (pair === '으로/로') return has && !rieul ? withFinal : withoutFinal;
  return has ? withFinal : withoutFinal;
}

/** 말과 조사를 붙여 돌려준다. `withJosa('준호', '이/가')` → `'준호가'` */
export function withJosa(word: string, pair: JosaPair): string {
  return `${word}${josa(word, pair)}`;
}
