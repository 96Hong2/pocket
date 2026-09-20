import { useId, useState } from 'react';
import { Link } from 'react-router';

import { ROUTES } from '../../app/router/routes';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import {
  ApiError,
  parseDecimalOr,
  useCategories,
  useCreateRecurring,
  useNotificationSettings,
  useTags,
  useUpdateRecurring,
  type RecurringOut,
} from '../../shared/api';
import { CategoryPicker, PaymentMethodPicker } from '../../shared/ledger';
import { formatDayLabel } from '../../shared/lib/format';
import { AmountField, Button, SegmentedControl, Select } from '../../shared/ui';
import { REMIND_AT_DEFAULT } from '../notifications';
import { TagPicker } from '../tags';

/** 매달 며칟날. 31일까지 받고, 그 날짜가 없는 달은 서버가 마지막 날로 당긴다. */
const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

/** 며칠 전에 알릴까. 서버(`app/domain/recurring.py`)와 같은 값이다. */
type Lead = '0' | '1';

const LEADS: { value: Lead; label: string }[] = [
  { value: '0', label: '당일' },
  { value: '1', label: '전날' },
];

/**
 * 반복 지출을 만들고 고치는 폼.
 *
 * 받는 것은 이름·금액·며칟날 셋이다. 분류·태그·결제수단은 곁들이는 값이라 안 골라도 된다.
 * 주기를 고르는 자리는 두지 않았다. 매달이 아닌 것을 여기서 받기 시작하면 폼이 길어지고,
 * 그걸 채우느니 손으로 적는 쪽이 빠르다.
 *
 * **언제 적히는지를 굵게 적는다.** 「매달 31일」 이라고만 적혀 있으면 2월에 무슨 일이
 * 나는지 아무도 모른다. 고른 값으로 다음 날짜를 그 자리에서 계산해 보여 준다.
 *
 * 알림은 둘을 고른다: 몇 시에(비우면 기록 알림 시각을 따른다)와 며칠 전에(기본은 당일).
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
  const timeId = useId();
  const analytics = useAnalytics();
  const categories = useCategories();
  const tags = useTags();
  const notifications = useNotificationSettings();
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
  const [remindAt, setRemindAt] = useState(item?.remind_at ?? '');
  const [lead, setLead] = useState<Lead>(String(item?.remind_lead_days ?? 0) === '1' ? '1' : '0');

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
  // 알림을 아예 꺼 둔 사람에게는 시각을 정해도 아무 일이 안 난다. 그 사실을 적는다.
  const notifyOff = notifications.data?.is_enabled === false;
  const fallbackAt = notifications.data?.remind_at ?? REMIND_AT_DEFAULT;

  const next = nextDates(Number(day), Number(lead));

  function save(): void {
    if (!canSave) return;
    const body = {
      name: trimmed,
      amount: String(amount),
      day_of_month: Number(day),
      category_id: categoryId,
      tag_id: tagId,
      payment_method: method,
      remind_at: remindAt === '' ? null : remindAt,
      remind_lead_days: Number(lead),
    };
    if (item != null) {
      update.mutate({ id: item.id, body }, { onSuccess: () => done('updated') });
      return;
    }
    create.mutate(body, { onSuccess: () => done('created') });
  }

  /**
   * 서버가 받아 준 뒤에만 센다.
   *
   * 항목 이름과 금액은 안 싣는다. 대신 **알림을 켰는지와 며칠 전인지**를 남긴다.
   * 「곧 나갈 돈」 카드는 알림을 켠 사람에게만 뜨므로, 그 카드의 반응을 읽으려면
   * 분모가 되는 이 값이 있어야 한다.
   */
  function done(action: 'created' | 'updated'): void {
    analytics.log(
      EVENTS.recurringChanged,
      { action, notify: remindAt !== '', lead: Number(lead), tagged: tagId != null },
      { kind: 'click' },
    );
    onDone();
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
        label="매달"
        placeholder="날짜 고르기"
        value={day}
        disabled={busy}
        options={DAYS.map((value) => ({ value: String(value), label: `${value}일` }))}
        // 날짜는 비울 수 없다. 비우면 언제 알릴지가 사라진다.
        onChange={(nextDay) => setDay(nextDay ?? day)}
      />

      <div className="recurring-form__field">
        <span className="recurring-form__label">알림</span>
        <SegmentedControl
          options={LEADS}
          value={lead}
          ariaLabel="언제 알릴까요"
          onChange={setLead}
        />
        <div className="recurring-form__time">
          <label className="recurring-form__time-label" htmlFor={timeId}>
            알림 시각
          </label>
          <input
            id={timeId}
            className="recurring-form__time-input"
            type="time"
            value={remindAt}
            disabled={busy}
            onChange={(event) => setRemindAt(event.target.value)}
          />
        </div>
        <p className="recurring-form__hint">
          {remindAt === ''
            ? `안 정하면 기록 알림 시각(${fallbackAt})에 알려드려요`
            : '이 예고만 이 시각에 알려드려요'}
        </p>
      </div>

      {/*
        **언제 적히는지를 굵게 적는다.** 「매달 31일」 만으로는 2월에 무슨 일이 나는지
        모른다. 고른 값으로 다음 두 날짜를 그 자리에서 세어 보여 준다.
      */}
      <p className="recurring-form__next">
        다음은 <b>{formatDayLabel(next.dueOn)}</b>에 적어요
        {next.remindOn !== next.dueOn ? (
          <>
            {' · '}
            알림은 <b>{formatDayLabel(next.remindOn)}</b>
          </>
        ) : null}
        {next.shifted ? <span className="recurring-form__shift">{next.shiftNote}</span> : null}
      </p>

      {notifyOff ? (
        <p className="recurring-form__hint">
          지금은 알림이 꺼져 있어요.{' '}
          <Link to={ROUTES.notifications}>알림 설정</Link>에서 켜면 이 시각에 알려드려요
        </p>
      ) : null}

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
        where="recurring"
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

/**
 * 고른 값으로 다음 지출일과 알림일을 센다.
 *
 * **서버와 같은 규칙이다**(`app/domain/recurring.py`): 그 달에 없는 날짜는 마지막 날로
 * 당긴다. 저장하기 전에는 서버가 준 값이 없어 화면이 세는 수밖에 없고, 저장한 뒤로는
 * 목록이 서버가 준 `next_due_on` 을 쓴다.
 */
function nextDates(day: number, lead: number): {
  dueOn: string;
  remindOn: string;
  shifted: boolean;
  shiftNote: string;
} {
  const today = new Date();
  const due = dueDateIn(today.getFullYear(), today.getMonth(), day);
  // 이번 달 날짜가 지났으면 다음 달이다. 시·분은 보지 않는다.
  const passed = due < isoOf(today);
  const base = passed ? shiftToNextMonth(today) : today;
  const dueOn = dueDateIn(base.getFullYear(), base.getMonth(), day);
  const remindOn = shiftIso(dueOn, -lead);
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  return {
    dueOn,
    remindOn,
    shifted: day > lastDay,
    shiftNote: ` (${day}일이 없는 달이라 마지막 날에 적어요)`,
  };
}

/** 그 달의 실제 지출일. 없는 날짜는 마지막 날로 당긴다. */
function dueDateIn(year: number, monthIndex: number, day: number): string {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return isoOfParts(year, monthIndex + 1, Math.min(day, lastDay));
}

function shiftToNextMonth(from: Date): Date {
  return new Date(from.getFullYear(), from.getMonth() + 1, 1);
}

/**
 * `2026-09-25` 에서 며칠 옮긴 날.
 *
 * **문자열로만 센다.** `toISOString()` 은 KST 자정을 UTC 로 밀어 하루씩 어긋난다.
 */
function shiftIso(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const moved = new Date(year, month - 1, day + days);
  return isoOfParts(moved.getFullYear(), moved.getMonth() + 1, moved.getDate());
}

function isoOf(value: Date): string {
  return isoOfParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
}

function isoOfParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
