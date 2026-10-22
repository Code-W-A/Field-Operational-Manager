/** Canonical definitions extracted from Next.js types/installation.ts. */
import type { DocumentClientSnapshot } from "./documents";

export type InstallationStatus = "in_progress" | "blocked" | "completed";
export type InstallationEquipment = {
  id: string;
  name: string;
  code: string;
  model: string;
  producator?: string;
};
export type InstallationTimeInterval = {
  uid: string;
  startedAt: string;
  endedAt?: string;
};
export type InstallationTiming = { timeIntervals?: InstallationTimeInterval[] };

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
export type InstallationDocument = InstallationSignatures &
  InstallationTiming & {
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
export type InstallationSheet = InstallationFields &
  InstallationTiming & {
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
  /** Changes on team reassignment and pickup; absent on older tickets means zero. */
  assignmentVersion?: number;
  lastPickupVersion?: number;
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
    anulat?: boolean;
    motivAnulare?: string;
    anulatDe?: string;
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
  completion: {
    id: string;
    documentSnapshot: InstallationDocument;
    delivery?: import("./wire").DeliveryResult;
  } | null;
};

export function installationDeliveryMessage(
  delivery?: import("./wire").DeliveryResult,
) {
  if (!delivery) return ""; // Historical documents were not automatically emailed.
  if (delivery.status === "sent") return "Proces-verbal finalizat și trimis.";
  if (delivery.status === "simulated")
    return "Proces-verbal finalizat; trimiterea emailului a fost simulată în mediul de test.";
  if (delivery.status === "pending" || delivery.status === "processing")
    return "Proces-verbal finalizat; trimiterea emailului este în curs.";
  return `Proces-verbal finalizat; emailul nu a fost confirmat.${delivery.error ? ` ${delivery.error}` : ""}`;
}

/** Undefined means a historical sheet, never backfilled from document dates. */
export function startInstallationTime(
  intervals: InstallationTimeInterval[] | undefined,
  uids: string[],
  at: string,
) {
  if (!intervals) return undefined;
  return [
    ...intervals,
    ...[...new Set(uids)]
      .filter((uid) => !intervals.some((i) => i.uid === uid && !i.endedAt))
      .map((uid) => ({ uid, startedAt: at })),
  ];
}
export function stopInstallationTime(
  intervals: InstallationTimeInterval[] | undefined,
  at: string,
  uid?: string,
) {
  return intervals?.map((i) =>
    !i.endedAt && (!uid || i.uid === uid) ? { ...i, endedAt: at } : i,
  );
}
export function installationSeconds(
  intervals: InstallationTimeInterval[],
  now: number,
) {
  return intervals.reduce((sum, i) => {
    const milliseconds =
      Date.parse(i.endedAt || new Date(now).toISOString()) -
      Date.parse(i.startedAt);
    return (
      sum +
      (Number.isFinite(milliseconds) ? Math.max(0, milliseconds) / 1000 : 0)
    );
  }, 0);
}
export function installationDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
export function installationTimeLines(
  sheet: InstallationTiming & { participants?: InstallationParticipant[] },
  now = Date.now(),
): string[] {
  if (!sheet.timeIntervals) return ["Timp neînregistrat"];
  const date = (value: string) =>
    new Date(value).toLocaleString("ro-RO", {
      timeZone: "Europe/Bucharest",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const lines = [...new Set(sheet.timeIntervals.map((i) => i.uid))].map(
    (uid) => {
      const intervals = sheet.timeIntervals!.filter((i) => i.uid === uid);
      const name =
        sheet.participants?.find((p) => p.uid === uid)?.name || "Tehnician";
      return `${name} · ${intervals.map((i) => `${date(i.startedAt)} – ${i.endedAt ? date(i.endedAt) : "în lucru"}`).join("; ")} · ${installationDuration(installationSeconds(intervals, now))}`;
    },
  );
  return [
    ...lines,
    `Total echipă — ore-om: ${installationDuration(installationSeconds(sheet.timeIntervals, now))}`,
  ];
}
