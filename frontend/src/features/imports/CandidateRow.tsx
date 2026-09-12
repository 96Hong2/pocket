import { useState } from 'react';

import {
  type CategoryOut,
  type ImportCandidateOut,
  type ImportCandidatePatch,
  type TransactionType,
  parseDecimalOr,
} from '../../shared/api';
import { categoriesOfKind, type LedgerKind } from '../../shared/ledger';
import { formatDayLabel, toLedgerDate, toLedgerNoonIso } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import {
  Amount,
  AmountField,
  Button,
  CategoryAvatar,
  Chip,
  SegmentedControl,
  toIconName,
  type SegmentedOption,
} from '../../shared/ui';

/**
 * 고를 수 있는 종류.
 *
 * 환불은 없다. 되돌릴 지출을 함께 골라야 하는데 그 자리가 아직 없다.
 * 대상 없는 환불을 저장하면 쓴 적 없는 돈이 남은 예산으로 돌아온다.
 */
const TYPES: SegmentedOption<TransactionType>[] = [
  { value: 'expense', label: '지출' },
  { value: 'income', label: '수입' },
  { value: 'transfer', label: '이체' },
];

export interface CandidateRowProps {
  candidate: ImportCandidateOut;
  categories: CategoryOut[];
  /** 지금 이 줄을 펼쳐 고치는 중인가. 한 번에 하나만 열린다. */
  editing: boolean;
  disabled: boolean;
  onToggle: (selected: boolean) => void;
  /** 줄을 펴지 않고 지출·수입만 바꾼다. 읽어 온 종류가 틀린 것이 가장 흔한 손질이라 밖에 둔다. */
  onKindChange: (body: ImportCandidatePatch) => void;
  onEdit: () => void;
  onEditClose: () => void;
  onSave: (body: ImportCandidatePatch) => void;
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
  editing,
  disabled,
  onToggle,
  onKindChange,
  onEdit,
  onEditClose,
  onSave,
}: CandidateRowProps) {
  const name = candidate.merchant ?? '이름 없음';
  const category = categories.find((item) => item.id === candidate.category_id);
  const amount = parseDecimalOr(candidate.amount, 0);
  // 이체는 여기서 못 바꾼다. 분류가 없는 종류라 한 번 누르는 것으로 오갈 수 없다.
  const swap: LedgerKind | null =
    candidate.type === 'expense' ? 'income' : candidate.type === 'income' ? 'expense' : null;
  /*
    환불로 읽힌 줄.

    되돌릴 지출을 함께 골라야 저장할 수 있는데 그 자리가 아직 없다. 그래서 이 줄은 켤 수
    없고, 예전에는 그 사실을 어디에도 적지 않은 채 '이체' 라고만 보여 줬다. 카드 캐시백이
    여기 걸려서, 왜 저장이 안 되는지 알 길이 없었다.

    지금은 두 가지를 한 자리에서 말한다: 왜 못 켜는지, 그리고 무엇을 하면 되는지.
    캐시백·환급처럼 실제로 들어온 돈이면 수입으로 바꿔 한 번에 저장한다.
  */
  const isRefund = candidate.type === 'refund';

  return (
    <li className="nl-item" data-testid={TEST_IDS.nlCandidateRow}>
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
            disabled={disabled || isRefund}
            onChange={(event) => onToggle(event.target.checked)}
          />
        </label>

        <button
          type="button"
          className="nl-item__open"
          disabled={disabled}
          aria-expanded={editing}
          onClick={editing ? onEditClose : onEdit}
        >
          <CategoryAvatar icon={toIconName(category?.icon_key)} size={52} />
          <span className="nl-item__name">{name}</span>
          {/*
            종류를 숫자로 드러낸다. 수입은 앞에 + 가 붙고 색이 갈린다.
            아래 메타 줄의 분류만으로는 이게 들어온 돈인지 나간 돈인지 알 수 없었다.
          */}
          <Amount
            className={candidate.is_low_confidence ? 'nl-item__amount--unsure' : undefined}
            value={amount}
            tone={candidate.type}
            size={17}
            data-testid={TEST_IDS.nlCandidateAmount}
          />
          <Caret open={editing} />
          <span className="nl-item__sr">, 눌러서 고치기</span>
        </button>
      </div>

      <div className="nl-item__meta">
        <span data-testid={TEST_IDS.nlCandidateDate}>
          {formatDayLabel(toLedgerDate(new Date(candidate.occurred_at)))}
        </span>
        <span className="nl-item__dot" aria-hidden="true">
          ·
        </span>
        <span>{category?.name ?? '분류 없음'}</span>
        {/*
          읽어 온 종류를 겉으로 드러내고 한 번에 바꾼다. 예전에는 '고치기' 를 펴야 보였는데,
          사진과 문장에서 가장 자주 틀리는 값이 이것이라 그 자리가 너무 멀었다.
        */}
        {/*
          줄을 펼치면 아래 폼에 지출·수입·이체 세 칸짜리가 나온다. 그때 이 버튼까지 두면
          같은 값을 고치는 자리가 한 화면에 둘이라 어느 쪽이 진짜인지 헷갈린다.
          접혀 있을 때만 보여 준다.
        */}
        {editing ? null : swap != null ? (
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
        ) : (
          <span className="nl-item__kind nl-item__kind--fixed">{KIND_LABEL[candidate.type]}</span>
        )}
        {candidate.is_duplicate ? <Chip variant="caution">이미 있어요</Chip> : null}
        {candidate.is_low_confidence && !isRefund ? <Chip variant="caution">확인 필요</Chip> : null}
      </div>

      {isRefund ? (
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

      {editing ? (
        <CandidateForm
          // 대상이 바뀌면 새로 마운트한다. 앞 줄의 값이 남지 않는다.
          key={candidate.id}
          candidate={candidate}
          categories={categories}
          disabled={disabled}
          onSave={onSave}
        />
      ) : null}
    </li>
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

/** 화면에 보이는 말. 종류 값을 문자열로 바로 쓰면 화면마다 다른 말이 생긴다. */
const KIND_LABEL: Record<TransactionType, string> = {
  expense: '지출',
  income: '수입',
  transfer: '이체',
  refund: '환불',
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
  disabled: boolean;
  onSave: (body: ImportCandidatePatch) => void;
}

/** 그 종류로 고를 수 있는 분류. 이체는 집계에서 빠지므로 분류를 두지 않는다. */
function pickableFor(type: TransactionType, categories: CategoryOut[]): CategoryOut[] {
  if (type === 'expense' || type === 'income') {
    return categories.filter((item) => item.kind === type);
  }
  return [];
}

function CandidateForm({ candidate, categories, disabled, onSave }: CandidateFormProps) {
  const [merchant, setMerchant] = useState(candidate.merchant ?? '');
  const [digits, setDigits] = useState(String(parseDecimalOr(candidate.amount, 0)));
  const [day, setDay] = useState(toLedgerDate(new Date(candidate.occurred_at)));
  const [type, setType] = useState<TransactionType>(candidate.type);
  const [categoryId, setCategoryId] = useState<string | null>(candidate.category_id ?? null);

  const amount = Number(digits);
  const canSave = digits !== '' && amount > 0 && day !== '' && !disabled;

  function submit(): void {
    const body: ImportCandidatePatch = {};
    const trimmed = merchant.trim();

    if (trimmed !== (candidate.merchant ?? '')) body.merchant = trimmed === '' ? null : trimmed;
    if (amount !== parseDecimalOr(candidate.amount, 0)) body.amount = String(amount);
    if (day !== toLedgerDate(new Date(candidate.occurred_at))) {
      body.occurred_at = toLedgerNoonIso(day);
    }
    if (type !== candidate.type) body.type = type;
    if (categoryId !== (candidate.category_id ?? null)) body.category_id = categoryId;

    onSave(body);
  }

  return (
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

      <div className="nl-form__fields">
        <AmountField variant="compact" label="금액" value={digits} onChange={setDigits} />
        <label className="nl-form__field">
          <span className="nl-form__label">날짜</span>
          <input
            className="nl-form__input pk-date"
            type="date"
            value={day}
            onChange={(event) => setDay(event.target.value)}
          />
        </label>
      </div>

      <SegmentedControl
        className="nl-form__types"
        options={TYPES}
        value={type}
        onChange={(next) => {
          setType(next);
          // 종류가 바뀌면 고른 분류가 그 종류의 것이 아닐 수 있다. 남겨 두면 수입이
          // '식비' 로 저장된다. 이체는 집계 밖이라 분류를 아예 두지 않는다.
          setCategoryId((current) =>
            pickableFor(next, categories).some((item) => item.id === current) ? current : null,
          );
        }}
        ariaLabel="종류"
      />

      {/* 수입도 어디서 온 돈인지 고를 수 있어야 한다. 이체만 분류가 없다. */}
      {type === 'expense' || type === 'income' ? (
        <div className="nl-form__cats" role="group" aria-label="분류">
          {pickableFor(type, categories).map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === categoryId ? 'nl-form__cat nl-form__cat--on' : 'nl-form__cat'}
              aria-pressed={item.id === categoryId}
              onClick={() => setCategoryId(item.id)}
            >
              <CategoryAvatar icon={toIconName(item.icon_key)} size={32} />
              {item.name}
            </button>
          ))}
        </div>
      ) : null}

      <Button className="nl-form__done" fullWidth disabled={!canSave} onClick={submit}>
        이대로 고치기
      </Button>
    </div>
  );
}
