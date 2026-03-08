export const CRM_COLLECTIONS = {
  clients: "crm_clients",
  clientContacts: "crm_client_contacts",
  opportunities: "crm_opportunities",
  opportunityContacts: "crm_opportunity_contacts",
  opportunityAccess: "crm_opportunity_access",
  tasks: "crm_tasks",
  notes: "crm_notes",
  internalNotes: "crm_internal_notes",
  files: "crm_files",
  emails: "crm_emails",
  calendarEvents: "crm_calendar_events",
  internalHandoffs: "crm_internal_handoffs",
  activityLogs: "crm_activity_logs",
  visibleTo: "crm_visible_to",
  counters: "crm_counters",
} as const

export const CRM_COUNTER_DOCS = {
  opportunity: "opportunity",
} as const

export const CRM_OPPORTUNITY_TYPES = [
  "ACASA",
  "VANZARI",
  "LIVRARI",
  "INTERNE",
  "PROIECTE",
  "FACTURARE",
  "INSTALARI",
  "CONTRACTARE",
  "EVENIMENTE",
  "ACHIZITII",
  "OFERTE",
] as const

export const CRM_OPPORTUNITY_SELECTABLE_TYPES = [
  "VANZARI",
  "LIVRARI",
  "PROIECTE",
  "FACTURARE",
  "INSTALARI",
  "CONTRACTARE",
  "EVENIMENTE",
  "ACHIZITII",
  "OFERTE",
] as const

export const CRM_OPPORTUNITY_TYPE_LABELS: Record<(typeof CRM_OPPORTUNITY_TYPES)[number], string> = {
  ACASA: "Acasă",
  VANZARI: "Vânzări",
  LIVRARI: "Livrări",
  INTERNE: "Interne",
  PROIECTE: "Proiecte",
  FACTURARE: "Facturare",
  INSTALARI: "Instalari",
  CONTRACTARE: "Contracte",
  EVENIMENTE: "Evenimente",
  ACHIZITII: "Achiziții",
  OFERTE: "Oferte",
}

export const CRM_INTERNAL_HANDOFF_STATUSES = ["IN_ASTEPTARE", "CONFIRMAT"] as const

export const CRM_INTERNAL_HANDOFF_STATUS_LABELS: Record<(typeof CRM_INTERNAL_HANDOFF_STATUSES)[number], string> = {
  IN_ASTEPTARE: "În așteptare",
  CONFIRMAT: "Confirmat",
}

export const CRM_INTERNAL_NOTE_STATUSES = ["PENDING", "CONFIRMED"] as const

export const CRM_INTERNAL_NOTE_STATUS_LABELS: Record<(typeof CRM_INTERNAL_NOTE_STATUSES)[number], string> = {
  PENDING: "În așteptare",
  CONFIRMED: "Confirmat",
}

export const CRM_PIPELINE_BY_TYPE: Record<(typeof CRM_OPPORTUNITY_TYPES)[number], string[]> = {
  ACASA: ["PROSPECTARE", "EVALUARE_NEVOI", "OFERTA_TRANSMISA", "NEGOCIERE_OFERTA", "OFERTA_ACCEPTATA"],
  ACHIZITII: [
    "CERERE_DE_OFERTA",
    "OFERTA_ACCEPTATA",
    "AVANS_PLATIT",
    "NEGOCIERE_DESENE",
    "DESENE_SEMNATE",
    "ECHIPAMENTE_COMANDATE",
    "ECHIPAMENTE_IN_PRODUCTIE",
    "ECHIPAMENTE_IN_TRANSPORT",
    "ECHIPAMENTE_LIVRATE",
  ],
  VANZARI: [
    "OFERTA_TRANSMISA",
    "NEGOCIERE_OFERTA",
    "OFERTA_REFUZATA",
    "OFERTA_ACCEPTATA",
    "FACTURA_DE_AVANS",
    "AVANS_INCASAT",
    "FACTURA_FINALA",
    "INCASAT",
  ],
  LIVRARI: [
    "CERERE_DE_OFERTA",
    "OFERTA_ACCEPTATA",
    "OFERTA_REFUZATA",
    "NEGOCIERE_OFERTA",
    "TRANSPORT_INCARCAT",
    "TRANSPORT_IN_DERULARE",
    "LIVRAT",
  ],
  INSTALARI: ["PREGATIREA_INSTALARII", "INSTALARE_IN_CURS", "ECHIPAMENTE_INSTALATE", "ECHIPAMENTE_PREDATE"],
  FACTURARE: ["FACTURA_DE_AVANS", "AVANS_INCASAT", "FACTURA_FINALA", "STORNO"],
  EVENIMENTE: ["INTALNIRE", "ONLINE_MEETING", "SARCINA"],
  INTERNE: ["INFORMARE_CU_CONFIRMARE", "INTREBARE_CU_RASPUNS"],
  PROIECTE: [
    "PROSPECTARE",
    "EVALUARE_NEVOI",
    "OFERTA_TRANSMISA",
    "NEGOCIERE_OFERTA",
    "OFERTA_REFUZATA",
    "OFERTA_ACCEPTATA",
    "FOLLOW_UP_OFERTA",
    "CONTRACT_TRANSMIS",
    "CONTRACT_SEMNAT",
    "NEGOCIERE_TERMENI",
    "FACTURA_DE_AVANS",
    "AVANS_INCASAT",
    "ECHIPAMENTE_COMANDATE",
    "ECHIPAMENTE_IN_PRODUCTIE",
    "ECHIPAMENTE_IN_TRANSPORT",
    "ECHIPAMENTE_LIVRATE",
    "PREGATIREA_INSTALARII",
    "INSTALARE_IN_CURS",
    "ECHIPAMENTE_INSTALATE",
    "ECHIPAMENTE_PREDATE",
    "FACTURA_FINALA",
    "INCASAT",
  ],
  OFERTE: ["OFERTA_TRANSMISA", "NEGOCIERE_OFERTA", "OFERTA_REFUZATA", "FOLLOW_UP_OFERTA", "OFERTA_ACCEPTATA"],
  CONTRACTARE: ["CONTRACT_TRANSMIS", "NEGOCIERE_TERMENI", "FOLLOW_UP_CONTRACT", "CONTRACT_SEMNAT", "FACTURA_DE_AVANS", "AVANS_INCASAT", "FACTURA_FINALA", "INCASAT"],
}

export const CRM_PIPELINE_STAGES = Array.from(
  new Set(CRM_OPPORTUNITY_TYPES.flatMap((type) => CRM_PIPELINE_BY_TYPE[type] || []))
)

export const CRM_PIPELINE_STAGE_LABELS: Record<string, string> = {
  CERERE_DE_OFERTA: "Cerere de oferta",
  OFERTA_ACCEPTATA: "Oferta acceptata",
  AVANS_PLATIT: "Avans platit",
  NEGOCIERE_DESENE: "Negociere desene",
  DESENE_SEMNATE: "Desene semnate",
  ECHIPAMENTE_COMANDATE: "Echipamente comandate",
  ECHIPAMENTE_IN_PRODUCTIE: "Echipamente in productie",
  ECHIPAMENTE_IN_TRANSPORT: "Echipamente in transport",
  ECHIPAMENTE_LIVRATE: "Echipamente livrate",
  OFERTA_TRANSMISA: "Oferta transmisa",
  NEGOCIERE_OFERTA: "Negociere oferta",
  OFERTA_REFUZATA: "Oferta refuzata",
  FACTURA_DE_AVANS: "Factura de avans",
  AVANS_INCASAT: "Avans incasat",
  FACTURA_FINALA: "Factura finala",
  INCASAT: "Incasat",
  TRANSPORT_INCARCAT: "Transport incarcat",
  TRANSPORT_IN_DERULARE: "Transport in derulare",
  LIVRAT: "Livrat",
  PREGATIREA_INSTALARII: "Pregatirea instalarii",
  INSTALARE_IN_CURS: "Instalare in curs",
  ECHIPAMENTE_INSTALATE: "Echipamente instalate",
  ECHIPAMENTE_PREDATE: "Echipamente predate",
  STORNO: "Storno",
  INTALNIRE: "Intalnire",
  ONLINE_MEETING: "Online meeting",
  SARCINA: "Sarcina",
  INFORMARE_CU_CONFIRMARE: "Informare cu confirmare",
  INTREBARE_CU_RASPUNS: "Intrebare cu raspuns",
  PROSPECTARE: "Prospectare",
  EVALUARE_NEVOI: "Evaluare nevoi",
  FOLLOW_UP_OFERTA: "Follow-up oferta",
  CONTRACT_TRANSMIS: "Contract transmis",
  CONTRACT_SEMNAT: "Contract semnat",
  NEGOCIERE_TERMENI: "Negociere termeni",
  FOLLOW_UP_CONTRACT: "Follow-up contract",
}

export const CRM_LOST_PIPELINE_STAGES = ["OFERTA_REFUZATA", "STORNO"] as const

export function getPipelineStagesForOpportunityType(type?: string) {
  const normalizedType =
    typeof type === "string" && CRM_OPPORTUNITY_TYPES.includes(type as (typeof CRM_OPPORTUNITY_TYPES)[number])
      ? (type as (typeof CRM_OPPORTUNITY_TYPES)[number])
      : "VANZARI"
  return CRM_PIPELINE_BY_TYPE[normalizedType] || CRM_PIPELINE_BY_TYPE.VANZARI
}

export function getDefaultPipelineStageForOpportunityType(type?: string) {
  return getPipelineStagesForOpportunityType(type)[0] || "OFERTA_TRANSMISA"
}

export function normalizePipelineStageForOpportunityType(type: string | undefined, stage: string | undefined) {
  const allowed = getPipelineStagesForOpportunityType(type)
  if (stage && allowed.includes(stage)) return stage
  return getDefaultPipelineStageForOpportunityType(type)
}

export function isPipelineStageAllowedForOpportunityType(type: string | undefined, stage: string | undefined) {
  if (!stage) return false
  return getPipelineStagesForOpportunityType(type).includes(stage)
}

export function isTerminalPipelineStageForOpportunityType(type: string | undefined, stage: string | undefined) {
  if (!stage) return false
  const allowed = getPipelineStagesForOpportunityType(type)
  if (!allowed.length) return false
  return allowed[allowed.length - 1] === stage
}

export function isLostPipelineStage(stage: string | undefined) {
  if (!stage) return false
  return (CRM_LOST_PIPELINE_STAGES as readonly string[]).includes(stage)
}

export function isWonPipelineStageForOpportunityType(type: string | undefined, stage: string | undefined) {
  if (!stage) return false
  return isTerminalPipelineStageForOpportunityType(type, stage) && !isLostPipelineStage(stage)
}

export const CRM_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const

export const CRM_PRIORITY_LABELS: Record<(typeof CRM_PRIORITIES)[number], string> = {
  LOW: "Scăzută",
  MEDIUM: "Medie",
  HIGH: "Ridicată",
  URGENT: "Urgentă",
}

export const CRM_WORK_STATUSES = ["OPEN", "IN_PROGRESS", "BLOCKED", "DONE"] as const

export const CRM_WORK_STATUS_LABELS: Record<(typeof CRM_WORK_STATUSES)[number], string> = {
  OPEN: "Deschis",
  IN_PROGRESS: "În lucru",
  BLOCKED: "Blocat",
  DONE: "Finalizat",
}

export const CRM_TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE", "CANCELED"] as const

export const CRM_TASK_STATUS_LABELS: Record<(typeof CRM_TASK_STATUSES)[number], string> = {
  TODO: "To Do",
  IN_PROGRESS: "În lucru",
  DONE: "Completat",
  CANCELED: "Anulat",
}

export const CRM_VISIBILITIES = ["GENERAL", "PRIVATE", "CUSTOM"] as const

export const CRM_VISIBILITY_LABELS: Record<(typeof CRM_VISIBILITIES)[number], string> = {
  GENERAL: "General",
  PRIVATE: "Particular",
  CUSTOM: "Personalizat",
}

export const CRM_DIRECTIONS = ["IN", "OUT"] as const

export const CRM_PERMISSIONS = ["VIEW", "EDIT"] as const

export const CRM_STAGE_AUTOMATION: Record<string, Array<{ key: string; title: string; dueDaysOffset: number }>> = {
  OFERTA_TRANSMISA: [
    {
      key: "stage_oferta_followup",
      title: "Follow-up oferta",
      dueDaysOffset: 2,
    },
  ],
  NEGOCIERE_OFERTA: [
    {
      key: "stage_negociere_oferta_actualizare",
      title: "Actualizare termeni negociere",
      dueDaysOffset: 1,
    },
  ],
  CONTRACT_SEMNAT: [
    {
      key: "stage_contract_semnat_kickoff",
      title: "Planificare kickoff",
      dueDaysOffset: 1,
    },
  ],
}

export function formatOpportunityCode(nextNumber: number) {
  return `OP.${String(nextNumber)}`
}
