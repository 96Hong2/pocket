import { useId, useState } from 'react';

import {
  ApiError,
  parseDecimalOr,
  useCategories,
  useCreateRecurring,
  useTags,
  useUpdateRecurring,
  type RecurringOut,
} from '../../shared/api';
import { CategoryPicker, PaymentMethodPicker } from '../../shared/ledger';
import { AmountField, Button, Select } from '../../shared/ui';
import { TagPicker } from '../tags';

/** 매달 며칟날. 31일까지 받고, 그 달에 없으면 서버가 말일로 당긴다. */
const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

/**
 * 반복 지출을 만들고 고치는 폼.
 *
 * 받는 것은 이름·금액·며칟날 셋이다. 분류·태그·결제수단은 곁들이는 값이라 안 골라도 된다.
 * 주기를 고르는 자리는 두지 않았다. 매달이 아닌 것을 여기서 받기 시작하면 폼이 길어지고,
 * 그걸 채우느니 손으로 적는 쪽이 빠르다.
 *
 * **처음 값은 마운트할 때 한 번만 읽는다.** 부르는 쪽이 `key` 로 대상이 바뀐 것을 알려 준다.
 */
export interface RecurringFormProps {
  /** 고칠 것. 없으면 새로 만든다. */
  item?: RecurringOut;
  onDone: () => void;
  onCancel: () => void;
}

export function RecurringForm({ item, onDone, onCancel }: RecurringFormProps) {
  const nameId = useId();
  const categories = useCategories();
  const tags = useTags();
  const create = useCreateRecurring();
  const update = useUpdateRecurring();

  const [name, setName] = useState(item?.name ?? '');
  const [digits, setDigits] = useState(
    item == null ? '' : String(parseDecimalOr(item.amount, 0)),
  );
  const [day, setDay] = useState(String(item?.day_of_month ?? 1));
  const [categoryId, setCategoryId] = useState<string | null>(item?.category_id ?? null);
  const [tagId, setTagId] = useState<string | null>(item?.tag_id ?? null);
  const [method, setMethod] = useState(item?.payment_method ?? null);

  const busy = create.isPending || update.isPending;
  const amount = Number(digits);
  const trimmed = name.trim();
  const canSave = trimmed !== '' && digits !== '' && amount > 0 && !busy;

  const failure = create.error ?? update.error;
  const message =
    failure instanceof ApiError
      ? failure.message
      : failure != null
        ? '반복 지출을 저장하지 못했어요.'
        : null;

  // 반복 지출로 만드는 기록은 늘 지출이다. 수입 분류·수입 태그는 보여 주지 않는다.
  const pickable = (categories.data?.items ?? []).filter((row) => row.kind === 'expense');

  function save(): void {
    if (!canSave) return;
    const body = {
      name: trimmed,
      amount: String(amount),
      day_of_month: Number(day),
      category_id: categoryId,
      tag_id: tagId,
      payment_method: method,
    };
    if (item != null) {
      update.mutate({ id: item.id, body }, { onSuccess: onDone });
      return;
    }
    create.mutate(body, { onSuccess: onDone });
  }

  return (
    <div className="recurring-form">
      <div className="recurring-form__field">
        <label className="recurring-form__label" htmlFor={nameId}>
          무엇이 나가나요
        </label>
        <input
          id={nameId}
          className="recurring-form__input"
          value={name}
          maxLength={120}
          placeholder="예: 넷플릭스"
          autoComplete="off"
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <AmountField label="금액" value={digits} onChange={setDigits} />

      <Select
        label="매달 며칟날"
        placeholder="날짜 고르기"
        value={day}
        disabled={busy}
        options={DAYS.map((value) => ({ value: String(value), label: `${value}일` }))}
        // 날짜는 비울 수 없다. 비우면 언제 알릴지가 사라진다.
        onChange={(next) => setDay(next ?? day)}
        /* 31일을 고른 사람에게 2월에 무슨 일이 나는지 미리 말해 준다. */
        hint={Number(day) > 28 ? '그 날짜가 없는 달에는 마지막 날에 알려드려요' : undefined}
      />

      <div className="recurring-form__field">
        <span className="recurring-form__label">카테고리 (선택)</span>
        <CategoryPicker
          categories={pickable}
          disabled={busy}
          selectedId={categoryId}
          // 누른 것을 다시 누르면 뗀다. 안 고르는 것도 답이라 되무를 길을 둔다.
          onPick={(picked) => setCategoryId(picked.id === categoryId ? null : picked.id)}
        />
      </div>

      <TagPicker
        kind="expense"
        tags={tags.data?.items ?? []}
        selectedId={tagId}
        disabled={busy}
        onChange={setTagId}
      />

      <PaymentMethodPicker value={method} disabled={busy} onChange={setMethod} />

      {message ? (
        <p className="recurring-form__notice" role="alert">
          {message}
        </p>
      ) : null}

      <div className="recurring-form__actions">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          취소
        </Button>
        <Button fullWidth onClick={save} disabled={!canSave}>
          {item != null ? '고치기' : '만들기'}
        </Button>
      </div>
    </div>
  );
}
