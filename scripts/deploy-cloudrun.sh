#!/usr/bin/env bash
# Cloud Run 에 백엔드를 올린다. 임시 터널을 끝내고 주소를 고정하는 것이 목적이다.
#
#   ./scripts/deploy-cloudrun.sh            # 준비물 → 이미지 → 마이그레이션 → 리비전 → 연기 검사
#   ./scripts/deploy-cloudrun.sh --dry-run  # 무엇을 할지만 찍는다
#
# 처음 한 번은 사람이 해야 하는 것이 셋 있다. 없으면 여기서 멈추고 무엇이 없는지 말한다.
#   1. gcloud auth login          브라우저 로그인
#   2. GCP 프로젝트 + 결제 활성화  결제가 열려 있지 않으면 Cloud Run·Cloud SQL 이 안 켜진다
#   3. 토스 mTLS 인증서 + 개인키   운영에서는 이게 없으면 서버가 기동조차 못 한다(의도한 가드)
#
# 나머지(Cloud SQL 인스턴스, 시크릿 넷, 서비스 계정 권한)는 이 스크립트가 없으면 만든다.
# 이미 있으면 건드리지 않으므로 몇 번을 다시 돌려도 된다.
#
# 자세한 배경은 docs/DEPLOY.md 를 본다.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="${POCKET_GCP_PROJECT:-}"
REGION="${POCKET_GCP_REGION:-asia-northeast3}"
SQL_INSTANCE="${POCKET_SQL_INSTANCE:-pocket-sql}"
SQL_TIER="${POCKET_SQL_TIER:-db-f1-micro}"
# 로컬과 같은 판으로 맞춘다. 리전에서 아직 안 되면 POCKET_SQL_VERSION=POSTGRES_17 로 내린다.
SQL_VERSION="${POCKET_SQL_VERSION:-POSTGRES_18}"
MTLS_DIR="${POCKET_MTLS_DIR:-$HOME/.config/pocket/mtls}"
GEMINI_KEY_FILE="${POCKET_GEMINI_KEY_FILE:-}"
SERVICE="pocket-backend"
DB_NAME=pocket
DB_USER=pocket
DRY=0
[[ "${1:-}" == "--dry-run" ]] && DRY=1

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
run() { if [[ "$DRY" == "1" ]]; then printf '  $ %s\n' "$*"; else "$@"; fi; }
skip() { printf '  이미 있다: %s\n' "$*"; }

command -v gcloud >/dev/null || {
  echo "gcloud 가 없다. brew install --cask google-cloud-sdk"; exit 1; }

# ── 사람이 먼저 해야 하는 것을 확인한다 ──────────────────────────
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

# 결제는 「등록했다」와 「열렸다」가 다르다. 선불 입금이 안 끝나면 계정이 닫힌 채로 있고,
# 그 상태에서는 1/6 의 API 켜기부터 권한 오류로 죽는다. 여기서 먼저 가른다.
if [[ -n "$PROJECT" && "$PROJECT" != "(unset)" ]]; then
  BILLING_OPEN="$(gcloud beta billing projects describe "$PROJECT" \
    --format='value(billingEnabled)' 2>/dev/null || echo "")"
  if [[ "$BILLING_OPEN" != "True" ]]; then
    echo "❌ 이 프로젝트에 열려 있는 결제 계정이 없다."
    echo "   콘솔 결제 화면에서 상태를 본다: https://console.cloud.google.com/billing"
    missing=1
  fi
fi

if [[ ! -f "$MTLS_DIR/pocketLedgerProd01_public.crt" || ! -f "$MTLS_DIR/pocketLedgerProd01_private.key" ]]; then
  echo "❌ mTLS 인증서가 $MTLS_DIR 에 없다. 콘솔에서 받아 그 자리에 둔다."
  missing=1
fi

# dry-run 은 「무엇을 할지」를 보는 자리다. 준비물이 덜 됐어도 계획은 찍어 준다.
if [[ "$missing" == "1" ]]; then
  echo ""
  echo "위 항목은 본인 계정·결제라 사람이 직접 해야 한다. docs/DEPLOY.md 를 본다."
  [[ "$DRY" == "1" ]] || exit 1
  echo "(dry-run 이라 계획만 이어서 찍는다)"
fi

IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/pocket/backend:$(git rev-parse --short HEAD)"
SQL_CONN="${PROJECT}:${REGION}:${SQL_INSTANCE}"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)' 2>/dev/null || echo '<번호>')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

say "0/6  쓸 값"
printf '  프로젝트 %s\n  리전     %s\n  이미지   %s\n  Cloud SQL %s (%s, %s)\n' \
  "$PROJECT" "$REGION" "$IMAGE" "$SQL_CONN" "$SQL_VERSION" "$SQL_TIER"

say "1/6  필요한 API 를 켠다"
run gcloud services enable run.googleapis.com sqladmin.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com \
  --project="$PROJECT"

say "2/6  데이터베이스와 시크릿을 만든다 (없을 때만)"
have_secret() {
  gcloud secrets describe "$1" --project="$PROJECT" >/dev/null 2>&1
}
put_secret() {  # 이름, 값을 담은 파일
  if have_secret "$1"; then skip "시크릿 $1"; return; fi
  if [[ "$DRY" == "1" ]]; then
    printf '  $ gcloud secrets create %s --data-file=%s\n' "$1" "$2"; return
  fi
  gcloud secrets create "$1" --replication-policy=automatic \
    --data-file="$2" --project="$PROJECT" >/dev/null
  printf '  만들었다: 시크릿 %s\n' "$1"
}

if gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT" >/dev/null 2>&1; then
  skip "Cloud SQL 인스턴스 $SQL_INSTANCE"
else
  # 10분쯤 걸린다. 가장 작은 등급으로 만든다. 나중에 키우는 건 되지만 줄이는 건 안 된다.
  run gcloud sql instances create "$SQL_INSTANCE" \
    --database-version="$SQL_VERSION" --tier="$SQL_TIER" --region="$REGION" \
    --storage-size=10 --storage-auto-increase --project="$PROJECT"
fi

if gcloud sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE" \
     --project="$PROJECT" >/dev/null 2>&1; then
  skip "데이터베이스 $DB_NAME"
else
  run gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE" --project="$PROJECT"
fi

# 접속 문자열은 통째로 시크릿 하나에 담는다. 비밀번호를 따로 두면 두 곳이 어긋난다.
if have_secret pocket-database-url; then
  skip "시크릿 pocket-database-url"
elif [[ "$DRY" == "1" ]]; then
  printf '  $ gcloud sql users set-password %s --instance=%s (무작위 생성)\n' "$DB_USER" "$SQL_INSTANCE"
  printf '  $ gcloud secrets create pocket-database-url --data-file=-\n'
else
  DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"
  if gcloud sql users list --instance="$SQL_INSTANCE" --project="$PROJECT" \
       --format='value(name)' | grep -qx "$DB_USER"; then
    gcloud sql users set-password "$DB_USER" --instance="$SQL_INSTANCE" \
      --password="$DB_PASSWORD" --project="$PROJECT" >/dev/null
  else
    gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" \
      --password="$DB_PASSWORD" --project="$PROJECT" >/dev/null
  fi
  # Cloud Run 은 유닉스 소켓으로 붙는다. host 를 쿼리로 넘기는 것이 psycopg 의 방식이다.
  printf 'postgresql+psycopg://%s:%s@/%s?host=/cloudsql/%s' \
    "$DB_USER" "$DB_PASSWORD" "$DB_NAME" "$SQL_CONN" \
    | gcloud secrets create pocket-database-url --replication-policy=automatic \
        --data-file=- --project="$PROJECT" >/dev/null
  unset DB_PASSWORD
  echo "  만들었다: 시크릿 pocket-database-url"
fi

put_secret pocket-toss-client-crt "$MTLS_DIR/pocketLedgerProd01_public.crt"
put_secret pocket-toss-client-key "$MTLS_DIR/pocketLedgerProd01_private.key"

# Gemini 키는 아직 없어도 뜬다. 없으면 문장 읽기가 stub 으로 돌 뿐이다.
USE_GEMINI=0
if [[ -n "$GEMINI_KEY_FILE" ]]; then
  put_secret pocket-gemini-api-key "$GEMINI_KEY_FILE"
  USE_GEMINI=1
elif have_secret pocket-gemini-api-key; then
  skip "시크릿 pocket-gemini-api-key"
  USE_GEMINI=1
else
  echo "  건너뛴다: Gemini 키가 없다. 문장 읽기는 stub 으로 뜬다."
  echo "  나중에 키가 생기면:  POCKET_GEMINI_KEY_FILE=<키가 담긴 파일> ./scripts/deploy-cloudrun.sh"
fi

say "3/6  런타임 서비스 계정에 시크릿 읽기 권한을 준다"
run gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role=roles/secretmanager.secretAccessor --condition=None

say "4/6  이미지를 만들어 올린다"
run gcloud artifacts repositories create pocket --repository-format=docker \
  --location="$REGION" --project="$PROJECT" 2>/dev/null || true
run gcloud builds submit backend --tag="$IMAGE" \
  --project="$PROJECT" --region="$REGION"

say "5/6  스키마를 먼저 올린다 (잡). 기본 카테고리 시드가 여기 딸려 온다"
if gcloud run jobs describe pocket-migrate --region="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
  run gcloud run jobs update pocket-migrate --image="$IMAGE" --region="$REGION" --project="$PROJECT"
else
  run gcloud run jobs create pocket-migrate --image="$IMAGE" --region="$REGION" \
    --project="$PROJECT" --command=alembic --args=upgrade,head \
    --set-secrets=DATABASE_URL=pocket-database-url:latest \
    --set-cloudsql-instances="$SQL_CONN" --set-env-vars=ENVIRONMENT=prod
fi
run gcloud run jobs execute pocket-migrate --region="$REGION" --project="$PROJECT" --wait

say "6/6  리비전을 띄운다"
# mTLS 인증서는 Secret Manager 에서 파일로 마운트한다. 없으면 기동 자체가 막힌다(의도한 가드).
deploy_args=(
  --image="$IMAGE" --region="$REGION" --project="$PROJECT"
  --allow-unauthenticated
  --set-cloudsql-instances="$SQL_CONN"
  --set-env-vars=ENVIRONMENT=prod
  --set-env-vars=ALLOW_UNVERIFIED_ANON_KEY=false
  --set-env-vars=ALLOW_PAST_PERIOD_BUDGET_WRITE=false
  --set-env-vars=TOSS_MTLS_CERT_PATH=/secrets/toss/toss-client.crt
  --set-env-vars=TOSS_MTLS_KEY_PATH=/secrets/toss/toss-client.key
  --set-secrets=DATABASE_URL=pocket-database-url:latest
  --set-secrets=/secrets/toss/toss-client.crt=pocket-toss-client-crt:latest
  --set-secrets=/secrets/toss/toss-client.key=pocket-toss-client-key:latest
)
if [[ "$USE_GEMINI" == "1" ]]; then
  deploy_args+=(
    --set-env-vars=LLM_PROVIDER=gemini
    --set-secrets=GEMINI_API_KEY=pocket-gemini-api-key:latest
  )
fi
run gcloud run deploy "$SERVICE" "${deploy_args[@]}"

say "연기 검사"
if [[ "$DRY" == "1" ]]; then
  echo "  (dry-run 이라 건너뛴다)"; exit 0
fi
BASE="$(gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT" \
  --format='value(status.url)')"
echo "  주소 $BASE"
curl -fsS "$BASE/health"; echo ""
# 작은 응답만 오가는 고장을 여기서도 거른다. 목록은 1.8KB 라 크기까지 본다.
SIZE="$(curl -sS -o /dev/null -w '%{size_download}' -H 'X-Anon-Key: deploy-smoke' "$BASE/api/v1/categories")"
echo "  키를 넣고 목록 조회 → ${SIZE}바이트"
[[ "$SIZE" -gt 1000 ]] || { echo "❌ 목록이 안 온다. 리비전 로그를 본다."; exit 1; }
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
