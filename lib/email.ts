import nodemailer from 'nodemailer'

type EmailMode = 'log' | 'smtp'

export type OutboundEmail = {
  to: string
  subject: string
  text: string
  html: string
  replyTo?: string
}

function emailMode(): EmailMode {
  return process.env.EMAIL_DELIVERY_MODE === 'smtp' ? 'smtp' : 'log'
}

function smtpPort() {
  const port = Number(process.env.SMTP_PORT || 587)
  return Number.isFinite(port) ? port : 587
}

export function appUrl(path = '/') {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost'
  return new URL(path, base).toString()
}

export function marketingUrl(path = '/') {
  const base = process.env.NEXT_PUBLIC_MARKETING_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost'
  return new URL(path, base).toString()
}

export async function sendEmail(message: OutboundEmail) {
  const mode = emailMode()
  const from = process.env.SMTP_FROM || 'AxilDB <no-reply@axildb.com>'
  const replyTo = message.replyTo || process.env.SMTP_REPLY_TO || undefined

  if (mode === 'log') {
    console.info('AxilDB email delivery is in log mode', {
      to: message.to,
      from,
      replyTo,
      subject: message.subject,
      text: message.text,
    })
    return { mode, messageId: `log-${Date.now()}` }
  }

  if (!process.env.SMTP_HOST) {
    throw new Error('SMTP_HOST is required when EMAIL_DELIVERY_MODE=smtp.')
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: smtpPort(),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER || process.env.SMTP_PASSWORD
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        }
      : undefined,
  })

  const info = await transporter.sendMail({
    from,
    to: message.to,
    replyTo,
    subject: message.subject,
    text: message.text,
    html: message.html,
  })

  return { mode, messageId: info.messageId }
}
