import type { CSSProperties } from 'react';

import {
  parseDecimal,
  parseDecimalOr,
  useTags,
  type TagBreakdownOut,
  type TagOut,
} from '../../shared/api';
import { formatCurrency } from '../../shared/lib/format';
import { Amount, Card } from '../../shared/ui';

import { tagColorVar } from '../../shared/lib/tagColors';

/**
 * 태그별로 얼마가 갔나.
 *
 * **카테고리 도넛과 다른 질문이다.** 카테고리는 「무엇에 썼나」 고 태그는 「어떤 묶음인가」 다.
 * 같은 식비가 「출장」 과 「데이트」 로 갈리는 것이 여기서 보인다.
 *
 * 도넛을 또 그리지 않고 가로 한 줄로 그린다. 한 화면에 링이 둘이면 어느 쪽이 그 달을
 * 말하는 것인지 헷갈린다.
 *
 * **비중은 「태그를 단 돈」 안에서다.** 그 달 전체가 아니다. 안 단 돈은 조각이 아니라
 * 아래 한 줄로 말한다. 처음에는 안 단 쪽이 거의 전부라, 조각으로 그리면 회색 하나만 남는다.
 */
export interface TagBreakdownProps {
  breakdown: TagBreakdownOut;
  /** 「지출」·「수입」. 제목에 그대로 들어간다. */
  kindLabel: string;
}

export function TagBreakdown({ breakdown, kindLabel }: TagBreakdownProps) {
  const tags = useTags();

  const byId = new Map<string, TagOut>((tags.data?.items ?? []).map((tag) => [tag.id, tag]));
  /*
    이름을 찾은 줄만 센다.

    태그 목록이 아직 안 왔거나 방금 지운 태그면 조각에 이름을 못 붙인다. 조각 수만 보고
    카드를 그리면 **제목과 빈 막대만 남은 카드**가 잠깐 선다. 그릴 줄이 없으면 카드째 없앤다.
    태그를 하나도 안 만든 사람에게 이 자리가 아예 없는 것과 같은 이유다.
  */
  const rows = breakdown.rows.filter((row) => byId.has(row.tag_id));
  if (rows.length === 0) return null;

  const untagged = parseDecimalOr(breakdown.untagged_total, 0);

  return (
    <Card>
      <h2 className="report__section">태그별 {kindLabel}</h2>
      <div className="tag-report">
        <div className="tag-report__bar" aria-hidden="true">
          {rows.map((row) => {
            const tag = byId.get(row.tag_id);
            const share = parseDecimal(row.share) ?? 0;
            if (tag == null || share <= 0) return null;
            return (
              <span
                key={row.tag_id}
                className="tag-report__seg"
                style={
                  {
                    width: `${share * 100}%`,
                    '--tag-color': tagColorVar(tag.color),
                  } as CSSProperties
                }
              />
            );
          })}
        </div>

        <ul className="tag-report__list">
          {rows.map((row) => {
            const tag = byId.get(row.tag_id);
            if (tag == null) return null;
            const share = parseDecimal(row.share) ?? 0;
            return (
              <li key={row.tag_id} className="tag-report__row">
                <span
                  className="tag-report__dot"
                  aria-hidden="true"
                  style={{ '--tag-color': tagColorVar(tag.color) } as CSSProperties}
                />
                <span className="tag-report__name">{tag.name}</span>
                <span className="tag-report__share">{formatShare(share)}</span>
                <Amount className="tag-report__amount" value={parseDecimalOr(row.amount, 0)} />
              </li>
            );
          })}
        </ul>

        {untagged > 0 ? (
          <p className="tag-report__rest">
            태그를 안 단 {kindLabel} {formatCurrency(untagged)} 은 위 비율에 안 들어가요
          </p>
        ) : null}
      </div>
    </Card>
  );
}

/** 비중 한 자리. 0.5% 를 0% 로 적으면 있는 줄이 없는 것처럼 보인다. */
function formatShare(share: number): string {
  if (share <= 0) return '0%';
  const percent = share * 100;
  return percent < 1 ? '1% 미만' : `${Math.round(percent)}%`;
}
