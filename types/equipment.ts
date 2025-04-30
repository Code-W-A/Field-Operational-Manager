export interface Equipment {
  id: string
  name: string
  code: string // Cod unic de 4 cifre
  qrCode: string // URL către codul QR
  clientId: string
  locationId: string
  model: string
  serialNumber: string
  installationDate: string
  lastMaintenanceDate: string
  status: "active" | "inactive" | "maintenance"
  notes: string
  createdAt: string
  updatedAt: string
}

export interface EquipmentScanResult {
  isValid: boolean
  message: string
  equipment?: Equipment
}
