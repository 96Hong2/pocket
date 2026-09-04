import { useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { ApiError, useSaveBudget, type MonthParams } from '../../shared/api';
import { AmountField, BottomSheet, Button } from '../../shared/ui';

export interface BudgetAmountSheetProps {
  open: boolean;
  /** 저장할 달. 홈과 캐시 키가 어긋나지 않게 항상 명시해 넘긴다. */
  month: MonthParams;
  /** 이미 정해 둔 금액. 없으면 빈 칸으로 연다. */
  amount: number | null;
  onClose: () => void;
}

/** 전체 예산 금액을 정하는 시트. 처음 정할 때와 고칠 때가 같은 화면이다. */
export function BudgetAmountSheet({ open, month, amount, onClose }: BudgetAmountSheetProps) {
  // 저장 응답을 기다리는 동안에는 닫히지 않는다.
  // 닫히면 폼이 사라져 실패를 그릴 자리가 없어진다. 적어 둔 금액도 함께 사라진다.
  const [saving, setSaving] = useState(false);

  // 시스템 뒤로가기를 시트가 먼저 가져간다. 안 그러면 시트가 열린 채 화면만 뒤로 빠진다.
  useOverlayBackClose(open && !saving, onClose);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      dismissible={!saving}
      title="전체 예산"
      className="budget-sheet"
    >
      {open ? (
        // 열 때마다 새로 마운트해 지금 저장된 금액을 넣는다. 효과로 되넣으면 앞 값이 한 프레임 남는다.
        <BudgetAmountForm
          month={month}
          amount={amount}
          onSavingChange={setSaving}
          onClose={onClose}
        />
      ) : null}
    </BottomSheet>
  );
}

interface BudgetAmountFormProps {
  month: MonthParams;
  amount: number | null;
  onSavingChange: (saving: boolean) => void;
  onClose: () => void;
}

function BudgetAmountForm({ month, amount, onSavingChange, onClose }: BudgetAmountFormProps) {
  const save = useSaveBudget(month);
  const [digits, setDigits] = useState(amount == null ? '' : String(amount));

  const next = Number(digits);
  const canSave = digits !== '' && next > 0 && !save.isPending;
  const message = save.error instanceof ApiError ? save.error.message : null;

  return (
    <div className="budget-sheet__body">
      <AmountField label="금액" value={digits} onChange={setDigits} />

      {message ? (
        <p className="budget-sheet__notice" role="alert">
          {message}
        </p>
      ) : null}

      <Button
        fullWidth
        disabled={!canSave}
        onClick={() => {
          // 껍데기 쪽이 닫기를 막을 수 있게 알린다. 여기서만 켜고 응답에서 끈다.
          onSavingChange(true);
          save.mutate(
            { amount: next },
            { onSettled: () => onSavingChange(false), onSuccess: onClose },
          );
        }}
      >
        저장
      </Button>
    </div>
  );
}
