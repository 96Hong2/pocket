import type { CSSProperties } from 'react';

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
  /**
   * 동그라미 바탕색(`category.color`). 안 고른 분류는 null 이고 무채색 기본 바탕이다.
   *
   * 태그와 같은 열네 색을 쓴다. 팔레트를 둘로 두면 한 화면에 안 어울리는 색이 두 벌 선다.
   * 리포트의 링은 여전히 **자리 색**(`--color-donut-N`)이라 여기와 섞이지 않는다.
   *
   * 모르는 값이면 조용히 기본 바탕으로 돌아간다. 옛 판이 적어 둔 색 하나 때문에
   * 목록이 빈 동그라미로 뜨지 않게 한다.
   */
  color?: string | null;
  /** 비워 두면 장식으로 본다. 아이콘 옆에 이름이 있으면 비워 둔다. */
  alt?: string;
  className?: string;
}

/** 고를 수 있는 색인지. 값 목록의 정본은 서버(`app/domain/tags.py`)다. */
const COLORS = new Set([
  'rose',
  'coral',
  'amber',
  'sand',
  'olive',
  'sage',
  'mint',
  'teal',
  'sky',
  'ocean',
  'indigo',
  'lilac',
  'plum',
  'slate',
]);

export function CategoryAvatar({
  icon,
  custom = null,
  color = null,
  size = 48,
  alt = '',
  className,
}: CategoryAvatarProps) {
  const picked = parseCustomIcon(custom);
  const tinted = color != null && COLORS.has(color);
  // 120px 이상으로 크게 보일 때만 큰 파일을 쓴다.
  const src = picked?.kind === 'photo' ? picked.src : iconUrl(icon, size >= 120 ? 'lg' : 'sm');

  return (
    <div
      className={cx('pk-avatar', tinted && 'pk-avatar--tinted', className)}
      style={
        {
          width: `${size}px`,
          height: `${size}px`,
          ...(tinted ? { '--pk-avatar-bg': `var(--tag-${color})` } : null),
        } as CSSProperties
      }
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
