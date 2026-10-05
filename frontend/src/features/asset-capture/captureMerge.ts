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
 * PUT 에 실을 전체 목록. 기존 목록에 읽은 값을 합친다.
 *
 * 기존 항목은 `item_key` 를 그대로 실어 장부를 잇는다. 금액 말고 다른 칸은 안 보낸다.
 * 서버가 안 보낸 칸은 기존 값을 지킨다. 읽은 새 이름은 끝에 붙는다.
 */
export function mergeCaptured(items: AssetItemOut[], rows: AssetCaptureItemOut[]): AssetItemIn[] {
  const read = new Map<string, string>();
  for (const row of rows) {
    if (row.item_key != null) read.set(row.item_key, row.amount);
  }
  const kept: AssetItemIn[] = items.map((item) => ({
    group: item.group,
    label: item.label,
    amount: (item.item_key != null ? read.get(item.item_key) : undefined) ?? item.amount,
    ...(item.item_key != null ? { item_key: item.item_key } : {}),
  }));
  const added: AssetItemIn[] = rows
    .filter((row) => row.item_key == null)
    .map((row) => ({ group: row.group, label: row.name, amount: row.amount }));
  return [...kept, ...added];
}
