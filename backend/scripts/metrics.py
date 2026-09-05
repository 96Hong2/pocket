"""지표를 뽑아 본다.

PRD 14장이 정한 숫자를 **지금 데이터베이스에서 실제로 셀 수 있는지** 확인하는 자리다.
출시 뒤에 붙이면 초기 사용자 구간이 통째로 빈다. 그래서 출시 전에 한 번 돌려 본다.

    DATABASE_URL='postgresql+psycopg://...' uv run python scripts/metrics.py

읽기만 한다. 운영에 대고 돌려도 되지만 읽기 전용 복제본이 있으면 그쪽이 낫다.

## 여기서 못 재는 것

- 줄글·캡처 체류 시간 P50, 첫 기록까지 45초: 화면에서 재야 한다. 서버는 언제 눌렀는지 모른다
- 날짜·금액 정확도: 정답이 있어야 재는데, 사람이 고친 것을 정답으로 쓰면
  안 고치고 넘어간 오류가 정답이 된다. 표본을 손으로 채점해야 한다
- 유료 전환: 결제가 아직 없다

못 재는 것을 재는 척하지 않는다. 그래서 여기에는 여덟 개만 있다.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection

# 리텐션을 재는 창. "가입 N일 뒤에 살아 있나" 를 하루로 재면 표본이 너무 얇다.
D7_WINDOW = (7, 14)
D30_WINDOW = (30, 37)
# 며칠 비어야 이탈로 보나. 복구 카드가 뜨는 기준과 같다(app/features/home/homeMode.ts).
AWAY_DAYS = 3
# 이탈 뒤 며칠 안에 돌아오면 복귀로 세나.
RETURN_DAYS = 7


@dataclass(frozen=True)
class Metric:
    name: str
    value: str
    target: str
    note: str


def _ratio(hit: int, total: int) -> str:
    if total == 0:
        return "표본 없음"
    return f"{hit / total * 100:.1f}%  ({hit}/{total})"


def assisted_record_rate(conn: Connection) -> Metric:
    """북극성. 읽어 온 값을 손대지 않고 저장한 비율.

    분모는 **저장까지 간 후보**다. 검토하다 만 것과 사용자가 선택을 끈 것은 세지 않는다.
    키패드 기록은 애초에 읽어 온 값이 없으므로 분모 밖이다. 넣으면 비율이 저절로 올라간다.
    """
    row = conn.execute(
        text(
            """
            SELECT count(*) FILTER (WHERE was_edited IS FALSE) AS untouched,
                   count(*)                                    AS committed
            FROM import_candidates
            WHERE transaction_id IS NOT NULL
            """
        )
    ).one()
    return Metric(
        "손 안 대고 저장된 비율 (북극성)",
        _ratio(row.untouched, row.committed),
        "MVP 65% · 6개월 85%",
        "분모는 저장까지 간 후보다. 키패드는 분모 밖이다",
    )


def source_mix(conn: Connection) -> Metric:
    rows = conn.execute(
        text(
            """
            SELECT source, count(*) AS n
            FROM transactions
            WHERE deleted_at IS NULL
            GROUP BY source
            ORDER BY n DESC
            """
        )
    ).all()
    total = sum(r.n for r in rows) or 1
    parts = [f"{r.source} {r.n / total * 100:.0f}%" for r in rows]
    return Metric(
        "입력 경로 분포",
        " · ".join(parts) if parts else "표본 없음",
        "-",
        "AI 경로가 늘어야 북극성이 오른다",
    )


def first_record_success(conn: Connection) -> Metric:
    row = conn.execute(
        text(
            """
            SELECT count(*)                                        AS users,
                   count(*) FILTER (WHERE t.first_at IS NOT NULL)  AS recorded
            FROM users u
            LEFT JOIN LATERAL (
                SELECT min(created_at) AS first_at
                FROM transactions
                WHERE user_id = u.id AND deleted_at IS NULL
            ) t ON TRUE
            """
        )
    ).one()
    return Metric(
        "첫 기록 성공률",
        _ratio(row.recorded, row.users),
        "70% → 85%",
        "계정이 만들어진 사람 중 한 건이라도 적은 비율",
    )


def time_to_first_record(conn: Connection) -> Metric:
    """계정이 생긴 순간부터 첫 저장까지. 화면 체류 시간이 아니라 서버가 본 간격이다."""
    value = conn.execute(
        text(
            """
            SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY gap) AS median
            FROM (
                SELECT extract(epoch FROM min(t.created_at) - u.created_at) AS gap
                FROM users u
                JOIN transactions t ON t.user_id = u.id AND t.deleted_at IS NULL
                GROUP BY u.id, u.created_at
            ) g
            """
        )
    ).scalar()
    shown = "표본 없음" if value is None else f"{value:.0f}초"
    return Metric(
        "첫 기록까지 (중앙값)",
        shown,
        "45초",
        "서버가 본 간격이다. 화면을 언제 열었는지는 모른다",
    )


def _retention(conn: Connection, window: tuple[int, int], label: str, target: str) -> Metric:
    lo, hi = window
    row = conn.execute(
        text(
            """
            SELECT count(*) AS eligible,
                   count(*) FILTER (WHERE kept) AS kept
            FROM (
                SELECT u.id,
                       EXISTS (
                           SELECT 1 FROM transactions t
                           WHERE t.user_id = u.id
                             AND t.deleted_at IS NULL
                             AND t.created_at >= u.created_at + make_interval(days => :lo)
                             AND t.created_at <  u.created_at + make_interval(days => :hi)
                       ) AS kept
                FROM users u
                WHERE u.created_at <= now() - make_interval(days => :hi)
            ) x
            """
        ),
        {"lo": lo, "hi": hi},
    ).one()
    return Metric(
        label,
        _ratio(row.kept, row.eligible),
        target,
        f"가입 {lo}~{hi}일 사이에 한 건이라도 적었나. 앱을 연 것이 아니라 기록한 것으로 센다",
    )


def budget_adoption(conn: Connection) -> Metric:
    row = conn.execute(
        text(
            """
            SELECT count(*) AS recorded,
                   count(*) FILTER (WHERE has_budget) AS adopted
            FROM (
                SELECT u.id,
                       EXISTS (
                           SELECT 1 FROM budgets b
                           WHERE b.user_id = u.id AND b.deleted_at IS NULL
                       ) AS has_budget
                FROM users u
                WHERE EXISTS (
                    SELECT 1 FROM transactions t
                    WHERE t.user_id = u.id AND t.deleted_at IS NULL
                )
            ) x
            """
        )
    ).one()
    return Metric(
        "예산 설정률",
        _ratio(row.adopted, row.recorded),
        "35% → 45%",
        "분모는 한 건이라도 적은 사람이다. 계정만 만든 사람은 뺀다",
    )


def recovery_rate(conn: Connection) -> Metric:
    """사흘 넘게 비운 뒤 이레 안에 돌아온 비율.

    기록한 **날짜** 사이의 간격으로 센다. 같은 날 여러 건 적은 것이 공백을 메우지 않게 한다.
    """
    row = conn.execute(
        text(
            """
            WITH days AS (
                SELECT DISTINCT user_id, (occurred_at AT TIME ZONE 'Asia/Seoul')::date AS d
                FROM transactions
                WHERE deleted_at IS NULL
            ), gaps AS (
                SELECT user_id, d, lead(d) OVER (PARTITION BY user_id ORDER BY d) - d AS gap
                FROM days
            )
            SELECT count(DISTINCT user_id) FILTER (WHERE gap >= :away) AS lapsed,
                   count(DISTINCT user_id) FILTER (
                       WHERE gap >= :away AND gap <= :away + :ret
                   ) AS returned
            FROM gaps
            """
        ),
        {"away": AWAY_DAYS, "ret": RETURN_DAYS},
    ).one()
    return Metric(
        f"{AWAY_DAYS}일+ 비운 뒤 {RETURN_DAYS}일 안에 복귀",
        _ratio(row.returned, row.lapsed),
        "25% → 35%",
        "기록한 날짜 사이 간격으로 센다. 복구 카드가 실제로 사람을 데려오는지 여기서 본다",
    )


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL 이 없다.", file=sys.stderr)
        return 2

    engine = create_engine(url, hide_parameters=True)
    with engine.connect() as conn:
        metrics = [
            assisted_record_rate(conn),
            source_mix(conn),
            first_record_success(conn),
            time_to_first_record(conn),
            _retention(conn, D7_WINDOW, "D7 기록 리텐션", "35%"),
            _retention(conn, D30_WINDOW, "D30 기록 리텐션", "20% → 25%"),
            budget_adoption(conn),
            recovery_rate(conn),
        ]

    width = max(len(m.name) for m in metrics)
    for m in metrics:
        print(f"{m.name.ljust(width)}  {m.value}")
        print(f"{' ' * width}  목표 {m.target} · {m.note}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
