#!/usr/bin/env bash
# 실기기 테스트용 임시 공개 서버.
#
# 앱인토스 콘솔의 QR 테스트는 토스 앱이 우리 백엔드를 **공개 https 주소**로 부른다.
# 아직 운영 서버가 없으므로, 이 맥에서 도는 백엔드를 임시 터널로 잠깐 열어 준다.
# Cloud Run 이 서면 이 스크립트는 필요 없다. `docs/DEPLOY.md` 를 본다.
#
#   ./scripts/serve-public.sh          # 백엔드를 열고 주소를 찍는다
#   ./scripts/serve-public.sh --build  # 그 주소로 pocket.ait 까지 만든다
#
# ⚠ 이 서버는 익명 식별키를 검증하지 않는다(mTLS 인증서가 아직 없다).
#   주소를 아는 사람은 아무 키나 보내 남의 기록을 볼 수 있다. 테스트가 끝나면 반드시 끈다.
#   주소는 실행할 때마다 바뀐다. 켠 채로 두는 서버가 아니다.
set -euo pipefail

cd "$(dirname "$0")/.."
BUILD_AIT=0
[[ "${1:-}" == "--build" ]] && BUILD_AIT=1

for need in docker cloudflared; do
  command -v "$need" >/dev/null || { echo "$need 가 없다. cloudflared 는 brew install cloudflared."; exit 1; }
done
docker info >/dev/null 2>&1 || { echo "Docker 가 응답하지 않는다. Docker Desktop 을 켠다."; exit 1; }

LOG="$(mktemp -t pocket-tunnel)"
cleanup() {
  echo ""
  echo "정리 중..."
  [[ -n "${TUNNEL_PID:-}" ]] && kill "$TUNNEL_PID" 2>/dev/null || true
  docker rm -f pocket-api >/dev/null 2>&1 || true
  echo "공개 주소를 닫았다. DB(pocket-db)는 그대로 둔다."
}
trap cleanup EXIT INT TERM

echo "1/4  DB 를 띄우고 스키마를 올린다"
make db-up >/dev/null
make migrate-dev >/dev/null

echo "2/4  운영 이미지를 만든다"
docker build -q -f docker/backend/Dockerfile -t pocket-backend:local backend >/dev/null

echo "3/4  백엔드를 8080 에 띄운다"
docker rm -f pocket-api >/dev/null 2>&1 || true
docker run -d --name pocket-api -p 8080:8080 \
  -e ENVIRONMENT=local \
  -e ALLOW_UNVERIFIED_ANON_KEY=true \
  -e DATABASE_URL='postgresql+psycopg://pocket:pocket@host.docker.internal:5434/pocket' \
  pocket-backend:local >/dev/null
for _ in $(seq 1 30); do
  curl -fsS -o /dev/null http://localhost:8080/health && break
  sleep 1
done

echo "4/4  공개 주소를 연다"
cloudflared tunnel --url http://localhost:8080 --no-autoupdate >"$LOG" 2>&1 &
TUNNEL_PID=$!
URL=""
for _ in $(seq 1 40); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)"
  [[ -n "$URL" ]] && break
  sleep 1
done
[[ -n "$URL" ]] || { echo "터널 주소를 못 받았다. 로그: $LOG"; exit 1; }

curl -fsS -o /dev/null "$URL/health" || { echo "공개 주소로 헬스체크가 안 된다: $URL"; exit 1; }

if [[ "$BUILD_AIT" == "1" ]]; then
  echo ""
  echo "이 주소를 넣어 pocket.ait 를 만든다"
  (cd frontend && VITE_API_BASE_URL="$URL" npm run build >/dev/null)
  echo "  frontend/pocket.ait"
fi

cat <<MSG

────────────────────────────────────────────────
 공개 주소  $URL
 헬스체크   $URL/health   (200 확인함)
 번들 빌드  cd frontend && VITE_API_BASE_URL="$URL" npm run build
────────────────────────────────────────────────
 이 창을 닫거나 Ctrl+C 를 누르면 주소가 사라진다.
MSG

wait "$TUNNEL_PID"
