import { useEffect, useRef, useState } from 'react';

import {
  ApiError,
  parseDecimalOr,
  useUndoTransaction,
  useUpdateTransaction,
  type CategoryOut,
  type FeedbackOut,
  type TransactionOut,
  type TransactionUpdate,
  type TransactionUpdated,
} from '../../shared/api';
import { TEST_IDS } from '../../shared/testIds';
import { Button, toIconName, TransactionRow } from '../../shared/ui';

import { CategoryChips } from './CategoryChips';
import { toAmount } from './digits';
import { buildFeedbackMessage } from './feedbackMessage';
import { AmountDisplay, Keypad } from './Keypad';
import { useUndoCountdown } from './useUndoCountdown';

interface FeedbackPanelProps {
  transaction: TransactionOut;
  feedback: FeedbackOut;
  categories: CategoryOut[];
  /** 카운트다운이 끝나는 시각. 모르면 null 이고 그때는 초를 세지 않는다. */
  deadline: number | null;
  onUndone: () => void;
  onUpdated: (updated: TransactionUpdated) => void;
  onConfirm: () => void;
}

/**
 * 지금 펼쳐 둔 고치기. 한 번에 하나만 편다.
 *
 * 둘을 함께 펼치면 시트가 길어져 되돌리기 버튼이 화면 밖으로 밀린다.
 * 되돌릴 시간이 8초뿐이라 그 버튼이 안 보이면 창이 그냥 지나간다.
 */
type Editing = 'amount' | 'category' | null;

/** 마지막으로 보낸 고치기가 어느 칸이었나. 오류를 그 칸 아래에 붙이려면 알아야 한다. */
type UpdateTarget = 'amount' | 'category' | 'merchant';

/** 상호는 서버가 120자까지 받는다. 화면에서 먼저 막아 422 를 왕복하지 않는다. */
const MERCHANT_MAX = 120;

/** 저장 결과와 그에 대한 한마디. 되돌리기와 금액·카테고리 다시 고르기가 여기 붙는다. */
export function FeedbackPanel({
  transaction,
  feedback,
  categories,
  deadline,
  onUndone,
  onUpdated,
  onConfirm,
}: FeedbackPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [digits, setDigits] = useState('');
  const [merchant, setMerchant] = useState(transaction.merchant ?? '');
  const [target, setTarget] = useState<UpdateTarget | null>(null);
  // 상호 칸이 마지막으로 보낸 값. 응답이 오기 전에는 transaction.merchant 로는 비교가 안 된다.
  const sentMerchant = useRef<string | null>(null);
  // 확인을 눌러 만든 요청인지. 성공하면 그때 닫고, 실패하면 닫지 않는다.
  const closeAfterUpdate = useRef(false);
  const undo = useUndoTransaction();
  const update = useUpdateTransaction();
  const remaining = useUndoCountdown(deadline);

  const category = categories.find((item) => item.id === transaction.category_id);
  const overName = categories.find((item) => item.id === feedback.over_category_id)?.name;
  const message = buildFeedbackMessage(feedback, { overCategoryName: overName });

  const savedAmount = parseDecimalOr(transaction.amount, 0);
  const nextAmount = toAmount(digits);
  // 저장이 0원을 막으니 고치기도 같다. 키패드를 다 지우면 0원이고, 그대로 보내면 서버가 되돌려보낸다.
  const amountOk = nextAmount > 0;

  const undoError = undo.error instanceof ApiError ? undo.error : null;
  // 만료는 실수가 아니라 시간이 지난 것이다. 다시 눌러도 같은 답이 오므로 버튼을 거둔다.
  const expired = undoError?.code === 'UNDO_EXPIRED';
  const updateError = update.error instanceof ApiError ? update.error : null;

  let amountHint = '금액은 1원부터 넣을 수 있어요';
  if (update.isPending) amountHint = '고치는 중이에요';
  else if (amountOk) amountHint = '고치면 홈 숫자도 함께 바뀌어요';

  // 저장하면 방금 누른 칩이 사라지면서 포커스가 시트 밖으로 떨어진다. 여기서 다시 잡는다.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  /**
   * 고친 것을 서버에 보낸다. 성공하면 펼친 것을 접는다. 실패하면 펼친 채로 이유를 보여준다.
   *
   * 확인이 만든 요청이면 성공한 뒤에 시트를 닫는다. 실패했는데 닫아 버리면 방금 적은 것이
   * 저장되지 않은 사실을 아무도 모른다.
   */
  function apply(next: UpdateTarget, body: TransactionUpdate): void {
    setTarget(next);
    update.mutate(
      { id: transaction.id, body },
      {
        onSuccess: (updated) => {
          onUpdated(updated);
          setEditing(null);
          if (closeAfterUpdate.current) {
            closeAfterUpdate.current = false;
            onConfirm();
          }
        },
        onError: () => {
          closeAfterUpdate.current = false;
        },
      },
    );
  }

  /**
   * 펼친 것을 바꾸거나 접는다.
   *
   * 여기서 지난 오류를 지운다. 금액 고치기가 실패한 뒤 카테고리를 펴면 아무것도 안 했는데
   * 그 문구가 그대로 따라붙기 때문이다. 두 토글이 같은 일을 하니 한 자리에서 지운다.
   */
  function toggleEditing(target: Exclude<Editing, null>): void {
    update.reset();
    setEditing((current) => (current === target ? null : target));
  }

  function toggleAmount(): void {
    // 펼칠 때마다 지금 저장된 금액에서 시작한다. 지우다 만 숫자가 남아 있으면 안 된다.
    setDigits(String(savedAmount));
    toggleEditing('amount');
  }

  function toggleCategory(): void {
    toggleEditing('category');
  }

  /**
   * 적어 둔 내용을 보낸다. 안 적어도 되고, 지우면 지운 대로 저장한다.
   *
   * 확인을 누를 때와 칸에서 빠져나갈 때 둘 다 여기를 지난다. 바뀐 것이 없으면 아무 요청도
   * 안 한다. 확인을 누르는 클릭이 blur 를 먼저 일으키니, 방금 보낸 값이 아직 돌아오지
   * 않았으면 다시 보내지 않고 그 요청을 기다린다.
   *
   * 돌려주는 값은 닫는 일을 요청 하나에 맡겼는지다.
   */
  function flushMerchant(closeOnSuccess = false): boolean {
    const trimmed = merchant.trim();
    if (trimmed === (transaction.merchant ?? '')) return false;

    const alreadySent = update.isPending && sentMerchant.current === trimmed;
    if (closeOnSuccess) closeAfterUpdate.current = true;
    if (alreadySent) return true;

    sentMerchant.current = trimmed;
    apply('merchant', { merchant: trimmed === '' ? null : trimmed });
    return true;
  }

  function confirm(): void {
    if (flushMerchant(true)) return;
    onConfirm();
  }

  return (
    <div className="feedback" ref={panelRef} tabIndex={-1}>
      <div className="feedback__head">
        <span className="feedback__label">저장했어요</span>
        {expired ? null : (
          <button
            type="button"
            className="feedback__undo"
            aria-label="되돌리기"
            disabled={undo.isPending}
            onClick={() => undo.mutate(transaction.id, { onSuccess: onUndone })}
          >
            <span>되돌리기</span>
            {remaining > 0 ? (
              <span className="feedback__undo-count" data-numeric="" aria-hidden="true">
                {remaining}
              </span>
            ) : null}
          </button>
        )}
      </div>

      <TransactionRow
        icon={toIconName(category?.icon_key)}
        title={transaction.merchant ?? category?.name ?? '기록'}
        subtitle={transaction.merchant ? category?.name : undefined}
        amount={savedAmount}
        tone={transaction.type}
        avatarSize={50}
        hideDivider
      />

      {undoError ? (
        <p className="feedback__notice" role="alert">
          {undoError.message}
          {expired ? ' 카테고리는 아래에서 바꿀 수 있어요.' : ''}
        </p>
      ) : null}

      <div
        className={
          message.tone === 'caution' ? 'feedback__card feedback__card--caution' : 'feedback__card'
        }
        role="status"
      >
        {message.badge ? <span className="feedback__badge">{message.badge}</span> : null}
        <p data-testid={TEST_IDS.feedbackHeadline} className="feedback__headline" data-numeric="">
          {message.headline}
        </p>
        {message.detail ? (
          <p data-testid={TEST_IDS.feedbackDetail} className="feedback__detail" data-numeric="">
            {message.detail}
          </p>
        ) : null}
      </div>

      {editing === 'amount' ? (
        <div className="feedback__change">
          <p className="feedback__change-title">얼마로 고칠까요?</p>
          <AmountDisplay digits={digits} hint={amountHint} />
          <Keypad digits={digits} onChange={setDigits} />
          <Button
            className="feedback__apply"
            fullWidth
            disabled={!amountOk || update.isPending}
            onClick={() => apply('amount', { amount: String(nextAmount) })}
          >
            이 금액으로 고치기
          </Button>
        </div>
      ) : null}

      {editing === 'category' ? (
        <div className="feedback__change">
          <p className="feedback__change-title">어디에 넣을까요?</p>
          <CategoryChips
            categories={categories}
            disabled={update.isPending}
            selectedId={transaction.category_id}
            onPick={(picked) => apply('category', { category_id: picked.id })}
          />
        </div>
      ) : null}

      {/* 안 적어도 되는 칸이다. 버튼 뒤에 숨기면 적을 수 있다는 것을 모른다. */}
      <label className="feedback__merchant-field">
        <span className="feedback__merchant-label">어디에서 썼나요?</span>
        <input
          className="feedback__merchant"
          data-testid={TEST_IDS.feedbackMerchantField}
          type="text"
          value={merchant}
          maxLength={MERCHANT_MAX}
          placeholder="안 적어도 괜찮아요"
          autoComplete="off"
          disabled={update.isPending}
          onChange={(event) => setMerchant(event.target.value)}
          onBlur={() => flushMerchant()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </label>

      {/* 상호 저장이 실패한 것은 이 칸 아래에 붙인다. 아래 오류 줄은 펼쳐 둔 칸 것만 말한다. */}
      {target === 'merchant' && updateError ? (
        <p className="feedback__notice" role="alert">
          {updateError.message}
        </p>
      ) : null}

      {editing !== null && target !== 'merchant' && updateError ? (
        <p className="feedback__notice" role="alert">
          {updateError.message}
        </p>
      ) : null}

      <div className="feedback__actions">
        <Button variant="outline" onClick={toggleAmount}>
          금액 바꾸기
        </Button>
        <Button variant="outline" onClick={toggleCategory}>
          카테고리 바꾸기
        </Button>
      </div>
      <Button className="feedback__confirm" variant="primarySmall" fullWidth onClick={confirm}>
        확인
      </Button>
    </div>
  );
}
