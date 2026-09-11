import { useState } from 'react';

import { EVENTS, useAnalytics, type FlowId } from '../../shared/analytics';
import { ApiError, useAnalyzeText, type ImportBatchOut } from '../../shared/api';
import { TEST_IDS } from '../../shared/testIds';
import { Button, LoadingState } from '../../shared/ui';

import { ImportReview } from './ImportReview';

const PLACEHOLDER = '점심 12000 스벅 4500 어제 택시 9000';

/** 라벨과 설명을 입력칸에 걸어 주는 id. 이 탭은 한 화면에 하나만 뜬다. */
const FIELD_ID = 'nl-text';
const HINT_ID = 'nl-text-hint';

export interface NaturalLanguageTabProps {
  /** 이 기록 흐름을 가리키는 값. 읽기·검토·저장 로그를 한 줄로 잇는다. */
  flowId: FlowId;
  /** 요청이 도는 동안 시트가 닫히거나 탭이 옮겨지지 않게 껍데기에 알린다. */
  onBusyChange: (busy: boolean) => void;
  onDone: () => void;
  /** 저장이 성공한 순간. 닫기보다 앞선다. */
  onSaved?: () => void;
}

/**
 * 줄글로 적고 검토해서 저장한다.
 *
 * 분석은 거래를 만들지 않는다. 읽어 온 뒤부터는 캡처 탭과 같은 검토 화면을 쓴다.
 */
export function NaturalLanguageTab({
  flowId,
  onBusyChange,
  onDone,
  onSaved,
}: NaturalLanguageTabProps) {
  const analytics = useAnalytics();
  const analyze = useAnalyzeText();

  const [text, setText] = useState('');
  const [batch, setBatch] = useState<ImportBatchOut | null>(null);

  if (batch != null) {
    return (
      <ImportReview
        batch={batch}
        flowId={flowId}
        method="text"
        onBatchChange={setBatch}
        onBusyChange={onBusyChange}
        onRestart={() => setBatch(null)}
        onDone={onDone}
        onSaved={onSaved}
        testId={TEST_IDS.nlPanel}
        restartLabel="다시 쓰기"
        emptyMessage="문장에서 금액을 찾지 못했어요. `점심 12000` 처럼 금액을 함께 적어 주세요"
      />
    );
  }

  const message = analyze.error instanceof ApiError ? analyze.error.message : null;

  return (
    <div className="nl" data-testid={TEST_IDS.nlPanel}>
      {/*
        안내 한 줄은 상자 안에 두고 label 로는 감싸지 않는다. label 안에 넣으면 그 문구가
        입력칸의 접근성 이름에 딸려 붙어 「무엇을 썼나요」가 길어진다. 대신 htmlFor 로
        이름을 걸고 aria-describedby 로 설명을 따로 붙인다.
      */}
      <div className="nl__field">
        <label className="nl__label" htmlFor={FIELD_ID}>
          무엇을 썼나요
        </label>
        <div className="nl__box">
          <textarea
            id={FIELD_ID}
            className="nl__input"
            aria-describedby={HINT_ID}
            value={text}
            rows={3}
            maxLength={1000}
            placeholder={PLACEHOLDER}
            disabled={analyze.isPending}
            onChange={(event) => setText(event.target.value)}
          />
          <p id={HINT_ID} className="nl__hint">
            한 번에 여러 건을 적어도 돼요. 날짜를 적으면 그 날로 넣어요
          </p>
        </div>
      </div>

      {/* 수입도 이 칸에 적으면 된다. 읽고 나서 줄마다 지출·수입을 바꿀 수 있다. */}
      <p className="nl__aside">수입도 같이 적어도 돼요. 읽은 뒤에 줄마다 고칠 수 있어요</p>

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
          // 글자 수만 남긴다. 적은 문장 자체는 어느 로그에도 싣지 않는다.
          analytics.log(
            EVENTS.parseStarted,
            { method: 'text', text_length: text.trim().length },
            { flowId },
          );
          const startedAt = Date.now();
          analyze.mutate(text.trim(), {
            onSettled: () => onBusyChange(false),
            onSuccess: (result) => {
              analytics.log(
                EVENTS.parseFinished,
                {
                  method: 'text',
                  result: (result.candidates?.length ?? 0) === 0 ? 'empty' : 'ok',
                  elapsed_ms: Date.now() - startedAt,
                  candidate_count: result.candidates?.length ?? 0,
                },
                { flowId },
              );
              setBatch(result);
            },
            onError: (error) => {
              analytics.log(
                EVENTS.parseFinished,
                {
                  method: 'text',
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
        분석
      </Button>
    </div>
  );
}
