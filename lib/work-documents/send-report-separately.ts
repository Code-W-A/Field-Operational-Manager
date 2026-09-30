/** One message per recipient preserves the report flow's address privacy. */
export async function sendReportSeparately<T>(recipients: string[], send: (recipient: string) => Promise<T>) {
  const sent: string[] = []
  const failed: string[] = []
  let lastResult: T | undefined
  for (const recipient of recipients) {
    try {
      lastResult = await send(recipient)
      sent.push(recipient)
    } catch {
      failed.push(recipient)
    }
  }
  return { sent, failed, lastResult }
}
