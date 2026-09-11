import { useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { ApiError, useAddGoalContribution } from '../../shared/api';
import { toLedgerDate } from '../../shared/lib/format';
import { AmountField, BottomSheet, Button } from '../../shared/ui';

export interface ContributionSheetProps {
  open: boolean;
  /** 어느 목표에 더하나. 시트가 열려 있으면 반드시 있다. */
  goalId: string | null;
  onClose: () => void;
}

/** 모은 돈을 더하는 시트. 금액과 날짜 둘만 받는다. */
export function ContributionSheet({ open, goalId, onClose }: ContributionSheetProps) {
  // 저장 응답을 기다리는 동안에는 닫히지 않는다. 닫히면 실패를 그릴 자리가 없어진다.
  const [saving, setSaving] = useState(false);

  // 시스템 뒤로가기를 시트가 먼저 가져간다. 안 그러면 시트가 열린 채 화면만 뒤로 빠진다.
  useOverlayBackClose(open, onClose, saving);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      dismissible={!saving}
      title="모은 돈 더하기"
      className="goal-sheet"
    >
      {open && goalId != null ? (
        <ContributionForm goalId={goalId} onSavingChange={setSaving} onClose={onClose} />
      ) : null}
    </BottomSheet>
  );
}

interface ContributionFormProps {
  goalId: string;
  onSavingChange: (saving: boolean) => void;
  onClose: () => void;
}

function ContributionForm({ goalId, onSavingChange, onClose }: ContributionFormProps) {
  const add = useAddGoalContribution();
  const [digits, setDigits] = useState('');
  // 기기 시간대로 오늘을 만들지 않는다. 서버가 가계부 시간대로 날짜를 세므로 같은 기준을 쓴다.
  const [day, setDay] = useState(() => toLedgerDate(new Date()));

  const canSave = digits !== '' && Number(digits) > 0 && day !== '' && !add.isPending;
  const message = add.error instanceof ApiError ? add.error.message : null;

  return (
    <div className="goal-sheet__body">
      <AmountField label="금액" value={digits} onChange={setDigits} />

      <label className="goal-sheet__field">
        <span className="goal-sheet__label">날짜</span>
        <input
          className="goal-sheet__input pk-date"
          type="date"
          value={day}
          onChange={(event) => setDay(event.target.value)}
        />
      </label>

      {message ? (
        <p className="goal-sheet__notice" role="alert">
          {message}
        </p>
      ) : null}

      <Button
        fullWidth
        disabled={!canSave}
        onClick={() => {
          // 껍데기 쪽이 닫기를 막을 수 있게 알린다. 여기서만 켜고 응답에서 끈다.
          onSavingChange(true);
          add.mutate(
            { goalId, body: { amount: Number(digits), occurred_on: day } },
            { onSettled: () => onSavingChange(false), onSuccess: onClose },
          );
        }}
      >
        저장
      </Button>
    </div>
  );
}
