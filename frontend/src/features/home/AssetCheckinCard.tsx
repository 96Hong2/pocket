import { useNavigate } from 'react-router';

import { useToast } from '../../app/providers';
import { assetsCheckinPath } from '../../app/router/routes';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { ApiError, useCheckinAssets } from '../../shared/api';
import { TEST_IDS } from '../../shared/testIds';
import { Button, CardClose, CategoryAvatar, SageCard } from '../../shared/ui';

/** 「10월 자산, 지난달과 같아요?」. 「그대로예요」 한 번이면 그 달 숫자가 적힌다. */
export function AssetCheckinCard({ month, onDismiss }: { month: string; onDismiss: () => void }) {
  const navigate = useNavigate();
  const analytics = useAnalytics();
  const toast = useToast();
  const checkin = useCheckinAssets();
  const label = `${Number(month.slice(5, 7))}월`;

  function same(): void {
    analytics.log(EVENTS.assetCheckinResult, { answer: 'same' }, { kind: 'click' });
    checkin.mutate(month, {
      onSuccess: () => toast.show({ text: `${label} 자산을 적어 뒀어요. 다음 달에 또 물을게요` }),
      onError: (error) =>
        toast.show({
          text:
            error instanceof ApiError
              ? error.message
              : '지금은 적지 못했어요. 잠시 뒤 다시 해 주세요',
        }),
    });
  }

  function changed(): void {
    analytics.log(EVENTS.assetCheckinResult, { answer: 'changed' }, { kind: 'click' });
    void navigate(assetsCheckinPath());
  }

  return (
    <SageCard className="home-card" data-testid={TEST_IDS.assetCheckinCard}>
      <div className="home-card__head">
        <CategoryAvatar icon="60_plant" size={44} />
        <p className="home-card__text">
          <strong className="home-card__line">{label} 자산, 지난달과 같아요?</strong>
          같으면 「그대로예요」 한 번이면 돼요
        </p>
        <CardClose
          label={`${label} 자산 물음 닫기`}
          onClick={() => {
            analytics.log(EVENTS.assetCheckinResult, { answer: 'dismissed' }, { kind: 'click' });
            onDismiss();
          }}
        />
      </div>
      <div className="home-card__actions">
        <Button variant="primarySmall" disabled={checkin.isPending} onClick={same}>
          그대로예요
        </Button>
        <Button variant="outline" disabled={checkin.isPending} onClick={changed}>
          바뀐 게 있어요
        </Button>
      </div>
    </SageCard>
  );
}
