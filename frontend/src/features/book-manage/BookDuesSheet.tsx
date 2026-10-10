import { useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import {
  ApiError,
  parseDecimal,
  useUpdateBook,
  type BookOut,
  type BookUpdate,
  type SettleRule,
} from '../../shared/api';
import { AmountField, BottomSheet, Button, RatioSlider } from '../../shared/ui';
import {
  SETTLE_RULES,
  activeMemberIds,
  currentPercents,
  memberName,
  membersBucket,
  movePercent,
  percentOf,
  percentSum,
  percentsReady,
  samePercents,
  settleRuleLabel,
  settleRuleLine,
  type SharePercents,
} from '../books';

export interface BookDuesSheetProps {
  open: boolean;
  book: BookOut;
  onClose: () => void;
  /** 저장한 뒤. 알림을 띄울 자리가 부른다. 바뀐 것이 없어 저장하지 않았으면 부르지 않는다. */
  onSaved: () => void;
}

/**
 * 「회비」. 각자 입금과 나중에 정산 가운데 하나를 고르고, 멤버마다 비율을 10% 단위로 정한다.
 *
 * 둘이면 한 사람을 움직이면 다른 사람이 따라온다. 셋 이상이면 각자 움직이고 합이 100% 가
 * 아니면 저장을 막고 그 자리에 지금 합을 적는다. 「똑같이」 는 비율을 지워 인원수대로 나눈다.
 * 「한 달 회비」 는 각자 입금일 때만 묻는다. 저장은 PATCH 한 번이다.
 */
export function BookDuesSheet({ open, book, onClose, onSaved }: BookDuesSheetProps) {
  const [saving, setSaving] = useState(false);
  useOverlayBackClose(open, onClose, saving);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      dismissible={!saving}
      title="회비"
      className="book-dues"
    >
      {/* 열 때마다 새로 마운트해 지금 저장된 값에서 시작한다. */}
      {open ? (
        <DuesForm book={book} onSavingChange={setSaving} onClose={onClose} onSaved={onSaved} />
      ) : null}
    </BottomSheet>
  );
}

function DuesForm({
  book,
  onSavingChange,
  onClose,
  onSaved,
}: {
  book: BookOut;
  onSavingChange: (saving: boolean) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const analytics = useAnalytics();
  const update = useUpdateBook();
  const ids = activeMemberIds(book);
  const saved = currentPercents(ids, book.share_percents);
  const savedDues = parseDecimal(book.dues_amount);

  const [rule, setRule] = useState<SettleRule>(book.settle_rule);
  const [percents, setPercents] = useState<SharePercents | null>(saved);
  const [digits, setDigits] = useState(savedDues == null ? '' : String(savedDues));

  const shared = ids.length >= 2;
  const ready = percentsReady(ids, percents);
  const sum = percents == null ? 100 : percentSum(percents);
  const dues = digits === '' ? null : Number(digits);
  const message = update.error instanceof ApiError ? update.error.message : null;
  const busy = update.isPending;

  /** 바뀐 것만 싣는다. 회비 금액은 각자 입금일 때만 묻고, 나중에 정산으로 바꿔도 지우지 않는다. */
  function changes(): BookUpdate {
    const body: BookUpdate = {};
    if (rule !== book.settle_rule) body.settle_rule = rule;
    if (shared && !samePercents(percents, saved)) body.share_percents = percents;
    if (rule === 'none' && dues !== savedDues) body.dues_amount = dues;
    return body;
  }

  function save(): void {
    const body = changes();
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    onSavingChange(true);
    update.mutate(
      { bookId: book.id, body },
      {
        onSettled: () => onSavingChange(false),
        onSuccess: (next) => {
          analytics.log(
            EVENTS.bookChanged,
            {
              action: 'dues_changed',
              kind: next.kind,
              rule: next.settle_rule,
              ratio: next.share_percents != null,
              dues: next.dues_amount != null,
              members: membersBucket(next.active_member_count),
            },
            { kind: 'click' },
          );
          onSaved();
          onClose();
        },
      },
    );
  }

  return (
    <div className="book-dues__body">
      <div className="book-rules" role="radiogroup" aria-label="회비 방식">
        {SETTLE_RULES.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={rule === option}
            className="book-rule"
            disabled={busy}
            onClick={() => setRule(option)}
          >
            <span className="book-rule__name">{settleRuleLabel(option)}</span>
            <span className="book-rule__line">{settleRuleLine(option)}</span>
          </button>
        ))}
      </div>

      {shared ? (
        <section className="book-dues__ratio" aria-labelledby="book-dues-ratio">
          <div className="book-dues__ratio-head">
            <h3 id="book-dues-ratio" className="book-dues__label">
              비율
            </h3>
            <button
              type="button"
              className="book-dues__equal"
              aria-pressed={percents == null}
              disabled={busy}
              onClick={() => setPercents(null)}
            >
              똑같이
            </button>
          </div>
          {ids.map((id) => (
            <RatioSlider
              key={id}
              label={memberName(book.members.find((member) => member.id === id))}
              value={percentOf(ids, percents, id)}
              disabled={busy}
              onChange={(value) => setPercents(movePercent(ids, percents, id, value))}
            />
          ))}
          {ready ? null : (
            <p className="book-dues__notice" role="status">
              합이 100%가 되게 맞춰 주세요(지금 {sum}%)
            </p>
          )}
        </section>
      ) : null}

      {rule === 'none' ? (
        <AmountField label="한 달 회비" value={digits} onChange={setDigits} />
      ) : null}

      {message != null ? (
        <p className="book-dues__notice" role="alert">
          {message}
        </p>
      ) : null}

      <Button fullWidth disabled={busy || !ready || dues === 0} onClick={save}>
        저장
      </Button>
    </div>
  );
}
