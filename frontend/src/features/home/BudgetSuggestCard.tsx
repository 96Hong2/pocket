import { useState } from 'react';

import { ApiError, useSaveBudget } from '../../shared/api';
import { AmountField, Button, CategoryAvatar, SageCard } from '../../shared/ui';

/**
 * 첫 기록을 마친 사람에게만 뜨는 예산 제안.
 *
 * 받는 것은 금액 하나다. 기간·카테고리별 예산은 여기서 묻지 않는다.
 */
export function BudgetSuggestCard() {
  const [digits, setDigits] = useState('');
  const saveBudget = useSaveBudget();

  const amount = Number(digits);
  const canSave = digits !== '' && amount > 0 && !saveBudget.isPending;
  const message = saveBudget.error instanceof ApiError ? saveBudget.error.message : null;

  return (
    <SageCard className="home-card">
      <div className="home-card__head">
        <CategoryAvatar icon="32_piggybank" size={44} />
        <p className="home-card__text">
          예산을 정하면 <strong>남은 돈과 하루에 쓸 수 있는 돈</strong>까지 알려드려요.
        </p>
      </div>

      <AmountField label="이번 달 예산" value={digits} onChange={setDigits} />

      {message ? (
        <p className="home-card__error" role="alert">
          {message}
        </p>
      ) : null}

      <Button
        variant="primarySmall"
        fullWidth
        disabled={!canSave}
        onClick={() => saveBudget.mutate({ amount })}
      >
        예산 정하기
      </Button>
    </SageCard>
  );
}
