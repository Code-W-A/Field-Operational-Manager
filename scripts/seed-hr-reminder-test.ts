/**
 * Scrie în Firestore o cerere HR `pending` (aceeași structură ca `createHrRequest`)
 * pentru testarea cron-ului `sendHrRequestPendingApprovalReminders`.
 *
 * Logica documentului: `lib/hr/reminder-cron-test-doc.server.ts`
 * Alternativ (din browser, ca admin): POST /api/admin/seed-hr-reminder-test
 *
 * În zsh nu lipi liniile care încep cu #.
 *
 *   npm run seed:hr-reminder-test -- --list-users
 *   npm run seed:hr-reminder-test -- --managerUid=... --dry-run
 *   npm run seed:hr-reminder-test -- --managerUid=... --docId=test_2
 */

import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { initializeApp, cert, getApps } from "firebase-admin/app"
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore"
import {
  buildHrReminderCronTestDoc,
  sanitizeHrReminderTestDocId,
  type HrReminderCronTestScenario,
} from "../lib/hr/reminder-cron-test-doc.server"

function loadDotEnv(filePath: string) {
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, "utf8")
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue
    const index = line.indexOf("=")
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    const raw = line.slice(index + 1).trim()
    if (!key || process.env[key]) continue
    process.env[key] = raw.replace(/^"|"$/g, "")
  }
}

loadDotEnv(path.resolve(process.cwd(), ".env"))

function parseArgs(argv: string[]) {
  const out = {
    managerUid: "",
    scenario: "weekly" as HrReminderCronTestScenario,
    dryRun: false,
    requesterUid: "",
    listUsers: false,
    docId: "seed_hr_reminder_test",
  }
  for (const a of argv) {
    if (a === "--dry-run") out.dryRun = true
    else if (a === "--list-users") out.listUsers = true
    else if (a.startsWith("--managerUid=")) out.managerUid = a.slice("--managerUid=".length).trim()
    else if (a.startsWith("--scenario=")) {
      const s = a.slice("--scenario=".length).trim()
      if (s === "day_before" || s === "weekly") out.scenario = s
    } else if (a.startsWith("--requesterUid=")) out.requesterUid = a.slice("--requesterUid=".length).trim()
    else if (a.startsWith("--docId=")) {
      const id = a.slice("--docId=".length).trim()
      if (id) out.docId = id
    }
  }
  return out
}

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n")

const args = parseArgs(process.argv.slice(2))

if (!projectId || !clientEmail || !privateKey) {
  console.error("Lipsesc NEXT_PUBLIC_FIREBASE_PROJECT_ID sau FIREBASE_ADMIN_* în .env")
  process.exit(1)
}

if (!getApps().length) {
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  })
}

const db = getFirestore()

function looksLikePlaceholderUid(uid: string) {
  if (!uid) return true
  const u = uid.toUpperCase()
  return u.includes("UIDUL") || u === "YOUR_UID" || u === "UID" || uid.length < 10
}

async function listUsersWithEmail() {
  const snap = await db.collection("users").limit(80).get()
  const rows: { uid: string; email: string; displayName: string; role: string }[] = []
  for (const doc of snap.docs) {
    const d = doc.data() || {}
    const email = String(d.email || "").trim()
    if (!email.includes("@")) continue
    rows.push({
      uid: doc.id,
      email,
      displayName: String(d.displayName || "").trim() || "—",
      role: String(d.role || "").trim() || "—",
    })
  }
  rows.sort((a, b) => a.email.localeCompare(b.email))
  console.log("Utilizatori cu email în `users` (folosește coloana uid ca --managerUid):\n")
  console.log("uid\temail\trole\tdisplayName")
  for (const r of rows.slice(0, 40)) {
    console.log(`${r.uid}\t${r.email}\t${r.role}\t${r.displayName}`)
  }
  if (rows.length > 40) console.log(`\n… și încă ${rows.length - 40} (afișați max 40).`)
  console.log(
    `\nComandă exemplu:\nnpm run seed:hr-reminder-test -- --managerUid=${rows[0]?.uid || "PUNE_UID_AICI"} --dry-run`
  )
}

async function main() {
  if (args.listUsers) {
    await listUsersWithEmail()
    return
  }

  if (!args.managerUid || looksLikePlaceholderUid(args.managerUid)) {
    console.error(`„${args.managerUid}” nu pare un UID real. Rulează: npm run seed:hr-reminder-test -- --list-users\n`)
    process.exit(1)
  }

  const userSnap = await db.collection("users").doc(args.managerUid).get()
  if (!userSnap.exists) {
    console.error(`Nu există document users/${args.managerUid}`)
    process.exit(1)
  }
  const email = String(userSnap.data()?.email || "").trim()
  if (!email || !email.includes("@")) {
    console.error(`users/${args.managerUid} nu are câmpul email valid.`)
    process.exit(1)
  }

  const docId = sanitizeHrReminderTestDocId(args.docId)
  const requesterUid = args.requesterUid || args.managerUid

  const built = buildHrReminderCronTestDoc({
    scenario: args.scenario,
    nowMs: Date.now(),
    managerUid: args.managerUid,
    requesterUid,
    docId,
  })

  console.log(`— hrRequests/${docId} —`)
  console.log("todayKey (Europe/Bucharest):", built.summary.todayKey)
  console.log("scenario:", built.summary.scenario)
  console.log("manager email:", email)
  console.log(built.summary.scenarioNote)
  console.log(
    "document:",
    JSON.stringify(
      { ...built.body, createdAt: `[Timestamp ${built.createdAtMs}]`, updatedAt: "[serverTimestamp]" },
      null,
      2
    )
  )

  if (args.dryRun) {
    console.log("\n(dry-run, nu s-a scris nimic)")
    return
  }

  await db
    .collection("hrRequests")
    .doc(docId)
    .set({
      ...built.body,
      createdAt: Timestamp.fromMillis(built.createdAtMs),
      updatedAt: FieldValue.serverTimestamp(),
    })

  console.log(`\nScriere OK: hrRequests/${docId}`)
  console.log("Rulează Cloud Scheduler (Run now) pentru sendHrRequestPendingApprovalReminders sau așteaptă 08:00.")
  console.log("Log: firebase functions:log --only sendHrRequestPendingApprovalReminders -n 20")
  console.log(
    `\nDupă test: șterge hrRequests/${docId}. Pentru retest fără șters emailEvents: --docId=alt_id nou.`
  )
  console.log(
    "\nSau POST /api/admin/seed-hr-reminder-test (admin sau header x-hr-reminder-test-secret) — același payload."
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
