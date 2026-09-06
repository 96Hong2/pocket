import { parseDecimalOr, type RecoveryProgressOut } from '../../shared/api';
import { TEST_IDS } from '../../shared/testIds';
import { Button, CategoryAvatar, Gauge, SageCard } from '../../shared/ui';

interface RecoveryCardProps {
  /** 최근 며칠 중 며칠 정리했나. 빠진 날 수는 받지 않는다. */
  progress: RecoveryProgressOut;
  onCatchUp: () => void;
}

/**
 * 며칠 비었을 때 뜨는 카드.
 *
 * 빠진 날 수는 props 로도 들어오지 않는다. 값이 없으면 문구를 되돌릴 수도 없다.
 * 연속 기록이 끊긴 것을 실점처럼 다루면 돌아온 사람을 한 번 더 밀어낸다.
 *
 * 문구는 시안(`docs/design/mockup-v2.1.dc.html`)의 것을 그대로 쓴다.
 * '며칠' 은 세지 않는 말이고, 둘째 줄이 **무엇을 하면 되는지**를 알려 준다.
 * 버튼만 있으면 그 버튼이 무엇을 여는지는 눌러 봐야 안다.
 */
export function RecoveryCard({ progress, onCatchUp }: RecoveryCardProps) {
  return (
    <SageCard className="home-card">
      <div className="home-card__head">
        <CategoryAvatar icon="26_sparkles" size={48} />
        <p className="home-card__text">
          며칠 놓쳤어도 괜찮아요.
          <br />
          캡처 한 장이면 다시 정리할 수 있어요.
        </p>
      </div>

      {/* 할 수 있는 다음 한 걸음을 진행 표시보다 위에 둔다. 시안의 순서다. */}
      <Button variant="primarySmall" fullWidth onClick={onCatchUp}>
        밀린 내역 한 번에 정리
      </Button>

      <div className="home-card__progress">
        <span className="home-card__progress-text">
          {progress.recorded_days > 0
            ? `이번 주 ${progress.recorded_days}/${progress.window_days}일 정리했어요`
            : '이번 주는 지금부터 시작이에요'}
        </span>
        {/* 넘침 경고를 넣지 않는다. 이 자리에 경고색이 오면 복구가 벌주기가 된다. */}
        <Gauge
          className="home-card__gauge"
          data-testid={TEST_IDS.recoveryGauge}
          ratio={parseDecimalOr(progress.progress, 0)}
          label="최근 정리 진행"
        />
      </div>
    </SageCard>
  );
}
