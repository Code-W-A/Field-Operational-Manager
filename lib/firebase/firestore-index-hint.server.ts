/**
 * Când Firestore răspunde cu FAILED_PRECONDITION (index lipsă), mesajul conține
 * de obicei un link direct către Firebase Console. Logăm în consolă ca să poți
 * copia URL-ul și crea indexul în proiect.
 */
function extractErrorMessage(error: unknown): string {
  if (!error) return ""
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error !== null && "message" in error) {
    const m = (error as { message?: unknown }).message
    if (typeof m === "string") return m
  }
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function extractIndexUrlFromMessage(message: string): string | null {
  const patterns = [
    /https:\/\/console\.firebase\.google\.com\/[^\s\])"']+/i,
    /https:\/\/console\.cloud\.google\.com\/[^\s\])"']+/i,
  ]
  for (const re of patterns) {
    const m = message.match(re)
    if (m?.[0]) return m[0].replace(/[.,;]+$/, "")
  }
  return null
}

function looksLikeIndexError(error: unknown, message: string): boolean {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : ""
  if (
    code === "9" ||
    code === "FAILED_PRECONDITION" ||
    /failed-precondition/i.test(message)
  ) {
    return /index|requires an index|composite index|create index/i.test(message)
  }
  return /requires an index|create index|composite index/i.test(message)
}

/**
 * Loghează în consola serverului (terminal `next dev`) linkul de creare index, dacă există.
 */
export function logFirestoreIndexHintIfPresent(error: unknown, context?: string): void {
  const message = extractErrorMessage(error)
  if (!message || !looksLikeIndexError(error, message)) return

  const prefix = context ? `[Firestore index — ${context}]` : "[Firestore index]"
  const url = extractIndexUrlFromMessage(message)

  console.log(`${prefix} Lipsește un index Firestore. Copiază linkul de mai jos în browser și apasă Create index:`)
  if (url) {
    console.log(url)
  } else {
    console.log(`${prefix} (mesaj fără URL; vezi detalii):`, message)
  }
}
