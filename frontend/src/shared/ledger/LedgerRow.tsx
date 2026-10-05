import { parseDecimalOr, type CategoryOut, type TagOut, type TransactionOut } from '../api';
import { Chip, TagMark, TransactionRow, iconOf, type IconName } from '../ui';

/**
 * 거래 한 줄을 화면 형태로 옮긴다.
 *
 * 홈의 오늘 목록과 달력 화면(선택한 날·검색 결과)이 같은 규칙으로 그려야 한다.
 * 매핑을 화면마다 다시 적으면 한쪽만 이체 라벨을 빠뜨리는 일이 생긴다.
 * 그려지는 모양은 `shared/ui/TransactionRow` 가 정하고, 여기서는 무엇을 넘길지만 정한다.
 */

/** 종류 라벨. 지출은 기본이라 라벨을 붙이지 않는다. */
/** 저축·투자 줄인데 「어디에」 그룹을 모를 때 그림. 「기타」 그림으로 떨어지지 않게 한다. */
export const SAVING_FALLBACK_ICON: IconName = '03_growth_chart';

const KIND_LABEL: Partial<Record<TransactionOut['type'], string>> = {
  income: '수입',
  transfer: '이체',
  refund: '환불',
};

export interface LedgerRowProps {
  transaction: TransactionOut;
  categories: CategoryOut[];
  /**
   * 태그 목록. 이 줄에 달린 태그의 이름과 색을 여기서 찾는다.
   *
   * 안 넘기면 태그 표식을 안 그린다. 태그를 쓰지 않는 자리(검토 목록 같은 곳)가
   * 목록 조회를 하나 더 끌고 다니지 않게 하려는 것이다.
   */
  tags?: TagOut[];
  /** 지름(px). 홈 54 / 달력 48. */
  avatarSize?: number;
  density?: 'default' | 'compact';
  hideDivider?: boolean;
  /** 누르면 수정 시트가 열리는 자리. 홈에서는 넘기지 않는다. */
  onClick?: () => void;
  /** 「어디에」 항목 키 → 그 그룹 그림. 저축·투자 줄만 쓴다. */
  assetIcons?: ReadonlyMap<string, IconName>;
}

export function LedgerRow({
  transaction,
  categories,
  tags = [],
  avatarSize = 48,
  density = 'default',
  hideDivider = false,
  onClick,
  assetIcons,
}: LedgerRowProps) {
  const category = transaction.category_id
    ? categories.find((item) => item.id === transaction.category_id)
    : undefined;
  // 저축·투자는 서버에 이체로 적힌다. 「어디에」 가 붙은 이체는 그 이름으로 말한다.
  const saving = transaction.type === 'transfer' && transaction.asset_item_key != null;
  const sold = saving && transaction.asset_side === 'sell';
  const kind = saving ? undefined : KIND_LABEL[transaction.type];
  const excluded = transaction.excluded_from_budget;
  const savingTitle = sold ? `${transaction.asset_label ?? '저축·투자'} 팔았어요` : '저축·투자';
  const savingSub = sold ? '받은 돈' : (transaction.asset_label ?? undefined);
  const tag = transaction.tag_id
    ? tags.find((item) => item.id === transaction.tag_id)
    : undefined;

  const icon = saving
    ? {
        icon: assetIcons?.get(transaction.asset_item_key ?? '') ?? SAVING_FALLBACK_ICON,
        custom: null,
        color: null,
      }
    : iconOf(category);

  return (
    <TransactionRow
      {...icon}
      title={transaction.merchant ?? (saving ? savingTitle : (category?.name ?? '기록'))}
      /*
        메모가 있으면 분류 이름 대신 메모를 보여 준다.

        분류는 왼쪽 그림이 이미 말하고 있다. 같은 자리에 분류 이름을 또 적느니, 그 사람이
        일부러 남긴 한 줄을 보여 주는 쪽이 목록을 훑을 때 쓸모가 있다.
      */
      subtitle={
        transaction.memo ??
        (saving ? savingSub : transaction.merchant ? category?.name : undefined)
      }
      amount={parseDecimalOr(transaction.amount, 0)}
      tone={transaction.type}
      excluded={excluded}
      avatarSize={avatarSize}
      density={density}
      hideDivider={hideDivider}
      onClick={onClick}
      chips={
        excluded || kind || tag ? (
          <>
            {excluded ? <Chip variant="excluded">예산 제외</Chip> : null}
            {kind ? <Chip variant="kind">{kind}</Chip> : null}
            {tag ? <TagMark tag={tag} /> : null}
          </>
        ) : undefined
      }
    />
  );
}
