import { cx } from '../../lib/cx';

export interface LoadingStateProps {
  /** spinner 는 짧은 대기, rows 는 목록 자리를 미리 잡아 둘 때. */
  variant?: 'spinner' | 'rows';
  /** rows 일 때 그릴 줄 수. */
  rows?: number;
  /** 스크린리더가 읽을 말. 화면에는 보이지 않는다. */
  label?: string;
  size?: 'default' | 'inline';
  className?: string;
}

export function LoadingState({
  variant = 'spinner',
  rows = 3,
  label = '불러오는 중이에요',
  size = 'default',
  className,
}: LoadingStateProps) {
  if (variant === 'rows') {
    return (
      <div
        className={cx('pk-loading-rows', className)}
        role="status"
        aria-label={label}
      >
        {Array.from({ length: rows }, (_, index) => (
          <div className="pk-loading-row" key={index}>
            <div
              className="pk-skeleton"
              style={{ width: 48, height: 48, borderRadius: 999 }}
            />
            <div style={{ flex: 1 }}>
              <div className="pk-skeleton" style={{ width: '52%', height: 14 }} />
              <div
                className="pk-skeleton"
                style={{ width: '32%', height: 11, marginTop: 7 }}
              />
            </div>
            <div className="pk-skeleton" style={{ width: 62, height: 14 }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cx('pk-state', size === 'inline' && 'pk-state--inline', className)}
      role="status"
      aria-label={label}
    >
      <div className="pk-spinner" />
    </div>
  );
}
