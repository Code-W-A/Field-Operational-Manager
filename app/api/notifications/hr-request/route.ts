import { type NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { adminDb } from "@/lib/firebase/admin"
import { getEmailFrom } from "@/lib/email/from"
import { logEmailEventServer, updateEmailEventServer } from "@/lib/email/email-events.server"
import { logError, logInfo, logWarning } from "@/lib/utils/logging-service"

type HrRequestEvent = "created" | "status_changed"

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
  return "Pending"
}

function requestDateLabel(req: any) {
  const p: any = req?.payload ?? {}
  if (p?.startDate && p?.endDate) return `${p.startDate} → ${p.endDate}`
  if (p?.date && p?.startTime && p?.endTime) return `${p.date} • ${p.startTime}–${p.endTime}`
  if (p?.date) return String(p.date)
  return "—"
}

export async function POST(request: NextRequest) {
  const logContextId = `hrreq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  try {
    const body = (await request.json().catch(() => ({}))) as any
    const requestId = String(body?.requestId || "").trim()
    const event = String(body?.event || "").trim() as HrRequestEvent

    if (!requestId || (event !== "created" && event !== "status_changed")) {
      return NextResponse.json({ error: "Parametri invalizi" }, { status: 400 })
    }

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

    const employee = await getUserEmail(String(data.employeeId || ""))
    const requester = await getUserEmail(String(data.requesterUid || ""))
    const manager = await getUserEmail(String(data.managerUid || ""))

    const title = `${kindLabel(String(data.kind || ""))} • ${requestDateLabel(data)}`
    const employeeName = data.employeeName || data.employeeId || "—"
    const rejectReason = String(data.rejectionReason || "").trim()

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_SMTP_HOST || "mail.nrg-acces.ro",
      port: Number.parseInt(process.env.EMAIL_SMTP_PORT || "465"),
      secure: process.env.EMAIL_SMTP_SECURE === "false" ? false : true,
      auth: {
        user: process.env.EMAIL_USER || "fom@nrg-acces.ro",
        pass: process.env.EMAIL_PASSWORD,
      },
    })

    const sendMail = async (params: {
      to: string
      subject: string
      text: string
      recipientType: "manager" | "requester" | "employee"
    }) => {
      if (!isValidEmail(params.to)) {
        logWarning(
          "HR request email skipped: invalid address",
          { to: params.to, recipientType: params.recipientType, requestId },
          { category: "email", context: { requestId, logContextId } },
        )
        return { ok: false, skipped: true }
      }

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
        const info = await transporter.sendMail({
          from: getEmailFrom(),
          to: params.to,
          subject: params.subject,
          text: params.text,
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
              `Sector: ${String(data.sectorId || "")}\n\n` +
              `Deschide aplicația: /dashboard/cereri-aprobari\n`,
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
              `Status: ${statusLabel(String(data.status || ""))}\n`,
          }),
        )
      }
    } else if (event === "status_changed") {
      const recipients = new Set<string>()
      if (employee.email) recipients.add(employee.email)
      if (manager.email) recipients.add(manager.email)

      const baseText =
        `Statusul cererii a fost actualizat.\n\n` +
        `Angajat: ${employeeName}\n` +
        `Tip: ${kindLabel(String(data.kind || ""))}\n` +
        `Perioadă/zi: ${requestDateLabel(data)}\n` +
        `Status: ${statusLabel(String(data.status || ""))}\n` +
        (rejectReason ? `Motiv refuz: ${rejectReason}\n` : "")

      for (const to of recipients) {
        results.push(
          await sendMail({
            to,
            recipientType: to === manager.email ? "manager" : "employee",
            subject: `Status cerere actualizat: ${statusLabel(String(data.status || ""))} • ${title}`,
            text: baseText,
          }),
        )
      }
    }

    return NextResponse.json({ ok: true, results })
  } catch (error: any) {
    logError(
      "HR request email API failed",
      { error: error?.message || String(error) },
      { category: "email", context: { logContextId } },
    )
    return NextResponse.json({ error: "Eroare la trimiterea emailului" }, { status: 500 })
  }
}
