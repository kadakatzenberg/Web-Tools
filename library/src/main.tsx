import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/global.css';
import './styles/components.css';

const host = document.getElementById('root');
if (!host) throw new Error('No #root to mount into.');

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * A link inside the app that was rendered as a real `<a href>` — the cards,
 * the brand — is handled by its own click handler. Anything else that reaches
 * here is a hard navigation, which is correct.
 *
 * This only intercepts the browser's default for same-origin anchors that
 * React did not claim, so the archive behaves like one document rather than
 * reloading the shell.
 */
document.addEventListener('click', (event) => {
  if (event.defaultPrevented) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;

  const anchor = (event.target as Element | null)?.closest?.('a');
  if (!anchor) return;
  if (anchor.target && anchor.target !== '_self') return;
  if (anchor.hasAttribute('download')) return;

  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#')) return;

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return;

  // Let the app's own handlers run first; if none claimed it, this is a link
  // to somewhere the router understands, so let the router have it.
  event.preventDefault();
  window.history.pushState(null, '', `${url.pathname}${url.search}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
});
