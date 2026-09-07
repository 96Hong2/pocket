import type { TransactionOut } from '../api';

/**
 * 안 쓴 날 표시를 다른 기록과 가른다.
 *
 * 금액이 0 인 거래라 다른 줄과 같은 모양으로 그리면 '기록 · 0원' 이 되고,
 * 눌러서 열리는 수정 시트는 1원 미만을 막아 완료가 잠긴 채로 남는다.
 * 홈과 달력이 같은 규칙으로 갈라야 해서 고르는 자리를 한 곳에 둔다.
 */
export interface NoSpendSplit {
  /** 안 쓴 날 표시. 하루에 하나뿐이지만 여러 날을 함께 넘길 수 있어 목록으로 돌려준다. */
  noSpend: TransactionOut[];
  /** 나머지 기록. 이쪽만 눌러서 고칠 수 있다. */
  spent: TransactionOut[];
}

export function splitNoSpend(rows: TransactionOut[]): NoSpendSplit {
  const noSpend: TransactionOut[] = [];
  const spent: TransactionOut[] = [];

  for (const row of rows) {
    if (row.source === 'no_spend') noSpend.push(row);
    else spent.push(row);
  }

  return { noSpend, spent };
}
