import { CategoryAvatar, type CategoryAvatarProps } from '../ui';

export interface EditHeadIconProps {
  avatar: Omit<CategoryAvatarProps, 'size'>;
  /** 누르면 고르기를 연다. 안 넘기면 고를 것이 없는 기록이라 그림만 선다. */
  onPress?: () => void;
  /** 화면 낭독기가 읽는 이름. `onPress` 가 있을 때만 쓴다. */
  label?: string;
  disabled?: boolean;
}

/**
 * 기록 고치기 맨 위 큰 그림. 누르면 분류(저축·투자는 어디에) 고르기가 열린다.
 *
 * 누를 수 있다는 표시는 오른쪽 아래 작은 연필 하나다. 글씨를 늘리지 않는다.
 */
export function EditHeadIcon({ avatar, onPress, label, disabled = false }: EditHeadIconProps) {
  if (onPress == null) return <CategoryAvatar {...avatar} size={58} />;
  return (
    <button
      type="button"
      className="edit-head-icon"
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
    >
      <CategoryAvatar {...avatar} size={58} />
      <span className="edit-head-icon__badge" aria-hidden="true">
        <svg width="11" height="11" viewBox="0 0 12 12" focusable="false">
          <path
            d="M8.2 1.6l2.2 2.2-6.3 6.3-2.8.6.6-2.8z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  );
}
