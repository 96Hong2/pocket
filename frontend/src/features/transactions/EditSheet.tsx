import { useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import {
  parseDecimalOr,
  useDeleteTransaction,
  useUpdateTransaction,
  type CategoryOut,
  type MonthParams,
  type PaymentMethod,
  type TransactionOut,
  type TransactionUpdate,
} from '../../shared/api';
import {
  KindToggle,
  PaymentMethodPicker,
  categoriesOfKind,
  kindOf,
  type LedgerKind,
} from '../../shared/ledger';
import { formatDayLabel } from '../../shared/lib/format';
import {
  AmountField,
  BottomSheet,
  Button,
  CategoryAvatar,
  Toggle,
  iconOf,
} from '../../shared/ui';

import { CategoryEditForm } from '../categories';

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
  // 시스템 뒤로가기를 시트가 먼저 가져간다. 안 그러면 시트가 열린 채 화면만 뒤로 빠진다.
  useOverlayBackClose(transaction != null, onClose);

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

/**
 * 종류를 여기서 바꿀 수 있는가.
 *
 * 지출과 수입만 서로 바꾼다. 환불은 되돌릴 지출을 함께 골라야 하고, 이체는 집계 밖이라
 * 분류가 없다. 둘을 이 토글에 태우면 되돌릴 수 없는 방향으로만 흐른다.
 */
function canSwitchKind(type: TransactionOut['type']): boolean {
  return type === 'expense' || type === 'income';
}

function EditForm({ transaction, categories, month, onClose }: EditFormProps) {
  const analytics = useAnalytics();
  const update = useUpdateTransaction(month);
  const remove = useDeleteTransaction();

  const savedAmount = parseDecimalOr(transaction.amount, 0);
  const [merchant, setMerchant] = useState(transaction.merchant ?? '');
  const [amount, setAmount] = useState(String(savedAmount));
  const [categoryId, setCategoryId] = useState<string | null>(transaction.category_id ?? null);
  const [excluded, setExcluded] = useState(transaction.excluded_from_budget);
  const [kind, setKind] = useState<LedgerKind>(kindOf(transaction.type));
  const [method, setMethod] = useState<PaymentMethod | null>(transaction.payment_method);
  const [failed, setFailed] = useState(false);
  /*
    분류 만들기 자리가 열렸나.

    기록할 때만 만들 수 있으면, 나중에 목록을 보다가 「이건 따로 세고 싶다」 고 생각한
    순간에 갈 곳이 없다. 기록 시트와 같은 방식으로 시트를 하나 더 띄우지 않고
    분류 칸이 만들기 폼으로 바뀐다. 고쳐 둔 금액·상호가 살아 있어야 이어서 저장한다.
  */
  const [creating, setCreating] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);

  const busy = update.isPending || remove.isPending;
  const switchable = canSwitchKind(transaction.type);
  const pickable = switchable
    ? categoriesOfKind(kind, categories)
    : categories.filter((item) => item.kind === CATEGORY_KIND[transaction.type]);
  // 머리의 아이콘은 지금 고른 카테고리를 따라간다. 저장한 값만 보면 바꾼 뒤에도 옛 그림이 남는다.
  const headCategory = categories.find((item) => item.id === categoryId);

  const nextAmount = Number(amount);
  // 저장할 수 없는 금액이면 완료를 잠근다. 열어 두면 금액만 조용히 빠지고 나머지가 저장된다.
  const amountOk = amount !== '' && Number.isFinite(nextAmount) && nextAmount > 0;

  function changes(): TransactionUpdate {
    const next: TransactionUpdate = {};
    const trimmed = merchant.trim();

    if (trimmed !== (transaction.merchant ?? '')) next.merchant = trimmed === '' ? null : trimmed;
    if (nextAmount !== savedAmount) next.amount = String(nextAmount);
    if (switchable && kind !== transaction.type) next.type = kind;
    if (categoryId !== (transaction.category_id ?? null)) next.category_id = categoryId;
    if (excluded !== transaction.excluded_from_budget) next.excluded_from_budget = excluded;
    // 수입으로 바꾸면 서버가 어차피 비운다. 여기서도 안 보내 두 곳이 같은 말을 하게 한다.
    const nextMethod = kind === 'expense' ? method : null;
    if (nextMethod !== transaction.payment_method) next.payment_method = nextMethod;
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
      /*
        저장하고 한참 뒤에 발견한 잘못.

        어느 칸을 고쳤는지와 그 기록이 **어느 방식으로 들어왔는지** 를 함께 남긴다.
        캡처로 들어온 건만 날짜를 자꾸 고친다면 고칠 곳은 화면이 아니라 프롬프트다.
        고친 값 자체는 남기지 않는다.
      */
      analytics.log(EVENTS.recordChanged, {
        action: 'edit',
        fields: Object.keys(body).sort().join(','),
        source: transaction.source,
      });
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
      analytics.log(EVENTS.recordChanged, { action: 'delete', source: transaction.source });
      onClose();
    } catch {
      setFailed(true);
    }
  }

  return (
    <>
      <div className="tx-edit__head">
        <CategoryAvatar {...iconOf(headCategory)} size={58} />
        <p className="tx-edit__title">
          {nameOf(transaction, categories)} · {formatDayLabel(new Date(transaction.occurred_at))}
        </p>
      </div>

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
        <AmountField
          className="tx-edit__field--amount"
          variant="compact"
          label="금액"
          value={amount}
          onChange={setAmount}
        />
      </div>

      {switchable ? (
        <KindToggle
          className="tx-edit__kind"
          value={kind}
          disabled={busy}
          ariaLabel="지출인지 수입인지"
          onChange={(next) => {
            if (next === kind) return;
            setKind(next);
            // 종류를 바꾸면 고른 분류가 그 종류의 것이 아닐 수 있다. 남겨 두면 수입이
            // '식비' 로 저장된다. 원래 종류로 되돌아오면 처음 값을 그대로 되찾는다.
            setCategoryId(
              next === kindOf(transaction.type) ? (transaction.category_id ?? null) : null,
            );
            // 수입에는 결제 수단이 없다. 지출로 되돌아오면 저장돼 있던 값을 되찾는다.
            setMethod(next === 'expense' ? transaction.payment_method : null);
          }}
        />
      ) : null}

      {/* 수입에는 뜻이 없어 아예 안 세운다. 비활성으로 두면 무엇을 잘못했나 싶어진다. */}
      {kind === 'expense' ? (
        <PaymentMethodPicker
          className="tx-edit__pay"
          value={method}
          disabled={busy}
          onChange={setMethod}
        />
      ) : null}

      {creating ? (
        <div className="tx-edit__new-cat">
          <div className="tx-edit__new-cat-head">
            <span className="tx-edit__new-cat-title">새 분류 만들기</span>
            <button
              type="button"
              className="tx-edit__new-cat-back"
              disabled={creatingBusy}
              onClick={() => setCreating(false)}
            >
              고치기로 돌아가기
            </button>
          </div>
          <CategoryEditForm
            // 종류는 위 토글이 이미 정했다. 여기서 다시 묻지 않는다.
            fixedKind={kind}
            onBusyChange={setCreatingBusy}
            onClose={() => setCreating(false)}
            // 만들자마자 이 기록의 분류로 둔다. 다시 찾아 누르게 하면 만든 보람이 없다.
            onCreated={(created) => {
              setCategoryId(created.id);
              setCreating(false);
            }}
          />
        </div>
      ) : (
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
              <CategoryAvatar {...iconOf(category)} size={40} />
              {category.name}
            </button>
          ))}
          <button
            type="button"
            className="tx-edit__cat tx-edit__cat--new"
            onClick={() => setCreating(true)}
          >
            <span className="tx-edit__cat-mark" aria-hidden="true">
              ＋
            </span>
            새 분류
          </button>
        </div>
      )}

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

      {!amountOk ? <p className="tx-edit__hint">금액은 1원부터 넣을 수 있어요</p> : null}

      {failed ? (
        <p className="tx-edit__notice" role="alert">
          고친 것을 저장하지 못했어요. 입력한 값은 그대로 있어요.
        </p>
      ) : null}

      <div className="tx-edit__actions">
        <Button variant="outline" onClick={() => void destroy()} disabled={busy || creating}>
          삭제
        </Button>
        <Button
          variant="primarySmall"
          className="tx-edit__done"
          onClick={() => void submit()}
          disabled={busy || creating || !amountOk}
        >
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
