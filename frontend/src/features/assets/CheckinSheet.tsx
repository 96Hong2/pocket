import { useState } from 'react';

import { useOverlayBackClose, useToast } from '../../app/providers';
import {
  ApiError,
  parseDecimalOr,
  useSaveAssets,
  type AssetItemIn,
  type AssetItemOut,
} from '../../shared/api';
import { formatCurrency, toLedgerDate } from '../../shared/lib/format';
import { BottomSheet, Button } from '../../shared/ui';

import { assetGroupLabel, assetItemName } from './assetGroups';
import { holdingOf, itemValueOf } from './assetView';
import { SheetBackHead } from './SheetBackHead';

export interface CheckinSheetProps {
  open: boolean;
  items: AssetItemOut[];
  onClose: () => void;
}

const MAX_DIGITS = 14;

/** 수량 종목은 금액으로 고치지 않는다. 가치가 수량과 1주 가격에서 나온다. */
function editable(item: AssetItemOut): boolean {
  return holdingOf(item.group, item.kind) !== 'quantity';
}

function digitsOf(item: AssetItemOut): string {
  return String(Math.round(parseDecimalOr(item.amount, 0)));
}

/**
 * 「바뀐 것만 고쳐요」. 홈 체크인 카드의 「바뀐 게 있어요」 가 연다.
 *
 * 항목마다 지금 금액 칸 하나다. 저장하면 이번 달 숫자가 오늘 날짜로 적힌다.
 * 안 고친 칸도 함께 보내야 그 달 목록이 통째로 남는다.
 */
export function CheckinSheet({ open, items, onClose }: CheckinSheetProps) {
  useOverlayBackClose(open, onClose);

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel="바뀐 것만 고쳐요" size="tall">
      {open ? <CheckinForm items={items} onClose={onClose} /> : null}
    </BottomSheet>
  );
}

function CheckinForm({ items, onClose }: { items: AssetItemOut[]; onClose: () => void }) {
  const toast = useToast();
  const save = useSaveAssets();
  const [values, setValues] = useState<string[]>(() => items.map(digitsOf));
  const month = Number(toLedgerDate(new Date()).slice(5, 7));

  function submit(): void {
    const body: AssetItemIn[] = items.map((item, index) => {
      const next: AssetItemIn = { group: item.group, label: item.label, amount: item.amount };
      if (item.item_key != null) next.item_key = item.item_key;
      if (editable(item) && values[index] !== digitsOf(item)) {
        next.amount = values[index] === '' ? 0 : Number(values[index]);
      }
      return next;
    });
    save.mutate(
      { items: body, source: 'manual' },
      {
        onSuccess: () => {
          toast.show({ text: `${month}월 자산을 적어 뒀어요` });
          onClose();
        },
      },
    );
  }

  const error = save.error instanceof ApiError ? save.error.message : null;

  return (
    <div className="checkin-sheet">
      <SheetBackHead title="바뀐 것만 고쳐요" onBack={onClose} />
      <ul className="checkin-sheet__rows">
        {items.map((item, index) => {
          const name = assetItemName(item.group, item.label);
          return (
            <li key={item.item_key ?? item.sort_order} className="checkin-sheet__row">
              <span className="checkin-sheet__name">
                {name}
                <small>{assetGroupLabel(item.group)}</small>
              </span>
              {editable(item) ? (
                <input
                  className="checkin-sheet__input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label={`${name} 금액`}
                  value={values[index] === '' ? '' : Number(values[index]).toLocaleString('ko-KR')}
                  onChange={(event) => {
                    const digits = event.target.value
                      .replace(/\D/g, '')
                      .replace(/^0+(?=\d)/, '')
                      .slice(0, MAX_DIGITS);
                    setValues((current) => current.map((v, at) => (at === index ? digits : v)));
                  }}
                />
              ) : (
                <b className="checkin-sheet__value">{formatCurrency(itemValueOf(item))}</b>
              )}
            </li>
          );
        })}
      </ul>
      {error != null ? (
        <p className="checkin-sheet__error" role="alert">
          {error}
        </p>
      ) : null}
      <Button fullWidth className="checkin-sheet__save" disabled={save.isPending} onClick={submit}>
        저장
      </Button>
    </div>
  );
}
