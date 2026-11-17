// Six43 brand fonts.
//
// Both families are licensed under the SIL Open Font License 1.1, which
// permits commercial use, embedding and self-hosting. next/font downloads the
// files at build time and serves them from our own domain; browsers make no
// requests to Google at runtime.
//
//   Bitter (display): https://fonts.google.com/specimen/Bitter
//   Inter  (UI):      https://fonts.google.com/specimen/Inter
//
// Scoped, not global: only the marketing homepage and the dev-only brand
// review page import this module and put the font variables on their own
// root element. The application's screens don't load these fonts.

import { Bitter, Inter } from 'next/font/google'

export const bitter = Bitter({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-brand-display',
})

export const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-brand-ui',
})
