import type { BookOut } from '../../shared/api';
import { cx } from '../../shared/lib/cx';

export interface BookPayerRowProps {
  book: BookOut;
  /** 지금 낸 사람. 나간 멤버면 어느 칩도 눌려 있지 않다. */
  value: string | null;
  onChange: (memberId: string) => void;
  disabled?: boolean;
  className?: string;
  /** 줄 이름. 입금 기록은 「넣은 사람」 이다. */
  label?: string;
}

/**
 * 「낸 사람」 한 줄. 지금 남아 있는 멤버를 칩으로 세운다. 입금이면 「넣은 사람」 이다.
 *
 * 결제 수단 줄(`pk-pay`)과 같은 옷을 입는다. 혼자 쓰는 가계부에는 고를 사람이 없어 안 그린다.
 * 멤버가 많으면 다음 줄로 넘긴다. 한 줄에 우겨 넣으면 이름이 한 글자씩 잘린다.
 */
export function BookPayerRow({
  book,
  value,
  onChange,
  disabled = false,
  className,
  label = '낸 사람',
}: BookPayerRowProps) {
  const members = book.members.filter((member) => !member.left && member.name != null);
  if (members.length < 2) return null;

  return (
    <div className={cx('pk-pay book-payer', className)} role="group" aria-label={label}>
      <span className="pk-pay__label">{label}</span>
      <div className="pk-pay__items book-payer__items">
        {members.map((member) => (
          <button
            key={member.id}
            type="button"
            className="pk-pay__item book-payer__item"
            aria-pressed={member.id === value}
            disabled={disabled}
            onClick={() => onChange(member.id)}
          >
            {member.name}
          </button>
        ))}
      </div>
    </div>
  );
}
