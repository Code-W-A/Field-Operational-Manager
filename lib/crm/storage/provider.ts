import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage"
import { storage } from "@/lib/firebase/config"

export interface UploadCrmFileInput {
  opportunityId: string
  file: File
}

export interface UploadCrmFileResult {
  path: string
  url: string
  filename: string
  mime: string
  size: number
}

export interface StorageProvider {
  uploadOpportunityFile(input: UploadCrmFileInput): Promise<UploadCrmFileResult>
  deleteOpportunityFile(path: string): Promise<void>
}

class FirebaseStorageProvider implements StorageProvider {
  async uploadOpportunityFile(input: UploadCrmFileInput): Promise<UploadCrmFileResult> {
    const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
    const path = `crm/opportunities/${input.opportunityId}/${Date.now()}_${safeName}`
    const storageRef = ref(storage, path)
    const uploadResult = await uploadBytes(storageRef, input.file)
    const url = await getDownloadURL(uploadResult.ref)

    return {
      path,
      url,
      filename: input.file.name,
      mime: input.file.type || "application/octet-stream",
      size: input.file.size,
    }
  }

  async deleteOpportunityFile(path: string): Promise<void> {
    await deleteObject(ref(storage, path))
  }
}

export const crmStorageProvider: StorageProvider = new FirebaseStorageProvider()
