import { parseDecimal, parseDecimalOr, type BudgetStateOut } from '../../shared/api';
import { formatCurrency, formatPercent } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import { Amount, Card, EmptyState, Gauge } from '../../shared/ui';

export interface BudgetTotalCardProps {
  state: BudgetStateOut;
  /** 지금 고칠 수 있는 기간인가. 서버가 정한 값을 그대로 받는다. */
  editable: boolean;
  /** 금액 입력 시트를 연다. */
  onEdit: () => void;
  onDelete: () => void;
  /** 지우는 중. 두 번 눌리지 않게 잠근다. */
  busy: boolean;
}

/** `2026-09-01` → `9` */
function monthNumber(periodStart: string): number {
  return Number(periodStart.slice(5, 7));
}

/**
 * 전체 예산 카드.
 *
 * 게이지 비율·남은 금액·하루 가용액을 여기서 계산하지 않는다. 예산에서 뺀 거래가 있으면
 * 화면이 되짚은 값과 서버 값이 어긋난다. 서버가 준 것을 그대로 그린다.
 */
export function BudgetTotalCard({
  state,
  editable,
  onEdit,
  onDelete,
  busy,
}: BudgetTotalCardProps) {
  const amount = parseDecimal(state.amount);
  const month = monthNumber(state.period_start);

  if (amount == null) {
    return (
      <Card padding="md">
        {editable ? (
          <EmptyState
            size="inline"
            icon="32_piggybank"
            title={`아직 ${month}월 예산이 없어요`}
            description="지난달에도 예산이 없어서 그대로 뒀어요. 정하면 남은 예산과 하루 가용액을 알려드려요."
            actionLabel="예산 정하기"
            onAction={onEdit}
          />
        ) : (
          <EmptyState
            size="inline"
            icon="32_piggybank"
            title="이 달엔 예산이 없었어요"
            description="예산 없이 기록만 해도 괜찮아요"
          />
        )}
      </Card>
    );
  }

  const progress = parseDecimal(state.spend_progress);

  return (
    <Card padding="lg" className="budget-total">
      <div className="budget-total__head">
        <h3 className="budget-total__title">
          {editable ? '이번 달 전체 예산' : `${month}월 전체 예산`}
        </h3>
        {editable ? (
          <button type="button" className="budget-total__edit" onClick={onEdit}>
            수정
          </button>
        ) : null}
      </div>

      <Amount
        className="budget-total__amount"
        data-testid={TEST_IDS.budgetTotalAmount}
        value={amount}
        size={26}
        weight={800}
      />

      <Gauge
        className="budget-total__gauge"
        data-testid={TEST_IDS.budgetTotalGauge}
        ratio={progress ?? 0}
        over={state.is_over_budget}
        label="전체 예산 사용률"
      />

      <div className="budget-total__meta">
        <span>
          <Amount
            data-testid={TEST_IDS.budgetUsed}
            value={parseDecimalOr(state.budgeted_spend, 0)}
            size={13}
            weight={700}
          />{' '}
          사용
        </span>
        <span>
          <Amount
            data-testid={TEST_IDS.budgetLeft}
            value={parseDecimalOr(state.remaining_budget, 0)}
            size={13}
            weight={700}
          />{' '}
          남음
        </span>
      </div>

      {progress != null ? (
        <p className="budget-total__caption" data-testid={TEST_IDS.budgetCaption}>
          {caption(state, progress, editable)}
        </p>
      ) : null}

      {editable ? (
        <button
          type="button"
          className="budget-total__delete"
          onClick={onDelete}
          disabled={busy}
        >
          예산 지우기
        </button>
      ) : null}
    </Card>
  );
}

/**
 * 카드 아래 한 줄.
 *
 * 진행 중인 달은 앞으로 쓸 수 있는 돈을, 끝난 달은 결과를 말한다.
 * 끝난 달에 '하루 얼마' 를 적으면 이제 와서 지킬 수 없는 것을 알려 주는 셈이 된다.
 */
function caption(state: BudgetStateOut, progress: number, editable: boolean): string {
  const percent = formatPercent(progress);

  if (editable) {
    const daily = formatCurrency(parseDecimalOr(state.daily_allowance, 0));
    return `${percent} 사용 · 하루 ${daily} · ${state.remaining_days}일 남음`;
  }
  if (state.is_over_budget) return `${percent} 사용 · 예산을 넘겼어요`;
  if (progress >= 0.8) return `${percent} 사용 · 예산 안에서 끝났어요`;
  return `${percent} 사용 · 잘 지켰어요`;
}
