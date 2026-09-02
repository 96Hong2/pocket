import type { ReactNode } from 'react';

import { StateView } from './StateView';

export interface UnsupportedFeatureProps {
  /** `앨범에서 캡처 불러오기` 처럼 기능 이름만 넣는다. */
  feature?: string;
  title?: ReactNode;
  description?: ReactNode;
  /** 이 버전에서도 쓸 수 있는 다른 길을 함께 준다. */
  fallbackAction?: ReactNode;
  size?: 'default' | 'inline';
  className?: string;
}

/** 브릿지가 UNSUPPORTED 를 돌려줬을 때. 토스 앱 버전이 낮아 못 쓰는 경우다. */
export function UnsupportedFeature({
  feature,
  title = '이 버전에서는 아직 안 되는 기능이에요',
  description,
  fallbackAction,
  size,
  className,
}: UnsupportedFeatureProps) {
  const resolvedDescription =
    description ??
    (feature
      ? `${feature} 기능은 토스 앱을 업데이트하면 쓸 수 있어요.`
      : '토스 앱을 업데이트하면 쓸 수 있어요.');

  return (
    <StateView
      icon="27_clock"
      title={title}
      description={resolvedDescription}
      action={fallbackAction}
      size={size}
      className={className}
    />
  );
}
