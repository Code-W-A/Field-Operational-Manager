export type RevisionItemState = "functional" | "nefunctional" | "na"

export interface RevisionChecklistItem {
  id: string
  label: string
}

export interface RevisionChecklistSection {
  id: string
  title: string
  items: RevisionChecklistItem[]
}

export interface RevisionChecklist {
  version: string
  sections: RevisionChecklistSection[]
  states: Array<"Functional" | "Nefunctional" | "N/A">
}

export interface WorkRevisionMeta {
  checklistVersionId: string
  equipmentStatus: Record<string, "pending" | "in_progress" | "done">
  photosCount?: number
  doneCount?: number
}


