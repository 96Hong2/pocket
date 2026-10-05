import {
  parseDecimalOr,
  type AssetCaptureItemOut,
  type AssetItemIn,
  type AssetItemOut,
} from '../../shared/api';

/** 검토 줄의 상태. 기존 항목 그대로, 기존 항목 금액이 바뀜, 새 이름. */
export type CaptureRowState = 'same' | 'changed' | 'new';

export function captureRowState(row: AssetCaptureItemOut): CaptureRowState {
  if (row.item_key == null) return 'new';
  return parseDecimalOr(row.amount, 0) === parseDecimalOr(row.current_amount, 0)
    ? 'same'
    : 'changed';
}

/** 기존 항목에서 바뀐 금액. 새 이름이면 0 이다. */
export function captureDelta(row: AssetCaptureItemOut): number {
  if (row.item_key == null) return 0;
  return parseDecimalOr(row.amount, 0) - parseDecimalOr(row.current_amount, 0);
}

/**
 * 읽은 줄을 자산 화면 줄 모양으로. 이름 아래 한 줄(`itemMetaOf`)과 수익률 칩(`rateChipOf`)을
 * 자산 화면과 같은 함수로 그리려고 쓴다.
 */
export function capturedItemOf(row: AssetCaptureItemOut): AssetItemOut {
  return {
    group: row.group,
    label: row.name,
    amount: row.amount,
    sort_order: 0,
    item_key: row.item_key ?? null,
    kind: row.kind ?? null,
    quantity: row.quantity ?? null,
    cost_basis: row.cost_basis ?? null,
    unit_price: row.unit_price ?? null,
    rate: row.rate ?? null,
    rate_kind: row.rate != null ? 'valuation' : null,
  };
}

/** 읽은 종류, 수량, 넣은 돈, 1주 가격. 넣은 돈을 못 읽은 줄은 빈 객체라 금액만 바뀐다. */
function heldOf(row: AssetCaptureItemOut): Partial<AssetItemIn> {
  if (row.cost_basis == null) return {};
  return {
    ...(row.kind != null ? { kind: row.kind } : {}),
    ...(row.quantity != null ? { quantity: row.quantity } : {}),
    cost_basis: row.cost_basis,
    ...(row.unit_price != null ? { unit_price: row.unit_price } : {}),
  };
}

/**
 * PUT 에 실을 전체 목록. 기존 목록에 읽은 값을 합친다.
 *
 * 기존 항목은 `item_key` 를 그대로 실어 장부를 잇는다. 금액과 읽은 종류, 수량, 넣은 돈, 1주 가격만
 * 보낸다. 서버가 안 보낸 칸은 기존 값을 지킨다. 읽은 새 이름은 끝에 붙는다.
 */
export function mergeCaptured(items: AssetItemOut[], rows: AssetCaptureItemOut[]): AssetItemIn[] {
  const read = new Map<string, AssetCaptureItemOut>();
  for (const row of rows) {
    if (row.item_key != null) read.set(row.item_key, row);
  }
  const kept: AssetItemIn[] = items.map((item) => {
    const row = item.item_key != null ? read.get(item.item_key) : undefined;
    return {
      group: item.group,
      label: item.label,
      amount: row?.amount ?? item.amount,
      ...(item.item_key != null ? { item_key: item.item_key } : {}),
      ...(row != null ? heldOf(row) : {}),
    };
  });
  const added: AssetItemIn[] = rows
    .filter((row) => row.item_key == null)
    .map((row) => ({ group: row.group, label: row.name, amount: row.amount, ...heldOf(row) }));
  return [...kept, ...added];
}
