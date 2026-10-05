import { parseDecimal, type BreakdownRowOut } from '../../shared/api';
import { formatCompactCurrency } from '../../shared/lib/format';

/** 도넛 한 조각. `ratio` 는 서버가 준 % 문자열(`40.0`)이다. */
export interface AnalysisSlice {
  key: string;
  name: string;
  amount: number;
  ratio: string | null;
}

/** 램프가 아홉 색이라 그 넘는 조각은 하나로 접는다. */
const MAX_SLICES = 8;

/** `40.0` → `40%`, `12.5` → `12.5%`. 모르면 빈 문자열. */
export function formatRatio(ratio: string | null | undefined): string {
  const value = parseDecimal(ratio);
  if (value == null) return '';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

/** `20.0` → `+20%`, `-3.5` → `-3.5%`. 0 은 부호 없이. */
export function formatSignedRatio(ratio: string | null | undefined): string {
  const text = formatRatio(ratio);
  const value = parseDecimal(ratio);
  if (text === '' || value == null) return '';
  return value > 0 ? `+${text}` : text;
}

/** 1,234,000 → `123.4만원`. 만 아래는 그대로 `9,999원`. */
export function formatManWon(value: number): string {
  const text = formatCompactCurrency(value);
  return text.endsWith('원') ? text : `${text}원`;
}

/** 큰 조각부터 여덟까지 두고 나머지는 「그 밖의 N개」 하나로 접는다. */
export function foldSlices(slices: AnalysisSlice[]): AnalysisSlice[] {
  const sorted = slices.filter((slice) => slice.amount > 0).sort((a, b) => b.amount - a.amount);
  if (sorted.length <= MAX_SLICES + 1) return sorted;
  const kept = sorted.slice(0, MAX_SLICES);
  const rest = sorted.slice(MAX_SLICES);
  const restRatio = rest.reduce((sum, slice) => sum + (parseDecimal(slice.ratio) ?? 0), 0);
  return [
    ...kept,
    {
      key: 'rolled_up',
      name: `그 밖의 ${rest.length}개`,
      amount: rest.reduce((sum, slice) => sum + slice.amount, 0),
      ratio: restRatio.toFixed(1),
    },
  ];
}

/** 리포트 도넛이 읽는 모양으로 바꾼다. `share` 는 0~1 이다. */
export function toDonutRows(slices: AnalysisSlice[]): BreakdownRowOut[] {
  return slices.map((slice) => {
    const ratio = parseDecimal(slice.ratio);
    return {
      key: slice.key,
      category_id: null,
      amount: String(slice.amount),
      share: ratio == null ? null : String(ratio / 100),
      rolled_count: 0,
    };
  });
}

/** `2026-03` 으로 끝나는 `count` 개 달, 오래된 것부터. 해를 넘겨도 이어진다. */
export function monthsEndingAt(month: string, count: number): string[] {
  const [year, monthNumber] = month.split('-').map(Number);
  const months: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const index = year * 12 + (monthNumber - 1) - back;
    const y = Math.floor(index / 12);
    const m = (index % 12) + 1;
    months.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return months;
}

/** 늘면 is-up, 줄면 is-down. 색은 분석 화면 CSS 가 정한다. */
export function toneOf(value: number): string {
  return value > 0 ? 'is-up' : value < 0 ? 'is-down' : '';
}
