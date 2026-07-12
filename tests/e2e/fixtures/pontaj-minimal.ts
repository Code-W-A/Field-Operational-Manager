import { FieldValue, Timestamp, deleteCollection, e2eAuth, e2eDb, listDocuments, readDocument } from "./firebase-admin"

export const RUN_ID = process.env.E2E_PONTAJ_RUN_ID || "E2E_PONTAJ_STAGE5"
if (!/^E2E_PONTAJ_[A-Z0-9_]+$/.test(RUN_ID)) throw new Error(`E2E_ABORT: invalid runId ${RUN_ID}`)

export const PASSWORD = "Pontaj-E2E-2026!"
export const ADMIN_UID = `admin_${RUN_ID.toLowerCase()}`
export const TECH_UID = `tech_${RUN_ID.toLowerCase()}`
export const DISPATCHER_UID = `dispatcher_${RUN_ID.toLowerCase()}`
export const KIOSK_UID = `kiosk_${RUN_ID.toLowerCase()}`
export const CLIENT_UID = `client_${RUN_ID.toLowerCase()}`
export const UNKNOWN_UID = `unknown_${RUN_ID.toLowerCase()}`
export const NO_ROLE_UID = `norole_${RUN_ID.toLowerCase()}`
export const NO_USER_DOC_UID = `nouserdoc_${RUN_ID.toLowerCase()}`
export const DEPARTMENT_ID = `dept_${RUN_ID.toLowerCase()}`
export const EMPLOYEE_ID = `emp_${RUN_ID.toLowerCase()}`
export const ADMIN_EMPLOYEE_ID = `${EMPLOYEE_ID}_admin`
export const DISPATCHER_EMPLOYEE_ID = `${EMPLOYEE_ID}_dispatcher`
export const SECOND_TECH_EMPLOYEE_ID = `${EMPLOYEE_ID}_second_tech`
export const MONTH_KEY = "2026-07"
export const DAY_KEY = "8"
export const TIMESHEET_ID = `${EMPLOYEE_ID}_${MONTH_KEY}`
export const ADMIN_EMAIL = `admin.${RUN_ID.toLowerCase()}@e2e.invalid`
export const TECH_EMAIL = `tech.${RUN_ID.toLowerCase()}@e2e.invalid`
export const DISPATCHER_EMAIL = `dispatcher.${RUN_ID.toLowerCase()}@e2e.invalid`
export const KIOSK_EMAIL = `kiosk.${RUN_ID.toLowerCase()}@e2e.invalid`
export const CLIENT_EMAIL = `client.${RUN_ID.toLowerCase()}@e2e.invalid`
export const UNKNOWN_EMAIL = `unknown.${RUN_ID.toLowerCase()}@e2e.invalid`
export const NO_ROLE_EMAIL = `norole.${RUN_ID.toLowerCase()}@e2e.invalid`
export const NO_USER_DOC_EMAIL = `nouserdoc.${RUN_ID.toLowerCase()}@e2e.invalid`

export const E2E_USERS = [
  { uid: ADMIN_UID, email: ADMIN_EMAIL, displayName: `${RUN_ID} Admin`, role: "admin" },
  { uid: TECH_UID, email: TECH_EMAIL, displayName: `${RUN_ID} Tehnician`, role: "tehnician" },
  { uid: DISPATCHER_UID, email: DISPATCHER_EMAIL, displayName: `${RUN_ID} Dispecer`, role: "dispecer" },
  { uid: KIOSK_UID, email: KIOSK_EMAIL, displayName: `${RUN_ID} Kiosk`, role: "kiosk" },
  { uid: CLIENT_UID, email: CLIENT_EMAIL, displayName: `${RUN_ID} Client`, role: "client" },
  { uid: UNKNOWN_UID, email: UNKNOWN_EMAIL, displayName: `${RUN_ID} Unknown`, role: "rol-necunoscut" },
  { uid: NO_ROLE_UID, email: NO_ROLE_EMAIL, displayName: `${RUN_ID} No Role` },
  { uid: NO_USER_DOC_UID, email: NO_USER_DOC_EMAIL, displayName: `${RUN_ID} No User Doc`, omitUserDoc: true },
] as const

async function upsertAuthUser(params: { uid: string; email: string; displayName: string }) {
  try {
    await e2eAuth.updateUser(params.uid, { email: params.email, password: PASSWORD, displayName: params.displayName })
  } catch (error: any) {
    if (error?.code !== "auth/user-not-found") throw error
    await e2eAuth.createUser({ ...params, password: PASSWORD, emailVerified: true })
  }
}

export async function seedMinimalPontajFixture(options: { auth?: boolean } = {}) {
  if (options.auth !== false) {
    await Promise.all(E2E_USERS.map(({ uid, email, displayName }) => upsertAuthUser({ uid, email, displayName })))
  }

  const batch = e2eDb.batch()
  for (const user of E2E_USERS) {
    if ("omitUserDoc" in user && user.omitUserDoc) {
      batch.delete(e2eDb.collection("users").doc(user.uid))
      continue
    }
    batch.set(e2eDb.collection("users").doc(user.uid), {
      uid: user.uid, email: user.email, displayName: user.displayName,
      ...("role" in user ? { role: user.role } : {}),
      ownerRunId: RUN_ID, updatedAt: FieldValue.serverTimestamp(),
    })
  }
  batch.set(e2eDb.collection("hrDepartments").doc(DEPARTMENT_ID), {
    name: `${RUN_ID} Departament`, active: true, managerUid: ADMIN_UID, ownerRunId: RUN_ID,
    updatedAt: FieldValue.serverTimestamp(),
  })
  batch.set(e2eDb.collection("hrEmployees").doc(EMPLOYEE_ID), {
    prenume: "Tehnician", nume: RUN_ID, fullName: `Tehnician ${RUN_ID}`, title: "Tehnician E2E",
    active: true, userUid: TECH_UID, sectorIds: [DEPARTMENT_ID],
    managerUidBySector: { [DEPARTMENT_ID]: ADMIN_UID },
    programLucruStart: "08:00", programLucruEnd: "16:30", pauzaStart: "12:30", pauzaEnd: "13:00",
    ownerRunId: RUN_ID, updatedAt: FieldValue.serverTimestamp(),
  })
  batch.set(e2eDb.collection("hrSettings").doc("defaults"), {
    programLucruStart: "08:00", programLucruEnd: "16:30",
    pauzaStart: "12:30", pauzaEnd: "13:00", ownerRunId: RUN_ID,
    updatedAt: FieldValue.serverTimestamp(),
  })
  batch.delete(e2eDb.collection("hrTimesheets").doc(TIMESHEET_ID))
  await batch.commit()
}

export async function resetPontajMutations() {
  await Promise.all([
    deleteCollection("attendance"), deleteCollection("attendanceActiveSessions"),
    deleteCollection("hrTimesheets"), deleteCollection("logs"),
  ])
}

export async function seedActiveSession(startMs: number) {
  await resetPontajMutations()
  const sessionId = `att_${TECH_UID}_${startMs}`
  const batch = e2eDb.batch()
  batch.set(e2eDb.collection("attendance").doc(sessionId), {
    userId: TECH_UID, employeeId: EMPLOYEE_ID, sessionStart: Timestamp.fromMillis(startMs), status: "active",
    mode: "field", location: { lat: 44.4268, lng: 26.1025, address: "E2E" },
    deviceInfo: { type: "field", userAgent: "Playwright fixture" },
    programLucruStart: "08:00", programLucruEnd: "16:30", ownerRunId: RUN_ID,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  })
  batch.set(e2eDb.collection("attendanceActiveSessions").doc(TECH_UID), {
    userId: TECH_UID, employeeId: EMPLOYEE_ID, activeSessionId: sessionId,
    sessionStart: Timestamp.fromMillis(startMs), ownerRunId: RUN_ID, updatedAt: FieldValue.serverTimestamp(),
  })
  await batch.commit()
  return sessionId
}

export async function getAttendanceForTechnician() {
  const snapshot = await e2eDb.collection("attendance").where("userId", "==", TECH_UID).get()
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }))
}

export async function getLock() { return readDocument("attendanceActiveSessions", TECH_UID) }
export async function getTimesheet() { return readDocument("hrTimesheets", TIMESHEET_ID) }

export async function snapshotFirebaseState() {
  const result: Record<string, unknown> = {}
  for (const collectionName of ["users", "hrEmployees", "hrDepartments", "attendance", "attendanceActiveSessions", "hrTimesheets", "logs"]) {
    result[collectionName] = await listDocuments(collectionName)
  }
  return JSON.parse(JSON.stringify(result, (_key, value) => value && typeof value.toMillis === "function" ? value.toMillis() : value))
}
