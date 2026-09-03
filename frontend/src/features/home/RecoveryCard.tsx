import { Button, CategoryAvatar, SageCard } from '../../shared/ui';

interface RecoveryCardProps {
  /** 마지막 기록 이후 며칠. 서버가 준 값을 그대로 받는다. */
  daysAway: number | null;
  onCatchUp: () => void;
}

/**
 * 며칠 비었을 때 뜨는 카드.
 *
 * 빠진 날을 세어 보여주지 않는다. 연속 기록이 끊긴 것을 실점처럼 다루면
 * 돌아온 사람을 한 번 더 밀어낸다. 지금 할 수 있는 다음 한 걸음만 준다.
 */
export function RecoveryCard({ daysAway, onCatchUp }: RecoveryCardProps) {
  const lead =
    daysAway != null && daysAway > 0
      ? `${daysAway}일 만이네요. 반가워요.`
      : '오랜만이네요. 반가워요.';

  return (
    <SageCard className="home-card">
      <div className="home-card__head">
        <CategoryAvatar icon="26_sparkles" size={48} />
        <p className="home-card__text">
          {lead}
          <br />
          지금 생각나는 것부터 적으면 돼요.
        </p>
      </div>
      <Button variant="primarySmall" fullWidth onClick={onCatchUp}>
        밀린 내역 한 번에 정리
      </Button>
    </SageCard>
  );
}
