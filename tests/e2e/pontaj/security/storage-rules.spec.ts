import { expect, test } from "@playwright/test"
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage"

import { createFirebaseWebClient, type E2ERole } from "../../fixtures/firebase-web-client"
import { e2eStorage } from "../../fixtures/firebase-admin"
import { EMPLOYEE_ID, RUN_ID, TECH_UID, seedMinimalPontajFixture } from "../../fixtures/pontaj-minimal"

const jpeg = new Blob(["jpeg-e2e"], { type: "image/jpeg" })
const pdf = new Blob(["pdf-e2e"], { type: "application/pdf" })

async function expectStorageDenied(operation: Promise<unknown>) {
  await expect(operation).rejects.toMatchObject({ code: "storage/unauthorized" })
}

async function withWebClient<T>(role: E2ERole, action: (client: Awaited<ReturnType<typeof createFirebaseWebClient>>) => Promise<T>) {
  const client = await createFirebaseWebClient(role)
  try {
    return await action(client)
  } finally {
    await client.dispose()
  }
}

test.describe("@security-hardening RES-006 Storage Rules directe prin Firebase Web SDK", () => {
  test.skip(process.env.PONTAJ_SECURITY_HARDENING !== "true", "SECURITY_HARDENING_DEFERRED_BY_OWNER")

  test.beforeEach(async () => {
    await seedMinimalPontajFixture()
    await e2eStorage.bucket().deleteFiles({ prefix: "attendance/selfies/" }).catch(() => undefined)
    await e2eStorage.bucket().deleteFiles({ prefix: "hrEmployees/" }).catch(() => undefined)
    await e2eStorage.bucket().deleteFiles({ prefix: "hr/requests/cm/" }).catch(() => undefined)
  })

  test("RES-006 tehnicianul poate scrie/citi selfie-ul propriu, nu path-ul altui salariat", async () => {
    const ownPath = `attendance/selfies/${TECH_UID}/att_${RUN_ID}/checkin.jpg`
    const otherPath = `attendance/selfies/other_${RUN_ID}/att_${RUN_ID}/checkin.jpg`
    await withWebClient("tehnician", async ({ storage }) => {
      await expect(uploadBytes(ref(storage, ownPath), jpeg, { contentType: "image/jpeg" })).resolves.toBeTruthy()
      await expect(getDownloadURL(ref(storage, ownPath))).resolves.toMatch(/^https?:/)
      await expectStorageDenied(uploadBytes(ref(storage, otherPath), jpeg, { contentType: "image/jpeg" }))
    })
  })

  test("RES-006 kiosk are numai contractul de selfie, iar fallback-ul random este refuzat", async () => {
    const kioskPath = `attendance/selfies/${TECH_UID}/att_kiosk_${RUN_ID}/checkout.jpg`
    await withWebClient("kiosk", async ({ storage }) => {
      await expect(uploadBytes(ref(storage, kioskPath), jpeg, { contentType: "image/jpeg" })).resolves.toBeTruthy()
      await expectStorageDenied(uploadBytes(ref(storage, `random/${RUN_ID}.txt`), pdf, { contentType: "application/pdf" }))
    })
    for (const role of ["client", "rol-necunoscut", "neautentificat"] as const) {
      await withWebClient(role, async ({ storage }) => {
        await expectStorageDenied(uploadBytes(ref(storage, `hrEmployees/${EMPLOYEE_ID}/profile.jpg`), jpeg, { contentType: "image/jpeg" }))
      })
    }
  })

  test("RES-006 profilul si CM au path-uri izolate si actiuni separate", async () => {
    const profilePath = `hrEmployees/${EMPLOYEE_ID}/profile.jpg`
    const cmPath = `hr/requests/cm/${EMPLOYEE_ID}/${RUN_ID}.pdf`
    await withWebClient("admin", async ({ storage }) => {
      await expect(uploadBytes(ref(storage, profilePath), jpeg, { contentType: "image/jpeg" })).resolves.toBeTruthy()
      await expect(deleteObject(ref(storage, profilePath))).resolves.toBeUndefined()
    })
    await withWebClient("tehnician", async ({ storage }) => {
      await expect(uploadBytes(ref(storage, cmPath), pdf, { contentType: "application/pdf" })).resolves.toBeTruthy()
      await expectStorageDenied(uploadBytes(ref(storage, `hr/requests/cm/other_${RUN_ID}/x.pdf`), pdf, { contentType: "application/pdf" }))
    })
  })
})
