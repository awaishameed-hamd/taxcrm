import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Resend } from 'resend'

@Injectable()
export class EmailService {
  private resend: Resend | null
  private from: string
  /** Public site the email pulls its logo from — must be reachable by recipients. */
  private appUrl: string
  private logger = new Logger(EmailService.name)

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>('resend.apiKey')
    this.resend = apiKey ? new Resend(apiKey) : null
    if (!this.resend) this.logger.warn('RESEND_API_KEY not set — email sending is disabled')
    const name  = this.config.get('resend.fromName')  ?? 'Asif Associates'
    const email = this.config.get('resend.fromEmail') ?? 'noreply@argroup.cloud'
    this.from   = `${name} <${email}>`
    this.appUrl = (this.config.get<string>('clientUrl') ?? 'https://argroup.cloud').replace(/\/+$/, '')
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
        html: this.inviteHtml(fullName, inviteUrl),
        text: [
          `Dear ${fullName},`,
          '',
          'You have been granted access to the Asif Associates client portal.',
          'Open the link below to set your password and activate your account:',
          '',
          inviteUrl,
          '',
          'This link expires in 48 hours. If you did not expect this email, you can ignore it.',
          '',
          'Asif Associates, Chartered Accountants',
        ].join('\n'),
      })
    } catch (err) {
      this.logger.error('Failed to send invite email', err)
      throw err
    }
  }

  /**
   * Built with tables and inline styles on purpose: Outlook and Gmail strip
   * <style> blocks, flexbox and most modern CSS, so anything fancier falls
   * apart in the clients most of these recipients actually use.
   *
   * Aptos is named first but is not a web font here — mail clients will not
   * load one. Recipients with Office see Aptos; everyone else falls through
   * the stack to Segoe UI or Helvetica, which look close enough.
   */
  private inviteHtml(fullName: string, inviteUrl: string): string {
    const FONT   = "'Aptos','Segoe UI',Helvetica,Arial,sans-serif"
    const NAVY   = '#132E57'
    const TEAL   = '#1E8496'
    const BODY   = '#44526B'
    const MUTED  = '#8A97AB'
    const BORDER = '#E4E8EF'
    const logoUrl = `${this.appUrl}/logo-email.png`

    return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F4F6F9;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F9;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid ${BORDER};border-radius:10px;">

            <tr>
              <td align="center" style="padding:36px 40px 8px;">
                <img src="${logoUrl}" alt="Asif Associates" width="180"
                     style="width:180px;max-width:60%;height:auto;display:block;border:0;" />
              </td>
            </tr>

            <tr>
              <td style="padding:20px 40px 0;font-family:${FONT};font-size:11pt;line-height:1.65;color:${BODY};">
                <p style="margin:0 0 14px;color:${NAVY};font-size:11pt;">Dear <strong>${fullName}</strong>,</p>
                <p style="margin:0 0 10px;">
                  You have been granted access to the Asif Associates client portal, where you can
                  follow your filings, review documents and see your account.
                </p>
                <p style="margin:0;">
                  Please set a password to activate your account.
                </p>
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:26px 40px 6px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="background:${TEAL};border-radius:6px;">
                      <a href="${inviteUrl}"
                         style="display:inline-block;padding:12px 30px;font-family:${FONT};font-size:11pt;font-weight:600;color:#FFFFFF;text-decoration:none;">
                        Set your password
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:16px 40px 0;font-family:${FONT};font-size:9pt;line-height:1.6;color:${MUTED};">
                <p style="margin:0 0 4px;">If the button does not work, copy this link into your browser:</p>
                <p style="margin:0;word-break:break-all;"><a href="${inviteUrl}" style="color:${TEAL};text-decoration:none;">${inviteUrl}</a></p>
              </td>
            </tr>

            <tr>
              <td style="padding:22px 40px 32px;">
                <div style="border-top:1px solid ${BORDER};padding-top:16px;font-family:${FONT};font-size:9pt;line-height:1.6;color:${MUTED};">
                  <p style="margin:0 0 3px;">This link expires in 48 hours. If you did not expect this email, you can ignore it.</p>
                  <p style="margin:0;color:${NAVY};font-weight:600;">Asif Associates, Chartered Accountants</p>
                </div>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
  }
}
