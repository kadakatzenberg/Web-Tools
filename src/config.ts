/**
 * ---------------------------------------------------------------------------
 * CONTACT CONFIGURATION
 * ---------------------------------------------------------------------------
 * Every call to action on this page points at this single value.
 *
 * While it is null the buttons still render, still take focus, and still
 * respond to a click. They simply do not go anywhere, which is the intended
 * state until the team's enquiry destination exists. They are marked
 * `aria-disabled` so assistive technology announces that nothing follows the
 * press, and the page never pretends otherwise.
 *
 * To wire them up, put the destination here. All ten buttons become real links
 * at once, opening in a new tab when the destination leaves this site.
 * ---------------------------------------------------------------------------
 */
export const CONTACT_TEAM_URL: string | null = null;

/** True once the value above points at a real destination. */
export const CONTACT_TEAM_URL_CONFIGURED = typeof CONTACT_TEAM_URL === 'string';

/** Opens the enquiry destination in a new tab only when it leaves this site. */
export const CONTACT_LINK_ATTRS =
  CONTACT_TEAM_URL_CONFIGURED && /^https?:/i.test(CONTACT_TEAM_URL ?? '')
    ? 'target="_blank" rel="noopener noreferrer"'
    : '';
