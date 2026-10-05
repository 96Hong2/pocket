import type { ReactNode } from 'react';

/**
 * 저장 뒤 화면 맨 위. 큰 체크 그림과 「어디에 적었나」 한 줄.
 *
 * 저장 뒤 화면에서 가장 큰 글씨다. 내 가계부와 공유 가계부가 같은 모양을 쓴다.
 */
export function SavedHero({ title, testId }: { title: ReactNode; testId?: string }) {
  return (
    <div className="pk-saved-hero">
      <svg
        className="pk-saved-hero__check"
        width="64"
        height="64"
        viewBox="0 0 64 64"
        aria-hidden="true"
      >
        <circle cx="32" cy="32" r="30" />
        <path d="M19 33l9 9 17-19" />
      </svg>
      <p className="pk-saved-hero__title" data-testid={testId}>
        {title}
      </p>
    </div>
  );
}

export type IconTextButtonIcon = 'place' | 'memo';

const ICON_PATHS: Record<IconTextButtonIcon, string> = {
  place: 'M12 21s-6-5.6-6-10.5a6 6 0 1 1 12 0C18 15.4 12 21 12 21zM12 12.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  memo: 'M4 20h4l10-10-4-4L4 16v4zM13 7l4 4',
};

/** 그림 하나와 글씨로 된 가벼운 버튼. 안 적어도 되는 칸을 펼치는 자리에 쓴다. */
export function IconTextButton({
  icon,
  children,
  onClick,
  disabled,
}: {
  icon: IconTextButtonIcon;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="pk-icon-text-button" disabled={disabled} onClick={onClick}>
      <svg
        className="pk-icon-text-button__icon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d={ICON_PATHS[icon]} />
      </svg>
      {children}
    </button>
  );
}
