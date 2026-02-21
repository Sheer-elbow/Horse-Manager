import nodemailer from 'nodemailer';
import { config } from '../config';

// Email adapter interface - swap implementation for SendGrid/Mailgun/Postmark later
interface EmailAdapter {
  sendMail(options: { to: string; subject: string; html: string }): Promise<void>;
}

class SmtpAdapter implements EmailAdapter {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user
        ? { user: config.smtp.user, pass: config.smtp.pass }
        : undefined,
    });
  }

  async sendMail(options: { to: string; subject: string; html: string }): Promise<void> {
    await this.transporter.sendMail({
      from: config.smtp.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
  }
}

// Fallback: log emails to console when SMTP is not configured
class ConsoleAdapter implements EmailAdapter {
  async sendMail(options: { to: string; subject: string; html: string }): Promise<void> {
    console.log('=== EMAIL (console, SMTP not configured) ===');
    console.log(`To: ${options.to}`);
    console.log(`Subject: ${options.subject}`);
    console.log(`Body: ${options.html}`);
    console.log('============================================');
  }
}

function createEmailAdapter(): EmailAdapter {
  if (config.smtp.host) {
    return new SmtpAdapter();
  }
  console.warn('SMTP not configured. Emails will be logged to console.');
  return new ConsoleAdapter();
}

export const emailAdapter = createEmailAdapter();

export async function sendInviteEmail(email: string, token: string): Promise<void> {
  const inviteUrl = `${config.appUrl}/accept-invite?token=${token}`;
  await emailAdapter.sendMail({
    to: email,
    subject: 'You have been invited to Smart Stable Manager',
    html: `
      <h2>Welcome to Smart Stable Manager</h2>
      <p>You have been invited to join the stable management platform.</p>
      <p><a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;">Accept Invitation</a></p>
      <p>Or copy this link: ${inviteUrl}</p>
      <p>This link expires in 72 hours.</p>
    `,
  });
}
