import type { CSSProperties } from 'react';

export interface RatioSliderProps {
  /** 누구의 비율인가. 막대 위에 서고 읽는 이름(「은홍 비율」)이 된다. */
  label: string;
  /** 0~100. 똑같이 나눌 때는 33.3 처럼 10 단위가 아닐 수 있다. */
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/**
 * 비율 막대 하나. 0~100% 를 10% 씩 움직인다.
 *
 * 브라우저의 `range` 칸을 그대로 쓴다. 끌기, 누르기, 화살표 키, 읽는 프로그램의 조절이 따로
 * 만들지 않아도 된다. 색은 세이지 한 가지다. 채운 쪽이 진한 세이지, 남은 쪽이 옅은 세이지다.
 * 누를 자리는 위아래 44px 이다.
 */
export function RatioSlider({ label, value, onChange, disabled = false }: RatioSliderProps) {
  const shown = Math.round(value);
  // 칸은 10 단위로만 선다. 33.3 을 주면 손잡이가 30 에 서므로 채운 쪽도 그 자리에 맞춘다.
  const thumb = Math.min(Math.max(Math.round(value / 10) * 10, 0), 100);
  const style = { '--pk-ratio-fill': `${thumb}%` } as CSSProperties;

  return (
    <div className="pk-ratio">
      <div className="pk-ratio__head" aria-hidden="true">
        <span className="pk-ratio__name">{label}</span>
        <span className="pk-ratio__value" data-numeric="">
          {shown}%
        </span>
      </div>
      <input
        type="range"
        className="pk-ratio__input"
        min={0}
        max={100}
        step={10}
        value={value}
        style={style}
        disabled={disabled}
        aria-label={`${label} 비율`}
        aria-valuetext={`${label} ${shown}%`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
