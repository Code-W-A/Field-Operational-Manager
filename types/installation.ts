import type { DocumentClientSnapshot } from "@/lib/work-documents/document-client-snapshot";

export type InstallationStatus = "in_progress" | "blocked" | "completed";
export type InstallationEquipment = {
  id: string;
  name: string;
  code: string;
  model: string;
};
export type InstallationParticipant = {
  uid: string;
  name: string;
  role: "principal" | "secondary";
  active: boolean;
  moved?: boolean;
};
export type InstallationFrozenDocument = Omit<
  InstallationDocument,
  keyof InstallationSignatures
>;
export type InstallationPhoto = {
  id: string;
  path: string;
  name: string;
  contentType: string;
};
export type InstallationFields = {
  finding: string;
  operations: string;
  installationStatus: InstallationStatus;
  blockReason: string;
  internalNote: string;
};
export type InstallationSignatures = {
  technicianName: string;
  beneficiaryName: string;
  technicianSignature: string;
  beneficiarySignature: string;
};
export type InstallationDocument = InstallationSignatures & {
  client: DocumentClientSnapshot;
  workNumber: string;
  workDate: string;
  equipment: InstallationEquipment[];
  finding?: string;
  operations?: string;
  installationStatus?: InstallationStatus;
  blockReason?: string;
  observations?: string;
  sheetReferences?: {
    workId: string;
    sheetId: string;
    workDate: string;
    equipmentName: string;
  }[];
  photos: InstallationPhoto[];
  principalName?: string;
  participants?: InstallationParticipant[];
  signedByUid?: string;
};
export type InstallationSheet = InstallationFields & {
  id: string;
  equipmentId: string;
  principalUid: string;
  principalName: string;
  workDate: string;
  state: "draft" | "awaiting_signature" | "closed";
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  photos: InstallationPhoto[];
  revision: number;
  documentSnapshot?: InstallationDocument;
  frozenDocument?: InstallationFrozenDocument;
  participants?: InstallationParticipant[];
  participantUids?: string[];
  allocationWarnings?: string[];
  stoppedAt?: string;
  signedByUid?: string;
  signRequestId?: string;
  canSign?: boolean;
};
export type InstallationMeta = {
  schemaVersion: 1;
  rootWorkId: string;
  equipmentStatus: Record<
    string,
    "pending" | "in_progress" | "blocked" | "done"
  >;
  equipment: InstallationEquipment[];
  startedEquipmentIds: string[];
  inheritedStartedEquipmentIds?: string[];
  activeSheetByEquipment: Record<string, string>;
  awaitingSheetByEquipment?: Record<string, string>;
  continuationWorkId?: string;
  closedReason?: "continuation" | "completed";
  completionDocumentId?: string;
};
export const isInstallationV1 = (work: any): boolean =>
  work?.tipLucrare === "Instalare" && work?.installation?.schemaVersion === 1;

export type InstallationListResponse = {
  work: {
    id: string;
    client: string;
    locatie: string;
    nrLucrare?: string;
    statusLucrare: string;
    tehnicieni: string[];
    dataEmiterii?: string;
    dataInterventie?: string;
    installation: InstallationMeta;
    equipmentIds: string[];
  };
  canStart: boolean;
  currentSession?: {
    workId: string;
    sheetId: string;
    equipmentId: string;
    role: "principal" | "secondary";
  } | null;
  sheets: InstallationSheet[];
  nextCursor: string | null;
  completion: { id: string; documentSnapshot: InstallationDocument } | null;
};
