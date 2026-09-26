/**
 * 공유 링크가 가리킬 자리와 미리보기 그림.
 *
 * **모든 공유가 앱 첫 화면으로 간다.** 목표 화면으로 보내 봐야 받는 사람에게는 **자기**
 * 목표 화면이 열린다. 내 목표는 내 기기에만 있어서다. 아직 이 앱이 없는 사람에게는
 * 빈 목표 화면보다 무슨 앱인지 말해 주는 첫 화면이 낫다.
 */

import { resolveApiBaseUrl } from '../../shared/api';

import type { ShareKind } from './shareText';

/**
 * 딥링크에 쓰는 앱 이름. `frontend/apps-in-toss.config.ts` 의 `appName` 과 같은 값이다.
 *
 * 콘솔에서 한 번 정하면 못 바꾸는 값이라 두 곳에 적어도 어긋날 일이 없다.
 * 설정 파일은 `src` 바깥이라 여기서 가져오면 빌드 경로가 꼬인다.
 */
const APP_NAME = 'pocket-ledger';

/** `intoss://pocket-ledger`. 토스가 정한 형식이라 우리가 바꾸지 않는다. */
export const SHARE_PATH = `intoss://${APP_NAME}`;

/**
 * 갈래마다 붙이는 표시. 받은 사람이 링크로 들어오면 `app_open` 의 `src` 에 실린다.
 *
 * 토스는 공유 링크로 온 사람을 전부 `external_share` 하나로 적는다. 목표를 보고 온 사람과
 * 결산을 보고 온 사람을 가르려면 우리가 표시를 달아야 한다. 가는 곳은 여전히 첫 화면이다.
 */
export function sharePath(kind: ShareKind): string {
  return `${SHARE_PATH}?src=share_${kind}`;
}

/** 갈래마다 다른 그림. 파일은 백엔드 `app/static/og/` 에 있다. */
const OG_FILE: Record<ShareKind, string> = {
  app: 'app.png',
  goal: 'goal.png',
  goal_done: 'goal-done.png',
  budget: 'budget.png',
  closing: 'closing.png',
  // 연속 기록 전용 그림은 아직 없다. 앱 그림을 쓴다. 받는 사람에게는 무슨 앱인지가 먼저다.
  streak: 'app.png',
};

/**
 * 미리보기 그림 주소. 만들 수 없으면 undefined 다.
 *
 * 토스 서버가 바깥에서 받아 가는 주소라 **https 절대주소여야 한다.** 개발에서 쓰는
 * `http://localhost` 주소를 넘기면 미리보기가 빈 채로 뜬다. 그럴 바에는 안 보내고
 * 콘솔에 등록해 둔 앱 기본 그림을 쓰게 둔다.
 */
export function shareImageUrl(kind: ShareKind): string | undefined {
  const base = resolveApiBaseUrl();
  if (base == null || !base.startsWith('https://')) return undefined;
  return `${base}/og/${OG_FILE[kind]}`;
}
