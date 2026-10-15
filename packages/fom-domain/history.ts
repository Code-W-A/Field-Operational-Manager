import { workInstant } from "./work-time";
import type { Work } from "./wire";

export type HistoryRecord = {
  id: string;
  nrLucrare?: string;
  client?: string;
  locatie?: string;
  echipament?: string;
  dataInterventie?: string;
  dataEmiterii?: string;
  tipLucrare?: string;
  numarRaport?: string;
  defectReclamat?: string;
  constatareLaLocatie?: string;
  descriereInterventie?: string;
  statusEchipament?: string;
  tehnicieni?: string[];
  durataInterventie?: string;
  raportGenerat?: boolean;
};

export type HistoryWork = Pick<
  Work,
  | "id"
  | "nrLucrare"
  | "client"
  | "clientId"
  | "locationId"
  | "locatie"
  | "statusLucrare"
  | "tipLucrare"
  | "dataEmiterii"
  | "dataInterventie"
  | "timpSosire"
  | "timpPlecare"
  | "durataInterventie"
  | "tehnicieni"
  | "motivAnulare"
  | "defectReclamat"
  | "defectReclamatHistory"
  | "descriere"
  | "textReinterventie"
  | "notaInternaTehnician"
  | "constatareLaLocatie"
  | "descriereInterventie"
  | "numarRaport"
  | "raportGenerat"
  | "mobileEquipment"
  | "mobileContact"
  | "mobileClient"
  | "mobileClientUnavailable"
  | "mobileDataIssues"
> & {
  dataSosire?: string;
  oraSosire?: string;
  dataPlecare?: string;
  oraPlecare?: string;
  installation?: { schemaVersion: 1 };
};

export type HistoryDetailResponse = {
  work: HistoryWork;
  contractVersion: number;
};

export function historyInstant(value: unknown): Date | null {
  const instant = workInstant(value);
  if (instant) return instant;
  if (typeof value !== "string") return null;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const legacy = /^(\d{2})[./](\d{2})[./](\d{4})$/.exec(value.trim());
  const parts = day
    ? [day[1], day[2], day[3]]
    : legacy
      ? [legacy[3], legacy[2], legacy[1]]
      : null;
  if (!parts) return null;
  const date = new Date(`${parts.join("-")}T12:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === parts.join("-")
    ? date
    : null;
}

export function sortHistory<T extends HistoryRecord>(records: T[]): T[] {
  const instant = (record: T) =>
    (
      historyInstant(record.dataInterventie) ||
      historyInstant(record.dataEmiterii)
    )?.getTime() || 0;
  return [...records].sort(
    (a, b) => instant(b) - instant(a) || a.id.localeCompare(b.id),
  );
}
