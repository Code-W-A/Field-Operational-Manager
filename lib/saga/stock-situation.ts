import { normalizeReference } from "./references";
export type SagaStockRow = {
  code: string;
  name: string;
  typeCode: string;
  typeName: string;
  warehouseCode: string;
  warehouseName: string;
  unit: string;
  vat: string;
  quantity: string;
  available: string;
};
export type SagaStockSituation = {
  checkedAt: string;
  start: string;
  end: string;
  rows: SagaStockRow[];
};
export type SagaSelectionRow = SagaStockRow & { selectionProof: string };
export type SagaSelection = {
  snapshotId: string;
  checkedAt: string;
  stale: boolean;
  warning?: string;
  types: { code: string; name: string }[];
  warehouses: { code: string; name: string }[];
  entries: SagaSelectionRow[];
  rows?: SagaSelectionRow[];
  hasMore: boolean;
};

export function selectSagaRows(
  rows: SagaSelectionRow[],
  metadata: Pick<SagaSelection, "snapshotId" | "checkedAt" | "stale">,
  query: { type?: string; warehouse?: string; q?: string; offset?: string },
): SagaSelection {
  const typeRows = query.type
    ? rows.filter((row) => row.typeCode === query.type)
    : rows;
  const search = normalizeReference(query.q || "");
  const matches = typeRows.filter(
    (row) =>
      (!query.warehouse || row.warehouseCode === query.warehouse) &&
      (!search ||
        normalizeReference(row.code).startsWith(search) ||
        normalizeReference(row.name).startsWith(search)),
  );
  const offset = Number(query.offset || 0);
  return {
    ...metadata,
    types: [
      ...new Map(
        rows.map((row) => [
          row.typeCode,
          { code: row.typeCode, name: row.typeName },
        ]),
      ).values(),
    ],
    warehouses: [
      ...new Map(
        typeRows.map((row) => [
          row.warehouseCode,
          { code: row.warehouseCode, name: row.warehouseName },
        ]),
      ).values(),
    ],
    entries:
      query.type && query.warehouse ? matches.slice(offset, offset + 20) : [],
    hasMore: matches.length > offset + 20,
  };
}
