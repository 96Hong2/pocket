import type { AssetGroup } from '../../shared/api';
import type { IconName } from '../../shared/ui';

/**
 * 자산 그룹의 화면 문구.
 *
 * 서버는 종류(`cash`·`investment`·`deposit`·`debt`)만 준다. 문구는 화면이 만든다.
 * 구획 순서도 서버가 준 `groups` 순서를 그대로 쓰므로 여기서 정하지 않는다.
 */
export interface AssetGroupView {
  label: string;
  /** 무엇을 적는 자리인지 한 줄. 이름만으로는 무엇이 여기 들어가는지 모른다. */
  hint: string;
  icon: IconName;
}

export const ASSET_GROUP_VIEWS: Record<AssetGroup, AssetGroupView> = {
  cash: {
    label: '예적금·현금',
    hint: '통장 잔액, 예금, 적금',
    icon: '28_cash',
  },
  investment: {
    label: '투자',
    hint: '주식·펀드·코인의 지금 평가액쯤',
    icon: '03_growth_chart',
  },
  deposit: {
    label: '보증금·기타',
    hint: '전월세 보증금, 빌려준 돈',
    icon: '12_house',
  },
  debt: {
    label: '부채',
    hint: '학자금, 마이너스통장, 남은 할부',
    icon: '24_lock',
  },
};

export function assetGroupLabel(group: AssetGroup): string {
  return ASSET_GROUP_VIEWS[group].label;
}

/**
 * 줄에 적을 이름. 이름을 안 적은 항목은 그룹 이름으로 부른다.
 *
 * `이름 없음` 으로 적지 않는다. 이름은 선택이라고 해 두고 안 적은 것을 빈자리로 표시하면
 * 적지 않은 것이 잘못한 일처럼 보인다.
 */
export function assetItemName(group: AssetGroup, label: string | null): string {
  return label ?? assetGroupLabel(group);
}
