"use client"

import { toDateSafe } from "@/lib/utils/time-format"
import { resolveLocationWithinClient, ticketContactOptions } from "@/firebase-functions/src/client-ticket-sync"

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

export function resolveLocationForWork(client: any, work: any) {
  try { return resolveLocationWithinClient(client, work) } catch { return null }
}

// Document recipients always come from the current client record, never ticket snapshots.
export function resolveRecipientEmailForLocation(client: any, work: any): string | null {
  if (!client || !work) return null

  const location = resolveLocationForWork(client, work)
  const targetContactName = work?.persoanaContact
  if (!location && (work.locationId || work.clientInfo?.locationId || work.clientInfo?.locatieId)) return null

  if (location) {
    const contacts: any[] = Array.isArray(location?.persoaneContact) ? location.persoaneContact : []
    const candidates = work.contactId ? ticketContactOptions(client, location).filter(contact => contact.id === work.contactId)
      : contacts.filter(contact => String(contact.nume || "").trim() === String(targetContactName || "").trim())
    if (candidates.length > 1 || (work.contactId && candidates.length !== 1)) return null
    const exact = candidates[0]
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

export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
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
    const resolved = (value ? toDateSafe(value) : null) ?? new Date()
    if (Number.isNaN(resolved.getTime())) {
      const now = new Date()
      return `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`
    }
    return `${String(resolved.getDate()).padStart(2, "0")}.${String(resolved.getMonth() + 1).padStart(2, "0")}.${resolved.getFullYear()}`
  } catch {
    const now = new Date()
    return `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`
  }
}
