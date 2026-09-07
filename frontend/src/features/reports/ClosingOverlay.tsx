import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';

import { useBridge, useOverlayBackClose } from '../../app/providers';
import { ROUTES } from '../../app/router/routes';
import { parseDecimalOr, useCategories, type CategoryOut, type ClosingOut } from '../../shared/api';
import { markClosingSeen } from '../../shared/lib/closingSeen';
import { formatCurrency, formatMonthLabel, formatSignedCurrency } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import { trapTab } from '../../shared/ui/focusTrap';

import {
  CHANGE_NOTE,
  CLOSING_CARDS,
  NO_CHANGE_LINE,
  NO_NEXT_LINE,
  changeLine,
  changeWindow,
  deltaLabel,
  enoughLine,
  highlightLine,
  nextLine,
  recordedDaysLine,
  type ClosingCardKey,
} from './closingText';

export interface ClosingOverlayProps {
  /** `2026-08`. 결산은 늘 끝난 달을 본다. */
  month: string;
  closing: ClosingOut;
  open: boolean;
  onClose: () => void;
}

/**
 * 결산 카드 넉 장을 한 장씩 넘겨 보는 전체화면 오버레이.
 *
 * 바텀시트가 아니다. 카드 하나에 한 가지만 두고 넘겨 보게 하려면 화면을 다 써야 한다.
 * 뒤로가기·✕·Esc 셋 다 닫는다. 저절로 뜨지 않고, 사용자가 카드를 눌렀을 때만 열린다.
 *
 * **광고를 넣지 않는다.** 한 달을 돌아보는 자리에 광고가 끼면 결산이 광고를 보여주는
 * 구실이 된다. 배너는 홈 한 곳뿐이다.
 */
export function ClosingOverlay({ open, ...rest }: ClosingOverlayProps) {
  // 열려 있는 동안만 마운트한다. 그래야 몇 번째 카드인지가 닫을 때 저절로 처음으로 돌아간다.
  // 열린 채로 두고 효과 안에서 되돌리면, 되돌리는 그 렌더가 한 번 더 그려진다.
  if (!open) return null;
  return <ClosingDialog {...rest} />;
}

function ClosingDialog({ month, closing, onClose }: Omit<ClosingOverlayProps, 'open'>) {
  const bridge = useBridge();
  const categories = useCategories();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  useOverlayBackClose(true, onClose);

  // 봤다는 표시는 연 그 순간에 남긴다. 끝까지 넘겨야 남기면, 첫 장만 보고 닫은 사람에게
  // 같은 카드가 매일 다시 뜬다.
  useEffect(() => {
    void markClosingSeen(bridge.storage, month);
  }, [month, bridge]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      trapTab(dialogRef.current, event);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const label = `${formatMonthLabel(month)} 결산`;
  const last = index === CLOSING_CARDS.length - 1;
  const byId = new Map((categories.data?.items ?? []).map((item) => [item.id, item]));

  return createPortal(
    <div
      ref={dialogRef}
      className="closing"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
    >
      <header className="closing__head">
        <p className="closing__month">{label}</p>
        <button type="button" className="closing__close" onClick={onClose} aria-label="닫기">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path
              d="M4 4l10 10M14 4L4 14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      {/* 몇 장 중 몇 번째인지. 넘길 것이 남았다는 것을 점으로 알린다. */}
      <div className="closing__dots" aria-hidden="true">
        {CLOSING_CARDS.map((card, position) => (
          <span
            key={card.key}
            className="closing__dot"
            data-testid={TEST_IDS.closingDot}
            data-current={position === index ? '' : undefined}
          />
        ))}
      </div>

      <section className="closing__card" aria-live="polite">
        <h2 className="closing__title">{CLOSING_CARDS[index].title}</h2>
        <ClosingCardBody
          card={CLOSING_CARDS[index].key}
          month={month}
          closing={closing}
          byId={byId}
        />
      </section>

      <button
        type="button"
        className="closing__next"
        onClick={() => (last ? onClose() : setIndex(index + 1))}
      >
        {/* 마지막 장에서도 '닫기' 라고 하면 위 ✕ 와 이름이 같아진다. 다 본 것은 다른 뜻이다. */}
        {last ? '다 봤어요' : '다음'}
      </button>
    </div>,
    document.body,
  );
}

function ClosingCardBody({
  card,
  month,
  closing,
  byId,
}: {
  card: ClosingCardKey;
  month: string;
  closing: ClosingOut;
  byId: Map<string, CategoryOut>;
}) {
  switch (card) {
    case 'highlights':
      return <HighlightsCard month={month} closing={closing} byId={byId} />;
    case 'flow':
      return <FlowCard month={month} closing={closing} />;
    case 'change':
      return <ChangeCard closing={closing} byId={byId} />;
    case 'next':
      return <NextCard closing={closing} byId={byId} />;
  }
}

/** 잘한 것. 근거가 없으면 억지로 칭찬하지 않는다. */
function HighlightsCard({
  month,
  closing,
  byId,
}: {
  month: string;
  closing: ClosingOut;
  byId: Map<string, CategoryOut>;
}) {
  const lines = closing.highlights
    .map((item) => highlightLine(item, byId.get(item.category_id ?? '')?.name))
    .filter((line): line is string => line != null);

  if (lines.length === 0) {
    return <p className="closing__lead">{enoughLine(month)}</p>;
  }

  return (
    <ul className="closing__lines">
      {lines.map((line) => (
        <li key={line} className="closing__line" data-testid={TEST_IDS.closingHighlight}>
          {line}
        </li>
      ))}
    </ul>
  );
}

/** 돈 흐름. 남은 예산도 순자산도 아니고, 그 달에 들고 난 돈이다. */
function FlowCard({ month, closing }: { month: string; closing: ClosingOut }) {
  const flow = closing.flow;
  const transfer = parseDecimalOr(flow.transfer, 0);

  return (
    <>
      <dl className="closing__flow" data-testid={TEST_IDS.closingFlow}>
        <div className="closing__flow-row">
          <dt>번 돈</dt>
          <dd className="closing__flow-value is-income">
            {formatCurrency(parseDecimalOr(flow.income, 0))}
          </dd>
        </div>
        <div className="closing__flow-row">
          <dt>쓴 돈</dt>
          <dd className="closing__flow-value">{formatCurrency(parseDecimalOr(flow.expense, 0))}</dd>
        </div>
        <div className="closing__flow-row">
          <dt>{deltaLabel(month)}</dt>
          <dd className="closing__flow-value">
            {formatSignedCurrency(parseDecimalOr(flow.delta, 0))}
          </dd>
        </div>
        {/* 옮기기만 한 돈은 지출도 수입도 아니다. 한 번도 안 옮겼으면 줄을 아예 빼서
            무슨 말인지 모를 0원을 두지 않는다. */}
        {transfer !== 0 ? (
          <div className="closing__flow-row">
            <dt>옮긴 돈</dt>
            <dd className="closing__flow-value is-muted">{formatCurrency(transfer)}</dd>
          </div>
        ) : null}
      </dl>
      {/* 며칠 빠뜨렸는지는 세지 않는다. 적은 날만 센다. */}
      <p className="closing__foot">{recordedDaysLine(flow.recorded_days, flow.total_days)}</p>
    </>
  );
}

/** 살펴볼 변화. 늘어난 것을 잘못으로 읽지 않게 끝에 한 줄을 붙인다. */
function ChangeCard({ closing, byId }: { closing: ClosingOut; byId: Map<string, CategoryOut> }) {
  const change = closing.change;

  return (
    <div data-testid={TEST_IDS.closingChange}>
      {change == null ? (
        <p className="closing__lead">{NO_CHANGE_LINE}</p>
      ) : (
        <>
          <p className="closing__lead">{changeLine(change, byId.get(change.category_id)?.name)}</p>
          <p className="closing__foot">{changeWindow(change)}</p>
          <p className="closing__note">{CHANGE_NOTE}</p>
        </>
      )}
    </div>
  );
}

/**
 * 다음 달 하나만.
 *
 * **여기서 예산을 정해 주지 않는다.** 결산이 다음 달 예산을 대신 정하면 사용자가
 * 안 본 사이에 숫자가 바뀐다. 가는 길만 열어 둔다.
 */
function NextCard({ closing, byId }: { closing: ClosingOut; byId: Map<string, CategoryOut> }) {
  const next = closing.next;

  return (
    <div data-testid={TEST_IDS.closingNext}>
      <p className="closing__lead">
        {next == null ? NO_NEXT_LINE : nextLine(next, byId.get(next.category_id)?.name)}
      </p>
      {next != null ? (
        <Link className="closing__link" to={ROUTES.manage}>
          예산 화면으로
        </Link>
      ) : null}
    </div>
  );
}
