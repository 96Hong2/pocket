#!/usr/bin/env bash
# 로그인 코드 메일(SMTP)을 켠다. 사람이 해야 하는 것은 **앱 비밀번호 하나뿐**이다.
#
#   ./scripts/enable-login-email.sh <보내는-메일주소>
#
# 앱 비밀번호는 화면에 안 찍히고, 셸 기록에도 안 남고, 파일로도 안 떨어진다.
# 바로 Secret Manager 로 들어간다. 이 스크립트는 그 값을 어디에도 되뿌리지 않는다.
#
# 앱 비밀번호 받는 법(Gmail 기준, 2분):
#   1. 구글 계정 → 보안 → 2단계 인증을 켠다(이미 켜져 있으면 넘어간다)
#   2. https://myaccount.google.com/apppasswords 에서 이름을 아무거나 적고 만든다
#   3. 나오는 16자리를 이 스크립트가 물을 때 붙여 넣는다(띄어쓰기는 있어도 된다)
#
# 왜 사람이 해야 하나: 앱 비밀번호는 그 계정의 자격 증명이다. 만드는 일도 옮기는 일도
# 계정 주인이 해야 하고, 자동화가 대신 쥐고 있을 값이 아니다.
#
# 켜지면 서버가 `email_login_available: true` 로 답하고, 「내 계정」의 「준비 중」이 풀린다.
# 자세한 배경은 docs/SECRETS.md §4.5.
set -euo pipefail
cd "$(dirname "$0")/.."

SENDER="${1:-}"
SECRET="pocket-smtp-password"
HOST="${POCKET_SMTP_HOST:-smtp.gmail.com}"
PORT="${POCKET_SMTP_PORT:-587}"

if [[ -z "$SENDER" ]]; then
  echo "쓰는 법: ./scripts/enable-login-email.sh <보내는-메일주소>" >&2
  exit 2
fi

PROJECT="${POCKET_GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "$PROJECT" ]]; then
  echo "GCP 프로젝트를 못 찾았다. gcloud config set project <프로젝트> 를 먼저 한다." >&2
  exit 1
fi

echo "프로젝트: $PROJECT"
echo "보내는 사람: $SENDER  ($HOST:$PORT)"
echo

if gcloud secrets describe "$SECRET" --project="$PROJECT" >/dev/null 2>&1; then
  echo "시크릿 $SECRET 이 이미 있다. 새 판을 얹는다(옛 판은 남는다)."
  ACTION=(gcloud secrets versions add "$SECRET" --project="$PROJECT" --data-file=-)
else
  echo "시크릿 $SECRET 을 새로 만든다."
  ACTION=(gcloud secrets create "$SECRET" --project="$PROJECT" --replication-policy=automatic --data-file=-)
fi

# -s 로 화면에 안 찍는다. 변수는 이 프로세스 안에서만 살고 gcloud 로 바로 넘어간다.
read -r -s -p "앱 비밀번호 16자리를 붙여 넣고 엔터: " APP_PASSWORD
echo
# 구글이 네 자씩 띄어 보여 준다. 그대로 붙여 넣어도 되게 공백을 턴다.
APP_PASSWORD="${APP_PASSWORD//[[:space:]]/}"
if [[ ${#APP_PASSWORD} -lt 12 ]]; then
  echo "너무 짧다(${#APP_PASSWORD}자). 앱 비밀번호는 16자다. 다시 해 본다." >&2
  exit 1
fi

# 진짜로 붙는지 **먼저** 확인한다. 안 그러면 5분짜리 배포를 마치고 나서야 틀린 것을 안다.
echo "로그인이 되는지 먼저 확인한다…"
SMTP_HOST="$HOST" SMTP_PORT="$PORT" SMTP_USER="$SENDER" SMTP_PASSWORD="$APP_PASSWORD" \
  python3 - <<'PY'
import os
import smtplib
import sys

host = os.environ["SMTP_HOST"]
port = int(os.environ["SMTP_PORT"])
try:
    with smtplib.SMTP(host, port, timeout=15) as client:
        client.starttls()
        client.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
except smtplib.SMTPAuthenticationError:
    print("  로그인이 거절됐다. 2단계 인증이 켜져 있는지, 앱 비밀번호를 그 계정에서 만들었는지 본다.", file=sys.stderr)
    sys.exit(1)
except OSError as error:
    print(f"  {host}:{port} 에 못 붙었다: {error}", file=sys.stderr)
    sys.exit(1)
print("  붙었다.")
PY

printf '%s' "$APP_PASSWORD" | "${ACTION[@]}" >/dev/null
unset APP_PASSWORD
echo "시크릿에 넣었다."
echo

echo "이제 배포한다. 배포 스크립트가 시크릿이 있을 때만 SMTP 를 붙인다."
POCKET_SMTP_HOST="$HOST" POCKET_SMTP_PORT="$PORT" POCKET_SMTP_USER="$SENDER" \
  ./scripts/deploy-cloudrun.sh

echo
echo "끝났다. 「내 계정」의 「준비 중」이 풀렸는지 실기기에서 확인한다."
echo "다음 배포부터도 같은 환경변수를 줘야 한다. 안 주면 --set-secrets 가 통째로 갈아 끼우며 떨어진다:"
echo "  POCKET_SMTP_HOST=$HOST POCKET_SMTP_USER=$SENDER ./scripts/deploy-cloudrun.sh"
