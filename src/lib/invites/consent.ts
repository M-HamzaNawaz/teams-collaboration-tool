/**
 * Consent document constants (M4-06).
 *
 * The version string is stored on every consents row — bump it whenever the
 * text changes and returning users must re-consent. The text itself is the
 * decision-#6 placeholder; lawyer review is scheduled before Phase 4 and the
 * version bump on that edit is exactly why this constant exists.
 */
export const CONSENT_DOC_TYPE = 'nca' as const
export const CONSENT_DOC_VERSION = 'v1.0-placeholder'

export const CONSENT_DOC_TEXT = `Non-Circumvention & Platform Communication Agreement (v1.0 — placeholder)

By joining this workspace you agree that:

1. All project communication with clients and team members introduced
   through this platform happens ON the platform.

2. You will not share or solicit personal contact information (email,
   phone, messaging handles, payment accounts) with or from other members
   of this workspace, and you understand messages are automatically
   screened for such information.

3. Attempting to move the relationship off-platform to circumvent the
   agency is a breach of this agreement.

4. Messages you send may be held for review by a workspace administrator
   before delivery, and an audit record of platform activity is kept.

This is placeholder text for the pilot. A reviewed agreement will replace
it, and you will be asked to consent again to that version.`
