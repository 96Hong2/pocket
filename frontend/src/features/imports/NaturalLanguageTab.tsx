import { useState } from 'react';

import {
  ApiError,
  parseDecimalOr,
  useAnalyzeText,
  useCategories,
  useCommitImport,
  usePatchImportCandidate,
  type ImportBatchOut,
  type ImportCandidatePatch,
  type ImportCommitOut,
} from '../../shared/api';
import { formatCurrency } from '../../shared/lib/format';
import { Button, LoadingState } from '../../shared/ui';

import { CandidateRow } from './CandidateRow';

const PLACEHOLDER = '점심 12000 스벅 4500 어제 택시 9000';

export interface NaturalLanguageTabProps {
  /** 저장 응답을 기다리는 동안 시트가 닫히지 않게 껍데기에 알린다. */
  onSavingChange: (saving: boolean) => void;
  onDone: () => void;
}

/**
 * 줄글로 적고 검토해서 저장한다.
 *
 * 분석은 거래를 만들지 않는다. 저장 버튼은 하나이고 건수와 합계를 그 버튼에 적는다.
 * 건별로 저장하면 몇 건이 들어갔는지 사용자가 세어야 한다.
 */
export function NaturalLanguageTab({ onSavingChange, onDone }: NaturalLanguageTabProps) {
  const categories = useCategories();
  const analyze = useAnalyzeText();
  const patch = usePatchImportCandidate();
  const commit = useCommitImport();

  const [text, setText] = useState('');
  const [batch, setBatch] = useState<ImportBatchOut | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [saved, setSaved] = useState<ImportCommitOut | null>(null);

  const expenseCategories = (categories.data?.items ?? []).filter(
    (category) => category.kind === 'expense',
  );

  const busy = analyze.isPending || patch.isPending || commit.isPending;
  const failure = analyze.error ?? patch.error ?? commit.error;
  const message = failure instanceof ApiError ? failure.message : null;

  if (saved != null) {
    return <SavedPanel result={saved} onDone={onDone} />;
  }

  if (batch == null) {
    return (
      <div className="nl">
        <label className="nl__field">
          <span className="nl__label">무엇을 썼나요</span>
          <textarea
            className="nl__input"
            value={text}
            rows={3}
            maxLength={1000}
            placeholder={PLACEHOLDER}
            disabled={analyze.isPending}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <p className="nl__hint">한 번에 여러 건을 적어도 돼요. 날짜를 적으면 그 날로 넣어요</p>

        {message ? (
          <p className="nl__notice" role="alert">
            {message}
          </p>
        ) : null}

        {analyze.isPending ? <LoadingState size="inline" label="읽는 중이에요" /> : null}

        <Button
          fullWidth
          disabled={text.trim() === '' || analyze.isPending}
          onClick={() => {
            analyze.mutate(text.trim(), { onSuccess: setBatch });
          }}
        >
          분석
        </Button>
      </div>
    );
  }

  const candidates = batch.candidates ?? [];
  const total = parseDecimalOr(batch.selected_total, 0);
  const canSave = batch.selected_count > 0 && !busy;

  return (
    <div className="nl">
      <p className="nl__read">이렇게 이해했어요. 눌러서 고칠 수 있어요</p>

      {candidates.length === 0 ? (
        <p className="nl__empty">
          문장에서 금액을 찾지 못했어요. `점심 12000` 처럼 금액을 함께 적어 주세요
        </p>
      ) : (
        <ul className="nl__list">
          {candidates.map((candidate) => (
            <CandidateRow
              key={candidate.id}
              candidate={candidate}
              categories={expenseCategories}
              editing={editing === candidate.id}
              disabled={busy}
              onToggle={(selected) => {
                sendPatch(batch.id, candidate.id, { is_selected: selected });
              }}
              onEdit={() => setEditing(candidate.id)}
              onEditClose={() => setEditing(null)}
              onSave={(body) => {
                if (Object.keys(body).length === 0) {
                  setEditing(null);
                  return;
                }
                sendPatch(batch.id, candidate.id, body, () => setEditing(null));
              }}
            />
          ))}
        </ul>
      )}

      {message ? (
        <p className="nl__notice" role="alert">
          {message}
        </p>
      ) : null}

      <div className="nl__actions">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setBatch(null);
            setEditing(null);
          }}
        >
          다시 쓰기
        </Button>
        {candidates.length > 0 ? (
          <Button
            className="nl__done"
            disabled={!canSave}
            onClick={() => {
              onSavingChange(true);
              commit.mutate(batch.id, {
                onSettled: () => onSavingChange(false),
                onSuccess: setSaved,
              });
            }}
          >
            {batch.selected_count}건 저장 · {formatCurrency(total)}
          </Button>
        ) : null}
      </div>
    </div>
  );

  function sendPatch(
    batchId: string,
    candidateId: string,
    body: ImportCandidatePatch,
    onSuccess?: () => void,
  ): void {
    patch.mutate(
      { batchId, candidateId, body },
      {
        onSuccess: (next) => {
          setBatch(next);
          onSuccess?.();
        },
      },
    );
  }
}

function SavedPanel({ result, onDone }: { result: ImportCommitOut; onDone: () => void }) {
  const remaining = result.budget?.remaining_budget;

  return (
    <div className="nl nl--saved" role="status">
      <p className="nl__saved-title">
        {result.created_count}건 저장했어요 ·{' '}
        {formatCurrency(parseDecimalOr(result.total_amount, 0))}
      </p>
      {remaining != null ? (
        <p className="nl__saved-detail">
          이번 달 남은 예산 {formatCurrency(parseDecimalOr(remaining, 0))}
        </p>
      ) : null}
      <Button fullWidth onClick={onDone}>
        확인
      </Button>
    </div>
  );
}
