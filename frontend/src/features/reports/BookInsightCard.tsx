import { useId, type ReactNode } from 'react';

import { parseDecimal, parseDecimalOr, type BookInsightOut } from '../../shared/api';
import { formatCurrency, formatSignedCurrency } from '../../shared/lib/format';
import { Button, Card, CategoryAvatar, iconOf } from '../../shared/ui';
import { useReportDetailUnlock } from '../ads';

import {
  compareSentence,
  detailChanges,
  insightTopics,
  projectionSentence,
} from './bookInsightText';
import type { ReportCategory } from './reportLabels';

export interface BookInsightCardProps {
  bookName: string;
  insight: BookInsightOut;
  byId: ReadonlyMap<string, ReportCategory>;
  /** 분류 목록을 아직 못 받았다. 이름 자리에 「이름 확인 중」 을 적는다. */
  namesUnknown: boolean;
}

/**
 * 공유 리포트의 「자세히 보기」.
 *
 * 기본 리포트(쓴 돈, 예산, 분류 비중)는 그냥 보이고, 이 카드만 광고 한 편 뒤에 열린다.
 * 잠겨 있을 때는 무엇을 받는지 먼저 적고, 버튼 글자에 「광고 보고」 를 넣는다. 따로 묻는
 * 창은 없다. 버튼을 누른 것이 곧 고른 것이다.
 *
 * 값은 늘 서버가 준다. 잠금은 화면의 일이다.
 */
export function BookInsightCard({ bookName, insight, byId, namesUnknown }: BookInsightCardProps) {
  const detail = useReportDetailUnlock();
  const titleId = useId();
  const hasProjection = insight.projected_month_end != null;
  const hasDetail = detailChanges(insight).length > 0;

  return (
    <Card className="report__insight" role="region" aria-labelledby={titleId}>
      <div className="report__insight-head">
        <CategoryAvatar icon="03_growth_chart" size={40} />
        <h2 id={titleId} className="report__insight-title">
          {bookName} 소비 자세히 보기
        </h2>
      </div>

      {/* 저장소를 읽는 동안은 제목만 둔다. 잠긴 모습을 먼저 그리면 이미 본 사람에게 광고를 또 권한다. */}
      {detail.unlocked === false ? (
        <>
          <ul className="report__insight-topics">
            {insightTopics(hasProjection, hasDetail).map((topic) => (
              <li key={topic} className="report__insight-topic">
                {topic}
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            fullWidth
            disabled={detail.busy}
            onClick={() => void detail.unlock()}
          >
            {detail.busy ? '광고를 불러오는 중이에요' : '광고 보고 자세히 보기'}
          </Button>
        </>
      ) : null}

      {detail.unlocked === true ? (
        <InsightBody insight={insight} byId={byId} namesUnknown={namesUnknown} />
      ) : null}
    </Card>
  );
}

function InsightBody({
  insight,
  byId,
  namesUnknown,
}: {
  insight: BookInsightOut;
  byId: ReadonlyMap<string, ReportCategory>;
  namesUnknown: boolean;
}) {
  const current = insight.projected_month_end != null;
  const delta = parseDecimalOr(insight.compare_delta, 0);
  const windowEndDay = Number(insight.compare_window_end.slice(8, 10));
  const grown = insight.largest_increase;
  const changes = detailChanges(insight);

  return (
    <div className="report__insight-body">
      <InsightPart label="지난달과 비교">
        <p className="report__insight-text">{compareSentence(delta, current)}</p>
        {current ? <p className="report__insight-note">1일~{windowEndDay}일 기준</p> : null}
      </InsightPart>

      <InsightPart label="가장 많이 늘어난 소비">
        {grown != null ? (
          <div className="report__insight-grown">
            <CategoryAvatar {...iconOf(byId.get(grown.category_id ?? ''))} size={28} />
            <span className="report__insight-grown-name">
              {nameOf(grown.category_id, byId, namesUnknown)}
            </span>
            <span className="report__insight-delta is-up">
              {formatSignedCurrency(parseDecimalOr(grown.delta, 0))}
            </span>
          </div>
        ) : (
          <p className="report__insight-text">
            {/* 두 달 모두 쓴 분류만 견준다. 지난달이 비었으면 늘어난 것이 없는 게 아니라 견줄 것이 없다. */}
            {parseDecimalOr(insight.previous_spent_same_window, 0) > 0
              ? '지난달보다 늘어난 소비가 없어요'
              : '지난달엔 견줄 기록이 없어요'}
          </p>
        )}
      </InsightPart>

      {changes.length > 0 ? (
        <InsightPart label="분류별 자세히">
          <ul className="report__insight-changes">
            {changes.map((change) => {
              const changeDelta = parseDecimalOr(change.delta, 0);
              return (
                <li key={change.category_id ?? 'none'} className="report__insight-change">
                  <CategoryAvatar {...iconOf(byId.get(change.category_id ?? ''))} size={28} />
                  <span className="report__insight-change-name">
                    {nameOf(change.category_id, byId, namesUnknown)}
                  </span>
                  <span className="report__insight-change-value">
                    <span className="report__insight-change-amount">
                      {formatCurrency(parseDecimalOr(change.current, 0))}
                    </span>
                    <span
                      className={
                        changeDelta > 0 ? 'report__insight-delta is-up' : 'report__insight-delta'
                      }
                    >
                      {changeDelta === 0
                        ? '그대로'
                        : `지난달보다 ${formatSignedCurrency(changeDelta)}`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </InsightPart>
      ) : null}

      {current ? (
        <InsightPart label="월말 예상">
          <p className="report__insight-text">
            {projectionSentence(
              parseDecimal(insight.projected_month_end),
              insight.is_projection_reliable,
            )}
          </p>
        </InsightPart>
      ) : null}
    </div>
  );
}

/** 풀린 카드의 한 칸. 잠긴 카드가 적어 둔 이름을 그대로 제목으로 쓴다. */
function InsightPart({ label, children }: { label: string; children: ReactNode }) {
  const labelId = useId();
  return (
    <div className="report__insight-part" role="group" aria-labelledby={labelId}>
      <h3 id={labelId} className="report__insight-label">
        {label}
      </h3>
      {children}
    </div>
  );
}

function nameOf(
  categoryId: string | null,
  byId: ReadonlyMap<string, ReportCategory>,
  namesUnknown: boolean,
): string {
  if (categoryId == null) return '분류 없음';
  return byId.get(categoryId)?.name ?? (namesUnknown ? '이름 확인 중' : '지운 분류');
}
