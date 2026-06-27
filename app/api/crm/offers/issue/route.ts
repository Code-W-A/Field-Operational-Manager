import { NextResponse, type NextRequest } from "next/server"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { requireRole, RequireRoleError } from "@/lib/auth/require-role"
import { adminDb } from "@/lib/firebase/admin"
import { logFirestoreIndexHintIfPresent } from "@/lib/firebase/firestore-index-hint.server"
import { CRM_COLLECTIONS, CRM_PIPELINE_STAGE_LABELS, isPipelineStageAllowedForOpportunityType } from "@/lib/crm/constants"
import { logOfferEvent } from "@/lib/offer/offer-events.server"
import { hasOpportunityEditAccess } from "@/lib/crm/access"
import { getEmailFrom } from "@/lib/email/from"
import { sendInviteStyleEmail } from "@/lib/email/send-invite-style-email.server"
import type { CrmOfferSnapshot } from "@/lib/crm/types"

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

function resolveBaseUrl(request: NextRequest) {
  const envBase = process.env.NEXT_PUBLIC_APP_URL
  const proto = request.headers.get("x-forwarded-proto") || "https"
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || ""
  const headerBase = host ? `${proto}://${host}` : ""
  const rawBase = envBase || headerBase || request.nextUrl.origin
  if (!rawBase) return ""
  if (rawBase.startsWith("http://") || rawBase.startsWith("https://")) return rawBase
  return `https://${rawBase}`
}

function buildOfferEmailHtml(params: {
  subject: string
  message: string
  acceptUrl: string
  rejectUrl: string
  total: number
  version: number
}) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0b1220">
      <h2 style="margin:0 0 10px;color:#0f56b3">${params.subject}</h2>
      <p style="margin:0 0 10px;">Versiune ofertă: <strong>#${params.version}</strong></p>
      <p style="margin:0 0 12px;">Total ofertă (fără TVA): <strong>${params.total.toFixed(2)} lei</strong></p>
      <div style="white-space:pre-wrap;margin:0 0 14px;">${params.message || "-"}</div>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td align="center" valign="middle" bgcolor="#16a34a" style="border-radius:6px;">
            <a href="${params.acceptUrl}" rel="noopener noreferrer" style="display:inline-block;padding:12px 16px;font-weight:600;color:#fff;text-decoration:none;">Accept ofertă</a>
          </td>
          <td style="width:12px">&nbsp;</td>
          <td align="center" valign="middle" bgcolor="#dc2626" style="border-radius:6px;">
            <a href="${params.rejectUrl}" rel="noopener noreferrer" style="display:inline-block;padding:12px 16px;font-weight:600;color:#fff;text-decoration:none;">Refuz ofertă</a>
          </td>
        </tr>
      </table>
      <div style="margin-top:10px;font-size:12px;color:#64748b">
        Dacă butoanele nu funcționează, folosiți linkurile:
        <div>Accept: <a href="${params.acceptUrl}" rel="noopener noreferrer">${params.acceptUrl}</a></div>
        <div>Refuz: <a href="${params.rejectUrl}" rel="noopener noreferrer">${params.rejectUrl}</a></div>
      </div>
      <div style="margin-top:14px;font-size:11px;color:#6b7280">Acesta este un mesaj automat emis de FOM CRM.</div>
    </div>
  `
}

function parseSnapshot(value: unknown): CrmOfferSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const data = value as Record<string, unknown>
  const products = Array.isArray(data.products) ? data.products : []
  return {
    products: products as CrmOfferSnapshot["products"],
    vatPercent: normalizeNumber(data.vatPercent, 0),
    adjustmentPercent: normalizeNumber(data.adjustmentPercent, 0),
    conditions: Array.isArray(data.conditions) ? data.conditions.map((item) => String(item || "")) : [],
    comments: normalizeString(data.comments),
    subtotal: normalizeNumber(data.subtotal, 0),
    total: normalizeNumber(data.total, 0),
  }
}

async function getOpportunityWithPermissions(opportunityId: string, userId: string) {
  const [opportunitySnap, accessRows] = await Promise.all([
    adminDb.collection(CRM_COLLECTIONS.opportunities).doc(opportunityId).get(),
    adminDb
      .collection(CRM_COLLECTIONS.opportunityAccess)
      .where("opportunityId", "==", opportunityId)
      .where("userId", "==", userId)
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
  if (!hasOpportunityEditAccess(opportunity, userId, explicitPermissions as ("VIEW" | "EDIT")[])) {
    return null
  }

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

async function updateOpportunityStageForOffer(params: {
  opportunityId: string
  opportunityType: string
  actorId: string
  toStage: "OFERTA_TRANSMISA"
}) {
  if (!isPipelineStageAllowedForOpportunityType(params.opportunityType, params.toStage)) return

  const ref = adminDb.collection(CRM_COLLECTIONS.opportunities).doc(params.opportunityId)
  const snap = await ref.get()
  if (!snap.exists) return

  const current = snap.data() as Record<string, unknown>
  const fromStage = String(current.pipelineStage || "")
  if (fromStage === params.toStage) return

  await ref.set(
    {
      pipelineStage: params.toStage,
      updatedAt: FieldValue.serverTimestamp(),
      updatedById: params.actorId,
    },
    { merge: true }
  )

  await adminDb.collection(CRM_COLLECTIONS.activityLogs).add({
    opportunityId: params.opportunityId,
    actorId: params.actorId,
    type: "STAGE_CHANGED",
    payload: {
      from: fromStage,
      to: params.toStage,
      fromLabel: CRM_PIPELINE_STAGE_LABELS[fromStage] || fromStage,
      toLabel: CRM_PIPELINE_STAGE_LABELS[params.toStage] || params.toStage,
      lostReason: null,
    },
    visibility: "GENERAL",
    visibleToUserIds: [],
    createdAt: FieldValue.serverTimestamp(),
  })
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(["admin", "dispecer"], request)
    if (!session.uid) {
      return NextResponse.json({ error: "Sesiune invalidă sau expirată." }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: "Payload invalid" }, { status: 400 })

    const opportunityId = normalizeString(body.opportunityId)
    const draftOfferId = normalizeString(body.draftOfferId)
    const recipientEmail = normalizeString(body.recipientEmail).toLowerCase()
    const recipientName = normalizeString(body.recipientName)
    const subject = normalizeString(body.subject)
    const message = normalizeString(body.message)
    const pdfUrl = normalizeString(body.pdfUrl)
    const pdfStoragePath = normalizeString(body.pdfStoragePath)
    const pdfFilename = normalizeString(body.pdfFilename) || "oferta.pdf"
    const pdfMime = normalizeString(body.pdfMime) || "application/pdf"
    const pdfSize = normalizeNumber(body.pdfSize, 0)
    const attachmentBase64 = normalizeString(body.attachmentBase64)
    const snapshot = parseSnapshot(body.snapshot)

    if (!opportunityId) return NextResponse.json({ error: "opportunityId este obligatoriu" }, { status: 400 })
    if (!snapshot) return NextResponse.json({ error: "snapshot invalid" }, { status: 400 })
    if (!Array.isArray(snapshot.products) || snapshot.products.length === 0) {
      return NextResponse.json({ error: "Oferta trebuie să conțină cel puțin o poziție." }, { status: 400 })
    }
    if (!recipientEmail || !isValidEmail(recipientEmail)) {
      return NextResponse.json({ error: "Email destinatar invalid" }, { status: 400 })
    }
    if (!subject) return NextResponse.json({ error: "Subiectul este obligatoriu" }, { status: 400 })
    if (!pdfUrl || !pdfStoragePath) {
      return NextResponse.json({ error: "PDF-ul ofertei trebuie încărcat înainte de emitere." }, { status: 400 })
    }

    const actorId = session.uid
    const actorSnap = await adminDb.collection("users").doc(actorId).get()
    const actorData = actorSnap.data() || {}
    const actorEmail = normalizeString(actorData.email)
    const actorName = normalizeString(actorData.displayName) || actorEmail || actorId

    const opportunity = await getOpportunityWithPermissions(opportunityId, actorId)
    if (!opportunity) {
      return NextResponse.json({ error: "Oportunitatea nu există sau nu ai acces de editare." }, { status: 404 })
    }

    const offersCollection = adminDb.collection(CRM_COLLECTIONS.offers)
    const existingDraftRef =
      draftOfferId ? offersCollection.doc(draftOfferId) : offersCollection.doc()
    const existingDraftSnap = draftOfferId ? await existingDraftRef.get() : null

    let version = 1
    if (existingDraftSnap?.exists) {
      const draftData = existingDraftSnap.data() as Record<string, unknown>
      if (String(draftData.opportunityId || "") !== opportunityId) {
        return NextResponse.json({ error: "Draftul nu aparține oportunității." }, { status: 400 })
      }
      if (String(draftData.status || "") !== "DRAFT") {
        return NextResponse.json({ error: "Doar ofertele draft pot fi emise." }, { status: 400 })
      }
      version = Math.max(1, Number(draftData.version || 0))
    } else {
      version = await getNextOfferVersion(opportunityId)
    }

    const offerId = existingDraftRef.id
    const token = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const baseUrl = resolveBaseUrl(request)
    const acceptUrl = `${baseUrl}/offer/crm/${encodeURIComponent(offerId)}?t=${encodeURIComponent(token)}&action=accept`
    const rejectUrl = `${baseUrl}/offer/crm/${encodeURIComponent(offerId)}?t=${encodeURIComponent(token)}&action=reject`
    const html = buildOfferEmailHtml({
      subject,
      message,
      acceptUrl,
      rejectUrl,
      total: snapshot.total,
      version,
    })

    const { messageId } = await sendInviteStyleEmail({
      to: [recipientEmail],
      subject,
      content: `${message}\n\nAccept: ${acceptUrl}\nRefuz: ${rejectUrl}`,
      html,
      type: "OFFER",
      route: "/api/crm/offers/issue",
      flow: "crm_offer_issue",
      actorUserId: actorId,
      replyTo: actorEmail || undefined,
      metaExtra: {
        opportunityId,
        offerId,
        version,
        actorId,
      },
      attachments: attachmentBase64
        ? [
            {
              filename: pdfFilename,
              content: Buffer.from(attachmentBase64, "base64"),
              contentType: pdfMime,
            },
          ]
        : undefined,
    })

    const now = new Date()
    await existingDraftRef.set(
      {
        opportunityId,
        version,
        status: "SENT",
        snapshot,
        recipientEmail,
        recipientName: recipientName || null,
        subject,
        message,
        pdfUrl,
        pdfStoragePath,
        pdfFilename,
        pdfMime,
        pdfSize,
        actionToken: token,
        actionExpiresAt: expiresAt,
        actionUsedAt: null,
        verification: null,
        response: null,
        sentAt: now,
        createdById: actorId,
        createdAt: existingDraftSnap?.exists ? (existingDraftSnap.data()?.createdAt ?? FieldValue.serverTimestamp()) : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    await adminDb.collection(CRM_COLLECTIONS.emails).add({
      opportunityId,
      direction: "OUT",
      subject,
      from: actorEmail || getEmailFrom(),
      to: [recipientEmail],
      cc: [],
      bcc: [],
      bodySnippet: message,
      sourceInboxMessageId: null,
      sentAt: Timestamp.now(),
      createdById: actorId,
      visibility: "GENERAL",
      visibleToUserIds: [],
      createdAt: FieldValue.serverTimestamp(),
    })

    await adminDb.collection(CRM_COLLECTIONS.activityLogs).add({
      opportunityId,
      actorId,
      type: "OFFER_SENT",
      payload: {
        offerId,
        version,
        recipientEmail,
        recipientName: recipientName || null,
        subject,
        total: snapshot.total,
        pdfUrl,
      },
      visibility: "GENERAL",
      visibleToUserIds: [],
      createdAt: FieldValue.serverTimestamp(),
    })

    await updateOpportunityStageForOffer({
      opportunityId,
      opportunityType: String(opportunity.data.opportunityType || ""),
      actorId,
      toStage: "OFERTA_TRANSMISA",
    })

    await logOfferEvent({
      type: "OFFER_TOKEN_MINTED",
      source: "crm",
      status: "ok",
      offerId,
      opportunityId,
      actorId,
      actorType: "staff",
      token,
      snapshot,
      payload: { expiresAt: expiresAt.toISOString(), version },
    })

    return NextResponse.json({
      ok: true,
      offerId,
      version,
      publicUrl: `${baseUrl}/offer/crm/${encodeURIComponent(offerId)}?t=${encodeURIComponent(token)}&action=accept`,
      messageId,
      sentAt: now.toISOString(),
      actorName,
    })
  } catch (error: unknown) {
    if (error instanceof RequireRoleError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    logFirestoreIndexHintIfPresent(error, "POST /api/crm/offers/issue")
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nu s-a putut emite oferta." },
      { status: 500 }
    )
  }
}
