import { ref, uploadBytes, getDownloadURL, deleteObject, type UploadResult } from "firebase/storage"
import { storage } from "./config"
import { logInfo, logWarning } from "@/lib/utils/logging-service"
import { addDoc, collection, serverTimestamp } from "firebase/firestore"
import { db } from "./config"
import { auth } from "./config"

// Încărcare fișier
export const uploadFile = async (file: File, path: string): Promise<{ url: string; fileName: string }> => {
  try {
    const storageRef = ref(storage, path)
    const result: UploadResult = await uploadBytes(storageRef, file)
    const url = await getDownloadURL(result.ref)

    // Console log + scriere non‑blocking în Firestore logs
    logInfo(`A fost încărcat fișierul ${file.name} la calea ${path}`, { fileName: file.name, path }, { category: "fișiere" })
    const currentUser = auth.currentUser
    void addDoc(collection(db, "logs"), {
      timestamp: serverTimestamp(),
      utilizator: currentUser?.displayName || currentUser?.email || "Sistem",
      utilizatorId: currentUser?.uid || "system",
      actiune: "Încărcare fișier",
      detalii: `${file.name} → ${path}`,
      tip: "Informație",
      categorie: "Fișiere",
    }).catch(() => {})

    return {
      url,
      fileName: file.name,
    }
  } catch (error) {
    console.error("Eroare la încărcarea fișierului:", error)
    throw error
  }
}

// Ștergere fișier
export const deleteFile = async (path: string): Promise<void> => {
  try {
    const storageRef = ref(storage, path)
    await deleteObject(storageRef)

    // Console log + scriere non‑blocking în Firestore logs
    logWarning(`A fost șters fișierul de la calea ${path}`, { path }, { category: "fișiere" })
    const currentUser = auth.currentUser
    void addDoc(collection(db, "logs"), {
      timestamp: serverTimestamp(),
      utilizator: currentUser?.displayName || currentUser?.email || "Sistem",
      utilizatorId: currentUser?.uid || "system",
      actiune: "Ștergere fișier",
      detalii: path,
      tip: "Avertisment",
      categorie: "Fișiere",
    }).catch(() => {})
  } catch (error) {
    console.error("Eroare la ștergerea fișierului:", error)
    throw error
  }
}

// Obținere URL pentru descărcare
export const getFileUrl = async (path: string): Promise<string> => {
  try {
    const storageRef = ref(storage, path)
    return getDownloadURL(storageRef)
  } catch (error) {
    console.error("Eroare la obținerea URL-ului fișierului:", error)
    throw error
  }
}
