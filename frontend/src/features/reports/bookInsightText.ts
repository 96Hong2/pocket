import type { BookCategoryChangeOut, BookInsightOut } from '../../shared/api';
import { formatCurrency } from '../../shared/lib/format';

/**
 * 공유 리포트 「자세히 보기」 의 문장. 숫자는 서버가 세고 여기서는 말로만 옮긴다.
 */

/** 잠긴 카드가 미리 알려 주는 것. 풀면 같은 이름의 칸이 이 순서로 선다. */
export const INSIGHT_TOPICS = [
  '지난달과 비교',
  '가장 많이 늘어난 소비',
  '분류별 자세히',
  '월말 예상',
] as const;

/**
 * 이번 달에만 월말 예상이 있다. 지난 달은 이미 끝나 예상할 것이 없다.
 * 없는 것을 적어 두고 광고를 보게 하면 약속을 어기는 셈이라 목록에서도 뺀다.
 * 「분류별 자세히」 도 같다. 가장 많이 늘어난 것 말고 남는 분류가 없으면 적지 않는다.
 */
export function insightTopics(hasProjection: boolean, hasDetail = true): readonly string[] {
  return INSIGHT_TOPICS.filter(
    (topic) => (hasProjection || topic !== '월말 예상') && (hasDetail || topic !== '분류별 자세히'),
  );
}

/**
 * 「분류별 자세히」 에 설 분류. 바로 위 「가장 많이 늘어난 소비」 가 이미 말한 분류는 뺀다.
 * 같은 분류가 두 칸 연달아 첫 줄에 서면 새로 알려 주는 것이 없다.
 */
export function detailChanges(insight: BookInsightOut): BookCategoryChangeOut[] {
  const grown = insight.largest_increase;
  if (grown == null) return insight.category_changes;
  return insight.category_changes.filter((change) => change.category_id !== grown.category_id);
}

/**
 * 지난달과 견준 한 문장.
 *
 * 이번 달은 1일부터 오늘까지를 지난달 같은 날까지와 견주고(`sameWindow`), 지난 달은 달 전체끼리 견준다.
 */
export function compareSentence(delta: number, sameWindow: boolean): string {
  const base = sameWindow ? '지난달 같은 기간' : '지난달';
  const won = Math.round(delta);
  if (won === 0) return `${base}과 똑같이 썼어요`;
  return `${base}보다 ${formatCurrency(Math.abs(won))} ${won > 0 ? '더' : '덜'} 썼어요`;
}

/**
 * 월말 예상 한 문장. 사흘이 안 지나면 숫자가 크게 흔들려 아직 적지 않는다.
 *
 * 예상이라 원 단위까지 적지 않는다. 천 원 단위로 반올림해 「약」 을 붙인다. 세는 것은 서버다.
 */
export function projectionSentence(projected: number | null, reliable: boolean): string {
  if (projected == null || !reliable) return '월말 예상은 3일부터 보여 드려요';
  const rounded = Math.round(projected / 1_000) * 1_000;
  return `이대로면 이번 달 약 ${formatCurrency(rounded)} 써요`;
}
