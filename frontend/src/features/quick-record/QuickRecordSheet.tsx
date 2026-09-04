import { useEffect, useState } from 'react';

import { useBridge, useOverlayBackClose } from '../../app/providers';
import {
  ApiError,
  useCategories,
  useCreateTransaction,
  type CategoryOut,
  type FeedbackOut,
  type TransactionOut,
} from '../../shared/api';
import { formatCurrency } from '../../shared/lib/format';
import {
  BottomSheet,
  ErrorState,
  LoadingState,
  SegmentedControl,
  type SegmentedOption,
} from '../../shared/ui';

import { NaturalLanguageTab } from '../imports';

import { CategoryChips } from './CategoryChips';
import { FeedbackPanel } from './FeedbackPanel';
import { toAmount } from './digits';
import { AmountDisplay, Keypad } from './Keypad';
import { readLastRecord, writeLastRecord, type LastRecord } from './lastRecord';
import { undoDeadline } from './useUndoCountdown';

type RecordTab = 'keypad' | 'nl' | 'capture' | 'receipt';

/** 뒤 둘은 다음 마일스톤에서 열린다. 자리만 두어 어디로 가는지 보이게 한다. */
const TABS: SegmentedOption<RecordTab>[] = [
  { value: 'keypad', label: '키패드' },
  { value: 'nl', label: '줄글' },
  { value: 'capture', label: '캡처', disabled: true },
  { value: 'receipt', label: '영수증', disabled: true },
];

interface SavedState {
  transaction: TransactionOut;
  feedback: FeedbackOut;
  /** 되돌리기 카운트다운이 끝나는 시각. */
  deadline: number | null;
}

/**
 * 기록 시트.
 *
 * 저장해도 시트를 닫지 않고 안쪽 내용만 입력 → 피드백으로 바꾼다.
 * 시트를 두 개 겹치면 포커스가 어디로 돌아갈지 흔들리고, 화면에 dialog 가 둘이 된다.
 */
export function QuickRecordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  // 저장 응답을 기다리는 동안에는 닫히지 않는다.
  // 닫히면 컴포넌트가 사라져 응답이 갈 곳이 없어지고, 피드백과 되돌리기가 영구히 사라진다.
  // 저장 자체는 서버에 남으므로 사용자는 되돌릴 방법 없이 기록만 남게 된다.
  const [saving, setSaving] = useState(false);

  // 시스템 뒤로가기를 시트가 먼저 가져간다. 안 그러면 시트가 열린 채 미니앱이 닫힌다.
  useOverlayBackClose(open && !saving, onClose);

  return (
    <BottomSheet open={open} onClose={onClose} dismissible={!saving} ariaLabel="10초 기록">
      <RecordBody onDone={onClose} onSavingChange={setSaving} />
    </BottomSheet>
  );
}

/** 시트가 열릴 때 새로 마운트된다. 그래서 지난번 금액이 남아 있지 않다. */
function RecordBody({
  onDone,
  onSavingChange,
}: {
  onDone: () => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const bridge = useBridge();
  const categories = useCategories();
  const create = useCreateTransaction();

  const [tab, setTab] = useState<RecordTab>('keypad');
  const [digits, setDigits] = useState('');
  const [saved, setSaved] = useState<SavedState | null>(null);
  const [repeat, setRepeat] = useState<LastRecord | null>(null);

  useEffect(() => {
    let alive = true;
    void readLastRecord(bridge.storage).then((record) => {
      if (alive) setRepeat(record);
    });
    return () => {
      alive = false;
    };
  }, [bridge]);

  const expenseCategories = (categories.data?.items ?? []).filter(
    (category) => category.kind === 'expense',
  );

  function save(category: CategoryOut, amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;

    // 껍데기 쪽이 닫기를 막을 수 있게 알린다. 여기서만 켜고 응답에서 끈다.
    onSavingChange(true);
    create.mutate(
      {
        occurred_at: new Date().toISOString(),
        amount,
        type: 'expense',
        category_id: category.id,
        source: 'keypad',
        // 손으로 직접 누른 값이라 분류를 의심할 이유가 없다.
        confidence: 1,
        excluded_from_budget: false,
      },
      {
        onSettled: () => onSavingChange(false),
        onSuccess: (created) => {
          setSaved({
            transaction: created.transaction,
            feedback: created.feedback,
            deadline: undoDeadline(created, Date.now()),
          });
          void writeLastRecord(bridge.storage, {
            amount,
            categoryId: category.id,
            categoryName: category.name,
          });
        },
      },
    );
  }

  if (saved != null) {
    return (
      <FeedbackPanel
        transaction={saved.transaction}
        feedback={saved.feedback}
        categories={expenseCategories}
        deadline={saved.deadline}
        onUndone={onDone}
        onUpdated={(updated) =>
          setSaved({
            transaction: updated.transaction,
            feedback: updated.feedback,
            // 되돌리기 창은 저장 시각부터 흐른다. 카테고리를 바꿔도 다시 늘어나지 않는다.
            deadline: saved.deadline,
          })
        }
        onConfirm={onDone}
      />
    );
  }

  const amount = toAmount(digits);
  const saveError = create.error instanceof ApiError ? create.error : null;
  const repeatCategory = repeat
    ? expenseCategories.find((category) => category.id === repeat.categoryId)
    : undefined;

  let hint = '금액을 누르고 카테고리를 고르면 바로 저장돼요';
  if (create.isPending) hint = '저장하는 중이에요';
  else if (amount > 0) hint = '카테고리를 고르면 저장돼요';

  return (
    <div className="record">
      <SegmentedControl
        className="record__tabs"
        options={TABS}
        value={tab}
        onChange={setTab}
        ariaLabel="기록 방법"
      />

      {tab === 'nl' ? (
        <NaturalLanguageTab onSavingChange={onSavingChange} onDone={onDone} />
      ) : (
        <>
          {repeat && repeatCategory ? (
            <div className="record__repeat">
              <button
                type="button"
                className="repeat-chip"
                disabled={create.isPending}
                onClick={() => {
                  setDigits(String(repeat.amount));
                  save(repeatCategory, repeat.amount);
                }}
              >
                한 번 더 · {repeat.categoryName} {formatCurrency(repeat.amount)}
              </button>
            </div>
          ) : null}

          <AmountDisplay digits={digits} hint={hint} />

          {saveError ? (
            <p className="record__notice" role="alert">
              {saveError.message}
            </p>
          ) : null}

          {categories.isPending ? <LoadingState size="inline" /> : null}
          {categories.isError ? (
            <ErrorState
              size="inline"
              title="카테고리를 불러오지 못했어요"
              onRetry={() => void categories.refetch()}
            />
          ) : null}

          <CategoryChips
            categories={expenseCategories}
            disabled={amount <= 0 || create.isPending}
            onPick={(category) => save(category, amount)}
          />

          <Keypad digits={digits} onChange={setDigits} />
        </>
      )}
    </div>
  );
}
