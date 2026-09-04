import { useState } from 'react';

import {
  type CategoryOut,
  type ImportCandidateOut,
  type ImportCandidatePatch,
  type TransactionType,
  parseDecimalOr,
} from '../../shared/api';
import {
  formatCurrency,
  formatDayLabel,
  toLedgerDate,
  toLedgerNoonIso,
} from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import {
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
  onEdit,
  onEditClose,
  onSave,
}: CandidateRowProps) {
  const name = candidate.merchant ?? '이름 없음';
  const category = categories.find((item) => item.id === candidate.category_id);
  const amount = parseDecimalOr(candidate.amount, 0);

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
          <span className="nl-item__name">{name}</span>
        </label>

        <span
          className={
            candidate.is_low_confidence
              ? 'nl-item__amount nl-item__amount--unsure'
              : 'nl-item__amount'
          }
          data-testid={TEST_IDS.nlCandidateAmount}
        >
          {formatCurrency(amount)}
        </span>
      </div>

      <div className="nl-item__meta">
        <span data-testid={TEST_IDS.nlCandidateDate}>
          {formatDayLabel(toLedgerDate(new Date(candidate.occurred_at)))}
        </span>
        <span className="nl-item__dot" aria-hidden="true">
          ·
        </span>
        <span>{category?.name ?? '분류 없음'}</span>
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

interface CandidateFormProps {
  candidate: ImportCandidateOut;
  categories: CategoryOut[];
  disabled: boolean;
  onSave: (body: ImportCandidatePatch) => void;
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
          // 지출 분류는 지출에만 붙는다. 남겨 두면 수입이 '식비' 로 저장된다.
          if (next !== 'expense') setCategoryId(null);
        }}
        ariaLabel="종류"
      />

      {type === 'expense' ? (
        <div className="nl-form__cats" role="group" aria-label="분류">
          {categories.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === categoryId ? 'nl-form__cat nl-form__cat--on' : 'nl-form__cat'}
              aria-pressed={item.id === categoryId}
              onClick={() => setCategoryId(item.id)}
            >
              <CategoryAvatar icon={toIconName(item.icon_key)} size={22} />
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
