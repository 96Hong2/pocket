import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// 토큰 정본은 index.css 의 @theme 이고, TS 사본과의 일치는 tokens.test.ts 가 지킨다.
import './index.css';
import App from './App';
import { entrySource } from './shared/lib/entrySource';

// 라우터가 주소를 바꾸기 전에 어디서 들어왔는지 읽어 둔다.
entrySource();

const container = document.getElementById('root');
if (container == null) {
  throw new Error('#root 를 찾지 못했어요.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
