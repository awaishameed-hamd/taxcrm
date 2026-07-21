import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Resend } from 'resend'

@Injectable()
export class EmailService {
  private resend: Resend | null
  private from: string
  private logger = new Logger(EmailService.name)

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>('resend.apiKey')
    this.resend = apiKey ? new Resend(apiKey) : null
    if (!this.resend) this.logger.warn('RESEND_API_KEY not set — email sending is disabled')
    const name  = this.config.get('resend.fromName')  ?? 'CA Firm CRM'
    const email = this.config.get('resend.fromEmail') ?? 'noreply@cafirm.com'
    this.from   = `${name} <${email}>`
  }

  async sendPortalInvite(to: string, fullName: string, inviteUrl: string) {
    if (!this.resend) {
      this.logger.warn(`Skipped portal invite to ${to} — email is not configured`)
      return
    }
    try {
      await this.resend.emails.send({
        from:    this.from,
        to,
        subject: 'You have been invited to the Asif Associates Portal',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;">
            <div style="background:#132E57;padding:18px 24px;border-radius:8px 8px 0 0;margin:-32px -24px 28px;">
              <h1 style="color:#F2AC18;margin:0;font-size:22px;letter-spacing:0.04em;">Asif Associates</h1>
            </div>
            <p style="color:#132E57;font-size:15px;margin:0 0 8px;">Dear <strong>${fullName}</strong>,</p>
            <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 24px;">
              You have been granted access to the <strong>Asif Associates Portal</strong>.
              Click the button below to set your password and activate your account.
            </p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${inviteUrl}" style="background:#1E8496;color:#fff;padding:13px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:0.04em;display:inline-block;">
                Set Password &amp; Activate Account
              </a>
            </div>
            <p style="color:#94A3B8;font-size:12px;margin:24px 0 0;border-top:1px solid #f1f5f9;padding-top:16px;">
              This link will expire in <strong>48 hours</strong>. If you did not expect this email, you can ignore it.
            </p>
          </div>
        `,
      })
    } catch (err) {
      this.logger.error('Failed to send invite email', err)
      throw err
    }
  }
}
