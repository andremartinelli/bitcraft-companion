/**
 * Vercel previews: each has its own Neon branch (a copy of production), and
 * whoever opens one without a session goes straight into the test account
 * (src/app/preview_session, made by scripts/preview_prepare.ts). Nothing of
 * this exists outside a preview. Kept apart so the proxy imports no database.
 */

export const PREVIEW_EMAIL = 'preview@example.com'

/** Vercel sets VERCEL_ENV; only "preview" counts (production, dev and tests do not) */
export const isPreview = () => process.env.VERCEL_ENV === 'preview'
