import { ref, uploadBytes, getDownloadURL, deleteObject, type UploadResult } from "firebase/storage"
import { storage } from "./config"
import { addLog } from "./firestore"

// Încărcare fișier
export const uploadFile = async (file: File, path: string): Promise<{ url: string; fileName: string }> => {
  try {
    const storageRef = ref(storage, path)
    const result: UploadResult = await uploadBytes(storageRef, file)
    const url = await getDownloadURL(result.ref)

    // Adăugăm un log pentru încărcarea fișierului
    await addLog("Încărcare fișier", `A fost încărcat fișierul ${file.name} la calea ${path}`, "Informație", "Fișiere")

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
    await addLog("Ștergere fișier", `A fost șters fișierul de la calea ${path}`, "Avertisment", "Fișiere")
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
