"use client"

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { uploadFile, deleteFile } from "@/lib/firebase/storage"

export type DocumentatiiFolder = {
  id: string
  name: string
  createdAt?: any
  createdBy?: string
}

export type DocumentatiiSubfolder = {
  id: string
  folderId: string
  name: string
  createdAt?: any
  createdBy?: string
}

export type DocumentatiiFile = {
  id: string
  folderId: string
  subfolderId: string | null
  name: string
  size: number
  contentType: string
  storagePath: string
  downloadUrl: string
  uploadedAt?: any
  uploadedBy?: string
}

const foldersCol = collection(db, "documentatii_folders")
const subfoldersCol = collection(db, "documentatii_subfolders")
const filesCol = collection(db, "documentatii_files")

const normalizeName = (name: string) => String(name || "").trim()

const safeFileName = (name: string) =>
  String(name || "")
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim()

export const subscribeDocumentatiiFolders = (cb: (items: DocumentatiiFolder[]) => void) => {
  const q = query(foldersCol, orderBy("name", "asc"))
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as DocumentatiiFolder[]
    cb(items)
  })
}

export const subscribeDocumentatiiSubfolders = (folderId: string, cb: (items: DocumentatiiSubfolder[]) => void) => {
  const q = query(subfoldersCol, where("folderId", "==", folderId), orderBy("name", "asc"))
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as DocumentatiiSubfolder[]
    cb(items)
  })
}

export const subscribeDocumentatiiFiles = (
  folderId: string,
  subfolderId: string | null,
  cb: (items: DocumentatiiFile[]) => void,
) => {
  const q = query(
    filesCol,
    where("folderId", "==", folderId),
    where("subfolderId", "==", subfolderId),
    orderBy("name", "asc"),
  )
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as DocumentatiiFile[]
    cb(items)
  })
}

export const createDocumentatiiFolder = async (name: string, createdBy?: string) => {
  const payload = {
    name: normalizeName(name),
    createdAt: serverTimestamp(),
    createdBy: createdBy || "Admin",
  }
  const ref = await addDoc(foldersCol, payload as any)
  return ref.id
}

export const renameDocumentatiiFolder = async (folderId: string, name: string) => {
  await updateDoc(doc(foldersCol, folderId), { name: normalizeName(name) } as any)
}

export const deleteDocumentatiiFolder = async (folderId: string) => {
  // Delete files (root)
  const rootFilesSnap = await getDocs(
    query(filesCol, where("folderId", "==", folderId), where("subfolderId", "==", null)),
  )
  for (const f of rootFilesSnap.docs) {
    const data: any = f.data()
    if (data?.storagePath) {
      await deleteFile(String(data.storagePath))
    }
    await deleteDoc(f.ref)
  }

  // Delete subfolders + their files
  const subfoldersSnap = await getDocs(query(subfoldersCol, where("folderId", "==", folderId)))
  for (const sf of subfoldersSnap.docs) {
    const sfId = sf.id
    const filesSnap = await getDocs(query(filesCol, where("folderId", "==", folderId), where("subfolderId", "==", sfId)))
    for (const f of filesSnap.docs) {
      const data: any = f.data()
      if (data?.storagePath) {
        await deleteFile(String(data.storagePath))
      }
      await deleteDoc(f.ref)
    }
    await deleteDoc(sf.ref)
  }

  await deleteDoc(doc(foldersCol, folderId))
}

export const createDocumentatiiSubfolder = async (folderId: string, name: string, createdBy?: string) => {
  const payload = {
    folderId,
    name: normalizeName(name),
    createdAt: serverTimestamp(),
    createdBy: createdBy || "Admin",
  }
  const ref = await addDoc(subfoldersCol, payload as any)
  return ref.id
}

export const renameDocumentatiiSubfolder = async (subfolderId: string, name: string) => {
  await updateDoc(doc(subfoldersCol, subfolderId), { name: normalizeName(name) } as any)
}

export const deleteDocumentatiiSubfolder = async (folderId: string, subfolderId: string) => {
  const filesSnap = await getDocs(
    query(filesCol, where("folderId", "==", folderId), where("subfolderId", "==", subfolderId)),
  )
  for (const f of filesSnap.docs) {
    const data: any = f.data()
    if (data?.storagePath) {
      await deleteFile(String(data.storagePath))
    }
    await deleteDoc(f.ref)
  }
  await deleteDoc(doc(subfoldersCol, subfolderId))
}

export const uploadDocumentatiiFiles = async (
  folderId: string,
  subfolderId: string | null,
  files: File[],
  uploadedBy?: string,
) => {
  const results: DocumentatiiFile[] = []
  for (const file of files) {
    const fileDocRef = doc(filesCol)
    const fileId = fileDocRef.id
    const safeName = safeFileName(file.name)
    const storagePath = `fom/documentatii/${folderId}${subfolderId ? `/${subfolderId}` : ""}/${fileId}-${safeName}`
    const uploaded = await uploadFile(file, storagePath)
    const payload: DocumentatiiFile = {
      id: fileId,
      folderId,
      subfolderId: subfolderId || null,
      name: file.name || safeName || uploaded.fileName,
      size: file.size,
      contentType: file.type || "application/octet-stream",
      storagePath,
      downloadUrl: uploaded.url,
      uploadedAt: serverTimestamp() as any,
      uploadedBy: uploadedBy || "Admin",
    }
    await setDoc(fileDocRef, payload as any)
    results.push(payload)
  }
  return results
}

export const renameDocumentatiiFile = async (fileId: string, name: string) => {
  await updateDoc(doc(filesCol, fileId), { name: normalizeName(name) } as any)
}

export const deleteDocumentatiiFile = async (fileId: string, storagePath: string) => {
  if (storagePath) {
    await deleteFile(storagePath)
  }
  await deleteDoc(doc(filesCol, fileId))
}
