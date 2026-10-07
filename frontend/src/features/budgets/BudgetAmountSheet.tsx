import { useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { ApiError, useDeleteBudget, useSaveBudget, type MonthParams } from '../../shared/api';
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
  /**
   * 주면 이미 정한 예산을 고칠 때 맨 아래에 작은 「예산 지우기」 가 선다. 지운 뒤에 부른다.
   *
   * 관리 탭만 준다. 카드에 늘 서 있던 지우기 버튼을 여기로 옮겼다. 자주 쓰는 일이 아니다.
   */
  onDeleted?: () => void;
  /**
   * 지우면 딸려 사라지는 카테고리 한도가 몇 개인가.
   *
   * 전체 예산을 지우면 서버가 카테고리 한도까지 함께 지운다. 그 말을 안 하면
   * 한 번 누르고 여러 개를 잃는다. 없으면 굳이 말하지 않는다.
   */
  categoryCount?: number;
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
  onDeleted,
  categoryCount = 0,
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
          onDeleted={amount != null ? onDeleted : undefined}
          categoryCount={categoryCount}
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
  onDeleted?: () => void;
  categoryCount: number;
}

function BudgetAmountForm({
  month,
  amount,
  from,
  onSavingChange,
  onClose,
  onCalc,
  calcBusy,
  onDeleted,
  categoryCount,
}: BudgetAmountFormProps) {
  const analytics = useAnalytics();
  const save = useSaveBudget(month);
  const remove = useDeleteBudget(month);
  const [digits, setDigits] = useState(amount == null ? '' : String(amount));
  /** 「얼마로 할지 모르겠어요」 를 누른 뒤, 광고를 틀기 전에 한 번 묻는 자리. */
  const [confirmCalc, setConfirmCalc] = useState(false);
  /** 「예산 지우기」 를 누른 뒤 한 번 묻는 자리. 되돌릴 수 없고 딸려 사라지는 것이 있다. */
  const [asking, setAsking] = useState(false);

  const busy = save.isPending || remove.isPending;
  const next = Number(digits);
  const canSave = digits !== '' && next > 0 && !busy;
  const failed = save.error ?? remove.error;
  // 왜 못 지웠는지는 서버가 안다. 끝난 기간이라 막힌 것을 다시 시도로 안내하지 않는다.
  const message =
    failed instanceof ApiError
      ? failed.message
      : remove.isError
        ? '예산을 지우지 못했어요.'
        : null;

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
          remove.reset();
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

      {/*
        지우기는 맨 아래 작은 글자 하나다. 저장과 나란히 두면 같은 무게로 읽힌다.
        누르면 그 자리만 묻는 줄로 바뀐다. 시트를 하나 더 겹치지 않는다.
      */}
      {onDeleted != null && !asking ? (
        <button
          type="button"
          className="budget-sheet__delete"
          disabled={busy}
          onClick={() => setAsking(true)}
        >
          예산 지우기
        </button>
      ) : null}

      {onDeleted != null && asking ? (
        <div className="budget-sheet__confirm" role="group" aria-label="지우기 확인">
          <p className="budget-sheet__confirm-text">
            <b>이번 달 예산을 지울까요?</b>{' '}
            {categoryCount > 0
              ? `카테고리 한도 ${categoryCount}개도 함께 사라져요`
              : '지우면 되돌릴 수 없어요'}
          </p>
          <div className="budget-sheet__confirm-actions">
            <Button variant="outline" disabled={busy} onClick={() => setAsking(false)}>
              그대로 둘래요
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                save.reset();
                onSavingChange(true);
                remove.mutate(undefined, {
                  onSettled: () => onSavingChange(false),
                  onSuccess: () => {
                    onDeleted();
                    onClose();
                  },
                  // 실패하면 묻는 줄을 접고 이유를 위에 적는다. 금액 칸은 그대로 남는다.
                  onError: () => setAsking(false),
                });
              }}
            >
              지울게요
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
