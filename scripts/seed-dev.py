#!/usr/bin/env python3
"""개발 스택(:8000)에 손으로 만져 볼 데이터를 심는다.

브라우저 개발 도구의 목 익명키가 고정값이라 그 키로 그대로 넣으면
`localhost:5173` 을 새로고침하는 것만으로 화면에 바로 나온다.

    python3 scripts/seed-dev.py              # 6개월치 + 오늘까지
    python3 scripts/seed-dev.py --recovery   # 최근 나흘을 비워 복구 카드를 띄운다
    python3 scripts/seed-dev.py --wipe       # 심은 것을 지우고 다시 넣는다

⚠ 검증용 DB(pocket_e2e)가 아니라 개발용 DB(pocket)에 넣는다. e2e 와 섞이지 않는다.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone

BASE = "http://localhost:8000/api/v1"
# @apps-in-toss/devtools 목이 돌려주는 고정값이다. 브라우저가 쓰는 것과 같은 키다.
ANON_KEY = "mock-anon-hash-xyz789"
KST = timezone(timedelta(hours=9))

random.seed(20260907)  # 돌릴 때마다 같은 데이터가 나오게 고정한다


def call(method: str, path: str, body: dict | None = None) -> dict | list | None:
    req = urllib.request.Request(
        BASE + path,
        method=method,
        headers={"X-Anon-Key": ANON_KEY, "Accept": "application/json"},
    )
    if body is not None:
        req.add_header("Content-Type", "application/json")
        req.data = json.dumps(body).encode()
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            raw = res.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:300]
        print(f"  ! {method} {path} → {e.code} {detail}", file=sys.stderr)
        return None


def at(day: date, hour: int, minute: int = 0) -> str:
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=KST).isoformat()


# ── 심을 내용 ────────────────────────────────────────────────

MY_CATEGORIES = [
    ("반려동물", "16_paw"),
    ("구독", "37_headphones"),
    ("경조사", "31_gift"),
]

# (상호, 카테고리, 최소, 최대, 빈도) 실제로 있을 법한 이름을 쓴다.
# 빈도를 안 주면 200,000원짜리가 6,000원짜리만큼 자주 뽑혀 한 달 지출이 부풀어 오른다.
SPEND = [
    ("김밥천국", "식비", 6_000, 12_000, 40),
    ("백반집 이모네", "식비", 8_000, 15_000, 35),
    ("배달의민족", "식비", 14_000, 32_000, 30),
    ("스타벅스 강남점", "카페·간식", 4_500, 9_000, 35),
    ("메가커피", "카페·간식", 2_000, 4_500, 40),
    ("파리바게뜨", "카페·간식", 3_000, 12_000, 20),
    ("카카오T 택시", "교통", 6_000, 21_000, 15),
    ("지하철", "교통", 1_400, 1_800, 45),
    ("GS25", "생활", 2_500, 14_000, 30),
    ("올리브영", "건강·미용", 12_000, 45_000, 8),
    ("쿠팡", "쇼핑", 9_900, 89_000, 12),
    ("무신사", "쇼핑", 29_000, 138_000, 4),
    ("CGV 용산", "여가·취미", 14_000, 28_000, 7),
    ("교보문고", "여가·취미", 15_000, 42_000, 6),
    ("헬스장 3개월", "건강·미용", 180_000, 240_000, 1),
    ("동물병원", "반려동물", 35_000, 180_000, 2),
    ("넷플릭스", "구독", 13_500, 17_000, 5),
    ("유튜브 프리미엄", "구독", 14_900, 14_900, 5),
    ("결혼식 축의금", "경조사", 50_000, 150_000, 2),
]
SPEND_WEIGHTS = [row[4] for row in SPEND]

FIXED = [
    ("월세", "주거·고정비", 550_000),
    ("통신비", "주거·고정비", 43_000),
    ("관리비", "주거·고정비", 87_000),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--recovery", action="store_true", help="최근 나흘을 비워 복구 카드를 띄운다")
    ap.add_argument("--wipe", action="store_true", help="이미 있는 거래를 지우고 시작한다")
    ap.add_argument("--months", type=int, default=6, help="몇 달치를 넣을지 (기본 6)")
    args = ap.parse_args()

    if not isinstance(call("GET", "/categories"), dict):
        print("백엔드(:8000)가 응답하지 않는다. `make dev-back` 을 먼저 띄운다.", file=sys.stderr)
        return 1

    today = date.today()

    if args.wipe:
        print("기존 거래를 지운다")
        n = 0
        while True:
            page = call("GET", "/transactions?limit=100")
            rows = (page or {}).get("items") or []
            if not rows:
                break
            for row in rows:
                call("DELETE", f"/transactions/{row['id']}")
                n += 1
            if len(rows) < 100:
                break
        print(f"  {n}건 지움")

    # 1. 내 카테고리
    print("카테고리를 만든다")
    for name, icon in MY_CATEGORIES:
        call("POST", "/categories", {"name": name, "icon_key": icon})
    cats = {c["name"]: c["id"] for c in (call("GET", "/categories") or {}).get("items", [])}
    print(f"  쓸 수 있는 분류 {len(cats)}개")

    # 2. 예산 (이번 달). 끝난 달은 서버가 막으므로 손대지 않는다.
    print("예산을 정한다")
    call("PUT", "/budgets", {"amount": "1500000"})
    for name, amount in [("식비", "450000"), ("카페·간식", "90000"), ("교통", "120000"), ("쇼핑", "250000")]:
        if name in cats:
            call("PUT", f"/budgets/categories/{cats[name]}", {"amount": amount})

    # 3. 거래
    print(f"거래를 {args.months}달치 넣는다")
    quiet_from = today - timedelta(days=3) if args.recovery else None
    made = 0
    refund_targets: list[tuple[str, int]] = []

    start = (today.replace(day=1) - timedelta(days=31 * (args.months - 1))).replace(day=1)
    day = start
    while day <= today:
        if quiet_from and day >= quiet_from:
            day += timedelta(days=1)
            continue

        # 월급: 매달 5일. 25일로 두면 달 초에 수입이 0 이라 수입 히어로를 못 본다
        if day.day == 5:
            call("POST", "/transactions", {
                "occurred_at": at(day, 10), "amount": "3200000", "type": "income",
                "merchant": "월급", "category_id": cats.get("수입"), "source": "keypad",
            })
            made += 1
        # 고정비: 매달 1일
        if day.day == 1:
            for name, cat, amount in FIXED:
                call("POST", "/transactions", {
                    "occurred_at": at(day, 9), "amount": str(amount), "type": "expense",
                    "merchant": name, "category_id": cats.get(cat), "source": "keypad",
                })
                made += 1
        # 저축 이체: 월급 다음 날. 예산에서 빠져야 한다
        if day.day == 6:
            call("POST", "/transactions", {
                "occurred_at": at(day, 11), "amount": "700000", "type": "transfer",
                "merchant": "적금 이체", "category_id": cats.get("이체"), "source": "keypad",
            })
            made += 1

        # 그날의 소비 0~3건. 주말에 조금 더 쓴다
        count = random.choice([0, 1, 1, 2, 2, 3] if day.weekday() >= 5 else [0, 1, 1, 2, 2])
        for _ in range(count):
            merchant, cat, lo, hi, _ = random.choices(SPEND, weights=SPEND_WEIGHTS)[0]
            amount = random.randrange(lo, hi + 1, 100)
            res = call("POST", "/transactions", {
                "occurred_at": at(day, random.randint(8, 22), random.choice([0, 15, 30, 45])),
                "amount": str(amount), "type": "expense", "merchant": merchant,
                "category_id": cats.get(cat), "source": random.choice(["keypad", "keypad", "nl", "screenshot"]),
            })
            made += 1
            if res and amount > 30_000 and len(refund_targets) < 24:
                refund_targets.append((res["transaction"]["id"], amount))

        day += timedelta(days=1)

    print(f"  {made}건")

    # 4. 가장자리 몇 개. 이런 건 손으로 만들기 번거롭다
    print("가장자리 몇 건을 더한다")
    edge = today - timedelta(days=8 if not args.recovery else 12)

    # 환불: 대상 금액을 넘지 못한다
    for tx_id, amount in refund_targets[-2:]:
        call("POST", "/transactions", {
            "occurred_at": at(edge, 14), "amount": str(amount // 2), "type": "refund",
            "merchant": "부분 환불", "source": "keypad", "refund_of_transaction_id": tx_id,
        })

    # 예산에서 뺀 지출 (회사 경비처럼)
    call("POST", "/transactions", {
        "occurred_at": at(edge, 13), "amount": "182000", "type": "expense",
        "merchant": "회사 워크숍 대납", "category_id": cats.get("기타"),
        "source": "keypad", "excluded_from_budget": True,
    })
    # 무지출일
    call("POST", "/transactions", {
        "occurred_at": at(edge - timedelta(days=1), 23), "amount": "0", "source": "no_spend",
    })
    # 아주 작은 값과 아주 큰 값
    call("POST", "/transactions", {
        "occurred_at": at(edge - timedelta(days=2), 12), "amount": "990",
        "type": "expense", "merchant": "자판기 커피", "category_id": cats.get("카페·간식"), "source": "keypad",
    })
    call("POST", "/transactions", {
        "occurred_at": at(edge - timedelta(days=3), 15), "amount": "1480000",
        "type": "expense", "merchant": "노트북 (에어 15인치 M4 512GB 스페이스그레이)",
        "category_id": cats.get("쇼핑"), "source": "keypad",
    })
    # 상호가 없는 건. 화면이 분류 이름으로 대신 쓰는지 본다
    call("POST", "/transactions", {
        "occurred_at": at(edge - timedelta(days=4), 19), "amount": "23000",
        "type": "expense", "category_id": cats.get("식비"), "source": "keypad",
    })

    # 5. 기억한 분류. 줄글 입구를 실제로 지나야 쌓인다
    print("기억한 분류를 쌓는다")
    batch = call("POST", "/imports/text", {"text": "어제 스타벅스 5500원 김밥천국 9000원"})
    if batch and batch.get("candidates"):
        call("POST", f"/imports/{batch['id']}/commit",
             {"candidate_ids": [c["id"] for c in batch["candidates"] if c.get("selected", True)]})

    summary = call("GET", "/transactions/summary") or {}
    print()
    print("끝났다. localhost:5173 을 새로고침한다.")
    print(f"  이번 달 지출 {summary.get('month_expense', '?')} 원")
    if args.recovery:
        print("  ⚠ 최근 나흘을 비워 뒀다. 홈에 복구 카드가 떠 있어야 한다")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
