import { useEffect, useRef, useState, type ReactNode } from 'react';

import {
  EVENTS,
  useAnalytics,
  type EditField,
  type FlowId,
  type LogMethod,
} from '../../shared/analytics';
import {
  ApiError,
  parseDecimalOr,
  useCategories,
  useCommitImport,
  useDeleteImport,
  usePatchImportCandidate,
  type CategoryOut,
  type ImportBatchOut,
  type ImportCandidatePatch,
  type ImportCommitOut,
} from '../../shared/api';
import { formatCurrency, toLedgerDate } from '../../shared/lib/format';
import { Button, CategoryAvatar, ErrorState, LoadingState, iconOf } from '../../shared/ui';

import { CandidateRow } from './CandidateRow';

export interface ImportReviewProps {
  /** 서버가 읽어 준 묶음. 껍데기가 들고 있고 여기서는 고쳐 준 것을 돌려주기만 한다. */
  batch: ImportBatchOut;
  /** 이 기록 흐름을 가리키는 값. 읽기·검토·저장 로그를 한 줄로 잇는다. */
  flowId: FlowId;
  /** 어느 방식으로 들어온 검토인가. 방식별 완료율을 이 값으로 가른다. */
  method: LogMethod;
  onBatchChange: (batch: ImportBatchOut) => void;
  /** 요청이 도는 동안 시트가 닫히거나 탭이 옮겨지지 않게 껍데기에 알린다. */
  onBusyChange: (busy: boolean) => void;
  /** 묶음을 버리고 입력 화면으로 되돌린다. */
  onRestart: () => void;
  onDone: () => void;
  /**
   * 저장이 실제로 성공한 순간. 닫기와 갈라 둔다.
   * 저장하고 나서 확인을 안 누르고 X·딤·Esc 로 닫으면 닫기 신호만으로는 늦는다.
   */
  onSaved?: () => void;
  /** 어느 탭의 검토 화면인지 e2e 가 가른다. 두 탭이 hidden 으로 함께 남는다. */
  testId: string;
  /** 고른 것의 분류를 한 번에 바꾸는 자리를 둘지. 여러 건이 한꺼번에 오는 캡처에서만 쓴다. */
  allowBulkCategory?: boolean;
  /** 되돌리는 버튼 문구. 줄글은 다시 쓰기, 캡처는 다시 고르기다. */
  restartLabel: string;
  /** 후보가 하나도 없을 때의 안내. 무엇을 다시 하면 되는지가 탭마다 다르다. */
  emptyMessage: ReactNode;
  /** 이 방법으로는 안 될 때 갈 다른 길. 안내 바로 아래에 놓인다. */
  emptyAction?: ReactNode;
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
  flowId,
  method,
  onBatchChange,
  onBusyChange,
  onRestart,
  onDone,
  onSaved,
  testId,
  allowBulkCategory = false,
  restartLabel,
  emptyMessage,
  emptyAction,
  notice,
}: ImportReviewProps) {
  const analytics = useAnalytics();
  const categories = useCategories();
  const patch = usePatchImportCandidate();
  const commit = useCommitImport();
  const discard = useDeleteImport();

  const [editing, setEditing] = useState<string | null>(null);
  const [saved, setSaved] = useState<ImportCommitOut | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  /*
    무엇을 몇 번 고쳤나. 값이 아니라 **어느 칸을 몇 번** 인지만 센다.
    「5건 중 날짜 2건·금액 1건 고침」 이 알고 싶은 전부다. 그 날짜와 금액이 무엇이었는지는
    분석에 필요 없고, 남기면 그때부터 이 로그는 가계부 사본이 된다.

    ref 인 이유는 이 값이 화면을 바꾸지 않기 때문이다. state 로 두면 고칠 때마다 다시 그린다.
  */
  const edits = useRef<Partial<Record<EditField, number>>>({});

  /*
    값을 실제로 고친 후보의 id.

    「AI 무수정 저장률」 을 재려면 몇 번 고쳤나가 아니라 **몇 건을 손댔나** 가 필요하다.
    켰다 껐다 한 것은 손댄 것이 아니라 고를지 말지를 정한 것이라 여기 들어오지 않는다.
    서버가 `was_edited` 를 매기는 기준과 같다.
  */
  const touched = useRef(new Set<string>());

  // 검토 목록을 실제로 본 순간. 읽기는 됐는데 여기서 그만두는 사람이 얼마나 되는지 본다.
  const shownRef = useRef(false);
  useEffect(() => {
    if (shownRef.current || saved != null) return;
    shownRef.current = true;
    const candidates = batch.candidates ?? [];
    analytics.log(
      EVENTS.reviewShown,
      {
        method,
        candidate_count: candidates.length,
        selected_count: batch.selected_count,
        unsure_count: candidates.filter((item) => item.is_low_confidence).length,
        duplicate_count: candidates.filter((item) => item.is_duplicate).length,
        refund_count: candidates.filter((item) => item.type === 'refund').length,
      },
      { flowId },
    );
  }, [analytics, batch, flowId, method, saved]);

  // 종류에 따라 고를 수 있는 분류가 다르다. 거르는 일은 후보 줄이 한다.
  const pickable = (categories.data?.items ?? []).filter(
    (category) => category.kind === 'expense' || category.kind === 'income',
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

      {allowBulkCategory && candidates.length > 0 ? (
        <div className="nl__bulk">
          <button
            type="button"
            className="nl__bulk-chip"
            aria-expanded={bulkOpen}
            disabled={busy}
            onClick={() => setBulkOpen((open) => !open)}
          >
            카테고리 한 번에 바꾸기
          </button>
          {bulkOpen ? (
            <div className="nl-form__cats" role="group" aria-label="한 번에 바꿀 카테고리">
              {pickable.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className="nl-form__cat"
                  disabled={busy}
                  onClick={() => void applyBulk(category)}
                >
                  <CategoryAvatar {...iconOf(category)} size={32} />
                  {category.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 한 건도 못 읽었으면 안 띄운다. 이해한 것이 없는데 이해했다고 하면 실패 안내와 모순된다. */}
      {candidates.length > 0 ? (
        <p className="nl__read">이렇게 이해했어요. 눌러서 고칠 수 있어요</p>
      ) : null}

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
        <div className="nl__empty">
          {emptyMessage}
          {emptyAction}
        </div>
      ) : (
        <ul className="nl__list">
          {candidates.map((candidate) => (
            <CandidateRow
              key={candidate.id}
              candidate={candidate}
              categories={pickable}
              editing={editing === candidate.id}
              disabled={busy}
              onToggle={(selected) => {
                sendPatch(batch.id, candidate.id, { is_selected: selected });
              }}
              onKindChange={(body) => {
                sendPatch(batch.id, candidate.id, body);
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
              // 검토가 끝난 시점의 손질량. 저장 결과와 별개로 남긴다.
              analytics.log(
                EVENTS.reviewFinished,
                {
                  method,
                  candidate_count: candidates.length,
                  selected_count: batch.selected_count,
                  edited_count: touched.current.size,
                  ...editParams(edits.current),
                },
                { flowId },
              );
              analytics.log(
                EVENTS.saveRequested,
                { method, count: batch.selected_count },
                { flowId, kind: 'click' },
              );

              const startedAt = Date.now();
              commit.mutate(batch.id, {
                onSettled: () => onBusyChange(false),
                onSuccess: (result) => {
                  // **서버가 몇 건을 넣었는지 답한 뒤에만** 성공이다.
                  // 버튼을 누른 것도, 200 을 받은 것도 저장된 것이 아니다.
                  analytics.log(
                    EVENTS.saveResult,
                    {
                      method,
                      result: 'ok',
                      created_count: result.created_count,
                      elapsed_ms: Date.now() - startedAt,
                    },
                    { flowId },
                  );
                  setSaved(result);
                  onSaved?.();
                },
                onError: (error) => {
                  analytics.log(
                    EVENTS.saveResult,
                    {
                      method,
                      result: 'failed',
                      elapsed_ms: Date.now() - startedAt,
                      error_code: error instanceof ApiError ? error.code : 'unknown',
                    },
                    { flowId },
                  );
                },
              });
            }}
          >
            {saveLabel(batch.selected_count, total)}
          </Button>
        ) : null}
      </div>
    </div>
  );

  /**
   * 고른 줄의 분류를 한꺼번에 바꾼다.
   *
   * 서버에는 후보 하나짜리 PATCH 만 있어 차례로 보낸다.
   * 종류가 다른 줄은 건너뛴다. 지출에 수입 분류를 붙이면 목록과 리포트가 서로 다른 말을 한다.
   */
  async function applyBulk(category: CategoryOut): Promise<void> {
    const targets = candidates.filter(
      (item) => item.is_selected && item.type === category.kind && item.category_id !== category.id,
    );
    setBulkOpen(false);
    if (targets.length === 0) return;

    onBusyChange(true);
    let next = batch;
    try {
      for (const target of targets) {
        next = await patch.mutateAsync({
          batchId: batch.id,
          candidateId: target.id,
          body: { category_id: category.id },
        });
      }
    } catch {
      // 왜 안 됐는지는 patch.error 가 이미 들고 있어 안내 줄에 그대로 나온다.
    } finally {
      // 중간에 멈춰도 서버에는 이미 바뀐 줄이 있다. 거기까지는 화면에 올려야
      // 목록이 실제와 다른 분류를 계속 보여주지 않는다.
      if (next !== batch) onBatchChange(next);
      onBusyChange(false);
    }
  }

  function sendPatch(
    batchId: string,
    candidateId: string,
    body: ImportCandidatePatch,
    onSuccess?: () => void,
  ): void {
    const fields = fieldsOf(body);
    for (const field of fields) {
      edits.current[field] = (edits.current[field] ?? 0) + 1;
    }
    if (fields.some((field) => field !== 'selection')) touched.current.add(candidateId);
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

/** 보낸 항목을 로그가 세는 칸 이름으로 옮긴다. 값은 보지 않는다. */
function fieldsOf(body: ImportCandidatePatch): EditField[] {
  const map: Record<string, EditField> = {
    amount: 'amount',
    occurred_at: 'date',
    category_id: 'category',
    type: 'type',
    merchant: 'merchant',
    is_selected: 'selection',
  };
  return Object.keys(body)
    .map((key) => map[key])
    .filter((field): field is EditField => field != null);
}

/** `{date: 2}` 를 `{edited_date: 2}` 로. 0 인 칸은 빼서 로그를 짧게 둔다. */
function editParams(counts: Partial<Record<EditField, number>>): Record<string, number> {
  const params: Record<string, number> = {};
  for (const [field, count] of Object.entries(counts)) {
    if (count != null && count > 0) params[`edited_${field}`] = count;
  }
  return params;
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
