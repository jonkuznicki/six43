// Pure function — usable on both client and server (no Node.js APIs).

export type BroadcastFeature = {
  icon: string
  title: string
  body: string
}

export type BroadcastPayload = {
  subject: string
  preheader: string
  headline: string
  intro: string
  features: BroadcastFeature[]
  ctaLabel: string
  ctaUrl: string
  signoff: string
}

export function buildBroadcastEmail(p: BroadcastPayload): { html: string; text: string } {
  const featureRows = p.features.map(f => `
    <tr>
      <td style="padding:0 0 20px 0;vertical-align:top;width:36px;font-size:22px;line-height:1">${f.icon}</td>
      <td style="padding:0 0 20px 16px;vertical-align:top">
        <div style="font-size:14px;font-weight:700;color:#0B1F3A;margin-bottom:3px">${f.title}</div>
        <div style="font-size:13px;color:#555;line-height:1.6">${f.body}</div>
      </td>
    </tr>`).join('')

  const signoffHtml = p.signoff ? `
    <tr>
      <td style="background:#fff;padding:0 28px 28px">
        <div style="border-top:1px solid #eee;padding-top:20px;font-size:13px;color:#666;line-height:1.6">${p.signoff}</div>
      </td>
    </tr>` : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${p.subject}</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#f0f2f5">
    ${p.preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f2f5;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%">

        <tr>
          <td style="background:#0B1F3A;border-radius:10px 10px 0 0;padding:20px 28px">
            <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td>
                <span style="font-size:26px;font-weight:900;letter-spacing:-1px;color:#fff">Six</span><span style="font-size:26px;font-weight:900;letter-spacing:-1px;color:#E8A020">43</span>
                <span style="font-size:11px;color:rgba(255,255,255,0.4);margin-left:8px">Lineup Builder</span>
              </td>
              <td align="right" style="font-size:11px;color:rgba(255,255,255,0.3)">six43.com</td>
            </tr></table>
          </td>
        </tr>

        <tr>
          <td style="background:#fff;padding:32px 28px 24px">
            <h1 style="margin:0 0 12px;font-size:24px;font-weight:800;color:#0B1F3A;line-height:1.25;letter-spacing:-0.3px">${p.headline}</h1>
            <p style="margin:0;font-size:15px;color:#444;line-height:1.65">${p.intro}</p>
          </td>
        </tr>

        ${p.features.length > 0 ? `
        <tr><td style="background:#fff;padding:0 28px"><div style="border-top:1px solid #eee"></div></td></tr>
        <tr>
          <td style="background:#fff;padding:24px 28px">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">${featureRows}</table>
          </td>
        </tr>` : ''}

        <tr>
          <td style="background:#fff;padding:4px 28px 32px;text-align:center">
            <a href="${p.ctaUrl}" style="display:inline-block;padding:14px 32px;background:#E8A020;color:#fff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:700">${p.ctaLabel}</a>
          </td>
        </tr>

        ${signoffHtml}

        <tr>
          <td style="background:#f7f8fa;border:1px solid #e8e8e8;border-top:none;border-radius:0 0 10px 10px;padding:16px 28px">
            <p style="margin:0;font-size:11px;color:#aaa;line-height:1.6">
              You're receiving this because you signed up at six43.com.<br>
              Questions? <a href="mailto:support@six43.com" style="color:#aaa">support@six43.com</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = [
    p.headline,
    '',
    p.intro,
    '',
    ...p.features.map(f => `${f.icon} ${f.title}\n${f.body}`),
    '',
    `${p.ctaLabel}: ${p.ctaUrl}`,
    p.signoff ? `\n${p.signoff}` : '',
    '\n---',
    "You're receiving this because you signed up at six43.com.",
    'Questions? support@six43.com',
  ].filter(l => l !== undefined).join('\n')

  return { html, text }
}
