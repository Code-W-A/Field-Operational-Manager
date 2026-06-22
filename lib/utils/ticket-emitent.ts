/**
 * Returnează numele emitentului tichetului (cine a deschis tichetul).
 * Folosește `createdByName` salvat la creare; pentru tichetele vechi care nu
 * au acest câmp, întoarce un text de tip placeholder.
 */
export function getTicketEmitent(
  lucrare: { createdByName?: string | null } | null | undefined,
  fallback: string = "Necunoscut",
): string {
  const name = lucrare?.createdByName
  if (typeof name === "string" && name.trim().length > 0) {
    return name.trim()
  }
  return fallback
}
