import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy — Six43',
}

const s = {
  muted:    'rgba(var(--fg-rgb), 0.5)',
  dimmer:   'rgba(var(--fg-rgb), 0.35)',
  border:   '0.5px solid var(--border-md)',
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px', marginTop: '2rem' }}>
      {children}
    </h2>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: '14px', lineHeight: 1.7, color: s.muted, marginBottom: '10px' }}>
      {children}
    </p>
  )
}

export default function PrivacyPage() {
  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif', maxWidth: '640px', margin: '0 auto',
      padding: '2rem 1.5rem 6rem',
    }}>
      <Link href="/" style={{
        fontSize: '13px', color: s.dimmer, textDecoration: 'none',
        display: 'block', marginBottom: '1.5rem',
      }}>
        ‹ Six43
      </Link>

      <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '6px' }}>Privacy Policy</h1>
      <p style={{ fontSize: '13px', color: s.dimmer, marginBottom: '2rem' }}>
        Last updated: April 13, 2026
      </p>

      <P>
        Six43 ("we", "us", or "our") is a youth baseball lineup management tool operated by Jon
        Kuznicki. This policy explains what personal data we collect, how we use it, and your rights
        regarding that data.
      </P>

      <H2>1. Data We Collect</H2>
      <P>
        <strong>Account data</strong> — your email address and password (stored as a secure hash),
        collected when you sign up. We use Supabase for authentication and database storage.
      </P>
      <P>
        <strong>Team and roster data</strong> — team names, player names (first name, last name,
        jersey numbers), game schedules, lineup assignments, and pitch count records that you
        enter into the app.
      </P>
      <P>
        <strong>Usage data</strong> — basic server logs (IP address, browser type, pages visited)
        collected automatically by our hosting provider, Vercel.
      </P>
      <P>
        We do not collect payment information directly. If we add paid plans in the future, payment
        processing will be handled by a third-party processor and we will update this policy.
      </P>

      <H2>2. How We Use Your Data</H2>
      <P>
        We use your data solely to provide the Six43 service — to store and display your team
        schedules, lineups, and roster. We do not sell your data to third parties, use it for
        advertising, or share it with anyone outside the service providers listed below.
      </P>

      <H2>3. Third-Party Service Providers</H2>
      <P>
        <strong>Supabase</strong> (database and authentication) — your account and team data is
        stored on Supabase infrastructure. See{' '}
        <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer"
          style={{ color: 'var(--accent)' }}>supabase.com/privacy</a>.
      </P>
      <P>
        <strong>Vercel</strong> (hosting) — the app is served from Vercel's infrastructure. See{' '}
        <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer"
          style={{ color: 'var(--accent)' }}>vercel.com/legal/privacy-policy</a>.
      </P>

      <H2>4. Data Retention</H2>
      <P>
        We retain your data for as long as your account is active. If you delete your account, all
        associated data (teams, players, games, lineups) is permanently deleted from our database.
      </P>

      <H2>5. Your Rights</H2>
      <P>
        Depending on where you live, you may have the right to:
      </P>
      <ul style={{ paddingLeft: '1.25rem', marginBottom: '10px' }}>
        {[
          'Access the personal data we hold about you',
          'Request correction of inaccurate data',
          'Request deletion of your account and all associated data',
          'Object to or restrict our processing of your data',
          'Data portability (receive a copy of your data in a machine-readable format)',
        ].map((item, i) => (
          <li key={i} style={{ fontSize: '14px', lineHeight: 1.7, color: s.muted, marginBottom: '4px' }}>
            {item}
          </li>
        ))}
      </ul>
      <P>
        To exercise any of these rights, email us at{' '}
        <a href="mailto:support@six43.com" style={{ color: 'var(--accent)' }}>support@six43.com</a>.
        We will respond within 30 days.
      </P>

      <H2>6. Cookies</H2>
      <P>
        We use a single session cookie to keep you logged in. We do not use tracking cookies or
        third-party analytics cookies.
      </P>

      <H2>7. Children's Privacy</H2>
      <P>
        Six43 is intended for use by coaches and team administrators who are adults. We do not
        knowingly collect personal information from children under 13. Player records (names,
        jersey numbers) entered by coaches are not linked to any child's account.
      </P>

      <H2>8. Changes to This Policy</H2>
      <P>
        We may update this policy from time to time. We will notify registered users by email of
        any material changes. The "last updated" date at the top of this page will always reflect
        the most recent revision.
      </P>

      <H2>9. Contact</H2>
      <P>
        Questions about this policy?{' '}
        <a href="mailto:support@six43.com" style={{ color: 'var(--accent)' }}>support@six43.com</a>
      </P>

      <div style={{
        marginTop: '3rem', paddingTop: '1.5rem',
        borderTop: s.border,
        fontSize: '12px', color: s.dimmer,
      }}>
        <Link href="/" style={{ color: s.dimmer, textDecoration: 'none' }}>six43.com</Link>
      </div>
    </main>
  )
}
