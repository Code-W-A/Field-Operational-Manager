import { validateRevision } from "@/packages/fom-domain";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore"
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from "firebase/storage"
import { db, storage } from "@/lib/firebase/config"
import type { RevisionChecklistSection } from "@/types/revision"

import type { RevisionPhotoMeta, EquipmentRevisionDoc } from "@/packages/fom-domain/revision";
export type { RevisionPhotoMeta, EquipmentRevisionDoc } from "@/packages/fom-domain/revision";

export async function getRevisionDoc(workId: string, equipmentId: string): Promise<EquipmentRevisionDoc | null> {
  const refDoc = doc(db, "lucrari", workId, "revisions", equipmentId)
  const snap = await getDoc(refDoc)
  if (!snap.exists()) return null
  return { id: snap.id, ...(snap.data() as any) } as EquipmentRevisionDoc
}

/**
 * Subscribe to real-time updates for a revision document
 */
export function subscribeRevisionDoc(
  workId: string,
  equipmentId: string,
  callback: (doc: EquipmentRevisionDoc | null) => void
): () => void {
  const refDoc = doc(db, "lucrari", workId, "revisions", equipmentId)
  const unsub = onSnapshot(refDoc, (snap) => {
    if (!snap.exists()) {
      callback(null)
    } else {
      callback({ id: snap.id, ...(snap.data() as any) } as EquipmentRevisionDoc)
    }
  })
  return unsub
}

export async function listRevisionsForWork(workId: string): Promise<EquipmentRevisionDoc[]> {
  const col = collection(db, "lucrari", workId, "revisions")
  const qs = await getDocs(col)
  return qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as EquipmentRevisionDoc))
}

export async function upsertRevisionDoc(
  workId: string,
  equipmentId: string,
  data: Partial<EquipmentRevisionDoc>,
  options: { draft?: boolean } = {}
) {
  if (data.sections) {
    data = {
      ...data,
      sections: validateRevision(data.sections as any, data.sections as any, options) as any,
    }
  }
  const refDoc = doc(db, "lucrari", workId, "revisions", equipmentId)
  
  // Remove undefined values (Firestore doesn't accept them)
  const cleanData: any = {}
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined) {
      cleanData[key] = value
    }
  })
  
  const payload: any = {
    ...cleanData,
    updatedAt: serverTimestamp(),
  }
  
  // Always use setDoc with merge: true to preserve existing fields
  const existing = await getDoc(refDoc)
  if (!existing.exists()) {
    payload.createdAt = serverTimestamp()
  }
  
  await setDoc(refDoc, payload, { merge: true })
}

export async function uploadRevisionPhoto(
  workId: string,
  equipmentId: string,
  file: File,
  uploadedBy?: string
): Promise<RevisionPhotoMeta> {
  const ts = Date.now()
  const safeName = file.name.replace(/\s+/g, "_")
  const path = `revisions/${workId}/${equipmentId}/${ts}_${safeName}`
  const sref = ref(storage, path)
  await uploadBytes(sref, file)
  const url = await getDownloadURL(sref)
  const meta: RevisionPhotoMeta = {
    path,
    url,
    createdAt: new Date().toISOString(),
    uploadedBy,
    fileName: file.name,
  }
  // push meta into doc
  await upsertRevisionDoc(workId, equipmentId, {
    photos: [...(((await getRevisionDoc(workId, equipmentId))?.photos) || []), meta],
  })
  return meta
}

export async function deleteRevisionPhoto(path: string): Promise<void> {
  const sref = ref(storage, path)
  await deleteObject(sref)
}


