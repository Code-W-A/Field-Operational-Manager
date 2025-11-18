import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore"
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from "firebase/storage"
import { db, storage } from "@/lib/firebase/config"
import type { RevisionChecklistSection } from "@/types/revision"

export interface RevisionPhotoMeta {
  path: string
  url: string
  createdAt: any
  uploadedBy?: string
  fileName?: string
}

export interface EquipmentRevisionDoc {
  equipmentId: string
  equipmentName?: string
  sections: RevisionChecklistSection[]
  photos?: RevisionPhotoMeta[]
  internalNote?: string
  completedAt?: any
  completedBy?: string
  overallState?: "functional" | "nefunctional" | "na"
  createdAt?: any
  updatedAt?: any
}

export async function getRevisionDoc(workId: string, equipmentId: string): Promise<EquipmentRevisionDoc | null> {
  const refDoc = doc(db, "lucrari", workId, "revisions", equipmentId)
  const snap = await getDoc(refDoc)
  if (!snap.exists()) return null
  return { id: snap.id, ...(snap.data() as any) } as EquipmentRevisionDoc
}

export async function listRevisionsForWork(workId: string): Promise<EquipmentRevisionDoc[]> {
  const col = collection(db, "lucrari", workId, "revisions")
  const qs = await getDocs(col)
  return qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as EquipmentRevisionDoc))
}

export async function upsertRevisionDoc(
  workId: string,
  equipmentId: string,
  data: Partial<EquipmentRevisionDoc>
) {
  const refDoc = doc(db, "lucrari", workId, "revisions", equipmentId)
  const existing = await getDoc(refDoc)
  const payload: any = {
    ...data,
    updatedAt: serverTimestamp(),
  }
  if (!existing.exists()) {
    payload.createdAt = serverTimestamp()
    await setDoc(refDoc, payload, { merge: true })
  } else {
    await updateDoc(refDoc, payload)
  }
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


