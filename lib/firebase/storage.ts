import { ref, uploadBytes, getDownloadURL, deleteObject, type UploadResult } from "firebase/storage"
import { storage } from "./config"
import { logInfo, logWarning } from "@/lib/utils/logging-service"

// Încărcare fișier
export const uploadFile = async (file: File, path: string): Promise<{ url: string; fileName: string }> => {
  try {
    const storageRef = ref(storage, path)
    const result: UploadResult = await uploadBytes(storageRef, file)
    const url = await getDownloadURL(result.ref)

    // Adăugăm un log pentru încărcarea fișierului
    logInfo(`A fost încărcat fișierul ${file.name} la calea ${path}`, { fileName: file.name, path }, { category: "fișiere" })

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

    // Adăugăm un log pentru ștergerea fișierului
    logWarning(`A fost șters fișierul de la calea ${path}`, { path }, { category: "fișiere" })
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
