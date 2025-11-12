import type { Timestamp } from "firebase/firestore"

export type SettingType = "category" | "variable"

export type ValueType = "string" | "number" | "boolean" | "json"

export type HistoryAction = "create" | "update" | "delete" | "move" | "duplicate" | "revert"

export interface Setting {
  id: string
  path: string // ex: "tip-contract.abonament.abonament-x"
  name: string
  description?: string
  type: SettingType
  valueType?: ValueType // doar pentru variable
  value?: any // valoarea efectivă (doar pentru variable)
  // Câmpuri suplimentare opționale pentru sub-setări
  numericValue?: number // valoare numerică (ex: preț, cantitate, procent)
  imageUrl?: string // URL imagine încărcată în Firebase Storage
  documentUrl?: string // URL document/fișier încărcat în Firebase Storage
  fileName?: string // Numele original al fișierului/imaginii
  parentId: string | null // null = root
  order: number
  hidden: boolean
  favorite: boolean
  inheritedFrom?: string // ID părinte de la care moștenește valoarea
  assignedTargets?: string[] // target-uri din aplicație la care e legată setarea (doar nivel 1 de obicei)
  createdAt: Timestamp
  createdBy: string
  updatedAt: Timestamp
  updatedBy: string
}

export interface SettingHistory {
  id: string
  settingId: string
  settingPath: string
  action: HistoryAction
  before?: any
  after?: any
  modifiedBy: string
  modifiedByName: string
  timestamp: Timestamp
}

export interface CreateSettingData {
  name: string
  description?: string
  type: SettingType
  valueType?: ValueType
  value?: any
  parentId: string | null
  inheritedFrom?: string
  assignedTargets?: string[]
}

export interface UpdateSettingData {
  name?: string
  description?: string
  valueType?: ValueType
  value?: any
  numericValue?: number
  imageUrl?: string
  documentUrl?: string
  fileName?: string
  hidden?: boolean
  favorite?: boolean
  order?: number
  inheritedFrom?: string
  assignedTargets?: string[]
}

export interface BulkCreateData {
  names: string[]
  type: SettingType
  description?: string
  valueType?: ValueType
  value?: any
  parentId: string | null
}

