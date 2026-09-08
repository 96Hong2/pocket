# 배포

서버가 **어디에 어떻게 뜨는지** 적는다. 비밀값을 어디서 받아 어디에 넣는지는 `SECRETS.md` 가 맡는다.

정리하면 이렇다. 이미지를 만들고, 스키마를 먼저 올리고, 그다음에 새 리비전을 띄운다.
순서를 바꾸면 새 코드가 없는 컬럼을 읽는다.

```
빌드 → 푸시 → 마이그레이션 잡 → 리비전 배포 → 연기 검사
```

---

## 1. 무엇이 어디에 뜨나

| 조각 | 어디 | 무엇으로 |
|---|---|---|
| 백엔드 | Cloud Run 서비스 `pocket-backend` | `docker/backend/Dockerfile` |
| 스키마 올리기 | Cloud Run 잡 `pocket-migrate` | 같은 이미지, 명령만 다르다 |
| 데이터베이스 | Cloud SQL for PostgreSQL 18 | 아래 §3 |
| 프론트 | 앱인토스 콘솔에 올리는 번들 | `npm run build:web` 산출물 |

프론트는 우리가 서버를 띄우지 않는다. 앱인토스가 호스팅한다.
그래서 배포라고 부를 것은 백엔드와 데이터베이스뿐이다.

---

## 2. 이미지

빌드 맥락은 `backend/` 다. `docker/backend/Dockerfile` 은 그 밖에 있으므로 `-f` 로 가리킨다.

```bash
# 로컬에서 한 번 띄워 보기 (DB 는 compose 의 pocket-db 를 그대로 쓴다)
docker build -f docker/backend/Dockerfile -t pocket-backend:local backend
docker run --rm -p 8080:8080 \
  -e ENVIRONMENT=local \
  -e ALLOW_UNVERIFIED_ANON_KEY=true \
  -e DATABASE_URL='postgresql+psycopg://pocket:pocket@host.docker.internal:5434/pocket' \
  pocket-backend:local
curl -sS localhost:8080/health
```

`make image` · `make image-run` 이 위 두 줄을 대신한다.

이미지가 지키는 것 셋이다.

- **포트를 박지 않는다.** Cloud Run 이 `PORT` 를 준다. 우리가 고른 값을 박으면 그 리비전은
  트래픽을 못 받고, 로그에는 아무 오류도 안 남는다
- **루트로 안 돈다.** `uid 10001` 의 `pocket` 사용자로 돈다
- **검증 코드와 비밀값이 안 들어간다.** `backend/.dockerignore` 가 `tests/`·`.env`·`*.key` 를 뺀다.
  이미지 레이어에 한 번 들어간 값은 나중에 지워도 히스토리에 남는다

---

## 3. 데이터베이스

Cloud SQL 인스턴스 하나에 데이터베이스 `pocket` 하나. 접속 주소는 Secret Manager 에 넣고
`DATABASE_URL` 로 준다. 저장소에 적지 않는다.

```bash
gcloud secrets create pocket-database-url --replication-policy=automatic
printf '%s' 'postgresql+psycopg://<user>:<password>@/<db>?host=/cloudsql/<연결이름>' \
  | gcloud secrets versions add pocket-database-url --data-file=-
```

- 드라이버는 `psycopg` 다. `postgresql://` 로 시작하는 주소를 그대로 넣으면 SQLAlchemy 가
  다른 드라이버를 찾는다. **`postgresql+psycopg://` 로 적는다**
- Cloud Run 에서는 유닉스 소켓(`/cloudsql/...`)으로 붙는다. `--add-cloudsql-instances` 를 함께 준다

---

## 4. 스키마 올리기

**부팅할 때 올리지 않는다.** Cloud Run 은 인스턴스를 여럿 띄우고, 그 인스턴스가 동시에
`alembic upgrade` 를 부르면 같은 마이그레이션이 겹쳐 돈다. 그래서 잡으로 뗀다.

```bash
gcloud run jobs create pocket-migrate \
  --image=<이미지> \
  --command=alembic --args=upgrade,head \
  --set-secrets=DATABASE_URL=pocket-database-url:latest \
  --set-cloudsql-instances=<연결이름> \
  --set-env-vars=ENVIRONMENT=prod

# 배포할 때마다
gcloud run jobs update pocket-migrate --image=<새 이미지>
gcloud run jobs execute pocket-migrate --wait
```

- **기본 카테고리 시드가 여기서 함께 들어간다.** 별도 단계가 아니다.
  `20260903_1200_..._seed_default_categories.py` 가 마이그레이션이라 `upgrade head` 에 딸려 온다
- 잡이 실패하면 **거기서 멈춘다.** 다음 단계로 넘어가지 않는다. `--wait` 가 그것을 보장한다

---

## 5. 리비전 배포

```bash
gcloud run deploy pocket-backend \
  --image=<이미지> \
  --region=<리전> \
  --set-cloudsql-instances=<연결이름> \
  --set-secrets=DATABASE_URL=pocket-database-url:latest \
  --set-secrets=/secrets/toss/toss-client.crt=pocket-toss-client-crt:latest \
  --set-secrets=/secrets/toss/toss-client.key=pocket-toss-client-key:latest \
  --set-secrets=LLM_API_KEY=pocket-llm-api-key:latest \
  --set-env-vars=ENVIRONMENT=prod \
  --set-env-vars=ALLOW_UNVERIFIED_ANON_KEY=false \
  --set-env-vars=ALLOW_PAST_PERIOD_BUDGET_WRITE=false \
  --set-env-vars=TOSS_MTLS_CERT_PATH=/secrets/toss/toss-client.crt \
  --set-env-vars=TOSS_MTLS_KEY_PATH=/secrets/toss/toss-client.key
```

### 잘못된 설정이 트래픽을 못 받게 해 뒀다

`create_app()` 이 **기동할 때** 익명키 검증기를 만든다. 인증서 없이 `ENVIRONMENT=prod` 로 뜨면
그 자리에서 죽는다. Cloud Run 은 기동 못 한 리비전에 트래픽을 안 보낸다. 앞 리비전이 그대로 산다.

검증기를 요청 시점에 만들었다면 `/health` 는 200 이라 배포가 성공으로 보이고, 진짜 사용자만
500 을 본다. 그래서 일부러 기동 시점으로 옮겼다.

같은 이유로 이 둘도 기동을 막는다.

- `ENVIRONMENT != local` 인데 `ALLOW_UNVERIFIED_ANON_KEY=true`
- `ENVIRONMENT != local` 인데 `ALLOW_PAST_PERIOD_BUDGET_WRITE=true`

`backend/tests/api/test_boot_guards.py` 가 이 셋을 지킨다.

### 기록 알림 잡

알림은 웹 서비스가 아니라 **1분마다 도는 잡**이 보낸다. 판정이 '정한 시각과 같은 분' 이라
더 뜸하게 부르면 그 사이에 든 시각은 그 날 아예 안 간다(ADR-0013).

```bash
gcloud run jobs create pocket-reminders \
  --image=<이미지> \
  --command=python --args=scripts/send_reminders.py \
  --set-secrets=DATABASE_URL=pocket-database-url:latest \
  --set-cloudsql-instances=<연결이름> \
  --set-env-vars=ENVIRONMENT=prod
# Cloud Scheduler 가 1분마다 이 잡을 실행하게 건다
```

- **아직 실제로 알림을 쏘지 않는다.** 붙어 있는 발송기가 로그 스텁이라, 지금 이 잡을 걸면
  '누구에게 보낼 차례였다' 는 줄만 남는다. 토스 발송 API 가 열리면 어댑터 하나를 더 만든다
- 대상만 세어 보려면 `--args=scripts/send_reminders.py,--dry-run` 으로 한 번 돌린다

---

## 6. 배포 뒤 연기 검사

```bash
BASE=<서비스 URL>
curl -fsS "$BASE/health"                       # {"status":"ok","environment":"prod"}
curl -fsS -o /dev/null -w '%{http_code}\n' "$BASE/api/v1/categories"   # 401  (키 없이 부른 것)
```

`/health` 만 보고 끝내지 않는다. 그건 앱이 떴다는 말이지 **인증이 산다는 말이 아니다.**
키 없이 부른 조회가 200 이면 검증이 꺼진 채로 떴다는 뜻이라 즉시 롤백한다.

---

## 7. 롤백

```bash
gcloud run revisions list --service=pocket-backend
gcloud run services update-traffic pocket-backend --to-revisions=<이전 리비전>=100
```

**스키마는 같이 안 돌아간다.** 컬럼을 지우거나 이름을 바꾸는 마이그레이션은 앞 리비전을 깨뜨린다.
그래서 지우는 변경은 두 번에 나눠 넣는다: 먼저 안 쓰게 만들어 배포하고, 다음 배포에서 지운다.

---

## 8. 백업과 복구

자동 백업을 켜 두는 것은 백업이 있다는 말이 아니다. **한 번은 실제로 복원해 봐야** 있다고 말할 수 있다.

```bash
# 켜기
gcloud sql instances patch <인스턴스> --backup-start-time=18:00 --retained-backups-count=14
gcloud sql instances patch <인스턴스> --enable-point-in-time-recovery
```

### 복원 연습 (분기에 한 번)

운영 인스턴스에 덮어쓰지 않는다. **새 인스턴스로 복원해서 확인하고 지운다.**

```bash
gcloud sql backups list --instance=<인스턴스>
gcloud sql instances clone <인스턴스> pocket-restore-check \
  --point-in-time='<복원 시각>'
```

복원본에 붙어 `backend/scripts/check_restore.py` 를 돌린다. 표가 다 있는지, 마이그레이션
버전이 최신인지, 기본 카테고리 11개가 있는지, 거래 수가 0 이 아닌지를 본다.
하나라도 어긋나면 0 이 아닌 코드로 끝난다.

```bash
DATABASE_URL='postgresql+psycopg://...복원본...' uv run python scripts/check_restore.py
gcloud sql instances delete pocket-restore-check      # 확인이 끝나면 지운다
```

확인한 날짜를 이 문서 아래에 적는다. 적혀 있지 않으면 안 해 본 것이다.

| 확인한 날 | 복원 시점 | 결과 |
|---|---|---|
| (아직 없음) | | |

---

## 9. 실기기 테스트 (운영 서버가 서기 전)

Cloud Run 이 아직 없어도 실기기에서 한 번 돌려 볼 수 있다. 토스 앱이 우리 백엔드를
**공개 https 주소**로 부르므로, 이 맥의 백엔드를 임시 터널로 잠깐 연다.

```bash
make serve-public                    # 주소를 찍는다. 창을 닫으면 사라진다
make ait API_BASE_URL=https://<위에서 받은 주소>
# frontend/pocket-ledger.ait 를 콘솔에 올리고 QR 로 연다
```

지켜야 하는 것 셋.

- **http 주소로는 못 만든다.** 운영 번들은 https 만 받는다(`frontend/src/shared/api/baseUrl.ts`).
  토스 앱이 http 요청을 차단해서, 통과시키면 실기기에서 모든 조회가 조용히 실패한다
- **CORS 는 이미 열어 뒀다.** `pocket-ledger.apps.tossmini.com`(실서비스)과
  `pocket-ledger.private-apps.tossmini.com`(콘솔 QR)이 기본값에 있다. `appName` 을 바꾸면 여기도 바꾼다.
  3.x 번들이 2.x origin 으로 서비스되고 있어 `web.tossmini.com` 쪽도 함께 열어 뒀다
- **이 서버는 익명 식별키를 검증하지 않는다.** mTLS 인증서가 없어서다. 주소를 아는 사람은
  아무 키나 보내 남의 기록을 볼 수 있다. **테스트가 끝나면 반드시 끈다.** 오래 켜 두지 않는다

샌드박스 앱으로는 못 한다. SDK 3.x 는 샌드박스 앱을 제공하지 않는다(공식 문서 「테스트앱(샌드박스)」).
브라우저 devtools 목이 그 자리를 대신하고, 실기기는 콘솔 QR 하나뿐이다.

## 10. 배포 전 점검표

- [ ] `make check` 초록 (린트·타입·단위)
- [ ] `make e2e` 초록
- [ ] `docs/openapi.json` 과 `frontend/src/shared/api/schema.gen.ts` 에 차이 없음
- [ ] 마이그레이션 잡이 먼저 끝났다
- [ ] `ENVIRONMENT=prod`, 두 스위치 모두 `false`
- [ ] 인증서 마운트 경로와 `TOSS_MTLS_*_PATH` 가 같다
- [ ] 프론트 빌드에 운영 `VITE_AD_GROUP_ID` 가 들어갔다 (개발 중 테스트 ID 로 뜨면 정책 위반)
- [ ] 배포 뒤 연기 검사 두 줄을 실제로 돌렸다
- [ ] 콘솔 로고·스크린샷·문안이 최신인가 (`docs/store/`)
