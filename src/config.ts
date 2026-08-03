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
