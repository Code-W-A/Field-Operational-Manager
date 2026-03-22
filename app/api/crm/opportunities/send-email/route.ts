import { NextResponse, type NextRequest } from "next/server"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { requireRole, RequireRoleError } from "@/lib/auth/require-role"
import { adminDb } from "@/lib/firebase/admin"
import { CRM_COLLECTIONS } from "@/lib/crm/constants"
import { hasOpportunityViewAccess, normalizeVisibilityUsers } from "@/lib/crm/access"
import type { CrmVisibility } from "@/lib/crm/types"
import { getEmailFrom } from "@/lib/email/from"
import { logEmailEventServer, updateEmailEventServer } from "@/lib/email/email-events.server"
import { sendMailWithSentCopy } from "@/lib/email/send-with-sent-copy.server"
import { createConfiguredSmtpTransport } from "@/lib/email/smtp.server"

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((item) => normalizeString(item)).filter(Boolean)))
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function normalizePart(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
}

function parsePayload(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false as const, error: "Payload invalid" }
  }

  const data = body as Record<string, unknown>
  const opportunityId = normalizeString(data.opportunityId)
  const subject = normalizeString(data.subject)
  const from = normalizeString(data.from)
  const to = normalizeStringArray(data.to)
  const cc = normalizeStringArray(data.cc)
  const bcc = normalizeStringArray(data.bcc)
  const bodySnippet = normalizeString(data.bodySnippet)
  const visibilityRaw = normalizeString(data.visibility) || "PRIVATE"
  const visibility = visibilityRaw === "GENERAL" || visibilityRaw === "PRIVATE" || visibilityRaw === "CUSTOM" ? visibilityRaw : null
  const visibleToUserIds = normalizeStringArray(data.visibleToUserIds)

  if (!opportunityId) return { ok: false as const, error: "opportunityId este obligatoriu" }
  if (!subject) return { ok: false as const, error: "Subiectul este obligatoriu" }
  if (!to.length) return { ok: false as const, error: "Cel puțin un destinatar este obligatoriu" }
  if (!visibility) return { ok: false as const, error: "Visibility invalid" }
  if (!from) return { ok: false as const, error: "Adresa de expeditor este obligatorie" }
  if (!isValidEmail(from)) return { ok: false as const, error: "Adresa From nu este validă" }

  const invalidRecipient = to.find((email) => !isValidEmail(email))
  if (invalidRecipient) {
    return { ok: false as const, error: `Destinatar invalid: ${invalidRecipient}` }
  }
  const invalidCc = cc.find((email) => !isValidEmail(email))
  if (invalidCc) {
    return { ok: false as const, error: `Adresă CC invalidă: ${invalidCc}` }
  }
  const invalidBcc = bcc.find((email) => !isValidEmail(email))
  if (invalidBcc) {
    return { ok: false as const, error: `Adresă BCC invalidă: ${invalidBcc}` }
  }

  return {
    ok: true as const,
    data: {
      opportunityId,
      subject,
      from,
      to,
      cc,
      bcc,
      bodySnippet,
      visibility,
      visibleToUserIds,
    },
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
  if (!hasOpportunityViewAccess(opportunity, userId, explicitPermissions as ("VIEW" | "EDIT")[])) {
    return null
  }

  return {
    snap: opportunitySnap,
    data: opportunityData,
  }
}

async function createVisibleToRows(params: {
  entityType: "EMAIL" | "ACTIVITY"
  entityId: string
  opportunityId: string
  userIds: string[]
}) {
  if (!params.userIds.length) return
  await Promise.all(
    params.userIds.map((userId) =>
      adminDb.collection(CRM_COLLECTIONS.visibleTo).add({
        entityType: params.entityType,
        entityId: params.entityId,
        opportunityId: params.opportunityId,
        userId,
        createdAt: FieldValue.serverTimestamp(),
      })
    )
  )
}

async function appendOpportunitySearchText(opportunityId: string, values: string[]) {
  const ref = adminDb.collection(CRM_COLLECTIONS.opportunities).doc(opportunityId)
  const snap = await ref.get()
  if (!snap.exists) return
  const current = normalizePart(snap.data()?.searchIndex)
  const additions = values.map((value) => normalizePart(value)).filter(Boolean)
  const searchIndex = [current, ...additions].filter(Boolean).join(" ").trim()
  await ref.set(
    {
      searchIndex,
      searchIndexUpdatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
}

export async function POST(request: NextRequest) {
  let emailEventId: string | null = null

  try {
    const session = await requireRole(["admin", "dispecer"], request)
    if (!session.uid) {
      return NextResponse.json({ error: "Sesiune invalidă sau expirată." }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON invalid" }, { status: 400 })
    }

    const parsed = parsePayload(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const actorId = session.uid
    const actorSnap = await adminDb.collection("users").doc(actorId).get()
    const actorEmail = normalizeString(actorSnap.data()?.email)
    const actorRole = normalizeString(actorSnap.data()?.role)
    if (actorRole === "tehnician") {
      return NextResponse.json({ error: "Tehnicienii nu pot trimite emailuri CRM." }, { status: 403 })
    }

    const opportunity = await getOpportunityWithPermissions(parsed.data.opportunityId, actorId)
    if (!opportunity) {
      return NextResponse.json({ error: "Oportunitatea nu există sau nu ai acces la ea." }, { status: 404 })
    }

    const visibility = parsed.data.visibility as CrmVisibility
    const visibleToUserIds = normalizeVisibilityUsers(visibility, parsed.data.visibleToUserIds)
    const sentAt = Timestamp.now()
    const { transporter, auth } = createConfiguredSmtpTransport()

    emailEventId = await logEmailEventServer({
      type: "CRM_EMAIL",
      to: parsed.data.to,
      cc: parsed.data.cc,
      bcc: parsed.data.bcc,
      subject: parsed.data.subject,
      status: "queued",
      provider: "smtp",
      meta: {
        route: "/api/crm/opportunities/send-email",
        opportunityId: parsed.data.opportunityId,
        actorId,
        actorEmail: actorEmail || null,
        fromInput: parsed.data.from,
        visibility,
      },
    })

    const info = await sendMailWithSentCopy({
      transporter,
      mailOptions: {
        from: parsed.data.from || getEmailFrom(),
        replyTo: parsed.data.from || actorEmail || undefined,
        to: parsed.data.to,
        cc: parsed.data.cc,
        bcc: parsed.data.bcc,
        subject: parsed.data.subject,
        text: parsed.data.bodySnippet || "",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 720px; margin: 0 auto; color: #0f172a;">
            <div style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
              <div style="padding: 16px 20px; background: #0f56b3; color: white;">
                <h2 style="margin: 0; font-size: 18px;">${parsed.data.subject}</h2>
              </div>
              <div style="padding: 20px;">
                <div style="white-space: pre-wrap; font-size: 14px; line-height: 1.6;">${parsed.data.bodySnippet || "-"}</div>
              </div>
            </div>
          </div>
        `,
      },
      smtpAuth: auth,
      imapContext: {
        route: "/api/crm/opportunities/send-email",
        emailEventId: emailEventId || undefined,
        flow: "crm_opportunity_email",
      },
    })

    const emailRef = await adminDb.collection(CRM_COLLECTIONS.emails).add({
      opportunityId: parsed.data.opportunityId,
      direction: "OUT",
      subject: parsed.data.subject,
      from: parsed.data.from,
      to: parsed.data.to,
      cc: parsed.data.cc,
      bcc: parsed.data.bcc,
      bodySnippet: parsed.data.bodySnippet,
      sourceInboxMessageId: null,
      sentAt,
      createdById: actorId,
      visibility,
      visibleToUserIds,
      createdAt: FieldValue.serverTimestamp(),
    })

    if (visibility === "CUSTOM") {
      await createVisibleToRows({
        entityType: "EMAIL",
        entityId: emailRef.id,
        opportunityId: parsed.data.opportunityId,
        userIds: visibleToUserIds,
      })
    }

    const activityRef = await adminDb.collection(CRM_COLLECTIONS.activityLogs).add({
      opportunityId: parsed.data.opportunityId,
      actorId,
      type: "EMAIL_LOGGED",
      payload: {
        emailId: emailRef.id,
        direction: "OUT",
        subject: parsed.data.subject,
        from: parsed.data.from,
        to: parsed.data.to,
        cc: parsed.data.cc,
        bcc: parsed.data.bcc,
        bodySnippet: parsed.data.bodySnippet,
        sentAt: sentAt.toDate().toISOString(),
      },
      visibility,
      visibleToUserIds,
      createdAt: FieldValue.serverTimestamp(),
    })

    if (visibility === "CUSTOM") {
      await createVisibleToRows({
        entityType: "ACTIVITY",
        entityId: activityRef.id,
        opportunityId: parsed.data.opportunityId,
        userIds: visibleToUserIds,
      })
    }

    await appendOpportunitySearchText(parsed.data.opportunityId, [
      parsed.data.subject,
      parsed.data.bodySnippet,
      parsed.data.from,
      ...parsed.data.to,
      ...parsed.data.cc,
      ...parsed.data.bcc,
    ])

    await updateEmailEventServer(emailEventId, {
      status: "sent",
      messageId: info.messageId,
      meta: {
        route: "/api/crm/opportunities/send-email",
        opportunityId: parsed.data.opportunityId,
        actorId,
        emailId: emailRef.id,
        visibility,
      },
    })

    return NextResponse.json({
      ok: true,
      emailId: emailRef.id,
      emailEventId,
      messageId: info.messageId,
    })
  } catch (error) {
    if (error instanceof RequireRoleError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (emailEventId) {
      try {
        await updateEmailEventServer(emailEventId, {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          meta: {
            route: "/api/crm/opportunities/send-email",
            stack: error instanceof Error ? error.stack?.slice(0, 2000) : undefined,
          },
        })
      } catch (logError) {
        console.error("[CRM Email] failed to update email event", logError)
      }
    }

    console.error("[CRM Email] send failed", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Eroare la trimiterea emailului CRM" },
      { status: 500 }
    )
  }
}
