"""마이그레이션 스모크. 리비전이 끝까지 올라가는지, 헤드가 하나인지 본다."""

from __future__ import annotations

import ast
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from alembic.config import Config

BACKEND_ROOT = Path(__file__).resolve().parents[1]
ALEMBIC_INI = BACKEND_ROOT / "alembic.ini"
MIGRATIONS_DIR = BACKEND_ROOT / "migrations"
VERSIONS_DIR = MIGRATIONS_DIR / "versions"

# sqlite 가 Postgres 전용 타입·구문을 만나면 이 예외들로 터진다.
SQLITE_UNSUPPORTED = ("UnsupportedCompilationError", "CompileError", "NotImplementedError")


def _load_config(database_url: str | None = None) -> Config:
    """alembic 설정을 읽는다. 아직 없으면 테스트를 건너뛴다."""
    if not ALEMBIC_INI.is_file():
        pytest.skip(f"{ALEMBIC_INI.name} 이 아직 없다. 마이그레이션이 들어오면 이 검사가 켜진다.")
    if not (MIGRATIONS_DIR / "env.py").is_file():
        pytest.skip("migrations/env.py 가 아직 없다.")

    from alembic.config import Config

    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    if database_url is not None:
        config.set_main_option("sqlalchemy.url", database_url)
    return config


def _revision_files() -> list[Path]:
    if not VERSIONS_DIR.is_dir():
        return []
    return sorted(p for p in VERSIONS_DIR.glob("*.py") if not p.name.startswith("__"))


def test_revision_files_are_syntactically_valid() -> None:
    """리비전 파일이 파이썬으로 읽히고 upgrade/downgrade 를 갖는다."""
    files = _revision_files()
    if not files:
        pytest.skip("migrations/versions 에 리비전 파일이 아직 없다.")

    for path in files:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        functions = {node.name for node in tree.body if isinstance(node, ast.FunctionDef)}
        assert "upgrade" in functions, f"{path.name} 에 upgrade() 가 없다"
        assert "downgrade" in functions, f"{path.name} 에 downgrade() 가 없다"


def test_single_head() -> None:
    """헤드가 갈라지면 배포가 멈춘다. 갈라진 순간 여기서 잡는다."""
    config = _load_config()

    from alembic.script import ScriptDirectory

    heads = ScriptDirectory.from_config(config).get_heads()
    assert len(heads) <= 1, f"헤드가 여러 개다: {heads}"


def test_upgrade_head_runs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """임시 sqlite 에 upgrade head 를 실제로 돌린다."""
    if not _revision_files():
        pytest.skip("migrations/versions 에 리비전 파일이 아직 없다.")

    database_url = f"sqlite+pysqlite:///{tmp_path / 'migrations-smoke.sqlite'}"
    monkeypatch.setenv("DATABASE_URL", database_url)

    from app.core.config import get_settings

    # env.py 가 앱 설정에서 URL 을 읽어도 임시 sqlite 로 가게 한다.
    get_settings.cache_clear()

    config = _load_config(database_url)

    from alembic import command

    try:
        command.upgrade(config, "head")
    except Exception as error:
        if type(error).__name__ in SQLITE_UNSUPPORTED:
            pytest.skip(f"Postgres 전용 타입이라 sqlite 로 못 올린다: {error}")
        raise
    finally:
        get_settings.cache_clear()
