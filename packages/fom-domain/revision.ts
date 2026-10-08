/** Canonical definitions extracted from Next.js types/revision.ts. */
export type RevisionItemState = "functional" | "nefunctional" | "na";

export interface RevisionChecklistItem {
  id: string;
  label: string;
  name?: string;
  order?: number;
}

export interface RevisionChecklistSection {
  id: string;
  title: string;
  name?: string;
  items: RevisionChecklistItem[];
}

export interface RevisionChecklist {
  version: string;
  sections: RevisionChecklistSection[];
  states: Array<"Functional" | "Nefunctional" | "N/A">;
}

export interface WorkRevisionMeta {
  checklistVersionId: string;
  equipmentStatus: Record<string, "pending" | "in_progress" | "done">;
  equipment?: Array<{
    equipmentId: string;
    equipmentName?: string;
    equipmentCode?: string;
    revisionChecklistTemplateId?: string;
  }>;
  photosCount?: number;
  doneCount?: number;
}

export interface RevisionPhotoMeta {
  path: string;
  url: string;
  createdAt: any;
  uploadedBy?: string;
  fileName?: string;
}

export interface EquipmentRevisionDoc {
  equipmentId: string;
  equipmentName?: string;
  sections: RevisionSection[];
  photos?: RevisionPhotoMeta[];
  internalNote?: string;
  /** Observații generale la finalul fișei (distincte de obs. per punct de control). */
  finalObservations?: string;
  completedAt?: any;
  completedBy?: string;
  overallState?: "functional" | "nefunctional" | "na";
  qrVerified?: boolean;
  qrVerifiedAt?: string;
  qrVerifiedBy?: string;
  createdAt?: any;
  updatedAt?: any;
}

/** Persisted answers extend the same checklist identity; no second mobile checklist model. */
export type RevisionSection = Omit<RevisionChecklistSection, "items"> & {
  items: Array<
    RevisionChecklistItem & { state?: RevisionItemState; obs?: string }
  >;
};
