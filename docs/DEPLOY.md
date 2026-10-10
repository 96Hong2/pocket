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

아래 명령은 `scripts/deploy-cloudrun.sh` 가 대신 한다. 인스턴스·데이터베이스·사용자·시크릿이
없을 때만 만들고, 있으면 건드리지 않는다. 비밀번호는 스크립트가 무작위로 만들어 접속 주소째로
시크릿에 넣으므로 사람이 어디에도 적지 않는다. 손으로 할 때만 아래를 쓴다.

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
  --set-secrets=/secrets/toss-crt/toss-client.crt=pocket-toss-client-crt:latest \
  --set-secrets=/secrets/toss-key/toss-client.key=pocket-toss-client-key:latest \
  --set-secrets=OPENAI_API_KEY=pocket-openai-api-key:latest \
  --set-env-vars=ENVIRONMENT=prod \
  --set-env-vars=LLM_PROVIDER=openai \
  --set-env-vars=ALLOW_UNVERIFIED_ANON_KEY=false \
  --set-env-vars=ALLOW_PAST_PERIOD_BUDGET_WRITE=false \
  --set-env-vars=TOSS_MTLS_CERT_PATH=/secrets/toss-crt/toss-client.crt \
  --set-env-vars=TOSS_MTLS_KEY_PATH=/secrets/toss-key/toss-client.key
```

인증서와 개인키는 **폴더를 따로 쓴다.** Cloud Run 은 시크릿 한 건을 폴더 하나로 붙이는 구조라,
같은 폴더에 둘을 적으면 「다른 시크릿이 이미 붙어 있다」며 배포가 통째로 실패한다.

모델 키가 아직 없으면 마지막 두 줄(`OPENAI_API_KEY`·`LLM_PROVIDER`)을 빼고 띄운다.
`LLM_PROVIDER` 기본값이 `stub` 이라 서버는 정상으로 뜨고, 문장으로 적기만 가짜 응답이 된다.
키가 생기면 시크릿을 만들고 두 줄을 붙여 다시 배포한다.

### 잘못된 설정이 트래픽을 못 받게 해 뒀다

`create_app()` 이 **기동할 때** 익명키 검증기를 만든다. 인증서 없이 `ENVIRONMENT=prod` 로 뜨면
그 자리에서 죽는다. Cloud Run 은 기동 못 한 리비전에 트래픽을 안 보낸다. 앞 리비전이 그대로 산다.

검증기를 요청 시점에 만들었다면 `/health` 는 200 이라 배포가 성공으로 보이고, 진짜 사용자만
500 을 본다. 그래서 일부러 기동 시점으로 옮겼다.

같은 이유로 이 셋도 기동을 막는다.

- `ENVIRONMENT != local` 인데 `ALLOW_UNVERIFIED_ANON_KEY=true`
- `ENVIRONMENT != local` 인데 `ALLOW_PAST_PERIOD_BUDGET_WRITE=true`
- `LLM_PROVIDER=gemini`(또는 `openai`) 인데 그 키가 비어 있음

`backend/tests/api/test_boot_guards.py` 가 이 넷을 지킨다.

### 사진 본문과 메모리

사진을 받는 세 길(`/imports/capture`, `/imports/receipt`, `/assets/capture`)은 본문이 크고,
그 본문을 풀고 디코드하는 메모리가 인스턴스 메모리를 가장 많이 쓴다. 메모리를 넘기면 컨테이너째
내려가고, 그 인스턴스에서 처리 중이던 다른 사용자 요청도 함께 실패한다.

**지금 운영 값(2026-10-10 읽음)**

| 항목 | 값 | 어디서 정해지나 |
| --- | --- | --- |
| 최대 인스턴스 수(maxScale) | 3 | 서비스 설정 |
| 인스턴스 하나가 동시에 받는 요청(concurrency) | 80 | Cloud Run 기본값 |
| 인스턴스 메모리 | 512Mi | Cloud Run 기본값 |

`scripts/deploy-cloudrun.sh` 와 `cloudbuild.yaml` 에 `--memory`, `--concurrency` 가 없어서 기본값으로 뜬다.
지금 값은 이렇게 읽는다.

```bash
gcloud run services describe pocket-backend --region=<리전> \
  --format='value(spec.template.metadata.annotations."autoscaling.knative.dev/maxScale",spec.template.spec.containerConcurrency,spec.template.spec.containers[0].resources.limits.memory)'
```

**서버가 이미 묶는 것**

- 본문 크기: 사진 세 길은 12MB, 나머지 길은 1MB 를 넘으면 읽기 전에(또는 읽는 도중에) 413 이다.
- 사진 세 길은 본문을 읽기 전에 익명키를 토스에 확인한다. 틀린 키는 401 이라 본문을 한 바이트도
  읽지 않는다. 확인된 키는 10분 기억하므로 정상 사용자에게 늘어나는 지연은 없다.
- 확인된 키 하나로 동시에 받는 사진 본문은 2개까지다. 세 번째는 앞의 본문을 다 받을 때까지 기다린다.
- 본문을 다 받기까지 70초 마감이 있다. 넘기면 408 이다.
- 사진 다듬기는 동시에 2장, 줄여 풀 수 없는 큰 그림은 한 번에 1장만 푼다. 가장 큰 경우
  (1080x46000 투명 PNG)가 한 장에 약 200MB 를 잡는다(별도 프로세스에서 잰 ru_maxrss 증가분).

**묶지 않는 것:** 서로 다른 진짜 키 여럿이 한꺼번에 보내는 큰 본문. 인스턴스 하나에 사진 요청이
몰리면 본문을 푸는 메모리와 큰 그림 한 장(약 200MB)이 겹친다. 512Mi 에서는 여유가 크지 않다.

**검토안(아직 하지 않음)**

1. **메모리를 명시한다**(`--memory=1Gi`). 큰 그림 한 장과 동시 요청 여럿이 겹쳐도 버틴다.
   배포 명령에 적어 두면 콘솔에서 바꾼 값이 다음 배포 때 되돌아가지 않는다. 대신 인스턴스가 떠 있는
   시간만큼 메모리 요금이 두 배가 된다.
2. **동시 요청 수를 낮춘다**(예: `--concurrency=20~40`). 인스턴스 하나에 몰리는 사진 요청이 줄어
   메모리 부족 위험이 준다. 대신 같은 트래픽에 인스턴스가 더 뜨고, maxScale 3 에 먼저 닿는다.
   세 대가 모두 차면 Cloud Run 이 요청을 잠깐 줄 세웠다가 429 로 돌려보내므로 정상 사용자가
   오류를 볼 수 있다. 낮출 때는 maxScale 도 함께 올린다. 콜드 스타트도 잦아진다.
3. **Cloud Armor 를 앞에 둔다**(외부 HTTPS 부하분산기 + IP 마다 속도 제한 규칙). 앱에 닿기 전에
   몰아치는 요청을 끊는다. 대신 부하분산기와 보안 정책 요금이 고정으로 붙고, 도메인과 인증서를
   부하분산기로 옮겨야 한다. `X-Forwarded-For` 끝에 부하분산기 주소가 하나 더 붙으므로
   `backend/app/api/client_key.py` 가 끝에서 두 번째 값을 보도록 고쳐야 한다(6장 확인 순서).

셋 중 1번이 가장 싸고 화면에 보이는 변화가 없다. 2번과 3번은 트래픽과 비용을 본 뒤에 정한다.

### 기록 알림 잡

알림은 웹 서비스가 아니라 **1분마다 도는 잡**이 보낸다. 판정이 '정한 시각과 같은 분' 이라
더 뜸하게 부르면 그 사이에 든 시각은 그 날 아예 안 간다(ADR-0013).

**`scripts/deploy-cloudrun.sh` 의 7/7 단계가 이것을 한다.** 잡이 없으면 만들고 있으면 서비스와
같은 이미지로 갱신하며, Cloud Scheduler API 를 켜고 `pocket-reminders-tick`(매분)을 한 번 만든다.
`POCKET_REMINDER_TEMPLATE_CODE` 로 발송 코드를 바꿀 수 있고(기본 `pocket-ledger-remind`), 비우면
알림 잡을 건드리지 않는다. 손으로 할 때의 명령은 아래다.

⚠ 2026-09-14 까지 이 잡이 **한 번도 배포된 적이 없었다.** 코드는 #30(09-11)에 들어갔지만 배포
스크립트에 단계가 없어, 알림을 켜고 시각을 정해도 아무것도 안 갔다. 사용자가 「알림이 안 온다」
고 신고해서 찾았다. 잡이 살아 있는지는 `gcloud run jobs executions list --job=pocket-reminders`
로 본다. 매분 한 줄씩 쌓여야 정상이다.

```bash
gcloud run jobs create pocket-reminders \
  --image=<이미지> \
  --region=asia-northeast3 \
  --command=python --args=scripts/send_reminders.py \
  --set-secrets=DATABASE_URL=pocket-database-url:latest \
  --set-secrets=/secrets/toss-crt/toss-client.crt=pocket-toss-client-crt:latest \
  --set-secrets=/secrets/toss-key/toss-client.key=pocket-toss-client-key:latest \
  --set-cloudsql-instances=<연결이름> \
  --set-env-vars=ENVIRONMENT=prod \
  --set-env-vars=TOSS_MTLS_CERT_PATH=/secrets/toss-crt/toss-client.crt \
  --set-env-vars=TOSS_MTLS_KEY_PATH=/secrets/toss-key/toss-client.key \
  --set-env-vars=TOSS_REMINDER_TEMPLATE_SET_CODE=<발송 코드> \
  --max-retries=0
```

```bash
# 1분마다 이 잡을 실행한다. 판정이 '같은 분' 이라 이보다 뜸하면 그 시각은 그 날 안 간다.
gcloud scheduler jobs create http pocket-reminders-tick \
  --location=asia-northeast3 \
  --schedule="* * * * *" \
  --uri="https://asia-northeast3-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/<프로젝트>/jobs/pocket-reminders:run" \
  --http-method=POST \
  --oauth-service-account-email=<잡을 실행할 서비스 계정>
```

- **`--max-retries=0` 을 빼지 않는다.** Cloud Run 기본값은 3회 재시도다. 잡이 비정상 종료하면
  같은 분에 최대 네 번 돌고, 그때마다 아직 보낸 표시가 안 남은 사람에게 알림이 다시 간다.
  「두 번 울리는 쪽이 더 나쁘다」(ADR-0017)와 정면으로 부딪힌다
- **인증서를 웹 서비스와 똑같이 붙여야 한다.** 스마트발송도 익명키 검증과 같은 mTLS 를 탄다.
  인증서와 개인키는 폴더를 따로 쓴다(위 5절과 같은 이유)
- **`TOSS_REMINDER_TEMPLATE_SET_CODE` 가 비면 알림이 안 간다.** 잡은 정상 종료하고 로그에
  「로그 스텁으로 돈다」 한 줄만 남는다. 코드는 있는데 인증서가 없으면 잡이 **실패한다**(종료코드 2)
- 이 값은 프론트의 `VITE_NOTIFICATION_TEMPLATE_CODE` 와 **같은 값**이다. 동의를 받은 그 템플릿으로
  보내야 한다. 둘이 어긋나면 동의는 받았는데 발송이 0통이 된다
- 대상만 세어 보려면 `--args=scripts/send_reminders.py,--dry-run` 으로 한 번 돌린다
  (이때는 인증서도 템플릿 코드도 안 본다)

---

## 6. 배포 뒤 연기 검사

```bash
BASE=<서비스 URL>
curl -fsS "$BASE/health"                       # {"status":"ok","environment":"prod"}
curl -fsS -o /dev/null -w '%{http_code}\n' "$BASE/api/v1/categories"   # 401  (키 없이 부른 것)
```

`/health` 만 보고 끝내지 않는다. 그건 앱이 떴다는 말이지 **인증이 산다는 말이 아니다.**
키 없이 부른 조회가 200 이면 검증이 꺼진 채로 떴다는 뜻이라 즉시 롤백한다.

### 틀린 익명키 문을 막기로 바꾸기 전에 (`ANON_KEY_FAILURE_GUARD`)

한 IP 에서 틀린 익명키가 1분에 60번을 넘으면 서버가 그 IP 를 알아본다. 기본값 `log` 는
**막지 않고** 경고 로그 한 줄만 남긴다. `enforce` 로 바꾸면 토스에 묻지 않고 429 로 막는다.

IP 는 `X-Forwarded-For` 의 마지막 값이다(IPv6 는 /64 로 묶는다). Cloud Run 주소로 바로 받으면
Google 앞단이 실제 주소를 맨 뒤에 붙이지만, 앞에 부하분산기나 도메인 매핑을 두면 그 뒤에
Google 주소가 하나 더 붙을 수 있다. 그 상태로 `enforce` 를 켜면 모든 사용자가 한 칸에 들어가
누군가 틀린 키를 60번 보낼 때 새로 들어오는 사람이 전부 「조금 빠르게 이어서 부르고 있어요」 를 본다.
그래서 **운영 로그에서 실제 모양을 한 번 보고 나서** 바꾼다.

1. 내 맥의 공인 IP 를 적어 둔다: `curl -s https://ifconfig.me`
2. 앞쪽 값을 일부러 적어서, 같은 틀린 키로 61번 부르고 다른 틀린 키로 한 번 더 부른다.
   같은 키는 30초 동안 토스에 다시 묻지 않으므로 토스 호출은 두 번뿐이다.
   토스가 「모르는 키」(4010)가 아닌 다른 재시도 불가 코드로 답하면 기억하지 않아 62번 다 묻는다.
   그래도 실패로 세므로 경고 줄은 똑같이 남는다.

   ```bash
   for i in $(seq 61); do
     curl -s -o /dev/null -H 'X-Forwarded-For: 198.51.100.1' -H 'X-Anon-Key: xff-check-a' \
       "$BASE/api/v1/categories"
   done
   curl -s -o /dev/null -H 'X-Forwarded-For: 198.51.100.1' -H 'X-Anon-Key: xff-check-b' \
     "$BASE/api/v1/categories"
   ```

3. 경고 줄을 읽는다. 인스턴스가 여럿이면 칸이 나뉘어 안 뜰 수 있으니 2번을 한 번 더 돌린다.

   ```bash
   gcloud logging read \
     'resource.type="cloud_run_revision" AND resource.labels.service_name="pocket-backend"
      AND jsonPayload.anon_key_guard="log"' \
     --freshness=10m --limit=5 --format='value(jsonPayload.client_key,jsonPayload.forwarded_hops)'
   ```

4. 판정한다.
   - `client_key` 가 1번의 내 IP 이고 `forwarded_hops` 가 2(내가 적은 값 + 앞단이 붙인 값)면 예상대로다.
   - `client_key` 가 `35.191.*`, `130.211.*` 같은 Google 주소거나 칸 수가 3 이상이면 **켜지 않는다.**
     `backend/app/api/client_key.py` 가 끝에서 두 번째 값을 보도록 먼저 고친다.
5. 맞으면 바꾼다: `gcloud run services update pocket-backend --region=<리전> --update-env-vars=ANON_KEY_FAILURE_GUARD=enforce`

켠 뒤에도 같은 경고 줄로 어느 칸이 걸렸는지 본다. `enforce` 에서는 경고 대신 429 가 나간다.

**`enforce` 에서 토스가 장애를 내면 정상 사용자도 429 를 볼 수 있다.** 토스가 정상 키에도 재시도
불가 코드(예: 5000)로 답하면 그 실패도 곳마다 센다. 통신사 NAT 뒤 IP 하나에서 실패가 60번 쌓이면,
그 IP 에서 새로 들어오는 사용자는 토스가 회복된 뒤에도 남은 창(최대 60초) 동안 401 대신
429 「조금 빠르게 이어서 부르고 있어요」 를 본다. 이미 쓰던 사용자는 기억해 둔 성공으로 그대로 쓴다.
그래서 **위 확인 순서로 XFF 모양을 보고, 토스가 장애 때 어떤 코드로 답하는지 확인할 때까지 `log` 로 둔다.**
`log` 에서는 경고 줄만 남고 화면은 바뀌지 않는다.

---

## 7. 롤백

```bash
gcloud run revisions list --service=pocket-backend
gcloud run services update-traffic pocket-backend --to-revisions=<이전 리비전>=100
```

**스키마는 같이 안 돌아간다.** 컬럼을 지우거나 이름을 바꾸는 마이그레이션은 앞 리비전을 깨뜨린다.
그래서 지우는 변경은 두 번에 나눠 넣는다: 먼저 안 쓰게 만들어 배포하고, 다음 배포에서 지운다.

### 받은 돈 넣은 곳 판부터 (리비전 `c5e8a1f3d7b2`, ADR-0049)

**이 판부터는 서버 리비전을 앞 판으로 되돌리지 않는다. 되돌릴 일이 생기면 번들을 먼저 되돌린다.**
새 서버는 옛 번들과 그대로 맞는다(옛 번들은 넣은 곳 칸을 안 보내고, 서버는 칸이 없으면 지금 값을 지킨다).
그래서 화면 쪽 문제는 콘솔에서 번들만 앞 판으로 돌리면 된다.

서버 리비전을 되돌리면 안 되는 까닭은 장부다. 이 판부터 팔기 거래 하나가 장부 줄을 둘 가질 수 있다
(판 종목의 `sell` 줄, 받은 돈을 넣은 통장의 `buy` 줄, `asset_entries.is_proceeds` 로 가른다).
앞 판의 코드는 거래마다 줄이 하나라고 믿는다. 그 코드가 돌면 판 기록의 금액을 고쳐도 통장이 따라가지 않고,
판 기록을 지워도 통장 줄이 남고, 둘 가운데 엉뚱한 줄을 고칠 수 있다.

**꼭 서버 리비전을 되돌려야 하면 아래 순서로 한다.** 통장 줄을 걷고 그 통장들의 금액을 다시 맞춘 뒤에 트래픽을 옮긴다.

1. 번들을 앞 판으로 돌려 넣은 곳이 더 붙지 않게 한다
2. 백업을 하나 뜬다(8절)
3. 아래 SQL 을 한 트랜잭션으로 돌린다. 통장 금액에서 받은 돈을 빼고, 통장 줄에 지운 표시를 하고, 거래의 넣은 곳 칸을 비운다
4. 트래픽을 앞 리비전으로 옮긴다

```sql
BEGIN;

-- (가) 통장마다 뺄 금액. 마지막 「여기서부터 이 값」(set) 뒤에 들어온 받은 돈 줄의 합이다.
--      손으로 고친 값보다 먼저 들어온 줄은 이미 금액에 안 들어 있어 빼지 않는다.
CREATE TEMP TABLE proceeds_gone ON COMMIT DROP AS
SELECT e.user_id, e.item_key, sum(e.amount) AS amount
FROM asset_entries e
WHERE e.is_proceeds AND e.deleted_at IS NULL
  AND e.created_at > COALESCE((
        SELECT max(s.created_at) FROM asset_entries s
        WHERE s.user_id = e.user_id AND s.item_key = e.item_key
          AND s.side = 'set' AND s.deleted_at IS NULL), '-infinity')
GROUP BY e.user_id, e.item_key;

-- (나) 사용자마다 가장 최근 스냅샷의 그 통장 금액에서 뺀다. 지난 날짜의 스냅샷은 건드리지 않는다.
UPDATE asset_items i
SET amount = i.amount - g.amount
FROM proceeds_gone g
JOIN asset_snapshots sn ON sn.user_id = g.user_id AND sn.deleted_at IS NULL
WHERE i.snapshot_id = sn.id AND i.item_key = g.item_key AND i.deleted_at IS NULL
  AND NOT EXISTS (
        SELECT 1 FROM asset_snapshots newer
        WHERE newer.user_id = sn.user_id AND newer.deleted_at IS NULL
          AND (newer.effective_on, newer.created_at) > (sn.effective_on, sn.created_at));

-- (다) 통장 줄에 지운 표시를 하고 거래의 넣은 곳 칸을 비운다.
UPDATE asset_entries SET deleted_at = now() WHERE is_proceeds AND deleted_at IS NULL;
UPDATE transactions SET asset_proceeds_key = NULL WHERE asset_proceeds_key IS NOT NULL;

COMMIT;
```

(가)의 행 수와 (나)의 `UPDATE` 행 수가 같은지 본다. 둘 다 통장 수다. (다)의 첫 `UPDATE` 는 받은 돈 줄 수라
통장 하나에 줄이 여럿이면 더 크다.
칸(`asset_proceeds_key`, `is_proceeds`)은 지우지 않는다. 앞 판의 코드는 모르는 칸을 그냥 지나가고,
다시 이 판으로 올 때 칸이 그대로 있어야 한다. `alembic downgrade` 는 (다)의 통장 줄 지운 표시까지 하고 칸을 지우지만
**(나)의 금액은 맞추지 않는다.** 칸을 지우고 나면 어느 줄이 받은 돈 줄이었는지 알 수 없으니,
`downgrade` 를 쓸 때도 (가)와 (나)를 먼저 돌린다.

되돌린 동안 사람들이 넣어 둔 「받은 돈 넣을 곳」 은 사라진 것이다. 다시 이 판으로 와도 돌아오지 않는다.

---

## 8. 백업과 복구

자동 백업을 켜 두는 것은 백업이 있다는 말이 아니다. **한 번은 실제로 복원해 봐야** 있다고 말할 수 있다.

**2026-09-15 에 켰다.** 그전까지 `backupConfiguration.enabled` 가 false 였고 백업이 0건이었다.
처음 인스턴스를 만들 때 플래그가 빠져 있었고, 문서에 켜는 명령만 적혀 있을 뿐 부르는 곳이
없었다. 이제 `scripts/deploy-cloudrun.sh` 가 만들 때 넣고, 이미 있는 인스턴스도 꺼져 있으면
켠다. 손으로 켤 일이 생기면 아래를 쓴다.

```bash
gcloud sql instances patch <인스턴스> --backup-start-time=18:00 --retained-backups-count=14 --deletion-protection
gcloud sql instances patch <인스턴스> --enable-point-in-time-recovery --retained-transaction-log-days=7
gcloud sql backups create --instance=<인스턴스> --description="무엇 때문에"   # 지금 당장 한 벌
```

지금 켜져 있는 값: 매일 18:00 UTC(03:00 KST) · 14벌 보관 · PITR 7일 · 삭제 보호 켜짐.

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

⚠️ **복원 연습은 아직 안 했다.** 백업은 2026-09-15 부터 쌓이고 있지만, 그것을 되살려 본 적은
없다. 되는지 모르는 백업은 있다고 말할 수 없다.

---

## 9. 실기기 테스트 (운영 서버가 서기 전)

Cloud Run 이 아직 없어도 실기기에서 한 번 돌려 볼 수 있다. 토스 앱이 우리 백엔드를
**공개 https 주소**로 부르므로, 이 맥의 백엔드를 임시 터널로 잠깐 연다.

```bash
make serve-public                    # 주소를 찍는다. 창을 닫으면 사라진다
make ait API_BASE_URL=https://<위에서 받은 주소>
# frontend/pocket-ledger.ait 를 콘솔 [앱 출시] › [버전 등록] 에 올리고, 빌드가 끝나면 그 줄의 [테스트] 로 QR 을 연다
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
- [ ] `docs/openapi.json` 과 `frontend/src/shared/api/schema.gen.ts` 에 차이 없음.
      **로컬에서 다시 뽑을 때는 `LLM_PROVIDER=stub` 을 붙인다.** 안 붙이면 `.env` 의 provider
      키를 찾다 죽는데, 출력을 버리면 조용히 안 바뀐 채 지나간다(CI 에서만 빨개진다):
      `cd backend && ALLOW_UNVERIFIED_ANON_KEY=true LLM_PROVIDER=stub uv run python scripts/export_openapi.py`
- [ ] 마이그레이션 잡이 먼저 끝났다
- [ ] `ENVIRONMENT=prod`, 두 스위치 모두 `false`
- [ ] `LLM_PROVIDER` 와 그 provider 의 키 시크릿이 짝이 맞다. 결제가 열려 있다 (`SECRETS.md` §4)
- [ ] **키가 실제로 부를 수 있다.** 키가 있다고 도는 게 아니다. 결제 계정에 선불 결제가 없으면
      모든 호출이 `429 prepayment credits are depleted` 다. 화면에는 「지금은 읽지 못했어요」로만
      보여 배포가 성공한 것처럼 지나간다.
      한 번 불러 본다: `uv run python scripts/llm_smoke.py --text "점심 12000"`
      막혀 있으면 <https://aistudio.google.com/u/1/billing> 의 「선불 결제 설정」
- [ ] 인증서 마운트 경로와 `TOSS_MTLS_*_PATH` 가 같다
- [ ] 프론트 빌드에 운영 `VITE_AD_GROUP_ID` 가 들어갔다. 빠뜨리면 오류 없이 **일곱 자리**가 조용히 접힌다
- [ ] 프론트 빌드에 운영 `VITE_AD_FULLSCREEN_GROUP_ID`(전면) 가 들어갔다. 빠뜨리면 결산이 광고 없이 열린다(리포트 달 이동은 ADR-0028 로 뺀 그대로다)(`interstitial_result` 에 `no_group` 이 쌓인다)
- [ ] 프론트 빌드에 운영 `VITE_AD_REWARDED_GROUP_ID`(리워드) 가 들어갔다. **전면과 다른 그룹이다.** 빠뜨리면 생활비 계산기가 광고 없이 열린다(`budget_calc_opened` 에 `no_group` 이 쌓인다). `make ait` 가 `.env.local` 에 없으면 멈춘다
- [ ] `VITE_AD_PHOTO_GROUP_ID`(사진 받는 자리) 를 넣었나 확인한다. **없어도 빌드는 된다**(계산기 그룹으로 떨어진다). 다만 그 동안에는 광고 화면이 「생활비 계산기」 보상이라고 말하고 우리는 사진을 준다 → ADR-0030
- [ ] **판을 먼저 확인했다.** QR 로 연 뒤 앱 설정 → 버전 줄 → 「앱 정보」 의 `판` 을 본다.
      `운영 (toss)` 이면 그 자리에서 보는 배너가 실광고다. **광고 ID 를 넣기 전에 이걸 먼저 본다**
- [ ] 만든 사람과 테스트를 부탁한 사람이 **앱 정보 시트에서 「이 기기에서 광고 끄기」 를 켰다.**
      말로 부탁하는 것만으로는 안 된다. 한 번 스쳐 본 노출도 무효 트래픽으로 쌓인다
- [ ] SMTP 시크릿·환경변수를 붙였다(`SECRETS.md` §4.5). 안 붙이면 「이메일로 지켜 두기」 가 「준비 중」 으로 잠긴다(오류는 아니다)
- [ ] 프론트 빌드에 `VITE_NOTIFICATION_TEMPLATE_CODE` 가 들어갔다. **알림 잡의 `TOSS_REMINDER_TEMPLATE_SET_CODE` 와 같은 값이다** (다르면 동의는 받고 발송은 0통)
- [ ] **운영 DB 백업이 켜져 있다.** 되돌릴 수 없는 것 중 유일하게 점검표에 없던 항목이었고,
      실제로 꺼진 채 배포가 열다섯 번 돌았다. 한 줄로 확인한다:
      `gcloud sql instances describe pocket-sql --format='value(settings.backupConfiguration.enabled)'`
      → `True` 여야 한다. 아니면 `scripts/deploy-cloudrun.sh` 가 켠다(§8)
- [ ] 배포 뒤 연기 검사 두 줄을 실제로 돌렸다
- [ ] 콘솔 로고·스크린샷·문안이 최신인가 (`docs/store/`)
