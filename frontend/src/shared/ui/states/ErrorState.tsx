import type { ReactNode } from 'react';

import type { IconName } from '../icons';
import { RetryButton } from './RetryButton';
import { StateView } from './StateView';

export interface ErrorStateProps {
  title?: ReactNode;
  description?: ReactNode;
  icon?: IconName;
  onRetry?: () => void;
  retryLabel?: string;
  size?: 'default' | 'inline';
  className?: string;
}

/** 불러오기·저장이 안 됐을 때. 사용자 탓으로 읽히지 않게 담백하게 적는다. */
export function ErrorState({
  title = '지금은 불러오지 못했어요',
  description = '잠깐 연결이 흔들렸을 수 있어요. 다시 시도해 주세요.',
  icon = '22_energy_bulb',
  onRetry,
  retryLabel,
  size,
  className,
}: ErrorStateProps) {
  return (
    <StateView
      icon={icon}
      title={title}
      description={description}
      action={
        onRetry ? <RetryButton onRetry={onRetry} label={retryLabel} /> : null
      }
      size={size}
      className={className}
    />
  );
}
