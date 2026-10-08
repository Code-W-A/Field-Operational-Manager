import type { CheckInRequest, CheckOutRequest, ExtraTimeType } from "./attendance";
import type { HrRequestKind, HrRequestPayload } from "./hr";
import type {
  InstallationFields,
  InstallationSignatures,
} from "./installation";
import type { RevisionSection } from "./revision";
import type { ReportProduct } from "./validation";
import type { Lucrare } from "./works";
/** Optional on old queued commands. Incompatible versions are rejected before any write. */
export const FOM_CONTRACT_VERSION = 1 as const;
export type InterventionInput = Partial<
  Pick<
    Lucrare,
    | "constatareLaLocatie"
    | "descriereInterventie"
    | "statusEchipament"
    | "cauzaPrincipalaDefectId"
    | "cauzaPrincipalaDefect"
    | "necesitaOferta"
    | "comentariiOferta"
    | "notaInternaTehnician"
    | "imaginiDefecte"
    | "tehnicianGarantieDecizie"
    | "tehnicianGarantieNuIntraMotiv"
  >
>;
export type ReportInput = InterventionInput & {
  products?: Array<
    Partial<ReportProduct> & Pick<ReportProduct, "name" | "quantity" | "price">
  >;
  semnaturaTehnician?: string;
  semnaturaBeneficiar?: string;
  numeBeneficiar?: string;
  clientRating?: number;
  clientReview?: string;
  reportManualRecipients?: string[];
};
export type InstallationSignatureInput = Omit<
  InstallationSignatures,
  "technicianName"
> & { technicianName?: string };
export type InstallationCommandInput =
  | { action: "start"; equipmentId: string; qrRaw: string }
  | {
      action: "save" | "stop" | "close";
      sheetId: string;
      revision: number;
      fields: InstallationFields;
      signatures?: InstallationSignatureInput;
    }
  | {
      action: "sign";
      sheetId: string;
      revision: number;
      signatures: InstallationSignatureInput;
    }
  | {
      action: "complete";
      observations?: string;
      signatures: InstallationSignatureInput;
    }
  | { action: "removePhoto"; sheetId: string; photoId: string }
  | { action: "continue" };
export type RequestCreateInput = {
  [K in HrRequestKind]: {
    kind: K;
    sectorId: string;
    payload: Extract<HrRequestPayload, { kind: K }> extends never
      ? HrRequestPayload & { kind: K }
      : Extract<HrRequestPayload, { kind: K }>;
  };
}[HrRequestKind];
export type CommandPayloadMap = {
  verify: { code: string; equipmentId?: string; qrRaw?: string };
  "intervention.save": InterventionInput;
  postpone: { motivAmanare: string };
  "revision.save": {
    equipmentId: string;
    draft?: boolean;
    sections: RevisionSection[];
    finalObservations?: string;
    photos?: Array<{
      path: string;
      url: string;
      id?: string;
      fileName?: string;
      createdAt?: unknown;
    }>;
  };
  "report.later": ReportInput;
  "report.finalize": ReportInput;
  "attendance.start": Partial<Omit<CheckInRequest, "userId" | "userName" | "sessionStartMs" | "specialDayConfirmation">> & { specialDayConfirmed?: boolean };
  "attendance.stop": Partial<Omit<CheckOutRequest, "sessionId" | "sessionEndMs" | "debugSimulatedDurationMinutes">>;
  "attendance.extra": { operation: "start" | "end"; type: ExtraTimeType };
  "request.create": RequestCreateInput;
  "notification.read": Record<string, never>;
  installation: InstallationCommandInput;
};
export type CommandAction = keyof CommandPayloadMap;
export type CommandEnvelope = {
  mutationId: string;
  entityId: string;
  baseVersion: string | null;
  occurredAt: string;
  attendanceId?: string;
  predecessorId?: string;
  contractVersion?: typeof FOM_CONTRACT_VERSION;
};
/** Discriminated contract for new clients; raw JSON is validated by assertCommand. */
export type CanonicalCommand<A extends CommandAction = CommandAction> = {
  [K in A]: CommandEnvelope & { action: K; payload: CommandPayloadMap[K] };
}[A];
/** Compatibility input for existing offline queues and dynamic forms. */
export type Command = CommandEnvelope & {
  action: CommandAction;
  payload: Record<string, any>;
};
export const COMMAND_ACTIONS = [
  "verify",
  "intervention.save",
  "postpone",
  "revision.save",
  "report.later",
  "report.finalize",
  "attendance.start",
  "attendance.stop",
  "attendance.extra",
  "request.create",
  "notification.read",
  "installation",
] as const satisfies readonly CommandAction[];
export function supportedContract(version: unknown): boolean {
  return version === undefined || version === FOM_CONTRACT_VERSION;
}
