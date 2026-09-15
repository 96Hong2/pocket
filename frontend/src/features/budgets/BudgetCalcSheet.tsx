import { useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import {
  ApiError,
  parseDecimalOr,
  useBudgetSuggestion,
  useSaveBudget,
  type BudgetSuggestionOut,
  type MonthParams,
} from '../../shared/api';
import { formatCurrency } from '../../shared/lib/format';
import { useDebounced } from '../../shared/lib/useDebounced';
import { TEST_IDS } from '../../shared/testIds';
import { Amount, AmountField, BottomSheet, Button, RetryButton } from '../../shared/ui';

export interface BudgetCalcSheetProps {
  open: boolean;
  /** 이 달의 예산을 낸다. 부르는 쪽이 보고 있는 달을 그대로 넘긴다. */
  month: MonthParams;
  onClose: () => void;
}

/**
 * 매달 꼭 나가는 돈의 항목.
 *
 * 「고정비」 한 칸이면 무엇을 더해야 하는지 몰라 비워 둔다. 항목으로 쪼개면 하나씩 떠올리며
 * 적을 수 있고, 안 나가는 항목은 비워 두면 된다. 전부 **한 달 기준**이다.
 */
const FIXED_ITEMS = [
  { key: 'housing', label: '월세·관리비' },
  { key: 'utilities', label: '통신·공과금' },
  { key: 'subscriptions', label: '구독·보험' },
  { key: 'loans', label: '대출·할부' },
  { key: 'transport', label: '교통' },
  { key: 'others', label: '그 밖에 매달 나가는 돈' },
] as const;

type FixedKey = (typeof FIXED_ITEMS)[number]['key'];

/** 한 글자 고칠 때마다 서버를 부르지 않는다. 잦아든 값만 질의로 나간다. */
const CALC_DEBOUNCE_MS = 250;

/** 서버가 준 금액을 입력칸이 쓰는 숫자 문자열로. `"3000000"` 을 그대로 믿지 않는다. */
function digitsOf(value: string | null | undefined): string {
  return value == null ? '' : String(parseDecimalOr(value, 0));
}

/** 질의로 실어 보낼 값. 비운 칸은 0 으로 본다. 안 보낸 것(추정값 그대로)과 구분한다. */
function givenAmount(edited: string | null): number | undefined {
  if (edited == null) return undefined;
  return edited === '' ? 0 : Number(edited);
}

function sumOf(items: Partial<Record<FixedKey, string>>): number {
  return FIXED_ITEMS.reduce((sum, item) => sum + Number(items[item.key] || 0), 0);
}

/**
 * 생활비 계산기.
 *
 * 예산 정하기 시트에서 「계산해서 정하기」 를 눌러 광고 한 편을 지난 뒤에 열린다.
 * 「이번 달 예산을 얼마로 할지」 를 모르는 사람을 위한 자리라, 숫자 하나를 묻지 않고
 * **손에 쥐는 돈 → 꼭 나가는 돈 → 모을 돈** 순서로 하나씩 묻는다. 전부 한 달 기준이다.
 *
 * 빼기는 서버가 한다. 화면은 항목 여섯을 더한 고정비 합과 다른 칸을 그대로 보내고,
 * 돌아온 제안액을 그린다. 누르기 전에는 아무것도 저장되지 않는다.
 */
export function BudgetCalcSheet({ open, month, onClose }: BudgetCalcSheetProps) {
  const [saving, setSaving] = useState(false);
  useOverlayBackClose(open, onClose, saving);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      dismissible={!saving}
      size="tall"
      title="생활비 계산하기"
      className="budget-calc"
    >
      {open ? <CalcForm month={month} onSavingChange={setSaving} onClose={onClose} /> : null}
    </BottomSheet>
  );
}

interface CalcFormProps {
  month: MonthParams;
  onSavingChange: (saving: boolean) => void;
  onClose: () => void;
}

function CalcForm({ month, onSavingChange, onClose }: CalcFormProps) {
  const analytics = useAnalytics();
  const [takeHome, setTakeHome] = useState<string | null>(null);
  const [fixed, setFixed] = useState<Partial<Record<FixedKey, string>>>({});
  const [fixedTouched, setFixedTouched] = useState(false);
  const [saving, setSavingDigits] = useState<string | null>(null);

  const askedTakeHome = useDebounced(takeHome, CALC_DEBOUNCE_MS);
  const fixedSum = sumOf(fixed);
  const askedFixed = useDebounced(fixedTouched ? String(fixedSum) : null, CALC_DEBOUNCE_MS);
  const askedSaving = useDebounced(saving, CALC_DEBOUNCE_MS);

  const suggestion = useBudgetSuggestion({
    ...month,
    takeHome: givenAmount(askedTakeHome),
    fixedCosts: givenAmount(askedFixed),
    saving: givenAmount(askedSaving),
  });
  const saveBudget = useSaveBudget(month);
  const data = suggestion.data ?? null;

  /*
    화면에 적힌 값과 손에 든 답이 어긋난 동안이다. 하나라도 걸리면 지금 보이는 제안액은
    고치기 전 것이라, 그대로 두면 새 값을 빼지 않은 옛 금액이 그대로 저장된다.
  */
  const stale =
    takeHome !== askedTakeHome ||
    (fixedTouched ? String(fixedSum) : null) !== askedFixed ||
    saving !== askedSaving ||
    suggestion.isPlaceholderData ||
    suggestion.isFetching;

  const suggested = data?.suggested == null ? null : parseDecimalOr(data.suggested, 0);
  /*
    제안을 못 받았다.

    **이 자리는 광고 한 편을 지나 들어온다.** 그런데 조회 실패를 아무도 안 읽어서, 값이
    안 오면 「계산 중」 이 영영 그대로 있고 저장 버튼도 죽어 있었다. 닫는 것 말고 할 일이
    없는 화면이 된다. 같은 화면의 예산·목표는 둘 다 오류 한 줄과 다시 시도를 둔다.
  */
  const loadFailed = suggestion.isError && !suggestion.isFetching;
  const canSave =
    !stale && !loadFailed && suggested != null && suggested > 0 && !saveBudget.isPending;
  const failure =
    saveBudget.error instanceof ApiError
      ? saveBudget.error.message
      : saveBudget.isError
        ? '예산을 정하지 못했어요.'
        : null;

  return (
    <div className="budget-calc__body">
      <p className="budget-calc__lead">
        전부 <b>한 달 기준</b>이에요. 모르는 칸은 비워 두어도 돼요.
      </p>

      <section className="budget-calc__step" aria-label="손에 쥐는 돈">
        <h3 className="budget-calc__step-title">
          <span className="budget-calc__num">1</span>한 달에 손에 쥐는 돈
        </h3>
        <AmountField
          label="실수령 (세후 월급 등)"
          value={takeHome ?? digitsOf(data?.take_home.amount)}
          onChange={setTakeHome}
        />
        {takeHome == null && data?.take_home.source === 'estimated' ? (
          <p className="budget-calc__basis">지난달에 적은 수입으로 어림했어요</p>
        ) : null}
      </section>

      <section className="budget-calc__step" aria-label="꼭 나가는 돈">
        <h3 className="budget-calc__step-title">
          <span className="budget-calc__num">2</span>매달 꼭 나가는 돈
        </h3>
        <div className="budget-calc__grid">
          {FIXED_ITEMS.map((item) => (
            <AmountField
              key={item.key}
              variant="compact"
              label={item.label}
              value={fixed[item.key] ?? ''}
              onChange={(digits) => {
                setFixedTouched(true);
                setFixed((prev) => ({ ...prev, [item.key]: digits }));
              }}
            />
          ))}
        </div>
        <p className="budget-calc__sum">
          합계{' '}
          <span data-testid={TEST_IDS.budgetCalcFixedSum} data-numeric="">
            {formatCurrency(fixedTouched ? fixedSum : parseDecimalOr(data?.fixed_costs.amount, 0))}
          </span>
          {!fixedTouched && data?.fixed_costs.source === 'estimated' ? (
            <span className="budget-calc__basis"> · 지난달 주거·고정비로 어림했어요</span>
          ) : null}
        </p>
      </section>

      <section className="budget-calc__step" aria-label="모을 돈">
        <h3 className="budget-calc__step-title">
          <span className="budget-calc__num">3</span>이번 달에 모을 돈
        </h3>
        <AmountField
          label="목표 저축"
          value={saving ?? digitsOf(data?.goal_saving)}
          onChange={setSavingDigits}
        />
        <p className="budget-calc__basis">{savingNote(data, saving)}</p>
      </section>

      <div className="budget-calc__result" aria-busy={stale && !loadFailed}>
        <span className="budget-calc__result-label">이번 달 생활비</span>
        {loadFailed ? (
          <span className="budget-calc__failed" role="status">
            계산에 쓸 값을 못 받았어요{' '}
            <RetryButton variant="ghost" onRetry={() => void suggestion.refetch()} />
          </span>
        ) : stale || suggested == null ? (
          <span className="budget-calc__pending">계산 중</span>
        ) : (
          <Amount
            data-testid={TEST_IDS.budgetSuggestAmount}
            value={suggested}
            size={24}
            weight={800}
          />
        )}
      </div>

      {/* 0원은 예산으로 저장할 수 없다. 눌러 보고 422 를 만나기 전에 이유를 알린다. */}
      {!stale && !loadFailed && suggested === 0 ? (
        <p className="budget-calc__note">
          지금 값으로는 생활비로 남는 돈이 없어요. 위 칸을 고쳐 볼 수 있어요
        </p>
      ) : null}

      {failure ? (
        <p className="budget-calc__note" role="alert">
          {failure}
        </p>
      ) : null}

      <div className="pk-sheet-foot budget-calc__foot">
        <Button
          fullWidth
          disabled={!canSave}
          onClick={() => {
            if (suggested == null) return;
            onSavingChange(true);
            saveBudget.mutate(
              { amount: suggested },
              {
                onSettled: () => onSavingChange(false),
                onSuccess: () => {
                  // 이 시트는 예산이 없는 달에서 연다. 여기서 정했으면 늘 첫 예산이다.
                  analytics.log(EVENTS.budgetSaved, { first: true, from: 'calculator' });
                  onClose();
                },
              },
            );
          }}
        >
          이 금액으로 예산 정하기
        </Button>
        <p className="budget-calc__aside">제안일 뿐이에요 · 예산은 언제든 바꿔도 괜찮아요</p>
      </div>
    </div>
  );
}

/** 목표 저축 칸 아래 한 줄. 어디서 온 숫자인지, 없으면 어떻게 하면 되는지. */
function savingNote(data: BudgetSuggestionOut | null, edited: string | null): string {
  if (edited != null) return '직접 적은 값이에요';
  if (data?.saving_source === 'goal' && data.goal_title) {
    return `목표 「${data.goal_title}」 에 매달 넣어야 하는 몫이에요`;
  }
  if (data?.reason === 'no_deadline' && data.goal_title) {
    return `목표 「${data.goal_title}」 는 기한이 없어요. 모을 만큼 적어 주세요`;
  }
  if (data?.reason === 'no_monthly_saving' && data.goal_title) {
    return `목표 「${data.goal_title}」 는 이번 달 몫이 없어요. 더 모을 만큼 적어 주세요`;
  }
  return '목표가 없으면 0으로 두어도 돼요';
}
