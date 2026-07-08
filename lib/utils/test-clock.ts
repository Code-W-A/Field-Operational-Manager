import { isE2eTestMode } from "@/lib/utils/environment"

export const E2E_FAKE_NOW_STORAGE_KEY = "e2e_fake_now"

export function parseE2eFakeNowMs(value: unknown): number | null {
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isFinite(ms) ? ms : null
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value !== "string") return null

  const trimmed = value.trim()
  if (!trimmed) return null

  const numeric = Number(trimmed)
  if (Number.isFinite(numeric)) return numeric

  const parsed = Date.parse(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

export function getE2eFakeNowMs(): number | null {
  if (!isE2eTestMode()) return null
  if (typeof window === "undefined") return null

  try {
    return parseE2eFakeNowMs(window.localStorage.getItem(E2E_FAKE_NOW_STORAGE_KEY))
  } catch {
    return null
  }
}

export function getAppNowMs(): number {
  return getE2eFakeNowMs() ?? Date.now()
}

export function getE2eFakeNowRequestMs(): number | undefined {
  return getE2eFakeNowMs() ?? undefined
}

export function setE2eFakeNowMs(value: string | number | Date | null): number | null {
  if (!isE2eTestMode()) return null
  if (typeof window === "undefined") return null

  try {
    if (value == null) {
      window.localStorage.removeItem(E2E_FAKE_NOW_STORAGE_KEY)
      return null
    }

    const ms = parseE2eFakeNowMs(value)
    if (ms == null) {
      window.localStorage.removeItem(E2E_FAKE_NOW_STORAGE_KEY)
      return null
    }

    const stored = value instanceof Date ? value.toISOString() : String(value)
    window.localStorage.setItem(E2E_FAKE_NOW_STORAGE_KEY, stored)
    return ms
  } catch {
    return null
  }
}
