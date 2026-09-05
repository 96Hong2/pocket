import { Link } from 'react-router';

import { ROUTES } from '../../app/router/routes';
import { Card, CategoryAvatar } from '../../shared/ui';

/**
 * 설정 화면 아래쪽 한 덩어리.
 *
 * 사진을 올리는 사람이 가장 먼저 묻는 것에 한 문단으로 답하고, 더 볼 사람만 방침 화면으로
 * 들어가게 한다. 그 아래에 앱 자체 정보(내보내기·버전)를 같은 줄 모양으로 둔다.
 *
 * **"계좌번호나 카드번호는 아예 읽지 않아요" 는 쓰지 않는다.** 시안에는 그 문장이 있지만
 * 캡처는 vision 모델이 이미지를 직접 읽으므로 사실과 다르다(`docs/ADR/0010`).
 * 저장하지 않는 것과 읽지 않는 것은 다르고, 못 지킬 약속을 방침에 적으면 그것이 더 나쁘다.
 */
export function PrivacyNotice() {
  return (
    <section className="setting-block">
      <p className="setting-note">
        캡처 원본은 정리 직후 지워져요. 저장되는 것은 날짜, 금액, 상호, 분류처럼 기록에 필요한
        것뿐이에요.
      </p>

      <nav aria-label="설정 하위 화면">
        <Card padding="list">
          <ul className="link-rows">
            <li>
              {/* 아직 만들지 않았다. 감추면 "이 앱은 내보내기가 없다" 로 읽히고,
                  누를 수 있게 두면 눌러 보고 아무 일도 안 일어난다. 자리와 상태만 보여 준다. */}
              <div className="link-row link-row--static">
                <CategoryAvatar icon="23_document" size={24} />
                <span className="link-row__label">CSV 내보내기</span>
                <span className="link-row__value">준비 중</span>
              </div>
            </li>
            <li>
              <Link className="link-row" to={ROUTES.privacy}>
                <CategoryAvatar icon="21_shield" size={24} />
                <span className="link-row__label">개인정보처리방침</span>
              </Link>
            </li>
            <li>
              {/* 문의를 받을 때 어느 판인지 묻지 않아도 되게 화면에 적어 둔다. */}
              <div className="link-row link-row--static">
                <CategoryAvatar icon="26_sparkles" size={24} />
                <span className="link-row__label">버전</span>
                <span className="link-row__value" data-numeric="">
                  {__APP_VERSION__}
                </span>
              </div>
            </li>
          </ul>
        </Card>
      </nav>

      {/*
        상단 ⋯ 와 ✕ 는 토스가 그리는 자리라 우리가 바꿀 수 없다.
        그걸 앱 설정으로 알고 눌렀다가 공유 창이 뜨면 사용자는 앱이 이상하다고 여긴다.
      */}
      <p className="setting-note setting-note--muted">
        화면 맨 위 ⋯ 는 토스가 주는 공통 메뉴예요(공유·새로고침·신고). 앱 설정은 이 화면에서 바꿔요.
      </p>
    </section>
  );
}
