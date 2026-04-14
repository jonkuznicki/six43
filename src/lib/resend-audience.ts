import { Resend } from 'resend'

// Adds a single email address to the Resend Audience.
// Silently does nothing if RESEND_API_KEY or RESEND_AUDIENCE_ID are not set.
export async function addToAudience(email: string): Promise<void> {
  const apiKey     = process.env.RESEND_API_KEY
  const audienceId = process.env.RESEND_AUDIENCE_ID
  if (!apiKey || !audienceId) return

  try {
    const resend = new Resend(apiKey)
    await resend.contacts.create({ audienceId, email, unsubscribed: false })
  } catch {
    // Non-fatal — don't break signup or any other flow
  }
}
