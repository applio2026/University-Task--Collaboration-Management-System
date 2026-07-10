import nodemailer, { Transporter } from 'nodemailer';

/**
 * Email channel. Configured entirely via env — when SMTP_HOST is unset the
 * transporter is null and sends become a logged no-op, so the app runs fine
 * without any mail credentials. Point SMTP_* at a real server (or a catcher
 * like Mailtrap/Ethereal) to actually deliver mail.
 */
let transporter: Transporter | null = null;

const FROM = process.env.EMAIL_FROM ?? 'Uni-TCMS <no-reply@eimple.com>';

if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
}

export const emailEnabled = transporter !== null;

/** Escape user-supplied text before interpolating into email HTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Fire-and-forget; never throws into the caller. */
export function sendEmail(to: string, subject: string, body: string): void {
  if (!transporter) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[email:skipped] to=${to} subject="${subject}" (SMTP not configured)`);
    }
    return;
  }
  const safe = escapeHtml(body).replace(/\n/g, '<br>');
  transporter
    .sendMail({ from: FROM, to, subject, text: body, html: `<p>${safe}</p>` })
    .catch((err) => console.error('[email:error]', err?.message ?? err));
}
