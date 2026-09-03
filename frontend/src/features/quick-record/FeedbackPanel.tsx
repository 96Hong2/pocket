import { useState } from 'react';

import {
  ApiError,
  parseDecimalOr,
  useUndoTransaction,
  useUpdateTransaction,
  type CategoryOut,
  type FeedbackOut,
  type TransactionOut,
  type TransactionUpdated,
} from '../../shared/api';
import { Button, toIconName, TransactionRow } from '../../shared/ui';

import { CategoryChips } from './CategoryChips';
import { buildFeedbackMessage } from './feedbackMessage';
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

/** 저장 결과와 그에 대한 한마디. 되돌리기와 카테고리 다시 고르기가 여기 붙는다. */
export function FeedbackPanel({
  transaction,
  feedback,
  categories,
  deadline,
  onUndone,
  onUpdated,
  onConfirm,
}: FeedbackPanelProps) {
  const [changing, setChanging] = useState(false);
  const undo = useUndoTransaction();
  const update = useUpdateTransaction();
  const remaining = useUndoCountdown(deadline);

  const category = categories.find((item) => item.id === transaction.category_id);
  const overName = categories.find((item) => item.id === feedback.over_category_id)?.name;
  const message = buildFeedbackMessage(feedback, { overCategoryName: overName });

  const undoError = undo.error instanceof ApiError ? undo.error : null;
  // 만료는 실수가 아니라 시간이 지난 것이다. 다시 눌러도 같은 답이 오므로 버튼을 거둔다.
  const expired = undoError?.code === 'UNDO_EXPIRED';
  const updateError = update.error instanceof ApiError ? update.error : null;

  return (
    <div className="feedback">
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
        amount={parseDecimalOr(transaction.amount, 0)}
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
      >
        {message.badge ? <span className="feedback__badge">{message.badge}</span> : null}
        <p className="feedback__headline" data-numeric="">
          {message.headline}
        </p>
        {message.detail ? (
          <p className="feedback__detail" data-numeric="">
            {message.detail}
          </p>
        ) : null}
      </div>

      {changing ? (
        <div className="feedback__change">
          <p className="feedback__change-title">어디에 넣을까요?</p>
          <CategoryChips
            categories={categories}
            disabled={update.isPending}
            selectedId={transaction.category_id}
            onPick={(picked) =>
              update.mutate(
                { id: transaction.id, body: { category_id: picked.id } },
                {
                  onSuccess: (updated) => {
                    onUpdated(updated);
                    setChanging(false);
                  },
                },
              )
            }
          />
          {updateError ? (
            <p className="feedback__notice" role="alert">
              {updateError.message}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="feedback__actions">
        <Button variant="outline" onClick={() => setChanging((open) => !open)}>
          카테고리 바꾸기
        </Button>
        <Button variant="primarySmall" onClick={onConfirm}>
          확인
        </Button>
      </div>
    </div>
  );
}
