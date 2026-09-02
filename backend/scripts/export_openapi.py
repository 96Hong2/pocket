"""OpenAPI 스펙을 docs/openapi.json 으로 뽑는다.

프론트 타입이 이 파일을 기준으로 만들어진다. 백엔드 스키마를 고치면 다시 돌린다.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.main import create_app


def main() -> None:
    spec = create_app().openapi()
    out = ROOT.parent / "docs" / "openapi.json"
    out.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{out} · 경로 {len(spec['paths'])}개")


if __name__ == "__main__":
    main()
