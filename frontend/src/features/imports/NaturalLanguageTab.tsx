import { useState } from 'react';

import {
  ApiError,
  parseDecimalOr,
  useAnalyzeText,
  useCategories,
  useCommitImport,
  useDeleteImport,
  usePatchImportCandidate,
  type ImportBatchOut,
  type ImportCandidatePatch,
  type ImportCommitOut,
} from '../../shared/api';
import { formatCurrency, toLedgerDate } from '../../shared/lib/format';
import { Button, ErrorState, LoadingState } from '../../shared/ui';

import { CandidateRow } from './CandidateRow';

const PLACEHOLDER = '점심 12000 스벅 4500 어제 택시 9000';

export interface NaturalLanguageTabProps {
  /** 요청이 도는 동안 시트가 닫히거나 탭이 옮겨지지 않게 껍데기에 알린다. */
  onBusyChange: (busy: boolean) => void;
  onDone: () => void;
}

/**
 * 줄글로 적고 검토해서 저장한다.
 *
 * 분석은 거래를 만들지 않는다. 저장 버튼은 하나이고 건수와 합계를 그 버튼에 적는다.
 * 건별로 저장하면 몇 건이 들어갔는지 사용자가 세어야 한다.
 */
export function NaturalLanguageTab({ onBusyChange, onDone }: NaturalLanguageTabProps) {
  const categories = useCategories();
  const analyze = useAnalyzeText();
  const patch = usePatchImportCandidate();
  const commit = useCommitImport();
  const discard = useDeleteImport();

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
            // 분석이 도는 동안 시트가 닫히면 결과를 되찾을 길이 없다.
            onBusyChange(true);
            analyze.mutate(text.trim(), {
              onSettled: () => onBusyChange(false),
              onSuccess: setBatch,
            });
          }}
        >
          분석
        </Button>
      </div>
    );
  }

  const candidates = batch.candidates ?? [];
  const total = parseDecimalOr(batch.selected_expense_total, 0);
  const canSave = batch.selected_count > 0 && !busy;
  const dropped = truncatedCount(batch.error_code);

  return (
    <div className="nl">
      <p className="nl__read">이렇게 이해했어요. 눌러서 고칠 수 있어요</p>

      {dropped > 0 ? (
        <p className="nl__notice" role="status">
          한 번에 20건까지만 읽어요. {dropped}건은 다음에 나눠서 적어 주세요
        </p>
      ) : null}

      {categories.isPending ? (
        <LoadingState size="inline" label="분류를 불러오는 중이에요" />
      ) : null}
      {categories.isError ? (
        <ErrorState
          size="inline"
          title="분류를 불러오지 못했어요"
          description="분류 이름이 안 보이고 고칠 수도 없어요."
          onRetry={() => void categories.refetch()}
        />
      ) : null}

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
            // 버린 묶음은 서버에서도 지운다. 안 지우면 검토하다 만 것이 계속 쌓인다.
            discard.mutate(batch.id);
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
              onBusyChange(true);
              commit.mutate(batch.id, {
                onSettled: () => onBusyChange(false),
                onSuccess: setSaved,
              });
            }}
          >
            {saveLabel(batch.selected_count, total)}
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
    onBusyChange(true);
    patch.mutate(
      { batchId, candidateId, body },
      {
        onSettled: () => onBusyChange(false),
        onSuccess: (next) => {
          setBatch(next);
          onSuccess?.();
        },
      },
    );
  }
}

/**
 * 저장 버튼 문구.
 *
 * 합계는 지출만 센다. 수입·이체만 고른 상태에서 금액을 적으면 쓴 돈처럼 읽힌다.
 */
function saveLabel(count: number, expenseTotal: number): string {
  if (expenseTotal <= 0) return `${count}건 저장`;
  return `${count}건 저장 · ${formatCurrency(expenseTotal)}`;
}

/** 서버가 상한을 넘겨 버린 건수를 여기에 실어 보낸다. */
function truncatedCount(code: string | null | undefined): number {
  if (code == null || !code.startsWith('TRUNCATED:')) return 0;
  const parsed = Number(code.slice('TRUNCATED:'.length));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function SavedPanel({ result, onDone }: { result: ImportCommitOut; onDone: () => void }) {
  const budget = result.budget;
  // 지난달 날짜로 저장하면 서버가 그 달의 예산 상태를 준다. 그걸 '이번 달' 이라고 적으면 거짓말이다.
  const isThisMonth = budget != null && budget.period_start.slice(0, 7) === thisMonth();
  const remaining = isThisMonth ? budget.remaining_budget : null;
  const total = parseDecimalOr(result.expense_total, 0);

  return (
    <div className="nl nl--saved" role="status">
      <p className="nl__saved-title">
        {result.created_count}건 저장했어요{total > 0 ? ` · ${formatCurrency(total)}` : ''}
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

function thisMonth(): string {
  return toLedgerDate(new Date()).slice(0, 7);
}
