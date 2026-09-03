import { useMemo, useState } from 'react';

import {
  parseDecimal,
  useBudget,
  useCategories,
  useDeleteBudget,
  type CategoryBudgetOut,
} from '../../shared/api';
import { shiftMonth, toLedgerDate } from '../../shared/lib/format';
import { Card, ErrorState, LoadingState, MonthStepper } from '../../shared/ui';

import { BudgetAmountSheet } from './BudgetAmountSheet';
import { BudgetTotalCard } from './BudgetTotalCard';
import { CarryoverSetting } from './CarryoverSetting';
import { CategoryBudgetList } from './CategoryBudgetList';
import { CategoryBudgetSheet, type CategoryBudgetTarget } from './CategoryBudgetSheet';

/** 달력 화면과 같게 3년 전까지 본다. */
const MONTHS_BACK = 36;

/**
 * 관리 탭 안 예산 섹션.
 *
 * 별도 화면으로 빼지 않는다. 예산을 정하고 카테고리를 손보는 일이 한 화면에서 끝나야
 * 지금 예산이 어떤 모양인지 한눈에 읽힌다.
 *
 * 달은 `CalendarPage` 와 똑같이 `{year, month}` 를 항상 명시해 부른다. 이번 달만 인자를
 * 빼면 홈과 캐시가 갈리는 것이 아니라 같은 자리를 두 방식이 서로 덮는다.
 */
export function BudgetSection() {
  const thisMonth = toLedgerDate(new Date()).slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [amountOpen, setAmountOpen] = useState(false);
  const [categoryTarget, setCategoryTarget] = useState<CategoryBudgetTarget | null>(null);

  const monthParams = useMemo(() => {
    const [year, monthNumber] = month.split('-').map(Number);
    return { year, month: monthNumber };
  }, [month]);

  const budget = useBudget(monthParams);
  const categories = useCategories();
  const removeBudget = useDeleteBudget(monthParams);

  const data = budget.data ?? null;
  const state = data?.budget ?? null;
  // 기간이 끝났는지는 서버가 정한다. 화면이 날짜를 다시 재면 시간대가 다를 때 어긋난다.
  const editable = state?.is_editable === true;
  const amount = parseDecimal(state?.amount);
  const rows: CategoryBudgetOut[] = data?.category_budgets ?? [];
  const expenseCategories = (categories.data?.items ?? []).filter(
    (category) => category.kind === 'expense',
  );

  function moveMonth(next: string): void {
    setMonth(next);
    // 달을 옮기면 열려 있던 시트의 대상이 그 달에 없을 수 있다. 먼저 닫는다.
    setAmountOpen(false);
    setCategoryTarget(null);
    // 지우기 실패 안내는 그 달의 것이다. 다른 달까지 따라가면 안 된다.
    removeBudget.reset();
  }

  return (
    <section className="budget" aria-label="예산">
      <div className="budget__head">
        <h2 className="budget__title">예산</h2>
        <MonthStepper
          variant="compact"
          value={month}
          onChange={moveMonth}
          maxMonth={thisMonth}
          minMonth={shiftMonth(thisMonth, -MONTHS_BACK)}
        />
      </div>

      {budget.isError ? (
        <Card padding="md">
          <ErrorState
            size="inline"
            title="예산을 불러오지 못했어요"
            onRetry={() => void budget.refetch()}
          />
        </Card>
      ) : data == null || state == null ? (
        // 달을 옮기는 동안이다. 오류로 묶으면 정상 로딩이 실패로 보인다.
        <Card padding="md">
          <LoadingState variant="rows" rows={1} label="예산을 불러오는 중이에요" />
        </Card>
      ) : (
        <>
          {!editable ? (
            <p className="budget__closed">끝난 달이에요 · 보기만 할 수 있어요</p>
          ) : null}

          {state.is_auto_carried ? (
            <div className="budget-banner" aria-label="이어쓴 예산 안내" role="group">
              <p className="budget-banner__text">지난달 예산을 그대로 가져왔어요</p>
              {/* 끝난 달에도 이어써진 예산은 남는다. 알려는 주되 고치는 입구는 열지 않는다. */}
              {editable ? (
                <button
                  type="button"
                  className="budget-banner__action"
                  onClick={() => setAmountOpen(true)}
                >
                  수정
                </button>
              ) : null}
            </div>
          ) : null}

          <BudgetTotalCard
            state={state}
            editable={editable}
            busy={removeBudget.isPending}
            onEdit={() => setAmountOpen(true)}
            onDelete={() => removeBudget.mutate()}
          />

          {removeBudget.isError ? (
            <p className="budget__notice" role="alert">
              예산을 지우지 못했어요. 잠시 뒤 다시 시도해 주세요.
            </p>
          ) : null}

          {amount != null ? (
            <CategoryBudgetList
              rows={rows}
              categories={expenseCategories}
              editable={editable}
              totalAmount={amount}
              onPick={(row) => setCategoryTarget({ categoryId: row.category_id })}
              onAdd={() => setCategoryTarget({ categoryId: null })}
            />
          ) : null}
        </>
      )}

      <CarryoverSetting />

      <BudgetAmountSheet
        open={amountOpen}
        month={monthParams}
        amount={amount}
        onClose={() => setAmountOpen(false)}
      />
      <CategoryBudgetSheet
        target={categoryTarget}
        month={monthParams}
        categories={expenseCategories}
        rows={rows}
        onClose={() => setCategoryTarget(null)}
      />
    </section>
  );
}
