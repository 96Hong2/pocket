import type { ReactNode } from 'react';

import { RetryButton } from './RetryButton';
import { StateView } from './StateView';

/** 브릿지가 PERMISSION_DENIED 를 던졌을 때 그린다. */
export type PermissionResource = 'photos' | 'camera';

const COPY: Record<PermissionResource, { title: string; description: string }> =
  {
    photos: {
      title: '사진 접근이 꺼져 있어요',
      description:
        '토스 앱 설정에서 사진 접근을 켜면 캡처 한 장으로 바로 기록할 수 있어요.',
    },
    camera: {
      title: '카메라 접근이 꺼져 있어요',
      description:
        '토스 앱 설정에서 카메라 접근을 켜면 영수증을 찍어서 기록할 수 있어요.',
    },
  };

export interface PermissionDeniedProps {
  resource: PermissionResource;
  title?: ReactNode;
  description?: ReactNode;
  /** 권한을 켜고 돌아왔을 때 다시 시도. */
  onRetry?: () => void;
  /** 권한 없이도 갈 수 있는 다른 길(직접 입력 등)을 함께 준다. */
  fallbackAction?: ReactNode;
  size?: 'default' | 'inline';
  className?: string;
}

export function PermissionDenied({
  resource,
  title,
  description,
  onRetry,
  fallbackAction,
  size,
  className,
}: PermissionDeniedProps) {
  const copy = COPY[resource];

  return (
    <StateView
      icon="24_lock"
      title={title ?? copy.title}
      description={description ?? copy.description}
      action={
        onRetry || fallbackAction ? (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {onRetry ? <RetryButton onRetry={onRetry} /> : null}
            {fallbackAction}
          </div>
        ) : null
      }
      size={size}
      className={className}
    />
  );
}
