import { cx } from '../lib/cx';
import { iconUrl, parseCustomIcon, type IconName } from './icons';

export interface CategoryAvatarProps {
  icon: IconName;
  /**
   * 직접 건 이모지나 사진(`icon_custom`). 있으면 이쪽이 그려진다.
   * 우리가 못 읽는 값이면 조용히 `icon` 으로 돌아간다. 빈 네모보다 낫다.
   */
  custom?: string | null;
  /** 지름(px). 홈·달력·알림 54 / 자산 54 / 예산 52 / 검토 52 / 통계 44 / 설정 48 / 카테고리 40. */
  size?: number;
  /** 비워 두면 장식으로 본다. 아이콘 옆에 이름이 있으면 비워 둔다. */
  alt?: string;
  className?: string;
}

export function CategoryAvatar({
  icon,
  custom = null,
  size = 48,
  alt = '',
  className,
}: CategoryAvatarProps) {
  const picked = parseCustomIcon(custom);
  // 120px 이상으로 크게 보일 때만 큰 파일을 쓴다.
  const src = picked?.kind === 'photo' ? picked.src : iconUrl(icon, size >= 120 ? 'lg' : 'sm');

  return (
    <div
      className={cx('pk-avatar', className)}
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      {picked?.kind === 'emoji' ? (
        // 이모지는 글자다. 자리를 아이콘과 똑같이 채우려고 지름에 비례해 키운다.
        <span
          className="pk-avatar__emoji"
          style={{ fontSize: `${Math.round(size * 0.62)}px` }}
          role={alt === '' ? undefined : 'img'}
          aria-label={alt === '' ? undefined : alt}
          aria-hidden={alt === '' ? true : undefined}
        >
          {picked.glyph}
        </span>
      ) : (
        <img
          className={cx('pk-avatar__img', picked?.kind === 'photo' && 'pk-avatar__img--photo')}
          src={src}
          alt={alt}
          aria-hidden={alt === '' ? true : undefined}
          draggable={false}
        />
      )}
    </div>
  );
}
