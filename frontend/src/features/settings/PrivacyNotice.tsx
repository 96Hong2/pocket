import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';

import { useBridge } from '../../app/providers';
import { ROUTES } from '../../app/router/routes';
import { Card, CategoryAvatar } from '../../shared/ui';
import { AppDiagnosticsSheet } from './AppDiagnosticsSheet';

/**
 * 설정 화면 아래쪽 한 덩어리.
 *
 * 하위 화면 입구(알림 설정·방침)와 앱 자체 정보(내보내기·버전)를 같은 줄 모양으로 먼저 두고,
 * 그 아래에서 사진을 올리는 사람이 가장 먼저 묻는 것에 한 문단으로 답한다.
 * 더 볼 사람만 방침 화면으로 들어가게 한다.
 *
 * 배너는 버전 줄 바로 아래다. 페이지가 넣어 준다.
 *
 * **"계좌번호나 카드번호는 아예 읽지 않아요" 는 쓰지 않는다.** 시안에는 그 문장이 있지만
 * 캡처는 vision 모델이 이미지를 직접 읽으므로 사실과 다르다(`docs/ADR/0010`).
 * 저장하지 않는 것과 읽지 않는 것은 다르고, 못 지킬 약속을 방침에 적으면 그것이 더 나쁘다.
 */
export function PrivacyNotice({ adSlot }: { adSlot?: ReactNode }) {
  const bridge = useBridge();
  const [diagOpen, setDiagOpen] = useState(false);
  // 운영 판에서는 뱃지를 달지 않는다. 쓰는 사람에게 「테스트」 는 아무 뜻도 없다.
  const testBadge = bridge.environment === 'sandbox' ? '테스트' : null;

  return (
    <section className="setting-block setting-block--links">
      <nav aria-label="설정 하위 화면">
        <Card padding="list">
          <ul className="link-rows">
            <li>
              <Link className="link-row" to={ROUTES.notifications}>
                <CategoryAvatar icon="30_bell" size={48} />
                <span className="link-row__label">알림 설정</span>
              </Link>
            </li>
            <li>
              {/* 아직 만들지 않았다. 감추면 "이 앱은 내보내기가 없다" 로 읽히고,
                  누를 수 있게 두면 눌러 보고 아무 일도 안 일어난다. 자리와 상태만 보여 준다. */}
              <div className="link-row link-row--static">
                <CategoryAvatar icon="23_document" size={48} />
                <span className="link-row__label">CSV 내보내기</span>
                <span className="link-row__badge">준비 중</span>
              </div>
            </li>
            <li>
              <Link className="link-row" to={ROUTES.privacy}>
                <CategoryAvatar icon="21_shield" size={48} />
                <span className="link-row__label">개인정보처리방침</span>
              </Link>
            </li>
            <li>
              {/*
                문의를 받을 때 어느 판인지 묻지 않아도 되게 화면에 적어 둔다.
                눌러 열리는 시트에 판·배포·기기가 있다. 실기기에서 그 값을 볼 자리가
                여기 말고는 없다(로그는 운영 판에서만 실제로 나간다).
              */}
              <button type="button" className="link-row" onClick={() => setDiagOpen(true)}>
                <CategoryAvatar icon="26_sparkles" size={48} />
                <span className="link-row__label">버전</span>
                {testBadge ? <span className="link-row__badge">{testBadge}</span> : null}
                <span className="link-row__value" data-numeric="">
                  {__APP_VERSION__}
                </span>
              </button>
            </li>
          </ul>
        </Card>
      </nav>

      {adSlot}

      <p className="setting-note">
        캡처 원본은 정리 직후 지워져요. 저장되는 것은 날짜, 금액, 상호, 분류처럼 기록에 필요한
        것뿐이에요.
      </p>

      {/*
        상단 ⋯ 와 ✕ 는 토스가 그리는 자리라 우리가 바꿀 수 없다.
        그걸 앱 설정으로 알고 눌렀다가 공유 창이 뜨면 사용자는 앱이 이상하다고 여긴다.
      */}
      <p className="setting-note setting-note--muted">
        화면 맨 위 ⋯ 는 토스가 주는 공통 메뉴예요(공유·새로고침·신고). 앱 설정은 이 화면에서 바꿔요.
      </p>

      <AppDiagnosticsSheet open={diagOpen} onClose={() => setDiagOpen(false)} />
    </section>
  );
}
