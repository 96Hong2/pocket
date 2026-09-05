import type { BreakdownRowOut } from '../../shared/api';

/**
 * 조각 색을 정하는 **유일한** 자리.
 *
 * 도넛과 목록이 따로 세면 한쪽이 필터를 바꿀 때 색이 어긋난다. 그러면 목록의 색 점이
 * 링의 다른 조각을 가리키게 되는데, 화면은 멀쩡해 보여서 아무도 못 찾는다.
 *
 * 램프가 아홉 색이라 조각도 아홉을 넘지 않는다(서버가 여덟 + 접은 하나로 잘라 준다).
 * 순환시키면 링 안에 같은 색이 두 번 나와 오히려 못 읽는다.
 */
export function donutColors(rows: BreakdownRowOut[]): Map<string, string> {
  const colors = new Map<string, string>();
  rows
    .filter((row) => row.share != null)
    .forEach((row, index) => colors.set(row.key, `var(--color-donut-${index + 1})`));
  return colors;
}
