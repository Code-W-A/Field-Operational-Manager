import { type NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { adminDb } from "@/lib/firebase/admin"
import { getEmailFrom } from "@/lib/email/from"
import { logEmailEventServer, updateEmailEventServer } from "@/lib/email/email-events.server"
import { sendMailWithSentCopy } from "@/lib/email/send-with-sent-copy.server"
import { logError, logInfo, logWarning } from "@/lib/utils/logging-service"
import { formatOvertimeDuration } from "@/lib/hr/overtime-duration"
import { formatRomanianDateDotsISO } from "@/lib/utils/date-utils"
import { canGenerateHrRequestDocx } from "@/lib/hr/request-document-format"
import { generateHrRequestPdfBuffer } from "@/lib/hr/request-pdf.server"
import { generateHrRequestDocxBuffer } from "@/lib/hr/request-docx.server"
import { RequireRoleError, requireVerifiedRole } from "@/lib/auth/require-role"
import {
  HrNotificationRequestError,
  authorizeHrNotification,
  parseHrNotificationPayload,
} from "@/lib/hr/hr-notification-authorization.server"
import { areSinkRecipientsAllowed, resolveMailTransportPolicy } from "@/lib/email/mail-transport-policy.server"

type HrRequestEvent = "created" | "status_changed"

const DISPATCH_COLLECTION = "hrNotificationDispatches"
const DISPATCH_LEASE_MS = 60_000

type DispatchClaim =
  | { state: "claimed" }
  | { state: "completed"; deliveryCount: number }
  | { state: "processing" }

function dispatchDocumentId(requestId: string, event: HrRequestEvent, status: string) {
  return `${requestId}__${event}__${status}`
}

async function claimDispatch(params: {
  requestId: string
  event: HrRequestEvent
  requestStatus: string
  actorUid: string
}): Promise<{ ref: FirebaseFirestore.DocumentReference; claim: DispatchClaim }> {
  const ref = adminDb.collection(DISPATCH_COLLECTION).doc(
    dispatchDocumentId(params.requestId, params.event, params.requestStatus),
  )
  const now = Date.now()
  const claim = await adminDb.runTransaction<DispatchClaim>(async (transaction) => {
    const snapshot = await transaction.get(ref)
    const current = snapshot.data() as Record<string, unknown> | undefined
    if (current?.status === "completed") {
      return {
        state: "completed",
        deliveryCount: typeof current.deliveryCount === "number" ? current.deliveryCount : 0,
      }
    }
    if (current?.status === "processing" && Number(current.leaseUntilMs || 0) > now) {
      return { state: "processing" }
    }
    transaction.set(ref, {
      requestId: params.requestId,
      event: params.event,
      requestStatus: params.requestStatus,
      actorUid: params.actorUid,
      status: "processing",
      attempt: Number(current?.attempt || 0) + 1,
      leaseUntilMs: now + DISPATCH_LEASE_MS,
      updatedAt: new Date(now),
      createdAt: current?.createdAt || new Date(now),
    })
    return { state: "claimed" }
  })
  return { ref, claim }
}

async function completeDispatch(ref: FirebaseFirestore.DocumentReference, deliveryCount: number) {
  await ref.set({
    status: "completed",
    deliveryCount,
    leaseUntilMs: 0,
    completedAt: new Date(),
    updatedAt: new Date(),
  }, { merge: true })
}

async function failDispatch(ref: FirebaseFirestore.DocumentReference) {
  await ref.set({
    status: "failed",
    leaseUntilMs: 0,
    updatedAt: new Date(),
  }, { merge: true })
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

async function getUserEmail(uid: string): Promise<{ email: string | null; displayName: string | null }> {
  try {
    const snap = await adminDb.collection("users").doc(uid).get()
    const data = snap.data() as any
    const email = typeof data?.email === "string" ? data.email : null
    const displayName = typeof data?.displayName === "string" ? data.displayName : null
    return { email, displayName }
  } catch (e) {
    console.error("getUserEmail failed", uid, e)
    return { email: null, displayName: null }
  }
}

async function getEmployeeEmailByEmployeeId(employeeId: string): Promise<{ email: string | null; displayName: string | null }> {
  try {
    const empSnap = await adminDb.collection("hrEmployees").doc(employeeId).get()
    if (!empSnap.exists) return { email: null, displayName: null }
    const empData = empSnap.data() as any
    const userUid = typeof empData?.userUid === "string" ? empData.userUid : null
    if (!userUid) return { email: null, displayName: null }
    return await getUserEmail(userUid)
  } catch (e) {
    console.error("getEmployeeEmailByEmployeeId failed", employeeId, e)
    return { email: null, displayName: null }
  }
}

async function getDepartmentName(departmentId: string): Promise<string | null> {
  try {
    if (!departmentId) return null
    const snap = await adminDb.collection("hrDepartments").doc(departmentId).get()
    if (!snap.exists) return null
    const data = snap.data() as any
    const name = typeof data?.name === "string" ? data.name : null
    return name?.trim() || null
  } catch (e) {
    console.error("getDepartmentName failed", departmentId, e)
    return null
  }
}

function buildBaseUrl(request: NextRequest): string {
  const envBase = process.env.NEXT_PUBLIC_APP_URL
  const proto = request.headers.get("x-forwarded-proto") || "https"
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || ""
  const headerBase = host ? `${proto}://${host}` : ""
  const rawBase = envBase || headerBase
  if (!rawBase) return ""
  if (!rawBase.startsWith("http://") && !rawBase.startsWith("https://")) {
    return `https://${rawBase}`
  }
  return rawBase
}

function kindLabel(kind: string) {
  switch (kind) {
    case "CO":
      return "Concediu de odihnă"
    case "CFP":
      return "Concediu fără plată"
    case "CM":
      return "Concediu medical"
    case "IN":
      return "Învoire"
    case "DEL":
      return "Delegație"
    case "CORRECT_HOURS":
      return "Corectare ore"
    case "ADD_OVERTIME":
      return "Ore suplimentare"
    default:
      return String(kind)
  }
}

function statusLabel(status: string) {
  if (status === "approved") return "Aprobat"
  if (status === "rejected") return "Respins"
  return "În așteptare"
}

function requestDateLabel(req: any) {
  const p: any = req?.payload ?? {}
  const kind = String(req?.kind || "")
  if (p?.startDate && p?.endDate) return `${formatRomanianDateDotsISO(p.startDate)} → ${formatRomanianDateDotsISO(p.endDate)}`
  if (p?.date && p?.startTime && p?.endTime) return `${formatRomanianDateDotsISO(p.date)} • ${p.startTime}–${p.endTime}`
  if (kind === "ADD_OVERTIME" && p?.date) {
    const dateLabel = formatRomanianDateDotsISO(p.date) || String(p.date)
    const duration = formatOvertimeDuration(p.overtimeHours)
    return duration !== "—" ? `${dateLabel} • ${duration}` : dateLabel
  }
  if (p?.date) return formatRomanianDateDotsISO(p.date) || String(p.date)
  return "—"
}

function toMillis(value: any): number {
  if (typeof value?.toMillis === "function") {
    try {
      const ms = value.toMillis()
      if (Number.isFinite(ms)) return ms
    } catch {}
  }
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (value && typeof value === "object") {
    const seconds = typeof value._seconds === "number" ? value._seconds : (typeof value.seconds === "number" ? value.seconds : null)
    const nanos = typeof value._nanoseconds === "number" ? value._nanoseconds : (typeof value.nanoseconds === "number" ? value.nanoseconds : 0)
    if (seconds != null) return seconds * 1000 + Math.floor(nanos / 1_000_000)
  }
  return Date.now()
}

function buildReqForGenerators(data: any, requestId: string) {
  return {
    id: requestId,
    employeeId: String(data.employeeId || ""),
    employeeName: data.employeeName || data.employeeId || "—",
    requesterUid: String(data.requesterUid || ""),
    sectorId: String(data.sectorId || ""),
    managerUid: String(data.managerUid || ""),
    kind: String(data.kind || ""),
    status: String(data.status || ""),
    payload: data.payload || {},
    rejectionReason: data.rejectionReason || undefined,
    documentSerial:
      typeof data.documentSerial === "number" && Number.isFinite(data.documentSerial)
        ? data.documentSerial
        : undefined,
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  }
}

export async function POST(request: NextRequest) {
  const logContextId = `hrreq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  let dispatchRef: FirebaseFirestore.DocumentReference | null = null
  try {
    const actor = await requireVerifiedRole(["admin", "tehnician", "dispecer"], request)
    const { requestId, event } = parseHrNotificationPayload(await request.json().catch(() => null))

    logInfo(
      "HR request email notification received",
      { requestId, event },
      { category: "email", context: { requestId, logContextId } },
    )

    const snap = await adminDb.collection("hrRequests").doc(requestId).get()
    if (!snap.exists) {
      return NextResponse.json({ error: "Cererea nu a fost găsită" }, { status: 404 })
    }
    const data = snap.data() as any
    authorizeHrNotification({ actorUid: actor.uid, actorRole: actor.role, event, request: data })

    const transportPolicy = resolveMailTransportPolicy()
    if (transportPolicy.mode === "disabled") {
      logWarning(
        "HR request email disabled by transport policy",
        { requestId, event, reason: transportPolicy.reason },
        { category: "email", context: { requestId, logContextId } },
      )
      return NextResponse.json({ error: "Serviciul de notificări nu este configurat." }, { status: 503 })
    }

    const employee = await getEmployeeEmailByEmployeeId(String(data.employeeId || ""))
    const requester = await getUserEmail(String(data.requesterUid || ""))
    const manager = await getUserEmail(String(data.managerUid || ""))

    const intendedRecipients = (event === "created"
      ? [manager.email, requester.email, employee.email]
      : [requester.email]
    ).filter((email): email is string => Boolean(email))
    if (
      transportPolicy.mode === "sink" &&
      !areSinkRecipientsAllowed(intendedRecipients, transportPolicy.sinkAllowedDomains)
    ) {
      return NextResponse.json({ error: "Destinatarii nu sunt permiși de transportul izolat." }, { status: 503 })
    }

    const dispatch = await claimDispatch({
      requestId,
      event,
      requestStatus: String(data.status || ""),
      actorUid: actor.uid,
    })
    dispatchRef = dispatch.ref
    if (dispatch.claim.state === "completed") {
      return NextResponse.json({ ok: true, replayed: true, deliveryCount: dispatch.claim.deliveryCount })
    }
    if (dispatch.claim.state === "processing") {
      return NextResponse.json({ error: "Notificarea este deja în procesare." }, { status: 409 })
    }

    const title = `${kindLabel(String(data.kind || ""))} • ${requestDateLabel(data)}`
    const employeeName = data.employeeName || data.employeeId || "—"
    const rejectReason = String(data.rejectionReason || "").trim()
    const departmentName = await getDepartmentName(String(data.sectorId || ""))
    const departmentLabel = departmentName || "—"
    const baseUrl = buildBaseUrl(request)
    const approvalsUrl = baseUrl ? `${baseUrl}/dashboard/cereri-aprobari` : "/dashboard/cereri-aprobari"

    const smtpUser = process.env.EMAIL_USER || ""
    const smtpPass = process.env.EMAIL_PASSWORD || ""
    const transporter = transportPolicy.mode === "smtp"
      ? nodemailer.createTransport({
          host: process.env.EMAIL_SMTP_HOST,
          port: Number.parseInt(process.env.EMAIL_SMTP_PORT || "0"),
          secure: process.env.EMAIL_SMTP_SECURE !== "false",
          auth: { user: smtpUser, pass: smtpPass },
        })
      : null

    const sendMail = async (params: {
      to: string
      subject: string
      text: string
      recipientType: "manager" | "requester" | "employee"
      attachments?: Array<{ filename: string; content: Buffer; contentType: string }>
    }) => {
      if (!isValidEmail(params.to)) {
        logWarning(
          "HR request email skipped: invalid address",
          { to: params.to, recipientType: params.recipientType, requestId },
          { category: "email", context: { requestId, logContextId } },
        )
        return { ok: false, skipped: true }
      }

      if (transportPolicy.mode === "sink") {
        return { ok: true, sink: true }
      }
      if (!transporter) throw new Error("Transport SMTP indisponibil")

      let evId: string | null = null
      try {
        evId = await logEmailEventServer({
          type: "HR_REQUEST",
          to: [params.to],
          subject: params.subject,
          status: "queued",
          provider: "smtp",
          meta: { route: "/api/notifications/hr-request", requestId, event, recipientType: params.recipientType },
        })
      } catch {}

      try {
        const info = await sendMailWithSentCopy({
          transporter,
          smtpAuth: { user: smtpUser, pass: smtpPass },
          mailOptions: {
            from: getEmailFrom(),
            to: params.to,
            subject: params.subject,
            text: params.text,
            attachments: params.attachments,
          },
          imapContext: {
            route: "/api/notifications/hr-request",
            requestId,
            emailEventId: evId || undefined,
            flow: `hr_request_${params.recipientType}`,
          },
        })
        if (evId) await updateEmailEventServer(evId, { status: "sent", messageId: info.messageId })
        return { ok: true, messageId: info.messageId }
      } catch (err: any) {
        if (evId) {
          try {
            await updateEmailEventServer(evId, {
              status: "failed",
              error: String(err?.message || err || "Unknown error"),
            })
          } catch {}
        }
        logError(
          "HR request email failed",
          { to: params.to, recipientType: params.recipientType, error: err?.message || String(err) },
          { category: "email", context: { requestId, logContextId } },
        )
        return { ok: false, error: err?.message || "Unknown error" }
      }
    }

    const results: any[] = []

    const attachment = transportPolicy.mode === "sink" ? undefined : await (async () => {
      try {
        const req = buildReqForGenerators(data, requestId)
        if (canGenerateHrRequestDocx(req.kind as any)) {
          // CO/CFP/DEL: trimitem DOCX fidel template-ului clientului.
          return "docx" as const
        }
        const { buffer, filename } = await generateHrRequestPdfBuffer(req as any, {
          departmentName: departmentLabel || undefined,
        })
        return [{ filename, content: buffer, contentType: "application/pdf" }]
      } catch (err) {
        logWarning(
          "HR request attachment generation failed",
          { requestId, error: (err as any)?.message || String(err) },
          { category: "email", context: { requestId, logContextId } },
        )
        return undefined
      }
    })()

    const resolveAttachments = async (): Promise<Array<{ filename: string; content: Buffer; contentType: string }> | undefined> => {
      try {
        if (attachment === "docx") {
          const req = buildReqForGenerators(data, requestId)
          const { buffer, filename } = await generateHrRequestDocxBuffer(req as any)
          return [
            {
              filename,
              content: buffer,
              contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            },
          ]
        }
        return attachment
      } catch (err) {
        logWarning(
          "HR request DOCX generation failed; fallback to PDF",
          { requestId, error: (err as any)?.message || String(err) },
          { category: "email", context: { requestId, logContextId } },
        )
        try {
          const req = buildReqForGenerators(data, requestId)
          const { buffer, filename } = await generateHrRequestPdfBuffer(req as any, {
            departmentName: departmentLabel || undefined,
          })
          return [{ filename, content: buffer, contentType: "application/pdf" }]
        } catch {
          return undefined
        }
      }
    }
    const finalAttachments = transportPolicy.mode === "sink" ? undefined : await resolveAttachments()

    if (event === "created") {
      if (manager.email) {
        results.push(
          await sendMail({
            to: manager.email,
            recipientType: "manager",
            subject: `Cerere nouă de aprobat: ${title}`,
            text:
              `Ai primit o cerere nouă.\n\n` +
              `Angajat: ${employeeName}\n` +
              `Tip: ${kindLabel(String(data.kind || ""))}\n` +
              `Perioadă/zi: ${requestDateLabel(data)}\n` +
              `Departament: ${departmentLabel || "—"}\n\n` +
              `Deschide aplicația: ${approvalsUrl}\n`,
            attachments: finalAttachments,
          }),
        )
      }

      if (requester.email) {
        results.push(
          await sendMail({
            to: requester.email,
            recipientType: "requester",
            subject: `Cererea ta a fost înregistrată: ${title}`,
            text:
              `Cererea ta a fost înregistrată și trimisă către șeful ierarhic.\n\n` +
              `Tip: ${kindLabel(String(data.kind || ""))}\n` +
              `Perioadă/zi: ${requestDateLabel(data)}\n` +
              `Departament: ${departmentLabel || "—"}\n` +
              `Status: ${statusLabel(String(data.status || ""))}\n`,
            attachments: finalAttachments,
          }),
        )
      }

      if (employee.email) {
        results.push(
          await sendMail({
            to: employee.email,
            recipientType: "employee",
            subject: `A fost creată o cerere pentru tine: ${title}`,
            text:
              `A fost creată o cerere pe numele tău.\n\n` +
              `Tip: ${kindLabel(String(data.kind || ""))}\n` +
              `Perioadă/zi: ${requestDateLabel(data)}\n` +
              `Departament: ${departmentLabel || "—"}\n` +
              `Status: ${statusLabel(String(data.status || ""))}\n`,
            attachments: finalAttachments,
          }),
        )
      }
    } else if (event === "status_changed") {
      const baseText =
        `Statusul cererii a fost actualizat.\n\n` +
        `Angajat: ${employeeName}\n` +
        `Tip: ${kindLabel(String(data.kind || ""))}\n` +
        `Perioadă/zi: ${requestDateLabel(data)}\n` +
        `Departament: ${departmentLabel || "—"}\n` +
        `Status: ${statusLabel(String(data.status || ""))}\n` +
        (rejectReason ? `Motiv refuz: ${rejectReason}\n` : "")

      if (requester.email) {
        results.push(
          await sendMail({
            to: requester.email,
            recipientType: "requester",
            subject: `Status cerere actualizat: ${statusLabel(String(data.status || ""))} • ${title}`,
            text: baseText,
            attachments: finalAttachments,
          }),
        )
      }
    }

    const deliveryCount = results.filter((result) => result?.ok === true).length
    if (transportPolicy.mode === "smtp" && results.some((result) => result?.ok === false && !result?.skipped)) {
      throw new Error("Una sau mai multe livrări SMTP au eșuat")
    }
    await completeDispatch(dispatch.ref, deliveryCount)
    return NextResponse.json({ ok: true, replayed: false, deliveryCount })
  } catch (error: any) {
    if (dispatchRef) {
      try {
        await failDispatch(dispatchRef)
      } catch {}
    }
    if (error instanceof RequireRoleError || error instanceof HrNotificationRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    logError(
      "HR request email API failed",
      { error: error?.message || String(error) },
      { category: "email", context: { logContextId } },
    )
    return NextResponse.json({ error: "Eroare la trimiterea emailului" }, { status: 500 })
  }
}
