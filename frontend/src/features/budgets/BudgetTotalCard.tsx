import { parseDecimal, parseDecimalOr, type BudgetStateOut } from '../../shared/api';
import { cx } from '../../shared/lib/cx';
import { TEST_IDS } from '../../shared/testIds';
import { Amount, Card, EmptyState, Gauge } from '../../shared/ui';
import { budgetLine, closingLine, ShareButton, type ShareButtonProps } from '../share';

export interface BudgetTotalCardProps {
  state: BudgetStateOut;
  /** 지금 고칠 수 있는 기간인가. 서버가 정한 값을 그대로 받는다. */
  editable: boolean;
  /** 금액 시트를 연다. 예산 지우기도 그 시트 맨 아래에 있다. */
  onEdit: () => void;
}

/** 이름 달 `2026-10` → `10`. 시작일이 25 면 첫날(9월 25일)의 달과 다르다. */
function monthNumber(periodKey: string): number {
  return Number(periodKey.slice(5, 7));
}

/**
 * 이 카드에서 무엇을 친구에게 보낼까. 보낼 것이 없으면 null.
 *
 * 진행 중인 달은 「정했다」 를, 끝난 달은 「지켰다」 를 말한다.
 * **넘긴 달에는 자리를 아예 두지 않는다.** 넘긴 것을 알리라고 권하면 그 달의 이 카드가
 * 벌이 된다. 어느 쪽이든 금액은 보내지 않는다(`shareText.ts`).
 */
function shareOf(
  state: BudgetStateOut,
  editable: boolean,
): Pick<ShareButtonProps, 'kind' | 'where' | 'label' | 'message'> | null {
  const month = state.period_key;

  if (editable) {
    return {
      kind: 'budget',
      where: 'manage',
      label: '이번 달 예산 친구에게 공유하기',
      message: budgetLine(month),
    };
  }
  if (state.is_over_budget) return null;
  return {
    kind: 'closing',
    where: 'manage_past',
    label: '예산 지킨 달 친구에게 공유하기',
    message: closingLine(month, true),
  };
}

/**
 * 전체 예산 카드.
 *
 * **한 장에 세 줄만 둔다: 쓴 돈 / 예산, 막대, 상태 한 줄.** 쓴 돈·남은 돈·퍼센트·하루·남은 날·
 * 공유·지우기가 한 장에 다 서 있어 무엇을 봐야 할지 안 읽혔다(사용자 지적). 퍼센트는 막대가,
 * 남은 날은 하루 쓸 돈이 이미 말한다. 공유는 머리의 그림 하나로, 지우기는 수정 시트로 옮겼다.
 *
 * 남은 금액과 하루 가용액은 여기서 계산하지 않는다. 예산에서 뺀 거래가 있으면
 * 화면이 되짚은 값과 서버 값이 어긋난다. 서버가 준 것을 그대로 그린다.
 */
export function BudgetTotalCard({ state, editable, onEdit }: BudgetTotalCardProps) {
  const amount = parseDecimal(state.amount);
  const month = monthNumber(state.period_key);
  const share = shareOf(state, editable);

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
  const remaining = parseDecimalOr(state.remaining_budget, 0);
  const over = state.is_over_budget;

  return (
    <Card padding="lg" className="budget-total">
      <div className="budget-total__head">
        <h3 className="budget-total__title">
          {editable ? '이번 달 전체 예산' : `${month}월 전체 예산`}
        </h3>
        {/* 무엇을 보낼지는 `shareOf` 가 정한다. 넘긴 달에는 이 자리가 없다. */}
        {share != null ? <ShareButton tone="icon" {...share} /> : null}
        {editable ? (
          <button type="button" className="budget-total__edit" onClick={onEdit}>
            수정
          </button>
        ) : null}
      </div>

      <p className="budget-total__figure">
        <Amount
          data-testid={TEST_IDS.budgetUsed}
          value={parseDecimalOr(state.budgeted_spend, 0)}
          size={26}
          weight={800}
        />
        <span className="budget-total__cap">
          {'/ '}
          <Amount
            data-testid={TEST_IDS.budgetTotalAmount}
            value={amount}
            size={15}
            weight={600}
          />
        </span>
      </p>

      <Gauge
        data-testid={TEST_IDS.budgetTotalGauge}
        ratio={progress ?? 0}
        over={over}
        label="전체 예산 사용률"
      />

      {progress != null ? (
        <div className="budget-total__status">
          <span
            className={cx('budget-total__caption', over && 'budget-total__caption--over')}
            data-testid={TEST_IDS.budgetCaption}
          >
            {over ? (
              <>
                <Amount value={-remaining} size={13} weight={700} />
                {editable ? ' 넘었어요' : ' 넘겼어요'}
              </>
            ) : (
              <>
                <Amount data-testid={TEST_IDS.budgetLeft} value={remaining} size={13} weight={700} />
                {editable ? ' 남았어요' : ' 남기고 지켰어요'}
              </>
            )}
          </span>
          {/* 끝난 달에 하루 얼마를 적으면 이제 와서 지킬 수 없는 것을 알려 주는 셈이다. 넘긴 달은 늘 0원이다. */}
          {editable && !over ? (
            <span className="budget-total__daily">
              하루{' '}
              <Amount
                data-testid={TEST_IDS.budgetDaily}
                value={parseDecimalOr(state.daily_allowance, 0)}
                size={13}
                weight={700}
              />
            </span>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
