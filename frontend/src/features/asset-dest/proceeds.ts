import type { AssetItemOut, TransactionUpdate } from '../../shared/api';
import { assetItemName } from '../assets';

/**
 * 「받은 돈 넣을 곳」. 팔았어요로 받은 돈이 들어간 통장이다(ADR-0049).
 * 고를 수 있는 곳은 예적금·현금 항목뿐이다. 서버가 같은 규칙으로 막는다.
 */

/** 고른 넣을 곳. 있던 통장, 그 자리에서 만드는 새 통장, 넣지 않기. */
export type ProceedsChoice =
  | { type: 'item'; itemKey: string; name: string }
  | { type: 'new'; label: string }
  | { type: 'none' };

/** 고를 수 있는 통장. 「어디에」 목록에서 예적금·현금만 남기고 판 항목 자신은 뺀다. */
export function proceedsAccountsOf(
  destinations: readonly AssetItemOut[],
  soldKey?: string | null,
): AssetItemOut[] {
  return destinations.filter(
    (item) => item.group === 'cash' && item.item_key != null && item.item_key !== soldKey,
  );
}

/** 통장 줄에 적을 이름. 이름 없는 통장은 그룹 이름으로 부른다. */
export function accountNameOf(item: Pick<AssetItemOut, 'group' | 'label'>): string {
  return assetItemName(item.group, item.label);
}

/** 같은 이름의 통장이 이미 있으면 그것. 새로 만들지 않고 그 통장을 고른다. */
export function findSameAccount(
  accounts: readonly AssetItemOut[],
  label: string,
): AssetItemOut | null {
  const wanted = label.trim();
  if (wanted === '') return null;
  return accounts.find((item) => (item.label ?? '').trim() === wanted) ?? null;
}

/** 줄에 보일 이름. 넣지 않기면 null 이라 줄이 「고르기」 를 보인다. */
export function proceedsNameOf(choice: ProceedsChoice): string | null {
  if (choice.type === 'item') return choice.name;
  if (choice.type === 'new') return choice.label.trim();
  return null;
}

/** 고치기 본문에 실을 칸. 넣지 않기는 null 을 보내 서버가 비우게 한다. */
export function proceedsBodyOf(
  choice: ProceedsChoice,
): Pick<TransactionUpdate, 'asset_proceeds_key' | 'new_proceeds_asset'> {
  if (choice.type === 'item') return { asset_proceeds_key: choice.itemKey };
  if (choice.type === 'new') return { new_proceeds_asset: { label: choice.label.trim() } };
  return { asset_proceeds_key: null };
}

/** 로그에 남길 결과. 이름과 금액은 싣지 않는다. */
export function proceedsResultOf(choice: ProceedsChoice): 'picked' | 'created' | 'cleared' {
  if (choice.type === 'item') return 'picked';
  return choice.type === 'new' ? 'created' : 'cleared';
}
