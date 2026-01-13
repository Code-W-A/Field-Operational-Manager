import { deleteFile, uploadFile } from "@/lib/firebase/storage"

const MAX_BYTES = 5 * 1024 * 1024

function extFromMime(mime: string): "jpg" | "png" | "webp" {
  const m = mime.toLowerCase()
  if (m === "image/jpeg" || m === "image/jpg") return "jpg"
  if (m === "image/png") return "png"
  if (m === "image/webp") return "webp"
  // Default to jpg to keep a stable extension.
  return "jpg"
}

export function getEmployeeProfilePhotoPath(employeeId: string, ext: "jpg" | "png" | "webp") {
  return `hrEmployees/${employeeId}/profile.${ext}`
}

export async function uploadEmployeeProfilePhoto(employeeId: string, file: File): Promise<{ photoURL: string; path: string }> {
  if (!employeeId?.trim()) throw new Error("employeeId invalid")
  if (!file) throw new Error("Fișier invalid")
  if (file.size > MAX_BYTES) throw new Error("Fișier prea mare (max 5MB).")
  if (!file.type?.startsWith("image/")) throw new Error("Fișier invalid (doar imagini).")

  const ext = extFromMime(file.type)
  const path = getEmployeeProfilePhotoPath(employeeId, ext)
  const { url } = await uploadFile(file, path)
  return { photoURL: url, path }
}

export async function deleteEmployeeProfilePhoto(employeeId: string): Promise<void> {
  if (!employeeId?.trim()) return
  const candidates: Array<"jpg" | "png" | "webp"> = ["jpg", "png", "webp"]
  await Promise.all(
    candidates.map(async (ext) => {
      try {
        await deleteFile(getEmployeeProfilePhotoPath(employeeId, ext))
      } catch {
        // Best-effort: ignore not-found / permission / etc.
      }
    })
  )
}
