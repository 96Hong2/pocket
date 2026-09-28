import { parseDecimal, type BreakdownRowOut } from '../../shared/api';

/**
 * 내 가계부 리포트와 공유 가계부 리포트가 같이 쓰는 이름과 비율 규칙.
 *
 * 분류는 모양만 본다. 개인 분류(`CategoryOut`)와 가계부 분류(`BookCategoryOut`)가 이름과
 * 그림 키를 똑같이 갖고 있어서, 줄 하나를 두 리포트가 같은 모습으로 그린다.
 */
export interface ReportCategory {
  name: string;
  icon_key?: string | null;
  icon_custom?: string | null;
  color?: string | null;
}

/** 분류를 못 정한 줄과 접은 줄. 서버는 코드값만 주고 한국어는 화면이 붙인다. */
const UNCATEGORIZED = 'uncategorized';
const ROLLED_UP = 'rolled_up';

/**
 * 링 가운데에 적을 것. 가장 큰 조각 하나다.
 *
 * 조각이 없거나 비중을 모르면 아무것도 적지 않는다. 억지로 채우면 링과 다른 말이 된다.
 */
export function donutCenter(
  rows: BreakdownRowOut[],
  byId: ReadonlyMap<string, ReportCategory>,
  namesUnknown: boolean,
  income: boolean,
): { caption: string; name: string; share: string } | null {
  const top = rows.find((row) => row.share != null);
  if (top == null) return null;
  const share = parseDecimal(top.share);
  if (share == null) return null;
  return {
    caption: income ? '가장 큰 수입' : '가장 큰 지출',
    name: labelOf(top, byId.get(top.category_id ?? ''), namesUnknown),
    share: toPercent(share),
  };
}

export function labelOf(
  row: BreakdownRowOut,
  category: ReportCategory | undefined,
  namesUnknown: boolean,
): string {
  if (row.key === ROLLED_UP) return `그 밖 ${row.rolled_count}개`;
  if (row.key === UNCATEGORIZED) return '분류 없음';
  // 셋을 갈라 적는다. 이름을 못 받은 것, 사용자가 분류를 안 정한 것(위에서 걸렀다),
  // 그리고 목록에 없는 분류를 가리키는 것. 마지막은 지운 분류라 '분류 없음' 과 다르다.
  return category?.name ?? (namesUnknown ? '이름 확인 중' : '지운 분류');
}

/**
 * 막대가 차지할 길이(%).
 *
 * 전체 대비가 아니라 **맨 위 줄 대비**다. 분류가 아홉이면 1등도 30% 남짓이라
 * 전체 대비로 그리면 막대가 트랙의 삼분의 일도 못 채우고 아래 줄들은 점이 된다.
 * 줄끼리 크기를 견주라고 그리는 막대이므로 1등을 가득 채운 것으로 놓는다.
 * 비중을 모르는 줄과 1등이 0 인 달은 0 이라 트랙만 남는다.
 */
export function barWidth(share: number | null, topShare: number): number {
  if (share == null || topShare <= 0) return 0;
  return Math.max(0, Math.min(100, (share / topShare) * 100));
}

/** `0.4211` → `42%`. 서버가 준 비율을 표시만 바꾼다. */
export function toPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
