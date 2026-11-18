// Six43 marketing homepage (served at /).
//
// Structure: nav → hero (headline, one sentence, one CTA, lineup-builder demo
// over the field-at-dusk photo) → three feature highlights → pricing
// (unchanged from the previous homepage) → closing CTA over the base photo →
// footer. Product demos keep the app's current navy colors.
//
// Server components only; no client-side JavaScript (the mobile menu uses
// <details>). The page uses its own brand palette and fonts, so it looks the
// same whatever app theme a visitor has chosen.

import React from 'react'
import Link from 'next/link'
import styles from './marketing.module.css'
import { bitter, inter } from '../../styles/fonts'
import { DiamondBadge } from '../brand'
import { BRAND_TAGLINE } from '../../styles/brand'
import { PhotoSlot } from './PhotoSlot'
import { MARKETING_PHOTOS, SIGNUP_HREF } from './content'
import { Footer, Nav, Pricing, Swash, cx, type NavLink } from './shared'
import { BrowserMockup, FieldViewDemo, FullDesktopLineupEditor, InGameModeDemo } from './mockups/ProductMockups'
import { PlayingTimeDemo } from './mockups/AnalyticsMockups'
import { MobileLineupDemo } from './mockups/MobileLineupDemo'

export type HomepageProps = {
  loggedIn: boolean
}

export const NAV_LINKS: NavLink[] = [
  { href: '#highlights', label: 'Features' },
  { href: '#pricing',    label: 'Pricing' },
  { href: '/help',       label: 'Help' },
]

export const PRODUCT_LINKS: NavLink[] = [
  { href: '#highlights', label: 'Features' },
  { href: '#pricing',    label: 'Pricing' },
]

export const HERO_COPY = {
  lead: 'Less time planning. More time coaching.',
  body: 'Build better lineups, manage game day, and track playing time—all in one place.',
  micro: 'For youth baseball & softball coaches · Free to start · No credit card required',
}

export function Homepage({ loggedIn }: HomepageProps) {
  return (
    <div className={cx(styles.shell, bitter.variable, inter.variable, 'brand-fonts')}>
      <a href="#main" className={styles.srOnly}>Skip to content</a>
      <Nav loggedIn={loggedIn} links={NAV_LINKS} />
      <main id="main" className={styles.main}>
        <Hero />
        <Highlights />
        <Pricing />
        <ClosingCta />
      </main>
      <Footer productLinks={PRODUCT_LINKS} />
    </div>
  )
}

function Hero() {
  return (
    <section className={cx(styles.hero, styles.heroV2, styles.heroV3)} aria-labelledby="hero-title">
      <div className={cx(styles.container, styles.heroGrid)}>
        <div>
          <div className={styles.heroKicker}>
            <DiamondBadge size={44} title="" />
            <span className={styles.heroTagline}>{BRAND_TAGLINE}</span>
          </div>
          <h1 id="hero-title" className={cx(styles.display, styles.h1)}>
            Build the lineup.<br />
            <span className={styles.underlined}>Run the game.<Swash /></span>
          </h1>
          <p className={styles.lede}>
            <span className={styles.heroLedeStrong}>{HERO_COPY.lead}</span> {HERO_COPY.body}
          </p>
          <div className={styles.heroActions}>
            <Link href={SIGNUP_HREF} className={cx(styles.btn, styles.btnPrimary, styles.btnBlockMobile)}>Start building for free</Link>
          </div>
          <p className={styles.heroMicro}>{HERO_COPY.micro}</p>
        </div>

        <div className={styles.heroStage}>
          <PhotoSlot
            photo={MARKETING_PHOTOS.heroField}
            className={styles.heroPhoto}
            sizes="(min-width: 960px) 60vw, 100vw"
            priority
          />

          {/* Phones: readable, phone-sized lineup builder */}
          <div className={styles.heroDemoMobile} role="img" aria-label="Six43 lineup builder on a phone (product demo)">
            <div className={styles.phoneFrame} aria-hidden="true">
              <div className={styles.phoneNotch} />
              <div className={styles.phoneScreen}>
                <MobileLineupDemo />
              </div>
            </div>
          </div>

          {/* Tablet and desktop: the full lineup editor, larger on desktop */}
          <div className={cx(styles.heroBrowser, styles.heroDemoDesktop)}>
            <BrowserMockup>
              <div className={styles.heroZoom}>
                <FullDesktopLineupEditor />
              </div>
            </BrowserMockup>
          </div>
        </div>
      </div>
    </section>
  )
}

const HIGHLIGHTS = [
  {
    n: '01',
    title: 'Build lineups',
    body: 'Set every position for every inning on a grid or a live field diagram.',
    visual: <FieldViewDemo />,
    offset: -84,
    label: 'Field diagram view',
  },
  {
    n: '02',
    title: 'Manage game day',
    body: 'Full-screen Game Mode, a running scoreboard and print-ready lineup cards.',
    visual: <InGameModeDemo />,
    offset: 0,
    label: 'Game Mode',
  },
  {
    n: '03',
    title: 'Track playing time',
    body: 'Innings by position and time on the bench for every player, all season.',
    visual: <PlayingTimeDemo />,
    offset: 0,
    label: 'Playing time · sample data',
  },
]

function Highlights() {
  return (
    <section id="highlights" className={cx(styles.section, styles.sectionTightTop)} aria-labelledby="highlights-title">
      <div className={styles.container}>
        <div className={cx(styles.sectionHead, styles.sectionHeadCenter)}>
          <p className={styles.eyebrow}>What Six43 does</p>
          <h2 id="highlights-title" className={cx(styles.display, styles.h2)}>Plan it. Run it. Track it.</h2>
        </div>
        <div className={styles.highlights}>
          {HIGHLIGHTS.map(h => (
            <article key={h.n} className={styles.hlCard}>
              <div className={styles.hlVisual} role="img" aria-label={`${h.label} (product demo)`}>
                <div className={styles.hlCrop} style={{ top: h.offset }} aria-hidden="true">{h.visual}</div>
              </div>
              <div className={styles.hlBody}>
                <div className={styles.hlTitleRow}>
                  <span className={styles.hlNumeral} aria-hidden="true">{h.n}</span>
                  <h3 className={cx(styles.display, styles.h3)}>{h.title}</h3>
                </div>
                <p>{h.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function ClosingCta() {
  return (
    <section className={cx(styles.section, styles.cta, styles.ctaPhotoSection)} aria-labelledby="cta-title">
      <PhotoSlot photo={MARKETING_PHOTOS.closingCta} sizes="100vw" />
      <div className={cx(styles.container, styles.ctaInner, styles.ctaContent)}>
        <DiamondBadge size={64} title="" style={{ marginBottom: 20 }} />
        <h2 id="cta-title" className={cx(styles.display, styles.h2, styles.onDark)}>Ready to build your first lineup?</h2>
        <p className={cx(styles.lede, styles.ledeOnDark)}>Free to start — no credit card needed.</p>
        <Link href={SIGNUP_HREF} className={cx(styles.btn, styles.btnOnDark, styles.btnBlockMobile)}>Get started free</Link>
      </div>
    </section>
  )
}
