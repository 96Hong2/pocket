import { useEffect, useRef, useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { EVENTS, useAnalytics, type FlowId } from '../../shared/analytics';
import {
  ApiError,
  parseDecimalOr,
  useUpdateTransaction,
  type TransactionCreated,
  type TransactionOut,
  type TransactionUpdated,
} from '../../shared/api';
import {
  formatCurrency,
  formatDayLabel,
  formatWeekday,
  toLedgerDate,
} from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import { Button, IconTextButton, SavedHero } from '../../shared/ui';
import { formatQuantity, formatSignedWon, type Holding } from '../assets';

import { rateText } from './saveInvest';

/** 저장, 고치기 응답의 자산 블록. */
export type SavedAssetResult = NonNullable<TransactionCreated['asset']>;

/** 저장 뒤 화면이 말할 항목. 이름과 단위는 저장할 때 고른 「어디에」 에서 온다. */
export interface SavedAssetInfo {
  result: SavedAssetResult;
  name: string;
  holding: Holding;
  unit: string;
}

const MEMO_MAX = 200;

export interface SavedAssetPanelProps {
  flowId: FlowId;
  transaction: TransactionOut;
  asset: SavedAssetInfo;
  onUpdated: (updated: TransactionUpdated) => void;
  onConfirm: () => void;
  /** 「자산 보기」. 시트를 닫고 자산 화면으로 간다. 이미 자산 화면에서 열었으면 안 넘겨 단추가 없다. */
  onAssets?: () => void;
  backRef?: { current: () => void };
}

/** `2주`, `0.003개`. */
function quantityText(quantity: string | null | undefined, unit: string): string {
  return `${formatQuantity(quantity)}${unit}`;
}

/**
 * 저축·투자 저장 뒤 화면. 어디에 얼마를 넣었는지(팔았으면 받은 돈과 수익)를 가장 크게 말한다.
 * 이체라서 홈의 남은 돈과 쓴 돈은 안 움직인다. 결제 수단과 태그는 없다.
 */
export function SavedAssetPanel({
  flowId,
  transaction,
  asset,
  onUpdated,
  onConfirm,
  onAssets,
  backRef,
}: SavedAssetPanelProps) {
  const analytics = useAnalytics();
  const panelRef = useRef<HTMLDivElement>(null);
  const update = useUpdateTransaction();
  const [memo, setMemo] = useState(transaction.memo ?? '');
  const [memoOpen, setMemoOpen] = useState(Boolean(transaction.memo));
  const sentMemo = useRef<string | null>(null);
  const closeAfterUpdate = useRef(false);

  const { result, name, holding, unit } = asset;
  const lot = holding === 'quantity';
  const sold = transaction.asset_side === 'sell';
  const amount = formatCurrency(parseDecimalOr(transaction.amount, 0));
  const savedDay = toLedgerDate(new Date(transaction.occurred_at));
  const dayLabel = `${formatDayLabel(savedDay)} (${formatWeekday(savedDay)})`;
  const itemAmount = formatCurrency(parseDecimalOr(result.item_amount, 0));
  const held = parseDecimalOr(result.quantity, 0) > 0;
  const updateError = update.error instanceof ApiError ? update.error : null;

  const title = sold
    ? `${name}${lot && transaction.asset_quantity != null ? ` ${quantityText(transaction.asset_quantity, unit)}` : ''} 팔았어요`
    : `${name}에 ${amount} 넣었어요`;

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  /** 메모를 보낸다. 바뀐 것이 없으면 아무 요청도 안 한다. 돌려주는 값은 닫기를 요청에 맡겼는지다. */
  function flushMemo(closeOnSuccess = false): boolean {
    const trimmed = memo.trim();
    if (trimmed === (transaction.memo ?? '')) return false;
    const alreadySent = update.isPending && sentMemo.current === trimmed;
    if (closeOnSuccess) closeAfterUpdate.current = true;
    if (alreadySent) return true;
    sentMemo.current = trimmed;
    analytics.log(
      EVENTS.recordChanged,
      { action: 'edit', field: 'memo', method: 'keypad' },
      { flowId },
    );
    update.mutate(
      { id: transaction.id, body: { memo: trimmed === '' ? null : trimmed } },
      {
        onSuccess: (updated) => {
          onUpdated(updated);
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
    return true;
  }

  function confirm(): void {
    analytics.log(EVENTS.feedbackAction, { action: 'confirm' }, { flowId, kind: 'click' });
    if (flushMemo(true)) return;
    onConfirm();
  }

  function openAssets(): void {
    analytics.log(EVENTS.feedbackAction, { action: 'assets' }, { flowId, kind: 'click' });
    // 적어 둔 메모는 보내 두고 간다. 응답은 기다리지 않는다.
    flushMemo();
    onAssets?.();
  }

  function openMemo(): void {
    analytics.log(
      EVENTS.feedbackAction,
      { action: 'more', field: 'memo' },
      { flowId, kind: 'click' },
    );
    setMemoOpen(true);
  }

  // 폰 뒤로가기와 토스 위 ‹ 도 확인과 같다. 적어 둔 메모를 버리지 않는다.
  useOverlayBackClose(true, confirm);
  useEffect(() => {
    if (backRef != null) backRef.current = confirm;
  });

  return (
    <div className="feedback saved-asset" ref={panelRef} tabIndex={-1}>
      <SavedHero title={title} testId={TEST_IDS.feedbackHeadline} />
      <p className="saved-asset__sub" data-numeric="">
        {sold ? `받은 돈 ${amount}` : dayLabel}
      </p>

      <dl className="saved-asset__rows">
        {sold ? (
          <>
            {/* 넣은 돈을 모르고 팔았으면 수익 줄이 없다. 받은 돈만 적힌다. */}
            {result.realized == null ? null : (
              <div
                className="saved-asset__row"
                data-testid={TEST_IDS.savedAssetRow}
                data-row="gain"
              >
                <dt>수익</dt>
                <dd
                  className={
                    parseDecimalOr(result.realized, 0) >= 0
                      ? 'saved-asset__value saved-asset__value--up'
                      : 'saved-asset__value saved-asset__value--down'
                  }
                  data-numeric=""
                >
                  {formatSignedWon(parseDecimalOr(result.realized, 0))}
                  {result.rate == null ? '' : ` (${rateText(result.rate)})`}
                </dd>
              </div>
            )}
            <div className="saved-asset__row" data-testid={TEST_IDS.savedAssetRow} data-row="left">
              <dt>{lot ? '남은 수량' : '남은 금액'}</dt>
              <dd className="saved-asset__value" data-numeric="">
                {lot ? (held ? quantityText(result.quantity, unit) : '없음') : itemAmount}
              </dd>
            </div>
          </>
        ) : (
          <>
            <div className="saved-asset__row" data-testid={TEST_IDS.savedAssetRow} data-row="saved">
              <dt>이번 달 모은 돈</dt>
              <dd className="saved-asset__value" data-numeric="">
                {formatCurrency(parseDecimalOr(result.month_saved, 0))}
              </dd>
            </div>
            <div className="saved-asset__row" data-testid={TEST_IDS.savedAssetRow} data-row="item">
              <dt className="saved-asset__name">{name}</dt>
              <dd className="saved-asset__value" data-numeric="">
                {lot && held ? `${quantityText(result.quantity, unit)}, ` : ''}
                {itemAmount}
              </dd>
            </div>
          </>
        )}
      </dl>

      {memoOpen ? (
        <label className="feedback__merchant-field">
          <span className="feedback__merchant-label">메모</span>
          <input
            className="feedback__merchant"
            data-testid={TEST_IDS.feedbackMemoField}
            type="text"
            value={memo}
            maxLength={MEMO_MAX}
            placeholder="남겨 두고 싶은 한마디"
            autoComplete="off"
            autoFocus={!transaction.memo}
            disabled={update.isPending}
            onChange={(event) => setMemo(event.target.value)}
            onBlur={() => flushMemo()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
        </label>
      ) : (
        <div className="pk-icon-text-row">
          <IconTextButton icon="memo" onClick={openMemo}>
            메모 남기기
          </IconTextButton>
        </div>
      )}

      {updateError ? (
        <p className="feedback__notice" role="alert">
          {updateError.message}
        </p>
      ) : null}

      <div className="saved-asset__actions">
        {onAssets == null ? null : (
          <Button variant="outline" onClick={openAssets}>
            자산 보기
          </Button>
        )}
        <Button className="saved-asset__confirm" onClick={confirm}>
          확인
        </Button>
      </div>
    </div>
  );
}
