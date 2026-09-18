import { useEffect, useRef, useState } from 'react';

import {
  ApiError,
  parseDecimalOr,
  useTags,
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
import { formatCurrency } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import { Button, iconOf, TransactionRow } from '../../shared/ui';
import { TagPicker } from '../tags';

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
}

/**
 * 지금 펼쳐 둔 고치기. 한 번에 하나만 편다.
 *
 * 둘을 함께 펼치면 시트가 길어져 확인 버튼이 화면 밖으로 밀린다.
 */
type Editing = 'amount' | 'category' | null;

/** 마지막으로 보낸 고치기가 어느 칸이었나. 오류를 그 칸 아래에 붙이려면 알아야 한다. */
type UpdateTarget = 'amount' | 'category' | 'merchant' | 'memo' | 'payment_method' | 'tag';

/** 상호는 서버가 120자까지 받는다. 화면에서 먼저 막아 422 를 왕복하지 않는다. */
const MERCHANT_MAX = 120;

/** 메모는 200자까지다. 상호와 같은 이유로 여기서 먼저 막는다. */
const MEMO_MAX = 200;

/** 저장 결과와 그에 대한 한마디. 금액·분류 고치기가 그 줄에 그대로 붙는다. */
export function FeedbackPanel({
  flowId,
  transaction,
  feedback,
  categories,
  onUpdated,
  onMethodPicked,
  onConfirm,
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
  const tags = useTags();

  const category = categories.find((item) => item.id === transaction.category_id);
  const overName = categories.find((item) => item.id === feedback.over_category_id)?.name;

  const savedAmount = parseDecimalOr(transaction.amount, 0);
  const kind = kindOf(transaction.type);
  const message = buildFeedbackMessage(feedback, {
    overCategoryName: overName,
    savedIncome: kind === 'income' ? savedAmount : undefined,
  });
  const nextAmount = toAmount(digits);
  // 저장이 0원을 막으니 고치기도 같다. 키패드를 다 지우면 0원이고, 그대로 보내면 서버가 되돌려보낸다.
  const amountOk = nextAmount > 0;

  const updateError = update.error instanceof ApiError ? update.error : null;

  let amountHint = '금액은 1원부터 넣을 수 있어요';
  if (update.isPending) amountHint = '고치는 중이에요';
  else if (amountOk) amountHint = '고치면 홈 숫자도 함께 바뀌어요';

  // 저장하면 방금 누른 칩이 사라지면서 포커스가 시트 밖으로 떨어진다. 여기서 다시 잡는다.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // 저장 뒤에 무슨 말을 건넸나. 문구가 아니라 종류만 남긴다.
  useEffect(() => {
    analytics.log(
      EVENTS.feedbackShown,
      { feedback_kind: feedback.kind, has_budget: feedback.remaining_budget != null },
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

  /** 태그를 달거나 뗀다. 누르는 즉시 보낸다. 되돌릴 것이 한 칸뿐이다. */
  function changeTag(next: string | null): void {
    if (next === (transaction.tag_id ?? null)) return;
    apply('tag', { tag_id: next });
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

  return (
    <div className="feedback" ref={panelRef} tabIndex={-1}>
      {/*
        **되돌리기는 없앴다.** 서버에서 하는 일이 삭제와 똑같은데(둘 다 `deleted_at` 만
        찍는다) 이름이 달라, 무엇을 되돌린다는 것인지 읽어 낼 수가 없었다. 8초 카운트다운도
        단위 없는 숫자 하나라 몇 초인지 몇 건인지 알 수 없었다.
        잘못 적었으면 아래에서 금액·분류를 고치고, 통째로 지울 일은 기록을 눌러서 지운다.

        비운 오른쪽 자리에는 줄을 눌러 고칠 수 있다는 것만 적는다. 줄만 놓아 두면
        누를 수 있다는 신호가 :active 밖에 없어 아무도 안 누른다.
      */}
      <div className="feedback__head">
        <span className="feedback__label">저장했어요</span>
        <span className="feedback__hint">눌러서 고칠 수 있어요</span>
      </div>

      {/*
        직접 건 이모지·사진까지 그린다. 예전에는 `icon_key` 만 넘겨서, 사진이나 이모지를
        걸어 둔 분류로 저장하면 이 줄만 기본 그림으로 나왔다. 목록·칩은 맞고 여기만 틀려서
        「저장은 됐는데 확인 화면이 안 바뀐다」 로 보였다.
        분류의 그림을 그리는 자리는 전부 `iconOf` 를 편다. 두 값을 손으로 옮기지 않는다.
      */}
      <TransactionRow
        {...iconOf(category)}
        title={transaction.merchant ?? category?.name ?? '기록'}
        subtitle={transaction.merchant ? category?.name : undefined}
        amount={savedAmount}
        tone={transaction.type}
        avatarSize={50}
        hideDivider
        onClick={toggleCategory}
        onAmountClick={toggleAmount}
        clickLabel={`${category?.name ?? '분류'} · 카테고리 바꾸기`}
        amountClickLabel={`${formatCurrency(savedAmount)} · 금액 바꾸기`}
      />

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

      {/* 안 적어도 되는 칸이다. 버튼 뒤에 숨기면 적을 수 있다는 것을 모른다. */}
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

      {/*
        상호와 **다른 칸**이다. 상호는 「어디서」 고 메모는 「무엇을·왜」 다.
        같은 스타벅스라도 "팀 커피 쐈다" 는 상호에 적을 말이 아니고, 상호에 적으면
        다음에 같은 가게에서 쓴 것과 묶이지 않는다.

        안 적어도 되는 칸이라 저장이 끝난 다음에 묻는다. 적는 화면에 칸이 하나 더 서면
        10초 약속이 깨진다.
      */}
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
          disabled={update.isPending}
          onChange={(event) => setMemo(event.target.value)}
          onBlur={() => flushMemo()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </label>

      {target === 'memo' && updateError ? (
        <p className="feedback__notice" role="alert">
          {updateError.message}
        </p>
      ) : null}

      {/*
        어느 묶음인가. 이체에는 뜻이 없어 아예 안 세운다(리포트의 어느 조각에도 안 들어간다).
        태그를 하나도 안 만든 사람에게는 만들러 가는 길 한 줄만 보인다.
      */}
      {transaction.type === 'transfer' ? null : (
        <TagPicker
          className="feedback__tags"
          // `kindOf` 가 환불을 지출로 눕혀 준다. 환불은 나갔던 묶음에서 빠지는 돈이다.
          kind={kind}
          tags={tags.data?.items ?? []}
          selectedId={transaction.tag_id ?? null}
          disabled={update.isPending}
          onChange={changeTag}
        />
      )}

      {target === 'tag' && updateError ? (
        <p className="feedback__notice" role="alert">
          {updateError.message}
        </p>
      ) : null}

      {/*
        무엇으로 냈나. **저장이 끝난 다음에 묻는다.**

        적는 화면에 칸이 하나 더 서면 10초 약속이 깨진다. 그래서 지난번 값으로 조용히
        저장해 두고, 무엇으로 적혔는지를 여기서 보여 준다. 눌린 것을 다시 누르면 지워진다.
        「안 골라도 돼요」 같은 말은 붙이지 않는다. 이미 저장이 끝난 화면이라 아무것도 막고
        있지 않고, 한 줄을 더 읽히는 것이 그 자체로 부담이다.

        수입·이체에는 뜻이 없어 아예 안 세운다.
      */}
      {kind === 'expense' ? (
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
