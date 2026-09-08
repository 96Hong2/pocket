import { useState } from 'react';

import { ApiError, useAnalyzeText, type ImportBatchOut } from '../../shared/api';
import { TEST_IDS } from '../../shared/testIds';
import { Button, LoadingState } from '../../shared/ui';

import { ImportReview } from './ImportReview';

const PLACEHOLDER = '점심 12000 스벅 4500 어제 택시 9000';

export interface NaturalLanguageTabProps {
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
export function NaturalLanguageTab({ onBusyChange, onDone, onSaved }: NaturalLanguageTabProps) {
  const analyze = useAnalyzeText();

  const [text, setText] = useState('');
  const [batch, setBatch] = useState<ImportBatchOut | null>(null);

  if (batch != null) {
    return (
      <ImportReview
        batch={batch}
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
      <label className="nl__field">
        <span className="nl__label">무엇을 썼나요</span>
        {/*
          안내 한 줄은 상자 안에 있지만 label 밖이다. label 안에 두면 그 문구가
          입력칸의 접근성 이름에 딸려 붙어 「무엇을 썼나요」가 길어진다.
        */}
        <span className="nl__box">
          <textarea
            className="nl__input"
            value={text}
            rows={3}
            maxLength={1000}
            placeholder={PLACEHOLDER}
            disabled={analyze.isPending}
            onChange={(event) => setText(event.target.value)}
          />
        </span>
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
