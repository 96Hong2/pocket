#!/usr/bin/env bash
# Cloud Run 에 백엔드를 올린다. 임시 터널을 끝내고 주소를 고정하는 것이 목적이다.
#
#   ./scripts/deploy-cloudrun.sh            # 이미지 → 마이그레이션 → 리비전 → 연기 검사
#   ./scripts/deploy-cloudrun.sh --dry-run  # 무엇을 할지만 찍는다
#
# 처음 한 번은 사람이 해야 하는 것이 셋 있다. 없으면 여기서 멈추고 무엇이 없는지 말한다.
#   1. gcloud auth login          브라우저 로그인
#   2. GCP 프로젝트 + 결제 등록    결제가 없으면 Cloud Run·Cloud SQL 이 안 켜진다
#   3. 토스 mTLS 인증서 + 개인키   운영에서는 이게 없으면 서버가 기동조차 못 한다(의도한 가드)
#
# 자세한 배경은 docs/DEPLOY.md 를 본다. 이 스크립트는 그 문서의 명령을 순서대로 묶은 것이다.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="${POCKET_GCP_PROJECT:-}"
REGION="${POCKET_GCP_REGION:-asia-northeast3}"
SQL_INSTANCE="${POCKET_SQL_INSTANCE:-pocket-sql}"
SERVICE="pocket-backend"
DRY=0
[[ "${1:-}" == "--dry-run" ]] && DRY=1

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
run() { if [[ "$DRY" == "1" ]]; then printf '  $ %s\n' "$*"; else "$@"; fi; }

command -v gcloud >/dev/null || {
  echo "gcloud 가 없다. brew install --cask google-cloud-sdk"; exit 1; }

# ── 사람이 먼저 해야 하는 것 셋을 확인한다 ────────────────────────
missing=0
if ! gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | grep -q .; then
  echo "❌ gcloud 로그인이 안 돼 있다.  gcloud auth login"; missing=1
fi
if [[ -z "$PROJECT" ]]; then
  PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
fi
if [[ -z "$PROJECT" || "$PROJECT" == "(unset)" ]]; then
  echo "❌ GCP 프로젝트가 없다.  gcloud config set project <프로젝트ID>"; missing=1
fi
if [[ "$missing" == "1" ]]; then
  echo ""
  echo "위 항목은 본인 계정·결제라 사람이 직접 해야 한다. docs/DEPLOY.md 를 본다."
  exit 1
fi

IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/pocket/backend:$(git rev-parse --short HEAD)"
SQL_CONN="${PROJECT}:${REGION}:${SQL_INSTANCE}"

say "0/5  쓸 값"
printf '  프로젝트 %s\n  리전     %s\n  이미지   %s\n  Cloud SQL %s\n' \
  "$PROJECT" "$REGION" "$IMAGE" "$SQL_CONN"

say "1/5  필요한 API 를 켠다"
run gcloud services enable run.googleapis.com sqladmin.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com \
  --project="$PROJECT"

say "2/5  이미지를 만들어 올린다"
run gcloud artifacts repositories create pocket --repository-format=docker \
  --location="$REGION" --project="$PROJECT" 2>/dev/null || true
run gcloud builds submit backend --tag="$IMAGE" \
  --project="$PROJECT" --region="$REGION"

say "3/5  스키마를 먼저 올린다 (잡). 기본 카테고리 시드가 여기 딸려 온다"
if gcloud run jobs describe pocket-migrate --region="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
  run gcloud run jobs update pocket-migrate --image="$IMAGE" --region="$REGION" --project="$PROJECT"
else
  run gcloud run jobs create pocket-migrate --image="$IMAGE" --region="$REGION" \
    --project="$PROJECT" --command=alembic --args=upgrade,head \
    --set-secrets=DATABASE_URL=pocket-database-url:latest \
    --set-cloudsql-instances="$SQL_CONN" --set-env-vars=ENVIRONMENT=prod
fi
run gcloud run jobs execute pocket-migrate --region="$REGION" --project="$PROJECT" --wait

say "4/5  리비전을 띄운다"
# mTLS 인증서와 Gemini 키는 Secret Manager 에서 온다. 없으면 기동 자체가 막힌다(의도한 가드).
run gcloud run deploy "$SERVICE" --image="$IMAGE" --region="$REGION" --project="$PROJECT" \
  --allow-unauthenticated \
  --set-cloudsql-instances="$SQL_CONN" \
  --set-secrets=DATABASE_URL=pocket-database-url:latest \
  --set-secrets=/secrets/toss/toss-client.crt=pocket-toss-client-crt:latest \
  --set-secrets=/secrets/toss/toss-client.key=pocket-toss-client-key:latest \
  --set-secrets=GEMINI_API_KEY=pocket-gemini-api-key:latest \
  --set-env-vars=ENVIRONMENT=prod \
  --set-env-vars=LLM_PROVIDER=gemini \
  --set-env-vars=ALLOW_UNVERIFIED_ANON_KEY=false \
  --set-env-vars=ALLOW_PAST_PERIOD_BUDGET_WRITE=false \
  --set-env-vars=TOSS_MTLS_CERT_PATH=/secrets/toss/toss-client.crt \
  --set-env-vars=TOSS_MTLS_KEY_PATH=/secrets/toss/toss-client.key

say "5/5  연기 검사"
if [[ "$DRY" == "1" ]]; then
  echo "  (dry-run 이라 건너뛴다)"; exit 0
fi
BASE="$(gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT" \
  --format='value(status.url)')"
echo "  주소 $BASE"
curl -fsS "$BASE/health"; echo ""
CODE="$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/v1/categories")"
echo "  키 없이 조회 → $CODE  (401 이어야 한다)"
[[ "$CODE" == "401" ]] || { echo "❌ 검증이 꺼진 채로 떴다. 즉시 롤백한다."; exit 1; }

cat <<MSG

────────────────────────────────────────────────
 주소가 고정됐다.  $BASE
 이 주소로 번들을 다시 만들어 콘솔에 올린다:

   cd frontend && VITE_API_BASE_URL="$BASE" VITE_AD_GROUP_ID=<광고그룹ID> npm run build
────────────────────────────────────────────────
MSG
