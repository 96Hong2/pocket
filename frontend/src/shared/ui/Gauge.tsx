import { cx } from '../lib/cx';

/** 10 히어로·예산 / 8 카테고리·통계 / 6 목표 미니 */
export type GaugeSize = 10 | 8 | 6;

const SIZE_CLASS: Record<GaugeSize, string> = {
  10: 'pk-gauge--10',
  8: 'pk-gauge--8',
  6: 'pk-gauge--6',
};

export interface GaugeProps {
  /** 0~1. 1 을 넘으면 막대는 꽉 차고 색이 앰버로 바뀐다. */
  ratio: number;
  size?: GaugeSize;
  /** 예산을 넘긴 상태를 직접 지정할 때. 없으면 ratio > 1 로 판단한다. */
  over?: boolean;
  /** 화면에 라벨이 따로 없을 때 스크린리더가 읽을 설명. */
  label?: string;
  className?: string;
}

export function Gauge({ ratio, size = 10, over, label, className }: GaugeProps) {
  const safeRatio = Number.isFinite(ratio) ? Math.max(0, ratio) : 0;
  const isOver = over ?? safeRatio > 1;
  const percent = Math.min(100, Math.round(safeRatio * 100));

  return (
    <div
      className={cx('pk-gauge', SIZE_CLASS[size], className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={label}
    >
      <div
        className={cx('pk-gauge__fill', isOver && 'pk-gauge__fill--over')}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
