import { Button, TransactionRow } from '../../shared/ui';

interface NoSpendRowProps {
  /** 취소가 도는 중인가. 두 번 눌리지 않게 버튼을 잠근다. */
  canceling?: boolean;
  onCancel: () => void;
}

/**
 * 안 쓴 날로 적어 둔 줄.
 *
 * 거래 한 줄이지만 `LedgerRow` 로 그리지 않는다. 금액이 0 이라 오른쪽에 `0원` 이 찍히고,
 * 눌러서 열리는 수정 시트는 금액과 종류를 잠가 둬서 열어도 할 일이 없다.
 * 대신 되돌릴 길(취소)을 줄 안에 둔다.
 */
export function NoSpendRow({ canceling = false, onCancel }: NoSpendRowProps) {
  return (
    <TransactionRow
      icon="27_clock"
      title="오늘은 안 썼어요"
      amount={0}
      avatarSize={54}
      density="compact"
      hideDivider
      trailing={
        <Button variant="ghost" disabled={canceling} onClick={onCancel}>
          취소
        </Button>
      }
    />
  );
}
