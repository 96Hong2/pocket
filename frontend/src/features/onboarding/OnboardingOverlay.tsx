import { useState, type ReactNode } from 'react';

import { EVENTS, useAnalytics } from '../../shared/analytics';
import { Button, iconUrl, type IconName } from '../../shared/ui';

interface Slide {
  /** 로그에 남는 이름. 어느 장에서 그만두는지 이 값으로 센다. */
  key: string;
  icon: IconName;
  title: string;
  /** 한 줄. 두 줄이 되면 아무도 안 읽는다. */
  body: ReactNode;
}

/**
 * 세 장. 이 앱에서 처음 알아야 할 것만 한 장에 하나씩.
 *
 * **기능 목록이 아니다.** 「무엇을 할 수 있나」 를 다 적으면 읽을 것이 늘어, 배우기 싫어서
 * 이 앱을 고른 사람을 첫 화면에서 놓친다. 장마다 한 가지만 말한다.
 *
 * 순서는 쓰는 순서다: 적는다 → 본다 → 다시 온다.
 */
const SLIDES: Slide[] = [
  {
    key: 'record',
    icon: '01_coins',
    title: '사진 한 장이면 끝나요',
    body: (
      <>
        카드 내역 <b>캡처</b>·<b>영수증</b>·<b>줄글</b>로 적어요
      </>
    ),
  },
  {
    key: 'tabs',
    icon: '03_growth_chart',
    title: '아래 탭 두 개만 기억해요',
    body: (
      <>
        <b>리포트</b>는 어디에 썼나, <b>관리</b>는 예산·목표·분류
      </>
    ),
  },
  {
    key: 'home_add',
    icon: '04_home',
    title: '홈 화면에 두면 더 빨라요',
    body: (
      <>
        맨 위 오른쪽 <b>⋯</b> → <b>휴대폰 홈 화면에 추가</b>
      </>
    ),
  },
];

/**
 * 처음 열었을 때 딱 한 번 뜨는 안내.
 *
 * 시트가 아니라 화면을 통째로 덮는다. 시트로 두면 뒤에 홈이 비쳐 무엇을 먼저 봐야 하는지
 * 갈리고, 아래로 밀어 닫을 수 있어 첫 장에서 사고로 사라진다.
 *
 * **어느 장에서든 건너뛸 수 있다.** 안내를 끝까지 봐야 앱을 쓸 수 있게 만들면, 그 순간
 * 이 앱은 배워야 하는 앱이 된다. 건너뛰어도 다시 안 뜬다.
 */
export function OnboardingOverlay({ onDone }: { onDone: () => void }) {
  const analytics = useAnalytics();
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const last = index === SLIDES.length - 1;

  function finish(result: 'done' | 'skipped'): void {
    analytics.log(EVENTS.onboardingResult, { result, slide: slide.key }, { kind: 'click' });
    onDone();
  }

  return (
    <div className="onboard" role="dialog" aria-modal="true" aria-label="처음 안내">
      <div className="onboard__box">
        <button type="button" className="onboard__skip" onClick={() => finish('skipped')}>
          건너뛰기
        </button>

        <img className="onboard__icon" src={iconUrl(slide.icon)} alt="" aria-hidden="true" />
        <p className="onboard__title">{slide.title}</p>
        <p className="onboard__body">{slide.body}</p>

        {/* 몇 장 남았는지. 숫자로 적으면 읽을 것이 하나 더 는다. */}
        <div className="onboard__dots" aria-hidden="true">
          {SLIDES.map((item, dot) => (
            <span
              key={item.key}
              className={dot === index ? 'onboard__dot onboard__dot--on' : 'onboard__dot'}
            />
          ))}
        </div>

        <Button
          className="onboard__next"
          fullWidth
          onClick={() => {
            if (last) {
              finish('done');
              return;
            }
            setIndex((current) => current + 1);
          }}
        >
          {last ? '시작하기' : '다음'}
        </Button>
      </div>
    </div>
  );
}
