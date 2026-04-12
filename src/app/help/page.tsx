import Link from 'next/link'

export const metadata = {
  title: 'Help & FAQ — Six43',
}

const s = {
  accent:  'var(--accent)',
  muted:   'rgba(var(--fg-rgb), 0.45)',
  dimmer:  'rgba(var(--fg-rgb), 0.28)',
  border:  '0.5px solid var(--border)',
  borderMd:'0.5px solid var(--border-md)',
  card:    'var(--bg-card)',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details style={{ marginBottom: '10px' }} open>
      <summary style={{
        cursor: 'pointer', listStyle: 'none', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 16px',
        background: s.card, border: s.borderMd, borderRadius: '10px',
        fontSize: '15px', fontWeight: 700, color: 'var(--fg)',
        userSelect: 'none',
      }}>
        {title}
        <span style={{ fontSize: '12px', color: s.dimmer, fontWeight: 400 }}>tap to toggle</span>
      </summary>
      <div style={{
        background: s.card, borderLeft: s.borderMd, borderRight: s.borderMd,
        borderBottom: s.borderMd, borderRadius: '0 0 10px 10px',
        padding: '16px',
      }}>
        {children}
      </div>
    </details>
  )
}

function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '5px', color: 'var(--fg)' }}>{q}</div>
      <div style={{ fontSize: '13px', color: s.muted, lineHeight: 1.6 }}>{children}</div>
    </div>
  )
}

function Step({ n, title, detail }: { n: number; title: string; detail: string }) {
  return (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '14px', alignItems: 'flex-start' }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
        background: 'rgba(232,160,32,0.15)', border: '0.5px solid var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '11px', fontWeight: 800, color: 'var(--accent)',
      }}>{n}</div>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '3px' }}>{title}</div>
        <div style={{ fontSize: '12px', color: s.muted, lineHeight: 1.5 }}>{detail}</div>
      </div>
    </div>
  )
}

function KbRow({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
      <div style={{ display: 'flex', gap: '4px', flexShrink: 0, minWidth: '140px' }}>
        {keys.map(k => (
          <code key={k} style={{
            fontSize: '11px', padding: '2px 6px', borderRadius: '4px',
            background: 'var(--bg)', border: s.borderMd,
            color: 'var(--fg)', fontFamily: 'ui-monospace, monospace',
          }}>{k}</code>
        ))}
      </div>
      <span style={{ fontSize: '12px', color: s.muted }}>{desc}</span>
    </div>
  )
}

export default function HelpPage() {
  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto',
      padding: '1.5rem 1rem 6rem',
    }}>
      <Link href="/dashboard" style={{ fontSize: '13px', color: s.muted, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>
        ‹ Home
      </Link>

      <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '4px' }}>Help &amp; FAQ</h1>
      <p style={{ fontSize: '13px', color: s.muted, marginBottom: '1.75rem', lineHeight: 1.5 }}>
        Everything you need to get the most out of Six43.
      </p>

      {/* ── Getting started ── */}
      <Section title="Getting started">
        <Step n={1} title="Create your team" detail="Go to Settings → add your team name and configure which field positions you use. You can also set a pitching innings limit per player here." />
        <Step n={2} title="Set up a season" detail="In Settings, create a season under your team. Give it a name (e.g. 'Spring 2025') and set how many innings per game. Activate it to make it the current season." />
        <Step n={3} title="Add players to your roster" detail="Go to Roster and add each player — first name, last name, jersey number, and preferred batting order. You can also set an innings target per player." />
        <Step n={4} title="Schedule your first game" detail="Go to Games → New game. Enter the opponent, date, time, and location. Once saved you can open the lineup builder." />
        <div style={{ marginTop: '4px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(232,160,32,0.08)', border: '0.5px solid rgba(232,160,32,0.25)' }}>
          <span style={{ fontSize: '12px', color: 'var(--accent)' }}>
            Tip: You can import your whole season schedule at once using GameChanger — see the section below.
          </span>
        </div>
      </Section>

      {/* ── Building a lineup ── */}
      <Section title="Building a lineup">
        <Q q="How do I open the lineup builder?">
          From the Games list, tap a game to open the game detail page, then tap <strong>Build lineup</strong>. On desktop, the full editor opens automatically.
        </Q>
        <Q q="How do I assign positions?">
          <strong>Click a cell</strong> to select it (nothing changes yet). Then click a position button in the palette, or press its keyboard shortcut, to fill it. You can shift+click to select a whole row of innings at once.
        </Q>
        <Q q="What does the Bench column mean?">
          It shows how many innings that player sits on the bench. If you have more players than fielding positions, some will bench each inning — Six43 tracks this automatically and flags anyone who is benching significantly more than their fair share.
        </Q>
        <Q q="Can I mark a player absent?">
          Yes — tap the small ✕ next to any player in the roster panel. Their innings clear and they move to an 'Absent' section. Tap ↩ to bring them back (their positions are restored from before they were marked absent).
        </Q>
        <Q q="What do the red highlights mean?">
          A red cell or ⚠ indicator means the same position is assigned to two players in the same inning. Fix it by reassigning one of them.
        </Q>
        <Q q="Can I copy a lineup from a previous game?">
          Yes — in the desktop editor, use <strong>Copy from…</strong> in the top bar to import batting order or full positions from any previous game.
        </Q>
      </Section>

      {/* ── Keyboard shortcuts (desktop) ── */}
      <Section title="Keyboard shortcuts (desktop lineup editor)">
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: s.dimmer, marginBottom: '10px' }}>Navigation</div>
          <KbRow keys={['↑', '↓', '←', '→']} desc="Move selected cell" />
          <KbRow keys={['Tab']} desc="Move right to next inning" />
          <KbRow keys={['Shift', '← →']} desc="Extend selection across innings (same row)" />
          <KbRow keys={['Shift+click']} desc="Extend selection to clicked cell (same row)" />
          <KbRow keys={['⌘+click']} desc="Toggle individual cells" />
          <KbRow keys={['Esc']} desc="Clear selection" />
        </div>
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: s.dimmer, marginBottom: '10px' }}>Filling positions</div>
          <KbRow keys={['p']} desc="Pitcher" />
          <KbRow keys={['c']} desc="Catcher" />
          <KbRow keys={['1', '2', 's', '3']} desc="1B, 2B, SS, 3B" />
          <KbRow keys={['l', 'm', 'r']} desc="LF, CF, RF" />
          <KbRow keys={['b']} desc="Bench" />
          <KbRow keys={['Del']} desc="Clear selected cells" />
        </div>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: s.dimmer, marginBottom: '10px' }}>Other</div>
          <KbRow keys={['⌘Z']} desc="Undo" />
          <KbRow keys={['⌘⇧Z']} desc="Redo" />
        </div>
      </Section>

      {/* ── GameChanger sync ── */}
      <Section title="Importing from GameChanger">
        <Q q="How do I connect GameChanger?">
          Go to <strong>Games → Import / connect GameChanger</strong>. Follow the steps to get your webcal link from the GameChanger mobile app, then paste it in. Six43 will import your schedule and automatically detect home vs. away games from the "vs" or "@" prefix in each event name.
        </Q>
        <Q q="What does 'Check for updates' do?">
          Once your GameChanger link is saved, a <strong>Check for updates</strong> button appears on the Games page. This compares your Six43 schedule against the current GameChanger calendar and shows you any new, changed, or removed games — you choose which changes to apply.
        </Q>
        <Q q="What happens to games I entered manually?">
          Games you added manually that don't appear in GameChanger will show as 'not in GameChanger' and default to <strong>unchecked</strong> in the review list — so they won't be deleted unless you explicitly check them.
        </Q>
        <Q q="My import showed a preview but nothing imported — why?">
          This usually happens when games on the same date with the same opponent already exist. Six43 skips exact duplicates. If you had manually entered games with slightly different opponent names, try the <strong>Check for updates</strong> flow instead, which matches by opponent name.
        </Q>
      </Section>

      {/* ── Player evaluations & notes ── */}
      <Section title="Player evaluations & notes">
        <Q q="Where do I find player evaluations?">
          Go to <strong>Roster</strong> (tap the Roster tab in the bottom nav) and switch to the <strong>Evaluations</strong> tab. Each player has a Notes button that opens their evaluation sheet.
        </Q>
        <Q q="How do I add a note from a game?">
          The fastest way is right from the game detail page. After a game, open it from the Games list and tap any player's name in the lineup — a note sheet slides up. Write your note while it's fresh, tap <strong>Save note</strong>, and it's logged under that player with the game's date. Tap <strong>View in Roster →</strong> to see all their notes.
        </Q>
        <Q q="What are skill scores?">
          In the Evaluations tab, each player has five skill sliders — Hitting, Fielding, Arm, Speed, and Coachability — rated 1–5. Tap a number to set or update the score. Scores are saved instantly and are used when generating evaluation reports.
        </Q>
        <Q q="What is an evaluation report?">
          At the end of the season, tap <strong>✦ Report</strong> next to a player in the Evaluations tab. Six43 uses your skill scores and all the notes you've logged to generate a personalized, parent-friendly summary you can share with the family. It reads naturally and focuses on growth and encouragement.
        </Q>
        <Q q="Are notes tied to a season?">
          Yes — notes are stored with both the player and the active season, so each season starts fresh. Previous seasons' notes are preserved in history but won't appear in the current Evaluations view.
        </Q>
      </Section>

      {/* ── Playing time ── */}
      <Section title="Playing time & fairness">
        <Q q="What is the Playing Time page?">
          It shows a season-to-date breakdown of how many innings each player has spent at each position — pitcher, catcher, infield, outfield, and bench. This helps you spot if anyone is consistently over- or under-played at any position.
        </Q>
        <Q q="What is the innings target?">
          You can set a target number of fielding innings per player in the Roster. The Playing Time page flags anyone who is tracking below their target.
        </Q>
        <Q q="How is the bench fairness color calculated?">
          In the lineup editor, each player's bench innings are compared to the expected bench innings (total bench slots ÷ active players × game length). Green means at or below expectation, amber means slightly over, red means significantly over.
        </Q>
      </Section>

      {/* ── FAQ ── */}
      <Section title="Frequently asked questions">
        <Q q="Can I have multiple teams?">
          Yes — go to Settings and add additional teams. You can switch between them on the Games page using the team selector at the top.
        </Q>
        <Q q="Can multiple coaches share access?">
          Yes — go to <strong>Settings → Staff tab</strong> and tap <strong>+ Invite coach</strong>. Enter their email address and tap Send. They'll receive an email notification with a link to sign in. If they already have a Six43 account, they're added to the team immediately. If not, they'll be added automatically the first time they sign in.
        </Q>
        <Q q="What is the difference between Admin and Staff?">
          The coach who created the team is the <strong>Admin</strong> — they have full control including inviting coaches, managing the roster, and editing lineups. <strong>Staff</strong> coaches are invited assistants. By default they can edit lineups and the roster. You can switch any staff coach to <strong>View only</strong> in the Staff tab, which lets them see everything but not make changes.
        </Q>
        <Q q="How do I see who has accepted my invite?">
          In the Staff tab, accepted coaches appear under <strong>Active</strong> with their email address and a Staff badge. Invites not yet accepted appear under <strong>Pending</strong>. You can revoke a pending invite at any time — just tap Remove next to the name.
        </Q>
        <Q q="A coach I invited says they don't see the team.">
          Ask them to sign in to Six43 and go to Settings — the team will appear under the <strong>Staff tab → Teams you coach</strong>. The dashboard will also show the team once they're signed in. If they still don't see it, try removing and re-inviting them from the Staff tab.
        </Q>
        <Q q="Can a staff coach see who else is on the team?">
          Yes — when a staff coach opens Settings, they see a <strong>Teams you coach</strong> section under the Staff tab. It lists the team Admin and all other accepted staff coaches, along with each person's permission level.
        </Q>
        <Q q="Can I print the lineup card?">
          Yes — from the desktop lineup editor, click <strong>Print</strong> in the top bar. This opens a printer-friendly view. You can also open a <strong>Mobile view</strong> from the same bar which works well on a phone at the field.
        </Q>
        <Q q="What is the exchange card?">
          The exchange card is a condensed lineup summary that you can hand to the opposing coach before the game. Open a game and tap <strong>Exchange card</strong> to generate it.
        </Q>
        <Q q="How do I change the number of innings in a game?">
          In the desktop lineup editor, use the − / + buttons in the top bar next to the innings count. You can also set a default innings-per-game when you create or edit a season in Settings.
        </Q>
        <Q q="I need help with something not listed here.">
          <span>Email us at <a href="mailto:support@six43.com" style={{ color: 'var(--accent)' }}>support@six43.com</a> or open an issue on GitHub.</span>
        </Q>
      </Section>
    </main>
  )
}
