// Six43 broadcast email template.
// Returns { subject, html, text } ready to pass to Resend.
// Edit `subject` and the `intro` / `features` / `cta` sections below
// before each send — everything else (header, footer, styling) stays constant.

export function buildBroadcastEmail(opts: {
  subject: string
  preheader: string        // short preview text shown in inbox
  headline: string         // large hero text
  intro: string            // 1–2 sentence intro below headline
  features: { icon: string; title: string; body: string }[]
  ctaLabel: string
  ctaUrl: string
  signoff?: string         // optional P.S. line at the bottom
}): { subject: string; html: string; text: string } {
  const { subject, preheader, headline, intro, features, ctaLabel, ctaUrl, signoff } = opts

  const featureRows = features.map(f => `
    <tr>
      <td style="padding:0 0 20px 0;vertical-align:top;width:36px;font-size:22px;line-height:1">
        ${f.icon}
      </td>
      <td style="padding:0 0 20px 16px;vertical-align:top">
        <div style="font-size:14px;font-weight:700;color:#0B1F3A;margin-bottom:3px">${f.title}</div>
        <div style="font-size:13px;color:#555;line-height:1.6">${f.body}</div>
      </td>
    </tr>
  `).join('')

  const textFeatures = features.map(f => `${f.icon} ${f.title}\n${f.body}`).join('\n\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${subject}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">

  <!-- Preheader (hidden preview text) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#f0f2f5">
    ${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f2f5;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%">

        <!-- Header -->
        <tr>
          <td style="background:#0B1F3A;border-radius:10px 10px 0 0;padding:20px 28px">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>
                  <span style="font-size:26px;font-weight:900;letter-spacing:-1px;color:#fff">Six</span><span style="font-size:26px;font-weight:900;letter-spacing:-1px;color:#E8A020">43</span>
                  <span style="font-size:11px;color:rgba(255,255,255,0.4);margin-left:8px;letter-spacing:0.04em">Lineup Builder</span>
                </td>
                <td align="right" style="font-size:11px;color:rgba(255,255,255,0.3)">six43.com</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Hero -->
        <tr>
          <td style="background:#fff;padding:32px 28px 24px">
            <h1 style="margin:0 0 12px;font-size:24px;font-weight:800;color:#0B1F3A;line-height:1.25;letter-spacing:-0.3px">
              ${headline}
            </h1>
            <p style="margin:0;font-size:15px;color:#444;line-height:1.65">
              ${intro}
            </p>
          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="background:#fff;padding:0 28px">
            <div style="border-top:1px solid #eee"></div>
          </td>
        </tr>

        <!-- Features -->
        <tr>
          <td style="background:#fff;padding:24px 28px">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              ${featureRows}
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="background:#fff;padding:4px 28px 32px;text-align:center">
            <a href="${ctaUrl}"
              style="display:inline-block;padding:14px 32px;background:#E8A020;color:#fff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:700;letter-spacing:0.02em">
              ${ctaLabel}
            </a>
          </td>
        </tr>

        ${signoff ? `
        <!-- Sign-off -->
        <tr>
          <td style="background:#fff;padding:0 28px 28px">
            <div style="border-top:1px solid #eee;padding-top:20px;font-size:13px;color:#666;line-height:1.6">
              ${signoff}
            </div>
          </td>
        </tr>
        ` : ''}

        <!-- Footer -->
        <tr>
          <td style="background:#f7f8fa;border:1px solid #e8e8e8;border-top:none;border-radius:0 0 10px 10px;padding:16px 28px">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-size:11px;color:#aaa;line-height:1.6">
                  You're receiving this because you signed up at six43.com.<br>
                  Questions? Reply to this email or contact <a href="mailto:support@six43.com" style="color:#aaa">support@six43.com</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = `${headline}

${intro}

${textFeatures}

${ctaLabel}: ${ctaUrl}

${signoff ?? ''}

---
You're receiving this because you signed up at six43.com.
Questions? support@six43.com`

  return { subject, html, text }
}


// ─────────────────────────────────────────────────────────────────────────────
// CURRENT BROADCAST — edit this before each send
// ─────────────────────────────────────────────────────────────────────────────
export function currentBroadcast() {
  return buildBroadcastEmail({
    subject: "What's new in Six43 — lineups, pitching, tournaments & more",
    preheader: "Build fairer lineups, track pitch counts, and plan your whole season from your phone.",
    headline: "Your season, fully organized.",
    intro: "Six43 is a free lineup builder for youth baseball and softball coaches. Here's a quick look at what it can do — in case you haven't tried everything yet.",
    features: [
      {
        icon: '📋',
        title: 'Lineup builder',
        body: 'Assign positions inning by inning. Track who played where and how long — all season.',
      },
      {
        icon: '📊',
        title: 'Playing time fairness',
        body: 'See bench time and innings by position at a glance. Know before game day if a kid is getting shorted.',
      },
      {
        icon: '⚾',
        title: 'Pitch count tracking',
        body: 'Log counts, set per-game limits, and track rest days. Over-limit warnings keep you on the right side of pitch rules.',
      },
      {
        icon: '🔄',
        title: 'GameChanger sync',
        body: 'Paste your webcal link and your full schedule imports in seconds. Re-sync anytime to catch date changes.',
      },
      {
        icon: '🏆',
        title: 'Tournament planning',
        body: 'Add placeholder games before the bracket drops. Swap in real opponents when the schedule is confirmed — lineups carry over.',
      },
      {
        icon: '🖨️',
        title: 'Print lineup cards',
        body: 'One tap to print a full lineup sheet and an exchange card for the opposing coach.',
      },
    ],
    ctaLabel: 'Open Six43',
    ctaUrl: 'https://six43.com/dashboard',
    signoff: '— Jon at Six43<br><span style="color:#aaa">Built by a baseball coach dad, for coaches.</span>',
  })
}
