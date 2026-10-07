/** Serializable mobile/web contract. Canonical Firestore field names are preserved. */
export class DomainError extends Error {}
export type RecordData = Record<string, any>;
export type Actor = { uid: string; displayName: string; role: string };
export type CommandAction = "verify" | "intervention.save" | "postpone" | "revision.save" | "report.later" | "report.finalize" | "attendance.start" | "attendance.stop" | "request.create" | "notification.read" | "installation";
export type Command = { mutationId: string; action: CommandAction; entityId: string; baseVersion: string | null; occurredAt: string; payload: RecordData; attendanceId?: string; predecessorId?: string };
export type OperationStatus = "pending" | "uploading" | "synced" | "error" | "conflict" | "blocked";
export type LocalFile = { id: string; uri: string; name: string; contentType: string; size?: number; remote?: RecordData };
export type Operation = Command & { status: OperationStatus; attempts: number; error?: string; files: LocalFile[]; result?: RecordData };
export type Work = RecordData & { id: string; statusLucrare: string; tipLucrare: string };
export type RevisionSection = { id: string; title: string; items: { id: string; label: string; state?: "functional" | "nefunctional" | "na"; obs?: string }[] };
export type Bundle = { works: Work[]; clients: RecordData[]; attendance: RecordData[]; requests: RecordData[]; procedures: RecordData[]; settings: RecordData[]; employee: RecordData | null; departments: RecordData[]; revisions: Record<string, RecordData[]>; installations: Record<string, RecordData>; histories: Record<string, RecordData[]>; downloadedAt?: string };
export const emptyBundle = (): Bundle => ({ works: [], clients: [], attendance: [], requests: [], procedures: [], settings: [], employee: null, departments: [], revisions: {}, installations: {}, histories: {} });
export const HR_KINDS = { CO: "Concediu de odihnă", CFP: "Concediu fără plată", CM: "Concediu medical", IN: "Învoire", DEL: "Delegație", CORRECT_HOURS: "Corectare ore", ADD_OVERTIME: "Ore suplimentare" };
export const versionOf = (work: RecordData): string | null => {
  if (typeof work.mobileVersion === "string") return work.mobileVersion;
  const value = work.updatedAt;
  if (typeof value === "string") return value;
  if (typeof value?.seconds === "number") return `ts:${value.seconds}:${value.nanoseconds || 0}`;
  if (value?.toDate) return value.toDate().toISOString();
  return null;
};
export function assigned(work: RecordData, actor: Actor) {
  return Array.isArray(work.technicianIds) && work.technicianIds.includes(actor.uid) || Array.isArray(work.tehnicieni) && !!actor.displayName && work.tehnicieni.includes(actor.displayName);
}
export function visibleWork(work: RecordData, actor: Actor) {
  return assigned(work, actor) && !["Anulată", "Anulat", "Arhivată"].includes(work.statusLucrare) && !(work.preluatDispecer && (work.raportGenerat || work.statusLucrare === "Amânată"));
}
export function revisionEquipmentIds(work: RecordData): string[] {
  return Array.from(new Set((work.equipmentIds || Object.keys(work.revision?.equipmentStatus || {})).map(String)));
}
export function checklistFromSettings(settings: RecordData[], rootId?: string): RevisionSection[] {
  const sort = (nodes: RecordData[]) => [...nodes].sort((a,b) => (a.order || 0) - (b.order || 0));
  const roots = rootId ? settings.filter(s => s.id === rootId) : sort(settings.filter(s => s.assignedTargets?.includes("revisions.checklist.sections")));
  const result: RevisionSection[] = [];
  const visit = (root: RecordData, depth: number) => {
    if (depth > 4) return;
    const children = sort(settings.filter(s => s.parentId === root.id));
    const variables = children.filter(s => s.type === "variable");
    if (variables.length) result.push({ id: root.id, title: root.name || "Puncte de control", items: variables.map(s => ({id: s.id, label: s.name})) });
    children.filter(s => s.type !== "variable").forEach(s => visit(s, depth + 1));
  };
  roots.forEach(s => visit(s, 0));
  return result;
}
export function assertCommand(value: unknown): asserts value is Command {
  const c = value as Command;
  if (!c || !/^[a-zA-Z0-9_-]{8,120}$/.test(c.mutationId) || typeof c.entityId !== "string" || c.entityId.includes("/") || c.entityId.length > 160 || !Number.isFinite(Date.parse(c.occurredAt)) || !c.payload || typeof c.payload !== "object" || Array.isArray(c.payload)) throw new DomainError("Comandă invalidă.");
  if (!["verify","intervention.save","postpone","revision.save","report.later","report.finalize","attendance.start","attendance.stop","request.create","notification.read","installation"].includes(c.action)) throw new DomainError("Acțiune invalidă.");
}
export function interventionPatch(data: RecordData, work: RecordData) {
  const keys = ["constatareLaLocatie","descriereInterventie","statusEchipament","cauzaPrincipalaDefectId","cauzaPrincipalaDefect","necesitaOferta","comentariiOferta","notaInternaTehnician","imaginiDefecte"];
  const patch = Object.fromEntries(keys.filter(k => data[k] !== undefined).map(k => [k, data[k]]));
  for(const k of keys.filter(k=>!["necesitaOferta","imaginiDefecte"].includes(k))) if(patch[k]!==undefined && (typeof patch[k]!=="string" || patch[k].length>12000)) throw new DomainError("Câmp de intervenție invalid.");
  if(patch.necesitaOferta!==undefined && typeof patch.necesitaOferta!=="boolean") throw new DomainError("Necesită ofertă trebuie să fie boolean.");
  if (patch.statusEchipament && !["Funcțional","Parțial funcțional","Nefuncțional"].includes(patch.statusEchipament)) throw new DomainError("Status echipament invalid.");
  if (patch.imaginiDefecte && (!Array.isArray(patch.imaginiDefecte) || patch.imaginiDefecte.length > 4)) throw new DomainError("Maximum 4 fotografii.");
  if (patch.necesitaOferta === false) patch.comentariiOferta = "";
  if (work.tipLucrare === "Intervenție în garanție") {
    if (!["confirma","nu_intra","dupa_atelier"].includes(data.tehnicianGarantieDecizie)) throw new DomainError("Selectează decizia de garanție.");
    if (data.tehnicianGarantieDecizie === "nu_intra" && !String(data.tehnicianGarantieNuIntraMotiv || "").trim()) throw new DomainError("Completează motivul pentru garanție.");
    Object.assign(patch, { tehnicianGarantieDecizie: data.tehnicianGarantieDecizie, tehnicianConfirmaGarantie: data.tehnicianGarantieDecizie === "confirma", tehnicianGarantieNuIntraMotiv: data.tehnicianGarantieDecizie === "nu_intra" ? data.tehnicianGarantieNuIntraMotiv.trim() : "" });
  }
  return patch;
}
export function validateRevision(sections: RevisionSection[], expected: RevisionSection[]) {
  if (!Array.isArray(sections) || !expected.length || sections.length !== expected.length) throw new DomainError("Checklistul reviziei lipsește sau s-a schimbat.");
  return expected.map(section => ({ ...section, items: section.items.map(item => {
    const provided = sections.find(s => s.id === section.id)?.items.find(i => i.id === item.id);
    if (!provided || !["functional","nefunctional","na"].includes(provided.state || "")) throw new DomainError("Completează toate punctele de control.");
    return { ...item, state: provided.state!, obs: String(provided.obs || "") };
  }) }));
}
export function equipmentFor(work: RecordData, location?: RecordData | null): RecordData[] {
 const metadata=Array.isArray(work.revision?.equipment)?work.revision.equipment:[];
 const installation=work.installation?.equipment;
 if(Array.isArray(installation)) return installation.map((e:RecordData)=>({...e,rootId:undefined}));
 const ids=work.tipLucrare==="Revizie"?revisionEquipmentIds(work):[String(work.equipmentId || work.echipamentId || work.echipamentCod || "main")];
 return ids.map(eid=>{const m=metadata.find((e:RecordData)=>String(e.equipmentId)===eid || String(e.equipmentCode)===eid) || {};const e=location?.echipamente?.find((v:RecordData)=>String(v.id)===eid || String(v.cod)===eid) || {};const selected=e.dynamicSettings?.["revision.checklistParentId"],use=e.dynamicSettings?.["revision.useChecklistForSheet"];return {id:eid,code:String(e.cod || m.equipmentCode || work.echipamentCod || ""),name:String(e.denumire || e.nume || e.name || m.equipmentName || work.echipament || eid),rootId:selected && (use===undefined || !!use)?selected:m.revisionChecklistTemplateId};});
}
export function targetVariables(settings:RecordData[],target:string) {const roots=settings.filter(s=>s.assignedTargets?.includes(target));return settings.filter(s=>s.type==="variable" && roots.some(r=>s.parentId===r.id));}
export const FALLBACK_CAUSES=[{id:"uzura",label:"Uzură"},{id:"defect-componenta",label:"Defect componentă"},{id:"reglaj-montaj",label:"Reglaj/Montaj"},{id:"alimentare-electrica",label:"Alimentare electrică"},{id:"utilizare-necorespunzatoare",label:"Utilizare necorespunzătoare"},{id:"conditii-externe",label:"Condiții externe"},{id:"alta-cauza",label:"Altă cauză"}];
export function failureCauses(settings:RecordData[]) {const configured=targetVariables(settings,"works.create.failureCauses").map(s=>({id:s.id,label:String(s.value || s.name)}));return configured.length?configured:FALLBACK_CAUSES;}
