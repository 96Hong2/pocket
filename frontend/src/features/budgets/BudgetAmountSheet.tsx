import { useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { ApiError, useSaveBudget, type MonthParams } from '../../shared/api';
import { AmountField, BottomSheet, Button } from '../../shared/ui';

import { BudgetCalcAsk } from './BudgetCalcAsk';

export interface BudgetAmountSheetProps {
  open: boolean;
  /** 저장할 달. 홈과 캐시 키가 어긋나지 않게 항상 명시해 넘긴다. */
  month: MonthParams;
  /** 이미 정해 둔 금액. 없으면 빈 칸으로 연다. */
  amount: number | null;
  onClose: () => void;
  /**
   * 「계산해서 정하기」. 얼마로 할지 모르는 사람이 여는 부가기능이다.
   *
   * 처음 정할 때만 둔다. 이미 정한 예산을 고치는 사람은 얼마로 할지 아는 사람이다.
   * `calcBusy` 는 광고를 불러오는 동안이다. 그동안 버튼이 죽어 있어야 두 번 눌리지 않는다.
   */
  onCalc?: () => void;
  calcBusy?: boolean;
  /**
   * 어느 자리에서 열었나. 로그에만 쓴다.
   *
   * 앱 설정에서 「남은 예산」 을 고른 사람에게만 뜨는 입구가 따로 있다. 그 길로 정하는
   * 사람이 몇인지 못 보면, 버튼을 더 눌러 볼 가치가 있는지 판단할 수 없다.
   */
  from?: 'sheet' | 'settings';
}

/** 전체 예산 금액을 정하는 시트. 처음 정할 때와 고칠 때가 같은 화면이다. */
export function BudgetAmountSheet({
  open,
  month,
  amount,
  onClose,
  onCalc,
  calcBusy = false,
  from = 'sheet',
}: BudgetAmountSheetProps) {
  // 저장 응답을 기다리는 동안에는 닫히지 않는다.
  // 닫히면 폼이 사라져 실패를 그릴 자리가 없어진다. 적어 둔 금액도 함께 사라진다.
  const [saving, setSaving] = useState(false);

  // 시스템 뒤로가기를 시트가 먼저 가져간다. 안 그러면 시트가 열린 채 화면만 뒤로 빠진다.
  useOverlayBackClose(open, onClose, saving);

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
          from={from}
          onSavingChange={setSaving}
          onClose={onClose}
          onCalc={amount == null ? onCalc : undefined}
          calcBusy={calcBusy}
        />
      ) : null}
    </BottomSheet>
  );
}

interface BudgetAmountFormProps {
  month: MonthParams;
  amount: number | null;
  from: 'sheet' | 'settings';
  onSavingChange: (saving: boolean) => void;
  onClose: () => void;
  onCalc?: () => void;
  calcBusy: boolean;
}

function BudgetAmountForm({
  month,
  amount,
  from,
  onSavingChange,
  onClose,
  onCalc,
  calcBusy,
}: BudgetAmountFormProps) {
  const analytics = useAnalytics();
  const save = useSaveBudget(month);
  const [digits, setDigits] = useState(amount == null ? '' : String(amount));
  /** 「얼마로 할지 모르겠어요」 를 누른 뒤, 광고를 틀기 전에 한 번 묻는 자리. */
  const [confirmCalc, setConfirmCalc] = useState(false);

  const next = Number(digits);
  const canSave = digits !== '' && next > 0 && !save.isPending;
  const message = save.error instanceof ApiError ? save.error.message : null;

  /*
    묻는 동안에는 이 한 장만 남긴다.

    예전에는 금액 칸과 저장 버튼 아래에 묻는 말을 덧붙였다. 그러면 화면에 할 일이 셋이 되어
    눈이 위쪽 금액 칸으로 먼저 간다. 모르겠다고 말한 사람에게 다시 적으라고 보이는 셈이다.
    적어 둔 금액은 이 컴포넌트가 그대로 들고 있어서, 「닫기」 로 돌아오면 다시 서 있다.
  */
  if (confirmCalc && onCalc != null) {
    return (
      <div className="budget-sheet__body">
        <BudgetCalcAsk busy={calcBusy} onClose={() => setConfirmCalc(false)} onConfirm={onCalc} />
      </div>
    );
  }

  return (
    <div className="budget-sheet__body">
      <AmountField label="금액" value={digits} onChange={setDigits} />

      {message ? (
        <p className="budget-sheet__notice" role="alert">
          {message}
        </p>
      ) : null}

      {/*
        저장이 왜 회색인지 그 자리에서 말한다. 0 원 예산을 서버가 막는 데는 이유가 있는데
        (예산 없음과 구분이 안 되고 게이지 분모가 0 이 된다) 화면은 아무 말도 안 했다.
      */}
      {message == null && digits !== '' && next <= 0 ? (
        <p className="budget-sheet__notice" role="status">
          1원부터 정할 수 있어요
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
            {
              onSettled: () => onSavingChange(false),
              onSuccess: () => {
                // 금액은 남기지 않는다. 처음 정한 것인지가 알고 싶은 전부다.
                analytics.log(EVENTS.budgetSaved, { first: amount == null, from });
                onClose();
              },
            },
          );
        }}
      >
        저장
      </Button>

      {/*
        얼마로 할지 모르는 사람을 위한 다른 길. 저장 아래 한 단 낮게 둔다.

        누르면 이 화면이 통째로 묻는 자리로 바뀐다. 눌렀는데 곧장 광고가 뜨면 속은 기분이 든다.
      */}
      {onCalc ? (
        <div className="budget-sheet__calc">
          <Button
            variant="outline"
            fullWidth
            disabled={save.isPending || calcBusy}
            onClick={() => setConfirmCalc(true)}
          >
            얼마로 할지 모르겠어요
          </Button>
        </div>
      ) : null}
    </div>
  );
}
