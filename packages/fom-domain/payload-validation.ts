import { DomainError } from "./errors";
import type { Command, RequestCreateInput } from "./commands";
import {
  HR_REQUEST_KINDS,
  postponeReason,
  validateProducts,
  validateReportSignatures,
} from "./validation";
import { validateHrRequestPayload } from "./hr-validation";
import type { HrRequestKind, HrRequestPayload } from "./hr";
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown) =>
  typeof value === "string" && /^[\w-]{1,160}$/.test(value);
function check(value: unknown, message: string): asserts value {
  if (!value) throw new DomainError(message);
}
export function assertPayload(command: Command): void {
  const p = command.payload;
  switch (command.action) {
    case "verify":
      check(
        typeof p.code === "string" && p.code.length > 0 && p.code.length < 4096,
        "Cod QR invalid.",
      );
      check(
        p.equipmentId === undefined || id(p.equipmentId),
        "Echipament invalid.",
      );
      check(
        p.qrRaw === undefined ||
          (typeof p.qrRaw === "string" && p.qrRaw.length < 4096),
        "QR invalid.",
      );
      break;
    case "postpone":
      postponeReason(p.motivAmanare);
      break;
    case "revision.save":
      check(p.draft === undefined || typeof p.draft === "boolean", "Ciornă invalidă.");
      check(
        id(p.equipmentId) && Array.isArray(p.sections) && p.sections.length > 0,
        "Fișă de revizie invalidă.",
      );
      check(
        p.sections.every(
          (s: any) =>
            object(s) &&
            typeof s.id === "string" && s.id.length > 0 && s.id.length <= 160 &&
            typeof s.title === "string" &&
            Array.isArray(s.items) &&
            s.items.every(
              (i: any) => object(i) && typeof i.id === "string" && i.id.length > 0 && i.id.length <= 160 && typeof i.label === "string",
            ),
        ),
        "Structură de checklist invalidă.",
      );
      check(
        p.photos === undefined || Array.isArray(p.photos),
        "Fotografii invalide.",
      );
      check(
        p.finalObservations === undefined ||
          typeof p.finalObservations === "string",
        "Observații invalide.",
      );
      break;
    case "intervention.save":
    case "report.later":
    case "report.finalize":
      for (const key of [
        "constatareLaLocatie",
        "descriereInterventie",
        "statusEchipament",
        "cauzaPrincipalaDefectId",
        "cauzaPrincipalaDefect",
        "comentariiOferta",
        "notaInternaTehnician",
        "tehnicianGarantieNuIntraMotiv",
      ])
        check(
          p[key] === undefined ||
            (typeof p[key] === "string" && p[key].length <= 12000),
          "Câmp de intervenție invalid.",
        );
      check(
        p.necesitaOferta === undefined || typeof p.necesitaOferta === "boolean",
        "Necesită ofertă trebuie să fie boolean.",
      );
      if (command.action.startsWith("report.")) {
        if (p.products !== undefined) validateProducts(p.products);
        validateReportSignatures(p);
        check(
          p.numeBeneficiar === undefined ||
            typeof p.numeBeneficiar === "string",
          "Nume beneficiar invalid.",
        );
      }
      break;
    case "attendance.start":
    case "attendance.stop":
      check(p.mode === undefined || ["office", "field"].includes(p.mode), "Mod de pontaj invalid.");
      check(p.specialDayConfirmed === undefined || typeof p.specialDayConfirmed === "boolean", "Confirmare de pontaj invalidă.");
      if (p.location !== undefined) check(object(p.location) && Number.isFinite(p.location.lat) && Number.isFinite(p.location.lng) && Math.abs(p.location.lat) <= 90 && Math.abs(p.location.lng) <= 180, "Locație invalidă.");
      if (p.deviceInfo !== undefined) check(object(p.deviceInfo) && typeof p.deviceInfo.type === "string" && typeof p.deviceInfo.userAgent === "string", "Dispozitiv invalid.");
      for (const flag of ["checkInAuto", "checkOutAuto", "autoStopped", "skipMinimumDurationCheck"]) check(p[flag] === undefined || typeof p[flag] === "boolean", "Opțiune de pontaj invalidă.");
      for (const key of ["faceRecognitionId", "checkInSelfieUrl", "checkInSelfiePath", "checkOutSelfieUrl", "checkOutSelfiePath", "checkInAutoReason", "checkOutAutoReason"]) check(p[key] === undefined || typeof p[key] === "string", "Metadate pontaj invalide.");
      for (const key of ["checkInSelfieStatus", "checkOutSelfieStatus"]) check(p[key] === undefined || ["ok", "missing", "error"].includes(p[key]), "Stare selfie invalidă.");
      break;
    case "attendance.extra":
      check(["start", "end"].includes(p.operation) && ["to_client", "to_home"].includes(p.type), "Traseu invalid.");
      break;
    case "notification.read":
      check(Object.keys(p).length === 0, "Operația nu acceptă câmpuri suplimentare.");
      break;
    case "request.create": {
      check(
        (HR_REQUEST_KINDS as readonly string[]).includes(p.kind) &&
          id(p.sectorId) &&
          object(p.payload) &&
          p.payload.kind === p.kind,
        "Tip de cerere sau departament invalid.",
      );
      const error = validateHrRequestPayload(
        p.kind as HrRequestKind,
        p.payload as HrRequestPayload,
      );
      check(!error, error || "Cerere invalidă.");
      break;
    }
    case "installation":
      check(
        [
          "start",
          "save",
          "close",
          "stop",
          "sign",
          "complete",
          "removePhoto",
          "continue",
        ].includes(p.action),
        "Acțiune de instalare invalidă.",
      );
      if (p.action === "start")
        check(
          id(p.equipmentId) && typeof p.qrRaw === "string",
          "Pornire de instalare invalidă.",
        );
      if (["save", "close", "stop", "sign", "removePhoto"].includes(p.action))
        check(id(p.sheetId), "Fișă de instalare invalidă.");
      if (["save", "close", "stop"].includes(p.action))
        check(
          Number.isInteger(p.revision) && p.revision >= 0,
          "Versiune de instalare invalidă.",
        );
      if (p.action === "removePhoto")
        check(id(p.photoId), "Fotografie invalidă.");
      break;
  }
}

/** Offline medical drafts have a local file; its authorized URL is resolved before sending. */
export function requestCreateDraft(
  value: unknown,
  hasMedicalFile = false,
): RequestCreateInput {
  check(
    object(value) &&
      (HR_REQUEST_KINDS as readonly string[]).includes(value.kind) &&
      id(value.sectorId) &&
      object(value.payload) &&
      value.payload.kind === value.kind,
    "Cerere invalidă.",
  );
  const forValidation =
    value.kind === "CM" && hasMedicalFile
      ? { ...value.payload, medicalDocumentUrl: "pending-upload" }
      : value.payload;
  const error = validateHrRequestPayload(
    value.kind,
    forValidation as HrRequestPayload,
  );
  check(!error, error || "Cerere invalidă.");
  return value as RequestCreateInput;
}
