import { cx } from '../lib/cx';
import { iconUrl, type IconName } from './icons';

export interface CategoryAvatarProps {
  icon: IconName;
  /** 지름(px). 홈 54 / 달력·예산 48 / 통계 44 / 캡처 50 / 수정 58. */
  size?: number;
  /** 비워 두면 장식으로 본다. 아이콘 옆에 이름이 있으면 비워 둔다. */
  alt?: string;
  className?: string;
}

export function CategoryAvatar({
  icon,
  size = 48,
  alt = '',
  className,
}: CategoryAvatarProps) {
  // 120px 이상으로 크게 보일 때만 큰 파일을 쓴다.
  const src = iconUrl(icon, size >= 120 ? 'lg' : 'sm');

  return (
    <div
      className={cx('pk-avatar', className)}
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      <img
        className="pk-avatar__img"
        src={src}
        alt={alt}
        aria-hidden={alt === '' ? true : undefined}
        draggable={false}
      />
    </div>
  );
}
