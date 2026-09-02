# 비밀값 관리

이 문서는 **어디서 받아 어디에 넣는지**만 적는다.
**실제 비밀값을 이 파일에 적지 않는다.** 예시는 전부 형태만 보여주는 자리표시자다.

git 에 올리지 않는 것: mTLS 인증서와 개인키, LLM API 키, 운영 광고 ID, `.env` 파일.

---

## 1. 한눈에 보기

| 비밀값 | 어디서 받나 | 로컬 | 운영(Cloud Run) | 없으면 |
|---|---|---|---|---|
| 토스 mTLS 클라이언트 인증서 + 개인키 | Apps in Toss 파트너 콘솔 문의 (아래 §2) | 파일 경로를 `.env` 로 지정 | Secret Manager 볼륨 마운트 | 운영 기동 실패 / 로컬은 검증 생략 모드 |
| LLM API 키 | 사용할 provider 콘솔 (아직 미정) | `.env` | Secret Manager 환경변수 | 스텁 파서로 동작 |
| 운영 광고 adGroupId | Apps in Toss 파트너 콘솔 광고 설정 | 안 씀(테스트 ID 사용) | 프론트 빌드 환경변수 | 배너 슬롯을 접는다 |

---

## 2. 토스 mTLS 클라이언트 인증서

토스 서버 API(`https://apps-in-toss-api.toss.im`)는 mTLS 클라이언트 인증서를 요구한다.
익명키 검증(`POST /api-partner/v1/apps-in-toss/users/anon-key/verify`)이 여기 해당한다.

> **발급 절차가 공개 문서에 없다.** 공식 문서는 "mTLS 인증서가 필요하다"까지만 알려주고,
> 어떤 화면에서 어떻게 발급받는지, CSR 을 우리가 만드는지 토스가 내려주는지는 적혀 있지 않다.
> **Apps in Toss 파트너 콘솔 문의로 확인해야 한다.** 확인되면 이 절을 실제 절차로 채운다.
>
> **자체 서명 인증서를 만들어 끼우지 않는다.** 토스가 신뢰하지 않아 어차피 붙지 않고,
> "붙은 것처럼" 보이는 상태가 더 위험하다. 지금은 인증서 없이 가고, 아래 §3 의 개발용 모드를 쓴다.

### 파일 두 개

```
toss-client.crt   클라이언트 인증서
toss-client.key   개인키. 이게 유출되면 우리 앱 자격으로 호출할 수 있다
```

- 저장소 어디에도 두지 않는다. 로컬에서는 `~/.pocket/secrets/` 처럼 저장소 **밖**에 둔다.
- 개인키 파일 권한은 `chmod 600`.
- 유출됐다고 판단되면 콘솔에서 폐기하고 재발급받는다. 파일만 바꾸는 것으로 끝내지 않는다.

### 환경변수

| 이름 | 값 | 비고 |
|---|---|---|
| `TOSS_API_BASE_URL` | `https://apps-in-toss-api.toss.im` | 비밀 아님 |
| `TOSS_CLIENT_CERT_PATH` | 인증서 파일 절대경로 | |
| `TOSS_CLIENT_KEY_PATH` | 개인키 파일 절대경로 | |
| `ALLOW_UNVERIFIED_ANON_KEY` | `true`(로컬) / `false`(그 외) | §3 |
| `ENVIRONMENT` | `local` / `dev` / `prod` | `prod` 면 검증 생략 불가 |

---

## 3. 익명키 검증기 선택 규칙

`app/integrations/apps_in_toss/anon_key.py` 의 `create_anon_key_verifier` 가 설정만 보고 고른다.

```
ENVIRONMENT=prod 이고 ALLOW_UNVERIFIED_ANON_KEY=true   → 기동 실패
인증서 두 파일이 실제로 있음                            → TossAnonKeyVerifier (실제 검증)
인증서 없고 ENVIRONMENT=prod                            → 기동 실패
인증서 없고 ALLOW_UNVERIFIED_ANON_KEY=false             → 기동 실패
인증서 없고 ALLOW_UNVERIFIED_ANON_KEY=true (로컬)       → TrustingAnonKeyVerifier + 경고 로그
```

`TrustingAnonKeyVerifier` 는 익명키를 **검증하지 않고 통과시킨다.** 로컬 개발 전용이고,
운영에서는 위 규칙 때문에 절대 선택되지 않는다. 켜져 있으면 경고 로그가 계속 남는다.

---

## 4. LLM API 키

provider 를 아직 고르지 않았다. 지금은 `StubLlmStructuredClient`(규칙 기반 스텁)로 돌아간다.
스텁 결과에는 응답 메타에 `is_stub: true` 가 붙으므로 진짜 모델 결과와 구분된다.

| 이름 | 값 | 비고 |
|---|---|---|
| `LLM_PROVIDER` | `stub` / (정해지면 provider 이름) | 기본값 `stub` |
| `LLM_API_KEY` | provider 콘솔에서 발급 | `LLM_PROVIDER=stub` 이면 필요 없다 |

지켜야 하는 것:

- 키를 코드·테스트 픽스처·로그·에러 메시지에 넣지 않는다.
- **OCR/LLM 에 보낸 원문과 받은 원문을 저장하거나 로그에 남기지 않는다.** analytics·error log 도 포함이다.
- 캡처 이미지 바이트를 로그에 찍지 않는다(`LlmImage.__repr__` 가 길이만 남기도록 막아 뒀다).

---

## 5. 광고 ID

- 개발·테스트는 공식 테스트 ID `ait-ad-test-banner-id` 를 쓴다. 이건 공개 상수라 비밀이 아니다.
- **운영 adGroupId 는 소스에 하드코딩하지 않는다.** 프론트 빌드 환경변수로 넣는다.

| 이름 | 값 | 비고 |
|---|---|---|
| `VITE_ADS_BANNER_AD_GROUP_ID` | 콘솔에서 발급한 운영 adGroupId | 번들에 박히므로 "감춰지는" 값은 아니다. 다만 저장소에는 남기지 않는다 |

값이 비어 있으면 배너 슬롯 자체를 접는다. 빈 자리를 남기지 않는다.

---

## 6. 로컬 설정

저장소 루트가 아니라 `backend/.env` 에 둔다. 이 파일은 커밋하지 않는다.

```bash
# backend/.env  (자리표시자다. 실제 값을 이 문서에 적지 않는다)
ENVIRONMENT=local

TOSS_API_BASE_URL=https://apps-in-toss-api.toss.im
TOSS_CLIENT_CERT_PATH=/Users/<나>/.pocket/secrets/toss-client.crt
TOSS_CLIENT_KEY_PATH=/Users/<나>/.pocket/secrets/toss-client.key
ALLOW_UNVERIFIED_ANON_KEY=true

LLM_PROVIDER=stub
LLM_API_KEY=
```

인증서가 아직 없으므로 `TOSS_CLIENT_*_PATH` 두 줄은 비워 두고 `ALLOW_UNVERIFIED_ANON_KEY=true` 로 둔다.

프론트는 `frontend/.env.local` 에 `VITE_ADS_BANNER_AD_GROUP_ID=ait-ad-test-banner-id`.

---

## 7. 운영 설정 (Cloud Run + Secret Manager)

### 7.1 시크릿 만들기

```bash
# 값은 파일에서 읽어 넣는다. 명령줄에 값을 직접 쓰지 않는다(셸 히스토리에 남는다)
gcloud secrets create pocket-toss-client-crt --replication-policy=automatic
gcloud secrets versions add pocket-toss-client-crt --data-file=./toss-client.crt

gcloud secrets create pocket-toss-client-key --replication-policy=automatic
gcloud secrets versions add pocket-toss-client-key --data-file=./toss-client.key

gcloud secrets create pocket-llm-api-key --replication-policy=automatic
gcloud secrets versions add pocket-llm-api-key --data-file=./llm-api-key.txt
```

넣고 나면 로컬의 원본 파일을 지운다. 다운로드 폴더에 남겨 두지 않는다.

### 7.2 서비스 계정에 읽기 권한

```bash
gcloud secrets add-iam-policy-binding pocket-toss-client-key \
  --member="serviceAccount:<런타임 서비스계정>" \
  --role="roles/secretmanager.secretAccessor"
```

### 7.3 배포

인증서와 개인키는 **파일로 마운트**한다(코드가 파일 경로를 요구한다).
LLM 키처럼 문자열 하나인 것은 환경변수로 넣는다.

```bash
gcloud run deploy pocket-backend \
  --set-secrets=/secrets/toss/toss-client.crt=pocket-toss-client-crt:latest \
  --set-secrets=/secrets/toss/toss-client.key=pocket-toss-client-key:latest \
  --set-secrets=LLM_API_KEY=pocket-llm-api-key:latest \
  --set-env-vars=ENVIRONMENT=prod \
  --set-env-vars=ALLOW_UNVERIFIED_ANON_KEY=false \
  --set-env-vars=TOSS_CLIENT_CERT_PATH=/secrets/toss/toss-client.crt \
  --set-env-vars=TOSS_CLIENT_KEY_PATH=/secrets/toss/toss-client.key
```

`:latest` 로 걸면 시크릿을 새 버전으로 올린 뒤 **리비전을 다시 배포해야** 반영된다.
인증서를 갱신했는데 반영이 안 되면 여기를 먼저 본다.

### 7.4 배포 전 확인

- `ENVIRONMENT=prod` 인데 `ALLOW_UNVERIFIED_ANON_KEY=true` 면 앱이 기동하지 않는다. 의도된 동작이다.
- 인증서 마운트 경로와 `TOSS_CLIENT_*_PATH` 값이 같은지 확인한다.
- 로그에 인증서 내용·키·익명키 원문이 찍히지 않는지 확인한다.

---

## 8. 유출됐을 때

1. 콘솔에서 해당 자격을 **먼저 폐기**한다. 코드 정리보다 이게 먼저다.
2. 새로 발급받아 Secret Manager 에 새 버전으로 올리고 리비전을 다시 배포한다.
3. git 히스토리에 들어갔으면 파일을 지우는 것으로 끝나지 않는다. 히스토리에서 제거하고 자격을 재발급한다.
