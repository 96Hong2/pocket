import { useEffect, useId, useRef, useState, type MutableRefObject } from 'react';

import { useOverlayBackClose, useToast } from '../../app/providers';
import {
  EVENTS,
  useAnalytics,
  type AssetChangeField,
  type AssetKindLog,
  type ItemAction,
} from '../../shared/analytics';
import {
  ApiError,
  parseDecimalOr,
  useSaveAssets,
  type AssetGroup,
  type AssetItemIn,
  type AssetItemOut,
  type InvestKind,
} from '../../shared/api';
import { AmountField, BottomSheet, Button, LeaveConfirm, Toggle } from '../../shared/ui';

import { ASSET_GROUP_VIEWS, assetGroupLabel } from './assetGroups';
import {
  holdingOf,
  INVEST_KIND_LABEL,
  INVEST_KINDS,
  sanitizeQuantityInput,
  unitOf,
  type Holding,
} from './assetView';
import { SheetBackHead } from './SheetBackHead';

/** 열려 있으면 대상이 있다. `sortOrder` 가 null 이면 새로 더하는 중이다. */
export interface AssetItemTarget {
  sortOrder: number | null;
  /** 새로 더할 때 미리 골라 둘 그룹. 고칠 때는 그 줄의 그룹이 들어온다. */
  group: AssetGroup;
}

export interface AssetItemSheetProps {
  target: AssetItemTarget | null;
  /**
   * 지금 저장돼 있는 목록 전체.
   * 저장은 목록을 통째로 보내는 PUT 하나뿐이라, 이 목록에 한 줄을 얹거나 갈거나 빼서 보낸다.
   */
  items: AssetItemOut[];
  onClose: () => void;
}

/** 자산 항목 시트. 더하기와 고치기가 같은 시트다. */
export function AssetItemSheet({ target, items, onClose }: AssetItemSheetProps) {
  const toast = useToast();
  // 저장 응답을 기다리는 동안에는 닫히지 않는다. 닫히면 실패를 그릴 자리가 없어진다.
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState(false);
  const dirtyRef = useRef(false);

  function close(): void {
    dirtyRef.current = false;
    setAsking(false);
    onClose();
  }

  function requestClose(): void {
    if (saving || asking) return;
    if (dirtyRef.current) {
      setAsking(true);
      return;
    }
    close();
  }

  useOverlayBackClose(target != null, requestClose, saving);

  const editing = target?.sortOrder ?? null;

  return (
    <BottomSheet
      open={target != null}
      onClose={requestClose}
      dismissible={!saving}
      ariaLabel={
        editing == null && target != null
          ? `${assetGroupLabel(target.group)} 항목 추가`
          : '자산 항목 고치기'
      }
      size="tall"
      className="asset-sheet"
    >
      {target != null ? (
        <AssetItemForm
          // 대상이 바뀌면 새로 마운트한다. 앞 항목의 값이 남지 않는다.
          key={editing ?? `new-${target.group}`}
          target={target}
          items={items}
          dirtyRef={dirtyRef}
          onSavingChange={setSaving}
          onBack={requestClose}
          onDone={(text) => {
            close();
            toast.show({ text });
          }}
        />
      ) : null}
      {asking ? (
        <LeaveConfirm
          text="고친 것이 사라져요. 그만둘까요?"
          stayLabel="계속 고치기"
          onStay={() => setAsking(false)}
          onLeave={close}
        />
      ) : null}
    </BottomSheet>
  );
}

interface FormState {
  group: AssetGroup;
  kind: InvestKind | null;
  label: string;
  /** 수량 종목의 보유 수량. 소수점이 든 글자 그대로. */
  qty: string;
  /** 넣은 돈(수량 종목, 금액 종목). */
  cost: string;
  /** 금액 종목의 지금 금액. 비우면 넣은 돈과 같다. */
  now: string;
  /** 통장, 연금, 보증금, 부채의 금액. */
  amount: string;
  /** 수량 종목의 지금 1주 가격. */
  price: string;
  monthly: boolean;
}

const GROUPS = Object.keys(ASSET_GROUP_VIEWS) as AssetGroup[];
const DEFAULT_KIND: InvestKind = 'stock';

function wonDigits(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  return String(Math.round(parseDecimalOr(value, 0)));
}

function initialState(saved: AssetItemOut | null, group: AssetGroup): FormState {
  if (saved == null) {
    return {
      group,
      kind: group === 'investment' ? DEFAULT_KIND : null,
      label: '',
      qty: '',
      cost: '',
      now: '',
      amount: '',
      price: '',
      monthly: false,
    };
  }
  const holding = holdingOf(saved.group, saved.kind);
  const cost = wonDigits(saved.cost_basis);
  const amount = wonDigits(saved.amount);
  return {
    group: saved.group,
    kind: saved.group === 'investment' ? (saved.kind ?? null) : null,
    label: saved.label ?? '',
    qty: holding === 'quantity' ? (saved.quantity ?? '') : '',
    cost: holding === 'quantity' || holding === 'amount' ? cost : '',
    // 지금 금액을 따로 적은 적이 있을 때만 채운다. 안 적었으면 넣은 돈과 같은 값이 와 있다.
    now: holding === 'amount' && (saved.rate_kind === 'valuation' || amount !== cost) ? amount : '',
    amount: holding === 'balance' || holding === 'debt' ? amount : '',
    price: holding === 'quantity' ? wonDigits(saved.unit_price) : '',
    monthly: saved.monthly_amount != null,
  };
}

function holdingOfState(state: FormState): Holding {
  return holdingOf(state.group, state.group === 'investment' ? state.kind : null);
}

function canSaveState(state: FormState): boolean {
  switch (holdingOfState(state)) {
    case 'quantity':
      return state.qty !== '' && state.qty !== '.';
    case 'amount':
      return state.cost !== '' || state.now !== '';
    default:
      return state.amount !== '';
  }
}

const num = (digits: string): number => (digits === '' ? 0 : Number(digits));

/** 폼을 PUT 한 줄로. 보낸 칸만 서버가 바꾸고 안 보낸 칸은 지킨다. */
function toPutItem(state: FormState, saved: AssetItemOut | null): AssetItemIn {
  const holding = holdingOfState(state);
  const label = state.label.trim();
  const item: AssetItemIn = {
    group: state.group,
    label: label === '' ? null : label,
    amount: 0,
    kind: state.group === 'investment' ? state.kind : null,
    monthly_amount:
      state.group === 'debt' || state.group === 'deposit' || !state.monthly
        ? null
        : (saved?.monthly_amount ?? 0),
  };
  if (saved?.item_key != null) item.item_key = saved.item_key;

  if (holding === 'quantity') {
    item.amount = num(state.cost);
    item.quantity = state.qty === '' ? 0 : state.qty.replace(/\.$/, '');
    item.cost_basis = num(state.cost);
    item.unit_price = state.price === '' ? null : num(state.price);
  } else if (holding === 'amount') {
    item.amount = state.now !== '' ? num(state.now) : num(state.cost);
    item.cost_basis = state.cost !== '' ? num(state.cost) : num(state.now);
  } else {
    item.amount = num(state.amount);
  }
  return item;
}

/** 무엇을 고쳤나. 값은 싣지 않고 칸 이름만. */
function changedFields(state: FormState, initial: FormState): AssetChangeField[] {
  const fields: AssetChangeField[] = [];
  if (state.amount !== initial.amount || state.cost !== initial.cost || state.now !== initial.now) {
    fields.push('amount');
  }
  if (state.price !== initial.price) fields.push('price');
  if (state.qty !== initial.qty) fields.push('qty');
  return fields;
}

/** 저장돼 있는 줄을 그대로 다시 보낼 형태로. 새 칸은 안 보내서 서버가 그대로 지킨다. */
function toItemIn(item: AssetItemOut): AssetItemIn {
  const next: AssetItemIn = { group: item.group, label: item.label, amount: item.amount };
  if (item.item_key != null) next.item_key = item.item_key;
  return next;
}

function sameState(a: FormState, b: FormState): boolean {
  return (Object.keys(a) as (keyof FormState)[]).every((key) => a[key] === b[key]);
}

interface AssetItemFormProps {
  target: AssetItemTarget;
  items: AssetItemOut[];
  dirtyRef: MutableRefObject<boolean>;
  onSavingChange: (saving: boolean) => void;
  onBack: () => void;
  onDone: (toastText: string) => void;
}

function AssetItemForm({
  target,
  items,
  dirtyRef,
  onSavingChange,
  onBack,
  onDone,
}: AssetItemFormProps) {
  const analytics = useAnalytics();
  const save = useSaveAssets();
  const monthlyId = useId();

  const saved = items.find((item) => item.sort_order === target.sortOrder) ?? null;
  const [initial] = useState(() => initialState(saved, target.group));
  const [state, setState] = useState(initial);
  const dirty = !sameState(state, initial);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty, dirtyRef]);

  const holding = holdingOfState(state);
  const unit = unitOf(state.kind);
  const canSave = canSaveState(state) && !save.isPending;
  const message = save.error instanceof ApiError ? save.error.message : null;

  function patch(next: Partial<FormState>): void {
    setState((prev) => ({ ...prev, ...next }));
  }

  function pickGroup(group: AssetGroup): void {
    setState((prev) => ({
      ...prev,
      group,
      kind: group === 'investment' ? (prev.kind ?? DEFAULT_KIND) : null,
    }));
  }

  function send(next: AssetItemIn[], action: ItemAction): void {
    const logGroup = action === 'deleted' ? (saved?.group ?? state.group) : state.group;
    const logKindSource = action === 'deleted' ? saved?.kind : state.kind;
    const kind: AssetKindLog = logGroup === 'investment' ? (logKindSource ?? 'none') : 'none';
    const fields = action === 'deleted' ? [] : changedFields(state, initial);

    onSavingChange(true);
    save.mutate(
      { items: next },
      {
        onSettled: () => onSavingChange(false),
        onSuccess: () => {
          // 이름, 금액, 수량 값, 가격은 싣지 않는다.
          analytics.log(
            EVENTS.assetChanged,
            {
              action,
              group: logGroup,
              items: next.length,
              kind,
              from: 'assets',
              ...(fields.length > 0 ? { fields: fields.join('+') } : {}),
            },
            { kind: 'click' },
          );
          onDone(action === 'deleted' ? '항목을 지웠어요' : '자산 항목을 저장했어요');
        },
      },
    );
  }

  function submit(): void {
    const next = toPutItem(state, saved);
    if (target.sortOrder == null) {
      send([...items.map(toItemIn), next], 'created');
      return;
    }
    send(
      items.map((item) => (item.sort_order === target.sortOrder ? next : toItemIn(item))),
      'updated',
    );
  }

  const title =
    target.sortOrder != null ? '자산 항목 고치기' : `${assetGroupLabel(state.group)} 항목 추가`;

  return (
    <>
      <SheetBackHead title={title} onBack={onBack} />
      <div className="asset-sheet__body">
        <div className="asset-sheet__field">
          <span className="asset-sheet__label">어디에 있는 돈인가요</span>
          <div className="asset-sheet__groups" role="radiogroup" aria-label="자산 그룹">
            {GROUPS.map((group) => (
              <button
                key={group}
                type="button"
                role="radio"
                aria-checked={state.group === group}
                className="asset-sheet__group"
                onClick={() => pickGroup(group)}
              >
                {ASSET_GROUP_VIEWS[group].label}
              </button>
            ))}
          </div>
        </div>

        {state.group === 'investment' ? (
          <div className="asset-sheet__field">
            <span className="asset-sheet__label">종류</span>
            <div className="asset-sheet__kinds" role="radiogroup" aria-label="투자 종류">
              {INVEST_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={state.kind === kind}
                  className="asset-sheet__kind"
                  onClick={() => patch({ kind })}
                >
                  {INVEST_KIND_LABEL[kind]}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <label className="asset-sheet__field">
          <span className="asset-sheet__label">이름</span>
          <input
            className="asset-sheet__input"
            value={state.label}
            onChange={(event) => patch({ label: event.target.value })}
            placeholder={
              state.group === 'investment' ? '예: 삼성전자, S&P500 ETF' : '예: 토스뱅크 통장'
            }
            maxLength={80}
          />
        </label>

        {holding === 'quantity' ? (
          <>
            <div className="asset-sheet__two">
              <QuantityField
                label="갖고 있는 수량"
                value={state.qty}
                unit={unit}
                onChange={(qty) => patch({ qty })}
              />
              <AmountField
                label="넣은 돈"
                value={state.cost}
                onChange={(cost) => patch({ cost })}
              />
            </div>
            <AmountField
              label={`지금 1${unit} 가격`}
              value={state.price}
              placeholder="모르면 비워 둬요"
              onChange={(price) => patch({ price })}
            />
          </>
        ) : holding === 'amount' ? (
          <div className="asset-sheet__two">
            <AmountField label="넣은 돈" value={state.cost} onChange={(cost) => patch({ cost })} />
            <AmountField
              label="지금 금액"
              value={state.now}
              placeholder="모르면 비워 둬요"
              onChange={(now) => patch({ now })}
            />
          </div>
        ) : (
          <AmountField label="금액" value={state.amount} onChange={(amount) => patch({ amount })} />
        )}

        {state.group !== 'debt' && state.group !== 'deposit' ? (
          <div className="asset-sheet__toggle-row">
            <span id={monthlyId} className="asset-sheet__toggle-label">
              매달 넣는 돈이에요
            </span>
            <Toggle
              checked={state.monthly}
              onChange={(monthly) => patch({ monthly })}
              ariaLabelledBy={monthlyId}
            />
          </div>
        ) : null}

        {message ? (
          <p className="asset-sheet__notice" role="alert">
            {message}
          </p>
        ) : null}

        <div className="asset-sheet__actions">
          {target.sortOrder != null ? (
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={() =>
                send(
                  items.filter((item) => item.sort_order !== target.sortOrder).map(toItemIn),
                  'deleted',
                )
              }
            >
              지우기
            </Button>
          ) : null}
          <Button className="asset-sheet__done" disabled={!canSave} onClick={submit}>
            저장
          </Button>
        </div>
      </div>
    </>
  );
}

/** 수량 칸. 소수점을 받는다. 생김새는 금액 칸과 같다. */
function QuantityField({
  label,
  value,
  unit,
  onChange,
}: {
  label: string;
  value: string;
  unit: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="pk-amount-field">
      <span className="pk-amount-field__label">{label}</span>
      <span className="pk-amount-field__box">
        <input
          className="pk-amount-field__input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          size={Math.max(4, value.length)}
          value={value}
          onChange={(event) => onChange(sanitizeQuantityInput(event.target.value))}
        />
        <span className="pk-amount-field__unit">{unit}</span>
      </span>
    </label>
  );
}
