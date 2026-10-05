import { cx } from '../lib/cx';

export interface PeriodRangeProps {
  /** `9.25 ~ 10.24` */
  range: string;
  /** 주면 누를 수 있는 알약이 되고, 누르면 한 달 시작일 시트를 연다. */
  onClick?: () => void;
  testId?: string;
  className?: string;
}

/** 달 이름 아래 기간 알약. 한 달 시작일이 1 이 아닐 때 리포트와 관리 예산이 같은 모양으로 쓴다. */
export function PeriodRange({ range, onClick, testId, className }: PeriodRangeProps) {
  if (onClick == null) {
    return (
      <p className={cx('pk-period', className)} data-testid={testId}>
        {range}
      </p>
    );
  }
  return (
    <button
      type="button"
      className={cx('pk-period', 'pk-period--button', className)}
      data-testid={testId}
      aria-label={`기간 ${range}, 한 달 시작일 바꾸기`}
      onClick={onClick}
    >
      {range}
    </button>
  );
}
