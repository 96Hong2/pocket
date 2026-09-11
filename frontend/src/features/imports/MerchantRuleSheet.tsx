import { useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { ApiError, useCategories, useCreateMerchantRule } from '../../shared/api';
import { BottomSheet, Button, CategoryAvatar, toIconName } from '../../shared/ui';

/** 라벨과 설명을 입력칸에 걸어 주는 id. 이 시트는 한 화면에 하나만 뜬다. */
const MERCHANT_FIELD_ID = 'rule-merchant';
const MERCHANT_HINT_ID = 'rule-merchant-hint';

export interface MerchantRuleSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 상호에 분류를 손으로 걸어 두는 시트.
 *
 * 앱이 기억할 때까지 기다리지 않아도 되게 한다. 자주 가는 가게를 미리 적어 두면
 * 첫 캡처부터 그 분류로 들어온다.
 */
export function MerchantRuleSheet({ open, onClose }: MerchantRuleSheetProps) {
  const [busy, setBusy] = useState(false);

  useOverlayBackClose(open, onClose, busy);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title="분류 걸어두기"
      className="rule-sheet"
    >
      {open ? <MerchantRuleForm onBusyChange={setBusy} onClose={onClose} /> : null}
    </BottomSheet>
  );
}

function MerchantRuleForm({
  onBusyChange,
  onClose,
}: {
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
}) {
  const categories = useCategories();
  const create = useCreateMerchantRule();

  const [merchant, setMerchant] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);

  // 이체는 분류가 하나뿐이라 걸어 둘 것이 없다. 환불은 되돌릴 지출의 분류를 따라간다.
  const pickable = (categories.data?.items ?? []).filter(
    (item) => item.kind === 'expense' || item.kind === 'income',
  );

  const trimmed = merchant.trim();
  const busy = create.isPending;
  const canSave = trimmed !== '' && categoryId != null && !busy;
  const failure =
    create.error == null
      ? null
      : create.error instanceof ApiError
        ? create.error.message
        : '분류를 걸지 못했어요.';

  function save(): void {
    if (!canSave || categoryId == null) return;
    onBusyChange(true);
    create.mutate(
      { merchant: trimmed, category_id: categoryId },
      { onSettled: () => onBusyChange(false), onSuccess: onClose },
    );
  }

  return (
    <div className="rule-sheet__body">
      {/*
        안내는 label 밖에 두고 `aria-describedby` 로 건다. label 안에 넣으면 그 문구가
        입력칸의 접근성 이름에 딸려 붙어 이름이 「상호 띄어쓰기와 대소문자는…」 이 된다.
      */}
      <div className="rule-sheet__field">
        <label className="rule-sheet__label" htmlFor={MERCHANT_FIELD_ID}>
          상호
        </label>
        <input
          id={MERCHANT_FIELD_ID}
          className="rule-sheet__input"
          aria-describedby={MERCHANT_HINT_ID}
          value={merchant}
          onChange={(event) => setMerchant(event.target.value)}
          placeholder="가게 이름 (예: 스타벅스)"
          maxLength={120}
        />
        {/*
          띄어쓰기와 대소문자는 서버가 지우고 견준다. 그걸 모르면 '스타벅스' 와
          '스타 벅스' 를 둘 다 적어 두게 된다.
        */}
        <span className="rule-sheet__note" id={MERCHANT_HINT_ID}>
          띄어쓰기와 대소문자는 달라도 같은 가게로 봐요
        </span>
      </div>

      <div className="rule-sheet__field">
        <span className="rule-sheet__label">분류</span>
        <div className="nl-form__cats" role="group" aria-label="걸어 둘 분류">
          {pickable.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === categoryId ? 'nl-form__cat nl-form__cat--on' : 'nl-form__cat'}
              aria-pressed={item.id === categoryId}
              disabled={busy}
              onClick={() => setCategoryId(item.id)}
            >
              <CategoryAvatar icon={toIconName(item.icon_key)} size={32} />
              {item.name}
            </button>
          ))}
        </div>
      </div>

      {failure ? (
        <p className="rule-sheet__notice" role="alert">
          {failure}
        </p>
      ) : null}

      <Button fullWidth disabled={!canSave} onClick={save}>
        걸어두기
      </Button>
    </div>
  );
}
