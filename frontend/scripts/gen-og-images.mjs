/**
 * 공유 링크 미리보기(오픈그래프) 그림을 만든다.
 *
 *   node scripts/gen-og-images.mjs
 *
 * 나오는 곳은 `backend/app/static/og/` 다. 백엔드가 그 폴더를 `/og` 로 그대로 내보낸다.
 * 프론트가 만드는 이유는 하나다. 여기에만 브라우저(Playwright)와 디자인 토큰이 있다.
 *
 * 규격은 토스가 정한 1200×600 이다(개발자센터 「OG 이미지」).
 * 글자를 많이 넣지 않는다. 미리보기는 채팅방에서 손톱만 하게 뜬다.
 *
 * **손으로 고친 PNG 를 덮어쓴다.** 그림을 바꾸려면 이 파일의 표를 고치고 다시 돌린다.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '..');
const OUT_DIR = path.resolve(FRONTEND, '../backend/app/static/og');

const SIZE = { width: 1200, height: 600 };

/** 디자인 토큰과 같은 값. `src/index.css` 의 `:root` 에서 가져왔다. */
const COLOR = {
  bg: '#F7F5F0',
  sage50: '#EFF2EA',
  sage100: '#DCE5D3',
  sage700: '#3F5A40',
  ink: '#26292B',
  muted: '#64686C',
};

/**
 * 갈래마다 다른 그림 한 장.
 *
 * `title` 은 채팅방에서 손톱만 하게 떠도 읽히는 크기로 그린다. 그래서 한 줄이다.
 * `lead` 는 그 아래 한 줄. 두 줄을 넘기지 않는다.
 */
const CARDS = [
  {
    file: 'app.png',
    icon: '01_coins',
    title: '가계부 쓰기 싫은 사람의 가계부',
    lead: '하루 10초면 한 건이 끝나요',
  },
  {
    file: 'goal.png',
    icon: '02_gold_bars',
    title: '모으는 중이에요',
    lead: '목표를 정하면 매달 얼마씩인지 알려드려요',
  },
  {
    file: 'goal-done.png',
    icon: '26_sparkles',
    title: '목표, 다 모았어요',
    lead: '정한 만큼 끝까지 왔어요',
  },
  {
    file: 'budget.png',
    icon: '32_piggybank',
    title: '이번 달 예산을 정했어요',
    lead: '남은 돈과 오늘 쓸 돈까지 알려드려요',
  },
  {
    file: 'closing.png',
    icon: '03_growth_chart',
    title: '한 달을 정리했어요',
    lead: '잘한 것부터 보여드려요',
  },
];

/** 그림 파일을 data URI 로 읽는다. 브라우저가 로컬 경로를 못 읽는 자리라 본문에 심는다. */
async function dataUri(relative) {
  const bytes = await readFile(path.resolve(FRONTEND, relative));
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

function page(card, iconUri, logoUri) {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${SIZE.width}px; height: ${SIZE.height}px;
    display: flex; align-items: stretch;
    background: linear-gradient(135deg, ${COLOR.bg} 0%, ${COLOR.sage50} 100%);
    color: ${COLOR.ink};
    font-family: 'Pretendard Variable', Pretendard, -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  /* 왼쪽은 글, 오른쪽은 그림 한 덩어리. 채팅방 미리보기는 손톱만 해서
     글과 그림이 섞이면 둘 다 안 읽힌다. 색으로 갈라 둔다. */
  .text {
    flex: 1; min-width: 0;
    display: flex; flex-direction: column; justify-content: center;
    padding: 0 72px 0 88px;
  }
  .brand {
    display: flex; align-items: center; gap: 12px;
    margin-bottom: 28px;
  }
  .brand img { width: 44px; height: 44px; border-radius: 11px; }
  .brand span {
    font-size: 25px; font-weight: 700; letter-spacing: -0.5px; color: ${COLOR.sage700};
  }
  h1 {
    font-size: 66px; font-weight: 800; line-height: 1.24; letter-spacing: -2.4px;
    word-break: keep-all;
  }
  p {
    margin-top: 22px;
    font-size: 31px; font-weight: 500; line-height: 1.45; letter-spacing: -0.8px;
    color: ${COLOR.muted}; word-break: keep-all;
  }
  .art {
    flex: none; width: 420px;
    display: flex; align-items: center; justify-content: center;
    background: ${COLOR.sage700};
  }
  .art img { width: 248px; height: 248px; }
</style></head>
<body>
  <div class="text">
    <div class="brand"><img src="${logoUri}" alt="" /><span>10초 가계부</span></div>
    <h1>${card.title}</h1>
    <p>${card.lead}</p>
  </div>
  <div class="art"><img src="${iconUri}" alt="" /></div>
</body></html>`;
}

const browser = await chromium.launch();
try {
  await mkdir(OUT_DIR, { recursive: true });
  const logoUri = await dataUri('public/icons/app-logo-192.png');
  // 규격이 1200×600 이라 그 크기 그대로 찍는다. 두 배로 찍으면 2400×1200 이 나온다.
  // 그림은 320px 원본을 220px 로 줄여 쓰므로 1배로 찍어도 뭉개지지 않는다.
  const view = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 });

  for (const card of CARDS) {
    const iconUri = await dataUri(`public/icons/lg/${card.icon}.png`);
    await view.setContent(page(card, iconUri, logoUri), { waitUntil: 'networkidle' });
    // 글꼴이 늦게 붙으면 시스템 글꼴로 찍힌다. 다 붙은 뒤에 찍는다.
    await view.evaluate(() => document.fonts.ready);
    const shot = await view.screenshot({ type: 'png' });
    const out = path.join(OUT_DIR, card.file);
    await writeFile(out, shot);
    console.log(`${card.file}  ${(shot.length / 1024).toFixed(0)}KB`);
  }
} finally {
  await browser.close();
}
