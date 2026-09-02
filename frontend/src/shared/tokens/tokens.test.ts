import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  colors,
  donutRamp,
  fontFamily,
  fontSizes,
  fontWeights,
  radius,
  shadows,
  tokenToCssVar,
} from './index';

/** index.css 의 `@theme { … }` 안에 선언된 CSS 변수를 전부 읽어 온다. */
function readThemeVariables(css: string): Map<string, string> {
  const start = css.indexOf('@theme');
  if (start === -1) throw new Error('index.css 에 @theme 블록이 없다');

  let depth = 0;
  let end = -1;
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error('@theme 블록이 닫히지 않았다');

  const body = css.slice(start, end);
  const found = new Map<string, string>();
  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    found.set(name, value.replace(/\s+/g, ' ').trim());
  }
  return found;
}

// vitest 는 css:false 라 CSS 를 stub 으로 바꾼다. 파일을 그대로 읽어야 원문이 나온다.
const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf-8');
const theme = readThemeVariables(indexCss);

function expectSame(varName: string, value: string) {
  expect(theme.get(varName), `${varName} 가 index.css 에 없다`).toBe(value);
}

describe('디자인 토큰은 index.css 와 같은 값이어야 한다', () => {
  it('색', () => {
    for (const [key, value] of Object.entries(colors)) {
      expectSame(tokenToCssVar('color', key), value);
    }
  });

  it('도넛 램프', () => {
    donutRamp.forEach((value, i) => {
      expectSame(`--color-donut-${i + 1}`, value);
    });
    expect(theme.has(`--color-donut-${donutRamp.length + 1}`)).toBe(false);
  });

  it('반경', () => {
    for (const [key, value] of Object.entries(radius)) {
      expectSame(tokenToCssVar('radius', key), value);
    }
  });

  it('그림자', () => {
    for (const [key, value] of Object.entries(shadows)) {
      expectSame(tokenToCssVar('shadow', key), value);
    }
  });

  it('글자 크기와 굵기', () => {
    for (const [key, value] of Object.entries(fontSizes)) {
      expectSame(tokenToCssVar('text', key), value);
    }
    for (const [key, value] of Object.entries(fontWeights)) {
      expectSame(tokenToCssVar('font-weight', key), String(value));
    }
  });

  it('폰트 스택', () => {
    expectSame('--font-sans', fontFamily.sans);
  });
});
