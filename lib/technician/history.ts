import {
  workInstant,
  type HistoryRecord,
  type HistoryWork,
  type RecordData,
} from "@/packages/fom-domain";

export function historyRecord(work: RecordData): HistoryRecord {
  const start = workInstant(work.timpSosire)?.getTime();
  const end = workInstant(work.timpPlecare)?.getTime();
  const minutes =
    start && end && end >= start ? Math.round((end - start) / 60000) : null;
  return {
    id: work.id,
    nrLucrare: work.nrLucrare == null ? undefined : String(work.nrLucrare),
    client: work.client,
    locatie: work.locatie,
    echipament: work.echipament,
    dataInterventie:
      typeof work.dataInterventie === "string"
        ? work.dataInterventie
        : workInstant(work.dataInterventie)?.toISOString(),
    dataEmiterii:
      typeof work.dataEmiterii === "string"
        ? work.dataEmiterii
        : workInstant(work.dataEmiterii)?.toISOString(),
    tipLucrare: work.tipLucrare,
    numarRaport: work.numarRaport,
    defectReclamat: work.defectReclamat,
    constatareLaLocatie: work.constatareLaLocatie,
    descriereInterventie: work.descriereInterventie,
    statusEchipament: work.statusEchipament,
    tehnicieni: Array.isArray(work.tehnicieni)
      ? work.tehnicieni.filter((name: unknown) => typeof name === "string")
      : [],
    durataInterventie:
      work.durataInterventie ||
      (minutes === null
        ? undefined
        : `${Math.floor(minutes / 60)}h ${minutes % 60}m`),
    raportGenerat: work.raportGenerat === true,
  };
}

// Read-only projection: never return a raw work, report snapshot, signatures or storage paths.
export function historyWork(
  work: RecordData,
  presentation: RecordData,
): HistoryWork {
  const fields = [
    "id",
    "nrLucrare",
    "client",
    "clientId",
    "locationId",
    "locatie",
    "statusLucrare",
    "tipLucrare",
    "dataEmiterii",
    "dataInterventie",
    "timpSosire",
    "timpPlecare",
    "dataSosire",
    "oraSosire",
    "dataPlecare",
    "oraPlecare",
    "durataInterventie",
    "tehnicieni",
    "motivAnulare",
    "defectReclamat",
    "defectReclamatHistory",
    "descriere",
    "textReinterventie",
    "notaInternaTehnician",
    "constatareLaLocatie",
    "descriereInterventie",
    "numarRaport",
    "raportGenerat",
  ];
  const result = Object.fromEntries(
    fields
      .filter((key) => work[key] !== undefined)
      .map((key) => [key, work[key]]),
  );
  if (work.nrLucrare != null) result.nrLucrare = String(work.nrLucrare);
  // Presentation fields are produced by ticketPresentation, never accepted from the work document.
  for (const key of [
    "mobileClient",
    "mobileContact",
    "mobileClientUnavailable",
    "mobileDataIssues",
  ])
    result[key] = presentation[key];
  result.mobileEquipment = (presentation.mobileEquipment || []).map(
    (e: RecordData) => ({
      id: e.id,
      code: e.code,
      name: e.name,
      model: e.model,
      producator: e.producator,
      documentation: e.documentation,
      documentationAssociated: e.documentationAssociated,
      documentationUnavailable: e.documentationUnavailable,
    }),
  );
  if (work.installation?.schemaVersion === 1)
    result.installation = { schemaVersion: 1 };
  return result as HistoryWork;
}
