// Building blocks for the marketing homepage: navigation, hero underline,
// pricing and footer.
// Server components with no client-side JavaScript; the mobile menu uses <details>.

import React from 'react'
import Link from 'next/link'
import styles from './marketing.module.css'
import { Wordmark, DiamondBadge } from '../brand'
import { UNDERLINE_PATH } from '../brand/Wordmark'
import { BRAND_TAGLINE } from '../../styles/brand'
import { CheckIcon, MenuIcon } from './icons'
import { APP_HREF, LOGIN_HREF, PRICING, SEO_LINKS, SIGNUP_HREF, SUPPORT_EMAIL } from './content'

export const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ')

export type NavLink = { href: string; label: string }

/* ── Navigation ────────────────────────────────────────────────────────────── */

export function Nav({ loggedIn, links }: { loggedIn: boolean; links: NavLink[] }) {
  return (
    <header className={styles.nav}>
      <div className={cx(styles.container, styles.navInner)}>
        <Link href="/" className={styles.brandLink} aria-label="Six43 home">
          <span className={styles.navBadge}><DiamondBadge size={36} title="" /></span>
          <Wordmark variant="compact" height={30} title="" />
        </Link>
        <nav className={styles.navLinks} aria-label="Primary">
          {links.map(l => <a key={l.href} href={l.href}>{l.label}</a>)}
        </nav>
        <div className={styles.navActions}>
          {loggedIn ? (
            <Link href={APP_HREF} className={cx(styles.btn, styles.btnPrimary, styles.btnSmall)}>Open app →</Link>
          ) : (
            <>
              <Link href={LOGIN_HREF} className={styles.navLogin}>Log in</Link>
              <Link href={SIGNUP_HREF} className={cx(styles.btn, styles.btnPrimary, styles.btnSmall, styles.navCta)}>Get started free</Link>
            </>
          )}
          <details className={styles.menu}>
            <summary aria-label="Menu"><MenuIcon /></summary>
            <div className={styles.menuPanel}>
              {links.map(l => <a key={l.href} href={l.href}>{l.label}</a>)}
              {!loggedIn && <Link href={LOGIN_HREF}>Log in</Link>}
              {!loggedIn && <Link href={SIGNUP_HREF} className={styles.menuCta}>Get started free</Link>}
            </div>
          </details>
        </div>
      </div>
    </header>
  )
}

/* ── Clay underline swash for the H1 ───────────────────────────────────────── */

export function Swash() {
  return (
    <svg className={styles.underlineSwash} viewBox="14 48 214 30" preserveAspectRatio="none" aria-hidden="true">
      <path d={UNDERLINE_PATH} fill="var(--brand-clay)" />
    </svg>
  )
}

/* ── Pricing (copy and links identical to the live homepage) ──────────────── */

export function Pricing() {
  return (
    <section id="pricing" className={cx(styles.section, styles.sectionPaper)} aria-labelledby="pricing-title">
      <div className={styles.container}>
        <div className={cx(styles.sectionHead, styles.sectionHeadCenter)}>
          <p className={styles.eyebrow}>{PRICING.eyebrow}</p>
          <h2 id="pricing-title" className={cx(styles.display, styles.h2)}>{PRICING.title}</h2>
          <p className={styles.lede}>{PRICING.intro}</p>
          <span className={styles.pill}>{PRICING.pill}</span>
        </div>
        <div className={styles.plans}>
          {PRICING.plans.map(p => (
            <article key={p.id} className={cx(styles.plan, p.highlighted && styles.planPro)} aria-label={`${p.name} plan`}>
              {p.badge && <span className={styles.planBadge}>{p.badge}</span>}
              <h3 className={styles.planName}>{p.name}</h3>
              {p.wasPrice && <div className={styles.planWas}><span className={styles.srOnly}>Regular price </span>{p.wasPrice}</div>}
              <div className={styles.planPrice}>{p.price}</div>
              <div className={styles.planNote}>{p.note}</div>
              <ul className={styles.planFeatures}>
                {p.features.map(f => (
                  <li key={f}>
                    <span className={styles.check}><CheckIcon color={p.highlighted ? '#E38B7C' : 'var(--brand-clay)'} /></span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link href={p.cta.href} className={cx(styles.btn, styles.btnBlock, p.highlighted ? styles.btnOnDark : styles.btnPrimary)}>
                {p.cta.label}
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Footer ────────────────────────────────────────────────────────────────── */

export function Footer({ productLinks }: { productLinks: NavLink[] }) {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.footerGrid}>
          <div className={styles.footerBrand}>
            <div style={{ display: 'flex' }}>
              <Wordmark tone="onDark" height={44} />
            </div>
            <p className={styles.footerTagline}>{BRAND_TAGLINE}</p>
            <p style={{ margin: 0 }}>Lineups, game day and playing time for youth baseball &amp; softball coaches.</p>
          </div>
          <div>
            <h2 className={styles.footerHeading}>Product</h2>
            <ul className={styles.footerList}>
              {productLinks.map(l => <li key={l.href}><a href={l.href}>{l.label}</a></li>)}
              <li><Link href={LOGIN_HREF}>Log in</Link></li>
            </ul>
          </div>
          <div>
            <h2 className={styles.footerHeading}>Resources</h2>
            <ul className={styles.footerList}>
              {SEO_LINKS.map(l => <li key={l.href}><Link href={l.href}>{l.label}</Link></li>)}
              <li><Link href="/help">Help</Link></li>
            </ul>
          </div>
          <div>
            <h2 className={styles.footerHeading}>Contact</h2>
            <ul className={styles.footerList}>
              <li><a href={`mailto:${SUPPORT_EMAIL}?subject=Six43 feedback`}>{SUPPORT_EMAIL}</a></li>
              <li><Link href="/privacy">Privacy</Link></li>
            </ul>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <span>Six43 · {BRAND_TAGLINE}</span>
          <span>Questions or feedback? {SUPPORT_EMAIL}</span>
        </div>
      </div>
    </footer>
  )
}
