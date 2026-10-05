import { useEffect, useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { ApiError, useMonthStartDay, useSavePreferences } from '../../shared/api';
import { toLedgerDate } from '../../shared/lib/format';
import { describePeriod, MAX_START_DAY, periodContaining } from '../../shared/lib/monthPeriod';
import { TEST_IDS } from '../../shared/testIds';
import { BottomSheet, Button } from '../../shared/ui';

export type MonthStartWhere = 'manage' | 'settings' | 'report';

export interface MonthStartSheetProps {
  open: boolean;
  onClose: () => void;
  /** 어디서 열었나. 로그에만 쓴다. */
  where: MonthStartWhere;
}

const DAYS = Array.from({ length: MAX_START_DAY }, (_, index) => index + 1);

/**
 * 예산과 리포트의 한 달이 며칠에 시작하나.
 *
 * 설명 글 대신 고른 날로 오늘이 든 기간을 한 줄로 보여 준다. 그 줄이 「25일부터 다음 달
 * 24일까지」 와 「달 이름이 무엇이 되나」 를 함께 말한다.
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
  const [picked, setPicked] = useState(startDay);
  const today = toLedgerDate(new Date());
  const failure =
    save.error instanceof ApiError
      ? save.error.message
      : save.isError
        ? '설정을 저장하지 못했어요.'
        : null;

  function submit(): void {
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
    <div className="month-start__body">
      <div className="month-start__grid" role="group" aria-label="시작일">
        {DAYS.map((day) => (
          <button
            key={day}
            type="button"
            className="month-start__day"
            aria-pressed={day === picked}
            aria-label={`${day}일`}
            disabled={save.isPending}
            onClick={() => setPicked(day)}
          >
            {day}
          </button>
        ))}
      </div>

      <p className="month-start__preview" data-testid={TEST_IDS.monthStartPreview}>
        {describePeriod(periodContaining(today, picked))}
      </p>

      {failure ? (
        <p className="budget-sheet__notice" role="alert">
          {failure}
        </p>
      ) : null}

      <Button fullWidth disabled={save.isPending} onClick={submit}>
        저장
      </Button>
    </div>
  );
}
