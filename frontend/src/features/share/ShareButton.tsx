import { cx } from '../../shared/lib/cx';

import { useShare } from './useShare';

import type { ShareKind } from './shareText';

export interface ShareButtonProps {
  kind: ShareKind;
  /** 링크 앞에 붙일 한 줄. `shareText.ts` 가 만든 것을 그대로 넘긴다. */
  message: string;
  /** 어느 화면에서 눌렀나. 로그에 실린다. */
  where: string;
  /** 버튼에 적는 말. 자리마다 무엇을 공유하는지가 달라서 부르는 쪽이 정한다. */
  label: string;
  /**
   * 얼마나 세게 그릴까.
   *
   * `quiet` 는 카드 아래 한 줄이다. 늘 서 있는 자리라 눈에 덜 띄어야 한다.
   * `strong` 은 다 모았을 때·결산을 다 봤을 때처럼 축하하는 순간에만 쓴다.
   */
  tone?: 'quiet' | 'strong';
  className?: string;
}

/**
 * 친구에게 보내기.
 *
 * 한 번 누르면 시스템 공유 시트가 바로 뜬다. 중간에 확인 창을 두지 않는다.
 * 무엇을 보낼지 고르는 일은 공유 시트가 이미 하고 있고, 그 앞에 창을 하나 더 두면
 * 보내려던 사람도 거기서 그만둔다.
 *
 * 실패는 버튼 아래 한 줄로 말한다. 아무 일도 안 일어나면 버튼이 고장 난 것으로 보인다.
 */
export function ShareButton({
  kind,
  message,
  where,
  label,
  tone = 'quiet',
  className,
}: ShareButtonProps) {
  const { busy, failure, share } = useShare(where);

  return (
    <div className={cx('share', className)}>
      <button
        type="button"
        className={cx('share__button', tone === 'strong' && 'share__button--strong')}
        disabled={busy}
        onClick={() => void share(kind, message)}
      >
        <ShareGlyph />
        {/* 누른 뒤 한 박자 걸린다. 글자가 안 바뀌면 눌렸는지 알 수 없다. */}
        <span className="share__label">{busy ? '공유창 여는 중' : label}</span>
      </button>

      {failure ? (
        <p className="share__failure" role="alert">
          {failure}
        </p>
      ) : null}
    </div>
  );
}

/** 내보내기 그림. 글자와 함께 서므로 읽지 않는다. */
function ShareGlyph() {
  return (
    <svg
      className="share__glyph"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 10.5V2.2" />
      <path d="M5.2 4.9L8 2.1l2.8 2.8" />
      <path d="M3.4 8.6v4.3c0 .6.5 1 1 1h7.2c.6 0 1-.4 1-1V8.6" />
    </svg>
  );
}
