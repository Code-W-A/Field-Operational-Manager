import { createHash } from "node:crypto"
import { Timestamp, type Firestore } from "firebase-admin/firestore"
import { assigned } from "@/packages/fom-domain"

export class RevisionPhotoError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export function revisionPhotoDeletionId(workId: string, equipmentId: string, path: string) {
  return createHash("sha256").update(JSON.stringify([workId, equipmentId, path])).digest("hex")
}

/** Keep a server-only receipt so lost responses and Storage failures can be retried safely. */
export function revisionPhotoService(db: Firestore, deleteStorageFile: (path: string) => Promise<unknown>) {
  return {
    async deletePhoto(actor: { uid: string; role: string }, workId: string, equipmentId: string, path: string) {
      if (![workId, equipmentId].every(id => typeof id === "string" && /^[\w-]{1,160}$/.test(id)) ||
          typeof path !== "string" || !path || path.length > 1500) {
        throw new RevisionPhotoError("Fotografie invalidă.")
      }
      const revisionRef = db.doc(`lucrari/${workId}/revisions/${equipmentId}`)
      const receiptRef = db.collection("revisionPhotoDeletions").doc(revisionPhotoDeletionId(workId, equipmentId, path))
      const receipt = await db.runTransaction(async tx => {
        const [user, work, revision, previous] = await Promise.all([
          tx.get(db.collection("users").doc(actor.uid)),
          tx.get(db.collection("lucrari").doc(workId)),
          tx.get(revisionRef),
          tx.get(receiptRef),
        ])
        const profile = user.data()
        if (!profile || profile.disabled === true || profile.role !== actor.role ||
            !["admin", "dispecer", "tehnician"].includes(profile.role)) {
          throw new RevisionPhotoError("Nu ai permisiune pentru această acțiune.", 403)
        }
        if (!work.exists) throw new RevisionPhotoError("Tichet inexistent.", 404)
        if (profile.role === "tehnician") {
          if (!assigned(work.data()!, { ...actor, displayName: String(profile.displayName || "") })) {
            throw new RevisionPhotoError("Tichetul nu îți mai este atribuit.", 403)
          }
          // A legacy name assignment must identify exactly one technician.
          if (!Array.isArray(work.data()?.technicianIds) || !work.data()!.technicianIds.includes(actor.uid)) {
            const matches = await tx.get(db.collection("users").where("displayName", "==", profile.displayName))
            if (matches.docs.filter(doc => doc.data().role === "tehnician").length !== 1) {
              throw new RevisionPhotoError("Numele tehnicianului este ambiguu.", 403)
            }
          }
        }
        const photos = Array.isArray(revision.data()?.photos) ? revision.data()!.photos : []
        const photo = photos.find((photo: { path?: string }) => photo.path === path)
        const prior = previous.data()
        if (!photo && !prior) throw new RevisionPhotoError("Fotografia nu este asociată acestei revizii.", 404)
        const stored = prior || { path: photo.path, workId, equipmentId, deletedBy: actor.uid, deletedAt: Timestamp.now(), storageDeleted: false }
        if (photo) tx.update(revisionRef, { photos: photos.filter((photo: { path?: string }) => photo.path !== path) })
        if (!prior) tx.create(receiptRef, stored)
        return stored
      })
      if (!receipt.storageDeleted) {
        try {
          // The path comes only from persisted revision metadata or its deletion receipt.
          await deleteStorageFile(receipt.path)
          await receiptRef.update({ storageDeleted: true })
        } catch {
          throw new RevisionPhotoError("Fotografia a fost scoasă din fișă, dar ștergerea fișierului nu s-a încheiat. Reîncearcă.", 503)
        }
      }
      return { deleted: true as const, path }
    },
  }
}
