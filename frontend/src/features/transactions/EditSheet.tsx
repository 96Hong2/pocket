import { useState } from 'react';

import {
  parseDecimalOr,
  useDeleteTransaction,
  useUpdateTransaction,
  type CategoryOut,
  type MonthParams,
  type TransactionOut,
  type TransactionUpdate,
} from '../../shared/api';
import { formatDayLabel } from '../../shared/lib/format';
import { BottomSheet, Button, CategoryAvatar, Toggle, toIconName } from '../../shared/ui';

/**
 * 수정 시트. 상호·금액·카테고리·예산 제외를 한 화면에서 고친다.
 *
 * 저장은 `PATCH /transactions/{id}` 하나로 끝낸다. 보낸 필드만 고치는 규칙이라
 * 바뀐 것만 실어 보낸다. 아무것도 안 바뀌었으면 요청을 보내지 않는다.
 *
 * 삭제는 되돌리기와 다르다. 되돌리기는 저장 직후 짧은 시간에만 되고, 여기서는 언제든 된다.
 */
export interface EditSheetProps {
  transaction: TransactionOut | null;
  categories: CategoryOut[];
  /** 무효화 대상 달. 홈·요약과 같은 키를 써야 숫자가 함께 맞는다. */
  month?: MonthParams;
  onClose: () => void;
}

export function EditSheet({ transaction, categories, month, onClose }: EditSheetProps) {
  return (
    <BottomSheet
      open={transaction != null}
      onClose={onClose}
      ariaLabel="기록 수정"
      className="tx-edit"
    >
      {transaction != null ? (
        // key 로 다시 마운트해 입력값을 그 거래 것으로 갈아 끼운다.
        // 효과로 값을 되넣으면 한 번 더 렌더하고, 앞 거래 값이 한 프레임 남는다.
        <EditForm
          key={transaction.id}
          transaction={transaction}
          categories={categories}
          month={month}
          onClose={onClose}
        />
      ) : null}
    </BottomSheet>
  );
}

interface EditFormProps {
  transaction: TransactionOut;
  categories: CategoryOut[];
  month?: MonthParams;
  onClose: () => void;
}

/**
 * 종류마다 고를 수 있는 카테고리가 다르다.
 *
 * 지출 줄에 '수입' 카테고리를 붙일 수 있으면 목록과 리포트가 서로 다른 말을 한다.
 * 환불은 지출을 깎는 것이라 지출 카테고리를 쓴다.
 */
const CATEGORY_KIND: Record<TransactionOut['type'], CategoryOut['kind']> = {
  expense: 'expense',
  refund: 'expense',
  income: 'income',
  transfer: 'transfer',
};

function EditForm({ transaction, categories, month, onClose }: EditFormProps) {
  const update = useUpdateTransaction(month);
  const remove = useDeleteTransaction();

  const savedAmount = parseDecimalOr(transaction.amount, 0);
  const [merchant, setMerchant] = useState(transaction.merchant ?? '');
  const [amount, setAmount] = useState(String(savedAmount));
  const [categoryId, setCategoryId] = useState<string | null>(transaction.category_id ?? null);
  const [excluded, setExcluded] = useState(transaction.excluded_from_budget);
  const [failed, setFailed] = useState(false);

  const busy = update.isPending || remove.isPending;
  const pickable = categories.filter((item) => item.kind === CATEGORY_KIND[transaction.type]);

  function changes(): TransactionUpdate {
    const next: TransactionUpdate = {};
    const trimmed = merchant.trim();
    const nextAmount = Number(amount);

    if (trimmed !== (transaction.merchant ?? '')) next.merchant = trimmed === '' ? null : trimmed;
    if (Number.isFinite(nextAmount) && nextAmount > 0 && nextAmount !== savedAmount) {
      next.amount = String(nextAmount);
    }
    if (categoryId !== (transaction.category_id ?? null)) next.category_id = categoryId;
    if (excluded !== transaction.excluded_from_budget) next.excluded_from_budget = excluded;
    return next;
  }

  async function submit(): Promise<void> {
    const body = changes();
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    try {
      setFailed(false);
      await update.mutateAsync({ id: transaction.id, body });
      onClose();
    } catch {
      // 시트를 닫지 않는다. 고쳐 둔 값이 사라지면 처음부터 다시 입력해야 한다.
      setFailed(true);
    }
  }

  async function destroy(): Promise<void> {
    try {
      setFailed(false);
      await remove.mutateAsync(transaction.id);
      onClose();
    } catch {
      setFailed(true);
    }
  }

  return (
    <>
      <p className="tx-edit__title">
        {nameOf(transaction, categories)} · {formatDayLabel(new Date(transaction.occurred_at))}
      </p>

      <div className="tx-edit__fields">
        <label className="tx-edit__field">
          <span className="tx-edit__label">상호</span>
          <input
            className="tx-edit__input"
            value={merchant}
            onChange={(event) => setMerchant(event.target.value)}
            placeholder="어디서 썼나요"
            maxLength={120}
          />
        </label>
        <label className="tx-edit__field tx-edit__field--amount">
          <span className="tx-edit__label">금액</span>
          <input
            className="tx-edit__input tx-edit__input--amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
          />
        </label>
      </div>

      <div className="tx-edit__cats" role="group" aria-label="카테고리">
        {pickable.map((category) => (
          <button
            key={category.id}
            type="button"
            className={
              category.id === categoryId ? 'tx-edit__cat tx-edit__cat--on' : 'tx-edit__cat'
            }
            aria-pressed={category.id === categoryId}
            onClick={() => setCategoryId(category.id)}
          >
            <CategoryAvatar icon={toIconName(category.icon_key)} size={22} />
            {category.name}
          </button>
        ))}
      </div>

      <div className="tx-edit__exclude">
        <div className="tx-edit__exclude-text">
          <span id="tx-exclude-label" className="tx-edit__exclude-title">
            예산 계산에서 제외
          </span>
          <span className="tx-edit__exclude-note">
            내역에는 남고 예산에서만 빠져요. 일회성 큰 지출에 좋아요
          </span>
        </div>
        <Toggle checked={excluded} onChange={setExcluded} ariaLabelledBy="tx-exclude-label" />
      </div>

      {failed ? (
        <p className="tx-edit__notice" role="alert">
          고친 것을 저장하지 못했어요. 입력한 값은 그대로 있어요.
        </p>
      ) : null}

      <div className="tx-edit__actions">
        <Button variant="outline" onClick={() => void destroy()} disabled={busy}>
          삭제
        </Button>
        <Button className="tx-edit__done" onClick={() => void submit()} disabled={busy}>
          완료
        </Button>
      </div>
    </>
  );
}

function nameOf(transaction: TransactionOut, categories: CategoryOut[]): string {
  if (transaction.merchant) return transaction.merchant;
  const category = categories.find((item) => item.id === transaction.category_id);
  return category?.name ?? '기록';
}
