import { cx } from '../../shared/lib/cx';
import { CardClose, CategoryAvatar, SageCard, type IconName } from '../../shared/ui';

import { ShareButton } from './ShareButton';

import type { ShareKind } from './shareText';

export interface ShareInviteCardProps {
  kind: ShareKind;
  /** 어느 화면에서 눌렀나. 로그에 실린다. */
  where: string;
  icon: IconName;
  /** 한 줄 멘트. 이 카드가 무엇을 권하는지가 여기 있다. */
  title: string;
  /**
   * 그 아래 작은 한 줄.
   *
   * **보내기를 망설이게 하는 것을 여기서 없앤다.** 가계부에서 무언가를 남에게 보낼 때
   * 가장 먼저 드는 걱정은 「내 돈 사정이 드러나나」다. 안 보낸다고 미리 말해 준다.
   */
  lead: string;
  label: string;
  message: string;
  /** 닫기. 안 넘기면 닫기가 없다. */
  onDismiss?: () => void;
  dismissLabel?: string;
  /** 이 카드가 무엇인지. 스크린리더가 읽고 e2e 가 이 이름으로 집는다. */
  ariaLabel: string;
  className?: string;
}

/**
 * 공유를 권하는 카드.
 *
 * 조용한 줄 하나로는 눈에 안 들어온다는 실사용 지적을 받고 카드로 올렸다.
 * 복구 카드·예산 제안 카드와 **같은 모양**을 쓴다. 스스로 나타나 한 가지를 권하는
 * 자리가 화면마다 다른 모양이면, 한 화면에서 배운 것이 다음 화면에서 안 통한다.
 *
 * 그림 하나 · 멘트 한 줄 · 안심시키는 한 줄 · 버튼 하나. 그 이상 넣지 않는다.
 */
export function ShareInviteCard({
  kind,
  where,
  icon,
  title,
  lead,
  label,
  message,
  onDismiss,
  dismissLabel,
  ariaLabel,
  className,
}: ShareInviteCardProps) {
  return (
    <SageCard className={cx('share-card', className)} role="group" aria-label={ariaLabel}>
      <div className="share-card__head">
        <CategoryAvatar icon={icon} size={44} />
        <p className="share-card__text">
          <strong className="share-card__title">{title}</strong>
          <span className="share-card__lead">{lead}</span>
        </p>
        {onDismiss != null && dismissLabel != null ? (
          <CardClose label={dismissLabel} onClick={onDismiss} />
        ) : null}
      </div>

      <ShareButton
        className="share-card__action"
        kind={kind}
        where={where}
        tone="strong"
        label={label}
        message={message}
      />
    </SageCard>
  );
}
