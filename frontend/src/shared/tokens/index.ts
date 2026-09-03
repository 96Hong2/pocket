/**
 * 디자인 토큰의 TypeScript 사본.
 *
 * CSS 쪽 정본은 `src/index.css` 의 `@theme` 블록이다. 여기 값은 도넛 차트·캔버스처럼
 * JS 에서 색이 필요한 자리를 위해 같은 값을 그대로 옮겨 둔 것이고,
 * 둘이 어긋나면 `tokens.test.ts` 가 깨진다. 값을 고치면 양쪽을 함께 고친다.
 */

export const colors = {
  bg: '#F7F5F0',
  surface: '#FFFFFF',
  surfaceSunken: '#F4F1EA',

  sage50: '#EFF2EA',
  sage100: '#DCE5D3',
  sage300: '#B7C9A8',
  sage700: '#3F5A40',
  sage800: '#334A34',

  amber50: '#F8F0DF',
  amber300: '#E8CE9C',
  amber700: '#7E5B21',

  ink: '#26292B',
  muted: '#8B9096',
  placeholder: '#C9C4B8',
  disabled: '#DCD8CE',
  adLabel: '#B0AB9F',

  border: '#EBE7DE',
  divider: '#F4F1EA',
  dashed: '#DCD8CE',

  /** 내역 부호·달력·차트 전용. 일반 UI 에 쓰지 않는다. */
  income: '#3D6FB8',
  expense: '#C25B4E',

  dim: 'rgba(38, 41, 43, 0.35)',
} as const;

/** 도넛·차트 시리즈 색. 순서가 곧 우선순위다. */
export const donutRamp = [
  '#3F5A40',
  '#6E8A5E',
  '#96B183',
  '#B7C9A8',
  '#C89B4C',
  '#E8CE9C',
  '#B8AE93',
  '#D3DEC6',
  '#DDD6C4',
] as const;

export const radius = {
  pill: '999px',
  sheet: '24px',
  card: '20px',
  inset: '16px',
  button: '14px',
  lg: '13px',
  md: '12px',
  sm: '10px',
  xs: '8px',
} as const;

export const shadows = {
  card: '0 2px 8px rgba(0, 0, 0, 0.04)',
  tabbar: '0 6px 20px rgba(38, 41, 43, 0.12)',
} as const;

export const fontSizes = {
  10: '10px',
  11: '11px',
  12: '12px',
  13: '13px',
  14: '14px',
  15: '15px',
  16: '16px',
} as const;

/** 400 은 쓰지 않는다. */
export const fontWeights = {
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
} as const;

export const fontFamily = {
  sans: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
} as const;

export type ColorToken = keyof typeof colors;
export type RadiusToken = keyof typeof radius;
export type ShadowToken = keyof typeof shadows;
export type FontSizeToken = keyof typeof fontSizes;
export type FontWeightToken = keyof typeof fontWeights;

/** `sage50` → `--color-sage-50` 처럼 토큰 키를 CSS 변수 이름으로 바꾼다. */
export function tokenToCssVar(
  group: 'color' | 'radius' | 'shadow' | 'text' | 'font-weight' | 'font',
  key: string | number,
): string {
  const kebab = String(key)
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .toLowerCase();
  return group === 'text' ? `--text-${kebab}` : `--${group}-${kebab}`;
}

/** 인라인 스타일에서 토큰 색을 쓸 때. `color: cssColor('sage700')` */
export function cssColor(token: ColorToken): string {
  return `var(${tokenToCssVar('color', token)})`;
}
