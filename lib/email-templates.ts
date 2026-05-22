type TemplateOptions = {
  title: string
  preview: string
  body: string[]
  actionLabel?: string
  actionUrl?: string
  footer?: string
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function renderBrandedEmail({
  title,
  preview,
  body,
  actionLabel,
  actionUrl,
  footer = 'Sent by AxilDB, quietly keeping the plant records in order.',
}: TemplateOptions) {
  const text = [
    title,
    '',
    ...body,
    ...(actionUrl ? ['', `${actionLabel || 'Open AxilDB'}: ${actionUrl}`] : []),
    '',
    footer,
  ].join('\n')

  const paragraphs = body
    .map((line) => `<p style="margin:0 0 16px;color:#3f3a32;font-size:16px;line-height:1.55;">${escapeHtml(line)}</p>`)
    .join('')

  const action = actionUrl
    ? `<p style="margin:28px 0;"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;border-radius:8px;background:#2f6b45;color:#fffaf0;font-weight:700;text-decoration:none;padding:12px 18px;">${escapeHtml(actionLabel || 'Open AxilDB')}</a></p>`
    : ''

  const html = `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;background:#f7f1e5;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">${escapeHtml(preview)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f1e5;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;border:1px solid #ddd1bd;border-radius:16px;background:#fffaf0;box-shadow:0 18px 50px rgba(47,38,24,.08);overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 18px;border-bottom:1px solid #eadfcb;background:#fffdf7;">
                <div style="color:#2f6b45;font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:12px;">AxilDB</div>
                <h1 style="margin:8px 0 0;color:#25221d;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;">${escapeHtml(title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                ${paragraphs}
                ${action}
                <p style="margin:28px 0 0;color:#756f64;font-size:13px;line-height:1.5;">${escapeHtml(footer)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { text, html }
}

export function welcomeEmail(email: string, verifyUrl?: string) {
  return renderBrandedEmail({
    title: 'Welcome to AxilDB',
    preview: 'Your AxilDB account is ready.',
    body: [
      `An AxilDB account has been created for ${email}.`,
      'You can now help tend the collection records: plants, blooms, propagations, notes, photos, and the little trails of evidence that make a plant database useful.',
      verifyUrl ? 'Please verify this email address so account recovery and future reminders can reach you.' : 'You can sign in whenever you are ready.',
    ],
    actionLabel: verifyUrl ? 'Verify email' : 'Open AxilDB',
    actionUrl: verifyUrl,
  })
}

export function passwordResetEmail(resetUrl: string) {
  return renderBrandedEmail({
    title: 'Reset your AxilDB password',
    preview: 'Use this single-use link to reset your password.',
    body: [
      'We received a request to reset your AxilDB password.',
      'This link is single-use and expires soon. If you did not request it, you can ignore this email.',
    ],
    actionLabel: 'Reset password',
    actionUrl: resetUrl,
  })
}

export function magicLoginEmail(loginUrl: string) {
  return renderBrandedEmail({
    title: 'Your AxilDB sign-in link',
    preview: 'Use this single-use link to sign in.',
    body: [
      'Use this secure link to sign in to AxilDB.',
      'It is single-use and expires soon. If you did not request it, you can ignore this email.',
    ],
    actionLabel: 'Sign in to AxilDB',
    actionUrl: loginUrl,
  })
}

export function reminderEmail(title: string, recordUrl: string, lines: string[]) {
  return renderBrandedEmail({
    title,
    preview: 'A gentle AxilDB reminder is ready.',
    body: lines,
    actionLabel: 'Open record',
    actionUrl: recordUrl,
  })
}

export function followNotificationEmail(title: string, recordUrl: string, lines: string[]) {
  return renderBrandedEmail({
    title,
    preview: 'Something changed in a plant record you follow.',
    body: lines,
    actionLabel: 'Open update',
    actionUrl: recordUrl,
  })
}

export function transferWorkflowEmail(title: string, actionUrl: string, lines: string[]) {
  return renderBrandedEmail({
    title,
    preview: 'A collection transfer workflow needs your attention.',
    body: lines,
    actionLabel: 'Open transfers',
    actionUrl,
  })
}
