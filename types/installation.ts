import type { DocumentClientSnapshot } from "@/lib/work-documents/document-client-snapshot"

export type InstallationStatus = "in_progress" | "blocked" | "completed"
export type InstallationEquipment = { id: string; name: string; code: string; model: string }
export type InstallationPhoto = { id: string; path: string; name: string; contentType: string }
export type InstallationFields = {
  finding: string
  operations: string
  installationStatus: InstallationStatus
  blockReason: string
  internalNote: string
}
export type InstallationSignatures = {
  technicianName: string
  beneficiaryName: string
  technicianSignature: string
  beneficiarySignature: string
}
export type InstallationDocument = InstallationSignatures & {
  client: DocumentClientSnapshot
  workNumber: string
  workDate: string
  equipment: InstallationEquipment[]
  finding?: string
  operations?: string
  installationStatus?: InstallationStatus
  blockReason?: string
  observations?: string
  sheetReferences?: { workId: string; sheetId: string; workDate: string; equipmentName: string }[]
  photos: InstallationPhoto[]
}
export type InstallationSheet = InstallationFields & {
  id: string
  equipmentId: string
  principalUid: string
  principalName: string
  workDate: string
  state: "draft" | "closed"
  createdAt: string
  updatedAt: string
  closedAt?: string
  photos: InstallationPhoto[]
  revision: number
  documentSnapshot?: InstallationDocument
}
export type InstallationMeta = {
  schemaVersion: 1
  rootWorkId: string
  equipmentStatus: Record<string, "pending" | "in_progress" | "blocked" | "done">
  equipment: InstallationEquipment[]
  startedEquipmentIds: string[]
  inheritedStartedEquipmentIds?: string[]
  activeSheetByEquipment: Record<string, string>
  continuationWorkId?: string
  closedReason?: "continuation" | "completed"
  completionDocumentId?: string
}
export const isInstallationV1 = (work: any): boolean => work?.tipLucrare === "Instalare" && work?.installation?.schemaVersion === 1
