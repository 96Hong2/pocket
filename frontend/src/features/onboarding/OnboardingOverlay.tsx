import { useState, type ReactNode } from 'react';

import { EVENTS, useAnalytics } from '../../shared/analytics';
import { useSaveProfile, type AgeBand, type Gender } from '../../shared/api';
import { cx } from '../../shared/lib/cx';
import { Button, Select, iconUrl, type IconName } from '../../shared/ui';
import { AGE_BANDS, GENDERS } from '../account';

interface Slide {
  /** 로그에 남는 이름. 어느 장에서 그만두는지 이 값으로 센다. */
  key: string;
  icon: IconName;
  title: string;
  /** 한 줄. 두 줄이 되면 아무도 안 읽는다. */
  body: ReactNode;
  /** 마지막 장에만 붙는 연령대·성별 칸. 안 고르고 넘어가도 된다. */
  asks?: 'profile';
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
  /*
    마지막 장에서 딱 두 가지를 묻는다.

    **회원가입이 아니다.** 익명키만으로 보내는 값이라 이름도 연락처도 오가지 않는다.
    그래서 여기서 물어야 한다. 예전에는 이메일을 붙인 사람에게만 물어서, 메일 발송이
    안 붙어 있는 동안에는 **아무도 답할 수 없었다.**

    안 고르고 「시작하기」 를 눌러도 그냥 시작된다. 고르라고 막으면 그 순간 이 앱은
    가입해야 쓰는 앱이 된다.
  */
  {
    key: 'profile',
    icon: '03_growth_chart',
    title: '마지막으로 두 가지만',
    body: <>또래끼리 어디에 얼마나 쓰는지 알려 드릴 때 써요</>,
    asks: 'profile',
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
  const saveProfile = useSaveProfile();
  const [index, setIndex] = useState(0);
  const [ageBand, setAgeBand] = useState<AgeBand | null>(null);
  const [gender, setGender] = useState<Gender | null>(null);
  const slide = SLIDES[index];
  const last = index === SLIDES.length - 1;

  function finish(result: 'done' | 'skipped'): void {
    analytics.log(EVENTS.onboardingResult, { result, slide: slide.key }, { kind: 'click' });
    /*
      고른 것이 있으면 보낸다. **답을 기다리지 않는다.**
      이 값 때문에 홈이 늦게 열리면 안 된다. 실패해도 「내 계정」 에서 다시 고를 수 있다.
    */
    const answered = ageBand != null || gender != null;
    if (answered) {
      saveProfile.mutate({ age_band: ageBand, gender });
    }
    analytics.log(
      EVENTS.profileResult,
      answered
        ? { result: 'saved', where: 'onboarding', age_band: ageBand ?? 'none', gender: gender ?? 'none' }
        : { result: 'skipped', where: 'onboarding' },
      { kind: 'click' },
    );
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

        {slide.asks === 'profile' ? (
          <div className="onboard__ask">
            {/*
              보기가 여섯이라 칩으로 두면 두 줄이 되고, 그만큼 읽을 것이 는다.
              기기가 그리는 선택기는 손가락 하나로 돌리면 끝난다.
            */}
            <Select
              label="연령대"
              placeholder="선택하기"
              options={AGE_BANDS}
              value={ageBand}
              onChange={setAgeBand}
            />
            {/*
              성별은 보기가 둘뿐이라 칩이 빠르다. 한 번 누르면 켜지고 다시 누르면 꺼진다.
              **「말하지 않을래요」 는 두지 않는다.** 그 버튼이 있으면 안 고르고 넘어가면 될 것을
              굳이 누르게 된다. 안 고르는 것이 곧 말하지 않는 것이다.
            */}
            <Chips
              label="성별"
              options={GENDERS}
              picked={gender}
              onPick={(next) => setGender(next === gender ? null : next)}
            />
            {/* 무엇이 아닌지부터 말한다. 「가입인가?」 가 가장 먼저 드는 생각이다. */}
            <p className="onboard__ask-note">
              회원가입이 아니에요. 통계에만 쓰고, 안 고르셔도 돼요
            </p>
          </div>
        ) : null}

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

/** 한 줄짜리 보기 묶음. 다시 누르면 꺼진다(고른 것을 무를 수 있어야 한다). */
function Chips<T extends string>({
  label,
  options,
  picked,
  onPick,
}: {
  label: string;
  options: { value: T; label: string }[];
  picked: T | null;
  onPick: (value: T) => void;
}) {
  return (
    <div className="onboard__chips" role="radiogroup" aria-label={label}>
      {options.map((item) => (
        <button
          key={item.value}
          type="button"
          role="radio"
          aria-checked={picked === item.value}
          className={cx('onboard__chip', picked === item.value && 'onboard__chip--on')}
          onClick={() => onPick(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
