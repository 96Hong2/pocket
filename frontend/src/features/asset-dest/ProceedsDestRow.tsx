import { cx } from '../../shared/lib/cx';

export interface ProceedsDestRowProps {
  /** 고른 통장 이름. 안 골랐으면 null 이고 오른쪽에 「고르기」 가 선다. */
  name: string | null;
  onOpen: () => void;
  /**
   * 고른 것을 저장하는 중. 눌러도 창이 안 열린다.
   *
   * `disabled` 로 막지 않는다. 막으면 창이 닫히며 돌아올 포커스를 이 줄이 못 받아
   * 포커스가 화면 밖(body)으로 떨어진다.
   */
  busy?: boolean;
  className?: string;
}

/**
 * 「받은 돈 넣을 곳」 한 줄. 줄 전체가 누르는 자리이고 누르면 고르는 창이 뜬다.
 * 저축·투자 저장 뒤 화면과 기록 고치기가 같은 줄을 쓴다. 팔았어요 기록에만 선다.
 */
export function ProceedsDestRow({ name, onOpen, busy = false, className }: ProceedsDestRowProps) {
  return (
    <button
      type="button"
      className={cx('proceeds-row', className)}
      // 두 글씨가 붙어 읽히지 않게 이름을 따로 준다.
      aria-label={name == null ? '받은 돈 넣을 곳 고르기' : `받은 돈 넣을 곳 ${name}, 바꾸기`}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      onClick={() => {
        if (!busy) onOpen();
      }}
    >
      <span className="proceeds-row__label">받은 돈 넣을 곳</span>
      <span className={cx('proceeds-row__value', name == null && 'proceeds-row__value--empty')}>
        {name ?? '고르기'}
      </span>
      <span className="proceeds-row__caret" aria-hidden="true">
        ›
      </span>
    </button>
  );
}
