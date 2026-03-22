import { NextResponse, type NextRequest } from "next/server"
import { FieldValue } from "firebase-admin/firestore"
import { requireRole, RequireRoleError } from "@/lib/auth/require-role"
import { adminDb } from "@/lib/firebase/admin"
import { logFirestoreIndexHintIfPresent } from "@/lib/firebase/firestore-index-hint.server"
import { CRM_COLLECTIONS } from "@/lib/crm/constants"
import { hasOpportunityEditAccess, hasOpportunityViewAccess } from "@/lib/crm/access"
import type { CrmOfferProduct, CrmOfferSnapshot } from "@/lib/crm/types"

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function parseSnapshot(value: unknown): CrmOfferSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const data = value as Record<string, unknown>
  const rawProducts = Array.isArray(data.products) ? data.products : []
  const products: CrmOfferProduct[] = rawProducts
    .map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return null
      const item = row as Record<string, unknown>
      const quantity = normalizeNumber(item.quantity, 0)
      const price = normalizeNumber(item.price, 0)
      return {
        id: normalizeString(item.id),
        name: normalizeString(item.name),
        um: normalizeString(item.um) || "buc",
        quantity,
        price,
        total: normalizeNumber(item.total, quantity * price),
      }
    })
    .filter((row): row is CrmOfferProduct => Boolean(row))

  return {
    products,
    vatPercent: normalizeNumber(data.vatPercent, 0),
    adjustmentPercent: normalizeNumber(data.adjustmentPercent, 0),
    conditions: Array.isArray(data.conditions) ? data.conditions.map((item) => String(item || "").trim()).filter(Boolean) : [],
    comments: normalizeString(data.comments),
    subtotal: normalizeNumber(data.subtotal, 0),
    total: normalizeNumber(data.total, 0),
  }
}

function serializeDateValue(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  const maybeToDate = value as { toDate?: () => Date }
  if (typeof maybeToDate.toDate === "function") {
    const date = maybeToDate.toDate()
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  try {
    const date = new Date(value as string | number)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  } catch {
    return null
  }
}

function serializeVerification(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const item = value as Record<string, unknown>
  return {
    email: normalizeString(item.email) || undefined,
    version: normalizeNumber(item.version, 0) || undefined,
    codeHash: normalizeString(item.codeHash) || undefined,
    codeSentAt: serializeDateValue(item.codeSentAt),
    codeExpiresAt: serializeDateValue(item.codeExpiresAt),
    resendAvailableAt: serializeDateValue(item.resendAvailableAt),
    verifiedAt: serializeDateValue(item.verifiedAt),
    attemptCount: normalizeNumber(item.attemptCount, 0),
    maxAttempts: normalizeNumber(item.maxAttempts, 0),
    lockUntil: serializeDateValue(item.lockUntil),
    lockDurationMs: normalizeNumber(item.lockDurationMs, 0),
    responseProofHash: normalizeString(item.responseProofHash) || null,
    responseProofIssuedAt: serializeDateValue(item.responseProofIssuedAt),
    responseProofExpiresAt: serializeDateValue(item.responseProofExpiresAt),
    responseProofUsedAt: serializeDateValue(item.responseProofUsedAt),
  }
}

function serializeResponse(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const item = value as Record<string, unknown>
  const status = item.status === "accept" || item.status === "reject" ? item.status : undefined
  if (!status) return null
  return {
    status,
    at: serializeDateValue(item.at),
    reason: normalizeString(item.reason) || undefined,
    verifiedEmail: normalizeString(item.verifiedEmail) || undefined,
  }
}

function serializeOffer(offerId: string, data: Record<string, unknown>) {
  return {
    id: offerId,
    opportunityId: normalizeString(data.opportunityId),
    version: normalizeNumber(data.version, 1),
    status: normalizeString(data.status) || "DRAFT",
    snapshot: parseSnapshot(data.snapshot) || {
      products: [],
      vatPercent: 0,
      adjustmentPercent: 0,
      conditions: [],
      comments: "",
      subtotal: 0,
      total: 0,
    },
    recipientEmail: normalizeString(data.recipientEmail) || undefined,
    recipientName: normalizeString(data.recipientName) || undefined,
    subject: normalizeString(data.subject) || undefined,
    message: normalizeString(data.message) || undefined,
    pdfUrl: normalizeString(data.pdfUrl) || undefined,
    pdfStoragePath: normalizeString(data.pdfStoragePath) || undefined,
    pdfFilename: normalizeString(data.pdfFilename) || undefined,
    pdfMime: normalizeString(data.pdfMime) || undefined,
    pdfSize: normalizeNumber(data.pdfSize, 0) || undefined,
    actionToken: normalizeString(data.actionToken) || undefined,
    actionExpiresAt: serializeDateValue(data.actionExpiresAt),
    actionUsedAt: serializeDateValue(data.actionUsedAt),
    verification: serializeVerification(data.verification),
    response: serializeResponse(data.response),
    sentAt: serializeDateValue(data.sentAt),
    createdById: normalizeString(data.createdById),
    createdAt: serializeDateValue(data.createdAt),
    updatedAt: serializeDateValue(data.updatedAt),
  }
}

async function getOpportunityWithPermissions(params: {
  opportunityId: string
  userId: string
  mode: "view" | "edit"
}) {
  const [opportunitySnap, accessRows] = await Promise.all([
    adminDb.collection(CRM_COLLECTIONS.opportunities).doc(params.opportunityId).get(),
    adminDb
      .collection(CRM_COLLECTIONS.opportunityAccess)
      .where("opportunityId", "==", params.opportunityId)
      .where("userId", "==", params.userId)
      .limit(5)
      .get(),
  ])

  if (!opportunitySnap.exists) return null
  const opportunityData = opportunitySnap.data() as Record<string, unknown>
  const opportunity = {
    ownerId: String(opportunityData.ownerId || ""),
    readUserIds: Array.isArray(opportunityData.readUserIds) ? (opportunityData.readUserIds as string[]) : [],
    editUserIds: Array.isArray(opportunityData.editUserIds) ? (opportunityData.editUserIds as string[]) : [],
  }
  const explicitPermissions = accessRows.docs.map((row) => String(row.data().permission || "VIEW"))
  const hasAccess =
    params.mode === "view"
      ? hasOpportunityViewAccess(opportunity, params.userId, explicitPermissions as ("VIEW" | "EDIT")[])
      : hasOpportunityEditAccess(opportunity, params.userId, explicitPermissions as ("VIEW" | "EDIT")[])
  if (!hasAccess) return null

  return {
    snap: opportunitySnap,
    data: opportunityData,
  }
}

async function getNextOfferVersion(opportunityId: string) {
  const rows = await adminDb
    .collection(CRM_COLLECTIONS.offers)
    .where("opportunityId", "==", opportunityId)
    .orderBy("createdAt", "desc")
    .limit(1)
    .get()
  if (rows.empty) return 1
  return Math.max(1, Number(rows.docs[0].data()?.version || 0) + 1)
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireRole(["admin", "dispecer", "tehnician"], request)
    if (!session.uid) {
      return NextResponse.json({ error: "Sesiune invalidă sau expirată." }, { status: 401 })
    }

    const opportunityId = normalizeString(request.nextUrl.searchParams.get("opportunityId"))
    if (!opportunityId) {
      return NextResponse.json({ error: "opportunityId este obligatoriu" }, { status: 400 })
    }

    const opportunity = await getOpportunityWithPermissions({
      opportunityId,
      userId: session.uid,
      mode: "view",
    })
    if (!opportunity) {
      return NextResponse.json({ error: "Oportunitatea nu există sau nu ai acces la ea." }, { status: 404 })
    }

    const rows = await adminDb
      .collection(CRM_COLLECTIONS.offers)
      .where("opportunityId", "==", opportunityId)
      .orderBy("createdAt", "desc")
      .limit(300)
      .get()

    return NextResponse.json({
      ok: true,
      items: rows.docs.map((doc) => serializeOffer(doc.id, doc.data() as Record<string, unknown>)),
    })
  } catch (error: unknown) {
    if (error instanceof RequireRoleError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    logFirestoreIndexHintIfPresent(error, "GET /api/crm/offers")
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nu s-au putut încărca ofertele." },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(["admin", "dispecer"], request)
    if (!session.uid) {
      return NextResponse.json({ error: "Sesiune invalidă sau expirată." }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: "Payload invalid" }, { status: 400 })

    const offerId = normalizeString(body.offerId)
    const opportunityId = normalizeString(body.opportunityId)
    const snapshot = parseSnapshot(body.snapshot)
    const recipientEmail = normalizeString(body.recipientEmail).toLowerCase()
    const recipientName = normalizeString(body.recipientName)
    const subject = normalizeString(body.subject)
    const message = normalizeString(body.message)

    if (!opportunityId) {
      return NextResponse.json({ error: "opportunityId este obligatoriu" }, { status: 400 })
    }
    if (!snapshot) {
      return NextResponse.json({ error: "snapshot invalid" }, { status: 400 })
    }
    if (recipientEmail && !isValidEmail(recipientEmail)) {
      return NextResponse.json({ error: "Email destinatar invalid" }, { status: 400 })
    }

    const opportunity = await getOpportunityWithPermissions({
      opportunityId,
      userId: session.uid,
      mode: "edit",
    })
    if (!opportunity) {
      return NextResponse.json({ error: "Oportunitatea nu există sau nu ai acces de editare." }, { status: 404 })
    }

    const offersCollection = adminDb.collection(CRM_COLLECTIONS.offers)

    if (offerId) {
      const offerRef = offersCollection.doc(offerId)
      const offerSnap = await offerRef.get()
      if (!offerSnap.exists) {
        return NextResponse.json({ error: "Draftul nu există." }, { status: 404 })
      }
      const offerData = offerSnap.data() as Record<string, unknown>
      if (normalizeString(offerData.opportunityId) !== opportunityId) {
        return NextResponse.json({ error: "Draftul nu aparține oportunității." }, { status: 400 })
      }
      if (normalizeString(offerData.status) !== "DRAFT") {
        return NextResponse.json({ error: "Se pot actualiza doar ofertele draft." }, { status: 400 })
      }

      await offerRef.set(
        {
          snapshot,
          recipientEmail: recipientEmail || null,
          recipientName: recipientName || null,
          subject: subject || null,
          message: message || null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )

      return NextResponse.json({
        ok: true,
        offerId,
        version: Math.max(1, Number(offerData.version || 0)),
      })
    }

    const version = await getNextOfferVersion(opportunityId)
    const createdById = session.uid
    const newOfferRef = offersCollection.doc()
    await newOfferRef.set({
      opportunityId,
      version,
      status: "DRAFT",
      snapshot,
      recipientEmail: recipientEmail || null,
      recipientName: recipientName || null,
      subject: subject || null,
      message: message || null,
      createdById,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ ok: true, offerId: newOfferRef.id, version })
  } catch (error: unknown) {
    if (error instanceof RequireRoleError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    logFirestoreIndexHintIfPresent(error, "POST /api/crm/offers")
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nu s-a putut salva draftul." },
      { status: 500 }
    )
  }
}
