"use client"

export function normalizeEmail(raw?: any): string {
  let value = String(raw ?? "")
  try {
    value = value.normalize("NFKC")
  } catch {}
  value = value.replace(/\u00A0/g, " ").replace(/[\u200B-\u200D\uFEFF]/g, "").trim()

  const wrappedMatch = value.match(/<\s*([^>]+)\s*>/)
  if (wrappedMatch?.[1]) value = wrappedMatch[1].trim()
  if (/[;,]/.test(value)) value = value.split(/[;,]/)[0].trim()

  return value
}

export function isValidEmail(value?: any): boolean {
  const email = normalizeEmail(value)
  return !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function normalizeCompareValue(value?: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
}

function matchesLoose(a?: string, b?: string): boolean {
  const left = normalizeCompareValue(a)
  const right = normalizeCompareValue(b)
  if (!left || !right) return false
  return left === right || left.includes(right) || right.includes(left)
}

export function resolveLocationForWork(client: any, work: any) {
  const locations = Array.isArray(client?.locatii) ? client.locatii : []
  const targetId = work?.clientInfo?.locationId || work?.clientInfo?.locatieId || work?.locationId
  const targetName = work?.locatie || work?.clientInfo?.locationName
  const targetAddress = work?.clientInfo?.locationAddress

  let location = targetId
    ? locations.find((entry: any) => String(entry?.id || "") === String(targetId))
    : undefined

  if (!location) {
    location = locations.find(
      (entry: any) => matchesLoose(entry?.nume, targetName) || matchesLoose(entry?.adresa, targetAddress),
    )
  }

  return location || null
}

export function resolveRecipientEmailForLocation(client: any, work: any, presetRecipientEmail?: string | null): string | null {
  if (isValidEmail(presetRecipientEmail)) return normalizeEmail(presetRecipientEmail)

  const workLevelCandidates = [
    work?.clientInfo?.locationEmail,
    work?.clientInfo?.email,
    work?.clientInfo?.contactEmail,
    work?.email,
    work?.persoanaContactEmail,
  ]

  for (const candidate of workLevelCandidates) {
    if (isValidEmail(candidate)) return normalizeEmail(candidate)
  }

  const location = resolveLocationForWork(client, work)
  const targetContactName = work?.persoanaContact

  if (location) {
    const contacts: any[] = Array.isArray(location?.persoaneContact) ? location.persoaneContact : []
    const exact = contacts.find((contact: any) => matchesLoose(contact?.nume, targetContactName))
    if (isValidEmail(exact?.email)) return normalizeEmail(exact?.email)

    const anyContact = contacts.find((contact: any) => isValidEmail(contact?.email))
    if (isValidEmail(anyContact?.email)) return normalizeEmail(anyContact?.email)
    if (isValidEmail(location?.email)) return normalizeEmail(location?.email)
  }

  if (isValidEmail(client?.email)) return normalizeEmail(client?.email)

  const clientContacts: any[] = Array.isArray(client?.persoaneContact) ? client.persoaneContact : []
  const fallbackClientContact = clientContacts.find((contact: any) => isValidEmail(contact?.email))
  if (isValidEmail(fallbackClientContact?.email)) return normalizeEmail(fallbackClientContact?.email)

  return null
}

export function buildPricingConditions(payment: string, delivery: string, installation: string): string[] {
  return [`Plata: ${payment}`, `Livrare: ${delivery}`, `Instalare: ${installation}`]
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      try {
        const result = String(reader.result || "")
        resolve(result.includes(",") ? result.split(",")[1] : result)
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export function formatPreparedDate(value?: any): string {
  try {
    if (!value) {
      return new Date().toISOString().slice(0, 10).split("-").reverse().join(".")
    }
    const date =
      typeof value?.toDate === "function"
        ? value.toDate()
        : value instanceof Date
          ? value
          : new Date(value)
    if (Number.isNaN(date.getTime())) {
      return new Date().toISOString().slice(0, 10).split("-").reverse().join(".")
    }
    return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`
  } catch {
    return new Date().toISOString().slice(0, 10).split("-").reverse().join(".")
  }
}
