import { useState } from 'react';

import { parseDecimal, parseDecimalOr, type BudgetStateOut } from '../../shared/api';
import { formatCurrency, formatPercent } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import { Amount, Button, Card, EmptyState, Gauge } from '../../shared/ui';

export interface BudgetTotalCardProps {
  state: BudgetStateOut;
  /** 지금 고칠 수 있는 기간인가. 서버가 정한 값을 그대로 받는다. */
  editable: boolean;
  /** 금액 입력 시트를 연다. */
  onEdit: () => void;
  onDelete: () => void;
  /** 지우는 중. 두 번 눌리지 않게 잠근다. */
  busy: boolean;
  /**
   * 딸려 사라지는 카테고리 한도가 몇 개인가.
   *
   * 전체 예산을 지우면 서버가 카테고리 한도까지 함께 지운다. 그 말을 안 하면
   * 한 번 누르고 여러 개를 잃는다. 없으면 굳이 말하지 않는다.
   */
  categoryCount: number;
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
  categoryCount,
}: BudgetTotalCardProps) {
  const amount = parseDecimal(state.amount);
  const month = monthNumber(state.period_start);
  /*
    지우기 전에 한 번 묻는다.

    **되돌릴 수 없고 딸려 사라지는 것이 있다.** 전체 예산을 지우면 카테고리 한도까지
    서버가 함께 지운다. 한 번 눌러 여러 개를 잃는 자리라 내역 지우기와 같은 모양을 쓴다.
    시트를 겹치지 않고 카드 안에서 버튼 줄만 물음으로 바뀐다.
  */
  const [asking, setAsking] = useState(false);

  if (amount == null) {
    return (
      <Card padding="md">
        {editable ? (
          <EmptyState
            size="inline"
            icon="32_piggybank"
            title={`아직 ${month}월 예산이 없어요`}
            // 왜 없는지는 화면이 모른다. 지난달 예산이 멀쩡히 있어도 이어쓰기를 껐거나
            // 이어써진 예산을 지웠으면 여기로 온다. 아는 것만 말한다.
            description="정하면 남은 예산과 하루에 쓸 수 있는 돈을 알려드려요."
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

      {editable && !asking ? (
        <button
          type="button"
          className="budget-total__delete"
          onClick={() => setAsking(true)}
          disabled={busy}
        >
          예산 지우기
        </button>
      ) : null}

      {editable && asking ? (
        <div className="budget-total__confirm" role="group" aria-label="지우기 확인">
          <p className="budget-total__confirm-text">
            <b>이번 달 예산을 지울까요?</b>{' '}
            {categoryCount > 0
              ? `카테고리 한도 ${categoryCount}개도 함께 사라져요`
              : '지우면 되돌릴 수 없어요'}
          </p>
          <div className="budget-total__confirm-actions">
            <Button variant="outline" disabled={busy} onClick={() => setAsking(false)}>
              그대로 둘래요
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                setAsking(false);
                onDelete();
              }}
            >
              지울게요
            </Button>
          </div>
        </div>
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
