import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useOverlayBackClose } from '../../app/providers';
import type { AssetItemOut } from '../../shared/api';
import { cx } from '../../shared/lib/cx';
import { formatCurrency } from '../../shared/lib/format';
import { Button, CategoryAvatar, SheetHeader } from '../../shared/ui';
import { trapTab } from '../../shared/ui/focusTrap';
import { useDragToDismiss } from '../../shared/ui/useDragToDismiss';
import { ASSET_GROUP_VIEWS, itemValueOf } from '../assets';
import { DEST_LABEL_MAX } from './destinations';
import { accountNameOf, findSameAccount, type ProceedsChoice } from './proceeds';

export interface ProceedsDestPageProps {
  open: boolean;
  /** 고를 수 있는 통장. `proceedsAccountsOf(destinations)`. */
  accounts: readonly AssetItemOut[];
  /** 지금 고른 통장의 키. 그 줄에 표시가 선다. */
  pickedKey: string | null;
  /** 넣을 곳이 이미 있나. 있으면 「넣지 않기」 가 선다(목록에 없는 통장이어도 비울 수 있다). */
  hasValue: boolean;
  onChoose: (choice: ProceedsChoice) => void;
  /** 고르지 않고 이 창을 연 화면으로 돌아간다. */
  onBack: () => void;
}

/**
 * 「받은 돈을 어디에 넣었어요?」. 화면을 덮는 한 장이다.
 *
 * 예적금·현금 통장을 이름과 지금 금액으로 한 줄씩 세우고, 맨 아래 「새 통장」 에서 이름만 적어 만든다.
 * 창 안에 뒤로 버튼과 닫기 버튼은 없다(ADR-0048). 토스 ‹, 폰 뒤로가기, Esc 가 한 단계씩 물리고
 * (새 통장 칸 → 목록 → 닫기), 아래로 미는 손짓은 창을 닫는다. 뒤의 시트는 그대로 남는다.
 */
export function ProceedsDestPage({ open, ...rest }: ProceedsDestPageProps) {
  // 열 때마다 새로 세운다. 적다 만 새 통장 이름이 다음에 남지 않는다.
  return open ? <ProceedsDestBody {...rest} /> : null;
}

function ProceedsDestBody({
  accounts,
  pickedKey,
  hasValue,
  onChoose,
  onBack,
}: Omit<ProceedsDestPageProps, 'open'>) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const ready = label.trim() !== '';

  function back(): void {
    if (adding) {
      setAdding(false);
      setLabel('');
      return;
    }
    onBack();
  }

  // 아래 효과는 한 번만 달고 부르는 함수는 늘 지금 것을 본다.
  const backRef = useRef(back);
  useEffect(() => {
    backRef.current = back;
  });

  // 이 창이 나중에 등록돼 뒤로가기를 받는다. 뒤의 저장 뒤 화면이나 고치기 시트는 안 닫힌다.
  useOverlayBackClose(true, back);

  const dismiss = useDragToDismiss({ boxRef, active: true, enabled: true, onDismiss: onBack });

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    const first =
      box?.querySelector<HTMLElement>('button[aria-pressed="true"]') ??
      box?.querySelector<HTMLElement>('button');
    first?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        // 뒤의 시트도 같은 document 에서 Esc 를 듣는다. 캡처에서 삼켜야 한 겹만 접힌다.
        event.preventDefault();
        event.stopImmediatePropagation();
        backRef.current();
        return;
      }
      if (event.key !== 'Tab' || !boxRef.current) return;
      trapTab(boxRef.current, event);
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus();
    };
  }, []);

  function submitNew(): void {
    if (!ready) return;
    const same = findSameAccount(accounts, label);
    if (same?.item_key != null) {
      onChoose({ type: 'item', itemKey: same.item_key, name: accountNameOf(same) });
      return;
    }
    onChoose({ type: 'new', label: label.trim() });
  }

  return createPortal(
    <div
      className={cx('proceeds-page', dismiss.dragging && 'proceeds-page--dragging')}
      role="dialog"
      aria-modal="true"
      aria-label="받은 돈 넣을 곳"
      ref={boxRef}
      style={dismiss.offset > 0 ? { transform: `translateY(${dismiss.offset}px)` } : undefined}
      onClickCapture={dismiss.onClickCapture}
      {...dismiss.handlers}
    >
      <SheetHeader title="받은 돈을 어디에 넣었어요?" />
      {accounts.map((item) => {
        if (item.item_key == null) return null;
        const itemKey = item.item_key;
        const name = accountNameOf(item);
        return (
          <button
            key={itemKey}
            type="button"
            className="asset-dest-list__row"
            aria-pressed={itemKey === pickedKey}
            onClick={() => onChoose({ type: 'item', itemKey, name })}
          >
            <CategoryAvatar icon={ASSET_GROUP_VIEWS[item.group].icon} size={44} />
            <span className="asset-dest-list__text">
              <span className="asset-dest-list__name">{name}</span>
              <span className="asset-dest-list__sub" data-numeric="">
                {formatCurrency(itemValueOf(item))}
              </span>
            </span>
          </button>
        );
      })}
      {adding ? (
        <div className="proceeds-page__new">
          <label className="asset-sheet__field proceeds-page__name">
            <span className="asset-sheet__label">새 통장</span>
            <input
              className="asset-sheet__input"
              value={label}
              autoFocus
              autoComplete="off"
              placeholder="예: 토스뱅크 통장"
              maxLength={DEST_LABEL_MAX}
              enterKeyHint="done"
              onChange={(event) => setLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitNew();
              }}
            />
          </label>
          <Button
            variant="primarySmall"
            className="proceeds-page__ok"
            disabled={!ready}
            onClick={submitNew}
          >
            확인
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className="asset-dest-list__row asset-dest-list__row--add"
          onClick={() => setAdding(true)}
        >
          <span className="asset-dest-list__plus" aria-hidden="true">
            ＋
          </span>
          <span className="asset-dest-list__name">새 통장</span>
        </button>
      )}
      {hasValue ? (
        <Button
          variant="outline"
          className="proceeds-page__clear"
          onClick={() => onChoose({ type: 'none' })}
        >
          넣지 않기
        </Button>
      ) : null}
    </div>,
    document.body,
  );
}
