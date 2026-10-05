import { useEffect, useRef, useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import {
  ApiError,
  parseDecimalOr,
  useUpdateTransaction,
  type CategoryOut,
  type FeedbackOut,
  type PaymentMethod,
  type TransactionOut,
  type TransactionUpdate,
  type TransactionUpdated,
} from '../../shared/api';
import { EVENTS, useAnalytics, type FlowId } from '../../shared/analytics';
import { CategoryPicker, KIND_WORDS, PaymentMethodPicker, kindOf } from '../../shared/ledger';
import {
  formatCurrency,
  formatDayLabel,
  formatWeekday,
  toLedgerDate,
} from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import {
  Button,
  iconOf,
  IconTextButton,
  SavedHero,
  SheetHeader,
  TransactionRow,
} from '../../shared/ui';

import { toAmount } from './digits';
import { buildFeedbackMessage } from './feedbackMessage';
import { AmountDisplay, Keypad } from './Keypad';

interface FeedbackPanelProps {
  /** 이 기록 흐름을 가리키는 값. 저장 뒤 손질까지 한 줄로 잇는다. */
  flowId: FlowId;
  transaction: TransactionOut;
  feedback: FeedbackOut;
  categories: CategoryOut[];
  onUpdated: (updated: TransactionUpdated) => void;
  /**
   * 결제 수단을 고른 그 순간. 서버 응답을 기다리지 않는다.
   *
   * 다음 기록에 조용히 채울 값이라 **고른 것 자체가 뜻**이다. 응답을 기다렸다가 남기면,
   * 고르자마자 확인을 눌러 시트가 닫힌 경우 그 값을 잃는다(요청은 이미 나갔는데도).
   */
  onMethodPicked: (method: PaymentMethod | null) => void;
  onConfirm: () => void;
  /** 시트가 받은 Esc 를 이 화면의 ‹ 와 같은 길로 보내려고 건다. */
  backRef?: { current: () => void };
  /** 맨 위 큰 한 줄. 어디에 적혔는지 말한다. */
  label?: string;
}

/**
 * 지금 펼쳐 둔 고치기. 한 번에 하나만 편다.
 *
 * 둘을 함께 펼치면 시트가 길어져 확인 버튼이 화면 밖으로 밀린다.
 */
type Editing = 'amount' | 'category' | null;

/** 마지막으로 보낸 고치기가 어느 칸이었나. 오류를 그 칸 아래에 붙이려면 알아야 한다. */
type UpdateTarget = 'amount' | 'category' | 'merchant' | 'memo' | 'payment_method';

/** 상호는 서버가 120자까지 받는다. 화면에서 먼저 막아 422 를 왕복하지 않는다. */
const MERCHANT_MAX = 120;

/** 메모는 200자까지다. 상호와 같은 이유로 여기서 먼저 막는다. */
const MEMO_MAX = 200;

/**
 * 저장 뒤 화면. 어디에 적었나, 무엇을 적었나, 예산을 넘었으면 그 한 줄.
 *
 * 줄을 누르면 분류를, 금액을 누르면 금액을 고친다. 어디서와 메모는 안 적어도 되는 칸이라
 * 아이콘 줄을 눌러야 펼쳐진다. ‹ 와 뒤로가기는 확인과 같은 길을 탄다(적어 둔 칸을 보내고 닫는다).
 */
export function FeedbackPanel({
  flowId,
  transaction,
  feedback,
  categories,
  onUpdated,
  onMethodPicked,
  onConfirm,
  backRef,
  label = '내 가계부에 적었어요',
}: FeedbackPanelProps) {
  const analytics = useAnalytics();
  const panelRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [digits, setDigits] = useState('');
  const [merchant, setMerchant] = useState(transaction.merchant ?? '');
  const [memo, setMemo] = useState(transaction.memo ?? '');
  const [target, setTarget] = useState<UpdateTarget | null>(null);
  // 상호 칸이 마지막으로 보낸 값. 응답이 오기 전에는 transaction.merchant 로는 비교가 안 된다.
  const sentMerchant = useRef<string | null>(null);
  const sentMemo = useRef<string | null>(null);
  // 확인을 눌러 만든 요청인지. 성공하면 그때 닫고, 실패하면 닫지 않는다.
  const closeAfterUpdate = useRef(false);
  const update = useUpdateTransaction();
  // 이미 값이 있는 칸은 펼친 채로 연다. 적힌 것이 숨어 있으면 안 적힌 줄로 안다.
  const [merchantOpen, setMerchantOpen] = useState(Boolean(transaction.merchant));
  const [memoOpen, setMemoOpen] = useState(Boolean(transaction.memo));

  const category = categories.find((item) => item.id === transaction.category_id);
  const overName = categories.find((item) => item.id === feedback.over_category_id)?.name;

  const savedAmount = parseDecimalOr(transaction.amount, 0);
  const kind = kindOf(transaction.type);
  const isTransfer = transaction.type === 'transfer';
  const savedDay = toLedgerDate(new Date(transaction.occurred_at));
  const dayLabel = `${formatDayLabel(savedDay)} (${formatWeekday(savedDay)})`;
  const message = buildFeedbackMessage(feedback, {
    overCategoryName: overName,
    savedIncome: kind === 'income' ? savedAmount : undefined,
  });
  const nextAmount = toAmount(digits);
  // 저장이 0원을 막으니 고치기도 같다. 키패드를 다 지우면 0원이고, 그대로 보내면 서버가 되돌려보낸다.
  const amountOk = nextAmount > 0;

  const updateError = update.error instanceof ApiError ? update.error : null;

  // 저장하면 방금 누른 칩이 사라지면서 포커스가 시트 밖으로 떨어진다. 여기서 다시 잡는다.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // 저장 뒤에 무슨 말을 건넸나. 문구가 아니라 종류만 남긴다.
  useEffect(() => {
    analytics.log(
      EVENTS.feedbackShown,
      {
        feedback_kind: feedback.kind,
        has_budget: feedback.remaining_budget != null,
        book: 'mine',
      },
      { flowId, kind: 'impression' },
    );
    // 저장 한 건에 한 번이다. 금액을 고쳐 피드백이 다시 와도 같은 저장이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 고친 것을 서버에 보낸다. 성공하면 펼친 것을 접는다. 실패하면 펼친 채로 이유를 보여준다.
   *
   * 확인이 만든 요청이면 성공한 뒤에 시트를 닫는다. 실패했는데 닫아 버리면 방금 적은 것이
   * 저장되지 않은 사실을 아무도 모른다.
   */
  function apply(next: UpdateTarget, body: TransactionUpdate): void {
    setTarget(next);
    // 저장하고 나서 바로 발견한 잘못. 어느 칸인지만 남긴다.
    analytics.log(
      EVENTS.recordChanged,
      { action: 'edit', field: next, method: 'keypad' },
      { flowId },
    );
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

  /**
   * 메모를 보낸다. 상호와 같은 규칙이고 보내는 칸만 다르다.
   *
   * 두 칸을 한 요청에 묶지 않는다. 상호만 고치고 메모는 그대로인 경우가 훨씬 흔한데,
   * 묶으면 안 건드린 칸까지 매번 실어 보내게 되고 오류도 어느 칸 것인지 못 가른다.
   */
  function flushMemo(closeOnSuccess = false): boolean {
    const trimmed = memo.trim();
    if (trimmed === (transaction.memo ?? '')) return false;

    const alreadySent = update.isPending && sentMemo.current === trimmed;
    if (closeOnSuccess) closeAfterUpdate.current = true;
    if (alreadySent) return true;

    sentMemo.current = trimmed;
    apply('memo', { memo: trimmed === '' ? null : trimmed });
    return true;
  }

  /** 무엇으로 냈는지 고친다. 상호와 달리 누르는 즉시 보낸다. 되돌릴 것이 한 칸뿐이다. */
  function changeMethod(next: PaymentMethod | null): void {
    if (next === transaction.payment_method) return;
    onMethodPicked(next);
    apply('payment_method', { payment_method: next });
  }

  function confirm(): void {
    analytics.log(EVENTS.feedbackAction, { action: 'confirm' }, { flowId, kind: 'click' });
    // 두 칸 다 고쳤으면 상호를 먼저 보내고 닫기는 그쪽에 맡긴다. 메모는 그 뒤에 따라간다.
    const merchantSent = flushMerchant(true);
    const memoSent = flushMemo(!merchantSent);
    if (merchantSent || memoSent) return;
    onConfirm();
  }

  // 폰 뒤로가기와 토스 위 ‹ 도 확인과 같다. 적어 둔 상호와 메모를 버리지 않는다.
  useOverlayBackClose(true, confirm);
  useEffect(() => {
    if (backRef != null) backRef.current = confirm;
  });

  /** 안 적어도 되는 칸을 펼친다. 펼친 칸이 무엇이었는지만 남긴다. */
  function openField(field: 'merchant' | 'memo'): void {
    analytics.log(EVENTS.feedbackAction, { action: 'more', field }, { flowId, kind: 'click' });
    if (field === 'merchant') setMerchantOpen(true);
    else setMemoOpen(true);
  }

  return (
    <div className="feedback" ref={panelRef} tabIndex={-1}>
      <SheetHeader onBack={confirm} />
      <SavedHero title={label} testId={TEST_IDS.feedbackHeadline} />

      {/*
        **되돌리기는 없앴다.** 서버에서 하는 일이 삭제와 똑같은데(둘 다 `deleted_at` 만
        찍는다) 이름이 달라, 무엇을 되돌린다는 것인지 읽어 낼 수가 없었다.
        잘못 적었으면 줄을 눌러 금액과 분류를 고치고, 통째로 지울 일은 기록을 눌러서 지운다.

        분류의 그림을 그리는 자리는 전부 `iconOf` 를 편다. 직접 건 이모지와 사진까지 그린다.
      */}
      <TransactionRow
        {...iconOf(category)}
        title={transaction.merchant ?? category?.name ?? '기록'}
        subtitle={transaction.merchant ? `${category?.name ?? '기록'}, ${dayLabel}` : dayLabel}
        amount={savedAmount}
        tone={transaction.type}
        avatarSize={50}
        hideDivider
        onClick={toggleCategory}
        onAmountClick={toggleAmount}
        clickLabel={`${category?.name ?? '분류'} · 카테고리 바꾸기`}
        amountClickLabel={`${formatCurrency(savedAmount)} · 금액 바꾸기`}
      />

      {/* 예산을 넘었을 때만 선다. 남은 예산은 말하지 않는다(홈이 늘 들고 있다). */}
      {message != null ? (
        <div className="feedback__card feedback__card--caution" role="status">
          <span className="feedback__badge">{message.badge}</span>
          <p data-testid={TEST_IDS.feedbackDetail} className="feedback__headline" data-numeric="">
            {message.headline}
          </p>
        </div>
      ) : null}

      {editing === 'amount' ? (
        <div className="feedback__change">
          <p className="feedback__change-title">얼마로 고칠까요?</p>
          <AmountDisplay digits={digits} />
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
          <CategoryPicker
            categories={categories}
            disabled={update.isPending}
            selectedId={transaction.category_id}
            onPick={(picked) => apply('category', { category_id: picked.id })}
            onExpand={() =>
              analytics.log(
                EVENTS.categoryMoreOpened,
                { where: 'feedback', shown: categories.length },
                { flowId, kind: 'click' },
              )
            }
          />
        </div>
      ) : null}

      {/*
        무엇으로 냈나. **저장이 끝난 다음에 묻는다.** 적는 화면에 칸이 하나 더 서면 10초
        약속이 깨진다. 지난번 값으로 조용히 저장해 두고 여기서 보여 준다. 수입과 이체에는
        뜻이 없어 안 세운다.
      */}
      {kind === 'expense' && !isTransfer ? (
        <PaymentMethodPicker
          className="feedback__pay"
          value={transaction.payment_method}
          disabled={update.isPending}
          onChange={changeMethod}
        />
      ) : null}

      {target === 'payment_method' && updateError ? (
        <p className="feedback__notice" role="alert">
          {updateError.message}
        </p>
      ) : null}

      {/*
        상호와 메모는 **다른 칸**이다. 상호는 「어디서」 고 메모는 「무엇을, 왜」 다.
        안 적어도 되는 칸이라 누른 사람에게만 그 자리에서 펼친다. 이체에는 상호가 없다.
      */}
      {merchantOpen && !isTransfer ? (
        <label className="feedback__merchant-field">
          <span className="feedback__merchant-label">{KIND_WORDS[kind].where}</span>
          <input
            className="feedback__merchant"
            data-testid={TEST_IDS.feedbackMerchantField}
            type="text"
            value={merchant}
            maxLength={MERCHANT_MAX}
            placeholder={KIND_WORDS[kind].wherePlaceholder}
            autoComplete="off"
            // 누른 사람만 펼친다. 펼치자마자 적을 수 있게 칸을 잡는다.
            autoFocus={!transaction.merchant}
            disabled={update.isPending}
            onChange={(event) => setMerchant(event.target.value)}
            onBlur={() => flushMerchant()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
        </label>
      ) : null}

      {/* 상호 저장이 실패한 것은 이 칸 아래에 붙인다. 아래 오류 줄은 펼쳐 둔 칸 것만 말한다. */}
      {target === 'merchant' && updateError ? (
        <p className="feedback__notice" role="alert">
          {updateError.message}
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
            disabled={update.isPending}
            onChange={(event) => setMemo(event.target.value)}
            onBlur={() => flushMemo()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
        </label>
      ) : null}

      {target === 'memo' && updateError ? (
        <p className="feedback__notice" role="alert">
          {updateError.message}
        </p>
      ) : null}

      {(merchantOpen || isTransfer) && memoOpen ? null : (
        <div className="pk-icon-text-row">
          {merchantOpen || isTransfer ? null : (
            <IconTextButton icon="place" onClick={() => openField('merchant')}>
              {kind === 'income' ? '어디서 받았나요' : '어디서 썼나요'}
            </IconTextButton>
          )}
          {memoOpen ? null : (
            <IconTextButton icon="memo" onClick={() => openField('memo')}>
              메모 남기기
            </IconTextButton>
          )}
        </div>
      )}

      {editing !== null && target !== 'merchant' && updateError ? (
        <p className="feedback__notice" role="alert">
          {updateError.message}
        </p>
      ) : null}

      <Button className="feedback__confirm" variant="primarySmall" fullWidth onClick={confirm}>
        확인
      </Button>
    </div>
  );
}
