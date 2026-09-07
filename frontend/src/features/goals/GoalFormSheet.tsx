import { useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import {
  ApiError,
  parseDecimalOr,
  useCreateGoal,
  useDeleteGoal,
  useUpdateGoal,
  type GoalOut,
} from '../../shared/api';
import { AmountField, BottomSheet, Button } from '../../shared/ui';

export interface GoalFormSheetProps {
  open: boolean;
  /** 고칠 목표. null 이면 새로 만드는 중이다. */
  goal: GoalOut | null;
  onClose: () => void;
}

/** 목표 시트. 만들 때와 고칠 때가 같은 시트이고 제목과 지우기 버튼만 다르다. */
export function GoalFormSheet({ open, goal, onClose }: GoalFormSheetProps) {
  // 저장 응답을 기다리는 동안에는 닫히지 않는다.
  // 닫히면 폼이 사라져 실패를 그릴 자리가 없어진다. 적어 둔 값도 함께 사라진다.
  const [saving, setSaving] = useState(false);

  // 시스템 뒤로가기를 시트가 먼저 가져간다. 안 그러면 시트가 열린 채 화면만 뒤로 빠진다.
  useOverlayBackClose(open, onClose, saving);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      dismissible={!saving}
      title={goal == null ? '목표 만들기' : '목표 고치기'}
      className="goal-sheet"
    >
      {open ? (
        // 열 때마다 새로 마운트해 지금 저장된 값을 넣는다. 효과로 되넣으면 앞 값이 한 프레임 남는다.
        <GoalForm
          key={goal?.id ?? 'new'}
          goal={goal}
          onSavingChange={setSaving}
          onClose={onClose}
        />
      ) : null}
    </BottomSheet>
  );
}

interface GoalFormProps {
  goal: GoalOut | null;
  onSavingChange: (saving: boolean) => void;
  onClose: () => void;
}

function GoalForm({ goal, onSavingChange, onClose }: GoalFormProps) {
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const remove = useDeleteGoal();

  const [title, setTitle] = useState(goal?.title ?? '');
  const [target, setTarget] = useState(
    goal == null ? '' : String(parseDecimalOr(goal.target_amount, 0)),
  );
  const [deadline, setDeadline] = useState(goal?.target_date ?? '');
  const [initial, setInitial] = useState(() => {
    const saved = parseDecimalOr(goal?.initial_amount, 0);
    return goal == null || saved === 0 ? '' : String(saved);
  });

  const busy = create.isPending || update.isPending || remove.isPending;
  const canSave = title.trim() !== '' && target !== '' && Number(target) > 0 && !busy;
  // 세 요청이 한 시트를 나눠 쓰므로 실패도 한 자리에 모아 그린다.
  const failure = [create.error, update.error, remove.error].find(
    (error): error is ApiError => error instanceof ApiError,
  );

  /** 저장·지우기가 같은 방식으로 시트를 닫는다. 껍데기 쪽이 닫기를 막을 수 있게 알린다. */
  function settle(): { onSettled: () => void; onSuccess: () => void } {
    onSavingChange(true);
    return { onSettled: () => onSavingChange(false), onSuccess: onClose };
  }

  function save(): void {
    const body = {
      title: title.trim(),
      target_amount: Number(target),
      // 안 적었으면 기한이 없는 목표다. 고칠 때 비우면 null 이 가서 기한이 지워진다.
      target_date: deadline === '' ? null : deadline,
      initial_amount: initial === '' ? 0 : Number(initial),
    };
    if (goal == null) {
      create.mutate(body, settle());
      return;
    }
    update.mutate({ goalId: goal.id, body }, settle());
  }

  return (
    <div className="goal-sheet__body">
      <label className="goal-sheet__field">
        <span className="goal-sheet__label">무엇을 위해 모아요</span>
        <input
          className="goal-sheet__input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="예: 제주도 여행"
          maxLength={60}
        />
      </label>

      <AmountField label="목표 금액" value={target} onChange={setTarget} />

      <label className="goal-sheet__field">
        <span className="goal-sheet__label">언제까지 (선택)</span>
        <input
          className="goal-sheet__input"
          type="date"
          value={deadline}
          onChange={(event) => setDeadline(event.target.value)}
        />
        {/* 기한이 없어도 목표는 목표다. 대신 매달 얼마씩이라는 말은 만들 수 없다. */}
        <span className="goal-sheet__hint">정해 두면 매달 얼마씩 모으면 되는지 알려드려요</span>
      </label>

      <div className="goal-sheet__field">
        {/* 이 칸은 시작 금액이다. 카드의 '지금까지' 는 여기에 더한 돈까지 합친 값이라 서로 다르다. */}
        <AmountField label="시작할 때 이미 있던 돈 (선택)" value={initial} onChange={setInitial} />
        {goal != null && goal.contributions.length > 0 ? (
          <span className="goal-sheet__hint">모은 돈은 목표 화면에서 더해요</span>
        ) : null}
      </div>

      {failure ? (
        <p className="goal-sheet__notice" role="alert">
          {failure.message}
        </p>
      ) : null}

      <div className="goal-sheet__actions">
        {goal != null ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => remove.mutate(goal.id, settle())}
          >
            지우기
          </Button>
        ) : null}
        <Button className="goal-sheet__done" disabled={!canSave} onClick={save}>
          저장
        </Button>
      </div>
    </div>
  );
}
