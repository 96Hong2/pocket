import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useBridge } from '../../app/providers';
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
  useBook,
  useCategories,
  useCommitImport,
  useDeleteImport,
  usePatchImportCandidate,
  type BookOut,
  type CategoryOut,
  type ImportBatchOut,
  type ImportCandidatePatch,
  type ImportCommitOut,
} from '../../shared/api';
import { writeBookLast } from '../../shared/lib/bookLast';
import { formatCurrency, isFutureDay, toLedgerDate } from '../../shared/lib/format';
import { CategoryPicker, FutureDayConfirm } from '../../shared/ledger';
import { Button, ErrorState, LoadingState } from '../../shared/ui';

import { asPickable, monthLine, othersSeeLine } from '../books';
import { CategoryComposeOverlay } from '../categories';

import { CandidateRow, type RowPreview, type RuleAnswer } from './CandidateRow';

/** 후보 id 마다 다음부터 그렇게 저장할지 물었을 때 고른 답과 그때의 분류. */
type RuleAnswers = Record<string, { answer: RuleAnswer; categoryId: string }>;

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
  /**
   * 지금 닫으면 잃을 건수. 저장을 마쳤으면 0 이다.
   *
   * 껍데기가 이 값으로 두 가지를 정한다: 시트를 크게 열지, 그리고 닫으려 할 때 한 번
   * 물어볼지. 손잡이를 잘못 눌러 읽어 온 것이 통째로 날아가는 일이 실제로 있었다.
   */
  onReviewChange?: (pending: number) => void;
  /** 묶음을 버리고 입력 화면으로 되돌린다. 한 건도 못 읽었을 때만 쓴다. */
  onRestart: () => void;
  onDone: () => void;
  /**
   * 저장이 실제로 성공한 순간. 닫기와 갈라 둔다.
   * 저장하고 나서 확인을 안 누르고 X·딤·Esc 로 닫으면 닫기 신호만으로는 늦는다.
   *
   * **어느 날에 적혔는지 함께 준다.** 지난 달 영수증을 읽어 넣고 홈으로 나왔는데 화면이
   * 오늘에 머물러 있으면, 적힌 것인지 아닌지를 그 날짜로 찾아가 봐야 안다.
   * 날짜를 못 가리면(고른 줄이 없거나 읽은 값이 어긋나면) null 이다.
   * 공유 가계부에 적었으면 그 가계부 id 도 준다. 내 가계부면 null 이다.
   */
  onSaved?: (day: string | null, bookId: string | null) => void;
  /** 어느 탭의 검토 화면인지 e2e 가 가른다. 두 탭이 hidden 으로 함께 남는다. */
  testId: string;
  /** 고른 것의 분류를 한 번에 바꾸는 자리를 둘지. 여러 건이 한꺼번에 오는 캡처에서만 쓴다. */
  allowBulkCategory?: boolean;
  /**
   * 한 건도 못 읽었을 때 되돌리는 버튼 문구. 줄글은 다시 쓰기, 캡처는 다시 고르기다.
   *
   * 읽어 온 것이 있으면 이 버튼이 아니라 「취소」가 선다. 고칠 것이 눈앞에 있는데
   * 「다시 쓰기」를 두면, 닫고 싶은 사람이 그걸 눌러 읽어 온 것을 통째로 버린다.
   */
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
  onReviewChange,
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
  const bridge = useBridge();
  const categories = useCategories();
  /*
    공유 가계부에 적을 묶음인가. 읽을 때 고른 가계부에 묶여 있어 묶음이 스스로 말한다.
    그 가계부 분류로 고르고, 지출만 저장된다.
  */
  const bookId = batch.book_id ?? null;
  const shared = bookId != null;
  const bookQuery = useBook(bookId);
  const book = bookQuery.data ?? null;
  const patch = usePatchImportCandidate();
  const commit = useCommitImport();
  const discard = useDeleteImport();

  const [editing, setEditing] = useState<string | null>(null);
  const [saved, setSaved] = useState<ImportCommitOut | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  /** 저장을 눌렀다가 고른 것에 앞날이 섞여 있어 물어보는 그 날. 안 물으면 null. */
  const [futureDay, setFutureDay] = useState<string | null>(null);
  /** 펼친 줄의 폼에 적힌 값. 줄 머리와 저장 버튼 합계가 이것을 따라간다. */
  const [preview, setPreview] = useState<RowPreview | null>(null);

  /*
    분류 없이 읽힌 상호에 분류를 골라 넣으면 다음부터 그렇게 저장할지 묻는 줄.

    **읽어 온 그 순간** 분류가 없고 상호는 있던 줄만이다. 나중에 분류가 붙었는지는 보지
    않는다. 묶음이 바뀌면 다시 센다. 공유 가계부 묶음은 상호를 기억하지 않아 묻지 않는다.
    답은 후보 id 로 들고 있어 줄을 접었다 펴도 남는다.
  */
  const askedRef = useRef<{ batchId: string; ids: Set<string> } | null>(null);
  if (askedRef.current?.batchId !== batch.id) {
    const rows = shared ? [] : (batch.candidates ?? []);
    // 상호는 안 본다. 총액만 읽힌 영수증에 사람이 상호와 분류를 함께 적어도 같은 물음이다.
    askedRef.current = {
      batchId: batch.id,
      ids: new Set(rows.filter((item) => item.category_id == null).map((item) => item.id)),
    };
  }
  const asked = askedRef.current.ids;
  /*
    답은 그때 고른 분류와 함께 둔다. 「네」 라고 한 뒤 분류를 바꾸면 그 답은 옛 분류 것이라
    다시 묻는다. ref 에도 같은 값을 적는다. 저장은 버튼을 누른 렌더의 값이 아니라 보내는
    순간의 답을 읽어야 한다(느린 망에서 그 사이에 답할 수 있다).
  */
  const [ruleAnswers, setRuleAnswers] = useState<RuleAnswers>({});
  const ruleAnswersRef = useRef<RuleAnswers>({});
  function answerRule(candidateId: string, answer: RuleAnswer, categoryId: string): void {
    const next = { ...ruleAnswersRef.current, [candidateId]: { answer, categoryId } };
    ruleAnswersRef.current = next;
    setRuleAnswers(next);
    analytics.log(EVENTS.merchantRuleAsked, { method, answer }, { flowId, kind: 'click' });
  }
  /** 「기억하기」 를 무른다. 답을 지우면 물음이 다시 선다. */
  function clearRule(candidateId: string): void {
    const { [candidateId]: _dropped, ...rest } = ruleAnswersRef.current;
    ruleAnswersRef.current = rest;
    setRuleAnswers(rest);
  }

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

  /*
    펼쳐 둔 줄이 아직 안 보낸 값.

    「이대로 고치기」를 눌러야만 서버로 가던 시절에는, 상호를 고치고 곧바로 아래 저장을
    누르면 적은 것이 통째로 버려졌다. **보이는 것이 저장돼야 한다.**
    줄을 접을 때와 저장하기 직전에 여기서 꺼내 먼저 보낸다.
  */
  const draft = useRef<{ id: string; read: () => ImportCandidatePatch } | null>(null);

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

  /*
    지금 닫으면 잃을 건수.

    저장을 마친 뒤에는 0 이다. 그 화면에서 닫는 것은 아무것도 버리지 않는다.
    껍데기가 이 값으로 시트 크기와 닫기 확인을 함께 정하므로 한 곳에서만 센다.
  */
  const pending = saved != null ? 0 : (batch.candidates?.length ?? 0);
  useEffect(() => {
    onReviewChange?.(pending);
    // 탭이 사라지면 그 탭이 들고 있던 것도 없어진다.
    return () => onReviewChange?.(0);
    // 부르는 쪽이 인라인 함수를 넘겨도 값이 같으면 아무것도 다시 그리지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  // 종류에 따라 고를 수 있는 분류가 다르다. 거르는 일은 후보 줄이 한다.
  // 공유 가계부면 그 가계부 분류다. 내 분류를 섞으면 상대 화면에 모르는 이름이 선다.
  const pickable = shared
    ? asPickable(book?.categories ?? [])
    : (categories.data?.items ?? []).filter(
        (category) => category.kind === 'expense' || category.kind === 'income',
      );
  const pickableLoading = shared ? book == null && !bookQuery.isError : categories.isPending;
  const pickableFailed = shared ? bookQuery.isError && book == null : categories.isError;

  const busy = patch.isPending || commit.isPending;
  const failure = patch.error ?? commit.error;
  const message = failure instanceof ApiError ? failure.message : null;

  if (saved != null) {
    return (
      <SavedPanel result={saved} book={book} onDone={onDone} testId={testId} notice={notice} />
    );
  }

  const candidates = batch.candidates ?? [];
  const total = selectedExpenseTotal(batch, preview);
  const canSave = batch.selected_count > 0 && !busy;

  /*
    고른 것 중 아직 오지 않은 날이 있으면 한 번 묻는다.

    줄마다 이미 「앞날」 이라고 눈에 띄게 적어 두지만, 목록이 길면 아래로 굴려야 보이는
    줄이 생긴다. **저장을 누르는 그 순간에 한 번 더 묻는다.** 막지는 않는다.
    펼친 줄에서 칩으로 고친 날은 아직 서버에 없다. 먼저 보내고 돌려받은 묶음으로 판정한다.
  */
  async function requestSaveAll(): Promise<void> {
    onBusyChange(true);
    let latest = batch;
    try {
      latest = (await flushDraft()) ?? batch;
    } catch {
      // 왜 막혔는지는 patch.error 가 이미 들고 있어 안내 줄에 그대로 나온다.
      onBusyChange(false);
      return;
    }
    const future = selectedFutureDay(latest);
    if (future != null) {
      onBusyChange(false);
      setFutureDay(future);
      return;
    }
    void saveAll(latest);
  }
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
            <CategoryPicker
              className="nl-form__cats"
              ariaLabel="한 번에 바꿀 카테고리"
              size="sm"
              categories={pickable}
              disabled={busy}
              // 공유 분류는 관리 화면이 없다. 그리로 가라는 줄을 세우지 않는다.
              manageNote={!shared}
              onPick={(category) => void applyBulk(category)}
            />
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

      {pickableLoading ? <LoadingState size="inline" label="분류를 불러오는 중이에요" /> : null}
      {pickableFailed ? (
        <ErrorState
          size="inline"
          title="분류를 불러오지 못했어요"
          description="분류 이름이 안 보이고 고칠 수도 없어요."
          onRetry={() => void (shared ? bookQuery.refetch() : categories.refetch())}
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
              flowId={flowId}
              editing={editing === candidate.id}
              disabled={busy}
              // 공유 가계부는 지출만 받는다. 종류·결제 수단 칸을 세우지 않는다.
              expenseOnly={shared}
              renderCompose={
                bookId == null
                  ? undefined
                  : (slot) => (
                      <CategoryComposeOverlay
                        open={slot.open}
                        fixedKind="expense"
                        bookId={bookId}
                        onBack={slot.onBack}
                        onClose={slot.onBack}
                        onCreated={slot.onCreated}
                      />
                    )
              }
              onToggle={(selected) => {
                sendPatch(batch.id, candidate.id, { is_selected: selected });
              }}
              onKindChange={(body) => {
                sendPatch(batch.id, candidate.id, body);
              }}
              onEdit={() => void closeEditing(candidate.id)}
              onEditClose={() => void closeEditing(null)}
              onDraftChange={(read) => {
                draft.current = read == null ? null : { id: candidate.id, read };
              }}
              preview={preview}
              onPreviewChange={setPreview}
              askRule={asked.has(candidate.id)}
              ruleAnswer={ruleAnswers[candidate.id] ?? null}
              onRuleAnswer={(answer, categoryId) => answerRule(candidate.id, answer, categoryId)}
              onRuleClear={() => clearRule(candidate.id)}
              onSave={(body) => {
                draft.current = null;
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

      {/*
        버튼 줄은 시트 바닥에 붙는다. 목록이 길어도 저장이 늘 같은 자리에 있어야 한다.
        아래로 밀려 안 보이면 고치다 만 채로 시트를 닫는다.
      */}
      <div className="nl__actions pk-sheet-foot">
        {candidates.length === 0 ? (
          <Button
            variant="outline"
            fullWidth
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
        ) : (
          <>
            {/*
              「다시 쓰기」가 아니라 취소다. 고칠 것이 눈앞에 있는 화면에서 다시 쓰기는
              읽어 온 것을 버리는 버튼인데, 닫고 싶은 사람이 그것을 누른다.
            */}
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                analytics.log(
                  EVENTS.reviewCancelled,
                  { method, candidate_count: candidates.length },
                  { flowId, kind: 'click' },
                );
                discard.mutate(batch.id);
                setEditing(null);
                onDone();
              }}
            >
              취소
            </Button>
            <Button className="nl__done" disabled={!canSave} onClick={() => void requestSaveAll()}>
              {saveLabel(batch.selected_count, total)}
            </Button>
          </>
        )}
      </div>

      {/* 고른 것에 앞날이 섞여 있을 때만 선다. 막는 것이 아니라 한 번 확인하는 자리다. */}
      {futureDay != null ? (
        <FutureDayConfirm
          day={futureDay}
          onFix={() => setFutureDay(null)}
          onSave={() => {
            setFutureDay(null);
            void saveAll();
          }}
        />
      ) : null}
    </div>
  );

  /**
   * 저장.
   *
   * **펼쳐 둔 줄에 적어 둔 것을 먼저 보낸다.** 예전에는 「이대로 고치기」를 누른 것만
   * 서버로 가서, 상호를 고치고 곧바로 이 버튼을 누르면 적은 것이 버려졌다.
   * 그것부터 보내지 못하면 저장하지 않는다. 반쯤 반영된 채로 넣는 것이 가장 나쁘다.
   *
   * 앞날을 묻기 전에 이미 보냈으면 그때 돌려받은 묶음(`known`)으로 센다.
   */
  async function saveAll(known: ImportBatchOut = batch): Promise<void> {
    onBusyChange(true);
    let latest = known;
    try {
      latest = (await flushDraft()) ?? known;
    } catch {
      // 왜 막혔는지는 patch.error 가 이미 들고 있어 안내 줄에 그대로 나온다.
      onBusyChange(false);
      return;
    }
    setEditing(null);

    // 검토가 끝난 시점의 손질량. 저장 결과와 별개로 남긴다.
    analytics.log(
      EVENTS.reviewFinished,
      {
        method,
        candidate_count: candidates.length,
        selected_count: latest.selected_count,
        edited_count: touched.current.size,
        ...editParams(edits.current),
        // 몇 줄에 물었고 몇 줄이 「네」 였나. 답하지 않은 줄은 이 둘의 차이로 센다.
        rule_asked: asked.size,
        rule_remembered: [...asked].filter(
          (id) => ruleAnswersRef.current[id]?.answer === 'remember',
        ).length,
      },
      { flowId },
    );
    analytics.log(
      EVENTS.saveRequested,
      { method, count: latest.selected_count },
      { flowId, kind: 'click' },
    );

    const startedAt = Date.now();
    /*
      물었는데 「네」 가 아닌 줄은 저장만 하고 기억하지 않는다. 「네」 는 그때 고른 분류 것이라,
      보내는 순간의 분류와 같을 때만 친다. 그런 줄이 없으면 본문도 없다.
    */
    const answers = ruleAnswersRef.current;
    const skipRuleIds = [...asked].filter((id) => {
      const stored = answers[id];
      const row = latest.candidates?.find((item) => item.id === id);
      return !(stored?.answer === 'remember' && stored.categoryId === row?.category_id);
    });
    commit.mutate(
      {
        batchId: latest.id,
        body: skipRuleIds.length > 0 ? { skip_rule_candidate_ids: skipRuleIds } : undefined,
      },
      {
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
              book: shared ? 'shared' : 'mine',
            },
            { flowId },
          );
          // 다음에 내 가계부를 보다가 시트를 열어도 이 가계부가 둘째 칩에 선다.
          if (result.book_id != null) void writeBookLast(bridge.storage, result.book_id);
          setSaved(result);
          onSaved?.(savedDay(result), result.book_id ?? null);
        },
        onError: (error) => {
          analytics.log(
            EVENTS.saveResult,
            {
              method,
              result: 'failed',
              elapsed_ms: Date.now() - startedAt,
              error_code: error instanceof ApiError ? error.code : 'unknown',
              book: shared ? 'shared' : 'mine',
            },
            { flowId },
          );
        },
      },
    );
  }

  /**
   * 고른 줄의 분류를 한꺼번에 바꾼다.
   *
   * 서버에는 후보 하나짜리 PATCH 만 있어 차례로 보낸다.
   * 종류가 다른 줄은 건너뛴다. 지출에 수입 분류를 붙이면 목록과 리포트가 서로 다른 말을 한다.
   *
   * **펼친 줄에 적어 둔 것을 먼저 보내고 줄을 접는다.** 펼친 채 두면 그 폼이 옛 분류를
   * 들고 있다가, 다음에 접을 때 한 번에 바꾼 분류를 도로 덮어쓴다.
   */
  async function applyBulk(category: CategoryOut): Promise<void> {
    setBulkOpen(false);
    onBusyChange(true);
    let next = batch;
    try {
      next = (await flushDraft()) ?? batch;
      setEditing(null);
      // 방금 보낸 것까지 반영된 목록으로 고른다. 종류를 바꿔 둔 줄이 여기서 갈린다.
      const targets = (next.candidates ?? []).filter(
        (item) =>
          item.is_selected && item.type === category.kind && item.category_id !== category.id,
      );
      for (const target of targets) {
        next = await patch.mutateAsync({
          batchId: batch.id,
          candidateId: target.id,
          body: { category_id: category.id },
        });
        // 「이번 묶음은 다 여행」 같은 결정이다. 상호마다 앞으로 기억할지 묻는 것과 결이 달라
        // 이 줄은 묻지 않고 예전처럼 저장하면서 기억한다.
        asked.delete(target.id);
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

  /**
   * 펼친 줄이 들고 있는 값을 먼저 보낸다.
   *
   * 아무것도 안 바꿨으면 아무 일도 하지 않는다. 보내는 데 실패하면 그대로 던져서,
   * 부르는 쪽이 저장까지 밀고 나가지 않게 한다. 보냈으면 서버가 돌려준 묶음을 준다.
   */
  async function flushDraft(): Promise<ImportBatchOut | null> {
    const pending = draft.current;
    draft.current = null;
    if (pending == null) return null;
    const body = pending.read();
    if (Object.keys(body).length === 0) return null;

    const fields = fieldsOf(body);
    for (const field of fields) {
      edits.current[field] = (edits.current[field] ?? 0) + 1;
    }
    touched.current.add(pending.id);
    const next = await patch.mutateAsync({ batchId: batch.id, candidateId: pending.id, body });
    onBatchChange(next);
    return next;
  }

  /** 펼친 줄을 접거나 다른 줄로 옮긴다. 적어 둔 것을 먼저 보낸다. */
  async function closeEditing(next: string | null): Promise<void> {
    onBusyChange(true);
    try {
      await flushDraft();
      setEditing(next);
    } finally {
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

/** 고른 것 중 아직 오지 않은 첫 날. 없으면 null. */
function selectedFutureDay(batch: ImportBatchOut): string | null {
  for (const item of batch.candidates ?? []) {
    const day = toLedgerDate(new Date(item.occurred_at));
    if (item.is_selected && isFutureDay(day)) return day;
  }
  return null;
}

/**
 * 고른 지출의 합계. 펼친 줄에 고쳐 적은 금액과 종류를 얹는다.
 *
 * 서버 합계만 쓰면 금액을 고치는 동안 버튼이 옛 합계를 말한다. 저장하면 고친 금액이 들어간다.
 */
function selectedExpenseTotal(batch: ImportBatchOut, preview: RowPreview | null): number {
  const total = parseDecimalOr(batch.selected_expense_total, 0);
  const row = preview == null ? null : batch.candidates?.find((item) => item.id === preview.id);
  if (preview == null || row == null || !row.is_selected) return total;
  const before = row.type === 'expense' ? parseDecimalOr(row.amount, 0) : 0;
  const after = preview.type === 'expense' ? preview.amount : 0;
  return total - before + after;
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
  book,
  onDone,
  testId,
  notice,
}: {
  result: ImportCommitOut;
  /** 공유 가계부에 적었을 때 그 가계부. 이름과 그 달 돈, 누가 보는지를 말한다. */
  book: BookOut | null;
  onDone: () => void;
  testId: string;
  notice?: ReactNode;
}) {
  if (result.book_id != null) {
    return (
      <BookSavedPanel result={result} book={book} onDone={onDone} testId={testId} notice={notice} />
    );
  }
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

/**
 * 공유 가계부에 적은 뒤. 「둘이 쓰는 돈에 2건 적었어요」, 그 달 같이 쓴 돈, 누가 보는지.
 *
 * 키패드로 한 건 적은 뒤 화면과 같은 말을 쓴다. 내 가계부의 남은 예산은 섞지 않는다.
 */
function BookSavedPanel({
  result,
  book,
  onDone,
  testId,
  notice,
}: {
  result: ImportCommitOut;
  book: BookOut | null;
  onDone: () => void;
  testId: string;
  notice?: ReactNode;
}) {
  const where = book == null ? '' : `${book.name}에 `;
  const others = book == null ? null : othersSeeLine(book);
  return (
    <div className="nl nl--saved" role="status" data-testid={testId}>
      <p className="nl__saved-title">
        {where}
        {result.created_count}건 적었어요
      </p>
      {book != null && result.book_month != null ? (
        <p className="nl__saved-detail">{monthLine(book, result.book_month)}</p>
      ) : null}
      {others != null ? <p className="nl__saved-detail">{others}</p> : null}
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

/**
 * 방금 넣은 것들이 앉은 날.
 *
 * 한 장에서 여러 날이 나오는 일은 드물지만 나오면 **가장 나중 날**을 고른다.
 * 홈이 그 날로 옮겨 가는 데 쓰는 값이라, 어디로 가야 방금 넣은 것이 보이는지 하나만
 * 답해야 한다. 고른 줄이 하나도 없으면 옮길 이유가 없어 null 이다.
 */
function savedDay(result: ImportCommitOut): string | null {
  const days = (result.batch.candidates ?? [])
    .filter((candidate) => candidate.is_selected)
    .map((candidate) => new Date(candidate.occurred_at))
    .filter((at) => !Number.isNaN(at.getTime()))
    .map((at) => toLedgerDate(at));
  return days.length === 0 ? null : days.reduce((latest, day) => (day > latest ? day : latest));
}
