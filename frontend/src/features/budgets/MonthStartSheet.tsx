import { useEffect, useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { ApiError, useMonthStartDay, useSavePreferences } from '../../shared/api';
import { BottomSheet, MonthStartPicker } from '../../shared/ui';

export type MonthStartWhere = 'manage' | 'settings' | 'report';

export interface MonthStartSheetProps {
  open: boolean;
  onClose: () => void;
  /** 어디서 열었나. 로그에만 쓴다. */
  where: MonthStartWhere;
}

/**
 * 예산과 리포트의 한 달이 며칠에 시작하나.
 *
 * 칸과 미리보기는 공유 가계부 시작일과 같은 부품(`MonthStartPicker`)이다. 여기는 내 설정에
 * 저장하고 로그를 남기는 일만 한다.
 */
export function MonthStartSheet({ open, onClose, where }: MonthStartSheetProps) {
  const [saving, setSaving] = useState(false);
  const analytics = useAnalytics();

  useOverlayBackClose(open, onClose, saving);

  useEffect(() => {
    if (open) analytics.log(EVENTS.monthStartOpened, { where }, { kind: 'click' });
  }, [analytics, open, where]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      dismissible={!saving}
      title="한 달 시작일"
      className="month-start"
    >
      {/* 열 때마다 새로 마운트해 지금 저장된 날을 골라 둔다. */}
      {open ? <MonthStartForm where={where} onSavingChange={setSaving} onClose={onClose} /> : null}
    </BottomSheet>
  );
}

function MonthStartForm({
  where,
  onSavingChange,
  onClose,
}: {
  where: MonthStartWhere;
  onSavingChange: (saving: boolean) => void;
  onClose: () => void;
}) {
  const analytics = useAnalytics();
  const { startDay } = useMonthStartDay();
  const save = useSavePreferences();
  const failure =
    save.error instanceof ApiError
      ? save.error.message
      : save.isError
        ? '설정을 저장하지 못했어요.'
        : null;

  function submit(picked: number): void {
    if (picked === startDay) {
      onClose();
      return;
    }
    onSavingChange(true);
    save.mutate(
      { month_start_day: picked },
      {
        onSettled: () => onSavingChange(false),
        onSuccess: () => {
          analytics.log(EVENTS.monthStartSaved, { where, day: picked, from_day: startDay });
          onClose();
        },
      },
    );
  }

  return (
    <MonthStartPicker
      value={startDay}
      saving={save.isPending}
      notice={
        failure ? (
          <p className="budget-sheet__notice" role="alert">
            {failure}
          </p>
        ) : null
      }
      onSave={submit}
    />
  );
}
