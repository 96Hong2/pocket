"""테스트는 어떤 .env 가 있어도 실제 모델을 부르지 않는다.

개발자의 backend/.env 에 LLM_PROVIDER=gemini 가 있으면 Settings 가 그것을 읽는다.
환경변수가 .env 보다 세므로 여기서 스텁으로 못 박는다. 실제 호출은 값이 들고 결과가 흔들린다.
"""

from __future__ import annotations

import os

os.environ["LLM_PROVIDER"] = "stub"
os.environ.pop("GEMINI_API_KEY", None)
os.environ.pop("OPENAI_API_KEY", None)
