"""설정된 LLM provider 를 실제로 한 번 불러 본다.

키를 넣은 뒤 배관이 도는지 사람이 확인하는 자리다. 테스트가 아니다.

    uv run python scripts/llm_smoke.py --text "점심 12000 스벅 4500 어제 택시 9000"
    uv run python scripts/llm_smoke.py --image capture.png
    uv run python scripts/llm_smoke.py --image receipt.jpg --receipt

provider·모델·걸린 시간과 후보를 그대로 찍는다. 찍히는 값은 넣은 사진에서 읽은 것이니
남의 사진으로 돌리지 않는다.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.integrations.llm import (
    LlmError,
    LlmImage,
    TransactionExtraction,
    get_llm_client,
    natural_language_prompt,
    receipt_prompt,
    screenshot_prompt,
)

_MEDIA_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="LLM provider 연기 검사")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--text", help="줄글 입력")
    source.add_argument("--image", type=Path, help="캡처 또는 영수증 사진 파일")
    parser.add_argument("--receipt", action="store_true", help="사진을 종이 영수증으로 읽는다")
    args = parser.parse_args(argv)

    client = get_llm_client()
    today = date.today()
    print(
        f"provider={client.provider} is_stub={client.is_stub} model={getattr(client, 'model', '-')}"
    )

    if args.text is not None:
        call = client.extract(
            prompt=natural_language_prompt(today),
            schema=TransactionExtraction,
            text=args.text,
            today=today,
        )
    else:
        media_type = _MEDIA_TYPES.get(args.image.suffix.lower())
        if media_type is None:
            print(f"지원하지 않는 확장자: {args.image.suffix}")
            return 2
        image = LlmImage(media_type=media_type, data=args.image.read_bytes())
        prompt = receipt_prompt(today) if args.receipt else screenshot_prompt(today)
        call = client.extract(prompt=prompt, schema=TransactionExtraction, image=image, today=today)

    started = time.monotonic()
    try:
        result = asyncio.run(call)
    except LlmError as exc:
        print(f"실패: {exc} (retryable={exc.retryable})")
        return 1
    elapsed = int((time.monotonic() - started) * 1000)
    print(f"elapsed_ms={elapsed} candidates={len(result.candidates)}")
    print(json.dumps(result.model_dump(mode="json"), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
