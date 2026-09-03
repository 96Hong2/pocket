/**
 * 내역·달력 화면의 순수 계산.
 *
 * `.tsx` 안에 두면 vitest 로 짚을 수 없고, e2e 도 가져올 수 없다(브라우저 밖 Node 에서 돈다).
 * 달 길이와 선행 공백은 달마다 틀리기 쉬운 계산이라 여기로 빼서 테스트를 붙인다.
 */

import { formatCurrency, formatDayLabel } from '../../shared/lib/format';

/**
 * 목록을 한 번에 받는 줄 수.
 *
 * 화면과 e2e 가 같은 값을 본다. 테스트가 숫자를 따로 적으면 값을 고칠 때 한쪽만 바뀐다.
 */
export const LEDGER_PAGE_SIZE = 30;

/** 하루 합계. 서버가 주는 문자열을 숫자로 바꾼 뒤의 모양이다. */
export interface DayNumbers {
  expense: number;
  income: number;
}

export interface MonthGrid {
  /** 1일 앞에 비워 둘 칸 수. 일요일 시작이라 0~6. */
  leadingBlanks: number;
  /** 1부터 그 달 마지막 날까지. */
  days: number[];
}

/** `2026-09` → 격자에 그릴 칸. 달 길이와 시작 요일을 달마다 다시 계산한다. */
export function monthGrid(month: string): MonthGrid {
  const [year, monthNumber] = month.split('-').map(Number);
  // 0 일을 넣으면 그 전달의 마지막 날이 된다. 달마다 며칠인지 따로 적지 않는다.
  const total = new Date(year, monthNumber, 0).getDate();
  return {
    leadingBlanks: new Date(year, monthNumber - 1, 1).getDay(),
    days: Array.from({ length: total }, (_, index) => index + 1),
  };
}

/** `2026-09` + 4 → `2026-09-04` */
export function dayIso(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, '0')}`;
}

/**
 * 날짜칸이 스크린리더에 읽히는 이름.
 *
 * 칸에는 숫자만 그려서, 이름이 없으면 어느 날인지도 얼마인지도 알 수 없다.
 * 0원인 항목은 넣지 않는다. '지출 0원' 은 안 쓴 날과 기록 없는 날을 헷갈리게 만든다.
 */
export function dayCellLabel(iso: string, numbers?: DayNumbers): string {
  const parts: string[] = [];
  if (numbers != null && numbers.expense !== 0) {
    parts.push(`지출 ${formatCurrency(numbers.expense)}`);
  }
  if (numbers != null && numbers.income !== 0) {
    parts.push(`수입 ${formatCurrency(numbers.income)}`);
  }
  return `${formatDayLabel(iso)}, ${parts.length > 0 ? parts.join(', ') : '기록 없음'}`;
}
