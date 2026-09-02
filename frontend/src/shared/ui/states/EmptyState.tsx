import type { ReactNode } from 'react';

import { Button } from '../Button';
import type { IconName } from '../icons';
import { StateView } from './StateView';

export interface EmptyStateProps {
  icon?: IconName;
  title: ReactNode;
  description?: ReactNode;
  /** 버튼 하나면 이 둘만 넘겨도 된다. */
  actionLabel?: string;
  onAction?: () => void;
  /** 버튼을 직접 그려야 할 때. actionLabel 보다 우선한다. */
  action?: ReactNode;
  size?: 'default' | 'inline';
  className?: string;
}

/** 아직 아무것도 없는 상태. 비어 있는 것을 탓하지 않고 다음 한 걸음만 보여준다. */
export function EmptyState({
  icon = '23_document',
  title,
  description,
  actionLabel,
  onAction,
  action,
  size,
  className,
}: EmptyStateProps) {
  const resolvedAction =
    action ??
    (actionLabel && onAction ? (
      <Button variant="primarySmall" onClick={onAction}>
        {actionLabel}
      </Button>
    ) : null);

  return (
    <StateView
      icon={icon}
      title={title}
      description={description}
      action={resolvedAction}
      size={size}
      className={className}
    />
  );
}
