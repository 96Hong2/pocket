import { parseDecimalOr, type CategoryOut, type TransactionOut } from '../api';
import { Chip, TransactionRow, toIconName } from '../ui';

/**
 * 거래 한 줄을 화면 형태로 옮긴다.
 *
 * 홈의 오늘 목록과 달력 화면(선택한 날·검색 결과)이 같은 규칙으로 그려야 한다.
 * 매핑을 화면마다 다시 적으면 한쪽만 이체 라벨을 빠뜨리는 일이 생긴다.
 * 그려지는 모양은 `shared/ui/TransactionRow` 가 정하고, 여기서는 무엇을 넘길지만 정한다.
 */

/** 종류 라벨. 지출은 기본이라 라벨을 붙이지 않는다. */
const KIND_LABEL: Partial<Record<TransactionOut['type'], string>> = {
  income: '수입',
  transfer: '이체',
  refund: '환불',
};

export interface LedgerRowProps {
  transaction: TransactionOut;
  categories: CategoryOut[];
  /** 지름(px). 홈 54 / 달력 48. */
  avatarSize?: number;
  density?: 'default' | 'compact';
  hideDivider?: boolean;
  /** 누르면 수정 시트가 열리는 자리. 홈에서는 넘기지 않는다. */
  onClick?: () => void;
}

export function LedgerRow({
  transaction,
  categories,
  avatarSize = 48,
  density = 'default',
  hideDivider = false,
  onClick,
}: LedgerRowProps) {
  const category = transaction.category_id
    ? categories.find((item) => item.id === transaction.category_id)
    : undefined;
  const kind = KIND_LABEL[transaction.type];
  const excluded = transaction.excluded_from_budget;

  return (
    <TransactionRow
      icon={toIconName(category?.icon_key)}
      title={transaction.merchant ?? category?.name ?? '기록'}
      subtitle={transaction.merchant ? category?.name : undefined}
      amount={parseDecimalOr(transaction.amount, 0)}
      tone={transaction.type}
      excluded={excluded}
      avatarSize={avatarSize}
      density={density}
      hideDivider={hideDivider}
      onClick={onClick}
      chips={
        excluded || kind ? (
          <>
            {excluded ? <Chip variant="excluded">예산 제외</Chip> : null}
            {kind ? <Chip variant="kind">{kind}</Chip> : null}
          </>
        ) : undefined
      }
    />
  );
}
