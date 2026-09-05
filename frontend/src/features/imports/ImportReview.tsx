import { useState, type ReactNode } from 'react';

import {
  ApiError,
  parseDecimalOr,
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

export interface ImportReviewProps {
  /** 서버가 읽어 준 묶음. 껍데기가 들고 있고 여기서는 고쳐 준 것을 돌려주기만 한다. */
  batch: ImportBatchOut;
  onBatchChange: (batch: ImportBatchOut) => void;
  /** 요청이 도는 동안 시트가 닫히거나 탭이 옮겨지지 않게 껍데기에 알린다. */
  onBusyChange: (busy: boolean) => void;
  /** 묶음을 버리고 입력 화면으로 되돌린다. */
  onRestart: () => void;
  onDone: () => void;
  /** 어느 탭의 검토 화면인지 e2e 가 가른다. 두 탭이 hidden 으로 함께 남는다. */
  testId: string;
  /** 되돌리는 버튼 문구. 줄글은 다시 쓰기, 캡처는 다시 고르기다. */
  restartLabel: string;
  /** 후보가 하나도 없을 때의 안내. 무엇을 다시 하면 되는지가 탭마다 다르다. */
  emptyMessage: string;
  /** 저장 직후에도 같은 사실이라 한 노드를 검토 화면과 저장 화면 두 자리에 그대로 쓴다. */
  notice?: ReactNode;
}

/**
 * 읽어 온 후보를 검토하고 저장한다.
 *
 * 저장 버튼은 하나이고 건수와 합계를 그 버튼에 적는다.
 * 건별로 저장하면 몇 건이 들어갔는지 사용자가 세어야 한다.
 */
export function ImportReview({
  batch,
  onBatchChange,
  onBusyChange,
  onRestart,
  onDone,
  testId,
  restartLabel,
  emptyMessage,
  notice,
}: ImportReviewProps) {
  const categories = useCategories();
  const patch = usePatchImportCandidate();
  const commit = useCommitImport();
  const discard = useDeleteImport();

  const [editing, setEditing] = useState<string | null>(null);
  const [saved, setSaved] = useState<ImportCommitOut | null>(null);

  const expenseCategories = (categories.data?.items ?? []).filter(
    (category) => category.kind === 'expense',
  );

  const busy = patch.isPending || commit.isPending;
  const failure = patch.error ?? commit.error;
  const message = failure instanceof ApiError ? failure.message : null;

  if (saved != null) {
    return <SavedPanel result={saved} onDone={onDone} testId={testId} notice={notice} />;
  }

  const candidates = batch.candidates ?? [];
  const total = parseDecimalOr(batch.selected_expense_total, 0);
  const canSave = batch.selected_count > 0 && !busy;
  const dropped = truncatedCount(batch.error_code);

  return (
    <div className="nl" data-testid={testId}>
      {notice}

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
        <p className="nl__empty">{emptyMessage}</p>
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
            onRestart();
            setEditing(null);
          }}
        >
          {restartLabel}
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
          onBatchChange(next);
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

function SavedPanel({
  result,
  onDone,
  testId,
  notice,
}: {
  result: ImportCommitOut;
  onDone: () => void;
  testId: string;
  notice?: ReactNode;
}) {
  const budget = result.budget;
  // 지난달 날짜만 저장하면 서버가 그 달의 예산 상태를 준다. '이번 달' 이라고 적으면 거짓말이라
  // 감추는 대신 어느 달인지 적는다. 감추면 예산을 정해 둔 사람이 이유 없이 한 줄을 잃는다.
  const remaining = budget?.remaining_budget ?? null;
  const monthLabel = budget == null ? null : periodLabel(budget.period_start);
  const total = parseDecimalOr(result.expense_total, 0);

  return (
    <div className="nl nl--saved" role="status" data-testid={testId}>
      <p className="nl__saved-title">
        {result.created_count}건 저장했어요{total > 0 ? ` · ${formatCurrency(total)}` : ''}
      </p>
      {remaining != null && monthLabel != null ? (
        <p className="nl__saved-detail">
          {monthLabel} 남은 예산 {formatCurrency(parseDecimalOr(remaining, 0))}
        </p>
      ) : null}
      {notice}
      <Button fullWidth onClick={onDone}>
        확인
      </Button>
    </div>
  );
}

function thisMonth(): string {
  return toLedgerDate(new Date()).slice(0, 7);
}

/** `이번 달` 또는 `8월`. 어느 달의 예산을 말하는지 한 눈에 보이게 한다. */
function periodLabel(periodStart: string): string {
  if (periodStart.slice(0, 7) === thisMonth()) return '이번 달';
  return `${Number(periodStart.slice(5, 7))}월`;
}
