import { iconUrl, SM_ICONS, type IconName } from '../../shared/ui';

export interface IconPickerProps {
  value: IconName;
  onChange: (icon: IconName) => void;
  disabled?: boolean;
}

/**
 * 카테고리에 붙일 아이콘을 고른다.
 *
 * 목록 정본은 `shared/ui/icons` 의 `SM_ICONS` 다. 여기에 다시 적으면 아이콘을 더할 때
 * 한쪽만 늘어난다.
 */
export function IconPicker({ value, onChange, disabled = false }: IconPickerProps) {
  return (
    <div className="icon-picker" role="group" aria-label="아이콘">
      {SM_ICONS.map((icon) => (
        <button
          key={icon}
          type="button"
          className={
            icon === value ? 'icon-picker__cell icon-picker__cell--on' : 'icon-picker__cell'
          }
          aria-pressed={icon === value}
          aria-label={iconLabel(icon)}
          disabled={disabled}
          onClick={() => onChange(icon)}
        >
          <img
            className="icon-picker__img"
            src={iconUrl(icon)}
            alt=""
            aria-hidden="true"
            draggable={false}
          />
        </button>
      ))}
    </div>
  );
}

/** 파일 이름 앞의 번호는 추가된 순서일 뿐이라 읽을 이름에서 뗀다. */
function iconLabel(icon: IconName): string {
  return icon.replace(/^\d+_/, '').replace(/_/g, ' ');
}
