"""요청을 보낸 곳을 한 칸 이름으로 고른다. 틀린 익명키와 큰 사진 본문을 곳마다 셀 때 쓴다.

**X-Forwarded-For 의 마지막 값을 쓴다.** 앞쪽 값은 보내는 쪽이 마음대로 적을 수 있고,
Cloud Run 앞단(Google Front End)은 실제로 연결해 온 주소를 맨 뒤에 덧붙인다.
uvicorn `--proxy-headers --forwarded-allow-ips='*'` 는 첫 값을 `request.client` 로 바꿔
두므로 그 값은 믿지 않는다. 그 값으로 세면 요청마다 다른 IP 를 적어 보내 상한을 피한다.
앞에 외부 HTTPS 부하분산기를 두면 그 주소가 맨 뒤에 하나 더 붙으므로 끝에서 두 번째를 봐야 한다.
실제 헤더 모양은 docs/DEPLOY.md 대로 운영 로그에서 확인한다.

IPv6 는 /64 로 묶는다. 한 가입자가 보통 /64 하나를 받아 그 안에서 주소를 마음대로 바꿀 수 있다.
"""

from __future__ import annotations

import ipaddress
from collections.abc import Iterable

__all__ = ["ClientKey", "client_key"]

# 주소로 읽히지 않는 값은 그대로 쓰되 길이를 묶는다. 칸 이름이 메모리를 키우지 않게 한다.
_MAX_RAW_LENGTH = 64


class ClientKey(str):
    """칸 이름. 경고 로그에 남길 X-Forwarded-For 칸 수를 함께 든다."""

    forwarded_hops: int

    def __new__(cls, value: str, forwarded_hops: int = 0) -> ClientKey:
        key = super().__new__(cls, value)
        key.forwarded_hops = forwarded_hops
        return key


def _group(address: str) -> str:
    try:
        parsed = ipaddress.ip_address(address)
    except ValueError:
        return address[:_MAX_RAW_LENGTH]
    if isinstance(parsed, ipaddress.IPv6Address):
        if parsed.ipv4_mapped is not None:
            return str(parsed.ipv4_mapped)
        return str(ipaddress.IPv6Network(f"{parsed}/64", strict=False))
    return str(parsed)


def client_key(forwarded_for: Iterable[str], peer: str | None) -> ClientKey | None:
    """X-Forwarded-For 헤더 값들(여러 줄일 수 있다)과 연결한 주소로 칸 이름을 고른다."""
    hops = [hop.strip() for value in forwarded_for for hop in value.split(",") if hop.strip()]
    if hops:
        return ClientKey(_group(hops[-1]), len(hops))
    if peer is None:
        return None
    return ClientKey(_group(peer), 0)
