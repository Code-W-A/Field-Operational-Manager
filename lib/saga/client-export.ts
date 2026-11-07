import ExcelJS from "exceljs";
import { SagaError } from "./contracts";
import type { ExportCell, ExportSheet } from "./clients";
const invalid = (message: string) => new SagaError("INVALID_FILE", message);
// RFC4180 quoting, including quoted delimiters and multiline cells.
export function parseClientCSV(text: string): string[][] {
  text = text.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/, 1)[0];
  const counts = new Map([
    [";", 0],
    [",", 0],
    ["\t", 0],
  ]);
  let inQuotes = false;
  for (let i = 0; i < first.length; i++) {
    if (first[i] === '"') {
      if (inQuotes && first[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && counts.has(first[i]))
      counts.set(first[i], counts.get(first[i])! + 1);
  }
  const delimiter = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += ch;
    } else if (ch === '"' && !cell && !closed) quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
      closed = false;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = "";
      closed = false;
    } else {
      if (closed && ch.trim())
        throw invalid("CSV invalid: caractere după ghilimele.");
      cell += ch;
    }
    if (rows.length > 5001 || row.length > 100 || cell.length > 10000)
      throw invalid(
        "Exportul depășește limitele: 5.000 de rânduri și 100 de coloane.",
      );
  }
  if (quoted) throw invalid("CSV invalid: ghilimele neînchise.");
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
export async function readClientExport(
  bytes: Uint8Array,
  filename: string,
  selectedSheet?: string,
): Promise<ExportSheet> {
  if (bytes.byteLength > 10 * 1024 * 1024)
    throw invalid("Fișierul depășește 10 MB.");
  let rows: ExportCell[][];
  let sheets: string[], sheet: string;
  if (/\.csv$/i.test(filename)) {
    let decoded: string;
    try {
      decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw invalid("Salvează CSV-ul cu codare UTF-8.");
    }
    rows = parseClientCSV(decoded).map((row) => row.map((text) => ({ text })));
    sheets = ["CSV"];
    sheet = "CSV";
  } else if (/\.xlsx$/i.test(filename)) {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(bytes as any);
    } catch {
      throw invalid("Fișier Excel invalid.");
    }
    sheets = workbook.worksheets.map((w) => w.name);
    const selected = selectedSheet
      ? workbook.getWorksheet(selectedSheet)
      : workbook.worksheets[0];
    if (!selected) throw invalid("Alege o foaie validă.");
    sheet = selected.name;
    if (selected.rowCount > 5001 || selected.columnCount > 100)
      throw invalid("Foaia depășește 5.000 de rânduri sau 100 de coloane.");
    rows = [];
    selected.eachRow((row) => {
      const cells: ExportCell[] = [];
      for (let i = 1; i <= selected.columnCount; i++) {
        const cell = row.getCell(i),
          value = cell.value;
        const ambiguous =
          typeof value === "number" ||
          value instanceof Date ||
          (typeof value === "object" &&
            value !== null &&
            !("richText" in value));
        cells.push({
          text: cell.text,
          ...(ambiguous ? { ambiguous: true } : {}),
        });
      }
      rows.push(cells);
    });
  } else throw invalid("Alege un CSV UTF-8 sau un fișier .xlsx.");
  if (
    rows.length < 2 ||
    rows.length > 5001 ||
    rows.some((row) => row.length > 100)
  )
    throw invalid(
      "Exportul trebuie să aibă antet și între 1 și 5.000 de rânduri.",
    );
  return {
    sheets,
    sheet,
    headers: rows[0].map((v, i) => v.text || `Coloana ${i + 1}`),
    rows: rows.slice(1),
  };
}
