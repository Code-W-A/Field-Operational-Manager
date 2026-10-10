/** JSON contract; no Firebase SDK or native module dependency. */
import { ApiResponseError } from "./api-response";
import { supportedContract } from "./commands";
export const CRM_CONTRACT_VERSION = 1 as const;
export function assertCrmResponseContract(data: Record<string, any>) {
  if (
    !supportedContract(data.contractVersion) ||
    data.crmContractVersion !== CRM_CONTRACT_VERSION
  )
    throw new ApiResponseError(
      "Versiunea CRM nu este compatibilă cu aplicația.",
      "blocked",
      0,
    );
}
export type CrmRow = {
  id: string;
  allowedActions?: readonly (CrmAction | "download")[];
  [key: string]: any;
};
export type CrmCapabilities = {
  createOpportunity: boolean;
  createClient: boolean;
  updateMetadata: boolean;
  updateContacts: boolean;
  manageOwnTasks: boolean;
  createTask: false;
  writeNotes: false;
  writeFiles: false;
  writeEvents: false;
  writeOffers: false;
  offerEvidence: false;
  sharedInbox: boolean;
};
export const technicianCrmCapabilities: CrmCapabilities = {
  createOpportunity: true,
  createClient: true,
  updateMetadata: true,
  updateContacts: true,
  manageOwnTasks: true,
  createTask: false,
  writeNotes: false,
  writeFiles: false,
  writeEvents: false,
  writeOffers: false,
  offerEvidence: false,
  sharedInbox: true,
};
export const CRM_ACTIONS = [
  "opportunity.create",
  "opportunity.update",
  "opportunity.stage",
  "contact.update",
  "client.create",
  "client.photo",
  "task.update",
  "task.complete",
  "task.delete",
  "thread.create",
  "thread.reply",
  "thread.confirm",
  "internalNote.confirm",
  "inbox.update",
  "inbox.link",
] as const;
export type CrmAction = (typeof CRM_ACTIONS)[number];
export type CrmCommand = {
  id: string;
  action: CrmAction;
  entityId?: string;
  payload: Record<string, any>;
  expectedUpdatedAt?: string | null;
};
export type CrmResult = {
  id: string;
  action: CrmAction;
  entityId: string;
  [key: string]: any;
};
export type CrmOptions = {
  users: CrmRow[];
  clients: CrmRow[];
  clientFields: CrmRow[];
  equipmentFields: CrmRow[];
  documentation: CrmRow[];
  documentationFolders?: CrmRow[];
  documentationSubfolders?: CrmRow[];
  revisionTemplates: CrmRow[];
  capabilities: CrmCapabilities;
};
export type CrmDetail = {
  opportunity: CrmRow;
  client: CrmRow | null;
  contacts: CrmRow[];
  contactIds: string[];
  activity: CrmRow[];
  tasks: CrmRow[];
  notes: CrmRow[];
  files: CrmRow[];
  events: CrmRow[];
  emails: CrmRow[];
  offers: CrmRow[];
  capabilities: CrmCapabilities;
};
export function assertCrmCommand(value: unknown): asserts value is CrmCommand {
  const c = value as CrmCommand;
  if (
    !c ||
    !/^[\w-]{8,100}$/.test(c.id || "") ||
    !CRM_ACTIONS.includes(c.action) ||
    !c.payload ||
    typeof c.payload !== "object" ||
    Array.isArray(c.payload)
  )
    throw new Error("Comandă CRM invalidă.");
  if (c.entityId && !/^[^/]{1,180}$/.test(c.entityId))
    throw new Error("Identificator CRM invalid.");
  if (JSON.stringify(c.payload).length > 500000)
    throw new Error("Datele CRM sunt prea mari.");
}
export function crmSearch(row: CrmRow, term: string) {
  const normalize = (v: unknown) =>
    String(v || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  return normalize(
    [
      row.code,
      row.title,
      row.displayTitle,
      row.clientName,
      row.contactSearch,
      row.searchIndex,
    ].join(" "),
  ).includes(normalize(term.trim()));
}
export function canConfirmCrmMessage(row: CrmRow, uid: string) {
  return (
    row.toUserId === uid &&
    row.fromUserId !== uid &&
    (row.requiresConfirmation === true
      ? row.cycleStatus === "PENDING"
      : row.status === "PENDING")
  );
}
export function crmRecordActions(
  kind:
    | "opportunity"
    | "task"
    | "message"
    | "legacy"
    | "thread"
    | "inbox"
    | "readonly"
    | "file"
    | "offer",
  row: CrmRow,
  uid: string,
): (CrmAction | "download")[] {
  if (kind === "opportunity")
    return ["opportunity.update", "opportunity.stage", "contact.update"];
  if (kind === "task")
    return row.assigneeId === uid
      ? [
          "task.update",
          "task.delete",
          ...(!["CU_SUCCES", "FARA_SUCCES", "DONE", "CANCELED"].includes(
            row.status,
          )
            ? ["task.complete" as const]
            : []),
        ]
      : [];
  if (kind === "message")
    return canConfirmCrmMessage(row, uid) ? ["thread.confirm"] : [];
  if (kind === "legacy")
    return canConfirmCrmMessage(row, uid) ? ["internalNote.confirm"] : [];
  if (kind === "thread") return ["thread.reply"];
  if (kind === "inbox")
    return [
      "inbox.update",
      ...(!row.opportunityId
        ? ["inbox.link" as const, "opportunity.create" as const]
        : []),
    ];
  if (
    kind === "file" ||
    (kind === "offer" && (row.hasPdf || row.responseCertifiedPdf))
  )
    return ["download"];
  return [];
}
export function crmDate(value: unknown) {
  const date = new Date(value as string | number);
  return value && Number.isFinite(date.getTime()) ? date : null;
}
