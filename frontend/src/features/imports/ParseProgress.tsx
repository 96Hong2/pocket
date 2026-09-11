import { useEffect, useState } from 'react';

import { TEST_IDS } from '../../shared/testIds';

/**
 * 사진을 읽는 동안 보여 주는 진행 막대.
 *
 * **서버는 진행률을 알려 주지 않는다.** 한 번의 요청이고 그 안에서 준비·읽기·맞추기가
 * 이어진다. 그래서 이 막대가 그리는 것은 "얼마나 됐나" 가 아니라 **"얼마나 걸릴 일인가"** 다.
 * 실측(전처리 + 모델 왕복)이 12초 안팎이라 그 시간을 기준으로 찬다.
 *
 * 거짓말은 하지 않는다. 끝까지 채우지 않고 92% 에서 멈춰 기다리다가, 응답이 온 그 순간에만
 * 100% 가 된다. 다 찬 막대를 두고 계속 기다리게 하는 것이 사용자를 가장 화나게 한다.
 *
 * 단계 문구를 함께 바꾼다. 막대만 있으면 멈춘 것인지 도는 것인지 알 수 없고,
 * 지금 무엇을 하는 중인지 알면 같은 12초도 훨씬 짧게 느껴진다.
 */

/** 실측 기준 왕복 시간. 이 값에 맞춰 막대가 찬다. */
const EXPECTED_MS = 12_000;

/** 응답 전에는 여기까지만. 남은 8% 는 실제로 끝났을 때를 위해 남겨 둔다. */
const CEILING = 0.92;

/** 이만큼 지나면 평소보다 오래 걸리는 중이라고 말한다. */
const SLOW_MS = 20_000;

/** 막대를 다시 그리는 간격. 60fps 로 돌릴 이유가 없다. */
const TICK_MS = 100;

export interface ParseStep {
  /** 몇 초(밀리초)부터 이 문구인가. */
  at: number;
  label: string;
}

export interface ParseProgressProps {
  steps: ParseStep[];
  /** 오래 걸릴 때 덧붙이는 한 줄. 탭마다 할 수 있는 말이 다르다. */
  slowHint: string;
}

export function ParseProgress({ steps, slowHint }: ParseProgressProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - startedAt), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const ratio = Math.min(CEILING, easeOut(elapsed / EXPECTED_MS) * CEILING);
  const slow = elapsed >= SLOW_MS;
  const step = currentStep(steps, elapsed);

  return (
    <div className="parse-progress" data-testid={TEST_IDS.parseProgress}>
      {/*
        읽는 것은 문구 하나다. 막대가 1초에 열 번 바뀌는 것을 스크린리더가 따라 읽으면
        아무것도 알아들을 수 없다.
      */}
      <p className="parse-progress__label" role="status" aria-live="polite">
        {slow ? '조금 더 걸리고 있어요' : step}
      </p>

      <div className="parse-progress__track" aria-hidden="true">
        <div
          className={
            slow ? 'parse-progress__bar parse-progress__bar--slow' : 'parse-progress__bar'
          }
          data-testid={TEST_IDS.parseProgressBar}
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>

      <p className="parse-progress__hint">{slow ? slowHint : '금방 끝나요'}</p>
    </div>
  );
}

/**
 * 처음에는 빠르게, 뒤로 갈수록 느리게.
 *
 * 일정한 속도로 차면 예상보다 오래 걸릴 때 막대가 천장에 부딪혀 멈춰 선 것처럼 보인다.
 * 뒤가 느리면 늦어지는 동안에도 조금씩 움직여, 멈춘 것이 아니라는 사실이 그대로 보인다.
 */
function easeOut(progress: number): number {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, progress)), 2);
}

function currentStep(steps: ParseStep[], elapsed: number): string {
  let label = steps[0]?.label ?? '';
  for (const step of steps) {
    if (elapsed >= step.at) label = step.label;
  }
  return label;
}
