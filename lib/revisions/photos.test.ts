import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { initializeApp, deleteApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { revisionPhotoDeletionId, revisionPhotoService } from "./photos"
import { technicianService } from "@/lib/technician/service"

assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):\d+$/, "Local emulator required")
const projectId = "demo-fom-revision-photos"
const app = initializeApp({ projectId }, "revision-photo-tests")
const db = getFirestore(app)
const admin = { uid: "admin", role: "admin" }
const dispatcher = { uid: "dispatcher", role: "dispecer" }
const tech = { uid: "tech", role: "tehnician" }
let sequence = 0
const runId = `photo-work-${Date.now()}`
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1UAAAAASUVORK5CYII="
const sections = [{ id: "s", title: "Control", items: [{ id: "i", label: "Verificare", state: "functional" }] }]
before(async () => {
  const rules = await readFile(new URL("../../firestore.rules", import.meta.url), "utf8")
  const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}:securityRules`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: rules }] } }),
  })
  assert.ok(response.ok)
  for (const actor of [admin, dispatcher, tech, { uid: "other", role: "tehnician" }, { uid: "client", role: "client" }]) {
    await db.doc(`users/${actor.uid}`).set({ ...actor, displayName: actor.uid })
  }
  await db.doc("clienti/photo-client").set({ nume: "Client", locatii: [{ id: "loc", nume: "Sediu", echipamente: [{ id: "eq", cod: "QR", denumire: "Ușă" }] }] })
})
after(async () => { await db.terminate(); await deleteApp(app) })

async function fixture(extra: Record<string, unknown> = {}, count = 2) {
  const id = `${runId}-${++sequence}`
  const work = { tipLucrare: "Revizie", technicianIds: [tech.uid], clientId: "photo-client", locationId: "loc", equipmentIds: ["eq"],
    mobileVersion: "v1", revisionEquipmentTimes: { eq: { verifiedAt: new Date().toISOString() } }, statusLucrare: "În lucru", ...extra }
  const photos = Array.from({ length: count }, (_, index) => ({ path: `revisions/${id}/eq/${index}.png`, url: png, fileName: `${index}.png` }))
  const revision = { photos, sections, qrVerified: false, finalObservations: "Observații originale", completedAt: "2026-10-16T07:00:00Z", durationMinutes: 20 }
  await db.doc(`lucrari/${id}`).set(work)
  await db.doc(`lucrari/${id}/revisions/eq`).set(revision)
  return { id, photos, work, revision, ref: db.doc(`lucrari/${id}/revisions/eq`) }
}

test("authorized roles delete saved photos before QR and in every ticket state without changing the report", async () => {
  for (const actor of [admin, dispatcher, tech]) for (const statusLucrare of ["Atribuită", "În lucru", "Finalizat", "Amânată", "Arhivată", "Anulată"]) {
    const f = await fixture({ statusLucrare, raportDataLocked: true, raportGenerat: true, raportSnapshot: { document: "historic" } })
    const deleted: string[] = []
    const service = revisionPhotoService(db, async path => { deleted.push(path) })
    await service.deletePhoto(actor, f.id, "eq", f.photos[0].path)
    assert.deepEqual((await f.ref.get()).data(), { ...f.revision, photos: [f.photos[1]] })
    assert.deepEqual((await db.doc(`lucrari/${f.id}`).get()).data(), f.work)
    assert.deepEqual(deleted, [f.photos[0].path])
  }
})

test("last photo, lost response retry and concurrent duplicate deletion are idempotent", async () => {
  const f = await fixture({}, 1)
  const removed = new Set<string>()
  const service = revisionPhotoService(db, async path => { removed.add(path) })
  await Promise.all([service.deletePhoto(tech, f.id, "eq", f.photos[0].path), service.deletePhoto(tech, f.id, "eq", f.photos[0].path)])
  await service.deletePhoto(tech, f.id, "eq", f.photos[0].path)
  assert.deepEqual((await f.ref.get()).data()?.photos, [])
  assert.deepEqual([...removed], [f.photos[0].path])
})

test("failed Storage cleanup is retryable using only the persisted deletion receipt", async () => {
  const f = await fixture()
  let attempts = 0
  const service = revisionPhotoService(db, async () => { if (++attempts === 1) throw Error("offline") })
  await assert.rejects(service.deletePhoto(admin, f.id, "eq", f.photos[0].path), /Reîncearcă/)
  assert.deepEqual((await f.ref.get()).data()?.photos, [f.photos[1]])
  await service.deletePhoto(admin, f.id, "eq", f.photos[0].path)
  assert.equal(attempts, 2)
  assert.equal((await db.doc(`revisionPhotoDeletions/${revisionPhotoDeletionId(f.id, "eq", f.photos[0].path)}`).get()).data()?.storageDeleted, true)
})

test("unassigned, disabled, wrong-role and forged-file requests never touch Storage", async () => {
  const f = await fixture()
  const service = revisionPhotoService(db, async () => { assert.fail("Unauthorized Storage deletion") })
  for (const actor of [{ uid: "other", role: "tehnician" }, { uid: "client", role: "client" }, { uid: "tech", role: "admin" }]) {
    await assert.rejects(service.deletePhoto(actor, f.id, "eq", f.photos[0].path), (error: any) => error.status === 403)
  }
  await assert.rejects(service.deletePhoto(admin, f.id, "eq", "unrelated/secret.png"), /nu este asociată/)
  await assert.rejects(service.deletePhoto(admin, f.id, "wrong-equipment", f.photos[0].path), /nu este asociată/)
  await db.doc("users/disabled").set({ role: "admin", disabled: true })
  await assert.rejects(service.deletePhoto({ uid: "disabled", role: "admin" }, f.id, "eq", f.photos[0].path), (error: any) => error.status === 403)
  assert.deepEqual((await f.ref.get()).data(), f.revision)
})

test("legacy name assignments require a unique technician", async () => {
  const f = await fixture({ technicianIds: [], tehnicieni: ["tech"] })
  await db.doc("users/duplicate").set({ role: "tehnician", displayName: "tech" })
  const service = revisionPhotoService(db, async () => {})
  await assert.rejects(service.deletePhoto(tech, f.id, "eq", f.photos[0].path), /ambiguu/)
  await db.doc("users/duplicate").delete()
  await service.deletePhoto(tech, f.id, "eq", f.photos[0].path)
})

test("simultaneous photo append and deletion preserve the new photo and draft", async () => {
  const f = await fixture()
  const added = { path: `revisions/${f.id}/eq/new.png`, url: png }
  await Promise.all([
    revisionPhotoService(db, async () => {}).deletePhoto(admin, f.id, "eq", f.photos[0].path),
    db.runTransaction(async tx => {
      const revision = await tx.get(f.ref)
      tx.update(f.ref, { photos: [...revision.data()!.photos, added], finalObservations: "Ciornă simultană" })
    }),
  ])
  assert.deepEqual((await f.ref.get()).data()?.photos, [f.photos[1], added])
  assert.equal((await f.ref.get()).data()?.finalObservations, "Ciornă simultană")
})

test("stale and concurrent technician saves cannot restore deleted legacy or mobile-uploaded photos", async () => {
  for (const mobile of [false, true]) for (const concurrent of [false, true]) {
    const f = await fixture({}, 1)
    const photo = mobile ? { ...f.photos[0], id: "uploaded-file", path: `mobile/tech/${f.id}/uploaded-file` } : f.photos[0]
    if (mobile) {
      await f.ref.update({ photos: [photo] })
      await db.doc("mobileFiles/tech_uploaded-file").set({ ...photo, status: "ready", workId: f.id, purpose: "photo" })
    }
    const remove = () => revisionPhotoService(db, async () => {}).deletePhoto(tech, f.id, "eq", photo.path)
    const save = () => technicianService(db).command(tech.uid, { mutationId: `stale-save-${f.id}`, action: "revision.save", entityId: f.id,
      occurredAt: new Date().toISOString(), baseVersion: "v1", payload: { equipmentId: "eq", sections, photos: [photo], finalObservations: "Ciornă păstrată" } } as any, "web")
    if (concurrent) await Promise.all([remove(), save()])
    else { await remove(); await save() }
    assert.deepEqual((await f.ref.get()).data()?.photos, [])
    assert.equal((await f.ref.get()).data()?.finalObservations, "Ciornă păstrată")
  }
})

test("deletion receipts cannot be read or forged through the client API", async () => {
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/revisionPhotoDeletions/forged`
  for (const method of ["GET", "PATCH", "DELETE"]) {
    const response = await fetch(url, { method, ...(method === "PATCH" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: { storageDeleted: { booleanValue: true } } }) } : {}) })
    assert.equal(response.status, 403)
  }
})
