/**
 * 이 글자가 이모지인가.
 *
 * 판정 정본은 서버(`backend/app/domain/category_icons.py`)이고 여기는 같은 규칙을 화면에서
 * 미리 한 번 더 보는 자리다. 서버까지 다녀와야 「안 돼요」를 볼 수 있으면, 무엇을 넣어야
 * 하는지 모른 채 몇 번씩 되돌아온다.
 *
 * 브라우저 정규식의 `\p{Emoji}` 는 쓰지 않는다. 그 속성은 `0`~`9` 와 `#` 을 이모지로 치는데,
 * 실기기에서 막고 싶었던 것이 바로 그 숫자 하나다(`7` 은 아니고 `7️⃣` 는 맞다).
 */

/** 안 될 때 하는 말. 서버의 NOT_EMOJI_MESSAGE 와 같은 문구다. */
export const NOT_EMOJI_MESSAGE = '이모지 형식이 아니에요. 휴대폰 자판의 이모지를 골라 주세요.';

/** 이모지가 사는 자리. 유니코드가 블록으로 갈라 둔 것을 그대로 옮겼다. */
const EMOJI_RANGES: [number, number][] = [
  [0x00a9, 0x00a9],
  [0x00ae, 0x00ae],
  [0x203c, 0x203c],
  [0x2049, 0x2049],
  [0x2122, 0x2122],
  [0x2139, 0x2139],
  [0x2194, 0x21aa],
  [0x231a, 0x231b],
  [0x2328, 0x2328],
  [0x23cf, 0x23cf],
  [0x23e9, 0x23fa],
  [0x24c2, 0x24c2],
  [0x25aa, 0x25ab],
  [0x25b6, 0x25b6],
  [0x25c0, 0x25c0],
  [0x25fb, 0x25fe],
  [0x2600, 0x27bf],
  [0x2934, 0x2935],
  [0x2b00, 0x2bff],
  [0x3030, 0x3030],
  [0x303d, 0x303d],
  [0x3297, 0x3297],
  [0x3299, 0x3299],
  [0x1f000, 0x1f02f],
  [0x1f0a0, 0x1f0ff],
  [0x1f100, 0x1f1ff],
  [0x1f200, 0x1f2ff],
  [0x1f300, 0x1f5ff],
  [0x1f600, 0x1f64f],
  [0x1f650, 0x1f67f],
  [0x1f680, 0x1f6ff],
  [0x1f700, 0x1f7ff],
  [0x1f800, 0x1f8ff],
  [0x1f900, 0x1f9ff],
  [0x1fa00, 0x1faff],
];

/** 혼자서는 이모지가 아니고 붙어서만 뜻이 있는 것: 살색·변형 선택자·ZWJ·국기 태그. */
const ATTACHMENT_RANGES: [number, number][] = [
  [0x200d, 0x200d],
  [0xfe0e, 0xfe0f],
  [0x1f3fb, 0x1f3ff],
  [0xe0020, 0xe007f],
];

const KEYCAP_MARK = 0x20e3;
const VARIATION_EMOJI = 0xfe0f;
const KEYCAP_BASES = new Set([...'0123456789#*'].map((ch) => ch.codePointAt(0)));

export function isEmoji(glyph: string): boolean {
  if (glyph === '') return false;
  const codes = [...glyph].map((ch) => ch.codePointAt(0) ?? 0);
  if (codes.includes(KEYCAP_MARK)) return isKeycap(codes);

  let found = false;
  for (const code of codes) {
    if (inRanges(code, EMOJI_RANGES)) found = true;
    else if (!inRanges(code, ATTACHMENT_RANGES)) return false;
  }
  return found;
}

/** `3️⃣` 같은 키캡. 밑글자는 숫자나 #·* 하나뿐이다. */
function isKeycap(codes: number[]): boolean {
  if (codes[codes.length - 1] !== KEYCAP_MARK || !KEYCAP_BASES.has(codes[0])) return false;
  return codes.slice(1).every((code) => code === VARIATION_EMOJI || code === KEYCAP_MARK);
}

function inRanges(code: number, ranges: [number, number][]): boolean {
  return ranges.some(([low, high]) => low <= code && code <= high);
}
