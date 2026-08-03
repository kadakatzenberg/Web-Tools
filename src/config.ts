/**
 * ---------------------------------------------------------------------------
 * CONTACT CONFIGURATION
 * ---------------------------------------------------------------------------
 * Every call to action on this page points at this single value. Replace it
 * with the live destination the China Excursion team uses to take enquiries
 * (booking form, enquiry page, or messaging link) before the site goes public.
 * ---------------------------------------------------------------------------
 */
export const CONTACT_TEAM_URL = 'REPLACE_WITH_CONTACT_TEAM_URL';

/** True once the value above has been pointed at a real destination. */
export const CONTACT_TEAM_URL_CONFIGURED =
  CONTACT_TEAM_URL !== 'REPLACE_WITH_CONTACT_TEAM_URL';

/** Opens the enquiry destination in a new tab only when it leaves this site. */
export const CONTACT_LINK_ATTRS = CONTACT_TEAM_URL_CONFIGURED
  ? 'target="_blank" rel="noopener noreferrer"'
  : '';

/**
 * A loud, unmissable notice during development if the destination is still
 * unset. Production builds are stopped by the guard in vite.config.ts instead,
 * so this never reaches a visitor.
 */
export function warnIfContactUnset(): void {
  if (CONTACT_TEAM_URL_CONFIGURED || !import.meta.env.DEV) return;
  const notice = document.createElement('div');
  notice.setAttribute('role', 'status');
  notice.style.cssText = [
    'position:fixed',
    'inset:auto 0 0 0',
    'z-index:9999',
    'padding:0.9rem 1.2rem',
    'background:#b3261e',
    'color:#fff',
    'font:600 13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
    'letter-spacing:0.04em',
    'text-align:center',
  ].join(';');
  notice.textContent =
    'DEVELOPMENT ONLY — CONTACT_TEAM_URL is not set. Every call to action leads nowhere. Set it in src/config.ts before building for production.';
  document.body.append(notice);
}
