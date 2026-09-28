import { useSearchParams } from 'react-router';

import { IdentityNotice } from '../app/IdentityNotice';
import { JOIN_CODE_QUERY } from '../app/router/routes';
import { JoinInvite } from '../features/book-manage';

/**
 * 초대 링크가 여는 화면. `?c=<코드>&src=share_invite`.
 *
 * 처음 여는 사람도 처음 안내보다 이 화면이 먼저다(`OnboardingGate` 가 이 경로에서는 비켜 선다).
 * 광고를 두지 않는다.
 */
export default function JoinPage() {
  const [params] = useSearchParams();
  const code = params.get(JOIN_CODE_QUERY);

  return (
    <div className="page">
      <IdentityNotice />
      <JoinInvite key={code ?? ''} code={code} />
    </div>
  );
}
