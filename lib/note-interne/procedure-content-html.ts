/** Utilitare SSR-safe pentru conținut HTML (proceduri), fără TipTap */

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function isRichContentEmpty(html: string): boolean {
  return stripHtml(html).length === 0
}

export function plainTextLengthFromHtml(html: string): number {
  return stripHtml(html).length
}

/** TipTap / HTML vs. text simplu vechi din Firestore */
export function isProbablyRichHtml(s: string): boolean {
  const t = s.trimStart()
  if (t.startsWith("<p>") || t.startsWith("<p ") || t.startsWith("<div")) return true
  return /^<(ul|ol|h[1-6]|blockquote)\b/i.test(t)
}
