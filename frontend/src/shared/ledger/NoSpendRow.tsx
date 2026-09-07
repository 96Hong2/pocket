import { Button, TransactionRow } from '../ui';

export interface NoSpendRowProps {
  /** 줄 제목. 홈은 오늘만 그려서 '오늘은', 달력은 고른 날이라 날짜를 말하지 않는다. */
  title?: string;
  /** 지름(px). 홈 54 / 달력 48. */
  avatarSize?: number;
  density?: 'default' | 'compact';
  /** 취소가 도는 중인가. 두 번 눌리지 않게 버튼을 잠근다. */
  canceling?: boolean;
  /** 되돌릴 길. 안 넘기면 누를 것이 없는 읽기 전용 줄이 된다. */
  onCancel?: () => void;
}

/**
 * 안 쓴 날로 적어 둔 줄.
 *
 * 거래 한 줄이지만 `LedgerRow` 로 그리지 않는다. 금액이 0 이라 오른쪽에 `0원` 이 찍히고,
 * 눌러서 열리는 수정 시트는 금액을 1원부터만 받아 열어도 완료가 잠긴다.
 * 되돌릴 길(취소)은 오늘을 보는 홈에만 두고, 달력에서는 읽기만 한다.
 */
export function NoSpendRow({
  title = '안 썼어요',
  avatarSize = 48,
  density = 'default',
  canceling = false,
  onCancel,
}: NoSpendRowProps) {
  return (
    <TransactionRow
      icon="27_clock"
      title={title}
      amount={0}
      avatarSize={avatarSize}
      density={density}
      hideDivider
      trailing={
        onCancel ? (
          <Button variant="ghost" disabled={canceling} onClick={onCancel}>
            취소
          </Button>
        ) : (
          // 빈 자리를 넘겨야 0원이 안 그려진다. 안 넘기면 금액이 대신 들어온다.
          <span aria-hidden="true" />
        )
      }
    />
  );
}
