"""복원본이 쓸 만한지 확인한다.

백업을 켜 두는 것과 백업이 있는 것은 다르다. 한 번은 실제로 복원해서 이 스크립트를 돌려야
있다고 말할 수 있다. 절차는 `docs/DEPLOY.md` §8 에 있다.

**운영 데이터베이스에 대고 돌리지 않는다.** 복원한 사본에 대고 돌린다.
읽기만 하지만, 그렇더라도 확인은 사본에서 한다.

    DATABASE_URL='postgresql+psycopg://...복원본...' uv run python scripts/check_restore.py

어긋난 것이 하나라도 있으면 0 이 아닌 코드로 끝난다. 그래야 절차 안에서 걸린다.
"""

from __future__ import annotations

import os
import sys

from sqlalchemy import create_engine, inspect, text

# 있어야 하는 표. 하나라도 없으면 복원이 반쪽이다.
REQUIRED_TABLES = (
    "users",
    "categories",
    "transactions",
    "budgets",
    "category_budgets",
    "user_preferences",
    "merchant_rules",
    "import_batches",
    "import_candidates",
    "parse_usages",
)

# 시드가 넣는 기본 카테고리 수. `app/domain/categories.py` 의 DEFAULT_CATEGORIES 와 같다.
EXPECTED_DEFAULT_CATEGORIES = 11


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL 이 없다. 복원본 주소를 주고 다시 돌린다.", file=sys.stderr)
        return 2

    # 로그에 접속 문자열이 새지 않게 한다. 비밀번호가 그 안에 있다.
    engine = create_engine(url, hide_parameters=True)
    problems: list[str] = []

    with engine.connect() as conn:
        names = set(inspect(conn).get_table_names())

        missing = [t for t in REQUIRED_TABLES if t not in names]
        if missing:
            problems.append(f"표가 없다: {', '.join(missing)}")

        if "alembic_version" not in names:
            problems.append("alembic_version 이 없다. 마이그레이션을 한 적 없는 데이터베이스다")
        else:
            revision = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
            print(f"스키마 버전: {revision}")
            if not revision:
                problems.append("alembic_version 이 비어 있다")

        if "categories" in names:
            seeded = conn.execute(
                text("SELECT count(*) FROM categories WHERE is_default IS TRUE")
            ).scalar_one()
            print(f"기본 카테고리: {seeded}개")
            if seeded != EXPECTED_DEFAULT_CATEGORIES:
                problems.append(
                    f"기본 카테고리가 {EXPECTED_DEFAULT_CATEGORIES}개가 아니라 {seeded}개다"
                )

        if "transactions" in names:
            # 복원했는데 거래가 하나도 없으면 빈 인스턴스를 복원본으로 착각한 것이다.
            rows = conn.execute(text("SELECT count(*) FROM transactions")).scalar_one()
            users = conn.execute(text("SELECT count(*) FROM users")).scalar_one()
            print(f"사용자 {users}명 · 거래 {rows}건")
            if users == 0 or rows == 0:
                problems.append("사용자나 거래가 0 이다. 빈 데이터베이스를 보고 있는 것 같다")

    if problems:
        print("\n복원본에 문제가 있다:", file=sys.stderr)
        for line in problems:
            print(f"  - {line}", file=sys.stderr)
        return 1

    print("\n복원본 확인 통과")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
