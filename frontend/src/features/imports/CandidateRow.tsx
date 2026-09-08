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

  return (
    <li className="nl-item" data-testid={TEST_IDS.nlCandidateRow}>
      <div className="nl-item__head">
        <label className="nl-item__pick">
          <input
            type="checkbox"
            checked={candidate.is_selected}
            disabled={disabled}
            onChange={(event) => onToggle(event.target.checked)}
          />
          <CategoryAvatar icon={toIconName(category?.icon_key)} size={52} />
          <span className="nl-item__name">{name}</span>
        </label>

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
        ) : (
          <span className="nl-item__kind nl-item__kind--fixed">이체</span>
        )}
        {candidate.is_duplicate ? <Chip variant="caution">이미 있어요</Chip> : null}
        {candidate.is_low_confidence ? <Chip variant="caution">확인 필요</Chip> : null}
        <button
          type="button"
          className="nl-item__edit"
          disabled={disabled}
          onClick={editing ? onEditClose : onEdit}
        >
          {editing ? '접기' : '고치기'}
        </button>
      </div>

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
      <div className="nl-form__fields">
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
      </div>

      <label className="nl-form__field">
        <span className="nl-form__label">날짜</span>
        <input
          className="nl-form__input"
          type="date"
          value={day}
          onChange={(event) => setDay(event.target.value)}
        />
      </label>

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
