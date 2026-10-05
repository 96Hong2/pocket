import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { EVENTS, useAnalytics, type FlowId } from '../../shared/analytics';

import {
  type AssetItemOut,
  type CategoryOut,
  type ImportCandidateOut,
  type ImportCandidatePatch,
  type PaymentMethod,
  type TransactionType,
  parseDecimalOr,
} from '../../shared/api';
import {
  CategoryPicker,
  PaymentMethodPicker,
  categoriesOfKind,
  type LedgerKind,
} from '../../shared/ledger';
import { cx } from '../../shared/lib/cx';
import {
  formatDayLabel,
  isFutureDay,
  toLedgerDate,
  toLedgerNoonIso,
} from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import {
  Amount,
  AmountField,
  Button,
  CategoryAvatar,
  Chip,
  SegmentedControl,
  iconOf,
  type SegmentedOption,
} from '../../shared/ui';

import {
  AssetDestField,
  AssetDestPage,
  destFromItem,
  destHoldingOf,
  destNameOf,
  parseQuantity,
  quantityValue,
  type AssetItemDest,
} from '../asset-dest';
import { ASSET_GROUP_VIEWS, formatQuantity, sanitizeQuantityInput, unitOf } from '../assets';
import { CategoryComposeOverlay } from '../categories';
import { DAY_MAX, DAY_MIN, isDayInRange } from '../../shared/lib/limits';

import { isSavingRow, isUnpickedSaving } from './savingRow';

/**
 * 고를 수 있는 종류.
 *
 * 환불은 없다. 되돌릴 지출을 함께 골라야 하는데 그 자리가 아직 없다.
 * 대상 없는 환불을 저장하면 쓴 적 없는 돈이 남은 예산으로 돌아온다.
 */
const TYPES: SegmentedOption<RowKind>[] = [
  { value: 'expense', label: '지출' },
  { value: 'income', label: '수입' },
  { value: 'transfer', label: '이체' },
  { value: 'save', label: '저축·투자' },
];

const NO_DESTINATIONS: readonly AssetItemOut[] = [];

/** 줄의 종류. 저축·투자는 서버에서 「어디에」 가 붙은 이체다. */
type RowKind = TransactionType | 'save';

type Side = 'buy' | 'sell';

const SIDES: SegmentedOption<Side>[] = [
  { value: 'buy', label: '넣었어요' },
  { value: 'sell', label: '팔았어요' },
];

/** 줄 머리 아래 날짜·분류·어디에 칩을 눌러 여는 칸. 한 번에 하나만 열린다. */
type Editor = 'date' | 'category' | 'dest';

function rowKindOf(candidate: ImportCandidateOut): RowKind {
  return isSavingRow(candidate) ? 'save' : candidate.type;
}

function destOf(
  key: string | null | undefined,
  destinations: readonly AssetItemOut[],
): AssetItemDest | null {
  if (key == null) return null;
  const item = destinations.find((entry) => entry.item_key === key);
  return item == null ? null : destFromItem(item);
}

/** 수량으로 적는 종목인데 수량이 비었나. 서버가 고르기를 꺼 두고 commit 은 422 다. */
function missingQuantity(
  candidate: ImportCandidateOut,
  destinations: readonly AssetItemOut[],
): boolean {
  const dest = destOf(candidate.asset_item_key, destinations);
  return dest != null && destHoldingOf(dest) === 'quantity' && candidate.asset_quantity == null;
}

/** 접힌 줄의 「어디에」 칩 글씨. 수량 종목은 수량을 붙인다(「삼성전자 2주」). */
function destChipLabel(
  candidate: ImportCandidateOut,
  dest: AssetItemDest | null,
): string {
  if (candidate.asset_item_key == null) return '어디에 고르기';
  if (dest == null) return candidate.asset_name ?? '어디에';
  const quantity = quantityValue(candidate.asset_quantity);
  if (destHoldingOf(dest) !== 'quantity' || quantity == null) return destNameOf(dest);
  return `${destNameOf(dest)} ${formatQuantity(quantity)}${unitOf(dest.item.kind)}`;
}

/**
 * 펼친 폼에 지금 적혀 있는 분류·금액·종류.
 *
 * 줄 머리와 저장 버튼 합계가 서버 값 대신 이것을 그린다. 안 그러면 칩은 새 분류인데
 * 바로 위 아이콘은 옛 분류라 한 줄에 분류가 둘 선다.
 */
export interface RowPreview {
  id: string;
  categoryId: string | null;
  amount: number;
  type: TransactionType;
  /** 상호 칸에 적힌 것. 비우면 null. 기억할지 묻는 줄이 이 이름을 부른다. */
  merchant: string | null;
}

/** 다음부터 그렇게 저장할지 물었을 때 고른 답. 답하기 전에는 null 로 둔다. */
export type RuleAnswer = 'remember' | 'skip';

/** 「새 분류」 를 눌렀을 때 뜨는 창에 넘기는 것. */
export interface CategoryComposeSlot {
  open: boolean;
  /** 지금 고치는 줄의 종류. 만들 분류의 종류가 이것으로 정해진다. */
  kind: LedgerKind;
  /** 만들지 않고 고치던 줄로 돌아간다. */
  onBack: () => void;
  /** 만든 것을 돌려주면 이 줄에 바로 골라진다. */
  onCreated: (created: CategoryOut) => void;
}

export interface CandidateRowProps {
  candidate: ImportCandidateOut;
  /** 이 줄에서 고를 수 있는 분류. 줄이 종류에 맞춰 한 번 더 거른다. */
  categories: CategoryOut[];
  /** 이 검토가 속한 기록 흐름. 「더 보기」를 편 로그가 이 값을 물고 간다. */
  flowId: FlowId;
  /** 지금 이 줄을 펼쳐 고치는 중인가. 한 번에 하나만 열린다. */
  editing: boolean;
  disabled: boolean;
  onToggle: (selected: boolean) => void;
  /** 줄을 펴지 않고 지출·수입만 바꾼다. 읽어 온 종류가 틀린 것이 가장 흔한 손질이라 밖에 둔다. */
  onKindChange: (body: ImportCandidatePatch) => void;
  onEdit: () => void;
  onEditClose: () => void;
  onSave: (body: ImportCandidatePatch) => void;
  /** 펼친 폼이 아직 안 보낸 값을 목록이 꺼내 갈 수 있게 하는 통로. */
  onDraftChange: (read: (() => ImportCandidatePatch) | null) => void;
  /** 펼친 폼에 적힌 값. 이 줄 것이면 머리가 이것을 그린다. */
  preview: RowPreview | null;
  /** 폼이 적힌 값을 올리는 통로. 폼이 내려가면 null 을 올린다. */
  onPreviewChange: (update: (current: RowPreview | null) => RowPreview | null) => void;
  /**
   * 지출만 받는 자리인가(공유 가계부 검토).
   *
   * 참이면 종류와 결제 수단을 고치는 칸을 세우지 않는다. 접힌 줄의 지출·수입 ⇄,
   * 환불 안내와 「수입으로 바꾸기」, 폼의 지출/수입/이체와 결제 수단이 빠진다.
   */
  expenseOnly?: boolean;
  /** 저축·투자의 「어디에」. 공유 가계부 묶음에는 넘기지 않는다. */
  destinations?: readonly AssetItemOut[];
  /**
   * 「새 분류」 를 눌렀을 때 뜨는 만들기 창.
   *
   * 안 주면 내 분류를 만드는 창을 쓴다. `null` 이면 「새 분류」 칸이 없다.
   * 다른 곳(공유 가계부)에 분류를 만들 때는 그 창을 여기 끼운다.
   */
  renderCompose?: ((slot: CategoryComposeSlot) => ReactNode) | null;
  /**
   * 분류 없이 읽힌 줄이라, 분류를 골라 넣으면 다음부터 그렇게 저장할지 물을지.
   *
   * 저장은 상호마다 분류를 스스로 기억한다. 모델이 붙인 분류는 그대로 두고, 모델도 몰라서
   * 사람이 골라 넣은 것만 묻는다. 공유 가계부 묶음은 상호를 기억하지 않아 묻지 않는다.
   */
  askRule?: boolean;
  /** 그 물음에 고른 답과 그때의 분류. 목록이 들고 있어 줄을 접었다 펴도 남는다. */
  ruleAnswer?: { answer: RuleAnswer; categoryId: string } | null;
  onRuleAnswer?: (answer: RuleAnswer, categoryId: string) => void;
  /** 「네」 라고 한 것을 무른다. 남는 한 줄의 「되돌리기」 가 부른다. */
  onRuleClear?: () => void;
}

/**
 * 검토 목록의 한 줄.
 *
 * 확신이 낮은 줄은 스스로 켜지지 않는다. 조용히 저장되면 사용자는 나중에 발견하고,
 * 그때는 이미 리포트가 틀려 있다.
 */
export function CandidateRow({
  candidate,
  categories,
  flowId,
  editing,
  disabled,
  onToggle,
  onKindChange,
  onEdit,
  onEditClose,
  onSave,
  onDraftChange,
  preview,
  onPreviewChange,
  expenseOnly = false,
  destinations = NO_DESTINATIONS,
  renderCompose,
  askRule = false,
  ruleAnswer = null,
  onRuleAnswer,
  onRuleClear,
}: CandidateRowProps) {
  const category = categories.find((item) => item.id === candidate.category_id);
  const rowKind = rowKindOf(candidate);
  const dest = rowKind === 'save' ? destOf(candidate.asset_item_key, destinations) : null;
  const noQuantity = rowKind === 'save' && missingQuantity(candidate, destinations);
  const unpicked = isUnpickedSaving(candidate);
  // 펼친 동안 머리는 폼에 적힌 것을 그린다. 접으면 서버 값으로 돌아간다.
  const shown = editing && preview?.id === candidate.id ? preview : null;
  const headCategory =
    shown == null ? category : categories.find((item) => item.id === shown.categoryId);
  /*
    상호를 못 읽었을 때 「이름 없음」 이라고 적지 않는다. 읽히기로는 사용자가 뭔가
    빠뜨린 것처럼 들리는데 실제로는 영수증에 총액만 있던 것이다. 저장하고 나면
    같은 줄이 원장에서 분류 이름으로 불리므로, 여기서도 같은 이름을 쓴다.
  */
  const destName = dest != null ? destNameOf(dest) : (candidate.asset_name ?? null);
  const name =
    candidate.merchant ?? (rowKind === 'save' ? destName : null) ?? headCategory?.name ?? '기록';
  const amount = shown?.amount ?? parseDecimalOr(candidate.amount, 0);
  const day = toLedgerDate(new Date(candidate.occurred_at));
  // 이체는 여기서 못 바꾼다. 분류가 없는 종류라 한 번 누르는 것으로 오갈 수 없다.
  const swap: LedgerKind | null = expenseOnly
    ? null
    : candidate.type === 'expense'
      ? 'income'
      : candidate.type === 'income'
        ? 'expense'
        : null;

  /*
    접힌 줄의 날짜·분류 칩을 누르면 줄을 펴면서 그 칸을 바로 연다.
    펴는 일은 목록이 한다(앞 줄에 적어 둔 것을 먼저 보낸 뒤 편다). 무엇을 열지는 여기
    적어 두고, 폼이 처음 설 때 한 번 읽는다.
  */
  const [opening, setOpening] = useState<Editor | null>(null);
  /*
    지출만 받는 자리에 수입·이체·환불로 읽힌 줄. 켜지도 고치지도 못하게 흐리게 둔다.
    종류를 바꾸는 칸이 없는 자리라, 열어 봐야 할 수 있는 일이 없다.
  */
  const locked = expenseOnly && candidate.type !== 'expense';
  const rowDisabled = disabled || locked;
  function open(editor: Editor | null): void {
    setOpening(editor);
    onEdit();
  }

  /*
    펼친 줄을 화면 맨 위로 끌어올린다.

    목록 다섯째 줄을 누르면 폼이 화면 밖 아래로 열려, 무엇이 열렸는지 모른 채 스크롤을
    찾아 내려야 했다. 열리는 자리를 눈이 따라가게 해 두면 고칠 칸이 바로 앞에 온다.
  */
  const rowRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!editing) return;
    rowRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [editing]);

  /*
    기억할지 묻는 칸. 펼친 폼의 「완료」 아래에만 선다. 접힌 줄의 분류 칩은 누르면 줄이
    펼쳐지므로 분류를 고르는 자리는 늘 폼이고, 접으면 물음도 함께 접힌다. 답은 바깥이
    들고 있어 다시 펴면 그대로다.
  */
  const ruleSlot =
    askRule && !locked && candidate.is_selected ? (
      <RulePrompt
        id={candidate.id}
        merchant={shown == null ? (candidate.merchant ?? null) : shown.merchant}
        category={headCategory}
        type={shown?.type ?? candidate.type}
        // 답은 그때 고른 분류 것이다. 분류를 바꿨으면 다시 묻는다.
        answer={
          ruleAnswer != null && ruleAnswer.categoryId === headCategory?.id
            ? ruleAnswer.answer
            : null
        }
        disabled={disabled}
        onAnswer={onRuleAnswer}
        onClear={onRuleClear}
      />
    ) : null;

  return (
    <li
      className={cx('nl-item', locked && 'nl-item--locked')}
      ref={rowRef}
      data-testid={TEST_IDS.nlCandidateRow}
    >
      <div className="nl-item__head">
        {/*
          라벨이 감싸는 것은 체크박스 하나뿐이다. 예전에는 이름과 아이콘까지 라벨 안이라
          줄을 누르면 저장 대상이 켜졌다 꺼졌다 했고, 고치려면 아래 작은 「고치기」 를
          정확히 찾아 눌러야 했다. **고치는 자리가 줄 자체여야 한다.**
        */}
        <label className="nl-item__pick">
          <input
            type="checkbox"
            checked={candidate.is_selected}
            // 이름을 그대로 읽는다. 화면에서 이 칸이 가리키는 것이 그 줄이다.
            aria-label={name}
            // 환불은 켜 봐야 저장에서 통째로 막힌다. 켤 수 있게 두면 여덟 건이 다 안 들어간다.
            // 수량 종목인데 수량이 비면 저장에서 막힌다. 수량을 채우면 서버가 다시 켠다.
            // 「어디에」 를 안 고른 저축·투자도 같다. 고르면 켤 수 있다.
            disabled={
              rowDisabled ||
              candidate.type === 'refund' ||
              ((noQuantity || unpicked) && !candidate.is_selected)
            }
            onChange={(event) => onToggle(event.target.checked)}
          />
        </label>

        <button
          type="button"
          className="nl-item__open"
          disabled={rowDisabled}
          aria-expanded={editing}
          onClick={editing ? onEditClose : () => open(null)}
        >
          {dest != null ? (
            <CategoryAvatar icon={ASSET_GROUP_VIEWS[dest.item.group].icon} size={52} />
          ) : (
            <CategoryAvatar {...iconOf(headCategory)} size={52} />
          )}
          <span className="nl-item__name">{name}</span>
          {/*
            종류를 숫자로 드러낸다. 수입은 앞에 + 가 붙고 색이 갈린다.
            아래 메타 줄의 분류만으로는 이게 들어온 돈인지 나간 돈인지 알 수 없었다.
          */}
          <Amount
            className={candidate.is_low_confidence ? 'nl-item__amount--unsure' : undefined}
            value={amount}
            tone={shown?.type ?? candidate.type}
            size={17}
            data-testid={TEST_IDS.nlCandidateAmount}
          />
          <Caret open={editing} />
          <span className="nl-item__sr">, 눌러서 고치기</span>
        </button>
      </div>

      {editing ? (
        <CandidateForm
          // 대상이 바뀌면 새로 마운트한다. 앞 줄의 값이 남지 않는다.
          key={candidate.id}
          candidate={candidate}
          categories={categories}
          flowId={flowId}
          disabled={disabled}
          expenseOnly={expenseOnly}
          destinations={destinations}
          initialEditor={opening}
          renderCompose={renderCompose}
          onKindChange={onKindChange}
          onSave={onSave}
          onDraftChange={onDraftChange}
          onPreviewChange={onPreviewChange}
          ruleSlot={ruleSlot}
        />
      ) : (
        <>
          <div className="nl-item__meta">
            <DayChip day={day} open={false} disabled={rowDisabled} onClick={() => open('date')} />
            {rowKind === 'save' ? (
              <DestChip
                label={destChipLabel(candidate, dest)}
                unpicked={unpicked}
                disabled={rowDisabled}
                onClick={() => open(null)}
              />
            ) : (
              <CategorySlot
                type={candidate.type}
                category={category}
                // 상호가 없으면 제목이 이미 분류 이름이다. 누를 칩이 아니면 「식비 · 식비」 로 두 번 읽힌다.
                plainHidden={candidate.merchant == null && category != null}
                open={false}
                disabled={rowDisabled}
                onClick={() => open('category')}
              />
            )}
            {/*
              읽어 온 종류를 겉으로 드러내고 한 번에 바꾼다. 예전에는 '고치기' 를 펴야 보였는데,
              사진과 문장에서 가장 자주 틀리는 값이 이것이라 그 자리가 너무 멀었다.
              펼치면 아래 폼에 세 칸짜리가 나오므로 접혀 있을 때만 보여 준다.
            */}
            {swap != null ? (
              <button
                type="button"
                className="nl-item__kind"
                disabled={disabled}
                aria-label={`${KIND_LABEL[candidate.type]}이에요. 눌러서 ${KIND_LABEL[swap]}으로 바꾸기`}
                onClick={() => onKindChange(kindPatch(swap, candidate.category_id, categories))}
              >
                {KIND_LABEL[candidate.type]}
                <span aria-hidden="true">⇄</span>
              </button>
            ) : expenseOnly && candidate.type === 'expense' ? null : (
              <span className="nl-item__kind nl-item__kind--fixed">{KIND_LABEL[rowKind]}</span>
            )}
            <RowFlags candidate={candidate} future={isFutureDay(day)} noQuantity={noQuantity} />
          </div>
          <RowNotices
            candidate={candidate}
            categories={categories}
            future={isFutureDay(day)}
            expenseOnly={expenseOnly}
            disabled={disabled}
            onKindChange={onKindChange}
          />
        </>
      )}
    </li>
  );
}

/**
 * 분류 없이 읽힌 상호에 분류를 골라 넣은 뒤 한 번 묻는 칸.
 *
 * 저장은 상호마다 분류를 스스로 기억하는데, 모델도 몰랐던 상호에 사람이 넣은 분류는
 * 한 번 들른 가게가 영영 그 분류로 굳는 길이다. 그래서 그 자리만 묻는다. 「네」 라고 해야
 * 기억하고, 「이번만」 이거나 답하지 않고 저장하면 저장만 한다.
 *
 * 분류를 아직 안 골랐거나 상호가 없으면 기억할 것이 없어 서지 않는다.
 */
function RulePrompt({
  id,
  merchant,
  category,
  type,
  answer,
  disabled,
  onAnswer,
  onClear,
}: {
  id: string;
  merchant: string | null;
  category: CategoryOut | undefined;
  type: TransactionType;
  answer: RuleAnswer | null;
  disabled: boolean;
  onAnswer: ((answer: RuleAnswer, categoryId: string) => void) | undefined;
  onClear: (() => void) | undefined;
}) {
  if (merchant == null || category == null) return null;
  if (type !== 'expense' && type !== 'income') return null;
  if (answer === 'skip') return null;
  if (answer === 'remember') {
    // 아직 저장 전이다. 「기억했어요」 라고 하면 저장을 안 하고 닫은 사람에게 거짓이 된다.
    return (
      <p
        className="nl-item__ask-done"
        role="status"
        data-testid={TEST_IDS.nlCandidateAskDone}
      >
        저장할 때 「{category.name}」 분류로 기억해요
        <button
          type="button"
          className="nl-item__ask-undo"
          disabled={disabled}
          onClick={() => onClear?.()}
        >
          되돌리기
        </button>
      </p>
    );
  }
  const questionId = `nl-ask-${id}`;
  return (
    <div
      className="nl-item__ask"
      role="group"
      aria-labelledby={questionId}
      data-testid={TEST_IDS.nlCandidateAsk}
    >
      {/* 「기록은」 「분류로」 로 받아 상호와 분류 이름 뒤에 토씨를 고를 일이 없다. */}
      <p className="nl-item__ask-text" id={questionId}>
        앞으로 「{merchant}」 기록은 「{category.name}」 분류로 저장할까요?
      </p>
      {/* 저장이 도는 동안은 잠근다. 그 사이에 바꾼 답은 이미 나간 요청에 실리지 않는다. */}
      <div className="nl-item__ask-actions">
        <button
          type="button"
          className="nl-item__ask-yes"
          disabled={disabled}
          onClick={() => onAnswer?.('remember', category.id)}
        >
          기억하기
        </button>
        <button
          type="button"
          className="nl-item__ask-no"
          disabled={disabled}
          onClick={() => onAnswer?.('skip', category.id)}
        >
          이번만
        </button>
      </div>
    </div>
  );
}

/** 줄이 눌린다는 신호. 펼치면 아래를 가리킨다. */
function Caret({ open }: { open: boolean }) {
  return (
    <svg
      className={open ? 'nl-item__caret nl-item__caret--open' : 'nl-item__caret'}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        d="M6 3.5L10.5 8 6 12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 칩 끝의 작은 꺾쇠. 누르면 아래에 칸이 열린다는 뜻이다. */
function ChipCaret() {
  return (
    <svg
      className="nl-item__chip-caret"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2 4l3 3 3-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/*
  날짜와 분류는 **메타 줄 글자 자체가 누르는 자리**다.

  예전에는 줄을 펴면 날짜 칸과 분류 격자가 늘 열려 있어 한참 내려야 「이대로 고치기」 가
  나왔다. 위에서 분류만 누르고 넘어가면 고친 것이 남는지도 헷갈렸다. 지금은 고른 값만
  칩으로 보이고, 누르면 그 바로 아래에 칸이 열린다.
*/
function DayChip({
  day,
  open,
  disabled,
  onClick,
}: {
  day: string;
  open: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const label = formatDayLabel(day);
  return (
    <button
      type="button"
      className={cx(
        'nl-item__chip',
        // 앞날은 거의 다 잘못 읽은 것이다. 막지는 않고 눈에 띄게만 해 둔다.
        isFutureDay(day) && 'nl-item__date--future',
      )}
      data-testid={TEST_IDS.nlCandidateDate}
      aria-label={`날짜 ${label}, 바꾸기`}
      aria-expanded={open}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
      <ChipCaret />
    </button>
  );
}

/** 분류 칩. 이체처럼 분류가 없는 종류에는 누를 것이 없어 글자만 둔다. */
function CategorySlot({
  type,
  category,
  plainHidden = false,
  open,
  disabled,
  onClick,
}: {
  type: TransactionType;
  category: CategoryOut | undefined;
  /** 글자로만 설 때 감출지. 누르는 칩은 늘 선다. */
  plainHidden?: boolean;
  open: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const label = category?.name ?? '분류 없음';
  if (type !== 'expense' && type !== 'income') {
    if (plainHidden) return null;
    return (
      <>
        <span className="nl-item__dot" aria-hidden="true">
          ·
        </span>
        <span>{label}</span>
      </>
    );
  }
  return (
    <button
      type="button"
      className="nl-item__chip"
      // 「분류 분류 없음」 으로 읽히지 않게, 안 고른 칩은 할 일만 읽는다.
      aria-label={category == null ? '분류 고르기' : `분류 ${label}, 바꾸기`}
      aria-expanded={open}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="nl-item__chip-text">{label}</span>
      <ChipCaret />
    </button>
  );
}

/** 저축·투자 줄의 「어디에」 칩. 누르면 줄이 펼쳐지고 그 안에서 고른다. */
function DestChip({
  label,
  unpicked = false,
  disabled,
  onClick,
}: {
  label: string;
  /** 아직 안 골랐으면 칩 글씨가 곧 할 일(「어디에 고르기」)이다. */
  unpicked?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="nl-item__chip"
      aria-label={unpicked ? label : `어디에 ${label}, 바꾸기`}
      data-testid={TEST_IDS.nlCandidateDest}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="nl-item__chip-text">{label}</span>
      <ChipCaret />
    </button>
  );
}

function RowFlags({
  candidate,
  future,
  noQuantity = false,
}: {
  candidate: ImportCandidateOut;
  future: boolean;
  noQuantity?: boolean;
}) {
  return (
    <>
      {noQuantity ? <Chip variant="caution">수량 없음</Chip> : null}
      {candidate.is_duplicate ? <Chip variant="caution">이미 있어요</Chip> : null}
      {candidate.is_low_confidence && candidate.type !== 'refund' ? (
        <Chip variant="caution">확인 필요</Chip>
      ) : null}
      {future ? <Chip variant="caution">앞날</Chip> : null}
    </>
  );
}

/*
  환불로 읽힌 줄.

  되돌릴 지출을 함께 골라야 저장할 수 있는데 그 자리가 아직 없다. 그래서 이 줄은 켤 수
  없고, 예전에는 그 사실을 어디에도 적지 않은 채 '이체' 라고만 보여 줬다. 카드 캐시백이
  여기 걸려서, 왜 저장이 안 되는지 알 길이 없었다.

  지금은 두 가지를 한 자리에서 말한다: 왜 못 켜는지, 그리고 무엇을 하면 되는지.
  캐시백·환급처럼 실제로 들어온 돈이면 수입으로 바꿔 한 번에 저장한다.
  지출만 받는 자리에는 수입이 없으니 이 안내도 없다.
*/
function RowNotices({
  candidate,
  categories,
  future,
  expenseOnly,
  disabled,
  onKindChange,
}: {
  candidate: ImportCandidateOut;
  categories: CategoryOut[];
  future: boolean;
  expenseOnly: boolean;
  disabled: boolean;
  onKindChange: (body: ImportCandidatePatch) => void;
}) {
  return (
    <>
      {/* 칩만으로는 무엇을 하라는 말인지 모른다. 할 일을 한 줄로 적는다. */}
      {future ? (
        <p className="nl-item__future" data-testid={TEST_IDS.nlCandidateFuture}>
          아직 오지 않은 날이에요. 날짜가 맞는지 확인해 주세요
        </p>
      ) : null}

      {expenseOnly && candidate.type !== 'expense' ? (
        <p className="nl-item__locked">내 가계부에만 적을 수 있어요</p>
      ) : null}

      {candidate.type === 'refund' && !expenseOnly ? (
        <div className="nl-item__refund">
          <p className="nl-item__refund-text">
            환불로 읽었어요. 되돌릴 지출을 골라야 해서 이대로는 저장할 수 없어요
          </p>
          <div className="nl-item__refund-actions">
            {/* 카드 캐시백·환급은 실제로 들어온 돈이다. 이 한 번으로 저장 대상이 된다. */}
            <button
              type="button"
              className="nl-item__refund-fix"
              disabled={disabled}
              onClick={() => onKindChange(kindPatch('income', candidate.category_id, categories))}
            >
              수입으로 바꾸기
            </button>
            <span className="nl-item__refund-hint">
              이미 적어 둔 지출을 취소하려면 내역에서 그 건을 찾아 되돌려요
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** 화면에 보이는 말. 종류 값을 문자열로 바로 쓰면 화면마다 다른 말이 생긴다. */
const KIND_LABEL: Record<RowKind, string> = {
  expense: '지출',
  income: '수입',
  transfer: '이체',
  refund: '환불',
  save: '저축·투자',
};

/**
 * 종류만 바꾸는 요청 본문.
 *
 * 붙어 있던 분류가 새 종류의 것이 아니면 함께 뗀다. 남겨 두면 수입 줄에 '식비' 가 붙어
 * 목록과 리포트가 서로 다른 말을 한다.
 */
function kindPatch(
  next: LedgerKind,
  categoryId: string | null | undefined,
  categories: CategoryOut[],
): ImportCandidatePatch {
  const keeps = categoriesOfKind(next, categories).some((item) => item.id === categoryId);
  return keeps ? { type: next } : { type: next, category_id: null };
}

interface CandidateFormProps {
  candidate: ImportCandidateOut;
  categories: CategoryOut[];
  flowId: FlowId;
  disabled: boolean;
  expenseOnly: boolean;
  destinations: readonly AssetItemOut[];
  /** 처음 설 때 바로 열어 둘 칸. 접힌 줄의 칩을 눌러 펼쳤을 때 쓴다. */
  initialEditor: Editor | null;
  renderCompose: CandidateRowProps['renderCompose'];
  onKindChange: (body: ImportCandidatePatch) => void;
  onSave: (body: ImportCandidatePatch) => void;
  /**
   * 아직 안 보낸 값을 꺼내 가는 통로.
   *
   * 여기 적은 것은 버튼을 눌러야 서버로 갔다. 그래서 상호를 고치고 곧바로 아래 저장
   * 버튼을 누르면 **적은 것이 통째로 버려졌다**(실제로 겪은 일이다).
   * 줄을 접거나, 다른 줄을 펴거나, 한 번에 바꾸거나, 저장하기 직전에 바깥이 이 함수를
   * 불러 마지막 값을 가져간다.
   */
  onDraftChange: (read: (() => ImportCandidatePatch) | null) => void;
  onPreviewChange: CandidateRowProps['onPreviewChange'];
  /** 기억할지 묻는 칸. 분류 칩 바로 아래, 격자가 닫힌 자리에 세운다. 없으면 null. */
  ruleSlot: ReactNode;
}

/** 그 종류로 고를 수 있는 분류. 이체는 집계에서 빠지므로 분류를 두지 않는다. */
function pickableFor(type: RowKind, categories: CategoryOut[]): CategoryOut[] {
  if (type === 'expense' || type === 'income') {
    return categories.filter((item) => item.kind === type);
  }
  return [];
}

function CandidateForm({
  candidate,
  categories,
  flowId,
  disabled,
  expenseOnly,
  destinations,
  initialEditor,
  renderCompose,
  onKindChange,
  onSave,
  onDraftChange,
  onPreviewChange,
  ruleSlot,
}: CandidateFormProps) {
  const analytics = useAnalytics();
  const [merchant, setMerchant] = useState(candidate.merchant ?? '');
  const [digits, setDigits] = useState(String(parseDecimalOr(candidate.amount, 0)));
  const [day, setDay] = useState(toLedgerDate(new Date(candidate.occurred_at)));
  const [type, setType] = useState<RowKind>(rowKindOf(candidate));
  const [categoryId, setCategoryId] = useState<string | null>(candidate.category_id ?? null);
  // 영수증에 「신용」 이 찍혀 있으면 이미 채워져 있다. 못 읽었으면 여기서 고른다.
  const [method, setMethod] = useState<PaymentMethod | null>(candidate.payment_method);
  /*
    칩 아래 열린 칸. 날짜 칸과 분류 격자는 기본으로 닫혀 있다.
    폼에는 상호·금액·종류·결제 수단만 서서, 펼치자마자 「완료」 까지 한눈에 든다.
  */
  const [editor, setEditor] = useState<Editor | null>(initialEditor);
  /*
    폼 밖에서 종류가 바뀌었다(환불 줄의 「수입으로 바꾸기」 는 바로 보낸다). 옛 종류를 들고
    있으면 다음에 나갈 때 그것을 도로 보내, 줄이 환불로 돌아가며 꺼진다.
  */
  // 저축·투자의 어디에, 쪽, 수량. 수량은 소수 8자리 문자열로 둔다.
  const [destKey, setDestKey] = useState<string | null>(candidate.asset_item_key ?? null);
  const [side, setSide] = useState<Side>(candidate.asset_side ?? 'buy');
  const [qty, setQty] = useState(quantityValue(candidate.asset_quantity) ?? '');
  const [destOpen, setDestOpen] = useState(false);
  const candidateKind = rowKindOf(candidate);
  const [seenType, setSeenType] = useState(candidateKind);
  if (seenType !== candidateKind) {
    setSeenType(candidateKind);
    setType(candidateKind);
    setCategoryId(candidate.category_id ?? null);
    setDestKey(candidate.asset_item_key ?? null);
  }
  const pickedDest = type === 'save' ? destOf(destKey, destinations) : null;
  const byQuantity = pickedDest != null && destHoldingOf(pickedDest) === 'quantity';
  /*
    분류 만들기 창이 떴나.

    읽어 온 줄을 고치다가 「맞는 칸이 없다」 를 깨닫는 순간이 여기다.
    적어 둔 상호·금액·날짜가 살아 있어야 만들고 나서 이어 저장한다.
  */
  const [creating, setCreating] = useState(false);

  // 뒤로가기는 열어 둔 칸부터 닫는다. 줄과 시트는 그다음이다.
  useOverlayBackClose(editor != null, () => setEditor(null));

  const amount = Number(digits);
  // 연도 오타(`0202`)는 칸의 min·max 로 안 막힌다. 서버는 422 로 돌려보낸다.
  const dayOk = isDayInRange(day);
  const canSave = digits !== '' && amount > 0 && day !== '' && dayOk && !disabled && !creating;
  const pickable = pickableFor(type, categories);
  const picked = categories.find((item) => item.id === categoryId);
  const future = isFutureDay(day);

  // 지우다 만 금액(빈 칸, 0)은 원래 값으로 둔다. draft 도 그런 값은 안 보낸다.
  const shownAmount = amount > 0 ? amount : parseDecimalOr(candidate.amount, 0);
  const candidateId = candidate.id;
  const shownMerchant = merchant.trim() === '' ? null : merchant.trim();
  const shownType: TransactionType = type === 'save' ? 'transfer' : type;
  useEffect(() => {
    onPreviewChange(() => ({
      id: candidateId,
      categoryId,
      amount: shownAmount,
      type: shownType,
      merchant: shownMerchant,
    }));
  }, [onPreviewChange, candidateId, categoryId, shownAmount, shownType, shownMerchant]);
  useEffect(
    () => () => onPreviewChange((current) => (current?.id === candidateId ? null : current)),
    [onPreviewChange, candidateId],
  );

  /** 지금 칸에 적힌 것 중 원래와 달라진 것만. 아무것도 안 바꿨으면 빈 객체다. */
  function draft(): ImportCandidatePatch {
    const body: ImportCandidatePatch = {};
    const trimmed = merchant.trim();

    if (trimmed !== (candidate.merchant ?? '')) body.merchant = trimmed === '' ? null : trimmed;
    // 숫자가 아니거나 0 이면 보내지 않는다. 지우다 만 칸을 저장에 실어 보내면 안 된다.
    if (amount > 0 && amount !== parseDecimalOr(candidate.amount, 0)) body.amount = String(amount);
    if (day !== '' && day !== toLedgerDate(new Date(candidate.occurred_at))) {
      body.occurred_at = toLedgerNoonIso(day);
    }
    if (shownType !== candidate.type) body.type = shownType;
    if (categoryId !== (candidate.category_id ?? null)) body.category_id = categoryId;
    Object.assign(body, assetDraft());
    // 지출이 아닌 종류에는 뜻이 없다. 서버도 버리는 값이라 여기서도 안 보낸다.
    const nextMethod = type === 'expense' ? method : null;
    if (nextMethod !== candidate.payment_method) body.payment_method = nextMethod;

    return body;
  }

  /**
   * 저축·투자 칸. 어디에가 바뀌면 쪽과 수량도 함께 보낸다(앞 항목의 수량이 남으면 저장에서 막힌다).
   * 저축·투자를 그냥 이체로 돌리면 어디에를 비운다. 지출과 수입으로 가면 서버가 비운다.
   */
  function assetDraft(): ImportCandidatePatch {
    const savedKey = candidate.asset_item_key ?? null;
    if (type !== 'save') {
      return type === 'transfer' && savedKey != null ? { asset_item_key: null } : {};
    }
    if (destKey == null) return savedKey == null ? {} : { asset_item_key: null };
    const body: ImportCandidatePatch = {};
    const moved = destKey !== savedKey;
    if (moved) body.asset_item_key = destKey;
    // 어디에를 못 정해 꺼 둔 줄은 고르면 켠다. 수량이 비면 저장에서 막혀 켜지 않는다.
    const turnOn = isUnpickedSaving(candidate) && !candidate.is_selected;
    // 목록을 아직 못 받았으면 적혀 있던 쪽과 수량을 그대로 둔다.
    if (pickedDest == null) return body;
    // 수량 종목만 쪽을 고른다. 나머지는 어디에가 그대로면 적혀 있던 쪽을 둔다.
    const savedSide: Side = candidate.asset_side ?? 'buy';
    const nextSide: Side = byQuantity ? side : moved ? 'buy' : savedSide;
    if (moved || nextSide !== savedSide) body.asset_side = nextSide;
    const nextQty = byQuantity ? quantityValue(qty) : null;
    if (moved || parseQuantity(nextQty) !== parseQuantity(candidate.asset_quantity)) {
      body.asset_quantity = nextQty;
    }
    if (turnOn && (!byQuantity || nextQty != null)) body.is_selected = true;
    return body;
  }

  /*
    바깥이 마지막 값을 가져갈 수 있게 함수를 걸어 둔다.
    값이 바뀔 때마다 다시 걸어야 최신 상태를 읽는 함수가 올라간다. 폼이 사라지면 뗀다.
  */
  useEffect(() => {
    onDraftChange(draft);
    return () => onDraftChange(null);
  });

  function toggleEditor(next: Editor): void {
    setEditor((current) => (current === next ? null : next));
  }

  const composeSlot: CategoryComposeSlot = {
    open: creating && (type === 'expense' || type === 'income'),
    kind: type === 'income' ? 'income' : 'expense',
    onBack: () => setCreating(false),
    onCreated: (created) => {
      setCategoryId(created.id);
      setCreating(false);
      setEditor(null);
    },
  };

  return (
    <>
      <div className="nl-item__meta">
        <DayChip
          day={day}
          open={editor === 'date'}
          disabled={disabled}
          onClick={() => toggleEditor('date')}
        />
        {type === 'save' ? null : (
          <CategorySlot
            type={shownType}
            category={picked}
            open={editor === 'category'}
            disabled={disabled}
            onClick={() => toggleEditor('category')}
          />
        )}
        <RowFlags candidate={candidate} future={future} />
      </div>

      {/* 저축·투자는 분류 자리에 「어디에」. 고르면 한 줄로 접히고 누르면 다시 펼쳐진다. */}
      {type === 'save' ? (
        <div className="nl-item__editor">
          <AssetDestField
            destinations={destinations}
            value={pickedDest}
            onPick={({ dest: next }) => {
              if (next.type === 'item') setDestKey(next.itemKey);
            }}
            onOther={() => setDestOpen(true)}
          />
        </div>
      ) : null}

      {editor === 'date' ? (
        <DayEditor
          day={day}
          disabled={disabled}
          onPick={(next) => {
            setDay(next);
            setEditor(null);
          }}
        />
      ) : null}

      {/*
        분류 칩 바로 아래에 연다. 하나를 고르면 적용되고 격자는 저절로 닫힌다.
        「관리 › 카테고리 관리」 안내는 여기서 뺀다. 잠깐 열어 하나 고르는 자리다.
      */}
      {editor === 'category' && pickable.length > 0 ? (
        <CategoryPicker
          className="nl-form__cats nl-item__editor"
          size="sm"
          categories={pickable}
          selectedId={categoryId}
          disabled={disabled}
          manageNote={false}
          onPick={(item) => {
            setCategoryId(item.id);
            setEditor(null);
          }}
          onCreate={renderCompose === null ? undefined : () => setCreating(true)}
          onExpand={() =>
            analytics.log(
              EVENTS.categoryMoreOpened,
              { where: 'review', shown: pickable.length },
              { flowId, kind: 'click' },
            )
          }
        />
      ) : null}

      <RowNotices
        candidate={candidate}
        categories={categories}
        future={future}
        expenseOnly={expenseOnly}
        disabled={disabled}
        onKindChange={onKindChange}
      />

      <div className="nl-form">
        {/*
          상호는 한 줄을 다 쓴다. 금액과 나란히 두었더니 금액칸이 제 몫보다 넓게 자라
          상호가 115px 까지 좁아졌다(글자 서너 자). 가게 이름은 이 폼에서 가장 길게 적는 값이다.
        */}
        <label className="nl-form__field">
          <span className="nl-form__label">상호</span>
          <input
            className="nl-form__input"
            value={merchant}
            onChange={(event) => setMerchant(event.target.value)}
            placeholder="어디서 썼나요"
            maxLength={120}
          />
        </label>

        <AmountField variant="compact" label="금액" value={digits} onChange={setDigits} />

        {expenseOnly ? null : (
          <SegmentedControl
            className="nl-form__types"
            options={TYPES}
            value={type}
            onChange={(next: RowKind) => {
              setType(next);
              // 종류가 바뀌면 고른 분류가 그 종류의 것이 아닐 수 있다. 남겨 두면 수입이
              // '식비' 로 저장된다. 이체는 집계 밖이라 분류를 아예 두지 않는다.
              setCategoryId((current) =>
                pickableFor(next, categories).some((item) => item.id === current) ? current : null,
              );
              // 열어 둔 격자는 새 종류의 분류로 바뀐다. 이체는 고를 분류가 없어 닫는다.
              if (next === 'transfer' || next === 'save') {
                setEditor((current) => (current === 'category' ? null : current));
              }
            }}
            ariaLabel="종류"
          />
        )}

        {/* 주식, ETF, 코인은 넣었나 팔았나와 수량을 받는다. 수량이 없으면 저장에서 막힌다. */}
        {byQuantity ? (
          <>
            <SegmentedControl
              className="nl-form__types"
              options={SIDES}
              value={side}
              onChange={setSide}
              ariaLabel="넣었나 팔았나"
            />
            <label className="nl-form__field">
              <span className="nl-form__label">수량</span>
              <input
                className="nl-form__input"
                inputMode="decimal"
                autoComplete="off"
                value={qty}
                placeholder={`0${unitOf(pickedDest.item.kind)}`}
                onChange={(event) => setQty(sanitizeQuantityInput(event.target.value))}
              />
            </label>
          </>
        ) : null}

        {/* 지출에만 선다. 수입·이체에는 결제 수단이라는 것이 없다. */}
        {type === 'expense' && !expenseOnly ? (
          <PaymentMethodPicker
            className="nl-form__pay"
            value={method}
            disabled={disabled}
            onChange={setMethod}
          />
        ) : null}

        {/*
          짧아진 폼의 끝. 펼치자마자 보이는 자리라 위에서 고치고 바로 누른다.
          안 눌러도 고친 것은 남는다(접기·다른 줄·한 번에 바꾸기·저장이 먼저 보낸다).
        */}
        <Button
          className="nl-form__done"
          variant="outline"
          fullWidth
          disabled={!canSave}
          onClick={() => onSave(draft())}
        >
          완료
        </Button>
      </div>

      {/*
        기억할지 묻는 칸은 「완료」 아래다. 분류 칩 아래에 두면 칸 높이만큼 「완료」 가 내려가
        「펼치자마자 「완료」 까지 한눈에」 가 깨진다. 「완료」 로 줄을 접어도 칸은 그 줄에 남는다.
      */}
      {ruleSlot}

      {/*
        새 분류 만들기. **화면을 통째로 덮는 한 장으로 연다.**

        검토 줄 한가운데에 끼워 넣으면 「저장」 이 상자 안쪽 어딘가에 있고, 아이콘 격자를
        펴면 화면 밖으로 밀렸다. 고치던 상호·금액·날짜는 뒤에 그대로 살아 있다.
      */}
      {renderCompose === undefined ? (
        <CategoryComposeOverlay
          open={composeSlot.open}
          fixedKind={composeSlot.kind}
          onBack={composeSlot.onBack}
          onClose={composeSlot.onBack}
          onCreated={composeSlot.onCreated}
        />
      ) : renderCompose === null ? null : (
        renderCompose(composeSlot)
      )}

      {/* 「다른 곳」. 후보 고치기는 새 항목을 못 받아 「새 종목이나 통장」 은 두지 않는다. */}
      <AssetDestPage
        open={destOpen}
        allowNew={false}
        destinations={destinations}
        value={pickedDest}
        onPick={({ dest: next }) => {
          if (next.type === 'item') setDestKey(next.itemKey);
          setDestOpen(false);
        }}
        onBack={() => setDestOpen(false)}
      />
    </>
  );
}

/**
 * 날짜 칩 아래 열리는 칸. 열리자마자 기기 달력을 띄운다.
 *
 * 값은 칸이 들고 있다가 **제대로 된 날이 들어올 때만** 올리고 닫는다. 연도를 치는
 * 중간(`0002`)이 폼에 올라가 칩 글자가 흔들리지 않게 한다. 비운 채 닫는 기기도 있어
 * 빈 값은 무시한다. 그러면 원래 날이 그대로 남는다.
 */
function DayEditor({
  day,
  disabled,
  onPick,
}: {
  day: string;
  disabled: boolean;
  onPick: (day: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = ref.current;
    if (input == null) return;
    input.focus({ preventScroll: true });
    if (typeof input.showPicker !== 'function') return;
    try {
      input.showPicker();
    } catch {
      // 누른 손길이 식었거나 못 띄우는 기기다. 칸이 열려 있으니 눌러서 고르면 된다.
    }
  }, []);

  // 칸은 줄 폭을 다 쓴다. 날짜 칸 폭은 기기가 정해서, 좁은 자리에 두면 iOS 에서 삐져나간다.
  return (
    <div className="nl-item__editor">
      <input
        ref={ref}
        className="nl-form__input pk-date"
        type="date"
        aria-label="날짜"
        min={DAY_MIN}
        max={DAY_MAX}
        defaultValue={day}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          if (next !== '' && isDayInRange(next)) onPick(next);
        }}
      />
    </div>
  );
}
