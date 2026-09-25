import { useEffect, useId, useRef, useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import {
  parseDecimalOr,
  useDeleteTransaction,
  useTags,
  useUpdateTransaction,
  type CategoryOut,
  type MonthParams,
  type PaymentMethod,
  type TransactionOut,
  type TransactionUpdate,
} from '../../shared/api';
import {
  CategoryPicker,
  FutureDayConfirm,
  KindToggle,
  PaymentMethodPicker,
  categoriesOfKind,
  kindOf,
  type LedgerKind,
} from '../../shared/ledger';
import {
  formatDayLabel,
  isFutureDay,
  shiftMonth,
  toLedgerDate,
  toLedgerNoonIso,
} from '../../shared/lib/format';
import { DAY_MAX } from '../../shared/lib/limits';
import {
  AmountField,
  BottomSheet,
  Button,
  CategoryAvatar,
  LeaveConfirm,
  Toggle,
  iconOf,
} from '../../shared/ui';

import { CategoryComposeOverlay } from '../categories';
import { TagPicker } from '../tags';

/** 얼마나 옛날까지 옮길 수 있나. 달력 화면과 같게 3년이다. */
const MONTHS_BACK = 36;

function oldestDay(): string {
  return `${shiftMonth(todayIso().slice(0, 7), -MONTHS_BACK)}-01`;
}

function todayIso(): string {
  return toLedgerDate(new Date());
}

/**
 * 수정 시트. 날짜·상호·금액·카테고리·예산 제외를 한 화면에서 고친다.
 *
 * 저장은 `PATCH /transactions/{id}` 하나로 끝낸다. 보낸 필드만 고치는 규칙이라
 * 바뀐 것만 실어 보낸다. 아무것도 안 바뀌었으면 요청을 보내지 않는다.
 *
 * 통째로 지우는 길은 여기 하나다. 저장 직후 화면에는 고치기만 있고 지우기는 없다.
 * **지우기는 한 번 묻는다.** 되돌릴 수 없는 유일한 동작이라 잘못 눌렀을 때 치르는 값이 크다.
 */
export interface EditSheetProps {
  transaction: TransactionOut | null;
  categories: CategoryOut[];
  /** 무효화 대상 달. 홈·요약과 같은 키를 써야 숫자가 함께 맞는다. */
  month?: MonthParams;
  onClose: () => void;
}

export function EditSheet({ transaction, categories, month, onClose }: EditSheetProps) {
  /*
    고친 것이 있나. **있으면 나가기 전에 한 번 묻는다**(2026-09-25 사용자 신고).

    금액과 상호를 고쳐 둔 채로 시트가 닫혀 처음부터 다시 적은 일이 두 번 있었다.
    손짓 쪽 원인은 따로 고쳤지만(`sheetDrag`), 딤·Esc·뒤로가기로도 같은 일이 나므로
    **나가는 길 전부**를 한 자리로 모은다.
  */
  const dirtyRef = useRef(false);
  const [asking, setAsking] = useState(false);

  function requestClose(): void {
    if (asking) return;
    if (dirtyRef.current) {
      setAsking(true);
      return;
    }
    onClose();
  }

  function leave(): void {
    setAsking(false);
    onClose();
  }

  // 시스템 뒤로가기를 시트가 먼저 가져간다. 안 그러면 시트가 열린 채 화면만 뒤로 빠진다.
  useOverlayBackClose(transaction != null, requestClose);

  /*
    새 분류 창이 떠 있는 동안 이 시트를 잠그지 **않는다.**

    한때 `dismissible={false}` 로 막았는데, 그 값이 `BottomSheet` 의 포커스 효과 deps 에
    들어 있어서 값을 토글하는 순간 효과가 다시 돌고 시트가 이름 칸의 포커스를 도로
    가져갔다. 웹뷰에서 자판이 안 올라오고 Tab 이 가려진 시트로 샜다.

    새는 길은 창 쪽에서 막는다(`CategoryComposeOverlay`). Esc 를 캡처 단계에서 삼키고,
    바탕이 화면 끝까지 가서 뒤의 딤과 손잡이에 손이 안 닿는다.
  */
  return (
    <BottomSheet
      open={transaction != null}
      onClose={requestClose}
      ariaLabel="기록 수정"
      className="tx-edit"
      /*
        고칠 칸이 많은 시트다. 내용만큼 여는 높이로 두면 작은 화면(390x664)에서
        「완료」 와 「삭제」 가 접힌 아래로 밀려, 아래로 굴려야 나오는 버튼이 된다.
        생활비 계산기와 같은 규약을 쓴다: 높이를 고정하고 버튼 줄을 바닥에 붙인다.
      */
      size="tall"
    >
      {transaction != null ? (
        // key 로 다시 마운트해 입력값을 그 거래 것으로 갈아 끼운다.
        // 효과로 값을 되넣으면 한 번 더 렌더하고, 앞 거래 값이 한 프레임 남는다.
        <EditForm
          key={transaction.id}
          transaction={transaction}
          categories={categories}
          month={month}
          dirtyRef={dirtyRef}
          onClose={onClose}
        />
      ) : null}
      {asking ? (
        <LeaveConfirm
          text="고친 것이 사라져요. 그만둘까요?"
          stayLabel="계속 고치기"
          onStay={() => setAsking(false)}
          onLeave={leave}
        />
      ) : null}
    </BottomSheet>
  );
}

interface EditFormProps {
  transaction: TransactionOut;
  categories: CategoryOut[];
  month?: MonthParams;
  /**
   * 고친 것이 있나. 감싼 시트가 나가기 전에 한 번 묻는 데 쓴다.
   *
   * **상태로 올리지 않고 칸에 적는다.** 올리면 한 박자 늦어서, 태그를 누르자마자 나가면
   * 아직 거짓인 값을 보고 확인 없이 닫힌다.
   */
  dirtyRef: { current: boolean };
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

function EditForm({ transaction, categories, month, dirtyRef, onClose }: EditFormProps) {
  const analytics = useAnalytics();
  const update = useUpdateTransaction(month);
  const remove = useDeleteTransaction();
  const tags = useTags();

  const savedAmount = parseDecimalOr(transaction.amount, 0);
  const dayId = useId();
  const savedDay = toLedgerDate(new Date(transaction.occurred_at));
  /*
    적힌 날.

    **여기서 옮길 수 있어야 한다.** 캡처로 읽은 날짜가 하루 어긋나거나, 며칠 지나 적은
    것을 제 날로 돌려놓고 싶은 일이 흔하다. 예전에는 지우고 그 날을 찾아가 다시 적는
    길밖에 없었다. 옮길 때는 그 날 정오로 둔다. 시간대가 달라져도 날이 안 넘어간다.
  */
  const [day, setDay] = useState(savedDay);
  const [merchant, setMerchant] = useState(transaction.merchant ?? '');
  const [memo, setMemo] = useState(transaction.memo ?? '');
  const [amount, setAmount] = useState(String(savedAmount));
  const [categoryId, setCategoryId] = useState<string | null>(transaction.category_id ?? null);
  const [excluded, setExcluded] = useState(transaction.excluded_from_budget);
  const [kind, setKind] = useState<LedgerKind>(kindOf(transaction.type));
  const [method, setMethod] = useState<PaymentMethod | null>(transaction.payment_method);
  const [tagId, setTagId] = useState<string | null>(transaction.tag_id ?? null);
  /*
    무엇에 실패했나. 고치기와 지우기가 서로 다른 말을 해야 한다.
    지우기에 실패했는데 「고친 것을 저장하지 못했어요」 라고 하면, 지워졌는지 아닌지를
    화면이 말해 주지 않는 셈이 된다.
  */
  const [failed, setFailed] = useState<'edit' | 'delete' | null>(null);
  /*
    분류 만들기 자리가 열렸나.

    기록할 때만 만들 수 있으면, 나중에 목록을 보다가 「이건 따로 세고 싶다」 고 생각한
    순간에 갈 곳이 없다. 기록 시트와 같은 방식으로 시트를 하나 더 띄우지 않고
    분류 칸이 만들기 폼으로 바뀐다. 고쳐 둔 금액·상호가 살아 있어야 이어서 저장한다.
  */
  const [creating, setCreating] = useState(false);
  /*
    지우기 전에 한 번 묻는다.

    **시트를 하나 더 겹치지 않는다.** 화면에 dialog 가 둘이 되면 뒤로가기가 어느 것을
    닫는지 흔들리고, 포커스가 돌아갈 자리를 잃는다. 대신 버튼 줄 자체가 물음으로 바뀐다.
    묻는 동안 위쪽 칸은 그대로 보여, 무엇을 지우려는지 보면서 답한다.
  */
  const [asking, setAsking] = useState(false);
  /*
    물음이 열리면 그 자리로 데려간다.

    시트 안쪽은 스크롤되는데 이 시트는 칸이 많아 작은 화면(390x664)에서는 버튼 줄이
    접힌 아래에 있다. 삭제를 눌렀는데 아무 일도 안 일어난 것처럼 보였다.
  */
  const confirmRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!asking) return;
    confirmRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [asking]);

  const busy = update.isPending || remove.isPending;
  const switchable = canSwitchKind(transaction.type);
  /*
    이체는 지출이 아니다.

    `kindOf` 는 수입이 아니면 전부 'expense' 로 떨어뜨린다(지출·환불·이체 셋을 한 낱말로
    묶는 함수다). 그 값을 그대로 쓰면 이체 시트에 **뜻이 없는 결제 수단 칸**이 서고,
    고른 값은 서버가 버린다. 「새 분류」 도 지출 분류를 만들어 이체에 붙인다.
    이체에서는 둘 다 세우지 않는다.
  */
  const isTransfer = transaction.type === 'transfer';
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

    if (day !== savedDay) next.occurred_at = toLedgerNoonIso(day);
    if (trimmed !== (transaction.merchant ?? '')) next.merchant = trimmed === '' ? null : trimmed;
    const trimmedMemo = memo.trim();
    if (trimmedMemo !== (transaction.memo ?? '')) next.memo = trimmedMemo === '' ? null : trimmedMemo;
    if (nextAmount !== savedAmount) next.amount = String(nextAmount);
    if (switchable && kind !== transaction.type) next.type = kind;
    if (categoryId !== (transaction.category_id ?? null)) next.category_id = categoryId;
    if (excluded !== transaction.excluded_from_budget) next.excluded_from_budget = excluded;
    // 수입·이체로 가면 서버가 어차피 비운다. 여기서도 안 보내 두 곳이 같은 말을 하게 한다.
    const nextMethod = kind === 'expense' && !isTransfer ? method : null;
    if (nextMethod !== transaction.payment_method) next.payment_method = nextMethod;
    // 이체에는 태그가 안 붙는다. 종류를 바꾸면 안 맞는 태그는 서버가 떼 준다.
    const nextTag = isTransfer ? null : tagId;
    if (nextTag !== (transaction.tag_id ?? null)) next.tag_id = nextTag;
    return next;
  }

  /*
    고친 것이 있나. **`changes()` 를 그대로 쓴다.**

    「무엇을 보낼까」 와 「나갈 때 물을까」 는 같은 물음이다. 두 벌로 두면 한쪽에만 칸이
    늘어나, 방금 고친 태그를 말없이 버리는 식으로 어긋난다.
  */
  dirtyRef.current = Object.keys(changes()).length > 0;

  /** 완료를 눌렀다가 앞날이라 물어보는 중인가. */
  const [futureAsking, setFutureAsking] = useState(false);

  function requestSubmit(): void {
    // 아직 오지 않은 날이면 한 번 묻는다. 고쳐서 앞날이 된 경우만 잡는다.
    if (day !== savedDay && isFutureDay(day)) {
      setFutureAsking(true);
      return;
    }
    void submit();
  }

  async function submit(): Promise<void> {
    setFutureAsking(false);
    const body = changes();
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    try {
      setFailed(null);
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
      /*
        태그는 따로 한 번 더 센다. 「어느 칸을 고쳤나」 와 「태그가 쓰이나」 는 다른 물음이다.
        누른 순간이 아니라 여기서 세는 이유는, 칩을 눌렀다가 그냥 닫은 것까지 「달았다」
        로 들어가면 안 되기 때문이다.
      */
      if (body.tag_id !== undefined) {
        analytics.log(EVENTS.tagApplied, {
          where: 'edit',
          kind,
          result: body.tag_id == null ? 'detached' : 'attached',
        });
      }
      onClose();
    } catch {
      // 시트를 닫지 않는다. 고쳐 둔 값이 사라지면 처음부터 다시 입력해야 한다.
      setFailed('edit');
    }
  }

  function ask(): void {
    setFailed(null);
    setAsking(true);
    // 지우려다 마는 비율을 봐야 이 물음이 방해인지 안전장치인지 가른다.
    analytics.log(EVENTS.recordChanged, { action: 'delete_asked', source: transaction.source });
  }

  function cancelAsk(): void {
    setAsking(false);
    analytics.log(EVENTS.recordChanged, { action: 'delete_cancelled', source: transaction.source });
  }

  async function destroy(): Promise<void> {
    try {
      setFailed(null);
      await remove.mutateAsync(transaction.id);
      analytics.log(EVENTS.recordChanged, { action: 'delete', source: transaction.source });
      onClose();
    } catch {
      // 물음을 닫아 「지울게요」 가 다시 눌리지 않게 한다. 실패 문구는 아래에 남는다.
      setAsking(false);
      setFailed('delete');
    }
  }

  return (
    <div className="tx-edit__body">
      <div className="tx-edit__scroll">
        <div className="tx-edit__head">
          <CategoryAvatar {...iconOf(headCategory)} size={58} />
          {/* 머리의 날짜도 고른 값을 따라간다. 저장한 값만 보면 옮긴 뒤에도 옛 날이 남는다. */}
          <p className="tx-edit__title">
            {nameOf(transaction, categories)} · {formatDayLabel(day)}
          </p>
        </div>

        {/*
          날짜 칸. 상호·금액보다 위에 둔다. 무엇을 고치러 들어왔든 「이게 그 기록이 맞나」
          를 먼저 보게 되는 값이고, 아직 오지 않은 날에는 적을 것이 없어 오늘까지만 간다.
        */}
        <div className="tx-edit__day">
          <label className="tx-edit__day-label" htmlFor={dayId}>
            날짜
          </label>
          <input
            id={dayId}
            className="tx-edit__day-input"
            type="date"
            value={day}
            min={savedDay < oldestDay() ? savedDay : oldestDay()}
            /*
              **앞날을 막지 않는다.** 미리 나갈 돈을 적어 두는 사람이 있고, 읽어 온 것에
              앞날이 섞여 들어오기도 한다. 대신 「완료」 를 누를 때 한 번 묻는다.
            */
            max={DAY_MAX}
            disabled={busy}
            // 달력을 열었다 비운 채로 닫는 기기가 있다. 비면 적혀 있던 날로 되돌린다.
            onChange={(event) => setDay(event.target.value === '' ? savedDay : event.target.value)}
          />
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

        {/* 상호와 다른 칸이다. 「어디서」 가 아니라 「무엇을·왜」 를 적는다. */}
        <label className="tx-edit__field tx-edit__field--memo">
          <span className="tx-edit__label">메모</span>
          <input
            className="tx-edit__input"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            placeholder="남겨 두고 싶은 한마디"
            maxLength={200}
          />
        </label>

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
              // 지출 태그를 수입에 달 수 없다. 분류와 같은 규칙으로 비우고, 되돌아오면 되찾는다.
              setTagId(next === kindOf(transaction.type) ? (transaction.tag_id ?? null) : null);
            }}
          />
        ) : null}

        {/* 이체에는 뜻이 없다. 리포트의 어느 조각에도 안 들어가서 달아도 안 보인다. */}
        {isTransfer ? null : (
          <TagPicker
            className="tx-edit__tags"
            kind={kind}
            tags={tags.data?.items ?? []}
            selectedId={tagId}
            disabled={busy}
            onChange={setTagId}
          />
        )}

        {/* 수입·이체에는 뜻이 없어 아예 안 세운다. 비활성으로 두면 무엇을 잘못했나 싶어진다. */}
        {kind === 'expense' && !isTransfer ? (
          <PaymentMethodPicker
            className="tx-edit__pay"
            value={method}
            disabled={busy}
            onChange={setMethod}
          />
        ) : null}

        {/*
          기록 시트와 같은 것을 쓴다. 앞자리 열한 개만 보이고 나머지는 「더 보기」 뒤다.
          한 화면에서 배운 것이 다음 화면에서도 통해야 한다.
        */}
        <CategoryPicker
          className="tx-edit__cats"
          ariaLabel="카테고리"
          size="sm"
          categories={pickable}
          selectedId={categoryId}
          disabled={busy}
          onPick={(category) => setCategoryId(category.id)}
          // 만들기 폼은 지출·수입만 만든다. 이체 분류를 만들 길이 없어 입구도 세우지 않는다.
          onCreate={isTransfer ? undefined : () => setCreating(true)}
          onExpand={() =>
            analytics.log(EVENTS.categoryMoreOpened, {
              where: 'edit',
              shown: pickable.length,
            })
          }
        />

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

        {failed != null ? (
          <p className="tx-edit__notice" role="alert">
            {failed === 'delete'
              ? '지우지 못했어요. 기록은 그대로 있어요.'
              : '고친 것을 저장하지 못했어요. 입력한 값은 그대로 있어요.'}
          </p>
        ) : null}
      </div>

      {/* 앞날로 고쳐 저장하려 할 때만 선다. 막는 것이 아니라 한 번 확인하는 자리다. */}
      {futureAsking ? (
        <FutureDayConfirm
          day={day}
          onFix={() => setFutureAsking(false)}
          onSave={() => void submit()}
        />
      ) : null}

      <div className="pk-sheet-foot">
        {asking ? (
          <div className="tx-edit__confirm" role="group" aria-label="삭제 확인" ref={confirmRef}>
            <p className="tx-edit__confirm-text">
              <b>이 기록을 지울까요?</b> 지우면 되돌릴 수 없어요
            </p>
            <div className="tx-edit__actions">
              <Button variant="outline" onClick={cancelAsk} disabled={busy}>
                그대로 둘래요
              </Button>
              <Button
                variant="danger"
                className="tx-edit__done"
                onClick={() => void destroy()}
                disabled={busy}
              >
                지울게요
              </Button>
            </div>
          </div>
        ) : (
          <div className="tx-edit__actions">
            <Button variant="outline" onClick={ask} disabled={busy || creating}>
              삭제
            </Button>
            <Button
              variant="primarySmall"
              className="tx-edit__done"
              onClick={requestSubmit}
              disabled={busy || creating || !amountOk}
            >
              완료
            </Button>
          </div>
        )}
      </div>

      {/*
        새 분류 만들기. **화면을 통째로 덮는 한 장으로 연다.**

        예전에는 이 시트 안에 회색 상자로 끼워 넣었는데, 「저장」 이 상자 안쪽에 있어서
        아이콘 격자를 펴면 화면 밖으로 밀렸다. 기록 시트의 키패드 탭과 같은 화면을 쓴다.
        고치던 금액과 날짜는 뒤에 그대로 살아 있다.
      */}
      <CategoryComposeOverlay
        open={creating}
        // 종류는 위 토글이 이미 정했다. 여기서 다시 묻지 않는다.
        fixedKind={kind}
        onBack={() => setCreating(false)}
        onClose={() => setCreating(false)}
        // 만들자마자 이 기록의 분류로 둔다. 다시 찾아 누르게 하면 만든 보람이 없다.
        onCreated={(created) => {
          setCategoryId(created.id);
          setCreating(false);
        }}
      />
    </div>
  );
}

function nameOf(transaction: TransactionOut, categories: CategoryOut[]): string {
  if (transaction.merchant) return transaction.merchant;
  const category = categories.find((item) => item.id === transaction.category_id);
  return category?.name ?? '기록';
}
