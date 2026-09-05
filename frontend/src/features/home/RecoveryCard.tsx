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
 * 채워 온 날만 세고, 지금 할 수 있는 다음 한 걸음을 준다.
 */
export function RecoveryCard({ progress, onCatchUp }: RecoveryCardProps) {
  return (
    <SageCard className="home-card">
      <div className="home-card__head">
        <CategoryAvatar icon="26_sparkles" size={48} />
        <p className="home-card__text">
          오랜만이네요. 반가워요.
          <br />
          밀린 것부터 한 번에 정리해요.
        </p>
      </div>

      <div className="home-card__progress">
        <span className="home-card__progress-text">
          {progress.recorded_days > 0
            ? `최근 ${progress.window_days}일 중 ${progress.recorded_days}일 정리했어요`
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

      <Button variant="primarySmall" fullWidth onClick={onCatchUp}>
        밀린 내역 한 번에 정리
      </Button>
    </SageCard>
  );
}
