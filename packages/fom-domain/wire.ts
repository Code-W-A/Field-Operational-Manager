import { DomainError } from "./errors";
import { supportedContract, type FOM_CONTRACT_VERSION } from "./commands";
import type { Lucrare, Client } from "./works";
import type { AttendanceSession } from "./attendance";
import type {
  HrRequest,
  Employee,
  Department,
  HrDefaults,
  HrHoliday,
} from "./hr";
import type { InstallationListResponse } from "./installation";
import type { EquipmentRevisionDoc } from "./revision";
/** JSON timestamps are a transport representation, not a new Firestore schema. */
export type JsonTimestamp =
  string | number | { seconds: number; nanoseconds: number };
export type ReadDocument<T> = Partial<T> & { id: string } & Record<string, any>;
export type MobileEquipment = {
  id: string;
  code: string;
  name: string;
  rootId?: string;
};
export type Work = ReadDocument<Lucrare<JsonTimestamp>> & {
  statusLucrare: string;
  tipLucrare: string;
  mobileVersion?: string;
  mobileEquipment?: MobileEquipment[];
  mobileContact?: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    lat?: number;
    lng?: number;
  };
};
export type AttendanceRead = ReadDocument<AttendanceSession<JsonTimestamp>>;
export type RequestRead = ReadDocument<HrRequest<JsonTimestamp>>;
export type ProcedureRead = ReadDocument<
  import("./procedures").ProcedureNote<JsonTimestamp>
>;
export type RevisionRead = ReadDocument<EquipmentRevisionDoc>;
export type Bundle = {
  works: Work[];
  clients: ReadDocument<Client<JsonTimestamp>>[];
  attendance: AttendanceRead[];
  requests: RequestRead[];
  procedures: ProcedureRead[];
  settings: ReadDocument<import("./settings").Setting<JsonTimestamp>>[];
  employee: ReadDocument<Employee> | null;
  departments: ReadDocument<Department<JsonTimestamp>>[];
  revisions: Record<string, RevisionRead[]>;
  installations: Record<
    string,
    Omit<InstallationListResponse, "sheets"> & {
      sheets: Array<
        InstallationListResponse["sheets"][number] & { local?: boolean }
      >;
    } & Record<string, any>
  >;
  histories: Record<string, Work[]>;
  attendanceSettings?: { defaults?: HrDefaults; holidays?: HrHoliday[] };
  downloadedAt?: string;
};
export type BootstrapResponse = {
  projectId: string;
  contractVersion?: typeof FOM_CONTRACT_VERSION;
  bundle: Bundle;
};
export type ApiErrorKind = "retryable" | "blocked" | "conflict" | "validation";
export type ApiErrorResponse = { error: string; kind: ApiErrorKind };
export type DeliveryResult = {
  status:
    "pending" | "processing" | "sent" | "simulated" | "failed" | "uncertain";
  error?: string;
};
export type CommandResult = {
  contractVersion?: typeof FOM_CONTRACT_VERSION;
  id?: string;
  version?: string | null;
  work?: Work;
  session?: AttendanceRead;
  request?: RequestRead;
  delivery?: DeliveryResult;
  [key: string]: any;
};
export type ReportSnapshot = NonNullable<Lucrare["raportSnapshot"]>;
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function assertBundle(value: unknown): asserts value is Bundle {
  if (!object(value)) throw new DomainError("Date FOM invalide.");
  for (const key of [
    "works",
    "clients",
    "attendance",
    "requests",
    "procedures",
    "settings",
    "departments",
  ]) {
    if (
      !Array.isArray(value[key]) ||
      !value[key].every(
        (item: unknown) =>
          object(item) && typeof item.id === "string" && !!item.id,
      )
    )
      throw new DomainError(`Listă FOM invalidă: ${key}.`);
  }
  for (const key of ["revisions", "installations", "histories"])
    if (!object(value[key]))
      throw new DomainError(`Colecție FOM invalidă: ${key}.`);
  if (
    value.employee !== null &&
    (!object(value.employee) || typeof value.employee.id !== "string")
  )
    throw new DomainError("Profil HR invalid.");
  // Missing/new legacy fields are preserved. Write validators are never applied to reads.
}
export function readBootstrap(value: unknown, projectId: string): Bundle {
  if (!object(value) || value.projectId !== projectId)
    throw new DomainError(
      "Backendul și aplicația folosesc proiecte Firebase diferite.",
    );
  if (!supportedContract(value.contractVersion))
    throw new DomainError(
      "Versiunea contractului FOM nu este compatibilă cu aplicația.",
    );
  assertBundle(value.bundle);
  return value.bundle;
}
export function timestampMillis(value: unknown): number | undefined {
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : undefined;
  }
  if (object(value)) {
    if (typeof value.toMillis === "function")
      return timestampMillis(value.toMillis());
    if (typeof value.seconds === "number")
      return (
        value.seconds * 1000 +
        Math.floor((Number(value.nanoseconds) || 0) / 1000000)
      );
  }
  return undefined;
}
export function requestPeriod(request: Partial<Pick<HrRequest, "payload">>) {
  const payload = request.payload;
  if (!payload) return { start: "", end: "" };
  return {
    start: "startDate" in payload ? payload.startDate : payload.date,
    end: "endDate" in payload ? payload.endDate : "",
  };
}
export function readHistory(value: unknown): Work[] {
  if (
    !Array.isArray(value) ||
    !value.every((work: unknown) => object(work) && typeof work.id === "string")
  )
    throw new DomainError("Istoric FOM invalid.");
  return value as Work[];
}
export function readInstallation(value: unknown): InstallationListResponse {
  if (
    !object(value) ||
    !object(value.work) ||
    typeof value.work.id !== "string" ||
    value.work.installation?.schemaVersion !== 1 ||
    !Array.isArray(value.sheets) ||
    typeof value.canStart !== "boolean"
  )
    throw new DomainError("Date de instalare incompatibile.");
  if (
    !value.sheets.every(
      (sheet: unknown) =>
        object(sheet) &&
        typeof sheet.id === "string" &&
        typeof sheet.equipmentId === "string" &&
        typeof sheet.revision === "number" &&
        ["draft", "awaiting_signature", "closed"].includes(sheet.state),
    )
  )
    throw new DomainError("Fișe de instalare invalide.");
  if (
    value.currentSession &&
    (!object(value.currentSession) ||
      !["workId", "sheetId", "equipmentId"].every(
        (key) => typeof value.currentSession[key] === "string",
      ))
  )
    throw new DomainError("Sesiune de instalare invalidă.");
  return value as InstallationListResponse;
}
