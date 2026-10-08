import { assertPayload } from "./payload-validation";
/** Serializable mobile/web contract. Canonical Firestore field names are preserved. */
import { DomainError } from "./errors";
import { COMMAND_ACTIONS, supportedContract } from "./commands";
import type { Command } from "./commands";
import {
  INTERVENTION_PHOTO_LIMIT,
  EQUIPMENT_STATES,
  WARRANTY_DECISIONS,
  REVISION_STATES,
} from "./validation";
export * from "./errors";
export * from "./auth";
export * from "./procedures";
export * from "./constants";
export * from "./commands";
export * from "./works";
export * from "./documents";
export * from "./hr";
export * from "./attendance";
export * from "./installation";
export * from "./revision";
export * from "./hr-validation";
export * from "./overtime-duration";
export * from "./validation";
export { requestCreateDraft } from "./payload-validation";
export type RecordData = Record<string, any>;
export type Actor = { uid: string; displayName: string; role: string };
export type OperationStatus =
  "pending" | "uploading" | "synced" | "error" | "conflict" | "blocked";
export type LocalFile = {
  id: string;
  uri: string;
  name: string;
  contentType: string;
  size?: number;
  remote?: RecordData;
};
export type Operation = Command & {
  status: OperationStatus;
  attempts: number;
  error?: string;
  files: LocalFile[];
  result?: RecordData;
};
import type { RevisionSection } from "./revision";
import type { Bundle } from "./wire";
export * from "./wire";
export * from "./settings";
export const emptyBundle = (): Bundle => ({
  works: [],
  clients: [],
  attendance: [],
  requests: [],
  procedures: [],
  settings: [],
  employee: null,
  departments: [],
  revisions: {},
  installations: {},
  histories: {},
});
export const HR_KINDS = {
  CO: "Concediu de odihnă",
  CFP: "Concediu fără plată",
  CM: "Concediu medical",
  IN: "Învoire",
  DEL: "Delegație",
  CORRECT_HOURS: "Corectare ore",
  ADD_OVERTIME: "Ore suplimentare",
};
export const versionOf = (work: RecordData): string | null => {
  if (typeof work.mobileVersion === "string") return work.mobileVersion;
  const value = work.updatedAt;
  if (typeof value === "string") return value;
  if (typeof value?.seconds === "number")
    return `ts:${value.seconds}:${value.nanoseconds || 0}`;
  if (value?.toDate) return value.toDate().toISOString();
  return null;
};
export function assigned(work: RecordData, actor: Actor) {
  return (
    (Array.isArray(work.technicianIds) &&
      work.technicianIds.includes(actor.uid)) ||
    (Array.isArray(work.tehnicieni) &&
      !!actor.displayName &&
      work.tehnicieni.includes(actor.displayName))
  );
}
export function visibleWork(work: RecordData, actor: Actor) {
  return (
    assigned(work, actor) &&
    !["Anulată", "Anulat", "Arhivată"].includes(work.statusLucrare) &&
    !(
      work.preluatDispecer &&
      (work.raportGenerat || work.statusLucrare === "Amânată")
    )
  );
}
export function revisionEquipmentIds(work: RecordData): string[] {
  return Array.from(
    new Set(
      (
        work.equipmentIds || Object.keys(work.revision?.equipmentStatus || {})
      ).map(String),
    ),
  );
}
export function checklistFromSettings(
  settings: RecordData[],
  rootId?: string,
): RevisionSection[] {
  const sort = (nodes: RecordData[]) =>
    [...nodes].sort((a, b) => (a.order || 0) - (b.order || 0));
  const selectedRoot = rootId?.trim();
  const roots = selectedRoot
    ? [settings.find(s => s.id === selectedRoot) || { id: selectedRoot, name: "Puncte de control" }]
    : sort(settings.filter(s => s.assignedTargets?.includes("revisions.checklist.sections")));
  const result: RevisionSection[] = [];
  const childrenOf = (id: string) => sort(settings.filter(s => s.parentId === id));
  const add = (node: RecordData, variables: RecordData[], root = false) => {
    if (variables.length) result.push({
      id: root ? `${node.id}__root` : node.id,
      title: node.name || "Puncte de control",
      items: variables.map(s => ({ id: s.id, label: s.name })),
    });
  };
  for (const root of roots) {
    const children = childrenOf(root.id);
    add(root, children.filter(s => s.type === "variable"), true);
    for (const child of children.filter(s => s.type !== "variable")) {
      const grandchildren = childrenOf(child.id);
      const direct = grandchildren.filter(s => s.type === "variable");
      // Match the existing web sheet: direct points take precedence over subcategories.
      if (direct.length) add(child, direct);
      else for (const sub of grandchildren.filter(s => s.type !== "variable")) {
        add(sub, childrenOf(sub.id).filter(s => s.type === "variable"));
      }
    }
  }
  return result;
}
export function assertCommand(value: unknown): asserts value is Command {
  const c = value as Command;
  if (
    !c ||
    !supportedContract(c.contractVersion) ||
    !/^[a-zA-Z0-9_-]{8,120}$/.test(c.mutationId) ||
    typeof c.entityId !== "string" ||
    !c.entityId ||
    c.entityId.includes("/") ||
    c.entityId.length > 160 ||
    !Number.isFinite(Date.parse(c.occurredAt)) ||
    !c.payload ||
    typeof c.payload !== "object" ||
    Array.isArray(c.payload)
  )
    throw new DomainError("Comandă invalidă.");
  if (!(COMMAND_ACTIONS as readonly string[]).includes(c.action))
    throw new DomainError("Acțiune invalidă.");
  if (c.baseVersion !== null && typeof c.baseVersion !== "string")
    throw new DomainError("Versiune de bază invalidă.");
  for (const value of [c.attendanceId, c.predecessorId])
    if (
      value !== undefined &&
      (typeof value !== "string" || !/^[\w-]{1,160}$/.test(value))
    )
      throw new DomainError("Referință de comandă invalidă.");
  assertPayload(c);
}
export function interventionPatch(data: RecordData, work: RecordData) {
  const keys = [
    "constatareLaLocatie",
    "descriereInterventie",
    "statusEchipament",
    "cauzaPrincipalaDefectId",
    "cauzaPrincipalaDefect",
    "necesitaOferta",
    "comentariiOferta",
    "notaInternaTehnician",
    "imaginiDefecte",
  ];
  const patch = Object.fromEntries(
    keys.filter((k) => data[k] !== undefined).map((k) => [k, data[k]]),
  );
  for (const k of keys.filter(
    (k) => !["necesitaOferta", "imaginiDefecte"].includes(k),
  ))
    if (
      patch[k] !== undefined &&
      (typeof patch[k] !== "string" || patch[k].length > 12000)
    )
      throw new DomainError("Câmp de intervenție invalid.");
  if (
    patch.necesitaOferta !== undefined &&
    typeof patch.necesitaOferta !== "boolean"
  )
    throw new DomainError("Necesită ofertă trebuie să fie boolean.");
  if (
    patch.statusEchipament &&
    !(EQUIPMENT_STATES as readonly string[]).includes(patch.statusEchipament)
  )
    throw new DomainError("Status echipament invalid.");
  if (
    patch.imaginiDefecte &&
    (!Array.isArray(patch.imaginiDefecte) ||
      patch.imaginiDefecte.length > INTERVENTION_PHOTO_LIMIT)
  )
    throw new DomainError("Maximum 4 fotografii.");
  if (patch.necesitaOferta === false) patch.comentariiOferta = "";
  if (work.tipLucrare === "Intervenție în garanție") {
    if (
      !(WARRANTY_DECISIONS as readonly string[]).includes(
        data.tehnicianGarantieDecizie,
      )
    )
      throw new DomainError("Selectează decizia de garanție.");
    if (
      data.tehnicianGarantieDecizie === "nu_intra" &&
      (typeof data.tehnicianGarantieNuIntraMotiv !== "string" ||
        !data.tehnicianGarantieNuIntraMotiv.trim())
    )
      throw new DomainError("Completează motivul pentru garanție.");
    Object.assign(patch, {
      tehnicianGarantieDecizie: data.tehnicianGarantieDecizie,
      tehnicianConfirmaGarantie: data.tehnicianGarantieDecizie === "confirma",
      tehnicianGarantieNuIntraMotiv:
        data.tehnicianGarantieDecizie === "nu_intra"
          ? data.tehnicianGarantieNuIntraMotiv.trim()
          : "",
    });
  }
  return patch;
}
export function validateRevision(
  sections: RevisionSection[],
  expected: RevisionSection[],
  options: { draft?: boolean; customItems?: boolean } = {},
) {
  if (
    !Array.isArray(sections) ||
    !expected.length ||
    sections.length !== expected.length
  )
    throw new DomainError("Checklistul reviziei lipsește sau s-a schimbat.");
  const sectionIds = sections.map((section) => section?.id);
  if (
    new Set(sectionIds).size !== sections.length ||
    !expected.every((section) => sectionIds.includes(section.id))
  )
    throw new DomainError("Structura secțiunilor nu corespunde checklistului.");
  for (const section of expected) {
    const provided = sections.find((value) => value.id === section.id)!;
    if (
      !Array.isArray(provided.items) ||
      (options.customItems ? !section.items.every(item => provided.items.some(value => value.id === item.id)) : provided.items.length !== section.items.length) ||
      new Set(provided.items.map((item) => item?.id)).size !==
        provided.items.length
    )
      throw new DomainError("Structura punctelor nu corespunde checklistului.");
  }
  return expected.map((section) => ({
    ...section,
    items: (options.customItems ? sections.find(s => s.id === section.id)!.items.map(item => section.items.find(base => base.id === item.id) || item) : section.items).map((item) => {
      const provided = sections
        .find((s) => s.id === section.id)
        ?.items.find((i) => i.id === item.id);
      if (
        !provided ||
        (!options.draft || provided.state !== undefined) && !(REVISION_STATES as readonly string[]).includes(provided.state || "")
      )
        throw new DomainError("Completează toate punctele de control.");
      if (!item.label.trim() || item.label.length > 1000 || String(provided.obs || "").length > 12000) throw new DomainError("Punct de control invalid.");
      return {
        ...item,
        ...(provided.state ? { state: provided.state } : {}),
        obs: String(provided.obs || ""),
      };
    }),
  }));
}
export function equipmentFor(
  work: RecordData,
  location?: RecordData | null,
): RecordData[] {
  const metadata = Array.isArray(work.revision?.equipment)
    ? work.revision.equipment
    : [];
  const installation = work.installation?.equipment;
  if (Array.isArray(installation))
    return installation.map((e: RecordData) => ({ ...e, rootId: undefined }));
  const ids =
    work.tipLucrare === "Revizie"
      ? revisionEquipmentIds(work)
      : [
          String(
            work.equipmentId ||
              work.echipamentId ||
              work.echipamentCod ||
              "main",
          ),
        ];
  return ids.map((eid) => {
    const m =
      metadata.find(
        (e: RecordData) =>
          String(e.equipmentId) === eid || String(e.equipmentCode) === eid,
      ) || {};
    const e =
      location?.echipamente?.find(
        (v: RecordData) => String(v.id) === eid || String(v.cod) === eid,
      ) || {};
    const selected = String(e.dynamicSettings?.["revision.checklistParentId"] || "").trim(),
      use = e.dynamicSettings?.["revision.useChecklistForSheet"];
    return {
      id: eid,
      code: String(e.cod || m.equipmentCode || work.echipamentCod || ""),
      name: String(
        e.denumire ||
          e.nume ||
          e.name ||
          m.equipmentName ||
          work.echipament ||
          eid,
      ),
      rootId:
        selected && (use === undefined || !!use)
          ? String(selected).trim()
          : typeof m.revisionChecklistTemplateId === "string" ? m.revisionChecklistTemplateId.trim() : undefined,
    };
  });
}
export function targetVariables(settings: RecordData[], target: string) {
  const roots = settings.filter((s) => s.assignedTargets?.includes(target));
  return settings.filter(
    (s) => s.type === "variable" && roots.some((r) => s.parentId === r.id),
  );
}
export { FALLBACK_FAILURE_CAUSES as FALLBACK_CAUSES } from "./failure-causes";
import { failureCauseOptionsFromSettings } from "./failure-causes";

export function failureCauses(settings: RecordData[]) {
  const roots = settings.filter(s => s.assignedTargets?.includes("works.create.failureCauses"));
  const children = settings.filter(s => roots.some(root => root.id === s.parentId));
  children.sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name || "").localeCompare(String(b.name || "")));
  return failureCauseOptionsFromSettings(children);
}
