export const CRM_COLLECTIONS = {
  clients: "crm_clients",
  clientContacts: "crm_client_contacts",
  opportunities: "crm_opportunities",
  opportunityContacts: "crm_opportunity_contacts",
  opportunityAccess: "crm_opportunity_access",
  tasks: "crm_tasks",
  notes: "crm_notes",
  files: "crm_files",
  emails: "crm_emails",
  calendarEvents: "crm_calendar_events",
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
  "PROIECTE",
  "FACTURARE",
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
  "CONTRACTARE",
  "EVENIMENTE",
  "ACHIZITII",
  "OFERTE",
] as const

export const CRM_OPPORTUNITY_TYPE_LABELS: Record<(typeof CRM_OPPORTUNITY_TYPES)[number], string> = {
  ACASA: "Acasă",
  VANZARI: "Vânzări",
  LIVRARI: "Livrări",
  PROIECTE: "Proiecte",
  FACTURARE: "Facturare",
  CONTRACTARE: "Contractare",
  EVENIMENTE: "Evenimente",
  ACHIZITII: "Achiziții",
  OFERTE: "Oferte",
}

export const CRM_PIPELINE_STAGES = [
  "NOU",
  "CONTACTAT",
  "OFERTA_TRIMISA",
  "NEGOCIERE",
  "CASTIGAT",
  "PIERDUT",
] as const

export const CRM_PIPELINE_STAGE_LABELS: Record<(typeof CRM_PIPELINE_STAGES)[number], string> = {
  NOU: "Nou",
  CONTACTAT: "Contactat",
  OFERTA_TRIMISA: "Ofertă trimisă",
  NEGOCIERE: "Negociere",
  CASTIGAT: "Câștigat",
  PIERDUT: "Pierdut",
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

export const CRM_STAGE_AUTOMATION: Record<(typeof CRM_PIPELINE_STAGES)[number], Array<{ key: string; title: string; dueDaysOffset: number; reminderHoursBefore: number }>> = {
  NOU: [
    {
      key: "stage_nou_contactare",
      title: "Contactare lead",
      dueDaysOffset: 1,
      reminderHoursBefore: 2,
    },
  ],
  CONTACTAT: [
    {
      key: "stage_contactat_nevoi",
      title: "Clarificare nevoi client",
      dueDaysOffset: 1,
      reminderHoursBefore: 2,
    },
  ],
  OFERTA_TRIMISA: [
    {
      key: "stage_oferta_followup",
      title: "Follow-up ofertă",
      dueDaysOffset: 2,
      reminderHoursBefore: 4,
    },
  ],
  NEGOCIERE: [
    {
      key: "stage_negociere_actualizare",
      title: "Actualizare termeni negociere",
      dueDaysOffset: 1,
      reminderHoursBefore: 2,
    },
  ],
  CASTIGAT: [
    {
      key: "stage_castigat_kickoff",
      title: "Planificare kickoff",
      dueDaysOffset: 1,
      reminderHoursBefore: 2,
    },
  ],
  PIERDUT: [],
}

export function formatOpportunityCode(nextNumber: number) {
  return `OP${String(nextNumber).padStart(6, "0")}`
}
