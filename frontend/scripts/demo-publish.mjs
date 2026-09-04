#!/usr/bin/env node
/**
 * 녹화한 webm 을 mp4 로 옮기고, 한 번에 훑어볼 인덱스를 만든다.
 *
 * Playwright 가 내놓는 것은 VP8 webm 이다. 크롬에서는 열리지만 맥 미리보기·퀵타임·
 * 메신저에서는 열리지 않아 공유하기 어렵다. 그래서 h264 mp4 로 한 벌 더 만든다.
 *
 *   node scripts/demo-publish.mjs <영상 폴더> [내보낼 폴더]
 *
 * ffmpeg 가 있어야 한다(brew install ffmpeg). Playwright 가 들고 있는 ffmpeg 는
 * webm 전용으로 빌드돼 있어 mp4 를 못 만든다.
 */

import { execFile } from 'node:child_process';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** 세로 영상이라 폭을 두 배로 키운다. 원본이 412px 라 그냥 두면 화면에서 너무 작다. */
const TARGET_WIDTH = 824;

/** 목록에 쓸 대표 그림을 모아 두는 곳. */
const THUMB_DIR = '_thumbs';

async function main() {
  const [srcDir, outDir = srcDir] = process.argv.slice(2);
  if (!srcDir) {
    console.error('사용법: node scripts/demo-publish.mjs <영상 폴더> [내보낼 폴더]');
    process.exit(1);
  }

  const names = (await readdir(srcDir)).filter((name) => name.endsWith('.webm')).sort();
  if (names.length === 0) {
    console.error(`${srcDir} 에 webm 이 없다. 먼저 npm run demo 를 돌린다.`);
    process.exit(1);
  }

  await mkdir(outDir, { recursive: true });
  const thumbDir = path.join(outDir, THUMB_DIR);
  await mkdir(thumbDir, { recursive: true });
  const clips = [];

  for (const name of names) {
    const base = name.replace(/\.webm$/, '');
    const src = path.join(srcDir, name);
    const dest = path.join(outDir, `${base}.mp4`);

    await run('ffmpeg', [
      '-v', 'error', '-y',
      '-i', src,
      // 짝수 폭·높이가 아니면 h264 가 거부한다. 반올림해서 맞춘다.
      '-vf', `scale=${TARGET_WIDTH}:-2:flags=lanczos`,
      '-c:v', 'libx264',
      '-preset', 'slow',
      '-crf', '20',
      // 이 둘이 없으면 맥 미리보기와 카카오톡에서 안 열린다.
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      dest,
    ]);

    const info = await probe(dest);

    // 카드에 쓸 대표 그림. 첫 프레임은 제목 카드라 어느 영상이나 똑같이 파랗다.
    // 조금 지난 지점을 뽑아야 그 영상이 무슨 화면인지 목록에서 바로 읽힌다.
    const thumbName = `${base}.jpg`;
    await run('ffmpeg', [
      '-v', 'error', '-y',
      '-i', dest,
      '-ss', String(Math.max(0, info.duration * 0.55)),
      '-frames:v', '1',
      '-vf', 'scale=412:-2',
      '-q:v', '4',
      path.join(thumbDir, thumbName),
    ]);

    const size = (await stat(dest)).size;
    clips.push({ base, file: `${base}.mp4`, thumb: `${THUMB_DIR}/${thumbName}`, ...info, size });
    console.log(`${base}  ${info.duration.toFixed(1)}초  ${(size / 1e6).toFixed(1)}MB`);
  }

  const indexPath = path.join(outDir, '화면 동작 영상.html');
  await writeFile(indexPath, renderIndex(clips), 'utf8');
  console.log(`\n영상 ${clips.length}개 · 인덱스 ${indexPath}`);
}

async function probe(file) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height:format=duration',
    '-of', 'json',
    file,
  ]);
  const parsed = JSON.parse(stdout);
  return {
    width: parsed.streams[0].width,
    height: parsed.streams[0].height,
    duration: Number(parsed.format.duration),
  };
}

/** 제목에서 앞 번호를 뗀다. 번호는 따로 쓰고 제목만 남긴다. */
function split(base) {
  const match = /^(\d+)\s+(.*)$/.exec(base);
  return match ? { no: match[1], title: match[2] } : { no: '', title: base };
}

/**
 * 영상을 주제로 묶는다.
 *
 * 번호 순서가 곧 주제 순서다. 영상을 더하면 여기 범위도 함께 고친다.
 * 묶음 없이 23개를 한 줄로 늘어놓으면 무엇부터 봐야 할지 알 수 없다.
 */
const GROUPS = [
  { upTo: 2, title: '기록 한 바퀴', lead: '이 앱이 하려는 일. 열고 적고 되돌리기까지' },
  { upTo: 8, title: '홈 화면', lead: '상황마다 달라지는 얼굴, 그리고 잘 안 될 때' },
  { upTo: 16, title: '기록 시트', lead: '금액을 찍고 카테고리를 고르고 되돌리는 자리' },
  { upTo: 21, title: '화면 이동', lead: '탭과 뒤로가기, 아직 자리만 잡아 둔 화면들' },
  { upTo: 23, title: '공용 UI', lead: '앱이 쓰는 부품을 한자리에 모아 둔 개발용 화면' },
  { upTo: 29, title: '내역과 수정', lead: '달력으로 다시 보고, 찾고, 고치고, 지우는 자리' },
  { upTo: 34, title: '예산', lead: '한 달 쓸 돈을 정하고, 카테고리로 쪼개고, 다음 달로 이어 쓰는 자리' },
  {
    upTo: 999,
    title: '줄글 입력',
    lead: '한 줄에 적으면 여러 건으로 갈라 읽고, 검토해서 한 번에 저장하는 자리',
  },
];

function groupOf(no) {
  const n = Number(no);
  return GROUPS.find((group) => n <= group.upTo) ?? GROUPS[GROUPS.length - 1];
}

function renderIndex(clips) {
  const total = clips.reduce((sum, clip) => sum + clip.duration, 0);
  const items = clips.map((clip, index) => ({ ...clip, ...split(clip.base), index }));

  const sections = GROUPS.map((group) => {
    const mine = items.filter((item) => groupOf(item.no) === group);
    if (mine.length === 0) return '';
    const cards = mine
      .map(
        (item) => `        <button class="card" type="button" data-index="${item.index}">
          <img class="card__shot" src="${encodeURI(item.thumb)}" alt="" loading="lazy">
          <span class="card__no">${item.no}</span>
          <span class="card__body">
            <span class="card__title">${escapeHtml(item.title)}</span>
            <span class="card__dur">${item.duration.toFixed(0)}초</span>
          </span>
        </button>`,
      )
      .join('\n');
    return `    <section class="group">
      <h2>${escapeHtml(group.title)}</h2>
      <p class="group__lead">${escapeHtml(group.lead)}</p>
      <div class="grid">
${cards}
      </div>
    </section>`;
  })
    .filter(Boolean)
    .join('\n');

  const data = items.map((item) => ({
    no: item.no,
    title: item.title,
    file: item.file,
    duration: Math.round(item.duration),
  }));

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>10초 가계부 화면 동작 영상</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #F2F4F6; --card: #FFFFFF; --ink: #191F28; --muted: #6B7684;
    --line: #E5E8EB; --accent: #3182F6; --shadow: 0 1px 3px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.05);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #17181C; --card: #21232A; --ink: #EDEFF2; --muted: #9AA1AC;
      --line: #2E3138; --shadow: 0 1px 3px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.28);
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 56px 28px 96px; background: var(--bg); color: var(--ink);
    font: 15px/1.65 -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', sans-serif;
    letter-spacing: -.2px;
  }
  .wrap { max-width: 1180px; margin: 0 auto; }

  .head { margin-bottom: 56px; }
  .head h1 { margin: 0 0 14px; font-size: 32px; font-weight: 800; letter-spacing: -.9px; }
  .head p { margin: 0; color: var(--muted); max-width: 62ch; }
  .badges { margin-top: 22px; display: flex; gap: 8px; flex-wrap: wrap; }
  .badges span {
    padding: 7px 14px; border-radius: 999px; background: var(--card);
    border: 1px solid var(--line); font-size: 13px; font-weight: 700;
  }

  .group { margin-bottom: 56px; }
  .group h2 { margin: 0 0 6px; font-size: 20px; font-weight: 800; letter-spacing: -.5px; }
  .group__lead { margin: 0 0 22px; color: var(--muted); font-size: 14px; }

  .grid { display: grid; gap: 20px; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }
  .card {
    position: relative; display: block; padding: 0; border: 1px solid var(--line);
    border-radius: 16px; background: var(--card); box-shadow: var(--shadow);
    cursor: pointer; text-align: left; overflow: hidden; color: inherit; font: inherit;
    transition: transform .16s ease, box-shadow .16s ease;
  }
  .card:hover, .card:focus-visible { transform: translateY(-3px); box-shadow: 0 6px 12px rgba(0,0,0,.08), 0 18px 40px rgba(0,0,0,.1); }
  .card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .card__shot { display: block; width: 100%; aspect-ratio: 412 / 500; object-fit: cover; object-position: top center; background: #000; }
  .card__no {
    position: absolute; top: 10px; left: 10px; min-width: 26px; height: 26px; padding: 0 7px;
    border-radius: 8px; background: rgba(25,31,40,.82); color: #fff;
    font-size: 12px; font-weight: 800; display: grid; place-items: center;
  }
  .card__body { display: flex; align-items: baseline; gap: 8px; padding: 13px 14px 15px; }
  .card__title { flex: 1; font-size: 14px; font-weight: 700; line-height: 1.45; letter-spacing: -.3px; }
  .card__dur { flex: none; font-size: 12px; color: var(--muted); font-weight: 600; }

  .modal { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 24px; }
  /* display 를 클래스에서 정하면 hidden 속성이 먹지 않는다. 그러면 닫혀 있어야 할 모달이
     화면 전체를 덮은 채로 남아 카드를 아예 누를 수 없다. */
  .modal[hidden] { display: none; }
  .modal::before { content: ''; position: absolute; inset: 0; background: rgba(0,0,0,.62); }
  .modal__box {
    position: relative; display: flex; flex-direction: column; gap: 14px;
    max-height: calc(100vh - 48px);
  }
  .modal__top { display: flex; align-items: center; gap: 12px; color: #fff; }
  .modal__no {
    flex: none; min-width: 28px; height: 28px; padding: 0 8px; border-radius: 8px;
    background: var(--accent); font-size: 12px; font-weight: 800; display: grid; place-items: center;
  }
  .modal__title { flex: 1; font-size: 16px; font-weight: 700; letter-spacing: -.3px; }
  .modal__close {
    flex: none; width: 34px; height: 34px; border: 0; border-radius: 50%;
    background: rgba(255,255,255,.16); color: #fff; font-size: 18px; cursor: pointer;
  }
  .modal__close:hover { background: rgba(255,255,255,.28); }
  .modal video {
    display: block; max-height: calc(100vh - 190px); max-width: 100%;
    border-radius: 14px; background: #000;
  }
  .modal__bottom { display: flex; align-items: center; gap: 12px; }
  .modal__bottom button {
    padding: 9px 16px; border: 0; border-radius: 10px; background: rgba(255,255,255,.16);
    color: #fff; font: inherit; font-weight: 700; font-size: 13px; cursor: pointer;
  }
  .modal__bottom button:hover:not(:disabled) { background: rgba(255,255,255,.28); }
  .modal__bottom button:disabled { opacity: .35; cursor: default; }
  .modal__hint { flex: 1; text-align: right; color: rgba(255,255,255,.72); font-size: 12px; }

  footer { max-width: 1180px; margin: 64px auto 0; color: var(--muted); font-size: 13px; line-height: 1.7; }

  @media (max-width: 560px) {
    body { padding: 36px 18px 72px; }
    .head h1 { font-size: 25px; }
    .grid { gap: 14px; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <h1>10초 가계부 화면 동작 영상</h1>
      <p>실제로 도는 앱을 브라우저에서 녹화한 것이다. 화면 위 파란 물결은 그 자리를 눌렀다는 표시이고, 위쪽 검은 줄은 지금 무엇을 하는 중인지 알려 주는 자막이다. 카드를 누르면 크게 재생된다.</p>
      <div class="badges">
        <span>영상 ${clips.length}개</span>
        <span>전체 ${Math.round(total / 60)}분</span>
        <span>${clips[0]?.width ?? 0}×${clips[0]?.height ?? 0}</span>
      </div>
    </div>

${sections}
  </div>

  <div class="modal" id="modal" hidden>
    <div class="modal__box">
      <div class="modal__top">
        <span class="modal__no" id="mNo"></span>
        <span class="modal__title" id="mTitle"></span>
        <button class="modal__close" id="mClose" type="button" aria-label="닫기">&times;</button>
      </div>
      <video id="mVideo" controls autoplay playsinline></video>
      <div class="modal__bottom">
        <button id="mPrev" type="button">← 이전</button>
        <button id="mNext" type="button">다음 →</button>
        <span class="modal__hint">Esc · 바깥 클릭 · 오른쪽 위 &times; 로 닫습니다</span>
      </div>
    </div>
  </div>

  <footer>
    글꼴은 실제 앱과 다르게 보일 수 있다. 녹화한 곳에서 Pretendard 를 받지 못해 시스템 글꼴로 그려졌다.<br>
    광고 자리에 보이는 점선 상자는 개발용 목 SDK 가 그리는 것이다. 실기기에서는 그 자리에 실제 배너가 붙는다.
  </footer>

<script>
  const CLIPS = ${JSON.stringify(data)};
  const modal = document.getElementById('modal');
  const video = document.getElementById('mVideo');
  const mNo = document.getElementById('mNo');
  const mTitle = document.getElementById('mTitle');
  const mPrev = document.getElementById('mPrev');
  const mNext = document.getElementById('mNext');
  let current = -1;
  let opener = null;

  function open(index) {
    const clip = CLIPS[index];
    if (!clip) return;
    current = index;
    mNo.textContent = clip.no;
    mTitle.textContent = clip.title;
    video.src = encodeURI(clip.file);
    mPrev.disabled = index === 0;
    mNext.disabled = index === CLIPS.length - 1;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    video.play().catch(() => {});
  }

  function close() {
    video.pause();
    video.removeAttribute('src');
    video.load();
    modal.hidden = true;
    document.body.style.overflow = '';
    opener?.focus();
    current = -1;
  }

  function step(delta) {
    const next = current + delta;
    if (next >= 0 && next < CLIPS.length) open(next);
  }

  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', () => {
      opener = card;
      open(Number(card.dataset.index));
    });
  });

  document.getElementById('mClose').addEventListener('click', close);
  mPrev.addEventListener('click', () => step(-1));
  mNext.addEventListener('click', () => step(1));

  // 바깥(어두운 영역)을 누르면 닫는다. 상자 안을 누른 것은 그대로 둔다.
  modal.addEventListener('click', (event) => {
    if (event.target === modal) close();
  });

  document.addEventListener('keydown', (event) => {
    if (modal.hidden) return;
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowLeft') step(-1);
    else if (event.key === 'ArrowRight') step(1);
  });
</script>
</body>
</html>
`;
}

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
}

await main();
