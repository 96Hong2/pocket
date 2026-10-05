import { useLayoutEffect, useRef, useState } from 'react';

import { cx } from '../../shared/lib/cx';

export interface SparklineProps {
  values: readonly number[];
  width: number;
  height: number;
  className?: string;
}

/** 작은 추이. 점이 하나면 오른쪽 끝(지금)에 점만 찍는다. 점이 없으면 자리만 잡는다. */
export function Sparkline({ values, width, height, className }: SparklineProps) {
  const pad = 4;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const points = values.map((value, index) => ({
    x: values.length > 1 ? pad + index * step : width - pad,
    y: values.length > 1 ? height - pad - ((value - min) / span) * (height - pad * 2) : height / 2,
  }));
  const last = points.at(-1);

  return (
    <svg
      className={cx('trend-spark', className)}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      {points.length > 1 ? (
        <polyline
          points={points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {last ? <circle cx={last.x} cy={last.y} r={3.2} fill="currentColor" /> : null}
    </svg>
  );
}

export interface LineChartPoint {
  label: string;
  value: number;
}

const CHART_HEIGHT = 170;

/**
 * 순자산 상세의 큰 선 그래프. 달 이름이 아래에 선다.
 * 그린 폭이 곧 화면 폭이다. viewBox 를 늘려 쓰면 폭마다 글자와 선 굵기가 달라진다.
 */
export function NetWorthLineChart({ points }: { points: readonly LineChartPoint[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (box == null) return;
    setWidth(Math.floor(box.clientWidth));
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setWidth(Math.floor(box.clientWidth)));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="nw-chart" ref={boxRef}>
      {width > 0 && points.length > 0 ? <ChartSvg points={points} width={width} /> : null}
    </div>
  );
}

function ChartSvg({ points, width }: { points: readonly LineChartPoint[]; width: number }) {
  const h = CHART_HEIGHT;
  const padX = 18;
  const padT = 22;
  const padB = 26;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const many = points.length > 1;
  const step = many ? (width - padX * 2) / (points.length - 1) : 0;
  const xs = points.map((_, i) => (many ? padX + i * step : width / 2));
  const ys = values.map((v) =>
    many
      ? padT + (h - padT - padB) - ((v - min) / span) * (h - padT - padB)
      : (h - padB + padT) / 2,
  );
  const line = xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
  const area = `${line} L${xs.at(-1)!.toFixed(1)} ${h - padB} L${xs[0].toFixed(1)} ${h - padB} Z`;
  const lastIndex = points.length - 1;

  return (
    <svg
      className="nw-chart__svg"
      width={width}
      height={h}
      viewBox={`0 0 ${width} ${h}`}
      aria-hidden="true"
    >
      {many ? (
        <>
          <path d={area} fill="currentColor" fillOpacity={0.08} />
          <path
            d={line}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}
      {points.map((point, i) => {
        const isLast = i === lastIndex;
        return (
          <g key={`${point.label}-${i}`}>
            <circle
              cx={xs[i]}
              cy={ys[i]}
              r={isLast ? 4.5 : 3}
              fill={isLast ? 'currentColor' : 'var(--color-surface)'}
              stroke="currentColor"
              strokeWidth={2}
            />
            <text
              x={xs[i]}
              y={h - 8}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              className={isLast ? 'nw-chart__label nw-chart__label--now' : 'nw-chart__label'}
            >
              {point.label}
            </text>
            {isLast ? (
              <text
                x={Math.min(Math.max(xs[i], 28), width - 28)}
                y={ys[i] - 10}
                textAnchor="middle"
                fontSize={11}
                fontWeight={800}
                className="nw-chart__value"
              >
                {`${Math.round(point.value / 10000)}만`}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
