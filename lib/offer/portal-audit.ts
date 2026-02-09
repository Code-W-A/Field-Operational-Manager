import { adminDb } from "@/lib/firebase/admin"

type OfferPortalAuditInput = {
  lucrareId?: string
  action: string
  status?: string
  token?: string
  email?: string
  details?: string
  meta?: Record<string, any> | null
}

function safeString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return ""
  return value.trim().slice(0, maxLength)
}

function maskToken(token: string): string {
  const clean = safeString(token, 2048)
  if (!clean) return ""
  if (clean.length <= 8) return `${clean.slice(0, 2)}...${clean.slice(-2)}`
  return `${clean.slice(0, 4)}...${clean.slice(-4)}`
}

function severityFromStatus(status: string): "Informație" | "Avertisment" {
  const s = String(status || "").toLowerCase()
  if (
    s.includes("error") ||
    s.includes("invalid") ||
    s.includes("expired") ||
    s.includes("used") ||
    s.includes("failed") ||
    s.includes("locked")
  ) {
    return "Avertisment"
  }
  return "Informație"
}

export async function logOfferPortalEvent(input: OfferPortalAuditInput): Promise<void> {
  try {
    const lucrareId = safeString(input.lucrareId, 128)
    const action = safeString(input.action, 64) || "unknown"
    const status = safeString(input.status, 64) || "unknown"
    const email = safeString(input.email, 256).toLowerCase()
    const details = safeString(input.details, 2500)
    const rawToken = safeString(input.token, 2048)

    const now = new Date()
    let tokenHash: string | null = null
    const tokenPreview = rawToken ? maskToken(rawToken) : null
    if (rawToken) {
      const crypto = await import("crypto")
      tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex")
    }

    const payload = {
      createdAt: now,
      lucrareId: lucrareId || null,
      action,
      status,
      email: email || null,
      tokenPreview,
      tokenHash,
      details: details || null,
      meta: input.meta && typeof input.meta === "object" ? input.meta : null,
    }

    if (lucrareId) {
      try {
        await adminDb.collection("lucrari").doc(lucrareId).collection("offerAudit").add(payload)
      } catch (e) {
        console.warn("[offer/audit] Subcollection write failed", e)
      }
    }

    const logDetailsParts = [
      `lucrareId: ${lucrareId || "-"}`,
      `action: ${action}`,
      `status: ${status}`,
      `email: ${email || "-"}`,
      `token: ${tokenPreview || "-"}`,
    ]
    if (details) {
      logDetailsParts.push(`detalii: ${details}`)
    }

    await adminDb.collection("logs").add({
      timestamp: now,
      utilizator: "Portal client",
      utilizatorId: "portal",
      actiune: "Audit portal ofertă",
      detalii: logDetailsParts.join("; "),
      tip: severityFromStatus(status),
      categorie: "Portal ofertă",
      lucrareId: lucrareId || undefined,
    })
  } catch (e) {
    console.warn("[offer/audit] Logging failed", e)
  }
}

