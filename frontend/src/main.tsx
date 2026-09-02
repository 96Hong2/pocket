import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// TODO: shared/tokens 가 전역 스타일시트를 내놓으면 index.css 대신 그쪽을 쓴다.
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
