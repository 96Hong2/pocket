import type {
  AssetGroup,
  AssetItemOut,
  AssetsOut,
  InvestKind,
  TransactionCreate,
} from '../../shared/api';
import { formatCurrency } from '../../shared/lib/format';
import {
  ASSET_GROUP_VIEWS,
  assetGroupLabel,
  assetItemName,
  formatQuantity,
  holdingOf,
  isMonthly,
  itemValueOf,
  unitOf,
  type Holding,
} from '../assets';
import { parseQuantity } from './assetMath';

/** 기록의 「어디에」 로 고를 수 있는 그룹. 부채는 받지 않는다. 새 항목 그룹 칩도 이 차례다. */
export const DEST_GROUPS: readonly AssetGroup[] = ['cash', 'investment', 'pension', 'deposit'];

/** 격자에 서는 항목 수. 그 뒤에 「다른 곳」 이 붙는다. */
export const DEST_GRID_SIZE = 5;

/** 새 항목 이름 상한. 자산 항목 시트와 같다. */
export const DEST_LABEL_MAX = 80;

/** 저장 전에는 서버에 만들지 않는 새 항목. 저장 본문의 `new_asset` 이 된다. */
export interface NewAssetDraft {
  group: AssetGroup;
  kind: InvestKind | null;
  label: string;
}

export type AssetDest =
  { type: 'item'; itemKey: string; item: AssetItemOut } | { type: 'new'; asset: NewAssetDraft };

/** 이미 있는 항목을 고른 값. */
export type AssetItemDest = Extract<AssetDest, { type: 'item' }>;

/** 어디서 골랐나. 격자, 「다른 곳」 목록, 새 항목. */
export type AssetDestFrom = 'grid' | 'other' | 'new';

export interface AssetDestPick {
  dest: AssetDest;
  from: AssetDestFrom;
  /** 고른 자리(1부터). 새 항목은 0. */
  position: number;
}

export interface AssetDestSection {
  group: AssetGroup;
  items: AssetItemOut[];
}

function groupOrder(assets: AssetsOut): AssetGroup[] {
  const listed = (assets.all_groups ?? assets.groups).map((total) => total.group);
  const order = listed.length > 0 ? listed : (Object.keys(ASSET_GROUP_VIEWS) as AssetGroup[]);
  return order.filter((group) => DEST_GROUPS.includes(group));
}

/** 고를 수 있는 항목 전부. 키가 있는 것만, 그룹은 서버가 준 차례(`all_groups`)로. */
export function destinationsOf(assets: AssetsOut | undefined): AssetItemOut[] {
  if (assets == null) return [];
  return groupOrder(assets).flatMap((group) =>
    assets.items.filter((item) => item.group === group && item.item_key != null),
  );
}

/** 「다른 곳」 목록. 항목이 있는 그룹만. */
export function destSectionsOf(destinations: readonly AssetItemOut[]): AssetDestSection[] {
  const sections: AssetDestSection[] = [];
  for (const item of destinations) {
    const last = sections.at(-1);
    if (last?.group === item.group) last.items.push(item);
    else sections.push({ group: item.group, items: [item] });
  }
  return sections;
}

/**
 * 격자 다섯 칸. 매달 넣는 항목 먼저, 그다음 매달이 아닌 것(보증금·기타는 빼고).
 * 고른 항목이 다섯 안에 없으면 다섯째 자리에 세운다.
 */
export function destGridOf(
  destinations: readonly AssetItemOut[],
  pickedKey?: string | null,
): AssetItemOut[] {
  const monthly = destinations.filter(isMonthly);
  const rest = destinations.filter((item) => !isMonthly(item) && item.group !== 'deposit');
  const grid = [...monthly, ...rest].slice(0, DEST_GRID_SIZE);
  if (pickedKey == null || grid.some((item) => item.item_key === pickedKey)) return grid;
  const picked = destinations.find((item) => item.item_key === pickedKey);
  return picked == null ? grid : [...grid.slice(0, DEST_GRID_SIZE - 1), picked];
}

export function destFromItem(item: AssetItemOut): AssetItemDest | null {
  return item.item_key == null ? null : { type: 'item', itemKey: item.item_key, item };
}

export function destGroupOf(dest: AssetDest): AssetGroup {
  return dest.type === 'item' ? dest.item.group : dest.asset.group;
}

export function destKindOf(dest: AssetDest): InvestKind | null {
  return dest.type === 'item' ? (dest.item.kind ?? null) : dest.asset.kind;
}

/** 수량 종목(주식, ETF, 코인)이면 `quantity`. 「넣었어요 / 팔았어요」 와 수량 칸은 이때만 선다. */
export function destHoldingOf(dest: AssetDest): Holding {
  return holdingOf(destGroupOf(dest), destKindOf(dest));
}

/** 줄에 적을 이름. 이름 없는 항목은 그룹 이름으로. */
export function destNameOf(dest: AssetDest): string {
  if (dest.type === 'item') return assetItemName(dest.item.group, dest.item.label);
  const label = dest.asset.label.trim();
  return label === '' ? assetGroupLabel(dest.asset.group) : label;
}

/** 접힌 줄의 둘째 글씨. 수량 종목은 「2주 보유」(없으면 빈 칸), 나머지는 지금 금액. 새 항목은 빈 칸. */
export function destSubOf(dest: AssetDest): string {
  if (dest.type === 'new') return '';
  const { item } = dest;
  if (holdingOf(item.group, item.kind) === 'quantity') {
    const held = parseQuantity(item.quantity) ?? 0n;
    return held > 0n ? `${formatQuantity(item.quantity)}${unitOf(item.kind)} 보유` : '';
  }
  return formatCurrency(itemValueOf(item));
}

/** 두 고른 값이 같은 곳인가. 접힘 상태를 고른 값마다 따로 두는 데 쓴다. */
export function destKeyOf(dest: AssetDest | null): string {
  if (dest == null) return '';
  if (dest.type === 'item') return `item:${dest.itemKey}`;
  return `new:${dest.asset.group}:${dest.asset.kind ?? ''}:${dest.asset.label.trim()}`;
}

/** 새 항목 폼의 「확인」 이 켜지나. 투자는 종류와 이름이 있어야 한다(서버 규칙). */
export function newAssetReady(draft: NewAssetDraft): boolean {
  if (draft.group !== 'investment') return true;
  return draft.kind != null && draft.label.trim() !== '';
}

/** 같은 그룹, 같은 종류, 같은 이름의 항목이 이미 있으면 그것. 새로 만들지 않고 그 항목을 고른다. */
export function findSameDest(
  destinations: readonly AssetItemOut[],
  draft: NewAssetDraft,
): AssetItemOut | null {
  const label = draft.label.trim();
  if (label === '') return null;
  return (
    destinations.find(
      (item) =>
        item.group === draft.group &&
        (item.kind ?? null) === (draft.group === 'investment' ? draft.kind : null) &&
        (item.label ?? '').trim() === label,
    ) ?? null
  );
}

/** 저장, 고치기 본문에 실을 어디에 칸. 고른 쪽 하나만 싣는다. */
export function destBodyOf(
  dest: AssetDest,
): Pick<TransactionCreate, 'asset_item_key' | 'new_asset'> {
  if (dest.type === 'item') return { asset_item_key: dest.itemKey };
  const label = dest.asset.label.trim();
  return {
    new_asset: {
      group: dest.asset.group,
      kind: dest.asset.group === 'investment' ? dest.asset.kind : null,
      label: label === '' ? null : label,
    },
  };
}
