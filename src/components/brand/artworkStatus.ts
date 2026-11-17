// ─────────────────────────────────────────────────────────────────────────────
// Logo artwork status.
//
// The Six43 wordmark and 643 diamond badge are outlined vector artwork,
// converted from the approved working designs (see ./artwork.ts). They stay
// 'draft' until the outlined SVGs pass visual review; while 'draft', pages
// that show the logos label them "Draft logo".
//
// Flip to 'final' only in the change that records that visual approval.
// ─────────────────────────────────────────────────────────────────────────────

export type ArtworkStatus = 'draft' | 'final'

export const ARTWORK_STATUS: ArtworkStatus = 'draft'
