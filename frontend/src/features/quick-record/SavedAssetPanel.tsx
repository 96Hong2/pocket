import { useEffect, useRef, useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { EVENTS, useAnalytics, type FlowId } from '../../shared/analytics';
import {
  ApiError,
  parseDecimalOr,
  useUpdateTransaction,
  type TransactionCreated,
  type TransactionOut,
  type TransactionUpdate,
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
import {
  ProceedsDestPage,
  ProceedsDestRow,
  accountNameOf,
  proceedsAccountsOf,
  proceedsBodyOf,
  proceedsNameOf,
  proceedsResultOf,
  useAssetDestinations,
  type ProceedsChoice,
} from '../asset-dest';
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

/** 서버 문구가 없는 실패(봉투가 아닌 응답 등)에 보일 말. */
const SEND_FAILED = '저장하지 못했어요. 잠시 뒤에 다시 해 주세요.';

/** 요청 하나가 끝났을 때 할 일. 화면이 내려간 뒤에도 불린다. */
interface SendHandlers {
  done: (updated: TransactionUpdated) => void;
  fail: (message: string) => void;
  settled: () => void;
}

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
 *
 * 팔았으면 「받은 돈 넣을 곳」 한 줄이 선다. 안 고르면 받은 돈이 어느 통장에도 안 들어가
 * 순자산이 판 만큼 줄어 보인다. 고르면 그 거래를 고쳐(PATCH) 통장이 받은 돈만큼 오른다(ADR-0049).
 *
 * **이 화면의 고치기(메모, 넣을 곳)는 한 번에 하나씩 차례로 나간다.** 응답마다 그때의 거래와 자산
 * 블록이 통째로 오므로, 둘이 겹쳐 나가면 늦게 온 옛 응답이 방금 넣은 곳을 지운다.
 * 「확인」, 뒤로가기, 「자산 보기」 는 나간 요청이 다 끝난 뒤에 화면을 닫고, 하나라도 실패하면
 * 닫지 않고 그 자리에 까닭을 보인다. 고른 것이 말없이 사라지지 않는다.
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
  // 서버에 보낸(보내는 중인) 메모. 같은 값을 두 번 보내지 않는다.
  const sentMemo = useRef(transaction.memo ?? '');
  const [memoSending, setMemoSending] = useState(false);
  const [memoError, setMemoError] = useState<string | null>(null);
  const { destinations } = useAssetDestinations();
  const [proceedsOpen, setProceedsOpen] = useState(false);
  // 고른 것을 서버가 받는 동안 줄에 먼저 세워 둘 값. 실패하면 서버 값으로 돌아간다.
  const [proceedsSent, setProceedsSent] = useState<ProceedsChoice | null>(null);
  const [proceedsError, setProceedsError] = useState<string | null>(null);
  // 차례로 보내는 줄. 앞 요청이 끝나야 다음이 나간다.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const waiting = useRef(0);
  // 나간 요청이 다 끝난 뒤에 할 일(닫기, 자산 화면으로 가기). 하나라도 실패하면 버린다.
  const afterIdle = useRef<(() => void) | null>(null);

  const { result, name, holding, unit } = asset;
  const lot = holding === 'quantity';
  const sold = transaction.asset_side === 'sell';
  const amount = formatCurrency(parseDecimalOr(transaction.amount, 0));
  const savedDay = toLedgerDate(new Date(transaction.occurred_at));
  const dayLabel = `${formatDayLabel(savedDay)} (${formatWeekday(savedDay)})`;
  const itemAmount = formatCurrency(parseDecimalOr(result.item_amount, 0));
  const held = parseDecimalOr(result.quantity, 0) > 0;
  const proceedsSending = proceedsSent != null;
  const proceedsSaved =
    result.proceeds_key == null
      ? null
      : accountNameOf({ group: 'cash', label: result.proceeds_label ?? null });
  const proceedsName = proceedsSent != null ? proceedsNameOf(proceedsSent) : proceedsSaved;

  const title = sold
    ? `${name}${lot && transaction.asset_quantity != null ? ` ${quantityText(transaction.asset_quantity, unit)}` : ''} 팔았어요`
    : `${name}에 ${amount} 넣었어요`;

  useEffect(() => {
    panelRef.current?.focus();
    // 화면이 다른 길(손잡이, 바깥 누름)로 먼저 닫혔으면 미뤄 둔 닫기와 자산 화면 가기는 버린다.
    return () => {
      afterIdle.current = null;
    };
  }, []);

  /**
   * 고치기 하나를 줄 끝에 세운다. 앞 요청이 끝난 뒤에 나간다.
   *
   * 끝났을 때 할 일은 요청의 약속에 걸어 둔다. 화면이 먼저 내려가도 불려서,
   * 「서버에 저장된 순간」 의 로그가 빠지지 않는다.
   */
  function send(body: TransactionUpdate, handlers: SendHandlers): void {
    waiting.current += 1;
    queue.current = queue.current.then(async () => {
      try {
        handlers.done(await update.mutateAsync({ id: transaction.id, body }));
      } catch (error) {
        // 실패하면 닫지 않는다. 사람이 까닭을 보고 다시 고르거나 그대로 닫는다.
        afterIdle.current = null;
        handlers.fail(error instanceof ApiError ? error.message : SEND_FAILED);
      } finally {
        handlers.settled();
        waiting.current -= 1;
        if (waiting.current === 0) {
          const next = afterIdle.current;
          afterIdle.current = null;
          next?.();
        }
      }
    });
  }

  /** 나간 요청이 없으면 바로, 있으면 다 끝난 뒤에 한다. */
  function whenIdle(action: () => void): void {
    if (waiting.current === 0) {
      action();
      return;
    }
    afterIdle.current = action;
  }

  /** 메모를 보낸다. 보낸 값과 같으면 아무 요청도 안 한다. */
  function flushMemo(): void {
    const trimmed = memo.trim();
    const before = sentMemo.current;
    if (trimmed === before) return;
    sentMemo.current = trimmed;
    setMemoError(null);
    setMemoSending(true);
    analytics.log(
      EVENTS.recordChanged,
      { action: 'edit', field: 'memo', method: 'keypad' },
      { flowId },
    );
    send(
      { memo: trimmed === '' ? null : trimmed },
      {
        done: onUpdated,
        fail: (message) => {
          // 다시 벗어나면 한 번 더 보낼 수 있게 돌려 둔다.
          sentMemo.current = before;
          setMemoError(message);
        },
        settled: () => setMemoSending(false),
      },
    );
  }

  function confirm(): void {
    analytics.log(EVENTS.feedbackAction, { action: 'confirm' }, { flowId, kind: 'click' });
    flushMemo();
    whenIdle(onConfirm);
  }

  function openAssets(): void {
    analytics.log(EVENTS.feedbackAction, { action: 'assets' }, { flowId, kind: 'click' });
    flushMemo();
    // 넣을 곳이 저장된 뒤에 넘어가야 자산 화면의 통장 금액이 맞다.
    if (onAssets != null) whenIdle(onAssets);
  }

  function openProceeds(): void {
    analytics.log(EVENTS.feedbackAction, { action: 'proceeds' }, { flowId, kind: 'click' });
    setProceedsOpen(true);
  }

  /** 창에서 고른 것을 그 거래의 고치기로 보낸다. 지금 값과 같으면 아무 요청도 안 한다. */
  function chooseProceeds(choice: ProceedsChoice): void {
    setProceedsOpen(false);
    const saved = result.proceeds_key ?? null;
    if (choice.type === 'item' && choice.itemKey === saved) return;
    if (choice.type === 'none' && saved == null) return;
    setProceedsSent(choice);
    setProceedsError(null);
    send(proceedsBodyOf(choice), {
      done: (updated) => {
        onUpdated(updated);
        // 이름과 금액은 싣지 않는다.
        analytics.log(
          EVENTS.feedbackAction,
          { action: 'proceeds_result', result: proceedsResultOf(choice) },
          { flowId },
        );
      },
      fail: setProceedsError,
      settled: () => setProceedsSent(null),
    });
  }

  function openMemo(): void {
    analytics.log(
      EVENTS.feedbackAction,
      { action: 'more', field: 'memo' },
      { flowId, kind: 'click' },
    );
    setMemoOpen(true);
  }

  // 폰 뒤로가기와 토스 위 ‹ 도 확인과 같다. 적어 둔 메모와 고른 넣을 곳을 버리지 않는다.
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

      <div className="saved-asset__rows">
        <dl className="saved-asset__list">
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
              <div
                className="saved-asset__row"
                data-testid={TEST_IDS.savedAssetRow}
                data-row="left"
              >
                <dt>{lot ? '남은 수량' : '남은 금액'}</dt>
                <dd className="saved-asset__value" data-numeric="">
                  {lot ? (held ? quantityText(result.quantity, unit) : '없음') : itemAmount}
                </dd>
              </div>
            </>
          ) : (
            <>
              <div
                className="saved-asset__row"
                data-testid={TEST_IDS.savedAssetRow}
                data-row="saved"
              >
                <dt>이번 달 모은 돈</dt>
                <dd className="saved-asset__value" data-numeric="">
                  {formatCurrency(parseDecimalOr(result.month_saved, 0))}
                </dd>
              </div>
              <div
                className="saved-asset__row"
                data-testid={TEST_IDS.savedAssetRow}
                data-row="item"
              >
                <dt className="saved-asset__name">{name}</dt>
                <dd className="saved-asset__value" data-numeric="">
                  {lot && held ? `${quantityText(result.quantity, unit)}, ` : ''}
                  {itemAmount}
                </dd>
              </div>
            </>
          )}
        </dl>
        {sold ? (
          <ProceedsDestRow
            className="saved-asset__proceeds"
            name={proceedsName}
            busy={proceedsSending}
            onOpen={openProceeds}
          />
        ) : null}
      </div>

      {/* 넣을 곳을 못 넣은 까닭. 그 줄이 든 카드 바로 아래에 둔다. 메모 아래에 두면 메모가 실패한 것으로 읽힌다. */}
      {proceedsError != null ? (
        <p
          className="feedback__notice saved-asset__proceeds-error"
          role="alert"
          data-testid={TEST_IDS.savedAssetProceedsError}
        >
          {proceedsError}
        </p>
      ) : null}

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
            disabled={memoSending}
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

      {memoError != null ? (
        <p className="feedback__notice" role="alert">
          {memoError}
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

      {/* 고르는 창. 뒤로가기는 이 창만 닫고 저장 뒤 화면으로 돌아온다. */}
      <ProceedsDestPage
        open={sold && proceedsOpen}
        accounts={proceedsAccountsOf(destinations, transaction.asset_item_key)}
        pickedKey={result.proceeds_key ?? null}
        hasValue={result.proceeds_key != null}
        onChoose={chooseProceeds}
        onBack={() => setProceedsOpen(false)}
      />
    </div>
  );
}
