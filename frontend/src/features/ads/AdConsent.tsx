/**
 * 광고가 뜨기 **바로 전에** 한 번 묻는 창.
 *
 * 2026-09-23 에 콘솔 검토가 이 앱을 반려하며 이렇게 적었다.
 *
 * > 유저가 예상하기 어려운 시점에 광고가 노출돼요.
 * > 광고 노출 전에 유저가 인지할 수 있도록 CTA 문구나 UI를 추가해 주세요.
 *
 * 그전에는 버튼 곁에 「광고가 한 번 나와요」 를 적어 두는 것으로 갈음했다. 목록 머리에
 * 한 줄, 카드 안에 한 줄. 읽고 누른 사람에게는 충분한데 **안 읽고 누른 사람에게는
 * 아무 예고도 아니었다.** 적어 두는 것과 묻는 것은 다르다.
 *
 * 그래서 누르는 순간과 광고 사이에 이 창을 넣는다. 여기서 「광고 보고 열기」 를 누른
 * 것이 곧 광고를 보겠다는 뜻이고, 그 버튼이 CTA 다.
 *
 * **자리마다 다시 만들지 않는다.** 전면 광고가 서는 자리가 여덟이라 문구가 갈리면
 * 어떤 자리는 빠뜨린다. 모양은 [[FutureDayConfirm]] 과 같게 맞췄다. 같은 무게의
 * 물음이라 같게 그린다.
 */

import { Button } from '../../shared/ui';

export interface AdConsentProps {
  /** 광고를 보고 나면 무엇이 열리는지. 「카테고리 관리」 처럼 화면 이름 그대로 적는다. */
  what: string;
  /**
   * 광고를 보는 동안 무슨 일이 함께 일어나는지. 사진 쪽에만 있다.
   *
   * **이것이 있는 자리는 광고가 시간을 뺏지 않는다.** 어차피 기다려야 하는 몇 초를
   * 광고가 채우는 것뿐이라, 그 사실을 말해 두면 같은 광고가 다르게 읽힌다.
   */
  meanwhile?: string;
  /** 「광고 보고 열기」. 부르는 쪽이 광고를 띄우고 하던 일을 이어서 한다. */
  onConfirm: () => void;
  /** 「닫기」. 아무 일도 일어나지 않는다. */
  onCancel: () => void;
}

export function AdConsent({ what, meanwhile, onConfirm, onCancel }: AdConsentProps) {
  return (
    <div className="ad-consent" role="alertdialog" aria-label="광고가 한 번 나와요">
      <div className="ad-consent__box">
        <p className="ad-consent__title">{what}</p>
        {meanwhile ? (
          /*
            **읽는 동안 본다는 것을 앞세운다.** 「광고를 보면 읽어 드려요」 는 광고를
            치르고 기능을 사는 거래로 읽히는데, 실제로는 어차피 기다리는 시간이다.
            주어를 광고가 아니라 기다림에 둔다.
          */
          <p className="ad-consent__text">
            <b>{meanwhile}</b> 그동안 광고가 한 번 나와요
          </p>
        ) : (
          <p className="ad-consent__text">광고가 한 번 나온 다음에 열려요</p>
        )}
        <div className="ad-consent__actions">
          <Button variant="outline" onClick={onCancel}>
            닫기
          </Button>
          {/* 이 버튼이 곧 예고다. 「확인」 이라고만 적으면 무엇에 동의했는지 안 남는다. */}
          <Button onClick={onConfirm}>{meanwhile ? '광고 보고 읽기' : '광고 보고 열기'}</Button>
        </div>
      </div>
    </div>
  );
}
