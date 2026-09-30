/** Minimal, email-client-safe HTML layout (tables + inline styles). */
function layout(opts: {
  preheader: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  footer: string;
}) {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<!doctype html><html><body style="margin:0;background:#f7f8fb;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#151925">
<span style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e1e4ec;border-radius:16px;overflow:hidden">
<tr><td style="background:#0a0d16;padding:22px 32px;color:#ffffff;font-size:15px;font-weight:600;letter-spacing:.2px">ARC LABS <span style="color:#979eb2;font-weight:500">Learning Platform</span></td></tr>
<tr><td style="padding:32px">
<h1 style="margin:0 0 12px;font-size:20px;line-height:28px;color:#151925">${esc(opts.heading)}</h1>
${opts.body}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px"><tr><td style="border-radius:10px;background:#2f45ef">
<a href="${esc(opts.ctaUrl)}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">${esc(opts.ctaLabel)}</a>
</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;line-height:18px;color:#6b7389">If the button doesn’t work, paste this link into your browser:<br><a href="${esc(opts.ctaUrl)}" style="color:#2f45ef;word-break:break-all">${esc(opts.ctaUrl)}</a></p>
</td></tr>
<tr><td style="padding:18px 32px;border-top:1px solid #eef0f5;font-size:12px;color:#979eb2">${esc(opts.footer)}</td></tr>
</table></td></tr></table></body></html>`;
}

const p = (html: string) =>
  `<p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#3b4153">${html}</p>`;
const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function inviteEmail(o: {
  name: string;
  orgName: string;
  inviterName: string;
  roles: string;
  link: string;
  isNewAccount: boolean;
}) {
  const subject = `${o.inviterName} invited you to ${o.orgName} on ARC LABS`;
  const intro = `${escText(o.inviterName)} has added you to <b>${escText(o.orgName)}</b> on the ARC LABS Learning Platform as <b>${escText(o.roles)}</b>.`;
  const next = o.isNewAccount
    ? 'Click below to set your password and activate your account. The link expires in 1 hour — ask your admin to resend it if needed.'
    : 'Sign in with your existing ARC LABS account to get started.';
  const html = layout({
    preheader: `You’ve been invited to ${o.orgName}`,
    heading: `Welcome, ${o.name.split(' ')[0]}!`,
    body: p(intro) + p(next),
    ctaLabel: o.isNewAccount ? 'Set your password' : 'Sign in',
    ctaUrl: o.link,
    footer:
      'You received this because an administrator added your email to an organization on ARC LABS.',
  });
  const text = `Welcome, ${o.name}!\n\n${o.inviterName} has added you to ${o.orgName} on the ARC LABS Learning Platform as ${o.roles}.\n\n${next}\n\n${o.link}\n`;
  return { subject, html, text };
}

/** Faculty access code, sent by a college admin. Subject and body are generated. */
export function accessCodeEmail(o: {
  orgName: string;
  code: string;
  link: string;
  senderName: string;
  note?: string | null;
}) {
  const subject = `Faculty access to ${o.orgName} exam results — ARC LABS`;
  const steps = [
    `Open <a href="${escText(o.link)}" style="color:#2f45ef">${escText(o.link)}</a>`,
    'Click <b>College faculty? Use access code</b>',
    'Type the access code below',
  ];
  const html = layout({
    preheader: `Your view-only access code for ${o.orgName}`,
    heading: `Faculty access for ${o.orgName}`,
    body:
      p(
        `${escText(o.senderName)} has given you view-only access to <b>${escText(o.orgName)}</b>’s exams, results and students on the ARC LABS Learning Platform. No account is needed.`,
      ) +
      (o.note ? p(`<i>“${escText(o.note)}”</i>`) : '') +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0"><tr><td align="center" style="background:#f0f4ff;border:1px solid #c2d1ff;border-radius:12px;padding:16px;font-family:Consolas,Menlo,monospace;font-size:20px;font-weight:700;letter-spacing:2px;color:#151925">${escText(o.code)}</td></tr></table>` +
      p(`<b>How to sign in</b><br>${steps.map((s, i) => `${i + 1}. ${s}`).join('<br>')}`) +
      p('Please keep this code private and don’t share it with students.'),
    ctaLabel: 'Open faculty sign-in',
    ctaUrl: o.link,
    footer: `Sent by ${o.senderName} from ARC LABS. If you weren’t expecting this, you can ignore it.`,
  });
  const text = [
    `Faculty access for ${o.orgName}`,
    '',
    `${o.senderName} has given you view-only access to ${o.orgName}'s exams, results and students on the ARC LABS Learning Platform. No account is needed.`,
    ...(o.note ? ['', `"${o.note}"`] : []),
    '',
    `Access code: ${o.code}`,
    '',
    'How to sign in:',
    `1. Open ${o.link}`,
    '2. Click "College faculty? Use access code"',
    '3. Type the access code above',
    '',
    "Please keep this code private and don't share it with students.",
  ].join('\n');
  return { subject, html, text };
}

/** An announcement / exam reminder to students. */
export function announcementEmail(o: {
  orgName: string;
  subject: string;
  body: string;
  linkUrl: string | null;
  linkLabel: string | null;
  senderName: string;
  portalUrl: string;
}) {
  const paragraphs = o.body
    .split(/\n{2,}/)
    .map((para) => p(escText(para).replace(/\n/g, '<br>')))
    .join('');
  const html = layout({
    preheader: o.body.slice(0, 120),
    heading: o.subject,
    body:
      paragraphs +
      p(`<span style="color:#6b7389">— ${escText(o.senderName)}, ${escText(o.orgName)}</span>`),
    ctaLabel: o.linkLabel || (o.linkUrl ? 'Open' : 'Open the portal'),
    ctaUrl: o.linkUrl || o.portalUrl,
    footer: `You received this because you are a student of ${o.orgName} on ARC LABS.`,
  });
  const text = `${o.subject}\n\n${o.body}\n\n— ${o.senderName}, ${o.orgName}\n\n${o.linkUrl || o.portalUrl}\n`;
  return { subject: o.subject, html, text };
}
