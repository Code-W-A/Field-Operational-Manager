import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { NextResponse, type NextRequest } from "next/server"
import { RequireRoleError, requireRole } from "@/lib/auth/require-role"
import {
  buildHrReminderCronTestDoc,
  sanitizeHrReminderTestDocId,
  type HrReminderCronTestScenario,
} from "@/lib/hr/reminder-cron-test-doc.server"
import { adminDb } from "@/lib/firebase/admin"

type PostBody = {
  managerUid?: string
  requesterUid?: string
  scenario?: HrReminderCronTestScenario
  docId?: string
  sectorId?: string
  employeeId?: string
  dryRun?: boolean
}

function looksLikePlaceholderUid(uid: string) {
  if (!uid) return true
  const u = uid.toUpperCase()
  return u.includes("UIDUL") || u === "YOUR_UID" || u === "UID" || uid.length < 10
}

export async function POST(req: NextRequest) {
  const testSecret = process.env.HR_REMINDER_TEST_SECRET?.trim()
  const headerSecret = req.headers.get("x-hr-reminder-test-secret")?.trim()
  const secretOk = Boolean(testSecret && headerSecret && headerSecret === testSecret)
  if (!secretOk) {
    try {
      await requireRole(["admin"], req)
    } catch (e) {
      if (e instanceof RequireRoleError) {
        return NextResponse.json({ error: e.message }, { status: e.status })
      }
      throw e
    }
  }

  let body: PostBody
  try {
    body = (await req.json()) as PostBody
  } catch {
    return NextResponse.json({ error: "JSON invalid" }, { status: 400 })
  }

  const managerUid = String(body.managerUid || "").trim()
  if (!managerUid || looksLikePlaceholderUid(managerUid)) {
    return NextResponse.json({ error: "managerUid lipsă sau invalid" }, { status: 400 })
  }

  const userSnap = await adminDb.collection("users").doc(managerUid).get()
  if (!userSnap.exists) {
    return NextResponse.json({ error: `Nu există users/${managerUid}` }, { status: 400 })
  }
  const email = String(userSnap.data()?.email || "").trim()
  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: `users/${managerUid} nu are email valid (reminder-ul e trimis la manager).` },
      { status: 400 }
    )
  }

  const scenario: HrReminderCronTestScenario =
    body.scenario === "day_before" ? "day_before" : "weekly"
  const docId = sanitizeHrReminderTestDocId(String(body.docId || ""))
  const requesterUid = String(body.requesterUid || "").trim() || managerUid

  let built: ReturnType<typeof buildHrReminderCronTestDoc>
  try {
    built = buildHrReminderCronTestDoc({
      scenario,
      nowMs: Date.now(),
      managerUid,
      requesterUid,
      docId,
      sectorId: body.sectorId,
      employeeId: body.employeeId,
    })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 })
  }

  if (body.dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      docId,
      managerEmail: email,
      ...built.summary,
      body: built.body,
      createdAtMs: built.createdAtMs,
    })
  }

  await adminDb
    .collection("hrRequests")
    .doc(docId)
    .set({
      ...built.body,
      createdAt: Timestamp.fromMillis(built.createdAtMs),
      updatedAt: FieldValue.serverTimestamp(),
    })

  return NextResponse.json({
    ok: true,
    docId,
    path: `hrRequests/${docId}`,
    managerEmail: email,
    ...built.summary,
    note:
      "Același tip de document ca la createHrRequest (fără verificare overlap). Rulează cron-ul sau Scheduler Run now.",
  })
}
