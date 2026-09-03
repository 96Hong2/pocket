import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// 토큰 정본은 index.css 의 @theme 이고, TS 사본과의 일치는 tokens.test.ts 가 지킨다.
import './index.css';
import './app/shell.css';
import App from './App';

const container = document.getElementById('root');
if (container == null) {
  throw new Error('#root 를 찾지 못했어요.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
