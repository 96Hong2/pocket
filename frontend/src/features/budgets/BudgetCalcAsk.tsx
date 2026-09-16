import { Button, CategoryAvatar } from '../../shared/ui';

export interface BudgetCalcAskProps {
  /** 광고를 불러오는 중. 켜져 있으면 두 버튼 다 잠근다. 두 번 눌리면 광고가 겹친다. */
  busy: boolean;
  /** 「닫기」. 누른 사람을 원래 보던 예산 화면으로 돌려보낸다. */
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * 얼마로 할지 모르는 사람에게 광고 한 편을 묻는 자리.
 *
 * **금액 칸과 저장 버튼을 같이 두지 않는다.** 둘이 옆에 보이면 눈이 그쪽으로 가서, 정작
 * 무엇을 물었는지 읽히지 않는다. 그림 하나와 한 줄만 남기고 고를 것을 둘로 줄인다.
 *
 * 홈 카드와 예산 시트가 같은 것을 쓴다. 한쪽만 고쳐지면 같은 사람이 자리에 따라 다른 말을 본다.
 */
export function BudgetCalcAsk({ busy, onClose, onConfirm }: BudgetCalcAskProps) {
  return (
    <div className="budget-ask" role="group" aria-label="예산 대신 잡아 드리기">
      <CategoryAvatar icon="32_piggybank" size={96} />
      <p className="budget-ask__text">광고 5초만 보면 예산을 대신 잡아 드려요</p>
      <p className="budget-ask__sub">월급과 매달 나가는 돈만 적으면 돼요</p>
      <div className="budget-ask__actions">
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          닫기
        </Button>
        <Button variant="outline" disabled={busy} onClick={onConfirm}>
          {busy ? '광고를 불러오는 중이에요' : '확인'}
        </Button>
      </div>
    </div>
  );
}
