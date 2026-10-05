import { useState } from 'react';

import { IdentityNotice } from '../app/IdentityNotice';
import { AssetsBoard } from '../features/assets';
import { QuickRecordSheet } from '../features/quick-record';
import type { AssetItemOut } from '../shared/api';

/**
 * 자산. 계좌를 연결하지 않고 대략 얼마인지만 적어 순자산을 본다.
 *
 * **들어올 때 전면 광고를 띄우지 않는다.** 배너는 본문 안, 캡처 입구와 그룹 사이 한 자리다.
 */
export default function AssetsPage() {
  // 항목 시트 「팔았어요」 로 연 기록 시트. 첫 화면 없이 그 종목의 팔기 화면으로 연다.
  const [selling, setSelling] = useState<AssetItemOut | null>(null);
  return (
    <div className="page assets-page">
      <h1 className="page__title">자산</h1>

      {/* 식별키를 못 받으면 조회가 시작조차 안 한다. 이 안내가 없으면 목록이 계속 회색이다. */}
      <IdentityNotice />

      <AssetsBoard onSell={setSelling} />

      <QuickRecordSheet
        open={selling != null}
        initialTab="keypad"
        from="asset_item"
        sell={selling}
        onClose={() => setSelling(null)}
      />
    </div>
  );
}
