import { useState } from 'react';

import { ApiError, useSaveBudget } from '../../shared/api';
import { AmountField, Button, CategoryAvatar, SageCard } from '../../shared/ui';

import { CardClose } from './CardClose';

/**
 * 첫 기록을 마친 사람에게만 뜨는 예산 제안.
 *
 * 받는 것은 금액 하나다. 기간·카테고리별 예산은 여기서 묻지 않는다.
 *
 * **닫을 수 있다.** 예산을 정할 생각이 없는 사람에게는 이 카드가 예산을 정할 때까지
 * 영영 홈에 남는다. 대신 닫기 전에 어디서 다시 정할 수 있는지 카드 안에 적어 둔다.
 * 그 한 줄이 없으면 닫는 순간 예산 기능 자체가 사라진 것으로 보인다.
 */
export function BudgetSuggestCard({ onDismiss }: { onDismiss: () => void }) {
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
        <CardClose label="예산 안내 닫기" onClick={onDismiss} />
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

      {/* 닫기 옆이 아니라 버튼 아래다. 닫으려다 눈이 지나가는 자리가 여기다. */}
      <p className="home-card__aside">하단의 「관리」 탭에서 예산을 다시 설정할 수 있어요</p>
    </SageCard>
  );
}
