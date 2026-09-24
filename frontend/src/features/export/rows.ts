/**
 * 받아 온 거래를 표 세 장으로 옮긴다.
 *
 * 화면도 네트워크도 없는 순수 계산이라 단위 테스트가 붙는 자리는 여기뿐이다.
 * 볼거리는 셋이다. 쉼표·따옴표·줄바꿈이 든 메모를 CSV 가 감당하는가, 문자열 금액이
 * 숫자 칸으로 들어가는가, 그리고 **이체가 요약에서 빠지는가**.
 */

import {
  parseDecimalOr,
  type CategoryOut,
  type TransactionOut,
  type TransactionType,
} from '../../shared/api';
// 묶음이 아니라 파일을 직접 가리킨다. `shared/ledger` 묶음에는 화면 부품이 함께 있어서,
// 계산만 하는 이 파일이 그것들까지 설정 화면 꾸러미로 끌고 들어온다.
import { LEDGER_KINDS, type LedgerKind } from '../../shared/ledger/kind';
import { paymentMethodLabel } from '../../shared/ledger/paymentMethod';
import { LEDGER_TIME_ZONE, toLedgerDate } from '../../shared/lib/format';

/**
 * 「구분」 칸에 적을 말.
 *
 * 지출·수입은 화면이 쓰는 말을 그대로 가져온다. 이체·환불은 고를 자리가 없어
 * `shared/ledger/kind.ts` 에 없고, 이름이 필요한 곳이 이 표뿐이다.
 */
const TYPE_LABELS: Record<TransactionType, string> = {
  expense: kindLabel('expense'),
  income: kindLabel('income'),
  transfer: '이체',
  refund: '환불',
};

function kindLabel(kind: LedgerKind): string {
  return LEDGER_KINDS.find((item) => item.value === kind)?.label ?? kind;
}

/** 분류를 안 고르고 적은 줄. 버리면 요약 합계가 내역과 안 맞는다. */
export const NO_CATEGORY_LABEL = '분류 없음';

/**
 * `14:05`. 가계부 시간대로 읽는다.
 *
 * 기기 시간대로 읽으면 해외에서 여는 사람의 표가 통째로 몇 시간씩 밀린다.
 * `hourCycle` 을 못 박는 이유는 로케일에 맡기면 자정이 `24:00` 으로 나오는 환경이 있어서다.
 */
const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: LEDGER_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** 「전체 내역」 한 줄. `kind` 만 빼고 표의 칸 순서와 같다. */
export interface ExportLine {
  day: string;
  time: string;
  type: string;
  category: string;
  merchant: string;
  /**
   * 원 단위 양수. 부호는 붙이지 않는다.
   *
   * 서버가 넷 다 양수로 저장하고 부호는 집계가 만든다(ADR-0005). 표에서도 같은 규칙을
   * 지킨다. 「구분」 칸이 그 부호를 대신하고, 합계는 요약 시트가 계산해 둔다.
   */
  amount: number;
  paymentMethod: string;
  memo: string;
  /** 표에는 안 나간다. 요약이 이체를 골라내는 자다. 한국어 라벨을 되읽지 않는다. */
  kind: TransactionType;
}

export interface MonthlyLine {
  month: string;
  income: number;
  expense: number;
  delta: number;
}

export interface CategoryLine {
  category: string;
  count: number;
  total: number;
}

export const LEDGER_HEADER = [
  '날짜',
  '시간',
  '구분',
  '카테고리',
  '내용',
  '금액',
  '결제수단',
  '메모',
];

export const MONTHLY_HEADER = ['월', '수입', '지출', '차액'];

export const CATEGORY_HEADER = ['카테고리', '건수', '합계'];

/**
 * 거래를 내역 줄로 옮기고 기간으로 거른다.
 *
 * **오래된 것이 위로 온다.** 서버는 최근 것을 앞에 주지만, 표는 위에서 아래로 읽으며
 * 흐름을 보는 물건이라 뒤집는다. 같은 시각이 여럿이면(캡처로 한 번에 넣으면 실제로 같다)
 * 받아 온 순서를 그대로 지킨다.
 */
export function toExportLines(
  transactions: TransactionOut[],
  categories: CategoryOut[],
  prefix: string,
): ExportLine[] {
  const names = new Map(categories.map((category) => [category.id, category.name]));

  return [...transactions]
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at))
    .map((transaction) => {
      const at = new Date(transaction.occurred_at);
      return {
        day: toLedgerDate(at),
        time: timeFormat.format(at),
        type: TYPE_LABELS[transaction.type],
        category:
          (transaction.category_id == null ? null : names.get(transaction.category_id)) ??
          NO_CATEGORY_LABEL,
        merchant: transaction.merchant ?? '',
        amount: parseDecimalOr(transaction.amount, 0),
        // 안 고르고 적은 줄은 빈 칸으로 둔다. 「안 고름」 이라 적으면 결제수단 하나를
        // 고른 것처럼 보여, 이 열로 거르는 사람이 없는 값을 세게 된다.
        paymentMethod:
          transaction.payment_method == null ? '' : paymentMethodLabel(transaction.payment_method),
        memo: transaction.memo ?? '',
        kind: transaction.type,
      };
    })
    .filter((line) => line.day.startsWith(prefix));
}

/**
 * 월별 요약. **이체는 통째로 빠진다.**
 *
 * 내 통장에서 내 통장으로 옮긴 것이라 돈이 줄지도 늘지도 않는다. 환불은 새 수입이 아니라
 * 지출 취소라 수입이 아니라 지출을 깎는다. 둘 다 ADR-0005 가 정한 표를 그대로 따른다.
 * 여기서 규칙을 다시 만들면 앱 화면이 말하는 이번 달 지출과 내려받은 파일이 어긋난다.
 */
export function toMonthlyLines(lines: ExportLine[]): MonthlyLine[] {
  const totals = new Map<string, { income: number; expense: number }>();

  for (const line of lines) {
    if (line.kind === 'transfer') continue;
    const month = line.day.slice(0, 7);
    const total = totals.get(month) ?? { income: 0, expense: 0 };
    if (line.kind === 'income') total.income += line.amount;
    else if (line.kind === 'refund') total.expense -= line.amount;
    else total.expense += line.amount;
    totals.set(month, total);
  }

  return [...totals.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, { income, expense }]) => ({
      month,
      income,
      expense,
      delta: income - expense,
    }));
}

/**
 * 카테고리별 요약. **지출만 센다.**
 *
 * ADR-0005 의 「카테고리 지출」 열 그대로다. 이체는 아예 빠지고, 환불은 그 분류의 지출을
 * 깎고, 수입은 분류로 묶어 봐야 뜻이 없어 여기 없다. 리포트 화면의 도넛과 같은 잣대다.
 */
export function toCategoryLines(lines: ExportLine[]): CategoryLine[] {
  const totals = new Map<string, { count: number; total: number }>();

  for (const line of lines) {
    if (line.kind !== 'expense' && line.kind !== 'refund') continue;
    const total = totals.get(line.category) ?? { count: 0, total: 0 };
    total.count += 1;
    total.total += line.kind === 'refund' ? -line.amount : line.amount;
    totals.set(line.category, total);
  }

  return (
    [...totals.entries()]
      .map(([category, { count, total }]) => ({ category, count, total }))
      // 많이 쓴 것이 위로 온다. 같은 금액이면 이름순이라 두 번 뽑아도 순서가 같다.
      .sort((a, b) => b.total - a.total || (a.category < b.category ? -1 : 1))
  );
}

export function toLedgerCells(line: ExportLine): (string | number)[] {
  return [
    line.day,
    line.time,
    line.type,
    line.category,
    line.merchant,
    line.amount,
    line.paymentMethod,
    line.memo,
  ];
}

export function toMonthlyCells(line: MonthlyLine): (string | number)[] {
  return [line.month, line.income, line.expense, line.delta];
}

export function toCategoryCells(line: CategoryLine): (string | number)[] {
  return [line.category, line.count, line.total];
}

/**
 * 표 하나를 CSV 한 장으로.
 *
 * 쉼표·따옴표·줄바꿈이 든 값은 따옴표로 감싸고 안쪽 따옴표를 둘로 늘린다(RFC 4180).
 * 메모에는 그 셋이 다 들어올 수 있어서, 이 규칙이 한 칸에서만 깨져도 그 줄부터 열이
 * 통째로 밀린다.
 *
 * 줄 끝은 CRLF 다. 엑셀이 LF 만 있는 파일을 한 줄로 읽는 일이 있다.
 */
export function toCsv(header: string[], rows: (string | number)[][]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function csvCell(value: string | number): string {
  if (typeof value === 'number') return String(value);
  if (!/["\r\n,]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}
