/// <reference types="vite/client" />

import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </BrowserRouter>,
);

if (import.meta.env.PROD && window.isSecureContext && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Games remain available without a fetch while the application is open.
    });
  });
}
