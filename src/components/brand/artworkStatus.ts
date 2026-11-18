// ─────────────────────────────────────────────────────────────────────────────
// Logo artwork status.
//
// The Six43 wordmark and 643 diamond badge are outlined vector artwork,
// converted from the approved working designs (see ./artwork.ts). The outlined
// SVGs were visually approved for launch on 2026-11-17.
//
// If the artwork in ./artwork.ts changes, set this back to 'draft' until the
// new version has been reviewed on /dev/brand.
// ─────────────────────────────────────────────────────────────────────────────

export type ArtworkStatus = 'draft' | 'final'

export const ARTWORK_STATUS: ArtworkStatus = 'final'
