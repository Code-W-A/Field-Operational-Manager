/**
 * Centralized "From" identity for all outgoing emails.
 *
 * Goal: every email sent by the app should show the same sender display name
 * in inboxes (e.g. "FOM by NRG"), regardless of the flow (report/offer/postpone/etc).
 */

export function getEmailFrom() {
  const name = process.env.EMAIL_FROM_NAME || "FOM by NRG"
  const address = process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER || "fom@nrg-acces.ro"

  // Nodemailer accepts { name, address } objects.
  return { name, address }
}


