import { deleteCollection, e2eAuth, e2eStorage, listDocuments } from "./firebase-admin"
import { ADMIN_UID, DEPARTMENT_ID, E2E_USERS, EMPLOYEE_ID, RUN_ID, TECH_UID } from "./pontaj-minimal"

export async function cleanupPontajRun() {
  for (const collectionName of [
    "logs", "attendance", "attendanceActiveSessions", "hrTimesheets", "e2eOpenRules",
    "hrEmployees", "hrDepartments", "hrSettings", "hrRequests", "hrNotificationDispatches", "emailEvents", "hrCounters", "hrHolidays", "users", "e2eHealth", "e2ePontajVectors",
  ]) {
    await deleteCollection(collectionName)
  }

  for (const { uid } of E2E_USERS) {
    try {
      await e2eAuth.deleteUser(uid)
    } catch (error: any) {
      if (error?.code !== "auth/user-not-found") throw error
    }
  }

  try {
    await e2eStorage.bucket().deleteFiles({ prefix: "attendance/selfies/" })
    await e2eStorage.bucket().deleteFiles({ prefix: "hr/" })
    await e2eStorage.bucket().deleteFiles({ prefix: "hrEmployees/" })
    await e2eStorage.bucket().deleteFiles({ prefix: "random/open-rules/" })
  } catch {
    // The field flow intentionally continues without a selfie in this slice.
  }
}

export async function inspectRemainingRunResources() {
  const result: Record<string, string[]> = {}
  for (const collectionName of ["logs", "attendance", "attendanceActiveSessions", "hrTimesheets", "hrEmployees", "hrDepartments", "hrSettings", "hrRequests", "hrNotificationDispatches", "emailEvents", "hrCounters", "hrHolidays", "users", "e2eHealth", "e2ePontajVectors", "e2eOpenRules"]) {
    const docs = await listDocuments(collectionName)
    const matching = docs.filter((document: any) =>
      document.ownerRunId === RUN_ID ||
      [...E2E_USERS.map(({ uid }) => uid), EMPLOYEE_ID, DEPARTMENT_ID].includes(document.id) ||
      document.userId === TECH_UID || document.utilizatorId === TECH_UID || document.utilizatorId === ADMIN_UID,
    )
    if (matching.length) result[collectionName] = matching.map((document) => document.id)
  }
  const storagePrefixes = ["attendance/selfies/", "hr/", "hrEmployees/", "random/open-rules/"]
  for (const prefix of storagePrefixes) {
    const [files] = await e2eStorage.bucket().getFiles({ prefix })
    if (files.length) result[`storage:${prefix}`] = files.map((file) => file.name)
  }
  return result
}
