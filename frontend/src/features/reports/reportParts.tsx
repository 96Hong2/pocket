import { parseDecimal, parseDecimalOr, type BreakdownRowOut } from '../../shared/api';
import { formatCurrency, formatSignedCurrency } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import { CategoryAvatar, Gauge, iconOf, iconUrl } from '../../shared/ui';

import { barWidth, labelOf, toPercent, type ReportCategory } from './reportLabels';

/** 내 가계부 리포트와 공유 가계부 리포트가 같이 그리는 조각. 이름과 비율 규칙은 `reportLabels` 에 있다. */

/** 기록이 없는 자리를 그림 하나로 알린다. 글자만 두면 못 불러온 화면처럼 보인다. */
export function EmptyIcon() {
  return <img className="report__empty-icon" src={iconUrl('26_sparkles')} alt="" aria-hidden />;
}

/**
 * 예산이 있을 때만 뜨는 한 줄. 게이지와 '예산 X 중 N%' 를 함께 둔다. 비율은 서버가 준다.
 *
 * **예산 금액을 함께 적는다.** 비율만 두면 무엇의 몇 %인지 알 수 없다. 쓴 금액은 적지
 * 않는다. 위 헤드라인은 예산에서 뺀 거래까지 더한 값이라 이 비율의 기준과 다르다.
 */
export function BudgetLine({
  budget,
}: {
  budget: { amount: string | null; spend_progress: string | null };
}) {
  const amount = parseDecimal(budget.amount);
  const progress = parseDecimal(budget.spend_progress);
  if (amount == null || progress == null) return null;
  return (
    <div className="report__budget" data-testid={TEST_IDS.reportBudgetLine}>
      <Gauge className="report__budget-gauge" ratio={progress} label="예산 사용률" />
      <p className="report__budget-text">
        예산 {formatCurrency(amount)} 중 <b>{toPercent(progress)}</b>
      </p>
    </div>
  );
}

export function BreakdownItem({
  row,
  category,
  namesUnknown,
  income,
  color,
  topShare,
  onOpen,
}: {
  row: BreakdownRowOut;
  category?: ReportCategory;
  namesUnknown: boolean;
  income: boolean;
  /** 이 줄이 링의 어느 조각인지. 조각에 못 들어간 줄은 색이 없다. */
  color?: string;
  /** 맨 위 줄의 비중. 막대는 이 줄을 가득 채운 것으로 놓고 나머지를 견준다. */
  topShare: number;
  /** 누르면 그 분류의 기록 화면을 연다. 안 넘기면 줄은 보기만 한다. */
  onOpen?: () => void;
}) {
  const amount = parseDecimalOr(row.amount, 0);
  const share = parseDecimal(row.share);
  const cells = (
    <>
      {/*
        링의 조각과 이 줄을 잇는 표시. 세이지에서 앰버로 가는 한 계열이라 조각끼리
        색 차이가 크지 않고, 순서만으로는 어느 조각이 어느 줄인지 짚기 어렵다.
      */}
      <span
        className={color != null ? 'report__row-swatch' : 'report__row-swatch is-empty'}
        style={color != null ? { background: color } : undefined}
        aria-hidden="true"
      />
      {category != null ? (
        <CategoryAvatar {...iconOf(category)} size={44} />
      ) : (
        <span className="report__row-noicon" aria-hidden="true" />
      )}
      <span className="report__row-name">{labelOf(row, category, namesUnknown)}</span>
      {/*
        비중을 길이로도 보여준다. 숫자만 있으면 줄끼리 크기를 머릿속에서 견줘야 한다.
        조각에 못 들어간 줄(환불이 더 큰 분류)은 채울 것이 없어 트랙만 남는다.
      */}
      <span className="report__row-bar" aria-hidden="true">
        <span
          className="report__row-bar-fill"
          style={{ width: `${barWidth(share, topShare)}%`, background: color ?? 'transparent' }}
        />
      </span>
      <span className="report__row-value">
        <span className="report__row-amount" data-testid={TEST_IDS.reportRowAmount}>
          {/* 수입에만 부호를 붙인다. 헤드라인과 표기가 갈리면 같은 값이 달라 보인다. */}
          {income ? formatSignedCurrency(amount) : formatCurrency(amount)}
        </span>{' '}
        <span className="report__row-share" data-testid={TEST_IDS.reportRowShare}>
          {share != null ? toPercent(share) : '—'}
        </span>
      </span>
    </>
  );
  if (onOpen == null) {
    return (
      <li className="report__row" data-testid={TEST_IDS.reportBreakdownRow}>
        {cells}
      </li>
    );
  }
  return (
    <li data-testid={TEST_IDS.reportBreakdownRow}>
      <button type="button" className="report__row report__row--link" onClick={onOpen}>
        {cells}
        <span className="report__chevron" aria-hidden="true">
          ›
        </span>
      </button>
    </li>
  );
}
