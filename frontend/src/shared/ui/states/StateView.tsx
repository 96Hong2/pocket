import type { ReactNode } from 'react';

import { cx } from '../../lib/cx';
import { iconUrl, type IconName } from '../icons';

/**
 * 빈 화면·오류·권한 안내가 공유하는 껍데기.
 * 화면마다 새 상태 컴포넌트를 만들지 말고 이 위의 variant 를 쓴다.
 */
export interface StateViewProps {
  icon?: IconName;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** 카드 안처럼 좁은 자리는 inline 으로 위아래 여백을 줄인다. */
  size?: 'default' | 'inline';
  className?: string;
}

export function StateView({
  icon,
  title,
  description,
  action,
  size = 'default',
  className,
}: StateViewProps) {
  return (
    <div
      className={cx('pk-state', size === 'inline' && 'pk-state--inline', className)}
      role="status"
    >
      {icon ? (
        <img
          className="pk-state__illustration"
          src={iconUrl(icon)}
          alt=""
          aria-hidden="true"
        />
      ) : null}
      <p className="pk-state__title">{title}</p>
      {description ? (
        <p className="pk-state__description">{description}</p>
      ) : null}
      {action ? <div className="pk-state__action">{action}</div> : null}
    </div>
  );
}
