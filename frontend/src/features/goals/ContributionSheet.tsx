import { useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { ApiError, useAddGoalContribution } from '../../shared/api';
import { isFutureDay, toLedgerDate } from '../../shared/lib/format';
import { FutureDayConfirm } from '../../shared/ledger';
import { AmountField, BottomSheet, Button } from '../../shared/ui';
import { DAY_MAX, DAY_MIN, isDayInRange } from '../../shared/lib/limits';

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
  // 저장 때 「오늘 넣었나」 를 가르는 기준. 시트가 열려 있는 동안에는 안 바뀐다.
  const [today] = useState(() => toLedgerDate(new Date()));
  const analytics = useAnalytics();

  // 연도 오타(`0202`)는 칸의 min·max 로 안 막힌다.
  const dayOk = isDayInRange(day);
  const canSave = digits !== '' && Number(digits) > 0 && day !== '' && dayOk && !add.isPending;
  const message = add.error instanceof ApiError ? add.error.message : null;
  /** 저장을 눌렀다가 앞날이라 물어보는 중인가. */
  const [futureAsking, setFutureAsking] = useState(false);

  return (
    <div className="goal-sheet__body">
      <AmountField label="금액" value={digits} onChange={setDigits} />

      <label className="goal-sheet__field">
        <span className="goal-sheet__label">날짜</span>
        <input
          className="goal-sheet__input pk-date"
          type="date"
          min={DAY_MIN}
          max={DAY_MAX}
          value={day}
          onChange={(event) => setDay(event.target.value)}
        />
      </label>

      {message ? (
        <p className="goal-sheet__notice" role="alert">
          {message}
        </p>
      ) : null}

      {/* 저장이 왜 회색인지 그 자리에서 말한다. 연도 오타는 칸만 봐서는 안 보인다. */}
      {!dayOk ? (
        <p className="goal-sheet__notice" role="status">
          날짜는 2000년부터 2100년 사이로 골라 주세요
        </p>
      ) : null}

      <Button fullWidth disabled={!canSave} onClick={requestSave}>
        저장
      </Button>

      {/* 앞날에 모은 것으로 적으려 할 때만 선다. 막는 것이 아니라 한 번 확인하는 자리다. */}
      {futureAsking ? (
        <FutureDayConfirm day={day} onFix={() => setFutureAsking(false)} onSave={save} />
      ) : null}
    </div>
  );

  function requestSave(): void {
    // 아직 오지 않은 날이면 한 번 묻는다. 모은 돈은 이미 넣은 돈이라 앞날은 대개 오타다.
    if (isFutureDay(day)) {
      setFutureAsking(true);
      return;
    }
    save();
  }

  function save(): void {
    setFutureAsking(false);
    // 껍데기 쪽이 닫기를 막을 수 있게 알린다. 여기서만 켜고 응답에서 끈다.
    onSavingChange(true);
    add.mutate(
      { goalId, body: { amount: Number(digits), occurred_on: day } },
      {
        onSettled: () => onSavingChange(false),
        onSuccess: () => {
          /*
            **금액은 안 싣는다.** 얼마를 모으는지가 그 사람의 사정이다. 남기는 것은
            오늘 넣었나 지난 날로 넣었나까지다. 지난 날로 넣는 사람이 많으면 이
            시트가 아니라 「모은 뒤에 적는 흐름」 이 필요한 것이다.

            **앞날은 `backdated` 가 아니다.** 이 시트는 앞날도 받는다(한 번 묻고 통과시킨다).
            `day !== today` 로 세면 앞날에 넣은 것까지 「지난 날」 에 섞여, 두 가지 다른 일이
            한 칸에 뭉친다.
          */
          analytics.log(EVENTS.goalContributed, { backdated: day < today }, { kind: 'click' });
          onClose();
        },
      },
    );
  }
}
